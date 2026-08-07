<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import type { AudioRecordingItem } from '../../state/types';
  import { saveMediaBytesToDb, getMediaDataUrl } from '../../db/media';
  import AudioPlayer from './AudioPlayer.svelte';

  let {
    taskId,
    recordings = [],
    onRecordingsChange
  }: {
    taskId: string;
    recordings?: AudioRecordingItem[];
    onRecordingsChange?: (recordings: AudioRecordingItem[]) => void;
  } = $props();

  // Settings
  let enableMicKeepAliveToggle = $derived(store.settings.enableMicKeepAliveToggle ?? false);
  let isMicPreActivated = $state(false);

  // Stream state
  let preActiveStream = $state<MediaStream | null>(null);
  let activeStream = $state<MediaStream | null>(null);
  let mediaRecorder = $state<MediaRecorder | null>(null);
  let recordedChunks = $state<Blob[]>([]);

  // Recording UI state
  let isRecording = $state(false);
  let isPaused = $state(false);
  let isCancelled = $state(false);
  let recordingSeconds = $state(0);
  let timerInterval: any = null;

  // Visualizer canvas state
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let animFrameId: number | null = null;

  // Media data URLs cache for recordings
  let recordingDataUrls = $state<Record<string, string>>({});

  // Inline editing and confirm delete state
  let editingId = $state<string | null>(null);
  let editNameValue = $state('');
  let confirmDeleteId = $state<string | null>(null);

  // Load media data URLs for existing recordings
  $effect(() => {
    recordings.forEach(async (rec) => {
      if (rec.mediaId && !recordingDataUrls[rec.id]) {
        try {
          const url = await getMediaDataUrl(rec.mediaId);
          recordingDataUrls[rec.id] = url;
        } catch (err) {
          console.error(`Failed to load audio for ${rec.id}:`, err);
        }
      }
    });
  });

  // Pre-activate microphone stream if toggle is turned ON
  $effect(() => {
    if (isMicPreActivated && !preActiveStream) {
      acquireMicStream().then(stream => {
        preActiveStream = stream;
      }).catch(err => {
        console.error('Failed to pre-activate microphone:', err);
        isMicPreActivated = false;
      });
    } else if (!isMicPreActivated && preActiveStream && !isRecording) {
      stopStreamTracks(preActiveStream);
      preActiveStream = null;
    }
  });

  async function acquireMicStream(): Promise<MediaStream> {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  function stopStreamTracks(stream: MediaStream | null) {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  async function startRecording() {
    try {
      let stream = preActiveStream;
      if (!stream || !stream.active) {
        stream = await acquireMicStream();
      }
      activeStream = stream;

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
        else mimeType = '';
      }

      recordedChunks = [];
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        clearInterval(timerInterval);
        stopVisualizer();

        if (!isCancelled) {
          const blob = new Blob(recordedChunks, { type: recorder.mimeType || 'audio/webm' });
          if (blob.size > 0) {
            await saveRecording(blob, recorder.mimeType);
          }
        }

        if (!isMicPreActivated) {
          stopStreamTracks(activeStream);
        }
        activeStream = null;
        mediaRecorder = null;
        isRecording = false;
        isPaused = false;
        isCancelled = false;
        recordingSeconds = 0;
      };

      mediaRecorder = recorder;
      recorder.start(200);

      isRecording = true;
      isPaused = false;
      isCancelled = false;
      recordingSeconds = 0;

      timerInterval = setInterval(() => {
        if (!isPaused) recordingSeconds++;
      }, 1000);

      startVisualizer(stream);
    } catch (err) {
      console.error('Error starting recording:', err);
      store.showNotification(
        store.settings.language === 'Deutsch'
          ? 'Mikrofonzugriff fehlgeschlagen. Bitte Berechtigungen prüfen.'
          : 'Microphone access failed. Please check permissions.',
        'error'
      );
    }
  }

  function pauseRecording() {
    if (mediaRecorder && isRecording) {
      if (isPaused) {
        mediaRecorder.resume();
        isPaused = false;
      } else {
        mediaRecorder.pause();
        isPaused = true;
      }
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
    }
  }

  function cancelRecording() {
    if (mediaRecorder && isRecording) {
      isCancelled = true;
      mediaRecorder.stop();
    }
  }

  async function saveRecording(blob: Blob, mimeType: string) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      const finalMime = mimeType || `audio/${ext}`;

      const recId = 'rec_' + Date.now();
      const mediaId = await saveMediaBytesToDb(`${recId}.${ext}`, bytes, finalMime);

      const defaultNum = (recordings?.length || 0) + 1;
      const recName = t('practice.audioRecorder.defaultName', { number: defaultNum });

      const dateObj = new Date();
      const lang = store.settings.language === 'Deutsch' ? 'de-DE' : 'en-US';
      const timestamp = dateObj.toLocaleString(lang, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const newItem: AudioRecordingItem = {
        id: recId,
        mediaId,
        name: recName,
        timestamp,
        duration: recordingSeconds
      };

      const dataUrl = URL.createObjectURL(blob);
      recordingDataUrls[recId] = dataUrl;

      await store.addAudioRecording(taskId, newItem);
      if (onRecordingsChange) {
        onRecordingsChange([...recordings, newItem]);
      }
    } catch (err) {
      console.error('Error saving audio recording:', err);
    }
  }

  function startVisualizer(stream: MediaStream) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!canvasEl || !analyser) return;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;

        const width = canvasEl.width;
        const height = canvasEl.height;
        ctx.clearRect(0, 0, width, height);

        if (isRecording && !isPaused) {
          analyser.getByteFrequencyData(dataArray);
        } else {
          dataArray.fill(0);
        }

        const barWidth = (width / bufferLength) * 1.8;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height * 0.85;
          const roundedH = Math.max(3, barHeight);

          const gradient = ctx.createLinearGradient(0, height, 0, 0);
          gradient.addColorStop(0, '#3b82f6');
          gradient.addColorStop(1, '#60a5fa');

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, (height - roundedH) / 2, barWidth - 2, roundedH, 3);
          ctx.fill();

          x += barWidth;
        }

        animFrameId = requestAnimationFrame(draw);
      };

      draw();
    } catch (e) {
      console.warn('Audio visualizer failed to initialize:', e);
    }
  }

  function stopVisualizer() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    analyser = null;
  }

  function formatDuration(sec: number): string {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function startRename(rec: AudioRecordingItem) {
    editingId = rec.id;
    editNameValue = rec.name;
  }

  async function saveRename(recId: string) {
    if (editNameValue.trim() && taskId) {
      await store.renameAudioRecording(taskId, recId, editNameValue.trim());
      editingId = null;
    }
  }

  async function handleDelete(recId: string) {
    if (confirmDeleteId === recId) {
      await store.deleteAudioRecording(taskId, recId);
      confirmDeleteId = null;
      if (onRecordingsChange) {
        onRecordingsChange(recordings.filter(r => r.id !== recId));
      }
    } else {
      confirmDeleteId = recId;
    }
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (confirmDeleteId && !target.closest('.delete-confirm-btn')) {
      confirmDeleteId = null;
    }
  }

  onDestroy(() => {
    stopVisualizer();
    clearInterval(timerInterval);
    if (preActiveStream) stopStreamTracks(preActiveStream);
    if (activeStream) stopStreamTracks(activeStream);
  });
</script>

<svelte:window onclick={handleClickOutside} />

<section class="audio-recorder-workspace flex flex-col bg-surface-container-lowest overflow-hidden select-none font-sans relative grow h-full min-w-0 p-6 custom-scrollbar overflow-y-auto">
  <!-- Header with Title & Mic Pre-Activation Toggle -->
  <div class="flex items-center justify-between mb-4 border-b border-outline-variant/30 pb-3">
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-primary text-xl">mic</span>
      <h3 class="text-xs font-bold text-primary uppercase tracking-wider font-sans">
        {t('practice.audioRecorder.title')}
      </h3>
      <span class="text-xs text-on-surface-variant font-mono">({recordings.length})</span>
    </div>

    {#if enableMicKeepAliveToggle}
      <label class="flex items-center gap-2 text-xs text-on-surface-variant font-medium cursor-pointer select-none">
        <span class="material-symbols-outlined text-base {isMicPreActivated ? 'text-primary' : 'text-on-surface-variant'}">
          {isMicPreActivated ? 'mic' : 'mic_off'}
        </span>
        <span>{t('practice.audioRecorder.keepAliveToggle')}</span>
        <input
          type="checkbox"
          bind:checked={isMicPreActivated}
          class="accent-primary h-4 w-4 cursor-pointer"
        />
      </label>
    {/if}
  </div>

  <!-- Minimalist Recording Controls Panel -->
  <div class="bg-surface-container-low border border-outline-variant/40 rounded-2xl p-5 mb-6 shadow-sm flex flex-col gap-4">
    <div class="flex items-center justify-between flex-wrap gap-4">
      <!-- Record Action Buttons -->
      <div class="flex items-center gap-3">
        {#if !isRecording}
          <button
            onclick={startRecording}
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-bold text-xs hover:shadow-md active:scale-95 transition-all cursor-pointer border-0"
            title={t('practice.audioRecorder.startRecord')}
          >
            <span class="material-symbols-outlined text-base">mic</span>
            <span>{t('practice.audioRecorder.startRecord')}</span>
          </button>
        {:else}
          <button
            onclick={stopRecording}
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-error text-white font-bold text-xs hover:shadow-md active:scale-95 transition-all cursor-pointer border-0 animate-pulse"
            title={t('practice.audioRecorder.stopRecord')}
          >
            <span class="material-symbols-outlined text-base">stop</span>
            <span>{t('practice.audioRecorder.stopRecord')}</span>
          </button>

          <button
            onclick={pauseRecording}
            class="flex items-center gap-2 px-3 py-2 rounded-xl border border-outline-variant text-on-surface font-semibold text-xs hover:bg-surface-container-high transition-all cursor-pointer bg-surface"
            title={isPaused ? t('practice.audioRecorder.resumeRecord') : t('practice.audioRecorder.pauseRecord')}
          >
            <span class="material-symbols-outlined text-base">
              {isPaused ? 'play_arrow' : 'pause'}
            </span>
            <span>{isPaused ? t('practice.audioRecorder.resumeRecord') : t('practice.audioRecorder.pauseRecord')}</span>
          </button>

          <button
            onclick={cancelRecording}
            class="flex items-center gap-2 px-3 py-2 rounded-xl border border-outline-variant text-error hover:bg-error/10 font-semibold text-xs transition-all cursor-pointer bg-surface"
            title={t('practice.audioRecorder.cancelRecord')}
          >
            <span class="material-symbols-outlined text-base">close</span>
            <span>{t('practice.audioRecorder.cancelRecord')}</span>
          </button>
        {/if}
      </div>

      <!-- Recording Timer & Visualizer Waveform -->
      <div class="flex items-center gap-4 grow justify-end">
        {#if isRecording}
          <div class="flex items-center gap-2 px-3 py-1 rounded-lg bg-surface border border-outline-variant/30 text-xs font-mono font-bold text-primary">
            <span class="w-2 h-2 rounded-full {isPaused ? 'bg-amber-500' : 'bg-red-500 animate-ping'}"></span>
            <span>{formatDuration(recordingSeconds)}</span>
          </div>
        {/if}

        <canvas
          bind:this={canvasEl}
          width="200"
          height="32"
          class="bg-surface-container/50 border border-outline-variant/20 rounded-lg shrink-0"
        ></canvas>
      </div>
    </div>
  </div>

  <!-- Recorded Items List -->
  <div class="flex flex-col gap-3 grow">
    {#if recordings.length === 0}
      <div class="flex flex-col items-center justify-center py-12 text-center text-on-surface-variant/60 gap-2 border border-dashed border-outline-variant/40 rounded-2xl">
        <span class="material-symbols-outlined text-3xl">graphic_eq</span>
        <span class="text-xs">{t('practice.audioRecorder.noRecordings')}</span>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each recordings as rec (rec.id)}
          <div class="bg-surface border border-outline-variant/40 rounded-xl p-4 flex flex-col gap-2 shadow-sm hover:border-outline-variant transition-colors relative">
            <!-- Recording Card Header (Title & Rename & Delete) -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0 grow">
                <span class="material-symbols-outlined text-primary text-base shrink-0">audio_file</span>

                {#if editingId === rec.id}
                  <div class="flex items-center gap-1 min-w-0 grow" onclick={e => e.stopPropagation()} role="presentation">
                    <input
                      type="text"
                      bind:value={editNameValue}
                      onkeydown={(e) => {
                        if (e.key === 'Enter') saveRename(rec.id);
                        else if (e.key === 'Escape') editingId = null;
                      }}
                      class="bg-surface-container border border-primary px-2 py-0.5 rounded text-xs text-on-surface focus:outline-none w-full grow font-medium"
                    />
                    <button
                      onclick={() => saveRename(rec.id)}
                      class="material-symbols-outlined text-xs text-primary hover:bg-surface-container p-1 rounded border-0 bg-transparent cursor-pointer"
                    >check</button>
                    <button
                      onclick={() => editingId = null}
                      class="material-symbols-outlined text-xs text-on-surface-variant hover:bg-surface-container p-1 rounded border-0 bg-transparent cursor-pointer"
                    >close</button>
                  </div>
                {:else}
                  <button
                    onclick={() => startRename(rec)}
                    class="font-bold text-xs text-on-surface truncate text-left hover:text-primary transition-colors cursor-pointer border-0 bg-transparent p-0"
                    title={store.settings.language === 'Deutsch' ? 'Klicken zum Umbenennen' : 'Click to rename'}
                  >
                    {rec.name}
                  </button>
                  <button
                    onclick={() => startRename(rec)}
                    class="material-symbols-outlined text-[14px] text-on-surface-variant/50 hover:text-primary transition-colors border-0 bg-transparent cursor-pointer p-0 shrink-0"
                    title={store.settings.language === 'Deutsch' ? 'Umbenennen' : 'Rename'}
                  >edit</button>
                {/if}
              </div>

              <!-- 2-Step Delete Button -->
              <div class="flex items-center gap-1 shrink-0">
                <button
                  onclick={() => handleDelete(rec.id)}
                  class="delete-confirm-btn flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all border-0 cursor-pointer
                         {confirmDeleteId === rec.id
                           ? 'bg-error text-white shadow-sm'
                           : 'text-on-surface-variant hover:bg-error/10 hover:text-error'}"
                  title={t('practice.audioRecorder.deleteTooltip')}
                >
                  <span class="material-symbols-outlined text-sm">delete</span>
                  {#if confirmDeleteId === rec.id}
                    <span class="text-[11px] font-bold">{t('practice.audioRecorder.clickToDelete')}</span>
                  {/if}
                </button>
              </div>
            </div>

            <!-- Timestamp Display -->
            <div class="text-[10px] text-on-surface-variant/70 font-mono flex items-center gap-1 select-text">
              <span class="material-symbols-outlined text-[12px]">schedule</span>
              <span>{rec.timestamp}</span>
            </div>

            <!-- Audio Player -->
            {#if recordingDataUrls[rec.id]}
              <AudioPlayer dataUrl={recordingDataUrls[rec.id]} compact={true} initialDuration={rec.duration} />
            {:else}
              <div class="text-[10px] text-on-surface-variant animate-pulse py-2">
                {t('common.loading')}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>
