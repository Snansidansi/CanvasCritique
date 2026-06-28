<script lang="ts">
  import { t } from '../../services/i18n';

  let {
    showCritiqueBanner = $bindable(),
    isChecking,
    feedbackText,
    feedbackScore
  } = $props();

  let wasChecking = $state(false);

  $effect(() => {
    if (wasChecking && !isChecking) {
      showCritiqueBanner = false;
    }
    wasChecking = isChecking;
  });
</script>

{#if showCritiqueBanner}
  <div class="absolute top-4 right-4 bg-surface-container-high/95 backdrop-blur-md border border-outline-variant/40 rounded-xl p-5 w-80 shadow-2xl z-30 flex flex-col gap-3 max-h-[85%] overflow-y-auto custom-scrollbar transition-all">
    {#if isChecking}
      <div class="flex flex-col items-center justify-center py-6 gap-3">
        <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p class="text-xs text-on-surface-variant text-center">{feedbackText}</p>
      </div>
    {/if}
  </div>
{/if}
