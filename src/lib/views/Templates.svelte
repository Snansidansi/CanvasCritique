<script lang="ts">
  import { store, type Project } from '../state/store.svelte';
  import { t } from '../services/i18n';
  import CreateTemplateModal from '../components/templates/CreateTemplateModal.svelte';
  import CopyLessonModal from '../components/templates/CopyLessonModal.svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { readFile } from '@tauri-apps/plugin-fs';

  let searchQuery = $state("");
  let filterType = $state<'all' | 'profile' | 'global'>('all');
  let isCreateModalOpen = $state(false);
  let isCopyModalOpen = $state(false);

  let templates = $derived(
    store.templates.filter((tmpl) => {
      const matchesSearch = tmpl.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (filterType === 'global') return matchesSearch && tmpl.isGlobal;
      if (filterType === 'profile') return matchesSearch && !tmpl.isGlobal;
      return matchesSearch;
    })
  );

  async function handleNativeImportTemplate() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Lesson Package', extensions: ['json', 'ccpack'] }]
      });
      if (!selected) return;

      const path = Array.isArray(selected) ? selected[0] : selected;
      store.showLoading(t('common.importing') || 'Importiere...');
      try {
        const isCcpack = path.endsWith('.ccpack');
        const bytes = await readFile(path);
        let imported;
        if (isCcpack) {
          imported = await store.importCcpackFile(bytes);
        } else {
          const text = new TextDecoder().decode(bytes);
          imported = JSON.parse(text);
        }

        store.hideLoading();
        await store.importTemplateFile(imported);
      } catch (innerErr) {
        store.hideLoading();
        throw innerErr;
      }
    } catch (err) {
      console.error(err);
      store.showNotification(t("dashboard.notifications.parseFailed"), "error");
    }
  }

  function handleEditTemplate(template: Project) {
    store.selectProject(template);
    store.setView('project-detail');
  }

  async function handleCreateLesson(template: Project) {
    const proj = await store.createLessonFromTemplate(template.id);
    if (proj) {
      store.selectProject(proj);
      store.setView('project-detail');
    }
  }

  function handleDeleteTemplate(template: Project) {
    store.confirm(
      t('templates.deleteTitle') || 'Vorlage löschen',
      (t('templates.deleteConfirm') || "Möchtest du die Vorlage '{name}' wirklich löschen?").replace('{name}', template.name),
      async () => {
        await store.deleteTemplate(template.id);
      }
    );
  }
</script>

