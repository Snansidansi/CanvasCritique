<script>
  import { store } from '../state/store.svelte.js';

  // Local state for settings view tabs
  let activeTab = $state('settings'); // 'settings' | 'data'
  
  // Custom API configuration view switching
  let apiProvider = $derived(store.settings.apiProvider);

  // Dropdown open states
  let geminiModelOpen = $state(false);
  let openRouterModelOpen = $state(false);
  let openRouterProviderOpen = $state(false);

  // Constants for autocomplete dropdowns
  const geminiModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash-8b'];
  const openRouterModels = [
    'google/gemini-flash-1.5',
    'meta-llama/llama-3.1-8b-instruct',
    'anthropic/claude-3.5-sonnet'
  ];
  const openRouterProviders = ['Google', 'OpenAI', 'Anthropic', 'Meta', 'Mistral'];

  // Filtered dropdown suggestions based on active text input values
  let filteredGeminiModels = $derived(
    geminiModels.filter(m => m.toLowerCase().includes(store.settings.geminiModel.toLowerCase()))
  );
  let filteredOpenRouterModels = $derived(
    openRouterModels.filter(m => m.toLowerCase().includes(store.settings.openRouterModel.toLowerCase()))
  );
  let filteredOpenRouterProviders = $derived(
    openRouterProviders.filter(p => p.toLowerCase().includes(store.settings.openRouterProvider.toLowerCase()))
  );

  function setTheme(theme) {
    store.settings.theme = theme;
    store.saveSettings();
  }

  function handleProviderChange(provider) {
    store.settings.apiProvider = provider;
    store.saveSettings();
  }

  function handleInputChange() {
    store.saveSettings();
  }

  // Settings export/import
  function handleExport() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store.settings));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "scribeflow_settings.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
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
    downloadAnchor.setAttribute("download", "scribeflow_data.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function handleImportData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported)) {
            store.projects = imported;
            store.saveProjects();
            alert('Data imported successfully!');
          } else {
            alert('Invalid format. Data must be a JSON array of projects.');
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

<main class="flex-grow overflow-y-auto bg-surface-container-lowest flex flex-col relative h-full custom-scrollbar">
  <div class="max-w-[800px] w-full mx-auto p-8 pb-16">
    <div class="mb-10">
      <h2 class="text-2xl font-bold text-on-surface mb-2">Settings</h2>
      <p class="text-sm text-on-surface-variant">Manage your preferences, data, and API connections.</p>
    </div>

    <!-- Appearance Section -->
    <section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
      <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4">
        <span class="material-symbols-outlined text-primary">palette</span>
        <h3 class="text-lg font-bold text-on-surface">Appearance</h3>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <!-- Light Mode Card -->
        <button 
          onclick={() => setTheme('light')}
          class="cursor-pointer group text-left focus:outline-none"
        >
          <div class="border rounded-lg p-2 mb-2 bg-white flex items-center justify-center h-24 shadow-sm relative overflow-hidden transition-all
                 {store.settings.theme === 'light' ? 'border-primary border-2' : 'border-outline-variant hover:border-primary'}"
          >
            {#if store.settings.theme === 'light'}
              <div class="absolute top-2 left-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10">
                <span class="material-symbols-outlined text-[10px] text-white font-bold">check</span>
              </div>
            {/if}
            <span class="material-symbols-outlined text-4xl text-slate-800">light_mode</span>
          </div>
          <p class="text-center text-sm font-semibold {store.settings.theme === 'light' ? 'text-primary' : 'text-on-surface-variant'}" >Light</p>
        </button>

        <!-- Dark Mode Card -->
        <button 
          onclick={() => setTheme('dark')}
          class="cursor-pointer group text-left focus:outline-none"
        >
          <div class="border rounded-lg p-2 mb-2 bg-[#121314] flex items-center justify-center h-24 relative overflow-hidden transition-all
                 {store.settings.theme === 'dark' ? 'border-primary border-2' : 'border-outline-variant hover:border-primary'}"
          >
            {#if store.settings.theme === 'dark'}
              <div class="absolute top-2 left-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10">
                <span class="material-symbols-outlined text-[10px] text-white font-bold">check</span>
              </div>
            {/if}
            <span class="material-symbols-outlined text-4xl text-slate-100">dark_mode</span>
          </div>
          <p class="text-center text-sm font-semibold {store.settings.theme === 'dark' ? 'text-primary' : 'text-on-surface-variant'}">Dark</p>
        </button>

        <!-- System Mode Card (Redesigned Split View) -->
        <button 
          onclick={() => setTheme('system')}
          class="cursor-pointer group text-left focus:outline-none"
        >
          <div class="border rounded-lg mb-2 flex h-24 relative overflow-hidden transition-all
                 {store.settings.theme === 'system' ? 'border-primary border-2' : 'border-outline-variant hover:border-primary'}"
          >
            {#if store.settings.theme === 'system'}
              <div class="absolute top-2 left-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-20">
                <span class="material-symbols-outlined text-[10px] text-white font-bold">check</span>
              </div>
            {/if}
            <!-- Split backgrounds: left half white, right half dark background -->
            <div class="w-1/2 bg-white h-full"></div>
            <div class="w-1/2 bg-[#121314] h-full"></div>
            <!-- Centered icon overlay with backdrop blur & rounded-full styling -->
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-12 h-12 rounded-full bg-surface-container/70 backdrop-blur-md border border-outline/30 flex items-center justify-center shadow-md">
                <span class="material-symbols-outlined text-2xl text-on-surface-variant group-hover:text-primary transition-colors">settings_brightness</span>
              </div>
            </div>
          </div>
          <p class="text-center text-sm font-semibold {store.settings.theme === 'system' ? 'text-primary' : 'text-on-surface-variant'}">System</p>
        </button>
      </div>
    </section>

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
              <div class="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {#if store.settings.autoExport}
            <div class="border-t border-outline-variant/30 pt-5 space-y-4">
              <!-- Export Destination Path -->
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-semibold text-on-surface" for="exportPathSettings">Export Destination Path</label>
                <input 
                  type="text" 
                  id="exportPathSettings"
                  bind:value={store.settings.exportPathSettings}
                  onchange={handleInputChange}
                  placeholder="e.g. /home/user/backups/scribeflow_settings.json" 
                  class="w-full bg-surface-container-highest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                />
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
              <p class="text-xs text-on-surface-variant">Regularly save a copy of your projects and practice history.</p>
            </div>
            
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                bind:checked={store.settings.autoExportData}
                onchange={handleInputChange}
                class="sr-only peer" 
              />
              <div class="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {#if store.settings.autoExportData}
            <div class="border-t border-outline-variant/30 pt-5 space-y-4">
              <!-- Export Destination Path -->
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-semibold text-on-surface" for="exportPathData">Export Destination Path</label>
                <input 
                  type="text" 
                  id="exportPathData"
                  bind:value={store.settings.exportPathData}
                  onchange={handleInputChange}
                  placeholder="e.g. /home/user/backups/scribeflow_data.json" 
                  class="w-full bg-surface-container-highest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                />
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

    <!-- API Settings Section -->
    <section class="bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm relative overflow-visible">
      <div class="absolute top-0 right-0 w-64 h-64 bg-primary-fixed/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none z-0"></div>
      
      <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4 relative z-10">
        <span class="material-symbols-outlined text-primary">api</span>
        <h3 class="text-lg font-bold text-on-surface">API Settings</h3>
      </div>
      
      <div class="relative z-10 flex flex-col gap-6">
        <!-- Provider Tabs -->
        <div class="flex flex-col sm:flex-row gap-3">
          <button 
            type="button"
            onclick={() => handleProviderChange('gemini')}
            class="flex items-center gap-3 p-4 border rounded-lg flex-1 transition-all text-left focus:outline-none cursor-pointer
                   {apiProvider === 'gemini' ? 'border-primary bg-primary/5 font-semibold text-primary' : 'border-outline-variant hover:border-primary text-on-surface bg-surface-container-low'}"
          >
            <span class="material-symbols-outlined">{apiProvider === 'gemini' ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
            <span class="text-sm">Gemini API</span>
          </button>
          
          <button 
            type="button"
            onclick={() => handleProviderChange('openrouter')}
            class="flex items-center gap-3 p-4 border rounded-lg flex-1 transition-all text-left focus:outline-none cursor-pointer
                   {apiProvider === 'openrouter' ? 'border-primary bg-primary/5 font-semibold text-primary' : 'border-outline-variant hover:border-primary text-on-surface bg-surface-container-low'}"
          >
            <span class="material-symbols-outlined">{apiProvider === 'openrouter' ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
            <span class="text-sm">OpenRouter API</span>
          </button>
        </div>

        <!-- API Inputs based on selected provider -->
        {#if apiProvider === 'gemini'}
          <div class="space-y-4">
            <!-- Gemini API Key -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-on-surface" for="geminiKey">Gemini API Key</label>
              <input 
                type="password" 
                id="geminiKey"
                bind:value={store.settings.geminiApiKey}
                onchange={handleInputChange}
                placeholder="Enter your Gemini API key..." 
                class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
              />
            </div>
            
            <!-- Gemini Model (Searchable Autocomplete) -->
            <div class="flex flex-col gap-1.5 relative">
              <label class="text-xs font-semibold text-on-surface" for="geminiModel">Model Selection</label>
              <div class="relative">
                <input 
                  type="text" 
                  id="geminiModel"
                  bind:value={store.settings.geminiModel}
                  onfocus={() => geminiModelOpen = true}
                  oninput={handleInputChange}
                  placeholder="Select or type model..."
                  class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg pl-4 pr-10 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                />
                <button 
                  type="button"
                  onclick={() => geminiModelOpen = !geminiModelOpen}
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant flex items-center justify-center cursor-pointer"
                >
                  <span class="material-symbols-outlined">{geminiModelOpen ? 'expand_less' : 'expand_more'}</span>
                </button>
              </div>

              {#if geminiModelOpen}
                <!-- Invisible click-away overlay -->
                <button type="button" class="fixed inset-0 z-40 bg-transparent cursor-default border-0 p-0 m-0 w-full h-full focus:outline-none" aria-label="Close dropdown" onclick={() => geminiModelOpen = false}></button>
                <!-- Dropdown card -->
                <div class="absolute top-[calc(100%+4px)] left-0 w-full bg-surface-container-high border border-outline-variant rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {#if filteredGeminiModels.length > 0}
                    {#each filteredGeminiModels as modelOption}
                      <button
                        type="button"
                        onclick={() => {
                          store.settings.geminiModel = modelOption;
                          geminiModelOpen = false;
                          handleInputChange();
                        }}
                        class="w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer {store.settings.geminiModel === modelOption ? 'bg-primary/5 text-primary font-semibold' : 'text-on-surface'}"
                      >
                        {modelOption}
                      </button>
                    {/each}
                  {:else}
                    <div class="px-3 py-2 text-xs text-on-surface-variant italic">Press enter or type custom model...</div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="space-y-4">
            <!-- OpenRouter API Key -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-on-surface" for="routerKey">OpenRouter API Key</label>
              <input 
                type="password" 
                id="routerKey"
                bind:value={store.settings.openRouterApiKey}
                onchange={handleInputChange}
                placeholder="Enter your OpenRouter API key..." 
                class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
              />
            </div>

            <!-- OpenRouter Provider (Searchable Autocomplete) -->
            <div class="flex flex-col gap-1.5 relative">
              <label class="text-xs font-semibold text-on-surface" for="openRouterProvider">Provider</label>
              <div class="relative">
                <input 
                  type="text" 
                  id="openRouterProvider"
                  bind:value={store.settings.openRouterProvider}
                  onfocus={() => openRouterProviderOpen = true}
                  oninput={handleInputChange}
                  placeholder="Select or type provider..."
                  class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg pl-4 pr-10 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                />
                <button 
                  type="button"
                  onclick={() => openRouterProviderOpen = !openRouterProviderOpen}
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant flex items-center justify-center cursor-pointer"
                >
                  <span class="material-symbols-outlined">{openRouterProviderOpen ? 'expand_less' : 'expand_more'}</span>
                </button>
              </div>

              {#if openRouterProviderOpen}
                <!-- Invisible click-away overlay -->
                <button type="button" class="fixed inset-0 z-40 bg-transparent cursor-default border-0 p-0 m-0 w-full h-full focus:outline-none" aria-label="Close dropdown" onclick={() => openRouterProviderOpen = false}></button>
                <!-- Dropdown card -->
                <div class="absolute top-[calc(100%+4px)] left-0 w-full bg-surface-container-high border border-outline-variant rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {#if filteredOpenRouterProviders.length > 0}
                    {#each filteredOpenRouterProviders as providerOption}
                      <button
                        type="button"
                        onclick={() => {
                          store.settings.openRouterProvider = providerOption;
                          openRouterProviderOpen = false;
                          handleInputChange();
                        }}
                        class="w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer {store.settings.openRouterProvider === providerOption ? 'bg-primary/5 text-primary font-semibold' : 'text-on-surface'}"
                      >
                        {providerOption}
                      </button>
                    {/each}
                  {:else}
                    <div class="px-3 py-2 text-xs text-on-surface-variant italic">Press enter or type custom provider...</div>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- OpenRouter Model (Searchable Autocomplete) -->
            <div class="flex flex-col gap-1.5 relative">
              <label class="text-xs font-semibold text-on-surface" for="openRouterModel">Model Selection</label>
              <div class="relative">
                <input 
                  type="text" 
                  id="openRouterModel"
                  bind:value={store.settings.openRouterModel}
                  onfocus={() => openRouterModelOpen = true}
                  oninput={handleInputChange}
                  placeholder="Select or type model..."
                  class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg pl-4 pr-10 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                />
                <button 
                  type="button"
                  onclick={() => openRouterModelOpen = !openRouterModelOpen}
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant flex items-center justify-center cursor-pointer"
                >
                  <span class="material-symbols-outlined">{openRouterModelOpen ? 'expand_less' : 'expand_more'}</span>
                </button>
              </div>

              {#if openRouterModelOpen}
                <!-- Invisible click-away overlay -->
                <button type="button" class="fixed inset-0 z-40 bg-transparent cursor-default border-0 p-0 m-0 w-full h-full focus:outline-none" aria-label="Close dropdown" onclick={() => openRouterModelOpen = false}></button>
                <!-- Dropdown card -->
                <div class="absolute top-[calc(100%+4px)] left-0 w-full bg-surface-container-high border border-outline-variant rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {#if filteredOpenRouterModels.length > 0}
                    {#each filteredOpenRouterModels as modelOption}
                      <button
                        type="button"
                        onclick={() => {
                          store.settings.openRouterModel = modelOption;
                          openRouterModelOpen = false;
                          handleInputChange();
                        }}
                        class="w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer {store.settings.openRouterModel === modelOption ? 'bg-primary/5 text-primary font-semibold' : 'text-on-surface'}"
                      >
                        {modelOption}
                      </button>
                    {/each}
                  {:else}
                    <div class="px-3 py-2 text-xs text-on-surface-variant italic">Press enter or type custom model...</div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </section>
  </div>
</main>
