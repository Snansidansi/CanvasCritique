<script lang="ts">
  import { t } from '../../services/i18n';
  import { parseMarkdown } from '../../utils/markdown';
  import { isAudioFile, getFileIcon, openAttachmentInDefaultApp } from '../../db/media';
  import AudioPlayer from './AudioPlayer.svelte';
  import type { MultipleChoiceTask, MediaFile } from '../../state/types';

  let {
    multipleChoiceTasks = [],
    selectedAnswers = $bindable({}),
    fontSize = 13,
    onAnswersChanged = () => {}
  } = $props();

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
      // Radio mode: select only this one
      list = [optionId];
    }

    selectedAnswers = {
      ...selectedAnswers,
      [questionId]: list
    };
    onAnswersChanged(selectedAnswers);
  }

  function getIsCheckbox(question: MultipleChoiceTask): boolean {
    // If the question has more than 1 correct option, treat it as multiple choice (checkboxes)
    return question.options.filter(o => o.isCorrect).length > 1;
  }
</script>

<div class="flex flex-col gap-6 w-full max-h-full overflow-y-auto p-4 select-text">
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

      <!-- Question Media Attachments -->
      {#if question.questionMedia && question.questionMedia.length > 0}
        <div class="flex flex-col gap-2 mt-1">
          {#each question.questionMedia as file}
            <div class="flex flex-col gap-1 text-left">
              {#if file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)}
                <img 
                  src={file.dataUrl} 
                  alt={file.name} 
                  class="max-h-64 rounded-xl border border-outline-variant/30 object-contain self-start" 
                />
              {:else if isAudioFile(file.name)}
                <div class="max-w-md">
                  <AudioPlayer dataUrl={file.dataUrl} />
                </div>
              {:else}
                <button
                  type="button"
                  onclick={() => openAttachmentInDefaultApp(file)}
                  class="flex items-center gap-2 px-3 py-2 border border-outline-variant rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all cursor-pointer focus:outline-none w-fit font-sans"
                >
                  <span class="material-symbols-outlined text-[18px]">{getFileIcon(file.name)}</span>
                  <span>{file.name}</span>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Options -->
      <div class="flex flex-col gap-3 mt-2">
        {#each question.options as option (option.id)}
          {@const selected = isOptionSelected(question.id, option.id)}
          <div 
            class="flex flex-col gap-2.5 p-3.5 rounded-xl border transition-all cursor-pointer font-sans
                   {selected 
                     ? 'bg-primary/5 border-primary shadow-sm' 
                     : 'bg-surface-container-low border-outline-variant/40 hover:bg-surface-container-high'}"
            onclick={() => handleOptionToggle(question, option.id, isCheckbox)}
            role="button"
            tabindex="0"
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleOptionToggle(question, option.id, isCheckbox); e.preventDefault(); } }}
          >
            <div class="flex items-start gap-3 w-full">
              <!-- Checkbox / Radio graphic indicator -->
              <div class="flex items-center justify-center shrink-0 mt-0.5 select-none">
                {#if isCheckbox}
                  <span class="material-symbols-outlined text-[20px] {selected ? 'text-primary' : 'text-on-surface-variant/70'}">
                    {selected ? 'check_box' : 'check_box_outline_blank'}
                  </span>
                {:else}
                  <span class="material-symbols-outlined text-[20px] {selected ? 'text-primary' : 'text-on-surface-variant/70'}">
                    {selected ? 'radio_button_checked' : 'radio_button_unchecked'}
                  </span>
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

            <!-- Option Media Attachments -->
            {#if option.media && option.media.length > 0}
              <div class="flex flex-col gap-2 pl-8 border-l border-outline-variant/30 mt-1" onclick={e => e.stopPropagation()} role="presentation">
                {#each option.media as file}
                  <div class="flex flex-col gap-1 text-left">
                    {#if file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)}
                      <img 
                        src={file.dataUrl} 
                        alt={file.name} 
                        class="max-h-48 rounded-lg border border-outline-variant/20 object-contain self-start" 
                      />
                    {:else if isAudioFile(file.name)}
                      <div class="max-w-sm">
                        <AudioPlayer dataUrl={file.dataUrl} />
                      </div>
                    {:else}
                      <button
                        type="button"
                        onclick={() => openAttachmentInDefaultApp(file)}
                        class="flex items-center gap-1.5 px-2.5 py-1.5 border border-outline-variant/80 rounded-lg bg-surface-container-high text-[11px] font-semibold text-on-surface-variant hover:text-primary transition-all cursor-pointer focus:outline-none w-fit"
                      >
                        <span class="material-symbols-outlined text-[16px]">{getFileIcon(file.name)}</span>
                        <span>{file.name}</span>
                      </button>
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
