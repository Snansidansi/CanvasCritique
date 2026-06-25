<script>
  import { store } from '../../state/store.svelte';
</script>

<!-- Canvas Preferences Section -->
<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4">
    <span class="material-symbols-outlined text-primary">edit_road</span>
    <h3 class="text-lg font-bold text-on-surface">Canvas Preferences</h3>
  </div>
  <p class="text-xs text-on-surface-variant mb-4 leading-relaxed">
    Choose between a truly infinite freeform canvas or structured A4 format page sheets.
  </p>
  
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <!-- Infinite Canvas Card -->
    <button 
      type="button"
      onclick={() => { store.settings.canvasMode = 'infinite'; store.saveSettings(); }}
      class="cursor-pointer group text-left focus:outline-none"
    >
      <div class="border rounded-lg p-4 mb-2 bg-surface-container-low flex flex-col justify-between h-28 relative overflow-hidden transition-all
             {store.settings.canvasMode === 'infinite' ? 'border-primary border-2 bg-primary/5' : 'border-outline-variant hover:border-primary'}"
      >
        {#if store.settings.canvasMode === 'infinite'}
          <div class="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10">
            <span class="material-symbols-outlined text-[10px] text-white font-bold">check</span>
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-2xl text-primary font-bold">all_out</span>
          <span class="font-bold text-sm text-on-surface">Infinite Canvas</span>
        </div>
        <p class="text-xs text-on-surface-variant">Truly infinite workspace like OneNote. Scroll and pan freely in any direction.</p>
      </div>
    </button>

    <!-- A4 Format Card -->
    <button 
      type="button"
      onclick={() => { store.settings.canvasMode = 'a4'; store.saveSettings(); }}
      class="cursor-pointer group text-left focus:outline-none"
    >
      <div class="border rounded-lg p-4 mb-2 bg-surface-container-low flex flex-col justify-between h-28 relative overflow-hidden transition-all
             {store.settings.canvasMode === 'a4' ? 'border-primary border-2 bg-primary/5' : 'border-outline-variant hover:border-primary'}"
      >
        {#if store.settings.canvasMode === 'a4'}
          <div class="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10">
            <span class="material-symbols-outlined text-[10px] text-white font-bold">check</span>
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-2xl text-primary font-bold">description</span>
          <span class="font-bold text-sm text-on-surface">A4 Format Sheets</span>
        </div>
        <p class="text-xs text-on-surface-variant">Structured page-by-page sheets. Add, select, and delete individual A4 pages.</p>
      </div>
    </button>
  </div>
</section>
