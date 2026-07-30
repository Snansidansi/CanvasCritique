<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { DEFAULT_OCR_PROMPT } from '../../state/defaults';
  import { t } from '../../services/i18n';
  import { onMount } from 'svelte';
  import { getModelSupportedModalities } from '../../utils/modality';
  import { estimateCost } from '../../services/ai';
  import HelpTooltip from '../common/HelpTooltip.svelte';

  let {
    targetSettings,
    isLessonOverride = false,
    onchange
  }: {
    targetSettings: any;
    isLessonOverride?: boolean;
    onchange?: () => void;
  } = $props();

  // Dropdown open states
  let openRouterModelOpen = $state(false);
  let openRouterProviderOpen = $state(false);
  let providerSearchTerm = $state('');

  // Test connection state
  let testStatus = $state<'idle' | 'testing' | 'success' | 'error'>('idle');
  let testMessage = $state('');

  // Models list
  let openRouterModelsFullList = $state<any[]>([]);
  let activeModelProviders = $state<string[]>([]);

  function fuzzyMatch(text: string, query: string) {
    if (!query) return true;
    const target = text.toLowerCase();
    const search = query.toLowerCase();
    let searchIdx = 0;
    for (let i = 0; i < target.length; i++) {
      if (target[i] === search[searchIdx]) {
        searchIdx++;
        if (searchIdx === search.length) return true;
      }
    }
    return false;
  }

  const activeOcrModel = $derived(
    targetSettings.ocrOpenRouterModel || store.settings.openRouterModel || 'google/gemini-flash-1.5'
  );

  async function fetchActiveModelProviders() {
    const model = activeOcrModel;
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
          activeModelProviders = Array.from(new Set(providers)).sort() as string[];
        }
      }
    } catch (_) {
      activeModelProviders = [];
    }
  }

  $effect(() => {
    fetchActiveModelProviders();
  });

  let openRouterProviders = $derived.by(() => {
    if (activeModelProviders.length > 0) return activeModelProviders;
    return ['Google', 'OpenAI', 'Anthropic', 'Meta', 'Mistral', 'Together', 'DeepInfra', 'Lepton', 'Groq', 'Alibaba Cloud'].sort();
  });

  onMount(async () => {
    if (store.openRouterModels && store.openRouterModels.length > 0) {
      openRouterModelsFullList = store.openRouterModels;
    } else {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models?output_modalities=text');
        if (res.ok) {
          const data = await res.json();
          if (data?.data) {
            openRouterModelsFullList = data.data;
            store.openRouterModels = data.data;
          }
        }
      } catch (_) {}
    }
  });

  // Filter models strictly for Vision (image->text) capabilities for OCR
  let filteredOcrModels = $derived(
    (openRouterModelsFullList.length > 0
      ? openRouterModelsFullList
      : [
          { id: 'google/gemini-flash-1.5' },
          { id: 'google/gemini-2.0-flash-001' },
          { id: 'anthropic/claude-3.5-sonnet' },
          { id: 'openai/gpt-4o-mini' }
        ]
    )
      .filter((m: any) => {
        const supported = getModelSupportedModalities('openrouter', m.id, m);
        return supported.image;
      })
      .map((m: any) => m.id)
      .filter((id: string) => fuzzyMatch(id, targetSettings.ocrOpenRouterModel || ''))
  );

  let filteredOcrProviders = $derived(
    openRouterProviders
      .filter(p => !(targetSettings.ocrOpenRouterProvider || []).includes(p))
      .filter(p => fuzzyMatch(p, providerSearchTerm))
  );

  const selectedModelHasReasoningEfforts = $derived.by(() => {
    const model = activeOcrModel;
    if (!model || openRouterModelsFullList.length === 0) return false;
    const info: any = openRouterModelsFullList.find((m: any) => m.id === model);
    return !!(info?.reasoning?.supported_efforts && info.reasoning.supported_efforts.length > 0);
  });

  const getReasoningEffortsList = $derived.by(() => {
    const model = activeOcrModel;
    if (!model || openRouterModelsFullList.length === 0) return [];
    const info: any = openRouterModelsFullList.find((m: any) => m.id === model);
    return info?.reasoning?.supported_efforts || [];
  });

  const isReasoningMandatory = $derived.by(() => {
    const model = activeOcrModel;
    if (!model || openRouterModelsFullList.length === 0) return false;
    const info: any = openRouterModelsFullList.find((m: any) => m.id === model);
    return !!info?.reasoning?.mandatory;
  });

  function handleChange() {
    if (onchange) onchange();
    store.saveSettings();
  }

  function handleResetPrompt() {
    targetSettings.ocrCustomPrompt = '';
    handleChange();
  }

  // Test connection for OCR model
  async function testOcrConnection() {
    testStatus = 'testing';
    testMessage = t('settings.api.testConnectionActive');

    const apiKey = store.settings.openRouterApiKey;
    const model = activeOcrModel;

    if (!apiKey) {
      testStatus = 'error';
      testMessage = t('settings.api.testConnectionNoKey');
      return;
    }

    try {
      const prompt = "Reply EXCLUSIVELY with the word 'yes' and nothing else.";
      const providers = targetSettings.ocrOpenRouterProvider || store.settings.ocrOpenRouterProvider || [];
      const reasoning = targetSettings.ocrOpenRouterReasoning !== undefined ? targetSettings.ocrOpenRouterReasoning : store.settings.ocrOpenRouterReasoning;

      const payload: any = {
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      };

      if (providers.length > 0) {
        payload.provider = { order: providers };
      }

      if (reasoning === false) {
        payload.reasoning = { exclude: true };
      } else if (typeof reasoning === 'string' && reasoning !== 'none' && reasoning !== 'auto') {
        payload.reasoning = { exclude: false, effort: reasoning };
      }

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        testStatus = 'error';
        testMessage = t('settings.api.testConnectionError', { error: errText || 'API error' });
        return;
      }

      const data = await res.json();
      if (data && data.choices && data.choices[0]) {
        testStatus = 'success';
        testMessage = t('settings.api.testConnectionSuccess');

        try {
          const inputTokens = data.usage?.prompt_tokens || 0;
          const outputTokens = data.usage?.completion_tokens || 0;
          const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens || 0;
          const cost = estimateCost(model, inputTokens, outputTokens);
          await store.recordRequest('openrouter', model, inputTokens, outputTokens, reasoningTokens, cost, 'ocr');
        } catch (_) {}
      } else {
        testStatus = 'error';
        testMessage = t('settings.api.testConnectionError', { error: 'No response from model' });
      }
    } catch (err: any) {
      testStatus = 'error';
      testMessage = t('settings.api.testConnectionNetworkError', { error: err?.message || err });
    }
  }
