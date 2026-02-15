import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatPercent, categorizeSector } from '../../utils/helpers'
import { fetchAllProtocols, fetchFeesOverview, fetchProtocolFees } from '../../services/api'

export default function CapitalEfficiencyTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadingPhase, setLoadingPhase] = useState('Fetching protocols...')

  useEffect(() => {
    async function fetchData() {
      // Phase 1: Core data from api.js services + CoinGecko markets
      setLoadingPhase('Fetching protocols and fees overview...')
      const [protocolsRes, feesRes, marketsRes] = await Promise.allSettled([
        fetchAllProtocols(),
        fetchFeesOverview(),
        fetch('/api/coingecko?action=markets').then(r => r.ok ? r.json() : []),
      ])

      const protocols = protocolsRes.status === 'fulfilled' ? protocolsRes.value : []
      const fees = feesRes.status === 'fulfilled' ? feesRes.value : null
      const markets = marketsRes.status === 'fulfilled' ? marketsRes.value : []

      // Create market cap lookup by symbol and id
      const marketCapLookup = {}
      markets.forEach(m => {
        if (m.symbol) marketCapLookup[m.symbol.toLowerCase()] = m.market_cap
        if (m.id) marketCapLookup[m.id.toLowerCase()] = m.market_cap
      })

      // Phase 2: Get top 30 protocols by fees for historical revenue data
      setLoadingPhase('Fetching historical revenue for top 30 protocols...')
      const feesProtocols = fees?.protocols || []
      const top30ByFees = feesProtocols
        .filter(p => p.total24h > 0)
        .sort((a, b) => (b.total24h || 0) - (a.total24h || 0))
        .slice(0, 30)

      // Fetch historical revenue for each of top 30 via fetchProtocolFees
      const historicalResults = await Promise.allSettled(
        top30ByFees.map(p => 
          fetchProtocolFees(p.slug).catch(() => null)
        )
      )

      const historicalData = {}
      historicalResults.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value) {
          historicalData[top30ByFees[i].slug] = result.value
        }
      })

      return {
        protocols,
        fees,
        markets,
        marketCapLookup,
        historicalData,
      }
    }

    fetchData()
      .then(setData)
      .catch(e => setError(e.message || 'Failed to fetch data'))
      .finally(() => setLoading(false))
  }, [])

  // Process merged protocol data with useMemo for performance
  const processedData = useMemo(() => {
    if (!data) return null

    const { protocols, fees, marketCapLookup, historicalData } = data
    const feesProtocols = fees?.protocols || []

    // Merge protocols with fees data
    const mergedProtocols = protocols
      .filter(p => p.tvl > 1e6) // >$1M TVL
      .map(p => {
        const feeData = feesProtocols.find(f =>
          f.slug === p.slug || (f.name || '').toLowerCase() === (p.name || '').toLowerCase()
        )
        const revenue24h = feeData?.total24h || 0
        const revenue7d = feeData?.total7d || 0
        const annualizedRevenue = revenue24h * 365
        const efficiency = p.tvl > 0 ? (annualizedRevenue / p.tvl) * 100 : 0

        // Get market cap from CoinGecko or fallback to DefiLlama
        const symbol = (p.symbol || '').toLowerCase()
        const slug = (p.slug || '').toLowerCase()
        const mcap = marketCapLookup[symbol] || marketCapLookup[slug] || p.mcap || 0

        // Get historical data if available
        const historical = historicalData[p.slug] || null

        return {
          name: p.name,
          slug: p.slug,
          symbol: p.symbol,
          tvl: p.tvl,
          mcap,
          revenue24h,
          revenue7d,
          annualizedRevenue,
          efficiency,
          category: p.category || 'Other',
          sector: categorizeSector(p.category || 'Other'),
          change7d: p.change_7d || 0,
          change1d: p.change_1d || 0,
          historical,
        }
      })
      .filter(p => p.revenue24h > 0 && p.efficiency > 0 && p.efficiency < 1000)

    // KPI Calculations
    const efficiencies = mergedProtocols.map(p => p.efficiency).sort((a, b) => a - b)
    const medianEfficiency = efficiencies.length > 0
      ? efficiencies[Math.floor(efficiencies.length / 2)]
      : 0

    const sortedByEfficiency = [...mergedProtocols].sort((a, b) => b.efficiency - a.efficiency)
    const mostEfficient = sortedByEfficiency[0]
    const leastEfficient = sortedByEfficiency[sortedByEfficiency.length - 1]

    // Sector stats
    const sectorStats = {}
    mergedProtocols.forEach(p => {
      if (!sectorStats[p.sector]) {
        sectorStats[p.sector] = { totalRevenue: 0, totalTvl: 0, count: 0, efficiencies: [] }
      }
      sectorStats[p.sector].totalRevenue += p.annualizedRevenue
      sectorStats[p.sector].totalTvl += p.tvl
      sectorStats[p.sector].count += 1
      sectorStats[p.sector].efficiencies.push(p.efficiency)
    })

    const sectorEfficiency = Object.entries(sectorStats)
      .map(([sector, stats]) => ({
        sector,
        avgEfficiency: stats.totalTvl > 0 ? (stats.totalRevenue / stats.totalTvl) * 100 : 0,
        medianEfficiency: stats.efficiencies.sort((a, b) => a - b)[Math.floor(stats.efficiencies.length / 2)] || 0,
        count: stats.count,
        totalTvl: stats.totalTvl,
        totalRevenue: stats.totalRevenue,
      }))
      .filter(s => s.count >= 3)
      .sort((a, b) => b.avgEfficiency - a.avgEfficiency)

    // Process historical efficiency trends
    const historicalTrends = processHistoricalTrends(historicalData, protocols)

    return {
      mergedProtocols,
      medianEfficiency,
      mostEfficient,
      leastEfficient,
      sectorEfficiency,
      historicalTrends,
      totalAnalyzed: mergedProtocols.length,
    }
  }, [data])

  if (loading) return <LoadingSpinner message={loadingPhase} />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>
  if (!processedData) return <div className="text-center py-20">No data available</div>

  const {
    mergedProtocols,
    medianEfficiency,
    mostEfficient,
    leastEfficient,
    sectorEfficiency,
    historicalTrends,
    totalAnalyzed,
  } = processedData

  // =======================
  // Chart 1: Capital Efficiency Scatter (FLAGSHIP)
  // =======================
  const scatterProtocols = mergedProtocols
    .filter(p => p.tvl > 1e6 && p.annualizedRevenue > 10000)
    .sort((a, b) => b.annualizedRevenue - a.annualizedRevenue)
    .slice(0, 150)

  const sectors = [...new Set(scatterProtocols.map(p => p.sector))]
  const sectorColorMap = {}
  sectors.forEach((sector, i) => { sectorColorMap[sector] = colors.palette[i % colors.palette.length] })

  // Reference lines for efficiency thresholds
  const tvlRange = [1e6, 1e12]
  const efficiencyLines = [
    { pct: 1, label: '1% Efficiency' },
    { pct: 5, label: '5% Efficiency' },
    { pct: 10, label: '10% Efficiency' },
    { pct: 20, label: '20% Efficiency' },
  ]

  const referenceLineTraces = efficiencyLines.map((line, i) => ({
    x: tvlRange,
    y: tvlRange.map(tvl => tvl * (line.pct / 100)),
    mode: 'lines',
    type: 'scatter',
    name: line.label,
    line: { dash: 'dot', width: 1, color: `rgba(100,100,100,${0.3 + i * 0.15})` },
    hoverinfo: 'skip',
    showlegend: true,
  }))

  // Top 10 labels for scatter
  const top10ForLabels = scatterProtocols.slice(0, 10)

  const scatterTraces = sectors.map(sector => {
    const pts = scatterProtocols.filter(p => p.sector === sector)
    return {
      x: pts.map(p => p.tvl),
      y: pts.map(p => p.annualizedRevenue),
      text: pts.map(p => `${p.name}<br>TVL: ${formatCurrency(p.tvl)}<br>Revenue: ${formatCurrency(p.annualizedRevenue)}/yr<br>Efficiency: ${p.efficiency.toFixed(2)}%<br>MCap: ${formatCurrency(p.mcap)}`),
      mode: 'markers',
      type: 'scatter',
      name: sector,
      marker: {
        color: sectorColorMap[sector],
        size: pts.map(p => Math.max(8, Math.min(50, p.mcap > 0 ? Math.sqrt(p.mcap / 1e7) * 3 : 12))),
        opacity: 0.75,
        line: { width: 1, color: '#FFF' },
      },
      hovertemplate: '%{text}<extra></extra>',
    }
  })

  // Annotations for top 10
  const scatterAnnotations = top10ForLabels.map(p => ({
    x: Math.log10(p.tvl),
    y: Math.log10(p.annualizedRevenue),
    text: p.name,
    showarrow: true,
    arrowhead: 0,
    arrowsize: 0.5,
    arrowwidth: 1,
    arrowcolor: '#9CA3AF',
    ax: 20,
    ay: -20,
    font: { size: 10, color: '#E5E7EB' },
    bgcolor: 'rgba(17,24,39,0.8)',
    borderpad: 2,
  }))

  // =======================
  // Chart 2: Efficiency Rankings (Top 25)
  // =======================
  const top25Efficient = [...mergedProtocols]
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, 25)

  // =======================
  // Chart 3: Efficiency by Sector (Grouped Bar)
  // =======================
  const sectorChartData = sectorEfficiency.slice(0, 10)

  // =======================
  // Chart 4: Revenue per Dollar of TVL Over Time
  // =======================
  const hasHistoricalData = historicalTrends && historicalTrends.dates && historicalTrends.dates.length > 0

  // =======================
  // Chart 5: Efficiency vs Growth (Quadrant)
  // =======================
  const growthProtocols = mergedProtocols
    .filter(p => p.change7d !== 0 && Math.abs(p.change7d) < 200 && p.efficiency < 100)
    .sort((a, b) => b.annualizedRevenue - a.annualizedRevenue)
    .slice(0, 100)

  const quadrantAnnotations = [
    { x: 30, y: 18, text: '🚀 Sustainable Growth', xanchor: 'center', yanchor: 'middle' },
    { x: -30, y: 18, text: '⚠️ Efficient but Shrinking', xanchor: 'center', yanchor: 'middle' },
    { x: 30, y: 2, text: '📈 Growth via Spending', xanchor: 'center', yanchor: 'middle' },
    { x: -30, y: 2, text: '📉 Declining', xanchor: 'center', yanchor: 'middle' },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Median Revenue/TVL"
          value={formatPercent(medianEfficiency)}
          subtitle="Capital efficiency ratio"
        />
        <KPICard
          title="Best Efficiency"
          value={mostEfficient?.name || '—'}
          subtitle={mostEfficient ? `${mostEfficient.efficiency.toFixed(1)}% Rev/TVL` : ''}
        />
        <KPICard
          title="Worst Efficiency"
          value={leastEfficient?.name || '—'}
          subtitle={leastEfficient ? `${leastEfficient.efficiency.toFixed(3)}% Rev/TVL` : ''}
        />
        <KPICard
          title="Protocols Analyzed"
          value={totalAnalyzed.toString()}
          subtitle="With TVL >$1M & revenue"
        />
      </div>

      {/* FLAGSHIP: Capital Efficiency Scatter */}
      <ChartCard
        title="Capital Efficiency Scatter — THE KEY CHART"
        subtitle="X = TVL (log), Y = Annualized Revenue (log) · Diagonal lines = efficiency thresholds · Size = Market Cap · Color = Sector · Top 10 labeled"
      >
        <Plot
          data={[...referenceLineTraces, ...scatterTraces]}
          layout={{
            ...defaultLayout,
            height: 600,
            xaxis: {
              ...defaultLayout.xaxis,
              title: 'Total Value Locked (USD)',
              type: 'log',
              range: [6, 12], // 1M to 1T
            },
            yaxis: {
              ...defaultLayout.yaxis,
              title: 'Annualized Revenue (USD)',
              type: 'log',
              range: [4, 11], // 10K to 100B
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
            annotations: scatterAnnotations,
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Efficiency Rankings - Horizontal Bar */}
      <ChartCard
        title="Capital Efficiency Rankings — Top 25"
        subtitle="Revenue/TVL ratio · Higher = more capital efficient · These protocols squeeze more revenue from each dollar locked"
      >
        <Plot
          data={[{
            y: top25Efficient.map(p => p.name),
            x: top25Efficient.map(p => p.efficiency),
            type: 'bar',
            orientation: 'h',
            marker: {
              color: top25Efficient.map(p => sectorColorMap[p.sector] || colors.primary),
            },
            text: top25Efficient.map(p => `${p.efficiency.toFixed(2)}%`),
            textposition: 'outside',
            textfont: { size: 10, color: '#E5E7EB' },
            hovertemplate: '%{y}<br>Efficiency: %{x:.2f}%<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 600,
            xaxis: { ...defaultLayout.xaxis, title: 'Capital Efficiency (Revenue/TVL %)', range: [0, Math.max(...top25Efficient.map(p => p.efficiency)) * 1.15] },
            yaxis: { ...defaultLayout.yaxis, autorange: 'reversed', tickfont: { size: 11 } },
            margin: { ...defaultLayout.margin, l: 140, r: 60 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Efficiency by Sector */}
      <ChartCard
        title="Efficiency by Sector"
        subtitle="Average and Median Revenue/TVL per sector · Shows which protocol categories are structurally more capital-efficient"
      >
        <Plot
          data={[
            {
              x: sectorChartData.map(s => s.sector),
              y: sectorChartData.map(s => s.avgEfficiency),
              type: 'bar',
              name: 'Avg Efficiency',
              marker: { color: colors.primary },
              hovertemplate: '%{x}<br>Avg: %{y:.2f}%<extra></extra>',
            },
            {
              x: sectorChartData.map(s => s.sector),
              y: sectorChartData.map(s => s.medianEfficiency),
              type: 'bar',
              name: 'Median Efficiency',
              marker: { color: colors.secondary },
              hovertemplate: '%{x}<br>Median: %{y:.2f}%<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 420,
            barmode: 'group',
            xaxis: { ...defaultLayout.xaxis, tickangle: -25 },
            yaxis: { ...defaultLayout.yaxis, title: 'Capital Efficiency (%)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.1 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Revenue per Dollar of TVL Over Time */}
      {hasHistoricalData ? (
        <ChartCard
          title="Efficiency Trend Over Time"
          subtitle="Aggregate Revenue/TVL ratio for top protocols over the past year · Shows how capital efficiency is trending industry-wide"
        >
          <Plot
            data={[{
              x: historicalTrends.dates,
              y: historicalTrends.efficiency,
              type: 'scatter',
              mode: 'lines',
              fill: 'tozeroy',
              fillcolor: 'rgba(59,130,246,0.2)',
              line: { color: colors.primary, width: 2 },
              hovertemplate: '%{x}<br>Efficiency: %{y:.2f}%<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 350,
              xaxis: { ...defaultLayout.xaxis, title: '' },
              yaxis: { ...defaultLayout.yaxis, title: 'Aggregate Efficiency (%)' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      ) : (
        <ChartCard
          title="Efficiency Trend Over Time"
          subtitle="Historical efficiency data not available — requires protocol-level time series"
        >
          <div className="flex items-center justify-center h-48 text-(--color-muted)">
            <p>Historical trend data requires additional API calls. Showing current snapshot data above.</p>
          </div>
        </ChartCard>
      )}

      {/* Efficiency vs Growth Quadrant */}
      <ChartCard
        title="Efficiency vs Growth — Quadrant Analysis"
        subtitle="X = 7d TVL Change %, Y = Capital Efficiency · Upper-right = Sustainable growth (efficient + growing)"
      >
        <Plot
          data={[
            // Quadrant divider lines
            { x: [0, 0], y: [0, 50], mode: 'lines', line: { color: '#374151', width: 1, dash: 'dash' }, hoverinfo: 'skip', showlegend: false },
            { x: [-100, 100], y: [5, 5], mode: 'lines', line: { color: '#374151', width: 1, dash: 'dash' }, hoverinfo: 'skip', showlegend: false },
            // Scatter points
            {
              x: growthProtocols.map(p => p.change7d),
              y: growthProtocols.map(p => p.efficiency),
              text: growthProtocols.map(p => `${p.name}<br>7d TVL Change: ${p.change7d.toFixed(1)}%<br>Efficiency: ${p.efficiency.toFixed(2)}%<br>TVL: ${formatCurrency(p.tvl)}`),
              mode: 'markers+text',
              type: 'scatter',
              textposition: 'top center',
              textfont: { size: 8, color: '#9CA3AF' },
              marker: {
                color: growthProtocols.map(p => {
                  if (p.change7d > 0 && p.efficiency > 5) return colors.success // Sustainable Growth
                  if (p.change7d < 0 && p.efficiency > 5) return colors.warning // Efficient but Shrinking
                  if (p.change7d > 0 && p.efficiency <= 5) return colors.primary // Growth through Spending
                  return colors.danger // Declining
                }),
                size: growthProtocols.map(p => Math.max(8, Math.min(30, Math.sqrt(p.tvl / 1e8) * 5))),
                opacity: 0.75,
                line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
              showlegend: false,
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 550,
            xaxis: {
              ...defaultLayout.xaxis,
              title: '7-Day TVL Change (%)',
              zeroline: true,
              zerolinecolor: '#374151',
              range: [-60, 60],
            },
            yaxis: {
              ...defaultLayout.yaxis,
              title: 'Capital Efficiency (%)',
              range: [0, 25],
            },
            annotations: quadrantAnnotations.map(a => ({
              x: a.x,
              y: a.y,
              text: a.text,
              showarrow: false,
              font: { size: 12, color: '#6B7280' },
              xanchor: a.xanchor,
              yanchor: a.yanchor,
            })),
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Protocol Deep Dive Table */}
      <ChartCard
        title="Top Protocols Deep Dive"
        subtitle="Detailed metrics for top 15 protocols by revenue — efficiency ratio is the key metric"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border)">
                <th className="text-left p-2">Protocol</th>
                <th className="text-right p-2">TVL</th>
                <th className="text-right p-2">24h Rev</th>
                <th className="text-right p-2">Ann. Rev</th>
                <th className="text-right p-2">Efficiency</th>
                <th className="text-right p-2">MCap</th>
                <th className="text-right p-2">7d Δ</th>
                <th className="text-left p-2">Sector</th>
              </tr>
            </thead>
            <tbody>
              {mergedProtocols
                .sort((a, b) => b.annualizedRevenue - a.annualizedRevenue)
                .slice(0, 15)
                .map((p, i) => (
                  <tr key={p.slug} className="border-b border-(--color-border) hover:bg-(--color-surface)">
                    <td className="p-2 font-medium">{i + 1}. {p.name}</td>
                    <td className="text-right p-2">{formatCurrency(p.tvl)}</td>
                    <td className="text-right p-2">{formatCurrency(p.revenue24h)}</td>
                    <td className="text-right p-2">{formatCurrency(p.annualizedRevenue)}</td>
                    <td className="text-right p-2 font-bold" style={{ color: p.efficiency > 10 ? colors.success : p.efficiency > 5 ? colors.warning : colors.muted }}>
                      {p.efficiency.toFixed(2)}%
                    </td>
                    <td className="text-right p-2">{p.mcap > 0 ? formatCurrency(p.mcap) : '—'}</td>
                    <td className="text-right p-2" style={{ color: p.change7d > 0 ? colors.success : colors.danger }}>
                      {p.change7d > 0 ? '+' : ''}{p.change7d.toFixed(1)}%
                    </td>
                    <td className="p-2 text-(--color-muted)">{p.sector}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Narrative */}
      <NarrativeBox title="Capital Efficiency: The Most Underrated DeFi Metric">
        <p>
          <strong>Capital efficiency = Revenue ÷ TVL.</strong> This ratio reveals how much value a protocol extracts 
          from each dollar locked. A protocol with $1B TVL and $10M revenue (1% efficiency) is fundamentally different 
          from one with $100M revenue (10% efficiency).
        </p>
        <p>
          <strong>Sector patterns:</strong> DEXs typically show 5-20% efficiency (high volume turnover), lending protocols 
          1-5% (spread-based), and liquid staking 0.5-2% (low fees but massive scale). Perp DEXs often lead with 15-50%+ 
          efficiency due to leverage and liquidation fees.
        </p>
        <p>
          <strong>The quadrant tells the story:</strong> Upper-right = sustainable growth (efficient AND growing). 
          Lower-right = growth through spending (attracting TVL but not monetizing). Upper-left = efficient but shrinking 
          (may be extracting too much). Lower-left = declining (avoid).
        </p>
        <p>
          <strong>Why this matters:</strong> High efficiency at scale = durable moat. Protocols that can maintain 10%+ 
          efficiency while growing TVL are building real businesses, not just TVL farming operations.
        </p>
      </NarrativeBox>
    </div>
  )
}

// Helper: Process historical trends from protocol data
function processHistoricalTrends(historicalData, protocols) {
  if (!historicalData || Object.keys(historicalData).length === 0) {
    return null
  }

  // Try to aggregate historical efficiency from available data
  const allDates = new Map()

  Object.entries(historicalData).forEach(([slug, data]) => {
    const protocol = protocols.find(p => p.slug === slug)
    const tvl = protocol?.tvl || 0
    
    // totalDataChart contains [timestamp, revenue] pairs
    const chartData = data?.totalDataChart || []
    
    chartData.forEach(([timestamp, revenue]) => {
      if (!timestamp || revenue === undefined) return
      const date = new Date(timestamp * 1000).toISOString().split('T')[0]
      
      if (!allDates.has(date)) {
        allDates.set(date, { totalRevenue: 0, totalTvl: 0, count: 0 })
      }
      
      const dayData = allDates.get(date)
      dayData.totalRevenue += revenue || 0
      dayData.totalTvl += tvl // Using current TVL as approximation
      dayData.count += 1
    })
  })

  // Sort and filter dates
  const sortedDates = [...allDates.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([, data]) => data.totalTvl > 0 && data.count >= 5) // Need enough data points
    .slice(-365) // Last year

  if (sortedDates.length < 30) return null // Need enough data

  return {
    dates: sortedDates.map(([date]) => date),
    efficiency: sortedDates.map(([, data]) => 
      data.totalTvl > 0 ? (data.totalRevenue * 365 / data.totalTvl) * 100 : 0
    ),
  }
}
