<script lang="ts">
  import { t } from '../../services/i18n';
  import { getMediaDataUrl } from '../../db/media';
  import AudioPlayer from './AudioPlayer.svelte';

  function isAudioFile(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'].includes(ext);
  }

  let {
    splitWidth = $bindable(400),
    activeLeftPanels,
    feedbackScore,
    isChecking,
    feedbackText,
    parseMarkdown,
    handleCritiqueClick,
    task,
    textFontSize = 13
  } = $props();

  let isDraggingSplitter = $state(false);
  let startX = 0;
  let startWidth = 0;

  let expandedMediaIds = $state<Record<string, boolean>>({});

  // Cache loaded media URLs with loading state
  let loadedMedia = $state<Record<string, { url: string; loading: boolean; error: boolean }>>({});

  // Inline image zoom/pan state (keyed by mediaId)
  let inlineStates = $state<Record<string, { zoom: number; panX: number; panY: number; isDragging: boolean; dragStartX: number; dragStartY: number; panBaseX: number; panBaseY: number; dragged: boolean }>>({});

  function getInlineState(mediaId: string) {
    if (!inlineStates[mediaId]) {
      inlineStates[mediaId] = { zoom: 1, panX: 0, panY: 0, isDragging: false, dragStartX: 0, dragStartY: 0, panBaseX: 0, panBaseY: 0, dragged: false };
    }
    return inlineStates[mediaId];
  }

  function handleInlineWheel(e: WheelEvent) {
    const img = e.currentTarget as HTMLElement;
    const mediaId = img.dataset.mediaId;
    if (!mediaId) return;
    e.preventDefault();
    const state = getInlineState(mediaId);
    const zoomFactor = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(0.5, Math.min(4, state.zoom + direction * zoomFactor));
    if (newZoom === 1) {
      state.panX = 0;
      state.panY = 0;
    }
    state.zoom = newZoom;
  }

  function handleInlinePointerDown(e: PointerEvent) {
    const img = e.currentTarget as HTMLElement;
    const mediaId = img.dataset.mediaId;
    if (!mediaId) return;
    const state = getInlineState(mediaId);
    state.isDragging = true;
    state.dragged = false;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.panBaseX = state.panX;
    state.panBaseY = state.panY;
    try { img.setPointerCapture(e.pointerId); } catch (_) {}
  }

  function handleInlinePointerMove(e: PointerEvent) {
    const img = e.currentTarget as HTMLElement;
    const mediaId = img.dataset.mediaId;
    if (!mediaId) return;
    const state = getInlineState(mediaId);
    if (!state.isDragging) return;
    const dx = e.clientX - state.dragStartX;
    const dy = e.clientY - state.dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      state.dragged = true;
    }
    const rect = img.getBoundingClientRect();
    const containerW = rect.width * state.zoom;
    const clampDX = Math.max(-containerW / 3, Math.min(containerW / 3, dx));
    const clampDY = Math.max(-rect.height * state.zoom / 3, Math.min(rect.height * state.zoom / 3, dy));
    state.panX = state.panBaseX + clampDX;
    state.panY = state.panBaseY + clampDY;
  }

  function handleInlinePointerUp(e: PointerEvent) {
    const img = e.currentTarget as HTMLElement;
    const mediaId = img.dataset.mediaId;
    if (!mediaId) return;
    const state = inlineStates[mediaId];
    if (!state) return;
    state.isDragging = false;
    try { img.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  function handleInlineClick(e: MouseEvent, file: { name: string; dataUrl?: string; mediaId?: string }, mediaId: string) {
    const state = inlineStates[mediaId];
    if (!state || !state.dragged) {
      openPreview(file);
    }
  }

  async function getMediaUrl(file: { name: string; dataUrl?: string; mediaId?: string }): Promise<string> {
    if (file.dataUrl) return file.dataUrl;
    if (file.mediaId) {
      const key = file.mediaId;
      if (loadedMedia[key]?.url) return loadedMedia[key].url;
      if (loadedMedia[key]?.error) return '';
      if (!loadedMedia[key]) {
        loadedMedia[key] = { url: '', loading: true, error: false };
        try {
          const url = await getMediaDataUrl(key);
          loadedMedia[key] = { url, loading: false, error: false };
          return url;
        } catch (_) {
          loadedMedia[key] = { url: '', loading: false, error: true };
        }
      }
    }
    return '';
  }

  function resolveMediaUrl(file: { name: string; dataUrl?: string; mediaId?: string }): string {
    if (file.dataUrl) return file.dataUrl;
    if (file.mediaId && loadedMedia[file.mediaId]?.url) return loadedMedia[file.mediaId].url;
    return '';
  }

  function isMediaLoading(file: { name: string; dataUrl?: string; mediaId?: string }): boolean {
    if (file.dataUrl) return false;
    if (file.mediaId && loadedMedia[file.mediaId]?.loading) return true;
    return false;
  }

  function isMediaError(file: { name: string; dataUrl?: string; mediaId?: string }): boolean {
    if (file.dataUrl) return false;
    if (file.mediaId && loadedMedia[file.mediaId]?.error) return true;
    return false;
  }

  // Pre-load all media files on task change
  $effect(() => {
    const filesToLoad: Array<{ name: string; dataUrl?: string; mediaId?: string }> = [];
    if (task?.instructionFiles) {
      filesToLoad.push(...task.instructionFiles.filter(f => f.mediaId && !f.dataUrl));
    }
    if (task?.solutionFiles) {
      filesToLoad.push(...task.solutionFiles.filter(f => f.mediaId && !f.dataUrl));
    }
    for (const file of filesToLoad) {
      if (file.mediaId && !loadedMedia[file.mediaId]) {
        loadedMedia[file.mediaId] = { url: '', loading: true, error: false };
        getMediaDataUrl(file.mediaId).then(url => {
          loadedMedia[file.mediaId!] = { url, loading: false, error: false };
        }).catch(() => {
          loadedMedia[file.mediaId!] = { url: '', loading: false, error: true };
        });
      }
    }
  });

  let loadedPreviewUrl = $state('');

  async function loadPreviewUrl(file: { name: string; dataUrl?: string; mediaId?: string }): Promise<string> {
    const url = await getMediaUrl(file);
    loadedPreviewUrl = url;
    return url;
  }

  function toggleMedia(mediaId: string) {
    expandedMediaIds[mediaId] = !expandedMediaIds[mediaId];
  }

  function isMediaExpanded(mediaId: string, defaultOpen: boolean) {
    if (expandedMediaIds[mediaId] !== undefined) {
      return expandedMediaIds[mediaId];
    }
    return defaultOpen;
  }

  let previewFile = $state<{ name: string; dataUrl: string } | null>(null);
  let modalZoom = $state(1);
  let modalPan = $state({ x: 0, y: 0 });
  let isModalDragging = $state(false);
  let modalDragStart = { x: 0, y: 0 };
  let modalBasePan = { x: 0, y: 0 };
  let modalPinchInitialDistance = 0;
  let modalPinchInitialZoom = 1;
  let modalPinchMidpoint = { x: 0, y: 0 };
  let modalPinchPanOffset = { x: 0, y: 0 };
  let isModalPinching = false;
  let touchPanStart = { x: 0, y: 0 };
  let touchPanBaseOffset = { x: 0, y: 0 };
  let isTouchPanning = false;

  function decodeBase64Text(dataUrl: string): string {
    if (!dataUrl) return '';
    try {
      const base64Data = dataUrl.split(',')[1];
      return decodeURIComponent(escape(atob(base64Data)));
    } catch (e) {
      console.error('Failed to decode text document', e);
      return 'Error: Failed to decode text document.';
    }
  }

  async function openPreview(file: { name: string; dataUrl?: string; mediaId?: string }) {
    const url = await getMediaUrl(file);
    previewFile = { name: file.name, dataUrl: url };
    modalZoom = 1;
    modalPan = { x: 0, y: 0 };
  }

  function closePreview() {
    previewFile = null;
  }

  function handleModalWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = modalZoom + direction * zoomFactor;
    modalZoom = Math.max(0.5, Math.min(newZoom, 8)); // clamp between 0.5x and 8x
    if (modalZoom === 1) {
      modalPan = { x: 0, y: 0 };
    }
  }

  function handleModalMouseDown(e: MouseEvent) {
    if (modalZoom <= 1) return; // Only pan when zoomed in
    isModalDragging = true;
    modalDragStart = { x: e.clientX, y: e.clientY };
    modalBasePan = { ...modalPan };
  }

  function handleModalMouseMove(e: MouseEvent) {
    if (!isModalDragging) return;
    const dx = e.clientX - modalDragStart.x;
    const dy = e.clientY - modalDragStart.y;
    modalPan = {
      x: modalBasePan.x + dx,
      y: modalBasePan.y + dy
    };
  }

  function handleModalMouseUp() {
    isModalDragging = false;
  }

  function handleModalTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && modalZoom > 1) {
      const t = e.touches[0];
      touchPanStart = { x: t.clientX, y: t.clientY };
      touchPanBaseOffset = { ...modalPan };
      isTouchPanning = true;
    } else if (e.touches.length >= 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      modalPinchInitialDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      modalPinchInitialZoom = modalZoom;
      modalPinchMidpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
      modalPinchPanOffset = { ...modalPan };
      isModalPinching = true;
    }
  }

  function handleModalTouchMove(e: TouchEvent) {
    if (isModalPinching && e.touches.length >= 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const currentMidpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };

      if (modalPinchInitialDistance > 0) {
        const factor = currentDistance / modalPinchInitialDistance;
        const newZoom = Math.max(0.5, Math.min(8, modalPinchInitialZoom * factor));

        const body = document.querySelector('.info-modal-preview-body') as HTMLElement | null;
        if (body) {
          const rect = body.getBoundingClientRect();
          const worldX = (modalPinchMidpoint.x - rect.left - modalPinchPanOffset.x) / modalPinchInitialZoom;
          const worldY = (modalPinchMidpoint.y - rect.top - modalPinchPanOffset.y) / modalPinchInitialZoom;
          const newPanX = (currentMidpoint.x - rect.left) - worldX * newZoom;
          const newPanY = (currentMidpoint.y - rect.top) - worldY * newZoom;

          modalZoom = newZoom;
          modalPan = { x: newPanX, y: newPanY };
          if (newZoom === 1) {
            modalPan = { x: 0, y: 0 };
          }
        }
      }
      e.preventDefault();
    } else if (e.touches.length === 1 && modalZoom > 1 && isTouchPanning) {
      const t = e.touches[0];
      modalPan = {
        x: touchPanBaseOffset.x + (t.clientX - touchPanStart.x),
        y: touchPanBaseOffset.y + (t.clientY - touchPanStart.y)
      };
      e.preventDefault();
    }
  }

  function handleModalTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) {
      isModalPinching = false;
      isTouchPanning = false;
      touchPanStart = { x: 0, y: 0 };
    } else if (e.touches.length >= 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      modalPinchInitialDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      modalPinchInitialZoom = modalZoom;
      modalPinchMidpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
      modalPinchPanOffset = { ...modalPan };
      isTouchPanning = false;
    } else if (e.touches.length === 1 && modalZoom > 1) {
      const t = e.touches[0];
      touchPanStart = { x: t.clientX, y: t.clientY };
      touchPanBaseOffset = { ...modalPan };
      isTouchPanning = true;
    }
  }

  function handleModalTouchCancel() {
    isModalPinching = false;
    isTouchPanning = false;
    touchPanStart = { x: 0, y: 0 };
  }
  let isTaskTextEmpty = $derived(!task.instructions || !task.instructions.trim());

  let isSolutionTextEmpty = $derived(!task.solution || !task.solution.trim());

  let splitDragPointerId = -1;

  function startSplitDrag(e: PointerEvent) {
    isDraggingSplitter = true;
    splitDragPointerId = e.pointerId;
    startX = e.clientX;
    startWidth = splitWidth;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function handleSplitDrag(e: PointerEvent) {
    if (!isDraggingSplitter) return;
    const deltaX = e.clientX - startX;
    const newWidth = startWidth + deltaX;
    if (newWidth >= 180 && newWidth <= 800) {
      splitWidth = newWidth;
    }
  }

  function stopSplitDrag(e: PointerEvent) {
    if (!isDraggingSplitter) return;
    isDraggingSplitter = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(splitDragPointerId);
    } catch (_) {}
    splitDragPointerId = -1;
  }
