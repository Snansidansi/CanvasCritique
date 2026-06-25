<script lang="ts">
  import { store } from '../state/store.svelte';
  import { onMount } from 'svelte';

  // Form states
  let taskName = $state('');
  let targetProjectId = $state('');
  let instructions = $state('');
  let solution = $state('');
  let category = $state('Basics');

  // Derived edit state
  let isEditMode = $derived(store.editingTask !== null);

  // File names and object references
  let instructionFiles = $state([]);
  let solutionFiles = $state([]);

  onMount(() => {
    if (store.editingTask) {
      taskName = store.editingTask.name;
      instructions = store.editingTask.instructions;
      solution = store.editingTask.solution;
      category = store.editingTask.category || 'Basics';
      targetProjectId = store.activeProject?.id || '';
      
      // Load saved files
      if (store.editingTask.instructionFiles && Array.isArray(store.editingTask.instructionFiles)) {
        instructionFiles = [...store.editingTask.instructionFiles];
      } else if (store.editingTask.instructionFile) {
        instructionFiles = [store.editingTask.instructionFile];
      }

      if (store.editingTask.solutionFiles && Array.isArray(store.editingTask.solutionFiles)) {
        solutionFiles = [...store.editingTask.solutionFiles];
      } else if (store.editingTask.solutionFile) {
        solutionFiles = [store.editingTask.solutionFile];
      }
    } else if (store.quickAddTaskData) {
      taskName = store.quickAddTaskData.name;
      category = store.quickAddTaskData.category || 'Basics';
      targetProjectId = store.activeProject?.id || (store.projects.find(p => p.profileId === store.activeProfileId)?.id || '');
      store.quickAddTaskData = null; // Clear it out
    } else {
      targetProjectId = store.activeProject?.id || (store.projects.find(p => p.profileId === store.activeProfileId)?.id || '');
    }
  });

  // Categories list of target project
  let categories = $derived(
    store.projects.find(p => p.id === targetProjectId)?.categories || ['Basics', 'Intermediate', 'Advanced']
  );

  function handleSave(e) {
    e.preventDefault();
    if (!taskName.trim()) {
      alert('Please enter a task name.');
      return;
    }
    if (!targetProjectId) {
      alert('Please select a lesson or create one first.');
      return;
    }

    if (isEditMode) {
      store.updateTask(targetProjectId, store.editingTask.id, {
        name: taskName.trim(),
        instructions: instructions.trim() || 'No instructions provided.',
        solution: solution.trim() || 'Review drawing output.',
        category,
        instructionFiles,
        solutionFiles,
        // Reset single legacy files to keep database clean
        instructionFile: null,
        solutionFile: null
      });
      store.editingTask = null;
    } else {
      store.addTask(
        targetProjectId,
        taskName.trim(),
        instructions.trim() || 'No instructions provided.',
        solution.trim() || 'Review drawing output.',
        category,
        instructionFiles,
        solutionFiles
      );
    }

    // Reset and return
    taskName = '';
    instructions = '';
    solution = '';
    store.setView('project-detail');
  }

  function handleCancel() {
    store.editingTask = null;
    store.setView(store.activeProject ? 'project-detail' : 'dashboard');
  }

  function triggerUpload(type) {
    const input = document.getElementById(`${type}FileInput`);
    if (input) input.click();
  }

  function handleFileSelect(e: any, type: string) {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files || []) as File[];
    if (!files.length) return;

    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileData = {
          name: file.name,
          dataUrl: event.target?.result as string // Base64 Data URL
        };
        if (type === 'instruction') {
          instructionFiles = [...instructionFiles, fileData];
        } else {
          solutionFiles = [...solutionFiles, fileData];
        }
      };
      reader.readAsDataURL(file);
    });
    // Reset value so selection event triggers even for the same files
    target.value = '';
  }

  // Preview modal states & handlers
  let previewFile = $state<{ name: string; dataUrl: string } | null>(null);
  let modalZoom = $state(1);
  let modalPan = $state({ x: 0, y: 0 });
  let isModalDragging = $state(false);
  let modalDragStart = { x: 0, y: 0 };
  let modalBasePan = { x: 0, y: 0 };

  function decodeBase64Text(dataUrl: string): string {
    if (!dataUrl) return '';
    try {
      const base64Data = dataUrl.split(',')[1];
      return decodeURIComponent(escape(atob(base64Data)));
    } catch (e) {
      console.error('Failed to decode text document', e);
      return 'Error: Failed to decode text document.';
    }
  }

  function openPreview(file: { name: string; dataUrl: string }) {
    previewFile = file;
    modalZoom = 1;
    modalPan = { x: 0, y: 0 };
  }

  function closePreview() {
    previewFile = null;
  }

  function handleModalWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = modalZoom + direction * zoomFactor;
    modalZoom = Math.max(0.5, Math.min(newZoom, 8)); // clamp between 0.5x and 8x
    if (modalZoom === 1) {
      modalPan = { x: 0, y: 0 };
    }
  }

  function handleModalMouseDown(e: MouseEvent) {
    if (modalZoom <= 1) return; // Only pan when zoomed in
    isModalDragging = true;
    modalDragStart = { x: e.clientX, y: e.clientY };
    modalBasePan = { ...modalPan };
  }

  function handleModalMouseMove(e: MouseEvent) {
    if (!isModalDragging) return;
    const dx = e.clientX - modalDragStart.x;
    const dy = e.clientY - modalDragStart.y;
    modalPan = {
      x: modalBasePan.x + dx,
      y: modalBasePan.y + dy
    };
  }

  function handleModalMouseUp() {
    isModalDragging = false;
  }
