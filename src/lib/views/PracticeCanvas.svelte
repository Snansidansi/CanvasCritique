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
  let bgOpacity = $state(45); // Background template opacity range 1-100
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
  let activeTool = $state('pen'); // 'pen' | 'eraser'

  // AI feedback overlay states
  let isChecking = $state(false);
  let feedbackText = $state('');
  let feedbackScore = $state(null);
  let showFeedback = $state(false);
  let hasCheckedWork = $state(false);

  // Canvas element references
  let canvasElement = $state(null);
  let canvasContainer = $state(null);
  let ctx = null;

  // Stroke history state
  let isDrawing = false;
  let currentStroke = [];
  let strokeHistory = $state([]);
  let redoStack = $state([]);

  // Dynamic background mapping
  let currentBgObject = $derived(
    store.customBackgrounds.find(bg => bg.id === activeBg)
  );
  let currentBgUrl = $derived(
    activeBg === 'grid' || activeBg === 'lines' || activeBg === 'blank'
      ? null
      : (currentBgObject ? currentBgObject.url : customBgUrl)
  );

  onMount(() => {
    if (canvasElement) {
      ctx = canvasElement.getContext('2d');
      redraw();
    }
  });

  function startDrawing(e) {
    if (!ctx || !canvasElement) return;
    isDrawing = true;
    
    const rect = canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    currentStroke = [{ x, y }];
  }

  function draw(e) {
    if (!isDrawing || !ctx || !canvasElement) return;
    
    const rect = canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    currentStroke.push({ x, y });
    
    // Redraw including active stroke
    redraw();
    drawStroke({
      color: activeTool === 'eraser' ? '#FFFFFF' : strokeColor,
      width: activeTool === 'eraser' ? 24 : brushWidth,
      points: currentStroke
    });
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentStroke.length > 0) {
      strokeHistory.push({
        color: activeTool === 'eraser' ? '#FFFFFF' : strokeColor,
        width: activeTool === 'eraser' ? 24 : brushWidth,
        points: currentStroke
      });
      redoStack = []; // Clear redo stack on new action
    }
    currentStroke = [];
  }

  function drawStroke(stroke) {
    if (stroke.points.length === 0) return;
    
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
  }

  function redraw() {
    if (!ctx || !canvasElement) return;
    ctx.clearRect(0, 0, 5000, 5000);
    
    for (const stroke of strokeHistory) {
      drawStroke(stroke);
    }
  }

  function handleUndo() {
    if (strokeHistory.length > 0) {
      const last = strokeHistory.pop();
      redoStack.push(last);
      redraw();
    }
  }

  function handleRedo() {
    if (redoStack.length > 0) {
      const next = redoStack.pop();
      strokeHistory.push(next);
      redraw();
    }
  }

  function clearCanvas() {
    if (strokeHistory.length === 0) return;
    
    const isConfirmed = confirm("Are you sure you want to clear your drawing canvas? This will discard your current calligraphy sketch.");
    if (isConfirmed) {
      strokeHistory = [];
      redoStack = [];
      redraw();
    }
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
  function getStrokesBoundingBox() {
    if (strokeHistory.length === 0) return null;
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    for (const stroke of strokeHistory) {
      const halfWidth = stroke.width / 2;
      for (const p of stroke.points) {
        if (p.x - halfWidth < minX) minX = p.x - halfWidth;
        if (p.y - halfWidth < minY) minY = p.y - halfWidth;
        if (p.x + halfWidth > maxX) maxX = p.x + halfWidth;
        if (p.y + halfWidth > maxY) maxY = p.y + halfWidth;
      }
    }
    
    const padding = 20;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(5000, maxX + padding);
    maxY = Math.min(5000, maxY + padding);
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    if (width <= 0 || height <= 0) return null;
    return { x: minX, y: minY, width, height };
  }

  // Multimodal AI Grading using Cropped PNG bounding box
  async function checkWork() {
    isChecking = true;
    showFeedback = true;
    hasCheckedWork = true;
    feedbackText = "Analyzing stroke geometries and guidelines alignment...";

    let base64Data;
    try {
      const box = getStrokesBoundingBox();
      if (!box) {
        // Fallback: draw empty white canvas of parent container viewport dimensions
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasContainer ? canvasContainer.clientWidth : 800;
        tempCanvas.height = canvasContainer ? canvasContainer.clientHeight : 600;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = '#FFFFFF';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        base64Data = tempCanvas.toDataURL('image/png').split(',')[1];
      } else {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = box.width;
        tempCanvas.height = box.height;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw solid white background
        tempCtx.fillStyle = '#FFFFFF';
        tempCtx.fillRect(0, 0, box.width, box.height);

        // Draw active guidelines background template offset relative to bounding box
        if (activeBg === 'lines' || activeBg === 'grid') {
          tempCtx.save();
          tempCtx.globalAlpha = bgOpacity / 100;
          
          const lineSpacing = 32;
          const startY = Math.floor(box.y / lineSpacing) * lineSpacing - box.y;
          tempCtx.strokeStyle = '#e2e8f0';
          tempCtx.lineWidth = 1;
          for (let y = startY; y < box.height; y += lineSpacing) {
            tempCtx.beginPath();
            tempCtx.moveTo(0, y);
            tempCtx.lineTo(box.width, y);
            tempCtx.stroke();
          }

          if (activeBg === 'grid') {
            tempCtx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
            const step = 40;
            const angleRad = (65 * Math.PI) / 180;
            const dx = box.height / Math.tan(angleRad);
            const startX = Math.floor((box.x - box.height) / step) * step - box.x;
            const endX = box.width + box.height;
            for (let x = startX; x < endX; x += step) {
              tempCtx.beginPath();
              tempCtx.moveTo(x, 0);
              tempCtx.lineTo(x - dx, box.height);
              tempCtx.stroke();
            }
          }
          tempCtx.restore();
        } else if (currentBgUrl) {
          try {
            const img = await loadImage(currentBgUrl);
            tempCtx.save();
            tempCtx.globalAlpha = bgOpacity / 100;
            const pattern = tempCtx.createPattern(img, 'repeat');
            if (pattern) {
              pattern.setTransform(new DOMMatrix().translate(-box.x, -box.y));
              tempCtx.fillStyle = pattern;
              tempCtx.fillRect(0, 0, box.width, box.height);
            }
            tempCtx.restore();
          } catch (err) {
            console.error('Error drawing custom background pattern on crop:', err);
          }
        }

        // Draw drawing stroke lines offset by bounding box coordinates
        for (const stroke of strokeHistory) {
          tempCtx.beginPath();
          tempCtx.strokeStyle = stroke.color;
          tempCtx.lineWidth = stroke.width;
          tempCtx.lineCap = 'round';
          tempCtx.lineJoin = 'round';

          const p0 = stroke.points[0];
          tempCtx.moveTo(p0.x - box.x, p0.y - box.y);
          for (let i = 1; i < stroke.points.length; i++) {
            tempCtx.lineTo(stroke.points[i].x - box.x, stroke.points[i].y - box.y);
          }
          tempCtx.stroke();
        }
        base64Data = tempCanvas.toDataURL('image/png').split(',')[1];
      }
    } catch (err) {
      console.error('Error generating cropped canvas base64 image:', err);
      base64Data = canvasElement.toDataURL('image/png').split(',')[1];
    }

    const apiKey = store.apiKey;
    const provider = store.settings.apiProvider;
    const model = store.model;

    // Check if API key is provided
    if (!apiKey) {
      // Simulate grading if no API key is saved (to demonstrate the feature)
      setTimeout(() => {
        feedbackText = `📝 **AI Feedback Mockup (API key missing)**\n\nTo test real AI evaluations, please enter your Gemini API key in **Settings**.\n\n*General Critique*:\n- Excellent slant consistency! Most letters follow the 55-degree layout slant lines nicely.\n- The loop size is consistent, but watch the crossing intersection of the ascender loops; they should cross exactly at the header line.\n- Stroke thickness contrasts nicely. Nice transition to heavier pressure on downward strokes.`;
        feedbackScore = 88;
        isChecking = false;
      }, 2000);
      return;
    }

    try {
      const prompt = `You are a strict but encouraging penmanship teacher. Analyze this drawing canvas screenshot.
The student is practicing: "${task.name}".
Instructions given: "${task.instructions}".
Expected Solution: "${task.solution}".

Examine:
1. Slant lines consistency (normally 55 degrees).
2. Stroke smoothness and hand shakiness.
3. Ascent and descent line crossings.
4. Spacing between letters.

Provide a constructive critique in Markdown. Keep it brief. Return a final numerical grade (0-100) inside double brackets like this: [[Grade: 85]].`;

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
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: base64Data
                    }
                  }
                ]
              }
            ]
          })
        });
      } else {
        // OpenRouter Vision request
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } }
                ]
              }
            ]
          })
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

      // Extract grade if present
      const gradeRegex = /\[\[Grade:\s*(\d+)\]\]/i;
      const match = textResult.match(gradeRegex);
      if (match) {
        feedbackScore = parseInt(match[1]);
        feedbackText = textResult.replace(gradeRegex, '').trim();
      } else {
        feedbackText = textResult;
        feedbackScore = 75; // Default score if model forgot format
      }
    } catch (err) {
      feedbackText = `❌ **Error evaluating work:**\n\n${err.message}\n\nPlease double check your settings, model selections, and connection details.`;
      feedbackScore = 0;
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
  
  <header class="bg-white border-b border-outline-variant flex items-center justify-between w-full px-6 py-3 shrink-0 z-20 select-none gap-4">
    <!-- Left: Back link and Title -->
    <div class="flex items-center gap-3 min-w-0 shrink-0">
      <button 
        onclick={handleBack}
        class="material-symbols-outlined text-primary hover:bg-surface-container-high p-1.5 rounded-lg cursor-pointer focus:outline-none"
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
          class="flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant rounded-lg bg-surface hover:bg-surface-container cursor-pointer focus:outline-none"
        >
          <span class="material-symbols-outlined text-base">wallpaper</span>
          <span>Bg: {
            activeBg === 'grid' ? 'Grid' :
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
          <div class="absolute top-[calc(100%+4px)] left-0 bg-white border border-outline-variant rounded-lg shadow-lg z-50 py-1 min-w-[200px] max-h-60 overflow-y-auto custom-scrollbar">
            <button 
              onclick={() => { activeBg = 'grid'; bgDropdownOpen = false; }}
              class="w-full text-left px-3 py-2 text-xs hover:bg-primary/10 hover:text-primary flex items-center gap-2 cursor-pointer {activeBg === 'grid' ? 'bg-primary/5 text-primary font-bold' : 'text-on-surface'}"
            >
              <span class="material-symbols-outlined text-base">grid_3x3</span>
              Grid Lines
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
                      if (confirm(`Delete background template "${customBg.name}"?`)) {
                        if (activeBg === customBg.id) activeBg = 'grid';
                        store.deleteCustomBackground(customBg.id);
                      }
                    }}
                    class="p-1.5 text-outline hover:text-error opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none cursor-pointer"
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
      <div class="h-5 w-[1px] bg-outline-variant/30 hidden sm:block"></div>
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
          class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer"
          title="Undo"
        >
          <span class="material-symbols-outlined text-base">undo</span>
        </button>
        <button 
          onclick={handleRedo} 
          disabled={redoStack.length === 0}
          class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer"
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
    
    <!-- Left side: split screen task description and solution -->
    {#if showTask || showSolution}
      <section 
        class="bg-white border-r border-outline-variant flex flex-col overflow-hidden h-full shrink-0"
        style="width: {splitWidth}px;"
      >
        {#if showTask && showSolution}
          <!-- Split Layout (50/50 horizontal) -->
          <div class="h-1/2 flex flex-col overflow-y-auto border-b border-outline-variant p-8 hide-scrollbar">
            <h2 class="text-lg font-bold text-on-surface mb-3 pb-1 border-b border-outline-variant/30">{task.name} Instructions</h2>
            <div class="space-y-4 text-xs text-on-surface-variant leading-relaxed whitespace-pre-line">
              {task.instructions}
            </div>
          </div>
          <div class="h-1/2 flex flex-col overflow-y-auto p-8 hide-scrollbar bg-surface-container-low/20">
            <h2 class="text-lg font-bold text-on-surface mb-3 pb-1 border-b border-outline-variant/30">Evaluation Goal / Solution</h2>
            <p class="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line">
              {task.solution}
            </p>
          </div>
        {:else if showTask}
          <!-- Instructions Only -->
          <div class="w-full flex-grow flex flex-col p-8 space-y-6 overflow-y-auto hide-scrollbar">
            <h2 class="text-xl font-bold text-on-surface mb-4 pb-2 border-b border-outline-variant">{task.name} Instructions</h2>
            <div class="space-y-4 text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
              {task.instructions}
            </div>
          </div>
        {:else if showSolution}
          <!-- Solution Only -->
          <div class="w-full flex-grow flex flex-col p-8 space-y-6 overflow-y-auto hide-scrollbar bg-surface-container-low/20">
            <h2 class="text-xl font-bold text-on-surface mb-4 pb-2 border-b border-outline-variant">Evaluation Goal / Solution</h2>
            <p class="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
              {task.solution}
            </p>
          </div>
        {/if}
      </section>

      <!-- Draggable Split Separator -->
      <div 
        role="separator"
        aria-valuenow={splitWidth}
        class="w-1.5 hover:w-2 bg-outline-variant/60 hover:bg-primary cursor-col-resize select-none h-full z-20 transition-all active:bg-primary shrink-0"
        onmousedown={startSplitDrag}
      ></div>
    {/if}

    <!-- Right side: Drawing Canvas infinite scroll view wrapper -->
    <section 
      bind:this={canvasContainer} 
      class="flex-grow bg-white relative overflow-auto cursor-crosshair h-full custom-scrollbar"
    >
      <div class="relative" style="width: 5000px; height: 5000px;">
        <!-- Guidelines overlays repeating infinitely on 5000x5000 scale -->
        {#if activeBg === 'grid'}
          <div 
            class="absolute inset-0 canvas-guidelines slant-guidelines pointer-events-none z-0"
            style="opacity: {bgOpacity / 100}; background-repeat: repeat;"
          ></div>
        {:else if activeBg === 'lines'}
          <div 
            class="absolute inset-0 canvas-guidelines pointer-events-none z-0"
            style="opacity: {bgOpacity / 100}; background-repeat: repeat;"
          ></div>
        {:else if activeBg === 'custom' && currentBgUrl}
          <div 
            class="absolute inset-0 pointer-events-none z-0 bg-repeat"
            style="background-image: url({currentBgUrl}); opacity: {bgOpacity / 100}; background-repeat: repeat;"
          ></div>
        {/if}

        <!-- Drawing Canvas -->
        <canvas 
          bind:this={canvasElement}
          width="5000"
          height="5000"
          onmousedown={startDrawing}
          onmousemove={draw}
          onmouseup={stopDrawing}
          onmouseleave={stopDrawing}
          class="absolute inset-0 w-full h-full z-10 bg-transparent"
        ></canvas>
      </div>

      <!-- Floating Tool Palette -->
      <div class="fixed bottom-6 right-6 bg-white/95 backdrop-blur-md px-5 py-2.5 rounded-full flex items-center gap-5 shadow-lg border border-outline-variant/30 transition-all hover:scale-[1.02] z-20 select-none">
        
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

        <!-- Tool selectors (Pen / Eraser) and Brush slider -->
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
        <div class="absolute top-4 right-4 bg-white/95 backdrop-blur-md border border-outline-variant/40 rounded-xl p-5 w-80 shadow-2xl z-30 flex flex-col gap-3 max-h-[85%] overflow-y-auto custom-scrollbar transition-all">
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
