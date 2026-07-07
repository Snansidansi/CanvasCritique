<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { onMount } from 'svelte';
  import { t } from '../../services/i18n';

  // Props
  let { 
    settings, 
    showKeys = true, 
    onchange 
  }: { 
    settings: any; 
    showKeys?: boolean; 
    onchange?: () => void; 
  } = $props();

  // Dropdown open states
  let geminiModelOpen = $state(false);
  let openRouterModelOpen = $state(false);
  let openRouterProviderOpen = $state(false);

  // Autocomplete search states
  let providerSearchTerm = $state('');
  let showOnlyVisionModels = $state(true);

  // Default models and providers list
  let geminiModelsList = $state(['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash-8b']);
  let openRouterModelsList = $state([
    'google/gemini-flash-1.5',
    'meta-llama/llama-3.1-8b-instruct',
    'anthropic/claude-3.5-sonnet'
  ]);
  let openRouterModelsFullList = $state([]);
  let activeModelProviders = $state([]);

  function fuzzyMatch(text: string, query: string) {
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
    const model = settings.openRouterModel;
    if (!model) {
      activeModelProviders = [];
      return;
    }
    try {
      const response = await fetch(`https://openrouter.ai/api/v1/models/${model}/endpoints`);
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.endpoints) {
          const providers = data.data.endpoints.map((e: any) => e.provider_name).filter(Boolean);
          const uniqueProviders = Array.from(new Set(providers)).sort();
          activeModelProviders = uniqueProviders;
          
          // Prune selected providers that are no longer valid for this model
          const current = settings.openRouterProvider || [];
          const valid = current.filter((p: string) => uniqueProviders.includes(p));
          if (valid.length !== current.length) {
            settings.openRouterProvider = valid;
            if (onchange) onchange();
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
    const model = settings.openRouterModel;
    fetchActiveModelProviders();
  });

  // Dynamic provider list based on active model's endpoints or default popular hosting providers
  let openRouterProviders = $derived.by(() => {
    if (activeModelProviders.length > 0) {
      return activeModelProviders;
    }
    return ['Google', 'OpenAI', 'Anthropic', 'Meta', 'Mistral', 'Together', 'DeepInfra', 'Lepton', 'Groq', 'Alibaba Cloud'].sort();
  });

  // Dynamic model fetching (always uses global api keys for fetching since keys are not overridden)
  async function fetchGeminiModels() {
    const key = store.settings.geminiApiKey;
    if (!key) return;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (response.ok) {
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          const models = data.models
            .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
            .map((m: any) => m.name.replace('models/', ''));
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
          const models = data.data.map((m: any) => m.id);
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
      .filter(m => fuzzyMatch(m, settings.geminiModel || ''))
  );

  let filteredOpenRouterModels = $derived(
    (openRouterModelsFullList.length > 0 ? openRouterModelsFullList : openRouterModelsList.map(id => ({ id, name: '', description: '', architecture: null })))
      // Filter by Vision capability
      .filter((m: any) => {
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
      .filter(id => fuzzyMatch(id, settings.openRouterModel || ''))
  );

  let filteredOpenRouterProviders = $derived(
    openRouterProviders
      .filter(p => !(settings.openRouterProvider || []).includes(p))
      .filter(p => fuzzyMatch(p, providerSearchTerm))
  );

  function handleProviderChange(provider: string) {
    settings.apiProvider = provider;
    if (onchange) onchange();
  }

  function handleInputChange() {
    if (onchange) onchange();
  }
</script>

<div class="flex flex-col gap-6">
  <!-- Provider Tabs -->
  <div class="flex flex-col sm:flex-row gap-3">
    <button 
      type="button"
      onclick={() => handleProviderChange('gemini')}
      class="flex items-center gap-3 p-4 border rounded-lg flex-1 transition-all text-left focus:outline-none cursor-pointer
             {settings.apiProvider === 'gemini' ? 'border-primary bg-primary/5 font-semibold text-primary' : 'border-outline-variant hover:border-primary text-on-surface bg-surface-container-low'}"
    >
      <span class="material-symbols-outlined">{settings.apiProvider === 'gemini' ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
      <span class="text-sm">{t('settings.api.providerGemini')}</span>
    </button>
    
    <button 
      type="button"
      onclick={() => handleProviderChange('openrouter')}
      class="flex items-center gap-3 p-4 border rounded-lg flex-1 transition-all text-left focus:outline-none cursor-pointer
             {settings.apiProvider === 'openrouter' ? 'border-primary bg-primary/5 font-semibold text-primary' : 'border-outline-variant hover:border-primary text-on-surface bg-surface-container-low'}"
    >
      <span class="material-symbols-outlined">{settings.apiProvider === 'openrouter' ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
      <span class="text-sm">{t('settings.api.providerOpenRouter')}</span>
    </button>
  </div>

  <!-- API Inputs based on selected provider -->
  {#if settings.apiProvider === 'gemini'}
    <div class="space-y-4 animate-fade-in">
      {#if showKeys}
        <!-- Gemini API Key -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-on-surface" for="geminiKey">{t('settings.api.geminiKeyLabel')}</label>
          <input 
            type="password" 
            id="geminiKey"
            bind:value={settings.geminiApiKey}
            onchange={handleInputChange}
            placeholder={t('settings.api.geminiKeyPlaceholder')} 
            class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
          />
        </div>
      {/if}

      <!-- Vision Capabilities Toggle -->
      <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
        <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[18px] text-primary">visibility</span>
          {t('settings.api.showOnlyVision')}
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
        <label class="text-xs font-semibold text-on-surface" for="geminiModel">{t('settings.api.modelSelection')}</label>
        <div class="relative">
          <input 
            type="text" 
            id="geminiModel"
            bind:value={settings.geminiModel}
            onfocus={() => geminiModelOpen = true}
            oninput={handleInputChange}
            placeholder={t('settings.api.modelPlaceholder')}
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
                    settings.geminiModel = modelOption;
                    geminiModelOpen = false;
                    handleInputChange();
                  }}
                  class="w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer {settings.geminiModel === modelOption ? 'bg-primary/5 text-primary font-semibold' : 'text-on-surface'}"
                >
                  {modelOption}
                </button>
              {/each}
            {:else}
              <div class="px-3 py-2 text-xs text-on-surface-variant italic">{t('settings.api.customModelPressEnter')}</div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="space-y-4 animate-fade-in">
      {#if showKeys}
        <!-- OpenRouter API Key -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-on-surface" for="routerKey">{t('settings.api.openRouterKeyLabel')}</label>
          <input 
            type="password" 
            id="routerKey"
            bind:value={settings.openRouterApiKey}
            onchange={handleInputChange}
            placeholder={t('settings.api.openRouterKeyPlaceholder')} 
            class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
          />
        </div>
      {/if}

      <!-- Vision Capabilities Toggle -->
      <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
        <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[18px] text-primary">visibility</span>
          {t('settings.api.showOnlyVision')}
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
        <label class="text-xs font-semibold text-on-surface" for="openRouterModel">{t('settings.api.modelSelection')}</label>
        <div class="relative">
          <input 
            type="text" 
            id="openRouterModel"
            bind:value={settings.openRouterModel}
            onfocus={() => openRouterModelOpen = true}
            oninput={handleInputChange}
            placeholder={t('settings.api.modelPlaceholder')}
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
                    settings.openRouterModel = modelOption;
                    openRouterModelOpen = false;
                    handleInputChange();
                  }}
                  class="w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer {settings.openRouterModel === modelOption ? 'bg-primary/5 text-primary font-semibold' : 'text-on-surface'}"
                >
                  {modelOption}
                </button>
              {/each}
            {:else}
              <div class="px-3 py-2 text-xs text-on-surface-variant italic">{t('settings.api.customModelPressEnter')}</div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- OpenRouter Provider (Searchable Multiple Tag Autocomplete) - PLACED SECOND -->
      <div class="flex flex-col gap-1.5 relative">
        <span class="text-xs font-semibold text-on-surface">{t('settings.api.selectedProviders')}</span>
        
        <!-- Selected Tags list -->
        <div class="flex flex-wrap gap-2 mb-1">
          {#each settings.openRouterProvider || [] as providerTag}
            <div class="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-1 rounded-full font-semibold">
              <span>{providerTag}</span>
              <button
                type="button"
                onclick={() => {
                  const current = settings.openRouterProvider || [];
                  settings.openRouterProvider = current.filter((p: string) => p !== providerTag);
                  handleInputChange();
                }}
                class="flex items-center justify-center w-4 h-4 rounded-full hover:bg-primary/20 text-primary cursor-pointer border-0 p-0 text-[12px] font-bold"
              >
                ×
              </button>
            </div>
          {/each}
        </div>

        {#if (settings.openRouterProvider || []).length === 0}
          <p class="text-xs text-on-surface-variant font-semibold flex items-center gap-1 mt-1">
            <span class="material-symbols-outlined text-[16px] text-primary">info</span>
            {t('settings.api.autoProviderInfo')}
          </p>
        {/if}

        <div class="relative mt-1">
          <input 
            type="text" 
            id="openRouterProvider"
            bind:value={providerSearchTerm}
            onfocus={() => openRouterProviderOpen = true}
            placeholder={t('settings.api.providerSearchPlaceholder')}
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
                    const current = settings.openRouterProvider || [];
                    if (!current.includes(providerOption)) {
                      settings.openRouterProvider = [...current, providerOption];
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
              <div class="px-3 py-2 text-xs text-on-surface-variant italic">{t('settings.api.noProvidersFound')}</div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- OpenRouter Reasoning Toggle -->
      <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
        <div class="flex flex-col gap-0.5 min-w-0 pr-4">
          <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-primary">psychology</span>
            {t('settings.api.enableReasoning')}
          </span>
          <span class="text-[10px] text-on-surface-variant leading-tight">{t('settings.api.reasoningDesc')}</span>
        </div>
        <label class="relative inline-flex items-center cursor-pointer select-none shrink-0">
          <input 
            type="checkbox" 
            bind:checked={settings.openRouterReasoning}
            onchange={handleInputChange}
            class="sr-only peer" 
          />
          <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

    </div>
  {/if}
</div>

