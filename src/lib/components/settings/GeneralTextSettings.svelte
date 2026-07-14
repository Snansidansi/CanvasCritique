<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
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
</section>
