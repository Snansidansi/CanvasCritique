<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import { runOcrImage } from '../../services/ai';
  import { onDestroy, onMount } from 'svelte';
  import type { Project } from '../../state/types';

  let {
    isOpen = $bindable(false),
    targetLabel = '',
    project = null,
    onextract,
    onProcessingChange
  }: {
    isOpen: boolean;
    targetLabel?: string;
    project?: Project | null;
    onextract: (extractedText: string) => void;
    onProcessingChange?: (processing: boolean) => void;
  } = $props();

  let imageDataUrl = $state<string>('');
  let customPrompt = $state<string>('');
  let selectedModel = $state<string>('');
  let isProcessing = $state<boolean>(false);
  let errorMsg = $state<string>('');
  let isDragOver = $state<boolean>(false);
  let showAdvancedPrompt = $state<boolean>(false);

  let activeAbortController: AbortController | null = null;

  $effect(() => {
    if (isOpen) {
      const effective = store.getEffectiveOcrSettings(project);
      customPrompt = effective.customPrompt;
      selectedModel = effective.model;
      errorMsg = '';
    }
  });

  function close() {
    if (isProcessing && activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
      isProcessing = false;
      if (onProcessingChange) onProcessingChange(false);
    }
    isOpen = false;
  }

  function handleFileRead(file: File) {
    if (!file.type.startsWith('image/')) {
      errorMsg = t('ocr.errorInvalidImage');
      return;
    }
    errorMsg = '';
    const reader = new FileReader();
    reader.onload = (e) => {
      imageDataUrl = e.target?.result as string || '';
    };
    reader.readAsDataURL(file);
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFileRead(e.dataTransfer.files[0]);
    }
  }

  function handleFileInputChange(e: Event & { currentTarget: HTMLInputElement }) {
    if (e.currentTarget.files && e.currentTarget.files.length > 0) {
      handleFileRead(e.currentTarget.files[0]);
    }
  }

  async function handlePasteFromClipboard() {
    try {
      errorMsg = '';
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], 'clipboard-image.png', { type });
            handleFileRead(file);
            return;
          }
        }
      }
      errorMsg = t('ocr.errorNoClipboardImage');
    } catch (err: any) {
      errorMsg = err?.message || t('ocr.errorClipboardAccess');
    }
  }

  async function startOcrProcess() {
    if (!imageDataUrl) {
      errorMsg = t('ocr.errorNoImageSelected');
      return;
    }

    isProcessing = true;
    if (onProcessingChange) onProcessingChange(true);
    errorMsg = '';

    activeAbortController = new AbortController();

    try {
      const resultText = await runOcrImage({
        imageDataUrl,
        model: selectedModel,
        prompt: customPrompt,
        signal: activeAbortController.signal
      });

      onextract(resultText);
      store.showNotification(t('ocr.successNotify'), 'success');
      isOpen = false;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        errorMsg = err?.message || t('ocr.failedNotify');
      }
    } finally {
      isProcessing = false;
      if (onProcessingChange) onProcessingChange(false);
      activeAbortController = null;
    }
  }

  onDestroy(() => {
    if (activeAbortController) {
      activeAbortController.abort();
    }
  });
</script>

