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

  let templateName = $state("");
  let templateIcon = $state("history_edu");
  let templateIconPreview = $state("");
  let isGlobal = $state(false);
  let isIconModalOpen = $state(false);

  $effect(() => {
    if (isOpen) {
      templateName = "";
      templateIcon = "history_edu";
      templateIconPreview = "";
      isGlobal = false;
      isIconModalOpen = false;
    }
  });

  async function resolvePreview(icon: string) {
    if (icon && !icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(icon)) {
      try {
        templateIconPreview = await getMediaDataUrl(icon);
      } catch (_) {
        templateIconPreview = "";
      }
    } else if (icon && icon.startsWith('data:')) {
      templateIconPreview = icon;
    } else {
      templateIconPreview = "";
    }
  }

  async function handleCreateTemplate(e: Event) {
    e.preventDefault();
    const name = templateName.trim();
    if (!name) return;
    isOpen = false;
    await store.createTemplate(name, templateIcon, isGlobal);
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
  >
    <div
      class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-100 shadow-xl flex flex-col gap-4"
    >
      <h3 class="font-bold text-lg text-on-surface">
        {t('templates.createModalTitle')}
      </h3>

      <form onsubmit={handleCreateTemplate} class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label
            class="text-xs font-semibold text-on-surface-variant"
            for="tmplName">{t('dashboard.lessonNameLabel')}</label
          >
          <input
            type="text"
            id="tmplName"
            bind:value={templateName}
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
              {#if templateIconPreview}
                <img
                  src={templateIconPreview}
                  class="w-6 h-6 object-contain rounded shrink-0"
                  alt=""
                />
              {:else}
                <span class="material-symbols-outlined text-[24px]">{templateIcon}</span>
              {/if}
            </button>
            <span class="text-xs text-on-surface-variant">
              {t('projectDetail.changeImageTooltip')}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 pt-1 select-none">
          <input
            type="checkbox"
            id="isGlobalTmpl"
            bind:checked={isGlobal}
            class="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 accent-primary cursor-pointer"
          />
          <label for="isGlobalTmpl" class="text-xs font-medium text-on-surface cursor-pointer">
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
            class="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer focus:outline-none"
          >
            {t('common.create')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<LessonIconModal
  bind:isOpen={isIconModalOpen}
  currentIcon={templateIcon}
  onSelectIcon={(icon) => {
    templateIcon = icon;
    resolvePreview(icon);
  }}
/>
