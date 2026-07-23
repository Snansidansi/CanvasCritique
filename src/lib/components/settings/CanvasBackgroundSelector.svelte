<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import CustomBgModal from '../practice/CustomBgModal.svelte';

  let {
    settings = $bindable(),
    onchange
  }: {
    settings: { canvasBgPattern?: string; [key: string]: any };
    onchange?: () => void;
  } = $props();

  let activeBg = $derived(settings?.canvasBgPattern || 'grid');
  let isCustomBgModalOpen = $state(false);

  function selectBg(pattern: string) {
    settings.canvasBgPattern = pattern;
    if (onchange) onchange();
  }
</script>

<div class="flex flex-col gap-2">
  <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{t('practice.canvas.background')}</span>
  <div class="grid grid-cols-3 gap-2">
    <button 
      type="button"
      onclick={() => selectBg('grid')}
      class="flex flex-col items-center justify-center p-3 border rounded-lg gap-1.5 cursor-pointer focus:outline-none transition-all bg-transparent
             {activeBg === 'grid' ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}"
    >
      <span class="material-symbols-outlined text-xl">apps</span>
      <span class="text-[11px] font-semibold">{t('practice.canvas.dots')}</span>
    </button>
    <button 
      type="button"
      onclick={() => selectBg('lines')}
      class="flex flex-col items-center justify-center p-3 border rounded-lg gap-1.5 cursor-pointer focus:outline-none transition-all bg-transparent
             {activeBg === 'lines' ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}"
    >
      <span class="material-symbols-outlined text-xl">reorder</span>
      <span class="text-[11px] font-semibold">{t('practice.canvas.lines')}</span>
    </button>
    <button 
      type="button"
      onclick={() => selectBg('blank')}
      class="flex flex-col items-center justify-center p-3 border rounded-lg gap-1.5 cursor-pointer focus:outline-none transition-all bg-transparent
             {activeBg === 'blank' ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}"
    >
      <span class="material-symbols-outlined text-xl">check_box_outline_blank</span>
      <span class="text-[11px] font-semibold">{t('practice.canvas.blank')}</span>
    </button>
  </div>

  {#if store.customBackgrounds.length > 0}
    <div class="mt-2 flex flex-col gap-1.5">
      <span class="text-[11px] font-semibold text-on-surface-variant">{t('practice.canvas.customTemplates')}</span>
      <div class="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar border border-outline-variant/30 rounded-lg p-1">
        {#each store.customBackgrounds as customBg}
          <div class="flex items-center justify-between hover:bg-surface-container-high rounded-md group px-2 py-1">
            <button 
              type="button"
              onclick={() => selectBg(customBg.id)}
              class="grow text-left text-xs flex items-center gap-2 cursor-pointer border-0 bg-transparent focus:outline-none p-1.5 rounded {activeBg === customBg.id ? 'text-primary font-bold bg-primary/5' : 'text-on-surface'}"
            >
              {#if customBg.icon && customBg.icon.startsWith('data:image/')}
                <img src={customBg.icon} class="w-4 h-4 object-contain rounded" alt="" />
              {:else}
                <span class="material-symbols-outlined text-base">image</span>
              {/if}
              <span class="truncate">{customBg.name}</span>
            </button>
            <button 
              type="button"
              onclick={() => {
                store.confirm(
                  t('practice.canvas.deleteBg'),
                  t('practice.canvas.deleteBgConfirm', { name: customBg.name }),
                  () => {
                    if (activeBg === customBg.id) selectBg('grid');
                    store.deleteCustomBackground(customBg.id);
                  }
                );
              }}
              class="p-1 text-outline hover:text-error opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none cursor-pointer flex items-center justify-center border-0 bg-transparent"
              title="Delete Background"
            >
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <button 
    type="button"
    onclick={() => { 
      isCustomBgModalOpen = true; 
    }}
    class="mt-2 w-full py-2 border border-dashed border-primary/50 text-primary hover:bg-primary/10 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none bg-transparent"
  >
    <span class="material-symbols-outlined text-base">add_box</span>
    <span>{t('practice.canvas.addCustomBg')}</span>
  </button>
</div>

<CustomBgModal
  bind:isCustomBgModalOpen
  activeBg={activeBg}
  onclose={() => {
    if (activeBg && activeBg !== settings.canvasBgPattern) {
      selectBg(activeBg);
    }
  }}
/>
