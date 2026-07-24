<script lang="ts">
  import { store, DEFAULT_SYSTEM_PROMPT, type Task } from '../state/store.svelte';
  import { onMount, tick, untrack, onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import { t } from '../services/i18n';
  import { jsPDF } from 'jspdf';
  import html2canvas from 'html2canvas';
  import { save } from '@tauri-apps/plugin-dialog';
  import { writeFile } from '@tauri-apps/plugin-fs';
  import { getFileModality, getModelSupportedModalities } from '../utils/modality';

  // Subcomponents
  import PracticeHeader from '../components/practice/PracticeHeader.svelte';
  import PracticeInfoPanels from '../components/practice/PracticeInfoPanels.svelte';
  import CustomBgModal from '../components/practice/CustomBgModal.svelte';
  import FloatingToolPalette from '../components/practice/FloatingToolPalette.svelte';
  import MarkerTooltip from '../components/practice/MarkerTooltip.svelte';
  import MultipleChoicePractice from '../components/practice/MultipleChoicePractice.svelte';
  import CanvasModeSelector from '../components/settings/CanvasModeSelector.svelte';
  import CanvasBackgroundSelector from '../components/settings/CanvasBackgroundSelector.svelte';

  // External Helpers
  import { parseMarkdown } from '../utils/markdown';

  function getBaseName(filename: string): string {
    if (!filename) return '';
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) return filename;
    return filename.substring(0, lastDotIndex);
  }
  import { 
    loadImage, 
    getStrokesBoundingBox, 
    drawStroke, 
    drawGuidelinesInWorld,
    calculateStrokeBounds,
    ensureStrokeBounds,
    type Stroke,
    type Point
  } from '../utils/canvas';
  import { runCheckWork } from '../services/ai';
  import { getMediaDataUrl, saveMediaToDb } from '../db/media';


  // Active task details from store
  let task = $derived(store.activeTask || ({
    id: '',
    name: 'Practice Canvas',
    completed: false,
    instructions: 'Use the drawing tools to practice your calligraphy strokes.',
    solution: 'Match the stroke templates and slant guides.',
    category: 'Practice',
    instructionFiles: [],
    solutionFiles: []
  } as Task));

  // Toggles and options
  let showTask = $state(true);
  let showSolution = $state(false);
  let activeBg = $state('grid'); // 'grid' | 'lines' | 'blank' | custom template ID
  let bgOpacity = $state(
    (store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id)
      : store.settings).canvasBgOpacity ?? 15
  ); // Background template opacity range 1-100

  $effect(() => {
    const op = bgOpacity;
    if (op !== undefined && store.settings.canvasBgOpacity !== op) {
      store.settings.canvasBgOpacity = op;
      store.saveSettings();
    }
  });
  let customBgUrl = $state(null);
  
  // Active editing mode ('canvas', 'text', 'multiple_choice')
  let showCanvas = $state(true);
  let showText = $state(false);
  let showMultipleChoice = $state(false);
  let selectedAnswers = $state<Record<string, string[]>>({});

  let infoPanelsLayout = $state<'vertical' | 'horizontal'>('vertical');
  let workspaceLayout = $state<'vertical' | 'horizontal'>('horizontal');
  let sidebarPosition = $state<'left' | 'right' | 'top' | 'bottom'>('left');

  // Load layout preferences from localStorage on mount
  $effect(() => {
    const savedInfoLayout = localStorage.getItem('info_panels_layout');
    if (savedInfoLayout === 'vertical' || savedInfoLayout === 'horizontal') {
      infoPanelsLayout = savedInfoLayout;
    }
    const savedWorkLayout = localStorage.getItem('workspace_layout');
    if (savedWorkLayout === 'vertical' || savedWorkLayout === 'horizontal') {
      workspaceLayout = savedWorkLayout;
    }
    const savedSidebarPos = localStorage.getItem('sidebar_position');
    if (savedSidebarPos === 'left' || savedSidebarPos === 'right' || savedSidebarPos === 'top' || savedSidebarPos === 'bottom') {
      sidebarPosition = savedSidebarPos;
    }
  });

  // Persist layout changes
  $effect(() => {
    localStorage.setItem('info_panels_layout', infoPanelsLayout);
  });
  $effect(() => {
    localStorage.setItem('workspace_layout', workspaceLayout);
  });
  $effect(() => {
    localStorage.setItem('sidebar_position', sidebarPosition);
  });

  let activeMode = $derived.by<'canvas' | 'text' | 'both' | 'none'>(() => {
    if (showCanvas && showText) return 'both';
    if (showCanvas) return 'canvas';
    if (showText) return 'text';
    return 'none';
  });
  let editorText = $state('');
  
  let lines = $state<string[]>([]);
  let activeLineIndex = $state<number | null>(null);
  let cursorPositionToSet = $state<number | null>(null);

  $effect(() => {
    if (task && task.id) {
      editorText = store.getEditorText(task.id) || '';
    }
  });

  $effect(() => {
    if (showText && editorText.trim() === '' && !store.settings.editorShowAllRaw) {
      store.settings.editorShowAllRaw = true;
      store.saveSettings();
    }
  });

  $effect(() => {
    if (editorText !== lines.join('\n')) {
      lines = editorText.split('\n');
    }
  });

  $effect(() => {
    if (activeLineIndex !== null) {
      // Use requestAnimationFrame to make sure the DOM node is rendered
      requestAnimationFrame(() => {
        const textarea = document.querySelector(`textarea[data-line-index="${activeLineIndex}"]`) as HTMLTextAreaElement;
        if (textarea) {
          if (document.activeElement !== textarea) {
            textarea.focus();
          }
          if (cursorPositionToSet !== null) {
            textarea.setSelectionRange(cursorPositionToSet, cursorPositionToSet);
            cursorPositionToSet = null; // Reset
          }
        }
      });
    }
  });

  let editorTextSaveTimeout: any = null;
  function handleEditorInput() {
    if (task && task.id) {
      if (editorTextSaveTimeout) clearTimeout(editorTextSaveTimeout);
      editorTextSaveTimeout = setTimeout(() => {
        if (task && task.id) {
          store.saveEditorText(task.id, editorText);
        }
        editorTextSaveTimeout = null;
      }, 300);
    }
  }

  function autoSize(node: HTMLTextAreaElement) {
    const resize = () => {
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    };
    // Svelte 5 needs a brief timeout or requestAnimationFrame to get correct scrollHeight on mount
    requestAnimationFrame(resize);
    node.addEventListener('input', resize);
    return {
      destroy() {
        node.removeEventListener('input', resize);
      }
    };
  }

  function handleLineKeyDown(e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }, i: number) {
    const target = e.currentTarget;
    const val = target.value;
    const start = target.selectionStart;
    const end = target.selectionEnd;

    if (e.key === 'ArrowUp') {
      if (start === 0 && i > 0) {
        e.preventDefault();
        activeLineIndex = i - 1;
        cursorPositionToSet = lines[i - 1].length;
      }
    } else if (e.key === 'ArrowDown') {
      if (start === val.length && i < lines.length - 1) {
        e.preventDefault();
        activeLineIndex = i + 1;
        cursorPositionToSet = 0;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const left = val.slice(0, start);
      const right = val.slice(start);
      lines[i] = left;
      lines.splice(i + 1, 0, right);
      editorText = lines.join('\n');
      handleEditorInput();
      activeLineIndex = i + 1;
      cursorPositionToSet = 0;
    } else if (e.key === 'Backspace') {
      if (start === 0 && end === 0 && i > 0) {
        e.preventDefault();
        const prevLineLength = lines[i - 1].length;
        lines[i - 1] += val;
        lines.splice(i, 1);
        editorText = lines.join('\n');
        handleEditorInput();
        activeLineIndex = i - 1;
        cursorPositionToSet = prevLineLength;
      }
    } else if (e.key === 'Delete') {
      if (start === val.length && end === val.length && i < lines.length - 1) {
        e.preventDefault();
        lines[i] += lines[i + 1];
        lines.splice(i + 1, 1);
        editorText = lines.join('\n');
        handleEditorInput();
        cursorPositionToSet = val.length;
      }
    }
  }

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.text-editor-workspace')) {
      activeLineIndex = null;
    }
    if (contextMenu && !target.closest('.context-menu-container')) {
      contextMenu = null;
    }
  }

  // Resizable left panel splitter state
  let splitWidth = $state(400); // Default instructions panel width

  // Automatically clamp and adjust splitWidth when sidebar position changes to prevent parent container collapsing
  $effect(() => {
    const pos = sidebarPosition;
    untrack(() => {
      if (pos === 'top' || pos === 'bottom') {
        const maxHeight = window.innerHeight - 200;
        if (splitWidth > maxHeight || splitWidth < 100) {
          splitWidth = Math.max(100, Math.min(250, maxHeight));
        }
      } else {
        const maxWidth = window.innerWidth - 300;
        if (splitWidth > maxWidth || splitWidth < 150) {
          splitWidth = Math.max(150, Math.min(350, maxWidth));
        }
      }
    });
  });

  // Resizable editor panel splitter state
  let editorSplitWidth = $state(500); // Default editor panel width when side-by-side
  let editorSplitHeight = $state(300); // Default editor panel height when stacked vertically

  // Automatically clamp and adjust editorSplitWidth and editorSplitHeight when layout, visibility, or dimensions change
  $effect(() => {
    const wl = workspaceLayout;
    const pos = sidebarPosition;
    const sw = splitWidth;
    const sc = showCanvas;
    const st = showText;
    
    untrack(() => {
      const isColumn = pos === 'top' || pos === 'bottom';
      if (wl === 'vertical') {
        const availHeight = window.innerHeight - (isColumn ? sw + 6 : 0);
        // If both canvas and editor are shown, canvas needs at least 150px
        const minCanvasHeight = (sc && st) ? 150 : 0;
        const maxHeight = availHeight - minCanvasHeight;
        if (editorSplitHeight > maxHeight || editorSplitHeight < 100) {
          editorSplitHeight = Math.max(100, Math.min(300, maxHeight));
        }
      } else {
        const isSide = pos === 'left' || pos === 'right';
        const availWidth = window.innerWidth - (isSide ? sw + 6 : 0);
        // If both canvas and editor are shown, canvas needs at least 150px
        const minCanvasWidth = (sc && st) ? 150 : 0;
        const maxWidth = availWidth - minCanvasWidth;
        if (editorSplitWidth > maxWidth || editorSplitWidth < 150) {
          editorSplitWidth = Math.max(150, Math.min(400, maxWidth));
        }
      }
    });
  });

  let isDraggingEditorSplitter = $state(false);
  let editorSplitStartX = 0;
  let editorSplitStartY = 0;
  let editorSplitStartWidth = 0;
  let editorSplitStartHeight = 0;
  let editorSplitDragPointerId = -1;

  function startEditorSplitDrag(e: PointerEvent) {
    isDraggingEditorSplitter = true;
    editorSplitDragPointerId = e.pointerId;
    editorSplitStartX = e.clientX;
    editorSplitStartY = e.clientY;
    editorSplitStartWidth = editorSplitWidth;
    editorSplitStartHeight = editorSplitHeight;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function handleEditorSplitDrag(e: PointerEvent) {
    if (!isDraggingEditorSplitter) return;
    if (workspaceLayout === 'vertical') {
      const deltaY = e.clientY - editorSplitStartY;
      const newHeight = editorSplitStartHeight - deltaY;
      const minHeight = 100;
      const maxHeight = window.innerHeight - 200;
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        editorSplitHeight = newHeight;
      }
    } else {
      const deltaX = e.clientX - editorSplitStartX;
      const newWidth = editorSplitStartWidth - deltaX; // drag right to shrink editor, left to expand
      const minWidth = 150;
      const maxWidth = window.innerWidth - splitWidth - 150;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        editorSplitWidth = newWidth;
      }
    }
  }

  function stopEditorSplitDrag(e: PointerEvent) {
    if (!isDraggingEditorSplitter) return;
    isDraggingEditorSplitter = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(editorSplitDragPointerId);
    } catch (_) {}
    editorSplitDragPointerId = -1;
  }

  let isCustomBgModalOpen = $state(false);

  let isExportingPdf = $state(false);

  // Brush configuration
  let strokeColor = $state('#000000');
  let brushWidth = $state(2);
  let activeTool = $state('pen'); // 'pen' | 'eraser' | 'pan' | 'select' | 'shape'
  let shapeType = $state('rectangle'); // 'circle' | 'ellipse' | 'line' | 'square' | 'rectangle' | 'triangle'
  let canvasSettingsTab = $state<'pageLayout' | 'toolsEraser' | 'viewText' | 'actionsExport'>('pageLayout');
  let pageLayoutSettings = $derived.by(() => {
    if (store.activeTask) {
      if (!store.activeTask.settingsOverride) {
        store.activeTask.settingsOverride = {
          overrideSettings: true,
          overrideCanvas: true,
          canvasMode: store.settings.canvasMode,
          a4Orientation: store.settings.a4Orientation || 'portrait'
        };
      }
      return store.activeTask.settingsOverride;
    }
    return store.settings;
  });
  let targetSettings = $derived(store.settings);

  let cursorClass = $derived.by(() => {
    // If placing a provided image, show crosshair
    if (pendingInsertImage) {
      return 'cursor-crosshair';
    }
    // If the user is writing with a stylus (or the pen tool is active and no buttons are held), show the dot cursor
    if (activeTool === 'pen' && !isPointerEraser && !isPointerSelect && !isPointerPan) {
      return 'cursor-dot';
    }
    // If in stylus mode and using a finger or mouse, show hand cursor for panning
    if (store.settings.stylusMode && lastPointerType !== 'pen' && canvasMode === 'infinite') {
      return isPanning ? 'cursor-grabbing' : 'cursor-grab';
    }
    if (activeTool === 'pan') {
      return isPanning ? 'cursor-grabbing' : 'cursor-grab';
    }
    if (activeTool === 'eraser' || isPointerEraser) {
      return 'cursor-none';
    }
    if (activeTool === 'select' || isPointerSelect) {
      return 'cursor-default';
    }
    return 'cursor-crosshair';
  });

  let cursorStyle = $derived.by(() => {
    if (cursorClass === 'cursor-dot') {
      const escapedColor = encodeURIComponent(strokeColor);
      return `cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><circle cx='8' cy='8' r='3.5' fill='${escapedColor}' stroke='white' stroke-width='1'/></svg>") 8 8, crosshair;`;
    }
    return '';
  });

  // AI feedback overlay states
  let isChecking = $derived(store.isTaskChecking(task.id));
  let feedbackText = $state('');
  let feedbackScore = $state(null);
  let showFeedback = $state(false);
  let showCritiqueBanner = $state(false);
  let hasCheckedWork = $state(false);
  let feedbackMarkers = $state([]);
  let activeTooltipMarker = $state(null);
  let showSuccessNotification = $state(false);

  // Canvas mode derived from store settings (with per-lesson override)
  let canvasMode = $derived(
    store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id).canvasMode
      : store.settings.canvasMode
  );

  let showCanvasAnnotations = $derived(
    store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id).showCanvasAnnotations !== false
      : store.settings.showCanvasAnnotations !== false
  );

  let canvasTextFontSize = $derived(
    store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id).canvasFontSize ?? 13
      : store.settings.canvasFontSize ?? 13
  );

  let editorFontSize = $derived(
    store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id).editorFontSize ?? 16
      : store.settings.editorFontSize ?? 16
  );

  let effectiveEraserSettings = $derived(
    store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id)
      : store.settings
  );

  let eraserWidth = $state(
    ((store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id)
      : store.settings).eraserMode === 'stroke'
      ? (store.activeProject
          ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id)
          : store.settings).eraserRadiusStroke
      : (store.activeProject
          ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id)
          : store.settings).eraserRadiusNormal) ?? 24
  );

  $effect(() => {
    const w = eraserWidth;
    if (w !== undefined && store.settings.eraserRadiusNormal !== w) {
      store.settings.eraserRadiusNormal = w;
      store.settings.penEraserWidth = w;
      store.saveSettings();
    }
  });

  $effect(() => {
    const bg = effectiveEraserSettings.canvasBgPattern;
    if (bg) {
      activeBg = bg;
    }
    const op = effectiveEraserSettings.canvasBgOpacity;
    if (op !== undefined && bgOpacity !== op) {
      bgOpacity = op;
    }
  });

  // A4 Pages state
  let pages = $state([
    {
      id: 'page-' + Date.now(),
      strokeHistory: [],
      redoStack: [],
      eraserUndoStack: []
    }
  ]);
  let activePageIndex = $state(0);

  // Infinite Canvas state
  let infiniteStrokes = $state([]);
  let infiniteRedo = $state([]);
  let infiniteEraserUndo = $state([]);
  let panOffset = $state({ x: 0, y: 0 });
  let isPanning = $state(false);
  let isPinching = $state(false);
  let isWheelActive = $state(false);
  let wheelTimeout: number | null = null;
  let cachedPan = { x: 0, y: 0 };
  let cachedZoom = 1;
  let gestureStartPan = { x: 0, y: 0 };
  let gestureStartZoom = 1;
  let isGesturing = $derived(isPanning || isPinching || isWheelActive);

  $effect(() => {
    if (isGesturing) {
      untrack(() => {
        updateStrokesCache();
        gestureStartPan = { ...panOffset };
        gestureStartZoom = zoomScale;
      });
    }
  });
  let panStart = { x: 0, y: 0 };
  let panBaseOffset = { x: 0, y: 0 };
  let zoomScale = $state(1);
  let currentBgImage = $state(null);

  // Canvas element references & container sizes
  let canvasElement = $state(null);
  let canvasContainer = $state<HTMLElement | null>(null);
  let containerWidth = $state(800);
  let containerHeight = $state(600);

  $effect(() => {
    if (!canvasContainer) return;

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

    resizeObserver.observe(canvasContainer);
    return () => {
      resizeObserver.disconnect();
    };
  });
  
  let a4Orientation = $derived(
    store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id).a4Orientation ?? 'portrait'
      : store.settings.a4Orientation ?? 'portrait'
  );
  let a4BaseWidth = $derived(a4Orientation === 'landscape' ? 1130 : 800);
  let a4BaseHeight = $derived(a4Orientation === 'landscape' ? 800 : 1130);

  let canvasWidth = $derived(canvasMode === 'infinite' ? Math.round(containerWidth / 8) * 8 : a4BaseWidth);
  let baseA4Scale = $derived(
    Math.max(0.1, Math.min(
      containerWidth > 32 ? (containerWidth - 32) / a4BaseWidth : 0.1,
      containerHeight > 32 ? (containerHeight - 32) / a4BaseHeight : 0.1
    ))
  );

  let a4Scale = $derived(
    canvasMode === 'a4' 
      ? baseA4Scale * zoomScale
      : 1
  );

  function clampA4ZoomAndPan(newZoom: number, newPan: { x: number; y: number }): { zoom: number; pan: { x: number; y: number } } {
    if (canvasMode !== 'a4') {
      return {
        zoom: Math.max(0.2, Math.min(4.0, newZoom)),
        pan: {
          x: Math.min(0, newPan.x),
          y: Math.min(0, newPan.y)
        }
      };
    }

    const zoom = Math.max(0.75, Math.min(4.0, newZoom));
    const effectiveA4Scale = baseA4Scale * zoom;
    const displayW = a4BaseWidth * effectiveA4Scale;
    const displayH = a4BaseHeight * effectiveA4Scale;

    const minVisible = 150;
    const maxPanX = Math.max(100, (displayW / 2) + (containerWidth / 2) - minVisible);
    const maxPanY = Math.max(100, (displayH / 2) + (containerHeight / 2) - minVisible);

    return {
      zoom,
      pan: {
        x: Math.max(-maxPanX, Math.min(maxPanX, newPan.x)),
        y: Math.max(-maxPanY, Math.min(maxPanY, newPan.y))
      }
    };
  }
  let ctx = null;

  // Performance: reusable offscreen canvas for stroke compositing
  let offscreenCanvas: HTMLCanvasElement | null = null;
  let offscreenCtx: CanvasRenderingContext2D | null = null;

  // Cache for historical strokes to avoid drawing all strokes every frame
  let cachedStrokesCanvas: HTMLCanvasElement | null = null;
  let cachedStrokesCtx: CanvasRenderingContext2D | null = null;
  let cachedStrokeRefs: Stroke[] = [];
  let cacheIsValid = false;

  function invalidateCache() {
    cacheIsValid = false;
  }

  // Auto-invalidate strokes cache when relevant inputs change
  $effect(() => {
    const _sh = strokeHistory;
    const _shLen = strokeHistory.length;
    const _w = canvasWidth;
    const _h = canvasHeight;
    const _mode = canvasMode;
    if (canvasMode === 'infinite') {
      if (!isGesturing) {
        const _panX = panOffset.x;
        const _panY = panOffset.y;
        const _zoom = zoomScale;
      }
    }
    invalidateCache();
  });

  function updateStrokesCache() {
    if (canvasWidth <= 0 || canvasHeight <= 0) return;

    // If the cache canvas dimensions do not match the current width/height, the cache is invalid.
    const sizeChanged = !cachedStrokesCanvas || 
                        cachedStrokesCanvas.width !== canvasWidth || 
                        cachedStrokesCanvas.height !== canvasHeight;
    
    const panOrZoomChanged = canvasMode === 'infinite' && (
      cachedPan.x !== panOffset.x ||
      cachedPan.y !== panOffset.y ||
      cachedZoom !== zoomScale
    );

    if ((sizeChanged || panOrZoomChanged) && !isGesturing && !isPanning && !isWheelActive) {
      cacheIsValid = false;
    }

    if (cacheIsValid && cachedStrokesCanvas) return;

    if (!cachedStrokesCanvas) {
      cachedStrokesCanvas = document.createElement('canvas');
    }
    if (cachedStrokesCanvas.width !== canvasWidth || cachedStrokesCanvas.height !== canvasHeight) {
      cachedStrokesCanvas.width = canvasWidth;
      cachedStrokesCanvas.height = canvasHeight;
      cachedStrokesCtx = cachedStrokesCanvas.getContext('2d');
      cacheIsValid = false;
    }

    if (cachedStrokesCtx) {
      const currentHistory = strokeHistory;
      
      const canIncrementalDraw = !sizeChanged && !panOrZoomChanged && 
                                 cachedStrokesCanvas && cachedStrokeRefs.length > 0 && 
                                 currentHistory.length >= cachedStrokeRefs.length &&
                                 cachedStrokeRefs.every((stroke, idx) => currentHistory[idx] === stroke);

      if (canIncrementalDraw) {
        cachedStrokesCtx.save();
        if (canvasMode === 'infinite') {
          cachedStrokesCtx.translate(panOffset.x, panOffset.y);
          cachedStrokesCtx.scale(zoomScale, zoomScale);
        }
        for (let i = cachedStrokeRefs.length; i < currentHistory.length; i++) {
          const stroke = currentHistory[i];
          drawStroke(cachedStrokesCtx, stroke);
        }
        cachedStrokesCtx.restore();
      } else {
        cachedStrokesCtx.clearRect(0, 0, cachedStrokesCanvas.width, cachedStrokesCanvas.height);
        cachedStrokesCtx.save();
        if (canvasMode === 'infinite') {
          cachedStrokesCtx.translate(panOffset.x, panOffset.y);
          cachedStrokesCtx.scale(zoomScale, zoomScale);
        }
        for (const stroke of currentHistory) {
          const bounds = stroke.bounds || calculateStrokeBounds(stroke);
          let isVisible = true;
          if (canvasMode === 'infinite') {
            const screenMinX = bounds.minX * zoomScale + panOffset.x;
            const screenMinY = bounds.minY * zoomScale + panOffset.y;
            const screenMaxX = bounds.maxX * zoomScale + panOffset.x;
            const screenMaxY = bounds.maxY * zoomScale + panOffset.y;
            
            isVisible = !(
              screenMaxX < 0 ||
              screenMinX > canvasWidth ||
              screenMaxY < 0 ||
              screenMinY > canvasHeight
            );
          } else {
            isVisible = !(
              bounds.maxX < 0 ||
              bounds.minX > 800 ||
              bounds.maxY < 0 ||
              bounds.minY > 1130
            );
          }
          
          if (isVisible) {
            drawStroke(cachedStrokesCtx, stroke);
          }
        }
        cachedStrokesCtx.restore();
        cachedPan = { ...panOffset };
        cachedZoom = zoomScale;
      }
      
      cachedStrokeRefs = [...currentHistory];
    }
    cacheIsValid = true;
  }

  // Performance: rAF-based redraw scheduling
  let rafPending = false;

  function requestRedraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      redraw();
    });
  }

  // Invalidate offscreen canvas when dimensions change
  $effect(() => {
    const w = canvasWidth;
    const h = canvasHeight;
    if (offscreenCanvas && (offscreenCanvas.width !== w || offscreenCanvas.height !== h)) {
      offscreenCanvas = null;
      offscreenCtx = null;
    }
  });

  // Recent colors and custom color picker states
  let recentColors = $state(['#000000', '#1d4ed8', '#dc2626', '#059669']);
  let colorInput = $state(null);
  let customColorVal = $state('#000000');

  // Selection states
  let selectionBox = $state(null); // { x1, y1, x2, y2 }
  let selectedStrokes = $state([]); // array of stroke objects
  let copiedStrokes = $state([]); // array of copied stroke objects
  let copiedImages = $state([]); // array of copied image objects
  let isMovingSelection = $state(false);
  let isResizingSelection = $state(false);
  let selectionResizeStartBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let selectionDragStart = { x: 0, y: 0 };
  let selectionStartStrokes = [];
  let selectionStartImageRects = [];
  let lastCopiedDrawingTime = 0;
  let lastClipboardImageTime = 0;
  let lastClipboardImageHash = '';
  let canvasRecentColors = $derived(store.settings.penRecentColors || ['#000000', '#1d4ed8', '#dc2626', '#059669']);
  let contextMenu = $state(null); // { x, y, canvasX, canvasY }
  let longPressTimer = null;

  // Custom Color Picker Modal states for selection
  let showSelectionColorPicker = $state(false);
  let selectionHue = $state(0);
  let selectionSat = $state(100);
  let selectionLight = $state(50);
  let selectionPickerColor = $derived(`hsl(${selectionHue}, ${selectionSat}%, ${selectionLight}%)`);

  function openSelectionColorPicker() {
    const initialColor = selectedStrokes.length > 0 ? (selectedStrokes[0].color || strokeColor) : strokeColor;
    const hsl = hexToHsl(initialColor);
    selectionHue = hsl.h;
    selectionSat = hsl.s;
    selectionLight = hsl.l;
    showSelectionColorPicker = true;
  }

  function confirmSelectionColorPicker() {
    const hex = hslToHex(selectionHue, selectionSat, selectionLight);
    changeSelectedStrokesColor(hex);
    
    // Add custom color to palette if not exists
    if (!store.settings.penRecentColors.some(c => c.toLowerCase() === hex.toLowerCase())) {
      if (store.settings.penRecentColors.length >= 8) {
        store.settings.penRecentColors = [...store.settings.penRecentColors.slice(1), hex];
      } else {
        store.settings.penRecentColors = [...store.settings.penRecentColors, hex];
      }
      store.saveSettings();
    }
    
    showSelectionColorPicker = false;
  }

  function hexToHsl(hex: string) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    if (!result) return { h: 0, s: 100, l: 50 };
    
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  function hslToHex(h: number, s: number, l: number) {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }



  // Canvas Image states
  interface CanvasImage {
    id: string;
    mediaId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    pageIndex: number;
    zIndex?: number;
  }
  let canvasImages = $state<CanvasImage[]>([]);
  let selectedImages = $state<CanvasImage[]>([]);
  let selectedImage = $derived(selectedImages.length === 1 && selectedStrokes.length === 0 ? selectedImages[0] : null);
  let isMovingImage = $state(false);
  let isResizingImage = $state(false);
  let imageDragStart = { x: 0, y: 0 };
  let imageStartRect = { x: 0, y: 0, width: 0, height: 0 };
  let imageStartAspectRatio = 1;
  let imageElementCache = $state<Record<string, HTMLImageElement>>({});

  // Pending provided image insertion state
  let pendingInsertImage = $state<{ name: string; dataUrl?: string; mediaId?: string } | null>(null);

  let selectionBoundingBox = $derived.by(() => {
    // If only a single image is selected (and no strokes), return its bounding box
    if (selectedImages.length === 1 && selectedStrokes.length === 0) {
      const img = selectedImages[0];
      return {
        minX: img.x,
        minY: img.y,
        maxX: img.x + img.width,
        maxY: img.y + img.height
      };
    }

    if (selectedStrokes.length === 0 && selectedImages.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Add selected strokes bounds
    for (const stroke of selectedStrokes) {
      const halfWidth = stroke.width / 2;
      for (const p of stroke.points) {
        if (p.x - halfWidth < minX) minX = p.x - halfWidth;
        if (p.y - halfWidth < minY) minY = p.y - halfWidth;
        if (p.x + halfWidth > maxX) maxX = p.x + halfWidth;
        if (p.y + halfWidth > maxY) maxY = p.y + halfWidth;
      }
    }

    // Add selected images bounds
    for (const img of selectedImages) {
      if (img.x < minX) minX = img.x;
      if (img.y < minY) minY = img.y;
      if (img.x + img.width > maxX) maxX = img.x + img.width;
      if (img.y + img.height > maxY) maxY = img.y + img.height;
    }

    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
  });

  function selectColor(color) {
    strokeColor = color;
    activeTool = 'pen';
  }

  function addColorToPalette() {
    if (recentColors.includes(strokeColor)) return;
    if (recentColors.length >= 8) {
      recentColors = [...recentColors.slice(1), strokeColor];
    } else {
      recentColors = [...recentColors, strokeColor];
    }
    store.settings.recentColors = recentColors;
    store.saveSettings();
  }

  function removeColorFromPalette(idx) {
    if (recentColors.length <= 1) return;
    recentColors = recentColors.filter((_, i) => i !== idx);
    store.settings.recentColors = recentColors;
    store.saveSettings();
  }

  let isCustomColorInPalette = $derived(recentColors.includes(strokeColor));

  $effect(() => {
    if (canvasContainer) {
      canvasContainer.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        canvasContainer?.removeEventListener('wheel', handleWheel);
      };
    }
  });

  onMount(() => {
    const savedRecents = store.settings.recentColors; if (savedRecents.length > 0) { recentColors = [...savedRecents]; }
  });

  // Active stroke lists mapped as derived properties
  let strokeHistory = $derived(
    canvasMode === 'a4' 
      ? (pages[activePageIndex]?.strokeHistory || []) 
      : infiniteStrokes
  );
  let redoStack = $derived(
    canvasMode === 'a4'
      ? (pages[activePageIndex]?.redoStack || [])
      : infiniteRedo
  );
  let eraserUndoStack = $derived(
    canvasMode === 'a4'
      ? (pages[activePageIndex]?.eraserUndoStack || [])
      : infiniteEraserUndo
  );

  // Snaps line to horizontal or vertical if it's within ±5 degrees
  function snapLine(start: { x: number; y: number }, end: { x: number; y: number }) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return { ...end };

    // Distance threshold in pixels: max 15px, scaled down for short lines
    const threshold = Math.min(15, length * 0.25);

    if (Math.abs(dy) <= threshold && Math.abs(dx) >= Math.abs(dy)) {
      return { x: start.x + (dx >= 0 ? length : -length), y: start.y };
    }
    if (Math.abs(dx) <= threshold && Math.abs(dy) >= Math.abs(dx)) {
      return { x: start.x, y: start.y + (dy >= 0 ? length : -length) };
    }

    return { ...end };
  }

  // Straightening gesture states
  let straightenTimer: any = null;
  let straightenAnchorScreen: { x: number; y: number } | null = null;
  let isStraightening = $state(false);
  let straightLineStart = $state<{ x: number; y: number } | null>(null);
  let straightLineEnd = $state<{ x: number; y: number } | null>(null);

  function clearStraightenTimer() {
    if (straightenTimer) {
      clearTimeout(straightenTimer);
      straightenTimer = null;
    }
    straightenAnchorScreen = null;
  }

  function startStraightenTimer(coords: { x: number; y: number }, clientX: number, clientY: number) {
    clearStraightenTimer();
    straightenAnchorScreen = { x: clientX, y: clientY };
    straightenTimer = setTimeout(() => {
      isStraightening = true;
      straightLineStart = currentStroke[0] || coords;
      straightLineEnd = coords;
    }, 600);
  }

  // Stroke history state
  let isDrawing = false;
  let currentStroke = $state([]);
  let isShapeDrawing = $state(false);
  let shapeAnchorX = $state(0);
  let shapeAnchorY = $state(0);
  let shapePreviewX = $state(0);
  let shapePreviewY = $state(0);
  let rememberedShapeType = $state('rectangle');
  let isPointerEraser = $state(false);
  let isPointerSelect = $state(false);
  let isPointerPan = $state(false);
  let isPointerPen = $state(false);
  let isStrokeErasing = $state(false);
  let lastStrokeEraserCoords: Point | null = null;
  let isSelectToolOneShot = $state(false);
  let lastPointerType = $state('mouse');
  let hoverPos = $state(null);

  let previousTool = $state('pen');
  let keyboardToolSwitch = $state(false);
  let keyboardToolSwitchTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (activeTool !== 'select') {
      previousTool = activeTool;
    }
  });

  $effect(() => {
    const btn = store.lastDetectedButton;
    if (!btn) return;
    const isPenHovering = lastPointerType === 'pen';
    if (!isPenHovering) return;
    const stylusButtons = store.settings.stylusButtons || [];
    for (const mapping of stylusButtons) {
      const matchButton = mapping.button !== undefined && mapping.button !== null && btn.button === mapping.button;
      const matchButtons = mapping.buttons !== undefined && mapping.buttons !== null && mapping.buttons !== 0 && (btn.buttons & mapping.buttons) !== 0;
      if (matchButton || matchButtons) {
        if (mapping.action === 'eraser') {
          activeTool = 'eraser';
        } else if (mapping.action === 'select') {
          activeTool = 'select';
        } else if (mapping.action === 'pan') {
          activeTool = 'pan';
        } else if (mapping.action === 'pen') {
          activeTool = 'pen';
        }
        keyboardToolSwitch = true;
        if (keyboardToolSwitchTimeout) clearTimeout(keyboardToolSwitchTimeout);
        keyboardToolSwitchTimeout = setTimeout(() => { keyboardToolSwitch = false; }, 1000);
        break;
      }
    }
  });

  let activePointers = new Map<number, PointerEvent>();
  let initialPinchDistance = 0;
  let initialPinchZoom = 1;
  let initialPinchMidpoint = { x: 0, y: 0 };
  let initialPinchPanOffset = { x: 0, y: 0 };

  let eraserScreenDiameter = $derived(
    (activeTool === 'eraser' || isPointerEraser)
      ? eraserWidth * (canvasMode === 'infinite' ? zoomScale : a4Scale)
      : 0
  );



  // Dynamic background mapping
  let currentBgObject = $derived(
    store.customBackgrounds.find(bg => bg.id === activeBg)
  );
  let customBgUrlCache = $state<Record<string, string>>({});
  let currentBgUrl = $derived(
    activeBg === 'grid' || activeBg === 'lines' || activeBg === 'blank'
      ? null
      : (currentBgObject ? (customBgUrlCache[currentBgObject.id] || null) : customBgUrl)
  );

  // Load custom background from filesystem when selected
  $effect(() => {
    const bg = currentBgObject;
    if (bg && bg.mediaId && !customBgUrlCache[bg.id]) {
      getMediaDataUrl(bg.mediaId).then(url => {
        customBgUrlCache[bg.id] = url;
      }).catch(() => {});
    }
  });

  // Load direct background diagram by UUID when selected
  $effect(() => {
    const bg = activeBg;
    if (bg && bg !== 'grid' && bg !== 'lines' && bg !== 'blank' && !currentBgObject) {
      getMediaDataUrl(bg).then(url => {
        customBgUrl = url;
      }).catch(() => {
        customBgUrl = null;
      });
    } else {
      customBgUrl = null;
    }
  });

  // Load and cache canvas image media files asynchronously when canvasImages updates
  $effect(() => {
    for (const canvasImg of canvasImages) {
      const mediaId = canvasImg.mediaId;
      if (mediaId && !imageElementCache[mediaId]) {
        // Create an Image object placeholder to prevent double loading
        imageElementCache[mediaId] = new Image();
        getMediaDataUrl(mediaId).then(dataUrl => {
          const img = new Image();
          img.src = dataUrl;
          img.onload = () => {
            imageElementCache[mediaId] = img;
            imageElementCache = { ...imageElementCache }; // Trigger Svelte 5 state reactivity!
            redraw();
          };
          img.onerror = () => {
            console.error('Failed to load canvas image: ' + mediaId);
          };
        }).catch(err => {
          console.error(err);
        });
      }
    }
  });

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find(f => f.type.startsWith('image/'));
      if (imageFile) {
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          try {
            const mediaId = await saveMediaToDb(dataUrl, imageFile.name);
            
            const rect = canvasElement.getBoundingClientRect();
            const scaleX = rect.width > 0 ? (canvasElement.width / rect.width) : 1;
            const scaleY = rect.height > 0 ? (canvasElement.height / rect.height) : 1;
            const dropClientX = (e.clientX - rect.left) * scaleX;
            const dropClientY = (e.clientY - rect.top) * scaleY;
            
            let dropX = 0;
            let dropY = 0;
            if (canvasMode === 'infinite') {
              dropX = (dropClientX - panOffset.x) / zoomScale;
              dropY = (dropClientY - panOffset.y) / zoomScale;
            } else {
              dropX = dropClientX;
              dropY = dropClientY;
            }

            const img = new Image();
            img.src = dataUrl;
            img.onload = () => {
              let width = img.naturalWidth || img.width;
              let height = img.naturalHeight || img.height;
              const maxDim = 400;
              if (width > maxDim || height > maxDim) {
                const scale = Math.min(maxDim / width, maxDim / height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
              }

              const newImage: CanvasImage = {
                id: 'img-' + Date.now(),
                mediaId,
                x: dropX - width / 2,
                y: dropY - height / 2,
                width,
                height,
                pageIndex: canvasMode === 'a4' ? activePageIndex : 0,
                zIndex: Date.now()
              };

              const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
              undoStack.push({
                type: 'insert_image',
                image: newImage
              });
              if (canvasMode === 'a4') {
                pages[activePageIndex].redoStack = [];
              } else {
                infiniteRedo = [];
              }
              canvasImages = [...canvasImages, newImage];
              selectedImages = [canvasImages.find(img => img.id === newImage.id) || newImage];
              selectedStrokes = [];
              saveToStore();
            };
          } catch (err) {
            console.error('Failed to save drop image:', err);
          }
        };
        reader.readAsDataURL(imageFile);
      }
    }
  }

  function handleSelectProvidedImage(file: any) {
    pendingInsertImage = file;
    store.showNotification(t('practice.canvas.clickToPlace', { name: getBaseName(file.name) }), 'info');
  }

  async function handlePlaceImage(e: PointerEvent | MouseEvent) {
    if (!pendingInsertImage || !canvasElement) return;
    
    const file = pendingInsertImage;
    pendingInsertImage = null;

    // Resolve dataUrl
    let dataUrl = file.dataUrl || '';
    if (!dataUrl && file.mediaId) {
      try {
        dataUrl = await getMediaDataUrl(file.mediaId);
      } catch (_) {}
    }
    if (!dataUrl) {
      store.showNotification(t('practice.infoPanels.mediaError'), 'error');
      return;
    }

    // Get the mediaId — if the file already has one use it, otherwise save to DB
    let mediaId = file.mediaId || '';
    if (!mediaId) {
      try {
        mediaId = await saveMediaToDb(dataUrl, file.name);
      } catch (err) {
        console.error('Failed to save provided image:', err);
        return;
      }
    }

    // Calculate click position in canvas coordinates
    const rect = canvasElement.getBoundingClientRect();
    const scaleX = rect.width > 0 ? (canvasElement.width / rect.width) : 1;
    const scaleY = rect.height > 0 ? (canvasElement.height / rect.height) : 1;
    const clickClientX = (e.clientX - rect.left) * scaleX;
    const clickClientY = (e.clientY - rect.top) * scaleY;
    
    let placeX = 0;
    let placeY = 0;
    if (canvasMode === 'infinite') {
      placeX = (clickClientX - panOffset.x) / zoomScale;
      placeY = (clickClientY - panOffset.y) / zoomScale;
    } else {
      placeX = clickClientX;
      placeY = clickClientY;
    }

    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      const maxDim = 400;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const newImage: CanvasImage = {
        id: 'img-' + Date.now(),
        mediaId,
        x: placeX - width / 2,
        y: placeY - height / 2,
        width,
        height,
        pageIndex: canvasMode === 'a4' ? activePageIndex : 0,
        zIndex: Date.now()
      };

      const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
      undoStack.push({
        type: 'insert_image',
        image: newImage
      });
      if (canvasMode === 'a4') {
        pages[activePageIndex].redoStack = [];
      } else {
        infiniteRedo = [];
      }
      canvasImages = [...canvasImages, newImage];
      selectedImages = [canvasImages.find(img => img.id === newImage.id) || newImage];
      selectedStrokes = [];
      saveToStore();
    };
  }

  let isOnlyMcCorrected = $derived(
    task.multipleChoiceTasks && task.multipleChoiceTasks.length > 0 &&
    !(pages && pages.some((p: any) => p.strokeHistory && p.strokeHistory.length > 0)) &&
    !(infiniteStrokes && infiniteStrokes.length > 0) &&
    !(canvasImages && canvasImages.length > 0) &&
    !(editorText && editorText.trim() !== '')
  );

  const mcEvaluationMarkdown = $derived.by(() => {
    if (!task.multipleChoiceTasks || task.multipleChoiceTasks.length === 0) return '';
    const result = gradeMultipleChoiceLocally(task.multipleChoiceTasks, selectedAnswers);
    return result.feedbackText;
  });

  const combinedSolutionContent = $derived.by(() => {
    let parts: string[] = [];
    if (task.solution && task.solution.trim()) {
      parts.push(task.solution.trim());
    }
    return parts.join('\n\n---\n\n');
  });

  let activeLeftPanels = $derived([
    (() => {
      const hasTaskData = (task.instructions && task.instructions.trim() !== '') || (task.instructionFiles && task.instructionFiles.length > 0) || task.instructionFile;
      return showTask && hasTaskData && { id: 'task', title: `${task.category && task.category !== 'Basics' ? task.category + ' - ' : ''}${task.name}`, content: task.instructions };
    })(),
    (() => {
      const hasSolutionData = (combinedSolutionContent && combinedSolutionContent.trim() !== '') || (task.solutionFiles && task.solutionFiles.length > 0) || task.solutionFile;
      return showSolution && hasSolutionData && { id: 'solution', title: t('practice.evaluationGoal'), content: combinedSolutionContent };
    })(),
    showFeedback && hasCheckedWork && { 
      id: 'feedback', 
      title: isOnlyMcCorrected ? 'Feedback' : t('practice.aiCritiqueFeedback'), 
      isFeedback: true 
    }
  ].filter(Boolean));

  // Initialize context when canvas mounts or switches
  $effect(() => {
    if (canvasElement) {
      ctx = canvasElement.getContext('2d');
      invalidateCache();
      redraw();
    }
  });



  // Fetch and cache the background pattern image when currentBgUrl changes
  $effect(() => {
    const url = currentBgUrl;
    if (url) {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        currentBgImage = img;
        redraw();
      };
      img.onerror = () => {
        currentBgImage = null;
        redraw();
      };
    } else {
      currentBgImage = null;
    }
  });

  // Automatically redraw canvas when visual dependencies change (Svelte 5 run-loop)
  $effect(() => {
    // Layout and container dependency triggers to ensure redraw on resize or layout changes
    const pos = sidebarPosition;
    const wl = workspaceLayout;
    const sc = showCanvas;
    const st = showText;
    const sw = splitWidth;
    const esw = editorSplitWidth;
    const esh = editorSplitHeight;
    const cw = containerWidth;
    const ch = containerHeight;
    const scaleA4 = a4Scale;

    const bg = activeBg;
    const opacity = bgOpacity;
    const offset = panOffset;
    const pIndex = activePageIndex;
    const history = strokeHistory;
    const actStroke = currentStroke;
    const scale = zoomScale;
    const bgImg = currentBgImage;
    const w = canvasWidth;
    const h = canvasHeight;
    
    // Selection visual triggers
    const selBox = selectionBox;
    const selStrokes = selectedStrokes;
    const isMoving = isMovingSelection;
    const bounds = selectionBoundingBox;

    // Shape drawing triggers
    const shapeDraw = isShapeDrawing;
    const sAnchorX = shapeAnchorX;
    const sAnchorY = shapeAnchorY;
    const sPrevX = shapePreviewX;
    const sPrevY = shapePreviewY;
    const sType = shapeType;

    // Straightening triggers
    const isStr = isStraightening;
    const strStart = straightLineStart;
    const strEnd = straightLineEnd;

    // Image triggers
    const imgs = canvasImages;
    const selImg = selectedImage;
    const imgCache = imageElementCache;
    const isMovImg = isMovingImage;
    const isResImg = isResizingImage;

    if (ctx && canvasElement) {
      requestRedraw();
    }
  });

  function loadCritiqueForActiveMode() {
    if (!task || !task.id) return;

    if (store.isTaskChecking(task.id)) {
      feedbackText = t('practice.canvas.analyzing') || "Analyzing stroke geometries and guidelines alignment...";
      feedbackScore = null;
      feedbackMarkers = [];
      hasCheckedWork = true;
      showFeedback = true;
      showCritiqueBanner = true;
      return;
    }
    
    const critique = task.critique;
    if (critique) {
      // Check if this is a split critique (e.g. text/canvas was evaluated separately)
      const hasSplitCanvas = critique.canvasCritique && critique.canvasCritique.feedbackText;
      const hasSplitText = critique.textCritique && critique.textCritique.feedbackText;
      
      if (hasSplitCanvas || hasSplitText) {
        if (activeMode === 'text') {
          const textCritique = critique.textCritique;
          if (textCritique) {
            feedbackText = textCritique.feedbackText || '';
            feedbackScore = textCritique.feedbackScore ?? null;
            feedbackMarkers = [];
            hasCheckedWork = true;
            showFeedback = isInitializingTask ? (store.settings.showCritiqueByDefault ?? true) : showFeedback;
          } else {
            feedbackText = '';
            feedbackScore = null;
            feedbackMarkers = [];
            hasCheckedWork = false;
            showFeedback = false;
          }
        } else {
          const canvasCritique = critique.canvasCritique || critique;
          feedbackText = canvasCritique.feedbackText || '';
          feedbackScore = canvasCritique.feedbackScore ?? null;
          feedbackMarkers = canvasCritique.feedbackMarkers || [];
          hasCheckedWork = !!canvasCritique.feedbackText;
          showFeedback = isInitializingTask ? (hasCheckedWork && (store.settings.showCritiqueByDefault ?? true)) : (hasCheckedWork && showFeedback);
        }
      } else {
        // Unified critique mode (both active, or legacy format without split critiques)
        feedbackText = critique.feedbackText || '';
        feedbackScore = critique.feedbackScore ?? null;
        if (activeMode === 'text') {
          feedbackMarkers = [];
        } else {
          feedbackMarkers = critique.feedbackMarkers || [];
        }
        hasCheckedWork = !!critique.feedbackText;
        showFeedback = isInitializingTask ? (hasCheckedWork && (store.settings.showCritiqueByDefault ?? true)) : (hasCheckedWork && showFeedback);
      }
      showCritiqueBanner = false;
    } else {
      feedbackText = '';
      feedbackScore = null;
      feedbackMarkers = [];
      hasCheckedWork = false;
      showFeedback = false;
      showCritiqueBanner = false;
    }
  }

  let activeTextTooltip = $state<{ type: string; feedback: string } | null>(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let tooltipColor = $state('');
  let tooltipPosition = $state<'top' | 'bottom'>('top');

  function handlePreviewPointerOver(e: PointerEvent) {
    const target = e.target as HTMLElement;
    const highlight = target.closest('.text-error-highlight') as HTMLElement;
    if (highlight) {
      const type = highlight.getAttribute('data-type') || 'partial';
      const feedback = highlight.getAttribute('data-feedback') || '';
      const correctness = highlight.getAttribute('data-correctness') || 'partial';

      activeTextTooltip = { type: correctness, feedback };
      
      const rect = highlight.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      
      const tooltipHalfWidth = 128;
      tooltipX = Math.max(tooltipHalfWidth + 12, Math.min(window.innerWidth - (tooltipHalfWidth + 12), x));
      
      // Position above or below depending on vertical space
      if (rect.top < 80) {
        tooltipPosition = 'bottom';
        tooltipY = rect.bottom;
      } else {
        tooltipPosition = 'top';
        tooltipY = rect.top;
      }

      if (correctness === 'correct') {
        tooltipColor = 'text-emerald-500';
      } else if (correctness === 'partial') {
        tooltipColor = 'text-amber-500';
      } else {
        tooltipColor = 'text-red-500';
      }
    }
  }

  function handlePreviewPointerOut(e: PointerEvent) {
    activeTextTooltip = null;
  }

  function getParsedPreviewHtml(text: string): string {
    const rawHtml = parseMarkdown(text);
    if (!showFeedback || !hasCheckedWork || isChecking) {
      return rawHtml;
    }
    
    const textCritique = task?.critique?.textCritique;
    if (!textCritique || !textCritique.feedbackMarkers || textCritique.feedbackMarkers.length === 0) {
      return rawHtml;
    }
    
    const htmlLines = rawHtml.split('<br>');
    
    const markers = textCritique.feedbackMarkers;
    for (const marker of markers) {
      if (!marker.substring) continue;
      const lineIdx = marker.lineIndex;
      if (lineIdx < 0 || lineIdx >= htmlLines.length) continue;
      
      const lineHtml = htmlLines[lineIdx];
      const escapedSub = marker.substring
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        
      if (!lineHtml.includes(escapedSub)) continue;
      
      let colorClass = 'border-red-500 bg-red-500/10 hover:bg-red-500/20';
      if (marker.type === 'correct') {
        colorClass = 'border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20';
      } else if (marker.type === 'partial') {
        colorClass = 'border-amber-500 bg-amber-500/10 hover:bg-amber-500/20';
      }
      
      const escapedFeedback = marker.feedback.replace(/"/g, '&quot;');
      const highlightHtml = `<span class="text-error-highlight border-b-2 ${colorClass} cursor-help inline-block" style="text-decoration: none;" data-type="${marker.type}" data-feedback="${escapedFeedback}" data-correctness="${marker.type}">${escapedSub}</span>`;
      
      htmlLines[lineIdx] = lineHtml.replace(escapedSub, highlightHtml);
    }
    
    return htmlLines.join('<br>');
  }

  $effect(() => {
    // Reload critique when switching editor activeMode, task critique updates, or checking status updates
    const mode = activeMode;
    const crit = task?.critique;
    const isCheckingStatus = store.isTaskChecking(task.id);
    if (task && task.id) {
      loadCritiqueForActiveMode();
    }
  });

  let lastCritiqueScore = $state<number | null | undefined>(undefined);
  $effect(() => {
    const newScore = task?.critique?.feedbackScore;
    if (task && task.id === lastTaskId) {
      if (newScore === 100 && lastCritiqueScore !== 100 && !isInitializingTask) {
        showSuccessNotification = true;
        setTimeout(() => {
          showSuccessNotification = false;
        }, 3500);
      }
    }
    lastCritiqueScore = newScore;
  });

  let isInitializingTask = false;
  let lastTaskId = $state(null);
  $effect(() => {
    if (task && task.id && task.id !== lastTaskId) {
      isInitializingTask = true;
      lastTaskId = task.id;
      loadCritiqueForActiveMode();
      
      const hasMc = task.multipleChoiceTasks && task.multipleChoiceTasks.length > 0;
      const hasSavedCritique = !!(task.critique && (
        task.critique.feedbackText || 
        (task.critique.canvasCritique && task.critique.canvasCritique.feedbackText) || 
        (task.critique.textCritique && task.critique.textCritique.feedbackText)
      ));
      if (hasMc && hasSavedCritique) {
        showSolution = true;
      } else {
        showSolution = false;
      }

      lastCritiqueScore = task?.critique?.feedbackScore;
      
      const hasInstructions = task.instructions && task.instructions.trim() !== '';
      const hasInstructionFiles = task.instructionFiles && task.instructionFiles.length > 0;
      const hasProvidedFiles = task.providedFiles && task.providedFiles.length > 0;
      const hasLegacyInstructionFile = !!task.instructionFile;
      
      if (!hasInstructions && !hasInstructionFiles && !hasProvidedFiles && !hasLegacyInstructionFile) {
        showTask = false;
      } else {
        showTask = true;
      }
      
      const targetBg = task.background || store.activeProject?.default_background || 'grid';
      activeBg = targetBg;
      
      tick().then(() => {
        isInitializingTask = false;
      });
    }
  });

  $effect(() => {
    const bg = activeBg;
    if (isInitializingTask) return;
    if (!task || !task.id) return;
    if (store.activeProject) {
      store.updateTaskBackground(store.activeProject.id, task.id, bg);
    }
  });

  // Watch canvasMode to reset zoom/pan
  let lastCanvasMode = '';
  $effect(() => {
    const currentMode = canvasMode;
    if (currentMode !== lastCanvasMode) {
      lastCanvasMode = currentMode;
      zoomScale = 1;
      panOffset = { x: 0, y: 0 };
    }
  });

  // Watch activeTool to reset selection/drawing states
  $effect(() => {
    const tool = activeTool;
    activeTooltipMarker = null;
    isPanning = false;
    isDrawing = false;
    isStrokeErasing = false;
    lastStrokeEraserCoords = null;
    currentStroke = [];
    isShapeDrawing = false;

    // Smart shape persistence
    if (activeTool === 'shape') {
      if (rememberedShapeType) {
        shapeType = rememberedShapeType;
      }
    } else {
      rememberedShapeType = shapeType;
    }
    
    // Reset selection states
    selectionBox = null;
    isMovingSelection = false;
    contextMenu = null;
  });

  // Save drawing state helper
  let saveTimeout = null;
  function saveToStoreDebounced() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveToStore(false);
      saveTimeout = null;
    }, 500);
  }

  function saveToStore(writeToDisk = false) {
    if (!task || !task.id) return;

    const pagesData = writeToDisk ? JSON.parse(JSON.stringify(pages)) : pages;
    const infiniteStrokesData = writeToDisk ? JSON.parse(JSON.stringify(infiniteStrokes)) : infiniteStrokes;
    const infiniteRedoData = writeToDisk ? JSON.parse(JSON.stringify(infiniteRedo)) : infiniteRedo;
    const infiniteEraserUndoData = writeToDisk ? JSON.parse(JSON.stringify(infiniteEraserUndo)) : infiniteEraserUndo;
    const canvasImagesData = writeToDisk ? JSON.parse(JSON.stringify(canvasImages)) : canvasImages;

    store.saveCanvasState(task.id, {
      pages: pagesData,
      infiniteStrokes: infiniteStrokesData,
      infiniteRedo: infiniteRedoData,
      infiniteEraserUndo: infiniteEraserUndoData,
      panOffset: { ...panOffset },
      zoomScale,
      activePageIndex,
      canvasImages: canvasImagesData
    }, writeToDisk);
  }

  function handleAnswersChanged(newAnswers: Record<string, string[]>) {
    selectedAnswers = newAnswers;
    if (task.id) {
      store.saveMultipleChoiceAnswers(task.id, newAnswers);
    }
  }



  let lastInitializedTaskId = '';
  let lastInitializedAttemptId = '';

  function performLoadState(taskId: string) {
    // Clear selections since we switched task/reloaded
    selectedStrokes = [];
    selectedImages = [];
    selectionBox = null;
    isMovingSelection = false;

    const saved = store.getCanvasState(taskId);
    const text = store.getEditorText(taskId) || '';
    
    const hasDrawing = saved && (
      (saved.infiniteStrokes && saved.infiniteStrokes.length > 0) || 
      (saved.pages && saved.pages.some((p: any) => p.strokeHistory && p.strokeHistory.length > 0)) ||
      (saved.canvasImages && saved.canvasImages.length > 0)
    );
    const hasText = text.trim() !== '';
    
    // Union logic: start with default edit mode, then additionally show any editor with existing data
    const defaultMode = task.defaultEditMode !== undefined ? task.defaultEditMode : 'both';
    const activeModes = defaultMode ? defaultMode.split(',').map(m => m.trim()) : [];
    
    if (activeModes.includes('both')) {
      showCanvas = true;
      showText = true;
      showMultipleChoice = false;
    } else if (defaultMode === 'none' || defaultMode === '') {
      showCanvas = false;
      showText = false;
      showMultipleChoice = false;
    } else {
      showCanvas = activeModes.includes('canvas');
      showText = activeModes.includes('text');
      showMultipleChoice = activeModes.includes('multiple_choice');
    }

    // Check if MC tasks are defined
    const hasMc = task.multipleChoiceTasks && task.multipleChoiceTasks.length > 0;
    if (!hasMc) {
      showMultipleChoice = false;
    }

    // Union logic: Additionally open editors that contain data
    if (hasDrawing) showCanvas = true;
    if (hasText) showText = true;
    
    // If none are open and defaultMode is not explicitly 'none'/'', fallback
    if (!showCanvas && !showText && !showMultipleChoice && defaultMode !== 'none' && defaultMode !== '') {
      if (hasMc) {
        showMultipleChoice = true;
      } else {
        showCanvas = true;
      }
    }

    const activeAttempt = task.attempts?.find(a => a.id === task.activeAttemptId);
    selectedAnswers = activeAttempt?.multipleChoiceAnswers || {};

    if (saved && hasDrawing) {
      pages = saved.pages || [
        {
          id: 'page-' + Date.now(),
          strokeHistory: [],
          redoStack: [],
          eraserUndoStack: []
        }
      ];
      for (const page of pages) {
        if (!page.eraserUndoStack) page.eraserUndoStack = [];
        for (const stroke of page.strokeHistory || []) {
          if (!stroke.id) stroke.id = Math.random().toString(36).substring(2, 9);
          ensureStrokeBounds(stroke);
        }
        for (const action of page.redoStack || []) {
          if (action && action.type === 'stroke' && action.stroke) {
            if (!action.stroke.id) action.stroke.id = Math.random().toString(36).substring(2, 9);
            ensureStrokeBounds(action.stroke);
          }
        }
        for (const action of page.eraserUndoStack || []) {
          if (action && action.points) {
            if (!action.id) action.id = Math.random().toString(36).substring(2, 9);
            ensureStrokeBounds(action);
          } else if (action && action.type === 'stroke' && action.stroke) {
            if (!action.stroke.id) action.stroke.id = Math.random().toString(36).substring(2, 9);
            ensureStrokeBounds(action.stroke);
          } else if (action && action.removedStrokes) {
            for (const s of action.removedStrokes || []) {
              if (!s.id) s.id = Math.random().toString(36).substring(2, 9);
              ensureStrokeBounds(s);
            }
            for (const s of action.addedStrokes || []) {
              if (!s.id) s.id = Math.random().toString(36).substring(2, 9);
              ensureStrokeBounds(s);
            }
          }
        }
      }
      infiniteStrokes = saved.infiniteStrokes || [];
      for (const stroke of infiniteStrokes) {
        if (!stroke.id) stroke.id = Math.random().toString(36).substring(2, 9);
        ensureStrokeBounds(stroke);
      }
      infiniteRedo = saved.infiniteRedo || [];
      for (const action of infiniteRedo) {
        if (action && action.type === 'stroke' && action.stroke) {
          if (!action.stroke.id) action.stroke.id = Math.random().toString(36).substring(2, 9);
          ensureStrokeBounds(action.stroke);
        }
      }
      infiniteEraserUndo = saved.infiniteEraserUndo || [];
      for (const action of infiniteEraserUndo) {
        if (action && action.points) {
          if (!action.id) action.id = Math.random().toString(36).substring(2, 9);
          ensureStrokeBounds(action);
        } else if (action && action.type === 'stroke' && action.stroke) {
          if (!action.stroke.id) action.stroke.id = Math.random().toString(36).substring(2, 9);
          ensureStrokeBounds(action.stroke);
        } else if (action && action.removedStrokes) {
          for (const s of action.removedStrokes || []) {
            if (!s.id) s.id = Math.random().toString(36).substring(2, 9);
            ensureStrokeBounds(s);
          }
          for (const s of action.addedStrokes || []) {
            if (!s.id) s.id = Math.random().toString(36).substring(2, 9);
            ensureStrokeBounds(s);
          }
        }
      }
      panOffset = saved.panOffset || { x: 0, y: 0 };
      zoomScale = saved.zoomScale || 1;
      activePageIndex = saved.activePageIndex || 0;
      canvasImages = saved.canvasImages || [];
    } else {
      pages = [
        {
          id: 'page-' + Date.now(),
          strokeHistory: [],
          redoStack: [],
          eraserUndoStack: []
        }
      ];
      infiniteStrokes = [];
      canvasImages = [];
      infiniteRedo = [];
      infiniteEraserUndo = [];
      panOffset = { x: 0, y: 0 };
      zoomScale = 1;
      activePageIndex = 0;
    }
  }

  // Load saved drawing state when active task shifts
  $effect(() => {
    const taskId = task.id;
    const attemptId = task.activeAttemptId;
    if (taskId) {
      const isNewTaskOrAttempt = taskId !== lastInitializedTaskId || attemptId !== lastInitializedAttemptId;
      if (!isNewTaskOrAttempt) return;

      untrack(() => {
        showSolution = false;
        // Save previous state to disk before we switch task/attempt
        if (lastInitializedTaskId && lastInitializedAttemptId) {
          store.saveCanvasState(lastInitializedTaskId, {
            pages: JSON.parse(JSON.stringify(pages)),
            infiniteStrokes: JSON.parse(JSON.stringify(infiniteStrokes)),
            infiniteRedo: JSON.parse(JSON.stringify(infiniteRedo)),
            infiniteEraserUndo: JSON.parse(JSON.stringify(infiniteEraserUndo)),
            panOffset: { ...panOffset },
            zoomScale,
            activePageIndex,
            canvasImages: JSON.parse(JSON.stringify(canvasImages))
          }, true, lastInitializedAttemptId);
        }

        // Auto-create a default attempt if none exists, to enable state saving
        if (!attemptId || !task.attempts || task.attempts.length === 0) {
          if (store.activeProject) {
            store.createAttempt(store.activeProject.id, taskId).catch(err => {
              console.error('[PracticeCanvas] Failed to auto-create attempt:', err);
            });
            return;
          }
        }

        lastInitializedTaskId = taskId;
        lastInitializedAttemptId = attemptId;
        
        performLoadState(taskId);
      });
    }
  });

  $effect(() => {
    // Watch for external sync triggers to reload the canvas
    const trigger = store.externalSyncTrigger;
    if (trigger > 0 && task.id) {
      untrack(() => {
        console.log(`[PracticeCanvas] External sync triggered reload for task ${task.id}`);
        performLoadState(task.id);
      });
    }
  });

  onDestroy(() => {
    if (lastInitializedTaskId && lastInitializedAttemptId) {
      store.saveCanvasState(lastInitializedTaskId, {
        pages: JSON.parse(JSON.stringify(pages)),
        infiniteStrokes: JSON.parse(JSON.stringify(infiniteStrokes)),
        infiniteRedo: JSON.parse(JSON.stringify(infiniteRedo)),
        infiniteEraserUndo: JSON.parse(JSON.stringify(infiniteEraserUndo)),
        panOffset: { ...panOffset },
        zoomScale,
        activePageIndex,
        canvasImages: JSON.parse(JSON.stringify(canvasImages))
      }, true, lastInitializedAttemptId);
    }
  });

  function getCoords(e) {
    if (!canvasElement) return { x: 0, y: 0 };
    const rect = canvasElement.getBoundingClientRect();
    const scaleX = rect.width > 0 ? (canvasElement.width / rect.width) : 1;
    const scaleY = rect.height > 0 ? (canvasElement.height / rect.height) : 1;
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;
    
    if (canvasMode === 'infinite') {
      return {
        x: (screenX - panOffset.x) / zoomScale,
        y: (screenY - panOffset.y) / zoomScale
      };
    } else {
      return {
        x: screenX,
        y: screenY
      };
    }
  }

  // Helper to check if a point lies inside a selection box
  function isPointInBounds(x, y, bounds) {
    if (!bounds) return false;
    return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
  }

  // Helper to find all strokes inside a marquee selection box
  function getStrokesInMarquee(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    
    return strokeHistory.filter(stroke => {
      if (stroke.color === 'eraser' || stroke.color === '#FFFFFF') return false;
      // A stroke is selected if at least one point lies within the selection rectangle
      return stroke.points.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
    });
  }

  function getImagesInMarquee(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    
    return canvasImages.filter(img => {
      if (canvasMode === 'a4' && img.pageIndex !== activePageIndex) return false;
      const imgMinX = img.x;
      const imgMaxX = img.x + img.width;
      const imgMinY = img.y;
      const imgMaxY = img.y + img.height;
      
      return !(imgMaxX < minX || imgMinX > maxX || imgMaxY < minY || imgMinY > maxY);
    });
  }

  function removeFullyErasedStrokes(eraserStroke) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of eraserStroke.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const margin = eraserStroke.width;
    minX -= margin;
    minY -= margin;
    maxX += margin;
    maxY += margin;

    if (canvasMode === 'a4') {
      pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.filter(s => {
        if (s.color === 'eraser' || s.color === '#FFFFFF') return true;
        return !s.points.every(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
      });
    } else {
      infiniteStrokes = infiniteStrokes.filter(s => {
        if (s.color === 'eraser' || s.color === '#FFFFFF') return true;
        return !s.points.every(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
      });
    }
  }
  function isPointNearSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number, maxDist: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    
    if (lenSq === 0) {
      const distSq = (px - ax) * (px - ax) + (py - ay) * (py - ay);
      return distSq < maxDist * maxDist;
    }
    
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    
    const closestX = ax + t * dx;
    const closestY = ay + t * dy;
    
    const distSq = (px - closestX) * (px - closestX) + (py - closestY) * (py - closestY);
    return distSq < maxDist * maxDist;
  }

  function doSegmentsIntersect(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number
  ): boolean {
    function ccw(pX: number, pY: number, qX: number, qY: number, rX: number, rY: number) {
      return (rY - pY) * (qX - pX) > (qY - pY) * (rX - pX);
    }
    return (
      ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
      ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
    );
  }

  function isStrokeHitBySegment(stroke: Stroke, p1: Point, p2: Point, hitRadius: number): boolean {
    if (!stroke.points || stroke.points.length === 0) return false;

    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      return isPointNearSegment(p.x, p.y, p1.x, p1.y, p2.x, p2.y, hitRadius);
    }

    for (let i = 0; i < stroke.points.length - 1; i++) {
      const a = stroke.points[i];
      const b = stroke.points[i + 1];

      if (
        isPointNearSegment(a.x, a.y, p1.x, p1.y, p2.x, p2.y, hitRadius) ||
        isPointNearSegment(b.x, b.y, p1.x, p1.y, p2.x, p2.y, hitRadius) ||
        isPointNearSegment(p1.x, p1.y, a.x, a.y, b.x, b.y, hitRadius) ||
        isPointNearSegment(p2.x, p2.y, a.x, a.y, b.x, b.y, hitRadius) ||
        doSegmentsIntersect(a.x, a.y, b.x, b.y, p1.x, p1.y, p2.x, p2.y)
      ) {
        return true;
      }
    }

    return false;
  }

  function checkAndEraseStrokes(p1: Point, p2: Point) {
    const hitRadius = eraserWidth;
    const currentHistory = canvasMode === 'a4' ? pages[activePageIndex].strokeHistory : infiniteStrokes;
    if (!currentHistory || currentHistory.length === 0) return;

    const currentEraserUndo = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
    const toRemove = new Set<Stroke>();

    for (const stroke of currentHistory) {
      if (stroke.color === 'eraser' || stroke.color === '#FFFFFF') continue;
      if (isStrokeHitBySegment(stroke, p1, p2, hitRadius)) {
        toRemove.add(stroke);
      }
    }

    if (toRemove.size > 0) {
      const newHistory = currentHistory.filter(s => !toRemove.has(s));
      for (const stroke of toRemove) {
        currentEraserUndo.push({
          type: 'erase_action',
          removedStrokes: [stroke],
          addedStrokes: []
        });
      }
      if (canvasMode === 'a4') {
        pages[activePageIndex].redoStack = [];
        pages[activePageIndex].strokeHistory = newHistory;
      } else {
        infiniteRedo = [];
        infiniteStrokes = newHistory;
      }
      invalidateCache();
      requestRedraw();
      saveToStore();
    }
  }

  function isPointNearEraser(p: Point, eraserStroke: { points: Point[], width: number }): boolean {
    const hitRadius = eraserStroke.width / 2;
    if (eraserStroke.points.length === 1) {
      const ep = eraserStroke.points[0];
      return Math.hypot(p.x - ep.x, p.y - ep.y) < hitRadius;
    }
    for (let j = 0; j < eraserStroke.points.length - 1; j++) {
      const ea = eraserStroke.points[j];
      const eb = eraserStroke.points[j+1];
      if (isPointNearSegment(p.x, p.y, ea.x, ea.y, eb.x, eb.y, hitRadius)) {
        return true;
      }
    }
    return false;
  }

  function isSegmentNearEraser(a: Point, b: Point, eraserStroke: { points: Point[], width: number }): boolean {
    const hitRadius = eraserStroke.width / 2;
    if (isPointNearEraser(a, eraserStroke) || isPointNearEraser(b, eraserStroke)) {
      return true;
    }
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist > hitRadius) {
      const steps = Math.ceil(dist / (hitRadius / 2));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const pt = {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t
        };
        if (isPointNearEraser(pt, eraserStroke)) {
          return true;
        }
      }
    }
    return false;
  }

  function generateShapePoints(shape: string, x1: number, y1: number, x2: number, y2: number): Point[] {
    switch (shape) {
      case 'line':
        return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
      case 'rectangle': {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: minY }];
      }
      case 'square': {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        const size = Math.max(maxX - minX, maxY - minY);
        return [{ x: minX, y: minY }, { x: minX + size, y: minY }, { x: minX + size, y: minY + size }, { x: minX, y: minY + size }, { x: minX, y: minY }];
      }
      case 'circle': {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        const rx = (maxX - minX) / 2;
        const ry = (maxY - minY) / 2;
        const radius = Math.min(rx, ry);
        const cx = minX + rx;
        const cy = minY + ry;
        const steps = 64;
        const pts: Point[] = [];
        for (let i = 0; i <= steps; i++) {
          const angle = (i / steps) * Math.PI * 2;
          pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
        }
        return pts;
      }
      case 'ellipse': {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = (maxX - minX) / 2;
        const ry = (maxY - minY) / 2;
        const steps = 64;
        const pts: Point[] = [];
        for (let i = 0; i <= steps; i++) {
          const angle = (i / steps) * Math.PI * 2;
          pts.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
        }
        return pts;
      }
      case 'triangle': {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        return [
          { x: (minX + maxX) / 2, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
          { x: (minX + maxX) / 2, y: minY }
        ];
      }
      default:
        return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    }
  }

  // Variables to track long-press start positions
  let longPressStartPos = { x: 0, y: 0 };

  function handlePointerDown(e) {
    if (contextMenu) {
      contextMenu = null;
    }
    if (!ctx || !canvasElement) return;

    // Intercept click when placing a provided image
    if (pendingInsertImage) {
      e.preventDefault();
      e.stopPropagation();
      handlePlaceImage(e);
      return;
    }

    lastPointerType = e.pointerType;
    if (e.isPrimary) {
      activePointers.clear();
    }
    activePointers.set(e.pointerId, e);

    // Palm rejection: If pen is active, ignore and purge finger touches
    if (e.pointerType === 'pen') {
      for (const [id, pointer] of activePointers.entries()) {
        if (pointer.pointerType === 'touch') {
          activePointers.delete(id);
        }
      }
    }

    // Check if 2 fingers are touching for pinch-to-zoom (ignore stylus palm touches)
    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const isMultiTouch = pts.every(p => p.pointerType === 'touch');
      
      if (isMultiTouch) {
        const p1 = pts[0];
        const p2 = pts[1];
        
        // Calculate initial pinch values
        initialPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        initialPinchZoom = zoomScale;
        initialPinchMidpoint = {
          x: (p1.clientX + p2.clientX) / 2,
          y: (p1.clientY + p2.clientY) / 2
        };
        initialPinchPanOffset = { ...panOffset };
        isPinching = true;
        
        // Cancel drawing, simple panning, and long-press context menu
        isDrawing = false;
        currentStroke = [];
        isPanning = false;
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        
        e.preventDefault();
        return;
      }
    }

    if (activePointers.size > 2) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      e.preventDefault();
      return;
    }

    // Check stylus characteristics
    const isPen = e.pointerType === 'pen';
    const hasPenButton3 = isPen && (((e.buttons & 8) !== 0) || ((e.buttons & 16) !== 0) || e.button === 3 || e.button === 4);

    isPointerEraser = false;
    isPointerSelect = false;
    isPointerPan = false;
    isPointerPen = false;

    if (isPen) {
      const stylusButtons = store.settings.stylusButtons || [];
      for (const btn of stylusButtons) {
        const matchButton = btn.button !== undefined && btn.button !== null && e.button === btn.button;
        const matchButtons = btn.buttons !== undefined && btn.buttons !== null && btn.buttons !== 0 && (e.buttons & btn.buttons) !== 0;
        
        if (matchButton || matchButtons) {
          if (btn.action === 'eraser') {
            isPointerEraser = true;
          } else if (btn.action === 'select') {
            isPointerSelect = true;
          } else if (btn.action === 'pan') {
            isPointerPan = true;
          } else if (btn.action === 'pen') {
            isPointerPen = true;
          }
          e.preventDefault();
          break; // Stop at first match
        }
      }
    }

    if (store.settings.stylusMode && isPen && !isPointerEraser && !isPointerSelect && !isPointerPan && !isPointerPen && activeTool !== 'eraser' && activeTool !== 'select' && activeTool !== 'pan' && activeTool !== 'shape') {
      if (keyboardToolSwitch) {
        keyboardToolSwitch = false;
        if (keyboardToolSwitchTimeout) clearTimeout(keyboardToolSwitchTimeout);
      } else {
        activeTool = 'pen';
      }
    }

    // Check for right-click: open paste context menu for mouse/non-pen pointers
    if (!isPen && e.button === 2) {
      const coords = getCoords(e);
      const rect = canvasContainer.getBoundingClientRect();
      contextMenu = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        canvasX: coords.x,
        canvasY: coords.y
      };
      e.preventDefault();
      return;
    }

    // Dismiss context menu on click elsewhere
    contextMenu = null;
    if (longPressTimer) clearTimeout(longPressTimer);
    
    const coords = getCoords(e);

    // Check if middle click or Hand tool or custom pan action
    const isFingerOrMouse = !isPen;
    const isEraserAction = activeTool === 'eraser' || isPointerEraser;
    const isPanAction = canvasMode === 'infinite' && 
      (e.button === 1 || activeTool === 'pan' || isPointerPan || (store.settings.stylusMode && isFingerOrMouse && !isEraserAction && activeTool !== 'select'));
    
    if (isPanAction) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panBaseOffset = { ...panOffset };
      
      // Setup long-press (600ms) timer for context menu (stylus paste shortcut) even during panning (only for touch or stylus)
      if (e.pointerType !== 'mouse') {
        longPressStartPos = { x: e.clientX, y: e.clientY };
        longPressTimer = setTimeout(() => {
          const rect = canvasContainer.getBoundingClientRect();
          contextMenu = {
            x: longPressStartPos.x - rect.left,
            y: longPressStartPos.y - rect.top,
            canvasX: coords.x,
            canvasY: coords.y
          };
          isPanning = false;
          isDrawing = false;
          currentStroke = [];
          selectionBox = null;
          isMovingSelection = false;
        }, 600);
      }

      e.preventDefault();
      return;
    }
    
    // Only allow drawing/selecting/panning on left-click (or barrel button actions)
    if (e.button !== 0 && !isPointerEraser && !isPointerSelect && !isPointerPan && !isPointerPen) return;

    // Reset straightening gesture
    isStraightening = false;
    straightLineStart = null;
    straightLineEnd = null;
    clearStraightenTimer();
    const bounds = selectionBoundingBox;
    const isClickInSelection = bounds && isPointInBounds(coords.x, coords.y, bounds);

    // Stroke-erase mode: delete entire stroke under pointer (drag-support)
    if (!isClickInSelection && isEraserAction && effectiveEraserSettings.eraserMode === 'stroke') {
      isStrokeErasing = true;
      lastStrokeEraserCoords = coords;
      try {
        canvasElement.setPointerCapture(e.pointerId);
      } catch (err) {}
      checkAndEraseStrokes(coords, coords);
      e.preventDefault();
      return;
    }

    // In stylus mode, finger/touch/mouse cannot draw/select on A4 canvas either (unless clicking in selection to drag/move)
    if (store.settings.stylusMode && isFingerOrMouse && !isClickInSelection && !isEraserAction) {
      if (canvasMode !== 'infinite') {
        // Setup long-press (600ms) timer for context menu (stylus paste shortcut) (only for touch or stylus)
        if (e.pointerType !== 'mouse') {
          longPressStartPos = { x: e.clientX, y: e.clientY };
          longPressTimer = setTimeout(() => {
            const rect = canvasContainer.getBoundingClientRect();
            contextMenu = {
              x: longPressStartPos.x - rect.left,
              y: longPressStartPos.y - rect.top,
              canvasX: coords.x,
              canvasY: coords.y
            };
            isDrawing = false;
            currentStroke = [];
            selectionBox = null;
            isMovingSelection = false;
            isPanning = false;
          }, 600);
        }
        
        try {
          canvasElement.setPointerCapture(e.pointerId);
        } catch (err) {}

        e.preventDefault();
        return;
      }
    }

    // Capture pointer to receive move/up even outside canvas borders
    try {
      canvasElement.setPointerCapture(e.pointerId);
    } catch (err) {}

    // Setup long-press (600ms) timer for context menu (stylus paste shortcut) (only for touch or stylus)
    if (!isPointerEraser && !isPointerSelect && !isPointerPan && e.pointerType !== 'mouse') {
      longPressStartPos = { x: e.clientX, y: e.clientY };
      longPressTimer = setTimeout(() => {
        const rect = canvasContainer.getBoundingClientRect();
        contextMenu = {
          x: longPressStartPos.x - rect.left,
          y: longPressStartPos.y - rect.top,
          canvasX: coords.x,
          canvasY: coords.y
        };
        // Cancel active draw or selection marquee drag
        isDrawing = false;
        currentStroke = [];
        selectionBox = null;
        isMovingSelection = false;
      }, 600);
    }

    // Check if clicked near the selection bottom-right resize handle
    const handleSize = 15 / (canvasMode === 'infinite' ? zoomScale : 1);
    const isNearSelectionResize = selectionBoundingBox &&
      Math.abs(coords.x - selectionBoundingBox.maxX) <= handleSize &&
      Math.abs(coords.y - selectionBoundingBox.maxY) <= handleSize;
      
    // Check if clicked inside any image body (top-most first based on zIndex)
    const sortedImagesDesc = [...canvasImages].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    const clickedImage = sortedImagesDesc.find(img => {
      if (canvasMode === 'a4' && img.pageIndex !== activePageIndex) return false;
      return coords.x >= img.x && coords.x <= img.x + img.width &&
             coords.y >= img.y && coords.y <= img.y + img.height;
    });

    if (isNearSelectionResize && selectionBoundingBox) {
      isResizingSelection = true;
      imageDragStart = { x: coords.x, y: coords.y };
      selectionResizeStartBox = { ...selectionBoundingBox };
      selectionStartStrokes = JSON.parse(JSON.stringify(selectedStrokes));
      selectionStartImageRects = selectedImages.map(img => ({ id: img.id, x: img.x, y: img.y, width: img.width, height: img.height }));
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      e.preventDefault();
      return;
    }

    if (isClickInSelection) {
      if (selectedImages.length === 1 && selectedStrokes.length === 0) {
        const img = selectedImages[0];
        isMovingImage = true;
        imageDragStart = { x: coords.x, y: coords.y };
        imageStartRect = { x: img.x, y: img.y, width: img.width, height: img.height };
      } else {
        isMovingSelection = true;
        selectionDragStart = { x: coords.x, y: coords.y };
        selectionStartStrokes = JSON.parse(JSON.stringify(selectedStrokes));
        selectionStartImageRects = selectedImages.map(img => ({ id: img.id, x: img.x, y: img.y, width: img.width, height: img.height }));
      }
      selectionBox = null;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      e.preventDefault();
      return;
    }

    const shouldDragImage = clickedImage && (activeTool === 'select' || isPointerSelect || activeTool === 'pan' || selectedImages.length > 0);

    if (shouldDragImage) {
      clickedImage.zIndex = Date.now();
      canvasImages = [...canvasImages];
      selectedImages = [clickedImage];
      selectedStrokes = []; // Clear stroke selection
      isMovingImage = true;
      imageDragStart = { x: coords.x, y: coords.y };
      imageStartRect = { x: clickedImage.x, y: clickedImage.y, width: clickedImage.width, height: clickedImage.height };
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      e.preventDefault();
      return;
    } else if (activeTool === 'shape' && !isPointerEraser && !isPointerSelect && !isPointerPan) {
      if (selectedStrokes.length > 0) selectedStrokes = [];
      selectedImages = [];
      isShapeDrawing = true;
      shapeAnchorX = coords.x;
      shapeAnchorY = coords.y;
      shapePreviewX = coords.x;
      shapePreviewY = coords.y;
    } else if (activeTool === 'select' || isPointerSelect) {
      selectedStrokes = [];
      selectedImages = [];
      selectionBox = { x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y };
      isMovingSelection = false;
    } else {
      if (selectedStrokes.length > 0) selectedStrokes = [];
      selectedImages = [];
      isDrawing = true;
      currentStroke = [coords];
      startStraightenTimer(coords, e.clientX, e.clientY);
    }
  }

  function handlePointerMove(e) {
    lastPointerType = e.pointerType;

    if (canvasContainer) {
      const rect = canvasContainer.getBoundingClientRect();
      hoverPos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }

    if (isStrokeErasing) {
      e.preventDefault();
      const coords = getCoords(e);
      const p1 = lastStrokeEraserCoords || coords;
      const p2 = coords;
      lastStrokeEraserCoords = coords;
      checkAndEraseStrokes(p1, p2);
      return;
    }

    if (e.buttons === 0) {
      activePointers.clear();
      isDrawing = false;
      isPanning = false;
      isPinching = false;
      return;
    }

    activePointers.set(e.pointerId, e);

    // Palm rejection: If pen is active, ignore and purge finger touches
    if (e.pointerType === 'pen') {
      for (const [id, pointer] of activePointers.entries()) {
        if (pointer.pointerType === 'touch') {
          activePointers.delete(id);
        }
      }
    }

    if (isPinching && activePointers.size === 2) {
      e.preventDefault();
      const pts = Array.from(activePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      
      const currentDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const currentMidpoint = {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2
      };
      
      if (initialPinchDistance > 0 && canvasElement) {
        const factor = currentDistance / initialPinchDistance;
        const rect = canvasElement.getBoundingClientRect();
        
        // World coordinates of initial midpoint
        const worldX = (initialPinchMidpoint.x - rect.left - initialPinchPanOffset.x) / initialPinchZoom;
        const worldY = (initialPinchMidpoint.y - rect.top - initialPinchPanOffset.y) / initialPinchZoom;
        
        const rawScale = initialPinchZoom * factor;
        const rawPanX = (currentMidpoint.x - rect.left) - worldX * rawScale;
        const rawPanY = (currentMidpoint.y - rect.top) - worldY * rawScale;
        
        const clamped = clampA4ZoomAndPan(rawScale, { x: rawPanX, y: rawPanY });
        zoomScale = clamped.zoom;
        panOffset = clamped.pan;
        saveToStoreDebounced();
      }
      return;
    }

    if (activePointers.size > 1) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      return;
    }

    // If long-press is active, cancel it if cursor moves > 5px
    if (longPressTimer) {
      const dist = Math.hypot(e.clientX - longPressStartPos.x, e.clientY - longPressStartPos.y);
      if (dist > 5) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      
      const rawPanX = panBaseOffset.x + dx;
      const rawPanY = panBaseOffset.y + dy;
      
      const clamped = clampA4ZoomAndPan(zoomScale, { x: rawPanX, y: rawPanY });
      panOffset = clamped.pan;
      e.preventDefault();
      return;
    }

    const coords = getCoords(e);

    if (isMovingImage && selectedImage) {
      const dx = coords.x - imageDragStart.x;
      const dy = coords.y - imageDragStart.y;
      selectedImage.x = imageStartRect.x + dx;
      selectedImage.y = imageStartRect.y + dy;
      canvasImages = [...canvasImages];
      requestRedraw();
      return;
    }

    if (isResizingSelection && selectionResizeStartBox) {
      const dx = coords.x - imageDragStart.x;
      const dy = coords.y - imageDragStart.y;

      const startWidth = Math.max(10, selectionResizeStartBox.maxX - selectionResizeStartBox.minX);
      const startHeight = Math.max(10, selectionResizeStartBox.maxY - selectionResizeStartBox.minY);

      const dragDelta = (dx + dy) / 2;
      const scaleFactor = Math.max(0.1, 1 + (dragDelta / Math.max(startWidth, startHeight)));

      const originX = selectionResizeStartBox.minX;
      const originY = selectionResizeStartBox.minY;

      // Rescale strokes
      if (selectedStrokes.length > 0 && selectionStartStrokes.length > 0) {
        for (const s of selectionStartStrokes) {
          if (!s.id) {
            s.id = Math.random().toString(36).substring(2, 9);
          }
        }

        const updatedSelectedStrokes = selectionStartStrokes.map(stroke => {
          const newPoints = stroke.points.map(p => ({
            x: originX + (p.x - originX) * scaleFactor,
            y: originY + (p.y - originY) * scaleFactor
          }));
          const newStroke = {
            ...stroke,
            width: Math.max(0.5, stroke.width * scaleFactor),
            points: newPoints
          };
          newStroke.bounds = calculateStrokeBounds(newStroke);
          return newStroke;
        });

        selectedStrokes = updatedSelectedStrokes;
        const selectedIds = new Set(updatedSelectedStrokes.map(s => s.id));

        if (canvasMode === 'a4') {
          pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.map(stroke => {
            if (stroke.id && selectedIds.has(stroke.id)) {
              return updatedSelectedStrokes.find(s => s.id === stroke.id)!;
            }
            return stroke;
          });
        } else {
          infiniteStrokes = infiniteStrokes.map(stroke => {
            if (stroke.id && selectedIds.has(stroke.id)) {
              return updatedSelectedStrokes.find(s => s.id === stroke.id)!;
            }
            return stroke;
          });
        }
      }

      // Rescale images
      if (selectedImages.length > 0 && selectionStartImageRects.length > 0) {
        for (const imgRect of selectionStartImageRects) {
          const img = selectedImages.find(i => i.id === imgRect.id);
          if (img) {
            img.x = Math.round(originX + (imgRect.x - originX) * scaleFactor);
            img.y = Math.round(originY + (imgRect.y - originY) * scaleFactor);
            img.width = Math.max(10, Math.round((imgRect.width || img.width) * scaleFactor));
            img.height = Math.max(10, Math.round((imgRect.height || img.height) * scaleFactor));
          }
        }
        canvasImages = [...canvasImages];
      }

      requestRedraw();
      return;
    }

    if (isMovingSelection) {
      const dx = coords.x - selectionDragStart.x;
      const dy = coords.y - selectionDragStart.y;
      let movedAny = false;
      
      if (selectedStrokes.length > 0) {
        // Ensure all selected strokes have IDs
        for (const s of selectedStrokes) {
          if (!s.id) {
            s.id = Math.random().toString(36).substring(2, 9);
          }
        }

        const updatedSelectedStrokes = selectedStrokes.map(stroke => {
          const newPoints = stroke.points.map(p => ({
            x: p.x + dx,
            y: p.y + dy
          }));
          const newStroke = {
            ...stroke,
            points: newPoints
          };
          newStroke.bounds = calculateStrokeBounds(newStroke);
          return newStroke;
        });
        
        selectedStrokes = updatedSelectedStrokes;
        const selectedIds = new Set(updatedSelectedStrokes.map(s => s.id));
        
        if (canvasMode === 'a4') {
          pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.map(stroke => {
            if (stroke.id && selectedIds.has(stroke.id)) {
              return updatedSelectedStrokes.find(s => s.id === stroke.id)!;
            }
            return stroke;
          });
        } else {
          infiniteStrokes = infiniteStrokes.map(stroke => {
            if (stroke.id && selectedIds.has(stroke.id)) {
              return updatedSelectedStrokes.find(s => s.id === stroke.id)!;
            }
            return stroke;
          });
        }
        movedAny = true;
      }

      if (selectedImages.length > 0) {
        for (const img of selectedImages) {
          img.x += dx;
          img.y += dy;
        }
        canvasImages = [...canvasImages];
        movedAny = true;
      }

      if (movedAny) {
        selectionDragStart = { x: coords.x, y: coords.y };
        invalidateCache();
        requestRedraw();
      }
    } else if (activeTool === 'select' || isPointerSelect) {
      if (selectionBox) {
        selectionBox.x2 = coords.x;
        selectionBox.y2 = coords.y;
      }
    } else if (isShapeDrawing) {
      if (shapeType === 'line') {
        const snapped = snapLine({ x: shapeAnchorX, y: shapeAnchorY }, coords);
        shapePreviewX = snapped.x;
        shapePreviewY = snapped.y;
      } else {
        shapePreviewX = coords.x;
        shapePreviewY = coords.y;
      }
    } else if (isDrawing) {
      if (isStraightening) {
        straightLineEnd = coords;
      } else {
        currentStroke.push(coords);
        if (straightenAnchorScreen) {
          const dist = Math.hypot(e.clientX - straightenAnchorScreen.x, e.clientY - straightenAnchorScreen.y);
          if (dist > 3) {
            clearStraightenTimer();
            startStraightenTimer(coords, e.clientX, e.clientY);
          }
        } else {
          startStraightenTimer(coords, e.clientX, e.clientY);
        }
      }
    }
  }

  function handlePointerUp(e) {
    activePointers.delete(e.pointerId);
    clearStraightenTimer();

    if (e && canvasElement && canvasElement.hasPointerCapture(e.pointerId)) {
      try {
        canvasElement.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    if (isPinching) {
      if (activePointers.size < 2) {
        isPinching = false;
      }
      saveToStore();
      e.preventDefault();
      return;
    }

    if (isStrokeErasing) {
      isStrokeErasing = false;
      lastStrokeEraserCoords = null;
      if (e) e.preventDefault();
      return;
    }

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (isPanning) {
      isPanning = false;
      saveToStore();
      return;
    }

    if (isResizingSelection) {
      isResizingSelection = false;
      saveToStore();
      requestRedraw();
      return;
    }
    
    if (isMovingImage || isResizingImage) {
      if (selectedImage && (selectedImage.x !== imageStartRect.x || selectedImage.y !== imageStartRect.y || selectedImage.width !== imageStartRect.width || selectedImage.height !== imageStartRect.height)) {
        const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
        if (isMovingImage) {
          undoStack.push({
            type: 'move_image',
            imageId: selectedImage.id,
            from: { x: imageStartRect.x, y: imageStartRect.y },
            to: { x: selectedImage.x, y: selectedImage.y }
          });
        } else {
          undoStack.push({
            type: 'resize_image',
            imageId: selectedImage.id,
            from: { x: imageStartRect.x, y: imageStartRect.y, width: imageStartRect.width, height: imageStartRect.height },
            to: { x: selectedImage.x, y: selectedImage.y, width: selectedImage.width, height: selectedImage.height }
          });
        }
        if (canvasMode === 'a4') {
          pages[activePageIndex].redoStack = [];
        } else {
          infiniteRedo = [];
        }
      }
      isMovingImage = false;
      isResizingImage = false;
      saveToStore();
      requestRedraw();
      return;
    }

    if (isMovingSelection) {
      let moved = false;
      const strokesTo = JSON.parse(JSON.stringify(selectedStrokes));
      const imagesTo = selectedImages.map(img => ({ id: img.id, x: img.x, y: img.y }));
      
      if (selectedStrokes.length > 0 && selectionStartStrokes.length > 0) {
        if (selectedStrokes[0].points[0].x !== selectionStartStrokes[0].points[0].x ||
            selectedStrokes[0].points[0].y !== selectionStartStrokes[0].points[0].y) {
          moved = true;
        }
      }
      if (selectedImages.length > 0 && selectionStartImageRects.length > 0) {
        const hasImgMoved = selectedImages.some(img => {
          const start = selectionStartImageRects.find(s => s.id === img.id);
          return start && (img.x !== start.x || img.y !== start.y);
        });
        if (hasImgMoved) {
          moved = true;
        }
      }
      
      if (moved) {
        const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
        undoStack.push({
          type: 'move_selection',
          strokesFrom: selectionStartStrokes,
          strokesTo,
          imagesFrom: selectionStartImageRects,
          imagesTo
        });
        if (canvasMode === 'a4') {
          pages[activePageIndex].redoStack = [];
        } else {
          infiniteRedo = [];
        }
      }
      
      saveToStore();
      isMovingSelection = false;
      requestRedraw();
    } else if (activeTool === 'select' || isPointerSelect) {
      if (selectionBox) {
        selectedStrokes = getStrokesInMarquee(selectionBox.x1, selectionBox.y1, selectionBox.x2, selectionBox.y2);
        const marqueeImages = getImagesInMarquee(selectionBox.x1, selectionBox.y1, selectionBox.x2, selectionBox.y2);
        const now = Date.now();
        for (const img of marqueeImages) {
          img.zIndex = now;
        }
        selectedImages = marqueeImages;
        if (marqueeImages.length > 0) {
          canvasImages = [...canvasImages];
        }
        selectionBox = null;
      }
    } else if (isShapeDrawing) {
      isShapeDrawing = false;

      const shapePoints = generateShapePoints(shapeType, shapeAnchorX, shapeAnchorY, shapePreviewX, shapePreviewY);
      if (shapePoints.length > 0) {
        const newStroke: Stroke = {
          id: Math.random().toString(36).substring(2, 9),
          color: strokeColor,
          width: brushWidth,
          points: shapePoints
        };
        newStroke.bounds = calculateStrokeBounds(newStroke);

        const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
        undoStack.push({
          type: 'stroke',
          stroke: newStroke
        });
        if (canvasMode === 'a4') {
          pages[activePageIndex].strokeHistory.push(newStroke);
          pages[activePageIndex].redoStack = [];
        } else {
          infiniteStrokes.push(newStroke);
          infiniteRedo = [];
        }
        saveToStore();
      }
    } else if (isDrawing) {
      isDrawing = false;
      
      if (isStraightening && straightLineStart && straightLineEnd) {
        const finalEnd = snapLine(straightLineStart, straightLineEnd);
        const newStroke: Stroke = {
          id: Math.random().toString(36).substring(2, 9),
          color: strokeColor,
          width: brushWidth,
          points: [straightLineStart, finalEnd]
        };
        newStroke.bounds = calculateStrokeBounds(newStroke);
        
        const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
        undoStack.push({
          type: 'stroke',
          stroke: newStroke
        });
        if (canvasMode === 'a4') {
          pages[activePageIndex].strokeHistory.push(newStroke);
          pages[activePageIndex].redoStack = [];
        } else {
          infiniteStrokes.push(newStroke);
          infiniteRedo = [];
        }
        saveToStore();
      } else if (currentStroke.length > 0) {
        const isEraser = (activeTool === 'eraser' || isPointerEraser);
        
        if (isEraser && effectiveEraserSettings.eraserMode === 'normal') {
          const eraserStroke = {
            color: 'eraser',
            width: eraserWidth,
            points: [...currentStroke]
          } as Stroke;
          
          const eraserBounds = calculateStrokeBounds(eraserStroke);
          const history = canvasMode === 'a4' ? pages[activePageIndex].strokeHistory : infiniteStrokes;
          const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
          
          const removedStrokes: Stroke[] = [];
          const addedStrokes: Stroke[] = [];
          const updatedHistory: Stroke[] = [];
          
          for (const stroke of history) {
            if (stroke.color === 'eraser' || stroke.points.length === 0) {
              updatedHistory.push(stroke);
              continue;
            }
            
            const strokeBounds = stroke.bounds || calculateStrokeBounds(stroke);
            const overlap = !(
              strokeBounds.maxX < eraserBounds.minX ||
              strokeBounds.minX > eraserBounds.maxX ||
              strokeBounds.maxY < eraserBounds.minY ||
              strokeBounds.minY > eraserBounds.maxY
            );
            
            if (!overlap) {
              updatedHistory.push(stroke);
              continue;
            }
            
            const splitParts: Stroke[] = [];
            let currentPoints: Point[] = [];
            
            if (!isPointNearEraser(stroke.points[0], eraserStroke)) {
              currentPoints.push(stroke.points[0]);
            }
            
            let hasCuts = false;
            for (let i = 0; i < stroke.points.length - 1; i++) {
              const a = stroke.points[i];
              const b = stroke.points[i + 1];
              const isCut = isSegmentNearEraser(a, b, eraserStroke);
              
              if (isCut) {
                hasCuts = true;
                if (currentPoints.length > 0) {
                  const part: Stroke = {
                    ...stroke,
                    id: Math.random().toString(36).substring(2, 9),
                    points: currentPoints
                  };
                  part.bounds = calculateStrokeBounds(part);
                  splitParts.push(part);
                  currentPoints = [];
                }
                if (!isPointNearEraser(b, eraserStroke)) {
                  currentPoints.push(b);
                }
              } else {
                if (currentPoints.length === 0 && !isPointNearEraser(a, eraserStroke)) {
                  currentPoints.push(a);
                }
                currentPoints.push(b);
              }
            }
            
            if (currentPoints.length > 0) {
              const part: Stroke = {
                ...stroke,
                id: Math.random().toString(36).substring(2, 9),
                points: currentPoints
              };
              part.bounds = calculateStrokeBounds(part);
              splitParts.push(part);
            }
            
            if (hasCuts) {
              removedStrokes.push(stroke);
              for (const part of splitParts) {
                if (part.points.length > 0) {
                  addedStrokes.push(part);
                  updatedHistory.push(part);
                }
              }
            } else {
              updatedHistory.push(stroke);
            }
          }
          
          if (removedStrokes.length > 0) {
            const action = {
              type: 'erase_action',
              id: Math.random().toString(36).substring(2, 9),
              removedStrokes,
              addedStrokes
            };
            undoStack.push(action as any);
            
            if (canvasMode === 'a4') {
              pages[activePageIndex].redoStack = [];
            } else {
              infiniteRedo = [];
            }
          }
          
          if (canvasMode === 'a4') {
            pages[activePageIndex].strokeHistory = updatedHistory;
          } else {
            infiniteStrokes = updatedHistory;
          }
          
          store.settings.eraserRadiusNormal = eraserWidth;
          saveToStore();
        } else {
          const newStroke: Stroke = {
            id: Math.random().toString(36).substring(2, 9),
            color: isEraser ? 'eraser' : strokeColor,
            width: isEraser ? eraserWidth : brushWidth,
            points: [...currentStroke]
          };
          newStroke.bounds = calculateStrokeBounds(newStroke);
          
          const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
          undoStack.push({
            type: 'stroke',
            stroke: newStroke
          });
          if (canvasMode === 'a4') {
            pages[activePageIndex].strokeHistory.push(newStroke);
            pages[activePageIndex].redoStack = [];
            if (isEraser && effectiveEraserSettings.eraserMode === 'normal') {
              removeFullyErasedStrokes(newStroke);
            }
          } else {
            infiniteStrokes.push(newStroke);
            infiniteRedo = [];
            if (isEraser && effectiveEraserSettings.eraserMode === 'normal') {
              removeFullyErasedStrokes(newStroke);
            }
          }

          if (isEraser) {
            const mode = effectiveEraserSettings.eraserMode;
            if (mode === 'stroke') {
              store.settings.eraserRadiusStroke = eraserWidth;
            } else {
              store.settings.eraserRadiusNormal = eraserWidth;
            }
          }
          saveToStore();
        }
      }
      currentStroke = [];
      isStraightening = false;
      straightLineStart = null;
      straightLineEnd = null;
    }
    isPointerEraser = false;
    isPointerSelect = false;
    isPointerPan = false;
    isPointerPen = false;
  }

  function handlePointerLeave(e) {
    hoverPos = null;
    activePointers.delete(e.pointerId);

    if (isPinching) {
      if (activePointers.size < 2) {
        isPinching = false;
      }
      saveToStore();
      return;
    }

    // During stroke-erasing with pointer capture, pointerleave fires but we must NOT
    // end the session — the pointer is still captured and the user is still dragging.
    if (isStrokeErasing) return;

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (isDrawing) {
      handlePointerUp(e);
    }
    if (isPanning) {
      isPanning = false;
      saveToStore();
    }
    isStrokeErasing = false;
    lastStrokeEraserCoords = null;
    isPointerEraser = false;
    isPointerSelect = false;
    isPointerPan = false;
    isPointerPen = false;
  }

  function handlePointerCancel(e) {
    hoverPos = null;
    activePointers.delete(e.pointerId);
    if (isPinching) {
      if (activePointers.size < 2) {
        isPinching = false;
      }
      saveToStore();
    }
    isDrawing = false;
    currentStroke = [];
    isPanning = false;
    isStrokeErasing = false;
    lastStrokeEraserCoords = null;
  }

  function handleWheel(e) {
    if (!canvasElement || !canvasContainer) return;
    
    if (wheelTimeout) clearTimeout(wheelTimeout);
    isWheelActive = true;
    wheelTimeout = window.setTimeout(() => {
      isWheelActive = false;
      invalidateCache();
      requestRedraw();
    }, 200);
    
    if (e.ctrlKey) {
      // Zoom action towards cursor
      e.preventDefault();
      
      const zoomIntensity = 0.05;
      const delta = -e.deltaY;
      const factor = delta > 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);
      
      if (canvasMode === 'infinite') {
        const rect = canvasElement.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        
        const worldX = (cursorX - panOffset.x) / zoomScale;
        const worldY = (cursorY - panOffset.y) / zoomScale;
        const newScale = Math.max(0.2, Math.min(4.0, zoomScale * factor));
        
        let newPanX = cursorX - worldX * newScale;
        let newPanY = cursorY - worldY * newScale;
        
        newPanX = Math.min(0, newPanX);
        newPanY = Math.min(0, newPanY);
        
        zoomScale = newScale;
        panOffset = { x: newPanX, y: newPanY };
      } else {
        // A4 mode zoom
        const oldScale = a4Scale;
        const rawZoomScale = zoomScale * factor;
        const newZoomScale = Math.max(0.75, Math.min(4.0, rawZoomScale));
        
        const newA4Scale = baseA4Scale * newZoomScale;
        
        // Panned offset relative to container center
        const containerRect = canvasContainer ? canvasContainer.getBoundingClientRect() : { left: 0, top: 0 };
        const mX = e.clientX - containerRect.left;
        const mY = e.clientY - containerRect.top;
        
        const cardX = (containerWidth - a4BaseWidth * oldScale) / 2 + panOffset.x;
        const cardY = (containerHeight - a4BaseHeight * oldScale) / 2 + panOffset.y;
        
        const relX = (mX - cardX) / (oldScale || 1);
        const relY = (mY - cardY) / (oldScale || 1);
        
        const newCardX = mX - relX * newA4Scale;
        const newCardY = mY - relY * newA4Scale;
        
        const rawPanX = newCardX - (containerWidth - a4BaseWidth * newA4Scale) / 2;
        const rawPanY = newCardY - (containerHeight - a4BaseHeight * newA4Scale) / 2;
        
        const clamped = clampA4ZoomAndPan(newZoomScale, { x: rawPanX, y: rawPanY });
        zoomScale = clamped.zoom;
        panOffset = clamped.pan;
      }
      saveToStoreDebounced();
    } else {
      // Normal scroll wheel panning
      if (canvasMode === 'infinite') {
        e.preventDefault();
        let newPanX = panOffset.x - e.deltaX;
        let newPanY = panOffset.y - e.deltaY;
        
        newPanX = Math.min(0, newPanX);
        newPanY = Math.min(0, newPanY);
        
        panOffset = { x: newPanX, y: newPanY };
        saveToStoreDebounced();
      } else {
        // Trackpad panning in A4 mode
        e.preventDefault();
        const rawPan = {
          x: panOffset.x - e.deltaX,
          y: panOffset.y - e.deltaY
        };
        const clamped = clampA4ZoomAndPan(zoomScale, rawPan);
        panOffset = clamped.pan;
        saveToStoreDebounced();
      }
    }
  }

  function drawCanvasImages(ctxTarget: CanvasRenderingContext2D) {
    const sortedImages = [...canvasImages].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    for (const canvasImg of sortedImages) {
      if (canvasMode === 'a4' && canvasImg.pageIndex !== activePageIndex) continue;
      const imgEl = imageElementCache[canvasImg.mediaId];
      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        ctxTarget.drawImage(imgEl, canvasImg.x, canvasImg.y, canvasImg.width, canvasImg.height);
      }
    }
  }

  function redraw() {
    if (!ctx || !canvasElement) return;
    if (canvasWidth <= 0 || canvasHeight <= 0) return;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Always fill background with white to keep calligraphy canvas white in all modes (including dark mode)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw guidelines back layer and custom background
    ctx.save();
    if (canvasMode === 'infinite') {
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoomScale, zoomScale);
      
      const xStart = -panOffset.x / zoomScale;
      const yStart = -panOffset.y / zoomScale;
      const wVisible = canvasWidth / zoomScale;
      const hVisible = canvasHeight / zoomScale;
      
      // Draw custom background pattern image if present
      if (currentBgImage) {
        ctx.save();
        ctx.globalAlpha = bgOpacity / 100;
        const pattern = ctx.createPattern(currentBgImage, 'repeat');
        if (pattern) {
          ctx.fillStyle = pattern;
          ctx.fillRect(xStart, yStart, wVisible, hVisible);
        }
        ctx.restore();
      }
      
      drawGuidelinesInWorld(ctx, xStart, yStart, wVisible, hVisible, activeBg, bgOpacity);
      drawCanvasImages(ctx);
    } else {
      // A4 mode
      if (currentBgImage) {
        ctx.save();
        ctx.globalAlpha = bgOpacity / 100;
        const pattern = ctx.createPattern(currentBgImage, 'repeat');
        if (pattern) {
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, a4BaseWidth, a4BaseHeight);
        }
        ctx.restore();
      }
      drawGuidelinesInWorld(ctx, 0, 0, a4BaseWidth, a4BaseHeight, activeBg, bgOpacity);
      drawCanvasImages(ctx);
    }
    ctx.restore();
    
    // Create/update persistent offscreen canvas for stroke compositing
    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement('canvas');
    }
    if (offscreenCanvas.width !== canvasWidth || offscreenCanvas.height !== canvasHeight) {
      offscreenCanvas.width = canvasWidth;
      offscreenCanvas.height = canvasHeight;
      offscreenCtx = offscreenCanvas.getContext('2d');
    }
    
    // Update historical strokes cache
    updateStrokesCache();
    
    if (offscreenCtx) {
      offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      
      // Composite historical strokes cache first
      if (cachedStrokesCanvas && cachedStrokesCanvas.width > 0 && cachedStrokesCanvas.height > 0) {
        if (canvasMode === 'infinite' && (isGesturing || isPanning || isWheelActive)) {
          offscreenCtx.save();
          const scaleRatio = zoomScale / cachedZoom;
          offscreenCtx.translate(panOffset.x - cachedPan.x * scaleRatio, panOffset.y - cachedPan.y * scaleRatio);
          offscreenCtx.scale(scaleRatio, scaleRatio);
          offscreenCtx.drawImage(cachedStrokesCanvas, 0, 0);
          offscreenCtx.restore();
        } else {
          offscreenCtx.drawImage(cachedStrokesCanvas, 0, 0);
        }
      }
      
      // Draw active drawing stroke on top of historical strokes
      if (currentStroke.length > 0) {
        offscreenCtx.save();
        if (canvasMode === 'infinite') {
          offscreenCtx.translate(panOffset.x, panOffset.y);
          offscreenCtx.scale(zoomScale, zoomScale);
        }
        if (isStraightening && straightLineStart && straightLineEnd) {
          offscreenCtx.strokeStyle = strokeColor + '80';
          offscreenCtx.lineWidth = brushWidth;
          offscreenCtx.lineCap = 'round';
          offscreenCtx.lineJoin = 'round';
          offscreenCtx.setLineDash([6, 4]);
          offscreenCtx.beginPath();
          offscreenCtx.moveTo(straightLineStart.x, straightLineStart.y);
          const snappedEnd = snapLine(straightLineStart, straightLineEnd);
          offscreenCtx.lineTo(snappedEnd.x, snappedEnd.y);
          offscreenCtx.stroke();
        } else {
          drawStroke(offscreenCtx, {
            color: (activeTool === 'eraser' || isPointerEraser) ? 'eraser' : strokeColor,
            width: (activeTool === 'eraser' || isPointerEraser) ? eraserWidth : brushWidth,
            points: currentStroke
          });
        }
        offscreenCtx.restore();
      }
    }
    
    // Composite offscreen strokes canvas back onto the main canvas
    if (offscreenCanvas && offscreenCanvas.width > 0 && offscreenCanvas.height > 0) {
      ctx.drawImage(offscreenCanvas, 0, 0);
    }
    
    // Draw selection tools marquee box (if actively selecting)
    if (selectionBox) {
      ctx.save();
      if (canvasMode === 'infinite') {
        ctx.translate(panOffset.x, panOffset.y);
        ctx.scale(zoomScale, zoomScale);
      }
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5 / (canvasMode === 'infinite' ? zoomScale : 1);
      ctx.setLineDash([4, 4]);
      const sx = Math.min(selectionBox.x1, selectionBox.x2);
      const sy = Math.min(selectionBox.y1, selectionBox.y2);
      const sw = Math.abs(selectionBox.x2 - selectionBox.x1);
      const sh = Math.abs(selectionBox.y2 - selectionBox.y1);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.05)';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.restore();
    }
    
    // Draw selection bounding box (if strokes or images are selected)
    if (selectionBoundingBox) {
      const bounds = selectionBoundingBox;
      ctx.save();
      if (canvasMode === 'infinite') {
        ctx.translate(panOffset.x, panOffset.y);
        ctx.scale(zoomScale, zoomScale);
      }
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2 / (canvasMode === 'infinite' ? zoomScale : 1);
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      ctx.fillStyle = 'rgba(37, 99, 235, 0.05)';
      ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

      // Draw resize handle at bottom-right corner
      ctx.fillStyle = '#2563eb';
      ctx.setLineDash([]);
      const handleSize = 10 / (canvasMode === 'infinite' ? zoomScale : 1);
      ctx.fillRect(
        bounds.maxX - handleSize / 2,
        bounds.maxY - handleSize / 2,
        handleSize,
        handleSize
      );

      ctx.restore();
    }

    // Draw selected image border & handles
    if (selectedImage) {
      ctx.save();
      if (canvasMode === 'infinite') {
        ctx.translate(panOffset.x, panOffset.y);
        ctx.scale(zoomScale, zoomScale);
      }
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2 / (canvasMode === 'infinite' ? zoomScale : 1);
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(selectedImage.x, selectedImage.y, selectedImage.width, selectedImage.height);
      
      // Draw resize handle at bottom-right corner
      ctx.fillStyle = '#2563eb';
      ctx.setLineDash([]);
      const handleSize = 10 / (canvasMode === 'infinite' ? zoomScale : 1);
      ctx.fillRect(
        selectedImage.x + selectedImage.width - handleSize / 2,
        selectedImage.y + selectedImage.height - handleSize / 2,
        handleSize,
        handleSize
      );
      ctx.restore();
    }

    // Draw ghost shape preview
    if (isShapeDrawing) {
      ctx.save();
      if (canvasMode === 'infinite') {
        ctx.translate(panOffset.x, panOffset.y);
        ctx.scale(zoomScale, zoomScale);
      }
      
      // Draw temporary bounding box preview for circle/ellipse
      if (shapeType === 'circle' || shapeType === 'ellipse') {
        const minX = Math.min(shapeAnchorX, shapePreviewX);
        const maxX = Math.max(shapeAnchorX, shapePreviewX);
        const minY = Math.min(shapeAnchorY, shapePreviewY);
        const maxY = Math.max(shapeAnchorY, shapePreviewY);
        
        ctx.save();
        ctx.strokeStyle = strokeColor + '60'; // light dashed outline
        ctx.lineWidth = Math.max(1, brushWidth / 2);
        ctx.setLineDash([4, 4]);
        
        if (shapeType === 'circle') {
          const rx = (maxX - minX) / 2;
          const ry = (maxY - minY) / 2;
          const radius = Math.min(rx, ry);
          const cx = minX + rx;
          const cy = minY + ry;
          ctx.strokeRect(cx - radius, cy - radius, radius * 2, radius * 2);
        } else {
          ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        }
        ctx.restore();
      }

      const previewPoints = generateShapePoints(shapeType, shapeAnchorX, shapeAnchorY, shapePreviewX, shapePreviewY);
      if (previewPoints.length > 0) {
        ctx.strokeStyle = strokeColor + '80';
        ctx.lineWidth = brushWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(previewPoints[0].x, previewPoints[0].y);
        for (let i = 1; i < previewPoints.length; i++) {
          ctx.lineTo(previewPoints[i].x, previewPoints[i].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function handleUndo() {
    const undoStack = canvasMode === 'a4' ? pages[activePageIndex]?.eraserUndoStack : infiniteEraserUndo;
    const redoStack = canvasMode === 'a4' ? pages[activePageIndex]?.redoStack : infiniteRedo;
    
    if (!undoStack || undoStack.length === 0) return;
    
    const action: any = undoStack.pop()!;
    redoStack.push(action);
    
    if (action.type === 'stroke') {
      const strokeId = action.stroke.id;
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.filter(s => s.id !== strokeId);
      } else {
        infiniteStrokes = infiniteStrokes.filter(s => s.id !== strokeId);
      }
    } else if (action.type === 'erase_action') {
      const addedIds = new Set(action.addedStrokes.map((s: any) => s.id).filter(Boolean));
      if (canvasMode === 'a4') {
        let h = pages[activePageIndex].strokeHistory.filter(s => {
          if (s.id && addedIds.has(s.id)) return false;
          return !action.addedStrokes.includes(s);
        });
        h.push(...action.removedStrokes);
        pages[activePageIndex].strokeHistory = h;
      } else {
        let h = infiniteStrokes.filter(s => {
          if (s.id && addedIds.has(s.id)) return false;
          return !action.addedStrokes.includes(s);
        });
        h.push(...action.removedStrokes);
        infiniteStrokes = h;
      }
    } else if (action.type === 'delete_selection') {
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = [...pages[activePageIndex].strokeHistory, ...action.strokes];
      } else {
        infiniteStrokes = [...infiniteStrokes, ...action.strokes];
      }
      canvasImages = [...canvasImages, ...action.images];
      selectedStrokes = action.strokes;
      selectedImages = action.images;
    } else if (action.type === 'paste_selection') {
      const strokeIds = new Set(action.strokes.map((s: any) => s.id).filter(Boolean));
      const imageIds = new Set(action.images.map((img: any) => img.id).filter(Boolean));
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.filter(s => {
          if (s.id && strokeIds.has(s.id)) return false;
          return !action.strokes.includes(s);
        });
      } else {
        infiniteStrokes = infiniteStrokes.filter(s => {
          if (s.id && strokeIds.has(s.id)) return false;
          return !action.strokes.includes(s);
        });
      }
      canvasImages = canvasImages.filter(img => {
        if (img.id && imageIds.has(img.id)) return false;
        return !action.images.includes(img);
      });
      selectedStrokes = [];
      selectedImages = [];
    } else if (action.type === 'insert_image') {
      canvasImages = canvasImages.filter(img => img.id !== action.image.id);
      selectedImages = selectedImages.filter(img => img.id !== action.image.id);
    } else if (action.type === 'delete_image') {
      canvasImages = [...canvasImages, action.image];
    } else if (action.type === 'move_image') {
      const img = canvasImages.find(i => i.id === action.imageId);
      if (img) {
        img.x = action.from.x;
        img.y = action.from.y;
        canvasImages = [...canvasImages];
      }
    } else if (action.type === 'resize_image') {
      const img = canvasImages.find(i => i.id === action.imageId);
      if (img) {
        img.x = action.from.x;
        img.y = action.from.y;
        img.width = action.from.width;
        img.height = action.from.height;
        canvasImages = [...canvasImages];
      }
    } else if (action.type === 'change_color') {
      const fromMap = new Map(action.from.map((s: any) => [s.id, s]));
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.map(s => {
          const original = fromMap.get(s.id) as any;
          return original ? { ...s, color: original.color } : s;
        });
      } else {
        infiniteStrokes = infiniteStrokes.map(s => {
          const original = fromMap.get(s.id) as any;
          return original ? { ...s, color: original.color } : s;
        });
      }
      selectedStrokes = selectedStrokes.map(s => {
        const original = fromMap.get(s.id) as any;
        return original ? { ...s, color: original.color } : s;
      });
    } else if (action.type === 'move_selection') {
      if (action.strokesFrom && action.strokesFrom.length > 0) {
        const fromMap = new Map(action.strokesFrom.map((s: any) => [s.id, s]));
        if (canvasMode === 'a4') {
          pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.map(s => {
            const orig = fromMap.get(s.id) as any;
            return orig ? { ...s, points: orig.points, bounds: orig.bounds } : s;
          });
        } else {
          infiniteStrokes = infiniteStrokes.map(s => {
            const orig = fromMap.get(s.id) as any;
            return orig ? { ...s, points: orig.points, bounds: orig.bounds } : s;
          });
        }
        selectedStrokes = selectedStrokes.map(s => {
          const orig = fromMap.get(s.id) as any;
          return orig ? { ...s, points: orig.points, bounds: orig.bounds } : s;
        });
      }
      if (action.imagesFrom) {
        for (const imgFrom of action.imagesFrom) {
          const img = canvasImages.find(i => i.id === imgFrom.id);
          if (img) {
            img.x = imgFrom.x;
            img.y = imgFrom.y;
          }
          const selImg = selectedImages.find(i => i.id === imgFrom.id);
          if (selImg) {
            selImg.x = imgFrom.x;
            selImg.y = imgFrom.y;
          }
        }
        canvasImages = [...canvasImages];
        selectedImages = [...selectedImages];
      } else if (action.imageFrom) {
        const img = canvasImages.find(i => i.id === action.imageFrom.id);
        if (img) {
          img.x = action.imageFrom.x;
          img.y = action.imageFrom.y;
          canvasImages = [...canvasImages];
        }
        const selImg = selectedImages.find(i => i.id === action.imageFrom.id);
        if (selImg) {
          selImg.x = action.imageFrom.x;
          selImg.y = action.imageFrom.y;
          selectedImages = [...selectedImages];
        }
      }
    }
    
    invalidateCache();
    requestRedraw();
    saveToStore();
  }

  function handleRedo() {
    const undoStack = canvasMode === 'a4' ? pages[activePageIndex]?.eraserUndoStack : infiniteEraserUndo;
    const redoStack = canvasMode === 'a4' ? pages[activePageIndex]?.redoStack : infiniteRedo;
    
    if (!redoStack || redoStack.length === 0) return;
    
    const action: any = redoStack.pop()!;
    undoStack.push(action);
    
    if (action.type === 'stroke') {
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = [...pages[activePageIndex].strokeHistory, action.stroke];
      } else {
        infiniteStrokes = [...infiniteStrokes, action.stroke];
      }
    } else if (action.type === 'erase_action') {
      const removedIds = new Set(action.removedStrokes.map((s: any) => s.id).filter(Boolean));
      if (canvasMode === 'a4') {
        let h = pages[activePageIndex].strokeHistory.filter(s => {
          if (s.id && removedIds.has(s.id)) return false;
          return !action.removedStrokes.includes(s);
        });
        h.push(...action.addedStrokes);
        pages[activePageIndex].strokeHistory = h;
      } else {
        let h = infiniteStrokes.filter(s => {
          if (s.id && removedIds.has(s.id)) return false;
          return !action.removedStrokes.includes(s);
        });
        h.push(...action.addedStrokes);
        infiniteStrokes = h;
      }
    } else if (action.type === 'delete_selection') {
      const strokeIds = new Set(action.strokes.map((s: any) => s.id).filter(Boolean));
      const imageIds = new Set(action.images.map((img: any) => img.id).filter(Boolean));
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.filter(s => {
          if (s.id && strokeIds.has(s.id)) return false;
          return !action.strokes.includes(s);
        });
      } else {
        infiniteStrokes = infiniteStrokes.filter(s => {
          if (s.id && strokeIds.has(s.id)) return false;
          return !action.strokes.includes(s);
        });
      }
      canvasImages = canvasImages.filter(img => {
        if (img.id && imageIds.has(img.id)) return false;
        return !action.images.includes(img);
      });
      selectedStrokes = [];
      selectedImages = [];
    } else if (action.type === 'paste_selection') {
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = [...pages[activePageIndex].strokeHistory, ...action.strokes];
      } else {
        infiniteStrokes = [...infiniteStrokes, ...action.strokes];
      }
      canvasImages = [...canvasImages, ...action.images];
      selectedStrokes = action.strokes;
      selectedImages = action.images;
    } else if (action.type === 'insert_image') {
      canvasImages = [...canvasImages, action.image];
    } else if (action.type === 'delete_image') {
      canvasImages = canvasImages.filter(img => img.id !== action.image.id);
      selectedImages = selectedImages.filter(img => img.id !== action.image.id);
    } else if (action.type === 'move_image') {
      const img = canvasImages.find(i => i.id === action.imageId);
      if (img) {
        img.x = action.to.x;
        img.y = action.to.y;
        canvasImages = [...canvasImages];
      }
    } else if (action.type === 'resize_image') {
      const img = canvasImages.find(i => i.id === action.imageId);
      if (img) {
        img.x = action.to.x;
        img.y = action.to.y;
        img.width = action.to.width;
        img.height = action.to.height;
        canvasImages = [...canvasImages];
      }
    } else if (action.type === 'change_color') {
      const toMap = new Map(action.to.map((s: any) => [s.id, s]));
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.map(s => {
          const updated = toMap.get(s.id) as any;
          return updated ? { ...s, color: updated.color } : s;
        });
      } else {
        infiniteStrokes = infiniteStrokes.map(s => {
          const updated = toMap.get(s.id) as any;
          return updated ? { ...s, color: updated.color } : s;
        });
      }
      selectedStrokes = selectedStrokes.map(s => {
        const updated = toMap.get(s.id) as any;
        return updated ? { ...s, color: updated.color } : s;
      });
    } else if (action.type === 'move_selection') {
      if (action.strokesTo && action.strokesTo.length > 0) {
        const toMap = new Map(action.strokesTo.map((s: any) => [s.id, s]));
        if (canvasMode === 'a4') {
          pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.map(s => {
            const updated = toMap.get(s.id) as any;
            return updated ? { ...s, points: updated.points, bounds: updated.bounds } : s;
          });
        } else {
          infiniteStrokes = infiniteStrokes.map(s => {
            const updated = toMap.get(s.id) as any;
            return updated ? { ...s, points: updated.points, bounds: updated.bounds } : s;
          });
        }
        selectedStrokes = selectedStrokes.map(s => {
          const updated = toMap.get(s.id) as any;
          return updated ? { ...s, points: updated.points, bounds: updated.bounds } : s;
        });
      }
      if (action.imagesTo) {
        for (const imgTo of action.imagesTo) {
          const img = canvasImages.find(i => i.id === imgTo.id);
          if (img) {
            img.x = imgTo.x;
            img.y = imgTo.y;
          }
          const selImg = selectedImages.find(i => i.id === imgTo.id);
          if (selImg) {
            selImg.x = imgTo.x;
            selImg.y = imgTo.y;
          }
        }
        canvasImages = [...canvasImages];
        selectedImages = [...selectedImages];
      } else if (action.imageTo) {
        const img = canvasImages.find(i => i.id === action.imageTo.id);
        if (img) {
          img.x = action.imageTo.x;
          img.y = action.imageTo.y;
          canvasImages = [...canvasImages];
        }
        const selImg = selectedImages.find(i => i.id === action.imageTo.id);
        if (selImg) {
          selImg.x = action.imageTo.x;
          selImg.y = action.imageTo.y;
          selectedImages = [...selectedImages];
        }
      }
    }
    
    invalidateCache();
    requestRedraw();
    saveToStore();
  }

  async function generatePdfData(scale: number): Promise<jsPDF> {
    let pdf: jsPDF;

    if (showCanvas) {
      if (canvasMode === 'infinite') {
        // Bounding Box of all drawing strokes
        let box = getStrokesBoundingBox(infiniteStrokes, 'infinite');
        if (!box) {
          box = { x: 0, y: 0, width: containerWidth || 800, height: containerHeight || 1130 };
        }
        
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = box.width * scale;
        exportCanvas.height = box.height * scale;
        const exportCtx = exportCanvas.getContext('2d');
        if (!exportCtx) throw new Error('Could not create canvas context');

        // Scale all drawing operations
        exportCtx.scale(scale, scale);

        // White background
        exportCtx.fillStyle = '#FFFFFF';
        exportCtx.fillRect(0, 0, box.width, box.height);

        // Background Image
        if (currentBgImage) {
          exportCtx.save();
          exportCtx.globalAlpha = bgOpacity / 100;
          const pattern = exportCtx.createPattern(currentBgImage, 'repeat');
          if (pattern) {
            exportCtx.fillStyle = pattern;
            exportCtx.fillRect(0, 0, box.width, box.height);
          }
          exportCtx.restore();
        }

        // Guidelines
        drawGuidelinesInWorld(exportCtx, box.x, box.y, box.width, box.height, activeBg, bgOpacity);

        // Strokes (offset by bounding box x and y)
        exportCtx.save();
        exportCtx.translate(-box.x, -box.y);
        for (const stroke of infiniteStrokes) {
          drawStroke(exportCtx, stroke);
        }
        exportCtx.restore();

        // Use compressed PNG to keep file size small and lines lossless
        const imgData = exportCanvas.toDataURL('image/png');
        pdf = new jsPDF({
          orientation: box.width > box.height ? 'l' : 'p',
          unit: 'px',
          format: [box.width, box.height]
        });
        pdf.addImage(imgData, 'PNG', 0, 0, box.width, box.height, undefined, 'FAST');
      } else {
        const pdfOrientation = a4Orientation === 'landscape' ? 'l' : 'p';
        pdf = new jsPDF({
          orientation: pdfOrientation,
          unit: 'px',
          format: [a4BaseWidth, a4BaseHeight]
        });

        for (let i = 0; i < pages.length; i++) {
          if (i > 0) {
            pdf.addPage([a4BaseWidth, a4BaseHeight], pdfOrientation);
          }
          const page = pages[i];
          const exportCanvas = document.createElement('canvas');
          exportCanvas.width = a4BaseWidth * scale;
          exportCanvas.height = a4BaseHeight * scale;
          const exportCtx = exportCanvas.getContext('2d');
          if (!exportCtx) throw new Error('Could not create canvas context');

          // Scale all drawing operations
          exportCtx.scale(scale, scale);

          // White background
          exportCtx.fillStyle = '#FFFFFF';
          exportCtx.fillRect(0, 0, a4BaseWidth, a4BaseHeight);

          // Background Image
          if (currentBgImage) {
            exportCtx.save();
            exportCtx.globalAlpha = bgOpacity / 100;
            const pattern = exportCtx.createPattern(currentBgImage, 'repeat');
            if (pattern) {
              exportCtx.fillStyle = pattern;
              exportCtx.fillRect(0, 0, a4BaseWidth, a4BaseHeight);
            }
            exportCtx.restore();
          }

          // Guidelines
          drawGuidelinesInWorld(exportCtx, 0, 0, a4BaseWidth, a4BaseHeight, activeBg, bgOpacity);

          // Strokes
          for (const stroke of page.strokeHistory || []) {
            drawStroke(exportCtx, stroke);
          }

          // Use compressed PNG to keep file size small and lines lossless
          const imgData = exportCanvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, a4BaseWidth, a4BaseHeight, undefined, 'FAST');
        }
      }
    } else {
      // Markdown/Text Mode
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      tempDiv.style.width = '800px';
      tempDiv.style.background = '#FFFFFF';
      tempDiv.style.color = '#000000';
      tempDiv.style.padding = '40px';
      tempDiv.style.boxSizing = 'border-box';
      tempDiv.className = 'prose max-w-none';
      
      const style = document.createElement('style');
      style.innerHTML = `
        .prose {
          color: #1a1a1a !important;
          background-color: #ffffff !important;
          font-family: system-ui, -apple-system, sans-serif !important;
        }
        .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
          color: #0040e0 !important;
          margin-top: 1.5em !important;
          margin-bottom: 0.5em !important;
        }
        .prose a {
          color: #0040e0 !important;
        }
        .prose code {
          color: #0040e0 !important;
          background-color: #f3f4f6 !important;
        }
        .prose blockquote {
          border-left-color: #d1d5db !important;
          background-color: #f9fafb !important;
          color: #4b5563 !important;
        }
        .prose hr {
          border-top: 1px solid #e5e7eb !important;
          margin: 2em 0 !important;
        }
      `;
      tempDiv.appendChild(style);

      const contentSpan = document.createElement('div');
      contentSpan.innerHTML = getParsedPreviewHtml(editorText);
      tempDiv.appendChild(contentSpan);

      document.body.appendChild(tempDiv);
      const canvas = await html2canvas(tempDiv, {
        backgroundColor: '#FFFFFF',
        scale: scale, // Render text layout at high resolution
        logging: false
      });
      document.body.removeChild(tempDiv);

      const imgWidth = 800;
      const pageHeight = 1130;
      const canvasHeight = canvas.height * (imgWidth / canvas.width);

      pdf = new jsPDF('p', 'px', [imgWidth, pageHeight]);

      let heightLeft = canvasHeight;
      let position = 0;

      // Use compressed PNG to keep file size small and lines lossless
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, canvas.height * (imgWidth / canvas.width), undefined, 'FAST');
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = position - pageHeight;
        pdf.addPage([imgWidth, pageHeight]);
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, canvas.height * (imgWidth / canvas.width), undefined, 'FAST');
        heightLeft -= pageHeight;
      }
    }

    return pdf;
  }

  async function handleExportPdf() {
    isExportingPdf = true;
    try {
      // Start generating the PDF data in the background
      const pdfPromise = generatePdfData(3);

      // Immediately query the user where to save the file
      const defaultName = showCanvas
        ? `canvas_${task.name.toLowerCase().replace(/\s+/g, '_')}.pdf`
        : `text_${task.name.toLowerCase().replace(/\s+/g, '_')}.pdf`;

      const filePath = await save({
        filters: [{
          name: 'PDF Document',
          extensions: ['pdf']
        }],
        defaultPath: defaultName
      });

      if (!filePath) {
        isExportingPdf = false;
        return; // User cancelled
      }

      // Wait for the background PDF generation to complete
      const pdf = await pdfPromise;

      const pdfArrayBuffer = pdf.output('arraybuffer');
      await writeFile(filePath, new Uint8Array(pdfArrayBuffer));
      store.showNotification(t('practice.exportPdfSuccess'), 'success');
    } catch (err) {
      console.error('[PDF Export] Failed:', err);
      store.showNotification(t('practice.exportPdfError'), 'error');
    } finally {
      isExportingPdf = false;
    }
  }

  function clearCanvas() {
    if (strokeHistory.length === 0 && canvasImages.length === 0 && !hasCheckedWork) return;
    
    store.confirm(
      t('practice.canvas.clear'),
      'Are you sure you want to clear your drawing canvas? This will discard your current calligraphy sketch and AI feedback.',
      () => {
        if (canvasMode === 'a4') {
          if (pages[activePageIndex]) {
            pages[activePageIndex].strokeHistory = [];
            pages[activePageIndex].redoStack = [];
            pages[activePageIndex].eraserUndoStack = [];
          }
        } else {
          infiniteStrokes = [];
        }
        canvasImages = [];

        infiniteRedo = [];
        infiniteEraserUndo = [];
        
        feedbackText = '';
        feedbackScore = null;
        feedbackMarkers = [];
        hasCheckedWork = false;
        showFeedback = false;
        showCritiqueBanner = false;
        activeTooltipMarker = null;
        selectedImages = [];

        saveToStore();

        if (store.activeProject && store.activeTask) {
          store.updateTask(store.activeProject.id, store.activeTask.id, {
            critique: null
          });
        }
      }
    );
  }

  function copySelected() {
    if (selectedStrokes.length === 0 && selectedImages.length === 0) return;
    copiedStrokes = JSON.parse(JSON.stringify(selectedStrokes));
    copiedImages = JSON.parse(JSON.stringify(selectedImages));
    lastCopiedDrawingTime = Date.now();
    const copyData = {
      strokes: copiedStrokes,
      images: copiedImages
    };
    const textData = 'canvascritique-data:' + JSON.stringify(copyData);
    navigator.clipboard.writeText(textData).catch(err => {
      console.warn('Failed to write selection to clipboard:', err);
    });
    selectedStrokes = [];
    selectedImages = [];
  }

  function cutSelected() {
    if (selectedStrokes.length === 0 && selectedImages.length === 0) return;
    copiedStrokes = JSON.parse(JSON.stringify(selectedStrokes));
    copiedImages = JSON.parse(JSON.stringify(selectedImages));
    lastCopiedDrawingTime = Date.now();
    const copyData = {
      strokes: copiedStrokes,
      images: copiedImages
    };
    const textData = 'canvascritique-data:' + JSON.stringify(copyData);
    navigator.clipboard.writeText(textData).catch(err => {
      console.warn('Failed to write selection to clipboard:', err);
    });

    const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
    const deletedStrokesList = [];
    const deletedImagesList = [];

    if (selectedImages.length > 0) {
      deletedImagesList.push(...selectedImages);
      const ids = new Set(selectedImages.map(img => img.id));
      canvasImages = canvasImages.filter(img => !ids.has(img.id));
    }

    if (selectedStrokes.length > 0) {
      const history = canvasMode === 'a4' ? pages[activePageIndex].strokeHistory : infiniteStrokes;
      const removedStrokes = history.filter(s => selectedStrokes.some(sel => sel === s || (sel.id && sel.id === s.id)));
      deletedStrokesList.push(...removedStrokes);
      
      const removedIds = new Set(removedStrokes.map(s => s.id));
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.filter(s => !removedIds.has(s.id));
      } else {
        infiniteStrokes = infiniteStrokes.filter(s => !removedIds.has(s.id));
      }
    }

    undoStack.push({
      type: 'delete_selection',
      strokes: deletedStrokesList,
      images: deletedImagesList
    });
    
    if (canvasMode === 'a4') {
      pages[activePageIndex].redoStack = [];
    } else {
      infiniteRedo = [];
    }
    
    selectedStrokes = [];
    selectedImages = [];
    contextMenu = null;
    saveToStore();
    invalidateCache();
    requestRedraw();
  }

  function changeSelectedStrokesColor(newColor: string) {
    if (selectedStrokes.length === 0) return;
    
    // Ensure all selected strokes have IDs
    for (const s of selectedStrokes) {
      if (!s.id) {
        s.id = Math.random().toString(36).substring(2, 9);
      }
    }

    const originalStrokes = JSON.parse(JSON.stringify(selectedStrokes));
    
    selectedStrokes = selectedStrokes.map(s => ({
      ...s,
      color: newColor
    }));
    
    const selectedIds = new Set(selectedStrokes.map(s => s.id));
    
    if (canvasMode === 'a4') {
      pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.map(stroke => {
        if (stroke.id && selectedIds.has(stroke.id)) {
          return selectedStrokes.find(s => s.id === stroke.id)!;
        }
        return stroke;
      });
    } else {
      infiniteStrokes = infiniteStrokes.map(stroke => {
        if (stroke.id && selectedIds.has(stroke.id)) {
          return selectedStrokes.find(s => s.id === stroke.id)!;
        }
        return stroke;
      });
    }
    
    const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
    undoStack.push({
      type: 'change_color',
      from: originalStrokes,
      to: JSON.parse(JSON.stringify(selectedStrokes))
    });
    
    if (canvasMode === 'a4') {
      pages[activePageIndex].redoStack = [];
    } else {
      infiniteRedo = [];
    }
    
    saveToStore();
    invalidateCache();
    requestRedraw();
  }

  function deleteSelected() {
    let deletedAny = false;
    const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
    
    // Create transaction lists
    const deletedStrokesList = [];
    const deletedImagesList = [];

    if (selectedImages.length > 0) {
      deletedImagesList.push(...selectedImages);
      const ids = new Set(selectedImages.map(img => img.id));
      canvasImages = canvasImages.filter(img => !ids.has(img.id));
      deletedAny = true;
    }

    if (selectedStrokes.length > 0) {
      const history = canvasMode === 'a4' ? pages[activePageIndex].strokeHistory : infiniteStrokes;
      const removedStrokes = history.filter(s => selectedStrokes.some(sel => sel === s || (sel.id && sel.id === s.id)));
      deletedStrokesList.push(...removedStrokes);
      
      const removedIds = new Set(removedStrokes.map(s => s.id));
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.filter(s => !removedIds.has(s.id));
      } else {
        infiniteStrokes = infiniteStrokes.filter(s => !removedIds.has(s.id));
      }
      deletedAny = true;
    }

    if (deletedAny) {
      // Push transaction action to undo stack
      undoStack.push({
        type: 'delete_selection',
        strokes: deletedStrokesList,
        images: deletedImagesList
      });
      if (canvasMode === 'a4') {
        pages[activePageIndex].redoStack = [];
      } else {
        infiniteRedo = [];
      }
      
      selectedStrokes = [];
      selectedImages = [];
      contextMenu = null;
      saveToStore();
      redraw();
    }
  }

  let fileInputEl = $state<HTMLInputElement | null>(null);

  function triggerImageUpload() {
    fileInputEl?.click();
  }

  async function handleCanvasImageUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          const mediaId = await saveMediaToDb(dataUrl, file.name);
          
          const centerX = canvasMode === 'infinite'
            ? (containerWidth / 2 - panOffset.x) / zoomScale
            : 400;
          const centerY = canvasMode === 'infinite'
            ? (containerHeight / 2 - panOffset.y) / zoomScale
            : 565;
            
          const img = new Image();
          img.src = dataUrl;
          img.onload = () => {
            let width = img.width;
            let height = img.height;
            const maxDim = 400;
            if (width > maxDim || height > maxDim) {
              const scale = Math.min(maxDim / width, maxDim / height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            
            const newImage: CanvasImage = {
              id: 'img-' + Date.now(),
              mediaId,
              x: centerX - width / 2,
              y: centerY - height / 2,
              width,
              height,
              pageIndex: canvasMode === 'a4' ? activePageIndex : 0,
              zIndex: Date.now()
            };
            
             canvasImages = [...canvasImages, newImage];
             selectedImages = [canvasImages.find(img => img.id === newImage.id) || newImage];
             selectedStrokes = [];
             saveToStore();
            redraw();
          };
        } catch (err) {
          console.error(err);
          alert('Failed to insert canvas image.');
        }
      };
      reader.readAsDataURL(file);
      target.value = '';
    }
  }

  async function handlePaste(targetX: number, targetY: number) {
    try {
      const items = await navigator.clipboard.read();
      let hasImage = false;
      let imageType = '';
      let imageBlob: Blob | null = null;
      let textContent = '';

      for (const item of items) {
        const imgT = item.types.find(t => t.startsWith('image/'));
        if (imgT) {
          hasImage = true;
          imageType = imgT;
          imageBlob = await item.getType(imgT);
          break;
        }
      }

      if (!hasImage) {
        try {
          textContent = await navigator.clipboard.readText();
        } catch (e) {}
      }

      if (hasImage && imageBlob) {
        const base64Data = await blobToBase64(imageBlob);
        const ext = imageType.split('/')[1] || 'png';
        const mediaId = await saveMediaToDb(base64Data, `canvas_image_${Date.now()}.${ext}`);
        
        const img = new Image();
        img.src = base64Data;
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          const maxDim = 400;
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          
          const newImage: CanvasImage = {
            id: 'img-' + Date.now(),
            mediaId,
            x: targetX - width / 2,
            y: targetY - height / 2,
            width,
            height,
            pageIndex: canvasMode === 'a4' ? activePageIndex : 0,
            zIndex: Date.now()
          };
          
          canvasImages = [...canvasImages, newImage];
          selectedImages = [canvasImages.find(img => img.id === newImage.id) || newImage];
          selectedStrokes = [];
          
          const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
          undoStack.push({
            type: 'insert_image',
            image: newImage
          });
          if (canvasMode === 'a4') {
            pages[activePageIndex].redoStack = [];
          } else {
            infiniteRedo = [];
          }

          saveToStore();
          redraw();
        };
        return;
      }

      if (textContent) {
        if (textContent.startsWith('canvascritique-data:')) {
          try {
            const jsonStr = textContent.substring('canvascritique-data:'.length);
            const copyData = JSON.parse(jsonStr);
            copiedStrokes = copyData.strokes || [];
            copiedImages = copyData.images || [];
            pasteStrokesAndImages(targetX, targetY);
            return;
          } catch (e) {
            console.warn('Failed to parse selection from clipboard text:', e);
          }
        } else if (textContent.startsWith('canvascritique-strokes:')) {
          try {
            const jsonStr = textContent.substring('canvascritique-strokes:'.length);
            copiedStrokes = JSON.parse(jsonStr);
            copiedImages = [];
            pasteStrokesAndImages(targetX, targetY);
            return;
          } catch (e) {
            console.warn('Failed to parse strokes from clipboard text:', e);
          }
        }
      }
    } catch (err) {
      console.warn('Clipboard read error or not permitted: ', err);
    }
    
    if ((copiedStrokes && copiedStrokes.length > 0) || (copiedImages && copiedImages.length > 0)) {
      pasteStrokesAndImages(targetX, targetY);
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function pasteStrokesAndImages(targetX: number, targetY: number) {
    if (copiedStrokes.length === 0 && copiedImages.length === 0) return;
    
    const strokesToPaste = JSON.parse(JSON.stringify(copiedStrokes));
    const imagesToPaste = JSON.parse(JSON.stringify(copiedImages));
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    for (const stroke of strokesToPaste) {
      for (const p of stroke.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }

    for (const img of imagesToPaste) {
      if (img.x < minX) minX = img.x;
      if (img.y < minY) minY = img.y;
      if (img.x + img.width > maxX) maxX = img.x + img.width;
      if (img.y + img.height > maxY) maxY = img.y + img.height;
    }

    if (minX === Infinity) {
      minX = targetX - 50;
      maxX = targetX + 50;
      minY = targetY - 50;
      maxY = targetY + 50;
    }
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    
    for (const stroke of strokesToPaste) {
      stroke.id = Math.random().toString(36).substring(2, 9);
      for (const p of stroke.points) {
        p.x += dx;
        p.y += dy;
      }
      stroke.bounds = calculateStrokeBounds(stroke);
    }

    const now = Date.now();
    for (let i = 0; i < imagesToPaste.length; i++) {
      const img = imagesToPaste[i];
      img.id = 'img-' + (now + i);
      img.x += dx;
      img.y += dy;
      img.zIndex = now + i;
      img.pageIndex = canvasMode === 'a4' ? activePageIndex : 0;
    }
    
    const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
    undoStack.push({
      type: 'paste_selection',
      strokes: strokesToPaste,
      images: imagesToPaste
    });

    if (canvasMode === 'a4') {
      pages[activePageIndex].strokeHistory.push(...strokesToPaste);
      pages[activePageIndex].redoStack = [];
      pages[activePageIndex].strokeHistory = [...pages[activePageIndex].strokeHistory];
      canvasImages = [...canvasImages, ...imagesToPaste];
    } else {
      infiniteStrokes.push(...strokesToPaste);
      infiniteRedo = [];
      infiniteStrokes = [...infiniteStrokes];
      canvasImages = [...canvasImages, ...imagesToPaste];
    }
    
    selectedStrokes = strokesToPaste;
    const pastedImageIds = new Set(imagesToPaste.map(img => img.id));
    selectedImages = canvasImages.filter(img => pastedImageIds.has(img.id));
    contextMenu = null;
    saveToStore();
    invalidateCache();
    redraw();
  }

  // Handle global keyboard shortcuts
  onMount(() => {
    function handleKeyDown(e) {
      // Don't intercept if inside an input or textarea
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }

      // Cancel pending image placement
      if (e.key === 'Escape' && pendingInsertImage) {
        pendingInsertImage = null;
        e.preventDefault();
        return;
      }
      
      if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        if (selectedStrokes.length > 0) {
          copySelected();
          e.preventDefault();
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        const centerX = canvasMode === 'infinite'
          ? (containerWidth / 2 - panOffset.x) / zoomScale
          : 400;
        const centerY = canvasMode === 'infinite'
          ? (containerHeight / 2 - panOffset.y) / zoomScale
          : 565;
        handlePaste(centerX, centerY);
        e.preventDefault();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        e.preventDefault();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        handleRedo();
        e.preventDefault();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedImages.length > 0 || selectedStrokes.length > 0) {
          deleteSelected();
          e.preventDefault();
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const keyMap: Record<string, string> = {
          'p': 'pen',
          'P': 'pen',
          'e': 'eraser',
          'E': 'eraser',
          'h': 'pan',
          'H': 'pan',
          's': 'select',
          'S': 'select',
        };
        const newTool = keyMap[e.key];
        if (newTool) {
          if (newTool === 'pan' && canvasMode !== 'infinite') return;
          activeTool = newTool;
          keyboardToolSwitch = true;
          if (keyboardToolSwitchTimeout) clearTimeout(keyboardToolSwitchTimeout);
          keyboardToolSwitchTimeout = setTimeout(() => { keyboardToolSwitch = false; }, 1000);
          e.preventDefault();
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });





  function handleCritiqueClick(e) {
    const link = e.target.closest('a');
    if (link) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        e.preventDefault();
        const markerId = href.substring(1);
        
        let marker = feedbackMarkers.find(m => m.id === markerId);
        if (!marker) {
          const indexMatch = markerId.match(/marker-(\d+)/);
          if (indexMatch) {
            const idx = parseInt(indexMatch[1]);
            marker = feedbackMarkers[idx];
          }
        }
        if (!marker) {
          marker = feedbackMarkers.find(m => m.id === markerId || m.id.endsWith(markerId));
        }

        if (marker) {
          if (canvasMode === 'a4') {
            activePageIndex = marker.pageIndex ?? 0;
          }
          activeTooltipMarker = marker;
          tick().then(() => {
            if (canvasMode === 'infinite') {
              if (canvasContainer) {
                let px = canvasContainer.clientWidth / 2 - marker.canvasX * zoomScale;
                let py = canvasContainer.clientHeight / 2 - marker.canvasY * zoomScale;
                // Apply OneNote-style boundary (top-left scroll limit of 0)
                panOffset = {
                  x: Math.min(0, px),
                  y: Math.min(0, py)
                };
                redraw();
              }
            } else {
              if (canvasContainer) {
                canvasContainer.scrollTo({
                  left: Math.max(0, marker.canvasX - canvasContainer.clientWidth / 2),
                  top: Math.max(0, marker.canvasY - canvasContainer.clientHeight / 2),
                  behavior: 'smooth'
                });
              }
            }
          });
        }
      }
    }
  }

  function gradeMultipleChoiceLocally(questions: any[], answers: Record<string, string[]>): { feedbackText: string; feedbackScore: number } {
    let correctCount = 0;
    const totalQuestions = questions.length;
    let feedbackLines: string[] = [];

    const isDe = store.settings.language === 'Deutsch';

    if (isDe) {
      feedbackLines.push(`### Multiple-Choice-Auswertung`);
    } else {
      feedbackLines.push(`### Multiple Choice Evaluation`);
    }

    for (let i = 0; i < totalQuestions; i++) {
      const q = questions[i];
      const selected = answers[q.id] || [];
      const correctOptionIds = q.options.filter((o: any) => o.isCorrect).map((o: any) => o.id);
      
      const selectedSet = new Set(selected);
      const correctSet = new Set(correctOptionIds);
      const isCorrect = selectedSet.size === correctSet.size && [...selectedSet].every(id => correctSet.has(id));

      const questionText = q.question.replace(/\r?\n/g, ' ');
      const displayQuestion = questionText.substring(0, 50) + (questionText.length > 50 ? '...' : '');

      if (isCorrect) {
        correctCount++;
        feedbackLines.push(`- **Frage ${i + 1}:** ${displayQuestion} → ✅ ${isDe ? 'Richtig' : 'Correct'}`);
      } else {
        const correctNames = q.options.filter((o: any) => o.isCorrect).map((o: any) => o.text || '...').join(', ');
        feedbackLines.push(`- **Frage ${i + 1}:** ${displayQuestion} → ❌ ${isDe ? 'Falsch' : 'Incorrect'} (${isDe ? 'Richtige Antwort' : 'Correct answer'}: *${correctNames}*)`);
      }
    }

    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;
    
    if (isDe) {
      feedbackLines.push(`\n**Gesamtergebnis:** ${correctCount} von ${totalQuestions} richtig (${score}%)`);
    } else {
      feedbackLines.push(`\n**Overall Result:** ${correctCount} of ${totalQuestions} correct (${score}%)`);
    }

    return {
      feedbackText: feedbackLines.join('\n'),
      feedbackScore: score
    };
  }

  // Multimodal AI Grading using Cropped PNG bounding box
  // Multimodal AI Grading using Cropped PNG bounding box
  async function checkWork() {
    if (!store.activeProject || !store.activeTask) return;
    saveToStore(true);

    // Check if we should grade locally (Multiple Choice only)
    const hasDrawing = pages && (
      (pages.some((p: any) => p.strokeHistory && p.strokeHistory.length > 0)) ||
      (canvasImages && canvasImages.length > 0)
    );
    const hasText = editorText && editorText.trim() !== '';
    const hasMc = task.multipleChoiceTasks && task.multipleChoiceTasks.length > 0;

    if (hasMc && !hasDrawing && !hasText) {
      const result = gradeMultipleChoiceLocally(task.multipleChoiceTasks, selectedAnswers);
      feedbackText = result.feedbackText;
      feedbackScore = result.feedbackScore;
      feedbackMarkers = [];
      hasCheckedWork = true;
      showFeedback = false;
      showSolution = true;
      showTask = false;
      showCritiqueBanner = false;

      // Save to database
      const updatedData: any = {
        critique: {
          feedbackText: result.feedbackText,
          feedbackScore: result.feedbackScore,
          feedbackMarkers: [],
          canvasCritique: null,
          textCritique: null
        }
      };
      if (result.feedbackScore === 100 && store.settings.autoCompleteOnSuccess) {
        updatedData.completed = true;
      } else {
        updatedData.completed = false;
      }
      
      await store.updateTask(store.activeProject.id, task.id, updatedData);
      return;
    }

    const effectiveSettings = store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id, store.activeTask?.id)
      : store.settings;

    const selectedModelId = effectiveSettings.openRouterModel;

    const sendTaskMedia = effectiveSettings.sendTaskMedia ?? true;
    const sendSolutionMedia = effectiveSettings.sendSolutionMedia ?? true;

    function shouldIncludeFile(filename: string, isSolution: boolean): boolean {
      const mode = isSolution
        ? (effectiveSettings.solutionMediaFilterMode ?? 'blacklist')
        : (effectiveSettings.taskMediaFilterMode ?? 'blacklist');
      const extensionsStr = isSolution
        ? (effectiveSettings.solutionMediaFilterExtensions ?? '')
        : (effectiveSettings.taskMediaFilterExtensions ?? '');
      
      const extensions = extensionsStr
        .split(',')
        .map((ext: string) => ext.trim().toLowerCase())
        .filter((ext: string) => ext.length > 0)
        .map((ext: string) => ext.startsWith('.') ? ext : '.' + ext);
        
      if (extensions.length === 0) {
        return mode === 'blacklist';
      }
      
      const fileExt = '.' + filename.split('.').pop()!.toLowerCase();
      
      if (mode === 'whitelist') {
        return extensions.includes(fileExt);
      } else {
        return !extensions.includes(fileExt);
      }
    }

    const filesToSend: Array<{ name: string; source: 'instruction' | 'solution'; modality: string }> = [];

    if (sendTaskMedia) {
      if (task.instructionFiles && Array.isArray(task.instructionFiles)) {
        task.instructionFiles.forEach(f => {
          if (shouldIncludeFile(f.name, false)) {
            const modality = getFileModality(f.name);
            if (modality !== 'text') {
              filesToSend.push({ name: f.name, source: 'instruction', modality });
            }
          }
        });
      } else if (task.instructionFile) {
        const f = task.instructionFile;
        if (shouldIncludeFile(f.name, false)) {
          const modality = getFileModality(f.name);
          if (modality !== 'text') {
            filesToSend.push({ name: f.name, source: 'instruction', modality });
          }
        }
      }
    }

    if (sendSolutionMedia) {
      if (task.solutionFiles && Array.isArray(task.solutionFiles)) {
        task.solutionFiles.forEach(f => {
          if (shouldIncludeFile(f.name, true)) {
            const modality = getFileModality(f.name);
            if (modality !== 'text') {
              filesToSend.push({ name: f.name, source: 'solution', modality });
            }
          }
        });
      } else if (task.solutionFile) {
        const f = task.solutionFile;
        if (shouldIncludeFile(f.name, true)) {
          const modality = getFileModality(f.name);
          if (modality !== 'text') {
            filesToSend.push({ name: f.name, source: 'solution', modality });
          }
        }
      }
    }

    const supported = getModelSupportedModalities('openrouter', selectedModelId);
    const unsupportedFiles = filesToSend.filter(f => 
      (f.modality === 'image' && !supported.image) ||
      (f.modality === 'audio' && !supported.audio) ||
      (f.modality === 'video' && !supported.video) ||
      (f.modality === 'pdf' && !supported.pdf)
    );

    if (unsupportedFiles.length > 0) {
      const intro = t('dialogs.unsupportedMediaIntro', { modelName: selectedModelId });
      const outro = t('dialogs.unsupportedMediaOutro');
      
      const fileListStr = unsupportedFiles.map(f => {
        const sourceLabel = f.source === 'instruction' 
          ? t('dialogs.unsupportedMediaInstruction') 
          : t('dialogs.unsupportedMediaSolution');
        const typeLabel = f.modality.toUpperCase();
        return `• ${f.name} (${sourceLabel}, ${typeLabel})`;
      }).join('\n');

      const fullMessage = `${intro}\n\n${fileListStr}\n\n${outro}`;

      store.confirm(
        t('dialogs.unsupportedMediaTitle'),
        fullMessage,
        () => {
          const unsupportedNames = unsupportedFiles.map(f => f.name);
          const filteredTask = {
            ...task,
            section: task.category,
            instructionFiles: task.instructionFiles ? task.instructionFiles.filter(f => !unsupportedNames.includes(f.name)) : undefined,
            solutionFiles: task.solutionFiles ? task.solutionFiles.filter(f => !unsupportedNames.includes(f.name)) : undefined,
            instructionFile: task.instructionFile && unsupportedNames.includes(task.instructionFile.name) ? null : task.instructionFile,
            solutionFile: task.solutionFile && unsupportedNames.includes(task.solutionFile.name) ? null : task.solutionFile
          };
          proceedWithChecking(effectiveSettings, filteredTask);
        },
        () => {},
        false,
        t('dialogs.unsupportedMediaConfirm'),
        t('dialogs.unsupportedMediaCancel')
      );
      return;
    }

    proceedWithChecking(effectiveSettings, { ...task, section: task.category });
  }

  function proceedWithChecking(effectiveSettings: any, taskDataToSend: any) {
    feedbackMarkers = [];
    activeTooltipMarker = null;
    showFeedback = true;
    showCritiqueBanner = true;
    hasCheckedWork = true;
    if (task.multipleChoiceTasks && task.multipleChoiceTasks.length > 0) {
      showSolution = true;
    }
    feedbackText = t('practice.canvas.analyzing') || "Analyzing stroke geometries and guidelines alignment...";
    feedbackScore = null;

    try {
      store.queueTaskChecking(store.activeProject!.id, store.activeTask!.id, {
        canvasMode: canvasMode as 'infinite' | 'a4',
        pages,
        infiniteStrokes,
        canvasImages: JSON.parse(JSON.stringify(canvasImages)),
        currentBgUrl,
        bgOpacity,
        activeBg,
        task: taskDataToSend,
        projectGuidelines: store.activeProject!.guidelines?.trim(),
        settings: {
          openRouterApiKey: effectiveSettings.openRouterApiKey,
          openRouterModel: effectiveSettings.openRouterModel,
          showCanvasAnnotations: effectiveSettings.showCanvasAnnotations,
          openRouterReasoning: effectiveSettings.openRouterReasoning,
          openRouterProvider: effectiveSettings.openRouterProvider,
          sendTaskMedia: effectiveSettings.sendTaskMedia,
          sendSolutionMedia: effectiveSettings.sendSolutionMedia,
          sendCanvasBackground: effectiveSettings.sendCanvasBackground,
          sendTaskText: effectiveSettings.sendTaskText,
          sendSolutionText: effectiveSettings.sendSolutionText,
          sendContextText: effectiveSettings.sendContextText,
          sendContextMedia: effectiveSettings.sendContextMedia,
          maxOutputTokens: effectiveSettings.maxOutputTokens,
          language: effectiveSettings.language,
          customSystemPrompt: effectiveSettings.customSystemPrompt,
          taskMediaFilterMode: effectiveSettings.taskMediaFilterMode,
          taskMediaFilterExtensions: effectiveSettings.taskMediaFilterExtensions,
          solutionMediaFilterMode: effectiveSettings.solutionMediaFilterMode,
          solutionMediaFilterExtensions: effectiveSettings.solutionMediaFilterExtensions
        },
        defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
        activeMode,
        editorText,
        multipleChoiceAnswers: selectedAnswers
      });

      // Auto-toggle to Preview mode when feedback is submitted
      store.settings.editorShowAllRaw = false;
      store.saveSettings();
      activeLineIndex = null;

    } catch (err: any) {
      feedbackText = `❌ **Error:**\n\n${err.message}`;
      feedbackScore = null;
      feedbackMarkers = [];
    }
  }

  function handleBack() {
    store.setView('project-detail');
  }
</script>

<svelte:window onclick={handleWindowClick} />

<div class="grow flex flex-col min-w-0 h-full overflow-hidden relative">
  {#if showSuccessNotification}
    <div 
      transition:fly={{ y: -20, duration: 400 }}
      class="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-emerald-600 text-white px-5 py-3 rounded-full shadow-lg font-semibold text-sm select-none border border-emerald-500/30"
    >
      <span class="material-symbols-outlined text-[20px] text-white">check_circle</span>
      <span>Task successfully completed!</span>
    </div>
  {/if}

  <PracticeHeader
    {task}
    {canvasMode}
    bind:showCanvas
    bind:showText
    bind:showMultipleChoice
    bind:pages
    bind:activePageIndex
    {strokeHistory}
    {redoStack}
    {eraserUndoStack}
    bind:zoomScale
    bind:panOffset
    bind:showTask
    bind:showSolution
    bind:showFeedback
    {hasCheckedWork}
    bind:activeTooltipMarker
    {isOnlyMcCorrected}
    {handleBack}
    {handleUndo}
    {handleRedo}
    {checkWork}
  />

  <!-- Interactive practice screen split layout -->
  <div class="grow h-full flex overflow-hidden relative w-full {sidebarPosition === 'top' || sidebarPosition === 'bottom' ? 'flex-col' : 'flex-row'} font-sans">
    
    <!-- Info panels: task, solution, and critique -->
    <PracticeInfoPanels
      bind:splitWidth
      {activeLeftPanels}
      {feedbackScore}
      {isChecking}
      {feedbackText}
      {parseMarkdown}
      {handleCritiqueClick}
      {task}
      textFontSize={canvasTextFontSize}
      isRightContentVisible={showCanvas || showText || showMultipleChoice}
      infoPanelsLayout={infoPanelsLayout}
      {sidebarPosition}
      onSelectProvidedImage={handleSelectProvidedImage}
    />

    {#if showCanvas || showText || showMultipleChoice}
    <div 
      class="grow flex overflow-hidden relative {workspaceLayout === 'vertical' ? 'flex-col' : 'flex-row'}" 
      style="order: {sidebarPosition === 'right' || sidebarPosition === 'bottom' ? 1 : 3}; 
             {sidebarPosition === 'top' || sidebarPosition === 'bottom' 
               ? `height: ${activeLeftPanels.length > 0 ? `calc(100% - ${splitWidth}px - 6px)` : '100%'}; width: 100%;` 
               : `width: ${activeLeftPanels.length > 0 ? `calc(100% - ${splitWidth}px - 6px)` : '100%'}; height: 100%;`}"
    >

    <!-- Right side: Drawing Workspace (Infinite or A4 Centered) -->
    {#if showCanvas}
      <section 
      bind:this={canvasContainer} 
      ondragover={handleDragOver}
      ondrop={handleDrop}
      role="presentation"
      class="grow relative select-none
             {canvasMode === 'infinite' ? 'overflow-hidden bg-surface-container-lowest cursor-crosshair' : 'overflow-hidden bg-surface-container-lowest flex justify-center items-center'}
             {workspaceLayout === 'vertical' ? 'w-full grow' : 'h-full grow'}"
    >

      <!-- Pending image placement overlay -->
      {#if pendingInsertImage}
        <div class="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-primary/90 text-white rounded-full shadow-lg backdrop-blur-sm animate-pulse pointer-events-auto select-none">
          <span class="material-symbols-outlined text-[18px]">place_item</span>
          <span class="text-xs font-semibold">{t('practice.canvas.clickToPlaceOverlay', { name: getBaseName(pendingInsertImage.name) })}</span>
          <button
            type="button"
            onclick={() => pendingInsertImage = null}
            class="material-symbols-outlined text-[16px] hover:bg-white/20 p-0.5 rounded-full cursor-pointer focus:outline-none transition-colors border-0 bg-transparent text-white"
          >close</button>
        </div>
      {/if}

      {#if canvasMode === 'infinite'}
        <!-- Infinite Canvas Wrapper -->
        <div class="relative w-full h-full">
          <canvas 
            bind:this={canvasElement}
            width={canvasWidth}
            height={canvasHeight}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            onpointerleave={handlePointerLeave}
            onpointercancel={handlePointerCancel}
            oncontextmenu={e => e.preventDefault()}
            class="absolute inset-0 w-full h-full z-10 bg-white {cursorClass === 'cursor-dot' ? '' : cursorClass}"
            style="touch-action: none; will-change: transform; {cursorStyle}"
          ></canvas>

          <!-- SVG Overlays for Markers (Infinite Mode) -->
          {#if showFeedback && hasCheckedWork && !isChecking && showCanvasAnnotations}
            <svg class="absolute inset-0 pointer-events-none z-20 w-full h-full">
              {#each feedbackMarkers as marker}
                {#if marker.underlinePoints && marker.underlinePoints.length > 1}
                  <path
                    d={marker.underlinePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x + marker.boundingBoxOffset.x) * zoomScale + panOffset.x} ${(p.y + marker.boundingBoxOffset.y) * zoomScale + panOffset.y}`).join(' ')}
                    fill="none"
                    stroke={marker.type === 'correct' ? '#10b981' : marker.type === 'partial' ? '#f59e0b' : '#ef4444'}
                    stroke-width={2.5 / zoomScale * 2}
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    style="pointer-events: visibleStroke; cursor: pointer;"
                    onclick={() => activeTooltipMarker = marker}
                    onkeydown={(e) => { if (e.key === 'Enter') activeTooltipMarker = marker; }}
                    role="button"
                    tabindex="0"
                    aria-label={marker.feedback || 'Marker'}
                  />
                {/if}
                {#if marker.box2d && marker.box2d.length === 2}
                  {@const p1 = marker.box2d[0]}
                  {@const p2 = marker.box2d[1]}
                  {@const wx = Math.min(p1.x, p2.x) + marker.boundingBoxOffset.x}
                  {@const wy = Math.min(p1.y, p2.y) + marker.boundingBoxOffset.y}
                  {@const sx = wx * zoomScale + panOffset.x}
                  {@const sy = wy * zoomScale + panOffset.y}
                  {@const sw = Math.abs(p2.x - p1.x) * zoomScale}
                  {@const sh = Math.abs(p2.y - p1.y) * zoomScale}
                  <rect
                    x={sx}
                    y={sy}
                    width={sw}
                    height={sh}
                    stroke="rgba(239, 68, 68, 0.5)"
                    stroke-width="2"
                    stroke-dasharray="4,4"
                    fill="rgba(239, 68, 68, 0.1)"
                    rx="4"
                  />
                {/if}
              {/each}
            </svg>

            <!-- Clickable Marker Buttons (Infinite Mode) -->
            {#each feedbackMarkers as marker (marker.id)}
              <button
                type="button"
                onclick={() => activeTooltipMarker = marker}
                class="absolute z-30 w-6 h-6 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full shadow-lg border cursor-pointer hover:scale-110 active:scale-95 transition-all focus:outline-none
                       {marker.type === 'correct' ? 'bg-emerald-500 text-white border-emerald-400' : 
                        marker.type === 'incorrect' ? 'bg-red-500 text-white border-red-400' : 
                        'bg-amber-500 text-white border-amber-400'}"
                style="left: {(marker.canvasX) * zoomScale + panOffset.x}px; top: {(marker.canvasY) * zoomScale + panOffset.y}px;"
                title="Click for feedback"
              >
                <span class="material-symbols-outlined text-[13px]">
                  {marker.type === 'correct' ? 'check' : 
                   marker.type === 'incorrect' ? 'close' : 
                   'question_mark'}
                </span>
              </button>
            {/each}

            <!-- Tooltip Overlay -->
            {#if activeTooltipMarker}
              <MarkerTooltip
                bind:activeTooltipMarker
                left={(activeTooltipMarker.canvasX) * zoomScale + panOffset.x}
                top={(activeTooltipMarker.canvasY) * zoomScale + panOffset.y}
                {containerWidth}
                {containerHeight}
                fontSize={canvasTextFontSize}
              />
            {/if}
          {/if}
        </div>
      {:else}
        <!-- A4 Page Card Layout -->
        <div 
          class="relative bg-white shadow-xl border border-outline-variant rounded-sm shrink-0 origin-center" 
          style="width: {a4BaseWidth}px; height: {a4BaseHeight}px; transform: translate({panOffset.x}px, {panOffset.y}px) scale({a4Scale});"
        >
          <canvas 
            bind:this={canvasElement}
            width={a4BaseWidth}
            height={a4BaseHeight}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            onpointerleave={handlePointerLeave}
            onpointercancel={handlePointerCancel}
            oncontextmenu={e => e.preventDefault()}
            class="absolute inset-0 w-full h-full z-10 bg-transparent {cursorClass === 'cursor-dot' ? '' : cursorClass}"
            style="touch-action: none; will-change: transform; {cursorStyle}"
          ></canvas>
        </div>

        <!-- Clickable Marker Buttons (A4 Page Mode) - Placed outside the scaled div to remain crisp and full size -->
        {#if showFeedback && hasCheckedWork && !isChecking && showCanvasAnnotations}
          {@const leftOffset = (containerWidth - a4BaseWidth * a4Scale) / 2 + panOffset.x}
          {@const topOffset = (containerHeight - a4BaseHeight * a4Scale) / 2 + panOffset.y}
          
          {#each feedbackMarkers.filter(m => m.pageIndex === activePageIndex) as marker (marker.id)}
            <button
              type="button"
              onclick={() => activeTooltipMarker = marker}
              class="absolute z-30 w-6 h-6 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full shadow-lg border cursor-pointer hover:scale-110 active:scale-95 transition-all focus:outline-none
                     {marker.type === 'correct' ? 'bg-emerald-500 text-white border-emerald-400' : 
                      marker.type === 'incorrect' ? 'bg-red-500 text-white border-red-400' : 
                      'bg-amber-500 text-white border-amber-400'}"
              style="left: {marker.canvasX * a4Scale + leftOffset}px; top: {marker.canvasY * a4Scale + topOffset}px;"
              title="Click for feedback"
            >
              <span class="material-symbols-outlined text-[13px]">
                {marker.type === 'correct' ? 'check' : 
                 marker.type === 'incorrect' ? 'close' : 
                 'question_mark'}
              </span>
            </button>
          {/each}

          <!-- Tooltip Overlay -->
          {#if activeTooltipMarker && activeTooltipMarker.pageIndex === activePageIndex}
            <MarkerTooltip
              bind:activeTooltipMarker
              left={activeTooltipMarker.canvasX * a4Scale + leftOffset}
              top={activeTooltipMarker.canvasY * a4Scale + topOffset}
              {containerWidth}
              {containerHeight}
              fontSize={canvasTextFontSize}
            />
          {/if}
        {/if}
      {/if}

      <!-- Selection Bounding Box Floating Options -->
      {#if selectionBoundingBox}
        {@const bounds = selectionBoundingBox}
        {@const leftOffset = canvasMode === 'a4' ? (containerWidth - a4BaseWidth * a4Scale) / 2 + panOffset.x : panOffset.x}
        {@const topOffset = canvasMode === 'a4' ? (containerHeight - a4BaseHeight * a4Scale) / 2 + panOffset.y : panOffset.y}
        {@const scale = canvasMode === 'a4' ? a4Scale : zoomScale}
        {@const boxLeft = bounds.minX * scale + leftOffset}
        {@const boxTop = bounds.minY * scale + topOffset}
        {@const boxWidth = (bounds.maxX - bounds.minX) * scale}
        {@const boxHeight = (bounds.maxY - bounds.minY) * scale}
        
        {@const toolbarWidth = 440}
        {@const toolbarHeight = 40}
        {@const margin = 8}
        
        {@const targetX = boxLeft + boxWidth / 2}
        {@const constrainedX = Math.max(margin + toolbarWidth / 2, Math.min(targetX, containerWidth - margin - toolbarWidth / 2))}
        
        {@const placeBelow = boxTop - toolbarHeight - margin < margin}
        {@const constrainedY = placeBelow ? (boxTop + boxHeight + margin + toolbarHeight) : boxTop}
        {@const transformStyle = placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'}
        
        <div 
          class="absolute z-30 bg-surface-container-high border border-outline-variant shadow-lg rounded-lg px-2 py-1 flex items-center gap-1 -mt-2.5 font-sans"
          style="left: {constrainedX}px; top: {constrainedY}px; transform: {transformStyle};"
        >
          {#if !selectedImage}
            <!-- Color presets -->
            <div class="flex items-center gap-1 px-1 border-r border-outline-variant/50 mr-1 shrink-0">
              {#each canvasRecentColors as color}
                {@const isCurrentSelectedColor = selectedStrokes.length > 0 && selectedStrokes[0].color === color}
                <button
                  onclick={() => {
                    changeSelectedStrokesColor(color);
                  }}
                  class="w-5.5 h-5.5 rounded-full cursor-pointer border transition-all hover:scale-110 focus:outline-none"
                  style="background-color: {color}; border-color: {isCurrentSelectedColor ? 'var(--md-sys-color-primary, #1d4ed8)' : 'rgba(0, 0, 0, 0.15)'}; transform: {isCurrentSelectedColor ? 'scale(1.1)' : 'none'};"
                  title={t('practice.palette.clickToSelect')}
                ></button>
              {/each}
              
              <!-- Custom color button -->
              <button
                onclick={openSelectionColorPicker}
                class="w-5.5 h-5.5 rounded-full cursor-pointer border border-outline-variant/60 hover:scale-110 active:scale-[0.9] transition-all flex items-center justify-center relative overflow-hidden shrink-0"
                style="background: conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red);"
                title={t('practice.palette.pickColor')}
              >
                <span class="material-symbols-outlined text-[11px] text-white font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">palette</span>
              </button>
            </div>
            
            <button 
              onclick={copySelected}
              class="px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/10 rounded cursor-pointer transition-colors flex items-center gap-1 border-0 bg-transparent shrink-0"
              title={t('practice.canvas.copy')}
            >
              <span class="material-symbols-outlined text-[14px]">content_copy</span>
              <span>{t('practice.canvas.copy')}</span>
            </button>
            <div class="w-px h-3 bg-outline-variant/50 shrink-0"></div>
            <button 
              onclick={cutSelected}
              class="px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/10 rounded cursor-pointer transition-colors flex items-center gap-1 border-0 bg-transparent shrink-0"
              title={t('practice.canvas.cut')}
            >
              <span class="material-symbols-outlined text-[14px]">content_cut</span>
              <span>{t('practice.canvas.cut')}</span>
            </button>
            <div class="w-px h-3 bg-outline-variant/50 shrink-0"></div>
          {/if}
          <button 
            onclick={deleteSelected}
            class="px-2.5 py-1 text-[10px] font-bold text-error hover:bg-error/10 rounded cursor-pointer transition-colors flex items-center gap-1 border-0 bg-transparent shrink-0"
            title={t('common.delete')}
          >
            <span class="material-symbols-outlined text-[14px]">delete</span>
            <span>{t('common.delete')}</span>
          </button>
          <div class="w-px h-3 bg-outline-variant/50 shrink-0"></div>
          <button 
            onclick={() => { selectedStrokes = []; selectedImages = []; }}
            class="px-2.5 py-1 text-[10px] font-bold text-outline hover:bg-surface-container rounded cursor-pointer transition-colors border-0 bg-transparent shrink-0"
            title={t('project.cancelSelection')}
          >
            <span>{t('common.cancel')}</span>
          </button>
        </div>
      {/if}

      <!-- Custom Right-Click / Long-Press Paste Context Menu -->
      {#if contextMenu}
        {@const menuWidth = 160}
        {@const menuHeight = 120}
        {@const menuLeft = Math.max(8, Math.min(contextMenu.x, containerWidth - menuWidth - 8))}
        {@const menuTop = Math.max(8, Math.min(contextMenu.y, containerHeight - menuHeight - 8))}
        <div 
          class="absolute z-50 bg-surface-container-high border border-outline-variant shadow-xl rounded-xl py-1.5 w-40 flex flex-col font-sans text-xs select-none context-menu-container"
          style="left: {menuLeft}px; top: {menuTop}px;"
        >
          <button 
            onclick={() => { handlePaste(contextMenu.canvasX, contextMenu.canvasY); contextMenu = null; }}
            class="w-full text-left px-4 py-2 hover:bg-primary/10 hover:text-primary flex items-center gap-2 cursor-pointer font-semibold border-0 bg-transparent"
          >
            <span class="material-symbols-outlined text-[16px]">content_paste</span>
            <span>{t('practice.canvas.paste')}</span>
          </button>
          
          {#if selectedStrokes.length > 0}
            <div class="h-px bg-outline-variant/30 my-1"></div>
            <button 
              onclick={() => { copySelected(); contextMenu = null; }}
              class="w-full text-left px-4 py-2 hover:bg-primary/10 hover:text-primary flex items-center gap-2 cursor-pointer font-semibold border-0 bg-transparent"
            >
              <span class="material-symbols-outlined text-[16px]">content_copy</span>
              <span>{t('practice.canvas.copy')}</span>
            </button>
            <button 
              onclick={() => { cutSelected(); contextMenu = null; }}
              class="w-full text-left px-4 py-2 hover:bg-primary/10 hover:text-primary flex items-center gap-2 cursor-pointer font-semibold border-0 bg-transparent"
            >
              <span class="material-symbols-outlined text-[16px]">content_cut</span>
              <span>{t('practice.canvas.cut')}</span>
            </button>
            <button 
              onclick={() => { deleteSelected(); contextMenu = null; }}
              class="w-full text-left px-4 py-2 hover:bg-error/10 hover:text-error flex items-center gap-2 cursor-pointer font-semibold border-0 bg-transparent"
            >
              <span class="material-symbols-outlined text-[16px]">delete</span>
              <span>{t('common.delete')}</span>
            </button>
          {/if}
        </div>
      {/if}

      <!-- Floating Tool Palette -->
      <FloatingToolPalette
        bind:strokeColor
        bind:activeTool
        bind:brushWidth
        bind:eraserWidth
        bind:shapeType
        {canvasMode}
        strokeHistory={canvasMode === 'a4' ? (pages[activePageIndex]?.strokeHistory || []) : infiniteStrokes}
        hasSelection={selectedStrokes.length > 0}
        onInsertImage={triggerImageUpload}
      />

      <input 
        type="file" 
        bind:this={fileInputEl} 
        class="hidden" 
        accept="image/*"
        onchange={handleCanvasImageUpload}
      />



      <!-- Eraser Circle Cursor Overlay -->
      {#if (activeTool === 'eraser' || isPointerEraser) && hoverPos}
        <div 
          class="absolute pointer-events-none border border-black/50 rounded-full bg-white/20 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_1.5px_rgba(255,255,255,0.7)] z-40"
          style="left: {hoverPos.x}px; top: {hoverPos.y}px; width: {eraserScreenDiameter}px; height: {eraserScreenDiameter}px;"
        ></div>
      {/if}

    </section>
    {/if}

    {#if showCanvas && (showText || showMultipleChoice)}
      <!-- Adjustable Split Separator -->
      {#if workspaceLayout === 'vertical'}
        <div 
          role="separator"
          aria-valuenow={editorSplitHeight}
          class="h-1.5 hover:h-2 bg-outline-variant/60 hover:bg-primary cursor-row-resize select-none w-full z-20 transition-all active:bg-primary shrink-0"
          style="touch-action: none;"
          onpointerdown={startEditorSplitDrag}
          onpointermove={handleEditorSplitDrag}
          onpointerup={stopEditorSplitDrag}
          onpointercancel={stopEditorSplitDrag}
        ></div>
      {:else}
        <div 
          role="separator"
          aria-valuenow={editorSplitWidth}
          class="w-1.5 hover:w-2 bg-outline-variant/60 hover:bg-primary cursor-col-resize select-none h-full z-20 transition-all active:bg-primary shrink-0"
          style="touch-action: none;"
          onpointerdown={startEditorSplitDrag}
          onpointermove={handleEditorSplitDrag}
          onpointerup={stopEditorSplitDrag}
          onpointercancel={stopEditorSplitDrag}
        ></div>
      {/if}
    {/if}

    {#if showText || showMultipleChoice}
      <!-- Right/Bottom Workspace container -->
      <div 
        class="flex overflow-hidden relative {showCanvas ? 'shrink-0' : 'grow'} {workspaceLayout === 'vertical' ? 'w-full flex-col' : 'h-full flex-row'}"
        style={showCanvas ? (workspaceLayout === 'vertical' ? `height: ${editorSplitHeight}px;` : `width: ${editorSplitWidth}px;`) : ''}
      >
        <!-- Multiple Choice Practice panel -->
        {#if showMultipleChoice}
          <section class="flex flex-col bg-surface-container-lowest overflow-hidden select-text font-sans relative grow h-full min-w-0">
            <MultipleChoicePractice
              multipleChoiceTasks={task.multipleChoiceTasks}
              bind:selectedAnswers={selectedAnswers}
              fontSize={canvasTextFontSize}
              showSolution={showSolution}
              onSelectProvidedImage={handleSelectProvidedImage}
              onAnswersChanged={handleAnswersChanged}
            />
          </section>
        {/if}

        <!-- Split separator between Multiple Choice and Text Editor if both are visible -->
        {#if showMultipleChoice && showText}
          {#if workspaceLayout === 'vertical'}
            <div class="h-px bg-outline-variant/30 w-full shrink-0"></div>
          {:else}
            <div class="w-px bg-outline-variant/30 self-stretch shrink-0 border-r border-outline-variant/10"></div>
          {/if}
        {/if}

        <!-- Text Editor Workspace -->
        {#if showText}
          <section class="text-editor-workspace flex flex-col bg-surface-container-lowest overflow-hidden select-text font-sans relative grow h-full min-w-0">
            
            <div class="flex flex-col grow h-full w-full overflow-hidden p-6">
              
              <!-- Editor Title & Status Bar -->
              <div class="flex justify-between items-center mb-3 select-none">
                <h3 class="text-xs font-bold text-primary flex items-center gap-1.5 uppercase tracking-wider font-sans">
                  <span class="material-symbols-outlined text-[16px]">edit_note</span>
                  {store.settings.editorShowAllRaw ? t('practice.textEditor.writeTitle') : t('practice.textEditor.previewTitle')}
                </h3>
                <button 
                  type="button"
                  onclick={() => {
                    store.settings.editorShowAllRaw = !store.settings.editorShowAllRaw;
                    store.saveSettings();
                    activeLineIndex = null;
                  }}
                  class="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant flex items-center gap-1 border border-outline-variant/20 cursor-pointer transition-colors focus:outline-none"
                  title="Toggle editor mode"
                >
                  <span class="w-1.5 h-1.5 rounded-full {store.settings.editorShowAllRaw ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
                  {store.settings.editorShowAllRaw ? 'Raw Mode' : t('practice.textEditor.previewTitle')}
                </button>
              </div>

              <!-- Main Editor Space -->
              {#if store.settings.editorShowAllRaw}
                <textarea
                  bind:value={editorText}
                  oninput={handleEditorInput}
                  placeholder=""
                  class="grow w-full h-full resize-none bg-transparent text-on-surface focus:outline-none leading-relaxed border border-outline-variant/30 rounded-xl p-6 font-sans shadow-inner bg-surface-container-low/20 animate-fade-in"
                  style="font-size: {editorFontSize}px;"
                ></textarea>
              {:else}
                <!-- Preview Mode: non-editable rendered HTML -->
                <div 
                  role="document"
                  class="grow w-full h-full overflow-y-auto bg-surface-container-low/20 border border-outline-variant/30 rounded-xl p-6 select-text text-left leading-relaxed max-w-none prose dark:prose-invert animate-fade-in custom-scrollbar"
                  style="font-size: {editorFontSize}px;"
                  onpointerover={handlePreviewPointerOver}
                  onpointerout={handlePreviewPointerOut}
                >
                  {@html getParsedPreviewHtml(editorText)}
                </div>
              {/if}

            </div>

          </section>
        {/if}
      </div>
    {/if}
    </div>
    {/if}
  </div>
</div>

<!-- Custom Background Creator Modal Popup -->
<CustomBgModal
  bind:isCustomBgModalOpen
  bind:activeBg
  onclose={() => {
    store.canvasSettingsOpen = true;
  }}
/>

<!-- Canvas Settings Modal Popup -->
{#if store.canvasSettingsOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in select-none">
    <button type="button" aria-label="Close Canvas Settings" class="absolute inset-0 bg-transparent border-0 cursor-default p-0 m-0 w-full h-full focus:outline-none" onclick={() => store.canvasSettingsOpen = false}></button>
    <div class="bg-surface border border-outline-variant rounded-xl p-6 w-[760px] max-w-[95%] max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl flex flex-col gap-5 z-10 relative">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-outline-variant/30 pb-3">
        <div class="flex items-center gap-2 text-primary">
          <span class="material-symbols-outlined text-xl">tune</span>
          <h3 class="font-bold text-base text-on-surface">{t('sidebar.canvasSettings')}</h3>
        </div>
        <button 
          onclick={() => store.canvasSettingsOpen = false}
          class="text-on-surface-variant hover:bg-surface-container-high rounded-lg p-1.5 flex items-center justify-center transition-colors focus:outline-none cursor-pointer border-0 bg-transparent"
        >
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
      </div>



      <!-- Tab Navigation Bar -->
      <div class="flex border-b border-outline-variant/30 gap-1 bg-surface-container-low/50 p-1 rounded-xl">
        <button
          type="button"
          onclick={() => canvasSettingsTab = 'pageLayout'}
          class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer border-0 transition-all
                 {canvasSettingsTab === 'pageLayout' ? 'bg-surface text-primary shadow-sm font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}"
        >
          <span class="material-symbols-outlined text-base">description</span>
          <span>{t('practice.canvas.tabs.pageLayout')}</span>
        </button>
        <button
          type="button"
          onclick={() => canvasSettingsTab = 'toolsEraser'}
          class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer border-0 transition-all
                 {canvasSettingsTab === 'toolsEraser' ? 'bg-surface text-primary shadow-sm font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}"
        >
          <span class="material-symbols-outlined text-base">auto_fix_high</span>
          <span>{t('practice.canvas.tabs.toolsEraser')}</span>
        </button>
        <button
          type="button"
          onclick={() => canvasSettingsTab = 'viewText'}
          class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer border-0 transition-all
                 {canvasSettingsTab === 'viewText' ? 'bg-surface text-primary shadow-sm font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}"
        >
          <span class="material-symbols-outlined text-base">format_size</span>
          <span>{t('practice.canvas.tabs.viewText')}</span>
        </button>
        <button
          type="button"
          onclick={() => canvasSettingsTab = 'actionsExport'}
          class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer border-0 transition-all
                 {canvasSettingsTab === 'actionsExport' ? 'bg-surface text-primary shadow-sm font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}"
        >
          <span class="material-symbols-outlined text-base">download</span>
          <span>{t('practice.canvas.tabs.actionsExport')}</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="flex flex-col gap-5 min-h-[260px]">
        {#if canvasSettingsTab === 'pageLayout'}
          <!-- TAB 1: SEITE & LAYOUT -->
          <div class="flex flex-col gap-5 animate-fade-in">
            <!-- Canvas Mode & Orientation -->
            <div class="flex flex-col gap-2">
              <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('settings.canvas.title')}</span>
              <CanvasModeSelector 
                settings={pageLayoutSettings} 
                onchange={() => {
                  if (store.activeTask) {
                    store.saveProjects();
                  } else {
                    store.saveSettings();
                  }
                }}
              />
            </div>

            <!-- Background Selection -->
            <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
              <CanvasBackgroundSelector 
                settings={pageLayoutSettings} 
                onchange={() => {
                  if (pageLayoutSettings.canvasBgPattern) {
                    activeBg = pageLayoutSettings.canvasBgPattern;
                  }
                  if (store.activeTask) {
                    store.saveProjects();
                  } else {
                    store.saveSettings();
                  }
                }}
              />
            </div>

            <!-- Opacity Slider -->
            {#if activeBg !== 'blank'}
              <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
                <div class="flex justify-between items-center">
                  <label for="bg-opacity-slider" class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('practice.canvas.opacity')}</label>
                  <span class="text-xs font-bold text-primary">{bgOpacity}%</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-base text-outline">opacity</span>
                  <input 
                    id="bg-opacity-slider"
                    type="range" 
                    min="1" 
                    max="100" 
                    bind:value={bgOpacity}
                    class="grow h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary border-0"
                  />
                </div>
              </div>
            {/if}
          </div>

        {:else if canvasSettingsTab === 'toolsEraser'}
          <!-- TAB 2: WERKZEUGE & RADIERER -->
          <div class="flex flex-col gap-5 animate-fade-in">
            <!-- Eraser Mode -->
            <div class="flex flex-col gap-2">
              <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('settings.canvas.eraser.title')}</span>
              <p class="text-xs text-on-surface-variant">{t('settings.canvas.eraser.desc')}</p>
              <div class="grid grid-cols-2 gap-3 mt-1">
                <button
                  type="button"
                  onclick={() => {
                    targetSettings.eraserMode = 'normal';
                    if (store.activeTask?.settingsOverride?.overrideSettings) store.saveProjects(); else store.saveSettings();
                  }}
                  class="flex flex-col p-3 border rounded-lg gap-1.5 cursor-pointer text-left transition-all bg-transparent
                         {targetSettings.eraserMode !== 'stroke' ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-xs text-on-surface">{t('settings.canvas.eraser.normal')}</span>
                    {#if targetSettings.eraserMode !== 'stroke'}
                      <span class="material-symbols-outlined text-sm text-primary">check_circle</span>
                    {/if}
                  </div>
                  <span class="text-[11px] text-on-surface-variant leading-tight">{t('settings.canvas.eraser.normalDesc')}</span>
                </button>
                <button
                  type="button"
                  onclick={() => {
                    targetSettings.eraserMode = 'stroke';
                    if (store.activeTask?.settingsOverride?.overrideSettings) store.saveProjects(); else store.saveSettings();
                  }}
                  class="flex flex-col p-3 border rounded-lg gap-1.5 cursor-pointer text-left transition-all bg-transparent
                         {targetSettings.eraserMode === 'stroke' ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-xs text-on-surface">{t('settings.canvas.eraser.stroke')}</span>
                    {#if targetSettings.eraserMode === 'stroke'}
                      <span class="material-symbols-outlined text-sm text-primary">check_circle</span>
                    {/if}
                  </div>
                  <span class="text-[11px] text-on-surface-variant leading-tight">{t('settings.canvas.eraser.strokeDesc')}</span>
                </button>
              </div>
            </div>

            <!-- Eraser Radius Spinbox (Normal Eraser Only) -->
            {#if targetSettings.eraserMode === 'normal'}
              <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
                <label for="eraser-radius-spinbox" class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  {t('settings.canvas.eraser.normalSize')}
                </label>
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-base text-outline">cleaning_services</span>
                  <div class="flex items-center bg-surface-container rounded-lg border border-outline-variant p-0.5 grow justify-between">
                    <button 
                      type="button"
                      onclick={() => {
                        targetSettings.eraserRadiusNormal = Math.max(5, (targetSettings.eraserRadiusNormal || 24) - 2);
                        if (store.activeTask?.settingsOverride?.overrideSettings) store.saveProjects(); else store.saveSettings();
                      }}
                      class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
                    >
                      <span class="material-symbols-outlined text-sm">remove</span>
                    </button>
                    <span class="w-16 text-center text-xs font-bold text-on-surface">
                      {targetSettings.eraserRadiusNormal || 24} px
                    </span>
                    <button 
                      type="button"
                      onclick={() => {
                        targetSettings.eraserRadiusNormal = Math.min(100, (targetSettings.eraserRadiusNormal || 24) + 2);
                        if (store.activeTask?.settingsOverride?.overrideSettings) store.saveProjects(); else store.saveSettings();
                      }}
                      class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
                    >
                      <span class="material-symbols-outlined text-sm">add</span>
                    </button>
                  </div>
                </div>
              </div>
            {/if}
          </div>

        {:else if canvasSettingsTab === 'viewText'}
          <!-- TAB 3: ANSICHT & SCHRIFT -->
          <div class="flex flex-col gap-5 animate-fade-in">
            <!-- Text Editor Font Size (Spinbox) -->
            <div class="flex flex-col gap-2">
              <label for="editor-font-size-spinbox" class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                {t('practice.canvas.editorFontSize')}
              </label>
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-base text-outline">format_size</span>
                <div class="flex items-center bg-surface-container rounded-lg border border-outline-variant p-0.5 grow justify-between">
                  <button 
                    type="button"
                    onclick={() => {
                      targetSettings.editorFontSize = Math.max(10, (targetSettings.editorFontSize || 16) - 1);
                      if (store.activeTask?.settingsOverride?.overrideSettings) store.saveProjects(); else store.saveSettings();
                    }}
                    class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
                  >
                    <span class="material-symbols-outlined text-sm">remove</span>
                  </button>
                  <span class="w-16 text-center text-xs font-bold text-on-surface">{targetSettings.editorFontSize || 16} px</span>
                  <button 
                    type="button"
                    onclick={() => {
                      targetSettings.editorFontSize = Math.min(40, (targetSettings.editorFontSize || 16) + 1);
                      if (store.activeTask?.settingsOverride?.overrideSettings) store.saveProjects(); else store.saveSettings();
                    }}
                    class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
                  >
                    <span class="material-symbols-outlined text-sm">add</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Canvas Font Size (Spinbox) -->
            <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
              <label for="canvas-font-size-spinbox" class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                {t('settings.canvas.textFontSize')}
              </label>
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-base text-outline">text_fields</span>
                <div class="flex items-center bg-surface-container rounded-lg border border-outline-variant p-0.5 grow justify-between">
                  <button 
                    type="button"
                    onclick={() => {
                      targetSettings.canvasFontSize = Math.max(10, (targetSettings.canvasFontSize || 13) - 1);
                      if (store.activeTask?.settingsOverride?.overrideSettings) store.saveProjects(); else store.saveSettings();
                    }}
                    class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
                  >
                    <span class="material-symbols-outlined text-sm">remove</span>
                  </button>
                  <span class="w-16 text-center text-xs font-bold text-on-surface">{targetSettings.canvasFontSize || 13} px</span>
                  <button 
                    type="button"
                    onclick={() => {
                      targetSettings.canvasFontSize = Math.min(24, (targetSettings.canvasFontSize || 13) + 1);
                      if (store.activeTask?.settingsOverride?.overrideSettings) store.saveProjects(); else store.saveSettings();
                    }}
                    class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
                  >
                    <span class="material-symbols-outlined text-sm">add</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Info Panels Layout -->
            <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
              <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                {t('practice.canvas.infoPanelsLayoutTitle')}
              </span>
              <div class="flex bg-surface-container rounded-lg border border-outline-variant p-0.5 grow">
                <button 
                  type="button"
                  onclick={() => infoPanelsLayout = 'vertical'}
                  class="grow py-1.5 px-3 rounded-md text-xs font-semibold cursor-pointer focus:outline-none transition-all border-0 flex items-center justify-center gap-1.5
                         {infoPanelsLayout === 'vertical' ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-on-surface-variant hover:bg-surface-container-high'}"
                >
                  <span class="material-symbols-outlined text-sm">view_stream</span>
                  <span>{t('practice.canvas.layoutVertical')}</span>
                </button>
                <button 
                  type="button"
                  onclick={() => infoPanelsLayout = 'horizontal'}
                  class="grow py-1.5 px-3 rounded-md text-xs font-semibold cursor-pointer focus:outline-none transition-all border-0 flex items-center justify-center gap-1.5
                         {infoPanelsLayout === 'horizontal' ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-on-surface-variant hover:bg-surface-container-high'}"
                >
                  <span class="material-symbols-outlined text-sm">view_week</span>
                  <span>{t('practice.canvas.layoutHorizontal')}</span>
                </button>
              </div>
            </div>

            <!-- Workspace Layout -->
            <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
              <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                {t('practice.canvas.workspaceLayoutTitle')}
              </span>
              <div class="flex bg-surface-container rounded-lg border border-outline-variant p-0.5 grow">
                <button 
                  type="button"
                  onclick={() => workspaceLayout = 'vertical'}
                  class="grow py-1.5 px-3 rounded-md text-xs font-semibold cursor-pointer focus:outline-none transition-all border-0 flex items-center justify-center gap-1.5
                         {workspaceLayout === 'vertical' ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-on-surface-variant hover:bg-surface-container-high'}"
                >
                  <span class="material-symbols-outlined text-sm">table_rows</span>
                  <span>{t('practice.canvas.layoutVertical')}</span>
                </button>
                <button 
                  type="button"
                  onclick={() => workspaceLayout = 'horizontal'}
                  class="grow py-1.5 px-3 rounded-md text-xs font-semibold cursor-pointer focus:outline-none transition-all border-0 flex items-center justify-center gap-1.5
                         {workspaceLayout === 'horizontal' ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-on-surface-variant hover:bg-surface-container-high'}"
                >
                  <span class="material-symbols-outlined text-sm">view_column</span>
                  <span>{t('practice.canvas.layoutHorizontal')}</span>
                </button>
              </div>
            </div>

            <!-- Sidebar Position -->
            <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
              <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                {t('practice.canvas.sidebarPositionTitle')}
              </span>
              <div class="grid grid-cols-4 gap-0.5 bg-surface-container rounded-lg border border-outline-variant p-0.5">
                {#each [
                  { value: 'left', icon: 'dock_to_left', label: t('practice.canvas.posLeft') },
                  { value: 'right', icon: 'dock_to_right', label: t('practice.canvas.posRight') },
                  { value: 'top', icon: 'vertical_align_top', label: t('practice.canvas.posTop') },
                  { value: 'bottom', icon: 'vertical_align_bottom', label: t('practice.canvas.posBottom') }
                ] as opt}
                  <button 
                    type="button"
                    onclick={() => sidebarPosition = opt.value as 'left' | 'right' | 'top' | 'bottom'}
                    class="py-1.5 px-1 rounded-md text-[10px] font-semibold cursor-pointer focus:outline-none transition-all border-0 flex flex-col items-center justify-center gap-0.5
                           {sidebarPosition === opt.value ? 'bg-primary text-white shadow-sm' : 'bg-transparent text-on-surface-variant hover:bg-surface-container-high'}"
                  >
                    <span class="material-symbols-outlined text-sm">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>

        {:else if canvasSettingsTab === 'actionsExport'}
          <!-- TAB 4: AKTIONEN & EXPORT -->
          <div class="flex flex-col gap-5 animate-fade-in">
            <div class="flex flex-col gap-3">
              <button 
                onclick={async () => {
                  store.canvasSettingsOpen = false;
                  await handleExportPdf();
                }}
                disabled={isExportingPdf}
                class="w-full flex items-center justify-center gap-2 border border-primary text-primary hover:bg-primary/10 py-3 rounded-xl text-xs font-bold cursor-pointer focus:outline-none bg-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={showCanvas ? t('practice.exportCanvasPdf') : t('practice.exportTextPdf')}
              >
                {#if isExportingPdf}
                  <span class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></span>
                {:else}
                  <span class="material-symbols-outlined text-lg text-primary">picture_as_pdf</span>
                {/if}
                <span>{t('practice.exportPdfLabel')}</span>
              </button>

              <button 
                onclick={() => {
                  clearCanvas();
                }}
                class="w-full flex items-center justify-center gap-2 border border-outline-variant text-on-surface-variant hover:bg-error/10 hover:text-error hover:border-error/30 py-3 rounded-xl text-xs font-bold cursor-pointer focus:outline-none bg-transparent transition-colors"
                title="Clear Canvas"
              >
                <span class="material-symbols-outlined text-lg">delete_sweep</span>
                <span>{t('practice.canvas.clearCanvas')}</span>
              </button>

              <button
                onclick={() => {
                  store.resetCanvasLayoutPreferences();
                }}
                class="w-full flex items-center justify-center gap-2 border border-outline-variant text-on-surface-variant hover:bg-surface-container-high py-3 rounded-xl text-xs font-bold cursor-pointer focus:outline-none bg-transparent transition-colors"
              >
                <span class="material-symbols-outlined text-lg">restart_alt</span>
                <span>{t('settings.canvas.resetLayout')}</span>
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if activeTextTooltip}
  <div 
    class="fixed bg-surface text-on-surface border border-outline-variant py-2 px-3 rounded-lg shadow-xl leading-snug z-9999 pointer-events-none whitespace-normal font-sans font-medium"
    style="left: {tooltipX}px; top: {tooltipY}px; transform: {tooltipPosition === 'top' ? 'translate(-50%, -100%) translateY(-8px)' : 'translate(-50%, 8px)'}; font-size: {editorFontSize}px; min-width: {10 * editorFontSize}px; max-width: {16 * editorFontSize}px;"
  >
    <span class="font-bold {tooltipColor} block mb-0.5 uppercase tracking-wider" style="font-size: 0.9em;">
      {activeTextTooltip.type === 'correct' ? t('practice.critique.correct') : 
       activeTextTooltip.type === 'incorrect' ? t('practice.critique.incorrect') : 
       t('practice.critique.partial')}
    </span>
    <div style="font-size: 0.9em;">
      {@html parseMarkdown(activeTextTooltip.feedback)}
    </div>
  </div>
{/if}

{#if showSelectionColorPicker}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs font-sans">
    <div class="bg-surface-container-high border border-outline-variant rounded-xl p-5 shadow-2xl w-80 flex flex-col gap-4">
      <h3 class="text-sm font-bold text-on-surface">{t('practice.palette.pickColor') || 'Farbe wählen'}</h3>
      
      <!-- Color Preview Box -->
      <div class="h-20 rounded-lg shadow-inner border border-outline-variant" style="background-color: {selectionPickerColor}"></div>
      
      <!-- Hue Slider -->
      <div class="flex flex-col gap-1">
        <div class="flex justify-between text-xs text-on-surface-variant">
          <span>{store.settings.language === 'Deutsch' ? 'Farbton' : 'Hue'}</span>
          <span>{selectionHue}°</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="360" 
          bind:value={selectionHue}
          class="w-full accent-primary"
          style="background: linear-gradient(to right, red, yellow, lime, aqua, blue, magenta, red); height: 8px; border-radius: 4px; appearance: none;"
        />
      </div>

      <!-- Saturation Slider -->
      <div class="flex flex-col gap-1">
        <div class="flex justify-between text-xs text-on-surface-variant">
          <span>{store.settings.language === 'Deutsch' ? 'Sättigung' : 'Saturation'}</span>
          <span>{selectionSat}%</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="100" 
          bind:value={selectionSat}
          class="w-full accent-primary"
          style="background: linear-gradient(to right, hsl({selectionHue}, 0%, 50%), hsl({selectionHue}, 100%, 50%)); height: 8px; border-radius: 4px; appearance: none;"
        />
      </div>

      <!-- Lightness Slider -->
      <div class="flex flex-col gap-1">
        <div class="flex justify-between text-xs text-on-surface-variant">
          <span>{store.settings.language === 'Deutsch' ? 'Helligkeit' : 'Lightness'}</span>
          <span>{selectionLight}%</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="100" 
          bind:value={selectionLight}
          class="w-full accent-primary"
          style="background: linear-gradient(to right, black, hsl({selectionHue}, {selectionSat}%, 50%), white); height: 8px; border-radius: 4px; appearance: none;"
        />
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-end gap-2 mt-2">
        <button 
          onclick={() => showSelectionColorPicker = false}
          class="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-surface-container transition-colors border-0 bg-transparent text-outline cursor-pointer"
        >
          {t('common.cancel') || 'Abbrechen'}
        </button>
        <button 
          onclick={confirmSelectionColorPicker}
          class="px-4 py-2 text-xs font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors border-0 cursor-pointer"
        >
          OK
        </button>
      </div>
    </div>
  </div>
{/if}
