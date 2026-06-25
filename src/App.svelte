<script lang="ts">
  import { store } from "./lib/state/store.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import { onMount } from "svelte";

  // Local state variables for export popup checkboxes
  let exportIncludeCritique = $state(true);
  let exportIncludeCanvas = $state(true);
  let exportIncludeCompleted = $state(true);

  // Local state variables for import popup checkboxes
  let importIncludeCritique = $state(true);
  let importIncludeCanvas = $state(true);
  let importIncludeCompleted = $state(true);
  let importMergeOption = $state('new'); // 'new' | 'merge'
  let importMergeProjectId = $state('');
  let importMergeMode = $state('update'); // 'update' | 'skip'

  // Sync checkboxes with store dialog state when opened
  $effect(() => {
    if (store.exportDialog) {
      exportIncludeCritique = store.exportDialog.hasCritique;
      exportIncludeCanvas = store.exportDialog.hasCanvas;
      exportIncludeCompleted = true;
    }
  });

  $effect(() => {
    if (store.importDialog) {
      importIncludeCritique = store.importDialog.hasCritique;
      importIncludeCanvas = store.importDialog.hasCanvas;
      importIncludeCompleted = true;
      
      const activeProjList = store.projects.filter(p => p.profileId === store.activeProfileId);
      if (store.importDialog.targetProjectId) {
        importMergeOption = 'merge';
        importMergeProjectId = store.importDialog.targetProjectId;
      } else {
        importMergeOption = 'new';
        importMergeProjectId = activeProjList[0]?.id || '';
      }
      importMergeMode = 'update';
    }
  });

  // Views
  import Dashboard from "./lib/views/Dashboard.svelte";
  import ProjectDetail from "./lib/views/ProjectDetail.svelte";
  import PracticeCanvas from "./lib/views/PracticeCanvas.svelte";
  import Settings from "./lib/views/Settings.svelte";
  import TaskEditor from "./lib/views/TaskEditor.svelte";
  import Notification from "./lib/components/Notification.svelte";
  import { initTouchDragPolyfill } from "./lib/utils/touchDragPolyfill";

  onMount(() => {
    initTouchDragPolyfill();
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("contextmenu", handleGlobalContextMenu);
    return () => {
      window.removeEventListener("contextmenu", handleGlobalContextMenu);
    };
  });
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

