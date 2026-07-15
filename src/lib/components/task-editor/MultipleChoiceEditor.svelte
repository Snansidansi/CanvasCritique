<script lang="ts">
  import { t } from '../../services/i18n';
  import { parseMarkdown } from '../../utils/markdown';
  import { saveMediaToDb, isImageFile, isAudioFile, isVideoFile, getFileIcon } from '../../db/media';
  import type { MultipleChoiceTask, MultipleChoiceOption, MediaFile } from '../../state/types';

  let {
    multipleChoiceTasks = $bindable([]),
    fontSize = 13
  } = $props();

  // Active preview states per question (mapping question.id -> boolean)
  let showQuestionPreview = $state<Record<string, boolean>>({});

  function addQuestion() {
    const newQuestion: MultipleChoiceTask = {
      id: 'mc-q-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
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
</script>

<div class="flex flex-col gap-6 mt-4">
  <div class="flex justify-between items-center bg-surface-container-low p-4 rounded-xl border border-outline-variant">
    <div class="flex flex-col gap-0.5">
      <h3 class="text-sm font-bold text-on-surface">{t('taskEditor.mc.title') || 'Multiple-Choice-Aufgaben'}</h3>
      <span class="text-xs text-on-surface-variant">
        {t('taskEditor.mc.subtitle') || 'Erstelle Aufgaben mit einer oder mehreren richtigen Antworten'}
      </span>
    </div>
    <button
      type="button"
      onclick={addQuestion}
      class="flex items-center gap-1.5 px-4 py-2 bg-primary text-white hover:bg-primary-hover rounded-xl text-xs font-bold shadow-sm transition-colors border-0 cursor-pointer focus:outline-none"
    >
      <span class="material-symbols-outlined text-[16px]">add</span>
      <span>{t('taskEditor.mc.addQuestion') || 'Frage hinzufügen'}</span>
    </button>
  </div>

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
        <div class="border border-outline-variant rounded-2xl bg-surface-container-lowest p-5 flex flex-col gap-4 relative shadow-sm transition-all hover:shadow-md">
          
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
                placeholder={t('taskEditor.mc.questionPlaceholder') || 'Gib hier deine Frage ein (Markdown und LaTeX unterstützt)...'}
                class="w-full bg-transparent border border-outline-variant rounded-xl p-4 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:border-primary resize-y min-h-20 focus:outline-none"
              ></textarea>
            {/if}
          </div>

          <!-- Question Media Attachments -->
          <div class="flex flex-col gap-2 bg-surface-container-low/30 rounded-xl p-4 border border-outline-variant/30">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm">attachment</span>
                {t('taskEditor.mc.mediaTitle') || 'Medien für diese Frage'}
              </span>
              <label class="flex items-center gap-1 px-3 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 rounded-lg text-[10px] font-bold text-on-surface-variant cursor-pointer transition-colors">
                <span class="material-symbols-outlined text-[14px]">upload</span>
                <span>{t('common.addFile') || 'Datei hinzufügen'}</span>
                <input 
                  type="file" 
                  multiple 
                  class="hidden" 
                  onchange={(e) => handleQuestionMediaUpload(e, qIndex)}
                />
              </label>
            </div>

            {#if question.questionMedia.length > 0}
              <div class="flex flex-wrap gap-2 mt-1">
                {#each question.questionMedia as file, mIndex}
                  <div class="flex items-center gap-1.5 bg-surface-container-low border border-outline-variant rounded-lg pl-2 pr-1 py-1 text-xs text-on-surface shadow-sm">
                    <span class="material-symbols-outlined text-sm text-on-surface-variant">{getFileIcon(file.name)}</span>
                    <span class="truncate max-w-37.5 font-medium">{file.name}</span>
                    <button 
                      type="button" 
                      onclick={() => removeQuestionMedia(qIndex, mIndex)}
                      class="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-error p-0.5 rounded cursor-pointer border-0 bg-transparent flex items-center justify-center"
                    >close</button>
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
                      {#if showQuestionPreview[question.id]}
                        <div 
                          class="w-full border border-outline-variant/40 rounded-lg p-2.5 bg-surface-container-low text-left leading-relaxed prose prose-sm dark:prose-invert"
                          style="font-size: {fontSize}px;"
                        >
                          {@html parseMarkdown(option.text || `*${t('taskEditor.mc.noOptionText') || 'Keine Antwort eingegeben'}*`)}
                        </div>
                      {:else}
                        <input
                          type="text"
                          bind:value={option.text}
                          placeholder={t('taskEditor.mc.optionPlaceholder') || 'Antwortmöglichkeit...'}
                          class="w-full bg-transparent border border-outline-variant rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none"
                        />
                      {/if}
                    </div>

                    <!-- Delete Option -->
                    {#if question.options.length > 2}
                      <button
                        type="button"
                        onclick={() => deleteOption(qIndex, oIndex)}
                        class="text-on-surface-variant hover:text-error p-1 hover:bg-surface-container rounded-lg cursor-pointer border-0 bg-transparent flex items-center justify-center shrink-0"
                        title={t('taskEditor.mc.deleteOption') || 'Option löschen'}
                      >
                        <span class="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    {/if}
                  </div>

                  <!-- Option Media Attachments -->
                  <div class="flex items-center gap-2 bg-surface-container-low/20 rounded-lg px-3 py-1.5 border border-outline-variant/20 justify-between">
                    <div class="flex items-center gap-1.5 min-w-0 grow">
                      <span class="material-symbols-outlined text-xs text-on-surface-variant shrink-0">attach_file</span>
                      <span class="text-[9.5px] font-bold text-on-surface-variant truncate mr-2 font-sans">
                        {t('taskEditor.mc.optionMediaTitle') || 'Medien für diese Option'}
                      </span>
                      
                      {#if option.media && option.media.length > 0}
                        <div class="flex flex-wrap gap-1 items-center min-w-0 grow">
                          {#each option.media as file, omIndex}
                            <div class="flex items-center gap-1 bg-surface-container-low border border-outline-variant/60 rounded px-1.5 py-0.5 text-[10px] text-on-surface shadow-sm max-w-30">
                              <span class="material-symbols-outlined text-[10px] text-on-surface-variant shrink-0">{getFileIcon(file.name)}</span>
                              <span class="truncate font-medium">{file.name}</span>
                              <button 
                                type="button" 
                                onclick={() => removeOptionMedia(qIndex, oIndex, omIndex)}
                                class="material-symbols-outlined text-[11px] text-on-surface-variant hover:text-error p-0.5 rounded cursor-pointer border-0 bg-transparent flex items-center justify-center shrink-0"
                              >close</button>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>

                    <label class="flex items-center gap-0.5 px-2 py-0.5 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 rounded text-[9px] font-bold text-on-surface-variant cursor-pointer transition-colors shrink-0">
                      <span class="material-symbols-outlined text-[12px]">upload</span>
                      <span>{t('common.addFile') || 'Datei'}</span>
                      <input 
                        type="file" 
                        multiple 
                        class="hidden" 
                        onchange={(e) => handleOptionMediaUpload(e, qIndex, oIndex)}
                      />
                    </label>
                  </div>
                </div>
              {/each}
            </div>
          </div>

        </div>
      {/each}
    </div>
  {/if}
</div>
