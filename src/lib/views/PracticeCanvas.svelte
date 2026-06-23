<script>
  import { store } from '../state/store.svelte.js';
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
  let activeBg = $state('grid'); // 'grid' | 'lines' | 'blank'
  
  // Brush configuration
  let strokeColor = $state('#000000');
  let brushWidth = $state(2);
  let activeTool = $state('pen'); // 'pen' | 'eraser'

  // AI feedback overlay states
  let isChecking = $state(false);
  let feedbackText = $state('');
  let feedbackScore = $state(null);
  let showFeedback = $state(false);

  // Canvas element references
  let canvasElement = $state(null);
  let canvasContainer = $state(null);
  let ctx = null;

  // Stroke history state
  let isDrawing = false;
  let currentStroke = [];
  let strokeHistory = $state([]);
  let redoStack = $state([]);

  // Setup canvas drawings and window listeners
  onMount(() => {
    if (canvasElement) {
      ctx = canvasElement.getContext('2d');
      resizeCanvas();
      
      // Wait for layout rendering and resize again to make sure width matches
      setTimeout(resizeCanvas, 100);
    }

    window.addEventListener('resize', resizeCanvas);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  });

  // Watch toggles that change layout size
  $effect(() => {
    if (showTask !== undefined || showSolution !== undefined) {
      // Re-trigger layout adjustments
      tick().then(() => {
        resizeCanvas();
      });
    }
  });

  function resizeCanvas() {
    if (!canvasElement || !canvasContainer) return;
    
    // Save current strokes to redraw after resize
    const savedHistory = [...strokeHistory];
    
    canvasElement.width = canvasContainer.clientWidth;
    canvasElement.height = canvasContainer.clientHeight;
    
    strokeHistory = savedHistory;
    redraw();
  }

  function startDrawing(e) {
    if (!ctx) return;
    isDrawing = true;
    
    const rect = canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    currentStroke = [{ x, y }];
  }

  function draw(e) {
    if (!isDrawing || !ctx) return;
    
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
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
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
    strokeHistory = [];
    redoStack = [];
    redraw();
  }

  // Multimodal AI Grading
  async function checkWork() {
    if (!canvasElement) return;
    
    isChecking = true;
    showFeedback = true;
    feedbackText = "Analyzing stroke geometries and guidelines alignment...";
    feedbackScore = null;

    // Convert canvas content to base64
    const dataUrl = canvasElement.toDataURL('image/png');
    const base64Data = dataUrl.split(',')[1];

    const apiKey = store.settings.apiKey;
    const provider = store.settings.apiProvider;
    const model = store.settings.model;

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
        // Remove the grade tag from the output for clean display
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
    store.setView('dashboard');
  }
</script>

