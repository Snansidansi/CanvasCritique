<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import { getMediaDataUrl, saveMediaToDb } from '../../db/media';

  let {
    isOpen = $bindable(false),
    onSelect
  }: {
    isOpen: boolean;
    onSelect: (icon: string) => void;
  } = $props();

  let resolvedUserIcons = $state<{ id: string; url: string }[]>([]);
  let isDragging = $state(false);

  // Load custom icons from media when modal is open or settings change
  $effect(() => {
    if (isOpen) {
      const ids = store.settings.userIcons || [];
      const loadIcons = async () => {
        const list = [];
        for (const id of ids) {
          try {
            const url = await getMediaDataUrl(id);
            list.push({ id, url });
          } catch (err) {
            console.error('[LessonIconModal] Failed to load user icon:', id, err);
          }
        }
        resolvedUserIcons = list;
      };
      loadIcons();
    }
  });

  async function handleFileUpload(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const mediaId = await saveMediaToDb(dataUrl);
        // Add to settings.userIcons if not already present
        if (!store.settings.userIcons) {
          store.settings.userIcons = [];
        }
        if (!store.settings.userIcons.includes(mediaId)) {
          store.settings.userIcons.push(mediaId);
          await store.saveSettings();
        }
        onSelect(mediaId);
        isOpen = false;
      } catch (err) {
        console.error('[LessonIconModal] Failed to save media:', err);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    (e.target as HTMLInputElement).value = '';
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }

  function handleDeleteClick(e: MouseEvent, mediaId: string) {
    e.stopPropagation();
    store.confirm(
      t('projectDetail.deleteIconConfirmTitle'),
      t('projectDetail.deleteIconConfirmMsg'),
      async () => {
        await store.deleteUserIcon(mediaId);
      }
    );
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    ondragover={(e) => { e.preventDefault(); e.stopPropagation(); }}
    ondragenter={(e) => { e.preventDefault(); e.stopPropagation(); }}
    ondragleave={(e) => { e.preventDefault(); e.stopPropagation(); }}
    ondrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
  >
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 w-md max-h-[85vh] shadow-xl flex flex-col gap-4 overflow-y-auto">
      <h3 class="font-bold text-lg text-on-surface">
        {t('projectDetail.iconSelectionModalTitle')}
      </h3>

      <div class="flex flex-col gap-4">
        <!-- Default Icons -->
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-on-surface-variant">
            {t('projectDetail.defaultIconsLabel')}
          </span>
          <div class="grid grid-cols-4 gap-2">
            {#each ["history_edu", "draw", "ink_pen", "edit_square", "palette", "brush", "format_paint", "signature", "gesture", "border_color", "content_cut", "text_fields"] as icon}
              <button
                type="button"
                onclick={() => { onSelect(icon); isOpen = false; }}
                class="p-2.5 border border-outline-variant rounded-lg flex items-center justify-center hover:bg-surface-container text-on-surface-variant cursor-pointer transition-colors"
              >
                <span class="material-symbols-outlined text-[24px]">{icon}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- User Icons -->
        {#if resolvedUserIcons.length > 0}
          <div class="flex flex-col gap-1.5 mt-2">
            <span class="text-xs font-semibold text-on-surface-variant">
              {t('projectDetail.userIconsLabel')}
            </span>
            <div class="grid grid-cols-4 gap-2">
              {#each resolvedUserIcons as userIcon}
                <div class="relative group aspect-square">
                  <button
                    type="button"
                    onclick={() => { onSelect(userIcon.id); isOpen = false; }}
                    class="w-full h-full p-2 border border-outline-variant rounded-lg flex items-center justify-center hover:bg-surface-container cursor-pointer overflow-hidden transition-colors"
                  >
                    <img src={userIcon.url} class="w-full h-full object-contain rounded" alt="" />
                  </button>
                  <!-- Delete button on hover -->
                  <button
                    type="button"
                    onclick={(e) => handleDeleteClick(e, userIcon.id)}
                    class="absolute -top-1.5 -right-1.5 bg-error hover:opacity-90 text-white rounded-full w-5 h-5 flex items-center justify-center shadow transition-all scale-0 group-hover:scale-100 focus:outline-none cursor-pointer z-10"
                    title={t('common.delete')}
                  >
                    <span class="material-symbols-outlined text-[14px] font-bold">close</span>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Drag & Drop Import Area -->
        <div class="flex flex-col gap-1.5 mt-2">
          <div
            role="button"
            tabindex="0"
            onclick={() => document.getElementById('icon-upload-input')?.click()}
            onkeydown={(e) => e.key === 'Enter' && document.getElementById('icon-upload-input')?.click()}
            ondragover={handleDragOver}
            ondragenter={handleDragEnter}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
            class="border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer select-none text-center
                   {isDragging
                     ? 'border-primary bg-primary/10 text-primary'
                     : 'border-outline-variant text-on-surface-variant hover:border-primary hover:bg-primary/5'}"
          >
            <input
              type="file"
              id="icon-upload-input"
              accept="image/*"
              class="hidden"
              onchange={handleFileSelect}
            />
            <span class="material-symbols-outlined text-[32px]">upload_file</span>
            <span class="text-xs font-medium">
              {t('projectDetail.dragDropIconPrompt')}
            </span>
          </div>
        </div>
      </div>

      <div class="flex justify-end mt-2">
        <button
          type="button"
          onclick={() => (isOpen = false)}
          class="px-4 py-2 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container-high cursor-pointer"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  </div>
{/if}
