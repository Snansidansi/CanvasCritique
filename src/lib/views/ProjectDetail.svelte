<script lang="ts">
  import { store, type Project } from '../state/store.svelte';
  import TaskSelectionBar from '../components/project/TaskSelectionBar.svelte';
  import LessonSettingsModal from '../components/project/LessonSettingsModal.svelte';

  // Derived project state from store
  let project = $derived(store.activeProject || ({
    id: '',
    name: 'No Lesson Selected',
    icon: 'history_edu',
    guidelines: '',
    categories: [],
    tasks: [],
    profileId: ''
  } as Project));

  // Lesson settings modal open state
  let showSettingsOverrideModal = $state(false);

  // Categories list
  let categories = $derived(project.categories || []);

  // Local state for category addition
  let newCategoryName = $state('');
  let isAddCategoryOpen = $state(false);

  // Pointer-based drag state
  let draggedTaskId = $state<string | null>(null);
  let draggedCategory = $state<string | null>(null);
  let dragGhostEl = $state<HTMLElement | null>(null);
  let dragPointerStartX = 0;
  let dragPointerStartY = 0;
  let dragGhostOffsetX = 0;
  let dragGhostOffsetY = 0;
  let dragSourceEl: HTMLElement | null = null;
  let isDragActive = $state(false);
  let dropIndicatorCategory = $state<string | null>(null);
  let dropIndicatorIndex = $state<number | null>(null);

  // Selection mode states
  let isSelectionMode = $state(false);
  let selectedTaskIds = $state(new Set<string>());

  // Task Import (Step 5)
  let taskFileInput: HTMLInputElement | null = $state(null);

  function handleImportTasksFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result as string);
        store.importProject(imported, project.id);
      } catch (err) {
        alert("Failed to parse file. Make sure it is valid JSON.");
      }
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = "";
  }

  // Derived progress rune
  let progress = $derived(getProjectProgress());

  function handleBack() {
    store.setView('dashboard');
  }

  function handleAddTask() {
    store.setView('task-editor');
  }

  function handleAddTaskInCategory(category: string) {
    store.quickAddTaskData = { name: '', category };
    store.setView('task-editor');
  }

  function handleEditTask(task) {
    store.setEditingTask(task);
  }

  function openPractice(task) {
    store.selectTask(task);
  }

  function handleAddCategorySubmit(e) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    store.addCategory(project.id, newCategoryName.trim());
    newCategoryName = '';
    isAddCategoryOpen = false;
  }

  function getCategoryTasks(cat) {
    const tasks = project.tasks.filter(t => (t.category || 'Basics') === cat);
    return project.hideCompleted ? tasks.filter(t => !t.completed) : tasks;
  }

  function getProjectProgress() {
    if (!project.tasks || project.tasks.length === 0) return 0;
    const completed = project.tasks.filter(t => t.completed).length;
    return Math.round((completed / project.tasks.length) * 100);
  }

  // Pointer-based drag & drop (works with touch, stylus, and mouse)
  function handleTaskPointerDown(e: PointerEvent, taskId: string, category: string) {
    if (isSelectionMode) return;
    // Only react to primary pointer (left mouse / single touch / stylus)
    if (e.button !== 0 && e.button !== -1) return;

    const target = e.currentTarget as HTMLElement;
    // Ignore drags starting on interactive children (buttons, checkboxes)
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;

    e.preventDefault();

    dragPointerStartX = e.clientX;
    dragPointerStartY = e.clientY;
    dragSourceEl = target;

    // Use pointer capture so move/up events always reach this element
    try { target.setPointerCapture(e.pointerId); } catch (_) {}

    function onMove(me: PointerEvent) {
      const dx = me.clientX - dragPointerStartX;
      const dy = me.clientY - dragPointerStartY;

      // Only start drag after a small movement threshold
      if (!isDragActive && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        isDragActive = true;
        draggedTaskId = taskId;
        draggedCategory = category;

        // Create ghost element
        const ghost = target.cloneNode(true) as HTMLElement;
        const rect = target.getBoundingClientRect();
        ghost.style.cssText = `
          position: fixed;
          pointer-events: none;
          z-index: 9999;
          width: ${rect.width}px;
          opacity: 0.85;
          left: ${rect.left}px;
          top: ${rect.top}px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          border-radius: 0.5rem;
          transform: scale(1.02);
          transition: none;
        `;
        dragGhostOffsetX = me.clientX - rect.left;
        dragGhostOffsetY = me.clientY - rect.top;
        document.body.appendChild(ghost);
        dragGhostEl = ghost;
      }

      if (!isDragActive) return;

      // Move ghost
      if (dragGhostEl) {
        dragGhostEl.style.left = `${me.clientX - dragGhostOffsetX}px`;
        dragGhostEl.style.top  = `${me.clientY - dragGhostOffsetY}px`;
      }

      // Hit-test to find the drop target
      if (dragGhostEl) dragGhostEl.style.display = 'none';
      const el = document.elementFromPoint(me.clientX, me.clientY);
      if (dragGhostEl) dragGhostEl.style.display = '';

      const taskRow = el?.closest('[data-task-id]') as HTMLElement | null;
      const catContainer = el?.closest('[data-category-container]') as HTMLElement | null;

      if (taskRow && taskRow.dataset.taskId !== draggedTaskId) {
        dropIndicatorCategory = taskRow.dataset.taskCategory || null;
        dropIndicatorIndex = parseInt(taskRow.dataset.taskIndex || '0', 10);
      } else if (catContainer && !taskRow) {
        dropIndicatorCategory = catContainer.dataset.categoryContainer || null;
        const tasks = getCategoryTasks(dropIndicatorCategory || '');
        dropIndicatorIndex = tasks.length;
      } else {
        dropIndicatorCategory = null;
        dropIndicatorIndex = null;
      }
    }

    function onUp(ue: PointerEvent) {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      try { target.releasePointerCapture(ue.pointerId); } catch (_) {}

      // Clean up ghost
      if (dragGhostEl) {
        dragGhostEl.remove();
        dragGhostEl = null;
      }

      if (isDragActive && draggedTaskId && dropIndicatorCategory !== null && dropIndicatorIndex !== null) {
        store.moveAndReorderTask(project.id, draggedTaskId, dropIndicatorCategory, dropIndicatorIndex);
      } else if (!isDragActive) {
        // Was a click, not a drag — open practice
        const task = project.tasks.find(t => t.id === taskId);
        if (task) openPractice(task);
      }

      isDragActive = false;
      draggedTaskId = null;
      draggedCategory = null;
      dropIndicatorCategory = null;
      dropIndicatorIndex = null;
      dragSourceEl = null;
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }
  // Guidelines state
  let guidelinesExpanded = $state(false);
  let guidelinesDebounce = null;

  function handleGuidelinesChange(e) {
    const value = e.target.value;
    if (guidelinesDebounce) clearTimeout(guidelinesDebounce);
    guidelinesDebounce = setTimeout(() => {
      store.updateProjectGuidelines(project.id, value);
    }, 500);
  }

  function autoResize(node, _val) {
    const update = () => {
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    };
    const timer = setTimeout(update, 0);
    node.addEventListener('input', update);
    return {
      update() {
        update();
      },
      destroy() {
        clearTimeout(timer);
        node.removeEventListener('input', update);
      }
    };
  }

  function handleDeleteSelected() {
    if (selectedTaskIds.size === 0) return;
    store.confirm(
      "Delete Selected Tasks",
      `Are you sure you want to delete the ${selectedTaskIds.size} selected tasks? This will permanently delete them and their canvas drawing history.`,
      () => {
        store.deleteTasks(project.id, Array.from(selectedTaskIds));
        selectedTaskIds.clear();
        selectedTaskIds = new Set<string>();
        isSelectionMode = false;
      }
    );
  }

  function handleExportSelected() {
    if (selectedTaskIds.size === 0) return;
    const selectedTasks = project.tasks.filter(t => selectedTaskIds.has(t.id));
    store.exportTasks(project, selectedTasks);
    selectedTaskIds.clear();
    selectedTaskIds = new Set<string>();
    isSelectionMode = false;
  }

  function toggleSelectTask(taskId: string) {
    if (selectedTaskIds.has(taskId)) {
      selectedTaskIds.delete(taskId);
    } else {
      selectedTaskIds.add(taskId);
    }
    selectedTaskIds = new Set(selectedTaskIds);
  }

  function handleRowClick(e: MouseEvent, task: any) {
    if (
      (e.target as HTMLElement).closest('button') || 
      (e.target as HTMLElement).closest('input[type="checkbox"]')
    ) {
      return;
    }
    if (isSelectionMode) {
      toggleSelectTask(task.id);
    } else {
      openPractice(task);
    }
  }

  // Name and Image Editing logic
  let isEditingName = $state(false);
  let editNameValue = $state('');

  function startNameEdit() {
    if (project.id === 'No Lesson Selected') return;
    editNameValue = project.name;
    isEditingName = true;
  }

  function saveNameEdit() {
    if (!isEditingName) return;
    const trimmed = editNameValue.trim();
    if (trimmed && trimmed !== project.name) {
      store.updateProjectDetails(project.id, { name: trimmed });
    }
    isEditingName = false;
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      saveNameEdit();
    } else if (e.key === 'Escape') {
      isEditingName = false;
    }
  }

  function triggerImageUpload() {
    if (project.id === 'No Lesson Selected') return;
    const fileInput = document.getElementById('project-image-upload') as HTMLInputElement;
    if (fileInput) fileInput.click();
  }

  function handleImageUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      store.updateProjectDetails(project.id, { icon: dataUrl });
    };
    reader.readAsDataURL(file);
    (e.target as HTMLInputElement).value = '';
  }

  function selectAndFocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<!-- TopAppBar -->
