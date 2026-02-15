import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatNumber, formatPercent, formatMultiple, rollingAverage } from '../../utils/helpers'

// Top chains to fetch individual TVL data for
const TOP_CHAINS = ['ethereum', 'solana', 'bsc', 'arbitrum', 'base', 'polygon', 'avalanche', 'optimism']
const FEES_CHAINS = ['ethereum', 'solana', 'arbitrum', 'base']

// Fetch on-chain economy data from multiple sources
async function fetchOnChainEconomyData() {
  // Build chain TVL fetches
  const chainTvlFetches = TOP_CHAINS.map(chain =>
    fetch(`https://api.llama.fi/v2/historicalChainTvl/${chain}`).then(r => r.ok ? r.json() : null)
  )
  
  // Build chain fees fetches
  const chainFeesFetches = FEES_CHAINS.map(chain =>
    fetch(`https://api.llama.fi/overview/fees/${chain}`).then(r => r.ok ? r.json() : null)
  )

  const results = await Promise.allSettled([
    // Core data
    fetch('https://api.llama.fi/v2/historicalChainTvl').then(r => r.ok ? r.json() : null),
    fetch('https://api.llama.fi/overview/fees?excludeTotalDataChartBreakdown=false').then(r => r.ok ? r.json() : null),
    fetch('https://api.llama.fi/overview/dexs').then(r => r.ok ? r.json() : null),
    fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true').then(r => r.ok ? r.json() : null),
    fetch('https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1').then(r => r.ok ? r.json() : null),
    fetch('https://api.llama.fi/hacks').then(r => r.ok ? r.json() : null),
    fetch('https://api.llama.fi/raises').then(r => r.ok ? r.json() : null),
    fetch('/api/coingecko?action=global').then(r => r.ok ? r.json() : null),
    // Chain-specific TVL data
    ...chainTvlFetches,
    // Chain-specific fees data
    ...chainFeesFetches,
  ])

  const getValue = (idx) => results[idx]?.status === 'fulfilled' ? results[idx].value : null

  // Parse chain TVL results
  const chainTvlData = {}
  TOP_CHAINS.forEach((chain, i) => {
    chainTvlData[chain] = getValue(8 + i)
  })

  // Parse chain fees results
  const chainFeesData = {}
  FEES_CHAINS.forEach((chain, i) => {
    chainFeesData[chain] = getValue(8 + TOP_CHAINS.length + i)
  })

  return {
    historicalTvl: getValue(0),
    feesOverview: getValue(1),
    dexsOverview: getValue(2),
    stablecoins: getValue(3),
    stablecoinCharts: getValue(4),
    hacks: getValue(5),
    raises: getValue(6),
    globalData: getValue(7),
    chainTvlData,
    chainFeesData,
  }
}

// Calculate Gini coefficient for concentration analysis
function calculateGini(values) {
  const sorted = [...values].filter(v => v > 0).sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return 0
  
  let sumOfDifferences = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumOfDifferences += Math.abs(sorted[i] - sorted[j])
    }
  }
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  return sumOfDifferences / (2 * n * n * mean)
}

// Build cumulative distribution for Lorenz curve
function buildLorenzCurve(values) {
  const sorted = [...values].filter(v => v > 0).sort((a, b) => a - b)
  const total = sorted.reduce((a, b) => a + b, 0)
  if (total === 0) return { x: [0, 100], y: [0, 100] }
  
  const n = sorted.length
  const x = [0]
  const y = [0]
  let cumSum = 0
  
  sorted.forEach((val, i) => {
    cumSum += val
    x.push(((i + 1) / n) * 100)
    y.push((cumSum / total) * 100)
  })
  
  return { x, y }
}

