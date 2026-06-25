<script>
  import { store } from '../../state/store.svelte';

  let {
    task,
    canvasMode,
    pages = $bindable(),
    activePageIndex = $bindable(),
    strokeHistory,
    redoStack,
    activeBg = $bindable(),
    bgOpacity = $bindable(),
    zoomScale = $bindable(),
    panOffset = $bindable(),
    showTask = $bindable(),
    showSolution = $bindable(),
    showFeedback = $bindable(),
    hasCheckedWork,
    activeTooltipMarker = $bindable(),
    isCustomBgModalOpen = $bindable(),
    handleBack,
    handleUndo,
    handleRedo,
    clearCanvas,
    checkWork
  } = $props();

  let bgDropdownOpen = $state(false);

  let currentBgObject = $derived(
    store.customBackgrounds.find(bg => bg.id === activeBg)
  );

  function saveToStore() {
    // Note: The parent component should handle saving to store when relevant values change.
    // However, some UI events here might require manual trigger.
  }
</script>

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
    <h1 class="font-bold text-base text-primary truncate max-w-50">{task.name}</h1>
    <button 
      onclick={() => store.updateTask(store.activeProject.id, task.id, { completed: !task.completed })}
      class="ml-1 flex items-center justify-center p-1 rounded-full border border-outline-variant hover:bg-surface-container-high transition-colors focus:outline-none cursor-pointer {task.completed ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : 'text-on-surface-variant'}"
      title={task.completed ? "Mark Incomplete" : "Mark Completed"}
    >
      <span class="material-symbols-outlined text-[18px]">
        {task.completed ? 'check_circle' : 'radio_button_unchecked'}
      </span>
    </button>
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
        <div class="absolute top-[calc(100%+4px)] left-0 bg-surface-container-high border border-outline-variant rounded-lg shadow-lg z-50 py-1 min-w-50 max-h-60 overflow-y-auto custom-scrollbar">
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
                  class="grow text-left px-2 py-2 text-xs flex items-center gap-2 cursor-pointer {activeBg === customBg.id ? 'bg-primary/5 text-primary font-bold' : 'text-on-surface'}"
                >
                  {#if customBg.icon && customBg.icon.startsWith('data:image/')}
                    <img src={customBg.icon} class="w-4 h-4 object-contain rounded" alt="" />
                  {:else}
                    <span class="material-symbols-outlined text-base">image</span>
                  {/if}
                  <span class="truncate max-w-30">{customBg.name}</span>
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
          onclick={() => {
            showFeedback = !showFeedback;
          }}
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
