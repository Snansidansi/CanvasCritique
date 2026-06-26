<script lang="ts">
  import { store } from '../../state/store.svelte';
  import { t } from '../../services/i18n';
  import TaskNumberingConfig from './TaskNumberingConfig.svelte';
</script>

<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm">
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4">
    <span class="material-symbols-outlined text-primary">format_list_numbered</span>
    <h3 class="text-lg font-bold text-on-surface">{t('settings.taskNumbering.title')}</h3>
  </div>
  
  <TaskNumberingConfig 
    settings={store.settings} 
    onchange={() => store.saveSettings()} 
  />
</section>
