import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchSentimentData } from '../../services/api'
import { formatCurrency, formatPercent, percentile } from '../../utils/helpers'
import { sentimentNarrative } from '../../data/narratives'

export default function SentimentTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showStablecoins, setShowStablecoins] = useState(true)

  useEffect(() => {
    fetchSentimentData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading sentiment data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  const totalRevenue24h = data?.fees?.total24h || (data?.fees?.protocols || []).reduce((s, p) => s + (p.total24h || 0), 0)
  const fearGreedData = (data?.fearGreed || []).reverse() // chronological order

  // Fear & Greed time series
  const fgDates = fearGreedData.map(d => new Date(d.timestamp * 1000).toISOString().split('T')[0])
  const fgValues = fearGreedData.map(d => parseInt(d.value))

  // Current sentiment
  const currentFG = fgValues.length > 0 ? fgValues[fgValues.length - 1] : null
  const currentClassification = fearGreedData.length > 0 ? fearGreedData[fearGreedData.length - 1].value_classification : '—'
  const maxFG = Math.max(...fgValues)
  const sentimentDropFromATH = currentFG ? ((maxFG - currentFG) / maxFG * 100) : null

  // Identify stablecoin protocol names from categories
  const stablecoinCategories = new Set(['CDP', 'CDP Manager', 'Algo-Stables', 'Dual-Token Stablecoin', 'Stablecoin Issuer'])
  const stablecoinNames = new Set()
  ;(data?.fees?.protocols || []).forEach(p => {
    if (stablecoinCategories.has(p.category)) {
      stablecoinNames.add((p.name || '').toLowerCase())
    }
  })

  // Build daily revenue, optionally excluding stablecoin protocols
  const rawChart = data?.fees?.totalDataChart || []
  const breakdown = data?.fees?.totalDataChartBreakdown || []

  const feesHistory = (!showStablecoins && breakdown.length > 0)
    ? breakdown.map(entry => {
        const ts = Array.isArray(entry) ? entry[0] : 0
        const dayData = Array.isArray(entry) ? entry[1] : entry
        if (typeof dayData !== 'object' || dayData === null) return [ts, 0]
        let total = 0
        Object.entries(dayData).forEach(([key, val]) => {
          if (stablecoinNames.has(key.toLowerCase())) return
          const n = typeof val === 'number' ? val : (typeof val === 'object' && val !== null ? Object.values(val).find(v => typeof v === 'number') || 0 : 0)
          if (n > 0) total += n
        })
        return [ts, total]
      })
    : rawChart

  // Revenue percentile (approximate using fees data)
  const revenueValues = feesHistory.map(d => d[1])
  const currentRevenuePercentile = revenueValues.length > 0
    ? percentile(revenueValues, revenueValues[revenueValues.length - 1])
    : null

  // Scatter: monthly Fear & Greed vs revenue chart data points
  const chartDates = feesHistory.map(d => new Date(d[0] * 1000).toISOString().split('T')[0])
  const scatterPoints = feesHistory.map(d => {
    const dateStr = new Date(d[0] * 1000).toISOString().split('T')[0]
    const fgIdx = fgDates.findIndex(fd => fd === dateStr)
    return {
      date: dateStr,
      revenue: d[1],
      fg: fgIdx >= 0 ? fgValues[fgIdx] : null,
    }
  }).filter(p => p.fg !== null)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Fear & Greed Index"
          value={currentFG !== null ? `${currentFG}` : '—'}
          subtitle={currentClassification}
          trend={currentFG > 50 ? currentFG - 50 : -(50 - currentFG)}
        />
        <KPICard
          title="Sentiment Drop from ATH"
          value={sentimentDropFromATH !== null ? formatPercent(sentimentDropFromATH) : '—'}
          subtitle={`ATH: ${maxFG}`}
        />
        <KPICard
          title="Revenue (24h)"
          value={formatCurrency(totalRevenue24h)}
          subtitle="Protocol revenue"
        />
        <KPICard
          title="Revenue Percentile"
          value={currentRevenuePercentile !== null ? formatPercent(currentRevenuePercentile) : '—'}
          subtitle="vs all-time"
        />
      </div>

      {/* Headline divergence */}
      {currentRevenuePercentile !== null && sentimentDropFromATH !== null && (
        <div className="bg-white border border-(--color-border) rounded-lg p-5 text-center">
          <p className="text-lg font-semibold text-(--color-text)">
            Sentiment is <span className="text-(--color-danger)">{formatPercent(sentimentDropFromATH)}</span> off ATH
            while Revenue is in the <span className="text-(--color-success)">{formatPercent(currentRevenuePercentile)}</span> percentile
          </p>
          <p className="text-sm text-(--color-text-secondary) mt-1">This divergence mirrors the Energy sector in 2020–21</p>
        </div>
      )}

      {/* Dual-axis: Revenue bars + Fear & Greed line */}
      <ChartCard title="Revenue vs Sentiment" subtitle="Daily revenue (bars) overlaid with Fear & Greed Index (line)">
        <Plot
          data={[
            {
              x: chartDates,
              y: feesHistory.map(d => d[1]),
              type: 'bar',
              name: 'Daily Revenue',
              marker: { color: colors.primary, opacity: 0.6 },
              yaxis: 'y',
              hovertemplate: '$%{y:,.0f}<extra>Revenue</extra>',
            },
            {
              x: fgDates,
              y: fgValues,
              type: 'scatter',
              mode: 'lines',
              name: 'Fear & Greed',
              line: { color: colors.warning, width: 2 },
              yaxis: 'y2',
              hovertemplate: '%{y}<extra>Fear & Greed</extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            yaxis: { ...defaultLayout.yaxis, title: 'Daily Revenue (USD)', side: 'left' },
            yaxis2: {
              title: 'Fear & Greed Index',
              overlaying: 'y',
              side: 'right',
              range: [0, 100],
              gridcolor: 'transparent',
              tickfont: { size: 11, color: '#6B7280' },
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            barmode: 'overlay',
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Scatter: Revenue vs Sentiment — broken out by year */}
      {(() => {
        // Group scatter points by year
        const byYear = {}
        scatterPoints.forEach(p => {
          const year = p.date.slice(0, 4)
          if (!byYear[year]) byYear[year] = []
          byYear[year].push(p)
        })
        const years = Object.keys(byYear).sort()
        // Consistent y-axis across all years for comparison
        const maxRevenue = Math.max(...scatterPoints.map(p => p.revenue)) * 1.05

        // Compute yearly stats
        const yearStats = years.map(year => {
          const pts = byYear[year]
          const totalRev = pts.reduce((s, p) => s + p.revenue, 0)
          const avgRev = pts.length > 0 ? totalRev / pts.length : 0
          const avgFG = pts.length > 0 ? pts.reduce((s, p) => s + p.fg, 0) / pts.length : 0
          return { year, days: pts.length, avgRev, avgFG, totalRev }
        })

        return (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div>
                <h3 className="text-lg font-semibold text-(--color-text)">
                  Revenue–Sentiment Scatter by Year
                </h3>
                <p className="text-sm text-(--color-text-secondary) mt-0.5">
                  Each point is a day — X = Fear &amp; Greed, Y = Daily Revenue · Same scale across years
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-(--color-text-secondary) cursor-pointer">
                <input type="checkbox" checked={showStablecoins} onChange={e => setShowStablecoins(e.target.checked)} className="rounded" />
                Include Stablecoins
              </label>
            </div>

            {/* Yearly Summary Table */}
            <div className="bg-white border border-(--color-border) rounded-lg overflow-hidden">
              <div className="grid grid-cols-5 text-xs font-semibold text-(--color-text-secondary) bg-gray-50 px-4 py-2 border-b border-(--color-border)">
                <span>Year</span>
                <span className="text-right">Days</span>
                <span className="text-right">Avg Daily Revenue</span>
                <span className="text-right">Total Revenue</span>
                <span className="text-right">Avg F&amp;G</span>
              </div>
              {yearStats.map(s => (
                <div key={s.year} className="grid grid-cols-5 text-sm text-(--color-text) px-4 py-2 border-b border-(--color-border) last:border-b-0 hover:bg-gray-50">
                  <span className="font-medium">{s.year}</span>
                  <span className="text-right">{s.days}</span>
                  <span className="text-right font-medium">{formatCurrency(s.avgRev)}</span>
                  <span className="text-right">{formatCurrency(s.totalRev)}</span>
                  <span className="text-right">{s.avgFG.toFixed(0)}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {years.map(year => {
                const pts = byYear[year]
                const stats = yearStats.find(s => s.year === year)
                return (
                  <ChartCard key={year} title={year} subtitle={`${pts.length} days · Avg: ${formatCurrency(stats.avgRev)}/day`}>
                    <Plot
                      data={[
                        {
                          x: pts.map(p => p.fg),
                          y: pts.map(p => p.revenue),
                          text: pts.map(p => p.date),
                          mode: 'markers',
                          type: 'scatter',
                          marker: {
                            color: pts.map(p => p.fg),
                            colorscale: [[0, colors.danger], [0.5, colors.warning], [1, colors.success]],
                            size: 6,
                            opacity: 0.7,
                            cmin: 0,
                            cmax: 100,
                          },
                          hovertemplate: 'Date: %{text}<br>F&G: %{x}<br>Revenue: $%{y:,.0f}<extra></extra>',
                        },
                      ]}
                      layout={{
                        ...defaultLayout,
                        height: 350,
                        xaxis: { ...defaultLayout.xaxis, title: 'Fear & Greed Index', range: [0, 100], type: 'linear' },
                        yaxis: { ...defaultLayout.yaxis, title: 'Daily Revenue (USD)', range: [0, maxRevenue] },
                        margin: { ...defaultLayout.margin, t: 10 },
                        shapes: [
                          {
                            type: 'line', x0: 0, x1: 100, y0: stats.avgRev, y1: stats.avgRev,
                            line: { color: colors.primary, width: 1.5, dash: 'dash' },
                          },
                        ],
                        annotations: [
                          {
                            x: 95, y: stats.avgRev, text: `Avg: ${formatCurrency(stats.avgRev)}`,
                            showarrow: false, font: { size: 10, color: colors.primary }, yshift: 12,
                          },
                        ],
                      }}
                      config={defaultConfig}
                      className="w-full"
                    />
                  </ChartCard>
                )
              })}
            </div>
          </>
        )
      })()}

      {/* Fear & Greed historical */}
      <ChartCard title="Fear & Greed Index — Historical" subtitle="Crypto market sentiment over time">
        <Plot
          data={[{
            x: fgDates,
            y: fgValues,
            type: 'scatter',
            mode: 'lines',
            fill: 'tozeroy',
            line: { color: colors.warning, width: 1.5 },
            fillcolor: 'rgba(245,158,11,0.1)',
            hovertemplate: '%{x}<br>Index: %{y}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 300,
            yaxis: { ...defaultLayout.yaxis, range: [0, 100], title: 'Index' },
            shapes: [
              { type: 'line', x0: fgDates[0], x1: fgDates[fgDates.length - 1], y0: 50, y1: 50, line: { color: '#D1D5DB', dash: 'dash', width: 1 } },
              { type: 'line', x0: fgDates[0], x1: fgDates[fgDates.length - 1], y0: 25, y1: 25, line: { color: '#FEE2E2', dash: 'dot', width: 1 } },
              { type: 'line', x0: fgDates[0], x1: fgDates[fgDates.length - 1], y0: 75, y1: 75, line: { color: '#D1FAE5', dash: 'dot', width: 1 } },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      <NarrativeBox title={sentimentNarrative.title}>
        {sentimentNarrative.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>
    </div>
  )
}