</script>

<main class="grow overflow-y-auto bg-surface p-8 custom-scrollbar h-full">
  <div class="max-w-3xl mx-auto flex flex-col gap-6">
    <div class="flex items-center -ml-2">
      <button 
        onclick={handleCancel}
        class="material-symbols-outlined text-primary hover:bg-surface-container-high transition-colors p-2 rounded-full focus:outline-none cursor-pointer"
        title="Cancel"
      >
        arrow_back
      </button>
    </div>

    <header class="flex flex-col gap-2">
      <h1 class="text-2xl font-bold text-on-surface">{isEditMode ? 'Edit Task' : 'Create Task'}</h1>
      <p class="text-sm text-on-surface-variant">
        {isEditMode ? 'Modify details or requirements for this script assignment.' : 'Define the parameters and provide reference materials for this assignment.'}
      </p>
    </header>

    <form onsubmit={handleSave} class="flex flex-col gap-8 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm">
      


      <!-- Task Name -->
      <div class="flex flex-col gap-2 group">
        <label class="text-sm font-semibold text-on-surface group-focus-within:text-primary transition-colors" for="taskName">Task Name</label>
        <input 
          id="taskName" 
          type="text" 
          bind:value={taskName}
          placeholder="e.g., Spencerian Loops, Ascenders"
          class="w-full bg-transparent border-0 border-b border-outline-variant px-0 py-2.5 text-base text-on-surface placeholder:text-outline focus:ring-0 focus:border-primary focus:border-b-2 transition-all focus:outline-none"
          required
        />
      </div>

      <!-- Category Level -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-on-surface" for="category">Difficulty Category / Topic</label>
        <select 
          id="category"
          bind:value={category}
          class="w-full bg-transparent border border-outline-variant rounded-lg p-2.5 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
        >
          {#each categories as cat}
            <option value={cat}>{cat}</option>
          {/each}
        </select>
      </div>

      <!-- Instructions -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-on-surface" for="instructions">Instructions</label>
        <textarea 
          id="instructions" 
          bind:value={instructions}
          placeholder="Write detailed step-by-step instructions. Markdown is supported." 
          rows="5"
          class="w-full bg-transparent border border-outline-variant rounded-lg p-4 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:border-primary resize-y shadow-sm focus:outline-none"
        ></textarea>
      </div>

      <!-- Warning Note about API context size and cost -->
      <div class="flex gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-800 dark:text-amber-300">
        <span class="material-symbols-outlined text-[20px] shrink-0 mt-0.5">warning</span>
        <div class="flex flex-col gap-0.5">
          <p class="text-xs font-semibold">Note on Documents &amp; API Costs</p>
          <p class="text-[11px] leading-normal opacity-90">Too many documents increase the API context size, which can make the results less accurate and increase costs. Please only upload the necessary reference materials.</p>
        </div>
      </div>

      <!-- Instruction Material Upload -->
      <div class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-on-surface">Instruction Reference Material</span>
        <input 
          type="file" 
          id="instructionFileInput" 
          accept="image/*,application/pdf,text/plain"
          class="hidden" 
          multiple
          onchange={(e) => handleFileSelect(e, 'instruction')}
        />
        <button 
          type="button"
          onclick={() => triggerUpload('instruction')}
          class="w-full border-2 border-dashed border-outline-variant rounded-xl bg-surface-container-low p-6 flex flex-col items-center justify-center gap-2 hover:bg-surface-container hover:border-primary/50 transition-all group relative overflow-hidden focus:outline-none cursor-pointer"
        >
          <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
            <span class="material-symbols-outlined text-[24px]">upload_file</span>
          </div>
          <div class="text-center">
            <p class="text-sm font-semibold text-on-surface">
              {instructionFiles.length > 0 ? `${instructionFiles.length} files selected` : 'Tap to upload or drag reference files'}
            </p>
            <p class="text-xs text-on-surface-variant mt-1">Supports PDF, PNG, JPG, TXT (Max 25MB, multiple files supported)</p>
          </div>
        </button>

        {#if instructionFiles.length > 0}
          <div class="mt-2 flex flex-col gap-1.5">
            {#each instructionFiles as file, index}
              <div class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  onclick={() => openPreview(file)}
                  class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow"
                  title="Click to preview file"
                >
                  <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                    {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : (file.name.toLowerCase().endsWith('.txt') ? 'description' : 'image')}
                  </span>
                  <span class="text-xs text-on-surface hover:text-primary truncate font-medium">{file.name}</span>
                </div>
                <button 
                  type="button"
                  onclick={() => {
                    instructionFiles = instructionFiles.filter((_, i) => i !== index);
                  }}
                  class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors shrink-0"
                  title="Remove"
                >
                  close
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Expected Solution -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-on-surface" for="solution">Expected Solution / Evaluation Criteria</label>
        <textarea 
          id="solution" 
          bind:value={solution}
          placeholder="Provide the expected outcome. This prompt is passed to the AI to grade the handwriting." 
          rows="4"
          class="w-full bg-transparent border border-outline-variant rounded-lg p-4 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:border-primary resize-y shadow-sm focus:outline-none"
        ></textarea>
      </div>

      <!-- Expected Solution Material Upload -->
      <div class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-on-surface">Expected Solution Material</span>
        <input 
          type="file" 
          id="solutionFileInput" 
          accept="image/*,application/pdf,text/plain"
          class="hidden" 
          multiple
          onchange={(e) => handleFileSelect(e, 'solution')}
        />
        <button 
          type="button"
          onclick={() => triggerUpload('solution')}
          class="w-full border-2 border-dashed border-outline-variant rounded-xl bg-surface-container-low p-6 flex flex-col items-center justify-center gap-2 hover:bg-surface-container hover:border-primary/50 transition-all group relative overflow-hidden focus:outline-none cursor-pointer"
        >
          <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
            <span class="material-symbols-outlined text-[24px]">upload_file</span>
          </div>
          <div class="text-center">
            <p class="text-sm font-semibold text-on-surface">
              {solutionFiles.length > 0 ? `${solutionFiles.length} files selected` : 'Tap to upload or drag solution files'}
            </p>
            <p class="text-xs text-on-surface-variant mt-1">Supports PDF, PNG, JPG, TXT (Max 25MB, multiple files supported)</p>
          </div>
        </button>

        {#if solutionFiles.length > 0}
          <div class="mt-2 flex flex-col gap-1.5">
            {#each solutionFiles as file, index}
              <div class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  onclick={() => openPreview(file)}
                  class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow"
                  title="Click to preview file"
                >
                  <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                    {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : (file.name.toLowerCase().endsWith('.txt') ? 'description' : 'image')}
                  </span>
                  <span class="text-xs text-on-surface hover:text-primary truncate font-medium">{file.name}</span>
                </div>
                <button 
                  type="button"
                  onclick={() => {
                    solutionFiles = solutionFiles.filter((_, i) => i !== index);
                  }}
                  class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors shrink-0"
                  title="Remove"
                >
                  close
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Save / Cancel Buttons -->
      <div class="flex justify-end gap-3 mt-4">
        <button 
          type="button" 
          onclick={handleCancel}
          class="px-5 py-2.5 border border-outline-variant text-on-surface-variant font-semibold text-sm rounded-lg hover:bg-surface-container cursor-pointer"
        >
          Cancel
        </button>
        <button 
          type="submit" 
          class="px-6 py-2.5 bg-primary text-on-primary font-semibold text-sm rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-[0_4px_14px_rgba(0,64,224,0.15)] flex items-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[18px]">save</span>
          {isEditMode ? 'Save Changes' : 'Save Task'}
        </button>
      </div>
    </form>
  </div>
</main>

{#if previewFile}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    onclick={closePreview}
    class="fixed inset-0 z-100 flex flex-col justify-center items-center bg-black/85 backdrop-blur-sm p-8 select-none"
  >
    <div 
      onclick={(e) => e.stopPropagation()}
      class="relative w-full h-full max-w-6xl max-h-[90vh] bg-surface rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-outline-variant"
    >
      <!-- Modal Header -->
      <header class="flex items-center justify-between px-6 py-4 border-b border-outline-variant select-none shrink-0 bg-surface">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0">
            {previewFile.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : (previewFile.name.toLowerCase().endsWith('.txt') ? 'description' : 'image')}
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

      <!-- Modal Body (Max size view with Zoom / Pan support for images) -->
      <div 
        onwheel={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') ? handleModalWheel : null}
        onmousedown={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') ? handleModalMouseDown : null}
        onmousemove={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') ? handleModalMouseMove : null}
        onmouseup={handleModalMouseUp}
        onmouseleave={handleModalMouseUp}
        class="grow bg-surface-container-lowest p-6 flex justify-center items-center min-h-0 select-text {previewFile.name.toLowerCase().endsWith('.pdf') || previewFile.name.toLowerCase().endsWith('.txt') ? 'overflow-auto' : 'overflow-hidden relative'}"
        style={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') ? `cursor: ${modalZoom > 1 ? (isModalDragging ? 'grabbing' : 'grab') : 'zoom-in'}` : ''}
      >
        {#if previewFile.name.toLowerCase().endsWith('.pdf')}
          <iframe 
            src={previewFile.dataUrl} 
            title={previewFile.name} 
            class="w-full h-full border-0 rounded-lg shadow-sm"
          ></iframe>
        {:else if previewFile.name.toLowerCase().endsWith('.txt')}
          <pre class="w-full h-full p-6 overflow-auto bg-surface-container-high rounded-xl text-sm font-mono text-on-surface whitespace-pre-wrap select-text leading-relaxed border border-outline-variant">{decodeBase64Text(previewFile.dataUrl)}</pre>
        {:else}
          <img 
            src={previewFile.dataUrl} 
            alt={previewFile.name} 
            class="max-w-full max-h-full object-contain rounded-lg shadow-md select-none pointer-events-none transition-transform duration-75 ease-out"
            style="transform: translate({modalPan.x}px, {modalPan.y}px) scale({modalZoom}); transform-origin: center center;"
            draggable="false"
          />
        {/if}
      </div>
    </div>
  </div>
{/if}
