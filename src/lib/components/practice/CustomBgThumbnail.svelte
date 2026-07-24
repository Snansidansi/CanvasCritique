<script lang="ts">
  import { getMediaDataUrl } from '../../db/media';

  let {
    background,
    size = 'w-6 h-6'
  }: {
    background: { mediaId?: string; iconMediaId?: string | null; icon?: string | null; name?: string };
    size?: string;
  } = $props();

  let src = $state<string | null>(null);

  $effect(() => {
    const bg = background;
    if (bg) {
      if (bg.icon && bg.icon.startsWith('data:')) {
        src = bg.icon;
      } else {
        const targetMediaId = bg.iconMediaId || bg.mediaId || (bg.icon && !bg.icon.startsWith('data:') ? bg.icon : null);
        if (targetMediaId) {
          getMediaDataUrl(targetMediaId).then(url => {
            src = url;
          }).catch(() => {
            src = null;
          });
        } else {
          src = null;
        }
      }
    }
  });
</script>

{#if src}
  <img {src} class="{size} object-cover rounded border border-outline-variant/40 shrink-0" alt={background.name || ''} />
{:else}
  <div class="{size} bg-surface-container-high rounded border border-outline-variant/40 flex items-center justify-center shrink-0">
    <span class="material-symbols-outlined text-xs text-on-surface-variant">image</span>
  </div>
{/if}
