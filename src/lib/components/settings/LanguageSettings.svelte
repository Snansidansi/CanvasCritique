<script lang="ts">
  import { store } from "../../state/store.svelte";
  import { t } from "../../services/i18n";

  function setLanguage(lang: string) {
    store.settings.language = lang;
    store.saveSettings();
  }
</script>

<section
  class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm"
>
  <div
    class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4"
  >
    <span class="material-symbols-outlined text-primary">language</span>
    <h3 class="text-lg font-bold text-on-surface">
      {t("settings.language.title")}
    </h3>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <!-- English Card -->
    <button
      type="button"
      onclick={() => setLanguage("English")}
      class="cursor-pointer group text-left focus:outline-none"
    >
      <div
        class="border rounded-lg p-4 mb-2 bg-surface-container-low flex flex-col justify-between h-24 relative overflow-hidden transition-all
             {store.settings.language === 'English'
          ? 'border-primary border-2 bg-primary/5'
          : 'border-outline-variant hover:border-primary'}"
      >
        {#if store.settings.language === "English"}
          <div
            class="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10"
          >
            <span
              class="material-symbols-outlined text-[10px] text-white font-bold"
              >check</span
            >
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <span class="font-bold text-sm text-on-surface"
            >{t("settings.language.english")}</span
          >
        </div>
      </div>
    </button>

    <!-- German Card -->
    <button
      type="button"
      onclick={() => setLanguage("Deutsch")}
      class="cursor-pointer group text-left focus:outline-none"
    >
      <div
        class="border rounded-lg p-4 mb-2 bg-surface-container-low flex flex-col justify-between h-24 relative overflow-hidden transition-all
             {store.settings.language === 'Deutsch'
          ? 'border-primary border-2 bg-primary/5'
          : 'border-outline-variant hover:border-primary'}"
      >
        {#if store.settings.language === "Deutsch"}
          <div
            class="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-10"
          >
            <span
              class="material-symbols-outlined text-[10px] text-white font-bold"
              >check</span
            >
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <span class="font-bold text-sm text-on-surface"
            >{t("settings.language.german")}</span
          >
        </div>
      </div>
    </button>
  </div>
</section>
