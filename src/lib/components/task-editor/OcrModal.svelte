<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
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
    onstartOcr
  }: {
    isOpen: boolean;
    targetLabel?: string;
    project?: Project | null;
    onstartOcr: (options: { imageDataUrls: string[]; customPrompt: string; selectedModel: string }) => void;
  } = $props();

  let imageItems = $state<OcrImageItem[]>([]);
  let customPrompt = $state<string>('');
  let selectedModel = $state<string>('');
  let errorMsg = $state<string>('');
  let isDragOver = $state<boolean>(false);
  let showAdvancedPrompt = $state<boolean>(false);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (isOpen) {
      const effective = store.getEffectiveOcrSettings(project);
      customPrompt = effective.customPrompt;
      selectedModel = effective.model;
      errorMsg = '';
    }
  });

  function close() {
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

  function submitOcr() {
    if (imageItems.length === 0) {
      errorMsg = t('ocr.errorNoImageSelected');
      return;
    }

    onstartOcr({
      imageDataUrls: imageItems.map(item => item.dataUrl),
      customPrompt,
      selectedModel
    });

    imageItems = [];
    isOpen = false;
  }
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

      <!-- Instruction/Upload Dropzone Box (Exact match to Bild 3 and TaskEditor) -->
      <div class="flex flex-col gap-2">
        <input 
          bind:this={fileInputEl}
          type="file" 
          accept="image/*" 
          multiple
          onchange={handleFileInputChange} 
          class="hidden" 
        />
        <button
          type="button"
          onclick={() => fileInputEl?.click()}
          ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
          ondragleave={() => isDragOver = false}
          ondrop={handleFileDrop}
          class="w-full border-2 border-dashed border-outline-variant rounded-xl bg-surface-container-low p-6 flex flex-col items-center justify-center gap-2 hover:bg-surface-container hover:border-primary/50 transition-all group relative overflow-hidden focus:outline-none cursor-pointer {isDragOver ? 'border-primary bg-primary/5 scale-[1.01]' : ''}"
        >
          <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
            <span class="material-symbols-outlined text-[24px]">upload_file</span>
          </div>
          <div class="text-center">
            <p class="text-sm font-semibold text-on-surface">
              {imageItems.length > 0 
                ? (store.settings.language === 'Deutsch' ? `${imageItems.length} Bild(er) ausgewählt – Klicken zum Hinzufügen` : `${imageItems.length} image(s) selected – Click to add more`) 
                : (store.settings.language === 'Deutsch' ? 'Klicken zum Hochladen von OCR-Bildern' : 'Click to upload OCR images')}
            </p>
            <p class="text-xs text-on-surface-variant mt-1">{t('ocr.supportedFormats')}</p>
          </div>
        </button>

        <!-- Full-width Paste from Clipboard button (Exact match to Bild 3) -->
        <button
          type="button"
          onclick={handlePasteFromClipboard}
          class="w-full flex items-center justify-center gap-2 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all cursor-pointer focus:outline-none"
        >
          <span class="material-symbols-outlined text-[16px]">content_paste</span>
          {t('taskEditor.pasteClipboard')}
        </button>
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

          <div class="flex flex-col gap-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {#each imageItems as img, index (img.id)}
              <div class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm touch-none select-none">
                <div class="flex items-center gap-2 min-w-0 grow">
                  <span class="material-symbols-outlined text-[20px] text-outline select-none drag-handle">
                    drag_indicator
                  </span>
                  <img src={img.dataUrl} alt={img.name} class="w-8 h-8 object-cover rounded border border-outline-variant/40 shrink-0" />
                  <span class="text-xs text-on-surface truncate font-medium max-w-64" title={img.name}>{img.name}</span>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={index === 0}
                    onclick={() => moveImage(index, 'up')}
                    class="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary transition-colors cursor-pointer disabled:opacity-30"
                    title={store.settings.language === 'Deutsch' ? 'Nach oben verschieben' : 'Move up'}
                  >
                    <span class="material-symbols-outlined text-[18px]">keyboard_arrow_up</span>
                  </button>
                  <button
                    type="button"
                    disabled={index === imageItems.length - 1}
                    onclick={() => moveImage(index, 'down')}
                    class="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary transition-colors cursor-pointer disabled:opacity-30"
                    title={store.settings.language === 'Deutsch' ? 'Nach unten verschieben' : 'Move down'}
                  >
                    <span class="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
                  </button>
                  <button
                    type="button"
                    onclick={() => removeImage(img.id)}
                    class="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                    title={t('common.delete')}
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
          disabled={imageItems.length === 0}
          onclick={submitOcr}
          class="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[18px]">document_scanner</span>
          <span>{t('ocr.extractTextBtn')} ({imageItems.length})</span>
        </button>
      </div>
    </div>
  </div>
{/if}
