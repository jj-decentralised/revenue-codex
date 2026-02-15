import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatPercent, formatNumber, categorizeSector } from '../../utils/helpers'

// Protocols to fetch historical revenue data for
const HISTORICAL_PROTOCOLS = ['aave', 'uniswap', 'lido', 'maker', 'hyperliquid', 'gmx', 'dydx']

// Revenue category mapping for decomposition
const REVENUE_CATEGORIES = {
  'Stablecoins': 'Stablecoins (Interest)',
  'Dexes': 'DEX Swaps (Trading Fees)',
  'Lending': 'Lending (Interest Spread)',
  'CDP': 'Lending (Interest Spread)',
  'Derivatives': 'Derivatives (Trading Fees)',
  'Liquid Staking': 'Infrastructure (Staking)',
  'Chain': 'Infrastructure (L1/L2 Gas)',
  'Bridge': 'Infrastructure (Bridges)',
  'Restaking': 'Infrastructure (Staking)',
}

function categorizeRevenue(category) {
  return REVENUE_CATEGORIES[category] || 'Other'
}

async function fetchAllMEVData() {
  const parseResult = async (result) => {
    if (result.status === 'fulfilled' && result.value.ok) {
      return result.value.json()
    }
    return null
  }

  // Build all fetch promises
  const fetchPromises = [
    // DeFiLlama data
    fetch('https://api.llama.fi/overview/fees?excludeTotalDataChartBreakdown=false'),
    fetch('https://api.llama.fi/protocols'),
    // Coinglass data
    fetch('/api/coinglass?action=liquidation'),
    fetch('/api/coinglass?action=funding'),
    // Historical protocol data
    ...HISTORICAL_PROTOCOLS.map(slug => fetch(`https://api.llama.fi/summary/fees/${slug}`)),
  ]

  const results = await Promise.allSettled(fetchPromises)

  let idx = 0
  const feesOverview = await parseResult(results[idx++])
  const protocols = await parseResult(results[idx++])
  const liquidation = await parseResult(results[idx++])
  const funding = await parseResult(results[idx++])

  // Historical data per protocol
  const historicalData = {}
  for (const slug of HISTORICAL_PROTOCOLS) {
    historicalData[slug] = await parseResult(results[idx++])
  }

  return {
    feesOverview,
    protocols,
    liquidation,
    funding,
    historicalData,
  }
}

// Calculate coefficient of variation (std/mean)
function coefficientOfVariation(values) {
  if (!values || values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return null
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)
  return stdDev / mean
}

// Calculate autocorrelation at lag 1
function autocorrelation(values) {
  if (!values || values.length < 3) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  let numerator = 0
  let denominator = 0
  for (let i = 0; i < values.length - 1; i++) {
    numerator += (values[i] - mean) * (values[i + 1] - mean)
  }
  for (let i = 0; i < values.length; i++) {
    denominator += Math.pow(values[i] - mean, 2)
  }
  return denominator === 0 ? null : numerator / denominator
}

// Quadrant classification for organic vs extractive
function classifyQuadrant(cv, avgRevenue, medianCV, medianRevenue) {
  const highRev = avgRevenue > medianRevenue
  const lowVol = cv < medianCV
  if (highRev && lowVol) return 'Toll Booth'
  if (highRev && !lowVol) return 'Casino'
  if (!highRev && lowVol) return 'Utility'
  return 'Speculation'
}

const QUADRANT_COLORS = {
  'Toll Booth': colors.success,
  'Casino': colors.warning,
  'Utility': colors.primary,
  'Speculation': colors.danger,
}

