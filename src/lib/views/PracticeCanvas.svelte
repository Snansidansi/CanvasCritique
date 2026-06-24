<script>
  import { store } from '../state/store.svelte';
  import { onMount, tick } from 'svelte';

  // Active task details from store
  let task = $derived(store.activeTask || {
    name: 'Practice Canvas',
    instructions: 'Use the drawing tools to practice your calligraphy strokes.',
    solution: 'Match the stroke templates and slant guides.',
    category: 'Practice'
  });

  // Toggles and options
  let showTask = $state(true);
  let showSolution = $state(false);
  let activeBg = $state('grid'); // 'grid' | 'lines' | 'blank' | custom template ID
  let bgOpacity = $state(15); // Background template opacity range 1-100
  let customBgUrl = $state(null);
  
  // Resizable left panel splitter state
  let splitWidth = $state(400); // Default instructions panel width
  let isDraggingSplitter = $state(false);
  let startX = 0;
  let startWidth = 0;

  // Background dropdown and Custom Upload Modal states
  let bgDropdownOpen = $state(false);
  let isCustomBgModalOpen = $state(false);
  let newBgName = $state('');
  let newBgFile = $state(null);
  let newBgIconFile = $state(null);
  let useBgAsIcon = $state(true);

  // Brush configuration
  let strokeColor = $state('#000000');
  let brushWidth = $state(2);
  let activeTool = $state('pen'); // 'pen' | 'eraser' | 'pan'

  let cursorClass = $derived.by(() => {
    if (activeTool === 'pan') {
      return isPanning ? 'cursor-grabbing' : 'cursor-grab';
    }
    if (activeTool === 'eraser') {
      return 'cursor-cell';
    }
    return 'cursor-crosshair';
  });

  // AI feedback overlay states
  let isChecking = $state(false);
  let feedbackText = $state('');
  let feedbackScore = $state(null);
  let showFeedback = $state(false);
  let hasCheckedWork = $state(false);
  let feedbackMarkers = $state([]);
  let activeTooltipMarker = $state(null);

  // Canvas mode derived from store settings
  let canvasMode = $derived(store.settings.canvasMode);

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
  let ctx = null;

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

  // Dynamic background mapping
  let currentBgObject = $derived(
    store.customBackgrounds.find(bg => bg.id === activeBg)
  );
  let currentBgUrl = $derived(
    activeBg === 'grid' || activeBg === 'lines' || activeBg === 'blank'
      ? null
      : (currentBgObject ? currentBgObject.url : customBgUrl)
  );

  let activeLeftPanels = $derived([
    showTask && { id: 'task', title: `${task.name} Instructions`, content: task.instructions },
    showSolution && { id: 'solution', title: 'Evaluation Goal / Solution', content: task.solution },
    showFeedback && hasCheckedWork && { id: 'feedback', title: 'AI Critique & Feedback', isFeedback: true }
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
    const historyLen = strokeHistory.length;
    const activeStrokeLen = currentStroke.length;
    const scale = zoomScale;
    const bgImg = currentBgImage;

    if (ctx && canvasElement) {
      redraw();
    }
  });

  // Watch canvasMode to reset page/panning state
  $effect(() => {
    const mode = canvasMode;
    activeTooltipMarker = null;
    isPanning = false;
    isDrawing = false;
    currentStroke = [];
    zoomScale = 1;
    panOffset = { x: 0, y: 0 };
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
        x: screenX,
        y: screenY
      };
    }
  }

  function handleMouseDown(e) {
    if (!ctx || !canvasElement) return;
    
    // Check if middle click, right click, or Hand tool
    const isPanAction = canvasMode === 'infinite' && (e.button === 1 || e.button === 2 || activeTool === 'pan');
    
    if (isPanAction) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panBaseOffset = { ...panOffset };
      e.preventDefault();
      return;
    }
    
    // Only allow drawing on left-click
    if (e.button !== 0) return;
    
    isDrawing = true;
    const pt = getCoords(e);
    currentStroke = [pt];
  }

  function handleMouseMove(e) {
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
    
    if (!isDrawing) return;
    
    const pt = getCoords(e);
    currentStroke.push(pt);
  }

  function handleMouseUp() {
    if (isPanning) {
      isPanning = false;
      return;
    }
    
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentStroke.length > 0) {
      const newStroke = {
        color: activeTool === 'eraser' ? '#FFFFFF' : strokeColor,
        width: activeTool === 'eraser' ? 24 : brushWidth,
        points: [...currentStroke]
      };
      
      if (canvasMode === 'a4') {
        pages[activePageIndex].strokeHistory.push(newStroke);
        pages[activePageIndex].redoStack = [];
      } else {
        infiniteStrokes.push(newStroke);
        infiniteRedo = [];
      }
    }
    currentStroke = [];
  }

  function handleMouseLeave() {
    if (isDrawing) {
      handleMouseUp();
    }
    if (isPanning) {
      isPanning = false;
    }
  }

  function handleWheel(e) {
    if (!canvasElement) return;
    
    if (e.ctrlKey) {
      // Zoom action towards cursor
      e.preventDefault();
      const rect = canvasElement.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      
      const worldX = (cursorX - panOffset.x) / zoomScale;
      const worldY = (cursorY - panOffset.y) / zoomScale;
      
      const zoomIntensity = 0.05;
      const delta = -e.deltaY;
      const factor = delta > 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);
      const newScale = Math.max(0.2, Math.min(4.0, zoomScale * factor));
      
      let newPanX = cursorX - worldX * newScale;
      let newPanY = cursorY - worldY * newScale;
      
      if (canvasMode === 'infinite') {
        newPanX = Math.min(0, newPanX);
        newPanY = Math.min(0, newPanY);
      }
      
      zoomScale = newScale;
      panOffset = { x: newPanX, y: newPanY };
    } else {
      // Normal scroll wheel panning on infinite canvas
      if (canvasMode === 'infinite') {
        e.preventDefault();
        let newPanX = panOffset.x - e.deltaX;
        let newPanY = panOffset.y - e.deltaY;
        
        newPanX = Math.min(0, newPanX);
        newPanY = Math.min(0, newPanY);
        
        panOffset = { x: newPanX, y: newPanY };
      }
    }
  }

  function drawStroke(stroke) {
    if (stroke.points.length === 0) return;
    
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawGuidelinesInWorld(ctxTarget, xStart, yStart, wVisible, hVisible) {
    ctxTarget.save();
    ctxTarget.globalAlpha = bgOpacity / 100;
    
    const lineSpacing = 32;
    const colSpacing = 32;
    const startY = Math.ceil(yStart / lineSpacing) * lineSpacing;
    const endY = yStart + hVisible;
    
    if (activeBg === 'lines') {
      ctxTarget.strokeStyle = '#000000';
      ctxTarget.lineWidth = 1;
      for (let y = startY; y <= endY; y += lineSpacing) {
        ctxTarget.beginPath();
        ctxTarget.moveTo(xStart, y);
        ctxTarget.lineTo(xStart + wVisible, y);
        ctxTarget.stroke();
      }
    } else if (activeBg === 'grid') {
      // Draw regular non-staggered dot grid
      const startI = Math.floor(xStart / colSpacing);
      const endI = Math.ceil((xStart + wVisible) / colSpacing);
      
      ctxTarget.fillStyle = '#000000';
      for (let k = Math.floor(startY / lineSpacing); k <= Math.ceil(endY / lineSpacing); k++) {
        const yWorld = k * lineSpacing;
        for (let i = startI; i <= endI; i++) {
          const xWorld = i * colSpacing;
          ctxTarget.beginPath();
          ctxTarget.arc(xWorld, yWorld, 1.5, 0, 2 * Math.PI);
          ctxTarget.fill();
        }
      }
    }
    ctxTarget.restore();
  }

  function redraw() {
    if (!ctx || !canvasElement) return;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    if (canvasMode === 'a4') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    
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
      
      drawGuidelinesInWorld(ctx, xStart, yStart, wVisible, hVisible);
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
      drawGuidelinesInWorld(ctx, 0, 0, 800, 1130);
    }
    ctx.restore();
    
    // Draw historical strokes
    ctx.save();
    if (canvasMode === 'infinite') {
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoomScale, zoomScale);
    }
    
    for (const stroke of strokeHistory) {
      drawStroke(stroke);
    }
    
    // Draw active drawing stroke
    if (currentStroke.length > 0) {
      drawStroke({
        color: activeTool === 'eraser' ? '#FFFFFF' : strokeColor,
        width: activeTool === 'eraser' ? 24 : brushWidth,
        points: currentStroke
      });
    }
    
    ctx.restore();
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
  }

  function clearCanvas() {
    if (strokeHistory.length === 0) return;
    
    store.confirm(
      'Clear Drawing Canvas',
      'Are you sure you want to clear your drawing canvas? This will discard your current calligraphy sketch.',
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
      }
    );
  }

  // Draggable splitter panel sizing
  function startSplitDrag(e) {
    isDraggingSplitter = true;
    startX = e.clientX;
    startWidth = splitWidth;
    window.addEventListener('mousemove', handleSplitDrag);
    window.addEventListener('mouseup', stopSplitDrag);
  }

  function handleSplitDrag(e) {
    if (!isDraggingSplitter) return;
    const deltaX = e.clientX - startX;
    const newWidth = startWidth + deltaX;
    
    // Bounds constraints
    if (newWidth >= 180 && newWidth <= 800) {
      splitWidth = newWidth;
    }
  }

  function stopSplitDrag() {
    isDraggingSplitter = false;
    window.removeEventListener('mousemove', handleSplitDrag);
    window.removeEventListener('mouseup', stopSplitDrag);
  }

  // Custom Background Management Modal Handlers
  function handleBgUploadChange(e) {
    newBgFile = e.target.files[0];
  }
  function handleBgIconUploadChange(e) {
    newBgIconFile = e.target.files[0];
  }

  function handleAddCustomBg(e) {
    e.preventDefault();
    if (!newBgName.trim() || !newBgFile) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const bgUrl = event.target.result;

      if (useBgAsIcon || !newBgIconFile) {
        const bg = store.addCustomBackground(newBgName.trim(), bgUrl, bgUrl);
        activeBg = bg.id;
        isCustomBgModalOpen = false;
        resetCustomBgModal();
      } else {
        const iconReader = new FileReader();
        iconReader.onload = (iconEvent) => {
          const iconUrl = iconEvent.target.result;
          const bg = store.addCustomBackground(newBgName.trim(), bgUrl, iconUrl);
          activeBg = bg.id;
          isCustomBgModalOpen = false;
          resetCustomBgModal();
        };
        iconReader.readAsDataURL(newBgIconFile);
      }
    };
    reader.readAsDataURL(newBgFile);
  }

  function resetCustomBgModal() {
    newBgName = '';
    newBgFile = null;
    newBgIconFile = null;
    useBgAsIcon = true;
  }

  // Load custom background Image asynchronously helper for canvas pattern
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }

  // Handwriting Strokes Crop bounding box calculation
  function getStrokesBoundingBox(history) {
    if (!history || history.length === 0) return null;
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    for (const stroke of history) {
      const halfWidth = stroke.width / 2;
      for (const p of stroke.points) {
        if (p.x - halfWidth < minX) minX = p.x - halfWidth;
        if (p.y - halfWidth < minY) minY = p.y - halfWidth;
        if (p.x + halfWidth > maxX) maxX = p.x + halfWidth;
        if (p.y + halfWidth > maxY) maxY = p.y + halfWidth;
      }
    }
    
    const padding = 20;
    if (canvasMode === 'a4') {
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(800, maxX + padding);
      maxY = Math.min(1130, maxY + padding);
    } else {
      minX = minX - padding;
      minY = minY - padding;
      maxX = maxX + padding;
      maxY = maxY + padding;
    }
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    if (width <= 0 || height <= 0) return null;
    return { x: Math.round(minX), y: Math.round(minY), width: Math.round(width), height: Math.round(height) };
  }

  function parseMarkdown(md) {
    if (!md) return '';
    let html = md;
    
    // Escape HTML entities to prevent XSS
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Parse bold text **text**
    html = html.replace(/\*\*(.*?)\*\"/g, '<strong>$1</strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Parse italic *text* or _text_
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Parse list items
    html = html.replace(/^\s*-\s+(.*?)$/gm, '<li class="ml-4 list-disc my-1 text-[11px]">$1</li>');
    
    // Parse anchors with hash syntax [Link Name](#marker-id)
    html = html.replace(/\[(.*?)\]\(#(.*?)\)/g, '<a href="#$2" class="text-primary hover:underline font-bold cursor-pointer inline-flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px] inline">ads_click</span>$1</a>');
    
    // Parse headings
    html = html.replace(/^### (.*?)$/gm, '<h5 class="font-bold text-xs mt-3 mb-1 text-on-surface">$1</h5>');
    html = html.replace(/^## (.*?)$/gm, '<h4 class="font-bold text-xs mt-4 mb-1.5 text-primary border-b border-outline-variant/20 pb-0.5">$1</h4>');
    html = html.replace(/^# (.*?)$/gm, '<h3 class="font-bold text-sm mt-5 mb-2 text-primary">$1</h3>');

    return html;
  }

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
    hasCheckedWork = true;
    feedbackText = "Analyzing stroke geometries and guidelines alignment...";
    feedbackScore = null;

    try {
      // 1. Gather all non-empty pages to evaluate
      let activePagesWithIndex = [];
      if (canvasMode === 'a4') {
        activePagesWithIndex = pages
          .map((p, idx) => ({ p, originalIndex: idx }))
          .filter(item => item.p.strokeHistory.length > 0);
      } else {
        if (infiniteStrokes.length > 0) {
          activePagesWithIndex = [{ p: { strokeHistory: infiniteStrokes }, originalIndex: 0 }];
        }
      }

      if (activePagesWithIndex.length === 0) {
        throw new Error("Canvas is empty. Please draw some calligraphy before checking your work.");
      }

      // 2. Generate cropped bounding-box images for each page
      const pageImages = [];
      const pageBoxes = [];
      
      for (const item of activePagesWithIndex) {
        const box = getStrokesBoundingBox(item.p.strokeHistory);
        let base64Data;
        let widthVal = 800;
        let heightVal = 1130;
        let boxOffset = { x: 0, y: 0 };
        
        if (!box) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 800;
          tempCanvas.height = 1130;
          widthVal = tempCanvas.width;
          heightVal = tempCanvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.fillStyle = '#FFFFFF';
          tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          base64Data = tempCanvas.toDataURL('image/png').split(',')[1];
          boxOffset = { x: 0, y: 0 };
        } else {
          widthVal = box.width;
          heightVal = box.height;
          boxOffset = { x: box.x, y: box.y };
          
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = box.width;
          tempCanvas.height = box.height;
          const tempCtx = tempCanvas.getContext('2d');
          
          // Draw solid white background
          tempCtx.fillStyle = '#FFFFFF';
          tempCtx.fillRect(0, 0, box.width, box.height);
          
          tempCtx.save();
          tempCtx.translate(-box.x, -box.y);
          
          // Draw active guidelines background template offset relative to bounding box
          drawGuidelinesInWorld(tempCtx, box.x, box.y, box.width, box.height);
          
          // Draw custom background pattern image if present
          if (currentBgUrl) {
            try {
              const img = await loadImage(currentBgUrl);
              tempCtx.save();
              tempCtx.globalAlpha = bgOpacity / 100;
              const pattern = tempCtx.createPattern(img, 'repeat');
              if (pattern) {
                tempCtx.fillStyle = pattern;
                tempCtx.fillRect(box.x, box.y, box.width, box.height);
              }
              tempCtx.restore();
            } catch (err) {
              console.error('Error drawing custom background pattern on crop:', err);
            }
          }
          
          // Draw drawing stroke lines offset by bounding box coordinates
          for (const stroke of item.p.strokeHistory) {
            tempCtx.beginPath();
            tempCtx.strokeStyle = stroke.color;
            tempCtx.lineWidth = stroke.width;
            tempCtx.lineCap = 'round';
            tempCtx.lineJoin = 'round';
            
            const p0 = stroke.points[0];
            tempCtx.moveTo(p0.x, p0.y);
            for (let i = 1; i < stroke.points.length; i++) {
              tempCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            tempCtx.stroke();
          }
          tempCtx.restore();
          
          base64Data = tempCanvas.toDataURL('image/png').split(',')[1];
        }
        
        pageImages.push(base64Data);
        pageBoxes.push({ ...boxOffset, width: widthVal, height: heightVal });
      }

      const apiKey = store.apiKey;
      const provider = store.settings.apiProvider;
      const model = store.model;

      // Check if API key is provided
      if (!apiKey) {
        // Simulate grading
        setTimeout(() => {
          const mockResponse = {
            generalCritique: "📝 **AI Feedback Mockup (API key missing)**\n\nTo test real AI evaluations, please enter your Gemini API key in **Settings**.\n\n*General Critique*:\n- Excellent slant consistency! Most letters follow the 55-degree layout slant lines nicely.\n- The loop size is consistent, but watch the crossing intersection of the ascender loops.\n- Stroke thickness contrasts nicely. Nice transition to heavier pressure on downward strokes.",
            grade: 88,
            markers: []
          };

          activePagesWithIndex.forEach((item, imgIdx) => {
            const box = pageBoxes[imgIdx];
            mockResponse.markers.push(
              {
                id: `mock-1-p${item.originalIndex}`,
                pageIndex: imgIdx,
                x: Math.round(box.width * 0.25),
                y: Math.round(box.height * 0.35),
                type: 'correct',
                feedback: `Page ${item.originalIndex + 1}: Great start of the stroke! Consistent weight and smooth curve.`
              },
              {
                id: `mock-2-p${item.originalIndex}`,
                pageIndex: imgIdx,
                x: Math.round(box.width * 0.55),
                y: Math.round(box.height * 0.65),
                type: 'partial',
                feedback: `Page ${item.originalIndex + 1}: The loop crossing is slightly off here. It should cross exactly at the horizontal header line.`
              }
            );
          });

          if (mockResponse.markers.length === 0) {
            mockResponse.markers.push({
              id: 'mock-1',
              pageIndex: 0,
              x: 100,
              y: 100,
              type: 'correct',
              feedback: 'Write some strokes to see real markings.'
            });
          }

          feedbackText = mockResponse.generalCritique;
          feedbackScore = mockResponse.grade;
          feedbackMarkers = mockResponse.markers.map(m => {
            const item = activePagesWithIndex[m.pageIndex] || { originalIndex: 0 };
            const offset = pageBoxes[m.pageIndex] || { x: 0, y: 0 };
            return {
              ...m,
              pageIndex: item.originalIndex,
              canvasX: m.x + offset.x,
              canvasY: m.y + offset.y,
              boundingBoxOffset: { ...offset }
            };
          });
          isChecking = false;
        }, 2000);
        return;
      }

      // Build AI prompt
      const pageInfoPrompt = canvasMode === 'a4'
        ? `You are checking a multi-page A4 handwriting document. You have been sent a sequence of page images. The first image represents Page Index 0, the second represents Page Index 1, etc.
Your JSON response MUST specify the 'pageIndex' for each marker to identify which page image it is located on (0-based index corresponding to the image sequence).`
        : `Examine the single infinite canvas screenshot. The image represents Page Index 0.`;

      const prompt = `You are a strict but encouraging penmanship teacher. Analyze the calligraphy drawing canvas screenshots.
The student is practicing: "${task.name}".
${store.settings.sendTaskMedia ? `Instructions given: "${task.instructions}".` : ''}
${store.settings.sendSolutionMedia ? `Expected Solution: "${task.solution}".` : ''}

${pageInfoPrompt}

Examine:
1. Slant lines consistency (normally 55 degrees).
2. Stroke smoothness and hand shakiness.
3. Ascent and descent line crossings.
4. Spacing between letters.

Each image's bounding box dimensions are provided. You must return a JSON object with the following schema:
{
  "generalCritique": "Markdown formatted string containing your overall critique. Keep it brief and constructive.",
  "grade": number (0-100),
  "markers": [
    {
      "pageIndex": number (0-based index of the image in the sent sequence, e.g. 0 for the first image, 1 for the second, etc. Default to 0 if only one image),
      "x": number (X coordinate on the cropped page image in pixels),
      "y": number (Y coordinate on the cropped page image in pixels),
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Brief feedback specific to this location.",
      "underlinePoints": [ // Optional. Only provide if type is "incorrect" or "partial" and you want to draw a red underline highlight.
        {"x": number, "y": number}, ... (a list of coordinate points on the image in pixels to draw a line connecting them)
      ]
    }
  ]
}

Return ONLY this JSON object. Do not include any other conversational text.`;

      let response;
      if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  ...pageImages.map(imgData => ({
                    inlineData: {
                      mimeType: "image/png",
                      data: imgData
                    }
                  }))
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });
      } else {
        // OpenRouter Vision request
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        const requestBody = {
          model: model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                ...pageImages.map(imgData => ({
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${imgData}` }
                }))
              ]
            }
          ]
        };
        const selectedProviders = store.settings.openRouterProvider || [];
        if (selectedProviders.length > 0) {
          requestBody.provider = {
            order: selectedProviders
          };
        }
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });
      }

      if (!response.ok) {
        throw new Error(`API returned error status: ${response.status}`);
      }

      const resData = await response.json();
      
      let textResult = '';
      if (provider === 'gemini') {
        textResult = resData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';
      } else {
        textResult = resData.choices?.[0]?.message?.content || 'No response from AI.';
      }

      // Parse JSON from textResult
      let parsed;
      try {
        let cleanText = textResult.trim();
        if (cleanText.startsWith('```json')) {
          cleanText = cleanText.substring(7);
        } else if (cleanText.startsWith('```')) {
          cleanText = cleanText.substring(3);
        }
        if (cleanText.endsWith('```')) {
          cleanText = cleanText.substring(0, cleanText.length - 3);
        }
        cleanText = cleanText.trim();
        parsed = JSON.parse(cleanText);
      } catch (jsonErr) {
        console.error('Failed to parse JSON response, falling back to markdown wrap:', jsonErr);
        parsed = {
          generalCritique: textResult,
          grade: 75,
          markers: []
        };
      }

      feedbackText = parsed.generalCritique || 'No written critique provided.';
      feedbackScore = typeof parsed.grade === 'number' ? parsed.grade : 75;
      
      const rawMarkers = parsed.markers || [];
      feedbackMarkers = rawMarkers.map((m, index) => {
        const pageIdx = typeof m.pageIndex === 'number' ? m.pageIndex : 0;
        const mappedItem = activePagesWithIndex[pageIdx] || { originalIndex: 0 };
        const offset = pageBoxes[pageIdx] || { x: 0, y: 0 };
        return {
          id: `marker-${Date.now()}-${index}`,
          x: m.x,
          y: m.y,
          pageIndex: mappedItem.originalIndex,
          canvasX: m.x + offset.x,
          canvasY: m.y + offset.y,
          type: m.type || 'partial',
          feedback: m.feedback || '',
          underlinePoints: m.underlinePoints || null,
          boundingBoxOffset: { ...offset }
        };
      });

    } catch (err) {
      feedbackText = `❌ **Error evaluating work:**\n\n${err.message}\n\nPlease double check your settings, model selections, and connection details.`;
      feedbackScore = 0;
      feedbackMarkers = [];
    } finally {
      isChecking = false;
    }
  }

  function handleBack() {
    store.setView('project-detail');
  }
</script>

<!-- Integrated ScribeFlow Toolbar & Top Header -->
<div class="flex-grow flex flex-col min-w-0 h-full overflow-hidden">
  
  <header class="bg-surface border-b border-outline-variant flex items-center justify-between w-full px-6 py-3 shrink-0 z-20 select-none gap-4">
    <!-- Left: Back link and Title -->
    <div class="flex items-center gap-3 min-w-0 shrink-0">
      <button 
        onclick={handleBack}
        class="material-symbols-outlined text-primary hover:bg-surface-container-high p-1.5 rounded-lg cursor-pointer focus:outline-none flex items-center justify-center"
        title="Back to Project"
      >
        arrow_back
      </button>
      <h1 class="font-bold text-base text-primary truncate max-w-[200px]">{task.name}</h1>
    </div>

    <!-- Center: Premium Practice Controls Toolbar -->
    <div class="flex items-center gap-4 text-xs font-semibold text-on-surface-variant flex-wrap justify-center">
      
      <!-- Background Selection Autocomplete -->
      <div class="relative">
        <button 
          onclick={() => bgDropdownOpen = !bgDropdownOpen}
          class="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-outline-variant rounded-lg bg-surface hover:bg-surface-container cursor-pointer focus:outline-none"
        >
          {#if activeBg === 'grid'}
            <span class="material-symbols-outlined text-base">apps</span>
          {:else if activeBg === 'lines'}
            <span class="material-symbols-outlined text-base">reorder</span>
          {:else if activeBg === 'blank'}
            <span class="material-symbols-outlined text-base">check_box_outline_blank</span>
          {:else if currentBgObject && currentBgObject.icon && currentBgObject.icon.startsWith('data:image/')}
            <img src={currentBgObject.icon} class="w-4 h-4 object-contain rounded" alt="" />
          {:else}
            <span class="material-symbols-outlined text-base">image</span>
          {/if}
          <span>Bg: {
            activeBg === 'grid' ? 'Dots' :
            activeBg === 'lines' ? 'Lines' :
            activeBg === 'blank' ? 'Blank' :
            (currentBgObject ? currentBgObject.name : 'Custom')
          }</span>
          <span class="material-symbols-outlined text-xs">expand_more</span>
        </button>

        {#if bgDropdownOpen}
          <!-- Invisible Click-Away overlay -->
          <button type="button" class="fixed inset-0 z-40 bg-transparent cursor-default border-0 p-0 m-0 w-full h-full focus:outline-none" onclick={() => bgDropdownOpen = false}></button>
          
          <!-- Dropdown Options Box -->
          <div class="absolute top-[calc(100%+4px)] left-0 bg-surface-container-high border border-outline-variant rounded-lg shadow-lg z-50 py-1 min-w-[200px] max-h-60 overflow-y-auto custom-scrollbar">
            <button 
              onclick={() => { activeBg = 'grid'; bgDropdownOpen = false; }}
              class="w-full text-left px-3 py-2 text-xs hover:bg-primary/10 hover:text-primary flex items-center gap-2 cursor-pointer {activeBg === 'grid' ? 'bg-primary/5 text-primary font-bold' : 'text-on-surface'}"
            >
              <span class="material-symbols-outlined text-base">apps</span>
              Dots
            </button>
            <button 
              onclick={() => { activeBg = 'lines'; bgDropdownOpen = false; }}
              class="w-full text-left px-3 py-2 text-xs hover:bg-primary/10 hover:text-primary flex items-center gap-2 cursor-pointer {activeBg === 'lines' ? 'bg-primary/5 text-primary font-bold' : 'text-on-surface'}"
            >
              <span class="material-symbols-outlined text-base">reorder</span>
              Ruled Lines
            </button>
            <button 
              onclick={() => { activeBg = 'blank'; bgDropdownOpen = false; }}
              class="w-full text-left px-3 py-2 text-xs hover:bg-primary/10 hover:text-primary flex items-center gap-2 cursor-pointer {activeBg === 'blank' ? 'bg-primary/5 text-primary font-bold' : 'text-on-surface'}"
            >
              <span class="material-symbols-outlined text-base">check_box_outline_blank</span>
              Blank Paper
            </button>

            <!-- Render Uploaded Templates List -->
            {#if store.customBackgrounds.length > 0}
              <div class="border-t border-outline-variant/30 my-1"></div>
              {#each store.customBackgrounds as customBg}
                <div class="flex items-center justify-between hover:bg-primary/10 hover:text-primary group px-1">
                  <button 
                    onclick={() => { activeBg = customBg.id; bgDropdownOpen = false; }}
                    class="flex-grow text-left px-2 py-2 text-xs flex items-center gap-2 cursor-pointer {activeBg === customBg.id ? 'bg-primary/5 text-primary font-bold' : 'text-on-surface'}"
                  >
                    {#if customBg.icon && customBg.icon.startsWith('data:image/')}
                      <img src={customBg.icon} class="w-4 h-4 object-contain rounded" alt="" />
                    {:else}
                      <span class="material-symbols-outlined text-base">image</span>
                    {/if}
                    <span class="truncate max-w-[120px]">{customBg.name}</span>
                  </button>
                  <button 
                    onclick={() => {
                      bgDropdownOpen = false;
                      store.confirm(
                        'Delete Background Template',
                        `Are you sure you want to delete the background template "${customBg.name}"?`,
                        () => {
                          if (activeBg === customBg.id) activeBg = 'grid';
                          store.deleteCustomBackground(customBg.id);
                        }
                      );
                    }}
                    class="p-1.5 text-outline hover:text-error opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none cursor-pointer flex items-center justify-center"
                    title="Delete Background"
                  >
                    <span class="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              {/each}
            {/if}

            <div class="border-t border-outline-variant/30 my-1"></div>
            <button 
              onclick={() => { isCustomBgModalOpen = true; bgDropdownOpen = false; }}
              class="w-full text-left px-3 py-2 text-xs hover:bg-primary/10 hover:text-primary flex items-center gap-2 cursor-pointer text-primary font-semibold"
            >
              <span class="material-symbols-outlined text-base">add_box</span>
              Add Custom Background...
            </button>
          </div>
        {/if}
      </div>

      <!-- Template Background Opacity Slider -->
      {#if activeBg !== 'blank'}
        <div class="flex items-center gap-2 border-r border-outline-variant/30 pr-4">
          <span class="text-[10px] text-outline">Opacity</span>
          <input 
            type="range" 
            min="1" 
            max="100" 
            bind:value={bgOpacity}
            class="w-16 h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <span class="text-[10px] text-on-surface min-w-[24px]">{bgOpacity}%</span>
        </div>
      {/if}

      <!-- Zoom Controls -->
      <div class="flex items-center gap-1 border-r border-outline-variant/30 pr-4">
        <button 
          onclick={() => {
            zoomScale = Math.max(0.2, zoomScale - 0.1);
            if (canvasMode === 'infinite') {
              panOffset = {
                x: Math.min(0, panOffset.x),
                y: Math.min(0, panOffset.y)
              };
            }
          }}
          disabled={zoomScale <= 0.2}
          class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer flex items-center justify-center"
          title="Zoom Out"
        >
          <span class="material-symbols-outlined text-base">zoom_out</span>
        </button>
        
        <button
          onclick={() => {
            zoomScale = 1;
            panOffset = { x: 0, y: 0 };
          }}
          class="px-2 py-1 text-[10px] text-on-surface hover:bg-surface-container-high rounded font-semibold select-none cursor-pointer transition-colors"
          title="Reset Zoom & Pan"
        >
          {Math.round(zoomScale * 100)}%
        </button>
        
        <button 
          onclick={() => {
            zoomScale = Math.min(4.0, zoomScale + 0.1);
          }}
          disabled={zoomScale >= 4.0}
          class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer flex items-center justify-center"
          title="Zoom In"
        >
          <span class="material-symbols-outlined text-base">zoom_in</span>
        </button>
      </div>
 
      <!-- A4 Page Switcher (Only in A4 Mode) -->
      {#if canvasMode === 'a4'}
        <div class="flex items-center gap-2 border-r border-outline-variant/30 pr-4">
          <button 
            onclick={() => {
              if (activePageIndex > 0) {
                activePageIndex--;
                activeTooltipMarker = null;
              }
            }}
            disabled={activePageIndex === 0}
            class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer flex items-center justify-center"
            title="Previous Page"
          >
            <span class="material-symbols-outlined text-base">navigate_before</span>
          </button>
          
          <span class="text-xs text-on-surface-variant font-semibold select-none">
            Page {activePageIndex + 1} of {pages.length}
          </span>
          
          <button 
            onclick={() => {
              if (activePageIndex < pages.length - 1) {
                activePageIndex++;
                activeTooltipMarker = null;
              }
            }}
            disabled={activePageIndex === pages.length - 1}
            class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer flex items-center justify-center"
            title="Next Page"
          >
            <span class="material-symbols-outlined text-base">navigate_next</span>
          </button>
          
          <button 
            onclick={() => {
              pages.push({
                id: 'page-' + Date.now(),
                strokeHistory: [],
                redoStack: []
              });
              activePageIndex = pages.length - 1;
              activeTooltipMarker = null;
            }}
            class="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors focus:outline-none cursor-pointer flex items-center justify-center"
            title="Add Page"
          >
            <span class="material-symbols-outlined text-base">note_add</span>
          </button>

          {#if pages.length > 1}
            <button 
              onclick={() => {
                store.confirm(
                  'Delete Page',
                  `Are you sure you want to delete Page ${activePageIndex + 1}? All drawings on this page will be permanently lost.`,
                  () => {
                    pages.splice(activePageIndex, 1);
                    if (activePageIndex >= pages.length) {
                      activePageIndex = pages.length - 1;
                    }
                    activeTooltipMarker = null;
                  }
                );
              }}
              class="p-1.5 text-error hover:bg-error/10 rounded-lg transition-colors focus:outline-none cursor-pointer flex items-center justify-center"
              title="Delete Page"
            >
              <span class="material-symbols-outlined text-base">delete</span>
            </button>
          {/if}
        </div>
      {/if}

      <!-- Split layout visibility toggles -->
      <div class="flex items-center gap-1">
        <button 
          onclick={() => showTask = !showTask}
          class="px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none cursor-pointer transition-all flex items-center gap-1
                 {showTask ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}"
          title="Toggle Instructions"
        >
          <span class="material-symbols-outlined text-base">menu_book</span>
          <span>Task</span>
        </button>

        <button 
          onclick={() => showSolution = !showSolution}
          class="px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none cursor-pointer transition-all flex items-center gap-1
                 {showSolution ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}"
          title="Toggle Solution Goal"
        >
          <span class="material-symbols-outlined text-base">visibility</span>
          <span>Solution</span>
        </button>

        {#if hasCheckedWork}
          <button 
            onclick={() => showFeedback = !showFeedback}
            class="px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none cursor-pointer transition-all flex items-center gap-1
                   {showFeedback ? 'border-primary bg-primary/10 text-primary animate-pulse' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}"
            title="Toggle AI Critique"
          >
            <span class="material-symbols-outlined text-base">neurology</span>
            <span>Critique</span>
          </button>
        {/if}
      </div>

      <!-- Divider element and Clear button -->
      <div class="h-5 w-px bg-outline-variant/30 hidden sm:block"></div>
      <button 
        onclick={clearCanvas}
        class="flex items-center gap-1 border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer focus:outline-none"
        title="Clear Canvas"
      >
        <span class="material-symbols-outlined text-base">delete_sweep</span>
        <span>Clear</span>
      </button>
    </div>

    <!-- Right side: Undo / Redo & Check Work Actions -->
    <div class="flex items-center gap-3 shrink-0">
      <div class="flex items-center gap-1 border-r border-outline-variant/30 pr-3">
        <button 
          onclick={handleUndo} 
          disabled={strokeHistory.length === 0}
          class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer flex items-center justify-center"
          title="Undo"
        >
          <span class="material-symbols-outlined text-base">undo</span>
        </button>
        <button 
          onclick={handleRedo} 
          disabled={redoStack.length === 0}
          class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer flex items-center justify-center"
          title="Redo"
        >
          <span class="material-symbols-outlined text-base">redo</span>
        </button>
      </div>

      <button 
        onclick={checkWork}
        class="bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold hover:shadow-md active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none"
      >
        <span class="material-symbols-outlined text-[16px]">neurology</span>
        <span>Check Work</span>
      </button>
    </div>
  </header>

  <!-- Interactive practice screen split layout -->
  <div class="flex-grow flex overflow-hidden relative w-full">
    
    <!-- Left side: dynamic split screen task, solution, and critique -->
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
                  Score: {feedbackScore}
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
                <div class="text-xs text-on-surface-variant leading-relaxed prose prose-sm dark:prose-invert">
                  {@html parseMarkdown(feedbackText)}
                </div>
              {/if}
            {:else}
              <div class="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line">
                {panel.content}
              </div>
            {/if}
          </div>
        {/each}
      </section>

      <!-- Draggable Split Separator -->
      <div 
        role="separator"
        aria-valuenow={splitWidth}
        class="w-1.5 hover:w-2 bg-outline-variant/60 hover:bg-primary cursor-col-resize select-none h-full z-20 transition-all active:bg-primary shrink-0"
        onmousedown={startSplitDrag}
      ></div>
    {/if}

    <!-- Right side: Drawing Workspace (Infinite or A4 Centered) -->
    <section 
      bind:this={canvasContainer} 
      bind:clientWidth={containerWidth}
      bind:clientHeight={containerHeight}
      class="flex-grow relative h-full w-full select-none
             {canvasMode === 'infinite' ? 'overflow-hidden bg-surface-container-lowest cursor-crosshair' : 'overflow-auto p-8 bg-surface-container-lowest flex justify-center items-start custom-scrollbar'}"
    >
      {#if canvasMode === 'infinite'}
        <!-- Infinite Canvas Wrapper -->
        <div class="relative w-full h-full">
          <canvas 
            bind:this={canvasElement}
            width={canvasWidth}
            height={canvasHeight}
            onmousedown={handleMouseDown}
            onmousemove={handleMouseMove}
            onmouseup={handleMouseUp}
            onmouseleave={handleMouseLeave}
            onwheel={handleWheel}
            oncontextmenu={e => e.preventDefault()}
            class="absolute inset-0 w-full h-full z-10 bg-transparent {cursorClass}"
          ></canvas>

          <!-- SVG Overlays for Markers (Infinite Mode) -->
          {#if hasCheckedWork && !isChecking}
            <svg class="absolute inset-0 pointer-events-none z-20 w-full h-full">
              {#each feedbackMarkers as marker}
                {#if marker.underlinePoints && marker.underlinePoints.length > 1}
                  <path
                    d={marker.underlinePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x + marker.boundingBoxOffset.x) * zoomScale + panOffset.x} ${(p.y + marker.boundingBoxOffset.y) * zoomScale + panOffset.y}`).join(' ')}
                    stroke="rgba(239, 68, 68, 0.4)"
                    stroke-width="8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
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
                class="absolute z-30 w-8 h-8 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full shadow-lg border cursor-pointer hover:scale-110 active:scale-95 transition-all focus:outline-none
                       {marker.type === 'correct' ? 'bg-emerald-500 text-white border-emerald-400' : 
                        marker.type === 'incorrect' ? 'bg-red-500 text-white border-red-400' : 
                        'bg-amber-500 text-white border-amber-400'}"
                style="left: {(marker.canvasX) * zoomScale + panOffset.x}px; top: {(marker.canvasY) * zoomScale + panOffset.y}px;"
                title="Click for feedback"
              >
                <span class="material-symbols-outlined text-[18px]">
                  {marker.type === 'correct' ? 'check' : 
                   marker.type === 'incorrect' ? 'close' : 
                   'question_mark'}
                </span>
              </button>
            {/each}

            <!-- Tooltip Overlay -->
            {#if activeTooltipMarker}
              <button 
                type="button" 
                class="absolute inset-0 bg-transparent z-40 cursor-default border-0 p-0 m-0 w-full h-full focus:outline-none" 
                onclick={() => activeTooltipMarker = null}
                aria-label="Dismiss feedback"
              ></button>

              <div 
                class="absolute z-50 bg-surface-container-high border border-outline-variant/60 rounded-xl p-4 w-72 shadow-2xl flex flex-col gap-2 -translate-x-1/2 mt-6 animate-fade-in"
                style="left: {(activeTooltipMarker.canvasX) * zoomScale + panOffset.x}px; top: {(activeTooltipMarker.canvasY) * zoomScale + panOffset.y}px;"
              >
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-base 
                    {activeTooltipMarker.type === 'correct' ? 'text-emerald-500' : 
                     activeTooltipMarker.type === 'incorrect' ? 'text-red-500' : 
                     'text-amber-500'}">
                    {activeTooltipMarker.type === 'correct' ? 'check_circle' : 
                     activeTooltipMarker.type === 'incorrect' ? 'cancel' : 
                     'warning'}
                  </span>
                  <span class="text-xs font-bold uppercase tracking-wider text-on-surface">
                    {activeTooltipMarker.type === 'correct' ? 'Correct Stroke' : 
                     activeTooltipMarker.type === 'incorrect' ? 'Needs Correction' : 
                     'Slight Imprecision'}
                  </span>
                  <button 
                    onclick={() => activeTooltipMarker = null} 
                    class="ml-auto material-symbols-outlined text-[16px] text-on-surface-variant hover:text-on-surface focus:outline-none cursor-pointer border-0 bg-transparent p-0 flex items-center justify-center"
                  >
                    close
                  </button>
                </div>
                <p class="text-xs text-on-surface-variant leading-relaxed">
                  {activeTooltipMarker.feedback}
                </p>
              </div>
            {/if}
          {/if}
        </div>
      {:else}
        <!-- A4 Page Card Layout -->
        <div class="relative bg-white shadow-xl border border-outline-variant rounded-sm shrink-0" style="width: 800px; height: 1130px;">
          <canvas 
            bind:this={canvasElement}
            width="800"
            height="1130"
            onmousedown={handleMouseDown}
            onmousemove={handleMouseMove}
            onmouseup={handleMouseUp}
            onmouseleave={handleMouseLeave}
            class="absolute inset-0 w-full h-full z-10 bg-transparent {cursorClass}"
          ></canvas>

          <!-- SVG Overlays for Markers (A4 Page Mode, filtered by current page index) -->
          {#if hasCheckedWork && !isChecking}
            <svg class="absolute inset-0 pointer-events-none z-20 w-full h-full">
              {#each feedbackMarkers.filter(m => m.pageIndex === activePageIndex) as marker}
                {#if marker.underlinePoints && marker.underlinePoints.length > 1}
                  <path
                    d={marker.underlinePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x + marker.boundingBoxOffset.x} ${p.y + marker.boundingBoxOffset.y}`).join(' ')}
                    stroke="rgba(239, 68, 68, 0.4)"
                    stroke-width="8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
                  />
                {/if}
                {#if marker.box2d && marker.box2d.length === 2}
                  {@const p1 = marker.box2d[0]}
                  {@const p2 = marker.box2d[1]}
                  {@const x = Math.min(p1.x, p2.x) + marker.boundingBoxOffset.x}
                  {@const y = Math.min(p1.y, p2.y) + marker.boundingBoxOffset.y}
                  {@const w = Math.abs(p2.x - p1.x)}
                  {@const h = Math.abs(p2.y - p1.y)}
                  <rect
                    {x}
                    {y}
                    width={w}
                    height={h}
                    stroke="rgba(239, 68, 68, 0.5)"
                    stroke-width="2"
                    stroke-dasharray="4,4"
                    fill="rgba(239, 68, 68, 0.1)"
                    rx="4"
                  />
                {/if}
              {/each}
            </svg>

            <!-- Clickable Marker Buttons (A4 Page Mode) -->
            {#each feedbackMarkers.filter(m => m.pageIndex === activePageIndex) as marker (marker.id)}
              <button
                type="button"
                onclick={() => activeTooltipMarker = marker}
                class="absolute z-30 w-8 h-8 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full shadow-lg border cursor-pointer hover:scale-110 active:scale-95 transition-all focus:outline-none
                       {marker.type === 'correct' ? 'bg-emerald-500 text-white border-emerald-400' : 
                        marker.type === 'incorrect' ? 'bg-red-500 text-white border-red-400' : 
                        'bg-amber-500 text-white border-amber-400'}"
                style="left: {marker.canvasX}px; top: {marker.canvasY}px;"
                title="Click for feedback"
              >
                <span class="material-symbols-outlined text-[18px]">
                  {marker.type === 'correct' ? 'check' : 
                   marker.type === 'incorrect' ? 'close' : 
                   'question_mark'}
                </span>
              </button>
            {/each}

            <!-- Tooltip Overlay -->
            {#if activeTooltipMarker && activeTooltipMarker.pageIndex === activePageIndex}
              <button 
                type="button" 
                class="absolute inset-0 bg-transparent z-40 cursor-default border-0 p-0 m-0 w-full h-full focus:outline-none" 
                onclick={() => activeTooltipMarker = null}
                aria-label="Dismiss feedback"
              ></button>

              <div 
                class="absolute z-50 bg-surface-container-high border border-outline-variant/60 rounded-xl p-4 w-72 shadow-2xl flex flex-col gap-2 -translate-x-1/2 mt-6 animate-fade-in"
                style="left: {activeTooltipMarker.canvasX}px; top: {activeTooltipMarker.canvasY}px;"
              >
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-base 
                    {activeTooltipMarker.type === 'correct' ? 'text-emerald-500' : 
                     activeTooltipMarker.type === 'incorrect' ? 'text-red-500' : 
                     'text-amber-500'}">
                    {activeTooltipMarker.type === 'correct' ? 'check_circle' : 
                     activeTooltipMarker.type === 'incorrect' ? 'cancel' : 
                     'warning'}
                  </span>
                  <span class="text-xs font-bold uppercase tracking-wider text-on-surface">
                    {activeTooltipMarker.type === 'correct' ? 'Correct Stroke' : 
                     activeTooltipMarker.type === 'incorrect' ? 'Needs Correction' : 
                     'Slight Imprecision'}
                  </span>
                  <button 
                    onclick={() => activeTooltipMarker = null} 
                    class="ml-auto material-symbols-outlined text-[16px] text-on-surface-variant hover:text-on-surface focus:outline-none cursor-pointer border-0 bg-transparent p-0 flex items-center justify-center"
                  >
                    close
                  </button>
                </div>
                <p class="text-xs text-on-surface-variant leading-relaxed">
                  {activeTooltipMarker.feedback}
                </p>
              </div>
            {/if}
          {/if}
        </div>
      {/if}

      <!-- Floating Tool Palette -->
      <div class="fixed bottom-6 right-6 bg-surface-container/95 backdrop-blur-md px-5 py-2.5 rounded-full flex items-center gap-5 shadow-lg border border-outline-variant/30 transition-all hover:scale-[1.02] z-20 select-none">
        
        <!-- Color Pickers -->
        <div class="flex items-center gap-2 border-r border-outline-variant pr-4">
          {#each [
            { color: '#000000', title: 'Black' },
            { color: '#1d4ed8', title: 'Blue' },
            { color: '#dc2626', title: 'Red' },
            { color: '#059669', title: 'Green' }
          ] as item}
            <button 
              onclick={() => { strokeColor = item.color; activeTool = 'pen'; }}
              class="w-6 h-6 rounded-full cursor-pointer border-2 transition-transform hover:scale-110" 
              style="background-color: {item.color}; border-color: {strokeColor === item.color && activeTool === 'pen' ? '#0040e0' : 'transparent'};"
              title={item.title}
            ></button>
          {/each}
        </div>

        <!-- Tool selectors (Pen / Eraser / Hand) and Brush slider -->
        <div class="flex items-center gap-4 text-xs font-semibold">
          <button 
            onclick={() => activeTool = 'pen'}
            class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors
                   {activeTool === 'pen' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}"
          >
            <span class="material-symbols-outlined text-[20px]" data-weight={activeTool === 'pen' ? 'fill' : 'normal'}>edit</span>
            <span class="text-[9px]">Pen</span>
          </button>
          
          <button 
            onclick={() => activeTool = 'eraser'}
            class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors
                   {activeTool === 'eraser' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}"
          >
            <span class="material-symbols-outlined text-[20px]" data-weight={activeTool === 'eraser' ? 'fill' : 'normal'}>ink_eraser</span>
            <span class="text-[9px]">Eraser</span>
          </button>

          {#if canvasMode === 'infinite'}
            <button 
              onclick={() => activeTool = 'pan'}
              class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors
                     {activeTool === 'pan' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}"
              title="Pan Canvas"
            >
              <span class="material-symbols-outlined text-[20px]" data-weight={activeTool === 'pan' ? 'fill' : 'normal'}>pan_tool</span>
              <span class="text-[9px]">Hand</span>
            </button>
          {/if}
          
          <!-- Pen stroke width controller -->
          {#if activeTool === 'pen'}
            <div class="flex items-center gap-1.5 border-l border-outline-variant pl-4">
              <span class="text-[10px] text-outline">Size</span>
              <input 
                type="range" 
                min="1" 
                max="12" 
                bind:value={brushWidth} 
                class="w-16 h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary" 
              />
              <span class="text-[10px] text-on-surface min-w-3">{brushWidth}px</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- AI Grading / Critique Overlay -->
      {#if showFeedback}
        <div class="absolute top-4 right-4 bg-surface-container-high/95 backdrop-blur-md border border-outline-variant/40 rounded-xl p-5 w-80 shadow-2xl z-30 flex flex-col gap-3 max-h-[85%] overflow-y-auto custom-scrollbar transition-all">
          <div class="flex justify-between items-start">
            <span class="text-xs font-bold uppercase tracking-wider text-outline">AI Penmanship Teacher</span>
            <button 
              onclick={() => showFeedback = false}
              class="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-on-surface focus:outline-none cursor-pointer"
            >
              close
            </button>
          </div>
          
          {#if isChecking}
            <div class="flex flex-col items-center justify-center py-6 gap-3">
              <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p class="text-xs text-on-surface-variant text-center">{feedbackText}</p>
            </div>
          {:else}
            <!-- Display Score Badge -->
            {#if feedbackScore !== null}
              <div class="flex items-center gap-3 bg-primary/5 p-3 rounded-lg border border-primary/20 animate-fade-in">
                <div class="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  {feedbackScore}
                </div>
                <div>
                  <h4 class="text-xs font-bold text-primary">Critique Score</h4>
                  <p class="text-[10px] text-on-surface-variant">Based on consistency & parameters.</p>
                </div>
              </div>
            {/if}

            <!-- Critique Text -->
            <div class="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line border-t border-outline-variant/30 pt-3">
              {feedbackText}
            </div>
          {/if}
        </div>
      {/if}

    </section>
  </div>
</div>

<!-- Custom Background Creator Modal Popup -->
{#if isCustomBgModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm select-none">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-[400px] shadow-xl flex flex-col gap-4">
      <h3 class="font-bold text-base text-on-surface">Add Custom Background Template</h3>
      
      <form onsubmit={handleAddCustomBg} class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-semibold text-on-surface-variant" for="bgName">Template Name</label>
          <input 
            type="text" 
            id="bgName" 
            bind:value={newBgName} 
            placeholder="e.g., Slant 55° Ruled Guidelines"
            class="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            required
          />
        </div>
        
        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-on-surface-variant">Upload Pattern Image (repeats automatically)</span>
          <input 
            type="file" 
            accept="image/*"
            onchange={handleBgUploadChange}
            class="text-xs text-on-surface bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
            required
          />
        </div>
        
        <div class="flex items-center gap-2 mt-1">
          <input 
            type="checkbox" 
            id="useAsIcon" 
            bind:checked={useBgAsIcon}
            class="w-4 h-4 text-primary bg-surface border-outline-variant focus:ring-primary focus:outline-none rounded cursor-pointer"
          />
          <label class="text-xs text-on-surface-variant select-none cursor-pointer font-semibold" for="useAsIcon">Use pattern as option icon</label>
        </div>
        
        {#if !useBgAsIcon}
          <div class="flex flex-col gap-1 animate-fade-in">
            <span class="text-xs font-semibold text-on-surface-variant">Upload Small Icon (PNG/JPG)</span>
            <input 
              type="file" 
              accept="image/*"
              onchange={handleBgIconUploadChange}
              class="text-xs text-on-surface bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
            />
          </div>
        {/if}
        
        <div class="flex justify-end gap-3 mt-2">
          <button 
            type="button" 
            onclick={() => { isCustomBgModalOpen = false; resetCustomBgModal(); }}
            class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="submit"
            class="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer"
          >
            Add Template
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
