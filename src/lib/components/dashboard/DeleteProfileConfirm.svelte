<script lang="ts">
  import { store } from '../../state/store.svelte';

  let { 
    isOpen = $bindable(false), 
    profileToDelete, 
    onDeleted 
  }: {
    isOpen: boolean;
    profileToDelete: any;
    onDeleted: () => void;
  } = $props();

  let deleteProfileCheckboxChecked = $state(false);

  // Reset checkbox state when open changes
  $effect(() => {
    if (isOpen) {
      deleteProfileCheckboxChecked = false;
    }
  });

  function handleConfirmDelete() {
    if (deleteProfileCheckboxChecked && profileToDelete) {
      store.deleteProfile(profileToDelete.id);
      isOpen = false;
      onDeleted();
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm select-none animate-fade-in">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-96 shadow-2xl flex flex-col gap-4">
      <div class="flex items-center gap-3 text-error">
        <span class="material-symbols-outlined text-2xl">warning</span>
        <h3 class="font-bold text-base text-on-surface">Delete Theme Profile</h3>
      </div>

      <p class="text-xs text-on-surface-variant leading-relaxed">
        Are you sure you want to delete the profile <strong>"{profileToDelete?.name}"</strong>?
      </p>
      
      <p class="text-xs text-error font-bold leading-normal bg-error/5 border border-error/10 p-3 rounded-lg">
        WARNING: This will permanently delete this theme profile, all its associated calligraphy lessons (lessons), and all assignments/drawings. This action cannot be undone.
      </p>

      <!-- Checkbox of certainty -->
      <label class="flex items-start gap-2.5 text-xs text-on-surface cursor-pointer select-none border border-outline-variant/60 rounded-lg p-3 hover:bg-surface-container-low transition-colors">
        <input 
          type="checkbox" 
          bind:checked={deleteProfileCheckboxChecked} 
          class="rounded border-outline-variant text-error focus:ring-error h-4 w-4 cursor-pointer mt-0.5" 
        />
        <div class="flex flex-col gap-0.5">
          <span class="font-semibold text-on-surface">I am sure</span>
          <span class="text-[10px] text-on-surface-variant">Yes, I want to permanently delete "{profileToDelete?.name}" and all its lessons.</span>
        </div>
      </label>

      <div class="flex justify-end gap-3 mt-2">
        <button
          onclick={() => isOpen = false}
          class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer focus:outline-none"
        >
          Cancel
        </button>
        <button
          onclick={handleConfirmDelete}
          disabled={!deleteProfileCheckboxChecked}
          class="px-4 py-2 bg-error text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none"
        >
          Permanently Delete Profile
        </button>
      </div>
    </div>
  </div>
{/if}