<!-- Global Export Options Popup Modal Dialog -->
{#if store.exportDialog}
  {@const dialog = store.exportDialog}
  <div
    class="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in select-none"
  >
    <div
      class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-105 max-w-[90vw] shadow-2xl flex flex-col gap-4"
    >
      <div class="flex items-center gap-3 text-primary">
        <span class="material-symbols-outlined text-2xl">file_download</span>
        <h3 class="font-bold text-base text-on-surface">
          Export Options
        </h3>
      </div>

      <p class="text-xs text-on-surface-variant leading-relaxed">
        Choose what additional information you want to save along with the lesson <strong>"{dialog.project.name}"</strong>:
      </p>

      <div class="flex flex-col gap-3 my-1">
        <!-- AI Critique Option -->
        <label class="flex items-start gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container-high transition-colors cursor-pointer select-none {!dialog.hasCritique ? 'opacity-50 cursor-not-allowed' : ''}">
          <input
            type="checkbox"
            bind:checked={exportIncludeCritique}
            disabled={!dialog.hasCritique}
            class="mt-1 rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
          />
          <div class="flex flex-col">
            <span class="text-xs font-bold text-on-surface">Include AI Feedback</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              {#if dialog.hasCritique}
                Saves the reviews, scores, and highlighted corrections made by the AI helper.
              {:else}
                No AI feedback has been generated yet for this lesson.
              {/if}
            </span>
          </div>
        </label>

        <!-- Canvas Saves Option -->
        <label class="flex items-start gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container-high transition-colors cursor-pointer select-none {!dialog.hasCanvas ? 'opacity-50 cursor-not-allowed' : ''}">
          <input
            type="checkbox"
            bind:checked={exportIncludeCanvas}
            disabled={!dialog.hasCanvas}
            class="mt-1 rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
          />
          <div class="flex flex-col">
            <span class="text-xs font-bold text-on-surface">Include Your Handwriting</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              {#if dialog.hasCanvas}
                Saves the actual drawings, letters, and practices you wrote on the screen canvas.
              {:else}
                No handwriting or drawings have been recorded yet in this lesson.
              {/if}
            </span>
          </div>
        </label>

        <!-- Task Completion Option -->
        <label class="flex items-start gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container-high transition-colors cursor-pointer select-none">
          <input
            type="checkbox"
            bind:checked={exportIncludeCompleted}
            class="mt-1 rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 cursor-pointer"
          />
          <div class="flex flex-col">
            <span class="text-xs font-bold text-on-surface">Include Task Status</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              Saves whether tasks are marked as finished or not.
            </span>
          </div>
        </label>
      </div>

      <div class="flex justify-end gap-3 mt-2">
        <button
          onclick={dialog.onCancel}
          class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
        >
          Cancel
        </button>
        <button
          onclick={() => dialog.onConfirm({ includeCritique: exportIncludeCritique, includeCanvas: exportIncludeCanvas, includeCompleted: exportIncludeCompleted })}
          class="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer focus:outline-none"
        >
          Export Lesson
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Global Import Options Popup Modal Dialog -->
{#if store.importDialog}
  {@const dialog = store.importDialog}
  <div
    class="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in select-none"
  >
    <div
      class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-105 max-w-[90vw] shadow-2xl flex flex-col gap-4"
    >
      <div class="flex items-center gap-3 text-primary">
        <span class="material-symbols-outlined text-2xl">file_upload</span>
        <h3 class="font-bold text-base text-on-surface">
          Import Options
        </h3>
      </div>

      <p class="text-xs text-on-surface-variant leading-relaxed">
        This file contains a calligraphy lesson. Select which items you would like to import:
      </p>

      <div class="flex flex-col gap-3 my-1">
        <!-- AI Critique Option -->
        <label class="flex items-start gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container-high transition-colors cursor-pointer select-none {!dialog.hasCritique ? 'opacity-50 cursor-not-allowed' : ''}">
          <input
            type="checkbox"
            bind:checked={importIncludeCritique}
            disabled={!dialog.hasCritique}
            class="mt-1 rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
          />
          <div class="flex flex-col">
            <span class="text-xs font-bold text-on-surface">Import AI Feedback</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              {#if dialog.hasCritique}
                Loads the reviews, scores, and highlighted corrections previously saved.
              {:else}
                No AI feedback was found in this file.
              {/if}
            </span>
          </div>
        </label>

        <!-- Canvas Saves Option -->
        <label class="flex items-start gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container-high transition-colors cursor-pointer select-none {!dialog.hasCanvas ? 'opacity-50 cursor-not-allowed' : ''}">
          <input
            type="checkbox"
            bind:checked={importIncludeCanvas}
            disabled={!dialog.hasCanvas}
            class="mt-1 rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
          />
          <div class="flex flex-col">
            <span class="text-xs font-bold text-on-surface">Import Your Handwriting</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              {#if dialog.hasCanvas}
                Loads the handwritten practices and strokes previously drawn on the screens.
              {:else}
                No handwriting or drawings were found in this file.
              {/if}
            </span>
          </div>
        </label>

        <!-- Task Completion Option -->
        <label class="flex items-start gap-3 p-3 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container-high transition-colors cursor-pointer select-none">
          <input
            type="checkbox"
            bind:checked={importIncludeCompleted}
            class="mt-1 rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 cursor-pointer"
          />
          <div class="flex flex-col">
            <span class="text-xs font-bold text-on-surface">Import Task Status</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              Loads the checked/unchecked status of tasks from the file.
            </span>
          </div>
        </label>
      </div>

      <!-- Import Location / Merge Options (Step 2) -->
      <div class="border-t border-outline-variant/30 pt-3 flex flex-col gap-3">
        <span class="text-xs font-bold text-on-surface">Import Location</span>
        
        {#if dialog.targetProjectId}
          {@const targetProj = store.projects.find(p => p.id === dialog.targetProjectId)}
          <div class="p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs text-on-surface flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-primary">merge</span>
            <span>Importing tasks directly into <strong>{targetProj?.name || 'current lesson'}</strong></span>
          </div>
        {:else}
          <div class="flex gap-4">
            <label class="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
              <input type="radio" name="importMergeOption" value="new" bind:group={importMergeOption} class="text-primary focus:ring-primary h-4 w-4" />
              <span>New Lesson</span>
            </label>
            {#if store.projects.filter(p => p.profileId === store.activeProfileId).length > 0}
              <label class="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                <input type="radio" name="importMergeOption" value="merge" bind:group={importMergeOption} class="text-primary focus:ring-primary h-4 w-4" />
                <span>Merge with Existing</span>
              </label>
            {/if}
          </div>

          {#if importMergeOption === 'merge'}
            <div class="flex flex-col gap-1.5 animate-fade-in">
              <label for="mergeSelect" class="text-[11px] font-bold text-on-surface-variant">Select Target Lesson</label>
              <select
                id="mergeSelect"
                bind:value={importMergeProjectId}
                class="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary w-full"
              >
                {#each store.projects.filter(p => p.profileId === store.activeProfileId) as p}
                  <option value={p.id}>{p.name}</option>
                {/each}
              </select>
            </div>
          {/if}
        {/if}

        {#if dialog.targetProjectId || importMergeOption === 'merge'}
          <div class="flex flex-col gap-1.5 animate-fade-in">
            <span class="text-[11px] font-bold text-on-surface-variant">For Tasks with the Same Name</span>
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                <input type="radio" name="importMergeMode" value="update" bind:group={importMergeMode} class="text-primary focus:ring-primary h-4 w-4" />
                <span>Overwrite/Update details</span>
              </label>
              <label class="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                <input type="radio" name="importMergeMode" value="skip" bind:group={importMergeMode} class="text-primary focus:ring-primary h-4 w-4" />
                <span>Keep existing task (do not update)</span>
              </label>
            </div>
          </div>
        {/if}
      </div>

      <div class="flex justify-end gap-3 mt-2">
        <button
          onclick={dialog.onCancel}
          class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
        >
          Cancel
        </button>
        <button
          onclick={() => dialog.onConfirm({
            importCritique: importIncludeCritique,
            importCanvas: importIncludeCanvas,
            importCompleted: importIncludeCompleted,
            mergeProjectId: (dialog.targetProjectId || importMergeOption === 'merge') ? importMergeProjectId : undefined,
            mergeMode: (dialog.targetProjectId || importMergeOption === 'merge') ? (importMergeMode as 'update' | 'skip') : undefined
          })}
          class="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer focus:outline-none"
        >
          Import Lesson
        </button>
      </div>
    </div>
  </div>
{/if}

<Notification />
