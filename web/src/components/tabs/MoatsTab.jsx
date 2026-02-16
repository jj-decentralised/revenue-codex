import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchMoatsData } from '../../services/api'
import { formatCurrency, formatNumber, formatPercent, categorizeSector } from '../../utils/helpers'
import { moatsNarrative } from '../../data/narratives'

const ratingColors = {
  'Strong Moat': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Moderate Moat': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  'Weak Moat': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  'No Moat': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
}

const ratingChartColors = {
  'Strong Moat': colors.success,
  'Moderate Moat': colors.primary,
  'Weak Moat': colors.warning,
  'No Moat': colors.danger,
}

function MoatBadge({ rating }) {
  const style = ratingColors[rating] || ratingColors['Weak Moat']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text} ${style.border} border`}>
      {rating}
    </span>
  )
}

/**
 * Compute a moat score (0-100) based on:
 * - TVL dominance within category (0-25)
 * - Revenue consistency (7d vs 24h ratio, 0-25)
 * - Multi-chain presence (0-25)
 * - Capital efficiency (revenue/TVL, 0-25)
 */
function computeMoatScore(p, categoryStats) {
  const cat = categoryStats[p.sector] || {}
  // TVL dominance: share of category TVL
  const tvlShare = cat.totalTvl > 0 ? (p.tvl / cat.totalTvl) * 100 : 0
  const tvlScore = Math.min(25, tvlShare * 2.5) // 10% share = max
  // Revenue consistency: 7d revenue should be ~7x 24h
  const expectedRatio = 7
  const actualRatio = p.revenue24h > 0 ? (p.revenue7d || 0) / p.revenue24h : 0
  const consistencyScore = Math.min(25, actualRatio > 0 ? (Math.min(actualRatio / expectedRatio, 1.2)) * 20 : 0)
  // Multi-chain: more chains = wider moat
  const chainScore = Math.min(25, p.chains * 3)
  // Capital efficiency: revenue per dollar of TVL (annualized)
  const efficiency = p.tvl > 0 ? (p.revenue24h * 365 / p.tvl) * 100 : 0
  const effScore = Math.min(25, efficiency * 5) // 5% efficiency = max
  return Math.round(tvlScore + consistencyScore + chainScore + effScore)
}

function getMoatRating(score) {
  if (score >= 60) return 'Strong Moat'
  if (score >= 40) return 'Moderate Moat'
  if (score >= 20) return 'Weak Moat'
  return 'No Moat'
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

  const processed = useMemo(() => {
    if (!data) return null

    const allProtocols = data?.allProtocols || []
    const feesProtocols = data?.fees?.protocols || []
    const cgMarkets = Array.isArray(data?.markets) ? data.markets : []

    // Build CoinGecko mcap lookup
    const mcapLookup = {}
    cgMarkets.forEach(m => {
      if (m.id) mcapLookup[m.id.toLowerCase()] = m.market_cap
      if (m.symbol) mcapLookup[m.symbol.toLowerCase()] = m.market_cap
    })

    // Merge all protocols with fee/revenue data
    const feesMap = {}
    feesProtocols.forEach(p => {
      const key = (p.slug || '').toLowerCase()
      feesMap[key] = p
    })

    const merged = allProtocols
      .filter(p => p.tvl > 1e6)
      .map(p => {
        const slug = (p.slug || '').toLowerCase()
        const fee = feesMap[slug]
        const mcap = mcapLookup[slug] || mcapLookup[(p.symbol || '').toLowerCase()] || p.mcap || 0
        const sector = categorizeSector(p.category || 'Other')
        return {
          name: p.name,
          slug: p.slug,
          tvl: p.tvl,
          mcap,
          revenue24h: fee?.total24h || 0,
          revenue7d: fee?.total7d || 0,
          revenue30d: fee?.total30d || 0,
          chains: Array.isArray(p.chains) ? p.chains.length : (p.chain ? 1 : 0),
          chainList: Array.isArray(p.chains) ? p.chains : (p.chain ? [p.chain] : []),
          category: p.category || 'Other',
          sector,
          change7d: p.change_7d || 0,
        }
      })

    // Category stats for relative moat scoring
    const categoryStats = {}
    merged.forEach(p => {
      if (!categoryStats[p.sector]) categoryStats[p.sector] = { totalTvl: 0, totalRevenue: 0, count: 0 }
      categoryStats[p.sector].totalTvl += p.tvl
      categoryStats[p.sector].totalRevenue += p.revenue24h
      categoryStats[p.sector].count++
    })

    // Score all protocols with revenue
    const scored = merged
      .filter(p => p.revenue24h > 0)
      .map(p => {
        const moatScore = computeMoatScore(p, categoryStats)
        return { ...p, moatScore, moatRating: getMoatRating(moatScore) }
      })
      .sort((a, b) => b.moatScore - a.moatScore)


    const top50 = scored.slice(0, 50)
    const ratingDist = { 'Strong Moat': 0, 'Moderate Moat': 0, 'Weak Moat': 0, 'No Moat': 0 }
    scored.forEach(p => ratingDist[p.moatRating]++)

    // Sector moat strength
    const sectorMoat = {}
    scored.forEach(p => {
      if (!sectorMoat[p.sector]) sectorMoat[p.sector] = { scores: [], totalRev: 0 }
      sectorMoat[p.sector].scores.push(p.moatScore)
      sectorMoat[p.sector].totalRev += p.revenue24h
    })
    const sectorAvgMoat = Object.entries(sectorMoat)
      .map(([sector, d]) => ({ sector, avgScore: d.scores.reduce((a, b) => a + b, 0) / d.scores.length, count: d.scores.length, totalRev: d.totalRev }))
      .filter(s => s.count >= 3)
      .sort((a, b) => b.avgScore - a.avgScore)

    return { scored, top50, ratingDist, sectorAvgMoat, totalAnalyzed: scored.length, allMerged: merged }
  }, [data])

  if (loading) return <LoadingSpinner message="Loading moats data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>
  if (!processed) return <div className="text-center py-20">No data available</div>

  const { scored, top50, ratingDist, sectorAvgMoat, totalAnalyzed, allMerged } = processed
  const combinedTVL = top50.reduce((s, p) => s + p.tvl, 0)
  const combinedRev = top50.reduce((s, p) => s + p.revenue24h, 0)
  const avgMoatScore = top50.length > 0 ? top50.reduce((s, p) => s + p.moatScore, 0) / top50.length : 0

  // Scatter: all protocols as background, top 50 colored by moat
  const scatterBg = allMerged.filter(p => p.tvl > 1e6 && p.revenue24h > 1000)

  return (
    <div className="space-y-6">
      <div className="text-xs text-(--color-text-secondary) text-right">
        {totalAnalyzed} revenue-earning protocols scored · {allMerged.length.toLocaleString()} total protocols
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard title="Protocols Scored" value={totalAnalyzed} subtitle="With revenue" />
        <KPICard title="Strong Moats" value={ratingDist['Strong Moat']} subtitle="Score ≥60" />
        <KPICard title="Top 50 TVL" value={formatCurrency(combinedTVL)} subtitle="Combined" />
        <KPICard title="Top 50 Revenue" value={formatCurrency(combinedRev)} subtitle="24h combined" />
        <KPICard title="Avg Moat Score" value={avgMoatScore.toFixed(0)} subtitle="Top 50 (of 100)" />
        <KPICard title="Moat Distribution" value={`${ratingDist['Strong Moat']}/${ratingDist['Moderate Moat']}/${ratingDist['Weak Moat']}`} subtitle="S/M/W" />
      </div>

      {/* Top 50 Protocol Table */}
      <ChartCard title="Top 50 Protocols by Moat Score" subtitle="Dynamically scored: TVL dominance (25) + Revenue consistency (25) + Multi-chain (25) + Capital efficiency (25)"
        csvData={{ filename: 'moat-scores', headers: ['Rank','Protocol','TVL','Revenue24h','MCap','Chains','Sector','MoatScore','Rating'], rows: top50.map((p, i) => [i+1, p.name, p.tvl, p.revenue24h, p.mcap, p.chains, p.sector, p.moatScore, p.moatRating]) }}>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-(--color-border)">
                <th className="text-left py-2 px-2 font-medium text-(--color-text-secondary)">#</th>
                <th className="text-left py-2 px-2 font-medium text-(--color-text-secondary)">Protocol</th>
                <th className="text-right py-2 px-2 font-medium text-(--color-text-secondary)">TVL</th>
                <th className="text-right py-2 px-2 font-medium text-(--color-text-secondary)">Revenue 24h</th>
                <th className="text-right py-2 px-2 font-medium text-(--color-text-secondary)">MCap</th>
                <th className="text-center py-2 px-2 font-medium text-(--color-text-secondary)">Chains</th>
                <th className="text-left py-2 px-2 font-medium text-(--color-text-secondary)">Sector</th>
                <th className="text-center py-2 px-2 font-medium text-(--color-text-secondary)">Score</th>
                <th className="text-center py-2 px-2 font-medium text-(--color-text-secondary)">Rating</th>
              </tr>
            </thead>
            <tbody>
              {top50.map((p, i) => (
                <tr key={p.slug} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  <td className="py-2 px-2 text-(--color-text-secondary)">{i + 1}</td>
                  <td className="py-2 px-2 font-medium text-(--color-text)">{p.name}</td>
                  <td className="py-2 px-2 text-right text-(--color-text-secondary)">{formatCurrency(p.tvl)}</td>
                  <td className="py-2 px-2 text-right text-(--color-text-secondary)">{formatCurrency(p.revenue24h)}</td>
                  <td className="py-2 px-2 text-right text-(--color-text-secondary)">{p.mcap > 0 ? formatCurrency(p.mcap) : '—'}</td>
                  <td className="py-2 px-2 text-center text-(--color-text-secondary)">{p.chains}</td>
                  <td className="py-2 px-2 text-(--color-text-secondary) text-xs">{p.sector}</td>
                  <td className="py-2 px-2 text-center font-mono font-medium">{p.moatScore}</td>
                  <td className="py-2 px-2 text-center"><MoatBadge rating={p.moatRating} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* TVL vs Revenue Scatter — all protocols, colored by moat */}
      <ChartCard title="TVL vs Revenue Scatter" subtitle={`${scatterBg.length} protocols · Top 50 by moat colored · Gray = unscored · Log scale`}
        csvData={{ filename: 'tvl-vs-revenue', headers: ['Protocol','TVL','Revenue24h','Sector','MoatScore','Rating'], rows: scored.filter(p => p.tvl > 1e6).map(p => [p.name, p.tvl, p.revenue24h, p.sector, p.moatScore, p.moatRating]) }}>
        <Plot
          data={[
            {
              x: scatterBg.map(p => p.tvl), y: scatterBg.map(p => p.revenue24h),
              text: scatterBg.map(p => p.name),
              mode: 'markers', type: 'scatter', name: 'All Protocols',
              marker: { color: '#D1D5DB', size: 6, opacity: 0.4 },
              hovertemplate: '%{text}<br>TVL: $%{x:,.0f}<br>Rev: $%{y:,.0f}<extra></extra>',
            },
            ...['Strong Moat', 'Moderate Moat', 'Weak Moat'].map(rating => {
              const pts = top50.filter(p => p.moatRating === rating && p.tvl > 0 && p.revenue24h > 0)
              return {
                x: pts.map(p => p.tvl), y: pts.map(p => p.revenue24h),
                text: pts.map(p => `${p.name}<br>Score: ${p.moatScore}<br>Chains: ${p.chains}`),
                mode: 'markers', type: 'scatter', name: rating,
                marker: { color: ratingChartColors[rating], size: pts.map(p => Math.max(10, Math.min(35, Math.sqrt(p.mcap / 1e7) * 3))), opacity: 0.85, line: { width: 1, color: '#FFF' } },
                hovertemplate: '%{text}<extra></extra>',
              }
            }),
          ]}
          layout={{
            ...defaultLayout, height: 520,
            xaxis: { ...defaultLayout.xaxis, title: 'Total Value Locked (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'Revenue 24h (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.12 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Sector Average Moat Score */}
      {sectorAvgMoat.length > 0 && (
        <ChartCard title="Sector Moat Strength" subtitle="Average moat score by sector (min 3 protocols)"
          csvData={{ filename: 'sector-moat-strength', headers: ['Sector','AvgScore','ProtocolCount','TotalRevenue24h'], rows: sectorAvgMoat.map(s => [s.sector, s.avgScore.toFixed(1), s.count, s.totalRev]) }}>
          <Plot
            data={[{
              x: sectorAvgMoat.map(s => s.sector),
              y: sectorAvgMoat.map(s => s.avgScore),
              type: 'bar',
              marker: { color: sectorAvgMoat.map(s => s.avgScore >= 50 ? colors.success : s.avgScore >= 30 ? colors.primary : colors.warning) },
              text: sectorAvgMoat.map(s => `${s.count} protocols`),
              hovertemplate: '%{x}<br>Avg Score: %{y:.0f}<br>%{text}<extra></extra>',
            }]}
            layout={{ ...defaultLayout, height: 380, xaxis: { ...defaultLayout.xaxis, type: 'category' }, yaxis: { ...defaultLayout.yaxis, title: 'Avg Moat Score (of 100)' } }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Moat Score Distribution */}
      <ChartCard title="Moat Score Distribution" subtitle={`${totalAnalyzed} protocols scored`}
        csvData={{ filename: 'moat-distribution', headers: ['Protocol','MoatScore','Rating','Sector','TVL','Revenue24h'], rows: scored.map(p => [p.name, p.moatScore, p.moatRating, p.sector, p.tvl, p.revenue24h]) }}>
        <Plot
          data={[{
            x: scored.map(p => p.moatScore),
            type: 'bar',
            marker: { color: scored.map(p => ratingChartColors[p.moatRating]) },
            nbinsx: 20,
            hovertemplate: 'Score: %{x}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout, height: 300, bargap: 0.05,
            xaxis: { ...defaultLayout.xaxis, title: 'Moat Score', type: 'linear' },
            yaxis: { ...defaultLayout.yaxis, title: 'Count' },
          }}
          config={defaultConfig}
          className="w-full"
        />
        <div className="flex flex-wrap gap-4 mt-4 justify-center text-xs">
          {Object.entries(ratingChartColors).map(([rating, color]) => (
            <div key={rating} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: color }}></span>
              <span className="text-(--color-text-secondary)">{rating} ({ratingDist[rating]})</span>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Curated moat analysis cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(moatsNarrative.protocols).map(([key, protocol]) => (
          <div key={key} className="bg-white border border-(--color-border) rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-(--color-text)">{protocol.name}</h4>
              <MoatBadge rating={protocol.rating === 'Highly Durable' ? 'Strong Moat' : protocol.rating === 'Weakening' ? 'Weak Moat' : 'Moderate Moat'} />
            </div>
            <p className="text-sm text-(--color-text-secondary) leading-relaxed">{protocol.analysis}</p>
          </div>
        ))}
      </div>

      <NarrativeBox title="Moat Scoring Methodology">
        <p>Every revenue-earning protocol is scored on 4 axes (25 pts each, 100 max): <strong>TVL Dominance</strong> (market share within sector), <strong>Revenue Consistency</strong> (7d vs 24h stability), <strong>Multi-chain Presence</strong> (deployment breadth), and <strong>Capital Efficiency</strong> (revenue per dollar locked). This dynamic scoring replaces static ratings with data-driven moat assessment across {totalAnalyzed} protocols.</p>
        <p>Protocols with <strong>Strong Moats</strong> (≥60) have compounding network effects and multi-chain distribution. <strong>Moderate Moats</strong> (40–59) are defensible but face competition. <strong>Weak Moats</strong> (20–39) are vulnerable to forks and liquidity migration.</p>
      </NarrativeBox>
    </div>
  )
}
