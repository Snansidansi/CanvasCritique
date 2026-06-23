<script>
  import { store } from '../state/store.svelte';
  import { onMount } from 'svelte';

  // Local state for settings view tabs
  let activeTab = $state('settings'); // 'settings' | 'data'
  
  // Custom API configuration view switching
  let apiProvider = $derived(store.settings.apiProvider);

  // Dropdown open states
  let geminiModelOpen = $state(false);
  let openRouterModelOpen = $state(false);
  let openRouterProviderOpen = $state(false);

  // Autocomplete search states
  let providerSearchTerm = $state('');
  let showOnlyVisionModels = $state(true);

  // Connection test state
  let connectionTestStatus = $state(''); // 'idle' | 'testing' | 'success' | 'error'
  let connectionTestMessage = $state('');

  // Default models and providers list
  let geminiModelsList = $state(['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash-8b']);
  let openRouterModelsList = $state([
    'google/gemini-flash-1.5',
    'meta-llama/llama-3.1-8b-instruct',
    'anthropic/claude-3.5-sonnet'
  ]);
  let openRouterModelsFullList = $state([]);

  function fuzzyMatch(text, query) {
    if (!query) return true;
    const target = text.toLowerCase();
    const search = query.toLowerCase();
    
    let searchIdx = 0;
    for (let i = 0; i < target.length; i++) {
      if (target[i] === search[searchIdx]) {
        searchIdx++;
        if (searchIdx === search.length) {
          return true;
        }
      }
    }
    return false;
  }

  // Dynamic provider extraction
  let openRouterProviders = $derived.by(() => {
    const providersSet = new Set();
    openRouterModelsList.forEach(m => {
      const parts = m.split('/');
      if (parts.length > 1) {
        const p = parts[0];
        let name = p;
        if (p === 'openai') name = 'OpenAI';
        else if (p === 'google') name = 'Google';
        else if (p === 'anthropic') name = 'Anthropic';
        else if (p === 'meta-llama') name = 'Meta';
        else if (p === 'mistralai') name = 'Mistral';
        else name = p.charAt(0).toUpperCase() + p.slice(1);
        providersSet.add(name);
      }
    });
    // Add default popular ones just in case
    ['Google', 'OpenAI', 'Anthropic', 'Meta', 'Mistral'].forEach(p => providersSet.add(p));
    return Array.from(providersSet).sort();
  });

  // Dynamic model fetching
  async function fetchGeminiModels() {
    const key = store.settings.geminiApiKey;
    if (!key) return;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (response.ok) {
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          const models = data.models
            .filter(m => m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace('models/', ''));
          if (models.length > 0) {
            geminiModelsList = models;
          }
        }
      }
    } catch (e) {
      console.error('Error fetching Gemini models:', e);
    }
  }

  async function fetchOpenRouterModels() {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          openRouterModelsFullList = data.data;
          const models = data.data.map(m => m.id);
          if (models.length > 0) {
            openRouterModelsList = models;
          }
        }
      }
    } catch (e) {
      console.error('Error fetching OpenRouter models:', e);
    }
  }

  // Hook dynamic model listing triggers
  $effect(() => {
    if (store.settings.geminiApiKey) {
      fetchGeminiModels();
    }
  });

  onMount(() => {
    fetchOpenRouterModels();
    if (store.settings.geminiApiKey) {
      fetchGeminiModels();
    }
  });

  // Filtered dropdown suggestions based on active text input values
  let filteredGeminiModels = $derived(
    geminiModelsList
      .filter(m => {
        if (!showOnlyVisionModels) return true;
        const name = m.toLowerCase();
        return name.includes('1.5') || name.includes('2.0') || name.includes('vision') || name.includes('flash') || name.includes('pro');
      })
      .filter(m => fuzzyMatch(m, store.settings.geminiModel))
  );

  let filteredOpenRouterModels = $derived(
    (openRouterModelsFullList.length > 0 ? openRouterModelsFullList : openRouterModelsList.map(id => ({ id })))
      // 1. Filter by Selected Providers
      .filter(m => {
        const selected = store.settings.openRouterProvider || [];
        if (selected.length === 0) return true; // Show all if none selected
        
        const parts = m.id.split('/');
        if (parts.length > 1) {
          const provider = parts[0].toLowerCase();
          return selected.some(p => {
            const lowerP = p.toLowerCase();
            if (lowerP === 'meta' && provider === 'meta-llama') return true;
            if (lowerP === 'mistral' && provider === 'mistralai') return true;
            return lowerP === provider || provider.includes(lowerP) || lowerP.includes(provider);
          });
        }
        return false;
      })
      // 2. Filter by Vision capability
      .filter(m => {
        if (!showOnlyVisionModels) return true;
        const id = m.id.toLowerCase();
        const description = (m.description || '').toLowerCase();
        const name = (m.name || '').toLowerCase();
        const modality = m.architecture?.modality || '';
        
        if (modality.includes('image') || modality.includes('multimodal')) return true;
        return id.includes('vision') || id.includes('gemini') || id.includes('claude-3') || id.includes('gpt-4o') || id.includes('pixtral') || id.includes('llava') || description.includes('vision') || description.includes('multimodal') || description.includes('image input') || name.includes('vision') || name.includes('vl');
      })
      // 3. Search query fuzzy match
      .map(m => m.id)
      .filter(id => fuzzyMatch(id, store.settings.openRouterModel))
  );

  let filteredOpenRouterProviders = $derived(
    openRouterProviders
      .filter(p => !(store.settings.openRouterProvider || []).includes(p))
      .filter(p => fuzzyMatch(p, providerSearchTerm))
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

  // Native folder pick wrapper or mock directory selector
  async function selectFolder(type) {
    try {
      if (window.__TAURI__) {
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
      const files = e.target.files;
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

  // API Connection Verification
  async function testApiConnection() {
    connectionTestStatus = 'testing';
    connectionTestMessage = 'Testing connection to active model...';

    const provider = store.settings.apiProvider;
    const apiKey = store.apiKey;
    const model = store.model;

    if (!apiKey) {
      connectionTestStatus = 'error';
      connectionTestMessage = 'Error: Please enter an API key first.';
      return;
    }

    try {
      if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hello! Reply in one short word." }] }]
          })
        });
        const data = await response.json();
        if (response.ok && data.candidates && data.candidates[0]) {
          connectionTestStatus = 'success';
          connectionTestMessage = 'Success! Connection verified successfully.';
        } else {
          connectionTestStatus = 'error';
          connectionTestMessage = `Error: ${data.error?.message || 'Invalid API key or model.'}`;
        }
      } else {
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://scribeflow.app',
            'X-Title': 'ScribeFlow'
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: "Hello! Reply in one short word." }]
          })
        });
        const data = await response.json();
        if (response.ok && data.choices && data.choices[0]) {
          connectionTestStatus = 'success';
          connectionTestMessage = 'Success! Connection verified successfully.';
        } else {
          connectionTestStatus = 'error';
          connectionTestMessage = `Error: ${data.error?.message || 'Invalid API key or model.'}`;
        }
      }
    } catch (err) {
      connectionTestStatus = 'error';
      connectionTestMessage = `Network Error: ${err.message || err}`;
    }
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
                <div class="flex gap-2">
                  <input 
                    type="text" 
                    id="exportPathSettings"
                    bind:value={store.settings.exportPathSettings}
                    onchange={handleInputChange}
                    placeholder="e.g. /home/user/backups/scribeflow_settings.json" 
                    class="flex-grow bg-surface-container-highest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
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
                <div class="flex gap-2">
                  <input 
                    type="text" 
                    id="exportPathData"
                    bind:value={store.settings.exportPathData}
                    onchange={handleInputChange}
                    placeholder="e.g. /home/user/backups/scribeflow_data.json" 
                    class="flex-grow bg-surface-container-highest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
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

            <!-- Vision Capabilities Toggle -->
            <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
              <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[18px] text-primary">visibility</span>
                Show Only Vision Models
              </span>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  bind:checked={showOnlyVisionModels}
                  class="sr-only peer" 
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
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

            <!-- Vision Capabilities Toggle -->
            <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
              <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[18px] text-primary">visibility</span>
                Show Only Vision Models
              </span>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  bind:checked={showOnlyVisionModels}
                  class="sr-only peer" 
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <!-- OpenRouter Model (Searchable Autocomplete) - PLACED FIRST -->
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

            <!-- OpenRouter Provider (Searchable Multiple Tag Autocomplete) - PLACED SECOND -->
            <div class="flex flex-col gap-1.5 relative">
              <span class="text-xs font-semibold text-on-surface">Selected Providers</span>
              
              <!-- Selected Tags list -->
              <div class="flex flex-wrap gap-2 mb-1">
                {#each store.settings.openRouterProvider || [] as providerTag}
                  <div class="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-1 rounded-full font-semibold">
                    <span>{providerTag}</span>
                    <button
                      type="button"
                      onclick={() => {
                        const current = store.settings.openRouterProvider || [];
                        store.settings.openRouterProvider = current.filter(p => p !== providerTag);
                        handleInputChange();
                      }}
                      class="flex items-center justify-center w-4 h-4 rounded-full hover:bg-primary/20 text-primary cursor-pointer border-0 p-0 text-[12px] font-bold"
                    >
                      ×
                    </button>
                  </div>
                {/each}
              </div>

              {#if (store.settings.openRouterProvider || []).length === 0}
                <p class="text-xs text-error font-semibold flex items-center gap-1 mt-1">
                  <span class="material-symbols-outlined text-[16px] text-error">warning</span>
                  Warning: No provider selected! Model filtering will show all.
                </p>
              {/if}

              <div class="relative mt-1">
                <input 
                  type="text" 
                  id="openRouterProvider"
                  bind:value={providerSearchTerm}
                  onfocus={() => openRouterProviderOpen = true}
                  placeholder="Type to search and add providers..."
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
                          const current = store.settings.openRouterProvider || ['Google'];
                          if (!current.includes(providerOption)) {
                            store.settings.openRouterProvider = [...current, providerOption];
                          }
                          providerSearchTerm = '';
                          openRouterProviderOpen = false;
                          handleInputChange();
                        }}
                        class="w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer text-on-surface"
                      >
                        + Add {providerOption}
                      </button>
                    {/each}
                  {:else}
                    <div class="px-3 py-2 text-xs text-on-surface-variant italic">No matching providers found.</div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Connection Test Panel -->
        <div class="mt-4 pt-4 border-t border-outline-variant/30 flex flex-col gap-3">
          <div class="flex items-center gap-3">
            <button
              type="button"
              onclick={testApiConnection}
              disabled={connectionTestStatus === 'testing'}
              class="bg-secondary-container text-on-secondary-container hover:bg-secondary-container-high disabled:opacity-50 transition-all px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer flex items-center gap-2"
            >
              <span class="material-symbols-outlined text-[18px]">cell_tower</span>
              Test Connection
            </button>
            
            {#if connectionTestStatus === 'testing'}
              <span class="text-xs text-on-surface-variant flex items-center gap-1.5 animate-pulse">
                <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                Testing...
              </span>
            {:else}
              {#if connectionTestStatus === 'success'}
                <span class="text-xs text-emerald-500 font-semibold flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px]">check_circle</span>
                  Verified
                </span>
              {:else if connectionTestStatus === 'error'}
                <span class="text-xs text-error font-semibold flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px]">error</span>
                  Failed
                </span>
              {/if}
            {/if}
          </div>
          {#if connectionTestMessage}
            <p class="text-xs {connectionTestStatus === 'success' ? 'text-emerald-500/80' : connectionTestStatus === 'error' ? 'text-error/80' : 'text-on-surface-variant'}">
              {connectionTestMessage}
            </p>
          {/if}
        </div>
      </div>
    </section>
  </div>
</main>
