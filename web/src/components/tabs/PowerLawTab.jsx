import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/helpers'

// ============================================================================
// STATISTICAL FUNCTIONS
// ============================================================================

/**
 * Linear regression on log-log data to estimate power law exponent
 * For Zipf's law: y = C * x^(-α) => log(y) = log(C) - α * log(x)
 * Returns { alpha, intercept, rSquared }
 */
function fitPowerLaw(ranks, values) {
  // Filter out zeros and invalid values
  const validPairs = ranks
    .map((r, i) => ({ rank: r, value: values[i] }))
    .filter(p => p.rank > 0 && p.value > 0)
  
  if (validPairs.length < 3) return { alpha: null, intercept: null, rSquared: null }
  
  const logX = validPairs.map(p => Math.log10(p.rank))
  const logY = validPairs.map(p => Math.log10(p.value))
  
  const n = logX.length
  const sumX = logX.reduce((a, b) => a + b, 0)
  const sumY = logY.reduce((a, b) => a + b, 0)
  const sumXY = logX.reduce((sum, x, i) => sum + x * logY[i], 0)
  const sumX2 = logX.reduce((sum, x) => sum + x * x, 0)
  const sumY2 = logY.reduce((sum, y) => sum + y * y, 0)
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  
  // R-squared
  const meanY = sumY / n
  const ssTotal = logY.reduce((sum, y) => sum + (y - meanY) ** 2, 0)
  const ssResidual = logY.reduce((sum, y, i) => {
    const predicted = intercept + slope * logX[i]
    return sum + (y - predicted) ** 2
  }, 0)
  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0
  
  // Alpha is negative slope (since Zipf: y ~ x^(-α))
  return { alpha: -slope, intercept, rSquared }
}

/**
 * Calculate Gini coefficient for measuring inequality
 */
function calculateGini(values) {
  const sorted = [...values].filter(v => v > 0).sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return 0
  
  let sumOfDifferences = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumOfDifferences += Math.abs(sorted[i] - sorted[j])
    }
  }
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  return sumOfDifferences / (2 * n * n * mean)
}

/**
 * Build Lorenz curve data for Pareto analysis
 */
function buildLorenzCurve(values) {
  const sorted = [...values].filter(v => v > 0).sort((a, b) => b - a) // Descending
  const total = sorted.reduce((a, b) => a + b, 0)
  if (total === 0) return { x: [0, 100], y: [0, 100], thresholds: {} }
  
  const n = sorted.length
  const x = [0]
  const y = [0]
  let cumSum = 0
  
  const thresholds = { p80: null, p90: null, p95: null, p99: null }
  
  sorted.forEach((val, i) => {
    cumSum += val
    const xPercent = ((i + 1) / n) * 100
    const yPercent = (cumSum / total) * 100
    x.push(xPercent)
    y.push(yPercent)
    
    // Track what % of protocols generate 80%, 90%, 95%, 99% of value
    if (thresholds.p80 === null && yPercent >= 80) thresholds.p80 = xPercent
    if (thresholds.p90 === null && yPercent >= 90) thresholds.p90 = xPercent
    if (thresholds.p95 === null && yPercent >= 95) thresholds.p95 = xPercent
    if (thresholds.p99 === null && yPercent >= 99) thresholds.p99 = xPercent
  })
  
  return { x, y, thresholds }
}

/**
 * Calculate Herfindahl-Hirschman Index (HHI)
 */
function calculateHHI(values) {
  const total = values.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  
  return values.reduce((sum, v) => {
    const share = (v / total) * 100
    return sum + share * share
  }, 0)
}

/**
 * Calculate Spearman rank correlation coefficient
 */
function spearmanCorrelation(x, y) {
  if (x.length !== y.length || x.length < 3) return null
  
  const n = x.length
  
  // Create rank arrays
  const rankArray = (arr) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v)
    const ranks = new Array(n)
    sorted.forEach((item, rank) => { ranks[item.i] = rank + 1 })
    return ranks
  }
  
  const rankX = rankArray(x)
  const rankY = rankArray(y)
  
  // Calculate sum of squared differences
  let sumD2 = 0
  for (let i = 0; i < n; i++) {
    sumD2 += (rankX[i] - rankY[i]) ** 2
  }
  
  // Spearman's rho
  return 1 - (6 * sumD2) / (n * (n * n - 1))
}

