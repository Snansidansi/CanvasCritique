<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../services/i18n';
  import { store } from '../../state/store.svelte';

  let {
    strokeColor = $bindable(),
    activeTool = $bindable(),
    brushWidth = $bindable(),
    eraserWidth = $bindable(),
    shapeType = $bindable(),
    canvasMode,
    strokeHistory,
    hasSelection = false,
    onInsertImage = null
  } = $props();

  let recentColors = $derived(store.settings.penRecentColors || ['#000000', '#1d4ed8', '#dc2626', '#059669']);

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
  let wasCollapsedOnDown = false;
  let hasDragged = $state(false);
  let pointerDownTime = 0;
  let paletteElement = $state<HTMLElement | null>(null);

  // Shape popup state
  let shapePopupOpen = $state(false);

  const shapeOptions = ['circle', 'ellipse', 'line', 'square', 'rectangle', 'triangle'] as const;

  // Long-press deletion state
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let colorToDeleteIndex = $state<number | null>(null);
  let showDeleteConfirmModal = $state(false);

  // Custom Color Picker Modal states
  let showColorPickerPopup = $state(false);
  let pickerHue = $state(0);
  let pickerSat = $state(100);
  let pickerLight = $state(50);
  let pickerColor = $derived(`hsl(${pickerHue}, ${pickerSat}%, ${pickerLight}%)`);

  function handleColorPointerDown(idx: number) {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (recentColors.length > 1) {
        colorToDeleteIndex = idx;
        showDeleteConfirmModal = true;
      }
    }, 600);
  }

  function handleColorPointerUpOrLeave() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function confirmDeleteColor() {
    if (colorToDeleteIndex !== null) {
      removeColorFromPalette(colorToDeleteIndex);
      colorToDeleteIndex = null;
    }
    showDeleteConfirmModal = false;
  }

  function openColorPicker() {
    const hsl = hexToHsl(strokeColor);
    pickerHue = hsl.h;
    pickerSat = hsl.s;
    pickerLight = hsl.l;
    showColorPickerPopup = true;
  }

  function confirmColorPicker() {
    const hex = hslToHex(pickerHue, pickerSat, pickerLight);
    selectColor(hex);
    showColorPickerPopup = false;
  }

  function updateColorFromHsl() {}

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

  function selectColor(color: string) {
    strokeColor = color;
    if (activeTool !== 'shape') {
      activeTool = 'pen';
    }
  }

  function addColorToPalette() {
    if (store.settings.penRecentColors.some(c => c.toLowerCase() === strokeColor.toLowerCase())) return;
    if (store.settings.penRecentColors.length >= 8) {
      store.settings.penRecentColors = [...store.settings.penRecentColors.slice(1), strokeColor];
    } else {
      store.settings.penRecentColors = [...store.settings.penRecentColors, strokeColor];
    }
    store.saveSettings();
  }

  function removeColorFromPalette(idx: number) {
    if (store.settings.penRecentColors.length <= 1) return;
    store.settings.penRecentColors = store.settings.penRecentColors.filter((_, i) => i !== idx);
    store.saveSettings();
  }

  let isCustomColorInPalette = $derived(
    recentColors.some(color => color.toLowerCase() === strokeColor.toLowerCase())
  );

  onMount(() => {

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

  let openDropdownDownwards = $derived.by(() => {
    if (bottomY === null) return false;
    return bottomY > window.innerHeight / 2;
  });

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    localStorage.setItem('canvascritique_palette_collapsed', String(isCollapsed));
  }

  function onPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    const dragHandle = target.closest('.drag-handle-area');
    wasCollapsedOnDown = isCollapsed;

    if (!dragHandle && !wasCollapsedOnDown) return;

    // Prevent text selection and browser default touch handling
    e.preventDefault();

    isDragging = true;
    hasDragged = false;
    pointerDownTime = Date.now();
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

    // Use pointer capture on the element itself
    try {
      paletteElement?.setPointerCapture(e.pointerId);
    } catch (err) {}
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartMouseX;
    const deltaY = e.clientY - dragStartMouseY;
    const dist = Math.hypot(deltaX, deltaY);

    if (!hasDragged && dist > 8) {
      hasDragged = true;
    }

    if (!hasDragged) return;

    let newRight = dragStartRight - deltaX;
    let newBottom = dragStartBottom - deltaY;

    if (paletteElement) {
      const rect = paletteElement.getBoundingClientRect();
      const margin = 12;

      // Query top header height dynamically
      const headerEl = document.querySelector('header');
      const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;

      // Query left sidebar width dynamically
      const sidebarEl = document.querySelector('aside');
      const sidebarWidth = sidebarEl ? sidebarEl.getBoundingClientRect().width : 0;

      // Left boundary limit: left edge >= sidebarWidth + margin
      // window.innerWidth - newRight - rect.width >= sidebarWidth + margin
      const maxRight = window.innerWidth - rect.width - sidebarWidth - margin;
      newRight = Math.max(margin, Math.min(newRight, maxRight));

      // Top boundary limit: top edge >= headerHeight + margin
      // window.innerHeight - newBottom - rect.height >= headerHeight + margin
      const maxBottom = window.innerHeight - rect.height - headerHeight - margin;
      newBottom = Math.max(margin, Math.min(newBottom, maxBottom));
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

    const elapsed = Date.now() - pointerDownTime;
    const isTap = elapsed < 250;

    // Tap detection: if released quickly (< 250ms), toggle collapse state.
    // After toggling, swallow the synthetic click event the browser fires after
    // pointerup — otherwise it would land on the now-visible collapse button and
    // immediately collapse the palette again.
    if (wasCollapsedOnDown && isTap) {
      e.preventDefault();
      toggleCollapse();
      // One-shot capture listener to absorb the follow-up click
      const absorbClick = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        paletteElement?.removeEventListener('click', absorbClick, true);
      };
      paletteElement?.addEventListener('click', absorbClick, true);
      // Safety cleanup in case click never fires
      setTimeout(() => {
        paletteElement?.removeEventListener('click', absorbClick, true);
      }, 500);
    }

    if (!isTap && rightX !== null && bottomY !== null) {
      localStorage.setItem('canvascritique_palette_pos', JSON.stringify({ right: rightX, bottom: bottomY }));
    }
    hasDragged = false;
  }

  function onPointerCancel(e: PointerEvent) {
    isDragging = false;
    hasDragged = false;
    try {
      paletteElement?.releasePointerCapture(e.pointerId);
    } catch (err) {}
  }
