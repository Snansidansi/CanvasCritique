<script lang="ts">
  import { store } from '../../state/store.svelte';
  import AiModelConfig from './AiModelConfig.svelte';
  import EvaluationDetailsSettings from './EvaluationDetailsSettings.svelte';
  import MediaFilterSettings from './MediaFilterSettings.svelte';
  import { t } from '../../services/i18n';
  import { estimateCost } from '../../services/ai';
  import { OpenRouter, HTTPClient } from '@openrouter/sdk';

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

    const apiKey = store.apiKey;
    const model = store.model;

    if (!apiKey) {
      connectionTestStatus = 'error';
      connectionTestMessage = t('settings.api.testConnectionNoKey');
      return;
    }

    if (model) {
      try {
        await store.ensurePricingLoaded(model);
      } catch (err) {
        console.error('Failed to load OpenRouter pricing details for test:', err);
      }
    }

    try {
      // OpenRouter SDK integration
      const httpClient = new HTTPClient();
      httpClient.addHook('beforeRequest', async (req) => {
        if (req.url.includes('/chat/completions')) {
          try {
            const cloned = req.clone();
            const bodyText = await cloned.text();
            const bodyJson = JSON.parse(bodyText);
            
            const reasoningSetting = store.settings.openRouterReasoning;
            
            // Check if model supports reasoning from store
            const modelInfo = store.openRouterModels.find((m: any) => m.id === model);
            let supportsReasoning = false;
            let isMandatory = false;
            if (modelInfo) {
              supportsReasoning = !!modelInfo.reasoning;
              isMandatory = !!modelInfo.reasoning?.mandatory;
            } else {
              // Fallback keywords if openRouterModels isn't loaded/cached yet
              const modelLower = model.toLowerCase();
              if (
                modelLower.includes('deepseek-r1') ||
                modelLower.includes('o1-') ||
                modelLower.includes('o3-') ||
                modelLower.includes('thinking') ||
                modelLower.includes('qwq')
              ) {
                supportsReasoning = true;
                if (modelLower.includes('deepseek-r1') || modelLower.includes('qwq')) {
                  isMandatory = true;
                }
              }
            }

            if (supportsReasoning) {
              if (reasoningSetting === 'none' || reasoningSetting === false) {
                if (isMandatory) {
                  bodyJson.reasoning = {
                    exclude: true
                  };
                } else {
                  bodyJson.reasoning = {
                    effort: 'none',
                    exclude: true
                  };
                }
              } else if (typeof reasoningSetting === 'string' && reasoningSetting !== 'auto') {
                bodyJson.reasoning = {
                  exclude: false,
                  effort: reasoningSetting
                };
              } else {
                bodyJson.reasoning = {
                  exclude: false
                };
              }
            } else {
              // Must not send reasoning parameter to non-reasoning models
              delete bodyJson.reasoning;
            }
            
            return new Request(req.url, {
              method: req.method,
              headers: req.headers,
              body: JSON.stringify(bodyJson)
            });
          } catch (err) {
            console.error('Error modifying OpenRouter request body in hook:', err);
          }
        }
      });

      const client = new OpenRouter({
        apiKey: apiKey,
        httpClient: httpClient
      });

      const chatResult = await client.chat.send({
        chatRequest: {
          model: model,
          messages: [
            {
              role: 'user',
              content: "Reply EXCLUSIVELY with the word 'yes' and nothing else."
            }
          ],
          ...(store.settings.maxOutputTokens && store.settings.maxOutputTokens > 0 ? { maxTokens: store.settings.maxOutputTokens } : {})
        }
      });

      if (chatResult && chatResult.choices && chatResult.choices[0]) {
        connectionTestStatus = 'success';
        connectionTestMessage = t('settings.api.testConnectionSuccess');

        // Log request to stats database
        try {
          const inputTokens = chatResult.usage?.promptTokens || 0;
          const outputTokens = chatResult.usage?.completionTokens || 0;
          const reasoningTokens = chatResult.usage?.completionTokensDetails?.reasoningTokens || 0;
          const generationId = chatResult.id;

          let cost = 0;
          let costResolved = false;

          if (generationId && apiKey) {
            try {
              // Wait briefly for OpenRouter backend to index the generation (e.g., 800ms)
              await new Promise(resolve => setTimeout(resolve, 800));
              const genRes = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
                headers: {
                  'Authorization': `Bearer ${apiKey}`
                }
              });
              if (genRes.ok) {
                const genData = await genRes.json();
                if (genData?.data) {
                  const byokUsage = genData.data.byok_usage_inference || 0;
                  const normalUsage = genData.data.usage || 0;
                  cost = byokUsage || normalUsage || 0;
                  if (cost > 0) {
                    costResolved = true;
                  }
                }
              }
            } catch (err) {
              console.error('Failed to fetch exact cost for connection test from OpenRouter API:', err);
            }
          }

          if (!costResolved) {
            const price = store.openRouterPrices[model];
            if (price) {
              cost = (inputTokens * price.prompt) + (outputTokens * price.completion);
            } else {
              cost = estimateCost(model, inputTokens, outputTokens);
            }
          }

          await store.recordRequest('openrouter', model, inputTokens, outputTokens, reasoningTokens, cost);
        } catch (statsErr) {
          console.error('Failed to log OpenRouter connection test stats:', statsErr);
        }
      } else {
        connectionTestStatus = 'error';
        connectionTestMessage = t('settings.api.testConnectionError', { error: 'Invalid API key or model.' });
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


  </div>
</section>

