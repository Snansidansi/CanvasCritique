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

  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h4 class="font-bold text-sm text-on-surface mb-0.5">{t('settings.language.selectLabel')}</h4>
      <p class="text-xs text-on-surface-variant">{t('settings.language.selectDesc')}</p>
    </div>

    <div class="relative w-full sm:w-48 shrink-0">
      <select
        value={store.settings.language || 'English'}
        onchange={(e) => setLanguage(e.currentTarget.value)}
        class="appearance-none w-full bg-surface-container-low text-on-surface border border-outline-variant rounded-lg px-3.5 py-2.5 pr-10 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer transition-all hover:bg-surface-container"
      >
        <option value="English">{t("settings.language.english")}</option>
        <option value="Deutsch">{t("settings.language.german")}</option>
      </select>
      <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline text-[20px]">
        expand_more
      </span>
    </div>
  </div>
</section>
