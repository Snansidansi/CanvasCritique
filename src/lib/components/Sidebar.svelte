<script lang="ts">
  import { store } from "../state/store.svelte";
  import { t } from "../services/i18n";

  // Local state for sidebar expansion on desktop
  let isCollapsed = $state(false);

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
  }

  function handleNavigate(view, project = null) {
    if (project) {
      store.selectProject(project);
    }
    store.setView(view);
  }

  function getNextTaskInOrder(project: any) {
    if (!project.tasks || project.tasks.length === 0) return null;
    const categories = project.categories || [];
    for (const category of categories) {
      const tasks = project.tasks.filter((t: any) => (t.category || 'Basics') === category);
      const next = tasks.find((t: any) => !t.completed);
      if (next) return next;
    }
    return project.tasks.find((t: any) => !t.completed) || project.tasks[0];
  }

  // Sidebar lesson reorder drag state
  let draggedLessonId = $state<string | null>(null);
  let sidebarDragGhostEl = $state<HTMLElement | null>(null);
  let sidebarDragStartX = 0;
  let sidebarDragStartY = 0;
  let sidebarDragGhostOffsetX = 0;
  let sidebarDragGhostOffsetY = 0;
  let isSidebarDragActive = $state(false);
  let sidebarDropIndex = $state<number | null>(null);

  function handleSidebarPointerDown(e: PointerEvent, projectId: string) {
    if (e.button !== 0 && e.button !== -1) return;
    const target = e.currentTarget as HTMLElement;
    if ((e.target as HTMLElement).closest('button')) return;
    sidebarDragStartX = e.clientX;
    sidebarDragStartY = e.clientY;
    try { target.setPointerCapture(e.pointerId); } catch (_) {}

    function onMove(me: PointerEvent) {
      const dx = me.clientX - sidebarDragStartX;
      const dy = me.clientY - sidebarDragStartY;
      if (!isSidebarDragActive && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        isSidebarDragActive = true;
        draggedLessonId = projectId;
        const ghost = target.cloneNode(true) as HTMLElement;
        const rect = target.getBoundingClientRect();
        ghost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;width:${rect.width}px;opacity:0.8;left:${rect.left}px;top:${rect.top}px;box-shadow:0 4px 12px rgba(0,0,0,0.15);border-radius:0.5rem;transform:scale(1.02);`;
        sidebarDragGhostOffsetX = me.clientX - rect.left;
        sidebarDragGhostOffsetY = me.clientY - rect.top;
        document.body.appendChild(ghost);
        sidebarDragGhostEl = ghost;
      }
      if (!isSidebarDragActive) return;
      if (sidebarDragGhostEl) {
        sidebarDragGhostEl.style.left = `${me.clientX - sidebarDragGhostOffsetX}px`;
        sidebarDragGhostEl.style.top = `${me.clientY - sidebarDragGhostOffsetY}px`;
      }
      if (sidebarDragGhostEl) sidebarDragGhostEl.style.display = 'none';
      const el = document.elementFromPoint(me.clientX, me.clientY);
      if (sidebarDragGhostEl) sidebarDragGhostEl.style.display = '';
      const row = el?.closest('[data-sidebar-project-id]') as HTMLElement | null;
      if (row && row.dataset.sidebarProjectId !== draggedLessonId) {
        const rows = Array.from(document.querySelectorAll('[data-sidebar-project-id]'));
        sidebarDropIndex = rows.indexOf(row);
      }
    }

    function onUp(ue: PointerEvent) {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      try { target.releasePointerCapture(ue.pointerId); } catch (_) {}
      if (sidebarDragGhostEl) { sidebarDragGhostEl.remove(); sidebarDragGhostEl = null; }
      if (isSidebarDragActive && draggedLessonId && sidebarDropIndex !== null) {
        const projects = store.projects.filter(p => p.profileId === store.activeProfileId);
        const ids = projects.map(p => p.id);
        const draggedIdx = ids.indexOf(draggedLessonId);
        if (draggedIdx !== -1 && draggedIdx !== sidebarDropIndex) {
          ids.splice(draggedIdx, 1);
          ids.splice(sidebarDropIndex, 0, draggedLessonId);
          store.reorderProjects(ids);
        }
      }
      isSidebarDragActive = false;
      draggedLessonId = null;
      sidebarDropIndex = null;
    }
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }
</script>

<!-- Desktop Sidebar Navigation -->
<aside
  class="bg-surface-container-low border-r border-outline-variant flex flex-col py-6 shrink-0 transition-all duration-300 relative z-30 h-screen overflow-x-hidden
         {isCollapsed ? 'w-16 px-2' : 'w-64 px-4'}"
>
  <!-- Header -->
  <div
    class="flex items-center mb-8 mt-2 justify-center {isCollapsed
      ? 'px-0'
      : 'px-2 gap-3'}"
  >
    {#if !isCollapsed}
      <div
        class="w-8 h-8 bg-primary rounded flex items-center justify-center text-white font-bold shrink-0"
      >
        <span class="material-symbols-outlined text-lg" data-weight="fill"
          >edit_square</span
        >
      </div>
      <span
        class="font-bold text-xl text-primary tracking-tight transition-opacity duration-200"
        >Canvas Critique</span
      >
    {/if}
    <button
      onclick={toggleCollapse}
      class="text-on-surface-variant hover:bg-surface-container-highest rounded-lg transition-colors active:scale-90 p-1.5 flex items-center justify-center {isCollapsed
        ? 'mx-auto'
        : 'ml-auto'}"
      title={isCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
    >
      <span class="material-symbols-outlined"
        >{isCollapsed ? "menu" : "menu_open"}</span
      >
    </button>
  </div>

  <!-- Navigation Links -->
  <nav class="flex-1 flex flex-col gap-1">
    <!-- Home / Dashboard link -->
    <button
      onclick={() => handleNavigate("dashboard")}
      class="w-full flex items-center rounded-lg transition-all font-semibold text-sm relative group
             {isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'}
             {store.currentView === 'dashboard'
        ? 'bg-secondary-container text-on-secondary-container border-l-4 border-primary'
        : 'text-on-surface-variant hover:bg-surface-container-highest'}"
    >
      <span
        class="material-symbols-outlined"
        data-weight={store.currentView === "dashboard" ? "fill" : "normal"}
        >home</span
      >
      {#if !isCollapsed}
        <span>{t("sidebar.home")}</span>
      {/if}
      {#if isCollapsed}
        <div
          class="absolute left-16 bg-inverse-surface text-inverse-on-surface text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50"
        >
          {t("sidebar.home")}
        </div>
      {/if}
    </button>

    <!-- Project shortcuts (Lessons list) -->
    <div
      class="mt-6 mb-2 justify-center flex {!isCollapsed
        ? 'px-4 w-full'
        : 'px-0'}"
    >
      {#if !isCollapsed}
        <p
          class="text-xs font-bold text-on-surface-variant uppercase tracking-wider w-full"
        >
          {t("sidebar.myLessons")}
        </p>
      {:else}
        <div class="h-0.5 w-8 bg-outline-variant"></div>
      {/if}
    </div>
    <div
      class="flex flex-col gap-1 overflow-x-hidden max-h-[50vh]
             {isCollapsed ? 'overflow-y-auto hide-scrollbar' : 'overflow-y-auto custom-scrollbar'}"
    >
      {#each store.projects.filter(p => p.profileId === store.activeProfileId) as project, idx}
        {#if isSidebarDragActive && sidebarDropIndex === idx && draggedLessonId && draggedLessonId !== project.id}
          <div class="h-0.5 bg-primary rounded-full mx-2 animate-pulse"></div>
        {/if}
        <div
          data-sidebar-project-id={project.id}
          onpointerdown={(e) => handleSidebarPointerDown(e, project.id)}
          role="button"
          tabindex="0"
          onclick={() => { if (!isSidebarDragActive) handleNavigate("project-detail", project); }}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleNavigate("project-detail", project);
            }
          }}
          class="w-full flex items-center rounded-lg hover:bg-surface-container-highest text-on-surface-variant text-left relative group cursor-pointer transition-colors duration-200 select-none
                 {isCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between pl-4 py-2 text-sm'}
                 {!isCollapsed ? (project.tasks && project.tasks.length > 0 ? 'pr-2' : 'pr-4') : ''}
                 {store.activeProject?.id === project.id &&
          (store.currentView === 'project-detail' ||
            store.currentView === 'practice')
            ? 'bg-surface-container font-semibold text-primary'
            : ''}"
        >
          {#if !isCollapsed}
            <div class="flex items-center gap-3 min-w-0 flex-1">
              {#if project.icon && project.icon.startsWith("data:image/")}
                <img
                  src={project.icon}
                  class="w-4.5 h-4.5 object-contain rounded shrink-0"
                  alt=""
                />
              {:else}
                <span class="material-symbols-outlined text-[18px] shrink-0"
                  >{project.icon || "history_edu"}</span
                >
              {/if}
              <span class="truncate flex-1 min-w-0">{project.name}</span>
            </div>

            {#if project.tasks && project.tasks.length > 0}
              {@const nextTask = getNextTaskInOrder(project)}
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  store.selectProject(project);
                  store.selectTask(nextTask);
                }}
                class="text-outline hover:text-primary transition-all p-1 rounded hover:bg-surface-container-high cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto shrink-0"
                title={t("sidebar.resumeLesson")}
              >
                <span class="material-symbols-outlined text-[18px]">play_arrow</span>
              </button>
            {/if}
          {:else}
            {#if project.icon && project.icon.startsWith("data:image/")}
              <img
                src={project.icon}
                class="w-4.5 h-4.5 object-contain rounded shrink-0"
                alt=""
              />
            {:else}
              <span class="material-symbols-outlined text-[18px] shrink-0"
                >{project.icon || "history_edu"}</span
              >
            {/if}
            <div
              class="absolute left-16 bg-inverse-surface text-inverse-on-surface text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50"
            >
              {project.name}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </nav>

  <!-- Footer Link (Settings) -->
  <div
    class="mt-auto border-t border-outline-variant/30 pt-4 flex flex-col gap-1"
  >
    <!-- Canvas Settings -->
    <button
      onclick={() => {
        if (store.currentView === 'practice') {
          store.canvasSettingsOpen = true;
        }
      }}
      disabled={store.currentView !== 'practice'}
      class="w-full flex items-center rounded-lg transition-all font-semibold text-sm relative group
             {isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'}
             {store.currentView !== 'practice'
        ? 'opacity-40 cursor-not-allowed text-on-surface-variant/40'
        : (store.canvasSettingsOpen
          ? 'bg-secondary-container text-on-secondary-container border-l-4 border-primary'
          : 'text-on-surface-variant hover:bg-surface-container-highest')}"
      title={store.currentView !== 'practice' ? t("sidebar.canvasSettingsDisabledTooltip") : t("sidebar.canvasSettings")}
    >
      <span
        class="material-symbols-outlined"
        data-weight={store.canvasSettingsOpen ? "fill" : "normal"}
        >tune</span
      >
      {#if !isCollapsed}
        <span>{t("sidebar.canvasSettings")}</span>
      {/if}
      {#if isCollapsed}
        <div
          class="absolute left-16 bg-inverse-surface text-inverse-on-surface text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50"
        >
          {t("sidebar.canvasSettings")}
        </div>
      {/if}
    </button>

    <!-- App Settings -->
    <button
      onclick={() => handleNavigate("settings")}
      class="w-full flex items-center rounded-lg transition-all font-semibold text-sm relative group
             {isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'}
             {store.currentView === 'settings'
        ? 'bg-secondary-container text-on-secondary-container border-l-4 border-primary'
        : 'text-on-surface-variant hover:bg-surface-container-highest'}"
    >
      <span
        class="material-symbols-outlined"
        data-weight={store.currentView === "settings" ? "fill" : "normal"}
        >settings</span
      >
      {#if !isCollapsed}
        <span>{t("sidebar.settings")}</span>
      {/if}
      {#if isCollapsed}
        <div
          class="absolute left-16 bg-inverse-surface text-inverse-on-surface text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50"
        >
          {t("sidebar.settings")}
        </div>
      {/if}
    </button>
  </div>
</aside>

