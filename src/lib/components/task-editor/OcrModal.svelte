<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import type { Project } from '../../state/types';
  import { getFileIcon } from '../../db/media';

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

  // File item editing & preview state
  let editingFileIndex = $state<number | null>(null);
  let editingFileNameValue = $state<string>('');
  let editingFileExtension = $state<string>('');
  let previewFile = $state<OcrImageItem | null>(null);

  // Pointer-based media drag state (EXACT 1:1 match to TaskEditor)
  let draggedFileIndex = $state<number | null>(null);
  let hoveredFileIndex = $state<number | null>(null);
  let isMediaDragActive = $state(false);
  let mediaDragGhostEl: HTMLElement | null = null;
  let mediaDragPointerStartX = 0;
  let mediaDragPointerStartY = 0;
  let mediaDragGhostOffsetX = 0;
  let mediaDragGhostOffsetY = 0;

  $effect(() => {
    if (isOpen) {
      const effective = store.getEffectiveOcrSettings(project);
      customPrompt = effective.customPrompt;
      selectedModel = effective.model;
      errorMsg = '';
      editingFileIndex = null;
      previewFile = null;
      isMediaDragActive = false;
      draggedFileIndex = null;
      hoveredFileIndex = null;
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

  function removeImage(index: number) {
    imageItems = imageItems.filter((_, i) => i !== index);
  }

  function splitFilename(filename: string): { base: string; ext: string } {
    if (!filename) return { base: '', ext: '' };
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return { base: filename, ext: '' };
    }
    return {
      base: filename.substring(0, lastDotIndex),
      ext: filename.substring(lastDotIndex)
    };
  }

  function startRenameFile(index: number) {
    editingFileIndex = index;
    const { base, ext } = splitFilename(imageItems[index]?.name || '');
    editingFileNameValue = base;
    editingFileExtension = ext;
  }

  function saveRenameFile(index: number) {
    const base = editingFileNameValue.trim();
    if (base) {
      imageItems[index].name = base + editingFileExtension;
    }
    editingFileIndex = null;
  }

  function openPreview(file: OcrImageItem) {
    previewFile = file;
  }

  // Pointer drag reordering (EXACT 1:1 match to TaskEditor)
  function handleFilePointerDown(e: PointerEvent, index: number) {
    if (e.button !== 0 && e.button !== -1) return;
    const target = e.currentTarget as HTMLElement;

    const targetEl = e.target as HTMLElement;
    if (targetEl.closest('.remove-file-btn') || 
        targetEl.closest('.rename-file-btn') || 
        targetEl.closest('button') || 
        targetEl.closest('input') || 
        (targetEl.closest('.preview-file-click') && !targetEl.closest('.drag-handle'))) return;

    mediaDragPointerStartX = e.clientX;
    mediaDragPointerStartY = e.clientY;

    try { target.setPointerCapture(e.pointerId); } catch (_) {}

    function onMove(me: PointerEvent) {
      const dx = me.clientX - mediaDragPointerStartX;
      const dy = me.clientY - mediaDragPointerStartY;

      if (!isMediaDragActive && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        isMediaDragActive = true;
        draggedFileIndex = index;

        const ghost = target.cloneNode(true) as HTMLElement;
        const rect = target.getBoundingClientRect();
        ghost.style.cssText = `
          position: fixed;
          pointer-events: none;
          z-index: 9999;
          width: ${rect.width}px;
          opacity: 0.85;
          left: ${rect.left}px;
          top: ${rect.top}px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          border-radius: 0.5rem;
          transform: scale(1.02);
          transition: none;
        `;
        mediaDragGhostOffsetX = me.clientX - rect.left;
        mediaDragGhostOffsetY = me.clientY - rect.top;
        document.body.appendChild(ghost);
        mediaDragGhostEl = ghost;
      }

      if (!isMediaDragActive) return;

      if (mediaDragGhostEl) {
        mediaDragGhostEl.style.left = `${me.clientX - mediaDragGhostOffsetX}px`;
        mediaDragGhostEl.style.top  = `${me.clientY - mediaDragGhostOffsetY}px`;
      }

      const elemUnder = document.elementFromPoint(me.clientX, me.clientY);
      const rowUnder = elemUnder?.closest('[data-file-index]') as HTMLElement;
      if (rowUnder) {
        const targetIdx = parseInt(rowUnder.dataset.fileIndex || '-1', 10);
        if (targetIdx >= 0) {
          hoveredFileIndex = targetIdx;
        }
      }
    }

    function onUp(ue: PointerEvent) {
      try { target.releasePointerCapture(ue.pointerId); } catch (_) {}
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);

      if (mediaDragGhostEl) {
        mediaDragGhostEl.remove();
        mediaDragGhostEl = null;
      }

      if (isMediaDragActive && draggedFileIndex !== null && hoveredFileIndex !== null && draggedFileIndex !== hoveredFileIndex) {
        const list = [...imageItems];
        const [moved] = list.splice(draggedFileIndex, 1);
        list.splice(hoveredFileIndex, 0, moved);
        imageItems = list;
      }

      isMediaDragActive = false;
      draggedFileIndex = null;
      hoveredFileIndex = null;
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
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

      <!-- Upload Dropzone (EXACT match to TaskEditor media upload) -->
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
              {imageItems.length > 0 ? t('taskEditor.filesSelected', { count: imageItems.length }) : t('taskEditor.uploadPrompt')}
            </p>
            <p class="text-xs text-on-surface-variant mt-1">{t('taskEditor.uploadSupportInfo')}</p>
          </div>
        </button>

        <!-- Paste from Clipboard button (EXACT match to TaskEditor) -->
        <button
          type="button"
          onclick={handlePasteFromClipboard}
          class="w-full flex items-center justify-center gap-2 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all cursor-pointer focus:outline-none"
        >
          <span class="material-symbols-outlined text-[16px]">content_paste</span>
          {t('taskEditor.pasteClipboard')}
        </button>

        <!-- Uploaded Files List (EXACT 1:1 match to TaskEditor file rows) -->
        {#if imageItems.length > 0}
          <div class="mt-2 flex flex-col gap-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {#each imageItems as file, index (file.id)}
              {#if isMediaDragActive && hoveredFileIndex === index}
                <div class="h-1 bg-primary rounded my-1 animate-pulse"></div>
              {/if}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div 
                data-file-index={index}
                onpointerdown={(e) => handleFilePointerDown(e, index)}
                class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm touch-none select-none {isMediaDragActive && draggedFileIndex === index ? 'opacity-40 scale-95' : ''}"
              >
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  onclick={() => {
                    if (editingFileIndex !== index) {
                      openPreview(file);
                    }
                  }}
                  class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow preview-file-click"
                  title={t('taskEditor.clickToPreview')}
                >
                  <span class="material-symbols-outlined text-[20px] text-outline cursor-grab active:cursor-grabbing hover:text-primary select-none drag-handle">
                    drag_indicator
                  </span>
                  <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                    {getFileIcon(file.name)}
                  </span>
                  {#if editingFileIndex === index}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="flex items-center gap-1 shrink grow min-w-0" onclick={(e) => e.stopPropagation()} onpointerdown={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        bind:value={editingFileNameValue}
                        onkeydown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') saveRenameFile(index);
                          else if (e.key === 'Escape') editingFileIndex = null;
                        }}
                        onblur={() => saveRenameFile(index)}
                        class="bg-surface border border-primary rounded px-2 py-0.5 text-xs text-on-surface focus:outline-none shrink grow min-w-0 font-medium"
                      />
                      {#if editingFileExtension}
                        <span class="text-xs text-on-surface-variant font-mono shrink-0 select-none">{editingFileExtension}</span>
                      {/if}
                    </div>
                  {:else}
                    <span class="text-xs text-on-surface hover:text-primary truncate font-medium max-w-72" title={file.name}>{file.name}</span>
                  {/if}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button 
                    type="button"
                    onclick={(e) => {
                      e.stopPropagation();
                      startRenameFile(index);
                    }}
                    onpointerdown={(e) => e.stopPropagation()}
                    class="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors rename-file-btn"
                    title={t('taskEditor.renameFileTooltip') || 'Rename File'}
                  >
                    edit
                  </button>
                  <button 
                    type="button"
                    onclick={() => removeImage(index)}
                    class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors shrink-0 remove-file-btn"
                    title={t('taskEditor.remove') || 'Remove'}
                  >
                    close
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

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

<!-- Preview Image Modal (Exact copy from TaskEditor preview) -->
{#if previewFile}
  <div 
    class="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 animate-fade-in"
    onclick={() => previewFile = null}
    role="presentation"
  >
    <div 
      class="bg-surface-container-high border border-outline-variant/40 rounded-2xl p-4 max-w-2xl max-h-[80vh] flex flex-col gap-3 relative overflow-hidden"
      onclick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div class="flex items-center justify-between border-b border-outline-variant/30 pb-2">
        <span class="text-sm font-bold text-on-surface truncate">{previewFile.name}</span>
        <button 
          type="button" 
          onclick={() => previewFile = null}
          class="w-7 h-7 rounded-full hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant cursor-pointer"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="flex items-center justify-center overflow-auto max-h-[65vh]">
        <img src={previewFile.dataUrl} alt={previewFile.name} class="max-w-full max-h-full object-contain rounded shadow-md" />
      </div>
    </div>
  </div>
{/if}
