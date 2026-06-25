<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';

  let { 
    isOpen = $bindable(false) 
  }: { 
    isOpen: boolean 
  } = $props();

  let newProjectName = $state("");
  let newProjectIcon = $state("history_edu");

  // Reset inputs when opened
  $effect(() => {
    if (isOpen) {
      newProjectName = "";
      newProjectIcon = "history_edu";
    }
  });

  function handleCreateProject(e: Event) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const proj = store.addProject(newProjectName.trim(), newProjectIcon);
    isOpen = false;
    // Navigate immediately
    store.selectProject(proj);
    store.setView("project-detail");
  }

  function handleCustomIconUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      newProjectIcon = reader.result as string;
    };
    reader.readAsDataURL(file);
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
            autofocus
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label
            class="text-xs font-semibold text-on-surface-variant"
            for="projIcon">{t('dashboard.iconStyleLabel')}</label
          >
          <div class="grid grid-cols-4 gap-2">
            {#each ["history_edu", "draw", "ink_pen", "edit_square", "palette", "brush", "format_paint", "signature", "gesture", "border_color", "content_cut", "text_fields"] as icon}
              <button
                type="button"
                onclick={() => (newProjectIcon = icon)}
                class="p-2 border rounded-lg flex items-center justify-center hover:bg-surface-container
                       {newProjectIcon === icon
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-outline-variant text-on-surface-variant'}"
              >
                <span class="material-symbols-outlined text-[24px]">{icon}</span>
              </button>
            {/each}
          </div>

          <div class="flex flex-col gap-1 mt-2">
            <span class="text-xs font-semibold text-on-surface-variant"
              >{t('dashboard.uploadCustomIconLabel')}</span>
            <input
              type="file"
              accept="image/*"
              onchange={handleCustomIconUpload}
              class="text-xs text-on-surface bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
            />
            {#if newProjectIcon && newProjectIcon.startsWith("data:image/")}
              <div class="flex items-center gap-2 mt-1">
                <span class="text-[10px] text-primary font-semibold"
                  >{t('dashboard.customPreviewLabel')}</span>
                <img
                  src={newProjectIcon}
                  class="w-8 h-8 object-contain rounded border border-primary/20 bg-white"
                  alt="Preview"
                />
              </div>
            {/if}
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
{/if}

