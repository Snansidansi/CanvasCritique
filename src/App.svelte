<script lang="ts">
  import { store } from "./lib/state/store.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";

  // Views
  import Dashboard from "./lib/views/Dashboard.svelte";
  import ProjectDetail from "./lib/views/ProjectDetail.svelte";
  import PracticeCanvas from "./lib/views/PracticeCanvas.svelte";
  import Settings from "./lib/views/Settings.svelte";
  import TaskEditor from "./lib/views/TaskEditor.svelte";
</script>

<div
  class="flex h-screen w-screen overflow-hidden bg-background text-on-background select-none"
>
  <!-- Sidebar -->
  <Sidebar />

  <!-- Main view wrapper -->
  <div class="grow flex flex-col min-w-0 relative h-full">
    {#if store.currentView === "dashboard"}
      <Dashboard />
    {:else if store.currentView === "project-detail"}
      <ProjectDetail />
    {:else if store.currentView === "practice"}
      <PracticeCanvas />
    {:else if store.currentView === "settings"}
      <Settings />
    {:else if store.currentView === "task-editor"}
      <TaskEditor />
    {/if}
  </div>
</div>

<!-- Global Confirmation Popup Modal Dialog -->
{#if store.confirmDialog}
  <div
    class="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in select-none"
  >
    <div
      class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-90 shadow-2xl flex flex-col gap-4"
    >
      <div class="flex items-center gap-3 text-error">
        <span class="material-symbols-outlined text-2xl">warning</span>
        <h3 class="font-bold text-base text-on-surface">
          {store.confirmDialog.title}
        </h3>
      </div>

      <p class="text-xs text-on-surface-variant leading-relaxed">
        {store.confirmDialog.message}
      </p>

      <div class="flex justify-end gap-3 mt-2">
        <button
          onclick={store.confirmDialog.onCancel}
          class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
        >
          Cancel
        </button>
        <button
          onclick={store.confirmDialog.onConfirm}
          class="px-4 py-2 bg-error text-white text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer focus:outline-none"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
{/if}