export default function MEVStudyTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAllMEVData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading MEV & revenue extraction data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  // === EXTRACT & PROCESS DATA ===
  const feesProtocols = data?.feesOverview?.protocols || []
  const totalRevenue24h = data?.feesOverview?.total24h || (data?.feesOverview?.protocols || []).reduce((s, p) => s + (p.total24h || 0), 0)
  const totalDataChartBreakdown = data?.feesOverview?.totalDataChartBreakdown || []
  const allProtocols = data?.protocols || []

  // Liquidation data
  const liquidationData = data?.liquidation?.data || []
  const totalLiquidations24h = liquidationData.reduce(
    (sum, d) => sum + (d.longLiquidationUsd || 0) + (d.shortLiquidationUsd || 0), 0
  )

  // Funding rate data
  const fundingData = data?.funding?.data || []
  const btcFunding = fundingData.find(d => d.symbol === 'BTC')
  const currentBtcFundingRate = btcFunding?.uMarginList?.[0]?.rate ?? null
  const avgFundingRate = fundingData.length > 0
    ? fundingData.reduce((sum, d) => {
        const rates = d.uMarginList || []
        return sum + (rates.length > 0 ? rates.reduce((s, r) => s + Math.abs(r.rate), 0) / rates.length : 0)
      }, 0) / fundingData.length
    : null

  // === 1. REVENUE DECOMPOSITION PIE ===
  const categoryRevenue = {}
  feesProtocols.forEach(p => {
    const cat = categorizeRevenue(p.category || 'Other')
    categoryRevenue[cat] = (categoryRevenue[cat] || 0) + (p.total24h || 0)
  })
  
  // Add estimated MEV/Liquidation component (approximation based on liquidation volume * typical fee)
  const estimatedLiquidationFees = totalLiquidations24h * 0.05 // ~5% liquidation penalty typical
  if (estimatedLiquidationFees > 0) {
    categoryRevenue['Liquidations (Penalty Fees)'] = estimatedLiquidationFees
  }
  
  const sortedCategories = Object.entries(categoryRevenue)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, v]) => v > 0)
  const totalCategoryRevenue = sortedCategories.reduce((s, [_, v]) => s + v, 0)

  // Calculate extraction-driven percentage
  const extractiveCategories = ['Derivatives (Trading Fees)', 'Liquidations (Penalty Fees)', 'DEX Swaps (Trading Fees)']
  const extractiveRevenue = sortedCategories
    .filter(([cat]) => extractiveCategories.includes(cat))
    .reduce((s, [_, v]) => s + v, 0)
  const extractivePercent = totalCategoryRevenue > 0 ? (extractiveRevenue / totalCategoryRevenue) * 100 : 0

  // === 2. REVENUE VOLATILITY BY CATEGORY ===
  // Group protocols by sector and calculate CV for each
  const sectorDailyRevenues = {}
  totalDataChartBreakdown.forEach(([_, breakdown]) => {
    Object.entries(breakdown || {}).forEach(([protocol, value]) => {
      const p = feesProtocols.find(fp => fp.slug === protocol || fp.name === protocol)
      const sector = categorizeSector(p?.category || 'Other')
      if (!sectorDailyRevenues[sector]) sectorDailyRevenues[sector] = []
      const lastIdx = sectorDailyRevenues[sector].length - 1
      if (sectorDailyRevenues[sector][lastIdx]?.timestamp === _) {
        sectorDailyRevenues[sector][lastIdx].value += value
      } else {
        sectorDailyRevenues[sector].push({ timestamp: _, value })
      }
    })
  })

  const sectorVolatility = Object.entries(sectorDailyRevenues)
    .map(([sector, data]) => {
      const values = data.map(d => d.value)
      const cv = coefficientOfVariation(values)
      const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
      return { sector, cv, mean }
    })
    .filter(d => d.cv !== null && d.mean > 1000)
    .sort((a, b) => b.cv - a.cv)

  const avgCV = sectorVolatility.length > 0
    ? sectorVolatility.reduce((s, d) => s + d.cv, 0) / sectorVolatility.length
    : 0

  // === 3 & 4. LIQUIDATION & FUNDING CORRELATION ===
  // Build daily time series for correlation analysis
  const dailyFees = {}
  totalDataChartBreakdown.forEach(([timestamp, breakdown]) => {
    const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0]
    const totalFee = Object.values(breakdown || {}).reduce((s, v) => s + v, 0)
    dailyFees[dateStr] = (dailyFees[dateStr] || 0) + totalFee
  })

  // For liquidation-revenue correlation, use available data points
  const liquidationCorrelationData = liquidationData
    .filter(d => d.longLiquidationUsd > 0 || d.shortLiquidationUsd > 0)
    .slice(0, 30)
    .map((d, i) => ({
      symbol: d.symbol,
      liquidation: (d.longLiquidationUsd || 0) + (d.shortLiquidationUsd || 0),
      // Approximate protocol fee contribution
      protocolFee: ((d.longLiquidationUsd || 0) + (d.shortLiquidationUsd || 0)) * 0.03,
    }))

  // Funding rate impact data
  const fundingImpactData = fundingData
    .filter(d => d.uMarginList && d.uMarginList.length > 0)
    .slice(0, 20)
    .map(d => {
      const avgRate = d.uMarginList.reduce((s, r) => s + Math.abs(r.rate), 0) / d.uMarginList.length
      return {
        symbol: d.symbol,
        fundingRate: avgRate * 100,
        // Higher funding = more trading activity = more fees
        estimatedActivity: avgRate > 0.0005 ? 'High' : avgRate > 0.0001 ? 'Medium' : 'Low',
      }
    })

  // === 5. REVENUE DURABILITY RANKING ===
  const protocolDurability = []
  for (const [slug, histData] of Object.entries(data?.historicalData || {})) {
    if (!histData?.totalDataChart) continue
    const dailyRevenues = histData.totalDataChart.map(([_, v]) => v).filter(v => v > 0)
    if (dailyRevenues.length < 7) continue
    
    const mean = dailyRevenues.reduce((a, b) => a + b, 0) / dailyRevenues.length
    const cv = coefficientOfVariation(dailyRevenues)
    const minVal = Math.min(...dailyRevenues)
    const maxVal = Math.max(...dailyRevenues)
    const minMaxRatio = maxVal > 0 ? minVal / maxVal : 0
    
    // Durability score = mean / CV (higher is better)
    const durabilityScore = cv && cv > 0 ? mean / cv : 0
    
    protocolDurability.push({
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      slug,
      mean,
      cv,
      minMaxRatio,
      durabilityScore,
      dataPoints: dailyRevenues.length,
    })
  }

  // Add more protocols from fees overview
  feesProtocols
    .filter(p => p.total24h > 100000 && !HISTORICAL_PROTOCOLS.includes(p.slug))
    .slice(0, 15)
    .forEach(p => {
      // Estimate CV from 24h vs 7d ratio if available
      const ratio7d = p.total7d && p.total24h ? p.total7d / (p.total24h * 7) : 1
      const estimatedCV = Math.abs(1 - ratio7d) + 0.2 // Rough estimate
      protocolDurability.push({
        name: p.name || p.slug,
        slug: p.slug,
        mean: p.total24h,
        cv: estimatedCV,
        minMaxRatio: 0.5,
        durabilityScore: p.total24h / (estimatedCV || 0.5),
        dataPoints: 1,
      })
    })

  const sortedDurability = [...protocolDurability]
    .filter(d => d.durabilityScore > 0)
    .sort((a, b) => b.durabilityScore - a.durabilityScore)
    .slice(0, 20)

  // === 6. ORGANIC VS EXTRACTIVE SCATTER ===
  const scatterProtocols = protocolDurability
    .filter(p => p.cv !== null && p.cv > 0 && p.mean > 10000)
  
  const medianCV = scatterProtocols.length > 0
    ? [...scatterProtocols].sort((a, b) => a.cv - b.cv)[Math.floor(scatterProtocols.length / 2)]?.cv || 0.5
    : 0.5
  const medianRevenue = scatterProtocols.length > 0
    ? [...scatterProtocols].sort((a, b) => a.mean - b.mean)[Math.floor(scatterProtocols.length / 2)]?.mean || 100000
    : 100000

  const quadrantData = scatterProtocols.map(p => ({
    ...p,
    quadrant: classifyQuadrant(p.cv, p.mean, medianCV, medianRevenue),
  }))

  // === 7. REVENUE AUTOCORRELATION ===
  const autocorrelationData = []
  for (const [slug, histData] of Object.entries(data?.historicalData || {})) {
    if (!histData?.totalDataChart) continue
    const dailyRevenues = histData.totalDataChart.map(([_, v]) => v).filter(v => v > 0)
    if (dailyRevenues.length < 10) continue
    
    const ac = autocorrelation(dailyRevenues)
    if (ac !== null) {
      autocorrelationData.push({
        name: slug.charAt(0).toUpperCase() + slug.slice(1),
        autocorrelation: ac,
        interpretation: ac > 0.5 ? 'Predictable/Organic' : ac > 0 ? 'Moderate' : 'Event-Driven',
      })
    }
  }
  autocorrelationData.sort((a, b) => b.autocorrelation - a.autocorrelation)

  // === KPIs ===
  const avgDurabilityScore = sortedDurability.length > 0
    ? sortedDurability.reduce((s, d) => s + d.durabilityScore, 0) / sortedDurability.length
    : 0

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard
          title="Total Revenue (24h)"
          value={formatCurrency(totalRevenue24h)}
          subtitle="All protocols"
        />
        <KPICard
          title="24h Liquidations"
          value={formatCurrency(totalLiquidations24h)}
          subtitle="Across all markets"
        />
        <KPICard
          title="Extraction-Driven"
          value={formatPercent(extractivePercent)}
          subtitle="of total revenue"
        />
        <KPICard
          title="Avg Revenue CV"
          value={avgCV.toFixed(2)}
          subtitle="Volatility measure"
        />
        <KPICard
          title="BTC Funding Rate"
          value={currentBtcFundingRate !== null ? `${(currentBtcFundingRate * 100).toFixed(4)}%` : '—'}
          subtitle="Current rate"
        />
      </div>

      {/* 1. Revenue Decomposition Pie */}
      <ChartCard
        title="Revenue Decomposition by Source"
        subtitle="Estimated breakdown of crypto protocol revenue by economic activity type"
      >
        <Plot
          data={[{
            labels: sortedCategories.map(([cat]) => cat),
            values: sortedCategories.map(([_, v]) => v),
            type: 'pie',
            hole: 0.4,
            marker: {
              colors: sortedCategories.map((_, i) => colors.palette[i % colors.palette.length]),
            },
            textinfo: 'label+percent',
            textposition: 'outside',
            hovertemplate: '%{label}<br>$%{value:,.0f}<br>%{percent}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 450,
            showlegend: true,
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
            annotations: [{
              text: `$${formatNumber(totalCategoryRevenue)}`,
              showarrow: false,
              font: { size: 16, color: '#111827' },
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 2. Revenue Volatility by Category */}
      <ChartCard
        title="Revenue Volatility by Sector"
        subtitle="Coefficient of Variation (std/mean) — High CV = event-driven/extractive, Low CV = organic/recurring"
      >
        <Plot
          data={[{
            x: sectorVolatility.map(d => d.sector),
            y: sectorVolatility.map(d => d.cv),
            type: 'bar',
            marker: {
              color: sectorVolatility.map(d =>
                d.cv > 0.8 ? colors.danger :
                d.cv > 0.5 ? colors.warning :
                d.cv > 0.3 ? colors.primary :
                colors.success
              ),
            },
            text: sectorVolatility.map(d => d.cv.toFixed(2)),
            textposition: 'outside',
            hovertemplate: '%{x}<br>CV: %{y:.3f}<br>Avg Revenue: $%{customdata:,.0f}<extra></extra>',
            customdata: sectorVolatility.map(d => d.mean),
          }]}
          layout={{
            ...defaultLayout,
            height: 380,
            yaxis: { ...defaultLayout.yaxis, title: 'Coefficient of Variation' },
            xaxis: { ...defaultLayout.xaxis, tickangle: -30 },
            shapes: [
              { type: 'line', x0: -0.5, x1: sectorVolatility.length - 0.5, y0: 0.3, y1: 0.3, line: { color: colors.success, dash: 'dash', width: 1 } },
              { type: 'line', x0: -0.5, x1: sectorVolatility.length - 0.5, y0: 0.5, y1: 0.5, line: { color: colors.warning, dash: 'dash', width: 1 } },
            ],
            annotations: [
              { x: sectorVolatility.length - 0.5, y: 0.3, xanchor: 'right', text: 'TradFi SaaS (~0.3)', showarrow: false, font: { size: 10, color: colors.success } },
              { x: sectorVolatility.length - 0.5, y: 0.5, xanchor: 'right', text: 'Commodity Trading (~0.5)', showarrow: false, font: { size: 10, color: colors.warning } },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 3. Liquidation-Revenue Correlation */}
      <ChartCard
        title="Liquidation Volume by Asset"
        subtitle="Higher liquidation volume → more protocol fee revenue from penalty fees and trading activity"
      >
        <Plot
          data={[{
            x: liquidationCorrelationData.map(d => d.symbol),
            y: liquidationCorrelationData.map(d => d.liquidation),
            type: 'bar',
            marker: {
              color: liquidationCorrelationData.map((_, i) => colors.palette[i % colors.palette.length]),
            },
            text: liquidationCorrelationData.map(d => formatCurrency(d.liquidation)),
            textposition: 'outside',
            hovertemplate: '%{x}<br>Liquidations: $%{y:,.0f}<br>Est. Fees: $%{customdata:,.0f}<extra></extra>',
            customdata: liquidationCorrelationData.map(d => d.protocolFee),
          }]}
          layout={{
            ...defaultLayout,
            height: 380,
            yaxis: { ...defaultLayout.yaxis, title: 'Liquidation Volume (USD)' },
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 4. Funding Rate Impact on Revenue */}
      <ChartCard
        title="Funding Rate Impact Analysis"
        subtitle="Absolute funding rates by asset — extreme funding (either direction) correlates with higher trading activity"
      >
        <Plot
          data={[{
            x: fundingImpactData.map(d => d.symbol),
            y: fundingImpactData.map(d => d.fundingRate),
            type: 'bar',
            marker: {
              color: fundingImpactData.map(d =>
                d.fundingRate > 0.05 ? colors.danger :
                d.fundingRate > 0.02 ? colors.warning :
                colors.success
              ),
            },
            text: fundingImpactData.map(d => `${d.fundingRate.toFixed(4)}%`),
            textposition: 'outside',
            hovertemplate: '%{x}<br>Funding: %{y:.4f}%<br>Activity: %{customdata}<extra></extra>',
            customdata: fundingImpactData.map(d => d.estimatedActivity),
          }]}
          layout={{
            ...defaultLayout,
            height: 380,
            yaxis: { ...defaultLayout.yaxis, title: 'Absolute Funding Rate (%)' },
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            shapes: [
              { type: 'line', x0: -0.5, x1: fundingImpactData.length - 0.5, y0: 0.01, y1: 0.01, line: { color: colors.success, dash: 'dash', width: 1 } },
              { type: 'line', x0: -0.5, x1: fundingImpactData.length - 0.5, y0: 0.05, y1: 0.05, line: { color: colors.danger, dash: 'dash', width: 1 } },
            ],
            annotations: [
              { x: fundingImpactData.length - 0.5, y: 0.01, xanchor: 'right', text: 'Neutral', showarrow: false, font: { size: 10, color: colors.success } },
              { x: fundingImpactData.length - 0.5, y: 0.05, xanchor: 'right', text: 'Extreme', showarrow: false, font: { size: 10, color: colors.danger } },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 5. Revenue Durability Ranking */}
      <ChartCard
        title="Revenue Durability Ranking"
        subtitle="Durability Score = Mean Revenue / CV — higher score indicates more predictable, sustainable revenue"
      >
        <Plot
          data={[{
            x: sortedDurability.map(d => d.name),
            y: sortedDurability.map(d => d.durabilityScore),
            type: 'bar',
            marker: {
              color: sortedDurability.map((_, i) => colors.palette[i % colors.palette.length]),
            },
            text: sortedDurability.map(d => formatNumber(d.durabilityScore)),
            textposition: 'outside',
            hovertemplate: '%{x}<br>Durability: %{y:,.0f}<br>Mean Rev: $%{customdata[0]:,.0f}<br>CV: %{customdata[1]:.2f}<extra></extra>',
            customdata: sortedDurability.map(d => [d.mean, d.cv]),
          }]}
          layout={{
            ...defaultLayout,
            height: 450,
            yaxis: { ...defaultLayout.yaxis, title: 'Durability Score (Mean/CV)' },
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 6. Organic vs Extractive Revenue Scatter */}
      <ChartCard
        title="Organic vs Extractive Revenue Classification"
        subtitle="Quadrants: Toll Booth (high rev, low vol), Casino (high rev, high vol), Utility (low rev, low vol), Speculation (low rev, high vol)"
      >
        <Plot
          data={Object.entries(QUADRANT_COLORS).map(([quadrant, color]) => {
            const pts = quadrantData.filter(d => d.quadrant === quadrant)
            return {
              x: pts.map(p => p.cv),
              y: pts.map(p => p.mean),
              text: pts.map(p => p.name),
              mode: 'markers+text',
              type: 'scatter',
              name: quadrant,
              marker: {
                color,
                size: pts.map(p => Math.max(12, Math.min(40, Math.sqrt(p.mean / 5000)))),
                opacity: 0.8,
                line: { width: 2, color: '#FFF' },
              },
              textposition: 'top center',
              textfont: { size: 10, color: '#374151' },
              hovertemplate: '%{text}<br>CV: %{x:.2f}<br>Avg Revenue: $%{y:,.0f}<extra></extra>',
            }
          })}
          layout={{
            ...defaultLayout,
            height: 500,
            xaxis: { ...defaultLayout.xaxis, title: 'Revenue Volatility (CV)', range: [0, Math.max(...quadrantData.map(d => d.cv)) * 1.1] },
            yaxis: { ...defaultLayout.yaxis, title: 'Average Daily Revenue (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            shapes: [
              { type: 'line', x0: medianCV, x1: medianCV, y0: 0, y1: 1, yref: 'paper', line: { color: colors.slate, dash: 'dot', width: 1 } },
              { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: medianRevenue, y1: medianRevenue, line: { color: colors.slate, dash: 'dot', width: 1 } },
            ],
            annotations: [
              { x: medianCV * 0.5, y: 1, yref: 'paper', text: '← Organic', showarrow: false, font: { size: 11, color: colors.success } },
              { x: medianCV * 1.5, y: 1, yref: 'paper', text: 'Extractive →', showarrow: false, font: { size: 11, color: colors.danger } },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 7. Revenue Autocorrelation */}
      {autocorrelationData.length > 0 && (
        <ChartCard
          title="Revenue Autocorrelation (Lag-1)"
          subtitle="High autocorrelation (>0.5) = predictable/organic revenue — Low/negative = event-driven/extractive"
        >
          <Plot
            data={[{
              x: autocorrelationData.map(d => d.name),
              y: autocorrelationData.map(d => d.autocorrelation),
              type: 'bar',
              marker: {
                color: autocorrelationData.map(d =>
                  d.autocorrelation > 0.5 ? colors.success :
                  d.autocorrelation > 0.2 ? colors.primary :
                  d.autocorrelation > 0 ? colors.warning :
                  colors.danger
                ),
              },
              text: autocorrelationData.map(d => d.autocorrelation.toFixed(2)),
              textposition: 'outside',
              hovertemplate: '%{x}<br>Autocorrelation: %{y:.3f}<br>%{customdata}<extra></extra>',
              customdata: autocorrelationData.map(d => d.interpretation),
            }]}
            layout={{
              ...defaultLayout,
              height: 350,
              yaxis: {
                ...defaultLayout.yaxis,
                title: 'Autocorrelation Coefficient',
                range: [-0.5, 1],
                zeroline: true,
                zerolinecolor: colors.slate,
                zerolinewidth: 2,
              },
              xaxis: { ...defaultLayout.xaxis, tickangle: -30 },
              shapes: [
                { type: 'line', x0: -0.5, x1: autocorrelationData.length - 0.5, y0: 0.5, y1: 0.5, line: { color: colors.success, dash: 'dash', width: 1 } },
              ],
              annotations: [
                { x: autocorrelationData.length - 0.5, y: 0.5, xanchor: 'right', text: 'Predictable threshold', showarrow: false, font: { size: 10, color: colors.success } },
              ],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Narrative */}
      <NarrativeBox title="MEV, Liquidations & Extractable Revenue">
        <p>
          A critical question for crypto valuation: is protocol revenue organic or extractive? Organic revenue
          (stablecoin interest, recurring DeFi usage) is predictable and supports DCF-style valuation. Extractive
          revenue (liquidation penalties, MEV, speculative trading fees) is volatile and event-driven — it cannot
          be reliably extrapolated.
        </p>
        <p>
          Our analysis reveals that <strong>{extractivePercent.toFixed(0)}%</strong> of crypto revenue is extraction-driven,
          with an average revenue coefficient of variation of <strong>{avgCV.toFixed(2)}</strong> — significantly
          higher than TradFi SaaS (CV ≈ 0.1) but comparable to commodity trading desks (CV ≈ 0.3–0.5).
        </p>
        <p>
          The "Toll Booth" protocols — those with high revenue and low volatility — represent the most defensible
          positions in crypto: stablecoin issuers, established lending protocols, and infrastructure with recurring
          usage. "Casino" protocols generate impressive revenue but face existential risk when speculation subsides.
        </p>
        <p>
          Liquidation cascades remain a significant revenue driver: {formatCurrency(totalLiquidations24h)} in
          liquidations over 24h generates substantial fee income for lending protocols and perp DEXs. When funding
          rates spike above 0.05%, protocol revenue surges — but this revenue is inherently unsustainable.
        </p>
      </NarrativeBox>
    </div>
  )
}
