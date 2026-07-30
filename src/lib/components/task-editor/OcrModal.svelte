<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import { runOcrImage } from '../../services/ai';
  import { onDestroy } from 'svelte';
  import type { Project } from '../../state/types';

  interface OcrImageItem {
    id: string;
    name: string;
    dataUrl: string;
  }

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

  let imageItems = $state<OcrImageItem[]>([]);
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

  function addImageFiles(files: FileList | File[]) {
    errorMsg = '';
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) {
      errorMsg = t('ocr.errorInvalidImage');
      return;
    }

    for (const file of fileArray) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          imageItems = [
            ...imageItems,
            {
              id: Math.random().toString(36).substring(2, 9),
              name: file.name || `Image ${imageItems.length + 1}`,
              dataUrl
            }
          ];
        }
      };
      reader.readAsDataURL(file);
    }
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      addImageFiles(e.dataTransfer.files);
    }
  }

  function handleFileInputChange(e: Event & { currentTarget: HTMLInputElement }) {
    if (e.currentTarget.files && e.currentTarget.files.length > 0) {
      addImageFiles(e.currentTarget.files);
    }
  }

  async function handlePasteFromClipboard() {
    try {
      errorMsg = '';
      const items = await navigator.clipboard.read();
      let foundImage = false;
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], `clipboard-image-${imageItems.length + 1}.png`, { type });
            addImageFiles([file]);
            foundImage = true;
          }
        }
      }
      if (!foundImage) {
        errorMsg = t('ocr.errorNoClipboardImage');
      }
    } catch (err: any) {
      errorMsg = err?.message || t('ocr.errorClipboardAccess');
    }
  }

  function removeImage(id: string) {
    imageItems = imageItems.filter(img => img.id !== id);
  }

  function moveImage(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index > 0) {
      const updated = [...imageItems];
      const temp = updated[index];
      updated[index] = updated[index - 1];
      updated[index - 1] = temp;
      imageItems = updated;
    } else if (direction === 'down' && index < imageItems.length - 1) {
      const updated = [...imageItems];
      const temp = updated[index];
      updated[index] = updated[index + 1];
      updated[index + 1] = temp;
      imageItems = updated;
    }
  }

  function clearAllImages() {
    imageItems = [];
  }

  async function startOcrProcess() {
    if (imageItems.length === 0) {
      errorMsg = t('ocr.errorNoImageSelected');
      return;
    }

    isProcessing = true;
    if (onProcessingChange) onProcessingChange(true);
    errorMsg = '';

    activeAbortController = new AbortController();

    try {
      const effective = store.getEffectiveOcrSettings(project);
      const resultText = await runOcrImage({
        imageDataUrls: imageItems.map(item => item.dataUrl),
        model: selectedModel,
        prompt: customPrompt,
        maxOutputTokens: effective.maxOutputTokens,
        signal: activeAbortController.signal
      });

      onextract(resultText);
      store.showNotification(t('ocr.successNotify'), 'success');
      imageItems = [];
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
      class="bg-surface-container-high border border-outline-variant/40 rounded-2xl shadow-2xl max-w-xl w-full p-6 flex flex-col gap-5 text-on-surface relative overflow-hidden"
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

      <!-- Drag & Drop Upload Zone -->
      <div
        role="region"
        aria-label="OCR Drop Zone"
        ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
        ondragleave={() => isDragOver = false}
        ondrop={handleFileDrop}
        class="border-2 border-dashed border-outline-variant rounded-xl p-4 bg-surface-container-low flex flex-col items-center justify-center gap-2 transition-all hover:border-primary/60 {isDragOver ? 'border-primary bg-primary/5 scale-[1.01]' : ''}"
      >
        <span class="material-symbols-outlined text-[32px] text-primary">add_a_photo</span>
        <div class="text-center">
          <p class="text-xs font-semibold text-on-surface">{t('ocr.dragDropPrompt')}</p>
          <p class="text-[11px] text-on-surface-variant mt-0.5">{t('ocr.supportedFormats')}</p>
        </div>
        
        <div class="flex items-center gap-2 mt-1">
          <label class="cursor-pointer bg-primary text-on-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all inline-flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">folder_open</span>
            {t('ocr.selectFileBtn')}
            <input type="file" accept="image/*" multiple onchange={handleFileInputChange} class="hidden" />
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

      <!-- Selected Images List & Reordering -->
      {#if imageItems.length > 0}
        <div class="flex flex-col gap-2 bg-surface-container-low/50 p-3 rounded-xl border border-outline-variant/30">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-on-surface flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px] text-primary">collections</span>
              {store.settings.language === 'Deutsch' ? `Ausgewählte Bilder (${imageItems.length})` : `Selected Images (${imageItems.length})`}
            </span>
            <button
              type="button"
              onclick={clearAllImages}
              class="text-[11px] text-error hover:underline cursor-pointer font-medium"
            >
              {store.settings.language === 'Deutsch' ? 'Alle entfernen' : 'Clear all'}
            </button>
          </div>

          <div class="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {#each imageItems as img, index (img.id)}
              <div class="flex items-center justify-between bg-surface-container-high p-2 rounded-lg border border-outline-variant/40 gap-3 shadow-xs">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="text-[11px] font-bold font-mono text-on-surface-variant w-4 text-center">{index + 1}.</span>
                  <img src={img.dataUrl} alt={img.name} class="w-10 h-10 object-cover rounded-md border border-outline-variant/30 shrink-0" />
                  <span class="text-xs font-medium text-on-surface truncate max-w-48" title={img.name}>{img.name}</span>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={index === 0}
                    onclick={() => moveImage(index, 'up')}
                    class="p-1 text-on-surface-variant hover:text-primary disabled:opacity-30 rounded hover:bg-surface-container-highest cursor-pointer"
                    title={store.settings.language === 'Deutsch' ? 'Nach oben verschieben' : 'Move up'}
                  >
                    <span class="material-symbols-outlined text-[18px]">keyboard_arrow_up</span>
                  </button>
                  <button
                    type="button"
                    disabled={index === imageItems.length - 1}
                    onclick={() => moveImage(index, 'down')}
                    class="p-1 text-on-surface-variant hover:text-primary disabled:opacity-30 rounded hover:bg-surface-container-highest cursor-pointer"
                    title={store.settings.language === 'Deutsch' ? 'Nach unten verschieben' : 'Move down'}
                  >
                    <span class="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
                  </button>
                  <button
                    type="button"
                    onclick={() => removeImage(img.id)}
                    class="p-1 text-error/80 hover:text-error rounded hover:bg-error/10 cursor-pointer ml-1"
                    title={t('common.remove')}
                  >
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            {/each}
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

      <!-- Actions -->
      <div class="flex items-center justify-end gap-3 border-t border-outline-variant/30 pt-4">
        <button
          type="button"
          onclick={close}
          class="px-4 py-2 rounded-xl text-xs font-semibold border border-outline-variant/60 text-on-surface hover:bg-surface-container-low transition-all cursor-pointer"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={imageItems.length === 0 || isProcessing}
          onclick={startOcrProcess}
          class="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
        >
          {#if isProcessing}
            <span class="w-3.5 h-3.5 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin"></span>
            <span>{t('ocr.processing')}</span>
          {:else}
            <span class="material-symbols-outlined text-[18px]">document_scanner</span>
            <span>{t('ocr.extractTextBtn')} ({imageItems.length})</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
