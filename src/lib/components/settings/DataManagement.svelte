<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import { getDb } from '../../db';
  import { getMediaDataUrl, saveMediaToDb } from '../../db/media';
  import WebDavSettings from './WebDavSettings.svelte';

  import { open } from '@tauri-apps/plugin-dialog';
  import { readFile } from '@tauri-apps/plugin-fs';

  // Local state for settings view tabs
  let activeTab = $state('settings'); // 'settings' | 'data'

  // Settings export/import
  async function handleExport() {
    store.showLoading(t('common.exporting') || 'Exportiere...');
    try {
      const content = await store.getSettingsExportPayload();
      await store.saveFileWithDialog('canvascritique_settings.json', content);
    } catch (e) {
      console.error('Settings export failed:', e);
      store.showNotification(t('settings.data.notifications.exportSettingsError'), 'error');
    } finally {
      store.hideLoading();
    }
  }

  async function handleImport() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (!selected) return;

      store.showLoading(t('common.importing') || 'Importiere...');
      try {
        const path = Array.isArray(selected) ? selected[0] : selected;
        const bytes = await readFile(path);
        const text = new TextDecoder().decode(bytes);
        const imported = JSON.parse(text);
        store.settings = { ...store.settings, ...imported };
        store.saveSettings();
        store.showNotification(t('settings.data.notifications.importSettingsSuccess'), 'success');
      } finally {
        store.hideLoading();
      }
    } catch (err) {
      store.showNotification(t('settings.data.notifications.importSettingsError'), 'error');
    }
  }

  // Data export/import
  async function handleExportData() {
    await store.exportWorkspaceCcpack();
  }

  async function handleImportData() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'CCPack or JSON', extensions: ['ccpack', 'json'] }]
      });
      if (!selected) return;

      store.showLoading(t('common.importing') || 'Importiere...');
      try {
        const path = Array.isArray(selected) ? selected[0] : selected;
        const isCcpack = path.endsWith('.ccpack');
        const bytes = await readFile(path);

        let imported;
        if (isCcpack) {
          imported = await store.importCcpackFile(bytes);
        } else {
          const text = new TextDecoder().decode(bytes);
          imported = JSON.parse(text);
        }

        if (imported.projects && Array.isArray(imported.projects)) {
          // Convert imported media files (dataUrl → mediaId)
          for (const proj of imported.projects) {
            if (proj.tasks) {
              for (const task of proj.tasks) {
                if (task.instructionFiles) {
                  for (const f of task.instructionFiles) {
                    if (f.dataUrl && !f.mediaId) {
                      try { f.mediaId = await saveMediaToDb(f.dataUrl, f.name); } catch (_) {}
                    }
                  }
                }
                if (task.solutionFiles) {
                  for (const f of task.solutionFiles) {
                    if (f.dataUrl && !f.mediaId) {
                      try { f.mediaId = await saveMediaToDb(f.dataUrl, f.name); } catch (_) {}
                    }
                  }
                }
              }
            }
          }

          // Validate and resolve imported project/profile UUID icons
          const db = getDb();
          for (const proj of imported.projects) {
            if (proj.icon && !proj.icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(proj.icon)) {
              try {
                const rows = (await db.select('SELECT id FROM media WHERE id = ?', [proj.icon])) as any[];
                if (rows.length === 0) {
                  proj.icon = 'history_edu';
                }
              } catch (_) {
                proj.icon = 'history_edu';
              }
            }
          }

          if (imported.profiles && Array.isArray(imported.profiles)) {
            for (const p of imported.profiles) {
              if (p.icon && !p.icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(p.icon)) {
                try {
                  const rows = (await db.select('SELECT id FROM media WHERE id = ?', [p.icon])) as any[];
                  if (rows.length === 0) {
                    p.icon = null;
                  }
                } catch (_) {
                  p.icon = null;
                }
              }
            }
          }

          store.projects = imported.projects;
          await store.saveProjects();

          if (imported.profiles && Array.isArray(imported.profiles)) {
            store.profiles = imported.profiles;
            store.activeProfileId = imported.activeProfileId || imported.profiles[0]?.id || 'default-profile';
            await store.saveProfiles();
          }

          for (const proj of imported.projects) {
            if (proj.canvasSaves) {
              for (const [taskId, canvasState] of Object.entries(proj.canvasSaves)) {
                await store.saveCanvasState(taskId, canvasState, true);
              }
            }
          }

          store.showNotification(t('settings.data.notifications.importDbSuccess'), 'success');
          setTimeout(() => {
            window.location.reload();
          }, 500);
        } else {
          store.showNotification(t('settings.data.notifications.importDbError'), 'error');
        }
      } finally {
        store.hideLoading();
      }
    } catch (err) {
      console.error(err);
      store.showNotification(t('settings.data.notifications.importDbFailed'), 'error');
    }
  }

  async function handleCleanMedia() {
    store.showLoading(t('common.processing') || 'Verarbeite...');
    try {
      const deletedCount = await store.cleanOrphanedMedia();
      if (deletedCount > 0) {
        store.showNotification(
          t('settings.data.notifications.cleanMediaSuccess', { count: deletedCount }),
          'success'
        );
      } else {
        store.showNotification(
          t('settings.data.notifications.cleanMediaNoOrphans'),
          'success'
        );
      }
    } catch (e) {
      console.error('Media cleanup failed:', e);
      store.showNotification(t('common.error') || 'Ein Fehler ist aufgetreten', 'error');
    } finally {
      store.hideLoading();
    }
  }
