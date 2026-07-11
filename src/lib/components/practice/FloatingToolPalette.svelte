<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../services/i18n';

  let {
    strokeColor = $bindable(),
    activeTool = $bindable(),
    brushWidth = $bindable(),
    eraserWidth = $bindable(),
    shapeType = $bindable(),
    canvasMode,
    strokeHistory,
    redoStack,
    eraserUndoStack,
    handleUndo,
    handleRedo,
    onInsertImage = null
  } = $props();

  let recentColors = $state(['#000000', '#1d4ed8', '#dc2626', '#059669']);
  let colorInput = $state(null);

  // Collapsible state
  let isCollapsed = $state(false);

  // Position state (right & bottom offset from viewport boundaries)
  let rightX = $state<number | null>(null);
  let bottomY = $state<number | null>(null);
  let isDragging = $state(false);
  let dragStartMouseX = 0;
  let dragStartMouseY = 0;
  let dragStartRight = 0;
  let dragStartBottom = 0;

  let paletteElement = $state<HTMLElement | null>(null);

  // Shape popup state
  let shapePopupOpen = $state(false);

  const shapeOptions = ['circle', 'ellipse', 'line', 'square', 'rectangle', 'triangle'] as const;

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
    localStorage.setItem('canvascritique_recent_colors', JSON.stringify(recentColors));
  }

  function removeColorFromPalette(idx) {
    if (recentColors.length <= 1) return;
    recentColors = recentColors.filter((_, i) => i !== idx);
    localStorage.setItem('canvascritique_recent_colors', JSON.stringify(recentColors));
  }

  let isCustomColorInPalette = $derived(recentColors.includes(strokeColor));

  onMount(() => {
    // Load recent colors
    const savedRecents = localStorage.getItem('canvascritique_recent_colors') || localStorage.getItem('scribeflow_recent_colors');
    if (savedRecents) {
      try {
        recentColors = JSON.parse(savedRecents);
      } catch (e) {
        // Fallback
      }
    }

    // Load position
    const savedPos = localStorage.getItem('canvascritique_palette_pos');
    if (savedPos) {
      try {
        const { right, bottom } = JSON.parse(savedPos);
        rightX = right;
        bottomY = bottom;
      } catch (e) {
        // Fallback
      }
    }

    // Load collapse state
    const savedCollapse = localStorage.getItem('canvascritique_palette_collapsed');
    if (savedCollapse !== null) {
      isCollapsed = savedCollapse === 'true';
    }
  });

  // Calculate inline style for position
  let positionStyle = $derived.by(() => {
    if (rightX === null || bottomY === null) {
      return 'bottom: 24px; right: 24px;';
    }
    return `right: ${rightX}px; bottom: ${bottomY}px; left: auto; top: auto;`;
  });

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    localStorage.setItem('canvascritique_palette_collapsed', String(isCollapsed));
  }

  function onPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    const dragHandle = target.closest('.drag-handle-area');
    const wasCollapsed = isCollapsed;

    if (!dragHandle && !wasCollapsed) return;

    // Prevent text selection and browser default touch handling
    e.preventDefault();

    isDragging = true;
    dragStartMouseX = e.clientX;
    dragStartMouseY = e.clientY;

    if (rightX === null || bottomY === null) {
      if (paletteElement) {
        const rect = paletteElement.getBoundingClientRect();
        rightX = window.innerWidth - rect.right;
        bottomY = window.innerHeight - rect.bottom;
      } else {
        rightX = 24;
        bottomY = 24;
      }
    }

    dragStartRight = rightX;
    dragStartBottom = bottomY;

    // Expand immediately when a collapsed palette is tapped. We still record a
    // drag start so that holding or sliding the pointer afterwards switches
    // into reposition mode.
    if (wasCollapsed) {
      toggleCollapse();
    }

    // Use pointer capture on the element itself — the browser will route all
    // pointermove / pointerup events to this element regardless of where the
    // pointer physically is, making touch and stylus perfectly smooth.
    try {
      paletteElement?.setPointerCapture(e.pointerId);
    } catch (err) {}
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartMouseX;
    const deltaY = e.clientY - dragStartMouseY;

    let newRight = dragStartRight - deltaX;
    let newBottom = dragStartBottom - deltaY;

    if (paletteElement) {
      const rect = paletteElement.getBoundingClientRect();
      const margin = 12;
      newRight = Math.max(margin, Math.min(newRight, window.innerWidth - rect.width - margin));
      newBottom = Math.max(margin, Math.min(newBottom, window.innerHeight - rect.height - margin));
    }

    rightX = newRight;
    bottomY = newBottom;
  }

  function onPointerUp(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false;

    try {
      paletteElement?.releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (rightX !== null && bottomY !== null) {
      localStorage.setItem('canvascritique_palette_pos', JSON.stringify({ right: rightX, bottom: bottomY }));
    }
  }

  function onPointerCancel(e: PointerEvent) {
    isDragging = false;
    try {
      paletteElement?.releasePointerCapture(e.pointerId);
    } catch (err) {}
  }
</script>

<div 
  bind:this={paletteElement}
  class="fixed bg-surface-container/95 backdrop-blur-md shadow-lg border border-outline-variant/30 select-none z-20 flex items-center
         {isCollapsed ? 'w-12 h-12 rounded-full p-0 justify-center overflow-hidden cursor-pointer' : (canvasMode === 'infinite' ? 'w-[788px]' : 'w-[738px]') + ' h-12 pl-4 pr-7 rounded-full'}
         {isDragging ? '' : 'palette-transition'}"
  style="{positionStyle} touch-action: none;"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  role="toolbar"
  aria-label="Drawing tools"
  tabindex="-1"
>
  {#if !isCollapsed}
    <!-- Collapse trigger (arrow on the far left) -->
    <button 
      onclick={toggleCollapse}
      class="p-1 text-on-surface-variant hover:bg-surface-container-high rounded-full transition-colors focus:outline-none cursor-pointer flex items-center justify-center shrink-0 border-0 bg-transparent"
      title={t('practice.palette.collapse')}
    >
      <span class="material-symbols-outlined text-base">chevron_right</span>
    </button>

    <!-- Drag Handle -->
    <div 
      class="cursor-grab active:cursor-grabbing text-outline hover:text-on-surface-variant flex items-center justify-center pr-2 border-r border-outline-variant/30 shrink-0 drag-handle-area font-bold"
      title={t('practice.palette.drag')}
    >
      <span class="material-symbols-outlined text-[18px]">drag_indicator</span>
    </div>
  {/if}

  <!-- Combined inner wrapper that handles fade and overflow -->
  <div class="grow flex items-center justify-between min-w-0 pl-2 transition-all duration-200 {isCollapsed ? 'opacity-0 w-0 pointer-events-none overflow-hidden' : 'opacity-100'}">
    <!-- Color Pickers -->
    <div class="flex items-center gap-1.5 border-r border-outline-variant pr-4 shrink-0">
      {#each recentColors as color, idx}
        <div class="relative group">
          <button 
            onclick={() => selectColor(color)}
            class="w-6 h-6 rounded-full cursor-pointer border-2 transition-all hover:scale-110 focus:outline-none" 
            style="background-color: {color}; border-color: {strokeColor === color && activeTool === 'pen' ? 'var(--md-sys-color-primary, #1d4ed8)' : 'rgba(0, 0, 0, 0.15)'}; transform: {strokeColor === color && activeTool === 'pen' ? 'scale(1.15)' : 'none'}; box-shadow: {strokeColor === color && activeTool === 'pen' ? '0 0 0 2px var(--md-sys-color-primary-container, rgba(29,78,216,0.25))' : '0 1px 2px rgba(0,0,0,0.1)'};"
            title={t('practice.palette.clickToSelect')}
          ></button>
          {#if recentColors.length > 1}
            <button
              onclick={() => removeColorFromPalette(idx)}
              class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-error text-on-error text-[9px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-0 shadow-sm z-10 hover:scale-110"
              title={t('practice.palette.removeFromPalette')}
            >×</button>
          {/if}
        </div>
      {/each}
      
      <!-- Save to palette button -->
      {#if !isCustomColorInPalette && activeTool === 'pen'}
        <button
          onclick={addColorToPalette}
          class="w-6 h-6 rounded-full cursor-pointer border-2 border-dashed border-primary/60 hover:border-primary hover:bg-primary/10 transition-all flex items-center justify-center text-primary hover:scale-110 focus:outline-none bg-transparent"
          title={t('practice.palette.saveToPalette')}
        >
          <span class="material-symbols-outlined text-[14px]">add</span>
        </button>
      {/if}

      <!-- Custom Color Picker Button -->
      <button 
        onclick={() => colorInput?.click()}
        class="w-6 h-6 rounded-full cursor-pointer border border-outline-variant/60 hover:scale-110 active:scale-[0.9] transition-all flex items-center justify-center relative overflow-hidden shrink-0"
        style="background: conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red);"
        title={t('practice.palette.pickColor')}
      >
        <span class="material-symbols-outlined text-[13px] text-white font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">palette</span>
      </button>
      <input 
        type="color" 
        bind:this={colorInput} 
        value={strokeColor} 
        onchange={(e) => selectColor(e.currentTarget.value)} 
        class="hidden" 
      />
    </div>

    <!-- Tool selectors (Pen / Eraser / Hand / Select) and Brush slider -->
    <div class="flex items-center gap-4 text-xs font-semibold grow justify-between pl-4">
      <div class="flex items-center gap-3">
        <button 
          onclick={() => activeTool = 'pen'}
          class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors border-0 bg-transparent cursor-pointer
                 {activeTool === 'pen' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}"
        >
          <span class="material-symbols-outlined text-[20px]" data-weight={activeTool === 'pen' ? 'fill' : 'normal'}>edit</span>
          <span class="text-[9px]">{t('practice.palette.pen')}</span>
        </button>
        
        <button 
          onclick={() => activeTool = 'eraser'}
          class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors border-0 bg-transparent cursor-pointer
                 {activeTool === 'eraser' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}"
        >
          <span class="material-symbols-outlined text-[20px]" data-weight={activeTool === 'eraser' ? 'fill' : 'normal'}>ink_eraser</span>
          <span class="text-[9px]">{t('practice.palette.eraser')}</span>
        </button>

        <button 
          onclick={() => activeTool = 'select'}
          class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors border-0 bg-transparent cursor-pointer
                 {activeTool === 'select' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}"
          title="Selection Tool"
        >
          <span class="material-symbols-outlined text-[20px]" data-weight={activeTool === 'select' ? 'fill' : 'normal'}>select_all</span>
          <span class="text-[9px]">{t('practice.palette.select')}</span>
        </button>

        {#if canvasMode === 'infinite'}
          <button 
            onclick={() => activeTool = 'pan'}
            class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors border-0 bg-transparent cursor-pointer
                   {activeTool === 'pan' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}"
            title="Pan Canvas"
          >
            <span class="material-symbols-outlined text-[20px]" data-weight={activeTool === 'pan' ? 'fill' : 'normal'}>pan_tool</span>
            <span class="text-[9px]">{t('practice.palette.hand')}</span>
          </button>
        {/if}

        <div class="relative">
          <button 
            onclick={() => { activeTool = 'shape'; shapePopupOpen = !shapePopupOpen; }}
            class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors border-0 bg-transparent cursor-pointer
                   {activeTool === 'shape' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}"
            title="Shape Tool"
          >
            <span class="material-symbols-outlined text-[20px]" data-weight={activeTool === 'shape' ? 'fill' : 'normal'}>shapes</span>
            <span class="text-[9px]">{t('practice.palette.shapes')}</span>
          </button>

          {#if shapePopupOpen && activeTool === 'shape'}
            <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-surface-container-high border border-outline-variant shadow-xl rounded-xl py-1.5 flex flex-col min-w-32 z-30 animate-fade-in">
              {#each shapeOptions as shape}
                <button
                  onclick={() => { shapeType = shape; shapePopupOpen = false; }}
                  class="w-full text-left px-3 py-1.5 text-xs text-on-surface hover:bg-primary/10 hover:text-primary cursor-pointer font-semibold border-0 bg-transparent flex items-center gap-2"
                >
                  {#if shape === 'ellipse'}
                    <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <ellipse cx="12" cy="12" rx="9" ry="5" />
                    </svg>
                  {:else}
                    <span class="material-symbols-outlined text-[16px]">
                      {shape === 'circle' ? 'circle' : shape === 'line' ? 'show_chart' : shape === 'square' ? 'crop_square' : shape === 'rectangle' ? 'crop_5_4' : 'change_history'}
                    </span>
                  {/if}
                  <span>{t(`practice.shapes.${shape}`)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <button 
          onclick={() => { if (onInsertImage) onInsertImage(); }}
          class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors border-0 bg-transparent cursor-pointer text-on-surface-variant hover:text-on-surface"
          title={t('practice.palette.imageTooltip')}
        >
          <span class="material-symbols-outlined text-[20px]">image</span>
          <span class="text-[9px]">{t('practice.palette.image')}</span>
        </button>
      </div>

      <!-- Floating Undo / Redo Buttons -->
      <div class="flex items-center gap-3">
        <div class="h-5 w-px bg-outline-variant/30"></div>
        
        <button 
          onclick={handleUndo}
          disabled={strokeHistory.length === 0 && eraserUndoStack.length === 0}
          class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors text-on-surface-variant hover:text-on-surface disabled:opacity-40 cursor-pointer border-0 bg-transparent"
          title={t('practice.palette.undo')}
        >
          <span class="material-symbols-outlined text-[20px]">undo</span>
          <span class="text-[9px]">Undo</span>
        </button>
        
        <button 
          onclick={handleRedo}
          disabled={redoStack.length === 0}
          class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors text-on-surface-variant hover:text-on-surface disabled:opacity-40 cursor-pointer border-0 bg-transparent"
          title={t('practice.palette.redo')}
        >
          <span class="material-symbols-outlined text-[20px]">redo</span>
          <span class="text-[9px]">Redo</span>
        </button>
      </div>
      
      <!-- Pen/Eraser stroke width controller -->
      <div class="flex items-center gap-1.5 border-l border-outline-variant pl-4 min-w-35 justify-end shrink-0">
        {#if activeTool === 'pen'}
          <span class="text-[10px] text-outline">{t('practice.palette.size')}</span>
          <input 
            type="range" 
            min="1" 
            max="12" 
            bind:value={brushWidth} 
            class="w-16 h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary border-0" 
          />
          <span class="text-[10px] text-on-surface min-w-[24px] text-right">{brushWidth}px</span>
        {:else if activeTool === 'eraser'}
          <span class="text-[10px] text-outline">{t('practice.palette.size')}</span>
          <input 
            type="range" 
            min="4" 
            max="80" 
            bind:value={eraserWidth} 
            class="w-16 h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary border-0" 
          />
          <span class="text-[10px] text-on-surface min-w-[24px] text-right">{eraserWidth}px</span>
        {:else}
          <!-- Empty placeholder to maintain width stability -->
          <div class="w-28"></div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Expand Button (visible when collapsed) -->
  {#if isCollapsed}
    <div 
      class="absolute inset-0 w-full h-full flex items-center justify-center text-primary hover:bg-surface-container-high transition-colors rounded-full"
      title="Expand drawing tools"
    >
      <span class="material-symbols-outlined text-[22px]">brush</span>
    </div>
  {/if}
</div>

<style>
  .palette-transition {
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                border-radius 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                padding 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                background-color 0.2s ease;
  }
</style>
