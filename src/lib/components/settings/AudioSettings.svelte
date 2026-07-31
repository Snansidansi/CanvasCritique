<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
</script>

<div class="flex flex-col gap-6 font-sans">
  <div class="flex flex-col gap-1">
    <h3 class="text-lg font-bold text-on-surface flex items-center gap-2">
      <span class="material-symbols-outlined text-primary text-xl">mic</span>
      <span>{t('settings.audio.sectionTitle')}</span>
    </h3>
  </div>

  <!-- Microphone Pre-Activation Toggle Setting -->
  <div class="bg-surface-container-low border border-outline-variant/40 rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col gap-1 grow">
        <span class="font-bold text-sm text-on-surface">{t('settings.audio.keepAliveTitle')}</span>
        <span class="text-xs text-on-surface-variant leading-relaxed">{t('settings.audio.keepAliveDesc')}</span>
      </div>
      <label class="relative inline-flex items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={store.settings.enableMicKeepAliveToggle}
          onchange={(e) => {
            store.settings.enableMicKeepAliveToggle = e.currentTarget.checked;
            store.saveSettings();
          }}
          class="sr-only peer"
        />
        <div class="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
      </label>
    </div>

    <!-- Plain language user explanation box -->
    <div class="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3 items-start text-xs text-on-surface-variant leading-relaxed">
      <span class="material-symbols-outlined text-primary text-lg shrink-0 mt-0.5">info</span>
      <div class="flex flex-col gap-1">
        <span class="font-semibold text-primary">{t('settings.audio.keepAliveExplanationTitle')}</span>
        <span>{t('settings.audio.keepAliveExplanationText')}</span>
      </div>
    </div>
  </div>

  <!-- Send Audio Recordings to LLM Setting -->
  <div class="bg-surface-container-low border border-outline-variant/40 rounded-2xl p-6 flex items-center justify-between gap-4 shadow-sm">
    <div class="flex flex-col gap-1 grow">
      <span class="font-bold text-sm text-on-surface">{t('settings.audio.sendAudioTitle')}</span>
      <span class="text-xs text-on-surface-variant leading-relaxed">{t('settings.audio.sendAudioDesc')}</span>
    </div>
    <label class="relative inline-flex items-center cursor-pointer shrink-0">
      <input
        type="checkbox"
        checked={store.settings.sendAudioRecordings}
        onchange={(e) => {
          store.settings.sendAudioRecordings = e.currentTarget.checked;
          store.saveSettings();
        }}
        class="sr-only peer"
      />
      <div class="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
    </label>
  </div>
</div>
