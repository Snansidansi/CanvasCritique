<script lang="ts">
  import StylusSettings from '../components/settings/StylusSettings.svelte';
  import AppearanceSettings from '../components/settings/AppearanceSettings.svelte';
  import CanvasPreferences from '../components/settings/CanvasPreferences.svelte';
  import DataManagement from '../components/settings/DataManagement.svelte';
  import ApiSettings from '../components/settings/ApiSettings.svelte';
  import SystemPromptSettings from '../components/settings/SystemPromptSettings.svelte';
</script>

<main class="grow overflow-y-auto bg-surface-container-lowest flex flex-col relative h-full custom-scrollbar">
  <div class="max-w-200 w-full mx-auto p-8 pb-16">
    <div class="mb-10">
      <h2 class="text-2xl font-bold text-on-surface mb-2">Settings</h2>
      <p class="text-sm text-on-surface-variant">Manage your preferences, data, and API connections.</p>
    </div>

    <!-- Stylus Settings Section -->
    <StylusSettings />

    <!-- Appearance Section -->
    <AppearanceSettings />

    <!-- Canvas Preferences Section -->
    <CanvasPreferences />

    <!-- Data Management Section -->
    <DataManagement />

    <!-- API Settings Section -->
    <ApiSettings />

    <!-- System Prompt Section -->
    <SystemPromptSettings />
  </div>
</main>
