<script lang="ts">
  import { store } from '../../state/store.svelte';
  import AiModelConfig from './AiModelConfig.svelte';
  import EvaluationDetailsSettings from './EvaluationDetailsSettings.svelte';
  import MediaFilterSettings from './MediaFilterSettings.svelte';
  import { t } from '../../services/i18n';

  // Connection test state
  let connectionTestStatus = $state(''); // 'idle' | 'testing' | 'success' | 'error'
  let connectionTestMessage = $state('');

  function handleInputChange() {
    store.saveSettings();
  }

  // API Connection Verification
  async function testApiConnection() {
    connectionTestStatus = 'testing';
    connectionTestMessage = t('settings.api.testConnectionActive');

    const provider = store.settings.apiProvider;
    const apiKey = store.apiKey;
    const model = store.model;

    if (!apiKey) {
      connectionTestStatus = 'error';
      connectionTestMessage = t('settings.api.testConnectionNoKey');
      return;
    }

    try {
      if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hello! Reply in one short word." }] }]
          })
        });
        const data = await response.json();
        if (response.ok && data.candidates && data.candidates[0]) {
          connectionTestStatus = 'success';
          connectionTestMessage = t('settings.api.testConnectionSuccess');
        } else {
          connectionTestStatus = 'error';
          connectionTestMessage = t('settings.api.testConnectionError', { error: data.error?.message || 'Invalid API key or model.' });
        }
      } else {
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        const requestBody: any = {
          model: model,
          messages: [{ role: "user", content: "Hello! Reply in one short word." }],
          reasoning: {
            exclude: !store.settings.openRouterReasoning
          }
        };
        const selectedProviders = store.settings.openRouterProvider || [];
        if (selectedProviders.length > 0) {
          requestBody.provider = {
            order: selectedProviders
          };
        }
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (response.ok && data.choices && data.choices[0]) {
          connectionTestStatus = 'success';
          connectionTestMessage = t('settings.api.testConnectionSuccess');
        } else {
          connectionTestStatus = 'error';
          connectionTestMessage = t('settings.api.testConnectionError', { error: data.error?.message || 'Invalid API key or model.' });
        }
      }
    } catch (err) {
      connectionTestStatus = 'error';
      connectionTestMessage = t('settings.api.testConnectionNetworkError', { error: err.message || err });
    }
  }
</script>

<!-- API Settings Section -->
<section class="mb-8 bg-surface p-6 md:p-8 rounded-xl border border-outline-variant shadow-sm relative overflow-visible">
  <div class="absolute top-0 right-0 w-64 h-64 bg-primary-fixed/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none z-0"></div>
  
  <div class="flex items-center gap-3 mb-6 border-b border-outline-variant pb-4 relative z-10">
    <span class="material-symbols-outlined text-primary">api</span>
    <h3 class="text-lg font-bold text-on-surface">{t('settings.api.title')}</h3>
  </div>
  
  <div class="relative z-10 flex flex-col gap-6">
    <!-- Reusable AI Model selection component -->
    <AiModelConfig settings={store.settings} showKeys={true} onchange={handleInputChange} />

    <!-- Evaluation Payload Settings -->
    <div class="mt-4 pt-4 border-t border-outline-variant/30 flex flex-col gap-3">
      <h4 class="text-sm font-bold text-on-surface">{t('settings.api.evaluationDetailsTitle')}</h4>
      <p class="text-xs text-on-surface-variant leading-relaxed">
        {t('settings.api.evaluationDetailsDesc')}
      </p>
      <EvaluationDetailsSettings settings={store.settings} onchange={handleInputChange} />
    </div>

    <!-- Media Filter Settings -->
    <div class="mt-4 pt-4 border-t border-outline-variant/30 flex flex-col gap-3">
      <h4 class="text-sm font-bold text-on-surface">{t('settings.api.mediaFilterMode')}</h4>
      <p class="text-xs text-on-surface-variant leading-relaxed">
        Definiere getrennte Filter für die Dateiendungen von Aufgabenmedien und Lösungsmedien.
      </p>
      <MediaFilterSettings settings={store.settings} onchange={handleInputChange} />
    </div>

    <!-- Connection Test Panel -->
    <div class="mt-4 pt-4 border-t border-outline-variant/30 flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={testApiConnection}
          disabled={connectionTestStatus === 'testing'}
          class="bg-secondary-container text-on-secondary-container hover:bg-secondary-container-high disabled:opacity-50 transition-all px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer flex items-center gap-2"
        >
          <span class="material-symbols-outlined text-[18px]">cell_tower</span>
          {t('settings.api.testConnectionBtn')}
        </button>
        
        {#if connectionTestStatus === 'testing'}
          <span class="text-xs text-on-surface-variant flex items-center gap-1.5 animate-pulse">
            <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            {t('settings.api.testing')}
          </span>
        {:else}
          {#if connectionTestStatus === 'success'}
            <span class="text-xs text-emerald-500 font-semibold flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">check_circle</span>
              {t('settings.api.verified')}
            </span>
          {:else if connectionTestStatus === 'error'}
            <span class="text-xs text-error font-semibold flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">error</span>
              {t('settings.api.failed')}
            </span>
          {/if}
        {/if}
      </div>
      {#if connectionTestMessage}
        <p class="text-xs {connectionTestStatus === 'success' ? 'text-emerald-500/80' : connectionTestStatus === 'error' ? 'text-error/80' : 'text-on-surface-variant'}">
          {connectionTestMessage}
        </p>
      {/if}
    </div>
  </div>
</section>

