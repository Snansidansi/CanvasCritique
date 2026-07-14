<script lang="ts">
  import { store } from "./lib/state/store.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import { onMount, onDestroy } from "svelte";
  import { t } from "./lib/services/i18n";
  import { syncWebDav } from "./lib/services/webdav";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { cleanupInstaller, checkForUpdates } from "./lib/services/update";

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
  import { isWindowsPlatform, restoreWindowState, setupWindowStateListeners } from "./lib/services/windowState";

  $effect(() => {
    // Always intercept close to clean up orphaned media files
    invoke("set_sync_on_shutdown", { enabled: true }).catch(err => console.error("set_sync_on_shutdown failed:", err));
  });

  onMount(() => {
    initTouchDragPolyfill();

    // Clean up installer if it was left behind
    cleanupInstaller();

    // Check for updates automatically if enabled
    if (store.settings.autoUpdateCheckEnabled) {
      setTimeout(() => {
        checkForUpdates(false).catch(err => console.error("Auto update check failed:", err));
      }, 3000);
    }

    let cleanupWindowState: (() => void) | undefined;
    if (isWindowsPlatform()) {
      restoreWindowState();
      setupWindowStateListeners().then((cleanup) => {
        cleanupWindowState = cleanup;
      });
    }
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Toggle settings with Ctrl + , or Cmd + ,
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        if (store.currentView === 'settings') {
          store.setView(store.previousView || 'dashboard');
        } else {
          store.setView('settings');
        }
      }
    };
    window.addEventListener("contextmenu", handleGlobalContextMenu);
    window.addEventListener("keydown", handleGlobalKeyDown);
    let syncIntervalId: number | undefined;
    let unlistenShutdownSync: (() => void) | undefined;

    const setupSync = () => {
      if (syncIntervalId) clearInterval(syncIntervalId);
      if (store.settings.webdavEnabled && store.settings.webdavAutoSync && store.settings.webdavSyncIntervalMinutes) {
        const intervalMs = store.settings.webdavSyncIntervalMinutes * 60 * 1000;
        syncIntervalId = window.setInterval(() => {
          syncWebDav();
        }, intervalMs);
      }
    };

    setupSync();

    if (store.settings.webdavEnabled && store.settings.webdavSyncOnStartup) {
      setTimeout(() => {
        syncWebDav();
      }, 1000);
    }

    const setupShutdownSyncListener = async () => {
      unlistenShutdownSync = await listen("trigger-shutdown-sync", async () => {
        try {
          if (store.settings.webdavEnabled && store.settings.webdavSyncOnShutdown) {
            // syncWebDav automatically triggers cleanOrphanedMedia first
            await syncWebDav();
          } else {
            // Just clean up orphaned media
            await store.cleanOrphanedMedia();
          }
        } catch (err) {
          console.error("Shutdown cleanup/sync failed:", err);
        } finally {
          await invoke("exit_app");
        }
      });
    };

    setupShutdownSyncListener();

    return () => {
      window.removeEventListener("contextmenu", handleGlobalContextMenu);
      window.removeEventListener("keydown", handleGlobalKeyDown);
      if (syncIntervalId) clearInterval(syncIntervalId);
      if (unlistenShutdownSync) unlistenShutdownSync();
      if (cleanupWindowState) cleanupWindowState();
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
      <div class="flex items-center gap-3 {(store.confirmDialog.isAlert || store.confirmDialog.isPrimary) ? 'text-primary' : 'text-error'}">
        <span class="material-symbols-outlined text-2xl">{(store.confirmDialog.isAlert || store.confirmDialog.isPrimary) ? 'info' : 'warning'}</span>
        <h3 class="font-bold text-base text-on-surface">
          {store.confirmDialog.title || t('dialogs.confirmTitleDefault')}
        </h3>
      </div>

      <p class="text-xs text-on-surface-variant leading-relaxed">
        {store.confirmDialog.message}
      </p>

      <div class="flex justify-end gap-3 mt-2">
        {#if store.confirmDialog.thirdLabel && store.confirmDialog.onThird}
          <button
            onclick={store.confirmDialog.onThird}
            class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
          >
            {store.confirmDialog.thirdLabel}
          </button>
        {/if}
        {#if !store.confirmDialog.isAlert}
          <button
            onclick={store.confirmDialog.onCancel}
            class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
          >
            {store.confirmDialog.cancelLabel || t('common.cancel')}
          </button>
        {/if}
        <button
          onclick={store.confirmDialog.onConfirm}
          class="px-4 py-2 text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer focus:outline-none {(store.confirmDialog.isAlert || store.confirmDialog.isPrimary) ? 'bg-primary text-on-primary' : 'bg-error text-white'}"
        >
          {store.confirmDialog.confirmLabel || (store.confirmDialog.isAlert ? 'OK' : t('common.confirm'))}
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
        <span class="material-symbols-outlined text-2xl">file_upload</span>
        <h3 class="font-bold text-base text-on-surface">
          {t('dialogs.exportTitle')}
        </h3>
      </div>

      <p class="text-xs text-on-surface-variant leading-relaxed">
        {@html t('dialogs.exportPrompt', { name: dialog.project.name })}
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
            <span class="text-xs font-bold text-on-surface">{t('dialogs.exportIncludeCritique')}</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              {#if dialog.hasCritique}
                {t('dialogs.exportCritiqueDesc')}
              {:else}
                {t('dialogs.exportNoCritiqueDesc')}
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
            <span class="text-xs font-bold text-on-surface">{t('dialogs.exportIncludeCanvas')}</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              {#if dialog.hasCanvas}
                {t('dialogs.exportCanvasDesc')}
              {:else}
                {t('dialogs.exportNoCanvasDesc')}
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
            <span class="text-xs font-bold text-on-surface">{t('dialogs.exportIncludeCompleted')}</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              {t('dialogs.exportCompletedDesc')}
            </span>
          </div>
        </label>
      </div>

      <div class="flex justify-end gap-3 mt-2">
        <button
          onclick={dialog.onCancel}
          class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
        >
          {t('common.cancel')}
        </button>
        <button
          onclick={() => dialog.onConfirm({ includeCritique: exportIncludeCritique, includeCanvas: exportIncludeCanvas, includeCompleted: exportIncludeCompleted })}
          class="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer focus:outline-none"
        >
          {t('dialogs.exportBtn')}
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
        <span class="material-symbols-outlined text-2xl">file_download</span>
        <h3 class="font-bold text-base text-on-surface">
          {t('dialogs.importTitle')}
        </h3>
      </div>

      <p class="text-xs text-on-surface-variant leading-relaxed">
        {t('dialogs.importPrompt')}
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
            <span class="text-xs font-bold text-on-surface">{t('dialogs.importIncludeCritique')}</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              {#if dialog.hasCritique}
                {t('dialogs.importCritiqueDesc')}
              {:else}
                {t('dialogs.importNoCritiqueDesc')}
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
            <span class="text-xs font-bold text-on-surface">{t('dialogs.importIncludeCanvas')}</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              {#if dialog.hasCanvas}
                {t('dialogs.importCanvasDesc')}
              {:else}
                {t('dialogs.importNoCanvasDesc')}
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
            <span class="text-xs font-bold text-on-surface">{t('dialogs.importIncludeCompleted')}</span>
            <span class="text-[11px] text-on-surface-variant mt-0.5">
              {t('dialogs.importCompletedDesc')}
            </span>
          </div>
        </label>
      </div>

      <!-- Import Location / Merge Options (Step 2) -->
      <div class="border-t border-outline-variant/30 pt-3 flex flex-col gap-3">
        <span class="text-xs font-bold text-on-surface">{t('dialogs.importLocation')}</span>
        
        {#if dialog.targetProjectId}
          {@const targetProj = store.projects.find(p => p.id === dialog.targetProjectId)}
          <div class="p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs text-on-surface flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-primary">merge</span>
            <span>{@html t('dialogs.importDirectPrompt', { name: targetProj?.name || 'current lesson' })}</span>
          </div>
        {:else if Array.isArray(dialog.projectData) && dialog.projectData.length > 1}
          <div class="p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs text-on-surface flex items-center gap-2 animate-fade-in">
            <span class="material-symbols-outlined text-[18px] text-primary">add_to_photos</span>
            <span>{t('dialogs.importMultipleAsNew', { count: dialog.projectData.length })}</span>
          </div>
        {:else}
          <div class="flex gap-4">
            <label class="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
              <input type="radio" name="importMergeOption" value="new" bind:group={importMergeOption} class="text-primary focus:ring-primary h-4 w-4" />
              <span>{t('dialogs.importLocationNew')}</span>
            </label>
            {#if store.projects.filter(p => p.profileId === store.activeProfileId).length > 0}
              <label class="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                <input type="radio" name="importMergeOption" value="merge" bind:group={importMergeOption} class="text-primary focus:ring-primary h-4 w-4" />
                <span>{t('dialogs.importLocationMerge')}</span>
              </label>
            {/if}
          </div>

          {#if importMergeOption === 'merge'}
            <div class="flex flex-col gap-1.5 animate-fade-in">
              <label for="mergeSelect" class="text-[11px] font-bold text-on-surface-variant">{t('dialogs.importMergeSelectLabel')}</label>
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
            <span class="text-[11px] font-bold text-on-surface-variant">{t('dialogs.importMergeModeTitle')}</span>
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                <input type="radio" name="importMergeMode" value="update" bind:group={importMergeMode} class="text-primary focus:ring-primary h-4 w-4" />
                <span>{t('dialogs.importMergeModeOverwrite')}</span>
              </label>
              <label class="flex items-center gap-2 text-xs text-on-surface cursor-pointer select-none">
                <input type="radio" name="importMergeMode" value="skip" bind:group={importMergeMode} class="text-primary focus:ring-primary h-4 w-4" />
                <span>{t('dialogs.importMergeModeSkip')}</span>
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
          {t('common.cancel')}
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
          {t('dialogs.importBtn')}
        </button>
      </div>
    </div>
  </div>
{/if}

<Notification />

<!-- Global Loading Overlay -->
{#if store.isLoading}
  <div
    class="fixed inset-0 z-200 flex flex-col items-center justify-center bg-black/50 backdrop-blur-md animate-fade-in select-none"
  >
    <div
      class="bg-surface-container-lowest border border-outline-variant/60 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl max-w-sm"
    >
      <div class="relative w-12 h-12 flex items-center justify-center">
        <!-- Spinner animation -->
        <div class="absolute inset-0 rounded-full border-4 border-primary/20"></div>
        <div class="absolute inset-0 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
      </div>
      <span class="text-sm font-semibold text-on-surface text-center">
        {store.loadingText || t('common.loading') || 'Wird geladen...'}
      </span>
    </div>
  </div>
{/if}

