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

  type TabId = 'general' | 'stylus' | 'ai' | 'data' | 'stats';

  const tabs: { id: TabId; labelKey: string; icon: string }[] = [
    { id: 'general',  labelKey: 'settings.tabs.general',   icon: 'tune'           },
    { id: 'stylus',   labelKey: 'settings.tabs.stylus',    icon: 'stylus_pen'     },
    { id: 'ai',       labelKey: 'settings.tabs.ai',        icon: 'smart_toy'      },
    { id: 'data',     labelKey: 'settings.tabs.data',      icon: 'database'       },
    { id: 'stats',    labelKey: 'settings.tabs.stats',     icon: 'bar_chart'      },
  ];

  let activeTab = $state<TabId>('general');
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

      <!-- App Version -->
      <div class="mt-12 flex items-center justify-center gap-1 opacity-35 select-none text-[9px] font-bold uppercase tracking-wider text-on-surface-variant border-t border-outline-variant/30 pt-6">
        <span class="material-symbols-outlined text-[10px]">info</span>
        <span>Version {pkg.version}</span>
      </div>

    </div>
  </div>
</main>

