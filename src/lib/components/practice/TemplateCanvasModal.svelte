<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../services/i18n';
  import { saveMediaToDb, getMediaDataUrl } from '../../db/media';
  import { drawGuidelinesInWorld } from '../../utils/canvas';
  import { store } from '../../state/store.svelte';

  interface CanvasImage {
    id: string;
    mediaId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    pageIndex: number;
  }

  let {
    isOpen = $bindable(false),
    settingsOverride = {},
    targetProjectId = '',
    templateCanvasData = $bindable(null),
    onSave = null
  } = $props();

  // Settings
  let effectiveSettings = $derived(store.getEffectiveSettings(targetProjectId));
  let canvasMode = $derived(settingsOverride?.overrideCanvas ? settingsOverride.canvasMode : effectiveSettings.canvasMode);
  let activeBg = $derived((settingsOverride?.overrideCanvas ? settingsOverride.canvasMode : effectiveSettings.canvasMode) || 'blank');
  let bgOpacity = 30; // opacity of guidelines

  // Local state
  let canvasElement = $state<HTMLCanvasElement | null>(null);
  let containerElement = $state<HTMLDivElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);
  let ctx = $state<CanvasRenderingContext2D | null>(null);

  let canvasImages = $state<CanvasImage[]>([]);
  let selectedImage = $state<CanvasImage | null>(null);
  let imageElementCache = $state<Record<string, HTMLImageElement>>({});

  // Viewport/panning states for infinite canvas
  let panOffset = $state({ x: 0, y: 0 });
  let zoomScale = $state(1);

  // Resize/Drag states
  let isMovingImage = $state(false);
  let isResizingImage = $state(false);
  let imageDragStart = { x: 0, y: 0 };
  let imageStartRect = { x: 0, y: 0, width: 0, height: 0 };
  let imageStartAspectRatio = 1;

  // Background panning state
  let isPanning = $state(false);
  let panStart = { x: 0, y: 0 };
  let panBaseOffset = { x: 0, y: 0 };

  // Dimensions
  let containerWidth = $state(800);
  let containerHeight = $state(600);
  let a4Scale = $derived(Math.min(containerWidth / 800, containerHeight / 1130) * 0.95);

  // Setup/TearDown window event handlers
  onMount(() => {
    const updateSize = () => {
      if (containerElement) {
        containerWidth = containerElement.clientWidth;
        containerHeight = containerElement.clientHeight;
        if (canvasMode === 'infinite') {
          panOffset = { x: containerWidth / 2, y: containerHeight / 2 };
        } else {
          panOffset = { x: (containerWidth - 800 * a4Scale) / 2, y: (containerHeight - 1130 * a4Scale) / 2 };
        }
        redraw();
      }
    };

    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
    };
  });

  // Re-run initialization, reload canvas, and grab context whenever modal isOpen is true
  $effect(() => {
    if (isOpen) {
      if (templateCanvasData) {
        try {
          const parsed = JSON.parse(templateCanvasData);
          canvasImages = parsed.canvasImages || [];
        } catch (e) {
          console.error('Failed to parse template Canvas data:', e);
          canvasImages = [];
        }
      } else {
        canvasImages = [];
      }
      selectedImage = null;

      // Trigger size updates and acquire canvas 2d context
      setTimeout(() => {
        if (containerElement && canvasElement) {
          containerWidth = containerElement.clientWidth;
          containerHeight = containerElement.clientHeight;
          if (canvasMode === 'infinite') {
            panOffset = { x: containerWidth / 2, y: containerHeight / 2 };
          } else {
            panOffset = { x: (containerWidth - 800 * a4Scale) / 2, y: (containerHeight - 1130 * a4Scale) / 2 };
          }
          ctx = canvasElement.getContext('2d');
          redraw();
        }
      }, 100);
    }
  });

  // Load and cache canvas image media files asynchronously when canvasImages updates
  $effect(() => {
    for (const canvasImg of canvasImages) {
      const mediaId = canvasImg.mediaId;
      if (mediaId && !imageElementCache[mediaId]) {
        imageElementCache[mediaId] = new Image();
        getMediaDataUrl(mediaId).then(dataUrl => {
          const img = new Image();
          img.src = dataUrl;
          img.onload = () => {
            imageElementCache[mediaId] = img;
            imageElementCache = { ...imageElementCache }; // Trigger Svelte 5 state reactivity!
            redraw();
          };
        }).catch(console.error);
      }
    }
  });

  // Svelte 5 run-loop visual dependency triggers
  $effect(() => {
    const imgs = canvasImages;
    const selImg = selectedImage;
    const imgCache = imageElementCache;
    const isMovImg = isMovingImage;
    const isResImg = isResizingImage;
    const mode = canvasMode;
    const bg = activeBg;

    if (ctx && canvasElement) {
      redraw();
    }
  });

  function getCoords(e: PointerEvent) {
    if (!canvasElement) return { x: 0, y: 0 };
    const rect = canvasElement.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    if (canvasMode === 'infinite') {
      return {
        x: (screenX - panOffset.x) / zoomScale,
        y: (screenY - panOffset.y) / zoomScale
      };
    } else {
      return {
        x: (screenX - panOffset.x) / a4Scale,
        y: (screenY - panOffset.y) / a4Scale
      };
    }
  }

  function drawCanvasImages(ctxTarget: CanvasRenderingContext2D) {
    for (const canvasImg of canvasImages) {
      const imgEl = imageElementCache[canvasImg.mediaId];
      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        ctxTarget.drawImage(imgEl, canvasImg.x, canvasImg.y, canvasImg.width, canvasImg.height);
      }
    }
  }

  function redraw() {
    if (!ctx || !canvasElement) return;

    // Fill background with grey, but main workspace white
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, containerWidth, containerHeight);

    ctx.save();
    if (canvasMode === 'infinite') {
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoomScale, zoomScale);

      const xStart = -panOffset.x / zoomScale;
      const yStart = -panOffset.y / zoomScale;
      const wVisible = containerWidth / zoomScale;
      const hVisible = containerHeight / zoomScale;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(xStart, yStart, wVisible, hVisible);

      drawGuidelinesInWorld(ctx, xStart, yStart, wVisible, hVisible, activeBg, bgOpacity);
      drawCanvasImages(ctx);
    } else {
      // A4 mode
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(a4Scale, a4Scale);

      // Draw A4 page boundaries shadow/border
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 800, 1130);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, 800, 1130);

      drawGuidelinesInWorld(ctx, 0, 0, 800, 1130, activeBg, bgOpacity);
      drawCanvasImages(ctx);
    }
    ctx.restore();

    // Draw selected image border & handles
    if (selectedImage) {
      ctx.save();
      ctx.translate(panOffset.x, panOffset.y);
      const scale = canvasMode === 'infinite' ? zoomScale : a4Scale;
      ctx.scale(scale, scale);

      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(selectedImage.x, selectedImage.y, selectedImage.width, selectedImage.height);

      ctx.fillStyle = '#2563eb';
      ctx.setLineDash([]);
      const handleSize = 10 / scale;
      ctx.fillRect(
        selectedImage.x + selectedImage.width - handleSize / 2,
        selectedImage.y + selectedImage.height - handleSize / 2,
        handleSize,
        handleSize
      );
      ctx.restore();
    }
  }

  function handlePointerDown(e: PointerEvent) {
    if (!ctx || !canvasElement) return;

    const coords = getCoords(e);
    
    // Check click on handles
    const scale = canvasMode === 'infinite' ? zoomScale : a4Scale;
    const handleSize = 15 / scale;
    const isNearBottomRight = selectedImage &&
      Math.abs(coords.x - (selectedImage.x + selectedImage.width)) <= handleSize &&
      Math.abs(coords.y - (selectedImage.y + selectedImage.height)) <= handleSize;

    // Check click on image bodies
    const clickedImage = canvasImages.find(img => {
      return coords.x >= img.x && coords.x <= img.x + img.width &&
             coords.y >= img.y && coords.y <= img.y + img.height;
    });

    if (isNearBottomRight && selectedImage) {
      isResizingImage = true;
      imageDragStart = { x: coords.x, y: coords.y };
      imageStartRect = { x: selectedImage.x, y: selectedImage.y, width: selectedImage.width, height: selectedImage.height };
      imageStartAspectRatio = selectedImage.width / selectedImage.height;
      e.preventDefault();
      return;
    }

    if (clickedImage) {
      selectedImage = clickedImage;
      isMovingImage = true;
      imageDragStart = { x: coords.x, y: coords.y };
      imageStartRect = { x: clickedImage.x, y: clickedImage.y, width: clickedImage.width, height: clickedImage.height };
      e.preventDefault();
      return;
    }

    // Clicked elsewhere -> Start Panning on background!
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    panBaseOffset = { ...panOffset };
    selectedImage = null;
    redraw();
  }

  function handlePointerMove(e: PointerEvent) {
    const coords = getCoords(e);

    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      panOffset = {
        x: panBaseOffset.x + dx,
        y: panBaseOffset.y + dy
      };
      redraw();
      return;
    }

    if (isMovingImage && selectedImage) {
      const dx = coords.x - imageDragStart.x;
      const dy = coords.y - imageDragStart.y;
      selectedImage.x = imageStartRect.x + dx;
      selectedImage.y = imageStartRect.y + dy;
      canvasImages = [...canvasImages];
      redraw();
      return;
    }

    if (isResizingImage && selectedImage) {
      const dx = coords.x - imageDragStart.x;
      const dy = coords.y - imageDragStart.y;
      
      const dragDelta = (dx + dy) / 2;
      const scaleFactor = 1 + (dragDelta / Math.max(imageStartRect.width, imageStartRect.height));
      const newWidth = Math.max(20, imageStartRect.width * scaleFactor);
      const newHeight = newWidth / imageStartAspectRatio;

      selectedImage.width = Math.round(newWidth);
      selectedImage.height = Math.round(newHeight);
      canvasImages = [...canvasImages];
      redraw();
      return;
    }
  }

  function handlePointerUp() {
    isMovingImage = false;
    isResizingImage = false;
    isPanning = false;
    redraw();
  }

  function handleWheel(e: WheelEvent) {
    if (canvasMode !== 'infinite') return;
    e.preventDefault();
    const zoomFactor = 1.1;
    const newScale = e.deltaY < 0 ? zoomScale * zoomFactor : zoomScale / zoomFactor;
    const boundedScale = Math.max(0.1, Math.min(newScale, 10));
    
    if (canvasElement) {
      const rect = canvasElement.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      panOffset = {
        x: mouseX - (mouseX - panOffset.x) * (boundedScale / zoomScale),
        y: mouseY - (mouseY - panOffset.y) * (boundedScale / zoomScale)
      };
      zoomScale = boundedScale;
      redraw();
    }
  }

  function triggerImageUpload() {
    fileInputEl?.click();
  }

  function insertImageToTemplate(dataUrl: string, mediaId: string, name: string) {
    const centerX = canvasMode === 'infinite'
      ? (containerWidth / 2 - panOffset.x) / zoomScale
      : 400;
    const centerY = canvasMode === 'infinite'
      ? (containerHeight / 2 - panOffset.y) / zoomScale
      : 565;

    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      const maxDim = 400;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const newImage: CanvasImage = {
        id: 'img-' + Date.now(),
        mediaId,
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
        pageIndex: 0
      };

      canvasImages = [...canvasImages, newImage];
      selectedImage = newImage;
      redraw();
    };
  }

  async function handleCanvasImageUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          const mediaId = await saveMediaToDb(dataUrl, file.name);
          insertImageToTemplate(dataUrl, mediaId, file.name);
        } catch (err) {
          console.error(err);
        }
      };
      reader.readAsDataURL(file);
      target.value = '';
    }
  }

  async function handlePaste(e: ClipboardEvent) {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    for (const item of clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = reader.result as string;
          try {
            const mediaId = await saveMediaToDb(base64Data, file.name);
            insertImageToTemplate(base64Data, mediaId, file.name);
          } catch (err) {
            console.error(err);
          }
        };
        reader.readAsDataURL(file);
        e.preventDefault();
        break;
      }
    }
  }

  async function handlePasteClipboard() {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const base64Data = await blobToBase64(blob);
          const ext = imageType.split('/')[1] || 'png';
          const mediaId = await saveMediaToDb(base64Data, `canvas_image_${Date.now()}.${ext}`);
          insertImageToTemplate(base64Data, mediaId, `pasted_image_${Date.now()}.${ext}`);
          return;
        }
      }
      alert('Kein Bild in der Zwischenablage gefunden.');
    } catch (err) {
      console.warn('Clipboard read error: ', err);
      alert('Zugriff auf die Zwischenablage verweigert oder leer.');
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find(f => f.type.startsWith('image/'));
      if (imageFile) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = reader.result as string;
          try {
            const mediaId = await saveMediaToDb(base64Data, imageFile.name);
            insertImageToTemplate(base64Data, mediaId, imageFile.name);
          } catch (err) {
            console.error('Failed to save drop image:', err);
          }
        };
        reader.readAsDataURL(imageFile);
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedImage) {
        canvasImages = canvasImages.filter(img => img.id !== selectedImage!.id);
        selectedImage = null;
        redraw();
        e.preventDefault();
      }
    }
  }

  function saveTemplate() {
    templateCanvasData = JSON.stringify({
      canvasImages
    });
    if (onSave) onSave();
    isOpen = false;
  }

  function closeTemplate() {
    isOpen = false;
  }
