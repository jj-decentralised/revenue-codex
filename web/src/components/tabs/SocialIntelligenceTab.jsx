import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatNumber, formatPercent } from '../../utils/helpers'

// Tokens to track — mix of L1s, DeFi blue chips, and trending narratives
const TRACKED_TOKENS = [
  { slug: 'bitcoin', symbol: 'BTC' },
  { slug: 'ethereum', symbol: 'ETH' },
  { slug: 'solana', symbol: 'SOL' },
  { slug: 'uniswap', symbol: 'UNI' },
  { slug: 'aave', symbol: 'AAVE' },
  { slug: 'chainlink', symbol: 'LINK' },
  { slug: 'arbitrum', symbol: 'ARB' },
  { slug: 'optimism', symbol: 'OP' },
  { slug: 'celestia', symbol: 'TIA' },
  { slug: 'sui', symbol: 'SUI' },
  { slug: 'near', symbol: 'NEAR' },
  { slug: 'pepe', symbol: 'PEPE' },
]

function getDateRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 90) // 90 days for heatmap
  return { from: from.toISOString(), to: to.toISOString() }
}

async function fetchSantimentMetric(metric, slug, from, to) {
  const query = `
    query GetMetric($slug: String!, $from: DateTime!, $to: DateTime!) {
      getMetric(metric: "${metric}") {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") {
          datetime
          value
        }
      }
    }
  `
  const response = await fetch('/api/santiment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { slug, from, to } }),
  })
  if (!response.ok) throw new Error(`Santiment ${response.status}`)
  const data = await response.json()
  return data?.data?.getMetric?.timeseriesData || []
}

async function fetchSentimentPair(slug, from, to) {
  const query = `
    query GetSentiment($slug: String!, $from: DateTime!, $to: DateTime!) {
      positive: getMetric(metric: "sentiment_positive_total") {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") { datetime value }
      }
      negative: getMetric(metric: "sentiment_negative_total") {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") { datetime value }
      }
    }
  `
  const response = await fetch('/api/santiment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { slug, from, to } }),
  })
  if (!response.ok) throw new Error(`Santiment ${response.status}`)
  const data = await response.json()
  return {
    positive: data?.data?.positive?.timeseriesData || [],
    negative: data?.data?.negative?.timeseriesData || [],
  }
}

async function fetchAllSocialData() {
  const { from, to } = getDateRange()

  // Test if Santiment is configured
  try {
    const testResponse = await fetch('/api/santiment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }', variables: {} }),
    })
    if (testResponse.status === 401 || testResponse.status === 403 || testResponse.status === 500) {
      return { notConfigured: true }
    }
  } catch {
    return { notConfigured: true }
  }

  // Fetch social volume for all tokens
  const socialPromises = TRACKED_TOKENS.map(t =>
    fetchSantimentMetric('social_volume_total', t.slug, from, to).catch(() => [])
  )

  // Fetch sentiment for top 4 tokens (BTC, ETH, SOL, UNI)
  const sentimentSlugs = ['bitcoin', 'ethereum', 'solana', 'uniswap']
  const sentimentPromises = sentimentSlugs.map(slug =>
    fetchSentimentPair(slug, from, to).catch(() => ({ positive: [], negative: [] }))
  )

  // Fetch BTC price for overlay
  const btcPricePromise = fetch('/api/coingecko?action=coin_chart&coin_id=bitcoin&days=90')
    .then(r => r.ok ? r.json() : null)
    .catch(() => null)

  // Fetch CoinGecko markets for price changes
  const marketsPromise = fetch('/api/coingecko?action=markets')
    .then(r => r.ok ? r.json() : [])
    .catch(() => [])

  const [socialResults, sentimentResults, btcChart, markets] = await Promise.all([
    Promise.allSettled(socialPromises),
    Promise.allSettled(sentimentPromises),
    btcPricePromise,
    marketsPromise,
  ])

  const socialData = {}
  TRACKED_TOKENS.forEach((t, i) => {
    socialData[t.slug] = socialResults[i]?.status === 'fulfilled' ? socialResults[i].value : []
  })

  const sentimentData = {}
  sentimentSlugs.forEach((slug, i) => {
    sentimentData[slug] = sentimentResults[i]?.status === 'fulfilled' ? sentimentResults[i].value : { positive: [], negative: [] }
  })

  const hasAnyData = Object.values(socialData).some(arr => arr.length > 0)
  if (!hasAnyData) return { notConfigured: true }

  return { socialData, sentimentData, btcChart, markets }
}

