<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Chart, registerables, type ChartType } from 'chart.js';
  import { gsap } from 'gsap';
  import {
    Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2, Lightbulb, SlidersHorizontal, Star, ChartNoAxesCombined, CalendarDays, Eye, RotateCcw,
    ChevronDown, CircleHelp, Code2, Database, FileSpreadsheet, FileUp, Filter,
    LayoutDashboard, LoaderCircle, Menu, MoreHorizontal, PieChart, Play, Plus,
    Search, Settings2, ShieldCheck, Sparkles, Table2, Trash2, UploadCloud,
    WandSparkles, X, Zap, HardDrive, Github, TrendingUp, Layers, RefreshCcw
  } from 'lucide-svelte';
  import {
    loadDemo, loadFile, runQuery, inspectDataset, cleanDataset, getChartData,
    asCSV, downloadText, type DatasetInfo, type DataRow, type QueryOutput, type ChartPoint
  } from '$lib/analytics/engine';

  import { insightCatalog, inferRoles, quickInsights, executeInsight, compatible, missingRoles, roleLabels, type Role, type RoleMap, type InsightDefinition, type InsightResult } from '$lib/analytics/insights';
  Chart.register(...registerables);

  type Section = 'overview' | 'insights' | 'explore' | 'sql' | 'visualize' | 'quality';
  let section: Section = 'overview';
  let dataset: DatasetInfo | null = null;
  let isLoading = false;
  let engineReady = false;
  let notification = '';
  let errorMessage = '';
  let fileInput: HTMLInputElement;
  let sidebarOpen = false;
  let searchTerm = '';
  let query = 'SELECT region, SUM(revenue) AS total_revenue, COUNT(*) AS orders\nFROM dataset\nGROUP BY region\nORDER BY total_revenue DESC;';
  let output: QueryOutput | null = null;
  let runningQuery = false;
  let chartCanvas: HTMLCanvasElement;
  let currentChart: Chart | null = null;
  let chartType: 'bar' | 'line' | 'doughnut' = 'bar';
  let xColumn = '';
  let yColumn = '';
  let aggregation: 'sum' | 'avg' | 'count' = 'sum';
  let chartPoints: ChartPoint[] = [];
  let chartLoading = false;
  let savedCharts: Array<{ name: string; type: string; x: string; y: string; aggregation: string }> = [];
  let initialized = false;
  let roles: RoleMap = { date: '', value: '', category: '', revenue: '', cost: '', customer: '' };
  let quickResults: InsightResult[] = [];
  let selectedInsight: InsightResult | null = null;
  let selectedInsightId = '';
  let insightBusy = false;
  let insightCategory = 'Semua';
  let insightSearch = '';
  let showColumnMapping = false;
  const insightGroups = ['Semua', 'Ringkasan', 'Peringkat & Segmen', 'Penjualan & Profit', 'Tren Waktu', 'Pelanggan', 'Kualitas Data'];
  $: visibleInsights = insightCatalog.filter(item =>
    (insightCategory === 'Semua' || item.group === insightCategory) &&
    (item.title.toLowerCase().includes(insightSearch.toLowerCase()) ||
      item.description.toLowerCase().includes(insightSearch.toLowerCase()))
  );
  $: insightCount = insightCatalog.filter(item => compatible(item, roles)).length;

  const sections: Array<{ key: Section; title: string; detail: string; icon: any }> = [
    { key: 'overview', title: 'Ringkasan', detail: 'Workspace', icon: LayoutDashboard },
    { key: 'insights', title: 'Insight Studio', detail: '30 analisis siap pakai', icon: Sparkles },
    { key: 'explore', title: 'Data Explorer', detail: 'Browse records', icon: Table2 },
    { key: 'sql', title: 'SQL Playground', detail: 'Run queries', icon: Code2 },
    { key: 'visualize', title: 'Visualizations', detail: 'Build charts', icon: BarChart3 },
    { key: 'quality', title: 'Data Quality', detail: 'Profile & clean', icon: ShieldCheck }
  ];
  const features = [
    { icon: UploadCloud, title: 'Import any dataset', detail: 'CSV, TSV, JSON, XLSX and Parquet' },
    { icon: Zap, title: 'Analyze instantly', detail: 'Powerful DuckDB SQL in your browser' },
    { icon: BarChart3, title: 'Visualize insights', detail: 'Interactive, exportable charts' }
  ];

  $: filteredRows = (dataset?.preview ?? []).filter((row) =>
    Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(searchTerm.toLowerCase()))
  );
  $: totalMissing = dataset?.columns.reduce((acc, col) => acc + col.missing, 0) ?? 0;
  $: completeness = dataset?.rows && dataset.columns.length
    ? Math.max(0, (1 - totalMissing / (dataset.rows * dataset.columns.length)) * 100) : 100;
  $: numericColumns = dataset?.columns.filter((col) => /INT|DECIMAL|DOUBLE|FLOAT|HUGEINT|REAL/.test(col.type)) ?? [];
  $: textColumns = dataset?.columns.filter((col) => !/INT|DECIMAL|DOUBLE|FLOAT|HUGEINT|REAL/.test(col.type)) ?? [];

  onMount(() => {
    initialized = true;
    try {
      const stored = localStorage.getItem('dataforge-settings-v1');
      if (stored) {
        const state = JSON.parse(stored);
        chartType = state.chartType === 'line' || state.chartType === 'doughnut' ? state.chartType : 'bar';
        savedCharts = Array.isArray(state.savedCharts) ? state.savedCharts.slice(0, 16) : [];
      }
    } catch { /* Optional preferences only. */ }
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.from('.app-shell', { opacity: 0, y: 12, duration: 0.65, ease: 'power2.out' });
    }
  });

  function toast(message: string) {
    notification = message;
    errorMessage = '';
    setTimeout(() => { if (notification === message) notification = ''; }, 4600);
  }
  function showError(error: unknown) {
    errorMessage = error instanceof Error ? error.message : String(error);
    notification = '';
  }
  function savePreferences() {
    if (initialized) localStorage.setItem('dataforge-settings-v1', JSON.stringify({ chartType, savedCharts }));
  }
  async function refreshQuickInsights(info: DatasetInfo, mapping: RoleMap) {
    const next = await quickInsights(info, mapping);
    if (dataset?.name === info.name) quickResults = next;
  }
  async function updateRole(role: Role, value: string) {
    roles = { ...roles, [role]: value };
    selectedInsight = null;
    quickResults = [];
    if (dataset) await refreshQuickInsights(dataset, roles);
  }
  async function openInsight(item: InsightDefinition) {
    section = 'insights';
    if (!compatible(item, roles)) {
      showColumnMapping = true;
      toast('Pilih kolom: ' + missingRoles(item, roles).map(role => roleLabels[role]).join(', '));
      return;
    }
    selectedInsightId = item.id;
    selectedInsight = null;
    insightBusy = true;
    errorMessage = '';
    try {
      selectedInsight = await executeInsight(item, roles, dataset!);
    } catch (error) { showError(error); }
    finally { insightBusy = false; }
  }
  function insightCSV() {
    if (!selectedInsight) return;
    downloadText(asCSV(selectedInsight.output.rows, selectedInsight.output.columns), 'kleindata-' + selectedInsight.definition.id + '.csv', 'text/csv');
    toast('Hasil insight diekspor.');
  }
  function insightReport() {
    if (!selectedInsight || !dataset) return;
    const content = [
      '# KleinData · Laporan insight',
      '',
      'Dataset: ' + dataset.name,
      'Analisis: ' + selectedInsight.definition.title,
      'Dibuat: ' + new Date().toLocaleString('id-ID'),
      '',
      '## Temuan',
      selectedInsight.headline,
      selectedInsight.detail,
      '',
      '## Kueri analisis',
      '```sql',
      selectedInsight.sql,
      '```',
      '',
      '> Hasil dihitung dari dataset yang dimuat dan bukan rekomendasi kausal atau prediksi AI.'
    ].join('\\n');
    downloadText(content, 'kleindata-insight-report.md', 'text/markdown');
  }
  function setDefaults(info: DatasetInfo) {
    dataset = info;
    roles = inferRoles(info);
    quickResults = [];
    selectedInsight = null;
    void refreshQuickInsights(info, roles);
    engineReady = true;
    output = null;
    chartPoints = [];
    xColumn = info.columns.find((col) => /region|category|product|department|channel|month/i.test(col.name))?.name
      ?? info.columns.find((col) => /VARCHAR|DATE/.test(col.type))?.name ?? info.columns[0]?.name ?? '';
    yColumn = info.columns.find((col) => /revenue|sales|amount|price|total/i.test(col.name) && /INT|DOUBLE|DECIMAL|FLOAT/.test(col.type))?.name
      ?? info.columns.find((col) => /INT|DOUBLE|DECIMAL|FLOAT/.test(col.type))?.name ?? '';
    query = 'SELECT * FROM dataset LIMIT 100;';
    searchTerm = '';
    section = 'overview';
  }
  async function chooseDemo() {
    isLoading = true;
    errorMessage = '';
    try {
      const result = await loadDemo();
      setDefaults(result);
      toast('Dataset contoh berhasil dimuat. Insight siap dieksplorasi!');
    } catch (error) { showError(error); }
    finally { isLoading = false; }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    isLoading = true;
    errorMessage = '';
    try {
      const result = await loadFile(file);
      setDefaults(result);
      toast('Successfully imported ' + result.rows.toLocaleString() + ' records.');
    } catch (error) { showError(error); }
    finally { isLoading = false; if (fileInput) fileInput.value = ''; }
  }
  async function switchSection(next: Section) {
    section = next;
    sidebarOpen = false;
    await tick();
    if (next === 'visualize' && dataset) await generateChart();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.fromTo('.section-enter', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
    }
  }
  async function executeQuery() {
    if (!dataset || !query.trim()) return;
    runningQuery = true;
    errorMessage = '';
    try {
      output = await runQuery(query);
      toast('Query executed in ' + output.duration + ' ms.');
    } catch (error) { showError(error); }
    finally { runningQuery = false; }
  }
  async function generateChart() {
    if (!dataset || !xColumn || (aggregation !== 'count' && !yColumn)) return;
    chartLoading = true;
    errorMessage = '';
    try {
      chartPoints = await getChartData(xColumn, yColumn, aggregation);
      await tick();
      if (!chartCanvas) return;
      currentChart?.destroy();
      currentChart = new Chart(chartCanvas, {
        type: chartType as ChartType,
        data: {
          labels: chartPoints.map((item) => item.label),
          datasets: [{
            label: aggregation === 'count' ? 'Record count' : aggregation.toUpperCase() + ' of ' + yColumn,
            data: chartPoints.map((item) => item.value),
            backgroundColor: chartType === 'doughnut'
              ? ['#927bff', '#40c5b7', '#5aa8ff', '#fabd65', '#ee8fb8', '#a4b8d7', '#7864de', '#65a9a0', '#c2a3ff', '#aee2eb', '#d6ba7f', '#b7d9a7']
              : 'rgba(139, 116, 246, 0.82)',
            borderColor: chartType === 'line' ? '#9e85ff' : 'transparent',
            borderWidth: chartType === 'line' ? 3 : 0,
            borderRadius: chartType === 'bar' ? 6 : 0,
            tension: 0.34,
            fill: chartType === 'line',
            pointRadius: chartType === 'line' ? 4 : 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 480 },
          plugins: {
            legend: { display: chartType === 'doughnut', position: 'bottom', labels: { color: '#b1b7d1', padding: 17 } },
            tooltip: { backgroundColor: '#161b31', titleColor: '#fff', bodyColor: '#d5d9eb', padding: 12 }
          },
          scales: chartType === 'doughnut' ? {} : {
            x: { ticks: { color: '#9199b6', maxRotation: 40, minRotation: 0 }, grid: { display: false }, border: { display: false } },
            y: { beginAtZero: true, ticks: { color: '#9199b6' }, grid: { color: 'rgba(145,153,182,.10)' }, border: { display: false } }
          }
        }
      });
      savePreferences();
    } catch (error) { showError(error); }
    finally { chartLoading = false; }
  }
  async function applyClean(mode: 'duplicates' | 'nulls') {
    if (!dataset) return;
    if (!confirm(mode === 'nulls' ? 'Remove every row with any empty or null value? This changes the dataset in memory.' : 'Remove duplicate rows from the current dataset?')) return;
    isLoading = true;
    const oldCount = dataset.rows;
    try {
      dataset = await cleanDataset(mode, dataset.name);
      toast('Cleaned dataset: removed ' + (oldCount - dataset.rows) + ' rows.');
    } catch (error) { showError(error); }
    finally { isLoading = false; }
  }
  function exportPreview() {
    if (!dataset) return;
    downloadText(asCSV(dataset.preview, dataset.columns.map((col) => col.name)), 'kleindata-preview.csv', 'text/csv');
    toast('Preview exported as CSV.');
  }
  async function exportFullDataset() {
    if (!dataset) return;
    isLoading = true;
    try {
      const result = await runQuery('SELECT * FROM dataset LIMIT 1000');
      downloadText(asCSV(result.rows, result.columns), 'kleindata-export-first-1000.csv', 'text/csv');
      toast('Exported up to 1,000 rows. Full export can be performed with SQL COPY.');
    } catch (error) { showError(error); }
    finally { isLoading = false; }
  }
  function downloadChart() {
    if (!currentChart) return;
    const anchor = document.createElement('a');
    anchor.href = currentChart.toBase64Image('image/png', 1);
    anchor.download = 'kleindata-chart.png';
    anchor.click();
  }
  function saveChart() {
    if (!dataset) return;
    savedCharts = [...savedCharts, { name: 'Chart ' + (savedCharts.length + 1), type: chartType, x: xColumn, y: yColumn, aggregation }].slice(-16);
    savePreferences();
    toast('Chart settings saved to this browser.');
  }
  async function loadSavedChart(item: typeof savedCharts[number]) {
    if (!dataset) return;
    chartType = item.type as typeof chartType;
    xColumn = item.x;
    yColumn = item.y;
    aggregation = item.aggregation as typeof aggregation;
    await generateChart();
  }
  function exportWorkspace() {
    downloadText(JSON.stringify({
      app: 'KleinData', version: 1,
      dataset: dataset ? { name: dataset.name, rows: dataset.rows, columns: dataset.columns.map((col) => col.name) } : null,
      sql: query, charts: savedCharts
    }, null, 2), 'kleindata-workspace.json', 'application/json');
    toast('Workspace settings exported.');
  }
  function format(value: unknown) {
    if (value == null || value === '') return '—';
    if (typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return String(value);
  }
</script>

<svelte:head>
  <title>KleinData — Insight & Analytics Studio</title>
  <meta name="description" content="Import, clean, query and visualize datasets in a private, powerful analytics studio." />
</svelte:head>

<div class="app-shell" data-ready={initialized}>
  <aside class:sidebar-visible={sidebarOpen} class="sidebar">
    <div class="brand-area">
      <div class="brand-symbol"><svg viewBox="0 0 32 32" width="25" height="25" fill="none" aria-hidden="true"><path d="M16 1.5C18.8 11.1 20.9 13.2 30.5 16c-9.6 2.8-11.7 4.9-14.5 14.5C13.2 20.9 11.1 18.8 1.5 16 11.1 13.2 13.2 11.1 16 1.5Z" fill="currentColor"/></svg></div>
      <div class="brand-name">KleinData<span class="brand-dot">.</span><small>MAKE DATA MAKE SENSE</small></div>
      <button class="icon-btn close-sidebar" aria-label="Close navigation" on:click={() => sidebarOpen = false}><X size={18}/></button>
    </div>
    <div class="nav-scroll">
      <div class="nav-caption">WORKSPACE</div>
      {#each sections as item}
        <button class:active={section === item.key} class="nav-link" on:click={() => switchSection(item.key)}>
          <item.icon size={18} strokeWidth={1.85}/><span>{item.title}</span>
          {#if section === item.key}<span class="nav-active-dot"></span>{/if}
        </button>
      {/each}
      <div class="nav-caption nav-caption-space">YOUR DATASETS</div>
      {#if dataset}
        <button class="dataset-nav active-dataset" on:click={() => switchSection('explore')}>
          <FileSpreadsheet size={18}/><span class="truncate">{dataset.name}</span><span class="green-pip"></span>
        </button>
      {:else}
        <button class="dataset-nav" on:click={() => fileInput?.click()}><Plus size={17}/><span>Add your first dataset</span></button>
      {/if}
      <button class="dataset-nav" on:click={chooseDemo}><Database size={17}/><span>Retail demo dataset</span></button>
    </div>
    <div class="sidebar-foot">
      <div class="privacy-note"><ShieldCheck size={17}/><div><b>Privacy-first analytics</b><span>Your dataset stays in your browser.</span></div></div>
      <a href="https://github.com/Darren0099/KleinData" target="_blank" rel="noopener noreferrer" class="github-link"><Github size={17}/> View on GitHub <ArrowRight size={15}/></a>
    </div>
  </aside>

  {#if sidebarOpen}<button class="mobile-scrim" aria-label="Close navigation" on:click={() => sidebarOpen = false}></button>{/if}

  <main class="workspace-main">
    <header class="topbar">
      <div class="top-left">
        <button class="icon-btn mobile-menu" aria-label="Open menu" on:click={() => sidebarOpen = true}><Menu size={22}/></button>
        <div class="breadcrumb"><span>KleinData</span><span class="breadcrumb-separator">/</span><strong>{sections.find((item) => item.key === section)?.title}</strong></div>
        <nav class="quick-tabs" aria-label="Navigasi utama"><button class:chosen={section === 'overview'} on:click={() => switchSection('overview')}>Ringkasan</button><button class:chosen={section === 'insights'} on:click={() => switchSection('insights')}>Insight Studio</button><button class:chosen={section === 'visualize'} on:click={() => switchSection('visualize')}>Visualisasi</button></nav>
      </div>
      <div class="top-actions">
        <div class="engine-status"><span class:ready={engineReady} class="status-pip"></span>{engineReady ? 'Engine ready' : 'Browser compute'}</div>
        <button class="button button-outline button-sm hide-small" on:click={exportWorkspace} title="Export workspace settings"><ArrowDownToLine size={16}/> Export project</button>
        <button class="button button-primary button-sm" on:click={() => fileInput?.click()}><Plus size={17}/> New dataset</button>
      </div>
    </header>

    <input class="visually-hidden" bind:this={fileInput} type="file" accept=".csv,.tsv,.json,.parquet,.xlsx" on:change={(event) => importFile(event.currentTarget.files?.[0])}/>

    <div class="page-content section-enter">
      {#if notification}<div class="toast toast-success" role="status"><CheckCircle2 size={17}/><span>{notification}</span><button aria-label="Dismiss notification" on:click={() => notification = ''}><X size={15}/></button></div>{/if}
      {#if errorMessage}<div class="toast toast-error" role="alert"><CircleHelp size={18}/><span>{errorMessage}</span><button aria-label="Dismiss error" on:click={() => errorMessage = ''}><X size={16}/></button></div>{/if}

      {#if !dataset}
        <section class="welcome-hero">
          <div class="hero-grid"></div>
          <div class="hero-copy">
            <span class="eyebrow"><Sparkles size={14}/> KLEINDATA · SMART ANALYTICS WORKSPACE</span>
            <h1>Make data <span>make sense.</span></h1>
            <p>Impor datamu, temukan pola, lihat apa yang turun, siapa yang unggul, dan keputusan apa yang layak diuji. Semua dalam satu workspace yang sederhana.</p>
            <div class="hero-actions">
              <button class="button button-primary button-lg" disabled={isLoading} on:click={() => fileInput?.click()}><FileUp size={18}/> Import a dataset <ArrowRight size={17}/></button>
              <button class="button button-outline button-lg" disabled={isLoading || !initialized} on:click={chooseDemo}>{#if isLoading}<LoaderCircle size={17} class="spin"/>{:else}<Play size={17}/>{/if} Explore sample data</button>
            </div>
            <div class="hero-trust"><ShieldCheck size={16}/> Data diolah lokal di browser <span>·</span> Tanpa biaya langganan</div>
          </div>
          <div class="hero-art" aria-hidden="true">
            <div class="floating-badge floating-badge-top"><span class="purple-spark">✦</span> Smart analytics</div>
            <div class="mini-board">
              <div class="mini-board-head"><span><span class="dot purple"></span><span class="dot yellow"></span><span class="dot green"></span></span><span>performance.csv</span></div>
              <div class="mini-board-title">Revenue overview <span>↗ 18.6%</span></div>
              <div class="mini-board-value">$128,450 <small>+12.8% this month</small></div>
              <div class="mini-chart">{#each [30,42,38,57,49,72,60,81,71,93] as point,i}<span style:height={(point) + '%'} style:opacity={0.45 + i*0.055}></span>{/each}</div>
              <div class="mini-board-bottom"><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></div>
            </div>
            <div class="floating-badge floating-badge-bottom"><CheckCircle2 size={15}/> 240 rows analyzed</div>
          </div>
        </section>

        <div class="section-heading"><div><span class="label-top">GET STARTED</span><h2>Bawa datamu, biar angkanya bercerita</h2><p>Unggah, pahami, dan ubah angka mentah menjadi insight yang bisa dijelaskan.</p></div></div>
        <div class="feature-grid">
          {#each features as feature,i}
            <button class="feature-card" on:click={() => i === 0 ? fileInput?.click() : chooseDemo()}>
              <div class="feature-icon"><feature.icon size={22}/></div><h3>{feature.title}</h3><p>{feature.detail}</p><span>Get started <ArrowRight size={15}/></span>
            </button>
          {/each}
        </div>
        <section class="drop-area" role="button" tabindex="0" on:click={() => fileInput?.click()} on:keydown={(event) => event.key === 'Enter' && fileInput?.click()} on:dragover={(event) => event.preventDefault()} on:drop={(event) => { event.preventDefault(); importFile(event.dataTransfer?.files?.[0]); }}>
          <div class="drop-icon"><UploadCloud size={27}/></div><strong>Drop your dataset here, or click to browse</strong><span>Supports CSV, XLSX, Parquet, JSON, TSV · Up to 60 MB</span>
        </section>
      {:else if section === 'overview'}
        <div class="page-title-row">
          <div><div class="section-kicker"><span class="live-dot"></span> DATASET SIAP DIANALISIS</div><h1>Ringkasan data <span class="wave">✳</span></h1><p>Gambaran besar dari dataset yang baru kamu masukkan.</p></div>
          <button class="button button-outline" on:click={exportFullDataset}><ArrowDownToLine size={16}/> Export sample</button>
        </div>
        <div class="dataset-banner"><div class="banner-file"><FileSpreadsheet size={21}/></div><div><b>{dataset.name}</b><span>Imported dataset · In-memory DuckDB table</span></div><div class="banner-status"><span class="live-dot"></span> Siap dianalisis</div></div>
        
        <section class="auto-insights">
          <div class="auto-insights-heading"><div><span class="section-kicker"><Sparkles size={14}/> AUTO INSIGHT</span><h2>Yang perlu kamu ketahui dari data ini</h2><p>Insight awal dihitung otomatis setelah dataset diimpor.</p></div><button class="button button-dark" on:click={() => switchSection('insights')}>Jelajahi 30 analisis <ArrowRight size={17}/></button></div>
          {#if quickResults.length}
            <div class="quick-insight-grid">{#each quickResults as result,i}
              <button class="quick-insight-card" on:click={() => openInsight(result.definition)}><div class="quick-top"><span>{result.definition.group}</span><span class="quick-index">0{i+1}</span></div><h3>{result.definition.title}</h3><strong>{result.headline}</strong><p>{result.detail}</p><span class="quick-link">Lihat analisis <ArrowRight size={14}/></span></button>
            {/each}</div>
          {:else}
            <div class="quick-placeholder"><LoaderCircle size={17} class="spin"/> Mengidentifikasi insight yang sesuai...</div>
          {/if}
        </section>
        <div class="kpi-grid">
          <div class="stat-card"><div class="stat-label">Total records <Database size={17}/></div><strong>{dataset.rows.toLocaleString()}</strong><span>Rows imported successfully</span><div class="stat-accent"></div></div>
          <div class="stat-card"><div class="stat-label">Data columns <Layers size={17}/></div><strong>{dataset.columns.length.toLocaleString()}</strong><span>Fields detected automatically</span><div class="stat-accent accent-teal"></div></div>
          <div class="stat-card"><div class="stat-label">Completeness <ShieldCheck size={17}/></div><strong>{completeness.toFixed(1)}%</strong><span>Non-empty values across fields</span><div class="stat-accent accent-blue"></div></div>
          <div class="stat-card"><div class="stat-label">Missing values <Activity size={17}/></div><strong>{totalMissing.toLocaleString()}</strong><span>Cells worth reviewing</span><div class="stat-accent accent-orange"></div></div>
        </div>
        <div class="overview-grid">
          <div class="panel"><div class="panel-header"><div><h3>Dataset preview</h3><p>A quick look at the first records</p></div><button class="text-link" on:click={() => switchSection('explore')}>Explore all <ArrowRight size={15}/></button></div>
            <div class="table-scroll"><table class="data-table"><thead><tr>{#each dataset.columns.slice(0,6) as col}<th>{col.name}</th>{/each}</tr></thead><tbody>{#each dataset.preview.slice(0,5) as row}<tr>{#each dataset.columns.slice(0,6) as col}<td>{format(row[col.name])}</td>{/each}</tr>{/each}</tbody></table></div>
          </div>
          <div class="panel insights-panel"><div class="panel-header"><div><h3>Quick actions</h3><p>Move from data to decisions</p></div><Sparkles size={18} color="#a58cf6"/></div>
            <button class="action-row" on:click={() => switchSection('visualize')}><span class="action-icon purple-bg"><BarChart3 size={19}/></span><span><b>Build a visualization</b><small>Compare trends and distributions</small></span><ArrowRight size={17}/></button>
            <button class="action-row" on:click={() => switchSection('sql')}><span class="action-icon teal-bg"><Code2 size={19}/></span><span><b>Write a SQL query</b><small>Explore your data with DuckDB</small></span><ArrowRight size={17}/></button>
            <button class="action-row" on:click={() => switchSection('quality')}><span class="action-icon orange-bg"><WandSparkles size={19}/></span><span><b>Improve data quality</b><small>Profile and clean your records</small></span><ArrowRight size={17}/></button>
          </div>
        </div>
      
      {:else if section === 'insights'}
        <div class="insight-head">
          <div><div class="section-kicker"><Sparkles size={15}/> INTELLIGENT DATA EXPLORATION</div><h1>Temukan cerita di balik datamu<span class="headline-accent">.</span></h1><p>30 jenis analisis dengan SQL nyata, bukan angka acak atau kesimpulan yang diada-adakan.</p></div>
          <div class="insight-head-right"><div class="analysis-count"><span>{insightCount}</span><small>dari 30 analisis tersedia</small></div><button class="button button-outline" on:click={() => showColumnMapping = !showColumnMapping}><SlidersHorizontal size={17}/> Pemetaan kolom</button></div>
        </div>

        <div class="dataset-strip"><span class="strip-icon"><FileSpreadsheet size={19}/></span><div><b>{dataset.name}</b><span>{dataset.rows.toLocaleString('id-ID')} baris · {dataset.columns.length} kolom</span></div><span class="strip-private"><ShieldCheck size={16}/> Data diproses secara lokal</span></div>

        {#if showColumnMapping}
          <section class="mapping-panel">
            <div class="panel-header"><div><h3>Sesuaikan kolom dengan arti datamu</h3><p>KleinData menebak kolom otomatis. Koreksi di sini jika nama dataset berbeda.</p></div><button class="icon-btn" title="Tutup pemetaan" on:click={() => showColumnMapping = false}><X size={18}/></button></div>
            <div class="mapping-grid">
              {#each Object.keys(roleLabels) as key}
                <label class="mapping-field"><span>{roleLabels[key as Role]}</span><select aria-label={'Pemetaan ' + roleLabels[key as Role]} value={roles[key as Role]} on:change={(e) => updateRole(key as Role, e.currentTarget.value)}>
                  <option value="">Tidak dipetakan</option>
                  {#each dataset.columns.filter(col => key === 'date' || key === 'category' || key === 'customer' || /INT|DOUBLE|FLOAT|DECIMAL|REAL|NUMERIC/.test(col.type)) as col}
                    <option value={col.name}>{col.name} · {col.type}</option>
                  {/each}
                </select></label>
              {/each}
            </div>
            <p class="mapping-foot"><CircleHelp size={15}/> Contoh: untuk mencari penjualan turun, pilih kolom <b>Tanggal</b> dan <b>Pendapatan</b>. Analisis tanpa kolom yang cocok akan ditandai “perlu kolom”.</p>
          </section>
        {/if}

        <div class="insight-controls">
          <div class="insight-filter-scroll">{#each insightGroups as group}<button class:selected={insightCategory === group} on:click={() => insightCategory = group}>{group}</button>{/each}</div>
          <div class="search-box insight-search"><Search size={17}/><input aria-label="Cari analisis" placeholder="Cari jenis insight..." bind:value={insightSearch}/></div>
        </div>
        <div class="insight-catalog">
          {#each visibleInsights as item,i}
            <button class:unavailable={!compatible(item,roles)} class:active-insight={selectedInsightId === item.id} class="insight-tile" on:click={() => openInsight(item)} aria-label={'Analisis ' + item.title}>
              <div class="insight-tile-top"><span class="tile-id">{String(insightCatalog.indexOf(item) + 1).padStart(2,'0')}</span><span class:can-run={compatible(item,roles)} class="tile-state">{compatible(item,roles) ? 'Siap' : 'Perlu kolom'}</span></div>
              <div class="tile-icon">{#if item.group === 'Tren Waktu'}<ChartNoAxesCombined size={19}/>{:else if item.group === 'Penjualan & Profit'}<TrendingUp size={19}/>{:else if item.group === 'Kualitas Data'}<ShieldCheck size={19}/>{:else if item.group === 'Pelanggan'}<Database size={19}/>{:else if item.group === 'Peringkat & Segmen'}<BarChart3 size={19}/>{:else}<Sparkles size={19}/>{/if}</div>
              <h3>{item.title}</h3><p>{item.description}</p>
              <div class="tile-bottom"><span>{item.group}</span><ArrowRight size={16}/></div>
            </button>
          {:else}
            <div class="no-insights"><Search size={28}/><b>Tidak menemukan analisis</b><span>Coba kata kunci atau kategori yang berbeda.</span></div>
          {/each}
        </div>

        {#if insightBusy}
          <section class="insight-output loading-insight"><LoaderCircle size={23} class="spin"/><b>Menghitung insight dengan DuckDB...</b><p>Menjalankan analisis dari dataset asli.</p></section>
        {:else if selectedInsight}
          <section class="insight-output" id="hasil-insight">
            <div class="result-topline"><div><span class="label-top">HASIL ANALISIS · {selectedInsight.definition.group.toUpperCase()}</span><h2>{selectedInsight.definition.title}</h2></div><div class="result-actions"><button class="button button-outline button-sm" on:click={insightCSV}><ArrowDownToLine size={15}/> CSV</button><button class="button button-dark button-sm" on:click={insightReport}><ArrowDownToLine size={15}/> Laporan</button></div></div>
            <div class="result-highlight"><span>HASIL UTAMA</span><strong>{selectedInsight.headline}</strong><p>{selectedInsight.detail}</p></div>
            {#if selectedInsight.chart.length > 0}
              <div class="result-bars">{#each selectedInsight.chart as point,i}
                <div class="result-bar-row"><span title={point.label}>{point.label}</span><div class="bar-track"><div class="bar-fill" style:width={Math.max(4, Math.abs(point.value)/(Math.max(...selectedInsight.chart.map(p => Math.abs(p.value)), 1))*100)+'%'}></div></div><b>{point.value.toLocaleString('id-ID',{maximumFractionDigits:2})}</b></div>
              {/each}</div>
            {/if}
            <div class="result-table-wrap"><div class="result-table-title"><b>Data pendukung</b><span>{selectedInsight.output.rows.length} baris · {selectedInsight.output.duration} ms</span></div>
              <div class="table-scroll"><table class="data-table"><thead><tr>{#each selectedInsight.output.columns as col}<th>{col}</th>{/each}</tr></thead><tbody>{#each selectedInsight.output.rows.slice(0,30) as row}<tr>{#each selectedInsight.output.columns as col}<td>{format(row[col])}</td>{/each}</tr>{/each}</tbody></table></div>
            </div>
            <details class="query-details"><summary><Code2 size={16}/> Lihat SQL yang dijalankan <ChevronDown size={16}/></summary><pre>{selectedInsight.sql}</pre></details>
            <div class="result-disclaimer"><ShieldCheck size={16}/> Analisis deskriptif berdasarkan kolom yang dipetakan. Penurunan, korelasi, dan selisih tidak dengan sendirinya membuktikan penyebab.</div>
          </section>
        {/if}
      {:else if section === 'explore'}
        <div class="page-title-row"><div><div class="section-kicker">DATA EXPLORER</div><h1>Explore your data</h1><p>Preview the structure and contents of {dataset.name}.</p></div><button class="button button-outline" on:click={exportPreview}><ArrowDownToLine size={17}/> Download preview</button></div>
        <div class="panel"><div class="panel-header"><div><h3>Table preview <span class="subtle-chip">First 10 rows</span></h3><p>{dataset.rows.toLocaleString()} total rows · {dataset.columns.length} columns</p></div><div class="search-box"><Search size={16}/><input aria-label="Search preview" placeholder="Search preview..." bind:value={searchTerm}/></div></div>
          <div class="table-scroll"><table class="data-table"><thead><tr><th class="row-index">#</th>{#each dataset.columns as col}<th>{col.name}<small>{col.type}</small></th>{/each}</tr></thead><tbody>{#each filteredRows as row,i}<tr><td class="row-index">{i+1}</td>{#each dataset.columns as col}<td>{format(row[col.name])}</td>{/each}</tr>{:else}<tr><td colspan={dataset.columns.length+1} class="empty-cell">No matching rows in the preview.</td></tr>{/each}</tbody></table></div>
          <div class="table-footer">Showing {filteredRows.length} of the first {dataset.preview.length} rows <span>Use SQL Playground to query the full dataset</span></div>
        </div>
      {:else if section === 'sql'}
        <div class="page-title-row"><div><div class="section-kicker">QUERY WORKBENCH</div><h1>SQL Playground</h1><p>Ask precise questions of your data with DuckDB SQL.</p></div><span class="engine-pill"><span class="live-dot"></span> DuckDB-Wasm</span></div>
        <div class="panel sql-panel"><div class="sql-toolbar"><span><Code2 size={17}/> query.sql</span><div><span class="sql-tag">SQL</span><button class="button button-primary button-sm" on:click={executeQuery} disabled={runningQuery}>{#if runningQuery}<LoaderCircle size={16} class="spin"/>{:else}<Play size={16}/>{/if} Run query</button></div></div>
          <div class="sql-editor-wrap"><div class="line-numbers">1<br/>2<br/>3<br/>4<br/>5<br/>6<br/>7<br/>8</div><textarea aria-label="SQL query editor" spellcheck="false" bind:value={query} placeholder="SELECT * FROM dataset LIMIT 100;"></textarea></div>
          <div class="sql-hint"><Sparkles size={15}/> Your table is named <code>dataset</code>. All queries run locally in your browser.</div>
        </div>
        <div class="panel query-results"><div class="panel-header"><div><h3>Query results</h3><p>{output ? output.rows.length + ' rows returned in ' + output.duration + ' ms' : 'Run a query to see its result set.'}</p></div>{#if output}<button class="text-link" on:click={() => { if(output) downloadText(asCSV(output.rows, output.columns), 'kleindata-query.csv', 'text/csv'); }}><ArrowDownToLine size={16}/> Export CSV</button>{/if}</div>
          {#if output}<div class="table-scroll"><table class="data-table"><thead><tr>{#each output.columns as col}<th>{col}</th>{/each}</tr></thead><tbody>{#each output.rows as row}<tr>{#each output.columns as col}<td>{format(row[col])}</td>{/each}</tr>{:else}<tr><td class="empty-cell" colspan={Math.max(1,output.columns.length)}>Query completed. No rows returned.</td></tr>{/each}</tbody></table></div>{:else}<div class="empty-state"><Code2 size={32}/><b>Results will appear here</b><span>Use the sample query or write your own SQL to start.</span></div>{/if}
        </div>
        <div class="sql-examples"><span>TRY A QUERY</span><button on:click={() => query='SELECT * FROM dataset LIMIT 50;'}>Preview 50 rows</button><button on:click={() => query='SELECT COUNT(*) AS total_rows FROM dataset;'}>Count records</button><button on:click={() => query='DESCRIBE dataset;'}>View schema</button></div>
      {:else if section === 'visualize'}
        <div class="page-title-row"><div><div class="section-kicker">CHART BUILDER</div><h1>Make your data visible</h1><p>Turn raw numbers into useful, shareable charts.</p></div><button class="button button-outline" on:click={saveChart}><Plus size={17}/> Save chart</button></div>
        <div class="chart-workspace">
          <div class="panel chart-config"><div class="panel-header"><div><h3>Chart settings</h3><p>Customize your visualization</p></div><Settings2 size={18}/></div>
            <div class="form-group"><label for="chart-type">Visualization type</label><div class="chart-type-choices"><button class:selected={chartType==='bar'} on:click={() => {chartType='bar';generateChart();}}><BarChart3 size={19}/> Bar</button><button class:selected={chartType==='line'} on:click={() => {chartType='line';generateChart();}}><TrendingUp size={19}/> Line</button><button class:selected={chartType==='doughnut'} on:click={() => {chartType='doughnut';generateChart();}}><PieChart size={19}/> Donut</button></div></div>
            <div class="form-group"><label for="x-column">X axis / Group by</label><select id="x-column" bind:value={xColumn} on:change={generateChart}>{#each dataset.columns as col}<option value={col.name}>{col.name}</option>{/each}</select></div>
            <div class="form-group"><label for="aggregation">Aggregation</label><select id="aggregation" bind:value={aggregation} on:change={generateChart}><option value="sum">Sum</option><option value="avg">Average</option><option value="count">Record count</option></select></div>
            {#if aggregation !== 'count'}<div class="form-group"><label for="y-column">Y axis / Measure</label><select id="y-column" bind:value={yColumn} on:change={generateChart}>{#each numericColumns as col}<option value={col.name}>{col.name}</option>{/each}</select>{#if !numericColumns.length}<small>No numeric columns detected. Use Record count instead.</small>{/if}</div>{/if}
            <button class="button button-primary button-wide" disabled={chartLoading || !xColumn} on:click={generateChart}><RefreshCcw size={16}/> Update chart</button>
          </div>
          <div class="panel chart-result"><div class="panel-header"><div><h3>{aggregation === 'count' ? 'Record count' : (aggregation === 'avg' ? 'Average ' : 'Total ') + yColumn} by {xColumn}</h3><p>{chartPoints.length} groups · Live from DuckDB</p></div><button class="icon-btn border-btn" aria-label="Download chart" title="Download chart" on:click={downloadChart}><ArrowDownToLine size={17}/></button></div>
            {#if chartPoints.length}<div class="chart-canvas-wrap"><canvas bind:this={chartCanvas} aria-label="Data visualization"></canvas></div>{:else}<div class="empty-state"><BarChart3 size={34}/><b>{chartLoading ? 'Building chart...' : 'Choose chart settings'}</b><span>Data groups will appear in your visualization.</span></div>{/if}
          </div>
        </div>
        {#if savedCharts.length}<div class="panel saved-panel"><div class="panel-header"><div><h3>Saved configurations</h3><p>Charts are saved locally on this device, not uploaded.</p></div></div><div class="saved-chart-list">{#each savedCharts as item,i}<button on:click={() => loadSavedChart(item)}><BarChart3 size={17}/><span>{item.name}</span><small>{item.x} · {item.type}</small><ArrowRight size={16}/></button>{/each}</div></div>{/if}
      {:else if section === 'quality'}
        <div class="page-title-row"><div><div class="section-kicker">DATA HEALTH</div><h1>Quality & cleaning</h1><p>Understand your schema, spot missing values and clean records.</p></div><span class="engine-pill"><ShieldCheck size={15}/> {completeness.toFixed(1)}% complete</span></div>
        <div class="quality-summary panel"><div><span class="label-top">OVERALL DATA COMPLETENESS</span><strong>{completeness.toFixed(1)}%</strong><span>{totalMissing.toLocaleString()} missing cells found across {dataset.rows.toLocaleString()} records</span></div><div class="quality-progress"><span style:width={completeness + '%'}></span></div></div>
        <div class="panel"><div class="panel-header"><div><h3>Column profiles</h3><p>Type, missing values, and unique values for every field</p></div></div><div class="table-scroll"><table class="data-table profile-table"><thead><tr><th>Column name</th><th>Data type</th><th>Missing</th><th>Unique</th><th>Completeness</th></tr></thead><tbody>{#each dataset.columns as col}<tr><td><b>{col.name}</b></td><td><span class="type-chip">{col.type}</span></td><td>{col.missing.toLocaleString()}</td><td>{col.unique.toLocaleString()}</td><td><div class="quality-cell"><span><span style:width={(dataset.rows ? (1-col.missing/dataset.rows)*100 : 100)+'%'}></span></span>{(dataset.rows ? (1-col.missing/dataset.rows)*100 : 100).toFixed(0)}%</div></td></tr>{/each}</tbody></table></div></div>
        <div class="panel cleaning-panel"><div class="panel-header"><div><h3>Clean your dataset</h3><p>Changes apply to the in-memory table. Re-import to restore the original.</p></div></div><div class="clean-grid"><div><div class="clean-icon"><Layers size={20}/></div><h4>Remove duplicates</h4><p>Keep one copy of each identical row.</p><button class="button button-outline" disabled={isLoading} on:click={() => applyClean('duplicates')}>Run cleanup <ArrowRight size={15}/></button></div><div><div class="clean-icon orange-bg"><Trash2 size={20}/></div><h4>Remove incomplete rows</h4><p>Remove rows containing empty or missing values.</p><button class="button button-outline" disabled={isLoading} on:click={() => applyClean('nulls')}>Run cleanup <ArrowRight size={15}/></button></div></div></div>
      {/if}
      <footer class="app-footer"><span>© 2026 KleinData · Make data make sense</span><span><ShieldCheck size={14}/> Your data stays private and local</span></footer>
    </div>
  </main>
  {#if isLoading}<div class="loading-overlay"><div><LoaderCircle size={27} class="spin"/><strong>Preparing your workspace</strong><span>Running analysis locally with DuckDB...</span></div></div>{/if}
</div>