</script>

<div class="flex flex-col gap-6">
  <!-- Enable / Disable OCR -->
  <div class="flex items-center justify-between p-4 bg-surface-container-low border border-outline-variant/30 rounded-xl">
    <div class="flex flex-col gap-1">
      <span class="text-sm font-semibold text-on-surface">{t('settings.ocr.enableTitle')}</span>
      <span class="text-xs text-on-surface-variant">{t('settings.ocr.enableDesc')}</span>
    </div>
    <label class="relative inline-flex items-center cursor-pointer">
      <input 
        type="checkbox" 
        checked={targetSettings.ocrEnabled ?? true} 
        onchange={(e) => {
          targetSettings.ocrEnabled = e.currentTarget.checked;
          handleChange();
        }} 
        class="sr-only peer"
      >
      <div class="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
    </label>
  </div>

  {#if targetSettings.ocrEnabled ?? true}
    <!-- OpenRouter Model for OCR (Identical Searchable Autocomplete UI) -->
    <div class="flex flex-col gap-1.5 relative">
      <label class="text-xs font-semibold text-on-surface" for="ocrModelAutocomplete">
        {t('settings.ocr.modelTitle')}
      </label>
      <p class="text-xs text-on-surface-variant">{t('settings.ocr.modelDesc')}</p>

      <div class="relative mt-1">
        <input 
          type="text" 
          id="ocrModelAutocomplete"
          name="openrouter-ocr-model-autocomplete-off"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          bind:value={targetSettings.ocrOpenRouterModel}
          onfocus={() => openRouterModelOpen = true}
          oninput={handleChange}
          placeholder={store.settings.openRouterModel ? `${t('settings.ocr.useDefaultModel')} (${store.settings.openRouterModel})` : 'google/gemini-flash-1.5'}
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
          <button
            type="button"
            onclick={() => {
              targetSettings.ocrOpenRouterModel = '';
              openRouterModelOpen = false;
              handleChange();
            }}
            class="w-full text-left px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-md transition-colors cursor-pointer"
          >
            {t('settings.ocr.useDefaultModel')} ({store.settings.openRouterModel || 'Default'})
          </button>
          {#if filteredOcrModels.length > 0}
            {#each filteredOcrModels as modelOption}
              <button
                type="button"
                onclick={() => {
                  targetSettings.ocrOpenRouterModel = modelOption;
                  openRouterModelOpen = false;
                  handleChange();
                }}
                class="w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-primary/10 hover:text-primary cursor-pointer {targetSettings.ocrOpenRouterModel === modelOption ? 'bg-primary/5 text-primary font-semibold' : 'text-on-surface'}"
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

    <!-- Provider Selection for OCR (Multiple Tag Autocomplete UI) -->
    <div class="flex flex-col gap-1.5 relative">
      <span class="text-xs font-semibold text-on-surface">{t('settings.api.selectedProviders')} (OCR)</span>
      
      <div class="flex flex-wrap gap-2 mb-1">
        {#each targetSettings.ocrOpenRouterProvider || [] as providerTag}
          <div class="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-1 rounded-full font-semibold">
            <span>{providerTag}</span>
            <button
              type="button"
              onclick={() => {
                const current = targetSettings.ocrOpenRouterProvider || [];
                targetSettings.ocrOpenRouterProvider = current.filter((p: string) => p !== providerTag);
                handleChange();
              }}
              class="flex items-center justify-center w-4 h-4 rounded-full hover:bg-primary/20 text-primary cursor-pointer border-0 p-0 text-[12px] font-bold"
            >
              ×
            </button>
          </div>
        {/each}
      </div>

      <div class="relative mt-1">
        <input 
          type="text" 
          id="ocrRouterProvider"
          name="openrouter-ocr-provider-autocomplete-off"
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
        <button type="button" class="fixed inset-0 z-40 bg-transparent cursor-default border-0 p-0 m-0 w-full h-full focus:outline-none" aria-label="Close dropdown" onclick={() => openRouterProviderOpen = false}></button>
        <div class="absolute top-[calc(100%+4px)] left-0 w-full bg-surface-container-high border border-outline-variant rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto custom-scrollbar p-1">
          {#if filteredOcrProviders.length > 0}
            {#each filteredOcrProviders as providerOption}
              <button
                type="button"
                onclick={() => {
                  const current = targetSettings.ocrOpenRouterProvider || [];
                  if (!current.includes(providerOption)) {
                    targetSettings.ocrOpenRouterProvider = [...current, providerOption];
                  }
                  providerSearchTerm = '';
                  openRouterProviderOpen = false;
                  handleChange();
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

    <!-- Reasoning Selector for OCR (Identical UI to AiModelConfig.svelte) -->
    {#if selectedModelHasReasoningEfforts}
      <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
        <div class="flex flex-col gap-0.5 min-w-0 pr-4">
          <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-primary">psychology</span>
            {t('settings.api.enableReasoning')} (OCR)
          </span>
          <span class="text-[10px] text-on-surface-variant leading-tight">{t('settings.api.reasoningLevelDesc')}</span>
        </div>
        <select
          value={targetSettings.ocrOpenRouterReasoning === false ? 'none' : (targetSettings.ocrOpenRouterReasoning === true ? 'auto' : targetSettings.ocrOpenRouterReasoning)}
          onchange={(e) => {
            const val = e.currentTarget.value;
            if (val === 'none') targetSettings.ocrOpenRouterReasoning = false;
            else if (val === 'auto') targetSettings.ocrOpenRouterReasoning = true;
            else targetSettings.ocrOpenRouterReasoning = val;
            handleChange();
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
            {t('settings.api.enableReasoning')} (OCR)
          </span>
          <span class="text-[10px] text-on-surface-variant leading-tight">{t('settings.api.reasoningDesc')}</span>
        </div>
        <label class="relative inline-flex items-center cursor-pointer select-none shrink-0">
          <input 
            type="checkbox" 
            checked={targetSettings.ocrOpenRouterReasoning !== false && targetSettings.ocrOpenRouterReasoning !== 'none'}
            onchange={(e) => {
              targetSettings.ocrOpenRouterReasoning = e.currentTarget.checked;
              handleChange();
            }}
            class="sr-only peer" 
          />
          <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>
    {/if}

    <!-- Custom Prompt for OCR -->
    <div class="flex flex-col gap-2">
      <div class="flex justify-between items-center">
        <label class="text-sm font-semibold text-on-surface" for="ocrPrompt">
          {t('settings.ocr.promptTitle')}
        </label>
        <button
          type="button"
          onclick={handleResetPrompt}
          class="text-xs text-primary hover:underline cursor-pointer"
        >
          {t('settings.ocr.resetPrompt')}
        </button>
      </div>
      <p class="text-xs text-on-surface-variant">{t('settings.ocr.promptDesc')}</p>
      <textarea
        id="ocrPrompt"
        value={targetSettings.ocrCustomPrompt || ''}
        placeholder={DEFAULT_OCR_PROMPT}
        oninput={(e) => {
          targetSettings.ocrCustomPrompt = e.currentTarget.value;
          handleChange();
        }}
        rows={4}
        class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-3 text-xs text-on-surface font-mono focus:outline-none focus:border-primary transition-all resize-y"
      ></textarea>
    </div>

    <!-- OCR Test Connection Panel -->
    {#if !isLessonOverride}
      <div class="mt-2 pt-4 border-t border-outline-variant/30 flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <button
            type="button"
            onclick={testOcrConnection}
            disabled={testStatus === 'testing'}
            class="bg-secondary-container text-on-secondary-container hover:bg-secondary-container-high disabled:opacity-50 transition-all px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer flex items-center gap-2"
          >
            <span class="material-symbols-outlined text-[18px]">cell_tower</span>
            {t('settings.api.testConnectionBtn')} (OCR)
          </button>

          {#if testStatus === 'testing'}
            <span class="text-xs text-on-surface-variant flex items-center gap-1.5 animate-pulse">
              <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
              {t('settings.api.testing')}
            </span>
          {:else if testStatus === 'success'}
            <span class="text-xs text-emerald-500 font-semibold flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">check_circle</span>
              {t('settings.api.verified')}
            </span>
          {:else if testStatus === 'error'}
            <span class="text-xs text-error font-semibold flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">error</span>
              {t('settings.api.failed')}
            </span>
          {/if}
        </div>
        {#if testMessage}
          <p class="text-xs {testStatus === 'success' ? 'text-emerald-500/80' : testStatus === 'error' ? 'text-error/80' : 'text-on-surface-variant'}">
            {testMessage}
          </p>
        {/if}
      </div>
    {/if}
  {/if}
</div>
