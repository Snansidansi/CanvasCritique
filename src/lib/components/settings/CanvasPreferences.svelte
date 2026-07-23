<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import CanvasModeSelector from './CanvasModeSelector.svelte';
  import CanvasBackgroundSelector from './CanvasBackgroundSelector.svelte';

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

  <!-- Background Selection -->
  <div class="mt-6 border-t border-outline-variant/40 pt-5">
    <CanvasBackgroundSelector settings={store.settings} onchange={() => store.saveSettings()} />
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
  </div>


</section>

