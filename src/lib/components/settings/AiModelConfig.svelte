<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { onMount } from 'svelte';
  import { t } from '../../services/i18n';
  import { getModelSupportedModalities } from '../../utils/modality';

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
  let filterImage = $derived(settings.filterImage ?? true);
  let filterPdf = $derived(settings.filterPdf ?? false);
  let filterAudio = $derived(settings.filterAudio ?? false);
  let filterVideo = $derived(settings.filterVideo ?? false);

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
      const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=text');
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          openRouterModelsFullList = data.data;
          store.openRouterModels = data.data;
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

  // Hook dynamic model listing triggers and synchronize store models if available
  $effect(() => {
    if (store.openRouterModels && store.openRouterModels.length > 0 && openRouterModelsFullList.length === 0) {
      openRouterModelsFullList = store.openRouterModels;
      openRouterModelsList = store.openRouterModels.map((m: any) => m.id);
    }
  });

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

  const selectedModelHasReasoningEfforts = $derived.by(() => {
    if (!settings.openRouterModel || openRouterModelsFullList.length === 0) return false;
    const info: any = openRouterModelsFullList.find((m: any) => m.id === settings.openRouterModel);
    return !!(info?.reasoning?.supported_efforts && info.reasoning.supported_efforts.length > 0);
  });

  const getReasoningEffortsList = $derived.by(() => {
    if (!settings.openRouterModel || openRouterModelsFullList.length === 0) return [];
    const info: any = openRouterModelsFullList.find((m: any) => m.id === settings.openRouterModel);
    return info?.reasoning?.supported_efforts || [];
  });

  const isReasoningMandatory = $derived.by(() => {
    if (!settings.openRouterModel || openRouterModelsFullList.length === 0) return false;
    const info: any = openRouterModelsFullList.find((m: any) => m.id === settings.openRouterModel);
    return !!info?.reasoning?.mandatory;
  });

  // Filtered dropdown suggestions based on active text input values
  let filteredGeminiModels = $derived(
    geminiModelsList
      .filter(m => {
        const name = m.toLowerCase();
        // Exclude image generation, embeddings, etc. (non-text output models)
        if (name.includes('imagen') || name.includes('embed') || name.includes('similarity')) {
          return false;
        }

        const supported = getModelSupportedModalities('gemini', m);
        if (filterImage && !supported.image) return false;
        if (filterPdf && !supported.pdf) return false;
        if (filterAudio && !supported.audio) return false;
        if (filterVideo && !supported.video) return false;

        return true;
      })
      .filter(m => fuzzyMatch(m, settings.geminiModel || ''))
  );

  let filteredOpenRouterModels = $derived(
    (openRouterModelsFullList.length > 0 ? openRouterModelsFullList : openRouterModelsList.map(id => ({ id, name: '', description: '', architecture: null })))
      // Filter by active capabilities
      .filter((m: any) => {
        const supported = getModelSupportedModalities('openrouter', m.id, m);

        if (filterImage && !supported.image) return false;
        if (filterPdf && !supported.pdf) return false;
        if (filterAudio && !supported.audio) return false;
        if (filterVideo && !supported.video) return false;

        return true;
      })
      // Filter to only display models that output text
      .filter((m: any) => {
        const arch = m.architecture;
        if (arch) {
          // Check output_modalities array if present (standard OpenRouter API) or outputModalities
          const outputModalities = arch.output_modalities || arch.outputModalities;
          if (Array.isArray(outputModalities)) {
            return outputModalities.includes('text');
          }
          // Check modality string if present (e.g. "text->text", "text->image", "text")
          const modality = (arch.modality || '').toLowerCase();
          if (modality) {
            if (modality.includes('->')) {
              const parts = modality.split('->');
              const outputs = parts[1] || '';
              return outputs.includes('text');
            }
            return modality.includes('text');
          }
        }
        
        // Fallback check by model ID if no modality details are present
        const id = m.id.toLowerCase();
        const isNonText = id.includes('/stable-diffusion') || 
                           id.includes('/flux') || 
                           id.includes('/midjourney') || 
                           id.includes('/dall-e') ||
                           id.includes('/suno') ||
                           id.includes('/luma-') ||
                           id.includes('text-to-image') ||
                           id.includes('text-to-video') ||
                           id.includes('/tts-') ||
                           id.includes('/elevenlabs');
        return !isNonText;
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

      <!-- Model Filtering Options -->
      <div class="flex flex-col gap-2.5 bg-surface-container-low p-3 rounded-lg border border-outline-variant select-none">
        <span class="text-xs text-on-surface font-bold flex items-center gap-1.5 mb-1">
          <span class="material-symbols-outlined text-[18px] text-primary">filter_list</span>
          {store.settings.language === 'Deutsch' ? 'Modellfilter' : 'Model Filters'}
        </span>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <!-- Image (Vision) Toggle -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-on-surface font-medium flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-primary">image</span>
              {t('settings.api.filterImage')}
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                bind:checked={settings.filterImage}
                onchange={handleInputChange}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <!-- Files (PDF) Toggle -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-on-surface font-medium flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-primary">description</span>
              {t('settings.api.filterPdf')}
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                bind:checked={settings.filterPdf}
                onchange={handleInputChange}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <!-- Audio Toggle -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-on-surface font-medium flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-primary">audiotrack</span>
              {t('settings.api.filterAudio')}
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                bind:checked={settings.filterAudio}
                onchange={handleInputChange}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <!-- Video Toggle -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-on-surface font-medium flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-primary">videocam</span>
              {t('settings.api.filterVideo')}
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                bind:checked={settings.filterVideo}
                onchange={handleInputChange}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </div>
      
      <!-- Gemini Model (Searchable Autocomplete) -->
      <div class="flex flex-col gap-1.5 relative">
        <label class="text-xs font-semibold text-on-surface" for="geminiModel">{t('settings.api.modelSelection')}</label>
        <div class="relative">
          <input 
            type="text" 
            id="geminiModel"
            name="gemini-model-autocomplete-off"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
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

      <!-- Max Output Tokens -->
      <div class="flex flex-col gap-1.5 mt-2">
        <div class="flex items-center gap-1.5">
          <label class="text-xs font-semibold text-on-surface flex items-center gap-1" for="geminiMaxTokens">
            {t('settings.api.maxOutputTokens')}
            <span class="text-[10px] text-on-surface-variant font-normal">({t('settings.api.maxOutputTokensDesc')})</span>
          </label>
          <div class="group relative flex items-center">
            <span class="material-symbols-outlined text-[15px] text-outline cursor-help select-none">help</span>
            <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 bg-surface-container-high text-on-surface border border-outline-variant text-[10.5px] p-2.5 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 leading-relaxed normal-case select-text font-normal">
              {t('settings.api.maxOutputTokensTooltip')}
            </div>
          </div>
        </div>
        <input 
          type="number" 
          id="geminiMaxTokens"
          min="0"
          placeholder="0"
          bind:value={settings.maxOutputTokens}
          oninput={handleInputChange}
          class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
        />
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

      <!-- Model Filtering Options -->
      <div class="flex flex-col gap-2.5 bg-surface-container-low p-3 rounded-lg border border-outline-variant select-none">
        <span class="text-xs text-on-surface font-bold flex items-center gap-1.5 mb-1">
          <span class="material-symbols-outlined text-[18px] text-primary">filter_list</span>
          {store.settings.language === 'Deutsch' ? 'Modellfilter' : 'Model Filters'}
        </span>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <!-- Image (Vision) Toggle -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-on-surface font-medium flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-primary">image</span>
              {t('settings.api.filterImage')}
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                bind:checked={settings.filterImage}
                onchange={handleInputChange}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <!-- Files (PDF) Toggle -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-on-surface font-medium flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-primary">description</span>
              {t('settings.api.filterPdf')}
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                bind:checked={settings.filterPdf}
                onchange={handleInputChange}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <!-- Audio Toggle -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-on-surface font-medium flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-primary">audiotrack</span>
              {t('settings.api.filterAudio')}
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                bind:checked={settings.filterAudio}
                onchange={handleInputChange}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <!-- Video Toggle -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-on-surface font-medium flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-primary">videocam</span>
              {t('settings.api.filterVideo')}
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                bind:checked={settings.filterVideo}
                onchange={handleInputChange}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </div>

      <!-- OpenRouter Model (Searchable Autocomplete) - PLACED FIRST -->
      <div class="flex flex-col gap-1.5 relative">
        <label class="text-xs font-semibold text-on-surface" for="openRouterModel">{t('settings.api.modelSelection')}</label>
        <div class="relative">
          <input 
            type="text" 
            id="openRouterModel"
            name="openrouter-model-autocomplete-off"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
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

      <!-- Max Output Tokens -->
      <div class="flex flex-col gap-1.5 mt-2">
        <div class="flex items-center gap-1.5">
          <label class="text-xs font-semibold text-on-surface flex items-center gap-1" for="openRouterMaxTokens">
            {t('settings.api.maxOutputTokens')}
            <span class="text-[10px] text-on-surface-variant font-normal">({t('settings.api.maxOutputTokensDesc')})</span>
          </label>
          <div class="group relative flex items-center">
            <span class="material-symbols-outlined text-[15px] text-outline cursor-help select-none">help</span>
            <div class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 bg-surface-container-high text-on-surface border border-outline-variant text-[10.5px] p-2.5 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 leading-relaxed normal-case select-text font-normal">
              {t('settings.api.maxOutputTokensTooltip')}
            </div>
          </div>
        </div>
        <input 
          type="number" 
          id="openRouterMaxTokens"
          min="0"
          placeholder="0"
          bind:value={settings.maxOutputTokens}
          oninput={handleInputChange}
          class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
        />
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
            name="openrouter-provider-autocomplete-off"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
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

      <!-- OpenRouter Reasoning Toggle or Level Dropdown -->
      {#if selectedModelHasReasoningEfforts}
        <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
          <div class="flex flex-col gap-0.5 min-w-0 pr-4">
            <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-primary">psychology</span>
              {t('settings.api.enableReasoning')}
            </span>
            <span class="text-[10px] text-on-surface-variant leading-tight">{t('settings.api.reasoningLevelDesc')}</span>
          </div>
          <select
            value={settings.openRouterReasoning === false ? 'none' : (settings.openRouterReasoning === true ? 'auto' : settings.openRouterReasoning)}
            onchange={(e) => {
              const val = e.currentTarget.value;
              if (val === 'none') settings.openRouterReasoning = false;
              else if (val === 'auto') settings.openRouterReasoning = true;
              else settings.openRouterReasoning = val;
              handleInputChange();
            }}
            class="bg-surface-container-high border border-outline-variant rounded-lg px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary shrink-0 max-w-37.5 cursor-pointer"
          >
            {#if !isReasoningMandatory}
              <option value="none">{t('settings.api.reasoningNone')}</option>
            {/if}
            <option value="auto">{t('settings.api.reasoningAuto')}</option>
            {#each getReasoningEffortsList as effort}
              <option value={effort}>{effort.toUpperCase()}</option>
            {/each}
          </select>
        </div>
      {:else}
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
              checked={settings.openRouterReasoning !== false && settings.openRouterReasoning !== 'none'}
              onchange={(e) => {
                settings.openRouterReasoning = e.currentTarget.checked;
                handleInputChange();
              }}
              class="sr-only peer" 
            />
            <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      {/if}

    </div>
  {/if}
</div>

