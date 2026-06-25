<script lang="ts">
  import { t } from '../../services/i18n';

  // Props
  let { 
    settings, 
    onchange 
  }: { 
    settings: any; 
    onchange?: () => void; 
  } = $props();

  function handleInputChange() {
    if (onchange) onchange();
  }
</script>

<div class="flex flex-col gap-3">
  <!-- Send Task Details Toggle -->
  <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
    <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[18px] text-primary">image</span>
      {t('settings.api.sendTaskMedia')}
    </span>
    <label class="relative inline-flex items-center cursor-pointer select-none">
      <input 
        type="checkbox" 
        bind:checked={settings.sendTaskMedia}
        onchange={handleInputChange}
        class="sr-only peer" 
      />
      <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
    </label>
  </div>

  <!-- Include Task Description Text Toggle -->
  <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
    <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[18px] text-primary">description</span>
      {t('settings.api.sendTaskText')}
    </span>
    <label class="relative inline-flex items-center cursor-pointer select-none">
      <input 
        type="checkbox" 
        bind:checked={settings.sendTaskText}
        onchange={handleInputChange}
        class="sr-only peer" 
      />
      <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
    </label>
  </div>
  
  <!-- Send Solution Details Toggle -->
  <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
    <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[18px] text-primary">image</span>
      {t('settings.api.sendSolutionMedia')}
    </span>
    <label class="relative inline-flex items-center cursor-pointer select-none">
      <input 
        type="checkbox" 
        bind:checked={settings.sendSolutionMedia}
        onchange={handleInputChange}
        class="sr-only peer" 
      />
      <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
    </label>
  </div>

  <!-- Include Expected Solution Text Toggle -->
  <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
    <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[18px] text-primary">lightbulb</span>
      {t('settings.api.sendSolutionText')}
    </span>
    <label class="relative inline-flex items-center cursor-pointer select-none">
      <input 
        type="checkbox" 
        bind:checked={settings.sendSolutionText}
        onchange={handleInputChange}
        class="sr-only peer" 
      />
      <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
    </label>
  </div>

  <!-- Send Canvas Background Toggle -->
  <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
    <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[18px] text-primary">wallpaper</span>
      {t('settings.api.sendCanvasBg')}
    </span>
    <label class="relative inline-flex items-center cursor-pointer select-none">
      <input 
        type="checkbox" 
        bind:checked={settings.sendCanvasBackground}
        onchange={handleInputChange}
        class="sr-only peer" 
      />
      <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
    </label>
  </div>

  <!-- AI Feedback Language Selection -->
  <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
    <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[18px] text-primary">translate</span>
      {t('settings.api.aiFeedbackLang')}
    </span>
    <input
      type="text"
      bind:value={settings.language}
      onchange={handleInputChange}
      placeholder={t('settings.api.aiFeedbackLangPlaceholder')}
      class="bg-surface-container border border-outline-variant rounded-md px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary font-semibold w-40 text-right"
    />
  </div>
</div>
