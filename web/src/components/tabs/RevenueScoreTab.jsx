import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatPercent, formatNumber, formatMultiple, categorizeSector } from '../../utils/helpers'

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Revenue Sustainability Score (0–25)
 * Low coefficient of variation in daily revenue = stable = high score
 */
function scoreSustainability(dailyRevenues) {
  if (!dailyRevenues || dailyRevenues.length < 30) return null
  const values = dailyRevenues.filter(v => v > 0)
  if (values.length < 14) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const cv = Math.sqrt(variance) / mean
  // CV of 0 = perfect score, CV > 2 = 0 score
  return Math.max(0, Math.min(25, 25 * (1 - cv / 2)))
}

/**
 * Take Rate Score (0–25)
 * Revenue/Fees ratio — higher retention = higher score
 */
function scoreTakeRate(revenue, fees) {
  if (!fees || fees <= 0) return null
  if (!revenue || revenue < 0) return 0
  const takeRate = revenue / fees
  // 0% = 0 score, 100% = 25 score (linear)
  return Math.max(0, Math.min(25, takeRate * 25))
}

/**
 * Growth Momentum Score (0–20)
 * 30d revenue growth rate — positive growth scores higher
 */
function scoreGrowth(revenue30d, revenuePrev30d) {
  if (!revenuePrev30d || revenuePrev30d <= 0) return null
  const growthRate = ((revenue30d - revenuePrev30d) / revenuePrev30d) * 100
  // -50% = 0, 0% = 10, +100% = 20 (clamped)
  return Math.max(0, Math.min(20, 10 + (growthRate / 10)))
}

/**
 * Capital Efficiency Score (0–15)
 * Revenue/TVL ratio — higher = more efficient
 */
function scoreEfficiency(annualizedRevenue, tvl) {
  if (!tvl || tvl <= 0) return null
  const efficiency = (annualizedRevenue / tvl) * 100
  // 0% = 0, 5% = 7.5, 20%+ = 15 (capped)
  return Math.max(0, Math.min(15, efficiency * 0.75))
}

/**
 * Valuation Reasonableness Score (0–15)
 * P/S ratio vs sector median — moderate P/S scores high
 */
function scoreValuation(psRatio, sectorMedianPS) {
  if (!psRatio || psRatio <= 0 || !sectorMedianPS || sectorMedianPS <= 0) return null
  const ratio = psRatio / sectorMedianPS
  // ratio of 1.0 = perfect score, ratio < 0.25 or > 4 = 0 score
  if (ratio >= 0.5 && ratio <= 2.0) return 15
  if (ratio >= 0.25 && ratio < 0.5) return 10
  if (ratio > 2.0 && ratio <= 3.0) return 10
  if (ratio > 3.0 && ratio <= 4.0) return 5
  return 2
}

/**
 * Compute composite score with available dimensions
 */
