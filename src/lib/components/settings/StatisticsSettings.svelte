<script lang="ts">
  import { store } from '../../state/store.svelte';
  import GeminiLogo from '../icons/GeminiLogo.svelte';
  import { t } from '../../services/i18n';

  // State variables for statistics settings and visualization
  let timeframe = $state<'7' | '30' | 'custom'>('7'); // '7' | '30' | 'custom' days
  let activeMetric = $state<'cost' | 'requests' | 'tokens'>('cost');
  let hoverIndex = $state<number | null>(null);

  // Fallback structure to prevent runtime access errors
  const statsDaily = $derived(store.settings.stats?.daily || {});

  // Calculate date boundaries
  const activeRangeDates = $derived.by(() => {
    let startD = new Date();
    let endD = new Date();

    if (timeframe === '7') {
      startD.setDate(endD.getDate() - 6);
    } else if (timeframe === '30') {
      startD.setDate(endD.getDate() - 29);
    } else {
      startD = new Date(customStartDate);
      endD = new Date(customEndDate);
    }

    if (startD > endD) {
      const tmp = startD;
      startD = endD;
      endD = tmp;
    }

    startD.setHours(0, 0, 0, 0);
    endD.setHours(23, 59, 59, 999);

    return { start: startD, end: endD };
  });

  // Helper to get local date string YYYY-MM-DD
  function getLocalDateStr(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  let customStartDate = $state(getLocalDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  let customEndDate = $state(getLocalDateStr(new Date()));

  // 1. Calculate range aggregate statistics
  const aggregates = $derived.by(() => {
    let gemini = { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 };
    let openrouter = { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 };

    const { start, end } = activeRangeDates;
    const history = store.settings.stats?.history || [];

    for (const log of history) {
      const logDate = new Date(log.timestamp);
      if (logDate >= start && logDate <= end) {
        const statsObj = log.provider === 'gemini' ? gemini : openrouter;
        statsObj.requests += 1;
        statsObj.inputTokens += log.inputTokens || 0;
        statsObj.outputTokens += log.outputTokens || 0;
        statsObj.reasoningTokens += log.reasoningTokens || 0;
        statsObj.cost += log.cost || 0;
      }
    }

    // Fallback for daily aggregates if history is not populated yet
    if (history.length === 0) {
      for (const date of Object.keys(statsDaily)) {
        const dDate = new Date(date + 'T12:00:00');
        if (dDate >= start && dDate <= end) {
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

  // Group request history by model inside range
  const modelStats = $derived.by(() => {
    const { start, end } = activeRangeDates;
    const history = store.settings.stats?.history || [];
    const models: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number; provider: string }> = {};

    for (const log of history) {
      const logDate = new Date(log.timestamp);
      if (logDate >= start && logDate <= end) {
        if (!models[log.model]) {
          models[log.model] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0, provider: log.provider };
        }
        const item = models[log.model];
        item.requests += 1;
        item.inputTokens += log.inputTokens || 0;
        item.outputTokens += log.outputTokens || 0;
        item.cost += log.cost || 0;
      }
    }

    return Object.entries(models).map(([name, stats]) => ({
      name,
      ...stats
    })).sort((a, b) => b.cost - a.cost);
  });

  // 2. Generate date range for selected timeframe
  const chartData = $derived.by(() => {
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
    }> = [];

    const { start, end } = activeRangeDates;
    const history = store.settings.stats?.history || [];

    // Group logs by exact YYYY-MM-DD date string within start & end
    const dailyLogs: Record<string, typeof history> = {};
    const curr = new Date(start);
    let safety = 0;
    while (curr <= end && safety < 100) {
      const dateStr = getLocalDateStr(curr);
      dailyLogs[dateStr] = [];
      curr.setDate(curr.getDate() + 1);
      safety++;
    }

    for (const log of history) {
      const logDate = new Date(log.timestamp);
      const dateStr = getLocalDateStr(logDate);
      if (dailyLogs[dateStr]) {
        dailyLogs[dateStr].push(log);
      }
    }

    for (const [dateStr, logs] of Object.entries(dailyLogs)) {
      const d = new Date(dateStr + 'T12:00:00');
      const label = d.toLocaleDateString(store.settings.language === 'Deutsch' ? 'de-DE' : 'en-US', { month: 'short', day: 'numeric' });

      let geminiCost = 0, openRouterCost = 0;
      let geminiRequests = 0, openRouterRequests = 0;
      let geminiTokens = 0, openRouterTokens = 0;

      for (const log of logs) {
        if (log.provider === 'gemini') {
          geminiCost += log.cost || 0;
          geminiRequests += 1;
          geminiTokens += (log.inputTokens || 0) + (log.outputTokens || 0);
        } else {
          openRouterCost += log.cost || 0;
          openRouterRequests += 1;
          openRouterTokens += (log.inputTokens || 0) + (log.outputTokens || 0);
        }
      }

      list.push({
        date: dateStr,
        label,
        geminiCost,
        openRouterCost,
        geminiRequests,
        openRouterRequests,
        geminiTokens,
        openRouterTokens,
        totalCost: geminiCost + openRouterCost,
        totalRequests: geminiRequests + openRouterRequests,
        totalTokens: geminiTokens + openRouterTokens
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
        store.settings.stats = { daily: {}, history: [] };
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

  // Local state for paginated request history table
  let tableStartDate = $state<string>('');
  let tableEndDate = $state<string>('');
  let tablePage = $state<number>(1);
  let tablePageSize = $state<10 | 50 | 100>(10);

  // Drag selection state on chart
  let isDraggingRange = $state(false);
  let dragStartX = $state<number | null>(null);
  let dragCurrentX = $state<number | null>(null);

  function handleChartMouseDown(e: MouseEvent & { currentTarget: SVGSVGElement }) {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const scaleX = svgWidth / rect.width;
    dragStartX = mouseX * scaleX;
    dragCurrentX = dragStartX;
    isDraggingRange = true;
  }

  function handleChartMouseMove(e: MouseEvent & { currentTarget: SVGSVGElement }) {
    handleMouseMove(e); // Maintain tooltip hover highlight
    if (isDraggingRange && dragStartX !== null) {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const scaleX = svgWidth / rect.width;
      dragCurrentX = mouseX * scaleX;
    }
  }

  function handleChartMouseUp() {
    if (isDraggingRange && dragStartX !== null && dragCurrentX !== null) {
      const x1 = Math.min(dragStartX, dragCurrentX);
      const x2 = Math.max(dragStartX, dragCurrentX);

      // Find all points that fall within drag boundaries
      const selectedPoints = points.filter(p => p.x >= x1 && p.x <= x2);
      if (selectedPoints.length > 0) {
        const dates = selectedPoints.map(p => p.data.date);
        dates.sort();
        tableStartDate = dates[0];
        tableEndDate = dates[dates.length - 1];
        tablePage = 1;
      }
    }
    isDraggingRange = false;
    dragStartX = null;
    dragCurrentX = null;
  }

  function handleChartMouseLeave() {
    handleMouseLeave();
    if (isDraggingRange) {
      handleChartMouseUp();
    }
  }

  function resetTableFilter() {
    tableStartDate = '';
    tableEndDate = '';
    tablePage = 1;
  }

  // Derive filtered logs
  const filteredHistory = $derived.by(() => {
    const history = store.settings.stats?.history || [];
    let list = [...history];

    if (tableStartDate) {
      const start = new Date(tableStartDate + 'T00:00:00.000');
      list = list.filter(log => new Date(log.timestamp) >= start);
    }
    if (tableEndDate) {
      const end = new Date(tableEndDate + 'T23:59:59.999');
      list = list.filter(log => new Date(log.timestamp) <= end);
    }

    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  });

  const totalTablePages = $derived(Math.ceil(filteredHistory.length / tablePageSize) || 1);

  const paginatedHistory = $derived.by(() => {
    const startIdx = (tablePage - 1) * tablePageSize;
    return filteredHistory.slice(startIdx, startIdx + tablePageSize);
  });
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
    <div class="bg-linear-to-br from-primary/10 via-primary/5 to-surface p-5 rounded-xl border border-primary/20 shadow-sm relative overflow-hidden">
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
        <button
          onclick={() => timeframe = 'custom'}
          class="px-3 py-1 text-xs rounded-md font-semibold transition-all
                 {timeframe === 'custom' ? 'bg-surface text-primary shadow-xs font-bold' : 'text-on-surface-variant hover:text-on-surface'}"
        >
          {t('settings.stats.customRange') || 'Custom'}
        </button>
      </div>
    </div>

    <!-- Custom Date Range Pickers -->
    {#if timeframe === 'custom'}
      <div class="flex flex-wrap items-center gap-4 bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/60 w-fit">
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider" for="statsStartDate">
            {t('settings.stats.startDate') || 'Start Date'}
          </label>
          <input
            id="statsStartDate"
            type="date"
            bind:value={customStartDate}
            class="bg-surface border border-outline-variant rounded-md px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider" for="statsEndDate">
            {t('settings.stats.endDate') || 'End Date'}
          </label>
          <input
            id="statsEndDate"
            type="date"
            bind:value={customEndDate}
            class="bg-surface border border-outline-variant rounded-md px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer"
          />
        </div>
      </div>
    {/if}

    <!-- Chart Container -->
    <div class="relative w-full h-55 select-none">
      {#if points.length > 0}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <svg 
          viewBox="0 0 {svgWidth} {svgHeight}" 
          class="w-full h-full overflow-visible cursor-crosshair select-none"
          onmousedown={handleChartMouseDown}
          onmousemove={handleChartMouseMove}
          onmouseup={handleChartMouseUp}
          onmouseleave={handleChartMouseLeave}
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

          <!-- Dragging range overlay -->
          {#if isDraggingRange && dragStartX !== null && dragCurrentX !== null}
            {@const x1 = Math.min(dragStartX, dragCurrentX)}
            {@const x2 = Math.max(dragStartX, dragCurrentX)}
            <rect
              x={x1}
              y={padding.top}
              width={x2 - x1}
              height={graphHeight}
              fill="var(--color-primary)"
              fill-opacity="0.15"
              stroke="var(--color-primary)"
              stroke-width="1.5"
              stroke-dasharray="3,3"
              pointer-events="none"
            />
          {/if}

          <!-- Persistent selected range overlay -->
          {#if tableStartDate && tableEndDate && !isDraggingRange}
            {@const startPt = points.find(p => p.data.date === tableStartDate)}
            {@const endPt = points.find(p => p.data.date === tableEndDate)}
            {#if startPt && endPt}
              {@const x1 = Math.min(startPt.x, endPt.x)}
              {@const x2 = Math.max(startPt.x, endPt.x)}
              <rect
                x={x1 - 10}
                y={padding.top}
                width={x2 - x1 + 20}
                height={graphHeight}
                fill="var(--color-primary)"
                fill-opacity="0.08"
                stroke="var(--color-primary)"
                stroke-width="1"
                stroke-opacity="0.2"
                pointer-events="none"
              />
            {/if}
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
            class="absolute pointer-events-none bg-surface-container-high border border-outline-variant/80 p-3.5 rounded-lg shadow-xl text-left text-xs z-20 space-y-1.5 min-w-42.5"
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
              <div class="text-[10px] text-primary font-semibold pt-1 border-t border-outline-variant/40 flex justify-between">
                <span>Gemini:</span>
                <span>{formatCost(p.data.geminiCost)}</span>
              </div>
              <div class="text-[10px] text-primary font-semibold flex justify-between">
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

  <!-- Requests History List Section -->
  <section class="bg-surface p-6 rounded-xl border border-outline-variant shadow-sm space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant pb-4">
      <div class="flex flex-col gap-0.5 shrink-0">
        <h4 class="font-bold text-sm text-on-surface">
          {store.settings.language === 'Deutsch' ? 'Verlauf der Anfragen' : 'Request History'}
        </h4>
        <p class="text-xs text-on-surface-variant">
          {store.settings.language === 'Deutsch' ? 'Auflistung aller getätigten KI-Anfragen' : 'List of all made AI requests'}
        </p>
      </div>

      <!-- Time Range Selectors + Reset -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1.5">
          <input
            id="tableStartDate"
            type="date"
            bind:value={tableStartDate}
            onchange={() => tablePage = 1}
            class="bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer"
          />
          <span class="text-outline text-xs">-</span>
          <input
            id="tableEndDate"
            type="date"
            bind:value={tableEndDate}
            onchange={() => tablePage = 1}
            class="bg-surface-container-low border border-outline-variant rounded-lg px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer"
          />
        </div>
        {#if tableStartDate || tableEndDate}
          <button
            onclick={resetTableFilter}
            class="px-2.5 py-1 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-[11px] font-semibold rounded-lg text-on-surface cursor-pointer focus:outline-none transition-colors"
          >
            {store.settings.language === 'Deutsch' ? 'Zurücksetzen' : 'Reset'}
          </button>
        {/if}
      </div>
    </div>

    <!-- Paginated Request List Table -->
    {#if paginatedHistory.length > 0}
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-outline-variant/60 text-on-surface-variant font-semibold">
              <th class="py-2 pr-4">{store.settings.language === 'Deutsch' ? 'Zeitstempel' : 'Timestamp'}</th>
              <th class="py-2 px-4">{store.settings.language === 'Deutsch' ? 'Modell' : 'Model'}</th>
              <th class="py-2 px-4">{store.settings.language === 'Deutsch' ? 'Anbieter' : 'Provider'}</th>
              <th class="py-2 px-4 text-right">{store.settings.language === 'Deutsch' ? 'Input Tokens' : 'Input Tokens'}</th>
              <th class="py-2 px-4 text-right">{store.settings.language === 'Deutsch' ? 'Output Tokens' : 'Output Tokens'}</th>
              <th class="py-2 pl-4 text-right">{store.settings.language === 'Deutsch' ? 'Preis' : 'Cost'}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/30 text-on-surface">
            {#each paginatedHistory as log (log.id)}
              <tr class="hover:bg-surface-container-low/30 transition-colors">
                <td class="py-2.5 pr-4 text-on-surface-variant font-mono">
                  {new Date(log.timestamp).toLocaleString(store.settings.language === 'Deutsch' ? 'de-DE' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td class="py-2.5 px-4 font-mono font-medium truncate max-w-50" title={log.model}>{log.model}</td>
                <td class="py-2.5 px-4 capitalize">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold {log.provider === 'gemini' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}">
                    {log.provider}
                  </span>
                </td>
                <td class="py-2.5 px-4 text-right font-mono">{log.inputTokens.toLocaleString()}</td>
                <td class="py-2.5 px-4 text-right font-mono">{log.outputTokens.toLocaleString()}</td>
                <td class="py-2.5 pl-4 text-right font-semibold font-mono text-primary">{formatCost(log.cost)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-outline-variant/40 pt-4 text-xs">
        <div class="flex items-center gap-4 text-on-surface-variant">
          <span>
            {store.settings.language === 'Deutsch' 
              ? `Einträge: ${((tablePage - 1) * tablePageSize) + 1} - ${Math.min(tablePage * tablePageSize, filteredHistory.length)} von ${filteredHistory.length}`
              : `Showing ${((tablePage - 1) * tablePageSize) + 1} - ${Math.min(tablePage * tablePageSize, filteredHistory.length)} of ${filteredHistory.length}`}
          </span>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px]">{store.settings.language === 'Deutsch' ? 'Zeilen pro Seite:' : 'Rows per page:'}</span>
            <select
              bind:value={tablePageSize}
              onchange={() => tablePage = 1}
              class="bg-surface-container border border-outline-variant rounded-md px-1.5 py-0.5 text-xs text-on-surface focus:outline-none focus:border-primary font-semibold"
            >
              <option value={10}>10</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <!-- Quick jump back to page 1 -->
          {#if tablePage > 1}
            <button
              onclick={() => tablePage = 1}
              class="px-2 py-1 bg-surface-container hover:bg-surface-container-high rounded text-on-surface cursor-pointer focus:outline-none border-0 text-[11px] font-semibold transition-colors flex items-center gap-0.5"
              title={store.settings.language === 'Deutsch' ? 'Zur ersten Seite' : 'Jump to page 1'}
            >
              <span class="material-symbols-outlined text-xs">first_page</span>
              {store.settings.language === 'Deutsch' ? 'Erste' : 'First'}
            </button>
          {/if}

          <button
            onclick={() => tablePage = Math.max(1, tablePage - 1)}
            disabled={tablePage === 1}
            class="px-2 py-1 bg-surface-container hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed rounded text-on-surface cursor-pointer focus:outline-none border-0 text-[11px] font-semibold transition-colors flex items-center"
          >
            <span class="material-symbols-outlined text-xs">chevron_left</span>
          </button>

          <span class="px-3 py-1 font-semibold text-on-surface-variant">
            {store.settings.language === 'Deutsch' ? `Seite ${tablePage} von ${totalTablePages}` : `Page ${tablePage} of ${totalTablePages}`}
          </span>

          <button
            onclick={() => tablePage = Math.min(totalTablePages, tablePage + 1)}
            disabled={tablePage === totalTablePages}
            class="px-2 py-1 bg-surface-container hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed rounded text-on-surface cursor-pointer focus:outline-none border-0 text-[11px] font-semibold transition-colors flex items-center"
          >
            <span class="material-symbols-outlined text-xs">chevron_right</span>
          </button>
        </div>
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center py-10 border border-dashed border-outline-variant rounded-lg">
        <span class="material-symbols-outlined text-outline text-3xl mb-2">find_in_page</span>
        <span class="text-sm font-semibold text-on-surface-variant">
          {store.settings.language === 'Deutsch' ? 'Keine Anfragen für den ausgewählten Zeitraum vorhanden' : 'No request logs found for the selected range'}
        </span>
      </div>
    {/if}

    <!-- Subtle Drag Range Selector Tip Box -->
    <div class="flex items-start gap-2.5 bg-surface-container-low/50 p-3 rounded-lg border border-outline-variant/30 text-[11px] text-on-surface-variant font-medium leading-normal">
      <span class="material-symbols-outlined text-primary text-base shrink-0">info</span>
      <span>
        {store.settings.language === 'Deutsch' 
          ? 'Tipp: Du kannst im Diagramm oben mit der Maus klicken und ziehen, um direkt einen Zeitraum für diese Tabelle auszuwählen.'
          : 'Tip: You can click and drag in the chart above with your mouse to select a time range for this table.'}
      </span>
    </div>
  </section>

  <!-- Usage by Model Section -->
  {#if store.settings.stats?.history && store.settings.stats.history.length > 0}
    <section class="bg-surface p-6 rounded-xl border border-outline-variant shadow-sm space-y-4">
      <div class="flex items-center justify-between border-b border-outline-variant pb-3">
        <div class="flex flex-col gap-0.5">
          <h4 class="font-bold text-sm text-on-surface">
            {store.settings.language === 'Deutsch' ? 'Nutzung nach Modell' : 'Usage by Model'}
          </h4>
          <p class="text-xs text-on-surface-variant">
            {store.settings.language === 'Deutsch' ? 'Detaillierte Aufschlüsselung der Anfragen pro KI-Modell' : 'Detailed breakdown of requests per AI model'}
          </p>
        </div>
        <span class="text-xs font-semibold px-2 py-1 bg-surface-container rounded-full text-primary">
          {modelStats.length} {store.settings.language === 'Deutsch' ? 'Modelle' : 'Models'}
        </span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-outline-variant/60 text-on-surface-variant font-semibold">
              <th class="py-2 pr-4">{store.settings.language === 'Deutsch' ? 'Modellname' : 'Model Name'}</th>
              <th class="py-2 px-4">{store.settings.language === 'Deutsch' ? 'Anbieter' : 'Provider'}</th>
              <th class="py-2 px-4 text-right">{store.settings.language === 'Deutsch' ? 'Anfragen' : 'Requests'}</th>
              <th class="py-2 px-4 text-right">{store.settings.language === 'Deutsch' ? 'Tokens (In/Out)' : 'Tokens (In/Out)'}</th>
              <th class="py-2 pl-4 text-right">{store.settings.language === 'Deutsch' ? 'Kosten' : 'Cost'}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/30 text-on-surface">
            {#each modelStats as m}
              <tr class="hover:bg-surface-container-low/30 transition-colors">
                <td class="py-2.5 pr-4 font-mono font-medium truncate max-w-50" title={m.name}>{m.name}</td>
                <td class="py-2.5 px-4 capitalize">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold {m.provider === 'gemini' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}">
                    {m.provider}
                  </span>
                </td>
                <td class="py-2.5 px-4 text-right font-medium">{m.requests}</td>
                <td class="py-2.5 px-4 text-right text-on-surface-variant font-mono">
                  {formatTokens(m.inputTokens)} / {formatTokens(m.outputTokens)}
                </td>
                <td class="py-2.5 pl-4 text-right font-semibold font-mono text-primary">{formatCost(m.cost)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <!-- Danger / Management Section -->
  <section class="bg-surface p-6 rounded-xl border border-outline-variant shadow-sm">
    <h4 class="font-bold text-sm mb-1 text-error">{t('settings.stats.controlsTitle')}</h4>
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
