<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';

  let {
    task,
    canvasMode,
    showCanvas = $bindable(true),
    showText = $bindable(false),
    showMultipleChoice = $bindable(false),
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

  let showAttemptsMenu = $state(false);
  let editingAttemptId = $state<string | null>(null);
  let editNameValue = $state('');
  let showEditorMenu = $state(false);
  
  const activeAttempt = $derived(
    task.attempts?.find(a => a.id === task.activeAttemptId)
  );
  
  function handleDocumentClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (showAttemptsMenu && !target.closest('.attempts-menu-container')) {
      showAttemptsMenu = false;
      editingAttemptId = null;
    }
    if (showEditorMenu && !target.closest('.editor-menu-container')) {
      showEditorMenu = false;
    }
  }

  function focusInput(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  async function saveRename(attemptId: string) {
    if (editNameValue.trim() && store.activeProject) {
      await store.renameAttempt(store.activeProject.id, task.id, attemptId, editNameValue.trim());
      editingAttemptId = null;
    }
  }
</script>

<svelte:window onclick={handleDocumentClick} />

<header class="bg-surface border-b border-outline-variant flex items-center justify-between w-full px-6 py-3 shrink-0 z-30 select-none gap-4">
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

    <!-- Attempts Switcher -->
    <div class="relative attempts-menu-container ml-1 border-l border-outline-variant/30 pl-2">
      <button 
        onclick={() => showAttemptsMenu = !showAttemptsMenu}
        class="px-2.5 py-1 rounded-lg border border-outline-variant hover:bg-surface-container-high text-xs font-semibold text-on-surface-variant flex items-center gap-1.5 cursor-pointer focus:outline-none transition-colors"
        title={t('practice.attemptsTitle')}
      >
        <span class="material-symbols-outlined text-sm">history</span>
        <span class="truncate max-w-24">{activeAttempt?.name || (store.settings.language === 'Deutsch' ? 'Versuch 1' : 'Try 1')}</span>
        <span class="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
      </button>

      {#if showAttemptsMenu}
        <div class="absolute top-full left-0 mt-1.5 w-60 bg-surface border border-outline-variant rounded-xl shadow-xl z-50 flex flex-col animate-fade-in font-sans">
          <div class="px-3.5 py-2.5 border-b border-outline-variant/30 text-xs font-bold text-primary flex items-center gap-1.5">
            <span class="material-symbols-outlined text-sm">history</span>
            <span>{t('practice.attemptsTitle')}</span>
          </div>

          <div class="max-h-48 overflow-y-auto py-1.5 flex flex-col">
            {#each task.attempts || [] as attempt}
              <div 
                class="flex items-center justify-between px-3 py-1.5 hover:bg-surface-container-low transition-colors group cursor-pointer text-xs
                       {task.activeAttemptId === attempt.id ? 'bg-primary/5 text-primary font-semibold' : 'text-on-surface'}"
                onclick={() => {
                  if (editingAttemptId !== attempt.id) {
                    store.selectAttempt(store.activeProject.id, task.id, attempt.id);
                    showAttemptsMenu = false;
                  }
                }}
                role="button"
                tabindex="0"
                onkeydown={(e) => {
                  if (e.key === 'Enter' && editingAttemptId !== attempt.id) {
                    store.selectAttempt(store.activeProject.id, task.id, attempt.id);
                    showAttemptsMenu = false;
                  }
                }}
              >
                <div class="flex items-center gap-2 min-w-0 grow">
                  <span class="material-symbols-outlined text-xs shrink-0">
                    {task.activeAttemptId === attempt.id ? 'radio_button_checked' : 'radio_button_unchecked'}
                  </span>
                  
                  {#if editingAttemptId === attempt.id}
                    <div class="flex items-center gap-1 min-w-0 grow" onclick={e => e.stopPropagation()} role="presentation">
                      <input
                        type="text"
                        bind:value={editNameValue}
                        onkeydown={(e) => {
                          if (e.key === 'Enter') {
                            saveRename(attempt.id);
                          } else if (e.key === 'Escape') {
                            editingAttemptId = null;
                          }
                        }}
                        class="bg-surface-container border border-primary px-1.5 py-0.5 rounded text-[11px] text-on-surface focus:outline-none w-28 grow"
                        use:focusInput
                      />
                      <button 
                        onclick={() => saveRename(attempt.id)} 
                        class="material-symbols-outlined text-xs text-primary hover:bg-surface-container p-0.5 rounded border-0 bg-transparent cursor-pointer flex items-center justify-center"
                      >check</button>
                      <button 
                        onclick={() => editingAttemptId = null} 
                        class="material-symbols-outlined text-xs text-on-surface-variant hover:bg-surface-container p-0.5 rounded border-0 bg-transparent cursor-pointer flex items-center justify-center"
                      >close</button>
                    </div>
                  {:else}
                    <span class="truncate pr-2">{attempt.name}</span>
                  {/if}
                </div>

                {#if editingAttemptId !== attempt.id}
                  <div class="flex items-center gap-0.5 shrink-0" onclick={e => e.stopPropagation()} role="presentation">
                    <button 
                      onclick={() => {
                        editingAttemptId = attempt.id;
                        editNameValue = attempt.name;
                      }}
                      class="material-symbols-outlined text-xs text-on-surface-variant hover:text-primary p-1 hover:bg-surface-container rounded opacity-0 group-hover:opacity-100 transition-opacity border-0 bg-transparent cursor-pointer flex items-center justify-center"
                      title={store.settings.language === 'Deutsch' ? 'Umbenennen' : 'Rename'}
                    >edit</button>
                    {#if task.attempts && task.attempts.length > 1}
                      <button
                        onclick={() => {
                          store.confirm(
                            t('practice.attemptsDeleteTitle'),
                            t('practice.attemptsDeleteConfirm', { name: attempt.name }),
                            () => {
                              store.deleteAttempt(store.activeProject.id, task.id, attempt.id);
                            }
                          );
                        }}
                        class="material-symbols-outlined text-xs text-error hover:bg-error/10 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity border-0 bg-transparent cursor-pointer flex items-center justify-center"
                        title={t('practice.attemptsDeleteTitle')}
                      >delete</button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <button
            onclick={() => {
              store.createAttempt(store.activeProject.id, task.id);
              showAttemptsMenu = false;
            }}
            class="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5 border-t border-outline-variant/30 transition-colors border-0 bg-transparent cursor-pointer rounded-b-xl"
          >
            <span class="material-symbols-outlined text-sm">add</span>
            <span>{t('practice.attemptsNew')}</span>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Center: Premium Practice Controls Toolbar -->
  <div class="flex items-center gap-4 text-xs font-semibold text-on-surface-variant flex-wrap justify-center font-sans">
    
    <!-- Editor Mode Switcher Dropdown -->
    <div class="relative editor-menu-container border-r border-outline-variant/30 pr-4">
      <button 
        onclick={() => showEditorMenu = !showEditorMenu}
        class="px-2.5 py-1.5 rounded-lg border border-outline-variant hover:bg-surface-container-high text-xs font-semibold text-on-surface-variant flex items-center gap-1.5 cursor-pointer focus:outline-none transition-all"
        title={store.settings.language === 'Deutsch' ? 'Editor-Ansicht' : 'Editor View'}
      >
        <span class="material-symbols-outlined text-sm">edit_square</span>
        <span>{store.settings.language === 'Deutsch' ? 'Editor' : 'Editor'}</span>
        <span class="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
      </button>

      {#if showEditorMenu}
        <div class="absolute top-full left-0 mt-1.5 w-48 bg-surface border border-outline-variant rounded-xl shadow-xl z-50 flex flex-col py-1.5 animate-fade-in text-xs font-sans">
          <!-- Canvas Toggle -->
          <label 
            class="flex items-center justify-between px-3 py-2 hover:bg-surface-container-low transition-colors cursor-pointer select-none font-medium text-on-surface"
          >
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-base text-on-surface-variant">brush</span>
              <span>{t('practice.modeCanvasLabel') || (store.settings.language === 'Deutsch' ? 'Zeichenfläche' : 'Canvas')}</span>
            </div>
            <input 
              type="checkbox" 
              checked={showCanvas} 
              onchange={(e) => {
                showCanvas = e.currentTarget.checked;
              }}
              class="accent-primary h-4 w-4 cursor-pointer"
            />
          </label>

          <!-- Text Editor Toggle -->
          <label 
            class="flex items-center justify-between px-3 py-2 hover:bg-surface-container-low transition-colors cursor-pointer select-none font-medium text-on-surface"
          >
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-base text-on-surface-variant">edit_note</span>
              <span>{t('practice.modeTextLabel') || (store.settings.language === 'Deutsch' ? 'Texteditor' : 'Text Editor')}</span>
            </div>
            <input 
              type="checkbox" 
              checked={showText} 
              onchange={(e) => {
                showText = e.currentTarget.checked;
              }}
              class="accent-primary h-4 w-4 cursor-pointer"
            />
          </label>

          <!-- Multiple Choice Toggle -->
          {#if task.multipleChoiceTasks && task.multipleChoiceTasks.length > 0}
            <label 
              class="flex items-center justify-between px-3 py-2 hover:bg-surface-container-low transition-colors cursor-pointer select-none font-medium text-on-surface"
            >
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-base text-on-surface-variant">rule</span>
                <span>{t('practice.modeMultipleChoiceLabel') || (store.settings.language === 'Deutsch' ? 'Multiple Choice' : 'Multiple Choice')}</span>
              </div>
              <input 
                type="checkbox" 
                checked={showMultipleChoice} 
                onchange={(e) => {
                  showMultipleChoice = e.currentTarget.checked;
                }}
                class="accent-primary h-4 w-4 cursor-pointer"
              />
            </label>
          {/if}
        </div>
      {/if}
    </div>

    {#if showCanvas}
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