<header class="h-16 px-4 md:px-8 border-b border-outline-variant bg-surface flex justify-between items-center z-10 shrink-0 select-none">
  <div class="flex items-center gap-2 md:gap-4 min-w-0">
    <button 
      onclick={handleBack}
      class="material-symbols-outlined text-primary hover:bg-surface-container-high p-2 rounded-full -ml-2 focus:outline-none cursor-pointer"
      title="Back to Dashboard"
    >
      arrow_back
    </button>
    
    <div class="flex items-center gap-2 md:gap-3 min-w-0">
      <input
        type="file"
        accept="image/*"
        class="hidden"
        id="project-image-upload"
        onchange={handleImageUpload}
      />
      {#if project.id !== 'No Lesson Selected'}
        <button
          type="button"
          onclick={triggerImageUpload}
          class="group relative w-10 h-10 flex items-center justify-center bg-secondary-container text-on-secondary-container rounded-lg shrink-0 overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary focus:outline-none transition-all"
          title="Click to change lesson image"
        >
          {#if project.icon && project.icon.startsWith('data:image/')}
            <img src={project.icon} class="w-8 h-8 object-contain rounded transition-all group-hover:scale-95 group-hover:opacity-50" alt="" />
          {:else}
            <span class="material-symbols-outlined text-[20px] transition-all group-hover:opacity-50">{project.icon || 'history_edu'}</span>
          {/if}
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span class="material-symbols-outlined text-white text-[18px]">photo_camera</span>
          </div>
        </button>
      {:else}
        <div class="w-10 h-10 flex items-center justify-center bg-secondary-container text-on-secondary-container rounded-lg shrink-0">
          <span class="material-symbols-outlined text-[20px]">{project.icon || 'history_edu'}</span>
        </div>
      {/if}

      {#if isEditingName}
        <input
          type="text"
          bind:value={editNameValue}
          onblur={saveNameEdit}
          onkeydown={handleNameKeydown}
          class="font-bold text-lg text-on-surface bg-surface-container border-b border-primary px-1 py-0.5 rounded focus:outline-none w-64 max-w-full"
          use:selectAndFocus
        />
      {:else}
        {#if project.id !== 'No Lesson Selected'}
          <button
            type="button"
            onclick={startNameEdit}
            class="group flex items-center gap-1.5 font-bold text-lg text-on-surface hover:text-primary transition-colors cursor-pointer text-left focus:outline-none focus:underline min-w-0"
            title="Click to rename lesson"
          >
            <span class="truncate">{project.name}</span>
            <span class="material-symbols-outlined text-[16px] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity text-outline-variant">edit</span>
          </button>
        {:else}
          <h1 class="font-bold text-lg text-on-surface truncate">{project.name}</h1>
        {/if}
      {/if}
    </div>
  </div>

  <div class="flex items-center gap-1.5 md:gap-3">
    <!-- Hide Completed Toggle -->
    {#if project.id !== 'No Lesson Selected'}
      <label class="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer select-none border border-outline-variant/40 bg-surface-container-low px-2.5 md:px-3 py-2.5 rounded-lg hover:bg-surface-container transition-all" title="Hide Completed Tasks">
        <input 
          type="checkbox" 
          checked={project.hideCompleted || false} 
          onchange={(e) => {
            project.hideCompleted = (e.target as HTMLInputElement).checked;
            store.saveProjects();
          }}
          class="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 cursor-pointer"
        />
        <span class="hidden xl:inline">Hide Completed</span>
      </label>
    {/if}

    <!-- Export Lesson Button -->
    <button 
      onclick={() => store.exportProject(project)}
      class="bg-surface-container-low text-on-surface border border-outline-variant font-semibold text-xs py-2.5 px-2.5 md:px-4 rounded-lg hover:bg-surface-container transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm focus:outline-none"
      title="Export Lesson"
    >
      <span class="material-symbols-outlined text-[18px]">file_download</span>
      <span class="hidden xl:inline">Export Lesson</span>
    </button>

    <!-- Lesson Settings Override Button -->
    {#if project.id !== 'No Lesson Selected'}
      <button 
        onclick={() => showSettingsOverrideModal = true}
        class="bg-surface-container-low text-on-surface border border-outline-variant font-semibold text-xs py-2.5 px-2.5 md:px-4 rounded-lg hover:bg-surface-container transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm focus:outline-none"
        title="Lesson AI & Evaluation Settings"
      >
        <span class="material-symbols-outlined text-[18px]">settings</span>
        <span class="hidden xl:inline">Settings</span>
      </button>
    {/if}

    <!-- Selection Mode Toggle (Step 3) -->
    {#if project.id !== 'No Lesson Selected' && project.tasks.length > 0}
      <button 
        onclick={() => {
          isSelectionMode = !isSelectionMode;
          selectedTaskIds.clear();
          selectedTaskIds = new Set<string>();
        }}
        class="font-semibold text-xs py-2.5 px-2.5 md:px-4 rounded-lg border transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm focus:outline-none
               {isSelectionMode ? 'bg-primary/10 text-primary border-primary hover:bg-primary/20' : 'bg-surface-container-low text-on-surface border-outline-variant hover:bg-surface-container'}"
        title="Toggle Selection Mode"
      >
        <span class="material-symbols-outlined text-[18px]">checklist</span>
        <span class="hidden xl:inline">{isSelectionMode ? 'Cancel Selection' : 'Select Tasks'}</span>
      </button>
    {/if}

    <!-- Inline Create New Task -->
    <button 
      onclick={handleAddTask}
      class="bg-primary text-on-primary font-semibold text-xs py-2.5 px-2.5 md:px-4 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm focus:outline-none"
      title="Create New Task"
    >
      <span class="material-symbols-outlined text-[18px]">add_circle</span>
      <span class="hidden lg:inline">Create New Task</span>
    </button>
  </div>
</header>

<!-- Main details area -->
<main class="grow overflow-y-auto p-8 flex flex-col gap-8 custom-scrollbar h-full">
  <!-- Stats & Progress banner -->
  <section class="bg-surface p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shrink-0">
    <div class="space-y-1">
      <h2 class="text-xl font-bold text-on-surface">Lesson Overview</h2>
      <p class="text-xs text-on-surface-variant">Reorder tasks by dragging, customize topics, or click a task to open the practice canvas.</p>
    </div>

    <!-- Progress bar widget -->
    <div class="w-full md:w-64 bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col gap-2">
      <div class="flex justify-between items-center text-xs font-bold">
        <span class="text-primary uppercase tracking-wide">Progress</span>
        <span>{progress}%</span>
      </div>
      <div class="w-full bg-surface-variant rounded-full h-2">
        <div class="bg-primary h-2 rounded-full transition-all duration-300" style="width: {progress}%"></div>
      </div>
    </div>
  </section>

  <!-- General Guidelines Section -->
  <section class="bg-surface-container-low border border-outline-variant/60 rounded-xl overflow-hidden shrink-0">
    <button 
      onclick={() => guidelinesExpanded = !guidelinesExpanded}
      class="w-full flex items-center justify-between px-6 py-4 cursor-pointer bg-transparent border-0 text-left focus:outline-none hover:bg-surface-container-lowest/50 transition-colors"
    >
      <div class="flex items-center gap-3">
        <span class="material-symbols-outlined text-[20px] text-primary">description</span>
        <div>
          <h3 class="font-bold text-sm text-on-surface">General Guidelines</h3>
          <p class="text-[11px] text-on-surface-variant mt-0.5">
            These guidelines are sent to the AI for every task in this lesson
          </p>
        </div>
      </div>
      <span class="material-symbols-outlined text-on-surface-variant text-[20px] transition-transform" 
            style="transform: rotate({guidelinesExpanded ? '180' : '0'}deg)">
        expand_more
      </span>
    </button>

    {#if guidelinesExpanded}
      <div class="px-6 pb-5 border-t border-outline-variant/30 pt-4">
        <textarea
          use:autoResize={project.guidelines}
          value={project.guidelines || ''}
          oninput={handleGuidelinesChange}
          placeholder="e.g., Always show your working, write neatly, answers must include units..."
          rows="4"
          class="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary resize-y min-h-20"
        ></textarea>
        <p class="text-[10px] text-on-surface-variant mt-2 flex items-center gap-1">
          <span class="material-symbols-outlined text-[12px]">info</span>
          These instructions will be included when the AI checks the student's work on any task in this lesson.
        </p>
      </div>
    {/if}
  </section>

  <!-- Categories section lists -->
  <section class="flex flex-col gap-6 shrink-0">
    <!-- Category header toolbar (Step 5) -->
    <div class="flex justify-between items-center border-b border-outline-variant pb-2">
      <h3 class="font-bold text-sm text-on-surface uppercase tracking-wider">Lesson Roadmap</h3>
      <div class="flex items-center gap-4">
        <!-- Hidden file input for importing tasks directly -->
        <input
          type="file"
          accept="application/json"
          bind:this={taskFileInput}
          onchange={handleImportTasksFile}
          class="hidden"
        />
        <button 
          onclick={() => taskFileInput?.click()}
          class="text-xs text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer focus:outline-none"
          title="Import tasks into this lesson"
        >
          <span class="material-symbols-outlined text-[16px]">file_upload</span>
          Import Tasks
        </button>

        <button 
          onclick={() => isAddCategoryOpen = true}
          class="text-xs text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer focus:outline-none"
        >
          <span class="material-symbols-outlined text-[16px]">create_new_folder</span>
          Add Custom Topic
        </button>
      </div>
    </div>

    <!-- Dynamic Category Sections -->
    <div class="grid grid-cols-1 gap-6">
      {#each categories as category}
        {@const catTasks = getCategoryTasks(category)}
        <div class="bg-surface-container-low border border-outline-variant/60 rounded-xl p-6 flex flex-col gap-4">
          <div class="flex items-center justify-between border-b border-outline-variant/20 pb-3">
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick={() => {
                  const newName = prompt(`Rename topic "${category}" to:`, category);
                  if (newName && newName.trim() && newName.trim() !== category) {
                    store.renameCategory(project.id, category, newName.trim());
                  }
                }}
                class="text-xs font-bold text-primary uppercase tracking-widest hover:underline cursor-pointer border-0 bg-transparent p-0 text-left focus:outline-none"
                title="Click to rename topic"
              >
                {category}
              </button>

              <button
                type="button"
                onclick={() => {
                  store.confirm(
                    "Delete Topic",
                    `Are you sure you want to delete the topic "${category}"? Any tasks inside will be moved to your default topic.`,
                    () => store.deleteCategory(project.id, category)
                  );
                }}
                class="text-outline hover:text-error transition-colors cursor-pointer border-0 bg-transparent p-0 flex items-center justify-center focus:outline-none"
                title="Delete topic"
              >
                <span class="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-on-surface-variant font-semibold bg-surface px-2.5 py-1 rounded-full border border-outline-variant/30 animate-fade-in">
                {catTasks.length} {catTasks.length === 1 ? 'task' : 'tasks'}
              </span>
              <button
                type="button"
                onclick={() => handleAddTaskInCategory(category)}
                class="flex items-center gap-1 px-3 py-1 bg-primary text-on-primary font-bold text-[11px] rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-sm cursor-pointer focus:outline-none"
                title="Create a new task in this topic"
              >
                <span class="material-symbols-outlined text-[14px]">add</span>
                Add Task
              </button>
            </div>
          </div>

          <!-- Pointer-based draggable task list -->
          <div 
            class="flex flex-col gap-2 min-h-12.5"
            data-category-container={category}
          >
            {#if catTasks.length > 0}
              {#each catTasks as task, index (task.id)}
                <!-- Drop indicator above this row -->
                {#if isDragActive && dropIndicatorCategory === category && dropIndicatorIndex === index}
                  <div class="h-1 rounded-full bg-primary/70 mx-2 transition-all"></div>
                {/if}
                <div 
                  data-task-id={task.id}
                  data-task-category={category}
                  data-task-index={index}
                  onpointerdown={!isSelectionMode ? (e) => handleTaskPointerDown(e, task.id, category) : undefined}
                  onclick={(e) => {
                    if (isSelectionMode) {
                      if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
                      toggleSelectTask(task.id);
                    }
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (!isSelectionMode) openPractice(task);
                      else toggleSelectTask(task.id);
                    }
                  }}
                  role="button"
                  tabindex="0"
                  style="touch-action: none;"
                  class="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-4 flex items-center justify-between group hover:border-primary transition-all duration-150 shadow-sm relative overflow-hidden focus:outline-none focus:border-primary
                         {isSelectionMode ? 'cursor-default' : 'cursor-pointer'}
                         {isDragActive && draggedTaskId === task.id ? 'opacity-40 scale-95' : ''}"
                >
                  <!-- Visual drag indicator or selection checkbox -->
                  <div class="flex items-center gap-3">
                    {#if isSelectionMode}
                      <input 
                        type="checkbox" 
                        checked={selectedTaskIds.has(task.id)}
                        onchange={() => {
                          toggleSelectTask(task.id);
                        }}
                        class="rounded border-outline-variant text-primary focus:ring-primary h-4.5 w-4.5 cursor-pointer mr-1.5"
                      />
                    {:else}
                      <span class="material-symbols-outlined text-outline-variant text-[18px] select-none cursor-grab opacity-40 group-hover:opacity-100 transition-opacity">
                        drag_indicator
                      </span>

                      <button 
                        onclick={(e) => {
                          e.stopPropagation();
                          store.toggleTaskCompleted(project.id, task.id);
                        }}
                        class="text-primary hover:opacity-85 focus:outline-none flex items-center cursor-pointer"
                        title={task.completed ? "Mark incomplete" : "Mark complete"}
                      >
                        <span class="material-symbols-outlined text-[22px]">
                          {task.completed ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                      </button>
                    {/if}

                    <span 
                      class="text-left font-semibold text-sm text-on-surface group-hover:text-primary transition-colors
                             {task.completed && !isSelectionMode ? 'line-through text-outline' : ''}"
                    >
                      {task.name}
                    </span>
                  </div>

                  <!-- Hover actions (Edit, Export & Delete) -->
                  {#if !isSelectionMode}
                    <div class="flex items-center gap-2">
                      <!-- Task Edit Icon -->
                      <button 
                        onclick={(e) => {
                          e.stopPropagation();
                          handleEditTask(task);
                        }}
                        class="text-outline hover:text-primary transition-all px-3 py-1.5 rounded-lg border border-outline-variant/40 hover:bg-surface-container flex items-center gap-1.5 text-xs font-semibold focus:outline-none cursor-pointer duration-100 bg-surface shadow-sm" 
                        title="Edit Task Details"
                      >
                        <span class="material-symbols-outlined text-[16px]">edit</span>
                        Edit
                      </button>
                      <!-- Task Export Icon -->
                      <button 
                        onclick={(e) => {
                          e.stopPropagation();
                          store.exportTasks(project, [task]);
                        }}
                        class="text-outline hover:text-primary transition-all px-3 py-1.5 rounded-lg border border-outline-variant/40 hover:bg-surface-container flex items-center gap-1.5 text-xs font-semibold focus:outline-none cursor-pointer duration-100 bg-surface shadow-sm" 
                        title="Export Task"
                      >
                        <span class="material-symbols-outlined text-[16px]">file_download</span>
                        Export
                      </button>
                      <!-- Task Delete Icon -->
                      <button 
                        onclick={(e) => {
                          e.stopPropagation();
                          store.confirm(
                            "Delete Task",
                            `Are you sure you want to delete "${task.name}"? This will permanently delete the task and its canvas drawing history.`,
                            () => store.deleteTask(project.id, task.id)
                          );
                        }}
                        class="text-outline hover:text-error hover:border-error/40 transition-all px-3 py-1.5 rounded-lg border border-outline-variant/40 hover:bg-surface-container flex items-center gap-1.5 text-xs font-semibold focus:outline-none cursor-pointer duration-100 bg-surface shadow-sm"
                        title="Delete Task"
                      >
                        <span class="material-symbols-outlined text-[16px] text-error">delete</span>
                        Delete
                      </button>
                    </div>
                  {/if}
                </div>
                <!-- Drop indicator after last item -->
                {#if isDragActive && dropIndicatorCategory === category && dropIndicatorIndex === catTasks.length && index === catTasks.length - 1}
                  <div class="h-1 rounded-full bg-primary/70 mx-2 transition-all"></div>
                {/if}
              {/each}
            {:else}
              <div class="border border-dashed border-outline-variant/60 rounded-lg p-5 flex items-center justify-center bg-surface-container-lowest/50 text-xs italic text-on-surface-variant">
                No tasks in this section. Drag tasks here or create one.
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>
</main>

<!-- Add custom category modal -->
{#if isAddCategoryOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm select-none">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-90 shadow-xl flex flex-col gap-4">
      <h3 class="font-bold text-lg text-on-surface">Add Custom Topic Section</h3>
      
      <form onsubmit={handleAddCategorySubmit} class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-on-surface-variant" for="catName">Topic Name</label>
          <input 
            type="text" 
            id="catName" 
            bind:value={newCategoryName} 
            placeholder="e.g., Capitals, Flourishing"
            class="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            required
            autofocus
          />
        </div>

        <div class="flex justify-end gap-3 mt-2">
          <button 
            type="button" 
            onclick={() => isAddCategoryOpen = false}
            class="px-4 py-2 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
          >
            Cancel
          </button>
          <button 
            type="submit"
            class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 cursor-pointer focus:outline-none"
          >
            Create Section
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
{#if isSelectionMode}
  <TaskSelectionBar
    selectedCount={selectedTaskIds.size}
    onExport={handleExportSelected}
    onDelete={handleDeleteSelected}
    onCancel={() => {
      isSelectionMode = false;
      selectedTaskIds.clear();
    }}
  />
{/if}

{#if project && project.id && project.id !== 'No Lesson Selected'}
  <LessonSettingsModal bind:isOpen={showSettingsOverrideModal} {project} />
{/if}
