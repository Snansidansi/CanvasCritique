<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import { checkForUpdates } from '../../services/update';
  import pkg from '../../../../package.json';

  let checking = $state(false);

  async function handleManualCheck() {
    checking = true;
    try {
      await checkForUpdates(true);
    } finally {
      checking = false;
    }
  }
</script>

<!-- Update Settings Section -->
<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm animate-fade-in">
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4">
    <span class="material-symbols-outlined text-primary">update</span>
    <h3 class="text-lg font-bold text-on-surface">{t('settings.update.title')}</h3>
  </div>

  <p class="text-sm text-on-surface-variant mb-6 leading-relaxed">
    {t('settings.update.desc')}
  </p>

  <div class="flex flex-col gap-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-5 mb-6">
    <!-- Auto Update Check Toggle -->
    <div class="flex items-start justify-between gap-4">
      <div class="flex flex-col gap-1.5 max-w-[80%]">
        <span class="text-sm font-semibold text-on-surface">{t('settings.update.autoCheckEnabled')}</span>
        <span class="text-xs text-on-surface-variant leading-relaxed">{t('settings.update.autoCheckEnabledDesc')}</span>
      </div>
      <label class="relative inline-flex items-center cursor-pointer select-none">
        <input
          type="checkbox"
          bind:checked={store.settings.autoUpdateCheckEnabled}
          onchange={() => store.saveSettings()}
          class="sr-only peer"
        />
        <div class="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
      </label>
    </div>

    <!-- Divider -->
    <div class="border-t border-outline-variant/30"></div>

    <!-- Current Version Info & Manual Check -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{t('settings.update.currentVersion') || 'Installierte Version'}</span>
        <span class="text-lg font-bold text-primary">v{pkg.version}</span>
      </div>

      <button
        onclick={handleManualCheck}
        disabled={checking}
        class="bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container disabled:opacity-50 disabled:cursor-not-allowed transition-all py-2.5 px-5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow active:scale-[0.98]"
      >
        {#if checking}
          <span class="animate-spin h-4 w-4 border-2 border-on-primary border-t-transparent rounded-full"></span>
          <span>{t('settings.update.checking')}</span>
        {:else}
          <span class="material-symbols-outlined text-[18px]">search</span>
          <span>{t('settings.update.checkButton')}</span>
        {/if}
      </button>
    </div>
  </div>
</section>
