import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchMoatsData } from '../../services/api'
import { formatCurrency, formatNumber } from '../../utils/helpers'
import { moatsNarrative } from '../../data/narratives'

const TARGET_SLUGS = ['aave', 'uniswap', 'lido', 'maker', 'hyperliquid', 'tether', 'ethena']

const MOAT_RATINGS = {
  tether: 'Highly Durable',
  aave: 'Highly Durable',
  uniswap: 'Weakening',
  hyperliquid: 'Emerging',
  maker: 'Durable',
  lido: 'Durable',
  ethena: 'Emerging',
}

const ratingColors = {
  'Highly Durable': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Durable': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  'Emerging': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  'Weakening': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
}

const ratingChartColors = {
  'Highly Durable': colors.success,
  'Durable': colors.primary,
  'Emerging': colors.warning,
  'Weakening': colors.danger,
}

function MoatBadge({ rating }) {
  const style = ratingColors[rating] || ratingColors['Emerging']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text} ${style.border} border`}>
      {rating}
    </span>
  )
}

export default function MoatsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchMoatsData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading moats data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  const allProtocols = data?.allProtocols || []
  const feesProtocols = data?.fees?.protocols || []
  const protocolDetails = data?.protocolDetails || []

  // Build moat protocols with merged data
  const moatProtocols = TARGET_SLUGS.map(slug => {
    const llama = allProtocols.find(p => 
      p.slug === slug || (p.name || '').toLowerCase() === slug
    )
    const feeData = feesProtocols.find(p => 
      p.slug === slug || (p.name || '').toLowerCase().includes(slug)
    )
    const detail = protocolDetails.find(d => d.slug === slug)

    return {
      slug,
      name: llama?.name || feeData?.name || slug.charAt(0).toUpperCase() + slug.slice(1),
      tvl: llama?.tvl || 0,
      mcap: llama?.mcap || 0,
      revenue24h: feeData?.total24h || detail?.data?.total24h || 0,
      chains: llama?.chains?.length || (Array.isArray(llama?.chain) ? llama.chain.length : 1),
      category: llama?.category || feeData?.category || 'DeFi',
      rating: MOAT_RATINGS[slug] || 'Emerging',
    }
  }).filter(p => p.tvl > 0 || p.revenue24h > 0)

  // KPI calculations
  const trackedCount = moatProtocols.length
  const combinedTVL = moatProtocols.reduce((sum, p) => sum + p.tvl, 0)
  const combinedRevenue = moatProtocols.reduce((sum, p) => sum + p.revenue24h, 0)
  const avgChains = moatProtocols.length > 0 
    ? moatProtocols.reduce((sum, p) => sum + p.chains, 0) / moatProtocols.length 
    : 0

  // Scatter plot data - all protocols as background, moat protocols highlighted
  const bgProtocols = allProtocols
    .filter(p => p.tvl > 1e6)
    .slice(0, 200)

  const bgFeesMap = {}
  feesProtocols.forEach(p => {
    const key = (p.slug || p.name || '').toLowerCase()
    bgFeesMap[key] = p.total24h || 0
  })

  const scatterBg = bgProtocols
    .map(p => {
      const key = (p.slug || p.name || '').toLowerCase()
      const rev = bgFeesMap[key] || 0
      return { name: p.name, tvl: p.tvl, revenue24h: rev, mcap: p.mcap || 0 }
    })
    .filter(p => p.revenue24h > 1000 && p.tvl > 0)

  const scatterHighlight = moatProtocols.filter(p => p.tvl > 0 && p.revenue24h > 0)

  // Revenue bar chart sorted by revenue
  const barData = [...moatProtocols]
    .filter(p => p.revenue24h > 0)
    .sort((a, b) => b.revenue24h - a.revenue24h)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Tracked Protocols" value={trackedCount} subtitle="Moat analysis" />
        <KPICard title="Combined TVL" value={formatCurrency(combinedTVL)} subtitle="Total locked" />
        <KPICard title="Combined Revenue (24h)" value={formatCurrency(combinedRevenue)} subtitle="Daily revenue" />
        <KPICard title="Avg Chains" value={avgChains.toFixed(1)} subtitle="Multi-chain reach" />
      </div>

      {/* Protocol Moat Matrix Table */}
      <ChartCard title="Protocol Moat Matrix" subtitle="Key metrics and moat durability ratings for tracked protocols">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border)">
                <th className="text-left py-3 px-2 font-medium text-(--color-text-secondary)">Protocol</th>
                <th className="text-right py-3 px-2 font-medium text-(--color-text-secondary)">TVL</th>
                <th className="text-right py-3 px-2 font-medium text-(--color-text-secondary)">Revenue 24h</th>
                <th className="text-right py-3 px-2 font-medium text-(--color-text-secondary)">Market Cap</th>
                <th className="text-center py-3 px-2 font-medium text-(--color-text-secondary)">Chains</th>
                <th className="text-left py-3 px-2 font-medium text-(--color-text-secondary)">Category</th>
                <th className="text-center py-3 px-2 font-medium text-(--color-text-secondary)">Moat Rating</th>
              </tr>
            </thead>
            <tbody>
              {moatProtocols.map((p, i) => (
                <tr key={p.slug} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  <td className="py-3 px-2 font-medium text-(--color-text)">{p.name}</td>
                  <td className="py-3 px-2 text-right text-(--color-text-secondary)">{formatCurrency(p.tvl)}</td>
                  <td className="py-3 px-2 text-right text-(--color-text-secondary)">{formatCurrency(p.revenue24h)}</td>
                  <td className="py-3 px-2 text-right text-(--color-text-secondary)">{p.mcap > 0 ? formatCurrency(p.mcap) : '—'}</td>
                  <td className="py-3 px-2 text-center text-(--color-text-secondary)">{p.chains}</td>
                  <td className="py-3 px-2 text-(--color-text-secondary)">{p.category}</td>
                  <td className="py-3 px-2 text-center"><MoatBadge rating={p.rating} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* TVL vs Revenue Scatter Plot */}
      <ChartCard title="TVL vs Revenue Scatter" subtitle="All protocols (gray) vs moat protocols (blue) — bubble size = market cap — log scale">
        <Plot
          data={[
            // Background: all protocols as gray dots
            {
              x: scatterBg.map(p => p.tvl),
              y: scatterBg.map(p => p.revenue24h),
              text: scatterBg.map(p => p.name),
              mode: 'markers',
              type: 'scatter',
              name: 'All Protocols',
              marker: {
                color: '#D1D5DB',
                size: scatterBg.map(p => Math.max(6, Math.min(25, Math.sqrt(p.mcap / 1e7) * 2))),
                opacity: 0.5,
              },
              hovertemplate: '%{text}<br>TVL: $%{x:,.0f}<br>Rev: $%{y:,.0f}<extra></extra>',
            },
            // Highlight: moat protocols in blue with labels
            {
              x: scatterHighlight.map(p => p.tvl),
              y: scatterHighlight.map(p => p.revenue24h),
              text: scatterHighlight.map(p => p.name),
              mode: 'markers+text',
              type: 'scatter',
              name: 'Moat Protocols',
              marker: {
                color: colors.primary,
                size: scatterHighlight.map(p => Math.max(12, Math.min(40, Math.sqrt(p.mcap / 1e7) * 3))),
                opacity: 0.85,
                line: { width: 2, color: '#FFF' },
              },
              textposition: 'top center',
              textfont: { size: 10, color: colors.primary },
              hovertemplate: '%{text}<br>TVL: $%{x:,.0f}<br>Rev: $%{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 500,
            xaxis: { ...defaultLayout.xaxis, title: 'Total Value Locked (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'Revenue 24h (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.12 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Revenue Comparison Bar Chart */}
      <ChartCard title="Moat Protocol Revenue (24h)" subtitle="Daily revenue colored by moat durability rating">
        <Plot
          data={[{
            x: barData.map(p => p.name),
            y: barData.map(p => p.revenue24h),
            type: 'bar',
            marker: {
              color: barData.map(p => ratingChartColors[p.rating] || colors.slate),
              line: { width: 0 },
            },
            hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            yaxis: { ...defaultLayout.yaxis, title: 'Revenue (USD, 24h)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
        <div className="flex flex-wrap gap-4 mt-4 justify-center text-xs">
          {Object.entries(ratingChartColors).map(([rating, color]) => (
            <div key={rating} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: color }}></span>
              <span className="text-(--color-text-secondary)">{rating}</span>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Moat Analysis Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(moatsNarrative.protocols).map(([key, protocol]) => (
          <div key={key} className="bg-white border border-(--color-border) rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-(--color-text)">{protocol.name}</h4>
              <MoatBadge rating={protocol.rating} />
            </div>
            <p className="text-sm text-(--color-text-secondary) leading-relaxed">{protocol.analysis}</p>
          </div>
        ))}
      </div>

      <NarrativeBox title={moatsNarrative.title}>
        <p>The moat durability framework assesses each protocol's competitive advantages based on network effects, switching costs, liquidity depth, and architectural differentiation.</p>
        <p>Protocols rated as <strong>Highly Durable</strong> have compounding network effects that make displacement extremely difficult. <strong>Durable</strong> protocols have strong but not unassailable positions. <strong>Emerging</strong> protocols are building moats but haven't yet proven defensibility. <strong>Weakening</strong> protocols face structural commoditization pressures.</p>
      </NarrativeBox>
    </div>
  )
}
