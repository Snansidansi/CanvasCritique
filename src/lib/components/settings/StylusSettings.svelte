<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../../state/store.svelte';

  // Listen globally to pointer events while the settings page is mounted to record stylus presses
  onMount(() => {
    const handleGlobalPointer = (e: PointerEvent) => {
      // Capture any stylus or mouse buttons pressed
      store.recordPointerEvent(e);
    };

    window.addEventListener('pointerdown', handleGlobalPointer);
    window.addEventListener('pointermove', handleGlobalPointer);

    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointer);
      window.removeEventListener('pointermove', handleGlobalPointer);
    };
  });

  // Handle adding a new mapping manually
  function addManualButton() {
    const newId = 'stylus-btn-' + Date.now();
    const newBtn = {
      id: newId,
      name: `Stylus Button ${store.settings.stylusButtons.length + 1}`,
      button: 0,
      buttons: 0,
      action: 'pen' as const
    };
    store.settings.stylusButtons = [...store.settings.stylusButtons, newBtn];
    store.saveSettings();
  }

  // Handle adding the last detected button as a mapping
  function addDetectedButton() {
    if (!store.lastDetectedButton) return;
    const { button, buttons } = store.lastDetectedButton;
    
    // Check if this combination already exists
    const exists = store.settings.stylusButtons.some(
      b => b.button === button && b.buttons === buttons
    );
    if (exists) {
      alert('A mapping with this button/buttons configuration already exists.');
      return;
    }

    const newId = 'stylus-btn-' + Date.now();
    const newBtn = {
      id: newId,
      name: `Detected Stylus Button (${button}/${buttons})`,
      button: button,
      buttons: buttons,
      action: 'eraser' as const
    };
    store.settings.stylusButtons = [...store.settings.stylusButtons, newBtn];
    store.saveSettings();
  }

  // Handle deleting a mapping
  function deleteButton(id: string) {
    store.settings.stylusButtons = store.settings.stylusButtons.filter(b => b.id !== id);
    store.saveSettings();
  }

  // Update input values
  function handleInputChange() {
    store.saveSettings();
  }
</script>