</script>

<svelte:window onkeydown={handleKeyDown} onpaste={handlePaste} />

{#if isOpen}
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-sans">
    <div class="bg-surface border border-outline-variant shadow-2xl rounded-2xl w-[90vw] h-[90vh] flex flex-col overflow-hidden animate-scale-up">
      
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-outline-variant/60 shrink-0">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-[24px] text-primary">view_quilt</span>
          <div>
            <h2 class="text-base font-bold text-on-surface">{t('taskEditor.designTemplate')}</h2>
            <p class="text-xs text-on-surface-variant mt-0.5">{t('taskEditor.designTemplateSubtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onclick={closeTemplate}
          class="material-symbols-outlined text-[20px] text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface p-2 rounded-full cursor-pointer focus:outline-none transition-colors border-0 bg-transparent"
        >
          close
        </button>
      </div>

      <!-- Main body containing Canvas preview and controls -->
      <div class="flex-1 flex overflow-hidden relative">
        
        <!-- Canvas area with drag over and drop support -->
        <div 
          bind:this={containerElement} 
          ondragover={handleDragOver}
          ondrop={handleDrop}
          role="presentation"
          class="flex-1 bg-surface-container-lowest overflow-hidden relative cursor-crosshair select-none"
        >
          <canvas
            bind:this={canvasElement}
            width={containerWidth}
            height={containerHeight}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            onwheel={handleWheel}
            class="absolute top-0 left-0 w-full h-full block"
          ></canvas>

          <!-- Floating Image Options -->
          {#if selectedImage}
            {@const scale = canvasMode === 'infinite' ? zoomScale : a4Scale}
            {@const boxLeft = selectedImage.x * scale + panOffset.x}
            {@const boxTop = selectedImage.y * scale + panOffset.y}
            {@const boxWidth = selectedImage.width * scale}
            {@const boxHeight = selectedImage.height * scale}

            {@const toolbarWidth = 140}
            {@const toolbarHeight = 40}
            {@const margin = 8}
            {@const targetX = boxLeft + boxWidth / 2}
            {@const constrainedX = Math.max(margin + toolbarWidth / 2, Math.min(targetX, containerWidth - margin - toolbarWidth / 2))}
            {@const placeBelow = boxTop - toolbarHeight - margin < margin}
            {@const constrainedY = placeBelow ? (boxTop + boxHeight + margin + toolbarHeight) : boxTop}
            {@const transformStyle = placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'}

            <div 
              class="absolute z-30 bg-surface-container-high border border-outline-variant shadow-lg rounded-lg px-2 py-1 flex items-center gap-1 -mt-2.5 font-sans"
              style="left: {constrainedX}px; top: {constrainedY}px; transform: {transformStyle};"
            >
              <button 
                onclick={() => { canvasImages = canvasImages.filter(img => img.id !== selectedImage!.id); selectedImage = null; redraw(); }}
                class="px-2.5 py-1 text-[10px] font-bold text-error hover:bg-error/10 rounded cursor-pointer transition-colors flex items-center gap-1 border-0 bg-transparent"
                title={t('common.delete')}
              >
                <span class="material-symbols-outlined text-[14px]">delete</span>
                <span>{t('common.delete')}</span>
              </button>
              <div class="w-px h-3 bg-outline-variant/50"></div>
              <button 
                onclick={() => { selectedImage = null; redraw(); }}
                class="px-2.5 py-1 text-[10px] font-bold text-outline hover:bg-surface-container rounded cursor-pointer transition-colors border-0 bg-transparent"
                title={t('project.cancelSelection')}
              >
                <span>{t('common.cancel')}</span>
              </button>
            </div>
          {/if}
        </div>

        <!-- Controls Sidebar -->
        <div class="w-64 border-l border-outline-variant/60 bg-surface p-6 flex flex-col gap-6 shrink-0 justify-between">
          <div class="flex flex-col gap-4">
            <h3 class="text-xs font-bold text-on-surface uppercase tracking-wider">{t('practice.tools')}</h3>
            
            <input 
              type="file" 
              bind:this={fileInputEl} 
              class="hidden" 
              accept="image/*"
              onchange={handleCanvasImageUpload}
            />

            <button
              type="button"
              onclick={triggerImageUpload}
              class="w-full flex items-center justify-center gap-2 py-3 border border-outline-variant rounded-xl bg-surface hover:bg-surface-container hover:text-primary transition-all cursor-pointer font-bold text-xs text-on-surface-variant focus:outline-none"
            >
              <span class="material-symbols-outlined text-[18px]">add_photo_alternate</span>
              {t('practice.palette.image')} einfügen
            </button>

            <button
              type="button"
              onclick={handlePasteClipboard}
              class="w-full flex items-center justify-center gap-2 py-2.5 px-3 border border-outline-variant rounded-xl bg-surface hover:bg-surface-container hover:text-primary transition-all cursor-pointer font-bold text-[11px] text-on-surface-variant focus:outline-none whitespace-normal text-center leading-tight"
            >
              <span class="material-symbols-outlined text-[16px] shrink-0">content_paste</span>
              <span>{t('taskEditor.pasteClipboard')}</span>
            </button>

            <div class="text-[11px] text-on-surface-variant leading-relaxed p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 mt-2 font-medium">
              <p class="font-bold text-on-surface mb-1">Hinweise:</p>
              <ul class="list-disc pl-4 space-y-1.5 leading-normal">
                <li>Bilder per Klick auswählen</li>
                <li>Ecke unten rechts ziehen zum Skalieren</li>
                <li>Bild ziehen zum Positionieren</li>
                <li><b>Entf</b> oder <b>Backspace</b> drückt zum Löschen</li>
                <li>Bilder per <b>Drag & Drop</b> oder <b>Strg+V</b> einfügen</li>
              </ul>
            </div>
          </div>

          <div class="flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onclick={saveTemplate}
              class="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white hover:bg-primary-hover font-bold text-xs rounded-xl shadow-sm cursor-pointer transition-all border-0 focus:outline-none"
            >
              <span class="material-symbols-outlined text-[18px]">save</span>
              {t('taskEditor.saveTemplate')}
            </button>
            <button
              type="button"
              onclick={closeTemplate}
              class="w-full py-2 bg-transparent hover:bg-surface-container-high border border-outline font-bold text-xs text-on-surface-variant rounded-xl cursor-pointer transition-all focus:outline-none"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>

      </div>

    </div>
  </div>
{/if}

<style>
  .animate-scale-up {
    animation: scaleUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  @keyframes scaleUp {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
