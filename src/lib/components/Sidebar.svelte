<script>
  import { store } from '../state/store.svelte';

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
</script>


<!-- Desktop Sidebar Navigation -->
<aside 
  class="bg-surface-container-low border-r border-outline-variant flex flex-col py-6 shrink-0 transition-all duration-300 relative z-30 h-screen overflow-x-hidden
         {isCollapsed ? 'w-16 px-2' : 'w-64 px-4'}"
>
  <!-- Header -->
  <div class="flex items-center mb-8 mt-2 justify-center {isCollapsed ? 'px-0' : 'px-2 gap-3'}">
    {#if !isCollapsed}
      <div class="w-8 h-8 bg-primary rounded flex items-center justify-center text-white font-bold shrink-0">
        <span class="material-symbols-outlined text-lg" data-weight="fill">edit_square</span>
      </div>
      <span class="font-bold text-xl text-primary tracking-tight transition-opacity duration-200">ScribeFlow</span>
    {/if}
    <button 
      onclick={toggleCollapse} 
      class="text-on-surface-variant hover:bg-surface-container-highest rounded-lg transition-colors active:scale-90 p-1.5 flex items-center justify-center {isCollapsed ? 'mx-auto' : 'ml-auto'}"
      title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
    >
      <span class="material-symbols-outlined">{isCollapsed ? 'menu' : 'menu_open'}</span>
    </button>
  </div>

  <!-- Navigation Links -->
  <nav class="flex-1 flex flex-col gap-1">
    <!-- Home / Dashboard link -->
    <button 
      onclick={() => handleNavigate('dashboard')}
      class="w-full flex items-center rounded-lg px-4 py-3 transition-all font-semibold text-sm relative group
             {isCollapsed ? 'justify-center' : 'gap-3'}
             {store.currentView === 'dashboard' ? 'bg-secondary-container text-on-secondary-container border-l-4 border-primary' : 'text-on-surface-variant hover:bg-surface-container-highest'}"
    >
      <span class="material-symbols-outlined" data-weight={store.currentView === 'dashboard' ? 'fill' : 'normal'}>home</span>
      {#if !isCollapsed}
        <span>Home</span>
      {/if}
      {#if isCollapsed}
        <div class="absolute left-16 bg-inverse-surface text-inverse-on-surface text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          Home
        </div>
      {/if}
    </button>

    <!-- Project shortcuts (Lessons list) -->
    <div class="mt-6 mb-2 justify-center flex {!isCollapsed ? 'px-4 w-full' : 'px-0'}">
      {#if !isCollapsed}
        <p class="text-xs font-bold text-on-surface-variant uppercase tracking-wider w-full">My Lessons</p>
      {:else}
        <div class="h-[1px] w-8 bg-outline-variant/30"></div>
      {/if}
    </div>
    <div class="flex flex-col gap-1 overflow-y-auto overflow-x-hidden max-h-[50vh] custom-scrollbar">
      {#each store.projects as project}
        <button 
          onclick={() => handleNavigate('project-detail', project)}
          class="w-full flex items-center rounded-lg hover:bg-surface-container-highest text-on-surface-variant text-left relative group
                 {isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-2 text-sm'}
                 {store.activeProject?.id === project.id && (store.currentView === 'project-detail' || store.currentView === 'practice') ? 'bg-surface-container font-semibold text-primary' : ''}"
        >
          {#if project.icon && project.icon.startsWith('data:image/')}
            <img src={project.icon} class="w-[18px] h-[18px] object-contain rounded shrink-0" alt="" />
          {:else}
            <span class="material-symbols-outlined text-[18px] shrink-0">{project.icon || 'history_edu'}</span>
          {/if}
          {#if !isCollapsed}
            <span class="truncate">{project.name}</span>
          {:else}
            <div class="absolute left-16 bg-inverse-surface text-inverse-on-surface text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              {project.name}
            </div>
          {/if}
        </button>
      {/each}
    </div>
  </nav>

  <!-- Footer Link (Settings) -->
  <div class="mt-auto border-t border-outline-variant/30 pt-4 flex flex-col gap-1">
    <button 
      onclick={() => handleNavigate('settings')}
      class="w-full flex items-center rounded-lg px-4 py-3 transition-all font-semibold text-sm relative group
             {isCollapsed ? 'justify-center' : 'gap-3'}
             {store.currentView === 'settings' ? 'bg-secondary-container text-on-secondary-container border-l-4 border-primary' : 'text-on-surface-variant hover:bg-surface-container-highest'}"
    >
      <span class="material-symbols-outlined" data-weight={store.currentView === 'settings' ? 'fill' : 'normal'}>settings</span>
      {#if !isCollapsed}
        <span>Settings</span>
      {/if}
      {#if isCollapsed}
        <div class="absolute left-16 bg-inverse-surface text-inverse-on-surface text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          Settings
        </div>
      {/if}
    </button>
  </div>
</aside>

