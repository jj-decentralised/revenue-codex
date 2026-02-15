import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchFutureLeadersData } from '../../services/api'
import { formatCurrency, formatNumber, categorizeSector } from '../../utils/helpers'
import { futureLeadersNarrative } from '../../data/narratives'

export default function FutureLeadersTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rwaMultiplier, setRwaMultiplier] = useState(5)

  useEffect(() => {
    fetchFutureLeadersData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading future leaders data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  const allProtocols = data?.protocols || []
  const feesProtocols = data?.fees?.protocols || []

  // RWA protocols by TVL
  const rwaProtocols = allProtocols
    .filter(p => p.category === 'RWA' && p.tvl > 0)
    .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
    .slice(0, 15)

  const totalRwaTvl = rwaProtocols.reduce((sum, p) => sum + (p.tvl || 0), 0)
  const rwaProtocolCount = allProtocols.filter(p => p.category === 'RWA').length

  // AI/Compute protocols
  const aiProtocols = allProtocols.filter(p =>
    ['AI', 'Compute', 'GPU', 'Decentralized Compute'].some(cat =>
      (p.category || '').toLowerCase().includes(cat.toLowerCase())
    )
  )
  const totalAiTvl = aiProtocols.reduce((sum, p) => sum + (p.tvl || 0), 0)
  const aiProtocolCount = aiProtocols.length

  // RWA protocols with revenue for simulator
  const rwaWithRevenue = rwaProtocols.map(p => {
    const feesData = feesProtocols.find(f =>
      f.slug === p.slug || (f.name || '').toLowerCase() === (p.name || '').toLowerCase()
    )
    return {
      name: p.name,
      slug: p.slug,
      tvl: p.tvl || 0,
      revenue24h: feesData?.total24h || 0,
    }
  }).filter(p => p.revenue24h > 0 || p.tvl > 0)

  // Projected revenue based on multiplier (assumes revenue scales with TVL)
  const projectedRevenue = rwaWithRevenue.map(p => ({
    ...p,
    projectedRevenue: p.revenue24h * rwaMultiplier,
  }))

  // Scatter plot data: TVL vs 24h Revenue by sector
  const scatterData = allProtocols
    .filter(p => p.tvl > 1e6)
    .map(p => {
      const feesData = feesProtocols.find(f =>
        f.slug === p.slug || (f.name || '').toLowerCase() === (p.name || '').toLowerCase()
      )
      return {
        name: p.name,
        tvl: p.tvl || 0,
        revenue24h: feesData?.total24h || 0,
        category: p.category || 'Other',
        sector: categorizeSector(p.category || 'Other'),
      }
    })
    .filter(p => p.revenue24h > 1000)
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 100)

  // Group scatter data by sector, highlighting RWA and AI
  const rwaScatter = scatterData.filter(p => p.category === 'RWA')
  const aiScatter = scatterData.filter(p =>
    ['AI', 'Compute', 'GPU', 'Decentralized Compute'].some(cat =>
      (p.category || '').toLowerCase().includes(cat.toLowerCase())
    )
  )
  const otherScatter = scatterData.filter(p =>
    p.category !== 'RWA' &&
    !['AI', 'Compute', 'GPU', 'Decentralized Compute'].some(cat =>
      (p.category || '').toLowerCase().includes(cat.toLowerCase())
    )
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="RWA Sector TVL"
          value={formatCurrency(totalRwaTvl)}
          subtitle="Total Value Locked"
        />
        <KPICard
          title="RWA Protocols"
          value={rwaProtocolCount}
          subtitle="Active protocols"
        />
        <KPICard
          title="AI/Compute TVL"
          value={formatCurrency(totalAiTvl)}
          subtitle="Decentralized compute"
        />
        <KPICard
          title="AI/Compute Protocols"
          value={aiProtocolCount}
          subtitle="Active protocols"
        />
      </div>

      {/* RWA Protocols Bar Chart */}
      <ChartCard title="Top RWA Protocols by TVL" subtitle="Real World Asset protocols — ranked by Total Value Locked">
        <Plot
          data={[{
            x: rwaProtocols.map(p => p.name),
            y: rwaProtocols.map(p => p.tvl),
            type: 'bar',
            marker: { color: colors.primary, line: { width: 0 } },
            hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'TVL (USD)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* RWA 10x Simulator */}
      <ChartCard title="RWA Growth Simulator" subtitle="Project RWA protocol revenue at different TVL growth multiples">
        <div className="mb-4 flex items-center gap-4">
          <label className="text-sm text-(--color-text-secondary)">TVL Multiplier:</label>
          <input
            type="range"
            min="1"
            max="20"
            value={rwaMultiplier}
            onChange={e => setRwaMultiplier(Number(e.target.value))}
            className="flex-1 max-w-xs accent-(--color-primary)"
          />
          <span className="text-lg font-semibold text-(--color-primary) min-w-[3rem]">{rwaMultiplier}x</span>
        </div>
        <div className="bg-gray-50 border border-(--color-border) rounded p-3 mb-4">
          <p className="text-sm text-(--color-text)">
            At <span className="font-semibold text-(--color-primary)">{rwaMultiplier}x</span> TVL growth, projected daily revenue:{' '}
            <span className="font-semibold text-(--color-success)">
              {formatCurrency(projectedRevenue.reduce((sum, p) => sum + p.projectedRevenue, 0))}
            </span>
            {' '}(vs current: {formatCurrency(projectedRevenue.reduce((sum, p) => sum + p.revenue24h, 0))})
          </p>
        </div>
        <Plot
          data={[
            {
              x: projectedRevenue.map(p => p.name),
              y: projectedRevenue.map(p => p.revenue24h),
              type: 'bar',
              name: 'Current Revenue',
              marker: { color: colors.slate, opacity: 0.5 },
              hovertemplate: '%{x}<br>Current: $%{y:,.0f}<extra></extra>',
            },
            {
              x: projectedRevenue.map(p => p.name),
              y: projectedRevenue.map(p => p.projectedRevenue),
              type: 'bar',
              name: `Projected (${rwaMultiplier}x)`,
              marker: { color: colors.success },
              hovertemplate: '%{x}<br>Projected: $%{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'Daily Revenue (USD)' },
            barmode: 'group',
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Sector Growth Scatter */}
      <ChartCard title="Sector Growth Scatter" subtitle="TVL vs 24h Revenue — RWA and AI/Compute highlighted">
        <Plot
          data={[
            {
              x: otherScatter.map(p => p.tvl),
              y: otherScatter.map(p => p.revenue24h),
              text: otherScatter.map(p => `${p.name}<br>${p.sector}`),
              mode: 'markers',
              type: 'scatter',
              name: 'Other Sectors',
              marker: {
                color: colors.slate,
                size: 8,
                opacity: 0.4,
              },
              hovertemplate: '%{text}<br>TVL: $%{x:,.0f}<br>Revenue: $%{y:,.0f}<extra></extra>',
            },
            {
              x: rwaScatter.map(p => p.tvl),
              y: rwaScatter.map(p => p.revenue24h),
              text: rwaScatter.map(p => p.name),
              mode: 'markers',
              type: 'scatter',
              name: 'RWA',
              marker: {
                color: colors.primary,
                size: 14,
                opacity: 0.85,
                line: { width: 2, color: '#FFF' },
              },
              hovertemplate: '%{text}<br>TVL: $%{x:,.0f}<br>Revenue: $%{y:,.0f}<extra>RWA</extra>',
            },
            {
              x: aiScatter.map(p => p.tvl),
              y: aiScatter.map(p => p.revenue24h),
              text: aiScatter.map(p => p.name),
              mode: 'markers',
              type: 'scatter',
              name: 'AI/Compute',
              marker: {
                color: colors.secondary,
                size: 14,
                opacity: 0.85,
                line: { width: 2, color: '#FFF' },
              },
              hovertemplate: '%{text}<br>TVL: $%{x:,.0f}<br>Revenue: $%{y:,.0f}<extra>AI/Compute</extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 500,
            xaxis: { ...defaultLayout.xaxis, title: 'Total Value Locked (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: '24h Revenue (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* RWA Narrative */}
      <NarrativeBox title="Real World Assets (RWA)">
        {futureLeadersNarrative.rwa.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>

      {/* AI Narrative */}
      <NarrativeBox title="AI Agents & Compute">
        {futureLeadersNarrative.ai.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>
    </div>
  )
}
