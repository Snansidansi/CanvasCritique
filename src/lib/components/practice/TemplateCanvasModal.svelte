<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../services/i18n';
  import { saveMediaToDb, getMediaDataUrl } from '../../db/media';
  import { drawGuidelinesInWorld, loadImage } from '../../utils/canvas';
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
    taskBackground = null, // UUID of the background diagram
    settingsOverride = {},
    targetProjectId = '',
    templateCanvasData = $bindable(null),
    onSave = null
  } = $props();

  // Settings
  let effectiveSettings = $derived(store.getEffectiveSettings(targetProjectId));
  let canvasMode = $derived(settingsOverride?.overrideCanvas ? settingsOverride.canvasMode : effectiveSettings.canvasMode);
  let activeBg = $derived(taskBackground || (settingsOverride?.overrideCanvas ? settingsOverride.canvasMode : effectiveSettings.canvasMode) || 'blank');
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

  // Background diagram cache
  let currentBgImage = $state<HTMLImageElement | null>(null);
  let customBgUrl = $state<string | null>(null);

  // Dimensions
  let containerWidth = $state(800);
  let containerHeight = $state(600);
  let a4Scale = $derived(Math.min(containerWidth / 800, containerHeight / 1130) * 0.95);

  // Load template data on mount
  onMount(() => {
    if (templateCanvasData) {
      try {
        const parsed = JSON.parse(templateCanvasData);
        canvasImages = parsed.canvasImages || [];
      } catch (e) {
        console.error('Failed to parse template Canvas data:', e);
      }
    }

    const updateSize = () => {
      if (containerElement) {
        containerWidth = containerElement.clientWidth;
        containerHeight = containerElement.clientHeight;
        if (canvasMode === 'infinite') {
          // Center infinite canvas coordinate origin
          panOffset = { x: containerWidth / 2, y: containerHeight / 2 };
        } else {
          // Center A4 canvas coordinate origin
          panOffset = { x: (containerWidth - 800 * a4Scale) / 2, y: (containerHeight - 1130 * a4Scale) / 2 };
        }
        redraw();
      }
    };

    window.addEventListener('resize', updateSize);
    setTimeout(updateSize, 100);

    return () => {
      window.removeEventListener('resize', updateSize);
    };
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
            redraw();
          };
        }).catch(console.error);
      }
    }
  });

  // Load direct background diagram by UUID when selected
  $effect(() => {
    const bg = activeBg;
    if (bg && bg !== 'grid' && bg !== 'lines' && bg !== 'blank') {
      getMediaDataUrl(bg).then(url => {
        customBgUrl = url;
      }).catch(() => {
        customBgUrl = null;
      });
    } else {
      customBgUrl = null;
    }
  });

  // Fetch and cache the background pattern image when customBgUrl changes
  $effect(() => {
    const url = customBgUrl;
    if (url) {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        currentBgImage = img;
        redraw();
      };
      img.onerror = () => {
        currentBgImage = null;
        redraw();
      };
    } else {
      currentBgImage = null;
    }
  });

  // Svelte 5 run-loop visual dependency triggers
  $effect(() => {
    const imgs = canvasImages;
    const selImg = selectedImage;
    const imgCache = imageElementCache;
    const isMovImg = isMovingImage;
    const isResImg = isResizingImage;
    const bgImg = currentBgImage;

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
    ctx.clearRect(0, 0, containerWidth, containerHeight);

    // Always fill background with white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, containerWidth, containerHeight);

    ctx.save();
    if (canvasMode === 'infinite') {
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoomScale, zoomScale);

      const xStart = -panOffset.x / zoomScale;
      const yStart = -panOffset.y / zoomScale;
      const wVisible = containerWidth / zoomScale;
      const hVisible = containerHeight / zoomScale;

      if (currentBgImage) {
        ctx.save();
        ctx.globalAlpha = bgOpacity / 100;
        const pattern = ctx.createPattern(currentBgImage, 'repeat');
        if (pattern) {
          ctx.fillStyle = pattern;
          ctx.fillRect(xStart, yStart, wVisible, hVisible);
        }
        ctx.restore();
      }
      drawGuidelinesInWorld(ctx, xStart, yStart, wVisible, hVisible, activeBg, bgOpacity);
      drawCanvasImages(ctx);
    } else {
      // A4 mode
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(a4Scale, a4Scale);

      // Draw A4 page boundaries shadow/border
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 800, 1130);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, 0, 800, 1130);

      if (currentBgImage) {
        ctx.save();
        ctx.globalAlpha = bgOpacity / 100;
        const pattern = ctx.createPattern(currentBgImage, 'repeat');
        if (pattern) {
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, 800, 1130);
        }
        ctx.restore();
      }
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

    // Clicked elsewhere
    selectedImage = null;
    redraw();
  }

  function handlePointerMove(e: PointerEvent) {
    const coords = getCoords(e);

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
      selectedImage.width = Math.max(20, imageStartRect.width + dx);
      selectedImage.height = Math.max(20, imageStartRect.height + dy);
      canvasImages = [...canvasImages];
      redraw();
      return;
    }
  }

  function handlePointerUp() {
    isMovingImage = false;
    isResizingImage = false;
    redraw();
  }

  function triggerImageUpload() {
    fileInputEl?.click();
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

          // Center the template image on canvas screen
          const centerX = canvasMode === 'infinite'
            ? (containerWidth / 2 - panOffset.x) / zoomScale
            : 400;
          const centerY = canvasMode === 'infinite'
            ? (containerHeight / 2 - panOffset.y) / zoomScale
            : 565;

          const img = new Image();
          img.src = dataUrl;
          img.onload = () => {
            let width = img.width;
            let height = img.height;
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
            // Initialize canvas context
            if (canvasElement) {
              ctx = canvasElement.getContext('2d');
            }
            redraw();
          };
        } catch (err) {
          console.error(err);
        }
      };
      reader.readAsDataURL(file);
      target.value = '';
    }
  }

  async function handlePaste(e: ClipboardEvent) {
    // Only paste if focused on modal
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
            const centerX = canvasMode === 'infinite'
              ? (containerWidth / 2 - panOffset.x) / zoomScale
              : 400;
            const centerY = canvasMode === 'infinite'
              ? (containerHeight / 2 - panOffset.y) / zoomScale
              : 565;

            const img = new Image();
            img.src = base64Data;
            img.onload = () => {
              let width = img.width;
              let height = img.height;
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
              // Initialize canvas context
              if (canvasElement) {
                ctx = canvasElement.getContext('2d');
              }
              redraw();
            };
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
    <div class="bg-surface border border-outline-variant shadow-2xl rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-scale-up">
      
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
        
        <!-- Canvas area -->
        <div 
          bind:this={containerElement} 
          class="flex-1 bg-surface-container-lowest overflow-hidden relative cursor-crosshair select-none"
        >
          <canvas
            bind:this={canvasElement}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
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

            <div class="text-[11px] text-on-surface-variant leading-relaxed p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 mt-2">
              <p class="font-semibold text-on-surface mb-1">Hinweise:</p>
              <ul class="list-disc pl-4 space-y-1.5 font-medium">
                <li>Bilder per Klick auswählen</li>
                <li>Ecke unten rechts ziehen zum Skalieren</li>
                <li>Bild ziehen zum Positionieren</li>
                <li><b>Entf</b> oder <b>Backspace</b> drückt zum Löschen</li>
                <li>Bilder können auch per <b>Strg+V</b> eingefügt werden</li>
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
