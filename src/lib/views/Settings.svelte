<script lang="ts">
  import StylusSettings from '../components/settings/StylusSettings.svelte';
  import AppearanceSettings from '../components/settings/AppearanceSettings.svelte';
  import LanguageSettings from '../components/settings/LanguageSettings.svelte';
  import CanvasPreferences from '../components/settings/CanvasPreferences.svelte';
  import TaskNumberingSettings from '../components/settings/TaskNumberingSettings.svelte';
  import DataManagement from '../components/settings/DataManagement.svelte';
  import ApiSettings from '../components/settings/ApiSettings.svelte';
  import SystemPromptSettings from '../components/settings/SystemPromptSettings.svelte';
  import StatisticsSettings from '../components/settings/StatisticsSettings.svelte';
  import { t } from '../services/i18n';
  import pkg from '../../../package.json';
  import { store } from '../state/store.svelte';

  type TabId = 'general' | 'stylus' | 'ai' | 'data' | 'stats';

  const tabs: { id: TabId; labelKey: string; icon: string }[] = [
    { id: 'general',  labelKey: 'settings.tabs.general',   icon: 'tune'           },
    { id: 'stylus',   labelKey: 'settings.tabs.stylus',    icon: 'stylus_pen'     },
    { id: 'ai',       labelKey: 'settings.tabs.ai',        icon: 'smart_toy'      },
    { id: 'data',     labelKey: 'settings.tabs.data',      icon: 'database'       },
    { id: 'stats',    labelKey: 'settings.tabs.stats',     icon: 'bar_chart'      },
  ];

  let activeTab = $state<TabId>('general');

  async function handleCopyGithubLink() {
    try {
      await navigator.clipboard.writeText("https://github.com/Snansidansi/CanvasCritique");
      store.showNotification(t('settings.githubCopied'), 'success');
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }
</script>

<main class="grow overflow-hidden bg-surface-container-lowest flex flex-col h-full">
  <!-- Page Header -->
  <div class="px-8 pt-8 pb-0 shrink-0 bg-surface-container-lowest border-b border-outline-variant">
    <div class="max-w-200 w-full mx-auto">
      <div class="mb-5">
        <h2 class="text-2xl font-bold text-on-surface mb-1">{t('settings.title')}</h2>
        <p class="text-sm text-on-surface-variant">{t('settings.subtitle')}</p>
      </div>

      <!-- Tab Bar -->
      <div class="flex gap-1 overflow-x-auto no-scrollbar">
        {#each tabs as tab}
          <button
            onclick={() => activeTab = tab.id}
            class="flex items-center gap-2 px-5 py-3 font-semibold text-sm border-b-2 transition-colors shrink-0 focus:outline-none rounded-t-lg
                   {activeTab === tab.id
                     ? 'text-primary border-primary bg-primary/5'
                     : 'text-on-surface-variant border-transparent hover:bg-surface-variant/30 hover:text-on-surface'}"
          >
            <span class="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {t(tab.labelKey)}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Tab Content -->
  <div class="grow overflow-y-auto custom-scrollbar">
    <div class="max-w-200 w-full mx-auto p-8 pb-16">

      {#if activeTab === 'general'}
        <AppearanceSettings />
        <LanguageSettings />
        <CanvasPreferences />
        <TaskNumberingSettings />

      {:else if activeTab === 'stylus'}
        <StylusSettings />

      {:else if activeTab === 'ai'}
        <ApiSettings />
        <SystemPromptSettings />

      {:else if activeTab === 'data'}
        <DataManagement />

      {:else if activeTab === 'stats'}
        <StatisticsSettings />
      {/if}

      <!-- App Version & GitHub Link -->
      <div class="mt-12 flex flex-col items-center justify-center gap-2 border-t border-outline-variant/30 pt-6">
        <div class="flex items-center gap-1 opacity-35 select-none text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
          <span class="material-symbols-outlined text-[10px]">info</span>
          <span>Version {pkg.version}</span>
        </div>
        <button 
          onclick={handleCopyGithubLink}
          class="flex items-center gap-1.5 opacity-35 hover:opacity-75 transition-opacity text-[9px] font-bold uppercase tracking-wider text-on-surface-variant cursor-pointer focus:outline-none"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/>
          </svg>
          <span>{t('settings.githubRepository')}</span>
        </button>
      </div>

    </div>
  </div>
</main>

