import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchValuationsData } from '../../services/api'
import { formatCurrency, formatMultiple, categorizeSector } from '../../utils/helpers'
import { valuationsNarrative } from '../../data/narratives'

export default function ValuationsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showStablecoins, setShowStablecoins] = useState(true)

  useEffect(() => {
    fetchValuationsData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading valuations data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  const feesProtocols = data?.fees?.protocols || []
  const totalFees24h = data?.fees?.totalFees24h || 0
  const totalRevenue24h = data?.fees?.totalRevenue24h || 0

  let topProtocols = feesProtocols
    .filter(p => p.total24h > 0)
    .sort((a, b) => (b.total24h || 0) - (a.total24h || 0))

  if (!showStablecoins) {
    topProtocols = topProtocols.filter(p =>
      !['tether', 'circle', 'ethena', 'maker'].some(s => (p.slug || p.name || '').toLowerCase().includes(s))
    )
  }

  const top20 = topProtocols.slice(0, 20)

  // DeFiLlama protocols with mcap for scatter
  const llamaProtocols = (data?.protocols || []).filter(p => p.tvl > 1e6 && p.mcap > 0).slice(0, 200)

  const scatterProtocols = feesProtocols
    .filter(p => p.total24h > 10000)
    .map(p => {
      const llama = llamaProtocols.find(lp =>
        lp.slug === p.slug || lp.name?.toLowerCase() === (p.name || '').toLowerCase()
      )
      return {
        name: p.name || p.slug,
        revenue24h: p.total24h,
        annualizedRevenue: p.total24h * 365,
        mcap: llama?.mcap || 0,
        tvl: llama?.tvl || 0,
        category: llama?.category || p.category || 'Other',
        psRatio: llama?.mcap ? llama.mcap / (p.total24h * 365) : null,
      }
    })
    .filter(p => p.mcap > 0 && p.annualizedRevenue > 0)
    .sort((a, b) => b.annualizedRevenue - a.annualizedRevenue)
    .slice(0, 50)

  const scatterCategories = [...new Set(scatterProtocols.map(p => categorizeSector(p.category)))]
  const catColorMap = {}
  scatterCategories.forEach((cat, i) => { catColorMap[cat] = colors.palette[i % colors.palette.length] })

  const avgPS = scatterProtocols.filter(p => p.psRatio).length > 0
    ? scatterProtocols.reduce((s, p) => s + (p.psRatio || 0), 0) / scatterProtocols.filter(p => p.psRatio).length
    : null

  // Sector revenue breakdown
  const sectorRevenue = {}
  feesProtocols.forEach(p => {
    const sector = categorizeSector(p.category || 'Other')
    sectorRevenue[sector] = (sectorRevenue[sector] || 0) + (p.total24h || 0)
  })
  const sortedSectors = Object.entries(sectorRevenue).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Fees (24h)" value={formatCurrency(totalFees24h)} subtitle="All protocols" trend={data?.fees?.change_1d} />
        <KPICard title="Protocol Revenue (24h)" value={formatCurrency(totalRevenue24h)} subtitle="Revenue to protocol" />
        <KPICard title="Annualized Revenue" value={formatCurrency(totalRevenue24h * 365)} subtitle="Extrapolated" />
        <KPICard title="Avg P/S Ratio" value={avgPS ? formatMultiple(avgPS) : '—'} subtitle="Top protocols" />
      </div>

      <ChartCard title="Top Protocol Revenue (24h)" subtitle="Daily revenue by protocol — DeFiLlama">
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-xs text-(--color-text-secondary) cursor-pointer">
            <input type="checkbox" checked={showStablecoins} onChange={e => setShowStablecoins(e.target.checked)} className="rounded" />
            Include Stablecoins
          </label>
        </div>
        <Plot
          data={[{
            x: top20.map(p => p.name || p.slug),
            y: top20.map(p => p.total24h),
            type: 'bar',
            marker: { color: top20.map((_, i) => colors.palette[i % colors.palette.length]), line: { width: 0 } },
            hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
          }]}
          layout={{ ...defaultLayout, height: 400, xaxis: { ...defaultLayout.xaxis, tickangle: -45 }, yaxis: { ...defaultLayout.yaxis, title: 'Revenue (USD)' } }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      <ChartCard title="Revenue vs Market Cap — P/S Scatter" subtitle="Bubble size = TVL · Color = Sector · Log scale">
        <Plot
          data={scatterCategories.map(cat => {
            const pts = scatterProtocols.filter(p => categorizeSector(p.category) === cat)
            return {
              x: pts.map(p => p.annualizedRevenue),
              y: pts.map(p => p.mcap),
              text: pts.map(p => `${p.name}<br>P/S: ${p.psRatio ? p.psRatio.toFixed(1) + 'x' : 'N/A'}<br>Rev: $${(p.annualizedRevenue / 1e6).toFixed(1)}M<br>MCap: $${(p.mcap / 1e6).toFixed(0)}M`),
              mode: 'markers', type: 'scatter', name: cat,
              marker: {
                color: catColorMap[cat],
                size: pts.map(p => Math.max(8, Math.min(40, Math.sqrt(p.tvl / 1e6) * 3))),
                opacity: 0.75, line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
            }
          })}
          layout={{
            ...defaultLayout, height: 500,
            xaxis: { ...defaultLayout.xaxis, title: 'Annualized Revenue (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'Fully Diluted Market Cap (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      <ChartCard title="Revenue by Sector" subtitle="Categorical breakdown of 24h fees across sectors">
        <Plot
          data={[{
            x: sortedSectors.map(s => s[0]),
            y: sortedSectors.map(s => s[1]),
            type: 'bar',
            marker: { color: sortedSectors.map((_, i) => colors.palette[i % colors.palette.length]) },
            hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
          }]}
          layout={{ ...defaultLayout, height: 350, yaxis: { ...defaultLayout.yaxis, title: 'Revenue (USD, 24h)' } }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      <NarrativeBox title={valuationsNarrative.title}>
        {valuationsNarrative.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>
    </div>
  )
}
