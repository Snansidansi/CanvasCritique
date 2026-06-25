<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';

  function setTheme(theme) {
    store.settings.theme = theme;
    store.saveSettings();
  }
</script>

<!-- Appearance Section -->
<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4">
    <span class="material-symbols-outlined text-primary">palette</span>
    <h3 class="text-lg font-bold text-on-surface">{t('settings.appearance.title')}</h3>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <!-- Light Mode Card -->
    <button 
      onclick={() => setTheme('light')}
      class="cursor-pointer group text-left focus:outline-none"
    >
      <div class="border rounded-lg p-2 mb-2 bg-white flex items-center justify-center h-24 shadow-sm relative overflow-hidden transition-all
             {store.settings.theme === 'light' ? 'border-primary border-2' : 'border-outline-variant hover:border-primary'}"
      >
        {#if store.settings.theme === 'light'}
          <div class="absolute top-2 left-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10">
            <span class="material-symbols-outlined text-[10px] text-white font-bold">check</span>
          </div>
        {/if}
        <span class="material-symbols-outlined text-4xl text-slate-800">light_mode</span>
      </div>
      <p class="text-center text-sm font-semibold {store.settings.theme === 'light' ? 'text-primary' : 'text-on-surface-variant'}" >{t('settings.appearance.light')}</p>
    </button>

    <!-- Dark Mode Card -->
    <button 
      onclick={() => setTheme('dark')}
      class="cursor-pointer group text-left focus:outline-none"
    >
      <div class="border rounded-lg p-2 mb-2 bg-[#121314] flex items-center justify-center h-24 relative overflow-hidden transition-all
             {store.settings.theme === 'dark' ? 'border-primary border-2' : 'border-outline-variant hover:border-primary'}"
      >
        {#if store.settings.theme === 'dark'}
          <div class="absolute top-2 left-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10">
            <span class="material-symbols-outlined text-[10px] text-white font-bold">check</span>
          </div>
        {/if}
        <span class="material-symbols-outlined text-4xl text-slate-100">dark_mode</span>
      </div>
      <p class="text-center text-sm font-semibold {store.settings.theme === 'dark' ? 'text-primary' : 'text-on-surface-variant'}">{t('settings.appearance.dark')}</p>
    </button>

    <!-- System Mode Card (Redesigned Split View) -->
    <button 
      onclick={() => setTheme('system')}
      class="cursor-pointer group text-left focus:outline-none"
    >
      <div class="border rounded-lg mb-2 flex h-24 relative overflow-hidden transition-all
             {store.settings.theme === 'system' ? 'border-primary border-2' : 'border-outline-variant hover:border-primary'}"
      >
        {#if store.settings.theme === 'system'}
          <div class="absolute top-2 left-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-20">
            <span class="material-symbols-outlined text-[10px] text-white font-bold">check</span>
          </div>
        {/if}
        <!-- Split backgrounds: left half white, right half dark background -->
        <div class="w-1/2 bg-white h-full"></div>
        <div class="w-1/2 bg-[#121314] h-full"></div>
        <!-- Centered icon overlay with backdrop blur & rounded-full styling -->
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="w-12 h-12 rounded-full bg-surface-container/70 backdrop-blur-md border border-outline/30 flex items-center justify-center shadow-md">
            <span class="material-symbols-outlined text-2xl text-on-surface-variant group-hover:text-primary transition-colors">settings_brightness</span>
          </div>
        </div>
      </div>
      <p class="text-center text-sm font-semibold {store.settings.theme === 'system' ? 'text-primary' : 'text-on-surface-variant'}">{t('settings.appearance.system')}</p>
    </button>
  </div>
</section>

