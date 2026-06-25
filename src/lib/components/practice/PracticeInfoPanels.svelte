<script lang="ts">
  let {
    splitWidth = $bindable(400),
    activeLeftPanels,
    feedbackScore,
    isChecking,
    feedbackText,
    parseMarkdown,
    handleCritiqueClick
  } = $props();

  let isDraggingSplitter = $state(false);
  let startX = 0;
  let startWidth = 0;

  function startSplitDrag(e) {
    isDraggingSplitter = true;
    startX = e.clientX;
    startWidth = splitWidth;
    window.addEventListener('mousemove', handleSplitDrag);
    window.addEventListener('mouseup', stopSplitDrag);
  }

  function handleSplitDrag(e) {
    if (!isDraggingSplitter) return;
    const deltaX = e.clientX - startX;
    const newWidth = startWidth + deltaX;
    
    // Bounds constraints
    if (newWidth >= 180 && newWidth <= 800) {
      splitWidth = newWidth;
    }
  }

  function stopSplitDrag() {
    isDraggingSplitter = false;
    window.removeEventListener('mousemove', handleSplitDrag);
    window.removeEventListener('mouseup', stopSplitDrag);
  }
</script>

{#if activeLeftPanels.length > 0}
  <section 
    class="bg-surface-container-low border-r border-outline-variant flex flex-col overflow-hidden h-full shrink-0"
    style="width: {splitWidth}px;"
  >
    {#each activeLeftPanels as panel, idx}
      {#if idx > 0}
        <div class="h-px w-full bg-outline-variant/30"></div>
      {/if}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div 
        onclick={panel.isFeedback ? handleCritiqueClick : null}
        class="flex-1 flex flex-col overflow-y-auto p-6 hide-scrollbar {panel.id === 'solution' ? 'bg-surface-container-low/20' : panel.id === 'feedback' ? 'bg-primary/5' : ''}"
      >
        <div class="flex items-center justify-between mb-3 pb-1 border-b border-outline-variant/30">
          <h2 class="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5 font-sans select-none">
            {#if panel.id === 'task'}
              <span class="material-symbols-outlined text-base text-primary">menu_book</span>
            {:else if panel.id === 'solution'}
              <span class="material-symbols-outlined text-base text-primary">visibility</span>
            {:else}
              <span class="material-symbols-outlined text-base text-primary">neurology</span>
            {/if}
            {panel.title}
          </h2>
          {#if panel.id === 'feedback' && feedbackScore !== null}
            <div class="bg-primary text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm select-none">
              Score: {feedbackScore}
            </div>
          {/if}
        </div>
        
        {#if panel.isFeedback}
          {#if isChecking}
            <div class="flex flex-col items-center justify-center py-8 gap-3 my-auto select-none">
              <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p class="text-xs text-on-surface-variant text-center">{feedbackText}</p>
            </div>
          {:else}
            <div class="text-xs text-on-surface-variant leading-relaxed prose prose-sm dark:prose-invert">
              {@html parseMarkdown(feedbackText)}
            </div>
          {/if}
        {:else}
          <div class="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line">
            {panel.content}
          </div>
        {/if}
      </div>
    {/each}
  </section>

  <!-- Draggable Split Separator -->
  <div 
    role="separator"
    aria-valuenow={splitWidth}
    class="w-1.5 hover:w-2 bg-outline-variant/60 hover:bg-primary cursor-col-resize select-none h-full z-20 transition-all active:bg-primary shrink-0"
    onmousedown={startSplitDrag}
  ></div>
{/if}
