<script lang="ts">
  import { store } from '../../state/store.svelte';

  let { 
    isOpen = $bindable(false), 
    mode = 'create', 
    profileId = '', 
    onDeleteRequest 
  }: {
    isOpen: boolean;
    mode: 'create' | 'edit';
    profileId: string;
    onDeleteRequest: (profile: any) => void;
  } = $props();

  let profileFormName = $state('');
  let profileFormColor = $state('#3b82f6');
  let profileFormIcon = $state<string | null>(null);
  let fileInputProfile: HTMLInputElement | null = $state(null);

  const presetColors = [
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#8b5cf6', // Violet
    '#ef4444', // Red
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#6366f1'  // Indigo
  ];

  // Sync form inputs when opening or switching profiles
  $effect(() => {
    if (isOpen) {
      if (mode === 'create') {
        profileFormName = '';
        profileFormColor = presetColors[Math.floor(Math.random() * presetColors.length)];
        profileFormIcon = null;
      } else {
        const profile = store.profiles.find(p => p.id === profileId);
        if (profile) {
          profileFormName = profile.name;
          profileFormColor = profile.color || '#3b82f6';
          profileFormIcon = profile.icon || null;
        }
      }
    }
  });

  function handleSaveProfile(e: Event) {
    e.preventDefault();
    if (!profileFormName.trim()) return;

    if (mode === 'create') {
      const newProf = store.addProfile(profileFormName.trim(), profileFormIcon, profileFormColor);
      store.selectProfile(newProf.id);
    } else {
      store.updateProfile(profileId, {
        name: profileFormName.trim(),
        icon: profileFormIcon,
        color: profileFormColor
      });
    }
    isOpen = false;
  }

  function handleProfileIconSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      profileFormIcon = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function triggerProfileIconUpload() {
    fileInputProfile?.click();
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm select-none animate-fade-in">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-96 shadow-2xl flex flex-col gap-5">
      <header class="flex justify-between items-center">
        <h3 class="font-bold text-lg text-on-surface">
          {mode === 'create' ? 'Create Theme Profile' : 'Edit Theme Profile'}
        </h3>
        <button 
          onclick={() => isOpen = false}
          class="material-symbols-outlined text-[20px] text-on-surface-variant hover:bg-surface-container p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors"
        >
          close
        </button>
      </header>
      
      <form onsubmit={handleSaveProfile} class="flex flex-col gap-4">
        <!-- Profile Name -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-bold text-on-surface-variant" for="profileName">Profile Name</label>
          <input 
            type="text" 
            id="profileName" 
            bind:value={profileFormName} 
            placeholder="e.g., School, University, Work"
            class="bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-full"
            required
            autofocus
          />
        </div>

        <!-- Profile Icon/Avatar -->
        <div class="flex flex-col gap-2">
          <span class="text-xs font-bold text-on-surface-variant">Profile Icon / Avatar</span>
          
          <input 
            type="file" 
            accept="image/*" 
            bind:this={fileInputProfile} 
            onchange={handleProfileIconSelect}
            class="hidden" 
          />

          <div class="flex items-center gap-4">
            <!-- Icon Preview -->
            {#if profileFormIcon}
              <div class="relative shrink-0">
                <img src={profileFormIcon} class="w-16 h-16 rounded-full object-cover border border-outline-variant shadow-sm" alt="" />
                <button
                  type="button"
                  onclick={() => profileFormIcon = null}
                  class="absolute -top-1 -right-1 bg-error text-white rounded-full p-0.5 shadow-sm hover:scale-105 transition-transform flex items-center justify-center"
                  title="Remove Image"
                >
                  <span class="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            {:else}
              <div 
                style="background-color: {profileFormColor}"
                class="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0 shadow-sm border border-outline-variant"
              >
                {profileFormName ? profileFormName.charAt(0).toUpperCase() : 'P'}
              </div>
            {/if}

            <div class="flex flex-col gap-1.5">
              <button
                type="button"
                onclick={triggerProfileIconUpload}
                class="px-3.5 py-1.5 bg-surface border border-outline-variant hover:bg-surface-container text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1 focus:outline-none"
              >
                <span class="material-symbols-outlined text-[16px]">upload</span>
                Upload Custom Image
              </button>
              <p class="text-[10px] text-on-surface-variant">JPG, PNG supported. Square image recommended.</p>
            </div>
          </div>
        </div>

        <!-- Color Selection (only shown when custom icon is not set) -->
        {#if !profileFormIcon}
          <div class="flex flex-col gap-2 border-t border-outline-variant/30 pt-3">
            <span class="text-xs font-bold text-on-surface-variant">Initials Background Color</span>
            <div class="flex flex-wrap gap-2.5">
              {#each presetColors as color}
                <button
                  type="button"
                  onclick={() => profileFormColor = color}
                  style="background-color: {color}"
                  class="w-7 h-7 rounded-full border-2 transition-all cursor-pointer relative shrink-0
                         {profileFormColor === color ? 'border-primary ring-2 ring-primary/20 scale-105' : 'border-white/20 hover:scale-105'}"
                >
                  {#if profileFormColor === color}
                    <span class="material-symbols-outlined text-[16px] text-white absolute inset-0 flex items-center justify-center">check</span>
                  {/if}
                </button>
              {/each}
              
              <!-- Custom Color Input -->
              <div class="relative w-7 h-7 rounded-full overflow-hidden border border-outline-variant hover:scale-105 transition-transform cursor-pointer">
                <input 
                  type="color" 
                  bind:value={profileFormColor} 
                  class="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                />
                <div class="w-full h-full flex items-center justify-center bg-surface-container-high text-on-surface">
                  <span class="material-symbols-outlined text-[16px]">palette</span>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="flex justify-between items-center mt-3 pt-3 border-t border-outline-variant/30">
          <!-- Delete button (only in edit mode and if there are multiple profiles) -->
          {#if mode === 'edit' && store.profiles.length > 1}
            <button 
              type="button" 
              onclick={() => {
                const profile = store.profiles.find(p => p.id === profileId);
                if (profile) onDeleteRequest(profile);
              }}
              class="px-4 py-2 text-error hover:bg-error/10 text-xs font-bold rounded-lg cursor-pointer focus:outline-none flex items-center gap-1 transition-colors"
            >
              <span class="material-symbols-outlined text-[16px]">delete</span>
              Delete Profile
            </button>
          {:else}
            <div></div> <!-- Spacer -->
          {/if}

          <div class="flex gap-2.5">
            <button 
              type="button" 
              onclick={() => isOpen = false}
              class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-bold rounded-lg hover:bg-surface-container cursor-pointer focus:outline-none"
            >
              Cancel
            </button>
            <button 
              type="submit"
              class="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer focus:outline-none"
            >
              {mode === 'create' ? 'Create Profile' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}