</script>

<div 
  bind:this={paletteElement}
  class="fixed bg-surface-container/95 backdrop-blur-md shadow-lg border border-outline-variant/30 select-none z-20 flex items-center
         {isCollapsed ? 'w-12 max-w-12 h-12 rounded-full p-0 justify-center overflow-hidden cursor-pointer' : 'w-fit max-w-212.5 h-12 pl-4 pr-7 rounded-full'}
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

  <div class="flex items-center gap-4 min-w-0 pl-2 transition-all duration-200 {isCollapsed ? 'opacity-0 w-0 pointer-events-none overflow-hidden' : 'opacity-100'}">
    <!-- Color Pickers -->
    <div class="flex items-center gap-1.5 border-r border-outline-variant pr-4 shrink-0">
      {#each recentColors as color, idx}
        <div class="relative group">
          <button 
            onclick={() => {
              if (!showDeleteConfirmModal) {
                selectColor(color);
              }
            }}
            onpointerdown={() => handleColorPointerDown(idx)}
            onpointerup={handleColorPointerUpOrLeave}
            onpointerleave={handleColorPointerUpOrLeave}
            class="w-6 h-6 rounded-full cursor-pointer border-2 transition-all hover:scale-110 focus:outline-none touch-none" 
            style="background-color: {color}; border-color: {strokeColor.toLowerCase() === color.toLowerCase() && (activeTool === 'pen' || hasSelection || activeTool === 'shape') ? 'var(--md-sys-color-primary, #1d4ed8)' : 'rgba(0, 0, 0, 0.15)'}; transform: {strokeColor.toLowerCase() === color.toLowerCase() && (activeTool === 'pen' || hasSelection || activeTool === 'shape') ? 'scale-1.15)' : 'none'}; box-shadow: {strokeColor.toLowerCase() === color.toLowerCase() && (activeTool === 'pen' || hasSelection || activeTool === 'shape') ? '0 0 0 2px var(--md-sys-color-primary-container, rgba(29,78,216,0.25))' : '0 1px 2px rgba(0,0,0,0.1)'};"
            title={t('practice.palette.clickToSelect')}
          ></button>
        </div>
      {/each}
      
      <!-- Save to palette button -->
      {#if !isCustomColorInPalette && (activeTool === 'pen' || hasSelection || activeTool === 'shape')}
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
        onclick={openColorPicker}
        class="w-6 h-6 rounded-full cursor-pointer border border-outline-variant/60 hover:scale-110 active:scale-[0.9] transition-all flex items-center justify-center relative overflow-hidden shrink-0"
        style="background: conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red);"
        title={t('practice.palette.pickColor')}
      >
        <span class="material-symbols-outlined text-[13px] text-white font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">palette</span>
      </button>
    </div>
 
    <!-- Tool selectors (Pen / Eraser / Hand / Select) and Brush slider -->
    <div class="flex items-center gap-4 text-xs font-semibold shrink-0">
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
            <div class="absolute {openDropdownDownwards ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 bg-surface-container-high border border-outline-variant shadow-xl rounded-xl py-1.5 flex flex-col min-w-32 z-30 animate-fade-in">
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


      
      <!-- Pen/Eraser stroke width controller -->
      {#if activeTool === 'pen' || activeTool === 'shape' || activeTool === 'eraser'}
        <div class="flex items-center gap-1.5 border-l border-outline-variant pl-4 justify-end shrink-0">
          {#if activeTool === 'pen' || activeTool === 'shape'}
            <span class="text-[10px] text-outline">{t('practice.palette.size')}</span>
            <span class="text-[10px] text-on-surface min-w-[24px] text-left">{brushWidth}px</span>
            <input 
              type="range" 
              min="1" 
              max="12" 
              bind:value={brushWidth} 
              class="w-16 h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary border-0" 
            />
          {:else if activeTool === 'eraser'}
            <span class="text-[10px] text-outline">{t('practice.palette.size')}</span>
            <span class="text-[10px] text-on-surface min-w-[24px] text-left">{eraserWidth}px</span>
            <input 
              type="range" 
              min="4" 
              max="80" 
              bind:value={eraserWidth} 
              class="w-16 h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary border-0" 
            />
          {/if}
        </div>
      {/if}
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

{#if showDeleteConfirmModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs font-sans">
    <div class="bg-surface-container-high border border-outline-variant rounded-xl p-5 shadow-2xl w-72 flex flex-col gap-4">
      <h3 class="text-sm font-bold text-on-surface">
        {store.settings.language === 'Deutsch' ? 'Farbe löschen?' : 'Delete Color?'}
      </h3>
      <p class="text-xs text-on-surface-variant">
        {store.settings.language === 'Deutsch' 
          ? 'Möchtest du diese Farbe wirklich aus deiner Palette löschen?' 
          : 'Do you really want to delete this color from your palette?'}
      </p>
      <div class="flex justify-end gap-2 mt-1">
        <button 
          onclick={() => showDeleteConfirmModal = false}
          class="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-surface-container transition-colors border-0 bg-transparent text-outline cursor-pointer"
        >
          {t('common.cancel') || 'Abbrechen'}
        </button>
        <button 
          onclick={confirmDeleteColor}
          class="px-4 py-2 text-xs font-semibold bg-error text-on-error rounded-lg hover:bg-error/90 transition-colors border-0 cursor-pointer"
        >
          {store.settings.language === 'Deutsch' ? 'Löschen' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showColorPickerPopup}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs font-sans">
    <div class="bg-surface-container-high border border-outline-variant rounded-xl p-5 shadow-2xl w-80 flex flex-col gap-4">
      <h3 class="text-sm font-bold text-on-surface">{t('practice.palette.pickColor') || 'Farbe wählen'}</h3>
      
      <!-- Color Preview Box -->
      <div class="h-20 rounded-lg shadow-inner border border-outline-variant" style="background-color: {pickerColor}"></div>
      
      <!-- Hue Slider -->
      <div class="flex flex-col gap-1">
        <div class="flex justify-between text-xs text-on-surface-variant">
          <span>{store.settings.language === 'Deutsch' ? 'Farbton' : 'Hue'}</span>
          <span>{pickerHue}°</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="360" 
          bind:value={pickerHue}
          class="w-full accent-primary"
          style="background: linear-gradient(to right, red, yellow, lime, aqua, blue, magenta, red); height: 8px; border-radius: 4px; appearance: none;"
        />
      </div>

      <!-- Saturation Slider -->
      <div class="flex flex-col gap-1">
        <div class="flex justify-between text-xs text-on-surface-variant">
          <span>{store.settings.language === 'Deutsch' ? 'Sättigung' : 'Saturation'}</span>
          <span>{pickerSat}%</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="100" 
          bind:value={pickerSat}
          class="w-full accent-primary"
          style="background: linear-gradient(to right, hsl({pickerHue}, 0%, 50%), hsl({pickerHue}, 100%, 50%)); height: 8px; border-radius: 4px; appearance: none;"
        />
      </div>

      <!-- Lightness Slider -->
      <div class="flex flex-col gap-1">
        <div class="flex justify-between text-xs text-on-surface-variant">
          <span>{store.settings.language === 'Deutsch' ? 'Helligkeit' : 'Lightness'}</span>
          <span>{pickerLight}%</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="100" 
          bind:value={pickerLight}
          class="w-full accent-primary"
          style="background: linear-gradient(to right, black, hsl({pickerHue}, {pickerSat}%, 50%), white); height: 8px; border-radius: 4px; appearance: none;"
        />
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-end gap-2 mt-2">
        <button 
          onclick={() => showColorPickerPopup = false}
          class="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-surface-container transition-colors border-0 bg-transparent text-outline cursor-pointer"
        >
          {t('common.cancel') || 'Abbrechen'}
        </button>
        <button 
          onclick={confirmColorPicker}
          class="px-4 py-2 text-xs font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors border-0 cursor-pointer"
        >
          OK
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-transition {
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                border-radius 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                padding 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                background-color 0.2s ease;
  }
</style>
