<script lang="ts">
  import { store } from '../../state/store.svelte';

  // Local state for settings view tabs
  let activeTab = $state('settings'); // 'settings' | 'data'

  function handleInputChange() {
    store.saveSettings();
  }

  // Native folder pick wrapper or mock directory selector
  async function selectFolder(type) {
    try {
      if ((window as any).__TAURI__) {
        const moduleName = '@tauri-apps/plugin-dialog';
        const { open } = await import(/* @vite-ignore */ moduleName);
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Select Export Directory'
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
      }
    } catch (e) {
      console.warn('Tauri dialog plugin not available, falling back to browser folder select mock:', e);
    }

    // Fallback: Web browser simulated absolute directory path pick
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        const firstFile = files[0];
        const folderName = firstFile.webkitRelativePath.split('/')[0] || 'backups';
        const finalPath = `/home/user/Downloads/${folderName}`;
        if (type === 'settings') {
          store.settings.exportPathSettings = finalPath;
        } else {
          store.settings.exportPathData = finalPath;
        }
        store.saveSettings();
      }
    };
    input.click();
  }

  // Settings export/import
  function handleExport() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store.settings));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "canvascritique_settings.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
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
          alert('Settings imported successfully!');
        } catch (err) {
          alert('Failed to parse file. Make sure it is valid JSON.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // Data export/import
  function handleExportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store.projects));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "canvascritique_data.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function handleImportData() {
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
          if (Array.isArray(imported)) {
            store.projects = imported;
            store.saveProjects();
            alert('Data imported successfully!');
          } else {
            alert('Invalid format. Data must be a JSON array of lessons.');
          }
        } catch (err) {
          alert('Failed to parse file. Make sure it is valid JSON.');
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
    <h3 class="text-lg font-bold text-on-surface">Data Management</h3>
  </div>
  <!-- Tabs -->
  <div class="flex border-b border-outline-variant mb-6 overflow-x-auto no-scrollbar">
    <button 
      onclick={() => activeTab = 'settings'}
      class="px-5 py-2.5 font-semibold text-sm border-b-2 rounded-t-lg transition-colors
             {activeTab === 'settings' ? 'text-primary border-primary bg-primary/5' : 'text-on-surface-variant border-transparent hover:bg-surface-variant/30'}"
    >
      Settings
    </button>
    <button 
      onclick={() => activeTab = 'data'}
      class="px-5 py-2.5 font-semibold text-sm border-b-2 rounded-t-lg transition-colors
             {activeTab === 'data' ? 'text-primary border-primary bg-primary/5' : 'text-on-surface-variant border-transparent hover:bg-surface-variant/30'}"
    >
      Data
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
          Import Settings
        </button>
        <button 
          onclick={handleExport}
          class="flex-1 bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">upload</span> 
          Export Settings
        </button>
      </div>
    </div>

    <div class="bg-surface-container-low rounded-lg p-5 border border-outline-variant">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h4 class="font-bold text-sm text-on-surface mb-1">Automatic Settings Export</h4>
          <p class="text-xs text-on-surface-variant">Regularly save a copy of your configuration parameters.</p>
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
            <label class="text-xs font-semibold text-on-surface" for="exportPathSettings">Export Destination Path</label>
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
                Browse...
              </button>
            </div>
          </div>

          <!-- Export Frequency -->
          <div>
            <span class="font-semibold text-xs text-on-surface block mb-3">Export Frequency</span>
            <div class="grid grid-cols-3 gap-4">
              <div class="flex flex-col gap-1">
                <label for="exportFreqDays" class="text-[10px] font-bold text-on-surface-variant uppercase">Days</label>
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
                <label for="exportFreqHours" class="text-[10px] font-bold text-on-surface-variant uppercase">Hours</label>
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
                <label for="exportFreqMinutes" class="text-[10px] font-bold text-on-surface-variant uppercase">Minutes</label>
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
          Import Database
        </button>
        <button 
          onclick={handleExportData}
          class="flex-1 bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">upload</span> 
          Export Database
        </button>
      </div>
    </div>

    <div class="bg-surface-container-low rounded-lg p-5 border border-outline-variant">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h4 class="font-bold text-sm text-on-surface mb-1">Automatic Database Export</h4>
          <p class="text-xs text-on-surface-variant">Regularly save a copy of your lessons and practice history.</p>
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
            <label class="text-xs font-semibold text-on-surface" for="exportPathData">Export Destination Path</label>
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
                Browse...
              </button>
            </div>
          </div>

          <!-- Export Frequency -->
          <div>
            <span class="font-semibold text-xs text-on-surface block mb-3">Export Frequency</span>
            <div class="grid grid-cols-3 gap-4">
              <div class="flex flex-col gap-1">
                <label for="exportFreqDaysData" class="text-[10px] font-bold text-on-surface-variant uppercase">Days</label>
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
                <label for="exportFreqHoursData" class="text-[10px] font-bold text-on-surface-variant uppercase">Hours</label>
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
                <label for="exportFreqMinutesData" class="text-[10px] font-bold text-on-surface-variant uppercase">Minutes</label>
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
