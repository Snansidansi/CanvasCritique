<script lang="ts">
  import { store, DEFAULT_SYSTEM_PROMPT, type Task } from '../state/store.svelte';
  import { onMount, tick, untrack } from 'svelte';
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
  let bgOpacity = $state(15); // Background template opacity range 1-100
  let customBgUrl = $state(null);
  
  // Active editing mode ('canvas' or 'text')
  let showCanvas = $state(true);
  let showText = $state(false);

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

  function handleEditorInput() {
    if (task && task.id) {
      store.saveEditorText(task.id, editorText);
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

  // Brush configuration
  let strokeColor = $state('#000000');
  let brushWidth = $state(2);
  let activeTool = $state('pen'); // 'pen' | 'eraser' | 'pan' | 'select' | 'shape'
  let shapeType = $state('rectangle'); // 'circle' | 'ellipse' | 'line' | 'square' | 'rectangle' | 'triangle'

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
    const mode = effectiveEraserSettings.eraserMode;
    if (mode === 'stroke') {
      eraserWidth = effectiveEraserSettings.eraserRadiusStroke ?? 24;
    } else {
      eraserWidth = effectiveEraserSettings.eraserRadiusNormal ?? 24;
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
  
  let canvasWidth = $derived(canvasMode === 'infinite' ? Math.round(containerWidth / 8) * 8 : 800);
  let canvasHeight = $derived(canvasMode === 'infinite' ? Math.round(containerHeight / 8) * 8 : 1130);
  let a4Scale = $derived(
    canvasMode === 'a4' 
      ? Math.max(0.1, Math.min(
          containerWidth > 32 ? (containerWidth - 32) / 800 : 0.1,
          containerHeight > 32 ? (containerHeight - 32) / 1130 : 0.1
        )) * zoomScale
      : 1
  );
  let ctx = null;

  // Performance: reusable offscreen canvas for stroke compositing
  let offscreenCanvas: HTMLCanvasElement | null = null;
  let offscreenCtx: CanvasRenderingContext2D | null = null;

  // Cache for historical strokes to avoid drawing all strokes every frame
  let cachedStrokesCanvas: HTMLCanvasElement | null = null;
  let cachedStrokesCtx: CanvasRenderingContext2D | null = null;
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
    if (sizeChanged) {
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
    }
    if (cachedStrokesCtx) {
      cachedStrokesCtx.clearRect(0, 0, cachedStrokesCanvas.width, cachedStrokesCanvas.height);
      cachedStrokesCtx.save();
      if (canvasMode === 'infinite') {
        cachedStrokesCtx.translate(panOffset.x, panOffset.y);
        cachedStrokesCtx.scale(zoomScale, zoomScale);
      }
      for (const stroke of strokeHistory) {
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
  let isMovingSelection = $state(false);
  let selectionDragStart = { x: 0, y: 0 };
  let contextMenu = $state(null); // { x, y, canvasX, canvasY }
  let longPressTimer = null;

  // Canvas Image states
  interface CanvasImage {
    id: string;
    mediaId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    pageIndex: number;
  }
  let canvasImages = $state<CanvasImage[]>([]);
  let selectedImage = $state<CanvasImage | null>(null);
  let isMovingImage = $state(false);
  let isResizingImage = $state(false);
  let imageDragStart = { x: 0, y: 0 };
  let imageStartRect = { x: 0, y: 0, width: 0, height: 0 };
  let imageStartAspectRatio = 1;
  let imageElementCache = $state<Record<string, HTMLImageElement>>({});

  // Pending provided image insertion state
  let pendingInsertImage = $state<{ name: string; dataUrl?: string; mediaId?: string } | null>(null);

  let selectionBoundingBox = $derived.by(() => {
    if (selectedImage) {
      return {
        minX: selectedImage.x,
        minY: selectedImage.y,
        maxX: selectedImage.x + selectedImage.width,
        maxY: selectedImage.y + selectedImage.height
      };
    }
    if (selectedStrokes.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const stroke of selectedStrokes) {
      const halfWidth = stroke.width / 2;
      for (const p of stroke.points) {
        if (p.x - halfWidth < minX) minX = p.x - halfWidth;
        if (p.y - halfWidth < minY) minY = p.y - halfWidth;
        if (p.x + halfWidth > maxX) maxX = p.x + halfWidth;
        if (p.y + halfWidth > maxY) maxY = p.y + halfWidth;
      }
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

    const angleRad = Math.atan2(dy, dx);
    let angleDeg = (angleRad * 180 / Math.PI) % 360;
    if (angleDeg < 0) angleDeg += 360;

    const threshold = 5; // ±5 degrees
    
    // Check horizontal (0, 180, 360)
    if (Math.abs(angleDeg - 0) <= threshold || Math.abs(angleDeg - 360) <= threshold) {
      return { x: start.x + Math.sign(dx || 1) * length, y: start.y };
    }
    if (Math.abs(angleDeg - 180) <= threshold) {
      return { x: start.x - length, y: start.y };
    }
    // Check vertical (90, 270)
    if (Math.abs(angleDeg - 90) <= threshold) {
      return { x: start.x, y: start.y + length };
    }
    if (Math.abs(angleDeg - 270) <= threshold) {
      return { x: start.x, y: start.y - length };
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
              dropX = dropClientX / a4Scale;
              dropY = dropClientY / a4Scale;
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
                pageIndex: canvasMode === 'a4' ? activePageIndex : 0
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
              selectedImage = newImage;
              activeTool = 'select'; // Automatically select the selection tool!
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
      placeX = clickClientX / a4Scale;
      placeY = clickClientY / a4Scale;
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
        pageIndex: canvasMode === 'a4' ? activePageIndex : 0
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
      selectedImage = newImage;
      activeTool = 'select';
      saveToStore();
    };
  }

  let activeLeftPanels = $derived([
    showTask && { id: 'task', title: `${task.category && task.category !== 'Basics' ? task.category + ' - ' : ''}${task.name}`, content: task.instructions },
    showSolution && { id: 'solution', title: t('practice.evaluationGoal'), content: task.solution },
    showFeedback && hasCheckedWork && { id: 'feedback', title: t('practice.aiCritiqueFeedback'), isFeedback: true }
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
            showFeedback = true;
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
          showFeedback = hasCheckedWork;
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
        showFeedback = hasCheckedWork;
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
      showSolution = false;
      lastCritiqueScore = task?.critique?.feedbackScore;
      
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
      saveToStore();
      saveTimeout = null;
    }, 500);
  }

  function saveToStore() {
    if (!task || !task.id) return;
    store.saveCanvasState(task.id, {
      pages: JSON.parse(JSON.stringify(pages)),
      infiniteStrokes: JSON.parse(JSON.stringify(infiniteStrokes)),
      infiniteRedo: JSON.parse(JSON.stringify(infiniteRedo)),
      infiniteEraserUndo: JSON.parse(JSON.stringify(infiniteEraserUndo)),
      panOffset: { ...panOffset },
      zoomScale,
      activePageIndex,
      canvasImages: JSON.parse(JSON.stringify(canvasImages))
    });
  }



  let lastInitializedTaskId = '';

  // Load saved drawing state when active task shifts
  $effect(() => {
    const taskId = task.id;
    if (taskId) {
      const isNewTask = taskId !== lastInitializedTaskId;
      lastInitializedTaskId = taskId;
      const saved = untrack(() => store.getCanvasState(taskId));
      const text = untrack(() => store.getEditorText(taskId) || '');
      
      const hasDrawing = saved && (
        (saved.infiniteStrokes && saved.infiniteStrokes.length > 0) || 
        (saved.pages && saved.pages.some((p: any) => p.strokeHistory && p.strokeHistory.length > 0)) ||
        (saved.canvasImages && saved.canvasImages.length > 0)
      );
      const hasText = text.trim() !== '';
      // Only set edit mode when opening a new/different task, not on every re-render
      if (isNewTask) {
        // Union logic: start with default edit mode, then additionally show any editor with existing data
        const defaultMode = task.defaultEditMode || 'both';
        if (defaultMode === 'canvas') {
          showCanvas = true;
          showText = false;
        } else if (defaultMode === 'text') {
          showCanvas = false;
          showText = true;
        } else {
          showCanvas = true;
          showText = true;
        }
        // Additionally open editors that contain data (union, not intersection)
        if (hasDrawing) showCanvas = true;
        if (hasText) showText = true;
      }
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
            ensureStrokeBounds(stroke);
          }
          for (const stroke of page.redoStack || []) {
            ensureStrokeBounds(stroke);
          }
          for (const action of page.eraserUndoStack || []) {
            if (action && action.points) {
              ensureStrokeBounds(action);
            } else if (action && action.removedStrokes) {
              for (const s of action.removedStrokes || []) ensureStrokeBounds(s);
              for (const s of action.addedStrokes || []) ensureStrokeBounds(s);
            }
          }
        }
        infiniteStrokes = saved.infiniteStrokes || [];
        for (const stroke of infiniteStrokes) {
          ensureStrokeBounds(stroke);
        }
        infiniteRedo = saved.infiniteRedo || [];
        for (const stroke of infiniteRedo) {
          ensureStrokeBounds(stroke);
        }
        infiniteEraserUndo = saved.infiniteEraserUndo || [];
        for (const action of infiniteEraserUndo) {
          if (action && action.points) {
            ensureStrokeBounds(action);
          } else if (action && action.removedStrokes) {
            for (const s of action.removedStrokes || []) ensureStrokeBounds(s);
            for (const s of action.addedStrokes || []) ensureStrokeBounds(s);
          }
        }
        panOffset = saved.panOffset || { x: 0, y: 0 };
        zoomScale = saved.zoomScale || 1;
        activePageIndex = saved.activePageIndex || 0;
        canvasImages = saved.canvasImages || [];
        selectedImage = null;
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
        selectedImage = null;
      }
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
        x: screenX / a4Scale,
        y: screenY / a4Scale
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

  function isStrokeHit(stroke: Stroke, coords: { x: number; y: number }, hitRadius: number): boolean {
    if (stroke.points.length === 0) return false;
    
    const bounds = stroke.bounds || calculateStrokeBounds(stroke);
    if (
      coords.x < bounds.minX - hitRadius ||
      coords.x > bounds.maxX + hitRadius ||
      coords.y < bounds.minY - hitRadius ||
      coords.y > bounds.maxY + hitRadius
    ) {
      return false;
    }

    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      return Math.hypot(p.x - coords.x, p.y - coords.y) < hitRadius;
    }
    
    for (let i = 0; i < stroke.points.length - 1; i++) {
      const a = stroke.points[i];
      const b = stroke.points[i + 1];
      if (isPointNearSegment(coords.x, coords.y, a.x, a.y, b.x, b.y, hitRadius)) {
        return true;
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
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const radius = Math.min(maxX - minX, maxY - minY) / 2;
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
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const rx = (maxX - minX) / 2, ry = (maxY - minY) / 2;
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
        
        // Cancel drawing or simple panning
        isDrawing = false;
        currentStroke = [];
        isPanning = false;
        
        e.preventDefault();
        return;
      }
    }

    if (activePointers.size > 2) {
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
    
    // Check if middle click or Hand tool or custom pan action
    const isFingerOrMouse = !isPen;
    const isPanAction = canvasMode === 'infinite' && 
      (e.button === 1 || activeTool === 'pan' || isPointerPan || (store.settings.stylusMode && isFingerOrMouse));
    
    if (isPanAction) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panBaseOffset = { ...panOffset };
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

    const coords = getCoords(e);
    const bounds = selectionBoundingBox;
    const isClickInSelection = bounds && isPointInBounds(coords.x, coords.y, bounds);

    // Stroke-erase mode: delete entire stroke under pointer (drag-support)
    if (!isClickInSelection && (activeTool === 'eraser' || isPointerEraser) && effectiveEraserSettings.eraserMode === 'stroke') {
      const hitRadius = effectiveEraserSettings.eraserRadiusStroke ?? 24;
      const currentHistory = canvasMode === 'a4' ? pages[activePageIndex].strokeHistory : infiniteStrokes;
      const currentEraserUndo = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
      let erased = false;
      for (let i = currentHistory.length - 1; i >= 0; i--) {
        const stroke = currentHistory[i];
        if (stroke.color === 'eraser' || stroke.color === '#FFFFFF') continue;
        if (isStrokeHit(stroke, coords, hitRadius)) {
          currentEraserUndo.push({
            type: 'erase_action',
            removedStrokes: [stroke],
            addedStrokes: []
          });
          if (canvasMode === 'a4') {
            pages[activePageIndex].redoStack = [];
          } else {
            infiniteRedo = [];
          }
          currentHistory.splice(i, 1);
          erased = true;
          break;
        }
      }
      if (erased) {
        if (canvasMode === 'a4') {
          pages[activePageIndex].strokeHistory = [...pages[activePageIndex].strokeHistory];
        } else {
          infiniteStrokes = [...infiniteStrokes];
        }
        invalidateCache();
        requestRedraw();
      }
      isStrokeErasing = true;
      saveToStore();
      e.preventDefault();
      return;
    }

    // In stylus mode, finger/touch/mouse cannot draw/select on A4 canvas either (unless clicking in selection to drag/move)
    if (store.settings.stylusMode && isFingerOrMouse && !isClickInSelection) {
      if (canvasMode !== 'infinite') {
        e.preventDefault();
        return;
      }
    }

    // Capture pointer to receive move/up even outside canvas borders
    try {
      canvasElement.setPointerCapture(e.pointerId);
    } catch (err) {}

    // Setup long-press (600ms) timer for context menu (stylus paste shortcut)
    if (!isPointerEraser && !isPointerSelect && !isPointerPan) {
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

    // Check if clicked near the active selected image's resize handle
    const handleSize = 15 / (canvasMode === 'infinite' ? zoomScale : 1);
    const isNearBottomRight = selectedImage &&
      Math.abs(coords.x - (selectedImage.x + selectedImage.width)) <= handleSize &&
      Math.abs(coords.y - (selectedImage.y + selectedImage.height)) <= handleSize;
      
    // Check if clicked inside any image body
    const clickedImage = canvasImages.find(img => {
      if (canvasMode === 'a4' && img.pageIndex !== activePageIndex) return false;
      return coords.x >= img.x && coords.x <= img.x + img.width &&
             coords.y >= img.y && coords.y <= img.y + img.height;
    });

    if (isNearBottomRight && selectedImage) {
      isResizingImage = true;
      imageDragStart = { x: coords.x, y: coords.y };
      imageStartRect = { x: selectedImage.x, y: selectedImage.y, width: selectedImage.width, height: selectedImage.height };
      imageStartAspectRatio = selectedImage.width / selectedImage.height;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      e.preventDefault();
      return;
    }

    const shouldDragImage = clickedImage && (activeTool === 'select' || activeTool === 'pan' || selectedImage !== null);

    if (shouldDragImage) {
      selectedImage = clickedImage;
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
    }

    if (isClickInSelection) {
      if (selectedImage) {
        isMovingImage = true;
        imageDragStart = { x: coords.x, y: coords.y };
        imageStartRect = { x: selectedImage.x, y: selectedImage.y, width: selectedImage.width, height: selectedImage.height };
      } else {
        isMovingSelection = true;
        selectionDragStart = { x: coords.x, y: coords.y };
      }
      selectionBox = null;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    } else if (activeTool === 'shape' && !isPointerEraser && !isPointerSelect && !isPointerPan) {
      if (selectedStrokes.length > 0) selectedStrokes = [];
      selectedImage = null;
      isShapeDrawing = true;
      shapeAnchorX = coords.x;
      shapeAnchorY = coords.y;
      shapePreviewX = coords.x;
      shapePreviewY = coords.y;
    } else if (activeTool === 'select' || isPointerSelect) {
      selectedStrokes = [];
      selectedImage = null;
      selectionBox = { x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y };
      isMovingSelection = false;
    } else {
      if (selectedStrokes.length > 0) selectedStrokes = [];
      selectedImage = null;
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
        const newScale = Math.max(0.2, Math.min(4.0, initialPinchZoom * factor));
        
        const rect = canvasElement.getBoundingClientRect();
        
        // World coordinates of initial midpoint
        const worldX = (initialPinchMidpoint.x - rect.left - initialPinchPanOffset.x) / initialPinchZoom;
        const worldY = (initialPinchMidpoint.y - rect.top - initialPinchPanOffset.y) / initialPinchZoom;
        
        // Calculate new pan offset based on current midpoint and new scale
        let newPanX = (currentMidpoint.x - rect.left) - worldX * newScale;
        let newPanY = (currentMidpoint.y - rect.top) - worldY * newScale;
        
        if (canvasMode === 'infinite') {
          newPanX = Math.min(0, newPanX);
          newPanY = Math.min(0, newPanY);
        }
        
        zoomScale = newScale;
        panOffset = { x: newPanX, y: newPanY };
        saveToStoreDebounced();
      }
      return;
    }

    if (activePointers.size > 1) {
      return;
    }

    if (isStrokeErasing) {
      e.preventDefault();
      const hitRadius = effectiveEraserSettings.eraserRadiusStroke ?? 24;
      const currentHistory = canvasMode === 'a4' ? pages[activePageIndex].strokeHistory : infiniteStrokes;
      const currentEraserUndo = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
      const coords = getCoords(e);
      let erased = false;
      for (let i = currentHistory.length - 1; i >= 0; i--) {
        const stroke = currentHistory[i];
        if (stroke.color === 'eraser' || stroke.color === '#FFFFFF') continue;
        if (isStrokeHit(stroke, coords, hitRadius)) {
          currentEraserUndo.push(stroke);
          currentHistory.splice(i, 1);
          erased = true;
          break;
        }
      }
      if (erased) {
        if (canvasMode === 'a4') {
          pages[activePageIndex].strokeHistory = [...pages[activePageIndex].strokeHistory];
        } else {
          infiniteStrokes = [...infiniteStrokes];
        }
        invalidateCache();
        requestRedraw();
      }
      saveToStore();
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
      
      let newPanX = panBaseOffset.x + dx;
      let newPanY = panBaseOffset.y + dy;
      
      if (canvasMode === 'infinite') {
        newPanX = Math.min(0, newPanX);
        newPanY = Math.min(0, newPanY);
      }
      
      panOffset = {
        x: newPanX,
        y: newPanY
      };
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

    if (isResizingImage && selectedImage) {
      const dx = coords.x - imageDragStart.x;
      const dy = coords.y - imageDragStart.y;
      
      const dragDelta = (dx + dy) / 2;
      const scaleFactor = 1 + (dragDelta / Math.max(imageStartRect.width, imageStartRect.height));
      const newWidth = Math.max(20, imageStartRect.width * scaleFactor);
      const newHeight = newWidth / imageStartAspectRatio;

      selectedImage.width = Math.round(newWidth);
      selectedImage.height = Math.round(newHeight);
      canvasImages = [...canvasImages];
      requestRedraw();
      return;
    }

    if (isMovingSelection && selectedStrokes.length > 0) {
      const dx = coords.x - selectionDragStart.x;
      const dy = coords.y - selectionDragStart.y;
      
      for (const stroke of selectedStrokes) {
        for (const p of stroke.points) {
          p.x += dx;
          p.y += dy;
        }
        if (stroke.bounds) {
          stroke.bounds.minX += dx;
          stroke.bounds.maxX += dx;
          stroke.bounds.minY += dy;
          stroke.bounds.maxY += dy;
        } else {
          stroke.bounds = calculateStrokeBounds(stroke);
        }
      }
      
      selectionDragStart = { x: coords.x, y: coords.y };
      
      // Trigger Svelte 5 reactivity updates
      selectedStrokes = [...selectedStrokes];
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory = [...pages[activePageIndex].strokeHistory];
      } else {
        infiniteStrokes = [...infiniteStrokes];
      }
      invalidateCache();
      requestRedraw();
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
      saveToStore();
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
      saveToStore();
      isMovingSelection = false;
      requestRedraw();
    } else if (activeTool === 'select' || isPointerSelect) {
      if (selectionBox) {
        selectedStrokes = getStrokesInMarquee(selectionBox.x1, selectionBox.y1, selectionBox.x2, selectionBox.y2);
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
        const newZoomScale = Math.max(0.2, Math.min(4.0, zoomScale * factor));
        
        // Temporarily calculate new a4Scale
        const baseA4Scale = Math.max(0.1, Math.min(
          containerWidth > 32 ? (containerWidth - 32) / 800 : 0.1,
          containerHeight > 32 ? (containerHeight - 32) / 1130 : 0.1
        ));
        const newA4Scale = baseA4Scale * newZoomScale;
        
        // Panned offset relative to container center
        const containerRect = canvasContainer.getBoundingClientRect();
        const mX = e.clientX - containerRect.left;
        const mY = e.clientY - containerRect.top;
        
        const cardX = (containerWidth - 800 * oldScale) / 2 + panOffset.x;
        const cardY = (containerHeight - 1130 * oldScale) / 2 + panOffset.y;
        
        const relX = (mX - cardX) / oldScale;
        const relY = (mY - cardY) / oldScale;
        
        const newCardX = mX - relX * newA4Scale;
        const newCardY = mY - relY * newA4Scale;
        
        const newPanX = newCardX - (containerWidth - 800 * newA4Scale) / 2;
        const newPanY = newCardY - (containerHeight - 1130 * newA4Scale) / 2;
        
        zoomScale = newZoomScale;
        panOffset = { x: newPanX, y: newPanY };
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
        panOffset = {
          x: panOffset.x - e.deltaX,
          y: panOffset.y - e.deltaY
        };
        saveToStoreDebounced();
      }
    }
  }

  function drawCanvasImages(ctxTarget: CanvasRenderingContext2D) {
    for (const canvasImg of canvasImages) {
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
          ctx.fillRect(0, 0, 800, 1130);
        }
        ctx.restore();
      }
      drawGuidelinesInWorld(ctx, 0, 0, 800, 1130, activeBg, bgOpacity);
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
        if (canvasMode === 'infinite' && isGesturing) {
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
    
    // Draw selection bounding box (if strokes are selected)
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
      const addedIds = new Set(action.addedStrokes.map((s: any) => s.id));
      if (canvasMode === 'a4') {
        let h = pages[activePageIndex].strokeHistory.filter(s => !addedIds.has(s.id));
        h.push(...action.removedStrokes);
        pages[activePageIndex].strokeHistory = h;
      } else {
        let h = infiniteStrokes.filter(s => !addedIds.has(s.id));
        h.push(...action.removedStrokes);
        infiniteStrokes = h;
      }
    } else if (action.type === 'insert_image') {
      canvasImages = canvasImages.filter(img => img.id !== action.image.id);
      if (selectedImage && selectedImage.id === action.image.id) {
        selectedImage = null;
      }
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
      const removedIds = new Set(action.removedStrokes.map((s: any) => s.id));
      if (canvasMode === 'a4') {
        let h = pages[activePageIndex].strokeHistory.filter(s => !removedIds.has(s.id));
        h.push(...action.addedStrokes);
        pages[activePageIndex].strokeHistory = h;
      } else {
        let h = infiniteStrokes.filter(s => !removedIds.has(s.id));
        h.push(...action.addedStrokes);
        infiniteStrokes = h;
      }
    } else if (action.type === 'insert_image') {
      canvasImages = [...canvasImages, action.image];
    } else if (action.type === 'delete_image') {
      canvasImages = canvasImages.filter(img => img.id !== action.image.id);
      if (selectedImage && selectedImage.id === action.image.id) {
        selectedImage = null;
      }
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
    }
    
    invalidateCache();
    requestRedraw();
    saveToStore();
  }

  async function handleExportPdf() {
    try {
      let pdf: jsPDF;

      if (showCanvas) {
        if (canvasMode === 'infinite') {
          // Bounding Box of all drawing strokes
          let box = getStrokesBoundingBox(infiniteStrokes, 'infinite');
          if (!box) {
            box = { x: 0, y: 0, width: containerWidth || 800, height: containerHeight || 1130 };
          }
          
          const exportCanvas = document.createElement('canvas');
          exportCanvas.width = box.width;
          exportCanvas.height = box.height;
          const exportCtx = exportCanvas.getContext('2d');
          if (!exportCtx) throw new Error('Could not create canvas context');

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

          const imgData = exportCanvas.toDataURL('image/png');
          pdf = new jsPDF({
            orientation: box.width > box.height ? 'l' : 'p',
            unit: 'px',
            format: [box.width, box.height]
          });
          pdf.addImage(imgData, 'PNG', 0, 0, box.width, box.height);
        } else {
          // A4 Mode
          pdf = new jsPDF({
            orientation: 'p',
            unit: 'px',
            format: [800, 1130]
          });

          for (let i = 0; i < pages.length; i++) {
            if (i > 0) {
              pdf.addPage([800, 1130], 'p');
            }
            const page = pages[i];
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = 800;
            exportCanvas.height = 1130;
            const exportCtx = exportCanvas.getContext('2d');
            if (!exportCtx) throw new Error('Could not create canvas context');

            // White background
            exportCtx.fillStyle = '#FFFFFF';
            exportCtx.fillRect(0, 0, 800, 1130);

            // Background Image
            if (currentBgImage) {
              exportCtx.save();
              exportCtx.globalAlpha = bgOpacity / 100;
              const pattern = exportCtx.createPattern(currentBgImage, 'repeat');
              if (pattern) {
                exportCtx.fillStyle = pattern;
                exportCtx.fillRect(0, 0, 800, 1130);
              }
              exportCtx.restore();
            }

            // Guidelines
            drawGuidelinesInWorld(exportCtx, 0, 0, 800, 1130, activeBg, bgOpacity);

            // Strokes
            for (const stroke of page.strokeHistory || []) {
              drawStroke(exportCtx, stroke);
            }

            const imgData = exportCanvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', 0, 0, 800, 1130);
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
          scale: 2,
          logging: false
        });
        document.body.removeChild(tempDiv);

        const imgWidth = 800;
        const pageHeight = 1130;
        const canvasHeight = canvas.height * (imgWidth / canvas.width);

        pdf = new jsPDF('p', 'px', [imgWidth, pageHeight]);

        let heightLeft = canvasHeight;
        let position = 0;

        pdf.addImage(canvas, 'PNG', 0, position, imgWidth, canvas.height * (imgWidth / canvas.width));
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position = position - pageHeight;
          pdf.addPage([imgWidth, pageHeight]);
          pdf.addImage(canvas, 'PNG', 0, position, imgWidth, canvas.height * (imgWidth / canvas.width));
          heightLeft -= pageHeight;
        }
      }

      // Dialog to save file
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

      if (!filePath) return; // User cancelled

      const pdfArrayBuffer = pdf.output('arraybuffer');
      await writeFile(filePath, new Uint8Array(pdfArrayBuffer));
      store.showNotification(t('practice.exportPdfSuccess'), 'success');
    } catch (err) {
      console.error('[PDF Export] Failed:', err);
      store.showNotification(t('practice.exportPdfError'), 'error');
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
        selectedImage = null;

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
    if (selectedStrokes.length === 0) return;
    copiedStrokes = JSON.parse(JSON.stringify(selectedStrokes));
    selectedStrokes = [];
  }

  function deleteSelected() {
    if (selectedImage) {
      const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
      undoStack.push({
        type: 'delete_image',
        image: selectedImage
      });
      if (canvasMode === 'a4') {
        pages[activePageIndex].redoStack = [];
      } else {
        infiniteRedo = [];
      }
      canvasImages = canvasImages.filter(img => img.id !== selectedImage.id);
      selectedImage = null;
      saveToStore();
      redraw();
      return;
    }
    if (selectedStrokes.length === 0) return;
    
    const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
    const history = canvasMode === 'a4' ? pages[activePageIndex].strokeHistory : infiniteStrokes;
    const removedStrokes = history.filter(s => selectedStrokes.some(sel => sel === s || (sel.id && sel.id === s.id)));
    
    if (removedStrokes.length > 0) {
      undoStack.push({
        type: 'erase_action',
        removedStrokes,
        addedStrokes: []
      });
    }

    if (canvasMode === 'a4') {
      pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.filter(
        s => !selectedStrokes.some(sel => sel === s || (sel.id && sel.id === s.id))
      );
      pages[activePageIndex].redoStack = [];
    } else {
      infiniteStrokes = infiniteStrokes.filter(
        s => !selectedStrokes.some(sel => sel === s || (sel.id && sel.id === s.id))
      );
      infiniteRedo = [];
    }
    
    selectedStrokes = [];
    contextMenu = null;
    saveToStore();
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
              pageIndex: canvasMode === 'a4' ? activePageIndex : 0
            };
            
            canvasImages = [...canvasImages, newImage];
            selectedImage = newImage;
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
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const base64Data = await blobToBase64(blob);
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
              pageIndex: canvasMode === 'a4' ? activePageIndex : 0
            };
            
            canvasImages = [...canvasImages, newImage];
            selectedImage = newImage;
            saveToStore();
            redraw();
          };
          return;
        }
      }
    } catch (err) {
      console.warn('Clipboard read error or not permitted: ', err);
    }
    
    if (copiedStrokes && copiedStrokes.length > 0) {
      pasteStrokes(targetX, targetY);
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

  function pasteStrokes(targetX, targetY) {
    if (copiedStrokes.length === 0) return;
    
    const strokesToPaste = JSON.parse(JSON.stringify(copiedStrokes));
    
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
    }
    
    const undoStack = canvasMode === 'a4' ? pages[activePageIndex].eraserUndoStack : infiniteEraserUndo;
    undoStack.push({
      type: 'erase_action',
      removedStrokes: [],
      addedStrokes: strokesToPaste
    });

    if (canvasMode === 'a4') {
      pages[activePageIndex].strokeHistory.push(...strokesToPaste);
      pages[activePageIndex].redoStack = [];
      pages[activePageIndex].strokeHistory = [...pages[activePageIndex].strokeHistory];
      const len = pages[activePageIndex].strokeHistory.length;
      selectedStrokes = pages[activePageIndex].strokeHistory.slice(len - strokesToPaste.length);
    } else {
      infiniteStrokes.push(...strokesToPaste);
      infiniteRedo = [];
      infiniteStrokes = [...infiniteStrokes];
      const len = infiniteStrokes.length;
      selectedStrokes = infiniteStrokes.slice(len - strokesToPaste.length);
    }
    
    contextMenu = null;
    saveToStore();
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
        if (selectedImage || selectedStrokes.length > 0) {
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

  // Multimodal AI Grading using Cropped PNG bounding box
  // Multimodal AI Grading using Cropped PNG bounding box
  async function checkWork() {
    if (!store.activeProject || !store.activeTask) return;

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
        editorText
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
    {handleBack}
    {handleUndo}
    {handleRedo}
    {checkWork}
  />

  <!-- Interactive practice screen split layout -->
  <div class="grow h-full flex overflow-hidden relative w-full {sidebarPosition === 'top' || sidebarPosition === 'bottom' ? 'flex-col' : 'flex-row'}">
    
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
      isRightContentVisible={showCanvas || showText}
      infoPanelsLayout={infoPanelsLayout}
      {sidebarPosition}
      onSelectProvidedImage={handleSelectProvidedImage}
    />

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
            class="absolute inset-0 w-full h-full z-10 bg-white {cursorClass}"
            style="touch-action: none; will-change: transform;"
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
          style="width: 800px; height: 1130px; transform: translate({panOffset.x}px, {panOffset.y}px) scale({a4Scale});"
        >
          <canvas 
            bind:this={canvasElement}
            width="800"
            height="1130"
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            onpointerleave={handlePointerLeave}
            onpointercancel={handlePointerCancel}
            oncontextmenu={e => e.preventDefault()}
            class="absolute inset-0 w-full h-full z-10 bg-transparent {cursorClass}"
            style="touch-action: none; will-change: transform;"
          ></canvas>
        </div>

        <!-- Clickable Marker Buttons (A4 Page Mode) - Placed outside the scaled div to remain crisp and full size -->
        {#if showFeedback && hasCheckedWork && !isChecking && showCanvasAnnotations}
          {@const leftOffset = (containerWidth - 800 * a4Scale) / 2 + panOffset.x}
          {@const topOffset = (containerHeight - 1130 * a4Scale) / 2 + panOffset.y}
          
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
        {@const leftOffset = canvasMode === 'a4' ? (containerWidth - 800 * a4Scale) / 2 + panOffset.x : panOffset.x}
        {@const topOffset = canvasMode === 'a4' ? (containerHeight - 1130 * a4Scale) / 2 + panOffset.y : panOffset.y}
        {@const scale = canvasMode === 'a4' ? a4Scale : zoomScale}
        {@const boxLeft = bounds.minX * scale + leftOffset}
        {@const boxTop = bounds.minY * scale + topOffset}
        {@const boxWidth = (bounds.maxX - bounds.minX) * scale}
        {@const boxHeight = (bounds.maxY - bounds.minY) * scale}
        
        {@const toolbarWidth = 220}
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
            <button 
              onclick={copySelected}
              class="px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/10 rounded cursor-pointer transition-colors flex items-center gap-1 border-0 bg-transparent"
              title={t('practice.canvas.copy')}
            >
              <span class="material-symbols-outlined text-[14px]">content_copy</span>
              <span>{t('practice.canvas.copy')}</span>
            </button>
            <div class="w-px h-3 bg-outline-variant/50"></div>
          {/if}
          <button 
            onclick={deleteSelected}
            class="px-2.5 py-1 text-[10px] font-bold text-error hover:bg-error/10 rounded cursor-pointer transition-colors flex items-center gap-1 border-0 bg-transparent"
            title={t('common.delete')}
          >
            <span class="material-symbols-outlined text-[14px]">delete</span>
            <span>{t('common.delete')}</span>
          </button>
          <div class="w-px h-3 bg-outline-variant/50"></div>
          <button 
            onclick={() => { selectedStrokes = []; selectedImage = null; }}
            class="px-2.5 py-1 text-[10px] font-bold text-outline hover:bg-surface-container rounded cursor-pointer transition-colors border-0 bg-transparent"
            title={t('project.cancelSelection')}
          >
            <span>{t('common.cancel')}</span>
          </button>
        </div>
      {/if}

      <!-- Custom Right-Click / Long-Press Paste Context Menu -->
      {#if contextMenu}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <button 
          type="button"
          class="absolute inset-0 z-40 bg-transparent cursor-default border-0 p-0 m-0 w-full h-full focus:outline-none"
          onclick={() => contextMenu = null}
          aria-label="Dismiss context menu"
        ></button>
        
        {@const menuWidth = 160}
        {@const menuHeight = 120}
        {@const menuLeft = Math.max(8, Math.min(contextMenu.x, containerWidth - menuWidth - 8))}
        {@const menuTop = Math.max(8, Math.min(contextMenu.y, containerHeight - menuHeight - 8))}
        <div 
          class="absolute z-50 bg-surface-container-high border border-outline-variant shadow-xl rounded-xl py-1.5 w-40 flex flex-col font-sans text-xs select-none"
          style="left: {menuLeft}px; top: {menuTop}px;"
        >
          <button 
            onclick={() => pasteStrokes(contextMenu.canvasX, contextMenu.canvasY)}
            disabled={copiedStrokes.length === 0}
            class="w-full text-left px-4 py-2 hover:bg-primary/10 hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-on-surface flex items-center gap-2 cursor-pointer font-semibold border-0 bg-transparent"
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
        {strokeHistory}
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

    {#if showCanvas && showText}
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

    {#if showText}
      <!-- Right side: Text Editor Workspace (LaTeX / Markdown Live Preview / Raw Editor) -->
      <section 
        class="text-editor-workspace flex flex-col bg-surface-container-lowest overflow-hidden select-text font-sans relative {showCanvas ? 'shrink-0' : 'grow'} {workspaceLayout === 'vertical' ? 'w-full' : 'h-full'}"
        style={showCanvas ? (workspaceLayout === 'vertical' ? `height: ${editorSplitHeight}px;` : `width: ${editorSplitWidth}px;`) : ''}
      >
        
        <div class="flex flex-col grow h-full w-full overflow-hidden p-6">
          
          <!-- Editor Title & Status Bar -->
          <div class="flex justify-between items-center mb-3 select-none">
            <h3 class="text-xs font-bold text-primary flex items-center gap-1.5 uppercase tracking-wider">
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
              style="font-size: {store.getEffectiveSettings(store.activeProject?.id || '', store.activeTask?.id).editorFontSize || 16}px;"
            ></textarea>
          {:else}
            <!-- Preview Mode: non-editable rendered HTML -->
            <div 
              role="document"
              class="grow w-full h-full overflow-y-auto bg-surface-container-low/20 border border-outline-variant/30 rounded-xl p-6 select-text text-left leading-relaxed max-w-none prose dark:prose-invert animate-fade-in custom-scrollbar"
              style="font-size: {store.getEffectiveSettings(store.activeProject?.id || '', store.activeTask?.id).editorFontSize || 16}px;"
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
    <div class="bg-surface border border-outline-variant rounded-xl p-6 w-[420px] max-w-[90%] max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl flex flex-col gap-5 z-10 relative">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-outline-variant/30 pb-3">
        <div class="flex items-center gap-2 text-primary">
          <span class="material-symbols-outlined text-xl">tune</span>
          <h3 class="font-bold text-base text-on-surface">Canvas Settings</h3>
        </div>
        <button 
          onclick={() => store.canvasSettingsOpen = false}
          class="text-on-surface-variant hover:bg-surface-container-high rounded-lg p-1.5 flex items-center justify-center transition-colors focus:outline-none cursor-pointer border-0 bg-transparent"
        >
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      <!-- Background Selection -->
      <div class="flex flex-col gap-2">
        <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('practice.canvas.background')}</span>
        <!-- Grid of standard options -->
        <div class="grid grid-cols-3 gap-2">
          <button 
            onclick={() => activeBg = 'grid'}
            class="flex flex-col items-center justify-center p-3 border rounded-lg gap-1.5 cursor-pointer focus:outline-none transition-all bg-transparent
                   {activeBg === 'grid' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}"
          >
            <span class="material-symbols-outlined text-xl">apps</span>
            <span class="text-[11px] font-semibold">{t('practice.canvas.dots')}</span>
          </button>
          <button 
            onclick={() => activeBg = 'lines'}
            class="flex flex-col items-center justify-center p-3 border rounded-lg gap-1.5 cursor-pointer focus:outline-none transition-all bg-transparent
                   {activeBg === 'lines' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}"
          >
            <span class="material-symbols-outlined text-xl">reorder</span>
            <span class="text-[11px] font-semibold">{t('practice.canvas.lines')}</span>
          </button>
          <button 
            onclick={() => activeBg = 'blank'}
            class="flex flex-col items-center justify-center p-3 border rounded-lg gap-1.5 cursor-pointer focus:outline-none transition-all bg-transparent
                   {activeBg === 'blank' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}"
          >
            <span class="material-symbols-outlined text-xl">check_box_outline_blank</span>
            <span class="text-[11px] font-semibold">{t('practice.canvas.blank')}</span>
          </button>
        </div>

        <!-- Custom Backgrounds list if any -->
        {#if store.customBackgrounds.length > 0}
          <div class="mt-2 flex flex-col gap-1.5">
            <span class="text-[11px] font-semibold text-on-surface-variant">{t('practice.canvas.customTemplates')}</span>
            <div class="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar border border-outline-variant/30 rounded-lg p-1">
              {#each store.customBackgrounds as customBg}
                <div class="flex items-center justify-between hover:bg-surface-container-high rounded-md group px-2 py-1">
                  <button 
                    onclick={() => activeBg = customBg.id}
                    class="grow text-left text-xs flex items-center gap-2 cursor-pointer border-0 bg-transparent focus:outline-none {activeBg === customBg.id ? 'text-primary font-bold' : 'text-on-surface'}"
                  >
                    {#if customBg.icon && customBg.icon.startsWith('data:image/')}
                      <img src={customBg.icon} class="w-4 h-4 object-contain rounded" alt="" />
                    {:else}
                      <span class="material-symbols-outlined text-base">image</span>
                    {/if}
                    <span class="truncate max-w-50">{customBg.name}</span>
                  </button>
                  <button 
                    onclick={() => {
                      store.confirm(
                        t('practice.canvas.deleteBg'),
                        t('practice.canvas.deleteBgConfirm', { name: customBg.name }),
                        () => {
                          if (activeBg === customBg.id) activeBg = 'grid';
                          store.deleteCustomBackground(customBg.id);
                        }
                      );
                    }}
                    class="p-1 text-outline hover:text-error opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none cursor-pointer flex items-center justify-center border-0 bg-transparent"
                    title="Delete Background"
                  >
                    <span class="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <button 
          onclick={() => { 
            isCustomBgModalOpen = true; 
            store.canvasSettingsOpen = false;
          }}
          class="mt-2 w-full py-2 border border-dashed border-primary/50 text-primary hover:bg-primary/10 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none bg-transparent"
        >
          <span class="material-symbols-outlined text-base">add_box</span>
          <span>{t('practice.canvas.addCustomBg')}</span>
        </button>


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

      <!-- Text Editor Font Size (Spinbox) -->
      <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
        <div class="flex justify-between items-center">
          <label for="editor-font-size-spinbox" class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            {t('practice.canvas.editorFontSize')}
          </label>
        </div>
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-base text-outline">format_size</span>
          <div class="flex items-center bg-surface-container rounded-lg border border-outline-variant p-0.5 grow justify-between">
            <button 
              type="button"
              onclick={() => {
                store.settings.editorFontSize = Math.max(10, (store.settings.editorFontSize || 16) - 1);
                store.saveSettings();
              }}
              class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
            >
              <span class="material-symbols-outlined text-sm">remove</span>
            </button>
            <input 
              id="editor-font-size-spinbox"
              type="number"
              min="10"
              max="40"
              bind:value={store.settings.editorFontSize}
              onchange={() => {
                if (typeof store.settings.editorFontSize !== 'number' || isNaN(store.settings.editorFontSize)) {
                  store.settings.editorFontSize = 16;
                }
                store.settings.editorFontSize = Math.max(10, Math.min(store.settings.editorFontSize, 40));
                store.saveSettings();
              }}
              class="w-16 bg-transparent text-center text-xs font-bold text-on-surface focus:outline-none border-0 p-0"
            />
            <button 
              type="button"
              onclick={() => {
                store.settings.editorFontSize = Math.min(40, (store.settings.editorFontSize || 16) + 1);
                store.saveSettings();
              }}
              class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
            >
              <span class="material-symbols-outlined text-sm">add</span>
            </button>
          </div>
          <span class="text-xs font-bold text-on-surface-variant select-none w-6 text-right">px</span>
        </div>
      </div>
      <!-- Canvas Font Size (Spinbox) -->
      <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
        <div class="flex justify-between items-center">
          <label for="canvas-font-size-spinbox" class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            {t('settings.canvas.textFontSize')}
          </label>
        </div>
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-base text-outline">text_fields</span>
          <div class="flex items-center bg-surface-container rounded-lg border border-outline-variant p-0.5 grow justify-between">
            <button 
              type="button"
              onclick={() => {
                store.settings.canvasFontSize = Math.max(10, (store.settings.canvasFontSize || 13) - 1);
                store.saveSettings();
              }}
              class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
            >
              <span class="material-symbols-outlined text-sm">remove</span>
            </button>
            <input 
              id="canvas-font-size-spinbox"
              type="number"
              min="10"
              max="24"
              bind:value={store.settings.canvasFontSize}
              onchange={() => {
                if (typeof store.settings.canvasFontSize !== 'number' || isNaN(store.settings.canvasFontSize)) {
                  store.settings.canvasFontSize = 13;
                }
                store.settings.canvasFontSize = Math.max(10, Math.min(store.settings.canvasFontSize, 24));
                store.saveSettings();
              }}
              class="w-16 bg-transparent text-center text-xs font-bold text-on-surface focus:outline-none border-0 p-0"
            />
            <button 
              type="button"
              onclick={() => {
                store.settings.canvasFontSize = Math.min(24, (store.settings.canvasFontSize || 13) + 1);
                store.saveSettings();
              }}
              class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
            >
              <span class="material-symbols-outlined text-sm">add</span>
            </button>
          </div>
          <span class="text-xs font-bold text-on-surface-variant select-none w-6 text-right">px</span>
        </div>
      </div>

      <!-- Info Panels Layout -->
      <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
        <div class="flex justify-between items-center">
          <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            {t('practice.canvas.infoPanelsLayoutTitle')}
          </span>
        </div>
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
        <div class="flex justify-between items-center">
          <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            {t('practice.canvas.workspaceLayoutTitle')}
          </span>
        </div>
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
        <div class="flex justify-between items-center">
          <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            {t('practice.canvas.sidebarPositionTitle')}
          </span>
        </div>
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

      <!-- Actions -->
      <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4 mt-1">
        <button 
          onclick={() => {
            store.canvasSettingsOpen = false;
            handleExportPdf();
          }}
          class="w-full flex items-center justify-center gap-1.5 border border-outline-variant text-on-surface hover:bg-surface-container py-2.5 rounded-lg text-xs font-semibold cursor-pointer focus:outline-none bg-transparent transition-colors"
          title={showCanvas ? t('practice.exportCanvasPdf') : t('practice.exportTextPdf')}
        >
          <span class="material-symbols-outlined text-base text-primary">picture_as_pdf</span>
          <span>{t('practice.exportPdfLabel')}</span>
        </button>

        <button 
          onclick={() => {
            clearCanvas();
          }}
          class="w-full flex items-center justify-center gap-1.5 border border-outline-variant text-on-surface-variant hover:bg-error/10 hover:text-error hover:border-error/30 py-2.5 rounded-lg text-xs font-semibold cursor-pointer focus:outline-none bg-transparent transition-colors"
          title="Clear Canvas"
        >
          <span class="material-symbols-outlined text-base">delete_sweep</span>
          <span>{t('practice.canvas.clearCanvas')}</span>
        </button>
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
