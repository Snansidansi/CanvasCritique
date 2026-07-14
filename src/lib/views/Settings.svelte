<script lang="ts">
  import StylusSettings from '../components/settings/StylusSettings.svelte';
  import AppearanceSettings from '../components/settings/AppearanceSettings.svelte';
  import LanguageSettings from '../components/settings/LanguageSettings.svelte';
  import CanvasPreferences from '../components/settings/CanvasPreferences.svelte';
  import TaskNumberingSettings from '../components/settings/TaskNumberingSettings.svelte';
  import GeneralTextSettings from '../components/settings/GeneralTextSettings.svelte';
  import TextEditorSettings from '../components/settings/TextEditorSettings.svelte';
  import DataManagement from '../components/settings/DataManagement.svelte';
  import ApiSettings from '../components/settings/ApiSettings.svelte';
  import SystemPromptSettings from '../components/settings/SystemPromptSettings.svelte';
  import StatisticsSettings from '../components/settings/StatisticsSettings.svelte';
  import UpdateSettings from '../components/settings/UpdateSettings.svelte';
  import { t } from '../services/i18n';
  import pkg from '../../../package.json';
  import { store } from '../state/store.svelte';

  type TabId = 'general' | 'workspace' | 'stylus' | 'ai' | 'data' | 'stats' | 'update';

  const tabs: { id: TabId; labelKey: string; icon: string }[] = [
    { id: 'general',    labelKey: 'settings.tabs.general',   icon: 'tune'           },
    { id: 'workspace',  labelKey: 'settings.tabs.workspace', icon: 'edit_square'    },
    { id: 'stylus',     labelKey: 'settings.tabs.stylus',    icon: 'stylus_pen'     },
    { id: 'ai',         labelKey: 'settings.tabs.ai',        icon: 'smart_toy'      },
    { id: 'data',       labelKey: 'settings.tabs.data',      icon: 'database'       },
    { id: 'stats',      labelKey: 'settings.tabs.stats',     icon: 'bar_chart'      },
    { id: 'update',     labelKey: 'settings.tabs.update',    icon: 'update'         },
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

<main class="grow overflow-hidden bg-surface-container-lowest flex h-full">
  <!-- Settings Sidebar Navigation -->
  <div class="w-64 shrink-0 bg-surface-container-low border-r border-outline-variant flex flex-col justify-between p-6">
    <div class="flex flex-col gap-6">
      <!-- Title -->
      <div>
        <h2 class="text-xl font-bold text-on-surface flex items-center gap-2 select-none">
          <span class="material-symbols-outlined text-primary text-2xl">settings</span>
          {t('settings.title')}
        </h2>
      </div>

      <!-- Tab Buttons -->
      <nav class="flex flex-col gap-1">
        {#each tabs as tab}
          <button
            onclick={() => activeTab = tab.id}
            class="flex items-center gap-3 px-4 py-2.5 font-semibold text-sm rounded-lg transition-all text-left focus:outline-none cursor-pointer border-0 bg-transparent w-full
                   {activeTab === tab.id
                     ? 'text-primary bg-primary/8 shadow-sm'
                     : 'text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface'}"
          >
            <span class="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {t(tab.labelKey)}
          </button>
        {/each}
      </nav>
    </div>

    <!-- App Version & GitHub Link at bottom of sidebar -->
    <div class="flex flex-col gap-2 pt-6 border-t border-outline-variant/30">
      <div class="flex items-center gap-1.5 opacity-40 select-none text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
        <span class="material-symbols-outlined text-[10px]">info</span>
        <span>Version {pkg.version}</span>
      </div>
      <button 
        onclick={handleCopyGithubLink}
        class="flex items-center gap-1.5 opacity-40 hover:opacity-75 transition-opacity text-[9px] font-bold uppercase tracking-wider text-on-surface-variant cursor-pointer focus:outline-none border-0 bg-transparent p-0 text-left"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/>
        </svg>
        <span>{t('settings.githubRepository')}</span>
      </button>
    </div>
  </div>

  <!-- Settings Cards Container -->
  <div class="grow overflow-y-auto custom-scrollbar bg-surface-container-lowest">
    <div class="max-w-200 w-full mx-auto p-8 pb-16">
      <!-- Active Tab Header -->
      <div class="mb-6 border-b border-outline-variant/30 pb-4 select-none">
        <h2 class="text-xl font-bold text-on-surface">{t(tabs.find(t => t.id === activeTab)?.labelKey || '')}</h2>
      </div>

      {#if activeTab === 'general'}
        <AppearanceSettings />
        <LanguageSettings />
        <TaskNumberingSettings />

      {:else if activeTab === 'workspace'}
        <GeneralTextSettings />
        <CanvasPreferences />
        <TextEditorSettings />

      {:else if activeTab === 'stylus'}
        <StylusSettings />

      {:else if activeTab === 'ai'}
        <ApiSettings />
        <SystemPromptSettings />

      {:else if activeTab === 'data'}
        <DataManagement />

      {:else if activeTab === 'stats'}
        <StatisticsSettings />
      {:else if activeTab === 'update'}
        <UpdateSettings />
      {/if}
    </div>
  </div>
</main>

