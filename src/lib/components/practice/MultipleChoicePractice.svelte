<script lang="ts">
  import { t } from '../../services/i18n';
  import { parseMarkdown } from '../../utils/markdown';
  import { isImageFile, isAudioFile, isVideoFile, getFileIcon, isIntegratedFile, openAttachmentInDefaultApp } from '../../db/media';
  import AudioPlayer from './AudioPlayer.svelte';
  import MediaPreviewItem from './MediaPreviewItem.svelte';
  import type { MultipleChoiceTask, MediaFile } from '../../state/types';

  let {
    multipleChoiceTasks = [],
    selectedAnswers = $bindable({}),
    fontSize = 13,
    showSolution = false,
    onSelectProvidedImage = () => {},
    onAnswersChanged = () => {}
  }: {
    multipleChoiceTasks?: MultipleChoiceTask[];
    selectedAnswers?: Record<string, string[]>;
    fontSize?: number;
    showSolution?: boolean;
    onSelectProvidedImage?: (file: any) => void;
    onAnswersChanged?: (answers: Record<string, string[]>) => void;
  } = $props();

  let expandedMediaIds = $state<Record<string, boolean>>({});

  // Preview Modal states matching PracticeInfoPanels 1-to-1
  let previewFile = $state<{ name: string; dataUrl: string; mediaId?: string } | null>(null);
  let modalZoom = $state(1);
  let modalPan = $state({ x: 0, y: 0 });
  let isModalDragging = $state(false);
  let modalDragStart = $state({ x: 0, y: 0 });
  let modalBasePan = $state({ x: 0, y: 0 });
  let modalActivePointers = new Map<number, PointerEvent>();
  let modalIsPinching = false;
  let modalInitialPinchDistance = 0;
  let modalInitialPinchZoom = 1;
  let modalInitialPinchMidpoint = { x: 0, y: 0 };
  let modalInitialPinchPan = { x: 0, y: 0 };
  let modalInitialPinchCenter = { x: 0, y: 0 };

  function isOptionSelected(questionId: string, optionId: string): boolean {
    const list = selectedAnswers[questionId] || [];
    return list.includes(optionId);
  }

  function handleOptionToggle(question: MultipleChoiceTask, optionId: string, isCheckbox: boolean) {
    const questionId = question.id;
    let list = [...(selectedAnswers[questionId] || [])];

    if (isCheckbox) {
      if (list.includes(optionId)) {
        list = list.filter(id => id !== optionId);
      } else {
        list = [...list, optionId];
      }
    } else {
      // Single Choice de-selection support
      if (list.includes(optionId)) {
        list = [];
      } else {
        list = [optionId];
      }
    }

    selectedAnswers = {
      ...selectedAnswers,
      [questionId]: list
    };
    onAnswersChanged(selectedAnswers);
  }

  function getIsCheckbox(question: MultipleChoiceTask): boolean {
    return question.options.filter(o => o.isCorrect).length > 1;
  }

  function toggleMedia(mediaId: string) {
    expandedMediaIds[mediaId] = !expandedMediaIds[mediaId];
  }

  function isMediaExpanded(mediaId: string): boolean {
    if (expandedMediaIds[mediaId] !== undefined) {
      return expandedMediaIds[mediaId];
    }
    // Expanded by default as requested!
    return true;
  }

  function decodeBase64Text(dataUrl: string): string {
    if (!dataUrl) return '';
    try {
      const base64Data = dataUrl.split(',')[1];
      return decodeURIComponent(escape(atob(base64Data)));
    } catch (e) {
      console.error('[MultipleChoicePractice] Failed to decode text document', e);
      return t('taskEditor.errorDecode') || 'Fehler beim Dekodieren';
    }
  }

  async function openPreview(file: { name: string; dataUrl: string; mediaId?: string }) {
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
    modalZoom = Math.max(0.5, Math.min(newZoom, 8));
    if (modalZoom === 1) {
      modalPan = { x: 0, y: 0 };
    }
  }

  function handleModalPointerDown(e: PointerEvent) {
    const container = e.currentTarget as HTMLElement;
    try { container.setPointerCapture(e.pointerId); } catch (_) {}
    modalActivePointers.set(e.pointerId, e);

    if (modalActivePointers.size === 2) {
      const pts = Array.from(modalActivePointers.values());
      const isMultiTouch = pts.every(p => p.pointerType === 'touch');
      if (isMultiTouch && modalZoom > 0) {
        const p1 = pts[0];
        const p2 = pts[1];
        modalInitialPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        modalInitialPinchZoom = modalZoom;
        modalInitialPinchMidpoint = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
        modalInitialPinchPan = { ...modalPan };
        const rect = container.getBoundingClientRect();
        modalInitialPinchCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
        modalIsPinching = true;
        isModalDragging = false;
        e.preventDefault();
        return;
      }
    }

    if (modalActivePointers.size > 2) {
      e.preventDefault();
      return;
    }

    if (modalZoom <= 1) return;
    isModalDragging = true;
    modalDragStart = { x: e.clientX, y: e.clientY };
    modalBasePan = { ...modalPan };
  }

  function handleModalPointerMove(e: PointerEvent) {
    if (e.buttons === 0) {
      modalActivePointers.clear();
      isModalDragging = false;
      modalIsPinching = false;
      return;
    }
    modalActivePointers.set(e.pointerId, e);

    if (modalIsPinching && modalActivePointers.size === 2) {
      e.preventDefault();
      const pts = Array.from(modalActivePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const currentDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const currentMidpoint = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
      if (modalInitialPinchDistance > 0) {
        const factor = currentDistance / modalInitialPinchDistance;
        const newZoom = Math.max(0.5, Math.min(8, modalInitialPinchZoom * factor));
        const cx = modalInitialPinchCenter.x;
        const cy = modalInitialPinchCenter.y;
        const worldX = (modalInitialPinchMidpoint.x - cx - modalInitialPinchPan.x) / modalInitialPinchZoom;
        const worldY = (modalInitialPinchMidpoint.y - cy - modalInitialPinchPan.y) / modalInitialPinchZoom;
        modalZoom = newZoom;
        modalPan = {
          x: (currentMidpoint.x - cx) - worldX * newZoom,
          y: (currentMidpoint.y - cy) - worldY * newZoom
        };
      }
      return;
    }

    if (modalActivePointers.size > 1) return;

    if (!isModalDragging) return;
    const dx = e.clientX - modalDragStart.x;
    const dy = e.clientY - modalDragStart.y;
    modalPan = {
      x: modalBasePan.x + dx,
      y: modalBasePan.y + dy
    };
  }

  function handleModalPointerUp(e: PointerEvent) {
    modalActivePointers.delete(e.pointerId);
    if (modalActivePointers.size < 2) modalIsPinching = false;
    if (modalActivePointers.size === 0) isModalDragging = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
  }

  function handleModalPointerCancel(e: PointerEvent) {
    handleModalPointerUp(e);
  }

  function getScoreStats(): { correctCount: number; totalCount: number } {
    let correctCount = 0;
    const totalCount = multipleChoiceTasks.length;
    for (const q of multipleChoiceTasks) {
      const userSelected = selectedAnswers[q.id] || [];
      const correctOptionIds = q.options.filter(o => o.isCorrect).map(o => o.id);
      const isAllCorrect = userSelected.length === correctOptionIds.length &&
        userSelected.every(id => correctOptionIds.includes(id));
      if (isAllCorrect) correctCount++;
    }
    return { correctCount, totalCount };
  }
</script>

<div class="flex flex-col gap-6 w-full max-h-full overflow-y-auto p-4 select-text custom-scrollbar">
  {#if showSolution && multipleChoiceTasks.length > 0}
    {@const stats = getScoreStats()}
    <div class="w-full border rounded-2xl p-4 flex items-center justify-between shadow-sm select-none font-sans transition-all {stats.correctCount === stats.totalCount ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300' : 'bg-surface-container-high border-outline-variant/60 text-on-surface'}">
      <div class="flex items-center gap-3">
        <span class="material-symbols-outlined text-2xl {stats.correctCount === stats.totalCount ? 'text-emerald-600' : 'text-primary'}">
          {stats.correctCount === stats.totalCount ? 'emoji_events' : 'fact_check'}
        </span>
        <div class="flex flex-col">
          <span class="font-bold text-sm">
            {stats.correctCount} von {stats.totalCount} {stats.totalCount === 1 ? (t('practice.mc.questionSingle') || 'Frage') : (t('practice.mc.questionsPlural') || 'Fragen')} richtig
          </span>
          <span class="text-xs opacity-75">
            {Math.round((stats.correctCount / (stats.totalCount || 1)) * 100)}% {t('practice.mc.completedPercent') || 'erreicht'}
          </span>
        </div>
      </div>
    </div>
  {/if}
  {#each multipleChoiceTasks as question, qIndex (question.id)}
    {@const isCheckbox = getIsCheckbox(question)}
    {@const isUnanswered = showSolution && (!selectedAnswers[question.id] || selectedAnswers[question.id].length === 0)}
    <div class="border rounded-2xl p-5 flex flex-col gap-4 text-left shadow-sm transition-all {isUnanswered ? 'border-error/80 bg-error/5' : 'border-outline-variant/60 bg-surface-container-lowest'}">
      
      <!-- Question Title / Index -->
      <div class="flex items-center justify-between border-b border-outline-variant/30 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold {isUnanswered ? 'text-error bg-error/15' : 'text-primary bg-primary/10'} px-2.5 py-1 rounded-full font-sans">
            {t('common.question') || 'Frage'} {qIndex + 1}
          </span>
          {#if isUnanswered}
            <span class="text-xs font-bold text-error bg-error/10 border border-error/30 px-2.5 py-1 rounded-full font-sans flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">warning</span>
              <span>{t('practice.mc.unanswered') || 'Nicht beantwortet'}</span>
            </span>
          {/if}
        </div>
        <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-sans">
          {isCheckbox ? (t('practice.mc.multipleAnswers') || 'Mehrfachauswahl') : (t('practice.mc.singleAnswer') || 'Einfachauswahl')}
        </span>
      </div>

      <!-- Question Text (LaTeX & Markdown support) -->
      <div 
        class="text-on-surface leading-relaxed prose dark:prose-invert font-sans"
        style="font-size: {fontSize}px;"
      >
        {@html parseMarkdown(question.question || '')}
      </div>

      <!-- Question Media Accordions (reusing the extracted MediaPreviewItem component) -->
      {#if question.questionMedia && question.questionMedia.length > 0}
        <div class="flex flex-col gap-3 mt-1 animate-fade-in">
          {#each question.questionMedia as file, idx}
            {@const mediaId = `q-${question.id}-${idx}`}
            <MediaPreviewItem
              {file}
              {mediaId}
              open={isMediaExpanded(mediaId)}
              onToggle={() => toggleMedia(mediaId)}
              onSelectProvidedImage={onSelectProvidedImage}
              onOpenPreview={openPreview}
              fontSize={fontSize}
            />
          {/each}
        </div>
      {/if}

      <!-- Options -->
      <div class="flex flex-col gap-3 mt-2">
        {#each question.options as option (option.id)}
          {@const selected = isOptionSelected(question.id, option.id)}
          {@const correct = option.isCorrect}
          {@const showResult = showSolution}
          {@const stateClass = !showResult 
            ? (selected ? 'bg-primary/5 border-primary shadow-sm' : 'bg-surface-container-low border-outline-variant/40 hover:bg-surface-container-high cursor-pointer')
            : (selected && correct ? 'bg-emerald-500/10 border-emerald-500 border-2 shadow-sm text-emerald-800 dark:text-emerald-300 cursor-pointer' :
               selected && !correct ? 'bg-error/10 border-error border-2 shadow-sm text-error cursor-pointer' :
               !selected && correct ? 'bg-emerald-500/5 border-emerald-500/50 border-2 border-dashed text-emerald-800 dark:text-emerald-300 cursor-pointer' :
               'bg-surface-container-low/50 border-outline-variant/20 opacity-60 cursor-pointer')}
          <div 
            class="flex flex-col gap-2.5 p-3.5 rounded-xl border transition-all font-sans {stateClass}"
            onclick={() => handleOptionToggle(question, option.id, isCheckbox)}
            role="button"
            tabindex="0"
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleOptionToggle(question, option.id, isCheckbox); e.preventDefault(); } }}
          >
            <div class="flex items-start gap-3 w-full">
              <!-- Checkbox / Radio graphic / Feedback indicator -->
              <div class="flex items-center justify-center shrink-0 mt-0.5 select-none">
                {#if showResult}
                  {#if selected && correct}
                    <span class="material-symbols-outlined text-[20px] text-emerald-600 font-bold">check_circle</span>
                  {:else if selected && !correct}
                    <span class="material-symbols-outlined text-[20px] text-error font-bold">cancel</span>
                  {:else}
                    <span class="material-symbols-outlined text-[20px] {correct ? 'text-emerald-600/70' : 'text-on-surface-variant/30'}">
                      {isCheckbox 
                        ? (correct ? 'check_box_outline_blank' : 'check_box_outline_blank')
                        : (correct ? 'radio_button_unchecked' : 'radio_button_unchecked')}
                    </span>
                  {/if}
                {:else}
                  {#if isCheckbox}
                    <span class="material-symbols-outlined text-[20px] {selected ? 'text-primary' : 'text-on-surface-variant/70'}">
                      {selected ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                  {:else}
                    <span class="material-symbols-outlined text-[20px] {selected ? 'text-primary' : 'text-on-surface-variant/70'}">
                      {selected ? 'radio_button_checked' : 'radio_button_unchecked'}
                    </span>
                  {/if}
                {/if}
              </div>

              <!-- Option Text -->
              <div 
                class="grow text-on-surface leading-relaxed prose prose-sm dark:prose-invert"
                style="font-size: {fontSize}px;"
              >
                {@html parseMarkdown(option.text || '')}
              </div>
            </div>

            <!-- Option Media Accordions (reusing the extracted MediaPreviewItem component) -->
            {#if option.media && option.media.length > 0}
              <div class="flex flex-col gap-2 pl-8 border-l border-outline-variant/30 mt-1 animate-fade-in" onclick={e => e.stopPropagation()} role="presentation">
                {#each option.media as file, oIdx}
                  {@const oMediaId = `opt-${question.id}-${option.id}-${oIdx}`}
                  <MediaPreviewItem
                    {file}
                    mediaId={oMediaId}
                    open={isMediaExpanded(oMediaId)}
                    onToggle={() => toggleMedia(oMediaId)}
                    onSelectProvidedImage={onSelectProvidedImage}
                    onOpenPreview={openPreview}
                    fontSize={fontSize}
                  />
                {/each}
              </div>
            {/if}

            <!-- Option Hint / Explanation in Solution Mode -->
            {#if showSolution && (selected || (!selected && correct)) && option.hint && option.hint.trim() !== ''}
              <div 
                class="flex flex-col gap-1 mt-1 p-2.5 rounded-lg border text-left font-sans text-xs animate-fade-in {selected && correct ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-900 dark:text-emerald-200' : selected && !correct ? 'bg-error/15 border-error/30 text-error' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'}"
                onclick={e => e.stopPropagation()}
                role="presentation"
              >
                <div class="flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider opacity-85">
                  <span class="material-symbols-outlined text-[13px]">info</span>
                  <span>{t('practice.mc.hintExplanationTitle') || 'Hinweis / Erklärung'}</span>
                </div>
                <div class="prose prose-xs dark:prose-invert leading-relaxed" style="font-size: {Math.max(11, fontSize - 1)}px;">
                  {@html parseMarkdown(option.hint)}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>

    </div>
  {/each}
</div>

<!-- Full-screen Media Preview Modal (Copied 1-to-1 from PracticeInfoPanels) -->
{#if previewFile}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    onclick={closePreview}
    class="fixed inset-0 z-100 flex flex-col justify-center items-center bg-black/85 backdrop-blur-sm p-8 select-none"
  >
    <div 
      onclick={(e) => e.stopPropagation()}
      class="relative w-[95%] h-[95%] max-w-[95vw] max-h-[95vh] bg-surface rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-outline-variant"
    >
      <!-- Modal Header -->
      <header class="flex items-center justify-between px-6 py-4 border-b border-outline-variant select-none shrink-0 bg-surface">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0">
            {getFileIcon(previewFile.name)}
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

      <!-- Modal Body (Zoom / Pan support for images) -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div 
        onwheel={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? handleModalWheel : null}
        onpointerdown={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? handleModalPointerDown : null}
        onpointermove={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? handleModalPointerMove : null}
        onpointerup={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? handleModalPointerUp : null}
        onpointercancel={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? handleModalPointerCancel : null}
        class="grow bg-surface-container-lowest p-6 flex justify-center items-center min-h-0 select-text {previewFile.name.toLowerCase().endsWith('.pdf') || previewFile.name.toLowerCase().endsWith('.txt') || previewFile.name.toLowerCase().endsWith('.md') || isAudioFile(previewFile.name) || isVideoFile(previewFile.name) ? 'overflow-auto' : 'overflow-hidden relative'}"
        style={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !isAudioFile(previewFile.name) && !isVideoFile(previewFile.name) ? `cursor: ${modalZoom > 1 ? (isModalDragging ? 'grabbing' : 'grab') : 'zoom-in'}; touch-action: none;` : ''}
      >
        {#if isAudioFile(previewFile.name)}
          <div class="w-full max-w-md">
            <AudioPlayer dataUrl={previewFile.dataUrl} />
          </div>
        {:else if isVideoFile(previewFile.name)}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video 
            src={previewFile.dataUrl} 
            controls 
            class="max-w-full max-h-full rounded-lg shadow-md"
          ></video>
        {:else if previewFile.name.toLowerCase().endsWith('.pdf')}
          <iframe 
            src={previewFile.dataUrl} 
            title={previewFile.name} 
            class="w-full h-full border-0 rounded-lg shadow-sm"
          ></iframe>
        {:else if previewFile.name.toLowerCase().endsWith('.md')}
          <div class="w-full h-full p-6 overflow-auto bg-surface-container-high rounded-xl text-on-surface select-text leading-relaxed border border-outline-variant text-left wrap-break-word font-sans prose prose-sm dark:prose-invert">
            {@html parseMarkdown(decodeBase64Text(previewFile.dataUrl))}
          </div>
        {:else if previewFile.name.toLowerCase().endsWith('.txt')}
          <pre class="w-full h-full p-6 overflow-auto bg-surface-container-high rounded-xl font-mono text-on-surface whitespace-pre-wrap select-text leading-relaxed border border-outline-variant text-left">{decodeBase64Text(previewFile.dataUrl)}</pre>
        {:else}
          <img 
            src={previewFile.dataUrl} 
            alt={previewFile.name} 
            class="max-w-full max-h-full object-contain shadow-md select-none transition-transform duration-75 ease-out"
            style="transform: translate({modalPan.x}px, {modalPan.y}px) scale({modalZoom}); transform-origin: center center;"
            draggable="false"
          />
        {/if}
      </div>
    </div>
  </div>
{/if}
