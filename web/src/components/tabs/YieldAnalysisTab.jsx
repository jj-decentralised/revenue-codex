import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchYieldAnalysisData } from '../../services/api'
import { formatPercent, formatCurrency } from '../../utils/helpers'
import { yieldAnalysisNarrative } from '../../data/narratives'

export default function YieldAnalysisTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchYieldAnalysisData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading yield analysis data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  const pools = data?.pools || []
  const treasuryYield = data?.treasuryYield || 0

  // Filter valid pools with APY data
  const validPools = pools.filter(p => p.apy !== null && p.apy !== undefined && !isNaN(p.apy) && p.apy >= 0 && p.apy < 1000)
  const stablecoinPools = validPools.filter(p => p.stablecoin === true)
  const largePools = validPools.filter(p => p.tvlUsd > 1e6)

  // Calculate KPIs
  const apyValues = validPools.map(p => p.apy).sort((a, b) => a - b)
  const stableApyValues = stablecoinPools.map(p => p.apy).sort((a, b) => a - b)
  const medianDefiApy = apyValues.length > 0 ? apyValues[Math.floor(apyValues.length / 2)] : 0
  const medianStableApy = stableApyValues.length > 0 ? stableApyValues[Math.floor(stableApyValues.length / 2)] : 0
  const hasYieldData = medianStableApy > 0
  const riskPremium = hasYieldData ? medianStableApy - treasuryYield : null

  // Yield Distribution - buckets
  const buckets = [
    { label: '0-5%', min: 0, max: 5, count: 0, tvl: 0 },
    { label: '5-10%', min: 5, max: 10, count: 0, tvl: 0 },
    { label: '10-20%', min: 10, max: 20, count: 0, tvl: 0 },
    { label: '20-50%', min: 20, max: 50, count: 0, tvl: 0 },
    { label: '50%+', min: 50, max: Infinity, count: 0, tvl: 0 },
  ]

  validPools.forEach(p => {
    const bucket = buckets.find(b => p.apy >= b.min && p.apy < b.max)
    if (bucket) {
      bucket.count++
      bucket.tvl += p.tvlUsd || 0
    }
  })

  // Yield by Chain - aggregate by chain
  const chainData = {}
  validPools.forEach(p => {
    const chain = p.chain || 'Unknown'
    if (!chainData[chain]) chainData[chain] = []
    chainData[chain].push(p.apy)
  })

  // Filter chains with enough data and calculate quartiles
  const chainStats = Object.entries(chainData)
    .filter(([_, apys]) => apys.length >= 5)
    .map(([chain, apys]) => {
      const sorted = apys.sort((a, b) => a - b)
      return {
        chain,
        min: sorted[0],
        q1: sorted[Math.floor(sorted.length * 0.25)],
        median: sorted[Math.floor(sorted.length * 0.5)],
        q3: sorted[Math.floor(sorted.length * 0.75)],
        max: Math.min(sorted[sorted.length - 1], 100), // cap at 100% for visualization
        count: sorted.length,
      }
    })
    .sort((a, b) => b.median - a.median)
    .slice(0, 15)

  // Stablecoin yields vs Treasury
  const stablecoinScatter = stablecoinPools
    .filter(p => p.tvlUsd > 100000)
    .slice(0, 200)

  const aboveTreasury = stablecoinScatter.filter(p => p.apy >= treasuryYield)
  const belowTreasury = stablecoinScatter.filter(p => p.apy < treasuryYield)

  // Yield vs TVL scatter
  const yieldTvlPools = largePools
    .filter(p => p.tvlUsd > 1e6 && p.apy > 0 && p.apy < 100)
    .slice(0, 300)

  // Top yield opportunities (TVL > $1M, sorted by APY)
  const topYieldPools = largePools
    .filter(p => p.apy > 0 && p.apy < 500)
    .sort((a, b) => b.apy - a.apy)
    .slice(0, 20)

  // Dynamic narrative with computed values
  const dynamicNarrative = yieldAnalysisNarrative.paragraphs.map(p =>
    p.replace('{medianStable}', hasYieldData ? formatPercent(medianStableApy) : 'N/A')
      .replace('{treasuryYield}', formatPercent(treasuryYield))
      .replace('{riskPremium}', riskPremium !== null ? (riskPremium * 100).toFixed(0) : 'N/A')
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Median DeFi APY"
          value={formatPercent(medianDefiApy)}
          subtitle="All pools"
        />
        <KPICard
          title="Median Stablecoin Yield"
          value={formatPercent(medianStableApy)}
          subtitle="Stablecoin pools"
        />
        <KPICard
          title="US Treasury 13wk"
          value={formatPercent(treasuryYield)}
          subtitle="Risk-free rate"
        />
        <KPICard
          title="DeFi Risk Premium"
          value={riskPremium !== null ? `${(riskPremium * 100).toFixed(0)} bps` : '—'}
          subtitle="vs Treasury"
          trend={riskPremium !== null && riskPremium > 0 ? riskPremium * 100 : undefined}
        />
      </div>

      {/* Yield Distribution Histogram */}
      <ChartCard title="Yield Distribution" subtitle="Number of pools and TVL by APY range">
        <Plot
          data={[
            {
              x: buckets.map(b => b.label),
              y: buckets.map(b => b.count),
              type: 'bar',
              name: 'Pool Count',
              marker: { color: colors.primary },
              hovertemplate: '%{x}<br>%{y} pools<extra></extra>',
            },
            {
              x: buckets.map(b => b.label),
              y: buckets.map(b => b.tvl / 1e9),
              type: 'bar',
              name: 'TVL ($B)',
              yaxis: 'y2',
              marker: { color: colors.secondary, opacity: 0.7 },
              hovertemplate: '%{x}<br>$%{y:.1f}B TVL<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            barmode: 'group',
            xaxis: { ...defaultLayout.xaxis, title: 'APY Range', type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'Number of Pools' },
            yaxis2: {
              title: 'TVL (Billions USD)',
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

      {/* Yield by Chain - Box Plot Style */}
      <ChartCard title="Yield by Chain" subtitle="APY distribution per chain (median, quartiles) — top chains by pool count">
        <Plot
          data={[
            // Whiskers (min to max)
            {
              x: chainStats.map(c => c.chain),
              y: chainStats.map(c => c.min),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.slate, size: 4 },
              name: 'Min',
              hovertemplate: '%{x}: %{y:.1f}% (Min)<extra></extra>',
            },
            {
              x: chainStats.map(c => c.chain),
              y: chainStats.map(c => c.max),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.slate, size: 4 },
              name: 'Max',
              hovertemplate: '%{x}: %{y:.1f}% (Max)<extra></extra>',
            },
            // Q1 to Q3 (IQR box)
            {
              x: chainStats.map(c => c.chain),
              y: chainStats.map(c => c.q1),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.primary, size: 8, symbol: 'line-ew', line: { width: 2 } },
              name: 'Q1',
              hovertemplate: '%{x}: %{y:.1f}% (Q1)<extra></extra>',
            },
            {
              x: chainStats.map(c => c.chain),
              y: chainStats.map(c => c.q3),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.primary, size: 8, symbol: 'line-ew', line: { width: 2 } },
              name: 'Q3',
              hovertemplate: '%{x}: %{y:.1f}% (Q3)<extra></extra>',
            },
            // Median
            {
              x: chainStats.map(c => c.chain),
              y: chainStats.map(c => c.median),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.warning, size: 12, symbol: 'diamond' },
              name: 'Median',
              hovertemplate: '%{x}: %{y:.1f}% (Median)<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'APY (%)', range: [0, 50] },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.1 },
            showlegend: true,
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Stablecoin Yields vs Treasury */}
      <ChartCard title="Stablecoin Yields vs Treasury" subtitle="Each dot = a stablecoin lending pool · Red = below risk-free rate">
        <Plot
          data={[
            {
              x: aboveTreasury.map((_, i) => i),
              y: aboveTreasury.map(p => p.apy),
              text: aboveTreasury.map(p => `${p.symbol || p.pool}<br>${p.chain}<br>APY: ${p.apy.toFixed(2)}%<br>TVL: $${(p.tvlUsd / 1e6).toFixed(1)}M`),
              type: 'scatter',
              mode: 'markers',
              name: 'Above Treasury',
              marker: {
                color: colors.success,
                size: aboveTreasury.map(p => Math.max(6, Math.min(20, Math.sqrt(p.tvlUsd / 1e6) * 2))),
                opacity: 0.6,
              },
              hovertemplate: '%{text}<extra></extra>',
            },
            {
              x: belowTreasury.map((_, i) => i + aboveTreasury.length),
              y: belowTreasury.map(p => p.apy),
              text: belowTreasury.map(p => `${p.symbol || p.pool}<br>${p.chain}<br>APY: ${p.apy.toFixed(2)}%<br>TVL: $${(p.tvlUsd / 1e6).toFixed(1)}M`),
              type: 'scatter',
              mode: 'markers',
              name: 'Below Treasury',
              marker: {
                color: colors.danger,
                size: belowTreasury.map(p => Math.max(6, Math.min(20, Math.sqrt(p.tvlUsd / 1e6) * 2))),
                opacity: 0.6,
              },
              hovertemplate: '%{text}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, title: 'Pools', showticklabels: false },
            yaxis: { ...defaultLayout.yaxis, title: 'APY (%)' },
            shapes: [
              {
                type: 'line',
                x0: 0,
                x1: stablecoinScatter.length,
                y0: treasuryYield,
                y1: treasuryYield,
                line: { color: colors.warning, width: 2, dash: 'dash' },
              },
            ],
            annotations: [
              {
                x: stablecoinScatter.length * 0.95,
                y: treasuryYield,
                text: `Treasury: ${formatPercent(treasuryYield)}`,
                showarrow: false,
                font: { size: 11, color: colors.warning },
                yshift: 10,
              },
            ],
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Yield vs TVL Scatter */}
      <ChartCard title="Yield vs TVL" subtitle="Larger pools typically offer lower yields — the yield-size tradeoff">
        <Plot
          data={[
            {
              x: yieldTvlPools.map(p => p.tvlUsd),
              y: yieldTvlPools.map(p => p.apy),
              text: yieldTvlPools.map(p => `${p.symbol || p.pool}<br>${p.chain}<br>APY: ${p.apy.toFixed(2)}%<br>TVL: $${(p.tvlUsd / 1e6).toFixed(1)}M`),
              type: 'scatter',
              mode: 'markers',
              marker: {
                color: yieldTvlPools.map(p => p.stablecoin ? colors.primary : colors.secondary),
                size: 8,
                opacity: 0.5,
              },
              hovertemplate: '%{text}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Total Value Locked (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'APY (%)', range: [0, 50] },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Top Yield Opportunities */}
      <ChartCard title="Top Yield Opportunities" subtitle="Highest APY pools with TVL > $1M — filter out low-liquidity spam">
        <Plot
          data={[
            {
              x: topYieldPools.map(p => `${p.symbol || p.pool} (${p.chain})`),
              y: topYieldPools.map(p => p.apy),
              type: 'bar',
              marker: {
                color: topYieldPools.map((p, i) => colors.palette[i % colors.palette.length]),
              },
              hovertemplate: '%{x}<br>APY: %{y:.1f}%<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'APY (%)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      <NarrativeBox title={yieldAnalysisNarrative.title}>
        {dynamicNarrative.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>
    </div>
  )
}
