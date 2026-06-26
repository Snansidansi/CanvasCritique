<script lang="ts">
  import { store, DEFAULT_SYSTEM_PROMPT } from '../../state/store.svelte';
  import AiModelConfig from '../settings/AiModelConfig.svelte';
  import EvaluationDetailsSettings from '../settings/EvaluationDetailsSettings.svelte';
  import CanvasModeSelector from '../settings/CanvasModeSelector.svelte';
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
        apiProvider: store.settings.apiProvider,
        geminiModel: store.settings.geminiModel,
        openRouterModel: store.settings.openRouterModel,
        openRouterProvider: [...(store.settings.openRouterProvider || [])],
        openRouterReasoning: store.settings.openRouterReasoning,
        sendTaskMedia: store.settings.sendTaskMedia,
        sendSolutionMedia: store.settings.sendSolutionMedia,
        sendCanvasBackground: store.settings.sendCanvasBackground,
        sendTaskText: store.settings.sendTaskText,
        sendSolutionText: store.settings.sendSolutionText,
        language: store.settings.language,
        customSystemPrompt: store.settings.customSystemPrompt || '',
        canvasMode: store.settings.canvasMode
      };
    }
  });

  // Local state for toggling system prompt custom override inside modal
  let hasCustomSystemPrompt = $state(false);

  // Tab navigation state
  type TabId = 'model' | 'canvas' | 'evaluation' | 'prompt';
  let activeTab = $state<TabId>('model');

  const tabs = [
    { id: 'model', labelKey: 'lessonSettings.modelConfigTitle', icon: 'smart_toy' },
    { id: 'canvas', labelKey: 'lessonSettings.canvasLayoutTitle', icon: 'aspect_ratio' },
    { id: 'evaluation', labelKey: 'lessonSettings.evaluationDetailsTitle', icon: 'fact_check' },
    { id: 'prompt', labelKey: 'lessonSettings.systemPromptTitle', icon: 'terminal' }
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
      if (project.settingsOverride.overrideEvaluation === undefined) {
        project.settingsOverride.overrideEvaluation = project.settingsOverride.overrideSettings || false;
      }
      if (project.settingsOverride.overrideSystemPrompt === undefined) {
        project.settingsOverride.overrideSystemPrompt = project.settingsOverride.overrideSettings || false;
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

  function handleToggleOverride(category: 'overrideModel' | 'overrideCanvas' | 'overrideEvaluation' | 'overrideSystemPrompt', e: Event & { currentTarget: HTMLInputElement }) {
    if (!project.settingsOverride) return;
    const checked = e.currentTarget.checked;
    project.settingsOverride[category] = checked;

    // Keep overall overrideSettings in sync
    project.settingsOverride.overrideSettings = !!(
      project.settingsOverride.overrideModel ||
      project.settingsOverride.overrideCanvas ||
      project.settingsOverride.overrideEvaluation ||
      project.settingsOverride.overrideSystemPrompt
    );

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
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-full max-w-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden animate-fade-in">
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

      <!-- Tab Bar -->
      <div class="flex gap-1 overflow-x-auto no-scrollbar border-b border-outline-variant/30 mt-4 mb-2 shrink-0">
        {#each tabs as tab}
          <button
            onclick={() => activeTab = tab.id as TabId}
            class="flex items-center gap-1.5 px-4 py-2.5 font-semibold text-xs border-b-2 transition-colors shrink-0 focus:outline-none rounded-t-lg
                   {activeTab === tab.id
                     ? 'text-primary border-primary bg-primary/5'
                     : 'text-on-surface-variant border-transparent hover:bg-surface-variant/30 hover:text-on-surface'}"
          >
            <span class="material-symbols-outlined text-[16px]">{tab.icon}</span>
            {t(tab.labelKey)}
          </button>
        {/each}
      </div>

      <!-- Modal Content (Scrollable) -->
      <div class="grow overflow-y-auto py-2 pr-1 flex flex-col gap-4 custom-scrollbar">
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
                {t('lessonSettings.usingGlobalDesc', { provider: store.settings.apiProvider === 'gemini' ? 'Gemini' : 'OpenRouter', model: store.settings.apiProvider === 'gemini' ? store.settings.geminiModel : store.settings.openRouterModel })}
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
            <div class="border-t border-outline-variant/30 pt-4 animate-fade-in">
              <CanvasModeSelector 
                settings={project.settingsOverride} 
                onchange={() => store.saveProjects()} 
              />
            </div>
          {:else}
            <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
              <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">aspect_ratio</span>
              <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
              <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                {t('lessonSettings.canvasLayoutTitle')}: {store.settings.canvasMode === 'side-by-side' ? 'Side by Side' : 'Split Screen'}
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
        {/if}
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
