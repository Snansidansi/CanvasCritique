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

  // Inline canvas preview: state per mediaId
  let canvasRefs = $state<Record<string, HTMLCanvasElement | null>>({});
  let inlineStates = $state<Record<string, { zoom: number; panX: number; panY: number }>>({});
  let inlineImages: Record<string, HTMLImageElement> = {};
  let inlineActivePointers = new Map<number, PointerEvent>();
  let inlinePinchState: Record<string, {
    initialDist: number; initialZoom: number; initialMidX: number; initialMidY: number;
    initialPanX: number; initialPanY: number; isPinching: boolean
  }> = {};
  let inlineDragState: Record<string, {
    startX: number; startY: number; basePanX: number; basePanY: number;
    isDragging: boolean; dragged: boolean
  }> = {};

  function getInlineState(mediaId: string) {
    if (!inlineStates[mediaId]) {
      inlineStates[mediaId] = { zoom: 1, panX: 0, panY: 0 };
    }
    return inlineStates[mediaId];
  }

  function canvasAction(node: HTMLCanvasElement, params: { mediaId: string; url: string }) {
    canvasRefs[params.mediaId] = node;
    loadAndDraw(params.mediaId, params.url);
    return {
      update(params: { mediaId: string; url: string }) {
        canvasRefs[params.mediaId] = node;
        loadAndDraw(params.mediaId, params.url);
      }
    };
  }

  function drawPreview(mediaId: string) {
    const canvas = canvasRefs[mediaId];
    const img = inlineImages[mediaId];
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = getInlineState(mediaId);

    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    if (displayW === 0 || displayH === 0) return;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;

    const fitScale = Math.min(displayW / img.width, displayH / img.height);
    const offsetX = (displayW - img.width * fitScale) / 2;
    const offsetY = (displayH - img.height * fitScale) / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayW, displayH);
    ctx.setTransform(
      fitScale * state.zoom * dpr, 0,
      0, fitScale * state.zoom * dpr,
      (offsetX + state.panX) * dpr,
      (offsetY + state.panY) * dpr
    );
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  async function loadAndDraw(mediaId: string, url: string) {
    if (!url) return;
    if (!inlineImages[mediaId]) {
      const img = new Image();
      img.onload = () => {
        inlineImages[mediaId] = img;
        drawPreview(mediaId);
      };
      img.onerror = () => {};
      img.src = url;
    }
    drawPreview(mediaId);
  }

  function getCursorStyle(mediaId: string): string {
    const state = inlineStates[mediaId];
    const drag = inlineDragState[mediaId];
    if (!state || state.zoom <= 1) return 'zoom-in';
    if (drag?.isDragging) return 'grabbing';
    return 'grab';
  }

  function handleInlineWheel(e: WheelEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const mediaId = canvas.dataset.mediaId;
    if (!mediaId) return;
    e.preventDefault();

    const zoomIntensity = 0.05;
    const delta = -e.deltaY;
    const factor = delta > 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);

    const state = getInlineState(mediaId);
    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const worldX = (cursorX - state.panX) / state.zoom;
    const worldY = (cursorY - state.panY) / state.zoom;
    const newZoom = Math.max(0.5, Math.min(4, state.zoom * factor));

    state.zoom = newZoom;
    state.panX = cursorX - worldX * newZoom;
    state.panY = cursorY - worldY * newZoom;
    drawPreview(mediaId);
  }

  function handleInlinePointerDown(e: PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const mediaId = canvas.dataset.mediaId;
    if (!mediaId) return;
    inlineActivePointers.set(e.pointerId, e);

    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

    let touchCount = 0;
    const pts: PointerEvent[] = [];
    for (const [, ev] of inlineActivePointers) {
      const el = ev.currentTarget as HTMLElement;
      if (el?.dataset?.mediaId === mediaId) { touchCount++; pts.push(ev); }
    }

    if (touchCount >= 2) {
      if (!inlineDragState[mediaId]) inlineDragState[mediaId] = { startX: 0, startY: 0, basePanX: 0, basePanY: 0, isDragging: false, dragged: false };
      inlineDragState[mediaId].isDragging = false;
      const state = getInlineState(mediaId);
      if (pts.length >= 2) {
        const p1 = pts[0]; const p2 = pts[1];
        const rect = canvas.getBoundingClientRect();
        inlinePinchState[mediaId] = {
          initialDist: Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY),
          initialZoom: state.zoom,
          initialMidX: (p1.clientX + p2.clientX) / 2 - rect.left,
          initialMidY: (p1.clientY + p2.clientY) / 2 - rect.top,
          initialPanX: state.panX,
          initialPanY: state.panY,
          isPinching: true
        };
        e.preventDefault();
      }
    } else {
      if (!inlineDragState[mediaId]) inlineDragState[mediaId] = { startX: 0, startY: 0, basePanX: 0, basePanY: 0, isDragging: false, dragged: false };
      inlineDragState[mediaId].isDragging = true;
      inlineDragState[mediaId].dragged = false;
      inlineDragState[mediaId].startX = e.clientX;
      inlineDragState[mediaId].startY = e.clientY;
      inlineDragState[mediaId].basePanX = inlineStates[mediaId]?.panX ?? 0;
      inlineDragState[mediaId].basePanY = inlineStates[mediaId]?.panY ?? 0;
    }
  }

  function handleInlinePointerMove(e: PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const mediaId = canvas.dataset.mediaId;
    if (!mediaId) return;
    inlineActivePointers.set(e.pointerId, e);

    const pinch = inlinePinchState[mediaId];
    if (pinch?.isPinching) {
      let touchCount = 0;
      const pts: PointerEvent[] = [];
      for (const [, ev] of inlineActivePointers) {
        const el = ev.currentTarget as HTMLElement;
        if (el?.dataset?.mediaId === mediaId) { touchCount++; pts.push(ev); }
      }
      if (touchCount >= 2 && pts.length >= 2) {
        const p1 = pts[0]; const p2 = pts[1];
        const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        const rect = canvas.getBoundingClientRect();
        const midX = (p1.clientX + p2.clientX) / 2 - rect.left;
        const midY = (p1.clientY + p2.clientY) / 2 - rect.top;
        if (pinch.initialDist > 0) {
          const factor = dist / pinch.initialDist;
          const newZoom = Math.max(0.5, Math.min(4, pinch.initialZoom * factor));
          const worldX = (pinch.initialMidX - pinch.initialPanX) / pinch.initialZoom;
          const worldY = (pinch.initialMidY - pinch.initialPanY) / pinch.initialZoom;
          const state = getInlineState(mediaId);
          state.zoom = newZoom;
          state.panX = midX - worldX * newZoom;
          state.panY = midY - worldY * newZoom;
        }
        e.preventDefault();
        drawPreview(mediaId);
      }
      return;
    }

    const drag = inlineDragState[mediaId];
    if (!drag?.isDragging) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      drag.dragged = true;
    }
    const state = getInlineState(mediaId);
    state.panX = drag.basePanX + dx;
    state.panY = drag.basePanY + dy;
    drawPreview(mediaId);
  }

  function handleInlinePointerUp(e: PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const mediaId = canvas.dataset.mediaId;
    if (!mediaId) return;
    inlineActivePointers.delete(e.pointerId);

    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}

    const pinch = inlinePinchState[mediaId];
    if (pinch?.isPinching) {
      let remainingCount = 0;
      const remaining: PointerEvent[] = [];
      for (const [, ev] of inlineActivePointers) {
        const el = ev.currentTarget as HTMLElement;
        if (el?.dataset?.mediaId === mediaId) { remainingCount++; remaining.push(ev); }
      }
      if (remainingCount >= 2) {
        const p1 = remaining[0]; const p2 = remaining[1];
        const rect = canvas.getBoundingClientRect();
        pinch.initialDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        pinch.initialZoom = inlineStates[mediaId]?.zoom ?? 1;
        pinch.initialMidX = (p1.clientX + p2.clientX) / 2 - rect.left;
        pinch.initialMidY = (p1.clientY + p2.clientY) / 2 - rect.top;
        pinch.initialPanX = inlineStates[mediaId]?.panX ?? 0;
        pinch.initialPanY = inlineStates[mediaId]?.panY ?? 0;
      } else if (remainingCount === 1) {
        pinch.isPinching = false;
        if (!inlineDragState[mediaId]) inlineDragState[mediaId] = { startX: 0, startY: 0, basePanX: 0, basePanY: 0, isDragging: false, dragged: false };
        inlineDragState[mediaId].isDragging = true;
        inlineDragState[mediaId].dragged = false;
        inlineDragState[mediaId].startX = remaining[0].clientX;
        inlineDragState[mediaId].startY = remaining[0].clientY;
        inlineDragState[mediaId].basePanX = inlineStates[mediaId]?.panX ?? 0;
        inlineDragState[mediaId].basePanY = inlineStates[mediaId]?.panY ?? 0;
        try { canvas.setPointerCapture(remaining[0].pointerId); } catch (_) {}
      } else {
        pinch.isPinching = false;
      }
      return;
    }

    const drag = inlineDragState[mediaId];
    if (drag) {
      drag.isDragging = false;
    }
  }

  function handleInlineClick(e: MouseEvent, file: { name: string; dataUrl?: string; mediaId?: string }, mediaId: string) {
    const drag = inlineDragState[mediaId];
    if (!drag || !drag.dragged) {
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
                              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                              <canvas
                                use:canvasAction={{ mediaId, url: fileUrl }}
                                data-media-id={mediaId}
                                onclick={(e) => handleInlineClick(e, file, mediaId)}
                                onwheel={handleInlineWheel}
                                onpointerdown={handleInlinePointerDown}
                                onpointermove={handleInlinePointerMove}
                                onpointerup={handleInlinePointerUp}
                                class="w-full rounded-lg shadow-sm select-none"
                                style="height: 400px; cursor: {getCursorStyle(mediaId)}; touch-action: none; will-change: transform;"
                              ></canvas>
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
                              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                              <canvas
                                use:canvasAction={{ mediaId, url: fileUrl }}
                                data-media-id={mediaId}
                                onclick={(e) => handleInlineClick(e, file, mediaId)}
                                onwheel={handleInlineWheel}
                                onpointerdown={handleInlinePointerDown}
                                onpointermove={handleInlinePointerMove}
                                onpointerup={handleInlinePointerUp}
                                class="w-full rounded-lg shadow-sm select-none"
                                style="height: 400px; cursor: {getCursorStyle(mediaId)}; touch-action: none; will-change: transform;"
                              ></canvas>
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
        class="grow bg-surface-container-lowest p-6 flex justify-center items-center min-h-0 select-text {previewFile.name.toLowerCase().endsWith('.pdf') || previewFile.name.toLowerCase().endsWith('.txt') || previewFile.name.toLowerCase().endsWith('.md') || isAudioFile(previewFile.name) ? 'overflow-auto' : 'overflow-hidden relative'}"
        style={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) ? `cursor: ${modalZoom > 1 ? (isModalDragging ? 'grabbing' : 'grab') : 'zoom-in'}` : ''}
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
