<script lang="ts">
  import { onMount } from 'svelte';

  let {
    strokeColor = $bindable(),
    activeTool = $bindable(),
    brushWidth = $bindable(),
    eraserWidth = $bindable(),
    canvasMode,
    strokeHistory,
    redoStack,
    handleUndo,
    handleRedo
  } = $props();

  let recentColors = $state(['#000000', '#1d4ed8', '#dc2626', '#059669']);
  let colorInput = $state(null);

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
    const savedRecents = localStorage.getItem('canvascritique_recent_colors') || localStorage.getItem('scribeflow_recent_colors');
    if (savedRecents) {
      try {
        recentColors = JSON.parse(savedRecents);
      } catch (e) {
        // Fallback
      }
    }
  });
</script>

<div class="fixed bottom-6 right-6 bg-surface-container/95 backdrop-blur-md px-5 py-2.5 rounded-full flex items-center gap-5 shadow-lg border border-outline-variant/30 transition-all hover:scale-[1.02] z-20 select-none">
  
  <!-- Color Pickers -->
  <div class="flex items-center gap-1.5 border-r border-outline-variant pr-4">
    {#each recentColors as color, idx}
      <div class="relative group">
        <button 
          onclick={() => selectColor(color)}
          class="w-6 h-6 rounded-full cursor-pointer border-2 transition-all hover:scale-110 focus:outline-none" 
          style="background-color: {color}; border-color: {strokeColor === color && activeTool === 'pen' ? 'var(--md-sys-color-primary, #1d4ed8)' : 'rgba(0, 0, 0, 0.15)'}; transform: {strokeColor === color && activeTool === 'pen' ? 'scale(1.15)' : 'none'}; box-shadow: {strokeColor === color && activeTool === 'pen' ? '0 0 0 2px var(--md-sys-color-primary-container, rgba(29,78,216,0.25))' : '0 1px 2px rgba(0,0,0,0.1)'};"
          title="Click to select"
        ></button>
        {#if recentColors.length > 1}
          <button
            onclick={() => removeColorFromPalette(idx)}
            class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-error text-on-error text-[9px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-0 shadow-sm z-10 hover:scale-110"
            title="Remove from palette"
          >×</button>
        {/if}
      </div>
    {/each}
    
    <!-- Save to palette button (visible when custom color not in palette) -->
    {#if !isCustomColorInPalette && activeTool === 'pen'}
      <button
        onclick={addColorToPalette}
        class="w-6 h-6 rounded-full cursor-pointer border-2 border-dashed border-primary/60 hover:border-primary hover:bg-primary/10 transition-all flex items-center justify-center text-primary hover:scale-110 focus:outline-none"
        title="Save current color to palette"
      >
        <span class="material-symbols-outlined text-[14px]">add</span>
      </button>
    {/if}

    <!-- Custom Color Picker Button -->
    <button 
      onclick={() => colorInput?.click()}
      class="w-6 h-6 rounded-full cursor-pointer border border-outline-variant/60 hover:scale-110 active:scale-[0.9] transition-all flex items-center justify-center relative overflow-hidden shrink-0"
      style="background: conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red);"
      title="Pick custom color"
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

    <button 
      onclick={() => activeTool = 'select'}
      class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors
             {activeTool === 'select' ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}"
      title="Selection Tool"
    >
      <span class="material-symbols-outlined text-[20px]" data-weight={activeTool === 'select' ? 'fill' : 'normal'}>select_all</span>
      <span class="text-[9px]">Select</span>
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

    <!-- Floating Undo / Redo Buttons -->
    <div class="h-5 w-px bg-outline-variant/30"></div>
    
    <button 
      onclick={handleUndo}
      disabled={strokeHistory.length === 0}
      class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors text-on-surface-variant hover:text-on-surface disabled:opacity-40 cursor-pointer"
      title="Undo (Ctrl+Z)"
    >
      <span class="material-symbols-outlined text-[20px]">undo</span>
      <span class="text-[9px]">Undo</span>
    </button>
    
    <button 
      onclick={handleRedo}
      disabled={redoStack.length === 0}
      class="flex flex-col items-center gap-0.5 focus:outline-none transition-colors text-on-surface-variant hover:text-on-surface disabled:opacity-40 cursor-pointer"
      title="Redo (Ctrl+Y)"
    >
      <span class="material-symbols-outlined text-[20px]">redo</span>
      <span class="text-[9px]">Redo</span>
    </button>
    
    <!-- Pen stroke width controller -->
    {#if activeTool === 'pen'}
      <div class="flex items-center gap-1.5 border-l border-outline-variant pl-4">
        <span class="text-[10px] text-outline">Pen Size</span>
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
    
    <!-- Eraser stroke width controller -->
    {#if activeTool === 'eraser'}
      <div class="flex items-center gap-1.5 border-l border-outline-variant pl-4">
        <span class="text-[10px] text-outline">Eraser Size</span>
        <input 
          type="range" 
          min="4" 
          max="80" 
          bind:value={eraserWidth} 
          class="w-16 h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary" 
        />
        <span class="text-[10px] text-on-surface min-w-3">{eraserWidth}px</span>
      </div>
    {/if}
  </div>
</div>