/**
 * Histogram bins for log-transformed data
 */
function createLogHistogram(values, numBins = 30) {
  const filtered = values.filter(v => v > 0)
  if (filtered.length === 0) return { bins: [], counts: [] }
  
  const logValues = filtered.map(v => Math.log10(v))
  const min = Math.min(...logValues)
  const max = Math.max(...logValues)
  const binWidth = (max - min) / numBins
  
  const bins = []
  const counts = []
  
  for (let i = 0; i < numBins; i++) {
    const binStart = min + i * binWidth
    const binEnd = binStart + binWidth
    bins.push((binStart + binEnd) / 2)
    counts.push(0)
  }
  
  logValues.forEach(v => {
    const binIndex = Math.min(Math.floor((v - min) / binWidth), numBins - 1)
    if (binIndex >= 0 && binIndex < numBins) counts[binIndex]++
  })
  
  return { bins, counts, min, max }
}

/**
 * Generate normal distribution curve for overlay
 */
function normalDistribution(x, mean, stdDev, scale) {
  const variance = stdDev * stdDev
  return scale * Math.exp(-((x - mean) ** 2) / (2 * variance)) / (stdDev * Math.sqrt(2 * Math.PI))
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PowerLawTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      const results = await Promise.allSettled([
        fetch('https://api.llama.fi/protocols').then(r => r.ok ? r.json() : null),
        fetch('https://api.llama.fi/overview/fees?excludeTotalDataChartBreakdown=false').then(r => r.ok ? r.json() : null),
        fetch('/api/coingecko?action=markets').then(r => r.ok ? r.json() : null),
      ])

      const getValue = (idx) => results[idx]?.status === 'fulfilled' ? results[idx].value : null

      setData({
        protocols: getValue(0),
        feesOverview: getValue(1),
        markets: getValue(2),
      })
    }

    fetchData()
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading power law analysis data..." />
  if (error && !data) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  // ============================================================================
  // DATA EXTRACTION
  // ============================================================================
  
  const protocols = data?.protocols || []
  const feesOverview = data?.feesOverview || {}
  const feeProtocols = feesOverview?.protocols || []
  const totalDataChartBreakdown = feesOverview?.totalDataChartBreakdown || []
  const markets = data?.markets || []

  // Extract revenues (daily fees * 365 for annualized)
  const protocolRevenues = feeProtocols
    .filter(p => p.total24h > 0)
    .map(p => ({
      name: p.displayName || p.name,
      revenue: (p.total24h || 0) * 365,
      dailyRevenue: p.total24h || 0,
      tvl: p.tvl || 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // Extract TVLs
  const protocolTvls = protocols
    .filter(p => p.tvl > 0)
    .map(p => ({
      name: p.name,
      tvl: p.tvl,
      mcap: p.mcap || 0,
    }))
    .sort((a, b) => b.tvl - a.tvl)

  // Extract market caps
  const protocolMcaps = markets
    .filter(m => m.market_cap > 0)
    .map(m => ({
      name: m.name,
      symbol: m.symbol?.toUpperCase(),
      mcap: m.market_cap,
    }))
    .sort((a, b) => b.mcap - a.mcap)

  // ============================================================================
  // ZIPF PLOT DATA - REVENUE
  // ============================================================================
  
  const revenueRanks = protocolRevenues.map((_, i) => i + 1)
  const revenueValues = protocolRevenues.map(p => p.revenue)
  const revenueFit = fitPowerLaw(revenueRanks, revenueValues)
  
  // Generate fitted line for revenue
  const revenueFittedLine = revenueRanks.map(r => 
    revenueFit.intercept !== null ? Math.pow(10, revenueFit.intercept - revenueFit.alpha * Math.log10(r)) : null
  )

  // ============================================================================
  // ZIPF PLOT DATA - MARKET CAP
  // ============================================================================
  
  const mcapRanks = protocolMcaps.map((_, i) => i + 1)
  const mcapValues = protocolMcaps.map(p => p.mcap)
  const mcapFit = fitPowerLaw(mcapRanks, mcapValues)
  
  const mcapFittedLine = mcapRanks.map(r =>
    mcapFit.intercept !== null ? Math.pow(10, mcapFit.intercept - mcapFit.alpha * Math.log10(r)) : null
  )

  // ============================================================================
  // ZIPF PLOT DATA - TVL
  // ============================================================================
  
  const tvlRanks = protocolTvls.map((_, i) => i + 1)
  const tvlValues = protocolTvls.map(p => p.tvl)
  const tvlFit = fitPowerLaw(tvlRanks, tvlValues)
  
  const tvlFittedLine = tvlRanks.map(r =>
    tvlFit.intercept !== null ? Math.pow(10, tvlFit.intercept - tvlFit.alpha * Math.log10(r)) : null
  )

  // ============================================================================
  // PARETO / LORENZ CURVE
  // ============================================================================
  
  const lorenzRevenue = buildLorenzCurve(revenueValues)
  const giniRevenue = calculateGini(revenueValues)
  
  // Compare to S&P 500 typical Gini (~0.7 for revenue concentration)
  const sp500Gini = 0.70

  // ============================================================================
  // CONCENTRATION OVER TIME (HHI)
  // ============================================================================
  
  const hhiTimeSeries = []
  if (totalDataChartBreakdown.length > 0) {
    // Sample every 7th data point to reduce noise
    for (let i = 0; i < totalDataChartBreakdown.length; i += 7) {
      const entry = totalDataChartBreakdown[i]
      const ts = entry[0]
      const breakdown = entry[1] || {}
      const values = Object.values(breakdown).filter(v => v > 0)
      if (values.length > 0) {
        hhiTimeSeries.push({
          date: new Date(ts * 1000).toISOString().split('T')[0],
          hhi: calculateHHI(values),
          topShare: values.length > 0 ? (Math.max(...values) / values.reduce((a, b) => a + b, 0)) * 100 : 0,
        })
      }
    }
  }

  // ============================================================================
  // LOG-NORMAL VS POWER LAW (Histogram)
  // ============================================================================
  
  const revenueHistogram = createLogHistogram(revenueValues.filter(v => v > 0), 25)
  
  // Fit normal to log-transformed data
  const logRevenues = revenueValues.filter(v => v > 0).map(v => Math.log10(v))
  const logMean = logRevenues.reduce((a, b) => a + b, 0) / logRevenues.length
  const logStdDev = Math.sqrt(logRevenues.reduce((sum, v) => sum + (v - logMean) ** 2, 0) / logRevenues.length)
  
  // Generate normal overlay
  const normalOverlay = revenueHistogram.bins.map(x => ({
    x,
    y: normalDistribution(x, logMean, logStdDev, revenueValues.length * ((revenueHistogram.max - revenueHistogram.min) / 25)),
  }))

  // ============================================================================
  // REVENUE RANK vs TVL RANK
  // ============================================================================
  
  // Match protocols by name to compare ranks
  const matchedProtocols = []
  const revenueByName = {}
  protocolRevenues.forEach((p, i) => {
    revenueByName[p.name.toLowerCase()] = { rank: i + 1, revenue: p.revenue }
  })
  
  const tvlByName = {}
  protocolTvls.forEach((p, i) => {
    tvlByName[p.name.toLowerCase()] = { rank: i + 1, tvl: p.tvl }
  })
  
  Object.keys(revenueByName).forEach(name => {
    if (tvlByName[name]) {
      matchedProtocols.push({
        name,
        revenueRank: revenueByName[name].rank,
        tvlRank: tvlByName[name].rank,
        revenue: revenueByName[name].revenue,
        tvl: tvlByName[name].tvl,
      })
    }
  })
  
  const spearmanRho = spearmanCorrelation(
    matchedProtocols.map(p => p.revenueRank),
    matchedProtocols.map(p => p.tvlRank)
  )

  // ============================================================================
  // EXPONENT COMPARISON
  // ============================================================================
  
  const exponents = [
    { name: 'Revenue', alpha: revenueFit.alpha, rSquared: revenueFit.rSquared },
    { name: 'Market Cap', alpha: mcapFit.alpha, rSquared: mcapFit.rSquared },
    { name: 'TVL', alpha: tvlFit.alpha, rSquared: tvlFit.rSquared },
  ].filter(e => e.alpha !== null)
  
  // Reference power laws
  const references = [
    { name: "Zipf's Law (cities)", alpha: 1.0 },
    { name: 'City populations', alpha: 1.16 },
    { name: 'Pareto (wealth)', alpha: 1.16 },
    { name: 'Word frequency', alpha: 1.0 },
    { name: 'Web traffic', alpha: 2.0 },
  ]

  // Current HHI
  const currentHHI = calculateHHI(revenueValues)
  const hhiClassification = currentHHI > 2500 ? 'Highly Concentrated' : currentHHI > 1500 ? 'Moderately Concentrated' : 'Competitive'

  // Average crypto exponent
  const avgCryptoAlpha = exponents.length > 0 
    ? exponents.reduce((sum, e) => sum + e.alpha, 0) / exponents.length 
    : null

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Revenue α"
          value={revenueFit.alpha !== null ? revenueFit.alpha.toFixed(2) : '—'}
          subtitle={`R² = ${revenueFit.rSquared !== null ? revenueFit.rSquared.toFixed(3) : '—'}`}
        />
        <KPICard
          title="Market Cap α"
          value={mcapFit.alpha !== null ? mcapFit.alpha.toFixed(2) : '—'}
          subtitle={`R² = ${mcapFit.rSquared !== null ? mcapFit.rSquared.toFixed(3) : '—'}`}
        />
        <KPICard
          title="Gini Coefficient"
          value={giniRevenue.toFixed(3)}
          subtitle={giniRevenue > sp500Gini ? 'More concentrated than S&P 500' : 'Less concentrated than S&P 500'}
        />
        <KPICard
          title="Revenue HHI"
          value={currentHHI.toFixed(0)}
          subtitle={hhiClassification}
        />
      </div>

      {/* Zipf Plot - Revenue */}
      <ChartCard 
        title="Zipf Plot — Protocol Revenue" 
        subtitle={`Rank vs annualized revenue (log-log) · α = ${revenueFit.alpha?.toFixed(2) || '—'} · Zipf's law predicts α ≈ 1.0`}
      >
        <Plot
          data={[
            {
              x: revenueRanks,
              y: revenueValues,
              type: 'scatter',
              mode: 'markers',
              name: 'Protocols',
              text: protocolRevenues.map(p => p.name),
              marker: {
                color: colors.primary,
                size: 8,
                opacity: 0.7,
              },
              hovertemplate: '%{text}<br>Rank: %{x}<br>Revenue: $%{y:,.0f}<extra></extra>',
            },
            {
              x: revenueRanks,
              y: revenueFittedLine,
              type: 'scatter',
              mode: 'lines',
              name: `Power Law Fit (α=${revenueFit.alpha?.toFixed(2) || '—'})`,
              line: { color: colors.danger, width: 2, dash: 'dash' },
              hoverinfo: 'skip',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Rank', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'Annualized Revenue (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            annotations: [{
              x: 0.98, y: 0.98, xref: 'paper', yref: 'paper', showarrow: false,
              text: `α = ${revenueFit.alpha?.toFixed(2) || '—'} (R² = ${revenueFit.rSquared?.toFixed(3) || '—'})`,
              font: { size: 12, color: colors.danger },
              xanchor: 'right', bgcolor: 'rgba(255,255,255,0.9)', borderpad: 4,
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Zipf Plot - Market Cap */}
      <ChartCard 
        title="Zipf Plot — Market Cap" 
        subtitle={`Rank vs market cap (log-log) · α = ${mcapFit.alpha?.toFixed(2) || '—'}`}
      >
        <Plot
          data={[
            {
              x: mcapRanks.slice(0, 200),
              y: mcapValues.slice(0, 200),
              type: 'scatter',
              mode: 'markers',
              name: 'Tokens',
              text: protocolMcaps.slice(0, 200).map(p => `${p.name} (${p.symbol})`),
              marker: {
                color: colors.secondary,
                size: 7,
                opacity: 0.7,
              },
              hovertemplate: '%{text}<br>Rank: %{x}<br>MCap: $%{y:,.0f}<extra></extra>',
            },
            {
              x: mcapRanks.slice(0, 200),
              y: mcapFittedLine.slice(0, 200),
              type: 'scatter',
              mode: 'lines',
              name: `Power Law Fit (α=${mcapFit.alpha?.toFixed(2) || '—'})`,
              line: { color: colors.danger, width: 2, dash: 'dash' },
              hoverinfo: 'skip',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Rank', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'Market Cap (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            annotations: [{
              x: 0.98, y: 0.98, xref: 'paper', yref: 'paper', showarrow: false,
              text: `α = ${mcapFit.alpha?.toFixed(2) || '—'} (R² = ${mcapFit.rSquared?.toFixed(3) || '—'})`,
              font: { size: 12, color: colors.danger },
              xanchor: 'right', bgcolor: 'rgba(255,255,255,0.9)', borderpad: 4,
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Zipf Plot - TVL */}
      <ChartCard 
        title="Zipf Plot — Total Value Locked" 
        subtitle={`Rank vs TVL (log-log) · α = ${tvlFit.alpha?.toFixed(2) || '—'}`}
      >
        <Plot
          data={[
            {
              x: tvlRanks.slice(0, 200),
              y: tvlValues.slice(0, 200),
              type: 'scatter',
              mode: 'markers',
              name: 'Protocols',
              text: protocolTvls.slice(0, 200).map(p => p.name),
              marker: {
                color: colors.success,
                size: 7,
                opacity: 0.7,
              },
              hovertemplate: '%{text}<br>Rank: %{x}<br>TVL: $%{y:,.0f}<extra></extra>',
            },
            {
              x: tvlRanks.slice(0, 200),
              y: tvlFittedLine.slice(0, 200),
              type: 'scatter',
              mode: 'lines',
              name: `Power Law Fit (α=${tvlFit.alpha?.toFixed(2) || '—'})`,
              line: { color: colors.danger, width: 2, dash: 'dash' },
              hoverinfo: 'skip',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Rank', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'TVL (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            annotations: [{
              x: 0.98, y: 0.98, xref: 'paper', yref: 'paper', showarrow: false,
              text: `α = ${tvlFit.alpha?.toFixed(2) || '—'} (R² = ${tvlFit.rSquared?.toFixed(3) || '—'})`,
              font: { size: 12, color: colors.danger },
              xanchor: 'right', bgcolor: 'rgba(255,255,255,0.9)', borderpad: 4,
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Exponent Comparison */}
      <ChartCard 
        title="Power Law Exponent Comparison" 
        subtitle="Crypto metrics vs known power laws · Lower α = more extreme concentration"
      >
        <Plot
          data={[
            {
              x: [...exponents.map(e => `Crypto ${e.name}`), ...references.map(r => r.name)],
              y: [...exponents.map(e => e.alpha), ...references.map(r => r.alpha)],
              type: 'bar',
              marker: {
                color: [
                  ...exponents.map(() => colors.primary),
                  ...references.map(() => colors.slate),
                ],
              },
              hovertemplate: '%{x}<br>α = %{y:.2f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            yaxis: { ...defaultLayout.yaxis, title: 'Exponent (α)' },
            annotations: [{
              x: 0.5, y: 1.05, xref: 'paper', yref: 'paper', showarrow: false,
              text: 'Lower α = Winner-takes-most dynamics',
              font: { size: 11, color: colors.slate },
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Pareto / Lorenz Curve */}
      <ChartCard 
        title="Pareto Analysis — Lorenz Curve" 
        subtitle={`Gini = ${giniRevenue.toFixed(3)} · ${lorenzRevenue.thresholds.p80?.toFixed(1) || '—'}% of protocols generate 80% of revenue`}
      >
        <Plot
          data={[
            {
              x: lorenzRevenue.x,
              y: lorenzRevenue.y,
              type: 'scatter',
              mode: 'lines',
              name: 'Actual Distribution',
              line: { color: colors.primary, width: 2 },
              fill: 'tozeroy',
              fillcolor: 'rgba(37,99,235,0.15)',
              hovertemplate: '%{x:.1f}% of protocols<br>generate %{y:.1f}% of revenue<extra></extra>',
            },
            {
              x: [0, 100],
              y: [0, 100],
              type: 'scatter',
              mode: 'lines',
              name: 'Perfect Equality',
              line: { color: colors.slate, width: 1, dash: 'dash' },
              hoverinfo: 'skip',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Cumulative % of Protocols', range: [0, 100] },
            yaxis: { ...defaultLayout.yaxis, title: 'Cumulative % of Revenue', range: [0, 100] },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            shapes: [
              // 80% threshold
              { type: 'line', x0: 0, x1: lorenzRevenue.thresholds.p80 || 0, y0: 80, y1: 80, line: { color: colors.warning, width: 1, dash: 'dot' } },
              { type: 'line', x0: lorenzRevenue.thresholds.p80 || 0, x1: lorenzRevenue.thresholds.p80 || 0, y0: 0, y1: 80, line: { color: colors.warning, width: 1, dash: 'dot' } },
            ],
            annotations: [
              { x: 80, y: 20, text: `Gini: ${giniRevenue.toFixed(3)}`, showarrow: false, font: { size: 14, color: colors.primary } },
              { 
                x: (lorenzRevenue.thresholds.p80 || 0) + 5, y: 85, 
                text: `80% revenue from ${lorenzRevenue.thresholds.p80?.toFixed(1) || '—'}%`, 
                showarrow: false, font: { size: 10, color: colors.warning }, xanchor: 'left' 
              },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Concentration Thresholds */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="80% of Revenue"
          value={`${lorenzRevenue.thresholds.p80?.toFixed(1) || '—'}%`}
          subtitle="of protocols"
        />
        <KPICard
          title="90% of Revenue"
          value={`${lorenzRevenue.thresholds.p90?.toFixed(1) || '—'}%`}
          subtitle="of protocols"
        />
        <KPICard
          title="95% of Revenue"
          value={`${lorenzRevenue.thresholds.p95?.toFixed(1) || '—'}%`}
          subtitle="of protocols"
        />
        <KPICard
          title="S&P 500 Gini"
          value={sp500Gini.toFixed(2)}
          subtitle={giniRevenue > sp500Gini ? 'Crypto is more concentrated' : 'Crypto is less concentrated'}
        />
      </div>

      {/* Concentration Over Time */}
      {hhiTimeSeries.length > 0 && (
        <ChartCard 
          title="Concentration Over Time — Herfindahl Index" 
          subtitle="Is crypto becoming more or less concentrated?"
        >
          <Plot
            data={[
              {
                x: hhiTimeSeries.map(d => d.date),
                y: hhiTimeSeries.map(d => d.hhi),
                type: 'scatter',
                mode: 'lines',
                name: 'HHI',
                line: { color: colors.primary, width: 2 },
                fill: 'tozeroy',
                fillcolor: 'rgba(37,99,235,0.1)',
                hovertemplate: '%{x}<br>HHI: %{y:.0f}<extra></extra>',
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 400,
              yaxis: { ...defaultLayout.yaxis, title: 'Herfindahl-Hirschman Index' },
              shapes: [
                { type: 'line', x0: hhiTimeSeries[0]?.date, x1: hhiTimeSeries[hhiTimeSeries.length - 1]?.date, y0: 2500, y1: 2500, line: { color: colors.danger, width: 1, dash: 'dot' } },
                { type: 'line', x0: hhiTimeSeries[0]?.date, x1: hhiTimeSeries[hhiTimeSeries.length - 1]?.date, y0: 1500, y1: 1500, line: { color: colors.warning, width: 1, dash: 'dot' } },
              ],
              annotations: [
                { x: hhiTimeSeries[hhiTimeSeries.length - 1]?.date, y: 2500, text: 'Highly Concentrated', xanchor: 'right', showarrow: false, font: { size: 10, color: colors.danger } },
                { x: hhiTimeSeries[hhiTimeSeries.length - 1]?.date, y: 1500, text: 'Moderately Concentrated', xanchor: 'right', showarrow: false, font: { size: 10, color: colors.warning } },
              ],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Log-Normal vs Power Law */}
      <ChartCard 
        title="Distribution Analysis — Log(Revenue)" 
        subtitle="If bell-shaped → log-normal; if heavy-tailed → power law"
      >
        <Plot
          data={[
            {
              x: revenueHistogram.bins,
              y: revenueHistogram.counts,
              type: 'bar',
              name: 'Observed',
              marker: { color: colors.primary, opacity: 0.7 },
              hovertemplate: 'log₁₀(revenue) ≈ %{x:.1f}<br>Count: %{y}<extra></extra>',
            },
            {
              x: normalOverlay.map(d => d.x),
              y: normalOverlay.map(d => d.y),
              type: 'scatter',
              mode: 'lines',
              name: 'Normal Fit',
              line: { color: colors.danger, width: 2 },
              hoverinfo: 'skip',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, title: 'log₁₀(Revenue)' },
            yaxis: { ...defaultLayout.yaxis, title: 'Frequency' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            annotations: [{
              x: 0.98, y: 0.98, xref: 'paper', yref: 'paper', showarrow: false,
              text: `Mean: ${logMean.toFixed(2)}, StdDev: ${logStdDev.toFixed(2)}`,
              font: { size: 11, color: colors.slate },
              xanchor: 'right', bgcolor: 'rgba(255,255,255,0.9)', borderpad: 4,
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Revenue Rank vs TVL Rank */}
      <ChartCard 
        title="Revenue Rank vs TVL Rank" 
        subtitle={`Spearman ρ = ${spearmanRho !== null ? spearmanRho.toFixed(3) : '—'} · Do the same protocols dominate both metrics?`}
      >
        <Plot
          data={[
            {
              x: matchedProtocols.map(p => p.revenueRank),
              y: matchedProtocols.map(p => p.tvlRank),
              text: matchedProtocols.map(p => p.name),
              type: 'scatter',
              mode: 'markers',
              name: 'Protocols',
              marker: {
                color: colors.secondary,
                size: 10,
                opacity: 0.7,
              },
              hovertemplate: '%{text}<br>Revenue Rank: %{x}<br>TVL Rank: %{y}<extra></extra>',
            },
            {
              x: [1, Math.max(...matchedProtocols.map(p => p.revenueRank))],
              y: [1, Math.max(...matchedProtocols.map(p => p.tvlRank))],
              type: 'scatter',
              mode: 'lines',
              name: 'Perfect Correlation',
              line: { color: colors.slate, width: 1, dash: 'dash' },
              hoverinfo: 'skip',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Revenue Rank (1 = highest)' },
            yaxis: { ...defaultLayout.yaxis, title: 'TVL Rank (1 = highest)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            annotations: [{
              x: 0.98, y: 0.02, xref: 'paper', yref: 'paper', showarrow: false,
              text: `Spearman ρ = ${spearmanRho !== null ? spearmanRho.toFixed(3) : '—'}`,
              font: { size: 14, color: colors.secondary },
              xanchor: 'right', yanchor: 'bottom', bgcolor: 'rgba(255,255,255,0.9)', borderpad: 4,
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Academic Narrative */}
      <NarrativeBox title="Power Laws in Crypto Economics">
        <p>
          <strong>Power Law Dynamics:</strong> Crypto protocol economics follow power law distributions with an average 
          exponent α ≈ <strong>{avgCryptoAlpha?.toFixed(2) || '—'}</strong>. This is {avgCryptoAlpha && avgCryptoAlpha < 1.0 ? 'more' : 'less'} concentrated 
          than Zipf's law (α = 1.0), which describes city populations and word frequencies. A lower α means more extreme 
          "winner-take-most" dynamics — the gap between #1 and #10 is larger than predicted by typical power laws.
        </p>
        <p>
          <strong>Concentration Metrics:</strong> The Gini coefficient of <strong>{giniRevenue.toFixed(3)}</strong> indicates 
          {giniRevenue > sp500Gini ? ' higher' : ' lower'} inequality than the S&P 500 (~{sp500Gini}). Just 
          <strong> {lorenzRevenue.thresholds.p80?.toFixed(1) || '—'}%</strong> of protocols generate 80% of all revenue, and 
          <strong> {lorenzRevenue.thresholds.p95?.toFixed(1) || '—'}%</strong> generate 95%. This follows Pareto's principle on steroids.
        </p>
        <p>
          <strong>Rank Correlation:</strong> Revenue rank and TVL rank have a Spearman correlation of 
          <strong> {spearmanRho !== null ? spearmanRho.toFixed(3) : '—'}</strong>. A high correlation suggests that the same protocols 
          dominate both metrics — capital flows to revenue generators. A low correlation would indicate market inefficiency 
          or speculative TVL allocation.
        </p>
        <p>
          <strong>Implications:</strong> Power law distributions in crypto suggest: (1) Network effects create natural monopolies 
          at the protocol layer, (2) Long-tail protocols struggle for profitability, (3) Index investing may be inefficient — 
          the top 5% capture most value. For investors, this argues for concentrated portfolios in category leaders rather 
          than diversified exposure to the long tail.
        </p>
      </NarrativeBox>
    </div>
  )
}
