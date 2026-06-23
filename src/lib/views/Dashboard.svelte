<script>
  import { store } from '../state/store.svelte.js';

  // Local state
  let searchQuery = $state('');
  let isAddProjectOpen = $state(false);
  let newProjectName = $state('');
  let newProjectIcon = $state('history_edu');
  
  // Quick task add state per project
  let quickTaskName = $state({}); // key is projectId, value is task name
  let quickTaskCategory = $state({}); // key is projectId, value is category

  // Derived state using $derived rune
  let filteredProjects = $derived(
    store.projects.filter(project => 
      project.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let activeProjectsCount = $derived(
    store.projects.filter(p => p.tasks.some(t => !t.completed)).length
  );

  function openPractice(task, project) {
    store.selectProject(project);
    store.selectTask(task);
  }

  function handleNavigateProject(project) {
    store.selectProject(project);
    store.setView('project-detail');
  }

  function handleCreateProject(e) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const proj = store.addProject(newProjectName.trim(), newProjectIcon);
    newProjectName = '';
    isAddProjectOpen = false;
    // Go to project detail immediately for the new project
    handleNavigateProject(proj);
  }

  function handleQuickAddTask(projectId) {
    const name = quickTaskName[projectId];
    const cat = quickTaskCategory[projectId] || 'Basics';
    if (!name || !name.trim()) return;

    store.selectProject(store.projects.find(p => p.id === projectId));
    store.quickAddTaskData = {
      name: name.trim(),
      category: cat
    };
    store.setView('task-editor');

    // Clear input
    quickTaskName[projectId] = '';
  }

  function getProjectProgress(project) {
    if (!project.tasks || project.tasks.length === 0) return 0;
    const completed = project.tasks.filter(t => t.completed).length;
    return Math.round((completed / project.tasks.length) * 100);
  }

  function getRemainingTasks(project) {
    if (!project.tasks) return 0;
    return project.tasks.filter(t => !t.completed).length;
  }
</script>

<!-- Header bar -->
<header class="h-16 px-8 border-b border-outline-variant bg-surface flex justify-between items-center z-10 shrink-0">
  <div class="text-on-surface font-semibold text-lg">
    Projects Dashboard
  </div>
  
  <!-- Search & Actions -->
  <div class="flex items-center gap-4 flex-1 justify-end">
    <!-- Search Bar -->
    <div class="relative w-full max-w-xs">
      <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-[20px]">search</span>
      <input 
        bind:value={searchQuery}
        class="w-full bg-surface-container-low border border-outline-variant rounded-full py-1.5 pl-10 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" 
        placeholder="Search projects..." 
        type="text"
      />
    </div>

    <!-- Import Mock Button -->
    <button 
      class="bg-surface-container-low text-on-surface p-2 rounded-lg border border-outline-variant hover:bg-surface-container-high transition-colors flex items-center justify-center shrink-0" 
      title="Import Project"
    >
      <span class="material-symbols-outlined text-[20px]">file_upload</span>
    </button>

    <!-- Create project button -->
    <button 
      onclick={() => isAddProjectOpen = true}
      class="bg-primary text-on-primary font-semibold text-xs py-2.5 px-4 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0"
    >
      <span class="material-symbols-outlined text-[18px]">add_circle</span>
      Create Project
    </button>
  </div>
</header>

<!-- Main Scrollable Content -->
<main class="flex-grow overflow-y-auto p-8 flex flex-col gap-8 custom-scrollbar">
  <!-- Welcome and stats -->
  <section class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div>
      <h2 class="text-2xl font-bold text-on-background">Welcome back, Calligrapher</h2>
      <p class="text-sm text-on-surface-variant mt-1">You have {activeProjectsCount} active projects in progress.</p>
    </div>
  </section>

  <!-- Projects Grid -->
  <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each filteredProjects as project (project.id)}
      {@const progress = getProjectProgress(project)}
      {@const remaining = getRemainingTasks(project)}
      <article class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 flex flex-col justify-between hover:border-primary transition-colors group relative overflow-hidden shadow-sm">
        <div class="absolute top-0 left-0 w-1.5 h-full bg-primary hidden group-hover:block transition-all"></div>
        
        <div>
          <div class="flex justify-between items-start mb-4">
            <button 
              onclick={() => handleNavigateProject(project)}
              class="w-12 h-12 flex items-center justify-center bg-secondary-container text-on-secondary-container rounded-lg shrink-0 focus:outline-none cursor-pointer"
            >
              <span class="material-symbols-outlined text-[24px]">{project.icon || 'history_edu'}</span>
            </button>
            
            <div class="flex gap-2">
              <button 
                onclick={() => store.deleteProject(project.id)}
                class="text-outline hover:text-error transition-colors p-1 rounded hover:bg-surface-container-high" 
                title="Delete Project"
              >
                <span class="material-symbols-outlined text-[20px]">delete</span>
              </button>
            </div>
          </div>

          <button 
            onclick={() => handleNavigateProject(project)}
            class="text-left w-full focus:outline-none cursor-pointer group"
          >
            <h3 class="font-bold text-lg text-on-surface mb-1 group-hover:text-primary transition-colors">{project.name}</h3>
            <p class="text-sm text-on-surface-variant flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px] text-primary">task_alt</span> 
              {remaining} {remaining === 1 ? 'Task' : 'Tasks'} Remaining
            </p>
          </button>
        </div>

        <!-- Progress bar -->
        <button 
          onclick={() => handleNavigateProject(project)}
          class="mt-6 pt-4 border-t border-surface-variant flex justify-between items-center w-full focus:outline-none cursor-pointer text-left"
        >
          <div class="w-full bg-surface-variant rounded-full h-2 mr-4">
            <div class="bg-primary h-2 rounded-full transition-all duration-300" style="width: {progress}%"></div>
          </div>
          <span class="text-xs font-bold text-on-surface-variant">{progress}%</span>
        </button>

        <!-- Tasks details expandable list -->
        <div class="mt-4 pt-4 border-t border-outline-variant">
          <details class="group/tasks">
            <summary class="flex items-center justify-between cursor-pointer list-none text-xs font-semibold text-on-surface-variant hover:text-primary">
              <span class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">list</span> 
                Tasks Checklist
              </span>
              <span class="material-symbols-outlined transition-transform group-open/tasks:rotate-180">expand_more</span>
            </summary>

            <div class="mt-3 space-y-4">
              {#if project.tasks && project.tasks.length > 0}
                <!-- Group tasks by category -->
                {@const categories = [...new Set(project.tasks.map(t => t.category || 'Basics'))]}
                {#each categories as category}
                  <div class="space-y-2">
                    <p class="text-[10px] font-bold text-outline uppercase tracking-wider">{category}</p>
                    {#each project.tasks.filter(t => (t.category || 'Basics') === category) as task}
                      <div class="flex items-center gap-2 text-sm group/task-item py-1">
                        <button 
                          onclick={() => store.toggleTaskCompleted(project.id, task.id)}
                          class="text-primary focus:outline-none flex items-center"
                        >
                          <span class="material-symbols-outlined text-[20px] select-none hover:opacity-80">
                            {task.completed ? 'check_box' : 'check_box_outline_blank'}
                          </span>
                        </button>
                        
                        <!-- Click task title to practice -->
                        <button 
                          onclick={() => openPractice(task, project)}
                          class="text-left flex-1 text-on-surface hover:text-primary hover:underline truncate {task.completed ? 'line-through text-outline' : ''}"
                        >
                          {task.name}
                        </button>

                        <button 
                          onclick={() => { store.selectProject(project); store.setEditingTask(task); }} 
                          class="opacity-0 group-hover/task-item:opacity-100 text-outline hover:text-primary transition-opacity p-0.5 focus:opacity-100 focus:outline-none cursor-pointer"
                          title="Edit Task"
                        >
                          <span class="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                      </div>
                    {/each}
                  </div>
                {/each}
              {:else}
                <p class="text-xs text-on-surface-variant italic">No tasks created yet.</p>
              {/if}

              <!-- Quick Add Task Interface -->
              <div class="pt-2 border-t border-outline-variant/30 space-y-2">
                <input 
                  type="text" 
                  bind:value={quickTaskName[project.id]}
                  placeholder="Quick task name..."
                  class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                  onkeydown={(e) => {
                    if (e.key === 'Enter') handleQuickAddTask(project.id);
                  }}
                />
                <div class="flex gap-2 justify-between">
                  <select 
                    bind:value={quickTaskCategory[project.id]}
                    class="bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1 text-[10px] text-on-surface-variant"
                  >
                    <option value="Basics">Basics</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                  
                  <button 
                    onclick={() => handleQuickAddTask(project.id)}
                    class="bg-secondary-container text-on-secondary-container font-bold text-[10px] px-3 py-1 rounded-lg hover:opacity-90"
                  >
                    Add Task
                  </button>
                </div>
              </div>
            </div>
          </details>
        </div>
      </article>
    {/each}
  </section>
</main>

<!-- Create Project Modal Dialog -->
{#if isAddProjectOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-[400px] shadow-xl flex flex-col gap-4">
      <h3 class="font-bold text-lg text-on-surface">Create Calligraphy Script</h3>
      
      <form onsubmit={handleCreateProject} class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-on-surface-variant" for="projName">Script Name</label>
          <input 
            type="text" 
            id="projName" 
            bind:value={newProjectName} 
            placeholder="e.g., Spencerian Script, Gothic"
            class="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            required
            autofocus
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-on-surface-variant" for="projIcon">Icon Style</label>
          <div class="grid grid-cols-4 gap-2">
            {#each ['history_edu', 'draw', 'ink_pen', 'edit_square', 'palette', 'brush', 'format_paint', 'signature', 'gesture', 'border_color', 'content_cut', 'text_fields'] as icon}
              <button 
                type="button" 
                onclick={() => newProjectIcon = icon}
                class="p-2 border rounded-lg flex items-center justify-center hover:bg-surface-container
                       {newProjectIcon === icon ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant'}"
              >
                <span class="material-symbols-outlined text-[24px]">{icon}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-2">
          <button 
            type="button" 
            onclick={() => isAddProjectOpen = false}
            class="px-4 py-2 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container-high"
          >
            Cancel
          </button>
          <button 
            type="submit"
            class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
