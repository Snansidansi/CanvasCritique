<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '../../services/i18n';
  import { getMediaDataUrl, isAudioFile, isVideoFile, isImageFile, getFileIcon, isIntegratedFile, openAttachmentInDefaultApp } from '../../db/media';
  import AudioPlayer from './AudioPlayer.svelte';
  import MediaPreviewItem from './MediaPreviewItem.svelte';

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
    isRightContentVisible = true,
    infoPanelsLayout = 'vertical',
    sidebarPosition = 'left',
    onSelectProvidedImage = (file: any) => {}
  } = $props<{
    splitWidth?: number;
    activeLeftPanels: any;
    feedbackScore: any;
    isChecking: boolean;
    feedbackText: any;
    parseMarkdown: any;
    handleCritiqueClick: any;
    task: any;
    textFontSize?: number;
    isRightContentVisible?: boolean;
    infoPanelsLayout?: 'vertical' | 'horizontal';
    sidebarPosition?: 'left' | 'right' | 'top' | 'bottom';
    onSelectProvidedImage?: (file: any) => void;
  }>();


  let providedMediaExpanded = $state(false);

  function getBaseName(filename: string): string {
    if (!filename) return '';
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) return filename;
    return filename.substring(0, lastDotIndex);
  }

  let sidebarFlow = $derived((sidebarPosition === 'top' || sidebarPosition === 'bottom') ? 'column' : 'row');

  let isDraggingSplitter = $state(false);
  let startPos = 0;
  let startWidth = 0;

  // Panel resizing states and effects
  let infoPanelsContainer = $state<HTMLElement | null>(null);
  let containerWidth = $state(0);
  let containerHeight = $state(0);

  $effect(() => {
    if (!infoPanelsContainer) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const w = Math.round(width / 8) * 8;
        const h = Math.round(height / 8) * 8;

        requestAnimationFrame(() => {
          if (containerWidth !== w) {
            containerWidth = w;
          }
          if (containerHeight !== h) {
            containerHeight = h;
          }
        });
      }
    });

    resizeObserver.observe(infoPanelsContainer);
    return () => {
      resizeObserver.disconnect();
    };
  });
  let panelSizes = $state<Record<string, number>>({});
  let lastContainerSize = 0;
  let savedRatios = $state<Record<string, number>>({});

  $effect(() => {
    try {
      const saved = localStorage.getItem('sidebar_panel_ratios');
      if (saved) {
        savedRatios = JSON.parse(saved);
      }
    } catch (e) {
      console.error('[PracticeInfoPanels] Failed to load saved ratios:', e);
    }
  });

  let expectedFlowSize = $derived.by(() => {
    // Round to nearest 8px to completely eliminate sub-pixel ResizeObserver layout loops
    const roundedHeight = Math.round(containerHeight / 8) * 8;
    const roundedWidth = Math.round(containerWidth / 8) * 8;

    if (!isRightContentVisible) {
      return infoPanelsLayout === 'vertical' ? roundedHeight : roundedWidth;
    }
    if (sidebarFlow === 'column') {
      if (infoPanelsLayout === 'vertical') {
        return splitWidth;
      } else {
        return roundedWidth;
      }
    } else {
      if (infoPanelsLayout === 'vertical') {
        return roundedHeight;
      } else {
        return splitWidth;
      }
    }
  });

  let flowSize = $derived(expectedFlowSize);

  $effect(() => {
    const panels = activeLeftPanels;
    if (!panels || panels.length === 0 || flowSize === 0) return;

    untrack(() => {
      // Check if we need to initialize or re-initialize sizes
      const panelIds = panels.map(p => p.id);
      const existingIds = Object.keys(panelSizes);
      const isMismatch = panelIds.some(id => !panelSizes[id]) || existingIds.length !== panelIds.length;

      const dividerSize = (panels.length - 1) * 6;
      const availableSize = Math.max(0, flowSize - dividerSize);

      if (isMismatch) {
        const newSizes: Record<string, number> = {};
        
        // Task 8 check: if 'solution' is newly added and has no ratio saved, it gets 50%
        const isSolutionNew = panels.some(p => p.id === 'solution') && !savedRatios['solution'];

        if (isSolutionNew) {
          const solutionSize = availableSize * 0.5;
          newSizes['solution'] = solutionSize;
          savedRatios['solution'] = 0.5;

          const remainingPanels = panels.filter(p => p.id !== 'solution');
          const remainingSize = availableSize - solutionSize;

          let remainingRatioSum = 0;
          for (const p of remainingPanels) {
            remainingRatioSum += savedRatios[p.id] || 1;
          }

          for (const p of remainingPanels) {
            const ratio = (savedRatios[p.id] || 1) / (remainingRatioSum || 1);
            newSizes[p.id] = ratio * remainingSize;
            savedRatios[p.id] = ratio * 0.5;
          }
          
          try {
            localStorage.setItem('sidebar_panel_ratios', JSON.stringify(savedRatios));
          } catch (_) {}
        } else {
          let ratioSum = 0;
          for (const p of panels) {
            ratioSum += savedRatios[p.id] || 1;
          }

          for (const p of panels) {
            const ratio = (savedRatios[p.id] || 1) / (ratioSum || 1);
            newSizes[p.id] = ratio * availableSize;
          }
        }
        
        panelSizes = newSizes;
        lastContainerSize = flowSize;
      }
    });
  });

  $effect(() => {
    const currentFlowSize = flowSize;
    if (currentFlowSize > 0) {
      untrack(() => {
        // Only run if there is a significant change in flowSize (>= 8px) to prevent sub-pixel layout oscillation loops
        if (Math.abs(currentFlowSize - lastContainerSize) >= 8) {
          const panels = activeLeftPanels;
          const dividerSize = (panels.length - 1) * 6;
          const currentAvailableSize = Math.max(0, currentFlowSize - dividerSize);

          const newSizes = { ...panelSizes };
          
          let ratioSum = 0;
          for (const p of panels) {
            ratioSum += savedRatios[p.id] || 1;
          }

          for (const p of panels) {
            const ratio = (savedRatios[p.id] || 1) / (ratioSum || 1);
            newSizes[p.id] = ratio * currentAvailableSize;
          }
          
          panelSizes = newSizes;
          lastContainerSize = currentFlowSize;
        }
      });
    }
  });

  let resizingPanelIndex = -1;
  let panelResizeStartHeights: number[] = [];
  let panelResizeStartPos = 0;
  let panelResizePointerId = -1;

  function startPanelResizeDrag(e: PointerEvent, leftPanelIdx: number) {
    e.preventDefault();
    resizingPanelIndex = leftPanelIdx;
    panelResizeStartPos = infoPanelsLayout === 'vertical' ? e.clientY : e.clientX;
    panelResizeStartHeights = activeLeftPanels.map((p: any) => panelSizes[p.id] || 0);
    panelResizePointerId = e.pointerId;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function handlePanelResizeDrag(e: PointerEvent) {
    if (resizingPanelIndex === -1 || e.pointerId !== panelResizePointerId) return;
    const currentPos = infoPanelsLayout === 'vertical' ? e.clientY : e.clientX;
    const delta = currentPos - panelResizeStartPos;
    const topPanelId = activeLeftPanels[resizingPanelIndex].id;
    const bottomPanelId = activeLeftPanels[resizingPanelIndex + 1].id;
    
    const origTopHeight = panelResizeStartHeights[resizingPanelIndex];
    const origBottomHeight = panelResizeStartHeights[resizingPanelIndex + 1];
    
    const minHeight = 80;
    const maxDelta = origBottomHeight - minHeight;
    const minDelta = minHeight - origTopHeight;
    const constrainedDelta = Math.max(minDelta, Math.min(maxDelta, delta));
    
    panelSizes[topPanelId] = origTopHeight + constrainedDelta;
    panelSizes[bottomPanelId] = origBottomHeight - constrainedDelta;

    const dividerSize = (activeLeftPanels.length - 1) * 6;
    const availableSize = Math.max(1, flowSize - dividerSize);
    
    for (const p of activeLeftPanels) {
      savedRatios[p.id] = (panelSizes[p.id] || 0) / availableSize;
    }
    try {
      localStorage.setItem('sidebar_panel_ratios', JSON.stringify(savedRatios));
    } catch (_) {}
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

  // Cache loaded media URLs with loading state
  let loadedMedia = $state<Record<string, { url: string; loading: boolean; error: boolean }>>({});

  let imageRatios = $state<Record<string, number>>({});

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
    startPos = sidebarFlow === 'column' ? e.clientY : e.clientX;
    startWidth = splitWidth;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function handleSplitDrag(e: PointerEvent) {
    if (!isDraggingSplitter) return;
    if (sidebarFlow === 'column') {
      const deltaY = e.clientY - startPos;
      const sign = sidebarPosition === 'bottom' ? -1 : 1;
      const newSize = startWidth + deltaY * sign;
      const minSize = 10;
      const maxSize = window.innerHeight - 100;
      if (newSize >= minSize && newSize <= maxSize) {
        splitWidth = newSize;
      }
    } else {
      const deltaX = e.clientX - startPos;
      const sign = sidebarPosition === 'right' ? -1 : 1;
      const newWidth = startWidth + deltaX * sign;
      const minWidth = 10;
      const maxWidth = window.innerWidth - 20;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        splitWidth = newWidth;
      }
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
    bind:this={infoPanelsContainer}
    class="bg-surface-container-low flex overflow-hidden {isRightContentVisible ? 'shrink-0' : 'grow w-full'} {infoPanelsLayout === 'vertical' ? 'flex-col' : 'flex-row'}
           {sidebarFlow === 'column' ? 'w-full' : 'h-full'}
           {sidebarPosition === 'left' ? 'border-r border-outline-variant' : ''}
           {sidebarPosition === 'right' ? 'border-l border-outline-variant' : ''}
           {sidebarPosition === 'top' ? 'border-b border-outline-variant' : ''}
           {sidebarPosition === 'bottom' ? 'border-t border-outline-variant' : ''}"
    style="{isRightContentVisible ? (sidebarFlow === 'column' ? `height: ${splitWidth}px;` : `width: ${splitWidth}px;`) : ''} order: {sidebarPosition === 'right' || sidebarPosition === 'bottom' ? 3 : 1};"
  >
    {#each activeLeftPanels as panel, idx}
      {#if idx > 0}
        <!-- Draggable Panel Divider -->
        <div 
          role="separator"
          class="bg-outline-variant/60 hover:bg-primary select-none z-20 transition-all active:bg-primary shrink-0 {infoPanelsLayout === 'vertical' ? 'h-1.5 w-full cursor-row-resize' : 'w-1.5 h-full cursor-col-resize'}"
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
        class="flex flex-col overflow-y-auto p-6 hide-scrollbar shrink-0 {panel.id === 'solution' ? 'bg-surface-container-low/20' : panel.id === 'feedback' ? 'bg-primary/5' : ''}"
        style={infoPanelsLayout === 'vertical' 
          ? `height: ${panelSizes[panel.id] || Math.max(10, (containerHeight - (activeLeftPanels.length - 1) * 6) / activeLeftPanels.length)}px; width: 100%;` 
          : `width: ${panelSizes[panel.id] || Math.max(10, (containerWidth - (activeLeftPanels.length - 1) * 6) / activeLeftPanels.length)}px; height: 100%;`}
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
            <div class="text-xs text-on-surface-variant leading-relaxed prose prose-sm dark:prose-invert select-text" style="font-size: {textFontSize}px;">
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
                    <MediaPreviewItem
                      {file}
                      {mediaId}
                      open={isMediaExpanded(mediaId, true)}
                      onToggle={() => toggleMedia(mediaId)}
                      onSelectProvidedImage={onSelectProvidedImage}
                      onOpenPreview={openPreview}
                      fontSize={textFontSize}
                    />
                  {/each}
                </div>
              </div>
            {/if}
          {/if}

          {#if panel.id === 'task' && task.providedFiles && task.providedFiles.length > 0}
            <!-- Provided Canvas Images Catalog -->
            <div class="mt-5 border-t border-outline-variant/30 pt-4">
              <button
                type="button"
                onclick={() => providedMediaExpanded = !providedMediaExpanded}
                class="w-full flex items-center justify-between mb-2 cursor-pointer bg-transparent border-0 text-left focus:outline-none p-0 font-sans"
              >
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[16px] text-primary">photo_library</span>
                  <h3 class="text-[10px] font-bold text-primary uppercase tracking-wider select-none">
                    {t('practice.infoPanels.providedMediaTitle')}
                  </h3>
                  <span class="text-[9px] font-semibold text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded-full">
                    {task.providedFiles.length}
                  </span>
                </div>
                <span class="material-symbols-outlined text-on-surface-variant text-[16px] transition-transform" 
                      style="transform: rotate({providedMediaExpanded ? '180deg' : '0deg'})">
                  expand_more
                </span>
              </button>

              {#if !providedMediaExpanded}
                <p class="text-[10px] text-on-surface-variant italic">
                  {t('practice.infoPanels.clickToPlaceOnCanvas')}
                </p>
              {/if}

              {#if providedMediaExpanded}
                <div class="grid grid-cols-2 gap-2 animate-fade-in">
                  {#each task.providedFiles as file, idx}
                    {@const fileUrl = resolveMediaUrl(file)}
                    {@const loading = isMediaLoading(file)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      onclick={() => onSelectProvidedImage(file)}
                      class="relative group flex flex-col items-center bg-surface-container border border-outline-variant rounded-xl overflow-hidden cursor-pointer hover:border-primary hover:shadow-md transition-all"
                    >
                      <div class="w-full aspect-square flex items-center justify-center bg-surface-container-lowest p-2 overflow-hidden">
                        {#if loading}
                          <div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        {:else if fileUrl}
                          <img 
                            src={fileUrl} 
                            alt={file.name} 
                            class="max-w-full max-h-full object-contain rounded select-none group-hover:scale-105 transition-transform"
                            draggable="false"
                          />
                        {:else}
                          <span class="material-symbols-outlined text-[32px] text-outline">image</span>
                        {/if}
                      </div>
                      <div class="w-full px-2 py-1.5 text-center border-t border-outline-variant/30">
                        <span class="text-[9px] font-medium text-on-surface truncate block">{getBaseName(file.name)}</span>
                      </div>
                      <!-- Hover overlay -->
                      <div class="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <span class="material-symbols-outlined text-[28px] text-primary drop-shadow">place_item</span>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          {#if panel.id === 'solution'}
            <!-- Solution Media Files inside Solution Panel -->
            {#if task.solutionFiles && task.solutionFiles.length > 0}
              <div class="mt-5 border-t border-outline-variant/30 pt-4">
                <h3 class="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 select-none font-sans">{t('practice.infoPanels.solutionMedia')}</h3>
                <div class="flex flex-col gap-3">
                  {#each task.solutionFiles as file, idx}
                    {@const mediaId = `sol-sol-${idx}`}
                    <MediaPreviewItem
                      {file}
                      {mediaId}
                      open={isMediaExpanded(mediaId, true)}
                      onToggle={() => toggleMedia(mediaId)}
                      onSelectProvidedImage={onSelectProvidedImage}
                      onOpenPreview={openPreview}
                      fontSize={textFontSize}
                    />
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
      class="{sidebarFlow === 'column' ? 'h-1.5 hover:h-2 w-full cursor-row-resize' : 'w-1.5 hover:w-2 h-full cursor-col-resize'} bg-outline-variant/60 hover:bg-primary select-none z-20 transition-all active:bg-primary shrink-0"
      style="touch-action: none; order: 2;"
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
          <div class="w-full h-full p-6 overflow-auto bg-surface-container-high rounded-xl text-on-surface select-text leading-relaxed border border-outline-variant text-left wrap-break-word font-sans prose prose-sm dark:prose-invert" style="font-size: {textFontSize}px;">
            {@html parseMarkdown(decodeBase64Text(previewFile.dataUrl))}
          </div>
        {:else if previewFile.name.toLowerCase().endsWith('.txt')}
          <pre class="w-full h-full p-6 overflow-auto bg-surface-container-high rounded-xl font-mono text-on-surface whitespace-pre-wrap select-text leading-relaxed border border-outline-variant" style="font-size: {textFontSize}px;">{decodeBase64Text(previewFile.dataUrl)}</pre>
        {:else}
          <img 
            src={previewFile.dataUrl} 
            alt={previewFile.name} 
            class="max-w-full max-h-full object-contain shadow-md select-none transition-transform duration-75 ease-out"
            style="transform: translate({modalPan.x}px, {modalPan.y}px) scale({modalZoom}); transform-origin: center center;"
            draggable="false"
          />
        {/if}
      </div>
    </div>
  </div>
{/if}
