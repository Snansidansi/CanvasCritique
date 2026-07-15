<script lang="ts">
  import { t } from '../../services/i18n';
  import { parseMarkdown } from '../../utils/markdown';
  import { isImageFile, isAudioFile, isVideoFile, getFileIcon, isIntegratedFile, openAttachmentInDefaultApp } from '../../db/media';
  import AudioPlayer from './AudioPlayer.svelte';
  import type { MultipleChoiceTask, MediaFile } from '../../state/types';

  let {
    multipleChoiceTasks = [],
    selectedAnswers = $bindable({}),
    fontSize = 13,
    showSolution = false,
    onAnswersChanged = () => {}
  } = $props();

  let expandedMediaIds = $state<Record<string, boolean>>({});
  let previewFile = $state<MediaFile | null>(null);

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
      list = [optionId];
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
    return true; // Default open
  }

  function getBaseName(filename: string): string {
    if (!filename) return '';
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) return filename;
    return filename.substring(0, lastDotIndex);
  }
</script>

<div class="flex flex-col gap-6 w-full max-h-full overflow-y-auto p-4 select-text custom-scrollbar">
  {#each multipleChoiceTasks as question, qIndex (question.id)}
    {@const isCheckbox = getIsCheckbox(question)}
    <div class="border border-outline-variant/60 rounded-2xl bg-surface-container-lowest p-5 flex flex-col gap-4 text-left shadow-sm">
      
      <!-- Question Title / Index -->
      <div class="flex items-center justify-between border-b border-outline-variant/30 pb-2">
        <span class="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full font-sans">
          {t('common.question') || 'Frage'} {qIndex + 1}
        </span>
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

      <!-- Question Media Accordions (exactly like sidebar) -->
      {#if question.questionMedia && question.questionMedia.length > 0}
        <div class="flex flex-col gap-2 mt-1">
          {#each question.questionMedia as file, idx}
            {@const mediaId = `q-${question.id}-${idx}`}
            {@const open = isMediaExpanded(mediaId)}
            <div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col transition-all w-full">
              <!-- Header Bar -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div 
                onclick={() => toggleMedia(mediaId)}
                class="w-full px-4 py-2.5 flex items-center justify-between hover:bg-surface-container-high transition-colors font-sans text-xs font-semibold text-on-surface cursor-pointer select-none text-left"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span class="material-symbols-outlined text-[18px] text-primary shrink-0">
                    {getFileIcon(file.name)}
                  </span>
                  <span class="truncate pr-4">{getBaseName(file.name)}</span>
                </div>
                <div class="flex items-center shrink-0 gap-1.5" onclick={e => e.stopPropagation()}>
                  {#if isImageFile(file.name)}
                    <button
                      type="button"
                      onclick={() => previewFile = file}
                      class="material-symbols-outlined text-[18px] text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors"
                      title={t('practice.infoPanels.openFullScreen') || 'Vorschau'}
                    >
                      zoom_in
                    </button>
                  {/if}
                  <span class="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform shrink-0" style="transform: rotate({open ? '180deg' : '0deg'});">
                    keyboard_arrow_down
                  </span>
                </div>
              </div>

              <!-- Media Content Panel -->
              {#if open}
                <div class="border-t border-outline-variant bg-surface-container-lowest p-3 flex justify-center items-center overflow-x-auto min-h-20 w-full">
                  {#if isAudioFile(file.name)}
                    <AudioPlayer dataUrl={file.dataUrl} compact={true} />
                  {:else if isVideoFile(file.name)}
                    <!-- svelte-ignore a11y_media_has_caption -->
                    <video 
                      src={file.dataUrl} 
                      controls 
                      class="max-w-full max-h-64 rounded-lg shadow-sm border border-outline-variant/10"
                    ></video>
                  {:else if isImageFile(file.name)}
                    <img 
                      src={file.dataUrl} 
                      alt={file.name} 
                      class="max-w-full max-h-64 rounded-lg object-contain" 
                    />
                  {:else}
                    <button
                      type="button"
                      onclick={() => openAttachmentInDefaultApp(file).catch(err => console.error(err))}
                      class="w-full p-4 flex flex-col items-center justify-center gap-3 bg-surface-container-low hover:bg-surface-container-high border border-outline-variant rounded-xl cursor-pointer transition-all select-none py-6 group"
                    >
                      <span class="material-symbols-outlined text-[36px] text-primary shrink-0 group-hover:scale-105 transition-transform">
                        {getFileIcon(file.name)}
                      </span>
                      <div class="text-center">
                        <p class="text-xs font-bold text-on-surface truncate max-w-sidebar-width">{getBaseName(file.name)}</p>
                        <p class="text-[10px] text-on-surface-variant mt-1">{t('practice.infoPanels.openDefaultApp') || 'Mit Standard-App öffnen'}</p>
                      </div>
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
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

            <!-- Option Media Accordions (exactly like sidebar) -->
            {#if option.media && option.media.length > 0}
              <div class="flex flex-col gap-2 pl-8 border-l border-outline-variant/30 mt-1" onclick={e => e.stopPropagation()} role="presentation">
                {#each option.media as file, oIdx}
                  {@const oMediaId = `opt-${question.id}-${option.id}-${oIdx}`}
                  {@const oOpen = isMediaExpanded(oMediaId)}
                  <div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col transition-all w-full">
                    <!-- Header Bar -->
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                      onclick={() => toggleMedia(oMediaId)}
                      class="w-full px-3.5 py-2 flex items-center justify-between hover:bg-surface-container-high transition-colors font-sans text-[11px] font-semibold text-on-surface cursor-pointer select-none text-left"
                    >
                      <div class="flex items-center gap-1.5 min-w-0">
                        <span class="material-symbols-outlined text-[16px] text-primary shrink-0">
                          {getFileIcon(file.name)}
                        </span>
                        <span class="truncate pr-4">{getBaseName(file.name)}</span>
                      </div>
                      <div class="flex items-center shrink-0 gap-1" onclick={e => e.stopPropagation()}>
                        {#if isImageFile(file.name)}
                          <button
                            type="button"
                            onclick={() => previewFile = file}
                            class="material-symbols-outlined text-[16px] text-primary hover:bg-primary/10 p-0.5 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors"
                            title={t('practice.infoPanels.openFullScreen') || 'Vorschau'}
                          >
                            zoom_in
                          </button>
                        {/if}
                        <span class="material-symbols-outlined text-[16px] text-on-surface-variant transition-transform shrink-0" style="transform: rotate({oOpen ? '180deg' : '0deg'});">
                          keyboard_arrow_down
                        </span>
                      </div>
                    </div>

                    <!-- Media Content Panel -->
                    {#if oOpen}
                      <div class="border-t border-outline-variant bg-surface-container-lowest p-2.5 flex justify-center items-center overflow-x-auto min-h-16 w-full">
                        {#if isAudioFile(file.name)}
                          <AudioPlayer dataUrl={file.dataUrl} compact={true} />
                        {:else if isVideoFile(file.name)}
                          <!-- svelte-ignore a11y_media_has_caption -->
                          <video 
                            src={file.dataUrl} 
                            controls 
                            class="max-w-full max-h-48 rounded-lg shadow-sm border border-outline-variant/10"
                          ></video>
                        {:else if isImageFile(file.name)}
                          <img 
                            src={file.dataUrl} 
                            alt={file.name} 
                            class="max-w-full max-h-48 rounded-lg object-contain" 
                          />
                        {:else}
                          <button
                            type="button"
                            onclick={() => openAttachmentInDefaultApp(file).catch(err => console.error(err))}
                            class="w-full p-3 flex flex-col items-center justify-center gap-2 bg-surface-container-low hover:bg-surface-container-high border border-outline-variant rounded-lg cursor-pointer transition-all select-none py-4 group"
                          >
                            <span class="material-symbols-outlined text-[28px] text-primary shrink-0 group-hover:scale-105 transition-transform">
                              {getFileIcon(file.name)}
                            </span>
                            <div class="text-center">
                              <p class="text-[11px] font-bold text-on-surface truncate max-w-sidebar-width">{getBaseName(file.name)}</p>
                              <p class="text-[9px] text-on-surface-variant mt-0.5">{t('practice.infoPanels.openDefaultApp') || 'Mit Standard-App öffnen'}</p>
                            </div>
                          </button>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>

    </div>
  {/each}
</div>

<!-- Premium Self-Contained Image Preview Modal Popup Overlay -->
{#if previewFile}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-100 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in" onclick={() => previewFile = null}>
    <div class="relative max-w-[90%] max-h-[90%] flex flex-col items-center" onclick={e => e.stopPropagation()}>
      <button 
        onclick={() => previewFile = null}
        class="absolute -top-10 right-0 text-white bg-black/50 hover:bg-black/80 rounded-full p-2 border-0 flex items-center justify-center cursor-pointer transition-colors focus:outline-none"
      >
        <span class="material-symbols-outlined text-lg">close</span>
      </button>
      <img src={previewFile.dataUrl} alt={previewFile.name} class="max-w-full max-h-[80vh] rounded-xl shadow-2xl object-contain bg-white dark:bg-zinc-900 border border-outline-variant/20" />
      <span class="text-white text-xs font-semibold mt-3 font-sans truncate max-w-lg">{previewFile.name}</span>
    </div>
  </div>
{/if}
