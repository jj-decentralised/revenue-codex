import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatPercent, categorizeSector } from '../../utils/helpers'

export default function CapitalEfficiencyTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      const [protocolsRes, feesRes] = await Promise.allSettled([
        fetch('https://api.llama.fi/protocols').then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch('https://api.llama.fi/overview/fees?excludeTotalDataChartBreakdown=false').then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ])
      return {
        protocols: protocolsRes.status === 'fulfilled' ? protocolsRes.value : [],
        fees: feesRes.status === 'fulfilled' ? feesRes.value : null,
      }
    }

    fetchData()
      .then(setData)
      .catch(e => setError(e.message || 'Failed to fetch data'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading capital efficiency data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  const protocols = data?.protocols || []
  const feesProtocols = data?.fees?.protocols || []

  // Merge protocols with fees data to calculate capital efficiency
  const mergedProtocols = protocols
    .filter(p => p.tvl > 1e6) // Only protocols with >$1M TVL
    .map(p => {
      const feeData = feesProtocols.find(f =>
        f.slug === p.slug || (f.name || '').toLowerCase() === (p.name || '').toLowerCase()
      )
      const revenue24h = feeData?.total24h || 0
      const annualizedRevenue = revenue24h * 365
      const efficiency = p.tvl > 0 ? (annualizedRevenue / p.tvl) * 100 : 0

      return {
        name: p.name,
        slug: p.slug,
        tvl: p.tvl,
        mcap: p.mcap || 0,
        revenue24h,
        annualizedRevenue,
        efficiency, // Revenue/TVL as percentage
        category: p.category || 'Other',
        sector: categorizeSector(p.category || 'Other'),
        change7d: p.change_7d || 0,
      }
    })
    .filter(p => p.revenue24h > 0 && p.efficiency > 0 && p.efficiency < 1000) // Filter out outliers

  // KPI Calculations
  const efficiencies = mergedProtocols.map(p => p.efficiency).sort((a, b) => a - b)
  const medianEfficiency = efficiencies.length > 0
    ? efficiencies[Math.floor(efficiencies.length / 2)]
    : 0

  const positiveEarningsCount = mergedProtocols.filter(p => p.efficiency > 1).length

  const sortedByEfficiency = [...mergedProtocols].sort((a, b) => b.efficiency - a.efficiency)
  const mostEfficient = sortedByEfficiency[0]
  const leastEfficient = sortedByEfficiency[sortedByEfficiency.length - 1]

  // =======================
  // 1. Capital Efficiency Scatter (TVL vs Revenue, log-log)
  // =======================
  const scatterProtocols = mergedProtocols
    .filter(p => p.tvl > 1e6 && p.annualizedRevenue > 10000)
    .sort((a, b) => b.annualizedRevenue - a.annualizedRevenue)
    .slice(0, 100)

  const sectors = [...new Set(scatterProtocols.map(p => p.sector))]
  const sectorColorMap = {}
  sectors.forEach((sector, i) => { sectorColorMap[sector] = colors.palette[i % colors.palette.length] })

  // Reference lines for efficiency thresholds (1%, 5%, 10%, 20%)
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

  const scatterTraces = sectors.map(sector => {
    const pts = scatterProtocols.filter(p => p.sector === sector)
    return {
      x: pts.map(p => p.tvl),
      y: pts.map(p => p.annualizedRevenue),
      text: pts.map(p => `${p.name}<br>TVL: ${formatCurrency(p.tvl)}<br>Revenue: ${formatCurrency(p.annualizedRevenue)}/yr<br>Efficiency: ${p.efficiency.toFixed(2)}%`),
      mode: 'markers',
      type: 'scatter',
      name: sector,
      marker: {
        color: sectorColorMap[sector],
        size: pts.map(p => Math.max(8, Math.min(40, p.mcap > 0 ? Math.sqrt(p.mcap / 1e7) * 3 : 12))),
        opacity: 0.75,
        line: { width: 1, color: '#FFF' },
      },
      hovertemplate: '%{text}<extra></extra>',
    }
  })

  // =======================
  // 2. Capital Efficiency Rankings (Horizontal Bar)
  // =======================
  const top20Efficient = sortedByEfficiency.slice(0, 20)

  // =======================
  // 3. Earnings Analysis (Revenue - Token Incentives proxy)
  // =======================
  // Since token incentive data is limited, we use Revenue/TVL as sustainability proxy
  // Protocols with very high efficiency are "earning", low efficiency may be "subsidizing"
  const earningsProtocols = [...mergedProtocols]
    .sort((a, b) => b.annualizedRevenue - a.annualizedRevenue)
    .slice(0, 20)
    .map(p => ({
      ...p,
      // Proxy: if efficiency > 5%, consider it "positive earnings"
      // This is a simplification since we don't have actual token emission data
      sustainabilityScore: p.efficiency > 5 ? p.annualizedRevenue * 0.7 : p.annualizedRevenue * -0.3,
    }))

  // =======================
  // 4. Efficiency by Sector
  // =======================
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
    }))
    .filter(s => s.count >= 3)
    .sort((a, b) => b.avgEfficiency - a.avgEfficiency)

  // =======================
  // 5. Efficiency vs Growth Scatter
  // =======================
  const growthProtocols = mergedProtocols
    .filter(p => p.change7d !== 0 && Math.abs(p.change7d) < 200 && p.efficiency < 100)
    .slice(0, 80)

  // Quadrant annotations
  const quadrantAnnotations = [
    { x: 25, y: 15, text: 'Sustainable Growth', xanchor: 'center', yanchor: 'middle' },
    { x: -25, y: 15, text: 'Efficient but Shrinking', xanchor: 'center', yanchor: 'middle' },
    { x: 25, y: 2, text: 'Growth through Spending', xanchor: 'center', yanchor: 'middle' },
    { x: -25, y: 2, text: 'Declining', xanchor: 'center', yanchor: 'middle' },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Median Capital Efficiency"
          value={formatPercent(medianEfficiency)}
          subtitle="Revenue / TVL"
        />
        <KPICard
          title="Protocols >1% Efficiency"
          value={positiveEarningsCount.toString()}
          subtitle="Generating meaningful revenue"
        />
        <KPICard
          title="Most Efficient"
          value={mostEfficient?.name || '—'}
          subtitle={mostEfficient ? `${mostEfficient.efficiency.toFixed(1)}% efficiency` : ''}
        />
        <KPICard
          title="Least Efficient"
          value={leastEfficient?.name || '—'}
          subtitle={leastEfficient ? `${leastEfficient.efficiency.toFixed(2)}% efficiency` : ''}
        />
      </div>

      {/* Capital Efficiency Scatter */}
      <ChartCard
        title="Capital Efficiency Scatter — The Key Chart"
        subtitle="X = TVL, Y = Annualized Revenue · Diagonal lines show efficiency thresholds · Protocols ABOVE the line are more capital-efficient · Size = Market Cap"
      >
        <Plot
          data={[...referenceLineTraces, ...scatterTraces]}
          layout={{
            ...defaultLayout,
            height: 550,
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
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Capital Efficiency Rankings */}
      <ChartCard
        title="Capital Efficiency Rankings"
        subtitle="Top 20 protocols by Revenue/TVL ratio — reveals which protocols are genuine revenue machines"
      >
        <Plot
          data={[{
            y: top20Efficient.map(p => p.name),
            x: top20Efficient.map(p => p.efficiency),
            type: 'bar',
            orientation: 'h',
            marker: {
              color: top20Efficient.map((p, i) => colors.palette[i % colors.palette.length]),
            },
            hovertemplate: '%{y}<br>Efficiency: %{x:.2f}%<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 500,
            xaxis: { ...defaultLayout.xaxis, title: 'Capital Efficiency (Revenue/TVL %)' },
            yaxis: { ...defaultLayout.yaxis, autorange: 'reversed' },
            margin: { ...defaultLayout.margin, l: 120 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Earnings Analysis */}
      <ChartCard
        title="Earnings Analysis (Sustainability Proxy)"
        subtitle="Protocols with >5% efficiency likely have positive unit economics · Without token emission data, high efficiency = sustainable"
      >
        <Plot
          data={[{
            x: earningsProtocols.map(p => p.name),
            y: earningsProtocols.map(p => p.sustainabilityScore),
            type: 'bar',
            marker: {
              color: earningsProtocols.map(p => p.sustainabilityScore >= 0 ? colors.success : colors.danger),
            },
            hovertemplate: '%{x}<br>Score: $%{y:,.0f}<br>(Positive = sustainable)<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            yaxis: { ...defaultLayout.yaxis, title: 'Sustainability Score (USD)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Efficiency by Sector */}
      <ChartCard
        title="Efficiency by Sector"
        subtitle="Average Revenue/TVL for each sector category — shows which sectors are most capital-efficient"
      >
        <Plot
          data={[{
            x: sectorEfficiency.map(s => s.sector),
            y: sectorEfficiency.map(s => s.avgEfficiency),
            type: 'bar',
            name: 'Average Efficiency',
            marker: { color: sectorEfficiency.map((_, i) => colors.palette[i % colors.palette.length]) },
            hovertemplate: '%{x}<br>Avg Efficiency: %{y:.2f}%<br><extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -30 },
            yaxis: { ...defaultLayout.yaxis, title: 'Average Capital Efficiency (%)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Efficiency vs Growth Scatter */}
      <ChartCard
        title="Efficiency vs Growth — Quadrant Analysis"
        subtitle="X = 7d TVL Change %, Y = Capital Efficiency · Upper-right = Sustainable Growth · Lower-right = Growth through Spending"
      >
        <Plot
          data={[
            // Quadrant divider lines
            { x: [0, 0], y: [0, 50], mode: 'lines', line: { color: '#E5E7EB', width: 1, dash: 'dash' }, hoverinfo: 'skip', showlegend: false },
            { x: [-100, 100], y: [5, 5], mode: 'lines', line: { color: '#E5E7EB', width: 1, dash: 'dash' }, hoverinfo: 'skip', showlegend: false },
            // Scatter
            {
              x: growthProtocols.map(p => p.change7d),
              y: growthProtocols.map(p => p.efficiency),
              text: growthProtocols.map(p => `${p.name}<br>7d Change: ${p.change7d.toFixed(1)}%<br>Efficiency: ${p.efficiency.toFixed(2)}%`),
              mode: 'markers',
              type: 'scatter',
              marker: {
                color: growthProtocols.map(p => {
                  if (p.change7d > 0 && p.efficiency > 5) return colors.success // Sustainable Growth
                  if (p.change7d < 0 && p.efficiency > 5) return colors.warning // Efficient but Shrinking
                  if (p.change7d > 0 && p.efficiency <= 5) return colors.primary // Growth through Spending
                  return colors.danger // Declining
                }),
                size: 12,
                opacity: 0.7,
                line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
              showlegend: false,
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 500,
            xaxis: {
              ...defaultLayout.xaxis,
              title: '7-Day TVL Change (%)',
              zeroline: true,
              zerolinecolor: '#E5E7EB',
            },
            yaxis: {
              ...defaultLayout.yaxis,
              title: 'Capital Efficiency (%)',
            },
            annotations: quadrantAnnotations.map(a => ({
              x: a.x,
              y: a.y,
              text: a.text,
              showarrow: false,
              font: { size: 11, color: '#9CA3AF' },
              xanchor: a.xanchor,
              yanchor: a.yanchor,
            })),
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Narrative Box */}
      <NarrativeBox title="Capital Efficiency Analysis">
        <p>
          Capital efficiency — revenue generated per dollar of TVL — is the most underrated metric in crypto. 
          A protocol with $1B TVL generating $10M annual revenue (1% efficiency) is fundamentally different 
          from one generating $100M (10% efficiency).
        </p>
        <p>
          DEXs typically show 5-15% efficiency, lending protocols 1-3%, and stablecoins 0.5-2% but with 
          massive scale. The protocols in the upper-right quadrant of the efficiency-growth scatter are 
          the ones building durable businesses.
        </p>
        <p>
          True "earnings" in crypto equals Revenue minus Token Emissions. Protocols with negative earnings 
          are effectively paying users more in tokens than they earn in fees. Without granular emission data, 
          we use efficiency ratios as a sustainability proxy — protocols above 5% efficiency are more likely 
          to have positive unit economics.
        </p>
      </NarrativeBox>
    </div>
  )
}
