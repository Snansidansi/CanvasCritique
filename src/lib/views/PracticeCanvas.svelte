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
  let activeTool = $state('pen'); // 'pen' | 'eraser'

  // AI feedback overlay states
  let isChecking = $state(false);
  let feedbackText = $state('');
  let feedbackScore = $state(null);
  let showFeedback = $state(false);
  let hasCheckedWork = $state(false);
  let feedbackMarkers = $state([]);
  let activeTooltipMarker = $state(null);

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

  let activeLeftPanels = $derived([
    showTask && { id: 'task', title: `${task.name} Instructions`, content: task.instructions },
    showSolution && { id: 'solution', title: 'Evaluation Goal / Solution', content: task.solution },
    showFeedback && hasCheckedWork && { id: 'feedback', title: 'AI Critique & Feedback', isFeedback: true }
  ].filter(Boolean));

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
    
    store.confirm(
      'Clear Drawing Canvas',
      'Are you sure you want to clear your drawing canvas? This will discard your current calligraphy sketch.',
      () => {
        strokeHistory = [];
        redoStack = [];
        redraw();
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
    feedbackMarkers = [];
    activeTooltipMarker = null;
    isChecking = true;
    showFeedback = true;
    hasCheckedWork = true;
    feedbackText = "Analyzing stroke geometries and guidelines alignment...";
    feedbackScore = null;

    let boxOffset = { x: 0, y: 0 };
    let base64Data;
    let widthVal = 800;
    let heightVal = 600;
    try {
      const box = getStrokesBoundingBox();
      if (!box) {
        // Fallback: draw empty white canvas of parent container viewport dimensions
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasContainer ? canvasContainer.clientWidth : 800;
        tempCanvas.height = canvasContainer ? canvasContainer.clientHeight : 600;
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

        // Draw active guidelines background template offset relative to bounding box
        if (activeBg === 'lines' || activeBg === 'grid') {
          tempCtx.save();
          tempCtx.globalAlpha = bgOpacity / 100;
          
          const lineSpacing = 32;
          const startY = Math.floor(box.y / lineSpacing) * lineSpacing - box.y;
          tempCtx.strokeStyle = '#000000';
          tempCtx.lineWidth = 1;
          for (let y = startY; y < box.height; y += lineSpacing) {
            tempCtx.beginPath();
            tempCtx.moveTo(0, y);
            tempCtx.lineTo(box.width, y);
            tempCtx.stroke();
          }

          if (activeBg === 'grid') {
            tempCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
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
        const mockResponse = {
          generalCritique: "📝 **AI Feedback Mockup (API key missing)**\n\nTo test real AI evaluations, please enter your Gemini API key in **Settings**.\n\n*General Critique*:\n- Excellent slant consistency! Most letters follow the 55-degree layout slant lines nicely.\n- The loop size is consistent, but watch the crossing intersection of the ascender loops; they should cross exactly at the header line.\n- Stroke thickness contrasts nicely. Nice transition to heavier pressure on downward strokes.",
          grade: 88,
          markers: [
            {
              id: 'mock-1',
              x: Math.round(widthVal * 0.25),
              y: Math.round(heightVal * 0.35),
              type: 'correct',
              feedback: 'Great start of the stroke! Consistent weight and smooth curve.'
            },
            {
              id: 'mock-2',
              x: Math.round(widthVal * 0.55),
              y: Math.round(heightVal * 0.65),
              type: 'partial',
              feedback: 'The loop crossing is slightly off here. It should cross exactly at the horizontal header line.'
            },
            {
              id: 'mock-3',
              x: Math.round(widthVal * 0.8),
              y: Math.round(heightVal * 0.5),
              type: 'incorrect',
              feedback: 'Slant angle deviates here. Try to align with the 55-degree guide lines.',
              underlinePoints: [
                { x: Math.round(widthVal * 0.75), y: Math.round(heightVal * 0.7) },
                { x: Math.round(widthVal * 0.8), y: Math.round(heightVal * 0.5) },
                { x: Math.round(widthVal * 0.85), y: Math.round(heightVal * 0.3) }
              ]
            }
          ]
        };

        feedbackText = mockResponse.generalCritique;
        feedbackScore = mockResponse.grade;
        feedbackMarkers = mockResponse.markers.map(m => ({
          ...m,
          canvasX: m.x + boxOffset.x,
          canvasY: m.y + boxOffset.y,
          boundingBoxOffset: { ...boxOffset }
        }));
        isChecking = false;
      }, 2000);
      return;
    }

    try {
      const prompt = `You are a strict but encouraging penmanship teacher. Analyze this drawing canvas screenshot.
The student is practicing: "${task.name}".
${store.settings.sendTaskMedia ? `Instructions given: "${task.instructions}".` : ''}
${store.settings.sendSolutionMedia ? `Expected Solution: "${task.solution}".` : ''}

Examine:
1. Slant lines consistency (normally 55 degrees).
2. Stroke smoothness and hand shakiness.
3. Ascent and descent line crossings.
4. Spacing between letters.

The image dimensions are ${widthVal}x${heightVal} pixels.
You must return a JSON object with the following schema:
{
  "generalCritique": "Markdown formatted string containing your overall critique. Keep it brief and constructive.",
  "grade": number (0-100),
  "markers": [
    {
      "x": number (X coordinate on the image in pixels, range [0, ${widthVal}]),
      "y": number (Y coordinate on the image in pixels, range [0, ${heightVal}]),
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
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: base64Data
                    }
                  }
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
      feedbackMarkers = rawMarkers.map((m, index) => ({
        id: `marker-${Date.now()}-${index}`,
        x: m.x,
        y: m.y,
        canvasX: m.x + boxOffset.x,
        canvasY: m.y + boxOffset.y,
        type: m.type || 'partial',
        feedback: m.feedback || '',
        underlinePoints: m.underlinePoints || null,
        boundingBoxOffset: { ...boxOffset }
      }));

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
          {#if activeBg === 'grid'}
            <span class="material-symbols-outlined text-base">grid_3x3</span>
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
    
    <!-- Left side: dynamic split screen task, solution, and critique -->
    {#if activeLeftPanels.length > 0}
      <section 
        class="bg-white border-r border-outline-variant flex flex-col overflow-hidden h-full shrink-0"
        style="width: {splitWidth}px;"
      >
        {#each activeLeftPanels as panel, idx}
          {#if idx > 0}
            <div class="h-[1px] w-full bg-outline-variant/30"></div>
          {/if}
          <div class="flex-1 flex flex-col overflow-y-auto p-6 hide-scrollbar {panel.id === 'solution' ? 'bg-surface-container-low/20' : panel.id === 'feedback' ? 'bg-primary/5' : ''}">
            <div class="flex items-center justify-between mb-3 pb-1 border-b border-outline-variant/30">
              <h2 class="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
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
                <div class="bg-primary text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                  Score: {feedbackScore}
                </div>
              {/if}
            </div>
            
            {#if panel.isFeedback}
              {#if isChecking}
                <div class="flex flex-col items-center justify-center py-8 gap-3 my-auto">
                  <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p class="text-xs text-on-surface-variant text-center">{feedbackText}</p>
                </div>
              {:else}
                <div class="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line prose prose-sm dark:prose-invert">
                  {feedbackText}
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
        {:else if currentBgUrl}
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

        <!-- Feedback Markers Layer -->
        {#if hasCheckedWork && !isChecking}
          <!-- Render Underline strokes first (below the icons) -->
          <svg class="absolute inset-0 pointer-events-none z-20 w-full h-full">
            {#each feedbackMarkers as marker}
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
            {/each}
          </svg>

          <!-- Render Clickable Icons -->
          {#each feedbackMarkers as marker (marker.id)}
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

          {#if activeTooltipMarker}
            <!-- Tooltip Overlay -->
            <!-- Click-away background -->
            <button 
              type="button" 
              class="absolute inset-0 bg-transparent z-40 cursor-default border-0 p-0 m-0 w-full h-full focus:outline-none" 
              onclick={() => activeTooltipMarker = null}
              aria-label="Dismiss feedback"
            ></button>

            <div 
              class="absolute z-50 bg-white dark:bg-inverse-surface border border-outline-variant/60 rounded-xl p-4 w-72 shadow-2xl flex flex-col gap-2 -translate-x-1/2 mt-6 animate-fade-in"
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
