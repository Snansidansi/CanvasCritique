<script lang="ts">
  import { store } from "../state/store.svelte";
  import CreateProjectModal from "../components/dashboard/CreateProjectModal.svelte";
  import ProfileModal from "../components/dashboard/ProfileModal.svelte";
  import DeleteProfileConfirm from "../components/dashboard/DeleteProfileConfirm.svelte";
  import { t } from "../services/i18n";
  import { syncWebDav } from "../services/webdav";
  import { open } from '@tauri-apps/plugin-dialog';
  import { readFile } from '@tauri-apps/plugin-fs';

  // Local state
  let searchQuery = $state("");
  let isAddProjectOpen = $state(false);

  function importLessonData(jsonData: string) {
    try {
      const imported = JSON.parse(jsonData);
      if (imported.isTasksExport) {
        store.confirm(
          t('dialogs.importErrorTitle') || 'Importfehler',
          t('dialogs.importErrorTasksOnlyInLesson') || 'Tasks können nur in eine Lektion importiert werden.',
          () => {},
          null,
          true
        );
        return;
      }
      store.importProject(imported);
    } catch (err) {
      store.showNotification(t("dashboard.notifications.parseFailed"), "error");
    }
  }

  async function handleNativeImportLessons() {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [{ name: 'Lesson Package', extensions: ['json', 'ccpack'] }]
      });
      if (!selected) return;

      store.showLoading(t('common.importing') || 'Importiere...');
      try {
        const filePaths = Array.isArray(selected) ? selected : [selected];
        const projectDatas = [];
        for (const path of filePaths) {
          const isCcpack = path.endsWith('.ccpack');
          let imported;
          if (isCcpack) {
            const bytes = await readFile(path);
            imported = await store.importCcpackFile(bytes);
          } else {
            const bytes = await readFile(path);
            const text = new TextDecoder().decode(bytes);
            imported = JSON.parse(text);
          }

          if (imported.isTasksExport) {
            store.hideLoading();
            store.confirm(
              t('dialogs.importErrorTitle') || 'Importfehler',
              t('dialogs.importErrorTasksOnlyInLesson') || 'Tasks können nur in eine Lektion importiert werden.',
              () => {},
              null,
              true
            );
            return;
          }
          projectDatas.push(imported);
        }

        store.hideLoading();
        if (projectDatas.length > 0) {
          store.importProject(projectDatas);
        }
      } catch (innerErr) {
        store.hideLoading();
        throw innerErr;
      }
    } catch (err) {
      console.error(err);
      store.showNotification(t("dashboard.notifications.parseFailed"), "error");
    }
  }

  let isDragging = $state(false);

  function handleDragOver(e: DragEvent) {
    if (isAddProjectOpen || isProfileModalOpen || isDeleteProfileConfirmOpen) {
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDragEnter(e: DragEvent) {
    if (isAddProjectOpen || isProfileModalOpen || isDeleteProfileConfirmOpen) {
      return;
    }
    e.preventDefault();
    if (e.dataTransfer?.types.includes("Files")) {
      isDragging = true;
    }
  }

  function handleDragLeave(e: DragEvent) {
    if (isAddProjectOpen || isProfileModalOpen || isDeleteProfileConfirmOpen) {
      return;
    }
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      isDragging = false;
    }
  }

  async function handleDrop(e: DragEvent) {
    if (isAddProjectOpen || isProfileModalOpen || isDeleteProfileConfirmOpen) {
      return;
    }
    e.preventDefault();
    isDragging = false;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    store.showLoading(t('common.importing') || 'Importiere...');
    try {
      const projectDatas = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isCcpack = file.name.endsWith('.ccpack');
        if (!isCcpack && file.type !== "application/json" && !file.name.endsWith(".json")) {
          store.showNotification(t("dashboard.notifications.dropValidJson"), "error");
          continue;
        }
        try {
          const reader = new FileReader();
          const imported = await new Promise<any>((resolve, reject) => {
            reader.onload = async () => {
              try {
                if (isCcpack) {
                  const bytes = new Uint8Array(reader.result as ArrayBuffer);
                  const result = await store.importCcpackFile(bytes);
                  resolve(result);
                } else {
                  const result = JSON.parse(reader.result as string);
                  resolve(result);
                }
              } catch (err) {
                reject(err);
              }
            };
            reader.onerror = () => reject(reader.error);
            if (isCcpack) {
              reader.readAsArrayBuffer(file);
            } else {
              reader.readAsText(file);
            }
          });

          if (imported.isTasksExport) {
            store.hideLoading();
            store.confirm(
              t('dialogs.importErrorTitle') || 'Importfehler',
              t('dialogs.importErrorTasksOnlyInLesson') || 'Tasks können nur in eine Lektion importiert werden.',
              () => {},
              null,
              true
            );
            return;
          }
          projectDatas.push(imported);
        } catch (err) {
          store.showNotification(t("dashboard.notifications.parseFailed"), "error");
        }
      }

      store.hideLoading();
      if (projectDatas.length > 0) {
        store.importProject(projectDatas);
      }
    } catch (innerErr) {
      store.hideLoading();
      console.error(innerErr);
    }
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

  // Lesson drag-and-drop reorder state
  let draggedProjectId = $state<string | null>(null);
  let dragGhostEl = $state<HTMLElement | null>(null);
  let dragPointerStartX = 0;
  let dragPointerStartY = 0;
  let dragGhostOffsetX = 0;
  let dragGhostOffsetY = 0;
  let isLessonDragActive = $state(false);
  let dropTargetIndex = $state<number | null>(null);

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

  // Edge auto-scrolling during drag
  let autoScrollRafId: number | null = null;
  function updateAutoScroll(pointerY: number, containerEl?: HTMLElement | null) {
    if (autoScrollRafId) cancelAnimationFrame(autoScrollRafId);
    const scrollTarget = containerEl || document.scrollingElement || document.documentElement;
    const threshold = 100;
    const viewportHeight = window.innerHeight;

    let speed = 0;
    if (pointerY < threshold) {
      speed = -Math.max(4, Math.min(25, (threshold - pointerY) * 0.35));
    } else if (pointerY > viewportHeight - threshold) {
      speed = Math.max(4, Math.min(25, (pointerY - (viewportHeight - threshold)) * 0.35));
    }

    if (speed !== 0) {
      function step() {
        if (scrollTarget === document.scrollingElement || scrollTarget === document.documentElement) {
          window.scrollBy(0, speed);
        } else if (scrollTarget instanceof HTMLElement) {
          scrollTarget.scrollTop += speed;
        }
        autoScrollRafId = requestAnimationFrame(step);
      }
      autoScrollRafId = requestAnimationFrame(step);
    }
  }

  function stopAutoScroll() {
    if (autoScrollRafId) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }
  }

  // Lesson drag-and-drop handlers
  function handleLessonPointerDown(e: PointerEvent, projectId: string) {
    if (e.button !== 0 && e.button !== -1) return;
    const target = e.currentTarget as HTMLElement;
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('select') || (e.target as HTMLElement).closest('summary') || (e.target as HTMLElement).closest('details')) return;

    dragPointerStartX = e.clientX;
    dragPointerStartY = e.clientY;

    try { target.setPointerCapture(e.pointerId); } catch (_) {}

    function onMove(me: PointerEvent) {
      const dx = me.clientX - dragPointerStartX;
      const dy = me.clientY - dragPointerStartY;

      if (!isLessonDragActive && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        isLessonDragActive = true;
        draggedProjectId = projectId;

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

      if (!isLessonDragActive) return;

      updateAutoScroll(me.clientY);

      if (dragGhostEl) {
        dragGhostEl.style.left = `${me.clientX - dragGhostOffsetX}px`;
        dragGhostEl.style.top  = `${me.clientY - dragGhostOffsetY}px`;
      }

      if (dragGhostEl) dragGhostEl.style.display = 'none';
      const el = document.elementFromPoint(me.clientX, me.clientY);
      if (dragGhostEl) dragGhostEl.style.display = '';

      const card = el?.closest('[data-project-id]') as HTMLElement | null;
      if (card && card.dataset.projectId !== draggedProjectId) {
        const visibleCards = Array.from(
          document.querySelectorAll('.projects-grid-section [data-project-id]')
        );
        const idx = visibleCards.indexOf(card);
        const rect = card.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const midY = rect.top + rect.height / 2;
        const dx = me.clientX - midX;
        const dy = me.clientY - midY;
        if (Math.abs(dx) > Math.abs(dy)) {
          dropTargetIndex = dx < 0 ? idx : idx + 1;
        } else {
          dropTargetIndex = dy < 0 ? idx : idx + 1;
        }
      } else if (!card) {
        const gridSection = document.querySelector('.projects-grid-section');
        if (gridSection) {
          const cards = Array.from(gridSection.querySelectorAll('[data-project-id]'));
          if (cards.length > 0) {
            const lastCard = cards[cards.length - 1];
            const rect = lastCard.getBoundingClientRect();
            if (me.clientY > rect.bottom) {
              dropTargetIndex = cards.length;
            }
          }
        }
      }
    }

    function onUp(ue: PointerEvent) {
      stopAutoScroll();
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      try { target.releasePointerCapture(ue.pointerId); } catch (_) {}

      if (dragGhostEl) {
        dragGhostEl.remove();
        dragGhostEl = null;
      }

      if (isLessonDragActive && draggedProjectId && dropTargetIndex !== null) {
        const orderedIds = filteredProjects.map(p => p.id);
        const draggedIdx = orderedIds.indexOf(draggedProjectId);
        if (draggedIdx !== -1 && draggedIdx !== dropTargetIndex) {
          orderedIds.splice(draggedIdx, 1);
          orderedIds.splice(dropTargetIndex, 0, draggedProjectId);
          store.reorderProjects(orderedIds);
        }
      }

      isLessonDragActive = false;
      draggedProjectId = null;
      dropTargetIndex = null;
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  // Profile drag-and-drop state
  let isProfileDragActive = $state(false);
  let draggedProfileId = $state<string | null>(null);
  let dragProfileStartX = 0;
  let dragProfileStartY = 0;
  let dragProfileSourceEl = $state<HTMLElement | null>(null);
  let dragProfileGhostEl = $state<HTMLElement | null>(null);
  let dragProfileGhostOffsetX = 0;
  let dragProfileGhostOffsetY = 0;
  let dropProfileIndicatorIndex = $state<number | null>(null);

  function handleProfilePointerDown(e: PointerEvent, profileId: string, index: number) {
    if (e.button !== 0 && e.button !== -1) return;
    const target = e.currentTarget as HTMLElement;
    // Ignore drags starting on interactive controls (edit button)
    if ((e.target as HTMLElement).closest('button')) return;

    dragProfileStartX = e.clientX;
    dragProfileStartY = e.clientY;
    dragProfileSourceEl = target;

    try { target.setPointerCapture(e.pointerId); } catch (_) {}

    function onMove(me: PointerEvent) {
      const dx = me.clientX - dragProfileStartX;
      const dy = me.clientY - dragProfileStartY;

      if (!isProfileDragActive && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        isProfileDragActive = true;
        draggedProfileId = profileId;

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
          transition: none;
          background-color: var(--color-surface, #1e1e24);
          border: 1px solid var(--color-outline-variant, #3a3a44);
        `;
        dragProfileGhostOffsetX = me.clientX - rect.left;
        dragProfileGhostOffsetY = me.clientY - rect.top;
        document.body.appendChild(ghost);
        dragProfileGhostEl = ghost;
      }

      if (!isProfileDragActive) return;

      if (dragProfileGhostEl) {
        dragProfileGhostEl.style.left = `${me.clientX - dragProfileGhostOffsetX}px`;
        dragProfileGhostEl.style.top  = `${me.clientY - dragProfileGhostOffsetY}px`;
      }

      if (dragProfileGhostEl) dragProfileGhostEl.style.display = 'none';
      const el = document.elementFromPoint(me.clientX, me.clientY);
      if (dragProfileGhostEl) dragProfileGhostEl.style.display = '';

      const row = el?.closest('[data-profile-id]') as HTMLElement | null;
      const listContainer = el?.closest('.overflow-y-auto') as HTMLElement | null;

      if (row) {
        const rowIndex = parseInt(row.dataset.profileIndex || '0', 10);
        const rect = row.getBoundingClientRect();
        const relativeY = me.clientY - rect.top;
        if (relativeY < rect.height / 2) {
          dropProfileIndicatorIndex = rowIndex;
        } else {
          dropProfileIndicatorIndex = rowIndex + 1;
        }
      } else if (listContainer) {
        const rect = listContainer.getBoundingClientRect();
        if (me.clientY < rect.top + 20) {
          dropProfileIndicatorIndex = 0;
        } else {
          dropProfileIndicatorIndex = store.profiles.length;
        }
      } else {
        dropProfileIndicatorIndex = null;
      }
    }

    function onUp(ue: PointerEvent) {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      try { target.releasePointerCapture(ue.pointerId); } catch (_) {}

      if (dragProfileGhostEl) {
        dragProfileGhostEl.remove();
        dragProfileGhostEl = null;
      }

      if (isProfileDragActive) {
        if (draggedProfileId && dropProfileIndicatorIndex !== null) {
          const currentIndex = store.profiles.findIndex(p => p.id === draggedProfileId);
          let targetIndex = dropProfileIndicatorIndex;
          if (currentIndex !== -1) {
            if (targetIndex > currentIndex) {
              targetIndex--;
            }
            if (targetIndex !== currentIndex && targetIndex >= 0 && targetIndex < store.profiles.length) {
              store.reorderProfiles(currentIndex, targetIndex);
            }
          }
        }
      } else {
        store.selectProfile(profileId);
        isProfileMenuOpen = false;
      }

      isProfileDragActive = false;
      draggedProfileId = null;
      dropProfileIndicatorIndex = null;
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
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
    class="h-16 pl-8 pr-4 border-b border-outline-variant bg-surface flex justify-between items-center z-10 shrink-0"
  >
    <div class="text-on-surface font-semibold text-lg">{t('dashboard.title')}</div>

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
        placeholder={t('dashboard.searchPlaceholder')}
        type="text"
      />
    </div>

    <!-- WebDAV Sync Button -->
    {#if store.settings.webdavEnabled && store.settings.webdavUrl && store.settings.webdavUrl.trim()}
      <button
        onclick={() => syncWebDav()}
        disabled={store.isSyncing}
        class="bg-surface-container-low text-on-surface p-2 rounded-lg border border-outline-variant hover:bg-surface-container-high transition-colors flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
        title={t('settings.data.webdavTitle') || 'Sync'}
      >
        <span class="material-symbols-outlined text-[20px] {store.isSyncing ? 'animate-spin-reverse' : ''}">sync</span>
      </button>
    {/if}

    <!-- Import Lesson Button -->
    <button
      onclick={handleNativeImportLessons}
      class="bg-surface-container-low text-on-surface p-2 rounded-lg border border-outline-variant hover:bg-surface-container-high transition-colors flex items-center justify-center shrink-0 cursor-pointer"
      title={t('dashboard.importLesson')}
    >
      <span class="material-symbols-outlined text-[20px]">file_download</span>
    </button>

    <!-- Create lesson button -->
    <button
      onclick={() => (isAddProjectOpen = true)}
      class="bg-primary text-on-primary font-semibold text-xs py-2.5 px-4 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0 cursor-pointer animate-fade-in"
    >
      <span class="material-symbols-outlined text-[18px]">add_circle</span>
      {t('dashboard.createLesson')}
    </button>

    <!-- Profile Circle Switcher -->
    <div class="relative shrink-0 select-none flex items-center">
      <button
        onclick={() => isProfileMenuOpen = !isProfileMenuOpen}
        class="focus:outline-none flex items-center justify-center p-0.5 rounded-full hover:ring-2 hover:ring-primary/30 transition-all shrink-0 cursor-pointer"
        title={t('profile.menuTooltip')}
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
            {t('profile.profilesTitle')}
          </div>
          <div class="flex flex-col gap-0.5 max-h-60 overflow-y-auto custom-scrollbar my-1 relative">
            {#each store.profiles as p, index (p.id)}
              {#if isProfileDragActive && dropProfileIndicatorIndex === index}
                <div class="h-1 rounded-full bg-primary/70 mx-1.5 my-0.5 transition-all"></div>
              {/if}
              <div 
                data-profile-id={p.id}
                data-profile-index={index}
                onpointerdown={(e) => handleProfilePointerDown(e, p.id, index)}
                style="touch-action: none;"
                class="flex items-center justify-between hover:bg-surface-container rounded-lg p-1.5 transition-colors relative cursor-pointer
                       {isProfileDragActive && draggedProfileId === p.id ? 'opacity-40 scale-95' : ''}"
              >
                <div class="flex items-center gap-2.5 grow text-left font-bold text-xs text-on-surface hover:text-primary transition-colors min-w-0 select-none">
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
                </div>
                
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    isProfileMenuOpen = false;
                    handleOpenEditProfile(p);
                  }}
                  class="material-symbols-outlined text-[16px] text-outline-variant hover:text-primary p-1 rounded hover:bg-surface-container-high cursor-pointer focus:outline-none flex items-center justify-center ml-1 shrink-0 transition-colors"
                  title={t('profile.editTitle')}
                >
                  edit
                </button>
              </div>
            {/each}
            {#if isProfileDragActive && dropProfileIndicatorIndex === store.profiles.length}
              <div class="h-1 rounded-full bg-primary/70 mx-1.5 my-0.5 transition-all"></div>
            {/if}
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
            {t('profile.createNewProfile')}
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
        {t('dashboard.welcomeBack')}
        <p class="text-sm text-on-surface-variant mt-1">
          {t('dashboard.activeLessons', { count: activeProjectsCount })}
        </p>
      </h2>
    </div>
  </section>

  <!-- Projects Grid -->
  <section
    class="projects-grid-section grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-6 items-start"
  >
    {#each filteredProjects as project, idx (project.id)}
      {@const progress = getProjectProgress(project)}
      {@const remaining = getRemainingTasks(project)}
      {@const isDeleting = store.deletingProjectIds.includes(project.id)}
      {#if dropTargetIndex === idx && draggedProjectId && draggedProjectId !== project.id}
        <div class="h-1 bg-primary rounded-full mx-2 animate-pulse"></div>
      {/if}
      <article
        data-project-id={project.id}
        onpointerdown={(e) => !isDeleting && handleLessonPointerDown(e, project.id)}
        class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 flex flex-col justify-between hover:border-primary transition-colors group relative overflow-hidden shadow-sm self-start w-full {draggedProjectId === project.id ? 'opacity-50 scale-95' : ''} {isLessonDragActive ? 'cursor-grabbing' : 'cursor-grab'} select-none {isDeleting ? 'pointer-events-none opacity-80' : ''}"
      >
        {#if isDeleting}
          <div class="absolute inset-0 bg-surface-container/60 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center gap-2">
            <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span class="text-sm font-semibold text-on-surface">{t('common.deleting')}</span>
          </div>
        {/if}
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
                {@const nextTask = getNextTaskInOrder(project)}
                <button
                  onclick={() => openPractice(nextTask, project)}
                  class="text-outline hover:text-primary transition-colors p-1 rounded hover:bg-surface-container-high cursor-pointer flex items-center justify-center"
                  title={t('sidebar.resumeLesson')}
                >
                  <span class="material-symbols-outlined text-[20px]">play_arrow</span>
                </button>
              {/if}
              <button
                onclick={() => store.exportProject(project)}
                class="text-outline hover:text-primary transition-colors p-1 rounded hover:bg-surface-container-high cursor-pointer flex items-center justify-center"
                title={t('dashboard.exportLesson')}
              >
                <span class="material-symbols-outlined text-[20px]"
                  >file_upload</span
                >
              </button>
              <button
                onclick={() =>
                  store.confirm(
                    t("dashboard.deleteLessonTitle"),
                    t("dashboard.deleteLessonConfirm", { name: project.name }),
                    () => store.deleteProject(project.id),
                  )}
                class="text-outline hover:text-error transition-colors p-1 rounded hover:bg-surface-container-high cursor-pointer"
                title={t("dashboard.deleteLessonTitle")}
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
              {remaining === 1 ? t('dashboard.taskRemaining') : t('dashboard.tasksRemaining', { remaining })}
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
                {t('dashboard.tasksChecklist')}
              </span>
              <span
                class="material-symbols-outlined transition-transform group-open/tasks:rotate-180"
                >expand_more</span
              >
            </summary>

            <div class="mt-3 space-y-3">
              {#if project.tasks && project.tasks.length > 0}
                {#each (project.categories || []) as category}
                  {@const sectionTasks = project.tasks.filter((t) => (t.category || "Basics") === category)}
                  {#if sectionTasks.length > 0}
                    {@const allCompleted = sectionTasks.every((t) => t.completed)}
                    <details class="group/section" open={!allCompleted}>
                      <summary class="flex items-center justify-between cursor-pointer list-none py-1 hover:text-primary transition-colors">
                        <p class="text-[10px] font-bold text-outline uppercase tracking-wider">
                          {category}
                        </p>
                        <span class="material-symbols-outlined text-[16px] text-on-surface transition-transform group-open/section:rotate-180">
                          expand_more
                        </span>
                      </summary>
                      <div class="space-y-1 mt-1">
                        {#each sectionTasks as task}
                          <div class="flex items-center gap-2 text-sm group/task-item py-1">
                            <button
                              onclick={() => store.toggleTaskCompleted(project.id, task.id)}
                              class="text-primary focus:outline-none flex items-center cursor-pointer"
                            >
                              <span class="material-symbols-outlined text-[20px] select-none hover:opacity-80">
                                {task.completed ? "check_box" : "check_box_outline_blank"}
                              </span>
                            </button>
                            <button
                              onclick={() => openPractice(task, project)}
                              class="text-left flex-1 text-on-surface hover:text-primary hover:underline truncate {task.completed ? 'line-through text-outline' : ''} cursor-pointer"
                            >
                              {task.name}
                            </button>
                            <button
                              onclick={() => {
                                store.selectProject(project);
                                store.setEditingTask(task);
                              }}
                              class="opacity-0 group-hover/task-item:opacity-100 text-outline hover:text-primary transition-opacity p-0.5 focus:opacity-100 focus:outline-none cursor-pointer"
                              title={t('dashboard.editTask')}
                            >
                              <span class="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                          </div>
                        {/each}
                      </div>
                    </details>
                  {/if}
                {/each}
                {#if project.tasks.filter((t) => !(project.categories || []).includes(t.category || "Basics")).length > 0}
                  <details class="group/section" open={!project.tasks.filter((t) => !(project.categories || []).includes(t.category || "Basics")).every((t) => t.completed)}>
                    <summary class="flex items-center justify-between cursor-pointer list-none py-1 hover:text-primary transition-colors">
                      <p class="text-[10px] font-bold text-outline uppercase tracking-wider">
                        {t('projectDetail.roadmapTitle')}
                      </p>
                      <span class="material-symbols-outlined text-[16px] text-on-surface transition-transform group-open/section:rotate-180">
                        expand_more
                      </span>
                    </summary>
                    <div class="space-y-1 mt-1">
                      {#each project.tasks.filter((t) => !(project.categories || []).includes(t.category || "Basics")) as task}
                        <div class="flex items-center gap-2 text-sm group/task-item py-1">
                          <button
                            onclick={() => store.toggleTaskCompleted(project.id, task.id)}
                            class="text-primary focus:outline-none flex items-center cursor-pointer"
                          >
                            <span class="material-symbols-outlined text-[20px] select-none hover:opacity-80">
                              {task.completed ? "check_box" : "check_box_outline_blank"}
                            </span>
                          </button>
                          <button
                            onclick={() => openPractice(task, project)}
                            class="text-left flex-1 text-on-surface hover:text-primary hover:underline truncate {task.completed ? 'line-through text-outline' : ''} cursor-pointer"
                          >
                            {task.name}
                          </button>
                          <button
                            onclick={() => {
                              store.selectProject(project);
                              store.setEditingTask(task);
                            }}
                            class="opacity-0 group-hover/task-item:opacity-100 text-outline hover:text-primary transition-opacity p-0.5 focus:opacity-100 focus:outline-none cursor-pointer"
                            title={t('dashboard.editTask')}
                          >
                            <span class="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                        </div>
                      {/each}
                    </div>
                  </details>
                {/if}
              {:else}
                <p class="text-xs text-on-surface-variant italic">
                  {t('dashboard.noTasks')}
                </p>
              {/if}

              <!-- Quick Add Task Interface -->
              <div class="pt-2 border-t border-outline-variant/30 space-y-2">
                <input
                  type="text"
                  bind:value={quickTaskName[project.id]}
                  placeholder={t('dashboard.quickTaskPlaceholder')}
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
                    {#each (project.categories && project.categories.length > 0) ? project.categories : ['Grundlagen'] as category}
                      <option value={category}>{category}</option>
                    {/each}
                  </select>

                  <button
                    onclick={() => handleQuickAddTask(project.id)}
                    class="bg-secondary-container text-on-secondary-container font-bold text-[10px] px-3 py-1 rounded-lg hover:opacity-90"
                  >
                    {t('dashboard.addTask')}
                  </button>
                </div>
              </div>
            </div>
          </details>
        </div>
      </article>
      {#if dropTargetIndex === filteredProjects.length && draggedProjectId}
        <div class="h-1 bg-primary rounded-full mx-2 animate-pulse"></div>
      {/if}
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
        <span class="material-symbols-outlined text-5xl text-primary">file_download</span>
        <h3 class="font-bold text-lg text-on-surface">{t('dashboard.dragDropTitle')}</h3>
        <p class="text-xs text-on-surface-variant leading-relaxed">{t('dashboard.dragDropDesc')}</p>
      </div>
    </div>
  {/if}
</div>
