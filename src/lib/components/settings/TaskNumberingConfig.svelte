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
</div>
