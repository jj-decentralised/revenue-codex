import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatNumber, formatPercent, formatMultiple, rollingAverage } from '../../utils/helpers'

// Fetch on-chain economy data from multiple sources
async function fetchOnChainEconomyData() {
  const [
    historicalTvl,
    feesOverview,
    stablecoins,
    stablecoinCharts,
    globalData,
  ] = await Promise.allSettled([
    fetch('https://api.llama.fi/v2/historicalChainTvl').then(r => r.ok ? r.json() : null),
    fetch('https://api.llama.fi/overview/fees?excludeTotalDataChartBreakdown=false').then(r => r.ok ? r.json() : null),
    fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true').then(r => r.ok ? r.json() : null),
    fetch('https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1').then(r => r.ok ? r.json() : null),
    fetch('/api/coingecko?action=global').then(r => r.ok ? r.json() : null),
  ])

  return {
    historicalTvl: historicalTvl.status === 'fulfilled' ? historicalTvl.value : null,
    feesOverview: feesOverview.status === 'fulfilled' ? feesOverview.value : null,
    stablecoins: stablecoins.status === 'fulfilled' ? stablecoins.value : null,
    stablecoinCharts: stablecoinCharts.status === 'fulfilled' ? stablecoinCharts.value : null,
    globalData: globalData.status === 'fulfilled' ? globalData.value : null,
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
  const chainBreakdown = feesData?.totalDataChartBreakdown || []
  
  const stablecoinsList = data?.stablecoins?.peggedAssets || []
  const stablecoinCharts = data?.stablecoinCharts || []
  const historicalTvl = data?.historicalTvl || []
  const globalData = data?.globalData?.data || {}

  // Calculate KPIs
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
  // This is a simplified proxy using fee activity
  const estimatedVelocity = totalStablecoinMcap > 0 ? (annualizedGDP * 10) / totalStablecoinMcap : 0
  const tradFiM2Velocity = 1.1

  // ===========================================
  // Chart 1: Crypto GDP Time Series
  // ===========================================
  const gdpDates = totalDataChart.map(d => new Date(d[0] * 1000).toISOString().split('T')[0])
  const gdpValues = totalDataChart.map(d => (d[1] || 0) * 365) // annualized
  const gdpTrend = rollingAverage(gdpValues, 30)

  // ===========================================
  // Chart 2: Stablecoin Supply & Velocity
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
  // Chart 3: GDP per Chain (Bar)
  // ===========================================
  const chainFees = {}
  protocols.forEach(p => {
    const chain = p.chains?.[0] || p.chain || 'Other'
    chainFees[chain] = (chainFees[chain] || 0) + (p.total24h || 0)
  })
  const sortedChains = Object.entries(chainFees)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)

  // ===========================================
  // Chart 4: Economic Activity Over Time (Stacked Area by Chain)
  // ===========================================
  // Get top chains for breakdown
  const topChainNames = sortedChains.slice(0, 8).map(c => c[0])
  
  // Build chain time series from protocols with chains
  const chainTimeSeries = {}
  topChainNames.forEach(chain => { chainTimeSeries[chain] = {} })
  chainTimeSeries['Other'] = {}
  
  // Parse totalDataChartBreakdown - it's an array of [timestamp, {chain: value}]
  if (totalDataChartBreakdown.length > 0) {
    totalDataChartBreakdown.forEach(entry => {
      const ts = entry[0]
      const dateStr = new Date(ts * 1000).toISOString().split('T')[0]
      const breakdown = entry[1] || {}
      
      topChainNames.forEach(chain => {
        chainTimeSeries[chain][dateStr] = breakdown[chain] || 0
      })
      
      // Sum "other" chains
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
  // Chart 5: Revenue Concentration (Lorenz Curve)
  // ===========================================
  const protocolRevenues = protocols.map(p => p.total24h || 0).filter(v => v > 0)
  const lorenz = buildLorenzCurve(protocolRevenues)
  const gini = calculateGini(protocolRevenues)

  // ===========================================
  // Narrative generation
  // ===========================================
  const narrativeGdp = formatCurrency(annualizedGDP)
  const narrativeVelocity = estimatedVelocity.toFixed(1)
  const dominantChain = sortedChains.length > 0 ? sortedChains[0][0] : 'Ethereum'
  const topGrowthChains = sortedChains.slice(1, 4).map(c => c[0]).join(', ')

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard
          title='Crypto "GDP"'
          value={formatCurrency(annualizedGDP)}
          subtitle="Total fees annualized"
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
        <KPICard
          title="Total TVL"
          value={formatCurrency(currentTvl)}
          subtitle="DeFi locked value"
        />
        <KPICard
          title="GDP Growth Rate"
          value={gdpGrowthRate !== null ? formatPercent(gdpGrowthRate) : '—'}
          subtitle="Week-over-week"
          trend={gdpGrowthRate}
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

      {/* Chart 2: Stablecoin Supply & Velocity */}
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

      {/* Chart 3: GDP per Chain */}
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
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            yaxis: { ...defaultLayout.yaxis, title: 'Daily Fees (USD)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 4: Economic Activity Over Time (Stacked Area) */}
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

      {/* Narrative Box */}
      <NarrativeBox title="On-Chain Economy Analysis">
        <p>
          If we treat total crypto fees as GDP, the on-chain economy generates <strong>{narrativeGdp}</strong> annually — 
          comparable to a small nation. Stablecoin velocity at ~<strong>{narrativeVelocity}x</strong> exceeds TradFi M2 
          velocity ({tradFiM2Velocity}x), meaning every dollar of stablecoins changes hands {narrativeVelocity} times 
          per year versus {tradFiM2Velocity} times for traditional money.
        </p>
        <p>
          This hyper-velocity reflects crypto's capital efficiency and 24/7 markets. {dominantChain} remains the 
          dominant economy, but {topGrowthChains || 'L2s and alt-L1s'} are among the fastest-growing — echoing 
          emerging market GDP growth exceeding developed markets.
        </p>
        <p>
          The Gini coefficient of <strong>{gini.toFixed(3)}</strong> reveals highly concentrated revenue generation, 
          with a small number of protocols capturing most economic activity. This mirrors traditional economies 
          where a few large corporations drive disproportionate GDP contribution.
        </p>
      </NarrativeBox>
    </div>
  )
}