<!-- Stylus Settings Section -->
<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm select-none">
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4">
    <span class="material-symbols-outlined text-primary font-bold">draw</span>
    <h3 class="text-lg font-bold text-on-surface">Stylus Button Actions</h3>
  </div>

  <p class="text-xs text-on-surface-variant mb-6 leading-relaxed">
    Customize how your stylus buttons and eraser tips behave on the canvas. Add new configurations for your stylus barrel buttons by matching browser pointer events.
  </p>

  <!-- Live Detector area -->
  <div class="mb-6 p-4 rounded-lg bg-surface-container-low border border-outline-variant/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="flex flex-col gap-1">
      <span class="text-xs font-bold text-on-surface">Stylus Button Live Detector</span>
      <p class="text-[11px] text-on-surface-variant">Press any button on your stylus anywhere on this settings page to identify its event values.</p>
      
      <div class="mt-2.5 flex flex-wrap items-center gap-2">
        {#if store.lastDetectedButton}
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
            <span class="material-symbols-outlined text-[14px]">sensors</span>
            Detected Stylus:
          </span>
          <span class="text-xs font-semibold text-on-surface">
            button = <code class="bg-surface-container-high px-1.5 py-0.5 rounded text-primary font-mono">{store.lastDetectedButton.button}</code>, 
            buttons = <code class="bg-surface-container-high px-1.5 py-0.5 rounded text-primary font-mono">{store.lastDetectedButton.buttons}</code> 
            <span class="text-[10px] text-on-surface-variant font-normal">({store.lastDetectedButton.pointerType})</span>
          </span>
        {:else}
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-outline-variant/30 text-on-surface-variant border border-outline-variant/20">
            <span class="material-symbols-outlined text-[14px] animate-pulse">radar</span>
            Awaiting Stylus Input...
          </span>
        {/if}
      </div>
    </div>

    {#if store.lastDetectedButton}
      <button
        type="button"
        onclick={addDetectedButton}
        class="self-start md:self-center px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-sm flex items-center gap-2 border-0"
      >
        <span class="material-symbols-outlined text-[16px]">add_circle</span>
        <span>Add Detected Button</span>
      </button>
    {/if}
  </div>

  <!-- Mappings List -->
  <div class="flex flex-col gap-4">
    <div class="hidden md:grid grid-cols-12 gap-3 px-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
      <div class="col-span-4">Button Label Name</div>
      <div class="col-span-2">Match e.button</div>
      <div class="col-span-2">Match e.buttons bit</div>
      <div class="col-span-3">Action Operation</div>
      <div class="col-span-1 text-right">Delete</div>
    </div>

    {#each store.settings.stylusButtons as btn (btn.id)}
      <div class="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-surface-container-lowest border border-outline-variant/40 rounded-lg items-center transition-all hover:border-outline-variant/80">
        <!-- Label input -->
        <div class="col-span-1 md:col-span-4 flex flex-col gap-1">
          <label class="w-full flex flex-col gap-1">
            <span class="md:hidden text-[10px] font-bold text-on-surface-variant uppercase">Label Name</span>
            <input
              type="text"
              bind:value={btn.name}
              oninput={handleInputChange}
              placeholder="e.g. Barrel Button 1"
              class="w-full px-3 py-1.5 bg-surface text-xs text-on-surface border border-outline-variant rounded-md focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>
        </div>

        <!-- Button index input -->
        <div class="col-span-1 md:col-span-2 flex flex-col gap-1">
          <label class="w-full flex flex-col gap-1">
            <span class="md:hidden text-[10px] font-bold text-on-surface-variant uppercase">e.button</span>
            <input
              type="number"
              bind:value={btn.button}
              oninput={handleInputChange}
              min="-1"
              max="10"
              class="w-full px-3 py-1.5 bg-surface text-xs text-on-surface border border-outline-variant rounded-md focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none font-mono"
            />
          </label>
        </div>

        <!-- Buttons mask input -->
        <div class="col-span-1 md:col-span-2 flex flex-col gap-1">
          <label class="w-full flex flex-col gap-1">
            <span class="md:hidden text-[10px] font-bold text-on-surface-variant uppercase">e.buttons bit</span>
            <input
              type="number"
              bind:value={btn.buttons}
              oninput={handleInputChange}
              min="0"
              max="1024"
              class="w-full px-3 py-1.5 bg-surface text-xs text-on-surface border border-outline-variant rounded-md focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none font-mono"
            />
          </label>
        </div>

        <!-- Action select -->
        <div class="col-span-1 md:col-span-3 flex flex-col gap-1">
          <label class="w-full flex flex-col gap-1">
            <span class="md:hidden text-[10px] font-bold text-on-surface-variant uppercase">Action Operation</span>
            <select
              bind:value={btn.action}
              onchange={handleInputChange}
              class="w-full px-3 py-1.5 bg-surface text-xs text-on-surface border border-outline-variant rounded-md focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="pen">Pen (Draw)</option>
              <option value="eraser">Eraser (Erase)</option>
              <option value="pan">Hand (Pan Canvas)</option>
              <option value="select">Select (Select Strokes)</option>
            </select>
          </label>
        </div>

        <!-- Delete button -->
        <div class="col-span-1 md:col-span-1 flex justify-end">
          <button
            type="button"
            onclick={() => deleteButton(btn.id)}
            class="p-2 text-error hover:bg-error/10 rounded-md cursor-pointer transition-colors border-0 bg-transparent flex items-center justify-center"
            title="Delete this button action mapping"
          >
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    {:else}
      <div class="py-6 text-center text-xs text-on-surface-variant border border-dashed border-outline-variant rounded-lg">
        No custom button actions defined. Press your stylus buttons above to detect and map them.
      </div>
    {/each}

    <!-- Add manual button -->
    <button
      type="button"
      onclick={addManualButton}
      class="mt-2 self-start px-4 py-2 border border-primary text-primary hover:bg-primary/5 text-xs font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-2 bg-transparent"
    >
      <span class="material-symbols-outlined text-[16px]">add</span>
      <span>Add Manual Button Config</span>
    </button>
  </div>
</section>
