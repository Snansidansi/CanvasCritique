<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import CanvasModeSelector from './CanvasModeSelector.svelte';
</script>

<!-- Canvas Preferences Section -->
<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4">
    <span class="material-symbols-outlined text-primary">edit_road</span>
    <h3 class="text-lg font-bold text-on-surface">{t('settings.canvas.title')}</h3>
  </div>
  <p class="text-xs text-on-surface-variant mb-4 leading-relaxed">
    {t('settings.canvas.desc')}
  </p>
  
  <CanvasModeSelector settings={store.settings} onchange={() => store.saveSettings()} />

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
</section>

