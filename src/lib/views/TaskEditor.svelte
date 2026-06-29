<script lang="ts">
  import { store } from '../state/store.svelte';
  import { onMount } from 'svelte';
  import { parseMarkdown } from '../utils/markdown';
  import { t } from '../services/i18n';
  import { saveMediaToDb, getMediaDataUrl } from '../db/media';
  import AudioPlayer from '../components/practice/AudioPlayer.svelte';

  // Form states
  let taskName = $state('');
  let targetProjectId = $state('');
  let nameInput = $state<HTMLInputElement | null>(null);
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
      if (!taskName && targetProjectId) {
        taskName = store.generateNextTaskName(targetProjectId, category);
      }
    } else {
      targetProjectId = store.activeProject?.id || (store.projects.find(p => p.profileId === store.activeProfileId)?.id || '');
      // When created via general add task button, we don't automatically generate name here.
      taskName = '';
    }

    setTimeout(() => {
      if (nameInput) {
        nameInput.focus();
        if (taskName) {
          nameInput.select();
        }
      }
    }, 50);
  });

  function handleCategoryChange(newCategory: string) {
    if (isEditMode) return;
    const settings = store.getEffectiveSettings(targetProjectId);
    if (!settings.autoNumberTasks) return;

    const isNameEmpty = !taskName.trim();
    const isNameTemplate = store.isNameMatchingTemplate(taskName, targetProjectId);

    if (isNameEmpty || isNameTemplate) {
      taskName = store.generateNextTaskName(targetProjectId, newCategory);
    }
  }

  // Categories list of target project
  let categories = $derived(
    store.projects.find(p => p.id === targetProjectId)?.categories || ['Basics', 'Intermediate', 'Advanced']
  );

  function handleSave(e) {
    e.preventDefault();
    if (!taskName.trim()) {
      alert(t('taskEditor.alertEnterName'));
      return;
    }
    if (!targetProjectId) {
      alert(t('taskEditor.alertSelectLesson'));
      return;
    }

    if (isEditMode) {
      store.updateTask(targetProjectId, store.editingTask.id, {
        name: taskName.trim(),
        instructions: instructions.trim(),
        solution: solution.trim(),
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
        instructions.trim(),
        solution.trim(),
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

  async function handleFileSelect(e: any, type: string) {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files || []) as File[];
    if (!files.length) return;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        let mediaId = '';
        try {
          mediaId = await saveMediaToDb(dataUrl);
        } catch (e) {
          console.error('Failed to save media file:', e);
          mediaId = '';
        }
        const fileData = {
          name: file.name,
          dataUrl,
          mediaId: mediaId || undefined
        };
        if (type === 'instruction') {
          instructionFiles = [...instructionFiles, fileData];
        } else {
          solutionFiles = [...solutionFiles, fileData];
        }
      };
      reader.readAsDataURL(file);
    }
    target.value = '';
  }

  // Preview modal states & handlers
  let previewFile = $state<{ name: string; dataUrl: string } | null>(null);
  let previewIsAudio = $state(false);
  let modalZoom = $state(1);
  let modalPan = $state({ x: 0, y: 0 });
  let modalActivePointers = new Map<number, PointerEvent>();
  let isModalPinching = $state(false);
  let modalPinchInitDist = 0;
  let modalPinchInitZoom = 1;
  let modalPinchInitMid = { x: 0, y: 0 };
  let modalPinchInitPan = { x: 0, y: 0 };
  let isModalPanning = $state(false);
  let modalPanId = -1;
  let modalPanStart = { x: 0, y: 0 };
  let modalPanBase = { x: 0, y: 0 };

  function decodeBase64Text(dataUrl: string): string {
    if (!dataUrl) return '';
    try {
      const base64Data = dataUrl.split(',')[1];
      return decodeURIComponent(escape(atob(base64Data)));
    } catch (e) {
      console.error('Failed to decode text document', e);
      return t('taskEditor.errorDecode');
    }
  }

  async function openPreview(file: { name: string; dataUrl?: string; mediaId?: string }) {
    let dataUrl = file.dataUrl || '';
    if (!dataUrl && file.mediaId) {
      try {
        dataUrl = await getMediaDataUrl(file.mediaId);
      } catch (_) {}
    }
    previewFile = { name: file.name, dataUrl };
    previewIsAudio = isAudioFile(file.name);
    modalZoom = 1;
    modalPan = { x: 0, y: 0 };
    modalActivePointers.clear();
    isModalPinching = false;
    isModalPanning = false;
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

  function handleModalPointerDown(e: PointerEvent) {
    modalActivePointers.set(e.pointerId, e);

    if (modalActivePointers.size >= 2) {
      const pts = Array.from(modalActivePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      modalPinchInitDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      modalPinchInitZoom = modalZoom;
      modalPinchInitMid = {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2
      };
      modalPinchInitPan = { ...modalPan };
      isModalPinching = true;
      isModalPanning = false;
      e.preventDefault();
    } else if (modalActivePointers.size === 1 && modalZoom > 1) {
      isModalPanning = true;
      modalPanId = e.pointerId;
      modalPanStart = { x: e.clientX, y: e.clientY };
      modalPanBase = { ...modalPan };
      e.preventDefault();
    }
  }

  function handleModalPointerMove(e: PointerEvent) {
    if (e.buttons === 0) {
      modalActivePointers.clear();
      isModalPinching = false;
      isModalPanning = false;
      return;
    }

    modalActivePointers.set(e.pointerId, e);

    if (isModalPinching && modalActivePointers.size >= 2) {
      const pts = Array.from(modalActivePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const currentDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const currentMidpoint = {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2
      };

      if (modalPinchInitDist > 0) {
        const factor = currentDistance / modalPinchInitDist;
        const newZoom = Math.max(0.5, Math.min(8, modalPinchInitZoom * factor));

        const body = e.currentTarget as HTMLElement;
        const rect = body.getBoundingClientRect();
        const worldX = (modalPinchInitMid.x - rect.left - modalPinchInitPan.x) / modalPinchInitZoom;
        const worldY = (modalPinchInitMid.y - rect.top - modalPinchInitPan.y) / modalPinchInitZoom;
        const newPanX = (currentMidpoint.x - rect.left) - worldX * newZoom;
        const newPanY = (currentMidpoint.y - rect.top) - worldY * newZoom;

        modalZoom = newZoom;
        if (newZoom === 1) {
          modalPan = { x: 0, y: 0 };
        } else {
          modalPan = { x: newPanX, y: newPanY };
        }
      }
      e.preventDefault();
    } else if (isModalPanning && modalActivePointers.size === 1 && modalZoom > 1) {
      const dx = e.clientX - modalPanStart.x;
      const dy = e.clientY - modalPanStart.y;
      modalPan = {
        x: modalPanBase.x + dx,
        y: modalPanBase.y + dy
      };
      e.preventDefault();
    }
  }

  function handleModalPointerUp(e: PointerEvent) {
    modalActivePointers.delete(e.pointerId);

    if (modalActivePointers.size === 0) {
      isModalPinching = false;
      isModalPanning = false;
    } else if (isModalPinching && modalActivePointers.size >= 2) {
      const pts = Array.from(modalActivePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      modalPinchInitDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      modalPinchInitZoom = modalZoom;
      modalPinchInitMid = {
        x: (p1.clientX + p2.clientX) / 2,
        y: (p1.clientY + p2.clientY) / 2
      };
      modalPinchInitPan = { ...modalPan };
    } else if (isModalPinching && modalActivePointers.size === 1 && modalZoom > 1) {
      isModalPinching = false;
      isModalPanning = true;
      const remaining = Array.from(modalActivePointers.values())[0];
      modalPanId = remaining.pointerId;
      modalPanStart = { x: remaining.clientX, y: remaining.clientY };
      modalPanBase = { ...modalPan };
    } else if (modalActivePointers.size === 1 && modalZoom > 1) {
      isModalPanning = true;
      const remaining = Array.from(modalActivePointers.values())[0];
      modalPanId = remaining.pointerId;
      modalPanStart = { x: remaining.clientX, y: remaining.clientY };
      modalPanBase = { ...modalPan };
    }
  }

  // Paste from clipboard logic
  async function handlePasteFromClipboard(type: 'instruction' | 'solution') {
    try {
      const clipboardItems = await navigator.clipboard.read();
      let addedAny = false;

      for (const item of clipboardItems) {
        // Check for images
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] || 'png';
          const base64Data = await blobToBase64(blob);
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data); } catch (_) {}
          const newFile = {
            name: `clipboard_image_${Date.now()}.${ext}`,
            dataUrl: base64Data,
            mediaId: mediaId || undefined
          };
          if (type === 'instruction') {
            instructionFiles = [...instructionFiles, newFile];
          } else {
            solutionFiles = [...solutionFiles, newFile];
          }
          addedAny = true;
          continue;
        }

        // Check for text
        const textType = item.types.find(t => t === 'text/plain' || t === 'text/html');
        if (textType) {
          const blob = await item.getType(textType);
          const text = await blob.text();
          const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
          const newFile = {
            name: `clipboard_text_${Date.now()}.txt`,
            dataUrl: base64Data
          };
          if (type === 'instruction') {
            instructionFiles = [...instructionFiles, newFile];
          } else {
            solutionFiles = [...solutionFiles, newFile];
          }
          addedAny = true;
        }
      }

      if (addedAny) {
        store.showNotification(t('taskEditor.pasteSuccess'), 'success');
      } else {
        store.showNotification(t('taskEditor.pasteErrorNoMedia'), 'error');
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      // Fallback to text reading if full read is blocked/unsupported
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
          const newFile = {
            name: `clipboard_text_${Date.now()}.txt`,
            dataUrl: base64Data
          };
          if (type === 'instruction') {
            instructionFiles = [...instructionFiles, newFile];
          } else {
            solutionFiles = [...solutionFiles, newFile];
          }
          store.showNotification(t('taskEditor.pasteTextSuccess'), 'success');
        } else {
          store.showNotification(t('taskEditor.pasteErrorEmpty'), 'error');
        }
      } catch (fallbackErr) {
        console.error('Fallback readText also failed:', fallbackErr);
        store.showNotification(t('taskEditor.pasteErrorPermission'), 'error');
      }
    }
  }

  function isAudioFile(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'].includes(ext);
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Filesystem drag-and-drop onto upload areas
  let isDragOverInstruction = $state(false);
  let isDragOverSolution = $state(false);

  // Pointer-based media drag state
  let draggedFileIndex = $state<number | null>(null);
  let draggedFileType = $state<'instruction' | 'solution' | null>(null);
  let hoveredFileIndex = $state<number | null>(null);
  let isMediaDragActive = $state(false);
  
  let mediaDragGhostEl: HTMLElement | null = null;
  let mediaDragPointerStartX = 0;
  let mediaDragPointerStartY = 0;
  let mediaDragGhostOffsetX = 0;
  let mediaDragGhostOffsetY = 0;

  function handleFilePointerDown(e: PointerEvent, index: number, type: 'instruction' | 'solution') {
    if (e.button !== 0 && e.button !== -1) return;
    const target = e.currentTarget as HTMLElement;
    
    // Ignore if close/remove button is clicked or if preview is clicked (but allow drag-handle inside preview)
    if ((e.target as HTMLElement).closest('.remove-file-btn') || 
        ((e.target as HTMLElement).closest('.preview-file-click') && !(e.target as HTMLElement).closest('.drag-handle'))) return;

    mediaDragPointerStartX = e.clientX;
    mediaDragPointerStartY = e.clientY;

    try { target.setPointerCapture(e.pointerId); } catch (_) {}

    function onMove(me: PointerEvent) {
      const dx = me.clientX - mediaDragPointerStartX;
      const dy = me.clientY - mediaDragPointerStartY;

      if (!isMediaDragActive && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        isMediaDragActive = true;
        draggedFileIndex = index;
        draggedFileType = type;

        const ghost = target.cloneNode(true) as HTMLElement;
        const rect = target.getBoundingClientRect();
        ghost.style.cssText = `
          position: fixed;
          pointer-events: none;
          z-index: 9999;
          width: ${rect.width}px;
          opacity: 0.85;
          left: ${rect.left}px;
          top: ${rect.top}px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          border-radius: 0.5rem;
          transform: scale(1.02);
          transition: none;
        `;
        mediaDragGhostOffsetX = me.clientX - rect.left;
        mediaDragGhostOffsetY = me.clientY - rect.top;
        document.body.appendChild(ghost);
        mediaDragGhostEl = ghost;
      }

      if (!isMediaDragActive) return;

      if (mediaDragGhostEl) {
        mediaDragGhostEl.style.left = `${me.clientX - mediaDragGhostOffsetX}px`;
        mediaDragGhostEl.style.top  = `${me.clientY - mediaDragGhostOffsetY}px`;
      }

      if (mediaDragGhostEl) mediaDragGhostEl.style.display = 'none';
      const el = document.elementFromPoint(me.clientX, me.clientY);
      if (mediaDragGhostEl) mediaDragGhostEl.style.display = '';

      const fileRow = el?.closest('[data-file-index]') as HTMLElement | null;
      if (fileRow && fileRow.dataset.fileType === type) {
        hoveredFileIndex = parseInt(fileRow.dataset.fileIndex || '0', 10);
      } else {
        hoveredFileIndex = null;
      }
    }

    function onUp(ue: PointerEvent) {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      try { target.releasePointerCapture(ue.pointerId); } catch (_) {}

      if (mediaDragGhostEl) {
        mediaDragGhostEl.remove();
        mediaDragGhostEl = null;
      }

      if (isMediaDragActive && draggedFileIndex !== null && hoveredFileIndex !== null && draggedFileIndex !== hoveredFileIndex) {
        reorderFiles(type, draggedFileIndex, hoveredFileIndex);
      }

      isMediaDragActive = false;
      draggedFileIndex = null;
      draggedFileType = null;
      hoveredFileIndex = null;
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  function reorderFiles(type: 'instruction' | 'solution', from: number, to: number) {
    if (type === 'instruction') {
      const list = [...instructionFiles];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      instructionFiles = list;
    } else {
      const list = [...solutionFiles];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      solutionFiles = list;
    }
  }

  function handleDragOver(type: 'instruction' | 'solution', e: DragEvent) {
    e.preventDefault();
    if (type === 'instruction') {
      isDragOverInstruction = true;
    } else {
      isDragOverSolution = true;
    }
  }

  function handleDragLeave(type: 'instruction' | 'solution') {
    if (type === 'instruction') {
      isDragOverInstruction = false;
    } else {
      isDragOverSolution = false;
    }
  }

  function handleFileDrop(type: 'instruction' | 'solution', e: DragEvent) {
    e.preventDefault();
    if (type === 'instruction') {
      isDragOverInstruction = false;
    } else {
      isDragOverSolution = false;
    }
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    for (const file of fileList) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        let mediaId = '';
        try {
          mediaId = await saveMediaToDb(dataUrl);
        } catch (e) {
          console.error('Failed to save media file:', e);
          mediaId = '';
        }
        const fileData = {
          name: file.name,
          dataUrl,
          mediaId: mediaId || undefined
        };
        if (type === 'instruction') {
          instructionFiles = [...instructionFiles, fileData];
        } else {
          solutionFiles = [...solutionFiles, fileData];
        }
      };
      reader.readAsDataURL(file);
    }
  }
</script>

<main class="grow overflow-y-auto bg-surface p-8 custom-scrollbar h-full">
  <div class="max-w-3xl mx-auto flex flex-col gap-6">
    <div class="flex items-center gap-4 -ml-2 border-b border-outline-variant pb-4 mb-2">
      <button 
        onclick={handleCancel}
        class="material-symbols-outlined text-primary hover:bg-surface-container-high transition-colors p-2 rounded-full focus:outline-none cursor-pointer"
        title={t('common.cancel')}
      >
        arrow_back
      </button>
      <div class="flex flex-col gap-0.5">
        <h1 class="text-xl font-bold text-on-surface leading-tight">{isEditMode ? t('taskEditor.editTitle') : t('taskEditor.createTitle')}</h1>
        <p class="text-xs text-on-surface-variant">
          {isEditMode ? t('taskEditor.editSubtitle') : t('taskEditor.createSubtitle')}
        </p>
      </div>
    </div>

    <form onsubmit={handleSave} class="flex flex-col gap-8 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm">
      


      <!-- Task Name -->
      <div class="flex flex-col gap-2 group">
        <label class="text-sm font-semibold text-on-surface group-focus-within:text-primary transition-colors" for="taskName">{t('taskEditor.nameLabel')}</label>
        <input 
          id="taskName" 
          type="text" 
          bind:this={nameInput}
          bind:value={taskName}
          placeholder={t('taskEditor.namePlaceholder')}
          class="w-full bg-transparent border-0 border-b border-outline-variant px-0 py-2.5 text-base text-on-surface placeholder:text-outline focus:ring-0 focus:border-primary focus:border-b-2 transition-all focus:outline-none"
          required
        />
      </div>

      <!-- Category Level -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-on-surface" for="category">{t('taskEditor.categoryLabel')}</label>
        <select 
          id="category"
          value={category}
          onchange={(e) => {
            const oldCategory = category;
            category = e.currentTarget.value;
            if (category !== oldCategory) {
              handleCategoryChange(category);
            }
          }}
          class="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
        >
          {#each categories as cat}
            <option value={cat} class="bg-surface-container-low text-on-surface">{cat}</option>
          {/each}
        </select>
      </div>

      <!-- Instructions -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-on-surface" for="instructions">{t('taskEditor.instructionsLabel')}</label>
        <textarea 
          id="instructions" 
          bind:value={instructions}
          placeholder={t('taskEditor.instructionsPlaceholder')} 
          rows="5"
          class="w-full bg-transparent border border-outline-variant rounded-lg p-4 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:border-primary resize-y shadow-sm focus:outline-none"
        ></textarea>
      </div>

      <!-- Warning Note about API context size and cost -->
      <div class="flex gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-800 dark:text-amber-300">
        <span class="material-symbols-outlined text-[20px] shrink-0 mt-0.5">warning</span>
        <div class="flex flex-col gap-0.5">
          <p class="text-xs font-semibold">{t('taskEditor.apiCostWarningTitle')}</p>
          <p class="text-[11px] leading-normal opacity-90">{t('taskEditor.apiCostWarningDesc')}</p>
        </div>
      </div>

      <!-- Instruction Material Upload -->
      <div class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-on-surface">{t('taskEditor.instructionMaterial')}</span>
        <input 
          type="file" 
          id="instructionFileInput" 
          accept="image/*,application/pdf,text/plain,.md,audio/*"
          class="hidden" 
          multiple
          onchange={(e) => handleFileSelect(e, 'instruction')}
        />
        <button 
          type="button"
          onclick={() => triggerUpload('instruction')}
          ondragover={(e) => handleDragOver('instruction', e)}
          ondragleave={() => handleDragLeave('instruction')}
          ondrop={(e) => handleFileDrop('instruction', e)}
          class="w-full border-2 border-dashed border-outline-variant rounded-xl bg-surface-container-low p-6 flex flex-col items-center justify-center gap-2 hover:bg-surface-container hover:border-primary/50 transition-all group relative overflow-hidden focus:outline-none cursor-pointer {isDragOverInstruction ? 'border-primary bg-primary/5' : ''}"
        >
          <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
            <span class="material-symbols-outlined text-[24px]">upload_file</span>
          </div>
          <div class="text-center">
            <p class="text-sm font-semibold text-on-surface">
              {instructionFiles.length > 0 ? t('taskEditor.filesSelected', { count: instructionFiles.length }) : t('taskEditor.uploadPrompt')}
            </p>
            <p class="text-xs text-on-surface-variant mt-1">{t('taskEditor.uploadSupportInfo')}</p>
          </div>
        </button>

        <!-- Paste from Clipboard button -->
        <button
          type="button"
          onclick={() => handlePasteFromClipboard('instruction')}
          class="w-full flex items-center justify-center gap-2 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all cursor-pointer focus:outline-none"
        >
          <span class="material-symbols-outlined text-[16px]">content_paste</span>
          {t('taskEditor.pasteClipboard')}
        </button>

        {#if instructionFiles.length > 0}
          <div class="mt-2 flex flex-col gap-1.5">
            {#each instructionFiles as file, index}
              {#if isMediaDragActive && draggedFileType === 'instruction' && hoveredFileIndex === index}
                <div class="h-1 bg-primary rounded my-1 animate-pulse"></div>
              {/if}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div 
                data-file-index={index}
                data-file-type="instruction"
                onpointerdown={(e) => handleFilePointerDown(e, index, 'instruction')}
                class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm touch-none select-none {isMediaDragActive && draggedFileType === 'instruction' && draggedFileIndex === index ? 'opacity-40 scale-95' : ''}"
              >
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  onclick={() => openPreview(file)}
                  class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow preview-file-click"
                  title={t('taskEditor.clickToPreview')}
                >
                  <span class="material-symbols-outlined text-[20px] text-outline cursor-grab active:cursor-grabbing hover:text-primary select-none drag-handle">
                    drag_indicator
                  </span>
                  <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                    {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') ? 'description' : (isAudioFile(file.name) ? 'audio_file' : 'image'))}
                  </span>
                  <span class="text-xs text-on-surface hover:text-primary truncate font-medium">{file.name}</span>
                </div>
                <button 
                  type="button"
                  onclick={() => {
                    instructionFiles = instructionFiles.filter((_, i) => i !== index);
                  }}
                  class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors shrink-0 remove-file-btn"
                  title={t('taskEditor.remove')}
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
        <label class="text-sm font-semibold text-on-surface" for="solution">{t('taskEditor.solutionLabel')}</label>
        <textarea 
          id="solution" 
          bind:value={solution}
          placeholder={t('taskEditor.solutionPlaceholder')} 
          rows="4"
          class="w-full bg-transparent border border-outline-variant rounded-lg p-4 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:border-primary resize-y shadow-sm focus:outline-none"
        ></textarea>
      </div>

      <!-- Expected Solution Material Upload -->
      <div class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-on-surface">{t('taskEditor.solutionMaterial')}</span>
        <input 
          type="file" 
          id="solutionFileInput" 
          accept="image/*,application/pdf,text/plain,.md,audio/*"
          class="hidden" 
          multiple
          onchange={(e) => handleFileSelect(e, 'solution')}
        />
        <button 
          type="button"
          onclick={() => triggerUpload('solution')}
          ondragover={(e) => handleDragOver('solution', e)}
          ondragleave={() => handleDragLeave('solution')}
          ondrop={(e) => handleFileDrop('solution', e)}
          class="w-full border-2 border-dashed border-outline-variant rounded-xl bg-surface-container-low p-6 flex flex-col items-center justify-center gap-2 hover:bg-surface-container hover:border-primary/50 transition-all group relative overflow-hidden focus:outline-none cursor-pointer {isDragOverSolution ? 'border-primary bg-primary/5' : ''}"
        >
          <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
            <span class="material-symbols-outlined text-[24px]">upload_file</span>
          </div>
          <div class="text-center">
            <p class="text-sm font-semibold text-on-surface">
              {solutionFiles.length > 0 ? t('taskEditor.filesSelected', { count: solutionFiles.length }) : t('taskEditor.uploadPromptSolution')}
            </p>
            <p class="text-xs text-on-surface-variant mt-1">{t('taskEditor.uploadSupportInfo')}</p>
          </div>
        </button>

        <!-- Paste from Clipboard button -->
        <button
          type="button"
          onclick={() => handlePasteFromClipboard('solution')}
          class="w-full flex items-center justify-center gap-2 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all cursor-pointer focus:outline-none"
        >
          <span class="material-symbols-outlined text-[16px]">content_paste</span>
          {t('taskEditor.pasteClipboard')}
        </button>

        {#if solutionFiles.length > 0}
          <div class="mt-2 flex flex-col gap-1.5">
            {#each solutionFiles as file, index}
              {#if isMediaDragActive && draggedFileType === 'solution' && hoveredFileIndex === index}
                <div class="h-1 bg-primary rounded my-1 animate-pulse"></div>
              {/if}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div 
                data-file-index={index}
                data-file-type="solution"
                onpointerdown={(e) => handleFilePointerDown(e, index, 'solution')}
                class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm touch-none select-none {isMediaDragActive && draggedFileType === 'solution' && draggedFileIndex === index ? 'opacity-40 scale-95' : ''}"
              >
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  onclick={() => openPreview(file)}
                  class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow preview-file-click"
                  title={t('taskEditor.clickToPreview')}
                >
                  <span class="material-symbols-outlined text-[20px] text-outline cursor-grab active:cursor-grabbing hover:text-primary select-none drag-handle">
                    drag_indicator
                  </span>
                  <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                    {file.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') ? 'description' : (isAudioFile(file.name) ? 'audio_file' : 'image'))}
                  </span>
                  <span class="text-xs text-on-surface hover:text-primary truncate font-medium">{file.name}</span>
                </div>
                <button 
                  type="button"
                  onclick={() => {
                    solutionFiles = solutionFiles.filter((_, i) => i !== index);
                  }}
                  class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors shrink-0 remove-file-btn"
                  title={t('taskEditor.remove')}
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
          {t('common.cancel')}
        </button>
        <button 
          type="submit" 
          class="px-6 py-2.5 bg-primary text-on-primary font-semibold text-sm rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-[0_4px_14px_rgba(0,64,224,0.15)] flex items-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[18px]">save</span>
          {isEditMode ? t('taskEditor.saveChanges') : t('taskEditor.saveTask')}
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
            {previewIsAudio ? 'audio_file' : (previewFile.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : (previewFile.name.toLowerCase().endsWith('.txt') || previewFile.name.toLowerCase().endsWith('.md') ? 'description' : 'image'))}
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
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div 
        onwheel={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio ? handleModalWheel : null}
        onpointerdown={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio ? handleModalPointerDown : null}
        onpointermove={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio ? handleModalPointerMove : null}
        onpointerup={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio ? handleModalPointerUp : null}
        class="grow bg-surface-container-lowest p-6 flex justify-center items-center min-h-0 select-text {previewFile.name.toLowerCase().endsWith('.pdf') || previewFile.name.toLowerCase().endsWith('.txt') || previewFile.name.toLowerCase().endsWith('.md') || previewIsAudio ? 'overflow-auto' : 'overflow-hidden relative'}"
        style={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio ? `cursor: ${modalZoom > 1 ? (isModalPanning ? 'grabbing' : 'grab') : 'zoom-in'}; touch-action: none;` : ''}
      >
        {#if previewIsAudio}
          <div class="w-full max-w-md">
            <AudioPlayer dataUrl={previewFile.dataUrl} />
          </div>
        {:else if previewFile.name.toLowerCase().endsWith('.pdf')}
          <iframe 
            src={previewFile.dataUrl} 
            title={previewFile.name} 
            class="w-full h-full border-0 rounded-lg shadow-sm"
          ></iframe>
        {:else if previewFile.name.toLowerCase().endsWith('.md')}
          <div class="w-full h-full p-6 overflow-auto bg-surface-container-high rounded-xl text-sm text-on-surface select-text leading-relaxed border border-outline-variant text-left wrap-break-word font-sans">
            {@html parseMarkdown(decodeBase64Text(previewFile.dataUrl))}
          </div>
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
