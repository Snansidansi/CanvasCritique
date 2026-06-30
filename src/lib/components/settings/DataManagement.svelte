<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import { getMediaDataUrl, saveMediaToDb } from '../../db/media';

  // Local state for settings view tabs
  let activeTab = $state('settings'); // 'settings' | 'data'

  // Settings export/import
  async function handleExport() {
    try {
      const content = await store.getSettingsExportPayload();
      await store.saveFileWithDialog('canvascritique_settings.json', content);
    } catch (e) {
      console.error('Settings export failed:', e);
      store.showNotification(t('settings.data.notifications.exportSettingsError'), 'error');
    }
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(reader.result as string);
          store.settings = { ...store.settings, ...imported };
          store.saveSettings();
          store.showNotification(t('settings.data.notifications.importSettingsSuccess'), 'success');
        } catch (err) {
          store.showNotification(t('settings.data.notifications.importSettingsError'), 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // Data export/import
  async function handleExportData() {
    try {
      const content = await store.getDataExportPayload();
      await store.saveFileWithDialog('canvascritique_workspace.json', content);
    } catch (e) {
      console.error('Data export failed:', e);
      store.showNotification(t('settings.data.notifications.exportDbError'), 'error');
    }
  }

  function handleImportData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(reader.result as string);
          if (imported.projects && Array.isArray(imported.projects)) {
            // Convert imported media files (dataUrl → mediaId)
            for (const proj of imported.projects) {
              if (proj.tasks) {
                for (const task of proj.tasks) {
                  if (task.instructionFiles) {
                    for (const f of task.instructionFiles) {
                      if (f.dataUrl && !f.mediaId) {
                        try { f.mediaId = await saveMediaToDb(f.dataUrl); } catch (_) {}
                      }
                    }
                  }
                  if (task.solutionFiles) {
                    for (const f of task.solutionFiles) {
                      if (f.dataUrl && !f.mediaId) {
                        try { f.mediaId = await saveMediaToDb(f.dataUrl); } catch (_) {}
                      }
                    }
                  }
                }
              }
            }

            store.projects = imported.projects;
            store.saveProjects();

            if (imported.profiles && Array.isArray(imported.profiles)) {
              for (const p of imported.profiles) {
                if (p.icon && p.icon.startsWith('data:')) {
                  try { p.icon = await saveMediaToDb(p.icon); } catch (_) {}
                }
              }
              store.profiles = imported.profiles;
              store.activeProfileId = imported.activeProfileId || imported.profiles[0]?.id || 'default-profile';
              store.saveProfiles();
            }

            for (const proj of imported.projects) {
              if (proj.canvasSaves) {
                for (const [taskId, canvasState] of Object.entries(proj.canvasSaves)) {
                  store.saveCanvasState(taskId, canvasState);
                }
              }
            }

            store.showNotification(t('settings.data.notifications.importDbSuccess'), 'success');
            store.setView('dashboard');
          } else {
            store.showNotification(t('settings.data.notifications.importDbError'), 'error');
          }
        } catch (err) {
          store.showNotification(t('settings.data.notifications.importDbFailed'), 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
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
    </div>
  {/if}
</section>
