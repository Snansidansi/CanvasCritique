<script lang="ts">
  import { store } from "../state/store.svelte";

  // Local state
  let searchQuery = $state("");
  let isAddProjectOpen = $state(false);
  let newProjectName = $state("");
  let newProjectIcon = $state("history_edu");
  let fileInput: HTMLInputElement | null = $state(null);

  function handleImportFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(reader.result as string);
        store.importProject(imported);
      } catch (err) {
        alert("Failed to parse file. Make sure it is valid JSON.");
      }
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = "";
  }

  // Quick task add state per project
  let quickTaskName = $state({}); // key is projectId, value is task name
  let quickTaskCategory = $state({}); // key is projectId, value is category

  // Profile settings
  let activeProfile = $derived(
    store.profiles.find((p) => p.id === store.activeProfileId) || store.profiles[0]
  );
  let isProfileMenuOpen = $state(false);
  
  // Profile CRUD Modal states
  let isProfileModalOpen = $state(false);
  let profileModalMode = $state<'create' | 'edit'>('create');
  let editingProfileId = $state('');
  let profileFormName = $state('');
  let profileFormColor = $state('#3b82f6');
  let profileFormIcon = $state<string | null>(null);
  let fileInputProfile: HTMLInputElement | null = $state(null);

  // Profile deletion states
  let isDeleteProfileConfirmOpen = $state(false);
  let profileToDelete = $state<any>(null);
  let deleteProfileCheckboxChecked = $state(false);

  const presetColors = [
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#8b5cf6', // Violet
    '#ef4444', // Red
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#6366f1'  // Indigo
  ];

  function handleOpenCreateProfile() {
    profileModalMode = 'create';
    profileFormName = '';
    profileFormColor = presetColors[Math.floor(Math.random() * presetColors.length)];
    profileFormIcon = null;
    isProfileModalOpen = true;
  }

  function handleOpenEditProfile(profile: any) {
    profileModalMode = 'edit';
    editingProfileId = profile.id;
    profileFormName = profile.name;
    profileFormColor = profile.color || '#3b82f6';
    profileFormIcon = profile.icon || null;
    isProfileModalOpen = true;
  }

  function handleSaveProfile(e: Event) {
    e.preventDefault();
    if (!profileFormName.trim()) return;

    if (profileModalMode === 'create') {
      const newProf = store.addProfile(profileFormName.trim(), profileFormIcon, profileFormColor);
      store.selectProfile(newProf.id);
    } else {
      store.updateProfile(editingProfileId, {
        name: profileFormName.trim(),
        icon: profileFormIcon,
        color: profileFormColor
      });
    }
    isProfileModalOpen = false;
  }

  function handleProfileIconSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      profileFormIcon = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function triggerProfileIconUpload() {
    fileInputProfile?.click();
  }

  function handleOpenDeleteProfile(profile: any) {
    profileToDelete = profile;
    deleteProfileCheckboxChecked = false;
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

  function openPractice(task, project) {
    store.selectProject(project);
    store.selectTask(task);
  }

  function handleNavigateProject(project) {
    store.selectProject(project);
    store.setView("project-detail");
  }

  function handleCreateProject(e) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const proj = store.addProject(newProjectName.trim(), newProjectIcon);
    newProjectName = "";
    newProjectIcon = "history_edu";
    isAddProjectOpen = false;
    // Go to project detail immediately for the new project
    handleNavigateProject(proj);
  }

  function handleCustomIconUpload(e) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      newProjectIcon = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function handleQuickAddTask(projectId) {
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

  function getProjectProgress(project) {
    if (!project.tasks || project.tasks.length === 0) return 0;
    const completed = project.tasks.filter((t) => t.completed).length;
    return Math.round((completed / project.tasks.length) * 100);
  }

  function getRemainingTasks(project) {
    if (!project.tasks) return 0;
    return project.tasks.filter((t) => !t.completed).length;
  }
</script>

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

<!-- Create Project Modal Dialog -->
{#if isAddProjectOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
  >
    <div
      class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-100 shadow-xl flex flex-col gap-4"
    >
      <h3 class="font-bold text-lg text-on-surface">
        Create Calligraphy Lesson
      </h3>

      <form onsubmit={handleCreateProject} class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label
            class="text-xs font-semibold text-on-surface-variant"
            for="projName">Lesson Name</label
          >
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
          <label
            class="text-xs font-semibold text-on-surface-variant"
            for="projIcon">Icon Style</label
          >
          <div class="grid grid-cols-4 gap-2">
            {#each ["history_edu", "draw", "ink_pen", "edit_square", "palette", "brush", "format_paint", "signature", "gesture", "border_color", "content_cut", "text_fields"] as icon}
              <button
                type="button"
                onclick={() => (newProjectIcon = icon)}
                class="p-2 border rounded-lg flex items-center justify-center hover:bg-surface-container
                       {newProjectIcon === icon
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-outline-variant text-on-surface-variant'}"
              >
                <span class="material-symbols-outlined text-[24px]">{icon}</span
                >
              </button>
            {/each}
          </div>

          <div class="flex flex-col gap-1 mt-2">
            <span class="text-xs font-semibold text-on-surface-variant"
              >Or Upload Custom Icon</span
            >
            <input
              type="file"
              accept="image/*"
              onchange={handleCustomIconUpload}
              class="text-xs text-on-surface bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
            />
            {#if newProjectIcon && newProjectIcon.startsWith("data:image/")}
              <div class="flex items-center gap-2 mt-1">
                <span class="text-[10px] text-primary font-semibold"
                  >Custom Preview:</span
                >
                <img
                  src={newProjectIcon}
                  class="w-8 h-8 object-contain rounded border border-primary/20 bg-white"
                  alt="Preview"
                />
              </div>
            {/if}
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-2">
          <button
            type="button"
            onclick={() => (isAddProjectOpen = false)}
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

<!-- Create / Edit Profile Modal -->
{#if isProfileModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm select-none animate-fade-in">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-96 shadow-2xl flex flex-col gap-5">
      <header class="flex justify-between items-center">
        <h3 class="font-bold text-lg text-on-surface">
          {profileModalMode === 'create' ? 'Create Theme Profile' : 'Edit Theme Profile'}
        </h3>
        <button 
          onclick={() => isProfileModalOpen = false}
          class="material-symbols-outlined text-[20px] text-on-surface-variant hover:bg-surface-container p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors"
        >
          close
        </button>
      </header>
      
      <form onsubmit={handleSaveProfile} class="flex flex-col gap-4">
        <!-- Profile Name -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-bold text-on-surface-variant" for="profileName">Profile Name</label>
          <input 
            type="text" 
            id="profileName" 
            bind:value={profileFormName} 
            placeholder="e.g., School, University, Work"
            class="bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-full"
            required
            autofocus
          />
        </div>

        <!-- Profile Icon/Avatar -->
        <div class="flex flex-col gap-2">
          <span class="text-xs font-bold text-on-surface-variant">Profile Icon / Avatar</span>
          
          <input 
            type="file" 
            accept="image/*" 
            bind:this={fileInputProfile} 
            onchange={handleProfileIconSelect}
            class="hidden" 
          />

          <div class="flex items-center gap-4">
            <!-- Icon Preview -->
            {#if profileFormIcon}
              <div class="relative shrink-0">
                <img src={profileFormIcon} class="w-16 h-16 rounded-full object-cover border border-outline-variant shadow-sm" alt="" />
                <button
                  type="button"
                  onclick={() => profileFormIcon = null}
                  class="absolute -top-1 -right-1 bg-error text-white rounded-full p-0.5 shadow-sm hover:scale-105 transition-transform flex items-center justify-center"
                  title="Remove Image"
                >
                  <span class="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            {:else}
              <div 
                style="background-color: {profileFormColor}"
                class="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0 shadow-sm border border-outline-variant"
              >
                {profileFormName ? profileFormName.charAt(0).toUpperCase() : 'P'}
              </div>
            {/if}

            <div class="flex flex-col gap-1.5">
              <button
                type="button"
                onclick={triggerProfileIconUpload}
                class="px-3.5 py-1.5 bg-surface border border-outline-variant hover:bg-surface-container text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1 focus:outline-none"
              >
                <span class="material-symbols-outlined text-[16px]">upload</span>
                Upload Custom Image
              </button>
              <p class="text-[10px] text-on-surface-variant">JPG, PNG supported. Square image recommended.</p>
            </div>
          </div>
        </div>

        <!-- Color Selection (only shown when custom icon is not set) -->
        {#if !profileFormIcon}
          <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-3">
            <span class="text-xs font-bold text-on-surface-variant">Initials Background Color</span>
            <div class="flex flex-wrap gap-2.5">
              {#each presetColors as color}
                <button
                  type="button"
                  onclick={() => profileFormColor = color}
                  style="background-color: {color}"
                  class="w-7 h-7 rounded-full border-2 transition-all cursor-pointer relative shrink-0
                         {profileFormColor === color ? 'border-primary ring-2 ring-primary/20 scale-105' : 'border-white/20 hover:scale-105'}"
                >
                  {#if profileFormColor === color}
                    <span class="material-symbols-outlined text-[16px] text-white absolute inset-0 flex items-center justify-center">check</span>
                  {/if}
                </button>
              {/each}
              
              <!-- Custom Color Input -->
              <div class="relative w-7 h-7 rounded-full overflow-hidden border border-outline-variant hover:scale-105 transition-transform cursor-pointer">
                <input 
                  type="color" 
                  bind:value={profileFormColor} 
                  class="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                />
                <div class="w-full h-full flex items-center justify-center bg-surface-container-high text-on-surface">
                  <span class="material-symbols-outlined text-[16px]">palette</span>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="flex justify-between items-center mt-3 pt-3 border-t border-outline-variant/30">
          <!-- Delete button (only in edit mode and if there are multiple profiles) -->
          {#if profileModalMode === 'edit' && store.profiles.length > 1}
            <button 
              type="button" 
              onclick={() => handleOpenDeleteProfile(store.profiles.find(p => p.id === editingProfileId))}
              class="px-4 py-2 text-error hover:bg-error/10 text-xs font-bold rounded-lg cursor-pointer focus:outline-none flex items-center gap-1 transition-colors"
            >
              <span class="material-symbols-outlined text-[16px]">delete</span>
              Delete Profile
            </button>
          {:else}
            <div></div> <!-- Spacer -->
          {/if}

          <div class="flex gap-2.5">
            <button 
              type="button" 
              onclick={() => isProfileModalOpen = false}
              class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-bold rounded-lg hover:bg-surface-container cursor-pointer focus:outline-none"
            >
              Cancel
            </button>
            <button 
              type="submit"
              class="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer focus:outline-none"
            >
              {profileModalMode === 'create' ? 'Create Profile' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Delete Profile Confirmation Modal -->
{#if isDeleteProfileConfirmOpen}
  <div class="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm select-none animate-fade-in">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-96 shadow-2xl flex flex-col gap-4">
      <div class="flex items-center gap-3 text-error">
        <span class="material-symbols-outlined text-2xl">warning</span>
        <h3 class="font-bold text-base text-on-surface">Delete Theme Profile</h3>
      </div>

      <p class="text-xs text-on-surface-variant leading-relaxed">
        Are you sure you want to delete the profile <strong>"{profileToDelete?.name}"</strong>?
      </p>
      
      <p class="text-xs text-error font-bold leading-normal bg-error/5 border border-error/10 p-3 rounded-lg">
        WARNING: This will permanently delete this theme profile, all its associated calligraphy lessons (lessons), and all assignments/drawings. This action cannot be undone.
      </p>

      <!-- Checkbox of certainty -->
      <label class="flex items-start gap-2.5 text-xs text-on-surface cursor-pointer select-none border border-outline-variant/60 rounded-lg p-3 hover:bg-surface-container-low transition-colors">
        <input 
          type="checkbox" 
          bind:checked={deleteProfileCheckboxChecked} 
          class="rounded border-outline-variant text-error focus:ring-error h-4 w-4 cursor-pointer mt-0.5" 
        />
        <div class="flex flex-col gap-0.5">
          <span class="font-semibold text-on-surface">I am sure</span>
          <span class="text-[10px] text-on-surface-variant">Yes, I want to permanently delete "{profileToDelete?.name}" and all its lessons.</span>
        </div>
      </label>

      <div class="flex justify-end gap-3 mt-2">
        <button
          onclick={() => isDeleteProfileConfirmOpen = false}
          class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
        >
          Cancel
        </button>
        <button
          onclick={() => {
            if (deleteProfileCheckboxChecked && profileToDelete) {
              store.deleteProfile(profileToDelete.id);
              isDeleteProfileConfirmOpen = false;
              isProfileModalOpen = false; // Close edit modal too
            }
          }}
          disabled={!deleteProfileCheckboxChecked}
          class="px-4 py-2 bg-error text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none"
        >
          Permanently Delete Profile
        </button>
      </div>
    </div>
  </div>
{/if}
