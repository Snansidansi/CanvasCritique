<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import { getMediaDataUrl, saveMediaToDb } from '../../db/media';

  // Local state for settings view tabs
  let activeTab = $state('settings'); // 'settings' | 'data'

  function handleInputChange() {
    store.saveSettings();
  }

  // Native folder pick wrapper
  async function selectFolder(type: string) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('settings.data.destinationPath')
      });
      if (selected) {
        if (type === 'settings') {
          store.settings.exportPathSettings = selected;
        } else {
          store.settings.exportPathData = selected;
        }
        store.saveSettings();
      }
      return;
    } catch (e) {
      console.warn('Tauri dialog plugin not available:', e);
    }
  }

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
          onclick={handleImport}
          class="flex-1 bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">download</span> 
          {t('settings.data.importSettings')}
        </button>
        <button 
          onclick={handleExport}
          class="flex-1 bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">upload</span> 
          {t('settings.data.exportSettings')}
        </button>
      </div>
    </div>

    <div class="bg-surface-container-low rounded-lg p-5 border border-outline-variant">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h4 class="font-bold text-sm text-on-surface mb-1">{t('settings.data.autoExport')}</h4>
          <p class="text-xs text-on-surface-variant">{t('settings.data.autoExportDesc')}</p>
        </div>
        
        <label class="relative inline-flex items-center cursor-pointer select-none">
          <input 
            type="checkbox" 
            bind:checked={store.settings.autoExport}
            onchange={handleInputChange}
            class="sr-only peer" 
          />
          <div class="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      {#if store.settings.autoExport}
        <div class="border-t border-outline-variant/30 pt-5 space-y-4">
          <!-- Export Destination Path -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-on-surface" for="exportPathSettings">{t('settings.data.destinationPath')}</label>
            <div class="flex gap-2">
              <input 
                type="text" 
                id="exportPathSettings"
                bind:value={store.settings.exportPathSettings}
                onchange={handleInputChange}
                placeholder="e.g. /home/user/backups/canvascritique_settings.json" 
                class="grow bg-surface-container-highest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
              />
              <button 
                type="button"
                onclick={() => selectFolder('settings')}
                class="bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer shrink-0"
              >
                {t('settings.data.browse')}
              </button>
            </div>
          </div>

          <!-- Export Frequency -->
          <div>
            <span class="font-semibold text-xs text-on-surface block mb-3">{t('settings.data.frequency')}</span>
            <div class="grid grid-cols-3 gap-4">
              <div class="flex flex-col gap-1">
                <label for="exportFreqDays" class="text-[10px] font-bold text-on-surface-variant uppercase">{t('settings.data.days')}</label>
                <input 
                  type="number" 
                  id="exportFreqDays"
                  bind:value={store.settings.exportFrequency.days}
                  onchange={handleInputChange}
                  min="0"
                  class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none" 
                />
              </div>
              <div class="flex flex-col gap-1">
                <label for="exportFreqHours" class="text-[10px] font-bold text-on-surface-variant uppercase">{t('settings.data.hours')}</label>
                <input 
                  type="number" 
                  id="exportFreqHours"
                  bind:value={store.settings.exportFrequency.hours}
                  onchange={handleInputChange}
                  min="0"
                  max="23"
                  class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none" 
                />
              </div>
              <div class="flex flex-col gap-1">
                <label for="exportFreqMinutes" class="text-[10px] font-bold text-on-surface-variant uppercase">{t('settings.data.minutes')}</label>
                <input 
                  type="number" 
                  id="exportFreqMinutes"
                  bind:value={store.settings.exportFrequency.minutes}
                  onchange={handleInputChange}
                  min="0"
                  max="59"
                  class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none" 
                />
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Data Tab Content (Mirrored Layout) -->
  {#if activeTab === 'data'}
    <div class="flex flex-col gap-4 mb-6">
      <div class="flex flex-col sm:flex-row gap-3">
        <button 
          onclick={handleImportData}
          class="flex-1 bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">download</span> 
          {t('settings.data.importDb')}
        </button>
        <button 
          onclick={handleExportData}
          class="flex-1 bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">upload</span> 
          {t('settings.data.exportDb')}
        </button>
      </div>
    </div>

    <div class="bg-surface-container-low rounded-lg p-5 border border-outline-variant">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h4 class="font-bold text-sm text-on-surface mb-1">{t('settings.data.autoData')}</h4>
          <p class="text-xs text-on-surface-variant">{t('settings.data.autoDataDesc')}</p>
        </div>
        
        <label class="relative inline-flex items-center cursor-pointer select-none">
          <input 
            type="checkbox" 
            bind:checked={store.settings.autoExportData}
            onchange={handleInputChange}
            class="sr-only peer" 
          />
          <div class="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      {#if store.settings.autoExportData}
        <div class="border-t border-outline-variant/30 pt-5 space-y-4">
          <!-- Export Destination Path -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-on-surface" for="exportPathData">{t('settings.data.destinationPath')}</label>
            <div class="flex gap-2">
              <input 
                type="text" 
                id="exportPathData"
                bind:value={store.settings.exportPathData}
                onchange={handleInputChange}
                placeholder="e.g. /home/user/backups/canvascritique_data.json" 
                class="grow bg-surface-container-highest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
              />
              <button 
                type="button"
                onclick={() => selectFolder('data')}
                class="bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer shrink-0"
              >
                {t('settings.data.browse')}
              </button>
            </div>
          </div>

          <!-- Export Frequency -->
          <div>
            <span class="font-semibold text-xs text-on-surface block mb-3">{t('settings.data.frequency')}</span>
            <div class="grid grid-cols-3 gap-4">
              <div class="flex flex-col gap-1">
                <label for="exportFreqDaysData" class="text-[10px] font-bold text-on-surface-variant uppercase">{t('settings.data.days')}</label>
                <input 
                  type="number" 
                  id="exportFreqDaysData"
                  bind:value={store.settings.exportFrequencyData.days}
                  onchange={handleInputChange}
                  min="0"
                  class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none" 
                />
              </div>
              <div class="flex flex-col gap-1">
                <label for="exportFreqHoursData" class="text-[10px] font-bold text-on-surface-variant uppercase">{t('settings.data.hours')}</label>
                <input 
                  type="number" 
                  id="exportFreqHoursData"
                  bind:value={store.settings.exportFrequencyData.hours}
                  onchange={handleInputChange}
                  min="0"
                  max="23"
                  class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none" 
                />
              </div>
              <div class="flex flex-col gap-1">
                <label for="exportFreqMinutesData" class="text-[10px] font-bold text-on-surface-variant uppercase">{t('settings.data.minutes')}</label>
                <input 
                  type="number" 
                  id="exportFreqMinutesData"
                  bind:value={store.settings.exportFrequencyData.minutes}
                  onchange={handleInputChange}
                  min="0"
                  max="59"
                  class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none" 
                />
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</section>