// Small nation GDP data for comparison (2023-2024 estimates in USD)
const NATION_GDPS = [
  { name: 'Tuvalu', gdp: 60e6 },
  { name: 'Nauru', gdp: 150e6 },
  { name: 'Palau', gdp: 270e6 },
  { name: 'Marshall Islands', gdp: 280e6 },
  { name: 'Micronesia', gdp: 440e6 },
  { name: 'São Tomé', gdp: 600e6 },
  { name: 'Tonga', gdp: 500e6 },
  { name: 'Dominica', gdp: 650e6 },
  { name: 'Samoa', gdp: 850e6 },
  { name: 'Vanuatu', gdp: 1e9 },
  { name: 'Comoros', gdp: 1.3e9 },
  { name: 'Cabo Verde', gdp: 2.2e9 },
  { name: 'Gambia', gdp: 2.4e9 },
  { name: 'Seychelles', gdp: 2e9 },
  { name: 'Belize', gdp: 3.3e9 },
  { name: 'Bhutan', gdp: 2.8e9 },
  { name: 'Guyana', gdp: 15e9 },
  { name: 'Montenegro', gdp: 7e9 },
  { name: 'Iceland', gdp: 30e9 },
  { name: 'Luxembourg', gdp: 85e9 },
  { name: 'Slovenia', gdp: 65e9 },
  { name: 'Estonia', gdp: 40e9 },
]

// Find comparable nation for a given GDP
function findComparableNation(gdp) {
  const sorted = [...NATION_GDPS].sort((a, b) => Math.abs(a.gdp - gdp) - Math.abs(b.gdp - gdp))
  return sorted[0]
}

// Aggregate data by year (dateField values may be Unix seconds — auto-detect)
function aggregateByYear(data, dateField, valueField, valueMultiplier = 1) {
  const yearly = {}
  data.forEach(item => {
    const raw = item[dateField]
    const date = new Date(typeof raw === 'number' && raw < 1e12 ? raw * 1000 : raw)
    if (isNaN(date.getTime())) return
    const year = date.getFullYear()
    if (year < 2000 || year > 2100) return
    if (!yearly[year]) yearly[year] = 0
    yearly[year] += (item[valueField] || 0) * valueMultiplier
  })
  return yearly
}

// Aggregate data by quarter (dateField values may be Unix seconds — auto-detect)
function aggregateByQuarter(data, dateField, valueField, valueMultiplier = 1) {
  const quarterly = {}
  data.forEach(item => {
    const raw = item[dateField]
    const date = new Date(typeof raw === 'number' && raw < 1e12 ? raw * 1000 : raw)
    if (isNaN(date.getTime())) return
    const year = date.getFullYear()
    if (year < 2000 || year > 2100) return
    const quarter = Math.floor(date.getMonth() / 3) + 1
    const key = `${year} Q${quarter}`
    if (!quarterly[key]) quarterly[key] = 0
    quarterly[key] += (item[valueField] || 0) * valueMultiplier
  })
  return quarterly
}

