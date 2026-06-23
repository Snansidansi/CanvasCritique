<script>
  import { store } from '../state/store.svelte.js';

  // Derived project state from store
  let project = $derived(store.activeProject || {
    name: 'No Project Selected',
    icon: 'history_edu',
    categories: ['Basics', 'Intermediate', 'Advanced'],
    tasks: []
  });

  // Categories list
  let categories = $derived(project.categories || ['Basics', 'Intermediate', 'Advanced']);

  // Local state for category addition
  let newCategoryName = $state('');
  let isAddCategoryOpen = $state(false);

  // Drag and drop states
  let draggedTaskId = $state(null);
  let draggedCategory = $state(null);

  // Derived progress rune
  let progress = $derived(getProjectProgress());

  function handleBack() {
    store.setView('dashboard');
  }

  function handleAddTask() {
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
    return project.tasks.filter(t => (t.category || 'Basics') === cat);
  }

  function getProjectProgress() {
    if (!project.tasks || project.tasks.length === 0) return 0;
    const completed = project.tasks.filter(t => t.completed).length;
    return Math.round((completed / project.tasks.length) * 100);
  }

  // HTML5 Drag and drop handlers
  function handleDragStart(e, taskId, category) {
    draggedTaskId = taskId;
    draggedCategory = category;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }

  // dragover handler
  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e, category, targetIndex) {
    e.preventDefault();
    if (!draggedTaskId || draggedCategory !== category) return;

    const categoryTasks = getCategoryTasks(category);
    const draggedIndex = categoryTasks.findIndex(t => t.id === draggedTaskId);
    if (draggedIndex === -1) return;

    // Reorder array locally
    const [draggedItem] = categoryTasks.splice(draggedIndex, 1);
    categoryTasks.splice(targetIndex, 0, draggedItem);

    // Save order
    const taskIdsOrder = categoryTasks.map(t => t.id);
    store.reorderTasks(project.id, category, taskIdsOrder);

    // Reset drag state
    draggedTaskId = null;
    draggedCategory = null;
  }
</script>

<!-- TopAppBar -->
<header class="h-16 px-8 border-b border-outline-variant bg-surface flex justify-between items-center z-10 shrink-0 select-none">
  <div class="flex items-center gap-4 min-w-0">
    <button 
      onclick={handleBack}
      class="material-symbols-outlined text-primary hover:bg-surface-container-high p-2 rounded-full -ml-2 focus:outline-none cursor-pointer"
      title="Back to Dashboard"
    >
      arrow_back
    </button>
    
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 flex items-center justify-center bg-secondary-container text-on-secondary-container rounded-lg shrink-0">
        <span class="material-symbols-outlined text-[20px]">{project.icon || 'history_edu'}</span>
      </div>
      <h1 class="font-bold text-lg text-on-surface truncate">{project.name}</h1>
    </div>
  </div>

  <div class="flex items-center gap-3">
    <!-- Inline Create New Task -->
    <button 
      onclick={handleAddTask}
      class="bg-primary text-on-primary font-semibold text-xs py-2.5 px-4 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
    >
      <span class="material-symbols-outlined text-[18px]">add_circle</span>
      Create New Task
    </button>
  </div>
</header>

<!-- Main details area -->
<main class="flex-grow overflow-y-auto p-8 flex flex-col gap-8 custom-scrollbar h-full">
  <!-- Stats & Progress banner -->
  <section class="bg-surface p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
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

  <!-- Categories section lists -->
  <section class="flex flex-col gap-6">
    <!-- Category header toolbar -->
    <div class="flex justify-between items-center border-b border-outline-variant pb-2">
      <h3 class="font-bold text-sm text-on-surface uppercase tracking-wider">Lesson Roadmap</h3>
      <button 
        onclick={() => isAddCategoryOpen = true}
        class="text-xs text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer"
      >
        <span class="material-symbols-outlined text-[16px]">create_new_folder</span>
        Add Custom Topic
      </button>
    </div>

    <!-- Dynamic Category Sections -->
    <div class="grid grid-cols-1 gap-6">
      {#each categories as category}
        {@const catTasks = getCategoryTasks(category)}
        <div class="bg-surface-container-low border border-outline-variant/60 rounded-xl p-6 flex flex-col gap-4">
          <div class="flex items-center justify-between">
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
            <span class="text-xs text-on-surface-variant font-semibold bg-surface px-2.5 py-1 rounded-full border border-outline-variant/30">
              {catTasks.length} {catTasks.length === 1 ? 'task' : 'tasks'}
            </span>
          </div>

          <!-- Draggable task list -->
          <div 
            class="flex flex-col gap-2 min-h-[50px]"
            ondragover={handleDragOver}
          >
            {#if catTasks.length > 0}
              {#each catTasks as task, index (task.id)}
                <div 
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, task.id, category)}
                  ondrop={(e) => handleDrop(e, category, index)}
                  class="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-4 flex items-center justify-between group hover:border-primary transition-all duration-150 shadow-sm cursor-grab active:cursor-grabbing relative overflow-hidden"
                >
                  <!-- Visual drag indicator -->
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-outline-variant text-[18px] select-none cursor-grab opacity-40 group-hover:opacity-100 transition-opacity">
                      drag_indicator
                    </span>

                    <button 
                      onclick={() => store.toggleTaskCompleted(project.id, task.id)}
                      class="text-primary hover:opacity-85 focus:outline-none flex items-center cursor-pointer"
                      title={task.completed ? "Mark incomplete" : "Mark complete"}
                    >
                      <span class="material-symbols-outlined text-[22px]">
                        {task.completed ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                    </button>

                    <button 
                      onclick={() => openPractice(task)}
                      class="text-left font-semibold text-sm text-on-surface hover:text-primary hover:underline transition-colors
                             {task.completed ? 'line-through text-outline' : ''}"
                    >
                      {task.name}
                    </button>
                  </div>

                  <!-- Hover actions (Edit) -->
                  <div class="flex items-center gap-2">
                    <!-- Task Edit Pen Icon: Always visible -->
                    <button 
                      onclick={() => handleEditTask(task)}
                      class="text-outline hover:text-primary transition-all px-3 py-1.5 rounded-lg border border-outline-variant/40 hover:bg-surface-container flex items-center gap-1.5 text-xs font-semibold focus:outline-none cursor-pointer duration-100 bg-surface shadow-sm" 
                      title="Edit Task Details"
                    >
                      <span class="material-symbols-outlined text-[16px]">edit</span>
                      Edit
                    </button>
                  </div>
                </div>
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
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-[360px] shadow-xl flex flex-col gap-4">
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
            class="px-4 py-2 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="submit"
            class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90 cursor-pointer"
          >
            Create Section
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
