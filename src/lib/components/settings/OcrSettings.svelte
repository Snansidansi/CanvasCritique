<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { DEFAULT_OCR_PROMPT } from '../../state/defaults';
  import { t } from '../../services/i18n';
  import { onMount } from 'svelte';

  let {
    targetSettings,
    isLessonOverride = false,
    onchange
  }: {
    targetSettings: any;
    isLessonOverride?: boolean;
    onchange?: () => void;
  } = $props();

  let openRouterModelOpen = $state(false);
  let openRouterModelsList = $state<string[]>([
    'google/gemini-flash-1.5',
    'google/gemini-2.0-flash-001',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o-mini'
  ]);

  onMount(async () => {
    if (store.openRouterModels.length > 0) {
      openRouterModelsList = store.openRouterModels
        .filter((m: any) => {
          const mods = m.architecture?.modality || m.modalities || [];
          return mods.includes('image->text') || mods.includes('multimodal') || m.id.includes('gemini') || m.id.includes('claude') || m.id.includes('gpt-4o');
        })
        .map((m: any) => m.id);
    } else {
      store.fetchOpenRouterPrices().then(() => {
        if (store.openRouterModels.length > 0) {
          openRouterModelsList = store.openRouterModels.map((m: any) => m.id);
        }
      });
    }
  });

  function handleChange() {
    if (onchange) onchange();
    store.saveSettings();
  }

  function handleResetPrompt() {
    targetSettings.ocrCustomPrompt = '';
    handleChange();
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
    <!-- OpenRouter Model for OCR -->
    <div class="flex flex-col gap-2">
      <label class="text-sm font-semibold text-on-surface" for="ocrModelSelect">
        {t('settings.ocr.modelTitle')}
      </label>
      <p class="text-xs text-on-surface-variant">{t('settings.ocr.modelDesc')}</p>

      <div class="relative">
        <input
          type="text"
          id="ocrModelSelect"
          value={targetSettings.ocrOpenRouterModel || ''}
          placeholder={store.settings.openRouterModel ? `${t('settings.ocr.useDefaultModel')} (${store.settings.openRouterModel})` : 'google/gemini-flash-1.5'}
          onfocus={() => openRouterModelOpen = true}
          oninput={(e) => {
            targetSettings.ocrOpenRouterModel = e.currentTarget.value;
            handleChange();
          }}
          class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-all"
        />

        {#if openRouterModelOpen && openRouterModelsList.length > 0}
          <div class="absolute z-20 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-surface-container-high border border-outline-variant/40 rounded-xl shadow-lg">
            <button
              type="button"
              class="w-full text-left px-4 py-2 text-xs font-semibold text-primary hover:bg-surface-container-highest transition-colors cursor-pointer"
              onclick={() => {
                targetSettings.ocrOpenRouterModel = '';
                openRouterModelOpen = false;
                handleChange();
              }}
            >
              {t('settings.ocr.useDefaultModel')} ({store.settings.openRouterModel})
            </button>
            {#each openRouterModelsList as m}
              <button
                type="button"
                class="w-full text-left px-4 py-2 text-xs text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer {targetSettings.ocrOpenRouterModel === m ? 'bg-primary/10 font-bold' : ''}"
                onclick={() => {
                  targetSettings.ocrOpenRouterModel = m;
                  openRouterModelOpen = false;
                  handleChange();
                }}
              >
                {m}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Reasoning settings for OCR -->
    <div class="flex flex-col gap-2">
      <label class="text-sm font-semibold text-on-surface" for="ocrReasoningSelect">
        {t('settings.api.reasoningTitle')} (OCR)
      </label>
      <select
        id="ocrReasoningSelect"
        value={targetSettings.ocrOpenRouterReasoning ?? true}
        onchange={(e) => {
          const val = e.currentTarget.value;
          targetSettings.ocrOpenRouterReasoning = val === 'true' ? true : val === 'false' ? false : val;
          handleChange();
        }}
        class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-all cursor-pointer"
      >
        <option value={true}>{t('settings.api.reasoningAuto')}</option>
        <option value={false}>{t('settings.api.reasoningDisabled')}</option>
        <option value="low">Low Effort</option>
        <option value="medium">Medium Effort</option>
        <option value="high">High Effort</option>
      </select>
    </div>

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
  {/if}
</div>