function computeCompositeScore(scores) {
  const available = Object.entries(scores).filter(([_, v]) => v !== null)
  if (available.length < 2) return null

  const maxPossible = {
    sustainability: 25,
    takeRate: 25,
    growth: 20,
    efficiency: 15,
    valuation: 15,
  }

  // Sum available scores and their max possible values
  let totalScore = 0
  let totalMax = 0
  available.forEach(([key, value]) => {
    totalScore += value
    totalMax += maxPossible[key] || 0
  })

  // Normalize to 0–100 scale
  return totalMax > 0 ? (totalScore / totalMax) * 100 : 0
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchRevenueScoreData() {
  const results = await Promise.allSettled([
    // DeFiLlama fees (total + breakdown)
    fetch('https://api.llama.fi/overview/fees?excludeTotalDataChartBreakdown=false').then(r => r.ok ? r.json() : null),
    // DeFiLlama fees as revenue (take rate comparison)
    fetch('/api/defillama?action=fees_revenue').then(r => r.ok ? r.json() : null),
    // All protocols (TVL data)
    fetch('https://api.llama.fi/protocols').then(r => r.ok ? r.json() : null),
    // CoinGecko markets (market cap for P/S)
    fetch('/api/coingecko?action=markets').then(r => r.ok ? r.json() : null),
  ])

  const getValue = (idx) => results[idx]?.status === 'fulfilled' ? results[idx].value : null

  return {
    fees: getValue(0),
    feesRevenue: getValue(1),
    protocols: getValue(2),
    markets: getValue(3),
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RevenueScoreTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchRevenueScoreData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const processed = useMemo(() => {
    if (!data) return null

    const feesProtocols = data.fees?.protocols || []
    const revenueProtocols = data.feesRevenue?.protocols || []
    const allProtocols = data.protocols || []
    const markets = data.markets || []
    const totalDataChartBreakdown = data.fees?.totalDataChartBreakdown || []

    // Build lookups
    const revLookup = {}
    revenueProtocols.forEach(p => { if (p.slug) revLookup[p.slug.toLowerCase()] = p })

    const protocolLookup = {}
    allProtocols.forEach(p => { if (p.slug) protocolLookup[p.slug.toLowerCase()] = p })

    const marketCapLookup = {}
    markets.forEach(m => {
      if (m.symbol) marketCapLookup[m.symbol.toLowerCase()] = m
      if (m.id) marketCapLookup[m.id.toLowerCase()] = m
    })

    // Build daily revenue per protocol from breakdown
    const protocolDailyRevenue = {}
    totalDataChartBreakdown.forEach(([_, breakdown]) => {
      Object.entries(breakdown || {}).forEach(([protocol, value]) => {
        if (!protocolDailyRevenue[protocol]) protocolDailyRevenue[protocol] = []
        protocolDailyRevenue[protocol].push(value)
      })
    })

    // Get top 50 protocols by fees
    const top50 = feesProtocols
      .filter(p => p.total24h > 0)
      .sort((a, b) => (b.total24h || 0) - (a.total24h || 0))
      .slice(0, 50)

    // Compute sector median P/S ratios
    const sectorPSRatios = {}
    top50.forEach(p => {
      const protocolData = protocolLookup[(p.slug || '').toLowerCase()]
      const sector = categorizeSector(p.category || protocolData?.category || 'Other')
      const symbol = (protocolData?.symbol || p.slug || '').toLowerCase()
      const mcapData = marketCapLookup[symbol] || marketCapLookup[(p.slug || '').toLowerCase()]
      const mcap = mcapData?.market_cap || protocolData?.mcap || 0
      const annRevenue = (p.total24h || 0) * 365
      if (mcap > 0 && annRevenue > 0) {
        const ps = mcap / annRevenue
        if (!sectorPSRatios[sector]) sectorPSRatios[sector] = []
        sectorPSRatios[sector].push(ps)
      }
    })

    const sectorMedianPS = {}
    Object.entries(sectorPSRatios).forEach(([sector, ratios]) => {
      const sorted = [...ratios].sort((a, b) => a - b)
      sectorMedianPS[sector] = sorted[Math.floor(sorted.length / 2)] || null
    })

    // Score each protocol
    const scoredProtocols = top50.map(p => {
      const slug = (p.slug || '').toLowerCase()
      const rev = revLookup[slug]
      const protocolData = protocolLookup[slug]
      const sector = categorizeSector(p.category || protocolData?.category || 'Other')
      const symbol = (protocolData?.symbol || p.slug || '').toLowerCase()
      const mcapData = marketCapLookup[symbol] || marketCapLookup[slug]
      const mcap = mcapData?.market_cap || protocolData?.mcap || 0
      const tvl = protocolData?.tvl || 0
      const revenue24h = rev?.total24h || 0
      const fees24h = p.total24h || 0
      const annRevenue = fees24h * 365

      // Daily revenues for sustainability
      const dailyRevs = protocolDailyRevenue[p.slug] || protocolDailyRevenue[p.name] || []

      // Growth: compare last 30 days to previous 30 days
      const last30 = dailyRevs.slice(-30)
      const prev30 = dailyRevs.slice(-60, -30)
      const sum30 = last30.reduce((a, b) => a + b, 0)
      const sumPrev30 = prev30.reduce((a, b) => a + b, 0)

      // P/S ratio
      const psRatio = mcap > 0 && annRevenue > 0 ? mcap / annRevenue : null

      // Sub-scores
      const sustainability = scoreSustainability(dailyRevs)
      const takeRate = scoreTakeRate(revenue24h, fees24h)
      const growth = scoreGrowth(sum30, sumPrev30)
      const efficiency = scoreEfficiency(annRevenue, tvl)
      const valuation = scoreValuation(psRatio, sectorMedianPS[sector])

      const scores = { sustainability, takeRate, growth, efficiency, valuation }
      const composite = computeCompositeScore(scores)

      // Price change (from CoinGecko)
      const priceChange30d = mcapData?.price_change_percentage_30d_in_currency || null

      return {
        name: p.name || p.slug,
        slug: p.slug,
        symbol: protocolData?.symbol || '',
        sector,
        fees24h,
        revenue24h,
        annRevenue,
        tvl,
        mcap,
        psRatio,
        priceChange30d,
        scores,
        composite,
      }
    }).filter(p => p.composite !== null)
    .sort((a, b) => b.composite - a.composite)

    // KPIs
    const highestScore = scoredProtocols[0]
    const composites = scoredProtocols.map(p => p.composite)
    const medianScore = composites.length > 0
      ? composites.sort((a, b) => a - b)[Math.floor(composites.length / 2)]
      : 0

    // Best/worst sector
    const sectorScores = {}
    scoredProtocols.forEach(p => {
      if (!sectorScores[p.sector]) sectorScores[p.sector] = []
      sectorScores[p.sector].push(p.composite)
    })
    const sectorAvgScores = Object.entries(sectorScores)
      .filter(([_, scores]) => scores.length >= 2)
      .map(([sector, scores]) => ({
        sector,
        avg: scores.reduce((a, b) => a + b, 0) / scores.length,
        count: scores.length,
        median: [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)],
        min: Math.min(...scores),
        max: Math.max(...scores),
        scores,
      }))
      .sort((a, b) => b.avg - a.avg)

    const bestSector = sectorAvgScores[0]
    const worstSector = sectorAvgScores[sectorAvgScores.length - 1]

    return {
      scoredProtocols,
      highestScore,
      medianScore,
      bestSector,
      worstSector,
      sectorAvgScores,
      totalScored: scoredProtocols.length,
    }
  }, [data])

  if (loading) return <LoadingSpinner message="Computing revenue quality scores..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>
  if (!processed) return <div className="text-center py-20">No data available</div>

  const {
    scoredProtocols, highestScore, medianScore,
    bestSector, worstSector, sectorAvgScores, totalScored,
  } = processed

  // === Chart 1: Revenue Quality Scoreboard ===
  const top30 = scoredProtocols.slice(0, 30)

  // === Chart 2: Quality Score vs Market Cap Scatter ===
  const scatterProtocols = scoredProtocols.filter(p => p.mcap > 0)
  const sectors = [...new Set(scatterProtocols.map(p => p.sector))]
  const sectorColorMap = {}
  sectors.forEach((s, i) => { sectorColorMap[s] = colors.palette[i % colors.palette.length] })

  // === Chart 3: Radar Charts for Top 6 ===
  const top6 = scoredProtocols.slice(0, 6)
  const radarCategories = ['Sustainability', 'Take Rate', 'Growth', 'Efficiency', 'Valuation']
  const radarMax = [25, 25, 20, 15, 15]

  // === Chart 5: Quality Score vs 30d Price Change ===
  const priceProtocols = scoredProtocols.filter(p => p.priceChange30d !== null && p.priceChange30d !== undefined)

  // Score color
  const getScoreColor = (score) => {
    if (score >= 70) return colors.success
    if (score >= 50) return colors.primary
    if (score >= 35) return colors.warning
    return colors.danger
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Highest Score"
          value={highestScore?.name || '—'}
          subtitle={highestScore ? `Score: ${highestScore.composite.toFixed(0)}/100` : ''}
        />
        <KPICard
          title="Median Score"
          value={medianScore.toFixed(0)}
          subtitle={`of ${totalScored} protocols`}
        />
        <KPICard
          title="Best Sector"
          value={bestSector?.sector || '—'}
          subtitle={bestSector ? `Avg: ${bestSector.avg.toFixed(0)}` : ''}
        />
        <KPICard
          title="Worst Sector"
          value={worstSector?.sector || '—'}
          subtitle={worstSector ? `Avg: ${worstSector.avg.toFixed(0)}` : ''}
        />
      </div>

      <NarrativeBox title="Revenue Quality Score Methodology">
        <p>
          Each protocol is scored 0–100 across five dimensions: <strong>Revenue Sustainability</strong> (25pts — low volatility = stable cash flow),
          <strong> Take Rate</strong> (25pts — % of fees retained by the protocol), <strong>Growth Momentum</strong> (20pts — 30d revenue trend),
          <strong> Capital Efficiency</strong> (15pts — revenue per dollar of TVL), and <strong>Valuation Reasonableness</strong> (15pts — P/S vs sector median).
          Protocols with incomplete data are scored on available dimensions with proportional reweighting.
        </p>
      </NarrativeBox>

      {/* Chart 1: Scoreboard */}
      <ChartCard
        title="Revenue Quality Scoreboard — Top 30"
        subtitle="Composite score breakdown by dimension · Higher = more sustainable, well-priced, efficient revenue"
        csvData={{
          filename: 'revenue-quality-scores',
          headers: ['Protocol', 'CompositeScore', 'Sustainability', 'TakeRate', 'Growth', 'Efficiency', 'Valuation', 'Sector'],
          rows: top30.map(p => [
            p.name, p.composite.toFixed(1),
            p.scores.sustainability?.toFixed(1) || '',
            p.scores.takeRate?.toFixed(1) || '',
            p.scores.growth?.toFixed(1) || '',
            p.scores.efficiency?.toFixed(1) || '',
            p.scores.valuation?.toFixed(1) || '',
            p.sector,
          ]),
        }}
      >
        <Plot
          data={[
            {
              y: top30.map(p => p.name),
              x: top30.map(p => (p.scores.sustainability || 0) / 25 * 100 * 0.25),
              type: 'bar',
              orientation: 'h',
              name: 'Sustainability',
              marker: { color: colors.primary },
              hovertemplate: '%{y}<br>Sustainability: %{x:.1f}<extra></extra>',
            },
            {
              y: top30.map(p => p.name),
              x: top30.map(p => (p.scores.takeRate || 0) / 25 * 100 * 0.25),
              type: 'bar',
              orientation: 'h',
              name: 'Take Rate',
              marker: { color: colors.success },
              hovertemplate: '%{y}<br>Take Rate: %{x:.1f}<extra></extra>',
            },
            {
              y: top30.map(p => p.name),
              x: top30.map(p => (p.scores.growth || 0) / 20 * 100 * 0.20),
              type: 'bar',
              orientation: 'h',
              name: 'Growth',
              marker: { color: colors.warning },
              hovertemplate: '%{y}<br>Growth: %{x:.1f}<extra></extra>',
            },
            {
              y: top30.map(p => p.name),
              x: top30.map(p => (p.scores.efficiency || 0) / 15 * 100 * 0.15),
              type: 'bar',
              orientation: 'h',
              name: 'Efficiency',
              marker: { color: colors.cyan },
              hovertemplate: '%{y}<br>Efficiency: %{x:.1f}<extra></extra>',
            },
            {
              y: top30.map(p => p.name),
              x: top30.map(p => (p.scores.valuation || 0) / 15 * 100 * 0.15),
              type: 'bar',
              orientation: 'h',
              name: 'Valuation',
              marker: { color: colors.secondary },
              hovertemplate: '%{y}<br>Valuation: %{x:.1f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: Math.max(500, top30.length * 24),
            barmode: 'stack',
            xaxis: { ...defaultLayout.xaxis, title: 'Composite Score (0–100)', range: [0, 105] },
            yaxis: { ...defaultLayout.yaxis, autorange: 'reversed', tickfont: { size: 11 } },
            margin: { ...defaultLayout.margin, l: 130, r: 40 },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.1 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 2: Quality Score vs Market Cap */}
      {scatterProtocols.length > 0 && (
        <ChartCard
          title="Quality Score vs Market Cap"
          subtitle="Upper-left = high quality, undervalued · Lower-right = overvalued relative to quality"
        >
          <Plot
            data={sectors.map(sector => {
              const pts = scatterProtocols.filter(p => p.sector === sector)
              return {
                x: pts.map(p => p.composite),
                y: pts.map(p => p.mcap),
                text: pts.map(p =>
                  `${p.name}<br>Score: ${p.composite.toFixed(0)}<br>MCap: ${formatCurrency(p.mcap)}<br>P/S: ${p.psRatio ? formatMultiple(p.psRatio) : '—'}`
                ),
                mode: 'markers',
                type: 'scatter',
                name: sector,
                marker: {
                  color: sectorColorMap[sector],
                  size: pts.map(p => Math.max(8, Math.min(35, Math.sqrt(p.annRevenue / 1e5) * 2))),
                  opacity: 0.75,
                  line: { width: 1, color: '#FFF' },
                },
                hovertemplate: '%{text}<extra></extra>',
              }
            })}
            layout={{
              ...defaultLayout,
              height: 500,
              xaxis: { ...defaultLayout.xaxis, title: 'Revenue Quality Score', range: [0, 100] },
              yaxis: { ...defaultLayout.yaxis, title: 'Market Cap (USD)', type: 'log' },
              legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 3: Radar Charts — Top 6 Protocols */}
      {top6.length > 0 && (
        <ChartCard
          title="Sub-Score Profiles — Top 6 Protocols"
          subtitle="Radar showing dimensional strengths and weaknesses · Each axis normalized to its maximum"
        >
          <Plot
            data={top6.map((p, i) => ({
              type: 'scatterpolar',
              r: [
                ((p.scores.sustainability || 0) / 25) * 100,
                ((p.scores.takeRate || 0) / 25) * 100,
                ((p.scores.growth || 0) / 20) * 100,
                ((p.scores.efficiency || 0) / 15) * 100,
                ((p.scores.valuation || 0) / 15) * 100,
                ((p.scores.sustainability || 0) / 25) * 100, // close the polygon
              ],
              theta: [...radarCategories, radarCategories[0]],
              fill: 'toself',
              fillcolor: colors.palette[i % colors.palette.length] + '30',
              line: { color: colors.palette[i % colors.palette.length], width: 2 },
              name: p.name,
              hovertemplate: `${p.name}<br>%{theta}: %{r:.0f}%<extra></extra>`,
            }))}
            layout={{
              ...defaultLayout,
              height: 450,
              polar: {
                radialaxis: {
                  visible: true,
                  range: [0, 100],
                  tickfont: { size: 10, color: '#7A7A7A' },
                  gridcolor: '#E5E3E0',
                },
                angularaxis: {
                  tickfont: { size: 11, color: '#4A4A4A' },
                  gridcolor: '#E5E3E0',
                },
                bgcolor: '#FFFFFF',
              },
              legend: { ...defaultLayout.legend, orientation: 'h', y: -0.1 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 4: Score Distribution by Sector */}
      {sectorAvgScores.length > 0 && (
        <ChartCard
          title="Revenue Quality by Sector"
          subtitle="Average composite score per sector · Bar = average, whiskers = min/max range"
          csvData={{
            filename: 'revenue-quality-by-sector',
            headers: ['Sector', 'AvgScore', 'MedianScore', 'MinScore', 'MaxScore', 'Count'],
            rows: sectorAvgScores.map(s => [s.sector, s.avg.toFixed(1), s.median.toFixed(1), s.min.toFixed(1), s.max.toFixed(1), s.count]),
          }}
        >
          <Plot
            data={[
              {
                x: sectorAvgScores.map(s => s.sector),
                y: sectorAvgScores.map(s => s.avg),
                type: 'bar',
                marker: {
                  color: sectorAvgScores.map(s => getScoreColor(s.avg)),
                },
                text: sectorAvgScores.map(s => `${s.avg.toFixed(0)} (n=${s.count})`),
                textposition: 'outside',
                textfont: { size: 10, color: '#7A7A7A' },
                hovertemplate: '%{x}<br>Avg: %{y:.1f}<extra></extra>',
              },
              // Error bars showing min-max range
              {
                x: sectorAvgScores.map(s => s.sector),
                y: sectorAvgScores.map(s => s.avg),
                error_y: {
                  type: 'data',
                  symmetric: false,
                  array: sectorAvgScores.map(s => s.max - s.avg),
                  arrayminus: sectorAvgScores.map(s => s.avg - s.min),
                  color: '#7A7A7A',
                  thickness: 1.5,
                  width: 6,
                },
                type: 'scatter',
                mode: 'markers',
                marker: { size: 0.1, color: 'transparent' },
                showlegend: false,
                hoverinfo: 'skip',
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 400,
              xaxis: { ...defaultLayout.xaxis, tickangle: -25, type: 'category' },
              yaxis: { ...defaultLayout.yaxis, title: 'Revenue Quality Score', range: [0, 100] },
              showlegend: false,
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 5: Quality Score vs 30d Price Change */}
      {priceProtocols.length > 5 && (
        <ChartCard
          title="Revenue Quality vs 30-Day Price Change"
          subtitle="Does quality predict returns? Upper-right = high quality + price appreciation"
        >
          <Plot
            data={[
              // Quadrant dividers
              {
                x: [50, 50], y: [-80, 80],
                mode: 'lines',
                line: { color: '#E5E3E0', width: 1, dash: 'dash' },
                hoverinfo: 'skip', showlegend: false,
              },
              {
                x: [0, 100], y: [0, 0],
                mode: 'lines',
                line: { color: '#E5E3E0', width: 1, dash: 'dash' },
                hoverinfo: 'skip', showlegend: false,
              },
              // Data points
              {
                x: priceProtocols.map(p => p.composite),
                y: priceProtocols.map(p => p.priceChange30d),
                text: priceProtocols.map(p =>
                  `${p.name}<br>Score: ${p.composite.toFixed(0)}<br>30d: ${p.priceChange30d >= 0 ? '+' : ''}${p.priceChange30d.toFixed(1)}%<br>Rev: ${formatCurrency(p.annRevenue)}/yr`
                ),
                mode: 'markers+text',
                textposition: 'top center',
                textfont: { size: 8, color: '#9CA3AF' },
                type: 'scatter',
                marker: {
                  color: priceProtocols.map(p => getScoreColor(p.composite)),
                  size: priceProtocols.map(p => Math.max(8, Math.min(30, Math.sqrt(p.annRevenue / 1e5) * 2))),
                  opacity: 0.75,
                  line: { width: 1, color: '#FFF' },
                },
                hovertemplate: '%{text}<extra></extra>',
                showlegend: false,
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 500,
              xaxis: { ...defaultLayout.xaxis, title: 'Revenue Quality Score', range: [0, 100] },
              yaxis: { ...defaultLayout.yaxis, title: '30-Day Price Change (%)' },
              annotations: [
                { x: 75, y: 30, text: '✅ Quality + Returns', showarrow: false, font: { size: 11, color: '#7A7A7A' } },
                { x: 25, y: 30, text: '🎰 Low Quality Rally', showarrow: false, font: { size: 11, color: '#7A7A7A' } },
                { x: 75, y: -30, text: '🔍 Quality Mispriced?', showarrow: false, font: { size: 11, color: '#7A7A7A' } },
                { x: 25, y: -30, text: '⚠️ Deserved Decline', showarrow: false, font: { size: 11, color: '#7A7A7A' } },
              ],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}
    </div>
  )
}
