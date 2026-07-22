<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../../services/i18n';
  import { parseMarkdown } from '../../utils/markdown';
  import { saveMediaToDb, isImageFile, isAudioFile, isVideoFile, getFileIcon } from '../../db/media';
  import type { MultipleChoiceTask, MultipleChoiceOption, MediaFile } from '../../state/types';

  let {
    multipleChoiceTasks = $bindable([]),
    fontSize = 13,
    onOpenPreview = () => {}
  } = $props();

  // Active preview states per question (mapping question.id -> boolean)
  let showQuestionPreview = $state<Record<string, boolean>>({});
  let showOptionPreview = $state<Record<string, boolean>>({});

  // Collapsible MC Editor state
  let isEditorExpanded = $state(true);

  // Collapsible media panels
  let questionMediaExpanded = $state<Record<string, boolean>>({});
  let optionMediaExpanded = $state<Record<string, boolean>>({});

  // Inline Rename State
  let editingFileIndex = $state<number | null>(null);
  let editingFileType = $state<'question' | 'option' | null>(null);
  let editingQuestionIndex = $state<number>(-1);
  let editingOptionIndex = $state<number>(-1);
  let editingFileNameValue = $state('');
  let renameInputEl = $state<HTMLInputElement | null>(null);

  // Drag and Drop States matching TaskEditor.svelte exactly
  let isMediaDragActive = $state(false);
  let draggedFileIndex = $state<number | null>(null);
  let draggedFileType = $state<'question_media' | 'option_media' | null>(null);
  let draggedQuestionIndex = $state<number>(-1);
  let draggedOptionIndex = $state<number>(-1);
  let hoveredFileIndex = $state<number | null>(null);

  let mediaDragPointerStartX = 0;
  let mediaDragPointerStartY = 0;
  let mediaDragGhostOffsetX = 0;
  let mediaDragGhostOffsetY = 0;
  let mediaDragGhostEl: HTMLElement | null = null;

  function autoResize(node: HTMLTextAreaElement, _val: any) {
    const update = () => {
      node.style.height = 'auto';
      node.style.overflowY = 'hidden';
      const style = window.getComputedStyle(node);
      const isBorderBox = style.boxSizing === 'border-box';
      let height = node.scrollHeight;
      if (isBorderBox) {
        const borderTop = parseFloat(style.borderTopWidth) || 0;
        const borderBottom = parseFloat(style.borderBottomWidth) || 0;
        height += borderTop + borderBottom;
      }
      node.style.height = `${height}px`;
    };
    const timer = setTimeout(update, 0);
    node.addEventListener('input', update);
    return {
      update() {
        update();
      },
      destroy() {
        clearTimeout(timer);
        node.removeEventListener('input', update);
      }
    };
  }

  async function addQuestion() {
    isEditorExpanded = true;
    const qId = 'mc-q-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const newQuestion: MultipleChoiceTask = {
      id: qId,
      question: '',
      questionMedia: [],
      options: [
        {
          id: 'mc-o-' + Date.now() + '-1',
          text: '',
          media: [],
          isCorrect: false
        },
        {
          id: 'mc-o-' + Date.now() + '-2',
          text: '',
          media: [],
          isCorrect: false
        }
      ]
    };
    multipleChoiceTasks = [...multipleChoiceTasks, newQuestion];
    await tick();
    const el = document.querySelector(`[data-mc-question-id="${qId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function deleteQuestion(qIndex: number) {
    multipleChoiceTasks = multipleChoiceTasks.filter((_, i) => i !== qIndex);
  }

  function moveQuestion(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === multipleChoiceTasks.length - 1) return;

    const list = [...multipleChoiceTasks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    multipleChoiceTasks = list;
  }

  function addOption(qIndex: number) {
    const list = [...multipleChoiceTasks];
    const optId = 'mc-o-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    list[qIndex].options = [
      ...list[qIndex].options,
      {
        id: optId,
        text: '',
        media: [],
        isCorrect: false
      }
    ];
    multipleChoiceTasks = list;
  }

  function deleteOption(qIndex: number, oIndex: number) {
    const list = [...multipleChoiceTasks];
    list[qIndex].options = list[qIndex].options.filter((_, i) => i !== oIndex);
    multipleChoiceTasks = list;
  }

  async function handleQuestionMediaUpload(e: Event, qIndex: number) {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    if (!files.length) return;

    const list = [...multipleChoiceTasks];
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        let mediaId = '';
        try {
          mediaId = await saveMediaToDb(dataUrl, file.name);
        } catch (err) {
          console.error('Failed to save media:', err);
        }
        const mediaFile: MediaFile = {
          name: file.name,
          dataUrl,
          mediaId: mediaId || undefined
        };
        list[qIndex].questionMedia = [...list[qIndex].questionMedia, mediaFile];
        multipleChoiceTasks = list;
      };
      reader.readAsDataURL(file);
    }
    target.value = '';
  }

  async function handleOptionMediaUpload(e: Event, qIndex: number, oIndex: number) {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    if (!files.length) return;

    const list = [...multipleChoiceTasks];
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        let mediaId = '';
        try {
          mediaId = await saveMediaToDb(dataUrl, file.name);
        } catch (err) {
          console.error('Failed to save media:', err);
        }
        const mediaFile: MediaFile = {
          name: file.name,
          dataUrl,
          mediaId: mediaId || undefined
        };
        list[qIndex].options[oIndex].media = [...list[qIndex].options[oIndex].media, mediaFile];
        multipleChoiceTasks = list;
      };
      reader.readAsDataURL(file);
    }
    target.value = '';
  }

  function removeQuestionMedia(qIndex: number, mediaIndex: number) {
    const list = [...multipleChoiceTasks];
    list[qIndex].questionMedia = list[qIndex].questionMedia.filter((_, i) => i !== mediaIndex);
    multipleChoiceTasks = list;
  }

  function removeOptionMedia(qIndex: number, oIndex: number, mediaIndex: number) {
    const list = [...multipleChoiceTasks];
    list[qIndex].options[oIndex].media = list[qIndex].options[oIndex].media.filter((_, i) => i !== mediaIndex);
    multipleChoiceTasks = list;
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function pasteQuestionMediaFromClipboard(qIndex: number) {
    try {
      const clipboardItems = await navigator.clipboard.read();
      let addedAny = false;
      const list = [...multipleChoiceTasks];

      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] || 'png';
          const base64Data = await blobToBase64(blob);
          const name = `clipboard_mc_q_${Date.now()}.${ext}`;
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data, name); } catch (_) {}
          
          list[qIndex].questionMedia = [
            ...list[qIndex].questionMedia,
            { name, dataUrl: base64Data, mediaId: mediaId || undefined }
          ];
          addedAny = true;
          continue;
        }

        const textType = item.types.find(t => t === 'text/plain');
        if (textType) {
          const blob = await item.getType(textType);
          const text = await blob.text();
          const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
          const name = `clipboard_mc_q_${Date.now()}.txt`;
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data, name); } catch (_) {}
          
          list[qIndex].questionMedia = [
            ...list[qIndex].questionMedia,
            { name, dataUrl: base64Data, mediaId: mediaId || undefined }
          ];
          addedAny = true;
        }
      }
      if (addedAny) {
        multipleChoiceTasks = list;
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
          const name = `clipboard_mc_q_${Date.now()}.txt`;
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data, name); } catch (_) {}
          const list = [...multipleChoiceTasks];
          list[qIndex].questionMedia = [
            ...list[qIndex].questionMedia,
            { name, dataUrl: base64Data, mediaId: mediaId || undefined }
          ];
          multipleChoiceTasks = list;
        }
      } catch (_) {}
    }
  }

  async function pasteOptionMediaFromClipboard(qIndex: number, oIndex: number) {
    try {
      const clipboardItems = await navigator.clipboard.read();
      let addedAny = false;
      const list = [...multipleChoiceTasks];

      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] || 'png';
          const base64Data = await blobToBase64(blob);
          const name = `clipboard_mc_o_${Date.now()}.${ext}`;
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data, name); } catch (_) {}
          
          list[qIndex].options[oIndex].media = [
            ...(list[qIndex].options[oIndex].media || []),
            { name, dataUrl: base64Data, mediaId: mediaId || undefined }
          ];
          addedAny = true;
          continue;
        }

        const textType = item.types.find(t => t === 'text/plain');
        if (textType) {
          const blob = await item.getType(textType);
          const text = await blob.text();
          const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
          const name = `clipboard_mc_o_${Date.now()}.txt`;
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data, name); } catch (_) {}
          
          list[qIndex].options[oIndex].media = [
            ...(list[qIndex].options[oIndex].media || []),
            { name, dataUrl: base64Data, mediaId: mediaId || undefined }
          ];
          addedAny = true;
        }
      }
      if (addedAny) {
        multipleChoiceTasks = list;
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
          const name = `clipboard_mc_o_${Date.now()}.txt`;
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data, name); } catch (_) {}
          const list = [...multipleChoiceTasks];
          list[qIndex].options[oIndex].media = [
            ...(list[qIndex].options[oIndex].media || []),
            { name, dataUrl: base64Data, mediaId: mediaId || undefined }
          ];
          multipleChoiceTasks = list;
        }
      } catch (_) {}
    }
  }

  function getBaseName(filename: string): string {
    if (!filename) return '';
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) return filename;
    return filename.substring(0, lastDotIndex);
  }

  function startRenameFile(qIndex: number, fileIndex: number, type: 'question' | 'option', oIndex: number = -1) {
    editingQuestionIndex = qIndex;
    editingOptionIndex = oIndex;
    editingFileIndex = fileIndex;
    editingFileType = type;
    
    const file = type === 'question' 
      ? multipleChoiceTasks[qIndex].questionMedia[fileIndex] 
      : multipleChoiceTasks[qIndex].options[oIndex].media[fileIndex];
    
    editingFileNameValue = getBaseName(file.name);
    setTimeout(() => {
      if (renameInputEl) {
        renameInputEl.focus();
        renameInputEl.select();
      }
    }, 50);
  }

  function saveInlineRename() {
    if (editingFileIndex === null || editingFileType === null) return;
    
    const name = editingFileNameValue.trim();
    if (!name) return cancelInlineRename();
    
    const list = [...multipleChoiceTasks];
    if (editingFileType === 'question') {
      const file = list[editingQuestionIndex].questionMedia[editingFileIndex];
      const ext = file.name.substring(file.name.lastIndexOf('.'));
      file.name = name + ext;
    } else {
      const file = list[editingQuestionIndex].options[editingOptionIndex].media[editingFileIndex];
      const ext = file.name.substring(file.name.lastIndexOf('.'));
      file.name = name + ext;
    }
    multipleChoiceTasks = list;
    
    editingFileIndex = null;
    editingFileType = null;
  }

  function cancelInlineRename() {
    editingFileIndex = null;
    editingFileType = null;
  }

  // Pointer drag and drop reordering handlers matching TaskEditor.svelte
  function handleFilePointerDown(
    e: PointerEvent,
    index: number,
    type: 'question_media' | 'option_media',
    qIndex: number,
    oIndex: number = -1
  ) {
    if (e.button !== 0 && e.button !== -1) return;
    const target = e.currentTarget as HTMLElement;

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
        draggedQuestionIndex = qIndex;
        draggedOptionIndex = oIndex;

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
        const rowQIndex = parseInt(fileRow.dataset.qIndex || '-1', 10);
        const rowOIndex = parseInt(fileRow.dataset.oIndex || '-1', 10);
        if (rowQIndex === qIndex && rowOIndex === oIndex) {
          hoveredFileIndex = parseInt(fileRow.dataset.fileIndex || '0', 10);
        } else {
          hoveredFileIndex = null;
        }
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
        reorderFiles(type, qIndex, oIndex, draggedFileIndex, hoveredFileIndex);
      }

      isMediaDragActive = false;
      draggedFileIndex = null;
      draggedFileType = null;
      draggedQuestionIndex = -1;
      draggedOptionIndex = -1;
      hoveredFileIndex = null;
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  function reorderFiles(type: 'question_media' | 'option_media', qIndex: number, oIndex: number, from: number, to: number) {
    const list = [...multipleChoiceTasks];
    if (type === 'question_media') {
      const mediaList = [...list[qIndex].questionMedia];
      const [moved] = mediaList.splice(from, 1);
      mediaList.splice(to, 0, moved);
      list[qIndex].questionMedia = mediaList;
    } else {
      const mediaList = [...list[qIndex].options[oIndex].media];
      const [moved] = mediaList.splice(from, 1);
      mediaList.splice(to, 0, moved);
      list[qIndex].options[oIndex].media = mediaList;
    }
    multipleChoiceTasks = list;
  }
</script>

<div class="flex flex-col gap-6 mt-4">
  <div class="sticky -top-4 z-20 flex justify-between items-center bg-surface-container-low/95 backdrop-blur-md p-4 rounded-xl border border-outline-variant shadow-sm transition-all mb-1">
    <div class="flex items-center gap-3">
      <button
        type="button"
        onclick={() => isEditorExpanded = !isEditorExpanded}
        class="p-1 hover:bg-surface-container rounded-lg transition-colors cursor-pointer border-0 bg-transparent flex items-center justify-center text-on-surface-variant focus:outline-none"
        title={isEditorExpanded ? (t('common.collapse') || 'Zuklappen') : (t('common.expand') || 'Aufklappen')}
      >
        <span class="material-symbols-outlined text-[24px] transition-transform duration-200" style="transform: rotate({isEditorExpanded ? '180' : '0'}deg)">
          expand_more
        </span>
      </button>

      <div class="flex flex-col gap-0.5">
        <h3 class="text-sm font-bold text-on-surface">{t('taskEditor.mc.title') || 'Multiple-Choice-Aufgaben'}</h3>
        <span class="text-xs text-on-surface-variant">
          {t('taskEditor.mc.subtitle') || 'Erstelle Aufgaben mit einer oder mehreren richtigen Antworten'}
        </span>
      </div>
    </div>

    <div class="flex items-center gap-2">
      {#if multipleChoiceTasks.length > 0}
        <span class="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          {multipleChoiceTasks.length}
        </span>
      {/if}
      <button
        type="button"
        onclick={addQuestion}
        class="flex items-center gap-1.5 px-4 py-2 bg-primary text-white hover:bg-primary-hover rounded-xl text-xs font-bold shadow-sm transition-colors border-0 cursor-pointer focus:outline-none"
      >
        <span class="material-symbols-outlined text-[16px]">add</span>
        <span>{t('taskEditor.mc.addQuestion') || 'Frage hinzufügen'}</span>
      </button>
    </div>
  </div>

  {#if isEditorExpanded}
    {#if multipleChoiceTasks.length === 0}
    <div class="flex flex-col items-center justify-center p-8 border-2 border-dashed border-outline-variant rounded-2xl bg-surface-container-lowest text-center">
      <span class="material-symbols-outlined text-on-surface-variant/40 text-[48px] mb-2">rule</span>
      <p class="text-sm font-semibold text-on-surface-variant">
        {t('taskEditor.mc.noQuestions') || 'Noch keine Multiple-Choice-Aufgaben hinzugefügt.'}
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-4">
      {#each multipleChoiceTasks as question, qIndex (question.id)}
        <div 
          data-mc-question-id={question.id}
          class="border border-outline-variant rounded-2xl bg-surface-container-lowest p-5 flex flex-col gap-4 relative shadow-sm transition-all hover:shadow-md"
        >
          
          <!-- Question Header Toolbar -->
          <div class="flex justify-between items-center border-b border-outline-variant/40 pb-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-primary px-2.5 py-1 bg-primary/10 rounded-full font-sans">
                {t('common.question') || 'Frage'} {qIndex + 1}
              </span>
              
              <!-- Reorder Buttons -->
              <div class="flex items-center gap-0.5 ml-1">
                <button
                  type="button"
                  onclick={() => moveQuestion(qIndex, 'up')}
                  disabled={qIndex === 0}
                  class="p-1 text-on-surface-variant hover:bg-surface-container rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer border-0 bg-transparent"
                  title={t('common.moveUp') || 'Nach oben'}
                >
                  <span class="material-symbols-outlined text-[16px]">keyboard_arrow_up</span>
                </button>
                <button
                  type="button"
                  onclick={() => moveQuestion(qIndex, 'down')}
                  disabled={qIndex === multipleChoiceTasks.length - 1}
                  class="p-1 text-on-surface-variant hover:bg-surface-container rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer border-0 bg-transparent"
                  title={t('common.moveDown') || 'Nach unten'}
                >
                  <span class="material-symbols-outlined text-[16px]">keyboard_arrow_down</span>
                </button>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <!-- Edit/Preview Toggle -->
              <button
                type="button"
                onclick={() => showQuestionPreview[question.id] = !showQuestionPreview[question.id]}
                class="text-[10px] font-bold px-3 py-1 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant flex items-center gap-1 border border-outline-variant/30 cursor-pointer focus:outline-none transition-colors"
              >
                <span class="w-1.5 h-1.5 rounded-full {showQuestionPreview[question.id] ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
                {showQuestionPreview[question.id] ? (t('taskEditor.mc.editMode') || 'Bearbeiten') : (t('taskEditor.mc.previewMode') || 'Vorschau')}
              </button>
              
              <!-- Delete Question -->
              <button
                type="button"
                onclick={() => deleteQuestion(qIndex)}
                class="text-error hover:bg-error/10 hover:text-error-hover p-1.5 rounded-lg flex items-center justify-center cursor-pointer transition-colors border-0 bg-transparent"
                title={t('taskEditor.mc.deleteQuestion') || 'Frage löschen'}
              >
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>

          <!-- Question Input / Preview -->
          <div class="flex flex-col gap-2">
            {#if showQuestionPreview[question.id]}
              <div 
                class="w-full border border-outline-variant/40 rounded-xl p-4 bg-surface-container-low/20 text-left leading-relaxed prose dark:prose-invert"
                style="font-size: {fontSize}px;"
              >
                {@html parseMarkdown(question.question || `*${t('taskEditor.mc.noQuestionText') || 'Keine Frage eingegeben'}*`)}
              </div>
            {:else}
              <textarea
                bind:value={question.question}
                use:autoResize={question.question}
                placeholder={t('taskEditor.mc.questionPlaceholder') || 'Gib hier deine Frage ein (Markdown und LaTeX unterstützt)...'}
                class="w-full bg-transparent border border-outline-variant rounded-xl p-4 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:border-primary resize-none overflow-hidden focus:outline-none"
              ></textarea>
            {/if}
          </div>

          <!-- Question Media Attachments -->
          <div class="flex flex-col gap-2.5 bg-surface-container-low/30 rounded-xl p-4 border border-outline-variant/30 font-sans">
            <div class="flex justify-between items-center w-full min-h-7">
              <button
                type="button"
                onclick={() => questionMediaExpanded[question.id] = !questionMediaExpanded[question.id]}
                class="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary cursor-pointer border-0 bg-transparent p-0 transition-colors focus:outline-none text-left"
              >
                <span class="material-symbols-outlined text-sm">attachment</span>
                <span>{t('taskEditor.mc.mediaTitle') || 'Medien für diese Frage'}</span>
                <span class="material-symbols-outlined text-base transition-transform duration-200" style="transform: rotate({questionMediaExpanded[question.id] ? '180' : '0'}deg)">
                  expand_more
                </span>
              </button>

              {#if questionMediaExpanded[question.id]}
                <button
                  type="button"
                  onclick={() => pasteQuestionMediaFromClipboard(qIndex)}
                  class="flex items-center gap-1 px-3 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 rounded-lg text-[10px] font-bold text-primary cursor-pointer transition-colors focus:outline-none"
                >
                  <span class="material-symbols-outlined text-[13px]">content_paste</span>
                  <span>{t('taskEditor.pasteClipboard') || 'Aus Zwischenablage einfügen'}</span>
                </button>
              {/if}
            </div>

            <!-- Click to Select Area (only if expanded) -->
            {#if questionMediaExpanded[question.id]}
              <label class="flex flex-col items-center justify-center border border-dashed border-outline-variant rounded-xl p-4 hover:bg-surface-container-high/40 transition-colors cursor-pointer text-center group bg-surface-container-lowest/50 select-none">
                <span class="material-symbols-outlined text-xl text-on-surface-variant group-hover:text-primary mb-1 transition-colors">cloud_upload</span>
                <span class="text-[10.5px] font-bold text-on-surface mb-0.5">{t('common.addFile') || 'Datei hinzufügen (Klicken)'}</span>
                <input 
                  type="file" 
                  multiple 
                  class="hidden" 
                  onchange={(e) => handleQuestionMediaUpload(e, qIndex)}
                />
              </label>
            {/if}

            {#if question.questionMedia.length > 0}
              <div class="flex flex-col gap-1.5 mt-2 w-full">
                {#each question.questionMedia as file, mIndex}
                  {#if isMediaDragActive && draggedFileType === 'question_media' && draggedQuestionIndex === qIndex && hoveredFileIndex === mIndex}
                    <div class="h-1 bg-primary rounded my-1 animate-pulse"></div>
                  {/if}
                  <div 
                    data-file-index={mIndex}
                    data-file-type="question_media"
                    data-q-index={qIndex}
                    onpointerdown={(e) => handleFilePointerDown(e, mIndex, 'question_media', qIndex)}
                    class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm touch-none select-none w-full font-sans {isMediaDragActive && draggedFileType === 'question_media' && draggedQuestionIndex === qIndex && draggedFileIndex === mIndex ? 'opacity-40 scale-95' : ''}"
                  >
                    <div 
                      onclick={() => {
                        if (editingFileIndex !== mIndex || editingFileType !== 'question' || editingQuestionIndex !== qIndex) {
                          onOpenPreview(file);
                        }
                      }}
                      class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow preview-file-click"
                      title={t('taskEditor.clickToPreview') || 'Klicken für Vorschau'}
                      role="button"
                      tabindex="0"
                      onkeydown={(e) => { if (e.key === 'Enter') onOpenPreview(file); }}
                    >
                      <span class="material-symbols-outlined text-[20px] text-outline cursor-grab active:cursor-grabbing hover:text-primary select-none drag-handle">
                        drag_indicator
                      </span>
                      <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                        {getFileIcon(file.name)}
                      </span>
                      {#if editingFileIndex === mIndex && editingFileType === 'question' && editingQuestionIndex === qIndex}
                        <input
                          bind:this={renameInputEl}
                          type="text"
                          bind:value={editingFileNameValue}
                          onclick={(e) => e.stopPropagation()}
                          onkeydown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              saveInlineRename();
                            } else if (e.key === 'Escape') {
                              cancelInlineRename();
                            }
                          }}
                          onblur={saveInlineRename}
                          class="bg-surface border border-primary rounded px-2 py-0.5 text-xs text-on-surface focus:outline-none w-full font-medium font-sans"
                        />
                      {:else}
                        <span class="text-xs text-on-surface hover:text-primary truncate font-medium">{getBaseName(file.name)}</span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-1 shrink-0" onclick={e => e.stopPropagation()}>
                      <button 
                        type="button"
                        onclick={() => startRenameFile(qIndex, mIndex, 'question')}
                        class="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors"
                        title={t('taskEditor.renameFileTooltip') || 'Rename File'}
                      >
                        edit
                      </button>
                      <button 
                        type="button" 
                        onclick={() => removeQuestionMedia(qIndex, mIndex)}
                        class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors remove-file-btn"
                      >
                        close
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Options Section -->
          <div class="flex flex-col gap-3 border-t border-outline-variant/40 pt-4 mt-1">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-sans">
                {t('taskEditor.mc.optionsTitle') || 'Antwortoptionen'}
              </span>
              <button
                type="button"
                onclick={() => addOption(qIndex)}
                class="flex items-center gap-1 px-3 py-1.5 border border-primary/30 text-primary hover:bg-primary/5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer bg-transparent focus:outline-none"
              >
                <span class="material-symbols-outlined text-[14px]">add</span>
                <span>{t('taskEditor.mc.addOption') || 'Antwortmöglichkeit hinzufügen'}</span>
              </button>
            </div>

            <div class="flex flex-col gap-3">
              {#each question.options as option, oIndex (option.id)}
                <div class="flex flex-col gap-2 p-3 bg-surface-container-low/40 rounded-xl border border-outline-variant/40">
                  <div class="flex items-center gap-3 w-full">
                    <!-- Correct Answer Toggle -->
                    <label class="flex items-center gap-1 shrink-0 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        bind:checked={option.isCorrect}
                        class="accent-emerald-600 h-4 w-4 cursor-pointer"
                      />
                      <span class="text-[10px] font-bold text-emerald-600 uppercase tracking-wider font-sans">
                        {t('taskEditor.mc.isCorrect') || 'Richtig'}
                      </span>
                    </label>

                    <!-- Option Text Input / Preview -->
                    <div class="grow min-w-0 font-sans">
                      {#if showOptionPreview[option.id] || showQuestionPreview[question.id]}
                        <div 
                          class="w-full border border-outline-variant/40 rounded-lg p-2.5 bg-surface-container-low text-left leading-relaxed prose prose-sm dark:prose-invert"
                          style="font-size: {fontSize}px;"
                        >
                          {@html parseMarkdown(option.text || `*${t('taskEditor.mc.noOptionText') || 'Keine Antwort eingegeben'}*`)}
                        </div>
                      {:else}
                        <textarea
                          bind:value={option.text}
                          use:autoResize={option.text}
                          placeholder={t('taskEditor.mc.optionPlaceholder') || 'Antwortmöglichkeit...'}
                          class="w-full bg-transparent border border-outline-variant rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none resize-none overflow-hidden"
                        ></textarea>
                      {/if}
                    </div>

                    <!-- Option Preview Toggle Button -->
                    <button
                      type="button"
                      onclick={() => showOptionPreview[option.id] = !showOptionPreview[option.id]}
                      class="text-on-surface-variant hover:text-primary p-1 hover:bg-surface-container rounded-lg cursor-pointer border-0 bg-transparent flex items-center justify-center shrink-0"
                      title={showOptionPreview[option.id] ? (t('taskEditor.editMode') || 'Bearbeiten') : (t('taskEditor.previewMode') || 'Vorschau')}
                    >
                      <span class="material-symbols-outlined text-[16px]">
                        {showOptionPreview[option.id] ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>

                    <!-- Delete Option -->
                    {#if question.options.length > 2}
                      <button
                        type="button"
                        onclick={() => deleteOption(qIndex, oIndex)}
                        class="text-on-surface-variant hover:text-error p-1 hover:bg-surface-container rounded-lg cursor-pointer border-0 bg-transparent flex items-center justify-center shrink-0 animate-fade-in"
                        title={t('taskEditor.mc.deleteOption') || 'Option löschen'}
                      >
                        <span class="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    {/if}
                  </div>

                  <!-- Option Media Attachments -->
                  <div class="flex flex-col gap-2 bg-surface-container-low/20 rounded-xl p-3 border border-outline-variant/20 font-sans">
                    <div class="flex justify-between items-center w-full min-h-5.5">
                      <button
                        type="button"
                        onclick={() => optionMediaExpanded[option.id] = !optionMediaExpanded[option.id]}
                        class="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant hover:text-primary cursor-pointer border-0 bg-transparent p-0 transition-colors focus:outline-none text-left"
                      >
                        <span class="material-symbols-outlined text-xs">attach_file</span>
                        <span>{t('taskEditor.mc.optionMediaTitle') || 'Medien für diese Option'}</span>
                        <span class="material-symbols-outlined text-sm transition-transform duration-200" style="transform: rotate({optionMediaExpanded[option.id] ? '180' : '0'}deg)">
                          expand_more
                        </span>
                      </button>

                      {#if optionMediaExpanded[option.id]}
                        <button
                          type="button"
                          onclick={() => pasteOptionMediaFromClipboard(qIndex, oIndex)}
                          class="flex items-center gap-0.5 px-2 py-0.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 rounded text-[9px] font-bold text-primary cursor-pointer transition-colors focus:outline-none shrink-0"
                        >
                          <span class="material-symbols-outlined text-[11px]">content_paste</span>
                          <span>{t('taskEditor.pasteClipboard') || 'Einfügen'}</span>
                        </button>
                      {/if}
                    </div>

                    <!-- Click to Select Area (only if expanded) -->
                    {#if optionMediaExpanded[option.id]}
                      <label class="flex flex-col items-center justify-center border border-dashed border-outline-variant/80 rounded-lg p-2.5 hover:bg-surface-container-high/40 transition-colors cursor-pointer text-center group bg-surface-container-lowest/30 select-none">
                        <span class="material-symbols-outlined text-base text-on-surface-variant group-hover:text-primary mb-0.5 transition-colors">cloud_upload</span>
                        <span class="text-[9.5px] font-bold text-on-surface">{t('common.addFile') || 'Datei hinzufügen'}</span>
                        <input 
                          type="file" 
                          multiple 
                          class="hidden" 
                          onchange={(e) => handleOptionMediaUpload(e, qIndex, oIndex)}
                        />
                      </label>
                    {/if}

                    {#if option.media && option.media.length > 0}
                      <div class="flex flex-col gap-1.5 mt-1.5 w-full">
                        {#each option.media as file, omIndex}
                          {#if isMediaDragActive && draggedFileType === 'option_media' && draggedQuestionIndex === qIndex && draggedOptionIndex === oIndex && hoveredFileIndex === omIndex}
                            <div class="h-1 bg-primary rounded my-1 animate-pulse"></div>
                          {/if}
                          <div 
                            data-file-index={omIndex}
                            data-file-type="option_media"
                            data-q-index={qIndex}
                            data-o-index={oIndex}
                            onpointerdown={(e) => handleFilePointerDown(e, omIndex, 'option_media', qIndex, oIndex)}
                            class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm touch-none select-none w-full font-sans {isMediaDragActive && draggedFileType === 'option_media' && draggedQuestionIndex === qIndex && draggedOptionIndex === oIndex && draggedFileIndex === omIndex ? 'opacity-40 scale-95' : ''}"
                          >
                            <div 
                              onclick={() => {
                                if (editingFileIndex !== omIndex || editingFileType !== 'option' || editingQuestionIndex !== qIndex || editingOptionIndex !== oIndex) {
                                  onOpenPreview(file);
                                }
                              }}
                              class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow preview-file-click"
                              title={t('taskEditor.clickToPreview') || 'Klicken für Vorschau'}
                              role="button"
                              tabindex="0"
                              onkeydown={(e) => { if (e.key === 'Enter') onOpenPreview(file); }}
                            >
                              <span class="material-symbols-outlined text-[20px] text-outline cursor-grab active:cursor-grabbing hover:text-primary select-none drag-handle">
                                drag_indicator
                              </span>
                              <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                                {getFileIcon(file.name)}
                              </span>
                              {#if editingFileIndex === omIndex && editingFileType === 'option' && editingQuestionIndex === qIndex && editingOptionIndex === oIndex}
                                <input
                                  bind:this={renameInputEl}
                                  type="text"
                                  bind:value={editingFileNameValue}
                                  onclick={(e) => e.stopPropagation()}
                                  onkeydown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter') {
                                      saveInlineRename();
                                    } else if (e.key === 'Escape') {
                                      cancelInlineRename();
                                    }
                                  }}
                                  onblur={saveInlineRename}
                                  class="bg-surface border border-primary rounded px-2 py-0.5 text-xs text-on-surface focus:outline-none w-full font-medium font-sans"
                                />
                              {:else}
                                <span class="text-xs text-on-surface hover:text-primary truncate font-medium">{getBaseName(file.name)}</span>
                              {/if}
                            </div>
                            <div class="flex items-center gap-1 shrink-0" onclick={e => e.stopPropagation()}>
                              <button 
                                type="button"
                                onclick={() => startRenameFile(qIndex, omIndex, 'option', oIndex)}
                                class="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors"
                                title={t('taskEditor.renameFileTooltip') || 'Rename File'}
                              >
                                edit
                              </button>
                              <button 
                                type="button" 
                                onclick={() => removeOptionMedia(qIndex, oIndex, omIndex)}
                                class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors remove-file-btn"
                              >
                                close
                              </button>
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>

        </div>
      {/each}
    </div>
  {/if}
  {/if}
</div>
