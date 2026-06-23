<script>
  import { store } from '../state/store.svelte.js';

  // Local state for settings view tabs
  let activeTab = $state('settings'); // 'settings' | 'data' | 'backup'
  
  // Custom API configuration view switching
  let apiProvider = $derived(store.settings.apiProvider);

  function setTheme(theme) {
    store.settings.theme = theme;
    store.saveSettings();
  }

  function handleProviderChange(provider) {
    store.settings.apiProvider = provider;
    // Set default model depending on provider
    if (provider === 'gemini') {
      store.settings.model = 'gemini-1.5-flash';
    } else {
      store.settings.model = 'openai/gpt-4o-mini';
    }
    store.saveSettings();
  }

  function handleInputChange() {
    store.saveSettings();
  }

  // Mock export/import actions
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
</script>

<main class="flex-grow overflow-y-auto bg-surface-container-lowest flex flex-col relative h-full custom-scrollbar">
  <div class="max-w-[800px] w-full mx-auto p-8">
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
      <div class="grid grid-cols-3 gap-4">
        <!-- Light Mode Card -->
        <button 
          onclick={() => setTheme('light')}
          class="cursor-pointer group text-left focus:outline-none"
        >
          <div class="border-2 rounded-lg p-2 mb-2 bg-white flex items-center justify-center h-24 shadow-sm relative overflow-hidden transition-all
                 {store.settings.theme === 'light' ? 'border-primary' : 'border-outline-variant hover:border-primary'}"
          >
            {#if store.settings.theme === 'light'}
              <div class="absolute top-2 left-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                <span class="material-symbols-outlined text-[10px] text-white">check</span>
              </div>
            {/if}
            <span class="material-symbols-outlined text-4xl text-on-surface">light_mode</span>
          </div>
          <p class="text-center text-sm font-semibold {store.settings.theme === 'light' ? 'text-primary' : 'text-on-surface-variant'}" >Light</p>
        </button>

        <!-- Dark Mode Card -->
        <button 
          onclick={() => setTheme('dark')}
          class="cursor-pointer group text-left focus:outline-none"
        >
          <div class="border rounded-lg p-2 mb-2 bg-inverse-surface flex items-center justify-center h-24 relative overflow-hidden transition-all
                 {store.settings.theme === 'dark' ? 'border-primary border-2' : 'border-outline-variant hover:border-primary'}"
          >
            {#if store.settings.theme === 'dark'}
              <div class="absolute top-2 left-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                <span class="material-symbols-outlined text-[10px] text-white">check</span>
              </div>
            {/if}
            <span class="material-symbols-outlined text-4xl text-inverse-primary">dark_mode</span>
          </div>
          <p class="text-center text-sm font-semibold {store.settings.theme === 'dark' ? 'text-primary' : 'text-on-surface-variant'}">Dark</p>
        </button>

        <!-- System Mode Card -->
        <button 
          onclick={() => setTheme('system')}
          class="cursor-pointer group text-left focus:outline-none"
        >
          <div class="border rounded-lg p-2 mb-2 flex flex-col h-24 relative overflow-hidden bg-surface-container transition-all
                 {store.settings.theme === 'system' ? 'border-primary border-2' : 'border-outline-variant hover:border-primary'}"
          >
            {#if store.settings.theme === 'system'}
              <div class="absolute top-2 left-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-20">
                <span class="material-symbols-outlined text-[10px] text-white">check</span>
              </div>
            {/if}
            <div class="h-1/2 bg-white w-full"></div>
            <div class="h-1/2 bg-inverse-surface w-full flex items-center justify-center absolute inset-0 bg-transparent">
              <span class="material-symbols-outlined text-4xl text-outline group-hover:text-primary transition-colors z-10 drop-shadow-md">settings_brightness</span>
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
        <button 
          onclick={() => activeTab = 'backup'}
          class="px-5 py-2.5 font-semibold text-sm border-b-2 rounded-t-lg transition-colors
                 {activeTab === 'backup' ? 'text-primary border-primary bg-primary/5' : 'text-on-surface-variant border-transparent hover:bg-surface-variant/30'}"
        >
          Backup
        </button>
      </div>

      {#if activeTab === 'settings'}
        <div class="flex flex-col gap-4 mb-6">
          <div class="flex flex-col sm:flex-row gap-3">
            <button 
              onclick={handleImport}
              class="flex-1 bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
            >
              <span class="material-symbols-outlined text-[20px]">download</span> 
              Import Settings
            </button>
            <button 
              onclick={handleExport}
              class="flex-1 bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container transition-colors py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
            >
              <span class="material-symbols-outlined text-[20px]">upload</span> 
              Export Settings
            </button>
          </div>
        </div>

        <div class="bg-surface-container-low rounded-lg p-5 border border-outline-variant">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h4 class="font-bold text-sm text-on-surface mb-1">Automatic Export</h4>
              <p class="text-xs text-on-surface-variant">Regularly save a copy of your settings.</p>
            </div>
            
            <!-- Custom CSS Toggle handle -->
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
            <div class="border-t border-outline-variant/30 pt-5">
              <label class="font-semibold text-xs text-on-surface block mb-3">Export Frequency</label>
              <div class="grid grid-cols-3 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] font-bold text-on-surface-variant uppercase">Days</label>
                  <input 
                    type="number" 
                    bind:value={store.settings.exportFrequency.days}
                    onchange={handleInputChange}
                    class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none" 
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] font-bold text-on-surface-variant uppercase">Hours</label>
                  <input 
                    type="number" 
                    bind:value={store.settings.exportFrequency.hours}
                    onchange={handleInputChange}
                    class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none" 
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[10px] font-bold text-on-surface-variant uppercase">Minutes</label>
                  <input 
                    type="number" 
                    bind:value={store.settings.exportFrequency.minutes}
                    onchange={handleInputChange}
                    class="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none" 
                  />
                </div>
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="py-8 text-center text-sm text-on-surface-variant italic">
          Additional {activeTab} operations are not configured in this demo version.
        </div>
      {/if}
    </section>

    <!-- API Settings Section -->
    <section class="bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm relative overflow-hidden">
      <div class="absolute top-0 right-0 w-64 h-64 bg-primary-fixed/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
      
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
            class="flex items-center gap-3 p-4 border rounded-lg flex-1 transition-all text-left focus:outline-none
                   {apiProvider === 'gemini' ? 'border-primary bg-primary/5 font-semibold text-primary' : 'border-outline-variant hover:border-primary text-on-surface bg-surface-container-low'}"
          >
            <span class="material-symbols-outlined">{apiProvider === 'gemini' ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
            <span class="text-sm">Gemini API</span>
          </button>
          
          <button 
            type="button"
            onclick={() => handleProviderChange('openrouter')}
            class="flex items-center gap-3 p-4 border rounded-lg flex-1 transition-all text-left focus:outline-none
                   {apiProvider === 'openrouter' ? 'border-primary bg-primary/5 font-semibold text-primary' : 'border-outline-variant hover:border-primary text-on-surface bg-surface-container-low'}"
          >
            <span class="material-symbols-outlined">{apiProvider === 'openrouter' ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
            <span class="text-sm">OpenRouter API</span>
          </button>
        </div>

        <!-- API Inputs based on selected provider -->
        {#if apiProvider === 'gemini'}
          <div class="space-y-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-on-surface" for="geminiKey">Gemini API Key</label>
              <input 
                type="password" 
                id="geminiKey"
                bind:value={store.settings.apiKey}
                onchange={handleInputChange}
                placeholder="Enter your Gemini API key..." 
                class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
              />
            </div>
            
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-on-surface" for="geminiModel">Model Selection</label>
              <div class="relative">
                <input 
                  type="text" 
                  id="geminiModel"
                  bind:value={store.settings.model}
                  onchange={handleInputChange}
                  placeholder="gemini-1.5-flash"
                  class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg pl-4 pr-10 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                />
                <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">expand_more</span>
              </div>
            </div>
          </div>
        {:else}
          <div class="space-y-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-on-surface" for="routerKey">OpenRouter API Key</label>
              <input 
                type="password" 
                id="routerKey"
                bind:value={store.settings.apiKey}
                onchange={handleInputChange}
                placeholder="Enter your OpenRouter API key..." 
                class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-on-surface" for="routerModel">Model Selection</label>
              <input 
                type="text" 
                id="routerModel"
                bind:value={store.settings.model}
                onchange={handleInputChange}
                placeholder="google/gemini-flash-1.5"
                class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
              />
            </div>
          </div>
        {/if}
      </div>
    </section>
  </div>
</main>
