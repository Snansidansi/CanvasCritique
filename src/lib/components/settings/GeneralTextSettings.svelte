<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';

  function resetCanvasLayout() {
    localStorage.removeItem('info_panels_layout');
    localStorage.removeItem('workspace_layout');
    localStorage.removeItem('sidebar_position');
    store.showNotification(t('settings.canvas.layoutResetSuccess'), 'success');
  }
</script>

<!-- General Text Preferences Card -->
<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm animate-fade-in">
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4">
    <span class="material-symbols-outlined text-primary">text_fields</span>
    <h3 class="text-lg font-bold text-on-surface">{t('settings.workspaceGeneralText.title')}</h3>
  </div>
  <p class="text-xs text-on-surface-variant mb-6 leading-relaxed">
    {t('settings.workspaceGeneralText.desc')}
  </p>
  
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('settings.workspaceGeneralText.fontSizeLabel')}</span>
      <span class="text-xs font-bold text-primary">{store.settings.canvasFontSize ?? 13}px</span>
    </div>
    <p class="text-[11px] text-on-surface-variant leading-normal -mt-1 mb-1 max-w-xl font-medium">
      {t('settings.workspaceGeneralText.fontSizeDesc')}
    </p>
    <div class="flex items-center gap-3 mt-2">
      <span class="material-symbols-outlined text-base text-outline">text_fields</span>
      <div class="flex items-center bg-surface-container rounded-lg border border-outline-variant p-0.5 grow justify-between">
        <button 
          type="button"
          onclick={() => {
            store.settings.canvasFontSize = Math.max(10, (store.settings.canvasFontSize || 13) - 1);
            store.saveSettings();
          }}
          class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
        >
          <span class="material-symbols-outlined text-sm">remove</span>
        </button>
        <input 
          type="number"
          min="10"
          max="24"
          bind:value={store.settings.canvasFontSize}
          onchange={() => {
            if (typeof store.settings.canvasFontSize !== 'number' || isNaN(store.settings.canvasFontSize)) {
              store.settings.canvasFontSize = 13;
            }
            store.settings.canvasFontSize = Math.max(10, Math.min(store.settings.canvasFontSize, 24));
            store.saveSettings();
          }}
          class="w-16 bg-transparent text-center text-xs font-bold text-on-surface focus:outline-none border-0 p-0"
        />
        <button 
          type="button"
          onclick={() => {
            store.settings.canvasFontSize = Math.min(24, (store.settings.canvasFontSize || 13) + 1);
            store.saveSettings();
          }}
          class="p-1 hover:bg-surface-container-high rounded text-on-surface-variant focus:outline-none cursor-pointer border-0 bg-transparent flex items-center justify-center"
        >
          <span class="material-symbols-outlined text-sm">add</span>
        </button>
      </div>
      <span class="text-xs font-bold text-on-surface-variant select-none w-6 text-right">px</span>
    </div>
  </div>

  <!-- Auto-complete on AI success -->
  <div class="mt-6 border-t border-outline-variant/40 pt-5 flex items-center justify-between gap-4">
    <div>
      <h4 class="font-bold text-sm text-on-surface mb-0.5">{t('settings.canvas.autoCompleteOnSuccess')}</h4>
      <p class="text-xs text-on-surface-variant">{t('settings.canvas.autoCompleteOnSuccessDesc')}</p>
    </div>
    <label class="relative inline-flex items-center cursor-pointer select-none shrink-0">
      <input 
        type="checkbox" 
        bind:checked={store.settings.autoCompleteOnSuccess}
        onchange={() => store.saveSettings()}
        class="sr-only peer" 
      />
      <div class="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
    </label>
  </div>

  <!-- Reset Canvas Layout -->
  <div class="mt-6 border-t border-outline-variant/40 pt-5 flex items-center justify-between gap-4">
    <div>
      <h4 class="font-bold text-sm text-on-surface mb-0.5">{t('settings.canvas.resetLayout')}</h4>
      <p class="text-xs text-on-surface-variant">{t('settings.canvas.resetLayoutDesc')}</p>
    </div>
    <button
      type="button"
      onclick={resetCanvasLayout}
      class="px-4 py-2 border border-outline-variant hover:bg-surface-container text-on-surface text-xs font-bold rounded-lg cursor-pointer transition-colors focus:outline-none bg-transparent flex items-center gap-1.5"
    >
      <span class="material-symbols-outlined text-sm">restart_alt</span>
      <span>{t('settings.canvas.resetLayout')}</span>
    </button>
  </div>
</section>
