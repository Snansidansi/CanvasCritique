<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import { saveMediaToDb } from '../../db/media';

  let {
    isCustomBgModalOpen = $bindable(),
    activeBg = $bindable()
  } = $props();

  let newBgName = $state('');
  let newBgFile = $state<File | null>(null);
  let newBgIconFile = $state<File | null>(null);
  let useBgAsIcon = $state(true);

  function handleBgUploadChange(e: any) {
    newBgFile = e.target.files[0];
  }
  
  function handleBgIconUploadChange(e: any) {
    newBgIconFile = e.target.files[0];
  }

  async function handleAddCustomBg(e: Event) {
    e.preventDefault();
    if (!newBgName.trim() || !newBgFile) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const bgUrl = event.target?.result as string;

      if (useBgAsIcon || !newBgIconFile) {
        const bg = await store.addCustomBackground(newBgName.trim(), bgUrl, bgUrl);
        activeBg = bg.id;
        isCustomBgModalOpen = false;
        resetCustomBgModal();
      } else {
        const iconReader = new FileReader();
        iconReader.onload = async (iconEvent) => {
          const iconUrl = iconEvent.target?.result as string;
          const bg = await store.addCustomBackground(newBgName.trim(), bgUrl, iconUrl);
          activeBg = bg.id;
          isCustomBgModalOpen = false;
          resetCustomBgModal();
        };
        iconReader.readAsDataURL(newBgIconFile);
      }
    };
    reader.readAsDataURL(newBgFile);
  }

  function resetCustomBgModal() {
    newBgName = '';
    newBgFile = null;
    newBgIconFile = null;
    useBgAsIcon = true;
  }
</script>

{#if isCustomBgModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm select-none">
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-100 shadow-xl flex flex-col gap-4">
      <h3 class="font-bold text-base text-on-surface">{t('practice.customBg.title')}</h3>
      
      <form onsubmit={handleAddCustomBg} class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-semibold text-on-surface-variant" for="bgName">{t('practice.customBg.nameLabel')}</label>
          <input 
            type="text" 
            id="bgName" 
            bind:value={newBgName} 
            placeholder="e.g., Slant 55° Ruled Guidelines"
            class="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            required
          />
        </div>
        
        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-on-surface-variant">{t('practice.customBg.uploadPattern')}</span>
          <input 
            type="file" 
            accept="image/*"
            onchange={handleBgUploadChange}
            class="text-xs text-on-surface bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
            required
          />
        </div>
        
        <div class="flex items-center gap-2 mt-1">
          <input 
            type="checkbox" 
            id="useAsIcon" 
            bind:checked={useBgAsIcon}
            class="w-4 h-4 text-primary bg-surface border-outline-variant focus:ring-primary focus:outline-none rounded cursor-pointer"
          />
          <label class="text-xs text-on-surface-variant select-none cursor-pointer font-semibold" for="useAsIcon">{t('practice.customBg.useAsIcon')}</label>
        </div>
        
        {#if !useBgAsIcon}
          <div class="flex flex-col gap-1 animate-fade-in">
            <span class="text-xs font-semibold text-on-surface-variant">{t('practice.customBg.uploadIcon')}</span>
            <input 
              type="file" 
              accept="image/*"
              onchange={handleBgIconUploadChange}
              class="text-xs text-on-surface bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
            />
          </div>
        {/if}
        
        <div class="flex justify-end gap-3 mt-2">
          <button 
            type="button" 
            onclick={() => { isCustomBgModalOpen = false; resetCustomBgModal(); }}
            class="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button 
            type="submit"
            class="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer"
          >
            {t('practice.customBg.addTemplate')}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