</script>

<!-- Data Management Section -->
<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4">
    <span class="material-symbols-outlined text-primary">database</span>
    <h3 class="text-lg font-bold text-on-surface">{t('settings.data.title')}</h3>
  </div>
  <!-- Tabs -->
  <div class="flex border-b border-outline-variant mb-6 overflow-x-auto no-scrollbar">
    <button 
      onclick={() => activeTab = 'settings'}
      class="px-5 py-2.5 font-semibold text-sm border-b-2 rounded-t-lg transition-colors
             {activeTab === 'settings' ? 'text-primary border-primary bg-primary/5' : 'text-on-surface-variant border-transparent hover:bg-surface-variant/30'}"
    >
      {t('settings.data.tabSettings')}
    </button>
    <button 
      onclick={() => activeTab = 'data'}
      class="px-5 py-2.5 font-semibold text-sm border-b-2 rounded-t-lg transition-colors
             {activeTab === 'data' ? 'text-primary border-primary bg-primary/5' : 'text-on-surface-variant border-transparent hover:bg-surface-variant/30'}"
    >
      {t('settings.data.tabData')}
    </button>
    <button 
      onclick={() => activeTab = 'sync'}
      class="px-5 py-2.5 font-semibold text-sm border-b-2 rounded-t-lg transition-colors
             {activeTab === 'sync' ? 'text-primary border-primary bg-primary/5' : 'text-on-surface-variant border-transparent hover:bg-surface-variant/30'}"
    >
      {t('settings.data.webdavTitle') || 'Sync'}
    </button>
  </div>

  <!-- Settings Tab Content -->
  {#if activeTab === 'settings'}
    <div class="flex flex-col gap-4 mb-6">
      <div class="flex flex-col sm:flex-row gap-3">
        <button 
          onclick={handleExport}
          class="flex-1 bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">upload</span> 
          {t('settings.data.exportSettings')}
        </button>
        <button 
          onclick={handleImport}
          class="flex-1 bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">download</span> 
          {t('settings.data.importSettings')}
        </button>
      </div>
    </div>
  {/if}

  <!-- Data Tab Content (Mirrored Layout) -->
  {#if activeTab === 'data'}
    <div class="flex flex-col gap-4 mb-6">
      <div class="flex flex-col sm:flex-row gap-3">
        <button 
          onclick={handleExportData}
          class="flex-1 bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">upload</span> 
          {t('settings.data.exportDb')}
        </button>
        <button 
          onclick={handleImportData}
          class="flex-1 bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">download</span> 
          {t('settings.data.importDb')}
        </button>
      </div>

      <!-- Media Cleanup Section -->
      <div class="mt-6 border-t border-outline-variant pt-6 flex flex-col gap-3">
        <h4 class="text-sm font-bold text-on-surface">{t('settings.data.cleanMedia')}</h4>
        <p class="text-xs text-on-surface-variant leading-relaxed">
          {t('settings.data.cleanMediaDesc')}
        </p>
        <button 
          onclick={handleCleanMedia}
          class="sm:self-start bg-surface-container-high border border-outline-variant hover:bg-surface-variant text-on-surface transition-colors py-2 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[16px]">cleaning_services</span>
          {t('settings.data.cleanMediaBtn')}
        </button>
      </div>
    </div>
  {/if}

  <!-- Sync Tab Content -->
  {#if activeTab === 'sync'}
    <WebDavSettings />
  {/if}
</section>
