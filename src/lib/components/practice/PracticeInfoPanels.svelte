<script lang="ts">
  let {
    splitWidth = $bindable(400),
    activeLeftPanels,
    feedbackScore,
    isChecking,
    feedbackText,
    parseMarkdown,
    handleCritiqueClick,
    task
  } = $props();

  let isDraggingSplitter = $state(false);
  let startX = 0;
  let startWidth = 0;

  let expandedMediaIds = $state<Record<string, boolean>>({});

  function toggleMedia(mediaId: string) {
    expandedMediaIds[mediaId] = !expandedMediaIds[mediaId];
  }

  function isMediaExpanded(mediaId: string, defaultOpen: boolean) {
    if (expandedMediaIds[mediaId] !== undefined) {
      return expandedMediaIds[mediaId];
    }
    return defaultOpen;
  }

  let previewFile = $state<{ name: string; dataUrl: string } | null>(null);

  function openPreview(file: { name: string; dataUrl: string }) {
    previewFile = file;
  }

  function closePreview() {
    previewFile = null;
  }

  let isTaskTextEmpty = $derived(!task.instructions || !task.instructions.trim() || task.instructions === 'No instructions provided.');
  let isSolutionTextEmpty = $derived(!task.solution || !task.solution.trim() || task.solution === 'Review drawing output.');

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
            <div class="text-xs text-on-surface-variant leading-relaxed prose prose-sm dark:prose-invert select-text">
              {@html parseMarkdown(feedbackText)}
            </div>
          {/if}
        {:else}
          <div class="text-xs text-on-surface-variant leading-relaxed prose prose-sm dark:prose-invert select-text">
            {@html parseMarkdown(panel.content || '')}
          </div>

          {#if panel.id === 'task'}
            <!-- Instruction Media Files -->
            {#if task.instructionFiles && task.instructionFiles.length > 0}
              <div class="mt-5 border-t border-outline-variant/30 pt-4">
                <h3 class="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 select-none font-sans">Aufgabenmedien</h3>
                <div class="flex flex-col gap-3">
                  {#each task.instructionFiles as file, idx}
                    {@const mediaId = `task-inst-${idx}`}
                    {@const open = isMediaExpanded(mediaId, isTaskTextEmpty)}
                    <div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col transition-all">
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div 
                        onclick={() => toggleMedia(mediaId)}
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-container-high transition-colors font-sans text-xs font-semibold text-on-surface cursor-pointer select-none text-left"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="material-symbols-outlined text-[18px] text-primary shrink-0">
                            {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'image'}
                          </span>
                          <span class="truncate pr-4">{file.name}</span>
                        </div>
                        <div class="flex items-center shrink-0">
                          <button
                            type="button"
                            onclick={(e) => {
                              e.stopPropagation();
                              openPreview(file);
                            }}
                            class="material-symbols-outlined text-[18px] text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors mr-1.5"
                            title="In maximaler Größe öffnen"
                          >
                            zoom_in
                          </button>
                          <span class="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform shrink-0" style="transform: rotate({open ? '180deg' : '0deg'});">
                            keyboard_arrow_down
                          </span>
                        </div>
                      </div>

                      {#if open}
                        <div class="border-t border-outline-variant bg-surface-container-lowest p-2 flex justify-center items-center overflow-x-auto min-h-20">
                          {#if file.name.toLowerCase().endsWith('.pdf')}
                            <iframe 
                              src={file.dataUrl} 
                              title={file.name} 
                              class="w-full h-100 border-0 rounded-lg"
                            ></iframe>
                          {:else}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <img 
                              src={file.dataUrl} 
                              alt={file.name} 
                              onclick={() => openPreview(file)}
                              class="max-w-full max-h-125 object-contain rounded-lg shadow-sm cursor-zoom-in hover:opacity-95 transition-opacity"
                            />
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Solution Media Files under Instructions -->
            {#if task.solutionFiles && task.solutionFiles.length > 0}
              <div class="mt-5 border-t border-outline-variant/30 pt-4">
                <h3 class="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 select-none font-sans">Lösungsmedien</h3>
                <div class="flex flex-col gap-3">
                  {#each task.solutionFiles as file, idx}
                    {@const mediaId = `task-sol-${idx}`}
                    {@const open = isMediaExpanded(mediaId, isTaskTextEmpty)}
                    <div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col transition-all">
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div 
                        onclick={() => toggleMedia(mediaId)}
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-container-high transition-colors font-sans text-xs font-semibold text-on-surface cursor-pointer select-none text-left"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="material-symbols-outlined text-[18px] text-primary shrink-0">
                            {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'image'}
                          </span>
                          <span class="truncate pr-4">{file.name}</span>
                        </div>
                        <div class="flex items-center shrink-0">
                          <button
                            type="button"
                            onclick={(e) => {
                              e.stopPropagation();
                              openPreview(file);
                            }}
                            class="material-symbols-outlined text-[18px] text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors mr-1.5"
                            title="In maximaler Größe öffnen"
                          >
                            zoom_in
                          </button>
                          <span class="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform shrink-0" style="transform: rotate({open ? '180deg' : '0deg'});">
                            keyboard_arrow_down
                          </span>
                        </div>
                      </div>

                      {#if open}
                        <div class="border-t border-outline-variant bg-surface-container-lowest p-2 flex justify-center items-center overflow-x-auto min-h-20">
                          {#if file.name.toLowerCase().endsWith('.pdf')}
                            <iframe 
                              src={file.dataUrl} 
                              title={file.name} 
                              class="w-full h-100 border-0 rounded-lg"
                            ></iframe>
                          {:else}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <img 
                              src={file.dataUrl} 
                              alt={file.name} 
                              onclick={() => openPreview(file)}
                              class="max-w-full max-h-125 object-contain rounded-lg shadow-sm cursor-zoom-in hover:opacity-95 transition-opacity"
                            />
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}

          {#if panel.id === 'solution'}
            <!-- Solution Media Files inside Solution Panel -->
            {#if task.solutionFiles && task.solutionFiles.length > 0}
              <div class="mt-5 border-t border-outline-variant/30 pt-4">
                <h3 class="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 select-none font-sans">Lösungsmedien</h3>
                <div class="flex flex-col gap-3">
                  {#each task.solutionFiles as file, idx}
                    {@const mediaId = `sol-sol-${idx}`}
                    {@const open = isMediaExpanded(mediaId, isSolutionTextEmpty)}
                    <div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col transition-all">
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div 
                        onclick={() => toggleMedia(mediaId)}
                        class="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-container-high transition-colors font-sans text-xs font-semibold text-on-surface cursor-pointer select-none text-left"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="material-symbols-outlined text-[18px] text-primary shrink-0">
                            {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'image'}
                          </span>
                          <span class="truncate pr-4">{file.name}</span>
                        </div>
                        <div class="flex items-center shrink-0">
                          <button
                            type="button"
                            onclick={(e) => {
                              e.stopPropagation();
                              openPreview(file);
                            }}
                            class="material-symbols-outlined text-[18px] text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors mr-1.5"
                            title="In maximaler Größe öffnen"
                          >
                            zoom_in
                          </button>
                          <span class="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform shrink-0" style="transform: rotate({open ? '180deg' : '0deg'});">
                            keyboard_arrow_down
                          </span>
                        </div>
                      </div>

                      {#if open}
                        <div class="border-t border-outline-variant bg-surface-container-lowest p-2 flex justify-center items-center overflow-x-auto min-h-20">
                          {#if file.name.toLowerCase().endsWith('.pdf')}
                            <iframe 
                              src={file.dataUrl} 
                              title={file.name} 
                              class="w-full h-100 border-0 rounded-lg"
                            ></iframe>
                          {:else}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <img 
                              src={file.dataUrl} 
                              alt={file.name} 
                              onclick={() => openPreview(file)}
                              class="max-w-full max-h-125 object-contain rounded-lg shadow-sm cursor-zoom-in hover:opacity-95 transition-opacity"
                            />
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
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

<!-- Full-screen Media Preview Modal -->
{#if previewFile}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    onclick={closePreview}
    class="fixed inset-0 z-100 flex flex-col justify-center items-center bg-black/85 backdrop-blur-sm p-8"
  >
    <div 
      onclick={(e) => e.stopPropagation()}
      class="relative w-full h-full max-w-6xl max-h-[90vh] bg-surface rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-outline-variant"
    >
      <!-- Modal Header -->
      <header class="flex items-center justify-between px-6 py-4 border-b border-outline-variant select-none shrink-0 bg-surface">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0">
            {previewFile.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'image'}
          </span>
          <h2 class="font-bold text-sm text-on-surface truncate pr-6">{previewFile.name}</h2>
        </div>
        <button 
          type="button" 
          onclick={closePreview}
          class="material-symbols-outlined text-[20px] text-on-surface-variant hover:bg-surface-container-high p-2 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors"
        >
          close
        </button>
      </header>

      <!-- Modal Body (Max size view) -->
      <div class="grow bg-surface-container-lowest p-6 flex justify-center items-center overflow-auto min-h-0 select-text">
        {#if previewFile.name.toLowerCase().endsWith('.pdf')}
          <iframe 
            src={previewFile.dataUrl} 
            title={previewFile.name} 
            class="w-full h-full border-0 rounded-lg shadow-sm"
          ></iframe>
        {:else}
          <img 
            src={previewFile.dataUrl} 
            alt={previewFile.name} 
            class="max-w-full max-h-full object-contain rounded-lg shadow-md"
          />
        {/if}
      </div>
    </div>
  </div>
{/if}
