<script lang="ts">
  import { store, DEFAULT_SYSTEM_PROMPT } from '../../state/store.svelte';

  function togglePromptEditing(e: Event & { currentTarget: HTMLInputElement }) {
    const checked = e.currentTarget.checked;
    if (checked) {
      // Show confirmation dialog before enabling
      store.confirm(
        'System-Prompt bearbeiten?',
        'Warnung: Das Bearbeiten des System-Prompts erfolgt auf eigene Gefahr! Fehlerhafte Änderungen können das Programm beschädigen oder dazu führen, dass der KI-Parser fehlschlägt. Möchtest du das Bearbeiten wirklich aktivieren?',
        () => {
          store.settings.systemPromptEditingEnabled = true;
          // Pre-populate with default if currently empty
          if (!store.settings.customSystemPrompt) {
            store.settings.customSystemPrompt = DEFAULT_SYSTEM_PROMPT;
          }
          store.saveSettings();
        },
        () => {
          // Revert toggle
          e.currentTarget.checked = false;
        }
      );
    } else {
      // Disabling editing automatically resets to default
      store.settings.systemPromptEditingEnabled = false;
      store.settings.customSystemPrompt = '';
      store.saveSettings();
    }
  }

  function resetPromptToDefault() {
    store.settings.customSystemPrompt = DEFAULT_SYSTEM_PROMPT;
    store.saveSettings();
  }

  function handlePromptInput(e) {
    store.settings.customSystemPrompt = e.target.value;
    store.saveSettings();
  }
</script>

<!-- System Prompt Section -->
<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm relative overflow-visible">
  <div class="absolute top-0 right-0 w-64 h-64 bg-primary-fixed/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none z-0"></div>
  
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4 relative z-10">
    <span class="material-symbols-outlined text-primary">neurology</span>
    <h3 class="text-lg font-bold text-on-surface">System Prompt</h3>
  </div>
  
  <div class="relative z-10 flex flex-col gap-4">
    <p class="text-xs text-on-surface-variant leading-relaxed">
      Here you can view and edit the global instructions sent to the AI model during evaluations.
    </p>

    <!-- Editing Toggle with Warning banner -->
    <div class="flex flex-col gap-2 p-3 rounded-lg bg-surface-container-low border border-outline-variant/30">
      <div class="flex items-center justify-between">
        <div class="flex flex-col gap-0.5">
          <span class="text-xs font-bold text-on-surface">Enable Custom System Prompt</span>
          <span class="text-[10.5px] text-outline leading-tight">Allows you to overwrite the default grading instructions.</span>
        </div>
        <label class="relative inline-flex items-center cursor-pointer select-none">
          <input 
            type="checkbox" 
            checked={store.settings.systemPromptEditingEnabled} 
            onchange={togglePromptEditing}
            class="sr-only peer"
          />
          <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>
      
      {#if store.settings.systemPromptEditingEnabled}
        <div class="mt-2 flex items-start gap-2 p-2.5 bg-error/10 border border-error/20 rounded-lg text-[11px] text-error leading-normal animate-fade-in">
          <span class="material-symbols-outlined text-[16px] shrink-0 mt-0.5">warning</span>
          <div>
            <strong>Achtung / Warning:</strong> Das Bearbeiten des System-Prompts erfolgt auf eigene Gefahr! Falsche Anweisungen oder fehlende Platzhalter können das Programm funktionsunfähig machen (z. B. wenn das JSON-Format nicht eingehalten wird).
          </div>
        </div>
      {/if}
    </div>

    {#if store.settings.systemPromptEditingEnabled}
      <!-- Textarea containing the Prompt -->
      <div class="flex flex-col gap-1.5 mt-4">
        <div class="flex justify-between items-center">
          <label for="systemPromptArea" class="text-xs font-bold text-on-surface">
            Edit System Prompt Template
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
          id="systemPromptArea"
          value={store.settings.customSystemPrompt || DEFAULT_SYSTEM_PROMPT}
          oninput={handlePromptInput}
          rows="10"
          class="w-full text-xs font-mono p-3 bg-surface-container-low border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary custom-scrollbar"
          spellcheck="false"
        ></textarea>
        <p class="text-[10px] text-on-surface-variant mt-1">
          Placeholders: <code class="bg-surface-container px-1 py-0.5 rounded text-on-surface">{"{{"}task_name{"}}"}</code> <code class="bg-surface-container px-1 py-0.5 rounded text-on-surface">{"{{"}task_instructions{"}}"}</code> <code class="bg-surface-container px-1 py-0.5 rounded text-on-surface">{"{{"}task_solution{"}}"}</code> <code class="bg-surface-container px-1 py-0.5 rounded text-on-surface">{"{{"}guidelines{"}}"}</code> <code class="bg-surface-container px-1 py-0.5 rounded text-on-surface">{"{{"}page_info{"}}"}</code> <code class="bg-surface-container px-1 py-0.5 rounded text-on-surface">{"{{"}image_dimensions{"}}"}</code>
        </p>
      </div>
    {/if}
  </div>
</section>
