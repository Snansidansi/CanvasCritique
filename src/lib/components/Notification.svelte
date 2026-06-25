<script lang="ts">
  import { store } from "../state/store.svelte";
  import { fly } from "svelte/transition";
</script>

{#if store.notification}
  <div
    transition:fly={{ y: 20, duration: 250 }}
    class="fixed bottom-6 right-6 z-200 max-w-sm flex items-center gap-3 px-5 py-3.5 rounded-2xl border shadow-xl backdrop-blur-md select-none transition-all duration-300
           {store.notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : ''}
           {store.notification.type === 'error' ? 'bg-error/10 border-error/30 text-error' : ''}
           {store.notification.type === 'info' ? 'bg-primary/10 border-primary/30 text-primary' : ''}"
  >
    <span class="material-symbols-outlined text-[20px] shrink-0">
      {#if store.notification.type === 'success'}
        check_circle
      {:else if store.notification.type === 'error'}
        error
      {:else}
        info
      {/if}
    </span>
    <span class="text-xs font-semibold tracking-wide leading-relaxed text-on-surface">
      {store.notification.message}
    </span>
  </div>
{/if}
