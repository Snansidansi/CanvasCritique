<script lang="ts">
  let {
    activeTooltipMarker = $bindable(),
    left,
    top,
    containerWidth = 800,
    containerHeight = 600
  } = $props();

  let tooltipWidth = 288;
  let tooltipHeight = $state(120);
  let margin = 16;

  // Position above if the tooltip height would push it off the bottom edge
  let placeAbove = $derived(top + 24 + tooltipHeight > containerHeight - margin);

  let adjustedLeft = $derived.by(() => {
    const halfWidth = tooltipWidth / 2;
    const minLeft = margin + halfWidth;
    const maxLeft = Math.max(minLeft, containerWidth - margin - halfWidth);
    return Math.max(minLeft, Math.min(left, maxLeft));
  });

  let adjustedTop = $derived.by(() => {
    if (placeAbove) {
      return Math.max(margin, top - tooltipHeight - 12);
    } else {
      return Math.min(containerHeight - tooltipHeight - margin, top + 16);
    }
  });
</script>

{#if activeTooltipMarker}
  <!-- Click outside overlay to dismiss -->
  <button 
    type="button" 
    class="absolute inset-0 bg-transparent z-40 cursor-default border-0 p-0 m-0 w-full h-full focus:outline-none" 
    onclick={() => activeTooltipMarker = null}
    aria-label="Dismiss feedback"
  ></button>

  <div 
    bind:clientHeight={tooltipHeight}
    class="absolute z-50 bg-surface-container-high border border-outline-variant/60 rounded-xl p-4 w-72 shadow-2xl flex flex-col gap-2 -translate-x-1/2 animate-fade-in pointer-events-auto"
    style="left: {adjustedLeft}px; top: {adjustedTop}px;"
  >
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-base 
        {activeTooltipMarker.type === 'correct' ? 'text-emerald-500' : 
         activeTooltipMarker.type === 'incorrect' ? 'text-red-500' : 
         'text-amber-500'}">
        {activeTooltipMarker.type === 'correct' ? 'check_circle' : 
         activeTooltipMarker.type === 'incorrect' ? 'cancel' : 
         'warning'}
      </span>
      <span class="text-xs font-bold uppercase tracking-wider text-on-surface">
        {activeTooltipMarker.type === 'correct' ? 'Correct' : 
         activeTooltipMarker.type === 'incorrect' ? 'Incorrect' : 
         'Partial'}
      </span>
      <button 
        onclick={() => activeTooltipMarker = null} 
        class="ml-auto material-symbols-outlined text-[16px] text-on-surface-variant hover:text-on-surface focus:outline-none cursor-pointer border-0 bg-transparent p-0 flex items-center justify-center"
      >
        close
      </button>
    </div>
    <p class="text-xs text-on-surface-variant leading-relaxed">
      {activeTooltipMarker.feedback}
    </p>
  </div>
{/if}