<div class="flex-grow flex overflow-hidden h-full">
  <!-- Inner sidebar for background and lesson properties -->
  <aside class="bg-surface-container-low border-r border-outline-variant w-64 flex flex-col py-6 px-4 shrink-0 select-none">
    <div class="flex items-center gap-2 mb-8 mt-2">
      <button 
        onclick={handleBack}
        class="material-symbols-outlined text-primary hover:bg-surface-container-high p-1 rounded-lg"
        title="Back to Projects"
      >
        arrow_back
      </button>
      <span class="font-bold text-xs uppercase tracking-wide text-on-surface-variant">Practice Controls</span>
    </div>

    <!-- Choose Background -->
    <div class="space-y-3 mb-8">
      <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Choose Background</p>
      <div class="grid grid-cols-3 gap-2">
        <button 
          onclick={() => activeBg = 'grid'}
          class="aspect-square rounded border-2 bg-white flex flex-col items-center justify-center gap-1 transition-all hover:bg-surface-container-high
                 {activeBg === 'grid' ? 'border-primary text-primary' : 'border-outline-variant text-on-surface-variant'}" 
          title="Grid Lines"
        >
          <span class="material-symbols-outlined text-sm">grid_3x3</span>
          <span class="text-[9px] font-bold">Grid</span>
        </button>
        <button 
          onclick={() => activeBg = 'lines'}
          class="aspect-square rounded border bg-white flex flex-col items-center justify-center gap-1 transition-all hover:bg-surface-container-high
                 {activeBg === 'lines' ? 'border-primary border-2 text-primary' : 'border-outline-variant text-on-surface-variant'}" 
          title="Ruled Lines"
        >
          <span class="material-symbols-outlined text-sm">reorder</span>
          <span class="text-[9px] font-bold">Lines</span>
        </button>
        <button 
          onclick={() => activeBg = 'blank'}
          class="aspect-square rounded border bg-white flex flex-col items-center justify-center gap-1 transition-all hover:bg-surface-container-high
                 {activeBg === 'blank' ? 'border-primary border-2 text-primary' : 'border-outline-variant text-on-surface-variant'}" 
          title="Blank Paper"
        >
          <span class="material-symbols-outlined text-sm">check_box_outline_blank</span>
          <span class="text-[9px] font-bold">Blank</span>
        </button>
      </div>
    </div>

    <!-- Task options -->
    <div class="space-y-4">
      <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Workspace Mode</p>
      
      <!-- Show task toggle -->
      <div class="flex items-center justify-between bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/50">
        <span class="text-xs font-semibold text-on-surface">Split Instructions</span>
        <label class="relative inline-flex items-center cursor-pointer select-none">
          <input 
            type="checkbox" 
            bind:checked={showTask}
            class="sr-only peer" 
          />
          <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      <!-- Show solution overlay toggle -->
      <div class="flex items-center justify-between bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/50">
        <span class="text-xs font-semibold text-on-surface">Overlay Solution</span>
        <label class="relative inline-flex items-center cursor-pointer select-none">
          <input 
            type="checkbox" 
            bind:checked={showSolution}
            class="sr-only peer" 
          />
          <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>
    </div>

    <div class="mt-auto pt-4 border-t border-outline-variant/30 flex flex-col gap-2">
      <button 
        onclick={clearCanvas}
        class="w-full flex items-center justify-center gap-2 border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest py-2.5 rounded-lg text-xs font-bold"
      >
        <span class="material-symbols-outlined text-[16px]">delete_sweep</span>
        Clear Canvas
      </button>
    </div>
  </aside>

  <!-- Workspace Shell -->
  <main class="flex-grow flex flex-col min-w-0 h-full">
    <!-- Top Navigation Bar -->
    <header class="bg-white border-b border-outline-variant flex justify-between items-center w-full px-8 py-4 shrink-0 z-20">
      <div class="flex items-center gap-6 min-w-0">
        <h1 class="font-bold text-lg text-primary truncate">{task.name}</h1>
      </div>
      
      <div class="flex items-center gap-4">
        <!-- Undo / Redo -->
        <div class="flex items-center gap-2 border-r border-outline-variant pr-4 mr-2">
          <button 
            onclick={handleUndo} 
            disabled={strokeHistory.length === 0}
            class="p-2 text-on-surface-variant hover:bg-surface-container-high rounded-full transition-colors disabled:opacity-40"
            title="Undo"
          >
            <span class="material-symbols-outlined">undo</span>
          </button>
          <button 
            onclick={handleRedo} 
            disabled={redoStack.length === 0}
            class="p-2 text-on-surface-variant hover:bg-surface-container-high rounded-full transition-colors disabled:opacity-40"
            title="Redo"
          >
            <span class="material-symbols-outlined">redo</span>
          </button>
        </div>

        <button 
          onclick={checkWork}
          class="bg-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:shadow-lg active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <span class="material-symbols-outlined text-[18px]">neurology</span>
          Check Work
        </button>
      </div>
    </header>

    <!-- Interactive practice screen split layout -->
    <div class="flex-grow flex overflow-hidden relative">
      
      <!-- Left side: task description, instructions (collapsible) -->
      {#if showTask}
        <section class="w-1/2 bg-white border-r border-outline-variant flex flex-col overflow-y-auto hide-scrollbar">
          <div class="w-full flex-grow flex flex-col p-8 space-y-6">
            <div>
              <h2 class="text-xl font-bold text-on-surface mb-4 pb-2 border-b border-outline-variant">{task.name} Instructions</h2>
              
              <div class="space-y-4 text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
                {task.instructions}
              </div>
            </div>

            <div class="p-5 bg-surface-container-low rounded-xl border border-outline-variant/30 space-y-2">
              <h3 class="font-bold text-xs text-on-surface uppercase tracking-wider">Evaluation Goal</h3>
              <p class="text-xs text-on-surface-variant leading-relaxed">
                {task.solution}
              </p>
            </div>
          </div>
        </section>
      {/if}

      <!-- Right side: Drawing Canvas -->
      <section 
        bind:this={canvasContainer} 
        class="flex-grow bg-white relative overflow-hidden cursor-crosshair h-full"
      >
        <!-- Guidelines overlays -->
        {#if activeBg === 'grid'}
          <div class="absolute inset-0 canvas-guidelines slant-guidelines pointer-events-none opacity-45 z-0"></div>
        {:else if activeBg === 'lines'}
          <div class="absolute inset-0 canvas-guidelines pointer-events-none opacity-45 z-0"></div>
        {/if}

        <!-- Solution Overlay Template -->
        {#if showSolution}
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 select-none z-0">
            <span class="text-6xl font-serif italic text-primary select-none font-bold">Spencerian Loops</span>
          </div>
        {/if}

        <!-- Drawing Canvas -->
        <canvas 
          bind:this={canvasElement}
          onmousedown={startDrawing}
          onmousemove={draw}
          onmouseup={stopDrawing}
          onmouseleave={stopDrawing}
          class="absolute inset-0 w-full h-full z-10 bg-transparent"
        ></canvas>

        <!-- Floating Tool Palette -->
        <div class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full flex items-center gap-5 shadow-lg border border-outline-variant/30 transition-all hover:scale-[1.02] z-20">
          
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
                <span class="text-[10px] text-on-surface min-w-[12px]">{brushWidth}px</span>
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
                class="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-on-surface focus:outline-none"
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
                <div class="flex items-center gap-3 bg-primary/5 p-3 rounded-lg border border-primary/20">
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
  </main>
</div>