export default function OnChainEconomyTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchOnChainEconomyData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading on-chain economy data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  // Extract data
  const feesData = data?.feesOverview || {}
  const protocols = feesData?.protocols || []
  const totalDataChart = feesData?.totalDataChart || []
  const totalDataChartBreakdown = feesData?.totalDataChartBreakdown || []
  
  const dexsData = data?.dexsOverview || {}
  const stablecoinsList = data?.stablecoins?.peggedAssets || []
  const stablecoinCharts = data?.stablecoinCharts || []
  const historicalTvl = data?.historicalTvl || []
  const globalData = data?.globalData?.data || {}
  const hacks = data?.hacks || []
  const raises = data?.raises?.raises || data?.raises || []
  const chainTvlData = data?.chainTvlData || {}
  const chainFeesData = data?.chainFeesData || {}

  // ===========================================
  // KPI Calculations
  // ===========================================
  const totalFees24h = feesData?.total24h || 0
  const annualizedGDP = totalFees24h * 365
  
  // Calculate GDP growth rate (compare latest week to previous week)
  const recentFees = totalDataChart.slice(-14)
  const lastWeekFees = recentFees.slice(-7).reduce((s, d) => s + (d[1] || 0), 0)
  const prevWeekFees = recentFees.slice(0, 7).reduce((s, d) => s + (d[1] || 0), 0)
  const gdpGrowthRate = prevWeekFees > 0 ? ((lastWeekFees - prevWeekFees) / prevWeekFees) * 100 : null

  // Stablecoin market cap
  const totalStablecoinMcap = stablecoinsList.reduce((s, sc) => s + (sc.circulating?.peggedUSD || 0), 0)
  
  // Current TVL
  const currentTvl = historicalTvl.length > 0 ? historicalTvl[historicalTvl.length - 1]?.tvl || 0 : 0

  // Estimate stablecoin velocity = (Total Fees * 365) / Stablecoin Market Cap
  const estimatedVelocity = totalStablecoinMcap > 0 ? (annualizedGDP * 10) / totalStablecoinMcap : 0
  const tradFiM2Velocity = 1.1

  // Total hacked amount
  const totalHacked = hacks.reduce((s, h) => s + (h.amount || 0), 0)
  
  // Total VC raised (DeFiLlama amounts are in millions)
  const totalRaised = raises.reduce((s, r) => s + (r.amount || 0), 0) * 1e6

  // DEX volume
  const totalDexVolume24h = dexsData?.total24h || 0

  // ===========================================
  // Chart 1: Crypto GDP Time Series
  // ===========================================
  const gdpDates = totalDataChart.map(d => new Date(d[0] * 1000).toISOString().split('T')[0])
  const gdpValues = totalDataChart.map(d => (d[1] || 0) * 365) // annualized
  const gdpTrend = rollingAverage(gdpValues, 30)

  // ===========================================
  // Chart 2: GDP by Chain (Bar) - aggregated from all protocols
  // ===========================================
  const chainFees = {}
  protocols.forEach(p => {
    const chain = p.chains?.[0] || p.chain || 'Other'
    chainFees[chain] = (chainFees[chain] || 0) + (p.total24h || 0)
  })
  
  // Also incorporate chain-specific fees data
  FEES_CHAINS.forEach(chain => {
    const chainData = chainFeesData[chain]
    if (chainData?.total24h && !chainFees[chain.charAt(0).toUpperCase() + chain.slice(1)]) {
      const displayName = chain.charAt(0).toUpperCase() + chain.slice(1)
      chainFees[displayName] = chainData.total24h
    }
  })
  
  const sortedChains = Object.entries(chainFees)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)

  // ===========================================
  // Chart 3: TVL by Chain Over Time (Stacked Area)
  // ===========================================
  // Get all unique dates from chain TVL data
  const allTvlDates = new Set()
  Object.values(chainTvlData).forEach(chainData => {
    if (Array.isArray(chainData)) {
      chainData.forEach(d => {
        if (d.date) allTvlDates.add(d.date)
      })
    }
  })
  const tvlDates = Array.from(allTvlDates).sort((a, b) => a - b)
  const tvlDateStrings = tvlDates.map(d => new Date(d * 1000).toISOString().split('T')[0])
  
  // Build chain TVL time series
  const chainTvlSeries = {}
  TOP_CHAINS.forEach(chain => {
    const chainData = chainTvlData[chain]
    if (Array.isArray(chainData)) {
      const dateMap = {}
      chainData.forEach(d => { dateMap[d.date] = d.tvl || 0 })
      chainTvlSeries[chain] = tvlDates.map(d => dateMap[d] || 0)
    } else {
      chainTvlSeries[chain] = tvlDates.map(() => 0)
    }
  })

  // ===========================================
  // Chart 4: Stablecoin Supply & Velocity
  // ===========================================
  const stableDates = stablecoinCharts.map(d => new Date(d.date * 1000).toISOString().split('T')[0])
  const stableMcaps = stablecoinCharts.map(d => d.totalCirculatingUSD?.peggedUSD || 0)
  
  // Match fees to stablecoin dates for velocity calc
  const feesDateMap = {}
  totalDataChart.forEach(d => {
    const dateStr = new Date(d[0] * 1000).toISOString().split('T')[0]
    feesDateMap[dateStr] = d[1] || 0
  })
  
  const velocities = stablecoinCharts.map(d => {
    const dateStr = new Date(d.date * 1000).toISOString().split('T')[0]
    const dailyFees = feesDateMap[dateStr] || 0
    const mcap = d.totalCirculatingUSD?.peggedUSD || 0
    // Velocity proxy: (Daily Fees * 365 * multiplier) / Stablecoin MCap
    return mcap > 0 ? (dailyFees * 365 * 10) / mcap : 0
  })

  // ===========================================
  // Chart 5: Revenue Concentration (Lorenz Curve)
  // ===========================================
  const protocolRevenues = protocols.map(p => p.total24h || 0).filter(v => v > 0)
  const lorenz = buildLorenzCurve(protocolRevenues)
  const gini = calculateGini(protocolRevenues)

  // ===========================================
  // Chart 6: Hack Losses Over Time
  // ===========================================
  const hacksWithDates = hacks.filter(h => h.date && h.amount)
  const hacksByYear = aggregateByYear(hacksWithDates, 'date', 'amount', 1)
  const hackYears = Object.keys(hacksByYear).sort()
  const hackAmounts = hackYears.map(y => hacksByYear[y])

  // ===========================================
  // Chart 7: VC Investment Over Time
  // ===========================================
  const raisesWithDates = raises.filter(r => r.date && r.amount)
  const raisesByQuarter = aggregateByQuarter(raisesWithDates, 'date', 'amount', 1e6)
  const raiseQuarters = Object.keys(raisesByQuarter).sort()
  const raiseAmounts = raiseQuarters.map(q => raisesByQuarter[q])

  // VC Raises by Round Type over time (stacked area)
  const roundTypes = {}
  raisesWithDates.forEach(r => {
    const raw = r.date
    const date = new Date(typeof raw === 'number' && raw < 1e12 ? raw * 1000 : raw)
    if (isNaN(date.getTime())) return
    const year = date.getFullYear()
    if (year < 2000 || year > 2100) return
    const quarter = Math.floor(date.getMonth() / 3) + 1
    const key = `${year} Q${quarter}`
    const round = r.round || r.category || 'Unknown'
    if (!roundTypes[round]) roundTypes[round] = {}
    if (!roundTypes[round][key]) roundTypes[round][key] = 0
    roundTypes[round][key] += (r.amount || 0) * 1e6
  })
  const sortedRounds = Object.entries(roundTypes)
    .map(([round, qMap]) => ({ round, total: Object.values(qMap).reduce((a, b) => a + b, 0), qMap }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)
  const allRaiseQuarters = raiseQuarters

  // ===========================================
  // Chart 8: Economic Activity by Chain (Fees breakdown)
  // ===========================================
  const topChainNames = sortedChains.slice(0, 8).map(c => c[0])
  const chainTimeSeries = {}
  topChainNames.forEach(chain => { chainTimeSeries[chain] = {} })
  chainTimeSeries['Other'] = {}
  
  if (totalDataChartBreakdown.length > 0) {
    totalDataChartBreakdown.forEach(entry => {
      const ts = entry[0]
      const dateStr = new Date(ts * 1000).toISOString().split('T')[0]
      const breakdown = entry[1] || {}
      
      topChainNames.forEach(chain => {
        chainTimeSeries[chain][dateStr] = breakdown[chain] || 0
      })
      
      let otherSum = 0
      Object.entries(breakdown).forEach(([chain, val]) => {
        if (!topChainNames.includes(chain)) {
          otherSum += val || 0
        }
      })
      chainTimeSeries['Other'][dateStr] = otherSum
    })
  }
  const breakdownDates = totalDataChartBreakdown.map(d => new Date(d[0] * 1000).toISOString().split('T')[0])

  // ===========================================
  // Economic Comparison
  // ===========================================
  const comparableNation = findComparableNation(annualizedGDP)
  const closerNations = NATION_GDPS
    .map(n => ({ ...n, diff: Math.abs(n.gdp - annualizedGDP) }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 5)

  // ===========================================
  // Narrative generation
  // ===========================================
  const narrativeGdp = formatCurrency(annualizedGDP)
  const narrativeVelocity = estimatedVelocity.toFixed(1)
  const dominantChain = sortedChains.length > 0 ? sortedChains[0][0] : 'Ethereum'
  const topGrowthChains = sortedChains.slice(1, 4).map(c => c[0]).join(', ')

  return (
    <div className="space-y-6">
      {/* KPI Cards - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title='Crypto "GDP"'
          value={formatCurrency(annualizedGDP)}
          subtitle="Total fees annualized"
        />
        <KPICard
          title="Total TVL"
          value={formatCurrency(currentTvl)}
          subtitle="DeFi locked value"
        />
        <KPICard
          title="Stablecoin Market Cap"
          value={formatCurrency(totalStablecoinMcap)}
          subtitle="Total circulating"
        />
        <KPICard
          title="Stablecoin Velocity"
          value={`${estimatedVelocity.toFixed(1)}x`}
          subtitle={`vs TradFi M2: ${tradFiM2Velocity}x`}
          trend={estimatedVelocity > tradFiM2Velocity ? ((estimatedVelocity / tradFiM2Velocity - 1) * 100) : null}
        />
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Total Hacked"
          value={formatCurrency(totalHacked)}
          subtitle={`${hacks.length} incidents`}
        />
        <KPICard
          title="Total VC Raised"
          value={formatCurrency(totalRaised)}
          subtitle={`${raises.length} deals`}
        />
        <KPICard
          title="GDP Growth Rate"
          value={gdpGrowthRate !== null ? formatPercent(gdpGrowthRate) : '—'}
          subtitle="Week-over-week"
          trend={gdpGrowthRate}
        />
        <KPICard
          title="DEX Volume (24h)"
          value={formatCurrency(totalDexVolume24h)}
          subtitle="All DEXs combined"
        />
      </div>

      {/* Chart 1: Crypto GDP Time Series */}
      <ChartCard title='Crypto "GDP" — Annualized Fees Over Time' subtitle="Total protocol fees × 365 — the GDP of the on-chain economy">
        <Plot
          data={[
            {
              x: gdpDates,
              y: gdpValues,
              type: 'scatter',
              mode: 'lines',
              name: 'Annualized GDP',
              line: { color: colors.primary, width: 1.5 },
              fill: 'tozeroy',
              fillcolor: 'rgba(37,99,235,0.1)',
              hovertemplate: '%{x}<br>GDP: $%{y:,.0f}<extra></extra>',
            },
            {
              x: gdpDates,
              y: gdpTrend,
              type: 'scatter',
              mode: 'lines',
              name: '30-day Trend',
              line: { color: colors.warning, width: 2, dash: 'dash' },
              hovertemplate: '%{x}<br>Trend: $%{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'Annualized Fees (USD)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 2: GDP by Chain (Bar) */}
      <ChartCard title='GDP by Chain — "GDP per Country"' subtitle="Total 24h fees by blockchain — shows which economies dominate">
        <Plot
          data={[{
            x: sortedChains.map(c => c[0]),
            y: sortedChains.map(c => c[1]),
            type: 'bar',
            marker: {
              color: sortedChains.map((_, i) => colors.palette[i % colors.palette.length]),
              line: { width: 0 },
            },
            hovertemplate: '%{x}<br>Fees: $%{y:,.0f}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'Daily Fees (USD)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 3: TVL by Chain Over Time (Stacked Area) */}
      {tvlDateStrings.length > 0 && (
        <ChartCard title="TVL by Chain Over Time" subtitle="Historical total value locked across top chains — capital deployment by ecosystem">
          <Plot
            data={TOP_CHAINS.map((chain, i) => ({
              x: tvlDateStrings,
              y: chainTvlSeries[chain],
              type: 'scatter',
              mode: 'lines',
              name: chain.charAt(0).toUpperCase() + chain.slice(1),
              stackgroup: 'tvl',
              line: { width: 0 },
              fillcolor: colors.palette[i % colors.palette.length],
              hovertemplate: `${chain.charAt(0).toUpperCase() + chain.slice(1)}<br>%{x}<br>TVL: $%{y:,.0f}<extra></extra>`,
            }))}
            layout={{
              ...defaultLayout,
              height: 450,
              yaxis: { ...defaultLayout.yaxis, title: 'Total Value Locked (USD)' },
              legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15, x: 0.5, xanchor: 'center' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 4: Stablecoin Supply & Velocity */}
      <ChartCard title="Stablecoin Supply & Velocity" subtitle="Dual-axis: Market cap (area) vs estimated velocity (line) — TradFi M2 velocity is ~1.1x">
        <Plot
          data={[
            {
              x: stableDates,
              y: stableMcaps,
              type: 'scatter',
              mode: 'lines',
              name: 'Stablecoin MCap',
              fill: 'tozeroy',
              line: { color: colors.success, width: 1 },
              fillcolor: 'rgba(16,185,129,0.15)',
              yaxis: 'y',
              hovertemplate: '%{x}<br>MCap: $%{y:,.0f}<extra></extra>',
            },
            {
              x: stableDates,
              y: velocities,
              type: 'scatter',
              mode: 'lines',
              name: 'Est. Velocity',
              line: { color: colors.secondary, width: 2 },
              yaxis: 'y2',
              hovertemplate: '%{x}<br>Velocity: %{y:.2f}x<extra></extra>',
            },
            {
              x: [stableDates[0], stableDates[stableDates.length - 1]],
              y: [tradFiM2Velocity, tradFiM2Velocity],
              type: 'scatter',
              mode: 'lines',
              name: 'TradFi M2 (1.1x)',
              line: { color: colors.slate, width: 1, dash: 'dot' },
              yaxis: 'y2',
              hoverinfo: 'skip',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'Stablecoin Market Cap (USD)', side: 'left' },
            yaxis2: {
              title: 'Velocity (x)',
              overlaying: 'y',
              side: 'right',
              gridcolor: 'transparent',
              tickfont: { size: 11, color: '#6B7280' },
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 5: Revenue Concentration (Lorenz Curve) */}
      <ChartCard title="Revenue Concentration — Lorenz Curve" subtitle={`Gini coefficient: ${gini.toFixed(3)} — closer to 1 = more concentrated`}>
        <Plot
          data={[
            {
              x: lorenz.x,
              y: lorenz.y,
              type: 'scatter',
              mode: 'lines',
              name: 'Actual Distribution',
              line: { color: colors.primary, width: 2 },
              fill: 'tozeroy',
              fillcolor: 'rgba(37,99,235,0.1)',
              hovertemplate: '%{x:.1f}% of protocols<br>generate %{y:.1f}% of revenue<extra></extra>',
            },
            {
              x: [0, 100],
              y: [0, 100],
              type: 'scatter',
              mode: 'lines',
              name: 'Perfect Equality',
              line: { color: colors.slate, width: 1, dash: 'dash' },
              hoverinfo: 'skip',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, title: 'Cumulative % of Protocols', range: [0, 100] },
            yaxis: { ...defaultLayout.yaxis, title: 'Cumulative % of Revenue', range: [0, 100] },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            annotations: [
              {
                x: 80,
                y: 20,
                text: `Gini: ${gini.toFixed(3)}`,
                showarrow: false,
                font: { size: 14, color: colors.primary },
              },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 6: Hack Losses Over Time */}
      {hackYears.length > 0 && (
        <ChartCard title="Hack Losses Over Time" subtitle={`Total: ${formatCurrency(totalHacked)} lost across ${hacks.length} incidents`}>
          <Plot
            data={[{
              x: hackYears,
              y: hackAmounts,
              type: 'bar',
              marker: {
                color: colors.danger,
                line: { width: 0 },
              },
              hovertemplate: '%{x}<br>Lost: $%{y:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 400,
              xaxis: { ...defaultLayout.xaxis, title: 'Year', type: 'category' },
              yaxis: { ...defaultLayout.yaxis, title: 'Amount Lost (USD)' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 7: VC Investment Over Time */}
      {raiseQuarters.length > 0 && (
        <ChartCard title="VC Investment Over Time" subtitle={`Total: ${formatCurrency(totalRaised)} raised across ${raises.length} funding rounds`}>
          <Plot
            data={[{
              x: raiseQuarters,
              y: raiseAmounts,
              type: 'bar',
              marker: {
                color: colors.success,
                line: { width: 0 },
              },
              hovertemplate: '%{x}<br>Raised: $%{y:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 400,
              xaxis: { ...defaultLayout.xaxis, title: 'Quarter', tickangle: -45, type: 'category' },
              yaxis: { ...defaultLayout.yaxis, title: 'Amount Raised (USD)' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 7b: VC Raises by Round Type Over Time */}
      {sortedRounds.length > 0 && allRaiseQuarters.length > 0 && (
        <ChartCard title="VC Raises by Round Type" subtitle="Quarterly VC investment broken down by funding round type">
          <Plot
            data={sortedRounds.map((r, i) => ({
              x: allRaiseQuarters,
              y: allRaiseQuarters.map(q => r.qMap[q] || 0),
              type: 'bar',
              name: r.round,
              marker: {
                color: colors.palette[i % colors.palette.length],
                line: { width: 0 },
              },
              hovertemplate: `${r.round}<br>%{x}<br>$%{y:,.0f}<extra></extra>`,
            }))}
            layout={{
              ...defaultLayout,
              height: 450,
              barmode: 'stack',
              xaxis: { ...defaultLayout.xaxis, title: 'Quarter', tickangle: -45, type: 'category' },
              yaxis: { ...defaultLayout.yaxis, title: 'Amount Raised (USD)' },
              legend: { ...defaultLayout.legend, orientation: 'h', y: -0.2, x: 0.5, xanchor: 'center' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 8: Economic Activity by Chain Over Time (Fees Stacked Area) */}
      {breakdownDates.length > 0 && (
        <ChartCard title="Economic Activity by Chain Over Time" subtitle="Stacked area showing fee generation by blockchain — which economies are growing">
          <Plot
            data={[...topChainNames, 'Other'].map((chain, i) => ({
              x: breakdownDates,
              y: breakdownDates.map(d => chainTimeSeries[chain]?.[d] || 0),
              type: 'scatter',
              mode: 'lines',
              name: chain,
              stackgroup: 'one',
              line: { width: 0 },
              fillcolor: colors.palette[i % colors.palette.length],
              hovertemplate: `${chain}<br>%{x}<br>$%{y:,.0f}<extra></extra>`,
            }))}
            layout={{
              ...defaultLayout,
              height: 450,
              yaxis: { ...defaultLayout.yaxis, title: 'Daily Fees (USD)' },
              legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15, x: 0.5, xanchor: 'center' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 9: Economic Comparison */}
      <ChartCard title="Crypto GDP vs Small Nations" subtitle="Comparing on-chain economic output to real-world national GDPs">
        <Plot
          data={[{
            x: [...closerNations.map(n => n.name), 'Crypto GDP'],
            y: [...closerNations.map(n => n.gdp), annualizedGDP],
            type: 'bar',
            marker: {
              color: [...closerNations.map(() => colors.slate), colors.primary],
              line: { width: 0 },
            },
            hovertemplate: '%{x}<br>GDP: $%{y:,.0f}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -30, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'GDP (USD)' },
            annotations: [
              {
                x: 'Crypto GDP',
                y: annualizedGDP,
                text: '🔗 On-Chain',
                showarrow: true,
                arrowhead: 2,
                arrowsize: 1,
                arrowcolor: colors.primary,
                ax: 0,
                ay: -40,
                font: { size: 12, color: colors.primary },
              },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Narrative Box */}
      <NarrativeBox title="On-Chain Economy Analysis">
        <p>
          If we treat total crypto fees as GDP, the on-chain economy generates <strong>{narrativeGdp}</strong> annually — 
          comparable to <strong>{comparableNation.name}</strong> ({formatCurrency(comparableNation.gdp)} GDP). 
          Stablecoin velocity at ~<strong>{narrativeVelocity}x</strong> exceeds TradFi M2 
          velocity ({tradFiM2Velocity}x), meaning every dollar of stablecoins changes hands {narrativeVelocity} times 
          per year versus {tradFiM2Velocity} times for traditional money.
        </p>
        <p>
          This hyper-velocity reflects crypto's capital efficiency and 24/7 markets. <strong>{dominantChain}</strong> remains the 
          dominant economy, but {topGrowthChains || 'L2s and alt-L1s'} are among the fastest-growing — echoing 
          emerging market GDP growth exceeding developed markets. Total value locked sits at <strong>{formatCurrency(currentTvl)}</strong>.
        </p>
        <p>
          The Gini coefficient of <strong>{gini.toFixed(3)}</strong> reveals highly concentrated revenue generation, 
          with a small number of protocols capturing most economic activity. Security remains a concern with 
          <strong> {formatCurrency(totalHacked)}</strong> lost to hacks, while <strong>{formatCurrency(totalRaised)}</strong> in VC 
          funding demonstrates continued investment interest in the space.
        </p>
      </NarrativeBox>
    </div>
  )
}
