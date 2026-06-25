<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../../state/store.svelte';

  let isDetecting = $state(false);

  // Handle adding/registering a detected button
  function handleDetectedButton(button: number, buttons: number) {
    // Strip primary tip bit (1) from buttons mask
    const cleanButtons = (buttons & ~1);

    // Check if this combination already exists
    const exists = store.settings.stylusButtons.some(
      b => b.button === button && b.buttons === cleanButtons
    );
    if (exists) {
      // Just end detection if it already exists
      isDetecting = false;
      return;
    }

    const newId = 'stylus-btn-' + Date.now();
    
    // Generate a user-friendly default name based on values
    let btnName = `Stylus Button (btn: ${button})`;
    if (cleanButtons === 32 || button === 5) {
      btnName = 'Eraser Tip';
    } else if (cleanButtons === 2 || button === 2) {
      btnName = 'Barrel Button 1';
    } else if (cleanButtons === 4 || button === 1) {
      btnName = 'Barrel Button 2';
    }

    const newBtn = {
      id: newId,
      name: btnName,
      button: button,
      buttons: cleanButtons,
      action: (cleanButtons === 32 || button === 5) ? 'eraser' as const : 'eraser' as const
    };
    store.settings.stylusButtons = [...store.settings.stylusButtons, newBtn];
    store.saveSettings();
    isDetecting = false;
  }

  onMount(() => {
    const handleGlobalPointer = (e: PointerEvent) => {
      if (!isDetecting) return;

      // Detect pen or mouse interaction
      if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
        // e.buttons bitmask has ~1 (bits other than primary/tip down). 
        // e.button !== 0 and !== -1 means a secondary button triggered the event.
        const hasButtonPressed = (e.buttons & ~1) !== 0 || (e.button !== 0 && e.button !== -1);
        if (hasButtonPressed) {
          e.preventDefault();
          
          let button = e.button;
          let buttons = e.buttons;
          
          // Map buttons mask to standard button index if button is -1 (e.g. on pointermove hover)
          if (button === -1) {
            if ((buttons & 2) !== 0) button = 2; // Right click / Barrel 1
            else if ((buttons & 4) !== 0) button = 1; // Middle click / Barrel 2
            else if ((buttons & 32) !== 0) button = 5; // Eraser tip
          }
          
          handleDetectedButton(button, buttons);
        }
      }
    };

    const handleGlobalContextMenu = (e: MouseEvent) => {
      if (!isDetecting) return;
      e.preventDefault();
      // Right-click button is always button 2, buttons mask is 2
      handleDetectedButton(2, 2);
    };

    // Use capture phase to intercept events before other handlers can stop propagation
    window.addEventListener('pointerdown', handleGlobalPointer, true);
    window.addEventListener('pointermove', handleGlobalPointer, true);
    window.addEventListener('pointerup', handleGlobalPointer, true);
    window.addEventListener('contextmenu', handleGlobalContextMenu, true);

    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointer, true);
      window.removeEventListener('pointermove', handleGlobalPointer, true);
      window.removeEventListener('pointerup', handleGlobalPointer, true);
      window.removeEventListener('contextmenu', handleGlobalContextMenu, true);
    };
  });

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
    Customize how your stylus buttons and eraser tips behave on the canvas.
  </p>

  <!-- Instruction Block and Detect Trigger -->
  <div class="mb-6 p-5 bg-surface-container-low border border-outline-variant/60 rounded-xl space-y-4 shadow-sm">
    <h4 class="text-xs font-bold text-on-surface flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[16px] text-primary">info</span>
      How to configure stylus buttons
    </h4>
    <ol class="text-[11px] text-on-surface-variant space-y-2 list-decimal pl-4 leading-relaxed">
      <li>Click the <strong>"Detect Stylus Button"</strong> button below to start detection mode.</li>
      <li>Touch your stylus to the display screen.</li>
      <li>Press the physical button on your stylus that you want to map. (Nothing will register until you press the button).</li>
      <li>The button will be recorded, added to the list below, and detection mode will end.</li>
    </ol>
    
    <div class="pt-2 flex justify-start">
      <button
        type="button"
        onclick={() => isDetecting = true}
        class="px-4 py-2.5 bg-primary hover:opacity-90 text-on-primary text-xs font-bold rounded-lg cursor-pointer transition-opacity shadow-sm flex items-center gap-2 border-0"
      >
        <span class="material-symbols-outlined text-[16px]">radar</span>
        <span>Detect Stylus Button</span>
      </button>
    </div>
  </div>

  <!-- Mappings List -->
  <div class="flex flex-col gap-4">
    <div class="hidden md:grid grid-cols-12 gap-3 px-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
      <div class="col-span-5">Button Name / Label</div>
      <div class="col-span-3">Trigger Values</div>
      <div class="col-span-3">Action Operation</div>
      <div class="col-span-1 text-right">Delete</div>
    </div>

    {#each store.settings.stylusButtons as btn (btn.id)}
      <div class="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-surface-container-lowest border border-outline-variant/40 rounded-lg items-center transition-all hover:border-outline-variant/80">
        <!-- Label input -->
        <div class="col-span-1 md:col-span-5 flex flex-col gap-1">
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

        <!-- Trigger values (read-only text) -->
        <div class="col-span-1 md:col-span-3 flex flex-col gap-1">
          <span class="md:hidden text-[10px] font-bold text-on-surface-variant uppercase">Trigger Values</span>
          <span class="text-xs text-on-surface-variant bg-surface-container px-2.5 py-1.5 rounded border border-outline-variant/30 font-mono inline-block w-fit">
            btn: {btn.button} / mask: {btn.buttons}
          </span>
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
        No custom button actions configured. Click "Detect Stylus Button" above to detect and map one.
      </div>
    {/each}
  </div>
</section>

<!-- Detection Modal Overlay -->
{#if isDetecting}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-96 shadow-xl flex flex-col gap-4 text-center">
      <div class="w-16 h-16 rounded-full bg-primary-container text-primary flex items-center justify-center mx-auto mb-2">
        <span class="material-symbols-outlined text-[32px] animate-pulse">radar</span>
      </div>
      <h3 class="font-bold text-lg text-on-surface">Detecting Stylus Button</h3>
      <p class="text-xs text-on-surface-variant leading-relaxed">
        1. Place your stylus tip on the display.<br>
        2. Press the stylus button you wish to map.<br>
        <span class="text-primary font-semibold mt-2 block">Nothing will happen until you press a button on the pen.</span>
      </p>
      <div class="flex justify-center mt-4">
        <button 
          type="button" 
          onclick={() => isDetecting = false}
          class="px-4 py-2 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
        >
          Cancel Detection
        </button>
      </div>
    </div>
  </div>
{/if}
