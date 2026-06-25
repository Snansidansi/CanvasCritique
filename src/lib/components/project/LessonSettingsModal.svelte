<script lang="ts">
  import { store, DEFAULT_SYSTEM_PROMPT } from '../../state/store.svelte';
  import AiModelConfig from '../settings/AiModelConfig.svelte';
  import EvaluationDetailsSettings from '../settings/EvaluationDetailsSettings.svelte';
  import type { Project } from '../../state/types';

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
        customSystemPrompt: store.settings.customSystemPrompt || ''
      };
    }
  });

  // Local state for toggling system prompt custom override inside modal
  let hasCustomSystemPrompt = $state(false);

  $effect(() => {
    if (isOpen && project?.settingsOverride) {
      hasCustomSystemPrompt = !!project.settingsOverride.customSystemPrompt;
    }
  });

  function handleSave() {
    store.saveProjects();
    isOpen = false;
    store.showNotification('Lesson API settings saved successfully.', 'success');
  }

  function handleCancel() {
    isOpen = false;
  }

  function handleToggleOverride(e: Event & { currentTarget: HTMLInputElement }) {
    if (!project.settingsOverride) return;
    project.settingsOverride.overrideSettings = e.currentTarget.checked;
    store.saveProjects();
  }

  function handleSystemPromptToggle(e: Event & { currentTarget: HTMLInputElement }) {
    if (!project.settingsOverride) return;
    const checked = e.currentTarget.checked;
    hasCustomSystemPrompt = checked;
    if (checked) {
      if (!project.settingsOverride.customSystemPrompt) {
        project.settingsOverride.customSystemPrompt = store.settings.customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
      }
    } else {
      project.settingsOverride.customSystemPrompt = '';
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
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-full max-w-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden">
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-4 border-b border-outline-variant shrink-0">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">settings</span>
          <h3 class="font-bold text-lg text-on-surface">
            Settings override for "{project.name}"
          </h3>
        </div>
        <button 
          onclick={handleCancel}
          class="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors cursor-pointer focus:outline-none"
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <!-- Modal Content (Scrollable) -->
      <div class="grow overflow-y-auto py-4 pr-1 flex flex-col gap-5 custom-scrollbar">
        <!-- Main Override Toggle -->
        <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
          <div class="flex flex-col gap-0.5">
            <span class="text-xs font-bold text-on-surface">Override Global AI & API Settings</span>
            <span class="text-[10.5px] text-outline leading-tight">Enable to configure specific models and parameters for this lesson.</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={project.settingsOverride?.overrideSettings || false} 
              onchange={handleToggleOverride}
              class="sr-only peer"
            />
            <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {#if project.settingsOverride?.overrideSettings}
          <!-- Reusable AI Model selection component -->
          <div class="border-t border-outline-variant/30 pt-4">
            <h4 class="text-xs font-bold uppercase tracking-wider text-on-surface mb-3">Model Configuration</h4>
            <AiModelConfig 
              settings={project.settingsOverride} 
              showKeys={false} 
              onchange={() => store.saveProjects()} 
            />
          </div>

          <!-- Reusable Evaluation detail toggles -->
          <div class="border-t border-outline-variant/30 pt-4">
            <h4 class="text-xs font-bold uppercase tracking-wider text-on-surface mb-3">Evaluation Details</h4>
            <EvaluationDetailsSettings 
              settings={project.settingsOverride} 
              onchange={() => store.saveProjects()} 
            />
          </div>

          <!-- Custom system prompt override -->
          <div class="border-t border-outline-variant/30 pt-4 flex flex-col gap-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-on-surface">System Prompt</h4>
            
            <div class="flex items-center justify-between p-3 rounded-lg bg-surface-container-low border border-outline-variant/30">
              <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-on-surface">Enable Custom System Prompt</span>
                <span class="text-[10.5px] text-outline leading-tight">Allows you to overwrite the default grading instructions for this lesson.</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={hasCustomSystemPrompt} 
                  onchange={handleSystemPromptToggle}
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {#if hasCustomSystemPrompt}
              <div class="flex flex-col gap-1.5 mt-2 animate-fade-in">
                <div class="flex justify-between items-center">
                  <label for="lessonSystemPromptArea" class="text-xs font-bold text-on-surface">
                    Lesson System Prompt Template
                  </label>
                  <button 
                    type="button" 
                    onclick={resetPromptToDefault}
                    class="text-[10.5px] text-primary hover:underline font-semibold focus:outline-none bg-transparent border-0 cursor-pointer"
                  >
                    Reset to Default
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
                  Placeholders: <code>{"{{"}task_name{"}}"}</code> <code>{"{{"}task_instructions{"}}"}</code> <code>{"{{"}task_solution{"}}"}</code> <code>{"{{"}guidelines{"}}"}</code> <code>{"{{"}page_info{"}}"}</code> <code>{"{{"}image_dimensions{"}}"}</code>
                </p>
              </div>
            {/if}
          </div>
        {:else}
          <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant">
            <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">smart_toy</span>
            <p class="text-xs text-on-surface font-semibold">Using Global AI & API Settings</p>
            <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
              This lesson currently uses the global configuration from settings (Provider: <span class="font-bold text-primary">{store.settings.apiProvider === 'gemini' ? 'Gemini' : 'OpenRouter'}</span>, Model: <span class="font-mono text-[10.5px]">{store.settings.apiProvider === 'gemini' ? store.settings.geminiModel : store.settings.openRouterModel}</span>).
            </p>
            <p class="text-[10px] text-outline mt-3">Toggle "Override Global AI & API Settings" above to customize.</p>
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="flex justify-end gap-2 pt-4 border-t border-outline-variant shrink-0 mt-2">
        <button
          type="button"
          onclick={handleCancel}
          class="px-4 py-2 border border-outline-variant rounded-lg font-semibold text-xs text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer focus:outline-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={handleSave}
          class="px-4 py-2 bg-primary text-on-primary rounded-lg font-semibold text-xs hover:bg-primary-hover transition-colors cursor-pointer focus:outline-none"
        >
          Save Settings
        </button>
      </div>
    </div>
  </div>
{/if}
