<script lang="ts">
  import { t } from '../../services/i18n';

  let {
    showCritiqueBanner = $bindable(),
    isChecking,
    feedbackText,
    feedbackScore
  } = $props();
</script>

{#if showCritiqueBanner}
  <div class="absolute top-4 right-4 bg-surface-container-high/95 backdrop-blur-md border border-outline-variant/40 rounded-xl p-5 w-80 shadow-2xl z-30 flex flex-col gap-3 max-h-[85%] overflow-y-auto custom-scrollbar transition-all">
    <div class="flex justify-between items-start">
      <span class="text-xs font-bold uppercase tracking-wider text-outline">{t('practice.critique.aiTeacher')}</span>
      <button 
        onclick={() => showCritiqueBanner = false}
        class="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-on-surface focus:outline-none cursor-pointer"
      >
        close
      </button>
    </div>
    
    {#if isChecking}
      <div class="flex flex-col items-center justify-center py-6 gap-3">
        <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p class="text-xs text-on-surface-variant text-center">{feedbackText}</p>
      </div>
    {:else}
      <!-- Display Score Badge -->
      {#if feedbackScore !== null}
        <div class="flex items-center gap-3 bg-primary/5 p-3 rounded-lg border border-primary/20 animate-fade-in">
          <div class="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg shadow-sm">
            {feedbackScore}
          </div>
          <div>
            <h4 class="text-xs font-bold text-primary">{t('practice.critique.scoreTitle')}</h4>
            <p class="text-[10px] text-on-surface-variant">{t('practice.critique.scoreDesc')}</p>
          </div>
        </div>
      {/if}

      <!-- Critique Text -->
      <div class="text-xs text-on-surface-variant leading-relaxed whitespace-pre-line border-t border-outline-variant/30 pt-3">
        {feedbackText}
      </div>
    {/if}
  </div>
{/if}