{#if isOpen}
  <!-- Modal Overlay -->
  <div 
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
    onclick={close}
    role="presentation"
  >
    <!-- Modal Dialog -->
    <div 
      class="bg-surface-container-high border border-outline-variant/40 rounded-2xl shadow-2xl max-w-lg w-full p-6 flex flex-col gap-5 text-on-surface relative overflow-hidden"
      onclick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-outline-variant/30 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="material-symbols-outlined text-primary text-[24px]">document_scanner</span>
          <div>
            <h3 class="font-bold text-base text-on-surface">{t('ocr.modalTitle')}</h3>
            {#if targetLabel}
              <p class="text-xs text-on-surface-variant">{t('ocr.targetLabelPrefix')}: <span class="font-semibold text-primary">{targetLabel}</span></p>
            {/if}
          </div>
        </div>
        <button
          type="button"
          onclick={close}
          class="w-8 h-8 rounded-full hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant transition-colors cursor-pointer"
        >
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <!-- Image Selection / Drag and Drop Area -->
      {#if imageDataUrl}
        <div class="relative rounded-xl overflow-hidden border border-outline-variant/40 max-h-56 bg-surface-container-low flex items-center justify-center p-2 group">
          <img src={imageDataUrl} alt="OCR Target" class="max-h-52 object-contain rounded-lg shadow-sm" />
          <button
            type="button"
            onclick={() => imageDataUrl = ''}
            class="absolute top-3 right-3 bg-error text-on-error p-1.5 rounded-full shadow-md hover:scale-105 transition-all cursor-pointer opacity-90 hover:opacity-100"
            title={t('common.remove')}
          >
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      {:else}
        <div
          role="region"
          aria-label="OCR Drop Zone"
          ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
          ondragleave={() => isDragOver = false}
          ondrop={handleFileDrop}
          class="border-2 border-dashed border-outline-variant rounded-xl p-6 bg-surface-container-low flex flex-col items-center justify-center gap-3 transition-all hover:border-primary/60 {isDragOver ? 'border-primary bg-primary/5 scale-[1.01]' : ''}"
        >
          <span class="material-symbols-outlined text-[36px] text-primary">add_a_photo</span>
          <div class="text-center">
            <p class="text-xs font-semibold text-on-surface">{t('ocr.dragDropPrompt')}</p>
            <p class="text-[11px] text-on-surface-variant mt-0.5">{t('ocr.supportedFormats')}</p>
          </div>
          
          <div class="flex items-center gap-2 mt-1">
            <label class="cursor-pointer bg-primary text-on-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all inline-flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">folder_open</span>
              {t('ocr.selectFileBtn')}
              <input type="file" accept="image/*" onchange={handleFileInputChange} class="hidden" />
            </label>
            <button
              type="button"
              onclick={handlePasteFromClipboard}
              class="bg-surface-container-highest hover:bg-surface-container-low text-on-surface border border-outline-variant/40 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span class="material-symbols-outlined text-[16px]">content_paste</span>
              {t('ocr.pasteClipboardBtn')}
            </button>
          </div>
        </div>
      {/if}

      <!-- Prompt Collapsible Option -->
      <div class="flex flex-col gap-2">
        <button
          type="button"
          onclick={() => showAdvancedPrompt = !showAdvancedPrompt}
          class="text-xs font-semibold text-on-surface-variant hover:text-primary flex items-center justify-between py-1 border-t border-outline-variant/20 cursor-pointer"
        >
          <span class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">tune</span>
            {t('ocr.promptAndModelSettings')}
          </span>
          <span class="material-symbols-outlined text-[16px] transition-transform {showAdvancedPrompt ? 'rotate-180' : ''}">expand_more</span>
        </button>

        {#if showAdvancedPrompt}
          <div class="flex flex-col gap-3 p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 animate-fade-in">
            <div class="flex flex-col gap-1">
              <label class="text-[11px] font-semibold text-on-surface" for="ocrModalPrompt">{t('settings.ocr.promptTitle')}</label>
              <textarea
                id="ocrModalPrompt"
                bind:value={customPrompt}
                rows={3}
                class="w-full bg-surface border border-outline-variant rounded-lg p-2 text-xs text-on-surface focus:outline-none focus:border-primary transition-all font-mono"
              ></textarea>
            </div>
          </div>
        {/if}
      </div>

      <!-- Error Message -->
      {#if errorMsg}
        <div class="bg-error-container/20 border border-error/30 text-error rounded-xl p-3 text-xs flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] shrink-0">error</span>
          <span>{errorMsg}</span>
        </div>
      {/if}

      <!-- Footer Buttons -->
      <div class="flex items-center justify-end gap-3 border-t border-outline-variant/30 pt-3">
        <button
          type="button"
          onclick={close}
          class="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container-highest transition-colors cursor-pointer"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onclick={startOcrProcess}
          disabled={!imageDataUrl || isProcessing}
          class="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all flex items-center gap-2 cursor-pointer"
        >
          {#if isProcessing}
            <span class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            <span>{t('ocr.processingText')}</span>
          {:else}
            <span class="material-symbols-outlined text-[16px]">auto_awesome</span>
            <span>{t('ocr.extractTextBtn')}</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
