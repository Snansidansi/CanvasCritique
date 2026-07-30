<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';

  let { 
    isOpen = $bindable(false) 
  }: { 
    isOpen: boolean 
  } = $props();

  let selectedProjectId = $state("");
  let isGlobal = $state(false);

  let activeLessons = $derived(store.activeProfileProjects);

  $effect(() => {
    if (isOpen) {
      if (activeLessons.length > 0) {
        selectedProjectId = activeLessons[0].id;
      } else {
        selectedProjectId = "";
      }
      isGlobal = false;
    }
  });

  async function handleCopyLesson(e: Event) {
    e.preventDefault();
    if (!selectedProjectId) return;
    isOpen = false;
    await store.copyLessonAsTemplate(selectedProjectId, isGlobal);
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in select-none"
  >
    <div
      class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-100 shadow-xl flex flex-col gap-4"
    >
      <h3 class="font-bold text-lg text-on-surface">
        {t('templates.copyModalTitle')}
      </h3>

      <form onsubmit={handleCopyLesson} class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label
            class="text-xs font-semibold text-on-surface-variant"
            for="copyLessonSelect">{t('templates.selectLesson')}</label
          >
          {#if activeLessons.length > 0}
            <select
              id="copyLessonSelect"
              bind:value={selectedProjectId}
              class="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary cursor-pointer"
              required
            >
              {#each activeLessons as proj}
                <option value={proj.id}>{proj.name} ({proj.tasks?.length || 0} {t('projectDetail.roadmapTitle')})</option>
              {/each}
            </select>
          {:else}
            <p class="text-xs text-on-surface-variant italic">
              {t('dashboard.noTasks')}
            </p>
          {/if}
        </div>

        <div class="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="isGlobalCopy"
            bind:checked={isGlobal}
            class="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 accent-primary cursor-pointer"
          />
          <label for="isGlobalCopy" class="text-xs font-medium text-on-surface cursor-pointer">
            {t('templates.isGlobalLabel')}
          </label>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onclick={() => (isOpen = false)}
            class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!selectedProjectId}
            class="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 cursor-pointer focus:outline-none"
          >
            {t('common.confirm')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
