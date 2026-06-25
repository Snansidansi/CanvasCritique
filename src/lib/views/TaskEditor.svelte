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
  let instructionFileName = $state('');
  let solutionFileName = $state('');
  let instructionFile = $state(null);
  let solutionFile = $state(null);

  onMount(() => {
    if (store.editingTask) {
      taskName = store.editingTask.name;
      instructions = store.editingTask.instructions;
      solution = store.editingTask.solution;
      category = store.editingTask.category || 'Basics';
      targetProjectId = store.activeProject?.id || '';
      
      // Load saved files
      if (store.editingTask.instructionFile) {
        instructionFile = store.editingTask.instructionFile;
        instructionFileName = store.editingTask.instructionFile.name;
      }
      if (store.editingTask.solutionFile) {
        solutionFile = store.editingTask.solutionFile;
        solutionFileName = store.editingTask.solutionFile.name;
      }
    } else if (store.quickAddTaskData) {
      taskName = store.quickAddTaskData.name;
      category = store.quickAddTaskData.category || 'Basics';
      targetProjectId = store.activeProject?.id || (store.projects[0]?.id || '');
      store.quickAddTaskData = null; // Clear it out
    } else {
      targetProjectId = store.activeProject?.id || (store.projects[0]?.id || '');
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
      alert('Please select a project or create one first.');
      return;
    }

    if (isEditMode) {
      store.updateTask(targetProjectId, store.editingTask.id, {
        name: taskName.trim(),
        instructions: instructions.trim() || 'No instructions provided.',
        solution: solution.trim() || 'Review drawing output.',
        category,
        instructionFile,
        solutionFile
      });
      store.editingTask = null;
    } else {
      store.addTask(
        targetProjectId,
        taskName.trim(),
        instructions.trim() || 'No instructions provided.',
        solution.trim() || 'Review drawing output.',
        category,
        instructionFile,
        solutionFile
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

  function handleFileSelect(e, type) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const fileData = {
        name: file.name,
        dataUrl: event.target.result // Base64 Data URL
      };
      if (type === 'instruction') {
        instructionFileName = file.name;
        instructionFile = fileData;
      } else {
        solutionFileName = file.name;
        solutionFile = fileData;
      }
    };
    reader.readAsDataURL(file);
  }
</script>

<header class="w-full bg-surface border-b border-outline-variant flex items-center justify-between px-8 h-16 shrink-0 z-20 select-none">
  <button 
    onclick={handleCancel}
    class="material-symbols-outlined text-primary hover:bg-surface-container-high transition-colors p-2 rounded-full -ml-2 focus:outline-none cursor-pointer"
    title="Cancel"
  >
    arrow_back
  </button>
  <span class="font-bold text-primary tracking-tight text-lg">ScribeFlow</span>
  <div class="w-8"></div> <!-- Spacer -->
</header>

<main class="grow overflow-y-auto bg-surface p-8 custom-scrollbar h-full">
  <div class="max-w-3xl mx-auto flex flex-col gap-8">
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

      <!-- Instruction Material Upload -->
      <div class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-on-surface">Instruction Reference Material</span>
        <input 
          type="file" 
          id="instructionFileInput" 
          accept="image/*,application/pdf"
          class="hidden" 
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
              {instructionFileName ? `Selected: ${instructionFileName}` : 'Tap to upload or drag reference image'}
            </p>
            <p class="text-xs text-on-surface-variant mt-1">Supports PDF, PNG, JPG (Max 25MB)</p>
          </div>
        </button>
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
          accept="image/*,application/pdf"
          class="hidden" 
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
              {solutionFileName ? `Selected: ${solutionFileName}` : 'Tap to upload or drag reference image'}
            </p>
            <p class="text-xs text-on-surface-variant mt-1">Supports PDF, PNG, JPG (Max 25MB)</p>
          </div>
        </button>
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
