<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import CanvasModeSelector from './CanvasModeSelector.svelte';

  function resetCanvasLayout() {
    localStorage.removeItem('info_panels_layout');
    localStorage.removeItem('workspace_layout');
    localStorage.removeItem('sidebar_position');
    store.showNotification(t('settings.canvas.layoutResetSuccess'), 'success');
  }
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

  <!-- Font Size -->
  <div class="mt-6 border-t border-outline-variant/40 pt-5 flex flex-col gap-3">
    <div>
      <h4 class="font-bold text-sm text-on-surface mb-0.5">{t('settings.canvas.textFontSize')}</h4>
      <p class="text-xs text-on-surface-variant">{t('settings.canvas.textFontSizeDesc')}</p>
    </div>
    <div class="flex items-center gap-4">
      <input
        type="range"
        min="10"
        max="24"
        bind:value={store.settings.canvasFontSize}
        onchange={() => store.saveSettings()}
        class="flex-1 h-1 accent-primary cursor-pointer"
      />
      <span class="text-sm font-bold text-on-surface w-10 text-right">{store.settings.canvasFontSize}px</span>
    </div>
  </div>

  <!-- Eraser Mode -->
  <div class="mt-6 border-t border-outline-variant/40 pt-5 flex flex-col gap-4">
    <div>
      <h4 class="font-bold text-sm text-on-surface mb-0.5">{t('settings.canvas.eraser.title')}</h4>
      <p class="text-xs text-on-surface-variant">{t('settings.canvas.eraser.desc')}</p>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <button
        type="button"
        onclick={() => { store.settings.eraserMode = 'normal'; store.saveSettings(); }}
        class="cursor-pointer text-left focus:outline-none bg-transparent border-0 p-0 w-full"
      >
        <div class="border rounded-lg p-3 bg-surface-container-low transition-all
               {store.settings.eraserMode === 'normal' ? 'border-primary border-2 bg-primary/5' : 'border-outline-variant hover:border-primary'}">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-lg text-primary">brush</span>
            <span class="font-bold text-xs text-on-surface">{t('settings.canvas.eraser.normal')}</span>
          </div>
          <p class="text-[10px] text-on-surface-variant leading-tight mt-0.5">{t('settings.canvas.eraser.normalDesc')}</p>
        </div>
      </button>
      <button
        type="button"
        onclick={() => { store.settings.eraserMode = 'stroke'; store.saveSettings(); }}
        class="cursor-pointer text-left focus:outline-none bg-transparent border-0 p-0 w-full"
      >
        <div class="border rounded-lg p-3 bg-surface-container-low transition-all
               {store.settings.eraserMode === 'stroke' ? 'border-primary border-2 bg-primary/5' : 'border-outline-variant hover:border-primary'}">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-lg text-primary">auto_fix_high</span>
            <span class="font-bold text-xs text-on-surface">{t('settings.canvas.eraser.stroke')}</span>
          </div>
          <p class="text-[10px] text-on-surface-variant leading-tight mt-0.5">{t('settings.canvas.eraser.strokeDesc')}</p>
        </div>
      </button>
    </div>

    {#if store.settings.eraserMode === 'normal'}
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('settings.canvas.eraser.normalSize')}</span>
          <span class="text-xs font-bold text-primary">{store.settings.eraserRadiusNormal ?? 24}px</span>
        </div>
        <div class="flex items-center gap-4">
          <input
            type="range"
            min="4"
            max="80"
            bind:value={store.settings.eraserRadiusNormal}
            onchange={() => store.saveSettings()}
            class="flex-1 h-1 accent-primary cursor-pointer"
          />
        </div>
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('settings.canvas.eraser.strokeRadius')}</span>
          <span class="text-xs font-bold text-primary">{store.settings.eraserRadiusStroke ?? 24}px</span>
        </div>
        <div class="flex items-center gap-4">
          <input
            type="range"
            min="4"
            max="80"
            bind:value={store.settings.eraserRadiusStroke}
            onchange={() => store.saveSettings()}
            class="flex-1 h-1 accent-primary cursor-pointer"
          />
        </div>
      </div>
    {/if}
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

