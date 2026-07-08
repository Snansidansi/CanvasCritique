<script lang="ts">
  import { store } from "../state/store.svelte";
  import { fly } from "svelte/transition";
</script>

<div class="fixed bottom-6 right-6 z-200 flex flex-col gap-3 max-w-sm pointer-events-none select-none">
  {#each store.notifications as item (item.id)}
    <div
      transition:fly={{ y: 20, duration: 250 }}
      class="pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-2xl border shadow-xl backdrop-blur-md bg-surface-container-lowest/95 transition-all duration-300
             {item.type === 'success' ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : ''}
             {item.type === 'error' ? 'border-error/40 text-error' : ''}
             {item.type === 'info' ? 'border-primary/40 text-primary' : ''}"
    >
      <span class="material-symbols-outlined text-[20px] shrink-0">
        {#if item.type === 'success'}
          check_circle
        {:else if item.type === 'error'}
          error
        {:else}
          info
        {/if}
      </span>
      <span class="text-xs font-semibold tracking-wide leading-relaxed text-on-surface">
        {item.message}
      </span>
    </div>
  {/each}
</div>
