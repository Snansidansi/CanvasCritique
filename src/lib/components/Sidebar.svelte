<script>
  import { store } from '../state/store.svelte.js';

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
  class="bg-surface-container-low border-r border-outline-variant flex flex-col py-6 px-4 shrink-0 transition-all duration-300 relative z-30 h-screen
         {isCollapsed ? 'w-20' : 'w-64'}"
>
  <!-- Header -->
  <div class="flex items-center gap-3 mb-8 px-2 mt-2">
    <div class="w-8 h-8 bg-primary rounded flex items-center justify-center text-white font-bold shrink-0">
      <span class="material-symbols-outlined text-lg" data-weight="fill">edit_square</span>
    </div>
    {#if !isCollapsed}
      <span class="font-bold text-xl text-primary tracking-tight transition-opacity duration-200">ScribeFlow</span>
    {/if}
    <button 
      onclick={toggleCollapse} 
      class="ml-auto p-1 text-on-surface-variant hover:bg-surface-container-highest rounded-lg transition-colors active:scale-90"
      title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
    >
      <span class="material-symbols-outlined">{isCollapsed ? 'menu' : 'menu_open'}</span>
    </button>
  </div>

  <!-- New Project Button / CTA -->
  <div class="mb-6 px-1">
    <button 
      onclick={() => handleNavigate('task-editor')}
      class="w-full flex items-center gap-2 bg-primary text-on-primary py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-sm justify-center
             {isCollapsed ? 'px-0' : 'px-4'}"
      title="Create New Task"
    >
      <span class="material-symbols-outlined text-[20px]">add</span>
      {#if !isCollapsed}
        <span class="text-sm">New Task</span>
      {/if}
    </button>
  </div>

  <!-- Navigation Links -->
  <nav class="flex-1 flex flex-col gap-1">
    <!-- Home / Dashboard link -->
    <button 
      onclick={() => handleNavigate('dashboard')}
      class="w-full flex items-center gap-3 rounded-lg px-4 py-3 transition-all font-semibold text-sm relative group
             {store.currentView === 'dashboard' ? 'bg-secondary-container text-on-secondary-container border-l-4 border-primary' : 'text-on-surface-variant hover:bg-surface-container-highest'}"
    >
      <span class="material-symbols-outlined" data-weight={store.currentView === 'dashboard' ? 'fill' : 'normal'}>home</span>
      {#if !isCollapsed}
        <span>Home</span>
      {/if}
      {#if isCollapsed}
        <div class="absolute left-20 bg-inverse-surface text-inverse-on-surface text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          Home
        </div>
      {/if}
    </button>

    <!-- Project shortcuts (if collapsed is false) -->
    {#if !isCollapsed && store.projects.length > 0}
      <div class="mt-6 mb-2 px-4">
        <p class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">My Scripts</p>
      </div>
      <div class="flex flex-col gap-1 overflow-y-auto max-h-[40vh] custom-scrollbar">
        {#each store.projects as project}
          <button 
            onclick={() => handleNavigate('dashboard', project)}
            class="flex items-center gap-3 px-4 py-2 text-sm rounded-lg hover:bg-surface-container-highest text-on-surface-variant text-left
                   {store.activeProject?.id === project.id && store.currentView === 'dashboard' ? 'bg-surface-container font-semibold text-primary' : ''}"
          >
            <span class="material-symbols-outlined text-[18px]">{project.icon || 'history_edu'}</span>
            <span class="truncate">{project.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  </nav>

  <!-- Footer Link (Settings) -->
  <div class="mt-auto border-t border-outline-variant/30 pt-4 flex flex-col gap-1">
    <button 
      onclick={() => handleNavigate('settings')}
      class="w-full flex items-center gap-3 rounded-lg px-4 py-3 transition-all font-semibold text-sm relative group
             {store.currentView === 'settings' ? 'bg-secondary-container text-on-secondary-container border-l-4 border-primary' : 'text-on-surface-variant hover:bg-surface-container-highest'}"
    >
      <span class="material-symbols-outlined" data-weight={store.currentView === 'settings' ? 'fill' : 'normal'}>settings</span>
      {#if !isCollapsed}
        <span>Settings</span>
      {/if}
      {#if isCollapsed}
        <div class="absolute left-20 bg-inverse-surface text-inverse-on-surface text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
          Settings
        </div>
      {/if}
    </button>
  </div>
</aside>
