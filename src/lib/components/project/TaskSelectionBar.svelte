<script lang="ts">
  import { t } from '../../services/i18n';

  let { selectedCount, onExport, onDelete, onCancel } = $props<{
    selectedCount: number;
    onExport: () => void;
    onDelete: () => void;
    onCancel: () => void;
  }>();
</script>

<div class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface-container-high border border-outline-variant rounded-2xl py-3 px-6 shadow-2xl flex items-center gap-6 z-50 animate-fade-in select-none max-w-[90vw] md:max-w-xl">
  <div class="flex items-center gap-2">
    <span class="material-symbols-outlined text-primary text-[20px]">checklist</span>
    <span class="text-xs font-bold text-on-surface">
      {selectedCount === 1 ? t('taskSelection.taskSelected') : t('taskSelection.tasksSelectedPlural', { count: selectedCount })}
    </span>
  </div>

  <div class="h-6 w-px bg-outline-variant/60"></div>

  <div class="flex items-center gap-2">
    <button
      onclick={onExport}
      disabled={selectedCount === 0}
      class="bg-surface-container-low text-on-surface border border-outline-variant font-semibold text-xs py-2 px-3.5 rounded-lg hover:bg-surface-container transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface-container-low shadow-sm focus:outline-none"
      title={t('taskSelection.exportSelected')}
    >
      <span class="material-symbols-outlined text-[16px]">file_download</span>
      {t('taskSelection.export')}
    </button>

    <button
      onclick={onDelete}
      disabled={selectedCount === 0}
      class="bg-error text-white font-semibold text-xs py-2 px-3.5 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm focus:outline-none"
      title={t('taskSelection.deleteSelected')}
    >
      <span class="material-symbols-outlined text-[16px]">delete</span>
      {t('taskSelection.delete')}
    </button>

    <button
      onclick={onCancel}
      class="border border-outline-variant text-on-surface-variant font-semibold text-xs py-2 px-3.5 rounded-lg hover:bg-surface-container transition-colors cursor-pointer focus:outline-none"
    >
      {t('common.cancel')}
    </button>
  </div>
</div>