<div class="flex flex-col h-full w-full bg-background text-on-background overflow-hidden">
  <!-- Top Navigation & Header -->
  <header class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b border-outline-variant/40 bg-surface-container-lowest shrink-0">
    <div class="flex items-center gap-3">
      <button
        onclick={() => store.setView('dashboard')}
        class="w-10 h-10 rounded-xl flex items-center justify-center border border-outline-variant/60 hover:bg-surface-container-high transition-colors cursor-pointer text-on-surface-variant focus:outline-none"
        title={t('projectDetail.backToDashboard')}
      >
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <div>
        <h1 class="text-xl font-bold text-on-surface flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">bookmark_manager</span>
          {t('templates.title')}
        </h1>
        <p class="text-xs text-on-surface-variant">
          {t('templates.subtitle')}
        </p>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2 flex-wrap">
      <button
        onclick={() => (isCreateModalOpen = true)}
        class="flex items-center gap-2 px-3.5 py-2 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-sm focus:outline-none"
      >
        <span class="material-symbols-outlined text-[18px]">add</span>
        {t('templates.createTemplate')}
      </button>

      <button
        onclick={() => (isCopyModalOpen = true)}
        class="flex items-center gap-2 px-3.5 py-2 bg-surface-container-high text-on-surface rounded-xl text-xs font-semibold border border-outline-variant hover:bg-surface-container-highest transition-colors cursor-pointer focus:outline-none"
      >
        <span class="material-symbols-outlined text-[18px]">content_copy</span>
        {t('templates.copyLesson')}
      </button>

      <button
        onclick={handleNativeImportTemplate}
        class="flex items-center gap-2 px-3.5 py-2 bg-surface-container-high text-on-surface rounded-xl text-xs font-semibold border border-outline-variant hover:bg-surface-container-highest transition-colors cursor-pointer focus:outline-none"
      >
        <span class="material-symbols-outlined text-[18px]">upload</span>
        {t('templates.importTemplate')}
      </button>
    </div>
  </header>

  <!-- Filter & Search Toolbar -->
  <div class="px-6 py-4 border-b border-outline-variant/30 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-low/40 shrink-0">
    <div class="relative w-full sm:w-80">
      <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder={t('templates.searchPlaceholder')}
        class="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-outline-variant/60 rounded-xl text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary transition-all"
      />
    </div>

    <!-- Filter Pills -->
    <div class="flex items-center gap-1.5 self-start sm:self-auto bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/50">
      <button
        onclick={() => (filterType = 'all')}
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer {filterType === 'all' ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}"
      >
        {t('templates.allFilter')}
      </button>
      <button
        onclick={() => (filterType = 'profile')}
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer {filterType === 'profile' ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}"
      >
        {t('templates.profileFilter')}
      </button>
      <button
        onclick={() => (filterType = 'global')}
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer {filterType === 'global' ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}"
      >
        {t('templates.globalFilter')}
      </button>
    </div>
  </div>

  <!-- Content Grid -->
  <div class="grow overflow-y-auto p-6">
    {#if templates.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div class="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[36px]">bookmark_border</span>
        </div>
        <h3 class="font-bold text-base text-on-surface">
          {t('templates.noTemplates')}
        </h3>
        <p class="text-xs text-on-surface-variant max-w-md leading-relaxed">
          {t('templates.noTemplatesDesc')}
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {#each templates as template (template.id)}
          <div class="group relative bg-surface-container-lowest border border-outline-variant/60 hover:border-primary/50 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all hover:shadow-md">
            <div>
              <!-- Header & Badges -->
              <div class="flex items-start justify-between gap-3 mb-3">
                <div class="w-11 h-11 rounded-xl bg-primary-container/30 text-primary border border-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                  {#if template.icon && (template.icon.startsWith('data:') || template.icon.startsWith('blob:') || template.icon.startsWith('http') || template.icon.includes('/') || template.icon.includes('.'))}
                    <img src={template.icon} class="w-8 h-8 object-contain rounded" alt="" />
                  {:else}
                    <span class="material-symbols-outlined text-[24px]">{template.icon || 'history_edu'}</span>
                  {/if}
                </div>
                <div class="flex items-center gap-1.5">
                  {#if template.isGlobal}
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-tertiary-container text-on-tertiary-container border border-tertiary-container/30 flex items-center gap-1">
                      <span class="material-symbols-outlined text-[12px]">public</span>
                      {t('templates.globalBadge')}
                    </span>
                  {:else}
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-secondary-container text-on-secondary-container border border-secondary-container/30 flex items-center gap-1">
                      <span class="material-symbols-outlined text-[12px]">person</span>
                      {t('templates.profileBadge')}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Title & Task Count -->
              <h4 class="font-bold text-sm text-on-surface group-hover:text-primary transition-colors line-clamp-1">
                {template.name}
              </h4>
              <p class="text-xs text-on-surface-variant mt-1">
                {template.tasks?.length || 0} {t('projectDetail.roadmapTitle')} • {template.categories?.length || 0} Themen
              </p>
            </div>

            <!-- Card Actions -->
            <div class="flex items-center justify-between gap-2 pt-3 border-t border-outline-variant/30">
              <div class="flex items-center gap-1">
                <button
                  onclick={() => handleEditTemplate(template)}
                  class="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-lg transition-colors cursor-pointer focus:outline-none"
                  title={t('common.edit')}
                >
                  <span class="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button
                  onclick={() => store.toggleTemplateGlobal(template.id, !template.isGlobal)}
                  class="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-lg transition-colors cursor-pointer focus:outline-none"
                  title={template.isGlobal ? t('templates.makeProfileSpecific') : t('templates.makeGlobal')}
                >
                  <span class="material-symbols-outlined text-[18px]">{template.isGlobal ? 'lock' : 'public'}</span>
                </button>
                <button
                  onclick={() => store.exportTemplate(template)}
                  class="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-lg transition-colors cursor-pointer focus:outline-none"
                  title={t('projectDetail.exportLesson')}
                >
                  <span class="material-symbols-outlined text-[18px]">download</span>
                </button>
                <button
                  onclick={() => handleDeleteTemplate(template)}
                  class="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-lg transition-colors cursor-pointer focus:outline-none"
                  title={t('common.delete')}
                >
                  <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>

              <!-- Create Lesson Button -->
              <button
                onclick={() => handleCreateLesson(template)}
                class="flex items-center gap-1 px-3 py-1.5 bg-primary/10 hover:bg-primary hover:text-on-primary text-primary text-xs font-semibold rounded-lg transition-all cursor-pointer focus:outline-none"
              >
                <span class="material-symbols-outlined text-[16px]">add_circle</span>
                {t('templates.createLessonFromTemplate')}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<CreateTemplateModal bind:isOpen={isCreateModalOpen} />
<CopyLessonModal bind:isOpen={isCopyModalOpen} />