export default function SocialIntelligenceTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAllSocialData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const processed = useMemo(() => {
    if (!data || data.notConfigured) return null

    const { socialData, sentimentData, btcChart, markets } = data
    const btcPrices = btcChart?.prices || []

    // Build market lookup
    const marketLookup = {}
    ;(markets || []).forEach(m => {
      if (m.id) marketLookup[m.id] = m
      if (m.symbol) marketLookup[m.symbol.toLowerCase()] = m
    })

    // === Chart 1: Social Volume Heatmap ===
    // Aggregate daily social volume into weekly buckets
    const weeks = []
    const now = new Date()
    for (let i = 12; i >= 0; i--) {
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - i * 7)
      weeks.push(weekStart.toISOString().split('T')[0])
    }

    const heatmapZ = []
    const heatmapY = []
    TRACKED_TOKENS.forEach(t => {
      const series = socialData[t.slug] || []
      if (series.length === 0) return
      heatmapY.push(t.symbol)
      const dateMap = {}
      series.forEach(d => { dateMap[d.datetime.split('T')[0]] = d.value })

      const weekValues = weeks.map((weekStart, wi) => {
        const nextWeek = weeks[wi + 1] || new Date().toISOString().split('T')[0]
        let sum = 0
        let count = 0
        Object.entries(dateMap).forEach(([date, val]) => {
          if (date >= weekStart && date < nextWeek) { sum += val; count++ }
        })
        return count > 0 ? sum / count : 0
      })
      heatmapZ.push(weekValues)
    })

    // Normalize each row to 0-1 for consistent color scale
    const normalizedZ = heatmapZ.map(row => {
      const max = Math.max(...row, 1)
      return row.map(v => v / max)
    })

    // === Chart 2: Sentiment Ratio Time Series ===
    const sentimentTraces = Object.entries(sentimentData)
      .filter(([_, data]) => data.positive.length > 0)
      .map(([slug, data]) => {
        const token = TRACKED_TOKENS.find(t => t.slug === slug) || { symbol: slug }
        const posMap = {}
        data.positive.forEach(d => { posMap[d.datetime.split('T')[0]] = d.value })
        const negMap = {}
        data.negative.forEach(d => { negMap[d.datetime.split('T')[0]] = d.value })

        const dates = [...new Set([...Object.keys(posMap), ...Object.keys(negMap)])].sort()
        const ratios = dates.map(d => {
          const pos = posMap[d] || 0
          const neg = negMap[d] || 0
          return pos + neg > 0 ? pos / (pos + neg) : 0.5
        })
        return { slug, symbol: token.symbol, dates, ratios }
      })

    // === Chart 3: Social Volume vs BTC Price ===
    const btcSocial = socialData['bitcoin'] || []
    const btcDateMap = {}
    btcPrices.forEach(([ts, price]) => {
      btcDateMap[new Date(ts).toISOString().split('T')[0]] = price
    })

    // === Chart 4: Sentiment-Price Divergence Scatter ===
    const divergencePoints = TRACKED_TOKENS.map(t => {
      const social = socialData[t.slug] || []
      const sentiment = sentimentData[t.slug]
      const market = marketLookup[t.slug] || marketLookup[t.symbol.toLowerCase()]

      // Avg social volume (last 7d vs prev 7d)
      const last7 = social.slice(-7)
      const prev7 = social.slice(-14, -7)
      const avgSocial7d = last7.length > 0 ? last7.reduce((s, d) => s + d.value, 0) / last7.length : 0
      const avgSocialPrev7d = prev7.length > 0 ? prev7.reduce((s, d) => s + d.value, 0) / prev7.length : 0
      const socialChange7d = avgSocialPrev7d > 0 ? ((avgSocial7d - avgSocialPrev7d) / avgSocialPrev7d) * 100 : 0

      // Avg sentiment ratio (last 7d)
      let avgSentiment = 0.5
      if (sentiment && sentiment.positive.length > 0) {
        const last7Pos = sentiment.positive.slice(-7)
        const last7Neg = sentiment.negative.slice(-7)
        const totalPos = last7Pos.reduce((s, d) => s + d.value, 0)
        const totalNeg = last7Neg.reduce((s, d) => s + d.value, 0)
        avgSentiment = totalPos + totalNeg > 0 ? totalPos / (totalPos + totalNeg) : 0.5
      }

      const priceChange7d = market?.price_change_percentage_7d_in_currency || 0

      return {
        symbol: t.symbol,
        slug: t.slug,
        avgSocial7d,
        socialChange7d,
        avgSentiment,
        priceChange7d,
        hasSentiment: !!sentiment && sentiment.positive.length > 0,
      }
    }).filter(p => p.avgSocial7d > 0)

    // === KPIs ===
    const btcSentimentData = sentimentData['bitcoin']
    let btcSentiment = null
    if (btcSentimentData?.positive.length > 0) {
      const last7Pos = btcSentimentData.positive.slice(-7).reduce((s, d) => s + d.value, 0)
      const last7Neg = btcSentimentData.negative.slice(-7).reduce((s, d) => s + d.value, 0)
      btcSentiment = last7Pos + last7Neg > 0 ? (last7Pos / (last7Pos + last7Neg)) * 100 : 50
    }

    const ethSentimentData = sentimentData['ethereum']
    let ethSentiment = null
    if (ethSentimentData?.positive.length > 0) {
      const last7Pos = ethSentimentData.positive.slice(-7).reduce((s, d) => s + d.value, 0)
      const last7Neg = ethSentimentData.negative.slice(-7).reduce((s, d) => s + d.value, 0)
      ethSentiment = last7Pos + last7Neg > 0 ? (last7Pos / (last7Pos + last7Neg)) * 100 : 50
    }

    // Most social volume (7d)
    const sortedBySocial = [...divergencePoints].sort((a, b) => b.avgSocial7d - a.avgSocial7d)
    const mostSocial = sortedBySocial[0]
    const biggestSpike = [...divergencePoints].sort((a, b) => b.socialChange7d - a.socialChange7d)[0]

    return {
      heatmapY, normalizedZ, weeks,
      sentimentTraces,
      btcSocial, btcDateMap,
      divergencePoints,
      btcSentiment, ethSentiment,
      mostSocial, biggestSpike,
    }
  }, [data])

  if (loading) return <LoadingSpinner message="Loading social intelligence from Santiment..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  if (data?.notConfigured) {
    return (
      <div className="text-center py-20">
        <div className="bg-amber-50 border border-amber-200 p-6 max-w-lg mx-auto">
          <h3 className="text-lg font-semibold text-amber-800 mb-2">Santiment API Not Configured</h3>
          <p className="text-sm text-amber-700">
            Configure <code className="bg-amber-100 px-1">SANTIMENT_API_KEY</code> in Vercel environment variables to enable social intelligence data.
          </p>
        </div>
      </div>
    )
  }

  if (!processed) return <div className="text-center py-20">No social data available</div>

  const {
    heatmapY, normalizedZ, weeks,
    sentimentTraces,
    btcSocial, btcDateMap,
    divergencePoints,
    btcSentiment, ethSentiment,
    mostSocial, biggestSpike,
  } = processed

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="BTC Sentiment"
          value={btcSentiment !== null ? `${btcSentiment.toFixed(0)}%` : '—'}
          subtitle="7d positive ratio"
          trend={btcSentiment !== null ? btcSentiment - 50 : undefined}
        />
        <KPICard
          title="ETH Sentiment"
          value={ethSentiment !== null ? `${ethSentiment.toFixed(0)}%` : '—'}
          subtitle="7d positive ratio"
          trend={ethSentiment !== null ? ethSentiment - 50 : undefined}
        />
        <KPICard
          title="Most Social (7d)"
          value={mostSocial?.symbol || '—'}
          subtitle={mostSocial ? `Avg: ${formatNumber(mostSocial.avgSocial7d)}` : ''}
        />
        <KPICard
          title="Biggest Spike"
          value={biggestSpike?.symbol || '—'}
          subtitle={biggestSpike ? `${biggestSpike.socialChange7d >= 0 ? '+' : ''}${biggestSpike.socialChange7d.toFixed(0)}% 7d` : ''}
          trend={biggestSpike?.socialChange7d}
        />
      </div>

      <NarrativeBox title="Reading Social Signals">
        <p>
          Social volume measures total mentions across crypto social channels. Sentiment ratio tracks the balance of positive vs negative mentions.
          Divergences between social volume/sentiment and price are key signals: rising social with flat price often precedes breakouts,
          while declining social during price rallies suggests the move lacks conviction. The heatmap reveals narrative rotation cycles.
        </p>
      </NarrativeBox>

      {/* Chart 1: Social Volume Heatmap */}
      {heatmapY.length > 0 && normalizedZ.length > 0 && (
        <ChartCard
          title="Social Volume Heatmap — Last 12 Weeks"
          subtitle="Row-normalized intensity · Bright = high social volume relative to that token's baseline · Shows narrative rotation"
        >
          <Plot
            data={[{
              z: normalizedZ,
              x: weeks.map(w => w.slice(5)), // MM-DD format
              y: heatmapY,
              type: 'heatmap',
              colorscale: [
                [0, '#FFFFFF'],
                [0.25, '#E8E4DF'],
                [0.5, '#9BBAD4'],
                [0.75, '#4A7FAF'],
                [1, '#1A3A5C'],
              ],
              showscale: true,
              colorbar: { title: 'Relative Volume', tickvals: [0, 0.5, 1], ticktext: ['Low', 'Med', 'High'] },
              hovertemplate: '%{y}<br>Week of %{x}<br>Intensity: %{z:.2f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: Math.max(300, heatmapY.length * 30 + 80),
              xaxis: { ...defaultLayout.xaxis, title: 'Week Starting', type: 'category' },
              yaxis: { ...defaultLayout.yaxis, type: 'category', autorange: 'reversed' },
              margin: { ...defaultLayout.margin, l: 60 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 2: Sentiment Ratio Time Series */}
      {sentimentTraces.length > 0 && (
        <ChartCard
          title="Sentiment Ratio Over Time"
          subtitle="Positive / (Positive + Negative) mentions · Above 0.5 = net positive sentiment · Below = net negative"
        >
          <Plot
            data={[
              // Neutral line at 0.5
              {
                x: sentimentTraces[0]?.dates || [],
                y: (sentimentTraces[0]?.dates || []).map(() => 0.5),
                mode: 'lines',
                line: { color: '#E5E3E0', width: 1, dash: 'dash' },
                name: 'Neutral',
                hoverinfo: 'skip',
              },
              ...sentimentTraces.map((t, i) => ({
                x: t.dates,
                y: t.ratios,
                type: 'scatter',
                mode: 'lines',
                name: t.symbol,
                line: { color: colors.palette[i % colors.palette.length], width: 2 },
                hovertemplate: `${t.symbol}<br>%{x}<br>Ratio: %{y:.2f}<extra></extra>`,
              })),
            ]}
            layout={{
              ...defaultLayout,
              height: 400,
              yaxis: { ...defaultLayout.yaxis, title: 'Sentiment Ratio', range: [0.3, 0.7] },
              legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 3: BTC Social Volume vs Price */}
      {btcSocial.length > 0 && (
        <ChartCard
          title="BTC Social Volume vs Price"
          subtitle="Social volume spikes often coincide with or precede major price moves"
          csvData={{
            filename: 'btc-social-vs-price',
            headers: ['Date', 'SocialVolume', 'BTCPrice'],
            rows: btcSocial.map(d => {
              const date = d.datetime.split('T')[0]
              return [date, d.value, btcDateMap[date] || '']
            }),
          }}
        >
          <Plot
            data={[
              {
                x: btcSocial.map(d => d.datetime.split('T')[0]),
                y: btcSocial.map(d => d.value),
                type: 'bar',
                name: 'Social Volume',
                marker: { color: colors.primary, opacity: 0.6 },
                yaxis: 'y',
                hovertemplate: '%{x}<br>Social: %{y:,.0f}<extra></extra>',
              },
              {
                x: btcSocial.map(d => d.datetime.split('T')[0]),
                y: btcSocial.map(d => btcDateMap[d.datetime.split('T')[0]] || null),
                type: 'scatter',
                mode: 'lines',
                name: 'BTC Price',
                line: { color: colors.warning, width: 2 },
                yaxis: 'y2',
                connectgaps: true,
                hovertemplate: '%{x}<br>BTC: $%{y:,.0f}<extra></extra>',
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 400,
              yaxis: { ...defaultLayout.yaxis, title: 'Social Volume', side: 'left' },
              yaxis2: {
                title: 'BTC Price (USD)',
                overlaying: 'y',
                side: 'right',
                gridcolor: 'transparent',
                tickfont: { size: 11, color: '#7A7A7A', family: 'Consolas, Courier New, monospace' },
              },
              legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
              barmode: 'overlay',
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 4: Sentiment-Price Divergence Scatter */}
      {divergencePoints.length > 3 && (
        <ChartCard
          title="Social Volume Change vs Price Change (7d)"
          subtitle="Tokens where social volume and price diverge — potential leading signals"
        >
          <Plot
            data={[
              // Quadrant dividers
              {
                x: [-100, 200], y: [0, 0],
                mode: 'lines',
                line: { color: '#E5E3E0', width: 1, dash: 'dash' },
                hoverinfo: 'skip', showlegend: false,
              },
              {
                x: [0, 0], y: [-50, 50],
                mode: 'lines',
                line: { color: '#E5E3E0', width: 1, dash: 'dash' },
                hoverinfo: 'skip', showlegend: false,
              },
              // Data points
              {
                x: divergencePoints.map(p => p.socialChange7d),
                y: divergencePoints.map(p => p.priceChange7d),
                text: divergencePoints.map(p => p.symbol),
                mode: 'markers+text',
                textposition: 'top center',
                textfont: { size: 11, color: '#4A4A4A' },
                type: 'scatter',
                marker: {
                  color: divergencePoints.map(p =>
                    p.socialChange7d > 0 && p.priceChange7d > 0 ? colors.success :
                    p.socialChange7d < 0 && p.priceChange7d < 0 ? colors.danger :
                    colors.warning
                  ),
                  size: divergencePoints.map(p => Math.max(10, Math.min(30, Math.sqrt(p.avgSocial7d) * 2))),
                  opacity: 0.8,
                  line: { width: 1, color: '#FFF' },
                },
                hovertemplate: divergencePoints.map(p =>
                  `${p.symbol}<br>Social 7d: ${p.socialChange7d >= 0 ? '+' : ''}${p.socialChange7d.toFixed(0)}%<br>Price 7d: ${p.priceChange7d >= 0 ? '+' : ''}${p.priceChange7d.toFixed(1)}%`
                ).map(t => t + '<extra></extra>'),
                showlegend: false,
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 450,
              xaxis: { ...defaultLayout.xaxis, title: 'Social Volume Change 7d (%)' },
              yaxis: { ...defaultLayout.yaxis, title: 'Price Change 7d (%)' },
              annotations: [
                { x: 80, y: 20, text: '🔥 Hype + Rally', showarrow: false, font: { size: 10, color: '#7A7A7A' } },
                { x: -50, y: 20, text: '🤫 Quiet Rally', showarrow: false, font: { size: 10, color: '#7A7A7A' } },
                { x: 80, y: -15, text: '📢 Hype No Price', showarrow: false, font: { size: 10, color: '#7A7A7A' } },
                { x: -50, y: -15, text: '💤 Forgotten', showarrow: false, font: { size: 10, color: '#7A7A7A' } },
              ],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 5: Narrative Momentum Table */}
      {divergencePoints.length > 0 && (
        <ChartCard
          title="Narrative Momentum Dashboard"
          subtitle="Current social metrics for tracked tokens · Sorted by social volume change"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-(--color-ink)">
                  <th className="text-left py-2 px-3 text-[11px] uppercase tracking-wider text-(--color-ink-muted) font-semibold">Token</th>
                  <th className="text-right py-2 px-3 text-[11px] uppercase tracking-wider text-(--color-ink-muted) font-semibold">Social Vol (7d avg)</th>
                  <th className="text-right py-2 px-3 text-[11px] uppercase tracking-wider text-(--color-ink-muted) font-semibold">Social Δ 7d</th>
                  <th className="text-right py-2 px-3 text-[11px] uppercase tracking-wider text-(--color-ink-muted) font-semibold">Sentiment</th>
                  <th className="text-right py-2 px-3 text-[11px] uppercase tracking-wider text-(--color-ink-muted) font-semibold">Price Δ 7d</th>
                  <th className="text-right py-2 px-3 text-[11px] uppercase tracking-wider text-(--color-ink-muted) font-semibold">Signal</th>
                </tr>
              </thead>
              <tbody>
                {[...divergencePoints]
                  .sort((a, b) => b.socialChange7d - a.socialChange7d)
                  .map((p, i) => {
                    // Classify signal
                    let signal = '—'
                    let signalColor = 'text-(--color-ink-muted)'
                    if (p.socialChange7d > 20 && p.priceChange7d < -5) {
                      signal = 'Divergence ↗↘'
                      signalColor = 'text-(--color-negative)'
                    } else if (p.socialChange7d < -20 && p.priceChange7d > 5) {
                      signal = 'Stealth ↘↗'
                      signalColor = 'text-(--color-positive)'
                    } else if (p.socialChange7d > 20 && p.priceChange7d > 5) {
                      signal = 'Momentum ↗↗'
                      signalColor = 'text-(--color-positive)'
                    } else if (p.socialChange7d < -20 && p.priceChange7d < -5) {
                      signal = 'Capitulation ↘↘'
                      signalColor = 'text-(--color-negative)'
                    }

                    return (
                      <tr key={p.symbol} className={`border-b border-(--color-rule) ${i % 2 === 0 ? '' : 'bg-(--color-paper-alt)'}`}>
                        <td className="py-2 px-3 font-mono font-medium text-(--color-ink)">{p.symbol}</td>
                        <td className="py-2 px-3 text-right font-mono">{formatNumber(p.avgSocial7d)}</td>
                        <td className={`py-2 px-3 text-right font-mono font-medium ${p.socialChange7d >= 0 ? 'text-(--color-positive)' : 'text-(--color-negative)'}`}>
                          {p.socialChange7d >= 0 ? '+' : ''}{p.socialChange7d.toFixed(0)}%
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {p.hasSentiment ? `${(p.avgSentiment * 100).toFixed(0)}%` : '—'}
                        </td>
                        <td className={`py-2 px-3 text-right font-mono font-medium ${p.priceChange7d >= 0 ? 'text-(--color-positive)' : 'text-(--color-negative)'}`}>
                          {p.priceChange7d >= 0 ? '+' : ''}{p.priceChange7d.toFixed(1)}%
                        </td>
                        <td className={`py-2 px-3 text-right font-mono text-xs ${signalColor}`}>{signal}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  )
}
