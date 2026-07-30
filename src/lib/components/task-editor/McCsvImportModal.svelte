<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { readFile } from '@tauri-apps/plugin-fs';
  import { t } from '../../services/i18n';
  import type { MultipleChoiceTask, MultipleChoiceOption } from '../../state/types';

  let {
    isOpen = false,
    onClose = () => {},
    onImport = (_questions: MultipleChoiceTask[]) => {}
  } = $props();

  let delimiter = $state(';');
  let csvText = $state('');
  let errorMessage = $state('');

  function parseMcCsvText(text: string, delim: string): MultipleChoiceTask[] {
    const effectiveDelim = delim || ';';
    const lines = text.split(/\r?\n/);
    const questions: MultipleChoiceTask[] = [];

    for (let index = 0; index < lines.length; index++) {
      const rawLine = lines[index];
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;

      const firstDelim = line.indexOf(effectiveDelim);
      if (firstDelim === -1) continue;

      const questionText = line.substring(0, firstDelim).trim();
      const rest = line.substring(firstDelim + effectiveDelim.length).trim();

      if (!questionText || !rest) continue;

      const options: MultipleChoiceOption[] = [];

      if (rest.includes(',')) {
        const optionPairs = rest.split(',');
        for (let pairIdx = 0; pairIdx < optionPairs.length; pairIdx++) {
          const p = optionPairs[pairIdx].trim();
          if (!p) continue;
          const delimIdx = p.indexOf(effectiveDelim);
          if (delimIdx !== -1) {
            const optText = p.substring(0, delimIdx).trim();
            const correctVal = p.substring(delimIdx + effectiveDelim.length).trim().toLowerCase();
            const isCorrect = correctVal === '1' || correctVal === 'true' || correctVal === 'richtig';
            if (optText) {
              options.push({
                id: 'mc-o-' + Date.now() + '-' + index + '-' + pairIdx + '-' + Math.random().toString(36).substring(2, 6),
                text: optText,
                media: [],
                isCorrect
              });
            }
          } else {
            options.push({
              id: 'mc-o-' + Date.now() + '-' + index + '-' + pairIdx + '-' + Math.random().toString(36).substring(2, 6),
              text: p,
              media: [],
              isCorrect: false
            });
          }
        }
      } else {
        const parts = rest.split(effectiveDelim);
        for (let i = 0; i < parts.length; i += 2) {
          const optText = parts[i]?.trim();
          const correctVal = parts[i + 1]?.trim().toLowerCase() || '';
          const isCorrect = correctVal === '1' || correctVal === 'true' || correctVal === 'richtig';
          if (optText) {
            options.push({
              id: 'mc-o-' + Date.now() + '-' + index + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
              text: optText,
              media: [],
              isCorrect
            });
          }
        }
      }

      if (options.length > 0) {
        const correctCount = options.filter(o => o.isCorrect).length;
        const qId = 'mc-q-' + Date.now() + '-' + index + '-' + Math.random().toString(36).substring(2, 7);
        questions.push({
          id: qId,
          question: questionText,
          questionMedia: [],
          options,
          allowMultipleSelection: correctCount > 1
        });
      }
    }

    return questions;
  }

  async function handleSelectFile() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'CSV File', extensions: ['csv', 'txt'] }]
      });
      if (!selected) return;

      const path = Array.isArray(selected) ? selected[0] : selected;
      const bytes = await readFile(path);
      const content = new TextDecoder().decode(bytes);
      csvText = content;
      errorMessage = '';
    } catch (err) {
      console.error('Failed to select CSV file:', err);
    }
  }

  function handleFileInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      csvText = reader.result as string;
      errorMessage = '';
    };
    reader.readAsText(file);
  }

  function handleSubmit() {
    if (!csvText.trim()) {
      errorMessage = t('taskEditor.mc.importCsvErrorNoData') || 'Keine gültigen CSV-Daten vorhanden';
      return;
    }

    const parsed = parseMcCsvText(csvText, delimiter);
    if (parsed.length === 0) {
      errorMessage = t('taskEditor.mc.importCsvErrorNoData') || 'Keine gültigen Fragen im CSV-Format gefunden';
      return;
    }

    onImport(parsed);
    handleClose();
  }

  function handleClose() {
    csvText = '';
    errorMessage = '';
    onClose();
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in select-none">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 w-140 max-w-[92vw] shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto font-sans">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-outline-variant/40 pb-3">
        <div class="flex items-center gap-2.5 text-primary">
          <span class="material-symbols-outlined text-2xl">table_chart</span>
          <h3 class="font-bold text-base text-on-surface">
            {t('taskEditor.mc.importCsvTitle') || 'Multiple-Choice-Fragen aus CSV importieren'}
          </h3>
        </div>
        <button
          type="button"
          onclick={handleClose}
          class="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer border-0 bg-transparent"
        >
          <span class="material-symbols-outlined text-xl">close</span>
        </button>
      </div>

      <!-- Format Instructions Box -->
      <div class="p-4 rounded-xl border border-primary/20 bg-primary/5 text-on-surface flex flex-col gap-1.5">
        <div class="flex items-center gap-2 font-bold text-xs text-primary">
          <span class="material-symbols-outlined text-[18px]">info</span>
          <span>{t('taskEditor.mc.importCsvFormatHintTitle') || 'Erwartetes Format pro Zeile:'}</span>
        </div>
        <code class="text-xs font-mono bg-surface-container-low px-2.5 py-1.5 rounded-lg border border-outline-variant/30 text-on-surface font-semibold select-all break-all">
          {t('taskEditor.mc.importCsvFormatHint') || 'frage;antwort;1/0,antwort;1/0,...'}
        </code>
        <span class="text-[11px] text-on-surface-variant leading-relaxed">
          {t('taskEditor.mc.importCsvFormatHintDetail') || 'Verwende 1 für richtig und 0 für falsch (z. B. Was ist 2+2?;4;1,5;0,3;0)'}
        </span>
      </div>

      <!-- Delimiter Field -->
      <div class="flex flex-col gap-1.5">
        <label for="csvDelimiterInput" class="text-xs font-bold text-on-surface-variant">
          {t('taskEditor.mc.importCsvDelimiter') || 'Trennzeichen'}
        </label>
        <input
          id="csvDelimiterInput"
          type="text"
          bind:value={delimiter}
          maxLength={3}
          class="w-24 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary text-center font-mono font-bold"
        />
      </div>

      <!-- File Select or Text Input -->
      <div class="flex flex-col gap-2">
        <div class="flex justify-between items-center">
          <label for="csvTextareaInput" class="text-xs font-bold text-on-surface-variant">
            {t('taskEditor.mc.importCsvTextareaLabel') || 'CSV-Text oder Datei'}
          </label>
          <div class="flex items-center gap-2">
            <!-- Native file input fallback / Tauri picker -->
            <button
              type="button"
              onclick={handleSelectFile}
              class="px-2.5 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 rounded-lg text-xs font-semibold text-on-surface flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span class="material-symbols-outlined text-[16px]">upload_file</span>
              <span>{t('taskEditor.mc.importCsvSelectFile') || 'CSV-Datei auswählen'}</span>
            </button>
            <label class="hidden">
              <input type="file" accept=".csv,.txt" onchange={handleFileInputChange} />
            </label>
          </div>
        </div>

        <textarea
          id="csvTextareaInput"
          bind:value={csvText}
          rows={6}
          placeholder={t('taskEditor.mc.importCsvTextareaPlaceholder') || 'Was ist 2+2?;4;1,5;0,3;0\nHauptstadt von DE?;Berlin;1,München;0'}
          class="w-full bg-surface-container-low border border-outline-variant rounded-xl p-3 text-xs font-mono text-on-surface focus:ring-1 focus:ring-primary focus:border-primary focus:outline-none resize-y"
        ></textarea>
      </div>

      <!-- Error message -->
      {#if errorMessage}
        <div class="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-xs font-semibold flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px]">error</span>
          <span>{errorMessage}</span>
        </div>
      {/if}

      <!-- Modal Actions -->
      <div class="flex justify-end gap-2.5 border-t border-outline-variant/40 pt-3 mt-1">
        <button
          type="button"
          onclick={handleClose}
          class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-xl hover:bg-surface-container-high cursor-pointer focus:outline-none transition-colors"
        >
          {t('common.cancel') || 'Abbrechen'}
        </button>
        <button
          type="button"
          onclick={handleSubmit}
          class="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 cursor-pointer focus:outline-none transition-opacity flex items-center gap-1.5 shadow-sm"
        >
          <span class="material-symbols-outlined text-[16px]">file_download</span>
          <span>{t('taskEditor.mc.importCsvSubmit') || 'Importieren'}</span>
        </button>
      </div>

    </div>
  </div>
{/if}
