<script lang="ts">
  import { t } from '../../services/i18n';

  let {
    settings,
    onchange
  }: {
    settings: { autoNumberTasks?: boolean; taskNumberingTemplate?: string; [key: string]: any };
    onchange?: () => void;
  } = $props();

  function handleToggleChange(e: Event & { currentTarget: HTMLInputElement }) {
    settings.autoNumberTasks = e.currentTarget.checked;
    if (onchange) onchange();
  }

  function handleTemplateInput(e: Event & { currentTarget: HTMLInputElement }) {
    settings.taskNumberingTemplate = e.currentTarget.value;
    if (onchange) onchange();
  }
  function handleHideCompletedSectionsChange(e: Event & { currentTarget: HTMLInputElement }) {
    settings.hideCompletedSections = e.currentTarget.checked;
    if (onchange) onchange();
  }

  function isModeActive(mode: string) {
    if (!settings.defaultEditMode || settings.defaultEditMode === 'none' || settings.defaultEditMode === '') return false;
    const activeModes = settings.defaultEditMode.split(',').map(m => m.trim());
    return activeModes.includes(mode);
  }

  function toggleMode(mode: string) {
    if (!settings.defaultEditMode || settings.defaultEditMode === 'none') {
      settings.defaultEditMode = mode;
      if (onchange) onchange();
      return;
    }
    let activeModes = settings.defaultEditMode.split(',').map(m => m.trim()).filter(Boolean);
    if (activeModes.includes(mode)) {
      activeModes = activeModes.filter(m => m !== mode);
    } else {
      activeModes.push(mode);
    }
    settings.defaultEditMode = activeModes.length > 0 ? activeModes.join(',') : 'none';
    if (onchange) onchange();
  }
</script>

<div class="flex flex-col gap-4">
  <!-- Toggle to Auto-number tasks -->
  <div class="flex items-center justify-between gap-4">
    <div>
      <h4 class="font-bold text-sm text-on-surface mb-0.5">{t('settings.taskNumbering.autoNumber')}</h4>
      <p class="text-xs text-on-surface-variant">{t('settings.taskNumbering.autoNumberDesc')}</p>
    </div>
    <label class="relative inline-flex items-center cursor-pointer select-none shrink-0">
      <input 
        type="checkbox" 
        checked={settings.autoNumberTasks ?? false}
        onchange={handleToggleChange}
        class="sr-only peer" 
      />
      <div class="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
    </label>
  </div>

  <!-- Naming template input -->
  {#if settings.autoNumberTasks}
    <div class="flex flex-col gap-1.5 animate-fade-in border-t border-outline-variant/20 pt-4 mt-1">
      <label for="numberingTemplate" class="font-bold text-xs text-on-surface">{t('settings.taskNumbering.templateLabel')}</label>
      <p class="text-xs text-on-surface-variant mb-1">{t('settings.taskNumbering.templateDesc')}</p>
      <input
        id="numberingTemplate"
        type="text"
        value={settings.taskNumberingTemplate || ''}
        oninput={handleTemplateInput}
        placeholder={t('settings.taskNumbering.templatePlaceholder')}
        class="bg-surface-container-low border border-outline-variant rounded-lg px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-full max-w-md"
      />
    </div>
  {/if}

  <!-- Default Editor Selector for new tasks -->
  <div class="flex flex-col gap-2.5 border-t border-outline-variant/20 pt-4 mt-1 font-sans text-left">
    <div class="flex flex-col gap-0.5">
      <span class="text-xs font-bold text-on-surface">{t('settings.taskNumbering.defaultEditModeLabel')}</span>
      <span class="text-[10.5px] text-on-surface-variant">{t('settings.taskNumbering.defaultEditModeDesc')}</span>
    </div>
    <div class="flex flex-wrap gap-2 mt-1 select-none">
      <!-- Canvas Toggle Button -->
      <button
        type="button"
        onclick={() => toggleMode('canvas')}
        class="px-4 py-2 text-xs font-semibold rounded-xl border border-outline-variant cursor-pointer transition-all flex items-center gap-1.5 focus:outline-none
               {isModeActive('canvas') ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}"
      >
        <span class="material-symbols-outlined text-[16px]">brush</span>
        <span>{t('taskEditor.defaultEditModeCanvas')}</span>
      </button>
      
      <!-- Text Editor Toggle Button -->
      <button
        type="button"
        onclick={() => toggleMode('text')}
        class="px-4 py-2 text-xs font-semibold rounded-xl border border-outline-variant cursor-pointer transition-all flex items-center gap-1.5 focus:outline-none
               {isModeActive('text') ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}"
      >
        <span class="material-symbols-outlined text-[16px]">edit_note</span>
        <span>{t('taskEditor.defaultEditModeText')}</span>
      </button>
      
      <!-- Multiple Choice Toggle Button -->
      <button
        type="button"
        onclick={() => toggleMode('multiple_choice')}
        class="px-4 py-2 text-xs font-semibold rounded-xl border border-outline-variant cursor-pointer transition-all flex items-center gap-1.5 focus:outline-none
               {isModeActive('multiple_choice') ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}"
      >
        <span class="material-symbols-outlined text-[16px]">rule</span>
        <span>{t('taskEditor.mc.title') || 'Multiple-Choice-Aufgaben'}</span>
      </button>
    </div>
  </div>

  <!-- Toggle to Hide Completed Sections -->
  <div class="flex items-center justify-between gap-4 border-t border-outline-variant/20 pt-4 mt-1">
    <div>
      <h4 class="font-bold text-sm text-on-surface mb-0.5">{t('settings.taskNumbering.hideCompletedSections')}</h4>
      <p class="text-xs text-on-surface-variant">{t('settings.taskNumbering.hideCompletedSectionsDesc')}</p>
    </div>
    <label class="relative inline-flex items-center cursor-pointer select-none shrink-0">
      <input 
        type="checkbox" 
        checked={settings.hideCompletedSections ?? false}
        onchange={handleHideCompletedSectionsChange}
        class="sr-only peer" 
      />
      <div class="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
    </label>
  </div>
</div>
