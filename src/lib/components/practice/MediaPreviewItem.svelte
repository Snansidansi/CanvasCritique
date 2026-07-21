<script lang="ts">
  import { t } from '../../services/i18n';
  import { parseMarkdown } from '../../utils/markdown';
  import { 
    isImageFile, 
    isAudioFile, 
    isVideoFile, 
    getFileIcon, 
    isIntegratedFile, 
    openAttachmentInDefaultApp,
    getMediaBlobUrl
  } from '../../db/media';
  import AudioPlayer from './AudioPlayer.svelte';

  interface Props {
    file: { name: string; dataUrl?: string; mediaId?: string };
    mediaId: string;
    open?: boolean;
    onToggle?: (e: MouseEvent) => void;
    onSelectProvidedImage?: (file: any) => void;
    onOpenPreview?: (file: any) => void;
    fontSize?: number;
  }

  let {
    file,
    mediaId,
    open = false,
    onToggle = () => {},
    onSelectProvidedImage = undefined,
    onOpenPreview = () => {},
    fontSize = 13
  }: Props = $props();

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let isDragging = $state(false);
  let dragged = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let panBaseX = 0;
  let panBaseY = 0;
  let activePointers = new Map<number, PointerEvent>();
  let isPinching = false;
  let initialPinchDistance = 0;
  let initialPinchZoom = 1;
  let initialPinchMidpointX = 0;
  let initialPinchMidpointY = 0;
  let initialPinchPanX = 0;
  let initialPinchPanY = 0;
  let initialPinchCenterX = 0;
  let initialPinchCenterY = 0;

  let imageRatio = $state<number | null>(null);
  let naturalWidth = $state<number | null>(null);
  let naturalHeight = $state<number | null>(null);
  let fileUrl = $state('');
  let loading = $state(false);
  let error = $state(false);

  // Reset zoom/pan when accordion is closed
  $effect(() => {
    if (!open) {
      zoom = 1;
      panX = 0;
      panY = 0;
    }
  });

  // Reset states when the file prop changes, so it refreshes task switch
  $effect(() => {
    const _ = file;
    fileUrl = '';
    error = false;
    loading = false;
  });

  // Lazy load media URL ONLY when accordion is expanded!
  $effect(() => {
    if (open && !fileUrl) {
      if (file.dataUrl) {
        fileUrl = file.dataUrl;
      } else if (file.mediaId) {
        loading = true;
        getMediaBlobUrl(file.mediaId).then(url => {
          fileUrl = url;
          loading = false;
        }).catch(err => {
          console.error('[MediaPreviewItem] Failed to load:', err);
          error = true;
          loading = false;
        });
      }
    }
  });

  function getBaseName(filename: string): string {
    if (!filename) return '';
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) return filename;
    return filename.substring(0, lastDotIndex);
  }

  function decodeBase64Text(dataUrl: string): string {
    if (!dataUrl) return '';
    try {
      const base64Data = dataUrl.split(',')[1];
      return decodeURIComponent(escape(atob(base64Data)));
    } catch (e) {
      console.error('[MediaPreviewItem] Failed to decode text document', e);
      return t('taskEditor.errorDecode') || 'Fehler beim Dekodieren';
    }
  }

  function handleInlineClick(e: MouseEvent) {
    if (!dragged) {
      onOpenPreview({ name: file.name, dataUrl: fileUrl, mediaId: file.mediaId });
    }
  }

  function handleInlineWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = 0.15;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = zoom + direction * zoomFactor;
    zoom = Math.max(1, Math.min(newZoom, 4));
    if (zoom === 1) {
      panX = 0;
      panY = 0;
    }
  }

  function handleInlinePointerDown(e: PointerEvent) {
    const img = e.currentTarget as HTMLElement;
    try { img.setPointerCapture(e.pointerId); } catch (_) {}
    activePointers.set(e.pointerId, e);

    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const isMultiTouch = pts.every(p => p.pointerType === 'touch');
      if (isMultiTouch) {
        const p1 = pts[0];
        const p2 = pts[1];
        initialPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        initialPinchZoom = zoom;
        initialPinchMidpointX = (p1.clientX + p2.clientX) / 2;
        initialPinchMidpointY = (p1.clientY + p2.clientY) / 2;
        initialPinchPanX = panX;
        initialPinchPanY = panY;
        const rect = img.getBoundingClientRect();
        initialPinchCenterX = rect.left + rect.width / 2;
        initialPinchCenterY = rect.top + rect.height / 2;
        isPinching = true;
        isDragging = false;
        e.preventDefault();
        return;
      }
    }

    if (activePointers.size > 2) {
      e.preventDefault();
      return;
    }

    isDragging = true;
    dragged = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panBaseX = panX;
    panBaseY = panY;
  }

  function handleInlinePointerMove(e: PointerEvent) {
    const img = e.currentTarget as HTMLElement;
    if (e.buttons === 0) {
      activePointers.clear();
      isDragging = false;
      isPinching = false;
      return;
    }
    activePointers.set(e.pointerId, e);

    if (isPinching && activePointers.size === 2) {
      e.preventDefault();
      const pts = Array.from(activePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const currentDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const currentMidX = (p1.clientX + p2.clientX) / 2;
      const currentMidY = (p1.clientY + p2.clientY) / 2;
      if (initialPinchDistance > 0) {
        const factor = currentDistance / initialPinchDistance;
        const newZoom = Math.max(0.5, Math.min(4, initialPinchZoom * factor));
        const cx = initialPinchCenterX;
        const cy = initialPinchCenterY;
        const worldX = (initialPinchMidpointX - cx - initialPinchPanX) / initialPinchZoom;
        const worldY = (initialPinchMidpointY - cy - initialPinchPanY) / initialPinchZoom;
        zoom = newZoom;
        panX = (currentMidX - cx) - worldX * newZoom;
        panY = (currentMidY - cy) - worldY * newZoom;
      }
      return;
    }

    if (activePointers.size > 1) return;

    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragged = true;
    }
    const container = img.parentElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      const scaledW = rect.width * zoom;
      const scaledH = rect.height * zoom;
      const clampDX = Math.max(-scaledW / 3, Math.min(scaledW / 3, dx));
      const clampDY = Math.max(-scaledH / 3, Math.min(scaledH / 3, dy));
      panX = panBaseX + clampDX;
      panY = panBaseY + clampDY;
    } else {
      panX = panBaseX + dx;
      panY = panBaseY + dy;
    }
  }

  function handleInlinePointerUp(e: PointerEvent) {
    const img = e.currentTarget as HTMLElement;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) isPinching = false;
    if (activePointers.size === 0) isDragging = false;
    try { img.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  function handleInlinePointerCancel(e: PointerEvent) {
    handleInlinePointerUp(e);
  }
</script>

<div class="bg-surface-container border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col transition-all w-full">
  <!-- Header Bar -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    onclick={onToggle}
    class="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-container-high transition-colors font-sans text-xs font-semibold text-on-surface cursor-pointer select-none text-left"
  >
    <div class="flex items-center gap-2 min-w-0">
      <span class="material-symbols-outlined text-[18px] text-primary shrink-0 font-normal">
        {getFileIcon(file.name)}
      </span>
      <span class="truncate pr-4">{getBaseName(file.name)}</span>
    </div>
    <div class="flex items-center shrink-0 gap-1.5" onclick={e => e.stopPropagation()}>
      {#if isImageFile(file.name) && onSelectProvidedImage}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            onSelectProvidedImage(file);
          }}
          class="material-symbols-outlined text-[18px] text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors mr-1.5"
          title={t('practice.infoPanels.placeOnCanvas') || 'Auf Canvas platzieren'}
        >
          place_item
        </button>
      {/if}
      {#if isIntegratedFile(file.name) && !isAudioFile(file.name)}
        <button
          type="button"
          onclick={() => onOpenPreview({ name: file.name, dataUrl: fileUrl, mediaId: file.mediaId })}
          class="material-symbols-outlined text-[18px] text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors"
          title={t('practice.infoPanels.openFullScreen') || 'Vorschau'}
        >
          zoom_in
        </button>
      {/if}
      <span class="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform shrink-0" style="transform: rotate({open ? '180deg' : '0deg'});">
        keyboard_arrow_down
      </span>
    </div>
  </div>

  <!-- Media Content Panel -->
  {#if open}
    <div class="border-t border-outline-variant bg-surface-container-lowest p-3 flex justify-center items-center overflow-x-auto min-h-20 w-full">
      {#if loading}
        <div class="flex items-center justify-center py-4 gap-2 text-on-surface-variant text-[10px]">
          <div class="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          {t('taskEditor.audio.loading') || 'Wird geladen...'}
        </div>
      {:else if error}
        <span class="text-[10px] text-error italic">{t('practice.infoPanels.mediaError') || 'Fehler beim Laden'}</span>
      {:else if isAudioFile(file.name)}
        {#if fileUrl}
          <AudioPlayer dataUrl={fileUrl} compact={true} />
        {/if}
      {:else if isVideoFile(file.name)}
        {#if fileUrl}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video 
            src={fileUrl} 
            controls 
            class="max-w-full max-h-64 rounded-lg shadow-sm border border-outline-variant/10"
          ></video>
        {/if}
      {:else if !isIntegratedFile(file.name)}
        <button
          type="button"
          onclick={() => openAttachmentInDefaultApp(file).catch(err => console.error(err))}
          class="w-full p-4 flex flex-col items-center justify-center gap-3 bg-surface-container-low hover:bg-surface-container-high border border-outline-variant rounded-xl cursor-pointer transition-all select-none py-6 group"
        >
          <span class="material-symbols-outlined text-[36px] text-primary shrink-0 group-hover:scale-105 transition-transform">
            {getFileIcon(file.name)}
          </span>
          <div class="text-center">
            <p class="text-xs font-bold text-on-surface truncate max-w-sidebar-width">{getBaseName(file.name)}</p>
            <p class="text-[10px] text-on-surface-variant mt-1">{t('practice.infoPanels.openDefaultApp') || 'Mit Standard-App öffnen'}</p>
          </div>
        </button>
      {:else}
        {#if file.name.toLowerCase().endsWith('.pdf')}
          <div class="w-full h-[70vh] border border-outline-variant/10 rounded-lg overflow-hidden">
            <iframe 
              src={fileUrl} 
              title={file.name} 
              class="w-full h-full border-0 rounded-lg"
            ></iframe>
          </div>
        {:else if file.name.toLowerCase().endsWith('.md')}
          <div class="w-full h-64 p-4 overflow-auto bg-surface-container-high rounded-lg text-on-surface select-text text-left border border-outline-variant/30 leading-relaxed wrap-break-word font-sans prose prose-sm dark:prose-invert">
            {@html parseMarkdown(decodeBase64Text(fileUrl))}
          </div>
        {:else if file.name.toLowerCase().endsWith('.txt')}
          <pre class="w-full h-64 p-4 overflow-auto bg-surface-container-high rounded-lg font-mono text-on-surface whitespace-pre-wrap select-text leading-relaxed border border-outline-variant/30 text-left">{decodeBase64Text(fileUrl)}</pre>
        {:else}
          <div 
            class="w-full max-h-[70vh] relative flex items-center justify-center bg-surface-container-lowest overflow-hidden border border-outline-variant/10"
            style="aspect-ratio: {imageRatio || '4/3'}; {naturalWidth ? `max-width: ${naturalWidth}px; max-height: min(70vh, ${naturalHeight}px);` : ''}"
          >
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <img 
              src={fileUrl} 
              alt={file.name} 
              data-media-id={mediaId}
              onload={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                if (img.naturalWidth && img.naturalHeight) {
                  imageRatio = img.naturalWidth / img.naturalHeight;
                  naturalWidth = img.naturalWidth;
                  naturalHeight = img.naturalHeight;
                }
              }}
              onclick={handleInlineClick}
              onwheel={handleInlineWheel}
              onpointerdown={handleInlinePointerDown}
              onpointermove={handleInlinePointerMove}
              onpointerup={handleInlinePointerUp}
              onpointercancel={handleInlinePointerCancel}
              class="w-full h-full object-contain shadow-sm hover:opacity-95 transition-opacity select-none"
              style="transform: translate({panX}px, {panY}px) scale({zoom}); transform-origin: center center; cursor: {zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'}; touch-action: none;"
              draggable="false"
            />
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
