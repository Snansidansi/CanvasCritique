<script lang="ts">
  import { store } from '../../state/store.svelte';
  import GeminiLogo from '../icons/GeminiLogo.svelte';
  import { t } from '../../services/i18n';

  // State variables for statistics settings and visualization
  let timeframe = $state<'7' | '30'>('7'); // '7' | '30' days
  let activeMetric = $state<'cost' | 'requests' | 'tokens'>('cost');
  let hoverIndex = $state<number | null>(null);

  // Fallback structure to prevent runtime access errors
  const statsDaily = $derived(store.settings.stats?.daily || {});

  // 1. Calculate overall aggregate statistics
  const aggregates = $derived.by(() => {
    let gemini = { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 };
    let openrouter = { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 };

    for (const date of Object.keys(statsDaily)) {
      const day = statsDaily[date];
      if (day.gemini) {
        gemini.requests += day.gemini.requests || 0;
        gemini.inputTokens += day.gemini.inputTokens || 0;
        gemini.outputTokens += day.gemini.outputTokens || 0;
        gemini.reasoningTokens += day.gemini.reasoningTokens || 0;
        gemini.cost += day.gemini.cost || 0;
      }
      if (day.openrouter) {
        openrouter.requests += day.openrouter.requests || 0;
        openrouter.inputTokens += day.openrouter.inputTokens || 0;
        openrouter.outputTokens += day.openrouter.outputTokens || 0;
        openrouter.reasoningTokens += day.openrouter.reasoningTokens || 0;
        openrouter.cost += day.openrouter.cost || 0;
      }
    }

    const combined = {
      requests: gemini.requests + openrouter.requests,
      inputTokens: gemini.inputTokens + openrouter.inputTokens,
      outputTokens: gemini.outputTokens + openrouter.outputTokens,
      reasoningTokens: gemini.reasoningTokens + openrouter.reasoningTokens,
      cost: gemini.cost + openrouter.cost
    };

    return { gemini, openrouter, combined };
  });

  // 2. Generate date range for selected timeframe
  const chartData = $derived.by(() => {
    const today = new Date();
    const list: Array<{
      date: string;
      label: string;
      geminiCost: number;
      openRouterCost: number;
      geminiRequests: number;
      openRouterRequests: number;
      geminiTokens: number;
      openRouterTokens: number;
      totalCost: number;
      totalRequests: number;
      totalTokens: number;
      allData: any;
    }> = [];
    const count = timeframe === '7' ? 7 : 30;

    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      // Format label (e.g., "Jun 24")
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      const dayData = statsDaily[dateStr] || {
        gemini: { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 },
        openrouter: { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 }
      };

      const gCost = dayData.gemini?.cost || 0;
      const orCost = dayData.openrouter?.cost || 0;
      const gReq = dayData.gemini?.requests || 0;
      const orReq = dayData.openrouter?.requests || 0;
      const gTok = (dayData.gemini?.inputTokens || 0) + (dayData.gemini?.outputTokens || 0);
      const orTok = (dayData.openrouter?.inputTokens || 0) + (dayData.openrouter?.outputTokens || 0);

      list.push({
        date: dateStr,
        label,
        geminiCost: gCost,
        openRouterCost: orCost,
        geminiRequests: gReq,
        openRouterRequests: orReq,
        geminiTokens: gTok,
        openRouterTokens: orTok,
        totalCost: gCost + orCost,
        totalRequests: gReq + orReq,
        totalTokens: gTok + orTok,
        allData: dayData
      });
    }
    return list;
  });

  // Calculate coordinates for the SVG chart
  const svgWidth = 600;
  const svgHeight = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const points = $derived.by(() => {
    if (chartData.length === 0) return [];
    
    // Determine active values based on metric selection
    const values = chartData.map(d => {
      if (activeMetric === 'cost') return d.totalCost;
      if (activeMetric === 'requests') return d.totalRequests;
      return d.totalTokens;
    });

    const maxValue = Math.max(...values, activeMetric === 'cost' ? 0.01 : 1);
    
    return chartData.map((d, i) => {
      const val = activeMetric === 'cost' ? d.totalCost : (activeMetric === 'requests' ? d.totalRequests : d.totalTokens);
      const x = padding.left + (i / (chartData.length - 1)) * graphWidth;
      const y = padding.top + graphHeight - (val / maxValue) * graphHeight;
      return { x, y, value: val, data: d };
    });
  });

  // SVG Paths
  const linePath = $derived.by(() => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  });

  const areaPath = $derived.by(() => {
    if (points.length === 0) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePath} L ${last.x} ${padding.top + graphHeight} L ${first.x} ${padding.top + graphHeight} Z`;
  });

  const maximumYVal = $derived.by(() => {
    if (points.length === 0) return activeMetric === 'cost' ? 0.01 : 1;
    const valuesList = points.map(p => p.value);
    return Math.max(...valuesList, activeMetric === 'cost' ? 0.01 : 1);
  });

  // Handle Chart Hover Index Calculation
  function handleMouseMove(e: MouseEvent & { currentTarget: SVGSVGElement }) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    // Scale factor between SVG viewBox and screen dimension
    const scaleX = svgWidth / rect.width;
    const chartMouseX = mouseX * scaleX;
    
    // Find closest point index
    let closestIdx = 0;
    let minDiff = Infinity;
    points.forEach((p, idx) => {
      const diff = Math.abs(p.x - chartMouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    // Make sure we are within hover limits
    if (chartMouseX >= padding.left - 10 && chartMouseX <= svgWidth - padding.right + 10) {
      hoverIndex = closestIdx;
    } else {
      hoverIndex = null;
    }
  }

  function handleMouseLeave() {
    hoverIndex = null;
  }

  // Action methods
  function toggleStats() {
    store.settings.statsEnabled = !store.settings.statsEnabled;
    store.saveSettings();

    const statusText = store.settings.statsEnabled
      ? (store.settings.language === 'Deutsch' ? 'aktiviert' : 'enabled')
      : (store.settings.language === 'Deutsch' ? 'deaktiviert' : 'disabled');

    store.showNotification(
      t('settings.stats.notifyTrackingStatus', { status: statusText }), 
      'info'
    );
  }

  function handleResetStats() {
    store.confirm(
      t('settings.stats.confirmResetTitle'),
      t('settings.stats.confirmResetMsg'),
      () => {
        store.settings.stats = { daily: {} };
        store.saveSettings();
        store.showNotification(t('settings.stats.notifyResetSuccess'), 'success');
      }
    );
  }

  function handleGeminiCostChange() {
    store.saveSettings();
  }

  // Format Helper functions
  function formatCost(val: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(val);
  }

  function formatTokens(val: number): string {
    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
    return val.toString();
  }
</script>

<div class="space-y-8">
  <!-- Header Card with Tracking Status and Toggle -->
  <section class="bg-surface p-6 rounded-xl border border-outline-variant shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h3 class="text-lg font-bold text-on-surface flex items-center gap-2">
        <span class="material-symbols-outlined text-primary">bar_chart</span>
        {t('settings.stats.title')}
      </h3>
      <p class="text-xs text-on-surface-variant mt-1">
        {t('settings.stats.desc')}
      </p>
    </div>
    
    <div class="flex items-center gap-3">
      <button 
        onclick={toggleStats}
        class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none 
               {store.settings.statsEnabled ? 'bg-primary' : 'bg-outline'}"
        role="switch"
        aria-checked={store.settings.statsEnabled}
        aria-label={t('settings.stats.toggleAria')}
      >
        <span 
          class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow ring-0 transition duration-200 ease-in-out
                 {store.settings.statsEnabled ? 'translate-x-5' : 'translate-x-0'}"
        ></span>
      </button>
      <span class="text-sm font-medium {store.settings.statsEnabled ? 'text-primary' : 'text-on-surface-variant'}">
        {store.settings.statsEnabled ? t('settings.stats.trackingEnabled') : t('settings.stats.trackingDisabled')}
      </span>
    </div>
  </section>

  {#if store.settings.statsEnabled}
    <section class="bg-surface p-6 rounded-xl border border-outline-variant shadow-sm">
      <h4 class="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
        <span class="material-symbols-outlined text-primary text-lg">payments</span>
        {t('settings.stats.geminiCostTitle')}
      </h4>
      <p class="text-xs text-on-surface-variant mb-4">
        {t('settings.stats.geminiCostDesc')}
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-on-surface" for="geminiInputCost">
            {t('settings.stats.geminiInputCostLabel')}
          </label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">$</span>
            <input
              type="number"
              id="geminiInputCost"
              bind:value={store.settings.geminiInputCostPerMillion}
              onchange={handleGeminiCostChange}
              step="0.001"
              min="0"
              class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg pl-7 pr-3 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
            />
          </div>
          <span class="text-[10px] text-on-surface-variant">{t('settings.stats.perMillionTokens')}</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-semibold text-on-surface" for="geminiOutputCost">
            {t('settings.stats.geminiOutputCostLabel')}
          </label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">$</span>
            <input
              type="number"
              id="geminiOutputCost"
              bind:value={store.settings.geminiOutputCostPerMillion}
              onchange={handleGeminiCostChange}
              step="0.001"
              min="0"
              class="w-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface rounded-lg pl-7 pr-3 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
            />
          </div>
          <span class="text-[10px] text-on-surface-variant">{t('settings.stats.perMillionTokens')}</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- Aggregates Grid -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
    <!-- Combined Card -->
    <div class="bg-gradient-to-br from-primary/10 via-primary/5 to-surface p-5 rounded-xl border border-primary/20 shadow-sm relative overflow-hidden">
      <div class="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-xl translate-x-8 -translate-y-8"></div>
      <div class="flex items-center gap-2.5 mb-4">
        <span class="material-symbols-outlined text-primary text-xl">all_inclusive</span>
        <h4 class="font-bold text-sm text-on-surface">{t('settings.stats.combinedTotal')}</h4>
      </div>
      <div class="space-y-2.5 text-xs text-on-surface-variant">
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.cost')}</span>
          <span class="font-bold text-on-surface text-sm">{formatCost(aggregates.combined.cost)}</span>
        </div>
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.requests')}</span>
          <span class="font-semibold text-on-surface">{aggregates.combined.requests}</span>
        </div>
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.inputTokens')}</span>
          <span class="font-semibold text-on-surface">{formatTokens(aggregates.combined.inputTokens)}</span>
        </div>
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.outputTokens')}</span>
          <span class="font-semibold text-on-surface">{formatTokens(aggregates.combined.outputTokens)}</span>
        </div>
        <div class="flex justify-between">
          <span>{t('settings.stats.reasoningTokens')}</span>
          <span class="font-semibold text-on-surface">{formatTokens(aggregates.combined.reasoningTokens)}</span>
        </div>
      </div>
    </div>

    <!-- Gemini Card -->
    <div class="bg-surface p-5 rounded-xl border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
      <div class="flex items-center gap-2.5 mb-4">
        <GeminiLogo class="text-secondary w-5 h-5 shrink-0" />
        <h4 class="font-bold text-sm text-on-surface">{t('settings.stats.geminiApi')}</h4>
      </div>
      <div class="space-y-2.5 text-xs text-on-surface-variant">
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.cost')}</span>
          <span class="font-bold text-on-surface text-sm">{formatCost(aggregates.gemini.cost)}</span>
        </div>
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.requests')}</span>
          <span class="font-semibold text-on-surface">{aggregates.gemini.requests}</span>
        </div>
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.inputTokens')}</span>
          <span class="font-semibold text-on-surface">{formatTokens(aggregates.gemini.inputTokens)}</span>
        </div>
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.outputTokens')}</span>
          <span class="font-semibold text-on-surface">{formatTokens(aggregates.gemini.outputTokens)}</span>
        </div>
        <div class="flex justify-between">
          <span>{t('settings.stats.reasoningTokens')}</span>
          <span class="font-semibold text-on-surface">{formatTokens(aggregates.gemini.reasoningTokens)}</span>
        </div>
      </div>
    </div>

    <!-- OpenRouter Card -->
    <div class="bg-surface p-5 rounded-xl border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
      <div class="flex items-center gap-2.5 mb-4">
        <span class="material-symbols-outlined text-tertiary text-xl">bolt</span>
        <h4 class="font-bold text-sm text-on-surface">{t('settings.stats.openRouterApi')}</h4>
      </div>
      <div class="space-y-2.5 text-xs text-on-surface-variant">
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.cost')}</span>
          <span class="font-bold text-on-surface text-sm">{formatCost(aggregates.openrouter.cost)}</span>
        </div>
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.requests')}</span>
          <span class="font-semibold text-on-surface">{aggregates.openrouter.requests}</span>
        </div>
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.inputTokens')}</span>
          <span class="font-semibold text-on-surface">{formatTokens(aggregates.openrouter.inputTokens)}</span>
        </div>
        <div class="flex justify-between border-b border-outline-variant/30 pb-1.5">
          <span>{t('settings.stats.outputTokens')}</span>
          <span class="font-semibold text-on-surface">{formatTokens(aggregates.openrouter.outputTokens)}</span>
        </div>
        <div class="flex justify-between">
          <span>{t('settings.stats.reasoningTokens')}</span>
          <span class="font-semibold text-on-surface">{formatTokens(aggregates.openrouter.reasoningTokens)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Interactive SVG Chart Section -->
  <section class="bg-surface p-6 rounded-xl border border-outline-variant shadow-sm">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <div class="flex flex-wrap items-center gap-2">
        <button
          onclick={() => activeMetric = 'cost'}
          class="px-3.5 py-1.5 text-xs rounded-full font-bold transition-all
                 {activeMetric === 'cost' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}"
        >
          {t('settings.stats.costMetricBtn')}
        </button>
        <button
          onclick={() => activeMetric = 'requests'}
          class="px-3.5 py-1.5 text-xs rounded-full font-bold transition-all
                 {activeMetric === 'requests' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}"
        >
          {t('settings.stats.requestsMetricBtn')}
        </button>
        <button
          onclick={() => activeMetric = 'tokens'}
          class="px-3.5 py-1.5 text-xs rounded-full font-bold transition-all
                 {activeMetric === 'tokens' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}"
        >
          {t('settings.stats.tokensMetricBtn')}
        </button>
      </div>

      <!-- Timeframe Capsules -->
      <div class="bg-surface-container-low border border-outline-variant/60 rounded-lg p-0.5 flex">
        <button
          onclick={() => timeframe = '7'}
          class="px-3 py-1 text-xs rounded-md font-semibold transition-all
                 {timeframe === '7' ? 'bg-surface text-primary shadow-xs font-bold' : 'text-on-surface-variant hover:text-on-surface'}"
        >
          {t('settings.stats.days7')}
        </button>
        <button
          onclick={() => timeframe = '30'}
          class="px-3 py-1 text-xs rounded-md font-semibold transition-all
                 {timeframe === '30' ? 'bg-surface text-primary shadow-xs font-bold' : 'text-on-surface-variant hover:text-on-surface'}"
        >
          {t('settings.stats.days30')}
        </button>
      </div>
    </div>

    <!-- Chart Container -->
    <div class="relative w-full h-[220px] select-none">
      {#if points.length > 0}
        <svg 
          viewBox="0 0 {svgWidth} {svgHeight}" 
          class="w-full h-full overflow-visible"
          onmousemove={handleMouseMove}
          onmouseleave={handleMouseLeave}
          role="application"
          aria-label={t('settings.stats.chartAria')}
        >
          <!-- Definitions for Gradients -->
          <defs>
            <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.25" />
              <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0.00" />
            </linearGradient>
          </defs>

          <!-- Horizontal Grid Lines -->
          {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
            {@const yVal = padding.top + fraction * graphHeight}
            <line 
              x1={padding.left} 
              y1={yVal} 
              x2={svgWidth - padding.right} 
              y2={yVal} 
              stroke="var(--color-outline-variant)" 
              stroke-opacity="0.3" 
              stroke-dasharray="3,3"
            />
          {/each}

          <!-- Area under the curve -->
          <path d={areaPath} fill="url(#chartAreaGrad)" />

          <!-- Main line -->
          <path d={linePath} fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

          <!-- Hover indicators (Vertical line & dots) -->
          {#if hoverIndex !== null}
            {@const p = points[hoverIndex]}
            <line 
              x1={p.x} 
              y1={padding.top} 
              x2={p.x} 
              y2={padding.top + graphHeight} 
              stroke="var(--color-primary)" 
              stroke-opacity="0.4" 
              stroke-width="1.5" 
              stroke-dasharray="2,2"
            />
            <!-- Outer Glow dot -->
            <circle cx={p.x} cy={p.y} r="6" fill="var(--color-primary)" fill-opacity="0.25" />
            <!-- Inner crisp dot -->
            <circle cx={p.x} cy={p.y} r="3.5" fill="var(--color-surface)" stroke="var(--color-primary)" stroke-width="2" />
          {/if}

          <!-- X-Axis Labels (Date Labels - Sparse selection for 30 days) -->
          {#each points as p, i}
            {#if timeframe === '7' || i % 5 === 0 || i === points.length - 1}
              <text 
                x={p.x} 
                y={svgHeight - 10} 
                fill="var(--color-on-surface-variant)" 
                font-size="9" 
                text-anchor="middle"
                class="font-medium opacity-80"
              >
                {p.data.label}
              </text>
            {/if}
          {/each}

          <!-- Y-Axis (Draw dynamic labels based on metric) -->
          {#each [0, 0.5, 1] as fraction}
            {@const val = (1 - fraction) * maximumYVal}
            {@const yPos = padding.top + fraction * graphHeight}
            <text 
              x={padding.left - 10} 
              y={yPos + 3} 
              fill="var(--color-on-surface-variant)" 
              font-size="9" 
              text-anchor="end"
              class="font-medium opacity-80"
            >
              {activeMetric === 'cost' ? formatCost(val) : formatTokens(val)}
            </text>
          {/each}
        </svg>

        <!-- Dynamic Chart Floating Tooltip Card -->
        {#if hoverIndex !== null}
          {@const p = points[hoverIndex]}
          <div 
            class="absolute pointer-events-none bg-surface-container-high border border-outline-variant/80 p-3.5 rounded-lg shadow-xl text-left text-xs z-20 space-y-1.5 min-w-[170px]"
            style="
              left: {Math.min(Math.max((p.x / svgWidth) * 100 - 15, 2), 70)}%;
              top: {Math.max((p.y / svgHeight) * 100 - 55, -20)}%;
            "
          >
            <div class="font-bold border-b border-outline-variant pb-1.5 text-on-surface">
              {p.data.label}, {p.data.date.split('-')[0]}
            </div>
            
            <div class="space-y-1 text-on-surface-variant font-medium">
              <div class="flex justify-between gap-6">
                <span>{t('settings.stats.cost')}:</span>
                <span class="font-bold text-on-surface">{formatCost(p.data.totalCost)}</span>
              </div>
              <div class="flex justify-between gap-6">
                <span>{t('settings.stats.requests')}:</span>
                <span class="font-bold text-on-surface">{p.data.totalRequests}</span>
              </div>
              <div class="flex justify-between gap-6">
                <span>{t('settings.stats.tokensMetricBtn')}:</span>
                <span class="font-bold text-on-surface">{formatTokens(p.data.totalTokens)}</span>
              </div>
              <div class="text-[10px] text-primary/80 pt-1 border-t border-outline-variant/40 flex justify-between">
                <span>Gemini:</span>
                <span>{formatCost(p.data.geminiCost)}</span>
              </div>
              <div class="text-[10px] text-tertiary/85 flex justify-between">
                <span>OpenRouter:</span>
                <span>{formatCost(p.data.openRouterCost)}</span>
              </div>
            </div>
          </div>
        {/if}
      {:else}
        <div class="flex flex-col items-center justify-center h-full border border-dashed border-outline-variant rounded-lg">
          <span class="material-symbols-outlined text-outline text-3xl mb-2">analytics</span>
          <span class="text-sm font-semibold text-on-surface-variant">{t('settings.stats.noData')}</span>
        </div>
      {/if}
    </div>
  </section>

  <!-- Danger / Management Section -->
  <section class="bg-surface p-6 rounded-xl border border-outline-variant shadow-sm">
    <h4 class="font-bold text-sm text-on-surface mb-1 text-error">{t('settings.stats.controlsTitle')}</h4>
    <p class="text-xs text-on-surface-variant mb-4">
      {t('settings.stats.controlsDesc')}
    </p>

    <button
      onclick={handleResetStats}
      class="px-4 py-2 border border-error/30 text-error hover:bg-error/5 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 cursor-pointer focus:outline-none"
    >
      <span class="material-symbols-outlined text-sm">delete_forever</span>
      {t('settings.stats.resetBtn')}
    </button>
  </section>
</div>
