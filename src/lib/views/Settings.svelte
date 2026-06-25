<script lang="ts">
  import StylusSettings from '../components/settings/StylusSettings.svelte';
  import AppearanceSettings from '../components/settings/AppearanceSettings.svelte';
  import CanvasPreferences from '../components/settings/CanvasPreferences.svelte';
  import DataManagement from '../components/settings/DataManagement.svelte';
  import ApiSettings from '../components/settings/ApiSettings.svelte';
  import SystemPromptSettings from '../components/settings/SystemPromptSettings.svelte';
  import StatisticsSettings from '../components/settings/StatisticsSettings.svelte';

  type TabId = 'general' | 'stylus' | 'ai' | 'data' | 'stats';

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'general',  label: 'General',   icon: 'tune'           },
    { id: 'stylus',   label: 'Stylus',    icon: 'stylus_pen'     },
    { id: 'ai',       label: 'AI & API',  icon: 'smart_toy'      },
    { id: 'data',     label: 'Data',      icon: 'database'       },
    { id: 'stats',    label: 'Statistics',icon: 'bar_chart'      },
  ];

  let activeTab = $state<TabId>('general');
</script>

<main class="grow overflow-hidden bg-surface-container-lowest flex flex-col h-full">
  <!-- Page Header -->
  <div class="px-8 pt-8 pb-0 shrink-0 bg-surface-container-lowest border-b border-outline-variant">
    <div class="max-w-200 w-full mx-auto">
      <div class="mb-5">
        <h2 class="text-2xl font-bold text-on-surface mb-1">Settings</h2>
        <p class="text-sm text-on-surface-variant">Manage your preferences, data, and API connections.</p>
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
            {tab.label}
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
        <CanvasPreferences />

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

    </div>
  </div>
</main>
