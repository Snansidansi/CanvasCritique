<script lang="ts">
  import { store } from "../../state/store.svelte";
  import { t } from "../../services/i18n";
  import { testConnection, syncWebDav } from "../../services/webdav";

  let isTesting = $state(false);
  let testResult = $state<'success' | 'error' | null>(null);
  let testError = $state<string | null>(null);
  let showErrorDetails = $state(false);
  let showPassword = $state(false);

  async function handleTestConnection() {
    isTesting = true;
    testResult = null;
    testError = null;
    showErrorDetails = false;
    try {
      const res = await testConnection();
      if (res.success) {
        testResult = 'success';
      } else {
        testResult = 'error';
        testError = res.error || 'Unknown error';
      }
    } catch (e: any) {
      testResult = 'error';
      testError = e.message || String(e);
    } finally {
      isTesting = false;
    }
  }

  function formatLastSync(isoStr: string | undefined): string {
    if (!isoStr || isoStr === '0') return t('settings.data.webdavNeverSynced') || 'Never';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString();
    } catch {
      return isoStr;
    }
  }

</script>

<div class="flex flex-col gap-6 animate-fade-in">
  <div class="flex flex-col gap-2">
    <h3 class="font-bold text-lg text-on-surface">{t('settings.data.webdavTitle')}</h3>
    <p class="text-xs text-on-surface-variant">Sync your SQLite database and media files with a WebDAV server.</p>
  </div>

  <label class="flex items-center gap-3 cursor-pointer select-none">
    <div class="relative">
      <input
        type="checkbox"
        bind:checked={store.settings.webdavEnabled}
        onchange={() => store.saveSettings()}
        class="sr-only peer"
      />
      <div class="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
    </div>
    <span class="text-sm font-semibold text-on-surface">{t('settings.data.webdavEnable')}</span>
  </label>

  {#if store.settings.webdavEnabled}
    <div class="flex flex-col gap-4 p-4 border border-outline-variant rounded-xl bg-surface-container-lowest">
      
      <!-- Credentials -->
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-xs font-semibold text-on-surface">
          {t('settings.data.webdavUrl')}
          <input
            type="text"
            bind:value={store.settings.webdavUrl}
            onchange={() => store.saveSettings()}
            placeholder="https://example.com/webdav"
            class="mt-1 px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-primary text-on-surface"
          />
        </label>
        
        <label class="flex flex-col gap-1 text-xs font-semibold text-on-surface">
          {t('settings.data.webdavUsername')}
          <input
            type="text"
            bind:value={store.settings.webdavUsername}
            onchange={() => store.saveSettings()}
            class="mt-1 px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-primary text-on-surface"
          />
        </label>
        
        <label class="flex flex-col gap-1 text-xs font-semibold text-on-surface">
          {t('settings.data.webdavPassword')}
          <div class="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              bind:value={store.settings.webdavPassword}
              onchange={() => store.saveSettings()}
              class="mt-1 pl-3 pr-10 py-2 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-primary text-on-surface w-full"
            />
            <button
              type="button"
              onclick={() => showPassword = !showPassword}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant hover:text-on-surface focus:outline-none cursor-pointer flex items-center justify-center"
              style="margin-top: 2px;"
            >
              <span class="material-symbols-outlined text-[20px]">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </label>

        <div class="flex items-center gap-4 mt-2">
          <button
            onclick={handleTestConnection}
            disabled={isTesting}
            class="px-4 py-2 bg-secondary text-on-secondary text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2 cursor-pointer"
          >
            {#if isTesting}
              <span class="material-symbols-outlined animate-spin text-[18px]">sync</span>
            {:else}
              <span class="material-symbols-outlined text-[18px]">power</span>
            {/if}
            {t('settings.data.webdavTestConnection')}
          </button>
          
          {#if testResult === 'success'}
            <span class="text-xs text-primary font-semibold flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px]">check_circle</span> 
              {t('settings.api.verified') || 'Verified'}
            </span>
          {:else if testResult === 'error'}
            <div class="flex flex-col gap-1.5 grow">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs text-error font-semibold flex items-center gap-1">
                  <span class="material-symbols-outlined text-[16px]">error</span> 
                  {t('settings.api.failed') || 'Failed'}
                </span>
                {#if testError}
                  <button 
                    type="button"
                    onclick={() => showErrorDetails = !showErrorDetails} 
                    class="text-[11px] text-primary hover:underline cursor-pointer focus:outline-none font-semibold"
                  >
                    {showErrorDetails ? (t('settings.data.webdavHideDetails') || 'Hide details') : (t('settings.data.webdavShowDetails') || 'Show details')}
                  </button>
                {/if}
              </div>
              {#if showErrorDetails && testError}
                <pre class="text-[10px] bg-error/5 text-error border border-error/20 p-2 rounded-lg max-w-full overflow-x-auto whitespace-pre-wrap select-text leading-relaxed mt-1">{testError}</pre>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="h-px bg-outline-variant my-2"></div>

      <!-- Sync Settings -->
      <div class="flex flex-col gap-4">
        <label class="flex flex-col gap-1.5 text-xs font-semibold text-on-surface">
          {t('settings.data.webdavSyncMode') || 'Sync Mode'}
          <select
            bind:value={store.settings.webdavSyncMode}
            onchange={() => store.saveSettings()}
            class="mt-1 px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-primary text-on-surface w-full sm:w-64 cursor-pointer"
          >
            <option value="bidirectional">{t('settings.data.webdavSyncModeBidirectional') || 'Bidirectional (Default)'}</option>
            <option value="download">{t('settings.data.webdavSyncModeDownload') || 'Download Only'}</option>
            <option value="upload">{t('settings.data.webdavSyncModeUpload') || 'Upload Only'}</option>
          </select>
        </label>

        <label class="flex items-center gap-3 cursor-pointer select-none">
          <div class="relative">
            <input
              type="checkbox"
              bind:checked={store.settings.webdavAutoSync}
              onchange={() => store.saveSettings()}
              class="sr-only peer"
            />
            <div class="w-9 h-5 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </div>
          <span class="text-sm font-semibold text-on-surface">{t('settings.data.webdavAutoSync')}</span>
        </label>

        {#if store.settings.webdavAutoSync}
          <label class="flex flex-col gap-1 text-xs font-semibold text-on-surface ml-12">
            {t('settings.data.webdavSyncInterval')}
            <input
              type="number"
              bind:value={store.settings.webdavSyncIntervalMinutes}
              onchange={() => store.saveSettings()}
              min="1"
              class="mt-1 px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg focus:outline-none focus:border-primary text-on-surface w-32"
            />
          </label>
        {/if}

        <label class="flex items-center gap-3 cursor-pointer select-none">
          <div class="relative">
            <input
              type="checkbox"
              bind:checked={store.settings.webdavSyncOnStartup}
              onchange={() => store.saveSettings()}
              class="sr-only peer"
            />
            <div class="w-9 h-5 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </div>
          <span class="text-sm font-semibold text-on-surface">{t('settings.data.webdavSyncOnStartup')}</span>
        </label>
      </div>

      <div class="h-px bg-outline-variant my-2"></div>

      <!-- Sync Actions -->
      <div class="flex flex-col gap-3">
        <p class="text-xs font-medium text-on-surface-variant">
          {t('settings.data.webdavLastSync', { time: formatLastSync(store.settings.lastSyncedTimestamp) })}
        </p>

        <div class="flex gap-3">
          <button
            onclick={() => syncWebDav('download')}
            disabled={store.isSyncing}
            class="flex-1 px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container-highest disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">cloud_download</span>
            {t('settings.data.webdavForceDownload')}
          </button>

          <button
            onclick={() => syncWebDav('upload')}
            disabled={store.isSyncing}
            class="flex-1 px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container-highest disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">cloud_upload</span>
            {t('settings.data.webdavForceUpload')}
          </button>
        </div>
      </div>

    </div>
  {/if}
</div>
