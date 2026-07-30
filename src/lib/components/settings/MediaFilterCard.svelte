<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import MediaFilterSettings from './MediaFilterSettings.svelte';

  function handleInputChange() {
    store.saveSettings();
  }
</script>

<!-- Media Filter Card -->
<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm relative overflow-visible">
  <div class="absolute top-0 right-0 w-64 h-64 bg-primary-fixed/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none z-0"></div>
  
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4 relative z-10">
    <span class="material-symbols-outlined text-primary">filter_alt</span>
    <h3 class="text-lg font-bold text-on-surface">{t('settings.api.mediaFilterCardTitle')}</h3>
  </div>
  
  <div class="relative z-10 flex flex-col gap-4">
    <p class="text-xs text-on-surface-variant leading-relaxed">
      {t('settings.api.mediaFilterCardDesc')}
    </p>

    <MediaFilterSettings settings={store.settings} onchange={handleInputChange} />
  </div>
</section>
