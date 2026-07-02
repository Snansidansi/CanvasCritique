<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import { getMediaDataUrl } from '../../db/media';
  import LessonIconModal from '../project/LessonIconModal.svelte';

  let { 
    isOpen = $bindable(false) 
  }: { 
    isOpen: boolean 
  } = $props();

  let newProjectName = $state("");
  let newProjectIcon = $state("history_edu");
  let newProjectIconPreview = $state("");
  let isIconModalOpen = $state(false);

  // Reset inputs when opened
  $effect(() => {
    if (isOpen) {
      newProjectName = "";
      newProjectIcon = "history_edu";
      newProjectIconPreview = "";
      isIconModalOpen = false;
    }
  });

  async function resolvePreview(icon: string) {
    if (icon && !icon.startsWith('data:') && /^[a-f0-9-]{36}$/i.test(icon)) {
      try {
        newProjectIconPreview = await getMediaDataUrl(icon);
      } catch (_) {
        newProjectIconPreview = "";
      }
    } else if (icon && icon.startsWith('data:')) {
      newProjectIconPreview = icon;
    } else {
      newProjectIconPreview = "";
    }
  }

  async function handleCreateProject(e: Event) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const proj = await store.addProject(newProjectName.trim(), newProjectIcon);
    isOpen = false;
    store.selectProject(proj);
    store.setView("project-detail");
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
  >
    <div
      class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-100 shadow-xl flex flex-col gap-4"
    >
      <h3 class="font-bold text-lg text-on-surface">
        {t('dashboard.createLessonTitle')}
      </h3>

      <form onsubmit={handleCreateProject} class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label
            class="text-xs font-semibold text-on-surface-variant"
            for="projName">{t('dashboard.lessonNameLabel')}</label
          >
          <input
            type="text"
            id="projName"
            bind:value={newProjectName}
            placeholder={t('dashboard.lessonNamePlaceholder')}
            class="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            required
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-on-surface-variant">
            {t('dashboard.iconStyleLabel')}
          </span>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onclick={() => (isIconModalOpen = true)}
              class="w-12 h-12 flex items-center justify-center bg-secondary-container text-on-secondary-container rounded-lg border border-outline-variant hover:ring-2 hover:ring-primary focus:outline-none transition-all cursor-pointer overflow-hidden shrink-0"
              title={t('projectDetail.changeImageTooltip')}
            >
              {#if newProjectIconPreview}
                <img
                  src={newProjectIconPreview}
                  class="w-8 h-8 object-contain rounded"
                  alt=""
                />
              {:else}
                <span class="material-symbols-outlined text-[24px]">{newProjectIcon}</span>
              {/if}
            </button>
            <button
              type="button"
              onclick={() => (isIconModalOpen = true)}
              class="text-xs text-primary font-semibold hover:underline cursor-pointer focus:outline-none"
            >
              {t('projectDetail.changeImageTooltip')}
            </button>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-2">
          <button
            type="button"
            onclick={() => (isOpen = false)}
            class="px-4 py-2 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container-high"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            class="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:opacity-90"
          >
            {t('common.create')}
          </button>
        </div>
      </form>
    </div>
  </div>
  <LessonIconModal bind:isOpen={isIconModalOpen} onSelect={(icon) => { newProjectIcon = icon; resolvePreview(icon); }} />
{/if}

