<script lang="ts">
  import { t } from '../../services/i18n';

  let { dataUrl, compact = false }: { dataUrl: string; compact?: boolean } = $props();

  let audioEl = $state<HTMLAudioElement | null>(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(0.7);
  let showVolumeSlider = $state(false);
  let isLoading = $state(true);

  function togglePlay() {
    if (!audioEl) return;
    if (isPlaying) {
      audioEl.pause();
    } else {
      audioEl.play().catch(() => {});
    }
  }

  function onTimeUpdate() {
    if (audioEl) currentTime = audioEl.currentTime;
  }

  function onLoadedMetadata() {
    if (audioEl) {
      duration = audioEl.duration;
      isLoading = false;
    }
  }

  function onPlay() {
    isPlaying = true;
  }

  function onPause() {
    isPlaying = false;
  }

  function onEnded() {
    isPlaying = false;
    if (audioEl) audioEl.currentTime = 0;
  }

  function seek(e: Event) {
    if (!audioEl) return;
    const target = e.target as HTMLInputElement;
    audioEl.currentTime = parseFloat(target.value);
  }

  function onVolumeChange(e: Event) {
    if (!audioEl) return;
    const target = e.target as HTMLInputElement;
    volume = parseFloat(target.value);
    audioEl.volume = volume;
  }

  function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  let volumePopupRef = $state<HTMLDivElement | null>(null);

  function handleVolumeClick() {
    showVolumeSlider = !showVolumeSlider;
  }

  function handleClickOutside(e: MouseEvent) {
    if (volumePopupRef && !volumePopupRef.contains(e.target as Node)) {
      showVolumeSlider = false;
    }
  }

  $effect(() => {
    if (showVolumeSlider) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<div class="flex items-center gap-2 {compact ? 'py-1' : 'py-2'}">
  <audio
    bind:this={audioEl}
    src={dataUrl}
    ontimeupdate={onTimeUpdate}
    onloadedmetadata={onLoadedMetadata}
    onplay={onPlay}
    onpause={onPause}
    onended={onEnded}
    preload="metadata"
  ></audio>

  <button
    onclick={togglePlay}
    class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-on-primary hover:opacity-90 transition-all shrink-0 cursor-pointer"
    title={isPlaying ? t('taskEditor.audio.pause') : t('taskEditor.audio.play')}
  >
    <span class="material-symbols-outlined text-[18px]">
      {isPlaying ? 'pause' : 'play_arrow'}
    </span>
  </button>

  {#if !compact}
    <div class="flex items-center gap-2 flex-1 min-w-0">
      <span class="text-[10px] text-on-surface-variant font-mono w-10 text-right shrink-0">
        {formatTime(currentTime)}
      </span>
      <input
        type="range"
        min="0"
        max={duration || 0}
        value={currentTime}
        oninput={seek}
        class="flex-1 h-1 accent-primary cursor-pointer"
      />
      <span class="text-[10px] text-on-surface-variant font-mono w-10 shrink-0">
        {formatTime(duration)}
      </span>
    </div>
  {/if}

  <div class="relative shrink-0" bind:this={volumePopupRef}>
    <button
      onclick={handleVolumeClick}
      class="flex items-center justify-center w-7 h-7 rounded-full hover:bg-surface-container transition-colors cursor-pointer"
      title={t('taskEditor.audio.volume')}
    >
      <span class="material-symbols-outlined text-[18px] text-on-surface-variant">
        {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
      </span>
    </button>
    {#if showVolumeSlider}
      <div class="absolute bottom-full right-0 mb-2 bg-surface-container-low border border-outline-variant rounded-lg shadow-lg p-3 flex flex-col items-center gap-1 z-50 min-w-[120px]">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          oninput={onVolumeChange}
          class="w-full h-1 accent-primary cursor-pointer"
        />
        <span class="text-[10px] text-on-surface-variant font-mono">{Math.round(volume * 100)}%</span>
      </div>
    {/if}
  </div>
</div>
