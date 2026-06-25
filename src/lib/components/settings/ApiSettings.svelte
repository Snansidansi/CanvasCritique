<script>
  import { store } from '../../state/store.svelte';
  import { onMount } from 'svelte';

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
  let activeModelProviders = $state([]);

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

  // Dynamic hosting providers fetching for the selected model
  async function fetchActiveModelProviders() {
    const model = store.settings.openRouterModel;
    if (!model) {
      activeModelProviders = [];
      return;
    }
    try {
      const response = await fetch(`https://openrouter.ai/api/v1/models/${model}/endpoints`);
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.endpoints) {
          const providers = data.data.endpoints.map(e => e.provider_name).filter(Boolean);
          const uniqueProviders = Array.from(new Set(providers)).sort();
          activeModelProviders = uniqueProviders;
          
          // Prune selected providers that are no longer valid for this model
          const current = store.settings.openRouterProvider || [];
          const valid = current.filter(p => uniqueProviders.includes(p));
          if (valid.length !== current.length) {
            store.settings.openRouterProvider = valid;
            store.saveSettings();
          }
        } else {
          activeModelProviders = [];
        }
      } else {
        activeModelProviders = [];
      }
    } catch (e) {
      console.error('Error fetching model providers:', e);
      activeModelProviders = [];
    }
  }

  $effect(() => {
    const model = store.settings.openRouterModel;
    fetchActiveModelProviders();
  });

  // Dynamic provider list based on active model's endpoints or default popular hosting providers
  let openRouterProviders = $derived.by(() => {
    if (activeModelProviders.length > 0) {
      return activeModelProviders;
    }
    return ['Google', 'OpenAI', 'Anthropic', 'Meta', 'Mistral', 'Together', 'DeepInfra', 'Lepton', 'Groq', 'Alibaba Cloud'].sort();
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
      // Filter by Vision capability
      .filter(m => {
        if (!showOnlyVisionModels) return true;
        const id = m.id.toLowerCase();
        const description = (m.description || '').toLowerCase();
        const name = (m.name || '').toLowerCase();
        const modality = m.architecture?.modality || '';
        
        if (modality.includes('image') || modality.includes('multimodal')) return true;
        return id.includes('vision') || id.includes('gemini') || id.includes('claude-3') || id.includes('gpt-4o') || id.includes('pixtral') || id.includes('llava') || description.includes('vision') || description.includes('multimodal') || description.includes('image input') || name.includes('vision') || name.includes('vl') || id.includes('vl');
      })
      // Search query fuzzy match
      .map(m => m.id)
      .filter(id => fuzzyMatch(id, store.settings.openRouterModel))
  );

  let filteredOpenRouterProviders = $derived(
    openRouterProviders
      .filter(p => !(store.settings.openRouterProvider || []).includes(p))
      .filter(p => fuzzyMatch(p, providerSearchTerm))
  );

  function handleProviderChange(provider) {
    store.settings.apiProvider = provider;
    store.saveSettings();
  }

  function handleInputChange() {
    store.saveSettings();
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
        const requestBody = {
          model: model,
          messages: [{ role: "user", content: "Hello! Reply in one short word." }],
          reasoning: {
            exclude: !store.settings.openRouterReasoning
          }
        };
        const selectedProviders = store.settings.openRouterProvider || [];
        if (selectedProviders.length > 0) {
          requestBody.provider = {
            order: selectedProviders
          };
        }
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://scribeflow.app',
            'X-Title': 'ScribeFlow'
          },
          body: JSON.stringify(requestBody)
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
</script>

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
            <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
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
            <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
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
            <p class="text-xs text-on-surface-variant font-semibold flex items-center gap-1 mt-1">
              <span class="material-symbols-outlined text-[16px] text-primary">info</span>
              OpenRouter will automatically choose the best available provider.
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
                      const current = store.settings.openRouterProvider || [];
                      if (!current.includes(providerOption)) {
                        store.settings.openRouterProvider = [...current, providerOption];
                      }
                      providerSearchTerm = '';
                      openRouterProviderOpen = false;
                      handleInputChange();
                    }}
                    class="w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer text-on-surface"
                  >
                    {providerOption}
                  </button>
                {/each}
              {:else}
                <div class="px-3 py-2 text-xs text-on-surface-variant italic">No matching providers found.</div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- OpenRouter Reasoning Toggle -->
        <div class="flex items-center justify-between p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 mt-2">
          <div class="flex flex-col gap-0.5">
            <span class="text-xs font-bold text-on-surface">Enable Model Reasoning / Thinking</span>
            <span class="text-[10.5px] text-outline leading-tight">Sends reasoning configurations to OpenRouter models (like DeepSeek R1). Disable to save tokens.</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer select-none">
            <input 
              type="checkbox" 
              bind:checked={store.settings.openRouterReasoning} 
              onchange={handleInputChange}
              class="sr-only peer"
            />
            <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>
    {/if}

    <!-- Evaluation Payload Settings -->
    <div class="mt-4 pt-4 border-t border-outline-variant/30 flex flex-col gap-3">
      <h4 class="text-sm font-bold text-on-surface">Evaluation Details</h4>
      <p class="text-xs text-on-surface-variant leading-relaxed">
        Configure what task details are sent to the AI model during "Check Work" evaluations.
      </p>
      <div class="flex flex-col gap-2 mt-1">
        <!-- Send Task Details Toggle -->
        <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
          <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-primary">description</span>
            Send Task Instructions & Details
          </span>
          <label class="relative inline-flex items-center cursor-pointer select-none">
            <input 
              type="checkbox" 
              bind:checked={store.settings.sendTaskMedia}
              onchange={handleInputChange}
              class="sr-only peer" 
            />
            <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
        
        <!-- Send Solution Details Toggle -->
        <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
          <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-primary">fact_check</span>
            Send Evaluation Goal & Solution Details
          </span>
          <label class="relative inline-flex items-center cursor-pointer select-none">
            <input 
              type="checkbox" 
              bind:checked={store.settings.sendSolutionMedia}
              onchange={handleInputChange}
              class="sr-only peer" 
            />
            <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <!-- AI Feedback Language Selection -->
        <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
          <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-primary">translate</span>
            AI Feedback Language
          </span>
          <select
            bind:value={store.settings.language}
            onchange={handleInputChange}
            class="bg-surface-container border border-outline-variant rounded-md px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary font-semibold select-none cursor-pointer"
          >
            <option value="de">Deutsch (German)</option>
            <option value="en">English</option>
            <option value="fr">Français (French)</option>
            <option value="es">Español (Spanish)</option>
            <option value="it">Italiano (Italian)</option>
          </select>
        </div>
      </div>
    </div>

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
