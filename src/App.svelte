<script>
  import { store } from './lib/state/store.svelte.js';
  import Sidebar from './lib/components/Sidebar.svelte';
  
  // Views
  import Dashboard from './lib/views/Dashboard.svelte';
  import PracticeCanvas from './lib/views/PracticeCanvas.svelte';
  import Settings from './lib/views/Settings.svelte';
  import TaskEditor from './lib/views/TaskEditor.svelte';
</script>

<div class="flex h-screen w-screen overflow-hidden bg-background text-on-background select-none">
  <!-- Sidebar -->
  <Sidebar />

  <!-- Main view wrapper -->
  <div class="flex-grow flex flex-col min-w-0 relative h-full">
    {#if store.currentView === 'dashboard'}
      <Dashboard />
    {:else if store.currentView === 'practice'}
      <PracticeCanvas />
    {:else if store.currentView === 'settings'}
      <Settings />
    {:else if store.currentView === 'task-editor'}
      <TaskEditor />
    {/if}
  </div>
</div>
