<script lang="ts">
  import { store } from "../state/store.svelte";
  import CreateProjectModal from "../components/dashboard/CreateProjectModal.svelte";
  import ProfileModal from "../components/dashboard/ProfileModal.svelte";
  import DeleteProfileConfirm from "../components/dashboard/DeleteProfileConfirm.svelte";

  // Local state
  let searchQuery = $state("");
  let isAddProjectOpen = $state(false);
  let fileInput: HTMLInputElement | null = $state(null);

  function importLessonData(jsonData: string) {
    try {
      const imported = JSON.parse(jsonData);
      store.importProject(imported);
    } catch (err) {
      store.showNotification("Failed to parse file. Make sure it is valid JSON.", "error");
    }
  }

  function handleImportFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importLessonData(reader.result as string);
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = "";
  }

  let isDragging = $state(false);

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.types.includes("Files")) {
      isDragging = true;
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      isDragging = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      store.showNotification("Please drop a valid .json lesson file.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      importLessonData(reader.result as string);
    };
    reader.readAsText(file);
  }

  // Quick task add state per project
  let quickTaskName = $state<Record<string, string>>({}); // key is projectId, value is task name
  let quickTaskCategory = $state<Record<string, string>>({}); // key is projectId, value is category

  // Profile settings
  let activeProfile = $derived(
    store.profiles.find((p) => p.id === store.activeProfileId) || store.profiles[0]
  );
  let isProfileMenuOpen = $state(false);
  
  // Profile CRUD Modal states
  let isProfileModalOpen = $state(false);
  let profileModalMode = $state<'create' | 'edit'>('create');
  let editingProfileId = $state('');

  // Profile deletion states
  let isDeleteProfileConfirmOpen = $state(false);
  let profileToDelete = $state<any>(null);

  function handleOpenCreateProfile() {
    profileModalMode = 'create';
    isProfileModalOpen = true;
  }

  function handleOpenEditProfile(profile: any) {
    profileModalMode = 'edit';
    editingProfileId = profile.id;
    isProfileModalOpen = true;
  }

  function handleOpenDeleteProfile(profile: any) {
    profileToDelete = profile;
    isDeleteProfileConfirmOpen = true;
  }

  // Derived state using $derived rune
  let filteredProjects = $derived(
    store.projects.filter((project) =>
      project.profileId === store.activeProfileId &&
      project.name.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  let activeProjectsCount = $derived(
    store.projects.filter((p) => p.profileId === store.activeProfileId && p.tasks.some((t) => !t.completed)).length,
  );

  function openPractice(task: any, project: any) {
    store.selectProject(project);
    store.selectTask(task);
  }

  function handleNavigateProject(project: any) {
    store.selectProject(project);
    store.setView("project-detail");
  }

  function handleQuickAddTask(projectId: string) {
    const project = store.projects.find((p) => p.id === projectId);
    const name = quickTaskName[projectId];
    const cat =
      quickTaskCategory[projectId] ||
      (project?.categories && project.categories[0]) ||
      "Basics";
    if (!name || !name.trim()) return;

    store.selectProject(project);
    store.quickAddTaskData = {
      name: name.trim(),
      category: cat,
    };
    store.setView("task-editor");

    // Clear input
    quickTaskName[projectId] = "";
  }

  function getProjectProgress(project: any) {
    if (!project.tasks || project.tasks.length === 0) return 0;
    const completed = project.tasks.filter((t: any) => t.completed).length;
    return Math.round((completed / project.tasks.length) * 100);
  }

  function getRemainingTasks(project: any) {
    if (!project.tasks) return 0;
    return project.tasks.filter((t: any) => !t.completed).length;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex-1 flex flex-col min-h-0 relative h-full w-full"
  ondragover={handleDragOver}
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <!-- Header bar -->
  <header
    class="h-16 px-8 border-b border-outline-variant bg-surface flex justify-between items-center z-10 shrink-0"
  >
    <div class="text-on-surface font-semibold text-lg">Lesson Dashboard</div>

  <!-- Search & Actions -->
  <div class="flex items-center gap-4 flex-1 justify-end">
    <!-- Search Bar -->
    <div class="relative w-full max-w-xs">
      <span
        class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-[20px]"
        >search</span
      >
      <input
        bind:value={searchQuery}
        class="w-full bg-surface-container-low border border-outline-variant rounded-full py-1.5 pl-10 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
        placeholder="Search lessons..."
        type="text"
      />
    </div>

    <!-- Import Lesson Button -->
    <input
      type="file"
      accept="application/json"
      bind:this={fileInput}
      onchange={handleImportFile}
      class="hidden"
    />
    <button
      onclick={() => fileInput?.click()}
      class="bg-surface-container-low text-on-surface p-2 rounded-lg border border-outline-variant hover:bg-surface-container-high transition-colors flex items-center justify-center shrink-0 cursor-pointer"
      title="Import Lesson"
    >
      <span class="material-symbols-outlined text-[20px]">file_upload</span>
    </button>

    <!-- Create lesson button -->
    <button
      onclick={() => (isAddProjectOpen = true)}
      class="bg-primary text-on-primary font-semibold text-xs py-2.5 px-4 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0 cursor-pointer animate-fade-in"
    >
      <span class="material-symbols-outlined text-[18px]">add_circle</span>
      Create Lesson
    </button>

    <!-- Profile Circle Switcher -->
    <div class="relative shrink-0 select-none flex items-center">
      <button
        onclick={() => isProfileMenuOpen = !isProfileMenuOpen}
        class="focus:outline-none flex items-center justify-center p-0.5 rounded-full hover:ring-2 hover:ring-primary/30 transition-all shrink-0 cursor-pointer"
        title="Switch profile"
      >
        {#if activeProfile?.icon}
          <img src={activeProfile.icon} class="w-9 h-9 rounded-full object-cover border border-outline-variant" alt="" />
        {:else}
          <div 
            style="background-color: {activeProfile?.color || '#3b82f6'}"
            class="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm border border-white/10"
          >
            {activeProfile?.name ? activeProfile.name.charAt(0).toUpperCase() : 'P'}
          </div>
        {/if}
      </button>

      {#if isProfileMenuOpen}
        <!-- Dropdown Backdrop to close on clicking outside -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
          onclick={() => isProfileMenuOpen = false}
          class="fixed inset-0 z-40 bg-transparent"
        ></div>
        <div class="absolute right-0 top-11 mt-2 w-64 bg-surface border border-outline-variant rounded-xl shadow-xl flex flex-col p-2 z-50 select-none animate-fade-in">
          <div class="px-3 py-1.5 text-[10px] font-bold text-outline uppercase tracking-wider">
            Theme Profiles
          </div>
          <div class="flex flex-col gap-0.5 max-h-60 overflow-y-auto custom-scrollbar my-1">
            {#each store.profiles as p}
              <div class="flex items-center justify-between hover:bg-surface-container rounded-lg p-1.5 transition-colors">
                <button
                  onclick={() => {
                    store.selectProfile(p.id);
                    isProfileMenuOpen = false;
                  }}
                  class="flex items-center gap-2.5 grow text-left font-bold text-xs text-on-surface hover:text-primary transition-colors cursor-pointer focus:outline-none min-w-0"
                >
                  {#if p.icon}
                    <img src={p.icon} class="w-7 h-7 rounded-full object-cover border border-outline-variant shrink-0" alt="" />
                  {:else}
                    <div 
                      style="background-color: {p.color || '#3b82f6'}"
                      class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm border border-white/10"
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                  {/if}
                  <span class="truncate pr-2">{p.name}</span>
                  {#if p.id === store.activeProfileId}
                    <span class="material-symbols-outlined text-[16px] text-primary shrink-0 ml-auto">check</span>
                  {/if}
                </button>
                
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    isProfileMenuOpen = false;
                    handleOpenEditProfile(p);
                  }}
                  class="material-symbols-outlined text-[16px] text-outline-variant hover:text-primary p-1 rounded hover:bg-surface-container-high cursor-pointer focus:outline-none flex items-center justify-center ml-1 shrink-0 transition-colors"
                  title="Edit Profile"
                >
                  edit
                </button>
              </div>
            {/each}
          </div>
          <div class="h-px bg-outline-variant/30 my-1"></div>
          <button
            onclick={() => {
              isProfileMenuOpen = false;
              handleOpenCreateProfile();
            }}
            class="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5 rounded-lg transition-colors cursor-pointer focus:outline-none"
          >
            <span class="material-symbols-outlined text-[16px]">add_circle</span>
            Create New Profile
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>

<!-- Main Scrollable Content -->
<main class="grow overflow-y-auto p-8 flex flex-col gap-8 custom-scrollbar">
  <!-- Welcome and stats -->
  <section
    class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
  >
    <div>
      <h2 class="text-2xl font-bold text-on-background">
        Welcome back
        <p class="text-sm text-on-surface-variant mt-1">
          You have {activeProjectsCount} active lessons in progress.
        </p>
      </h2>
    </div>
  </section>

  <!-- Projects Grid -->
  <section
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start"
  >
    {#each filteredProjects as project (project.id)}
      {@const progress = getProjectProgress(project)}
      {@const remaining = getRemainingTasks(project)}
      <article
        class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 flex flex-col justify-between hover:border-primary transition-colors group relative overflow-hidden shadow-sm self-start w-full"
      >
        <div
          class="absolute top-0 left-0 w-1.5 h-full bg-primary hidden group-hover:block transition-all"
        ></div>

        <div>
          <div class="flex justify-between items-start mb-4">
            <button
              onclick={() => handleNavigateProject(project)}
              class="w-12 h-12 flex items-center justify-center bg-secondary-container text-on-secondary-container rounded-lg shrink-0 focus:outline-none cursor-pointer"
            >
              {#if project.icon && project.icon.startsWith("data:image/")}
                <img
                  src={project.icon}
                  class="w-6 h-6 object-contain rounded"
                  alt=""
                />
              {:else}
                <span class="material-symbols-outlined text-[24px]"
                  >{project.icon || "history_edu"}</span
                >
              {/if}
            </button>

            <div class="flex gap-2">
              {#if project.tasks && project.tasks.length > 0}
                {@const nextTask = project.tasks.find(t => !t.completed) || project.tasks[0]}
                <button
                  onclick={() => openPractice(nextTask, project)}
                  class="text-outline hover:text-primary transition-colors p-1 rounded hover:bg-surface-container-high cursor-pointer flex items-center justify-center"
                  title="Resume/Start Lesson"
                >
                  <span class="material-symbols-outlined text-[20px]">play_arrow</span>
                </button>
              {/if}
              <button
                onclick={() => store.exportProject(project)}
                class="text-outline hover:text-primary transition-colors p-1 rounded hover:bg-surface-container-high cursor-pointer flex items-center justify-center"
                title="Export Lesson"
              >
                <span class="material-symbols-outlined text-[20px]"
                  >file_download</span
                >
              </button>
              <button
                onclick={() =>
                  store.confirm(
                    "Delete Lesson",
                    `Are you sure you want to delete "${project.name}"? This will permanently discard this calligraphy lesson, its task lists, reference files, and historical practice logs.`,
                    () => store.deleteProject(project.id),
                  )}
                class="text-outline hover:text-error transition-colors p-1 rounded hover:bg-surface-container-high cursor-pointer"
                title="Delete Lesson"
              >
                <span class="material-symbols-outlined text-[20px]">delete</span
                >
              </button>
            </div>
          </div>

          <button
            onclick={() => handleNavigateProject(project)}
            class="text-left w-full focus:outline-none cursor-pointer group"
          >
            <h3
              class="font-bold text-lg text-on-surface mb-1 group-hover:text-primary transition-colors"
            >
              {project.name}
            </h3>
            <p class="text-sm text-on-surface-variant flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px] text-primary"
                >task_alt</span
              >
              {remaining}
              {remaining === 1 ? "Task" : "Tasks"} Remaining
            </p>
          </button>
        </div>

        <!-- Progress bar -->
        <button
          onclick={() => handleNavigateProject(project)}
          class="mt-6 pt-4 border-t border-surface-variant flex justify-between items-center w-full focus:outline-none cursor-pointer text-left"
        >
          <div class="w-full bg-surface-variant rounded-full h-2 mr-4">
            <div
              class="bg-primary h-2 rounded-full transition-all duration-300"
              style="width: {progress}%"
            ></div>
          </div>
          <span class="text-xs font-bold text-on-surface-variant"
            >{progress}%</span
          >
        </button>

        <!-- Tasks details expandable list -->
        <div class="mt-4 pt-4 border-t border-outline-variant">
          <details class="group/tasks">
            <summary
              class="flex items-center justify-between cursor-pointer list-none text-xs font-semibold text-on-surface-variant hover:text-primary"
            >
              <span class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">list</span>
                Tasks Checklist
              </span>
              <span
                class="material-symbols-outlined transition-transform group-open/tasks:rotate-180"
                >expand_more</span
              >
            </summary>

            <div class="mt-3 space-y-4">
              {#if project.tasks && project.tasks.length > 0}
                <!-- Group tasks by category -->
                {@const categories = [
                  ...new Set(project.tasks.map((t) => t.category || "Basics")),
                ]}
                {#each categories as category}
                  <div class="space-y-2">
                    <p
                      class="text-[10px] font-bold text-outline uppercase tracking-wider"
                    >
                      {category}
                    </p>
                    {#each project.tasks.filter((t) => (t.category || "Basics") === category) as task}
                      <div
                        class="flex items-center gap-2 text-sm group/task-item py-1"
                      >
                        <button
                          onclick={() =>
                            store.toggleTaskCompleted(project.id, task.id)}
                          class="text-primary focus:outline-none flex items-center"
                        >
                          <span
                            class="material-symbols-outlined text-[20px] select-none hover:opacity-80"
                          >
                            {task.completed
                              ? "check_box"
                              : "check_box_outline_blank"}
                          </span>
                        </button>

                        <!-- Click task title to practice -->
                        <button
                          onclick={() => openPractice(task, project)}
                          class="text-left flex-1 text-on-surface hover:text-primary hover:underline truncate {task.completed
                            ? 'line-through text-outline'
                            : ''}"
                        >
                          {task.name}
                        </button>

                        <button
                          onclick={() => {
                            store.selectProject(project);
                            store.setEditingTask(task);
                          }}
                          class="opacity-0 group-hover/task-item:opacity-100 text-outline hover:text-primary transition-opacity p-0.5 focus:opacity-100 focus:outline-none cursor-pointer"
                          title="Edit Task"
                        >
                          <span class="material-symbols-outlined text-[18px]"
                            >edit</span
                          >
                        </button>
                      </div>
                    {/each}
                  </div>
                {/each}
              {:else}
                <p class="text-xs text-on-surface-variant italic">
                  No tasks created yet.
                </p>
              {/if}

              <!-- Quick Add Task Interface -->
              <div class="pt-2 border-t border-outline-variant/30 space-y-2">
                <input
                  type="text"
                  bind:value={quickTaskName[project.id]}
                  placeholder="Quick task name..."
                  class="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                  onkeydown={(e) => {
                    if (e.key === "Enter") handleQuickAddTask(project.id);
                  }}
                />
                <div class="flex gap-2 justify-between">
                  <select
                    bind:value={quickTaskCategory[project.id]}
                    class="bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1 text-[10px] text-on-surface-variant"
                  >
                    {#each project.categories || ["Basics", "Intermediate", "Advanced"] as category}
                      <option value={category}>{category}</option>
                    {/each}
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

<CreateProjectModal bind:isOpen={isAddProjectOpen} />

<ProfileModal 
  bind:isOpen={isProfileModalOpen} 
  mode={profileModalMode} 
  profileId={editingProfileId} 
  onDeleteRequest={handleOpenDeleteProfile} 
/>

<DeleteProfileConfirm 
  bind:isOpen={isDeleteProfileConfirmOpen} 
  profileToDelete={profileToDelete} 
  onDeleted={() => {
    isProfileModalOpen = false;
  }}
/>

  <!-- Drag-and-drop Overlay -->
  {#if isDragging}
    <div class="absolute inset-0 bg-primary/10 border-4 border-dashed border-primary backdrop-blur-xs z-50 flex flex-col items-center justify-center pointer-events-none">
      <div class="bg-surface border border-outline-variant shadow-2xl rounded-2xl p-8 flex flex-col items-center gap-4 text-center max-w-sm pointer-events-auto">
        <span class="material-symbols-outlined text-5xl text-primary">file_upload</span>
        <h3 class="font-bold text-lg text-on-surface">Import Calligraphy Lesson</h3>
        <p class="text-xs text-on-surface-variant leading-relaxed">Drop your .json lesson file anywhere here to import it into your workspace.</p>
      </div>
    </div>
  {/if}
</div>
