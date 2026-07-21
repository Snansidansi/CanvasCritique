<script lang="ts">
  import { store, DEFAULT_SYSTEM_PROMPT } from '../../state/store.svelte';
  import AiModelConfig from '../settings/AiModelConfig.svelte';
  import EvaluationDetailsSettings from '../settings/EvaluationDetailsSettings.svelte';
  import CanvasModeSelector from '../settings/CanvasModeSelector.svelte';
  import TaskNumberingConfig from '../settings/TaskNumberingConfig.svelte';
  import MediaFilterSettings from '../settings/MediaFilterSettings.svelte';
  import type { Project } from '../../state/types';
  import { t } from '../../services/i18n';

  let { 
    isOpen = $bindable(false),
    project
  }: { 
    isOpen: boolean;
    project: Project;
  } = $props();

  // Initialize settingsOverride on mount / when modal opens if not present
  $effect(() => {
    if (isOpen && project && !project.settingsOverride) {
      project.settingsOverride = {
        overrideSettings: false,
        overrideModel: false,
        overrideCanvas: false,
        overrideEvaluation: false,
        overrideSystemPrompt: false,
        overrideMediaFilter: false,
        openRouterModel: store.settings.openRouterModel,
        showCanvasAnnotations: store.settings.showCanvasAnnotations,
        openRouterProvider: [...(store.settings.openRouterProvider || [])],
        openRouterReasoning: store.settings.openRouterReasoning,
        sendTaskMedia: store.settings.sendTaskMedia,
        sendSolutionMedia: store.settings.sendSolutionMedia,
        sendCanvasBackground: store.settings.sendCanvasBackground,
        sendTaskText: store.settings.sendTaskText,
        sendSolutionText: store.settings.sendSolutionText,
        language: store.settings.language,
        customSystemPrompt: store.settings.customSystemPrompt || '',
        canvasMode: store.settings.canvasMode,
        canvasFontSize: store.settings.canvasFontSize,
        overrideEditorFontSize: false,
        editorFontSize: store.settings.editorFontSize || 16,
        eraserMode: store.settings.eraserMode,
        eraserRadiusNormal: store.settings.eraserRadiusNormal,
        eraserRadiusStroke: store.settings.eraserRadiusStroke,
        overrideTaskNumbering: false,
        autoNumberTasks: store.settings.autoNumberTasks,
        taskNumberingTemplate: store.settings.taskNumberingTemplate,
        taskMediaFilterMode: store.settings.taskMediaFilterMode || 'blacklist',
        taskMediaFilterExtensions: store.settings.taskMediaFilterExtensions || '',
        solutionMediaFilterMode: store.settings.solutionMediaFilterMode || 'blacklist',
        solutionMediaFilterExtensions: store.settings.solutionMediaFilterExtensions || ''
      };
    }
  });

  // Local state for toggling system prompt custom override inside modal
  let hasCustomSystemPrompt = $state(false);

  // Tab navigation state
  type TabId = 'model' | 'canvas' | 'editorFontSize' | 'eraser' | 'evaluation' | 'prompt' | 'numbering' | 'mediaFilter';
  let activeTab = $state<TabId>('model');

  const tabs = [
    { id: 'model', labelKey: 'lessonSettings.modelConfigTitle', icon: 'smart_toy' },
    { id: 'evaluation', labelKey: 'lessonSettings.evaluationDetailsTitle', icon: 'fact_check' },
    { id: 'mediaFilter', labelKey: 'settings.api.mediaFilterMode', icon: 'filter_alt' },
    { id: 'canvas', labelKey: 'lessonSettings.canvasLayoutTitle', icon: 'aspect_ratio' },
    { id: 'editorFontSize', labelKey: 'lessonSettings.editorFontSizeTitle', icon: 'format_size' },
    { id: 'eraser', labelKey: 'lessonSettings.eraserTitle', icon: 'ink_eraser' },
    { id: 'prompt', labelKey: 'lessonSettings.systemPromptTitle', icon: 'terminal' },
    { id: 'numbering', labelKey: 'lessonSettings.taskCreationTitle', icon: 'edit_square' }
  ];

  $effect(() => {
    if (isOpen && project?.settingsOverride) {
      // Migrate backward compatibility / initialize undefined fields
      if (project.settingsOverride.overrideModel === undefined) {
        project.settingsOverride.overrideModel = project.settingsOverride.overrideSettings || false;
      }
      if (project.settingsOverride.overrideCanvas === undefined) {
        project.settingsOverride.overrideCanvas = project.settingsOverride.overrideSettings || false;
      }
      if (project.settingsOverride.overrideEraser === undefined) {
        project.settingsOverride.overrideEraser = project.settingsOverride.overrideSettings || false;
      }
      if (project.settingsOverride.overrideEvaluation === undefined) {
        project.settingsOverride.overrideEvaluation = project.settingsOverride.overrideSettings || false;
      }
      if (project.settingsOverride.overrideSystemPrompt === undefined) {
        project.settingsOverride.overrideSystemPrompt = project.settingsOverride.overrideSettings || false;
      }
      if (project.settingsOverride.overrideTaskNumbering === undefined) {
        project.settingsOverride.overrideTaskNumbering = project.settingsOverride.overrideSettings || false;
      }
      if (project.settingsOverride.autoNumberTasks === undefined) {
        project.settingsOverride.autoNumberTasks = store.settings.autoNumberTasks;
      }
      if (project.settingsOverride.taskNumberingTemplate === undefined) {
        project.settingsOverride.taskNumberingTemplate = store.settings.taskNumberingTemplate;
      }
      if (project.settingsOverride.eraserMode === undefined) {
        project.settingsOverride.eraserMode = store.settings.eraserMode || 'normal';
      }
      if (project.settingsOverride.eraserRadiusNormal === undefined) {
        project.settingsOverride.eraserRadiusNormal = store.settings.eraserRadiusNormal ?? 24;
      }
      if (project.settingsOverride.eraserRadiusStroke === undefined) {
        project.settingsOverride.eraserRadiusStroke = store.settings.eraserRadiusStroke ?? 24;
      }
      if (project.settingsOverride.openRouterReasoning === undefined) {
        project.settingsOverride.openRouterReasoning = store.settings.openRouterReasoning !== false;
      }
      if (project.settingsOverride.canvasFontSize === undefined) {
        project.settingsOverride.canvasFontSize = store.settings.canvasFontSize || 13;
      }
      if (project.settingsOverride.overrideEditorFontSize === undefined) {
        project.settingsOverride.overrideEditorFontSize = project.settingsOverride.overrideSettings || false;
      }
      if (project.settingsOverride.editorFontSize === undefined) {
        project.settingsOverride.editorFontSize = store.settings.editorFontSize || 16;
      }
      hasCustomSystemPrompt = !!project.settingsOverride.customSystemPrompt;
    }
  });

  function handleSave() {
    store.saveProjects();
    isOpen = false;
    store.showNotification(t('lessonSettings.saveSuccess'), 'success');
  }

  function handleCancel() {
    isOpen = false;
  }

  function handleToggleOverride(category: 'overrideModel' | 'overrideCanvas' | 'overrideEditorFontSize' | 'overrideEraser' | 'overrideEvaluation' | 'overrideSystemPrompt' | 'overrideTaskNumbering' | 'overrideMediaFilter', e: Event & { currentTarget: HTMLInputElement }) {
    if (!project.settingsOverride) return;
    const checked = e.currentTarget.checked;
    project.settingsOverride[category] = checked;

    // Keep overall overrideSettings in sync
    project.settingsOverride.overrideSettings = !!(
      project.settingsOverride.overrideModel ||
      project.settingsOverride.overrideCanvas ||
      project.settingsOverride.overrideEditorFontSize ||
      project.settingsOverride.overrideEraser ||
      project.settingsOverride.overrideEvaluation ||
      project.settingsOverride.overrideSystemPrompt ||
      project.settingsOverride.overrideTaskNumbering ||
      project.settingsOverride.overrideMediaFilter
    );

    if (checked) {
      if (category === 'overrideModel') {
        project.settingsOverride.openRouterModel = project.settingsOverride.openRouterModel ?? store.settings.openRouterModel;
        project.settingsOverride.openRouterProvider = project.settingsOverride.openRouterProvider ?? store.settings.openRouterProvider;
        project.settingsOverride.openRouterReasoning = project.settingsOverride.openRouterReasoning ?? store.settings.openRouterReasoning;
        project.settingsOverride.showCanvasAnnotations = project.settingsOverride.showCanvasAnnotations ?? store.settings.showCanvasAnnotations;
      } else if (category === 'overrideCanvas') {
        project.settingsOverride.canvasMode = project.settingsOverride.canvasMode ?? store.settings.canvasMode;
        project.settingsOverride.canvasFontSize = project.settingsOverride.canvasFontSize ?? store.settings.canvasFontSize;
      } else if (category === 'overrideEditorFontSize') {
        project.settingsOverride.editorFontSize = project.settingsOverride.editorFontSize ?? store.settings.editorFontSize;
      } else if (category === 'overrideEraser') {
        project.settingsOverride.eraserMode = project.settingsOverride.eraserMode ?? store.settings.eraserMode;
        project.settingsOverride.eraserRadiusNormal = project.settingsOverride.eraserRadiusNormal ?? store.settings.eraserRadiusNormal;
        project.settingsOverride.eraserRadiusStroke = project.settingsOverride.eraserRadiusStroke ?? store.settings.eraserRadiusStroke;
      } else if (category === 'overrideEvaluation') {
        project.settingsOverride.sendTaskMedia = project.settingsOverride.sendTaskMedia ?? store.settings.sendTaskMedia;
        project.settingsOverride.sendSolutionMedia = project.settingsOverride.sendSolutionMedia ?? store.settings.sendSolutionMedia;
        project.settingsOverride.sendCanvasBackground = project.settingsOverride.sendCanvasBackground ?? store.settings.sendCanvasBackground;
        project.settingsOverride.sendTaskText = project.settingsOverride.sendTaskText ?? store.settings.sendTaskText;
        project.settingsOverride.sendSolutionText = project.settingsOverride.sendSolutionText ?? store.settings.sendSolutionText;
      } else if (category === 'overrideMediaFilter') {
        project.settingsOverride.taskMediaFilterMode = project.settingsOverride.taskMediaFilterMode ?? store.settings.taskMediaFilterMode;
        project.settingsOverride.taskMediaFilterExtensions = project.settingsOverride.taskMediaFilterExtensions ?? store.settings.taskMediaFilterExtensions;
        project.settingsOverride.solutionMediaFilterMode = project.settingsOverride.solutionMediaFilterMode ?? store.settings.solutionMediaFilterMode;
        project.settingsOverride.solutionMediaFilterExtensions = project.settingsOverride.solutionMediaFilterExtensions ?? store.settings.solutionMediaFilterExtensions;
      } else if (category === 'overrideTaskNumbering') {
        project.settingsOverride.autoNumberTasks = project.settingsOverride.autoNumberTasks ?? store.settings.autoNumberTasks;
        project.settingsOverride.taskNumberingTemplate = project.settingsOverride.taskNumberingTemplate ?? store.settings.taskNumberingTemplate;
      }
    }

    if (category === 'overrideSystemPrompt') {
      if (checked) {
        if (!project.settingsOverride.customSystemPrompt) {
          project.settingsOverride.customSystemPrompt = store.settings.customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
        }
      } else {
        project.settingsOverride.customSystemPrompt = '';
      }
      hasCustomSystemPrompt = checked;
    }

    store.saveProjects();
  }

  function handlePromptInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
    if (!project.settingsOverride) return;
    project.settingsOverride.customSystemPrompt = e.currentTarget.value;
    store.saveProjects();
  }

  function resetPromptToDefault() {
    if (!project.settingsOverride) return;
    project.settingsOverride.customSystemPrompt = DEFAULT_SYSTEM_PROMPT;
    store.saveProjects();
  }
