<script lang="ts">
  import { t } from '../../services/i18n';
  import { getMediaDataUrl, isAudioFile, isVideoFile, isImageFile, getFileIcon, isIntegratedFile, openAttachmentInDefaultApp } from '../../db/media';
  import AudioPlayer from './AudioPlayer.svelte';

  let {
    splitWidth = $bindable(400),
    activeLeftPanels,
    feedbackScore,
    isChecking,
    feedbackText,
    parseMarkdown,
    handleCritiqueClick,
    task,
    textFontSize = 13,
    isRightContentVisible = true
  } = $props();

  let isDraggingSplitter = $state(false);
  let startX = 0;
  let startWidth = 0;

  // Panel vertical resizing states and effects
  let containerHeight = $state(0);
  let panelHeights = $state<Record<string, number>>({});
  let lastContainerHeight = 0;

  $effect(() => {
    const panels = activeLeftPanels;
    if (!panels || panels.length === 0 || containerHeight === 0) return;

    // Check if we need to initialize or re-initialize heights
    const panelIds = panels.map(p => p.id);
    const existingIds = Object.keys(panelHeights);
    const isMismatch = panelIds.some(id => !panelHeights[id]) || existingIds.length !== panelIds.length;

    if (isMismatch) {
      const share = containerHeight / panels.length;
      const newHeights: Record<string, number> = {};
      for (const p of panels) {
        newHeights[p.id] = panelHeights[p.id] || share;
      }
      // Normalize to sum up to containerHeight
      let sum = 0;
      for (const id in newHeights) sum += newHeights[id];
      if (Math.abs(sum - containerHeight) > 1 && sum > 0) {
        for (const id in newHeights) {
          newHeights[id] = (newHeights[id] / sum) * containerHeight;
        }
      }
      panelHeights = newHeights;
      lastContainerHeight = containerHeight;
    }
  });

  $effect(() => {
    if (containerHeight !== lastContainerHeight && containerHeight > 0) {
      const ratio = containerHeight / (lastContainerHeight || 1);
      const newHeights = { ...panelHeights };
      for (const id in newHeights) {
        newHeights[id] = (newHeights[id] || 0) * ratio;
      }
      panelHeights = newHeights;
      lastContainerHeight = containerHeight;
    }
  });

  let resizingPanelIndex = -1;
  let panelResizeStartHeights: number[] = [];
  let panelResizeStartY = 0;
  let panelResizePointerId = -1;

  function startPanelResizeDrag(e: PointerEvent, leftPanelIdx: number) {
    e.preventDefault();
    resizingPanelIndex = leftPanelIdx;
    panelResizeStartY = e.clientY;
    panelResizeStartHeights = activeLeftPanels.map((p: any) => panelHeights[p.id] || 0);
    panelResizePointerId = e.pointerId;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function handlePanelResizeDrag(e: PointerEvent) {
    if (resizingPanelIndex === -1 || e.pointerId !== panelResizePointerId) return;
    const dy = e.clientY - panelResizeStartY;
    const topPanelId = activeLeftPanels[resizingPanelIndex].id;
    const bottomPanelId = activeLeftPanels[resizingPanelIndex + 1].id;
    
    const origTopHeight = panelResizeStartHeights[resizingPanelIndex];
    const origBottomHeight = panelResizeStartHeights[resizingPanelIndex + 1];
    
    const minHeight = 80;
    const maxDy = origBottomHeight - minHeight;
    const minDy = minHeight - origTopHeight;
    const constrainedDy = Math.max(minDy, Math.min(maxDy, dy));
    
    panelHeights[topPanelId] = origTopHeight + constrainedDy;
    panelHeights[bottomPanelId] = origBottomHeight - constrainedDy;
  }

  function stopPanelResizeDrag(e: PointerEvent) {
    if (resizingPanelIndex === -1 || e.pointerId !== panelResizePointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(panelResizePointerId);
    } catch (_) {}
    resizingPanelIndex = -1;
    panelResizePointerId = -1;
  }

  let expandedMediaIds = $state<Record<string, boolean>>({});
  let customHeights = $state<Record<string, number>>({});

  $effect(() => {
    // Reset custom heights when the task changes
    const _ = task?.id;
    customHeights = {};
  });

  let dragMediaId = $state<string | null>(null);
  let dragStartHeight = 0;
  let dragStartY = 0;

  function handleResizeStart(e: PointerEvent, mediaId: string, currentElement: HTMLElement) {
    e.preventDefault();
    dragMediaId = mediaId;
    const container = currentElement.closest('.resizable-preview-container') as HTMLElement;
    if (container) {
      dragStartHeight = container.getBoundingClientRect().height;
      dragStartY = e.clientY;
      container.setPointerCapture(e.pointerId);
    }
  }

  function handleResizeMove(e: PointerEvent) {
    if (!dragMediaId) return;
    const deltaY = e.clientY - dragStartY;
    const newHeight = Math.max(100, dragStartHeight + deltaY);
    customHeights[dragMediaId] = newHeight;
  }

  function handleResizeEnd(e: PointerEvent, currentElement: HTMLElement) {
    if (!dragMediaId) return;
    try {
      const container = currentElement.closest('.resizable-preview-container') as HTMLElement;
      if (container) {
        container.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
    dragMediaId = null;
  }

  function getDefaultHeight(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (isAudioFile(fileName)) return 'auto';
    if (lower.endsWith('.pdf')) return '400px';
    if (lower.endsWith('.md') || lower.endsWith('.txt')) return '300px';
    if (isVideoFile(fileName)) return '360px';
    return 'auto'; // Images, etc.
  }

  // Cache loaded media URLs with loading state
  let loadedMedia = $state<Record<string, { url: string; loading: boolean; error: boolean }>>({});

  // Inline image zoom/pan state (keyed by mediaId)
  let inlineStates = $state<Record<string, { zoom: number; panX: number; panY: number; isDragging: boolean; dragStartX: number; dragStartY: number; panBaseX: number; panBaseY: number; dragged: boolean; activePointers: Map<number, PointerEvent>; isPinching: boolean; initialPinchDistance: number; initialPinchZoom: number; initialPinchMidpointX: number; initialPinchMidpointY: number; initialPinchPanX: number; initialPinchPanY: number; initialPinchCenterX: number; initialPinchCenterY: number }>>({});

  function getInlineState(mediaId: string) {
    if (!inlineStates[mediaId]) {
      inlineStates[mediaId] = { zoom: 1, panX: 0, panY: 0, isDragging: false, dragStartX: 0, dragStartY: 0, panBaseX: 0, panBaseY: 0, dragged: false, activePointers: new Map(), isPinching: false, initialPinchDistance: 0, initialPinchZoom: 1, initialPinchMidpointX: 0, initialPinchMidpointY: 0, initialPinchPanX: 0, initialPinchPanY: 0, initialPinchCenterX: 0, initialPinchCenterY: 0 };
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
    try { img.setPointerCapture(e.pointerId); } catch (_) {}
    const state = getInlineState(mediaId);
    state.activePointers.set(e.pointerId, e);

    if (state.activePointers.size === 2) {
      const pts = Array.from(state.activePointers.values());
      const isMultiTouch = pts.every(p => p.pointerType === 'touch');
      if (isMultiTouch) {
        const p1 = pts[0];
        const p2 = pts[1];
        state.initialPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        state.initialPinchZoom = state.zoom;
        state.initialPinchMidpointX = (p1.clientX + p2.clientX) / 2;
        state.initialPinchMidpointY = (p1.clientY + p2.clientY) / 2;
        state.initialPinchPanX = state.panX;
        state.initialPinchPanY = state.panY;
        const container = img.parentElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          state.initialPinchCenterX = rect.left + rect.width / 2;
          state.initialPinchCenterY = rect.top + rect.height / 2;
        } else {
          state.initialPinchCenterX = 0;
          state.initialPinchCenterY = 0;
        }
        state.isPinching = true;
        state.isDragging = false;
        e.preventDefault();
        return;
      }
    }

    if (state.activePointers.size > 2) {
      e.preventDefault();
      return;
    }

    state.isDragging = true;
    state.dragged = false;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.panBaseX = state.panX;
    state.panBaseY = state.panY;
  }

  function handleInlinePointerMove(e: PointerEvent) {
    const img = e.currentTarget as HTMLElement;
    const mediaId = img.dataset.mediaId;
    if (!mediaId) return;
    const state = getInlineState(mediaId);
    if (e.buttons === 0) {
      state.activePointers.clear();
      state.isDragging = false;
      state.isPinching = false;
      return;
    }
    state.activePointers.set(e.pointerId, e);

    if (state.isPinching && state.activePointers.size === 2) {
      e.preventDefault();
      const pts = Array.from(state.activePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const currentDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const currentMidX = (p1.clientX + p2.clientX) / 2;
      const currentMidY = (p1.clientY + p2.clientY) / 2;
      if (state.initialPinchDistance > 0) {
        const factor = currentDistance / state.initialPinchDistance;
        const newZoom = Math.max(0.5, Math.min(4, state.initialPinchZoom * factor));
        const cx = state.initialPinchCenterX;
        const cy = state.initialPinchCenterY;
        const worldX = (state.initialPinchMidpointX - cx - state.initialPinchPanX) / state.initialPinchZoom;
        const worldY = (state.initialPinchMidpointY - cy - state.initialPinchPanY) / state.initialPinchZoom;
        state.zoom = newZoom;
        state.panX = (currentMidX - cx) - worldX * newZoom;
        state.panY = (currentMidY - cy) - worldY * newZoom;
      }
      return;
    }

    if (state.activePointers.size > 1) return;

    if (!state.isDragging) return;
    const dx = e.clientX - state.dragStartX;
    const dy = e.clientY - state.dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      state.dragged = true;
    }
    const container = img.parentElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      const scaledW = rect.width * state.zoom;
      const scaledH = rect.height * state.zoom;
      const clampDX = Math.max(-scaledW / 3, Math.min(scaledW / 3, dx));
      const clampDY = Math.max(-scaledH / 3, Math.min(scaledH / 3, dy));
      state.panX = state.panBaseX + clampDX;
      state.panY = state.panBaseY + clampDY;
    } else {
      state.panX = state.panBaseX + dx;
      state.panY = state.panBaseY + dy;
    }
  }

  function handleInlinePointerUp(e: PointerEvent) {
    const img = e.currentTarget as HTMLElement;
    const mediaId = img.dataset.mediaId;
    if (!mediaId) return;
    const state = inlineStates[mediaId];
    if (!state) return;
    state.activePointers.delete(e.pointerId);
    if (state.activePointers.size < 2) state.isPinching = false;
    if (state.activePointers.size === 0) state.isDragging = false;
    try { img.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  function handleInlinePointerCancel(e: PointerEvent) {
    handleInlinePointerUp(e);
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
  let modalActivePointers = new Map<number, PointerEvent>();
  let modalIsPinching = false;
  let modalInitialPinchDistance = 0;
  let modalInitialPinchZoom = 1;
  let modalInitialPinchMidpoint = { x: 0, y: 0 };
  let modalInitialPinchPan = { x: 0, y: 0 };
  let modalInitialPinchCenter = { x: 0, y: 0 };

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
    modalZoom = Math.max(0.5, Math.min(newZoom, 8));
    if (modalZoom === 1) {
      modalPan = { x: 0, y: 0 };
    }
  }

  function handleModalPointerDown(e: PointerEvent) {
    const container = e.currentTarget as HTMLElement;
    try { container.setPointerCapture(e.pointerId); } catch (_) {}
    modalActivePointers.set(e.pointerId, e);

    if (modalActivePointers.size === 2) {
      const pts = Array.from(modalActivePointers.values());
      const isMultiTouch = pts.every(p => p.pointerType === 'touch');
      if (isMultiTouch && modalZoom > 0) {
        const p1 = pts[0];
        const p2 = pts[1];
        modalInitialPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        modalInitialPinchZoom = modalZoom;
        modalInitialPinchMidpoint = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
        modalInitialPinchPan = { ...modalPan };
        const rect = container.getBoundingClientRect();
        modalInitialPinchCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
        modalIsPinching = true;
        isModalDragging = false;
        e.preventDefault();
        return;
      }
    }

    if (modalActivePointers.size > 2) {
      e.preventDefault();
      return;
    }

    if (modalZoom <= 1) return;
    isModalDragging = true;
    modalDragStart = { x: e.clientX, y: e.clientY };
    modalBasePan = { ...modalPan };
  }

  function handleModalPointerMove(e: PointerEvent) {
    if (e.buttons === 0) {
      modalActivePointers.clear();
      isModalDragging = false;
      modalIsPinching = false;
      return;
    }
    modalActivePointers.set(e.pointerId, e);

    if (modalIsPinching && modalActivePointers.size === 2) {
      e.preventDefault();
      const pts = Array.from(modalActivePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const currentDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const currentMidpoint = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
      if (modalInitialPinchDistance > 0) {
        const factor = currentDistance / modalInitialPinchDistance;
        const newZoom = Math.max(0.5, Math.min(8, modalInitialPinchZoom * factor));
        const cx = modalInitialPinchCenter.x;
        const cy = modalInitialPinchCenter.y;
        const worldX = (modalInitialPinchMidpoint.x - cx - modalInitialPinchPan.x) / modalInitialPinchZoom;
        const worldY = (modalInitialPinchMidpoint.y - cy - modalInitialPinchPan.y) / modalInitialPinchZoom;
        modalZoom = newZoom;
        modalPan = {
          x: (currentMidpoint.x - cx) - worldX * newZoom,
          y: (currentMidpoint.y - cy) - worldY * newZoom
        };
      }
      return;
    }

    if (modalActivePointers.size > 1) return;

    if (!isModalDragging) return;
    const dx = e.clientX - modalDragStart.x;
    const dy = e.clientY - modalDragStart.y;
    modalPan = {
      x: modalBasePan.x + dx,
      y: modalBasePan.y + dy
    };
  }

  function handleModalPointerUp(e: PointerEvent) {
    modalActivePointers.delete(e.pointerId);
    if (modalActivePointers.size < 2) modalIsPinching = false;
    if (modalActivePointers.size === 0) isModalDragging = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
  }

  function handleModalPointerCancel(e: PointerEvent) {
    handleModalPointerUp(e);
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
    const minWidth = 10;
    const maxWidth = window.innerWidth - 20;
    if (newWidth >= minWidth && newWidth <= maxWidth) {
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
    bind:clientHeight={containerHeight}
    class="bg-surface-container-low border-r border-outline-variant flex flex-col overflow-hidden h-full {isRightContentVisible ? 'shrink-0' : 'grow w-full'}"
    style={isRightContentVisible ? `width: ${splitWidth}px;` : ''}
  >
    {#each activeLeftPanels as panel, idx}
      {#if idx > 0}
        <!-- Draggable Horizontal Panel Divider -->
        <div 
          role="separator"
          class="h-1.5 w-full bg-outline-variant/60 hover:bg-primary cursor-row-resize select-none z-20 transition-all active:bg-primary shrink-0"
          style="touch-action: none;"
          onpointerdown={(e) => startPanelResizeDrag(e, idx - 1)}
          onpointermove={handlePanelResizeDrag}
          onpointerup={stopPanelResizeDrag}
          onpointercancel={stopPanelResizeDrag}
        ></div>
      {/if}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div 
        onclick={panel.isFeedback ? handleCritiqueClick : null}
        class="w-full flex flex-col overflow-y-auto p-6 hide-scrollbar shrink-0 {panel.id === 'solution' ? 'bg-surface-container-low/20' : panel.id === 'feedback' ? 'bg-primary/5' : ''}"
        style="height: {panelHeights[panel.id] || (containerHeight / activeLeftPanels.length)}px;"
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
          {#if panel.content && panel.content.trim()}
            <div class="text-xs text-on-surface-variant leading-relaxed prose prose-sm dark:prose-invert select-text" style="font-size: {textFontSize}px;">
              {@html parseMarkdown(panel.content)}
            </div>
          {/if}

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
                            {getFileIcon(file.name)}
                          </span>
                          <span class="truncate pr-4">{file.name}</span>
                        </div>
                        <div class="flex items-center shrink-0">
                          {#if isIntegratedFile(file.name) && !isAudioFile(file.name)}
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
                          {:else if isAudioFile(file.name)}
                            {#if fileUrl}
                              <AudioPlayer dataUrl={fileUrl} compact={true} />
                            {/if}
                          {:else if isVideoFile(file.name)}
                            {#if fileUrl}
                              <!-- svelte-ignore a11y_media_has_caption -->
                              <video 
                                src={fileUrl} 
                                controls 
                                class="max-w-full max-h-full rounded-lg shadow-sm border border-outline-variant/10"
                              ></video>
                            {/if}
                          {:else if !isIntegratedFile(file.name)}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div 
                              onclick={() => openAttachmentInDefaultApp(file).catch(err => console.error(err))}
                              class="w-full p-4 flex flex-col items-center justify-center gap-3 bg-surface-container-low hover:bg-surface-container-high border border-outline-variant rounded-xl cursor-pointer transition-all select-none hover:shadow-md py-6 group"
                            >
                              <span class="material-symbols-outlined text-[36px] text-primary shrink-0 group-hover:scale-105 transition-transform">
                                {getFileIcon(file.name)}
                              </span>
                              <div class="text-center">
                                <p class="text-xs font-bold text-on-surface truncate max-w-[280px]">{file.name}</p>
                                <p class="text-[10px] text-on-surface-variant mt-1">{t('practice.infoPanels.openDefaultApp')}</p>
                              </div>
                            </div>
                          {:else}
                            <div 
                              class="w-full relative flex flex-col items-center justify-center bg-surface-container-lowest rounded-lg overflow-hidden border border-outline-variant/10 resizable-preview-container"
                              style="height: {customHeights[mediaId] ? customHeights[mediaId] + 'px' : getDefaultHeight(file.name)}; max-height: 70vh; min-height: 100px;"
                            >
                              <div class="w-full grow overflow-hidden relative flex items-center justify-center">
                                {#if file.name.toLowerCase().endsWith('.pdf')}
                                  <iframe 
                                    src={fileUrl} 
                                    title={file.name} 
                                    class="w-full h-full border-0 rounded-lg"
                                  ></iframe>
                                {:else if file.name.toLowerCase().endsWith('.md')}
                                  <div class="w-full h-full p-4 overflow-auto bg-surface-container-high rounded-lg text-xs text-on-surface select-text text-left border border-outline-variant/30 leading-relaxed wrap-break-word font-sans">
                                    {@html parseMarkdown(decodeBase64Text(fileUrl))}
                                  </div>
                                {:else if file.name.toLowerCase().endsWith('.txt')}
                                  <pre class="w-full h-full p-4 overflow-auto bg-surface-container-high rounded-lg text-xs font-mono text-on-surface whitespace-pre-wrap select-text text-left border border-outline-variant/30 leading-relaxed">{decodeBase64Text(fileUrl)}</pre>
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
                                    onpointercancel={handleInlinePointerCancel}
                                    class="w-full h-full object-contain rounded-lg shadow-sm hover:opacity-95 transition-opacity select-none"
                                    style="transform: translate({inlineImgState?.panX ?? 0}px, {inlineImgState?.panY ?? 0}px) scale({inlineImgState?.zoom ?? 1}); transform-origin: center center; cursor: {(inlineImgState?.zoom ?? 1) > 1 ? ((inlineImgState?.isDragging) ? 'grabbing' : 'grab') : 'zoom-in'}; touch-action: none;"
                                    draggable="false"
                                  />
                                {/if}
                              </div>
                              {#if isIntegratedFile(file.name) && !isAudioFile(file.name)}
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <div 
                                  onpointerdown={(e) => handleResizeStart(e, mediaId, e.currentTarget as HTMLElement)}
                                  onpointermove={handleResizeMove}
                                  onpointerup={(e) => handleResizeEnd(e, e.currentTarget as HTMLElement)}
                                  class="w-full h-2 hover:bg-primary/20 active:bg-primary/40 cursor-row-resize flex items-center justify-center bg-outline-variant/20 transition-all select-none shrink-0"
                                >
                                  <div class="w-8 h-1 bg-outline-variant rounded-full"></div>
                                </div>
                              {/if}
                            </div>
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
                            {getFileIcon(file.name)}
                          </span>
                          <span class="truncate pr-4">{file.name}</span>
                        </div>
                        <div class="flex items-center shrink-0">
                          {#if isIntegratedFile(file.name) && !isAudioFile(file.name)}
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
                          {:else if isAudioFile(file.name)}
                            {#if fileUrl}
                              <AudioPlayer dataUrl={fileUrl} compact={true} />
                            {/if}
                          {:else if isVideoFile(file.name)}
                            {#if fileUrl}
                              <!-- svelte-ignore a11y_media_has_caption -->
                              <video 
                                src={fileUrl} 
                                controls 
                                class="max-w-full max-h-full rounded-lg shadow-sm border border-outline-variant/10"
                              ></video>
                            {/if}
                          {:else if !isIntegratedFile(file.name)}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div 
                              onclick={() => openAttachmentInDefaultApp(file).catch(err => console.error(err))}
                              class="w-full p-4 flex flex-col items-center justify-center gap-3 bg-surface-container-low hover:bg-surface-container-high border border-outline-variant rounded-xl cursor-pointer transition-all select-none hover:shadow-md py-6 group"
                            >
                              <span class="material-symbols-outlined text-[36px] text-primary shrink-0 group-hover:scale-105 transition-transform">
                                {getFileIcon(file.name)}
                              </span>
                              <div class="text-center">
                                <p class="text-xs font-bold text-on-surface truncate max-w-[280px]">{file.name}</p>
                                <p class="text-[10px] text-on-surface-variant mt-1">{t('practice.infoPanels.openDefaultApp')}</p>
                              </div>
                            </div>
                          {:else}
                            <div 
                              class="w-full relative flex flex-col items-center justify-center bg-surface-container-lowest rounded-lg overflow-hidden border border-outline-variant/10 resizable-preview-container"
                              style="height: {customHeights[mediaId] ? customHeights[mediaId] + 'px' : getDefaultHeight(file.name)}; max-height: 70vh; min-height: 100px;"
                            >
                              <div class="w-full grow overflow-hidden relative flex items-center justify-center">
                                {#if file.name.toLowerCase().endsWith('.pdf')}
                                  <iframe 
                                    src={fileUrl} 
                                    title={file.name} 
                                    class="w-full h-full border-0 rounded-lg"
                                  ></iframe>
                                {:else if file.name.toLowerCase().endsWith('.md')}
                                  <div class="w-full h-full p-4 overflow-auto bg-surface-container-high rounded-lg text-xs text-on-surface select-text text-left border border-outline-variant/30 leading-relaxed wrap-break-word font-sans">
                                    {@html parseMarkdown(decodeBase64Text(fileUrl))}
                                  </div>
                                {:else if file.name.toLowerCase().endsWith('.txt')}
                                  <pre class="w-full h-full p-4 overflow-auto bg-surface-container-high rounded-lg text-xs font-mono text-on-surface whitespace-pre-wrap select-text text-left border border-outline-variant/30 leading-relaxed">{decodeBase64Text(fileUrl)}</pre>
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
                                    onpointercancel={handleInlinePointerCancel}
                                    class="w-full h-full object-contain rounded-lg shadow-sm hover:opacity-95 transition-opacity select-none"
                                    style="transform: translate({inlineImgState?.panX ?? 0}px, {inlineImgState?.panY ?? 0}px) scale({inlineImgState?.zoom ?? 1}); transform-origin: center center; cursor: {(inlineImgState?.zoom ?? 1) > 1 ? ((inlineImgState?.isDragging) ? 'grabbing' : 'grab') : 'zoom-in'}; touch-action: none;"
                                    draggable="false"
                                  />
                                {/if}
                              </div>
                              {#if isIntegratedFile(file.name) && !isAudioFile(file.name)}
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <div 
                                  onpointerdown={(e) => handleResizeStart(e, mediaId, e.currentTarget as HTMLElement)}
                                  onpointermove={handleResizeMove}
                                  onpointerup={(e) => handleResizeEnd(e, e.currentTarget as HTMLElement)}
                                  class="w-full h-2 hover:bg-primary/20 active:bg-primary/40 cursor-row-resize flex items-center justify-center bg-outline-variant/20 transition-all select-none shrink-0"
                                >
                                  <div class="w-8 h-1 bg-outline-variant rounded-full"></div>
                                </div>
                              {/if}
                            </div>
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
  {#if isRightContentVisible}
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
      class="relative w-[95%] h-[95%] max-w-[95vw] max-h-[95vh] bg-surface rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-outline-variant"
    >
      <!-- Modal Header -->
      <header class="flex items-center justify-between px-6 py-4 border-b border-outline-variant select-none shrink-0 bg-surface">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0">
            {getFileIcon(previewFile.name)}
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
        onwheel={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? handleModalWheel : null}
        onpointerdown={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? handleModalPointerDown : null}
        onpointermove={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? handleModalPointerMove : null}
        onpointerup={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? handleModalPointerUp : null}
        onpointercancel={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? handleModalPointerCancel : null}
        class="grow bg-surface-container-lowest p-6 flex justify-center items-center min-h-0 select-text {previewFile.name.toLowerCase().endsWith('.pdf') || previewFile.name.toLowerCase().endsWith('.txt') || previewFile.name.toLowerCase().endsWith('.md') || isAudioFile(previewFile.name) || isVideoFile(previewFile.name) ? 'overflow-auto' : 'overflow-hidden relative'}"
        style={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? `cursor: ${modalZoom > 1 ? (isModalDragging ? 'grabbing' : 'grab') : 'zoom-in'}; touch-action: none;` : ''}
      >
        {#if isAudioFile(previewFile.name)}
          <div class="w-full max-w-md">
            <AudioPlayer dataUrl={previewFile.dataUrl} />
          </div>
        {:else if isVideoFile(previewFile.name)}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video 
            src={previewFile.dataUrl} 
            controls 
            class="max-w-full max-h-full rounded-lg shadow-md"
          ></video>
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
            class="max-w-full max-h-full object-contain rounded-lg shadow-md select-none transition-transform duration-75 ease-out"
            style="transform: translate({modalPan.x}px, {modalPan.y}px) scale({modalZoom}); transform-origin: center center;"
            draggable="false"
          />
        {/if}
      </div>
    </div>
  </div>
{/if}
