<script lang="ts">
  import { t } from '../../services/i18n';

  // Props
  let { 
    settings, 
    onchange,
    hideContextFilters = false
  }: { 
    settings: any; 
    onchange?: () => void; 
    hideContextFilters?: boolean;
  } = $props();

  function handleInputChange() {
    if (onchange) onchange();
  }
</script>

<div class="flex flex-col gap-4">
  <!-- Group 1: Task -->
  <div class="flex flex-col gap-2">
    <div class="text-[11px] font-bold uppercase tracking-wider text-primary border-b border-outline-variant/30 pb-1 flex items-center gap-1 select-none">
      <span class="material-symbols-outlined text-[14px]">assignment</span>
      {t('settings.api.groupTask')}
    </div>
    
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
  </div>

  <!-- Group 2: Solution -->
  <div class="flex flex-col gap-2">
    <div class="text-[11px] font-bold uppercase tracking-wider text-primary border-b border-outline-variant/30 pb-1 flex items-center gap-1 select-none">
      <span class="material-symbols-outlined text-[14px]">done_all</span>
      {t('settings.api.groupSolution')}
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
  </div>

  <!-- Group 3: Canvas -->
  <div class="flex flex-col gap-2">
    <div class="text-[11px] font-bold uppercase tracking-wider text-primary border-b border-outline-variant/30 pb-1 flex items-center gap-1 select-none">
      <span class="material-symbols-outlined text-[14px]">gesture</span>
      {t('settings.api.groupCanvas')}
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
  </div>

  <!-- Group 4: Context guidelines (if active) -->
  {#if !hideContextFilters}
    <div class="flex flex-col gap-2">
      <div class="text-[11px] font-bold uppercase tracking-wider text-primary border-b border-outline-variant/30 pb-1 flex items-center gap-1 select-none">
        <span class="material-symbols-outlined text-[14px]">settings_suggest</span>
        {t('settings.api.groupContext')}
      </div>

      <!-- Send Context Text Guidelines Toggle -->
      <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
        <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[18px] text-primary">settings_suggest</span>
          {t('settings.api.sendContextText')}
        </span>
        <label class="relative inline-flex items-center cursor-pointer select-none">
          <input 
            type="checkbox" 
            bind:checked={settings.sendContextText}
            onchange={handleInputChange}
            class="sr-only peer" 
          />
          <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      <!-- Send Context Media Files Toggle -->
      <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
        <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[18px] text-primary">perm_media</span>
          {t('settings.api.sendContextMedia')}
        </span>
        <label class="relative inline-flex items-center cursor-pointer select-none">
          <input 
            type="checkbox" 
            bind:checked={settings.sendContextMedia}
            onchange={handleInputChange}
            class="sr-only peer" 
          />
          <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>
    </div>
  {/if}

  <!-- Group 5: Feedback Language -->
  <div class="flex flex-col gap-2">
    <div class="text-[11px] font-bold uppercase tracking-wider text-primary border-b border-outline-variant/30 pb-1 flex items-center gap-1 select-none">
      <span class="material-symbols-outlined text-[14px]">translate</span>
      {t('settings.api.groupLanguage')}
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
</div>