</script>

{#if isOpen && project}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-full max-w-3xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden animate-fade-in">
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-4 border-b border-outline-variant shrink-0">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">settings</span>
          <h3 class="font-bold text-lg text-on-surface">
            {t('lessonSettings.settingsOverrideFor', { name: project.name })}
          </h3>
        </div>
        <button 
          onclick={handleCancel}
          class="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors cursor-pointer focus:outline-none"
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <!-- Modal Body (Two-Column Layout) -->
      <div class="flex grow overflow-hidden mt-4 min-h-0 gap-6">
        <!-- Sidebar Tabs -->
        <div class="w-48 shrink-0 flex flex-col gap-1 border-r border-outline-variant/30 pr-4 overflow-y-auto no-scrollbar py-1">
          {#each tabs as tab}
            <button
              onclick={() => activeTab = tab.id as TabId}
              class="flex items-center gap-2 px-3 py-2.5 font-semibold text-xs rounded-lg transition-colors text-left focus:outline-none w-full cursor-pointer
                     {activeTab === tab.id
                       ? 'text-primary bg-primary/10'
                       : 'text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface'}"
            >
              <span class="material-symbols-outlined text-[18px]">{tab.icon}</span>
              <span class="truncate">{t(tab.labelKey)}</span>
            </button>
          {/each}
        </div>

        <!-- Modal Content (Scrollable Pane) -->
        <div class="grow overflow-y-auto py-1 pr-1 flex flex-col gap-4 custom-scrollbar min-h-0">
          {#if activeTab === 'model'}
            <!-- Model Override Toggle -->
            <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-on-surface">{t('lessonSettings.overrideModelLabel')}</span>
                <span class="text-[10.5px] text-outline leading-tight">{t('lessonSettings.overrideModelDesc')}</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={project.settingsOverride?.overrideModel || false} 
                  onchange={(e) => handleToggleOverride('overrideModel', e)}
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {#if project.settingsOverride?.overrideModel}
              <div class="border-t border-outline-variant/30 pt-4 animate-fade-in">
                <AiModelConfig 
                  settings={project.settingsOverride} 
                  showKeys={false} 
                  onchange={() => store.saveProjects()} 
                />
              </div>
            {:else}
              <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">smart_toy</span>
                <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                  {t('lessonSettings.usingGlobalDesc', { provider: 'OpenRouter', model: store.settings.openRouterModel })}
                </p>
              </div>
            {/if}

          {:else if activeTab === 'canvas'}
            <!-- Canvas Override Toggle -->
            <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-on-surface">{t('lessonSettings.overrideCanvasLabel')}</span>
                <span class="text-[10.5px] text-outline leading-tight">{t('lessonSettings.overrideCanvasDesc')}</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={project.settingsOverride?.overrideCanvas || false} 
                  onchange={(e) => handleToggleOverride('overrideCanvas', e)}
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

             {#if project.settingsOverride?.overrideCanvas}
              <div class="border-t border-outline-variant/30 pt-4 animate-fade-in flex flex-col gap-4">
                <CanvasModeSelector 
                  settings={project.settingsOverride} 
                  onchange={() => store.saveProjects()} 
                />
              </div>
            {:else}
              <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in flex flex-col gap-1 items-center">
                <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-1">aspect_ratio</span>
                <p class="text-xs text-on-surface font-bold">{t('lessonSettings.usingGlobalTitle')}</p>
                <p class="text-[11px] text-on-surface-variant leading-normal max-w-sm mx-auto">
                  {t('lessonSettings.canvasLayoutTitle')}: {store.settings.canvasMode === 'side-by-side' ? 'Side by Side' : 'Split Screen'}
                </p>
              </div>
            {/if}

          {:else if activeTab === 'editorFontSize'}
            <!-- Editor Font Size Override Toggle -->
            <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-on-surface">{t('lessonSettings.overrideEditorFontSizeLabel')}</span>
                <span class="text-[10.5px] text-outline leading-tight">{t('lessonSettings.overrideEditorFontSizeDesc')}</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={project.settingsOverride?.overrideEditorFontSize || false} 
                  onchange={(e) => handleToggleOverride('overrideEditorFontSize', e)}
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {#if project.settingsOverride?.overrideEditorFontSize}
              <div class="border-t border-outline-variant/30 pt-4 animate-fade-in flex flex-col gap-4">
                <div class="flex flex-col gap-2 mt-2">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-semibold text-on-surface">{t('lessonSettings.editorFontSizeTitle')}</span>
                    <span class="text-xs font-bold text-on-surface w-10 text-right">{project.settingsOverride.editorFontSize || 16}px</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <span class="text-xs text-outline font-medium shrink-0">10px</span>
                    <input
                      type="range"
                      min="10"
                      max="40"
                      step="1"
                      bind:value={project.settingsOverride.editorFontSize}
                      onchange={() => store.saveProjects()}
                      class="grow h-1.5 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <span class="text-xs text-outline font-medium shrink-0">40px</span>
                  </div>
                </div>
              </div>
            {:else}
              <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in flex flex-col gap-1 items-center">
                <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-1">format_size</span>
                <p class="text-xs text-on-surface font-bold">{t('lessonSettings.usingGlobalTitle')}</p>
                <p class="text-[11px] text-on-surface-variant leading-normal max-w-sm mx-auto">
                  {t('lessonSettings.usingGlobalEditorFontSizeDesc')}: {store.settings.editorFontSize || 16}px
                </p>
              </div>
            {/if}

          {:else if activeTab === 'eraser'}
            <!-- Eraser Override Toggle -->
            <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-on-surface">{t('lessonSettings.overrideEraserLabel')}</span>
                <span class="text-[10.5px] text-outline leading-tight">{t('lessonSettings.overrideEraserDesc')}</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={project.settingsOverride?.overrideEraser || false} 
                  onchange={(e) => handleToggleOverride('overrideEraser', e)}
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {#if project.settingsOverride?.overrideEraser}
              <div class="border-t border-outline-variant/30 pt-4 animate-fade-in flex flex-col gap-4">
                <div>
                  <div class="mb-3">
                    <h4 class="font-bold text-sm text-on-surface mb-0.5">{t('settings.canvas.eraser.title')}</h4>
                    <p class="text-xs text-on-surface-variant">{t('settings.canvas.eraser.desc')}</p>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onclick={() => { if (project.settingsOverride) { project.settingsOverride.eraserMode = 'normal'; store.saveProjects(); } }}
                      class="cursor-pointer text-left focus:outline-none bg-transparent border-0 p-0 w-full"
                    >
                      <div class="border rounded-lg p-3 bg-surface-container-low transition-all
                             {project.settingsOverride.eraserMode === 'normal' ? 'border-primary border-2 bg-primary/5' : 'border-outline-variant hover:border-primary'}">
                        <div class="flex items-center gap-2">
                          <span class="material-symbols-outlined text-lg text-primary">brush</span>
                          <span class="font-bold text-xs text-on-surface">{t('settings.canvas.eraser.normal')}</span>
                        </div>
                        <p class="text-[10px] text-on-surface-variant leading-tight mt-0.5">{t('settings.canvas.eraser.normalDesc')}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onclick={() => { if (project.settingsOverride) { project.settingsOverride.eraserMode = 'stroke'; store.saveProjects(); } }}
                      class="cursor-pointer text-left focus:outline-none bg-transparent border-0 p-0 w-full"
                    >
                      <div class="border rounded-lg p-3 bg-surface-container-low transition-all
                             {project.settingsOverride.eraserMode === 'stroke' ? 'border-primary border-2 bg-primary/5' : 'border-outline-variant hover:border-primary'}">
                        <div class="flex items-center gap-2">
                          <span class="material-symbols-outlined text-lg text-primary">auto_fix_high</span>
                          <span class="font-bold text-xs text-on-surface">{t('settings.canvas.eraser.stroke')}</span>
                        </div>
                        <p class="text-[10px] text-on-surface-variant leading-tight mt-0.5">{t('settings.canvas.eraser.strokeDesc')}</p>
                      </div>
                    </button>
                  </div>

                  {#if project.settingsOverride.eraserMode === 'normal'}
                    <div class="flex flex-col gap-2 mt-3">
                      <div class="flex items-center justify-between">
                        <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{t('settings.canvas.eraser.normalSize')}</span>
                        <span class="text-[10px] font-bold text-primary">{project.settingsOverride.eraserRadiusNormal ?? 24}px</span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="80"
                        value={project.settingsOverride.eraserRadiusNormal ?? 24}
                        oninput={(e) => { if (project.settingsOverride) { project.settingsOverride.eraserRadiusNormal = parseInt(e.currentTarget.value); store.saveProjects(); } }}
                        class="w-full h-1 accent-primary cursor-pointer border-0"
                      />
                    </div>
                  {:else}
                    <div class="flex flex-col gap-2 mt-3">
                      <div class="flex items-center justify-between">
                        <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{t('settings.canvas.eraser.strokeRadius')}</span>
                        <span class="text-[10px] font-bold text-primary">{project.settingsOverride.eraserRadiusStroke ?? 24}px</span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="80"
                        value={project.settingsOverride.eraserRadiusStroke ?? 24}
                        oninput={(e) => { if (project.settingsOverride) { project.settingsOverride.eraserRadiusStroke = parseInt(e.currentTarget.value); store.saveProjects(); } }}
                        class="w-full h-1 accent-primary cursor-pointer border-0"
                      />
                    </div>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">backspace</span>
                <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                  {t('lessonSettings.usingGlobalEraserDesc')}
                </p>
              </div>
            {/if}

          {:else if activeTab === 'evaluation'}
            <!-- Evaluation Override Toggle -->
            <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-on-surface">{t('lessonSettings.overrideEvaluationLabel')}</span>
                <span class="text-[10.5px] text-outline leading-tight">{t('lessonSettings.overrideEvaluationDesc')}</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={project.settingsOverride?.overrideEvaluation || false} 
                  onchange={(e) => handleToggleOverride('overrideEvaluation', e)}
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {#if project.settingsOverride?.overrideEvaluation}
              <div class="border-t border-outline-variant/30 pt-4 animate-fade-in">
                <EvaluationDetailsSettings 
                  settings={project.settingsOverride} 
                  onchange={() => store.saveProjects()} 
                />
              </div>
            {:else}
              <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">fact_check</span>
                <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                  Using global evaluation details settings.
                </p>
              </div>
            {/if}

          {:else if activeTab === 'prompt'}
            <!-- Prompt Override Toggle -->
            <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-on-surface">{t('lessonSettings.overrideSystemPromptLabel')}</span>
                <span class="text-[10.5px] text-outline leading-tight">{t('lessonSettings.overrideSystemPromptDesc')}</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={project.settingsOverride?.overrideSystemPrompt || false} 
                  onchange={(e) => handleToggleOverride('overrideSystemPrompt', e)}
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {#if project.settingsOverride?.overrideSystemPrompt}
              <div class="flex flex-col gap-3 border-t border-outline-variant/30 pt-4 animate-fade-in">
                <div class="flex flex-col gap-1.5">
                  <div class="flex justify-between items-center">
                    <label for="lessonSystemPromptArea" class="text-xs font-bold text-on-surface">
                      {t('lessonSettings.lessonPromptTemplate')}
                    </label>
                    <button 
                      type="button" 
                      onclick={resetPromptToDefault}
                      class="text-[10.5px] text-primary hover:underline font-semibold focus:outline-none bg-transparent border-0 cursor-pointer"
                    >
                      {t('lessonSettings.resetToDefault')}
                    </button>
                  </div>
                  <textarea
                    id="lessonSystemPromptArea"
                    value={project.settingsOverride.customSystemPrompt || DEFAULT_SYSTEM_PROMPT}
                    oninput={handlePromptInput}
                    rows="6"
                    class="w-full text-xs font-mono p-3 bg-surface-container-low border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary custom-scrollbar"
                    spellcheck="false"
                  ></textarea>
                  <p class="text-[9px] text-on-surface-variant leading-tight">
                    {t('lessonSettings.placeholdersLabel')} <code>{"{{"}task_name{"}}"}</code> <code>{"{{"}task_instructions{"}}"}</code> <code>{"{{"}task_solution{"}}"}</code> <code>{"{{"}guidelines{"}}"}</code> <code>{"{{"}page_info{"}}"}</code> <code>{"{{"}image_dimensions{"}}"}</code>
                  </p>
                </div>
              </div>
            {:else}
              <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">terminal</span>
                <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                  Using global system prompt.
                </p>
              </div>
            {/if}

          {:else if activeTab === 'numbering'}
            <!-- Task Numbering Override Toggle -->
            <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-on-surface">{t('lessonSettings.overrideTaskNumberingLabel')}</span>
                <span class="text-[10.5px] text-outline leading-tight">{t('lessonSettings.overrideTaskNumberingDesc')}</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={project.settingsOverride?.overrideTaskNumbering || false} 
                  onchange={(e) => handleToggleOverride('overrideTaskNumbering', e)}
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {#if project.settingsOverride?.overrideTaskNumbering}
              <div class="border-t border-outline-variant/30 pt-4 animate-fade-in">
                <TaskNumberingConfig 
                  settings={project.settingsOverride} 
                  onchange={() => store.saveProjects()} 
                />
              </div>
            {:else}
              <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">format_list_numbered</span>
                <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto font-medium">
                  {t('settings.taskNumbering.title')}: {store.settings.autoNumberTasks ? `${t('settings.taskNumbering.autoNumber')} (${store.settings.taskNumberingTemplate})` : (store.settings.language === 'Deutsch' ? 'Deaktiviert' : 'Deactivated')}
                </p>
              </div>
            {/if}

          {:else if activeTab === 'mediaFilter'}
            <!-- Media Filter Override Toggle -->
            <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-on-surface">{t('settings.api.mediaFilterMode')} (Override)</span>
                <span class="text-[10.5px] text-outline leading-tight">Möchtest du die Medienfilter für diese Lektion überschreiben?</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={project.settingsOverride?.overrideMediaFilter || false} 
                  onchange={(e) => handleToggleOverride('overrideMediaFilter', e)}
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {#if project.settingsOverride?.overrideMediaFilter}
              <div class="border-t border-outline-variant/30 pt-4 animate-fade-in">
                <MediaFilterSettings 
                  settings={project.settingsOverride} 
                  onchange={() => store.saveProjects()} 
                />
              </div>
            {:else}
              <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">filter_alt</span>
                <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto font-medium">
                  Task: {store.settings.taskMediaFilterMode === 'whitelist' ? 'Whitelist' : 'Blacklist'} ({store.settings.taskMediaFilterExtensions || 'None'}), 
                  Solution: {store.settings.solutionMediaFilterMode === 'whitelist' ? 'Whitelist' : 'Blacklist'} ({store.settings.solutionMediaFilterExtensions || 'None'})
                </p>
              </div>
            {/if}
          {/if}
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex justify-end gap-2 pt-4 border-t border-outline-variant shrink-0 mt-2">
        <button
          type="button"
          onclick={handleCancel}
          class="px-4 py-2 border border-outline-variant rounded-lg font-semibold text-xs text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer focus:outline-none"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onclick={handleSave}
          class="px-4 py-2 bg-primary text-on-primary rounded-lg font-semibold text-xs hover:bg-primary-hover transition-colors cursor-pointer focus:outline-none"
        >
          {t('lessonSettings.saveSettings')}
        </button>
      </div>
    </div>
  </div>
{/if}
