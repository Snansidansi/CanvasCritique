<script lang="ts">
  import { t } from '../../services/i18n';

  let {
    settings,
    onchange
  }: {
    settings: { canvasMode?: string; [key: string]: any };
    onchange?: () => void;
  } = $props();

  function selectMode(mode: 'infinite' | 'a4') {
    settings.canvasMode = mode;
    if (onchange) {
      onchange();
    }
  }
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <!-- Infinite Canvas Card -->
  <button 
    type="button"
    onclick={() => selectMode('infinite')}
    class="cursor-pointer group text-left focus:outline-none bg-transparent border-0 p-0 w-full"
  >
    <div class="border rounded-lg p-4 mb-2 bg-surface-container-low flex flex-col justify-between h-28 relative overflow-hidden transition-all
           {settings.canvasMode === 'infinite' ? 'border-primary border-2 bg-primary/5' : 'border-outline-variant hover:border-primary'}"
    >
      {#if settings.canvasMode === 'infinite'}
        <div class="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10">
          <span class="material-symbols-outlined text-[10px] text-white font-bold">check</span>
        </div>
      {/if}
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-2xl text-primary font-bold">all_out</span>
        <span class="font-bold text-sm text-on-surface">{t('settings.canvas.infinite')}</span>
      </div>
      <p class="text-xs text-on-surface-variant leading-tight">{t('settings.canvas.infiniteDesc')}</p>
    </div>
  </button>

  <!-- A4 Format Card -->
  <button 
    type="button"
    onclick={() => selectMode('a4')}
    class="cursor-pointer group text-left focus:outline-none bg-transparent border-0 p-0 w-full"
  >
    <div class="border rounded-lg p-4 mb-2 bg-surface-container-low flex flex-col justify-between h-28 relative overflow-hidden transition-all
           {settings.canvasMode === 'a4' ? 'border-primary border-2 bg-primary/5' : 'border-outline-variant hover:border-primary'}"
    >
      {#if settings.canvasMode === 'a4'}
        <div class="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10">
          <span class="material-symbols-outlined text-[10px] text-white font-bold">check</span>
        </div>
      {/if}
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-2xl text-primary font-bold">description</span>
        <span class="font-bold text-sm text-on-surface">{t('settings.canvas.a4')}</span>
      </div>
      <p class="text-xs text-on-surface-variant leading-tight">{t('settings.canvas.a4Desc')}</p>
    </div>
  </button>
</div>

{#if settings.canvasMode === 'a4'}
  <div class="mt-3 flex flex-col gap-1.5 border-t border-outline-variant/30 pt-3">
    <span class="text-xs font-semibold text-on-surface-variant">{t('settings.canvas.a4Orientation')}</span>
    <div class="grid grid-cols-2 gap-2">
      <button
        type="button"
        onclick={() => {
          settings.a4Orientation = 'portrait';
          if (onchange) onchange();
        }}
        class="flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all bg-transparent
               {(!settings.a4Orientation || settings.a4Orientation === 'portrait') ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}"
      >
        <span class="material-symbols-outlined text-base">crop_portrait</span>
        <span>{t('settings.canvas.portrait')}</span>
      </button>
      <button
        type="button"
        onclick={() => {
          settings.a4Orientation = 'landscape';
          if (onchange) onchange();
        }}
        class="flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all bg-transparent
               {(settings.a4Orientation === 'landscape') ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}"
      >
        <span class="material-symbols-outlined text-base">crop_landscape</span>
        <span>{t('settings.canvas.landscape')}</span>
      </button>
    </div>
  </div>
{/if}
