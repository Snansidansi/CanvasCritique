<script lang="ts">
  import { t } from '../../services/i18n';

  // Props
  let { 
    settings, 
    onchange 
  }: { 
    settings: any; 
    onchange?: () => void; 
  } = $props();

  function handleInputChange() {
    if (onchange) onchange();
  }
</script>

<div class="flex flex-col gap-4">
  <!-- Task Media Filter Card -->
  <div class="bg-surface-container-low/50 p-4 rounded-xl border border-outline-variant/60 flex flex-col gap-3">
    <div class="flex items-center gap-1.5 pb-2 border-b border-outline-variant/30 font-sans">
      <span class="material-symbols-outlined text-primary text-[18px]">menu_book</span>
      <span class="text-xs font-bold text-on-surface uppercase tracking-wider">{t('settings.api.taskMediaFilterTitle')}</span>
    </div>

    <!-- Mode Selection -->
    <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
      <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
        <span class="material-symbols-outlined text-[18px] text-primary">filter_alt</span>
        {t('settings.api.mediaFilterMode')}
      </span>
      <select
        bind:value={settings.taskMediaFilterMode}
        onchange={handleInputChange}
        class="bg-surface-container border border-outline-variant rounded-md px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary font-semibold w-56 text-right"
      >
        <option value="blacklist">{t('settings.api.mediaFilterBlacklist')}</option>
        <option value="whitelist">{t('settings.api.mediaFilterWhitelist')}</option>
      </select>
    </div>

    <!-- Extensions Textbox -->
    <div class="flex flex-col gap-1.5 bg-surface-container-low px-3 py-2.5 rounded-lg border border-outline-variant">
      <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
        <span class="material-symbols-outlined text-[18px] text-primary">settings_ethernet</span>
        {t('settings.api.mediaFilterExtensions')}
      </span>
      <input
        type="text"
        bind:value={settings.taskMediaFilterExtensions}
        onchange={handleInputChange}
        placeholder={t('settings.api.mediaFilterPlaceholder')}
        class="bg-surface-container border border-outline-variant rounded-md px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary font-mono w-full"
      />
    </div>
  </div>

  <!-- Solution Media Filter Card -->
  <div class="bg-surface-container-low/50 p-4 rounded-xl border border-outline-variant/60 flex flex-col gap-3">
    <div class="flex items-center gap-1.5 pb-2 border-b border-outline-variant/30 font-sans">
      <span class="material-symbols-outlined text-primary text-[18px]">visibility</span>
      <span class="text-xs font-bold text-on-surface uppercase tracking-wider">{t('settings.api.solutionMediaFilterTitle')}</span>
    </div>

    <!-- Mode Selection -->
    <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
      <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
        <span class="material-symbols-outlined text-[18px] text-primary">filter_alt</span>
        {t('settings.api.mediaFilterMode')}
      </span>
      <select
        bind:value={settings.solutionMediaFilterMode}
        onchange={handleInputChange}
        class="bg-surface-container border border-outline-variant rounded-md px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary font-semibold w-56 text-right"
      >
        <option value="blacklist">{t('settings.api.mediaFilterBlacklist')}</option>
        <option value="whitelist">{t('settings.api.mediaFilterWhitelist')}</option>
      </select>
    </div>

    <!-- Extensions Textbox -->
    <div class="flex flex-col gap-1.5 bg-surface-container-low px-3 py-2.5 rounded-lg border border-outline-variant">
      <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
        <span class="material-symbols-outlined text-[18px] text-primary">settings_ethernet</span>
        {t('settings.api.mediaFilterExtensions')}
      </span>
      <input
        type="text"
        bind:value={settings.solutionMediaFilterExtensions}
        onchange={handleInputChange}
        placeholder={t('settings.api.mediaFilterPlaceholder')}
        class="bg-surface-container border border-outline-variant rounded-md px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary font-mono w-full"
      />
    </div>
  </div>

  <!-- Multiple Choice Media Filter Card -->
  <div class="bg-surface-container-low/50 p-4 rounded-xl border border-outline-variant/60 flex flex-col gap-3">
    <div class="flex items-center gap-1.5 pb-2 border-b border-outline-variant/30 font-sans">
      <span class="material-symbols-outlined text-primary text-[18px]">rule</span>
      <span class="text-xs font-bold text-on-surface uppercase tracking-wider">{t('settings.api.mcMediaFilterTitle') || 'Medienfilter für Multiple Choice'}</span>
    </div>

    <!-- Mode Selection -->
    <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
      <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
        <span class="material-symbols-outlined text-[18px] text-primary">filter_alt</span>
        {t('settings.api.mediaFilterMode')}
      </span>
      <select
        bind:value={settings.mcMediaFilterMode}
        onchange={handleInputChange}
        class="bg-surface-container border border-outline-variant rounded-md px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary font-semibold w-56 text-right"
      >
        <option value="blacklist">{t('settings.api.mediaFilterBlacklist')}</option>
        <option value="whitelist">{t('settings.api.mediaFilterWhitelist')}</option>
      </select>
    </div>

    <!-- Extensions Textbox -->
    <div class="flex flex-col gap-1.5 bg-surface-container-low px-3 py-2.5 rounded-lg border border-outline-variant">
      <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
        <span class="material-symbols-outlined text-[18px] text-primary">settings_ethernet</span>
        {t('settings.api.mediaFilterExtensions')}
      </span>
      <input
        type="text"
        bind:value={settings.mcMediaFilterExtensions}
        onchange={handleInputChange}
        placeholder={t('settings.api.mediaFilterPlaceholder')}
        class="bg-surface-container border border-outline-variant rounded-md px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary font-mono w-full"
      />
    </div>
  </div>
</div>
