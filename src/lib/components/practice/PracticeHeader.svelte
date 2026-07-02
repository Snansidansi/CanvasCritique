<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';

  let {
    task,
    canvasMode,
    showCanvas = $bindable(true),
    showText = $bindable(false),
    pages = $bindable(),
    activePageIndex = $bindable(),
    strokeHistory,
    redoStack,
    eraserUndoStack,
    zoomScale = $bindable(),
    panOffset = $bindable(),
    showTask = $bindable(),
    showSolution = $bindable(),
    showFeedback = $bindable(),
    hasCheckedWork,
    activeTooltipMarker = $bindable(),
    handleBack,
    handleUndo,
    handleRedo,
    checkWork
  } = $props();

  let currentTaskIndex = $derived(
    store.activeProject?.tasks?.findIndex(t => t.id === task.id) ?? -1
  );
</script>

<header class="bg-surface border-b border-outline-variant flex items-center justify-between w-full px-6 py-3 shrink-0 z-20 select-none gap-4">
  <!-- Left: Back link and Title -->
  <div class="flex items-center gap-3 min-w-0 shrink-0">
    <button 
      onclick={handleBack}
      class="material-symbols-outlined text-primary hover:bg-surface-container-high p-1.5 rounded-lg cursor-pointer focus:outline-none flex items-center justify-center"
      title={t('practice.backToProject')}
    >
      arrow_back
    </button>
    <h1 class="font-bold text-base text-primary truncate max-w-50">{task.name}</h1>
    <button 
      onclick={() => store.updateTask(store.activeProject.id, task.id, { completed: !task.completed })}
      class="ml-1 flex items-center justify-center p-1 rounded-full border border-outline-variant hover:bg-surface-container-high transition-colors focus:outline-none cursor-pointer {task.completed ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : 'text-on-surface-variant'}"
      title={task.completed ? t('practice.markIncomplete') : t('practice.markCompleted')}
    >
      <span class="material-symbols-outlined text-[18px]">
        {task.completed ? 'check_circle' : 'radio_button_unchecked'}
      </span>
    </button>

    <!-- Task Navigation Buttons -->
    {#if store.activeProject?.tasks?.length > 1}
      <div class="flex items-center gap-0.5 border-l border-outline-variant/30 pl-2 ml-1">
        <button 
          onclick={() => {
            if (currentTaskIndex > 0) {
              store.selectTask(store.activeProject.tasks[currentTaskIndex - 1]);
            }
          }}
          disabled={currentTaskIndex <= 0}
          class="p-1 text-on-surface-variant hover:bg-surface-container-high rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed focus:outline-none flex items-center justify-center"
          title={t('practice.prevTask')}
        >
          <span class="material-symbols-outlined text-base">chevron_left</span>
        </button>
        <button 
          onclick={() => {
            if (currentTaskIndex < store.activeProject.tasks.length - 1) {
              store.selectTask(store.activeProject.tasks[currentTaskIndex + 1]);
            }
          }}
          disabled={currentTaskIndex >= store.activeProject.tasks.length - 1}
          class="p-1 text-on-surface-variant hover:bg-surface-container-high rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed focus:outline-none flex items-center justify-center"
          title={t('practice.nextTask')}
        >
          <span class="material-symbols-outlined text-base">chevron_right</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- Center: Premium Practice Controls Toolbar -->
  <div class="flex items-center gap-4 text-xs font-semibold text-on-surface-variant flex-wrap justify-center">
    
    <!-- Mode Switcher (Canvas / Text Editor) -->
    <div class="flex items-center gap-1 border-r border-outline-variant/30 pr-4">
      <div class="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant">
        <button 
          onclick={() => showCanvas = !showCanvas}
          class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer focus:outline-none border-0
                 {showCanvas ? 'bg-primary text-white shadow-sm font-bold' : 'text-on-surface-variant hover:text-on-surface bg-transparent'}"
          title={t('practice.modeCanvas')}
        >
          <span class="material-symbols-outlined text-sm">brush</span>
          <span>{t('practice.modeCanvasLabel')}</span>
        </button>
        <button 
          onclick={() => showText = !showText}
          class="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer focus:outline-none border-0
                 {showText ? 'bg-primary text-white shadow-sm font-bold' : 'text-on-surface-variant hover:text-on-surface bg-transparent'}"
          title={t('practice.modeText')}
        >
          <span class="material-symbols-outlined text-sm">edit_note</span>
          <span>{t('practice.modeTextLabel')}</span>
        </button>
      </div>
    </div>

    {#if showCanvas}
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
          title={t('practice.zoomOut')}
        >
          <span class="material-symbols-outlined text-base">zoom_out</span>
        </button>
        
        <button
          onclick={() => {
            zoomScale = 1;
            panOffset = { x: 0, y: 0 };
          }}
          class="px-2 py-1 text-[10px] text-on-surface hover:bg-surface-container-high rounded font-semibold select-none cursor-pointer transition-colors"
          title={t('practice.resetZoom')}
        >
          {Math.round(zoomScale * 100)}%
        </button>
        
        <button 
          onclick={() => {
            zoomScale = Math.min(4.0, zoomScale + 0.1);
          }}
          disabled={zoomScale >= 4.0}
          class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer flex items-center justify-center"
          title={t('practice.zoomIn')}
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
            title={t('practice.prevPage')}
          >
            <span class="material-symbols-outlined text-base">navigate_before</span>
          </button>
          
          <span class="text-xs text-on-surface-variant font-semibold select-none">
            {t('practice.pageOf', { current: activePageIndex + 1, total: pages.length })}
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
            title={t('practice.nextPage')}
          >
            <span class="material-symbols-outlined text-base">navigate_next</span>
          </button>
          
          <button 
            onclick={() => {
              pages.push({
                id: 'page-' + Date.now(),
                strokeHistory: [],
                redoStack: [],
                eraserUndoStack: []
              });
              activePageIndex = pages.length - 1;
              activeTooltipMarker = null;
            }}
            class="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors focus:outline-none cursor-pointer flex items-center justify-center"
            title={t('practice.addPage')}
          >
            <span class="material-symbols-outlined text-base">note_add</span>
          </button>

          {#if pages.length > 1}
            <button 
              onclick={() => {
                store.confirm(
                  t('practice.deletePage'),
                  t('practice.deletePageConfirm', { page: activePageIndex + 1 }),
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
              title={t('practice.deletePage')}
            >
              <span class="material-symbols-outlined text-base">delete</span>
            </button>
          {/if}
        </div>
      {/if}

      <!-- Stylus Mode Toggle -->
      <div class="flex items-center gap-1 border-r border-outline-variant/30 pr-4">
        <button 
          onclick={() => {
            store.settings.stylusMode = !store.settings.stylusMode;
            store.saveSettings();
          }}
          class="px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none cursor-pointer transition-all flex items-center gap-1
                 {store.settings.stylusMode ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}"
          title={t('practice.toggleStylusMode')}
        >
          <span class="material-symbols-outlined text-base">draw</span>
          <span>{t('practice.stylusMode')}</span>
        </button>
      </div>
    {/if}

    <!-- Split layout visibility toggles -->
    <div class="flex items-center gap-1">
      <button 
        onclick={() => showTask = !showTask}
        class="px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none cursor-pointer transition-all flex items-center gap-1
               {showTask ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}"
        title={t('practice.toggleInstructions')}
      >
        <span class="material-symbols-outlined text-base">menu_book</span>
        <span>{t('practice.taskLabel')}</span>
      </button>

      <button 
        onclick={() => showSolution = !showSolution}
        class="px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none cursor-pointer transition-all flex items-center gap-1
               {showSolution ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}"
        title={t('practice.toggleSolution')}
      >
        <span class="material-symbols-outlined text-base">visibility</span>
        <span>{t('practice.solutionLabel')}</span>
      </button>

      {#if hasCheckedWork}
        <button 
          onclick={() => {
            showFeedback = !showFeedback;
          }}
          class="px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none cursor-pointer transition-all flex items-center gap-1
                 {showFeedback ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}"
          title={t('practice.toggleCritique')}
        >
          <span class="material-symbols-outlined text-base">neurology</span>
          <span>{t('practice.critiqueLabel')}</span>
        </button>
      {/if}
    </div>

  </div>

  <!-- Right side: Undo / Redo & Check Work Actions -->
  <div class="flex items-center gap-3 shrink-0">
    {#if showCanvas}
      <div class="flex items-center gap-1 border-r border-outline-variant/30 pr-3">
        <button 
          onclick={handleUndo} 
          disabled={strokeHistory.length === 0 && eraserUndoStack.length === 0}
          class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer flex items-center justify-center"
          title={t('practice.undo')}
        >
          <span class="material-symbols-outlined text-base">undo</span>
        </button>
        <button 
          onclick={handleRedo} 
          disabled={redoStack.length === 0}
          class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-40 focus:outline-none cursor-pointer flex items-center justify-center"
          title={t('practice.redo')}
        >
          <span class="material-symbols-outlined text-base">redo</span>
        </button>
      </div>
    {/if}

    <button 
      onclick={checkWork}
      class="bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold hover:shadow-md active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none"
    >
      <span class="material-symbols-outlined text-[16px]">neurology</span>
      <span>{t('practice.checkWork')}</span>
    </button>
  </div>
</header>
