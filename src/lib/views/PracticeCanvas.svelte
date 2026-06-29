<script lang="ts">
  import { store, DEFAULT_SYSTEM_PROMPT, type Task } from '../state/store.svelte';
  import { onMount, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { t } from '../services/i18n';

  // Subcomponents
  import PracticeHeader from '../components/practice/PracticeHeader.svelte';
  import PracticeInfoPanels from '../components/practice/PracticeInfoPanels.svelte';
  import CustomBgModal from '../components/practice/CustomBgModal.svelte';
  import FloatingToolPalette from '../components/practice/FloatingToolPalette.svelte';
  import CritiqueOverlay from '../components/practice/CritiqueOverlay.svelte';
  import MarkerTooltip from '../components/practice/MarkerTooltip.svelte';

  // External Helpers
  import { parseMarkdown } from '../utils/markdown';
  import { 
    loadImage, 
    getStrokesBoundingBox, 
    drawStroke, 
    drawGuidelinesInWorld,
    type Stroke,
    type Point
  } from '../utils/canvas';
  import { runCheckWork } from '../services/ai';
  import { getMediaDataUrl } from '../db/media';


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
  
  // Resizable left panel splitter state
  let splitWidth = $state(400); // Default instructions panel width
  let isCustomBgModalOpen = $state(false);

  // Brush configuration
  let strokeColor = $state('#000000');
  let brushWidth = $state(2);
  let activeTool = $state('pen'); // 'pen' | 'eraser' | 'pan' | 'select' | 'shape'
  let shapeType = $state('rectangle'); // 'circle' | 'ellipse' | 'line' | 'square' | 'rectangle' | 'triangle'

  let cursorClass = $derived.by(() => {
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
  let isChecking = $state(false);
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
      ? store.getEffectiveSettings(store.activeProject.id).canvasMode
      : store.settings.canvasMode
  );

  let canvasTextFontSize = $derived(
    store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id).canvasFontSize ?? 13
      : store.settings.canvasFontSize ?? 13
  );

  let effectiveEraserSettings = $derived(
    store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id)
      : store.settings
  );

  let eraserWidth = $state(
    ((store.activeProject
      ? store.getEffectiveSettings(store.activeProject.id)
      : store.settings).eraserMode === 'stroke'
      ? (store.activeProject
          ? store.getEffectiveSettings(store.activeProject.id)
          : store.settings).eraserRadiusStroke
      : (store.activeProject
          ? store.getEffectiveSettings(store.activeProject.id)
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
      redoStack: []
    }
  ]);
  let activePageIndex = $state(0);

  // Infinite Canvas state
  let infiniteStrokes = $state([]);
  let infiniteRedo = $state([]);
  let panOffset = $state({ x: 0, y: 0 });
  let isPanning = $state(false);
  let panStart = { x: 0, y: 0 };
  let panBaseOffset = { x: 0, y: 0 };
  let zoomScale = $state(1);
  let currentBgImage = $state(null);

  // Canvas element references & container sizes
  let canvasElement = $state(null);
  let canvasContainer = $state(null);
  let containerWidth = $state(800);
  let containerHeight = $state(600);
  
  let canvasWidth = $derived(canvasMode === 'infinite' ? containerWidth : 800);
  let canvasHeight = $derived(canvasMode === 'infinite' ? containerHeight : 1130);
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

  let selectionBoundingBox = $derived.by(() => {
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
  let isPinching = false;

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

  let activeLeftPanels = $derived([
    showTask && { id: 'task', title: `${task.category && task.category !== 'Basics' ? task.category + ' - ' : ''}${task.name}`, content: task.instructions },
    showSolution && { id: 'solution', title: t('practice.evaluationGoal'), content: task.solution },
    showFeedback && hasCheckedWork && { id: 'feedback', title: t('practice.aiCritiqueFeedback'), isFeedback: true }
  ].filter(Boolean));

  // Initialize context when canvas mounts or switches
  $effect(() => {
    if (canvasElement) {
      ctx = canvasElement.getContext('2d');
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
    const bg = activeBg;
    const opacity = bgOpacity;
    const offset = panOffset;
    const pIndex = activePageIndex;
    const history = strokeHistory;
    const actStroke = currentStroke;
    const scale = zoomScale;
    const bgImg = currentBgImage;
    
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

    if (ctx && canvasElement) {
      requestRedraw();
    }
  });

  let lastTaskId = $state(null);
  $effect(() => {
    if (task && task.id && task.id !== lastTaskId) {
      lastTaskId = task.id;
      if (task.critique) {
        feedbackText = task.critique.feedbackText || '';
        feedbackScore = task.critique.feedbackScore || null;
        feedbackMarkers = task.critique.feedbackMarkers || [];
        hasCheckedWork = true;
        showFeedback = true;
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
      panOffset: { ...panOffset },
      zoomScale,
      activePageIndex
    });
  }



  // Load saved drawing state when active task shifts
  $effect(() => {
    const taskId = task.id;
    if (taskId) {
      const saved = store.getCanvasState(taskId);
      if (saved) {
        pages = saved.pages || [
          {
            id: 'page-' + Date.now(),
            strokeHistory: [],
            redoStack: []
          }
        ];
        infiniteStrokes = saved.infiniteStrokes || [];
        infiniteRedo = saved.infiniteRedo || [];
        panOffset = saved.panOffset || { x: 0, y: 0 };
        zoomScale = saved.zoomScale || 1;
        activePageIndex = saved.activePageIndex || 0;
      } else {
        // Clear canvas if no state was previously saved
        pages = [
          {
            id: 'page-' + Date.now(),
            strokeHistory: [],
            redoStack: []
          }
        ];
        infiniteStrokes = [];
        infiniteRedo = [];
        panOffset = { x: 0, y: 0 };
        zoomScale = 1;
        activePageIndex = 0;
      }
    }
  });

  function getCoords(e) {
    if (!canvasElement) return { x: 0, y: 0 };
    const rect = canvasElement.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
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

    if (store.settings.stylusMode && isPen && !isPointerEraser && !isPointerSelect && !isPointerPan && !isPointerPen && activeTool !== 'eraser' && activeTool !== 'select' && activeTool !== 'pan') {
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

    const coords = getCoords(e);
    const bounds = selectionBoundingBox;
    const isClickInSelection = (activeTool === 'select' || isPointerSelect) && bounds && isPointInBounds(coords.x, coords.y, bounds);

    // Stroke-erase mode: delete entire stroke under pointer (drag-support)
    if ((activeTool === 'eraser' || isPointerEraser) && effectiveEraserSettings.eraserMode === 'stroke') {
      const hitRadius = effectiveEraserSettings.eraserRadiusStroke ?? 24;
      const currentHistory = canvasMode === 'a4' ? pages[activePageIndex].strokeHistory : infiniteStrokes;
      const currentRedo = canvasMode === 'a4' ? pages[activePageIndex].redoStack : infiniteRedo;
      for (let i = currentHistory.length - 1; i >= 0; i--) {
        const stroke = currentHistory[i];
        if (stroke.color === 'eraser' || stroke.color === '#FFFFFF') continue;
        if (stroke.points.some(p => Math.abs(p.x - coords.x) < hitRadius && Math.abs(p.y - coords.y) < hitRadius)) {
          currentRedo.push(stroke);
          currentHistory.splice(i, 1);
          break;
        }
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

    if (activeTool === 'shape') {
      if (selectedStrokes.length > 0) selectedStrokes = [];
      isShapeDrawing = true;
      shapeAnchorX = coords.x;
      shapeAnchorY = coords.y;
      shapePreviewX = coords.x;
      shapePreviewY = coords.y;
    } else if (activeTool === 'select' || isPointerSelect) {
      if (isClickInSelection) {
        isMovingSelection = true;
        selectionDragStart = { x: coords.x, y: coords.y };
        selectionBox = null;
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      } else {
        selectedStrokes = [];
        selectionBox = { x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y };
        isMovingSelection = false;
      }
    } else {
      if (selectedStrokes.length > 0) selectedStrokes = [];
      isDrawing = true;
      currentStroke = [coords];
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
      const currentRedo = canvasMode === 'a4' ? pages[activePageIndex].redoStack : infiniteRedo;
      const coords = getCoords(e);
      for (let i = currentHistory.length - 1; i >= 0; i--) {
        const stroke = currentHistory[i];
        if (stroke.color === 'eraser' || stroke.color === '#FFFFFF') continue;
        if (stroke.points.some(p => Math.abs(p.x - coords.x) < hitRadius && Math.abs(p.y - coords.y) < hitRadius)) {
          currentRedo.push(stroke);
          currentHistory.splice(i, 1);
          break;
        }
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
    
    if (activeTool === 'select' || isPointerSelect) {
      if (isMovingSelection && selectedStrokes.length > 0) {
        const dx = coords.x - selectionDragStart.x;
        const dy = coords.y - selectionDragStart.y;
        
        for (const stroke of selectedStrokes) {
          for (const p of stroke.points) {
            p.x += dx;
            p.y += dy;
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
      } else if (selectionBox) {
        selectionBox.x2 = coords.x;
        selectionBox.y2 = coords.y;
      }
    } else if (isShapeDrawing) {
      shapePreviewX = coords.x;
      shapePreviewY = coords.y;
    } else if (isDrawing) {
      currentStroke.push(coords);
    }
  }

  function handlePointerUp(e) {
    activePointers.delete(e.pointerId);

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
    
    if (activeTool === 'select' || isPointerSelect) {
      if (selectionBox) {
        selectedStrokes = getStrokesInMarquee(selectionBox.x1, selectionBox.y1, selectionBox.x2, selectionBox.y2);
        selectionBox = null;
      }
      if (isMovingSelection) {
        saveToStore();
      }
      isMovingSelection = false;
    } else if (isShapeDrawing) {
      isShapeDrawing = false;

      const shapePoints = generateShapePoints(shapeType, shapeAnchorX, shapeAnchorY, shapePreviewX, shapePreviewY);
      if (shapePoints.length > 0) {
        const newStroke: Stroke = {
          color: strokeColor,
          width: brushWidth,
          points: shapePoints
        };

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
      
      if (currentStroke.length > 0) {
        const isEraser = (activeTool === 'eraser' || isPointerEraser);
        const newStroke = {
          color: isEraser ? 'eraser' : strokeColor,
          width: isEraser ? eraserWidth : brushWidth,
          points: [...currentStroke]
        };
        
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
      currentStroke = [];
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

  function redraw() {
    if (!ctx || !canvasElement) return;
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
    
    offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    offscreenCtx.save();
    if (canvasMode === 'infinite') {
      offscreenCtx.translate(panOffset.x, panOffset.y);
      offscreenCtx.scale(zoomScale, zoomScale);
    }
    
    // Draw historical strokes
    for (const stroke of strokeHistory) {
      drawStroke(offscreenCtx, stroke);
    }
    
    // Draw active drawing stroke
    if (currentStroke.length > 0) {
      drawStroke(offscreenCtx, {
        color: (activeTool === 'eraser' || isPointerEraser) ? 'eraser' : strokeColor,
        width: (activeTool === 'eraser' || isPointerEraser) ? eraserWidth : brushWidth,
        points: currentStroke
      });
    }
    
    offscreenCtx.restore();
    
    // Composite offscreen strokes canvas back onto the main canvas
    ctx.drawImage(offscreenCanvas, 0, 0);
    
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
    if (canvasMode === 'a4') {
      if (pages[activePageIndex]?.strokeHistory.length > 0) {
        const last = pages[activePageIndex].strokeHistory.pop();
        pages[activePageIndex].redoStack.push(last);
      }
    } else {
      if (infiniteStrokes.length > 0) {
        const last = infiniteStrokes.pop();
        infiniteRedo.push(last);
      }
    }
    saveToStore();
  }

  function handleRedo() {
    if (canvasMode === 'a4') {
      if (pages[activePageIndex]?.redoStack.length > 0) {
        const next = pages[activePageIndex].redoStack.pop();
        pages[activePageIndex].strokeHistory.push(next);
      }
    } else {
      if (infiniteRedo.length > 0) {
        const next = infiniteRedo.pop();
        infiniteStrokes.push(next);
      }
    }
    saveToStore();
  }

  function clearCanvas() {
    if (strokeHistory.length === 0 && !hasCheckedWork) return;
    
    store.confirm(
      t('practice.canvas.clear'),
      'Are you sure you want to clear your drawing canvas? This will discard your current calligraphy sketch and AI feedback.',
      () => {
        if (canvasMode === 'a4') {
          if (pages[activePageIndex]) {
            pages[activePageIndex].strokeHistory = [];
            pages[activePageIndex].redoStack = [];
          }
        } else {
          infiniteStrokes = [];
          infiniteRedo = [];
        }
        
        feedbackText = '';
        feedbackScore = null;
        feedbackMarkers = [];
        hasCheckedWork = false;
        showFeedback = false;
        showCritiqueBanner = false;
        activeTooltipMarker = null;

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
  }

  function deleteSelected() {
    if (selectedStrokes.length === 0) return;
    
    if (canvasMode === 'a4') {
      pages[activePageIndex].strokeHistory = pages[activePageIndex].strokeHistory.filter(
        s => !selectedStrokes.includes(s)
      );
      pages[activePageIndex].redoStack = [];
    } else {
      infiniteStrokes = infiniteStrokes.filter(
        s => !selectedStrokes.includes(s)
      );
      infiniteRedo = [];
    }
    
    selectedStrokes = [];
    contextMenu = null;
    saveToStore();
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
      for (const p of stroke.points) {
        p.x += dx;
        p.y += dy;
      }
    }
    
    if (canvasMode === 'a4') {
      pages[activePageIndex].strokeHistory.push(...strokesToPaste);
      pages[activePageIndex].redoStack = [];
      pages[activePageIndex].strokeHistory = [...pages[activePageIndex].strokeHistory];
    } else {
      infiniteStrokes.push(...strokesToPaste);
      infiniteRedo = [];
      infiniteStrokes = [...infiniteStrokes];
    }
    
    selectedStrokes = strokesToPaste;
    activeTool = 'select';
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
      
      if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        if (selectedStrokes.length > 0) {
          copySelected();
          e.preventDefault();
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        if (copiedStrokes.length > 0) {
          if (canvasMode === 'infinite') {
            const centerX = (containerWidth / 2 - panOffset.x) / zoomScale;
            const centerY = (containerHeight / 2 - panOffset.y) / zoomScale;
            pasteStrokes(centerX, centerY);
          } else {
            pasteStrokes(400, 565); // A4 center
          }
          e.preventDefault();
        }
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
        if (selectedStrokes.length > 0) {
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
  async function checkWork() {
    feedbackMarkers = [];
    activeTooltipMarker = null;
    isChecking = true;
    showFeedback = true;
    showCritiqueBanner = true;
    hasCheckedWork = true;
    feedbackText = "Analyzing stroke geometries and guidelines alignment...";
    feedbackScore = null;

    try {
      const effectiveSettings = store.activeProject
        ? store.getEffectiveSettings(store.activeProject.id)
        : store.settings;

      const result = await runCheckWork({
        canvasMode: canvasMode as 'infinite' | 'a4',
        pages,
        infiniteStrokes,
        currentBgUrl,
        bgOpacity,
        activeBg,
        task: { ...task, section: task.category },
        projectGuidelines: store.activeProject?.guidelines?.trim(),
        settings: {
          apiProvider: effectiveSettings.apiProvider,
          geminiApiKey: effectiveSettings.geminiApiKey,
          openRouterApiKey: effectiveSettings.openRouterApiKey,
          geminiModel: effectiveSettings.geminiModel,
          openRouterModel: effectiveSettings.openRouterModel,
          openRouterReasoning: effectiveSettings.openRouterReasoning,
          openRouterProvider: effectiveSettings.openRouterProvider,
          sendTaskMedia: effectiveSettings.sendTaskMedia,
          sendSolutionMedia: effectiveSettings.sendSolutionMedia,
          sendCanvasBackground: effectiveSettings.sendCanvasBackground,
          sendTaskText: effectiveSettings.sendTaskText,
          sendSolutionText: effectiveSettings.sendSolutionText,
          language: effectiveSettings.language,
          customSystemPrompt: effectiveSettings.customSystemPrompt
        },
        defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT
      });

      feedbackText = result.feedbackText;
      feedbackScore = result.feedbackScore;
      feedbackMarkers = result.feedbackMarkers;

      if (store.activeProject && store.activeTask) {
        const updatedData: any = {
          critique: {
            feedbackText,
            feedbackScore,
            feedbackMarkers
          }
        };
        if (feedbackScore === 100 && store.settings.autoCompleteOnSuccess) {
          updatedData.completed = true;
        } else {
          updatedData.completed = false;
        }
        store.updateTask(store.activeProject.id, store.activeTask.id, updatedData);
      }

      if (feedbackScore === 100) {
        showSuccessNotification = true;
        setTimeout(() => {
          showSuccessNotification = false;
        }, 3500);
      }

    } catch (err: any) {
      feedbackText = `❌ **Error:**\n\n${err.message}`;
      feedbackScore = null;
      feedbackMarkers = [];
    } finally {
      isChecking = false;
    }
  }

  function handleBack() {
    store.setView('project-detail');
  }
</script>

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
    bind:pages
    bind:activePageIndex
    {strokeHistory}
    {redoStack}
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
  <div class="grow flex overflow-hidden relative w-full">
    
    <!-- Left side: dynamic split screen task, solution, and critique -->
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
    />

    <!-- Right side: Drawing Workspace (Infinite or A4 Centered) -->
    <section 
      bind:this={canvasContainer} 
      bind:clientWidth={containerWidth}
      bind:clientHeight={containerHeight}
      class="grow relative h-full w-full select-none
             {canvasMode === 'infinite' ? 'overflow-hidden bg-surface-container-lowest cursor-crosshair' : 'overflow-hidden bg-surface-container-lowest flex justify-center items-center'}"
    >


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
          {#if showFeedback && hasCheckedWork && !isChecking}
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
        {#if showFeedback && hasCheckedWork && !isChecking}
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
          <button 
            onclick={copySelected}
            class="px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/10 rounded cursor-pointer transition-colors flex items-center gap-1 border-0 bg-transparent"
            title="Copy strokes (Ctrl+C)"
          >
            <span class="material-symbols-outlined text-[14px]">content_copy</span>
            <span>Copy</span>
          </button>
          <div class="w-px h-3 bg-outline-variant/50"></div>
          <button 
            onclick={deleteSelected}
            class="px-2.5 py-1 text-[10px] font-bold text-error hover:bg-error/10 rounded cursor-pointer transition-colors flex items-center gap-1 border-0 bg-transparent"
            title="Delete strokes (Delete)"
          >
            <span class="material-symbols-outlined text-[14px]">delete</span>
            <span>Delete</span>
          </button>
          <div class="w-px h-3 bg-outline-variant/50"></div>
          <button 
            onclick={() => selectedStrokes = []}
            class="px-2.5 py-1 text-[10px] font-bold text-outline hover:bg-surface-container rounded cursor-pointer transition-colors border-0 bg-transparent"
            title="Clear Selection"
          >
            <span>Cancel</span>
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
            <span>Paste</span>
          </button>
          
          {#if selectedStrokes.length > 0}
            <div class="h-px bg-outline-variant/30 my-1"></div>
            <button 
              onclick={() => { copySelected(); contextMenu = null; }}
              class="w-full text-left px-4 py-2 hover:bg-primary/10 hover:text-primary flex items-center gap-2 cursor-pointer font-semibold border-0 bg-transparent"
            >
              <span class="material-symbols-outlined text-[16px]">content_copy</span>
              <span>Copy</span>
            </button>
            <button 
              onclick={() => { deleteSelected(); contextMenu = null; }}
              class="w-full text-left px-4 py-2 hover:bg-error/10 hover:text-error flex items-center gap-2 cursor-pointer font-semibold border-0 bg-transparent"
            >
              <span class="material-symbols-outlined text-[16px]">delete</span>
              <span>Delete</span>
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
        {redoStack}
        {handleUndo}
        {handleRedo}
      />

      <!-- AI Grading / Critique Overlay -->
      <CritiqueOverlay
        bind:showCritiqueBanner
        {isChecking}
        {feedbackText}
        {feedbackScore}
      />

      <!-- Eraser Circle Cursor Overlay -->
      {#if (activeTool === 'eraser' || isPointerEraser) && hoverPos}
        <div 
          class="absolute pointer-events-none border border-black/50 rounded-full bg-white/20 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_1.5px_rgba(255,255,255,0.7)] z-40"
          style="left: {hoverPos.x}px; top: {hoverPos.y}px; width: {eraserScreenDiameter}px; height: {eraserScreenDiameter}px;"
        ></div>
      {/if}

    </section>
  </div>
</div>

<!-- Custom Background Creator Modal Popup -->
<CustomBgModal
  bind:isCustomBgModalOpen
  bind:activeBg
/>

<!-- Canvas Settings Modal Popup -->
{#if store.canvasSettingsOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in select-none">
    <button type="button" aria-label="Close Canvas Settings" class="absolute inset-0 bg-transparent border-0 cursor-default p-0 m-0 w-full h-full focus:outline-none" onclick={() => store.canvasSettingsOpen = false}></button>
    <div class="bg-surface border border-outline-variant rounded-xl p-6 w-96 shadow-2xl flex flex-col gap-5 z-10 relative">
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
                        `Are you sure you want to delete the background template "${customBg.name}"?`,
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
          onclick={() => { isCustomBgModalOpen = true; }}
          class="mt-2 w-full py-2 border border-dashed border-primary/50 text-primary hover:bg-primary/10 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none bg-transparent"
        >
          <span class="material-symbols-outlined text-base">add_box</span>
          <span>Add Custom Background</span>
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

      <!-- Actions -->
      <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-4 mt-1">
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
