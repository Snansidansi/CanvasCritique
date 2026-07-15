<script lang="ts">
  import { store } from '../../state/store.svelte';
  import GeminiLogo from '../icons/GeminiLogo.svelte';
  import { t } from '../../services/i18n';

  // State variables for statistics settings and visualization
  let timeframe = $state<'1' | '7' | '30' | 'custom'>('7'); // '1' | '7' | '30' | 'custom' days
  let showCost = $state(true);
  let showRequests = $state(false);
  let showTokens = $state(false);
  let hoverIndex = $state<number | null>(null);

  // statsDaily fallback is no longer used since statistics are in own table

  // Calculate date boundaries
  const activeRangeDates = $derived.by(() => {
    let startD = new Date();
    let endD = new Date();

    if (timeframe === '1') {
      startD.setHours(0, 0, 0, 0);
    } else if (timeframe === '7') {
      startD.setDate(endD.getDate() - 6);
      startD.setHours(0, 0, 0, 0);
    } else if (timeframe === '30') {
      startD.setDate(endD.getDate() - 29);
      startD.setHours(0, 0, 0, 0);
    } else {
      startD = new Date(customStartDate);
      endD = new Date(customEndDate);
      startD.setHours(0, 0, 0, 0);
    }

    if (startD > endD) {
      const tmp = startD;
      startD = endD;
      endD = tmp;
    }

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
    let openrouter = { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 };

    const { start, end } = activeRangeDates;
    const history = store.statsHistory;

    for (const log of history) {
      const logDate = new Date(log.timestamp);
      if (logDate >= start && logDate <= end) {
        openrouter.requests += 1;
        openrouter.inputTokens += log.inputTokens || 0;
        openrouter.outputTokens += log.outputTokens || 0;
        openrouter.reasoningTokens += log.reasoningTokens || 0;
        openrouter.cost += log.cost || 0;
      }
    }

    const combined = openrouter;
    const gemini = { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 };

    return { gemini, openrouter, combined };
  });

  // Group request history by model inside range
  const modelStats = $derived.by(() => {
    const { start, end } = activeRangeDates;
    const history = store.statsHistory;
    const models: Record<string, { requests: number, inputTokens: number, outputTokens: number, cost: number }> = {};

    for (const log of history) {
      const logDate = new Date(log.timestamp);
      if (logDate >= start && logDate <= end) {
        if (!models[log.model]) {
          models[log.model] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
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
    const history = store.statsHistory;

    if (timeframe === '1') {
      // Group by hour of the current day (since 0:00)
      for (let hour = 0; hour < 24; hour++) {
        const d = new Date(start);
        d.setHours(hour, 0, 0, 0);
        const label = `${hour}:00`;
        list.push({
          date: d.toISOString(),
          label,
          geminiCost: 0,
          openRouterCost: 0,
          geminiRequests: 0,
          openRouterRequests: 0,
          geminiTokens: 0,
          openRouterTokens: 0,
          totalCost: 0,
          totalRequests: 0,
          totalTokens: 0
        });
      }

      for (const log of history) {
        const logDate = new Date(log.timestamp);
        if (logDate >= start && logDate <= end) {
          const hour = logDate.getHours();
          const item = list[hour];
          if (item) {
            item.openRouterCost += log.cost || 0;
            item.openRouterRequests += 1;
            item.openRouterTokens += (log.inputTokens || 0) + (log.outputTokens || 0);
            item.totalCost = item.geminiCost + item.openRouterCost;
            item.totalRequests = item.geminiRequests + item.openRouterRequests;
            item.totalTokens = item.geminiTokens + item.openRouterTokens;
          }
        }
      }
      return list;
    }

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
        openRouterCost += log.cost || 0;
        openRouterRequests += 1;
        openRouterTokens += (log.inputTokens || 0) + (log.outputTokens || 0);
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
  
  const activeMetrics = $derived([
    ...(showCost ? ['cost'] : []),
    ...(showRequests ? ['requests'] : []),
    ...(showTokens ? ['tokens'] : [])
  ]);
  const activeCount = $derived(activeMetrics.length);
  const paddingLeft = $derived(20 + activeCount * 42); // allocate 42px per active Y-axis label column
  const padding = $derived({ top: 20, right: 20, bottom: 30, left: paddingLeft });
  const graphWidth = $derived(svgWidth - padding.left - padding.right);
  const graphHeight = $derived(svgHeight - padding.top - padding.bottom);

  const maxCost = $derived(Math.max(...chartData.map(d => d.totalCost), 0.001));
  const maxRequests = $derived(Math.max(...chartData.map(d => d.totalRequests), 1));
  const maxTokens = $derived(Math.max(...chartData.map(d => d.totalTokens), 1));

  const costPoints = $derived.by(() => {
    if (chartData.length === 0) return [];
    return chartData.map((d, i) => {
      const x = padding.left + (i / (chartData.length - 1)) * graphWidth;
      const y = padding.top + graphHeight - (d.totalCost / maxCost) * graphHeight;
      return { x, y, value: d.totalCost, data: d };
    });
  });

  const requestsPoints = $derived.by(() => {
    if (chartData.length === 0) return [];
    return chartData.map((d, i) => {
      const x = padding.left + (i / (chartData.length - 1)) * graphWidth;
      const y = padding.top + graphHeight - (d.totalRequests / maxRequests) * graphHeight;
      return { x, y, value: d.totalRequests, data: d };
    });
  });

  const tokensPoints = $derived.by(() => {
    if (chartData.length === 0) return [];
    return chartData.map((d, i) => {
      const x = padding.left + (i / (chartData.length - 1)) * graphWidth;
      const y = padding.top + graphHeight - (d.totalTokens / maxTokens) * graphHeight;
      return { x, y, value: d.totalTokens, data: d };
    });
  });

  // Default points reference for X coordinates and hover matching
  const points = $derived(costPoints);

  const costLinePath = $derived.by(() => {
    if (costPoints.length === 0) return '';
    return costPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  });
  const costAreaPath = $derived.by(() => {
    if (costPoints.length === 0) return '';
    const first = costPoints[0];
    const last = costPoints[costPoints.length - 1];
    return `${costLinePath} L ${last.x} ${padding.top + graphHeight} L ${first.x} ${padding.top + graphHeight} Z`;
  });

  const requestsLinePath = $derived.by(() => {
    if (requestsPoints.length === 0) return '';
    return requestsPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  });
  const requestsAreaPath = $derived.by(() => {
    if (requestsPoints.length === 0) return '';
    const first = requestsPoints[0];
    const last = requestsPoints[requestsPoints.length - 1];
    return `${requestsLinePath} L ${last.x} ${padding.top + graphHeight} L ${first.x} ${padding.top + graphHeight} Z`;
  });

  const tokensLinePath = $derived.by(() => {
    if (tokensPoints.length === 0) return '';
    return tokensPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  });
  const tokensAreaPath = $derived.by(() => {
    if (tokensPoints.length === 0) return '';
    const first = tokensPoints[0];
    const last = tokensPoints[tokensPoints.length - 1];
    return `${tokensLinePath} L ${last.x} ${padding.top + graphHeight} L ${first.x} ${padding.top + graphHeight} Z`;
  });

  // Pointer-based chart hover and interaction handlers

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
      async () => {
        await store.clearStats();
        store.showNotification(t('settings.stats.notifyResetSuccess'), 'success');
      }
    );
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

  function formatCostShort(val: number): string {
    if (val === 0) return '$0';
    if (val < 0.01) return `$${val.toFixed(4)}`;
    return `$${val.toFixed(2)}`;
  }

  function formatTokensShort(val: number): string {
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
    return String(val);
  }

  // Local state for paginated request history table
  let tableStartDate = $state<string>('');
  let tableEndDate = $state<string>('');
  let tablePage = $state<number>(1);
  let tablePageSize = $state<10 | 50 | 100>(10);

  // Derivations to display the date part correctly in the native <input type="date"> elements
  const displayStartDate = $derived.by(() => {
    if (!tableStartDate) return '';
    if (tableStartDate.includes('T')) {
      return tableStartDate.split('T')[0];
    }
    return tableStartDate;
  });

  const displayEndDate = $derived.by(() => {
    if (!tableEndDate) return '';
    if (tableEndDate.includes('T')) {
      return tableEndDate.split('T')[0];
    }
    return tableEndDate;
  });

  // Drag selection state on chart
  let isDraggingRange = $state(false);
  let dragStartX = $state<number | null>(null);
  let dragCurrentX = $state<number | null>(null);

  function handleChartPointerDown(e: PointerEvent & { currentTarget: SVGSVGElement }) {
    if (points.length === 0) return;
    // Only react to primary pointer (left click, touch contact, stylus contact)
    if (e.button !== 0 && e.button !== -1) return;
    const target = e.currentTarget;
    try { target.setPointerCapture(e.pointerId); } catch (_) {}

    const rect = target.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const scaleX = svgWidth / rect.width;
    dragStartX = mouseX * scaleX;
    dragCurrentX = dragStartX;
    isDraggingRange = true;
  }

  function handleChartPointerMove(e: PointerEvent & { currentTarget: SVGSVGElement }) {
    // Tooltip hover highlight: calculate closest point
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const scaleX = svgWidth / rect.width;
    const chartMouseX = mouseX * scaleX;

    let closestIdx = 0;
    let minDiff = Infinity;
    points.forEach((p, idx) => {
      const diff = Math.abs(p.x - chartMouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    if (chartMouseX >= padding.left - 10 && chartMouseX <= svgWidth - padding.right + 10) {
      hoverIndex = closestIdx;
    } else {
      hoverIndex = null;
    }

    // Drag range update:
    if (isDraggingRange && dragStartX !== null) {
      dragCurrentX = chartMouseX;
    }
  }

  function handleChartPointerUp(e: PointerEvent & { currentTarget: SVGSVGElement }) {
    const target = e.currentTarget;
    try { target.releasePointerCapture(e.pointerId); } catch (_) {}

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

  function handleChartPointerLeave() {
    hoverIndex = null;
  }

  function handleChartPointerCancel(e: PointerEvent & { currentTarget: SVGSVGElement }) {
    const target = e.currentTarget;
    try { target.releasePointerCapture(e.pointerId); } catch (_) {}
    isDraggingRange = false;
    dragStartX = null;
    dragCurrentX = null;
    hoverIndex = null;
  }

  function resetTableFilter() {
    tableStartDate = '';
    tableEndDate = '';
    tablePage = 1;
  }

  // Derive filtered logs
  const filteredHistory = $derived.by(() => {
    const history = store.statsHistory;
    let list = [...history];

    if (tableStartDate) {
      let start: Date;
      if (tableStartDate.includes('T')) {
        start = new Date(tableStartDate);
      } else {
        start = new Date(tableStartDate + 'T00:00:00.000');
      }
      if (!isNaN(start.getTime())) {
        list = list.filter(log => new Date(log.timestamp) >= start);
      }
    }
    if (tableEndDate) {
      let end: Date;
      if (tableEndDate.includes('T')) {
        const d = new Date(tableEndDate);
        if (!isNaN(d.getTime())) {
          // If we drag-selected on Today view, include the full end hour block
          d.setMinutes(59, 59, 999);
          end = d;
        } else {
          end = new Date(tableEndDate);
        }
      } else {
        end = new Date(tableEndDate + 'T23:59:59.999');
      }
      if (!isNaN(end.getTime())) {
        list = list.filter(log => new Date(log.timestamp) <= end);
      }
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



  <!-- Aggregates Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
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
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 {timeframe === 'custom' ? 'mb-0' : 'mb-6'}">
      <div class="flex flex-wrap items-center gap-2">
        <button
          onclick={() => showCost = !showCost}
          class="px-3.5 py-1.5 text-xs rounded-full font-bold transition-all select-none border border-outline-variant/30 cursor-pointer"
          style={showCost 
            ? 'background-color: #10b981; color: white; border-color: #059669;' 
            : 'background-color: var(--color-surface-container-low); color: var(--color-on-surface-variant);'}
        >
          {t('settings.stats.costMetricBtn')}
        </button>
        <button
          onclick={() => showRequests = !showRequests}
          class="px-3.5 py-1.5 text-xs rounded-full font-bold transition-all select-none border border-outline-variant/30 cursor-pointer"
          style={showRequests 
            ? 'background-color: #3b82f6; color: white; border-color: #1d4ed8;' 
            : 'background-color: var(--color-surface-container-low); color: var(--color-on-surface-variant);'}
        >
          {t('settings.stats.requestsMetricBtn')}
        </button>
        <button
          onclick={() => showTokens = !showTokens}
          class="px-3.5 py-1.5 text-xs rounded-full font-bold transition-all select-none border border-outline-variant/30 cursor-pointer"
          style={showTokens 
            ? 'background-color: #f59e0b; color: white; border-color: #d97706;' 
            : 'background-color: var(--color-surface-container-low); color: var(--color-on-surface-variant);'}
        >
          {t('settings.stats.tokensMetricBtn')}
        </button>
      </div>

      <!-- Timeframe Capsules -->
      <div class="bg-surface-container-low border border-outline-variant/60 rounded-lg p-0.5 flex">
        <button
          onclick={() => timeframe = '1'}
          class="px-3 py-1 text-xs rounded-md font-semibold transition-all
                 {timeframe === '1' ? 'bg-surface text-primary shadow-xs font-bold' : 'text-on-surface-variant hover:text-on-surface'}"
        >
          {t('settings.stats.today')}
        </button>
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
      <div class="flex justify-end mt-2 mb-8">
        <div class="flex flex-wrap items-center gap-4 bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/60 w-fit">
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider" for="statsStartDate">
              {t('settings.stats.startDate') || 'Start Date'}
            </label>
            <div class="relative flex items-center">
              <input
                id="statsStartDate"
                type="date"
                bind:value={customStartDate}
                class="bg-surface-container-high border border-outline-variant/60 hover:border-outline rounded-lg pl-3 pr-9 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer w-38 transition-colors"
              />
              <span class="material-symbols-outlined absolute right-2.5 text-primary pointer-events-none text-[16px] select-none">
                calendar_today
              </span>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider" for="statsEndDate">
              {t('settings.stats.endDate') || 'End Date'}
            </label>
            <div class="relative flex items-center">
              <input
                id="statsEndDate"
                type="date"
                bind:value={customEndDate}
                class="bg-surface-container-high border border-outline-variant/60 hover:border-outline rounded-lg pl-3 pr-9 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer w-38 transition-colors"
              />
              <span class="material-symbols-outlined absolute right-2.5 text-primary pointer-events-none text-[16px] select-none">
                calendar_today
              </span>
            </div>
          </div>
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
          style="touch-action: none;"
          onpointerdown={handleChartPointerDown}
          onpointermove={handleChartPointerMove}
          onpointerup={handleChartPointerUp}
          onpointerleave={handleChartPointerLeave}
          onpointercancel={handleChartPointerCancel}
          role="application"
          aria-label={t('settings.stats.chartAria')}
        >
          <!-- Definitions for Gradients -->
          <defs>
            <linearGradient id="costAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0.15" />
              <stop offset="100%" stop-color="#10b981" stop-opacity="0.00" />
            </linearGradient>
            <linearGradient id="requestsAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.15" />
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.00" />
            </linearGradient>
            <linearGradient id="tokensAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.15" />
              <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.00" />
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

          <!-- Areas under the curves -->
          {#if showCost && costPoints.length > 0}
            <path d={costAreaPath} fill="url(#costAreaGrad)" />
          {/if}
          {#if showRequests && requestsPoints.length > 0}
            <path d={requestsAreaPath} fill="url(#requestsAreaGrad)" />
          {/if}
          {#if showTokens && tokensPoints.length > 0}
            <path d={tokensAreaPath} fill="url(#tokensAreaGrad)" />
          {/if}
 
          <!-- Main lines -->
          {#if showCost && costPoints.length > 0}
            <path d={costLinePath} fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          {/if}
          {#if showRequests && requestsPoints.length > 0}
            <path d={requestsLinePath} fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          {/if}
          {#if showTokens && tokensPoints.length > 0}
            <path d={tokensLinePath} fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          {/if}

          <!-- Hover indicators (Vertical line & dots) -->
          {#if hoverIndex !== null}
            {@const p = points[hoverIndex]}
            <line 
              x1={p.x} 
              y1={padding.top} 
              x2={p.x} 
              y2={padding.top + graphHeight} 
              stroke="var(--color-outline)" 
              stroke-opacity="0.4" 
              stroke-width="1.5" 
              stroke-dasharray="2,2"
              pointer-events="none"
            />
            {#if showCost && costPoints[hoverIndex]}
              {@const cp = costPoints[hoverIndex]}
              <circle cx={cp.x} cy={cp.y} r="6" fill="#10b981" fill-opacity="0.25" />
              <circle cx={cp.x} cy={cp.y} r="3.5" fill="var(--color-surface)" stroke="#10b981" stroke-width="2" />
            {/if}
            {#if showRequests && requestsPoints[hoverIndex]}
              {@const rp = requestsPoints[hoverIndex]}
              <circle cx={rp.x} cy={rp.y} r="6" fill="#3b82f6" fill-opacity="0.25" />
              <circle cx={rp.x} cy={rp.y} r="3.5" fill="var(--color-surface)" stroke="#3b82f6" stroke-width="2" />
            {/if}
            {#if showTokens && tokensPoints[hoverIndex]}
              {@const tp = tokensPoints[hoverIndex]}
              <circle cx={tp.x} cy={tp.y} r="6" fill="#f59e0b" fill-opacity="0.25" />
              <circle cx={tp.x} cy={tp.y} r="3.5" fill="var(--color-surface)" stroke="#f59e0b" stroke-width="2" />
            {/if}
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
            {@const startPt = points.find(p => p.data.date.startsWith(tableStartDate))}
            {@const endPt = points.find(p => p.data.date.startsWith(tableEndDate))}
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
            {#if timeframe === '1' ? (i % 4 === 0 || i === points.length - 1) : (timeframe === '7' || i % 5 === 0 || i === points.length - 1)}
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

          <!-- Y-Axis Columns for Active Metrics -->
          {#each activeMetrics as metric, metricIdx}
            {@const maxVal = metric === 'cost' ? maxCost : (metric === 'requests' ? maxRequests : maxTokens)}
            {@const color = metric === 'cost' ? '#10b981' : (metric === 'requests' ? '#3b82f6' : '#f59e0b')}
            {@const xPos = padding.left - 10 - (activeCount - 1 - metricIdx) * 42}
            {#each [0, 0.5, 1] as fraction}
              {@const val = (1 - fraction) * maxVal}
              {@const yPos = padding.top + fraction * graphHeight}
              <text 
                x={xPos} 
                y={yPos + 3} 
                fill={color}
                font-size="8" 
                text-anchor="end"
                class="font-bold opacity-95"
              >
                {metric === 'cost' ? formatCostShort(val) : (metric === 'requests' ? String(Math.round(val)) : formatTokensShort(val))}
              </text>
            {/each}
          {/each}
        </svg>

        <!-- Dynamic Chart Floating Tooltip Card -->
        {#if hoverIndex !== null && activeCount > 0}
          {@const p = points[hoverIndex]}
          <div 
            class="absolute pointer-events-none bg-surface-container-high border border-outline-variant/80 p-3 rounded-lg shadow-xl text-left text-xs z-20 space-y-1.5 min-w-36"
            style="
              left: {Math.min(Math.max((p.x / svgWidth) * 100 - 15, 2), 70)}%;
              top: {Math.max((p.y / svgHeight) * 100 - 55, -20)}%;
            "
          >
            <div class="font-bold border-b border-outline-variant pb-1.5 text-on-surface select-none">
              {p.data.label}{#if timeframe !== '1'}, {p.data.date.split('-')[0]}{/if}
            </div>
            
            <div class="space-y-1 text-on-surface-variant font-medium">
              {#if showCost}
                <div class="flex justify-between gap-6" style="color: #10b981;">
                  <span>{t('settings.stats.cost')}:</span>
                  <span class="font-bold">{formatCost(p.data.totalCost)}</span>
                </div>
              {/if}
              {#if showRequests}
                <div class="flex justify-between gap-6" style="color: #3b82f6;">
                  <span>{t('settings.stats.requests')}:</span>
                  <span class="font-bold">{p.data.totalRequests}</span>
                </div>
              {/if}
              {#if showTokens}
                <div class="flex justify-between gap-6" style="color: #f59e0b;">
                  <span>{t('settings.stats.tokensMetricBtn')}:</span>
                  <span class="font-bold">{formatTokens(p.data.totalTokens)}</span>
                </div>
              {/if}
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

    <!-- Minimalist range summary list -->
    <div class="mt-5 pt-4 border-t border-outline-variant/50 flex flex-col gap-1.5 max-w-64 select-none font-sans">
      <div class="flex justify-between items-center text-xs">
        <span class="text-on-surface-variant font-medium">{t('settings.stats.requests')}:</span>
        <span class="font-bold text-on-surface">{aggregates.combined.requests}</span>
      </div>
      <div class="flex justify-between items-center text-xs">
        <span class="text-on-surface-variant font-medium">{t('settings.stats.cost')}:</span>
        <span class="font-bold text-on-surface">{formatCost(aggregates.combined.cost)}</span>
      </div>
      <div class="flex justify-between items-center text-xs">
        <span class="text-on-surface-variant font-medium">{t('settings.stats.inputTokens')}:</span>
        <span class="font-bold text-on-surface">{formatTokens(aggregates.combined.inputTokens)}</span>
      </div>
      <div class="flex justify-between items-center text-xs">
        <span class="text-on-surface-variant font-medium">{t('settings.stats.outputTokens')}:</span>
        <span class="font-bold text-on-surface">{formatTokens(aggregates.combined.outputTokens)}</span>
      </div>
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
          <div class="relative flex items-center">
            <input
              id="tableStartDate"
              type="date"
              value={displayStartDate}
              onchange={(e) => {
                tableStartDate = e.currentTarget.value;
                tablePage = 1;
              }}
              class="bg-surface-container-high border border-outline-variant/60 hover:border-outline rounded-lg pl-3 pr-9 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer w-38 transition-colors"
            />
            <span class="material-symbols-outlined absolute right-2.5 text-primary pointer-events-none text-[16px] select-none">
              calendar_today
            </span>
          </div>
          <span class="text-outline text-xs">-</span>
          <div class="relative flex items-center">
            <input
              id="tableEndDate"
              type="date"
              value={displayEndDate}
              onchange={(e) => {
                tableEndDate = e.currentTarget.value;
                tablePage = 1;
              }}
              class="bg-surface-container-high border border-outline-variant/60 hover:border-outline rounded-lg pl-3 pr-9 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary cursor-pointer w-38 transition-colors"
            />
            <span class="material-symbols-outlined absolute right-2.5 text-primary pointer-events-none text-[16px] select-none">
              calendar_today
            </span>
          </div>
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
          ? 'Tipp: Du kannst im Diagramm oben klicken und ziehen, um direkt einen Zeitraum für diese Tabelle auszuwählen.'
          : 'Tip: You can click and drag in the chart above to select a time range for this table.'}
      </span>
    </div>
  </section>

  <!-- Usage by Model Section -->
  {#if store.statsHistory && store.statsHistory.length > 0}
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
              <th class="py-2 pr-4">{store.settings.language === 'Deutsch' ? 'Modell' : 'Model'}</th>
              <th class="py-2 px-4 text-right">{store.settings.language === 'Deutsch' ? 'Anfragen' : 'Requests'}</th>
              <th class="py-2 px-4 text-right">{store.settings.language === 'Deutsch' ? 'Tokens (In/Out)' : 'Tokens (In/Out)'}</th>
              <th class="py-2 pl-4 text-right">{store.settings.language === 'Deutsch' ? 'Kosten' : 'Cost'}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/30 text-on-surface">
            {#each modelStats as m}
              <tr class="hover:bg-surface-container-low/30 transition-colors">
                <td class="py-2.5 pr-4 font-mono font-medium truncate max-w-50" title={m.name}>{m.name}</td>
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