</script>

{#if activeLeftPanels.length > 0}
  <section 
    class="bg-surface-container-low border-r border-outline-variant flex flex-col overflow-hidden h-full shrink-0"
    style="width: {splitWidth}px;"
  >
    {#each activeLeftPanels as panel, idx}
      {#if idx > 0}
        <div class="h-px w-full bg-outline-variant/30"></div>
      {/if}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div 
        onclick={panel.isFeedback ? handleCritiqueClick : null}
        class="flex-1 flex flex-col overflow-y-auto p-6 hide-scrollbar {panel.id === 'solution' ? 'bg-surface-container-low/20' : panel.id === 'feedback' ? 'bg-primary/5' : ''}"
      >
        <div class="flex items-center justify-between mb-3 pb-1 border-b border-outline-variant/30">
          <h2 class="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5 font-sans select-none">
            {#if panel.id === 'task'}
              <span class="material-symbols-outlined text-base text-primary">menu_book</span>
            {:else if panel.id === 'solution'}
              <span class="material-symbols-outlined text-base text-primary">visibility</span>
            {:else}
              <span class="material-symbols-outlined text-base text-primary">neurology</span>
            {/if}
            {panel.title}
          </h2>
          {#if panel.id === 'feedback' && feedbackScore !== null}
            <div class="bg-primary text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm select-none">
              {t('practice.infoPanels.score')} {feedbackScore}
            </div>
          {/if}
        </div>
        
        {#if panel.isFeedback}
          {#if isChecking}
            <div class="flex flex-col items-center justify-center py-8 gap-3 my-auto select-none">
              <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p class="text-xs text-on-surface-variant text-center">{feedbackText}</p>
            </div>
          {:else}
            <div class="text-xs text-on-surface-variant leading-relaxed prose prose-sm dark:prose-invert select-text">
              {@html parseMarkdown(feedbackText)}
            </div>
          {/if}
        {:else}
          <div class="text-xs text-on-surface-variant leading-relaxed prose prose-sm dark:prose-invert select-text" style="font-size: {textFontSize}px;">
            {#if panel.content && panel.content.trim()}
              {@html parseMarkdown(panel.content)}
            {:else}
              {#if panel.id === 'task' && (!task.instructionFiles || task.instructionFiles.length === 0)}
                <p class="italic opacity-60">{t('practice.noInstructions')}</p>
              {:else if panel.id === 'solution' && (!task.solutionFiles || task.solutionFiles.length === 0)}
                <p class="italic opacity-60">{t('practice.noSolution')}</p>
              {/if}
            {/if}
          </div>

          {#if panel.id === 'task'}
            <!-- Instruction Media Files -->
            {#if task.instructionFiles && task.instructionFiles.length > 0}
              <div class="mt-5 border-t border-outline-variant/30 pt-4">
                <h3 class="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 select-none font-sans">{t('practice.infoPanels.taskMedia')}</h3>
                <div class="flex flex-col gap-3">
                  {#each task.instructionFiles as file, idx}
                    {@const mediaId = `task-inst-${idx}`}
                    {@const open = isMediaExpanded(mediaId, isTaskTextEmpty)}
                    <div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col transition-all">
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div 
                        onclick={() => toggleMedia(mediaId)}
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-container-high transition-colors font-sans text-xs font-semibold text-on-surface cursor-pointer select-none text-left"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="material-symbols-outlined text-[18px] text-primary shrink-0">
                            {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') ? 'description' : (isAudioFile(file.name) ? 'audio_file' : 'image'))}
                          </span>
                          <span class="truncate pr-4">{file.name}</span>
                        </div>
                        <div class="flex items-center shrink-0">
                          {#if !isAudioFile(file.name)}
                          <button
                            type="button"
                            onclick={(e) => {
                              e.stopPropagation();
                              openPreview(file);
                            }}
                            class="material-symbols-outlined text-[18px] text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors mr-1.5"
                            title={t('practice.infoPanels.openFullScreen')}
                          >
                            zoom_in
                          </button>
                          {/if}
                          <span class="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform shrink-0" style="transform: rotate({open ? '180deg' : '0deg'});">
                            keyboard_arrow_down
                          </span>
                        </div>
                      </div>

                      {#if open}
                        {@const fileUrl = resolveMediaUrl(file)}
                        {@const loading = isMediaLoading(file)}
                        {@const error = isMediaError(file)}
                        <div class="border-t border-outline-variant bg-surface-container-lowest p-2 flex justify-center items-center overflow-x-auto min-h-20">
                          {#if loading}
                            <div class="flex items-center justify-center py-4 gap-2 text-on-surface-variant text-[10px]">
                              <div class="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                              {t('taskEditor.audio.loading')}
                            </div>
                          {:else if error}
                            <span class="text-[10px] text-error italic">{t('practice.infoPanels.mediaError')}</span>
                          {:else if file.name.toLowerCase().endsWith('.pdf')}
                            <iframe 
                              src={fileUrl} 
                              title={file.name} 
                              class="w-full h-100 border-0 rounded-lg"
                            ></iframe>
                          {:else if file.name.toLowerCase().endsWith('.md')}
                            <div class="w-full p-4 overflow-auto bg-surface-container-high rounded-lg text-xs text-on-surface select-text max-h-96 text-left border border-outline-variant/30 leading-relaxed wrap-break-word font-sans">
                              {@html parseMarkdown(decodeBase64Text(fileUrl))}
                            </div>
                          {:else if file.name.toLowerCase().endsWith('.txt')}
                            <pre class="w-full p-4 overflow-auto bg-surface-container-high rounded-lg text-xs font-mono text-on-surface whitespace-pre-wrap select-text max-h-96 text-left border border-outline-variant/30 leading-relaxed">{decodeBase64Text(fileUrl)}</pre>
                          {:else if isAudioFile(file.name)}
                            {#if fileUrl}
                              <AudioPlayer dataUrl={fileUrl} compact={true} />
                            {/if}
                          {:else}
                            {@const inlineImgState = inlineStates[mediaId]}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <img 
                              src={fileUrl} 
                              alt={file.name} 
                              data-media-id={mediaId}
                              onclick={(e) => handleInlineClick(e, file, mediaId)}
                              onwheel={handleInlineWheel}
                              onpointerdown={handleInlinePointerDown}
                              onpointermove={handleInlinePointerMove}
                              onpointerup={handleInlinePointerUp}
                              class="max-w-full max-h-125 object-contain rounded-lg shadow-sm hover:opacity-95 transition-opacity select-none"
                              style="transform: translate({inlineImgState?.panX ?? 0}px, {inlineImgState?.panY ?? 0}px) scale({inlineImgState?.zoom ?? 1}); transform-origin: center center; cursor: {(inlineImgState?.zoom ?? 1) > 1 ? ((inlineImgState?.isDragging) ? 'grabbing' : 'grab') : 'zoom-in'}; touch-action: none;"
                              draggable="false"
                            />
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}

          {#if panel.id === 'solution'}
            <!-- Solution Media Files inside Solution Panel -->
            {#if task.solutionFiles && task.solutionFiles.length > 0}
              <div class="mt-5 border-t border-outline-variant/30 pt-4">
                <h3 class="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 select-none font-sans">{t('practice.infoPanels.solutionMedia')}</h3>
                <div class="flex flex-col gap-3">
                  {#each task.solutionFiles as file, idx}
                    {@const mediaId = `sol-sol-${idx}`}
                    {@const open = isMediaExpanded(mediaId, isSolutionTextEmpty)}
                    <div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col transition-all">
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div 
                        onclick={() => toggleMedia(mediaId)}
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-container-high transition-colors font-sans text-xs font-semibold text-on-surface cursor-pointer select-none text-left"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="material-symbols-outlined text-[18px] text-primary shrink-0">
                            {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') ? 'description' : (isAudioFile(file.name) ? 'audio_file' : 'image'))}
                          </span>
                          <span class="truncate pr-4">{file.name}</span>
                        </div>
                        <div class="flex items-center shrink-0">
                          {#if !isAudioFile(file.name)}
                          <button
                            type="button"
                            onclick={(e) => {
                              e.stopPropagation();
                              openPreview(file);
                            }}
                            class="material-symbols-outlined text-[18px] text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors mr-1.5"
                            title={t('practice.infoPanels.openFullScreen')}
                          >
                            zoom_in
                          </button>
                          {/if}
                          <span class="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform shrink-0" style="transform: rotate({open ? '180deg' : '0deg'});">
                            keyboard_arrow_down
                          </span>
                        </div>
                      </div>

                      {#if open}
                        {@const fileUrl = resolveMediaUrl(file)}
                        {@const loading = isMediaLoading(file)}
                        {@const error = isMediaError(file)}
                        <div class="border-t border-outline-variant bg-surface-container-lowest p-2 flex justify-center items-center overflow-x-auto min-h-20">
                          {#if loading}
                            <div class="flex items-center justify-center py-4 gap-2 text-on-surface-variant text-[10px]">
                              <div class="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                              {t('taskEditor.audio.loading')}
                            </div>
                          {:else if error}
                            <span class="text-[10px] text-error italic">{t('practice.infoPanels.mediaError')}</span>
                          {:else if file.name.toLowerCase().endsWith('.pdf')}
                            <iframe 
                              src={fileUrl} 
                              title={file.name} 
                              class="w-full h-100 border-0 rounded-lg"
                            ></iframe>
                          {:else if file.name.toLowerCase().endsWith('.md')}
                            <div class="w-full p-4 overflow-auto bg-surface-container-high rounded-lg text-xs text-on-surface select-text max-h-96 text-left border border-outline-variant/30 leading-relaxed wrap-break-word font-sans">
                              {@html parseMarkdown(decodeBase64Text(fileUrl))}
                            </div>
                          {:else if file.name.toLowerCase().endsWith('.txt')}
                            <pre class="w-full p-4 overflow-auto bg-surface-container-high rounded-lg text-xs font-mono text-on-surface whitespace-pre-wrap select-text max-h-96 text-left border border-outline-variant/30 leading-relaxed">{decodeBase64Text(fileUrl)}</pre>
                          {:else if isAudioFile(file.name)}
                            {#if fileUrl}
                              <AudioPlayer dataUrl={fileUrl} compact={true} />
                            {/if}
                          {:else}
                            {@const inlineImgState = inlineStates[mediaId]}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <img 
                              src={fileUrl} 
                              alt={file.name} 
                              data-media-id={mediaId}
                              onclick={(e) => handleInlineClick(e, file, mediaId)}
                              onwheel={handleInlineWheel}
                              onpointerdown={handleInlinePointerDown}
                              onpointermove={handleInlinePointerMove}
                              onpointerup={handleInlinePointerUp}
                              class="max-w-full max-h-125 object-contain rounded-lg shadow-sm hover:opacity-95 transition-opacity select-none"
                              style="transform: translate({inlineImgState?.panX ?? 0}px, {inlineImgState?.panY ?? 0}px) scale({inlineImgState?.zoom ?? 1}); transform-origin: center center; cursor: {(inlineImgState?.zoom ?? 1) > 1 ? ((inlineImgState?.isDragging) ? 'grabbing' : 'grab') : 'zoom-in'}; touch-action: none;"
                              draggable="false"
                            />
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        {/if}
      </div>
    {/each}
  </section>

  <!-- Draggable Split Separator -->
  <div 
    role="separator"
    aria-valuenow={splitWidth}
    class="w-1.5 hover:w-2 bg-outline-variant/60 hover:bg-primary cursor-col-resize select-none h-full z-20 transition-all active:bg-primary shrink-0"
    style="touch-action: none;"
    onpointerdown={startSplitDrag}
    onpointermove={handleSplitDrag}
    onpointerup={stopSplitDrag}
    onpointercancel={stopSplitDrag}
  ></div>
{/if}

<!-- Full-screen Media Preview Modal -->
{#if previewFile}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    onclick={closePreview}
    class="fixed inset-0 z-100 flex flex-col justify-center items-center bg-black/85 backdrop-blur-sm p-8"
  >
    <div 
      onclick={(e) => e.stopPropagation()}
      class="relative w-full h-full max-w-6xl max-h-[90vh] bg-surface rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-outline-variant"
    >
      <!-- Modal Header -->
      <header class="flex items-center justify-between px-6 py-4 border-b border-outline-variant select-none shrink-0 bg-surface">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0">
            {isAudioFile(previewFile.name) ? 'audio_file' : (previewFile.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : (previewFile.name.toLowerCase().endsWith('.txt') || previewFile.name.toLowerCase().endsWith('.md') ? 'description' : 'image'))}
          </span>
          <h2 class="font-bold text-sm text-on-surface truncate pr-6">{previewFile.name}</h2>
        </div>
        <button 
          type="button" 
          onclick={closePreview}
          class="material-symbols-outlined text-[20px] text-on-surface-variant hover:bg-surface-container-high p-2 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors"
        >
          close
        </button>
      </header>

      <!-- Modal Body (Max size view with Zoom / Pan support for images) -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div 
        onwheel={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) ? handleModalWheel : null}
        onmousedown={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) ? handleModalMouseDown : null}
        onmousemove={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) ? handleModalMouseMove : null}
        onmouseup={handleModalMouseUp}
        onmouseleave={handleModalMouseUp}
        ontouchstart={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) ? handleModalTouchStart : null}
        ontouchmove={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) ? handleModalTouchMove : null}
        ontouchend={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) ? handleModalTouchEnd : null}
        ontouchcancel={handleModalTouchCancel}
        class="info-modal-preview-body grow bg-surface-container-lowest p-6 flex justify-center items-center min-h-0 select-text {previewFile.name.toLowerCase().endsWith('.pdf') || previewFile.name.toLowerCase().endsWith('.txt') || previewFile.name.toLowerCase().endsWith('.md') || isAudioFile(previewFile.name) ? 'overflow-auto' : 'overflow-hidden relative'}"
        style={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) ? `cursor: ${modalZoom > 1 ? (isModalDragging ? 'grabbing' : 'grab') : 'zoom-in'}; touch-action: none;` : ''}
      >
        {#if isAudioFile(previewFile.name)}
          <div class="w-full max-w-md">
            <AudioPlayer dataUrl={previewFile.dataUrl} />
          </div>
        {:else if previewFile.name.toLowerCase().endsWith('.pdf')}
          <iframe 
            src={previewFile.dataUrl} 
            title={previewFile.name} 
            class="w-full h-full border-0 rounded-lg shadow-sm"
          ></iframe>
        {:else if previewFile.name.toLowerCase().endsWith('.md')}
          <div class="w-full h-full p-6 overflow-auto bg-surface-container-high rounded-xl text-sm text-on-surface select-text leading-relaxed border border-outline-variant text-left wrap-break-word font-sans">
            {@html parseMarkdown(decodeBase64Text(previewFile.dataUrl))}
          </div>
        {:else if previewFile.name.toLowerCase().endsWith('.txt')}
          <pre class="w-full h-full p-6 overflow-auto bg-surface-container-high rounded-xl text-sm font-mono text-on-surface whitespace-pre-wrap select-text leading-relaxed border border-outline-variant">{decodeBase64Text(previewFile.dataUrl)}</pre>
        {:else}
          <img 
            src={previewFile.dataUrl} 
            alt={previewFile.name} 
            class="max-w-full max-h-full object-contain rounded-lg shadow-md select-none pointer-events-none transition-transform duration-75 ease-out"
            style="transform: translate({modalPan.x}px, {modalPan.y}px) scale({modalZoom}); transform-origin: center center;"
            draggable="false"
          />
        {/if}
      </div>
    </div>
  </div>
{/if}
