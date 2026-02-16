import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatPercent } from '../../utils/helpers'
import { fetchMVRV } from '../../services/santiment'

// Calculate Pearson correlation coefficient
function calculateCorrelation(x, y) {
  if (x.length !== y.length || x.length < 2) return null
  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0)
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0)
  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  return denominator === 0 ? null : numerator / denominator
}

// Calculate rolling correlation over a window
function calculateRollingCorrelation(series1, series2, windowSize = 30) {
  const aligned = alignTimeSeries(series1, series2)
  if (aligned.dates.length < windowSize) return null
  const lastWindow1 = aligned.values1.slice(-windowSize)
  const lastWindow2 = aligned.values2.slice(-windowSize)
  return calculateCorrelation(lastWindow1, lastWindow2)
}

// Align two time series by date
function alignTimeSeries(series1, series2) {
  const map1 = new Map(series1.map(d => [d.date, d.value]))
  const map2 = new Map(series2.map(d => [d.date, d.value]))
  const commonDates = [...map1.keys()].filter(d => map2.has(d)).sort()
  return {
    dates: commonDates,
    values1: commonDates.map(d => map1.get(d)),
    values2: commonDates.map(d => map2.get(d)),
  }
}

// Align multiple time series by date
function alignMultipleTimeSeries(...seriesArray) {
  if (seriesArray.length === 0) return { dates: [], values: [] }
  const maps = seriesArray.map(s => new Map(s.map(d => [d.date, d.value])))
  const allDates = new Set()
  maps.forEach(m => m.forEach((_, k) => allDates.add(k)))
  const commonDates = [...allDates].filter(d => maps.every(m => m.has(d))).sort()
  return {
    dates: commonDates,
    values: maps.map(m => commonDates.map(d => m.get(d))),
  }
}

// Classify macro regime based on indicators
function classifyMacroRegime(treasuryYield, dxyLevel, btcChange30d, defiSpread, vixLevel, fearGreed) {
  let riskOnSignals = 0
  let riskOffSignals = 0
  
  if (treasuryYield !== null) {
    if (treasuryYield < 4) riskOnSignals++
    else if (treasuryYield > 5) riskOffSignals++
  }
  
  if (dxyLevel !== null) {
    if (dxyLevel < 100) riskOnSignals++
    else if (dxyLevel > 105) riskOffSignals++
  }
  
  if (btcChange30d !== null) {
    if (btcChange30d > 10) riskOnSignals++
    else if (btcChange30d < -10) riskOffSignals++
  }
  
  if (defiSpread !== null) {
    if (defiSpread > 5) riskOnSignals++
    else if (defiSpread < 2) riskOffSignals++
  }

  if (vixLevel !== null) {
    if (vixLevel < 15) riskOnSignals++
    else if (vixLevel > 25) riskOffSignals++
  }

  if (fearGreed !== null) {
    if (fearGreed > 60) riskOnSignals++
    else if (fearGreed < 30) riskOffSignals++
  }
  
  const totalSignals = riskOnSignals + riskOffSignals
  if (totalSignals > 0) {
    if (riskOnSignals >= totalSignals * 0.6) return { regime: 'Risk-On', color: colors.success }
    if (riskOffSignals >= totalSignals * 0.6) return { regime: 'Risk-Off', color: colors.danger }
  }
  return { regime: 'Transition', color: colors.warning }
}

// Parse Yahoo historical data (v8 chart format from our proxy)
function parseYahooHistorical(data) {
  if (!data) return []
  // Our proxy returns { quotes: [{ date, close, ... }], meta }
  const quotes = data.quotes || data.historical || []
  if (Array.isArray(quotes) && quotes.length > 0) {
    return quotes.map(d => ({
      date: typeof d.date === 'string' ? d.date.split('T')[0] : null,
      value: d.close ?? d.adjclose ?? d.price ?? null,
    })).filter(d => d.value != null && d.date)
  }
  // Fallback: raw v8 chart format (if proxy sends raw data)
  const result = data.chart?.result?.[0]
  if (result?.timestamp?.length) {
    const closes = result.indicators?.quote?.[0]?.close || []
    return result.timestamp.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      value: closes[i],
    })).filter(d => d.value != null)
  }
  return []
}

// Parse CoinGecko chart data
function parseCoinGeckoChart(data) {
  const prices = data?.prices || []
  return prices.map(([ts, price]) => ({
    date: new Date(ts).toISOString().split('T')[0],
    value: price,
  }))
}

export default function MacroTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchAllData() {
      const results = await Promise.allSettled([
        // CoinGecko BTC 1yr chart
        fetch('/api/coingecko?action=coin_chart&coin_id=bitcoin&days=365').then(r => r.json()),
        // CoinGecko ETH 1yr chart
        fetch('/api/coingecko?action=coin_chart&coin_id=ethereum&days=365').then(r => r.json()),
        // CoinGecko global
        fetch('/api/coingecko?action=global').then(r => r.json()),
        // Yahoo S&P 500 history 2y
        fetch('/api/yahoo?action=historical&symbol=^GSPC&period=2y').then(r => r.json()),
        // Yahoo Treasury yield 2y
        fetch('/api/yahoo?action=historical&symbol=^IRX&period=2y').then(r => r.json()),
        // Yahoo DXY 1y
        fetch('/api/yahoo?action=historical&symbol=DX-Y.NYB&period=1y').then(r => r.json()),
        // Yahoo Gold 1y
        fetch('/api/yahoo?action=historical&symbol=GC=F&period=1y').then(r => r.json()),
        // Yahoo VIX 1y
        fetch('/api/yahoo?action=historical&symbol=^VIX&period=1y').then(r => r.json()),
        // Yahoo Nifty 50 quote
        fetch('/api/yahoo?action=quote&symbol=^NSEI').then(r => r.json()),
        // DeFiLlama yields (pools)
        fetch('https://api.llama.fi/pools').then(r => r.json()),
        // DeFiLlama fees
        fetch('https://api.llama.fi/overview/fees').then(r => r.json()),
        // Fear & Greed Index (365 days)
        fetch('https://api.alternative.me/fng/?limit=365&format=json').then(r => r.json()),
        // Santiment MVRV for BTC
        fetchMVRV('bitcoin').catch(() => null),
      ])

      const [
        btcChart, ethChart, globalData, spHistory, treasuryHistory,
        dxyHistory, goldHistory, vixHistory, niftyQuote,
        defiPools, defiFees, fearGreed, mvrvData
      ] = results

      return {
        btcChart: btcChart.status === 'fulfilled' ? btcChart.value : null,
        ethChart: ethChart.status === 'fulfilled' ? ethChart.value : null,
        globalData: globalData.status === 'fulfilled' ? globalData.value : null,
        spHistory: spHistory.status === 'fulfilled' ? spHistory.value : null,
        treasuryHistory: treasuryHistory.status === 'fulfilled' ? treasuryHistory.value : null,
        dxyHistory: dxyHistory.status === 'fulfilled' ? dxyHistory.value : null,
        goldHistory: goldHistory.status === 'fulfilled' ? goldHistory.value : null,
        vixHistory: vixHistory.status === 'fulfilled' ? vixHistory.value : null,
        niftyQuote: niftyQuote.status === 'fulfilled' ? niftyQuote.value : null,
        defiPools: defiPools.status === 'fulfilled' ? defiPools.value : null,
        defiFees: defiFees.status === 'fulfilled' ? defiFees.value : null,
        fearGreed: fearGreed.status === 'fulfilled' ? fearGreed.value : null,
        mvrvData: mvrvData.status === 'fulfilled' ? mvrvData.value : null,
      }
    }

    fetchAllData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading comprehensive macro data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  // ===== PARSE ALL DATA SOURCES =====
  
  // BTC data
  const btcTimeSeries = parseCoinGeckoChart(data?.btcChart)
  const currentBtcPrice = btcTimeSeries.length > 0 ? btcTimeSeries[btcTimeSeries.length - 1].value : null
  const btcPrice30dAgo = btcTimeSeries.length > 30 ? btcTimeSeries[btcTimeSeries.length - 31]?.value : null
  const btcChange30d = currentBtcPrice && btcPrice30dAgo ? ((currentBtcPrice - btcPrice30dAgo) / btcPrice30dAgo) * 100 : null

  // ETH data
  const ethTimeSeries = parseCoinGeckoChart(data?.ethChart)
  const currentEthPrice = ethTimeSeries.length > 0 ? ethTimeSeries[ethTimeSeries.length - 1].value : null
  const ethPrice30dAgo = ethTimeSeries.length > 30 ? ethTimeSeries[ethTimeSeries.length - 31]?.value : null
  const ethChange30d = currentEthPrice && ethPrice30dAgo ? ((currentEthPrice - ethPrice30dAgo) / ethPrice30dAgo) * 100 : null

  // S&P 500 data
  const spTimeSeries = parseYahooHistorical(data?.spHistory)
  const currentSP = spTimeSeries.length > 0 ? spTimeSeries[spTimeSeries.length - 1].value : null

  // Treasury yield data
  const treasuryTimeSeries = parseYahooHistorical(data?.treasuryHistory)
  const currentTreasuryYield = treasuryTimeSeries.length > 0 ? treasuryTimeSeries[treasuryTimeSeries.length - 1].value : null

  // DXY data
  const dxyTimeSeries = parseYahooHistorical(data?.dxyHistory)
  const currentDXY = dxyTimeSeries.length > 0 ? dxyTimeSeries[dxyTimeSeries.length - 1].value : null

  // Gold data
  const goldTimeSeries = parseYahooHistorical(data?.goldHistory)
  const currentGold = goldTimeSeries.length > 0 ? goldTimeSeries[goldTimeSeries.length - 1].value : null

  // VIX data
  const vixTimeSeries = parseYahooHistorical(data?.vixHistory)
  const currentVIX = vixTimeSeries.length > 0 ? vixTimeSeries[vixTimeSeries.length - 1].value : null

  // Fear & Greed Index
  const fngData = data?.fearGreed?.data || []
  const fngTimeSeries = fngData.map(d => ({
    date: new Date(parseInt(d.timestamp) * 1000).toISOString().split('T')[0],
    value: parseInt(d.value),
    classification: d.value_classification,
  })).reverse() // API returns newest first
  const currentFearGreed = fngTimeSeries.length > 0 ? fngTimeSeries[fngTimeSeries.length - 1] : null

  // MVRV data (Santiment)
  const mvrvTimeSeries = Array.isArray(data?.mvrvData) 
    ? data.mvrvData.map(d => ({ date: d.datetime?.split('T')[0], value: d.value })).filter(d => d.date && d.value)
    : []
  const currentMVRV = mvrvTimeSeries.length > 0 ? mvrvTimeSeries[mvrvTimeSeries.length - 1].value : null

  // DeFi yields - stablecoin lending pools
  const defiPoolsData = data?.defiPools?.data || data?.defiPools || []
  const stablecoinPools = Array.isArray(defiPoolsData) 
    ? defiPoolsData.filter(p => 
        p.stablecoin === true && 
        p.apy > 0 && 
        p.apy < 100 &&
        p.tvlUsd > 1000000
      )
    : []
  const defiApys = stablecoinPools.map(p => p.apy).sort((a, b) => a - b)
  const medianDefiApy = defiApys.length > 0 ? defiApys[Math.floor(defiApys.length / 2)] : null

  // Crypto risk premium
  const cryptoRiskPremium = medianDefiApy !== null && currentTreasuryYield !== null
    ? medianDefiApy - currentTreasuryYield
    : null

  // ===== CALCULATE CORRELATIONS =====
  
  const btcSpCorrelation = calculateRollingCorrelation(btcTimeSeries, spTimeSeries, 30)
  const btcGoldCorrelation = calculateRollingCorrelation(btcTimeSeries, goldTimeSeries, 30)
  const btcDxyCorrelation = calculateRollingCorrelation(btcTimeSeries, dxyTimeSeries, 30)
  const btcVixCorrelation = calculateRollingCorrelation(btcTimeSeries, vixTimeSeries, 30)
  const spGoldCorrelation = calculateRollingCorrelation(spTimeSeries, goldTimeSeries, 30)
  const spDxyCorrelation = calculateRollingCorrelation(spTimeSeries, dxyTimeSeries, 30)
  const spVixCorrelation = calculateRollingCorrelation(spTimeSeries, vixTimeSeries, 30)
  const goldDxyCorrelation = calculateRollingCorrelation(goldTimeSeries, dxyTimeSeries, 30)
  const goldVixCorrelation = calculateRollingCorrelation(goldTimeSeries, vixTimeSeries, 30)
  const dxyVixCorrelation = calculateRollingCorrelation(dxyTimeSeries, vixTimeSeries, 30)

  // Correlation matrix data
  const correlationMatrix = [
    { name: 'BTC', btc: 1, sp: btcSpCorrelation, gold: btcGoldCorrelation, dxy: btcDxyCorrelation, vix: btcVixCorrelation },
    { name: 'S&P', btc: btcSpCorrelation, sp: 1, gold: spGoldCorrelation, dxy: spDxyCorrelation, vix: spVixCorrelation },
    { name: 'Gold', btc: btcGoldCorrelation, sp: spGoldCorrelation, gold: 1, dxy: goldDxyCorrelation, vix: goldVixCorrelation },
    { name: 'DXY', btc: btcDxyCorrelation, sp: spDxyCorrelation, gold: goldDxyCorrelation, dxy: 1, vix: dxyVixCorrelation },
    { name: 'VIX', btc: btcVixCorrelation, sp: spVixCorrelation, gold: goldVixCorrelation, dxy: dxyVixCorrelation, vix: 1 },
  ]

  // ===== MACRO REGIME =====
  const macroRegime = classifyMacroRegime(
    currentTreasuryYield, 
    currentDXY, 
    btcChange30d, 
    cryptoRiskPremium,
    currentVIX,
    currentFearGreed?.value
  )

  // ===== ALIGNED DATA FOR CHARTS =====
  
  // BTC vs S&P (2yr)
  const btcSpAligned = alignTimeSeries(btcTimeSeries, spTimeSeries)
  
  // BTC vs Gold
  const btcGoldAligned = alignTimeSeries(btcTimeSeries, goldTimeSeries)

  // DXY vs BTC scatter
  const dxyBtcAligned = alignTimeSeries(dxyTimeSeries, btcTimeSeries)

  // VIX vs Fear & Greed
  const vixFngAligned = alignTimeSeries(
    vixTimeSeries,
    fngTimeSeries.map(d => ({ date: d.date, value: d.value }))
  )

  // DeFi yield time series approximation (use treasury as baseline + spread)
  const defiTreasurySpread = treasuryTimeSeries.map(d => ({
    ...d,
    defiYield: medianDefiApy, // Current snapshot
    spread: medianDefiApy !== null ? medianDefiApy - d.value : null,
  }))

  // ===== NARRATIVE GENERATION =====
  const correlationTrend = btcSpCorrelation !== null 
    ? (btcSpCorrelation > 0.6 ? 'strong' : btcSpCorrelation > 0.3 ? 'moderate' : btcSpCorrelation > 0 ? 'weak' : 'negative')
    : 'unknown'
  const goldNarrative = btcGoldCorrelation !== null && btcGoldCorrelation > 0.3
    ? 'supporting the digital gold thesis'
    : 'diverging from the digital gold narrative'
  const spreadInterpretation = cryptoRiskPremium !== null
    ? (cryptoRiskPremium > 5 
        ? 'genuine on-chain demand or elevated risk compensation' 
        : cryptoRiskPremium < 2 
          ? 'rational capital may flow to risk-free TradFi alternatives'
          : 'moderate risk-adjusted opportunity in DeFi')
    : 'insufficient data to assess'

  // Helper for correlation color
  const getCorrelationColor = (val) => {
    if (val === null) return colors.slate
    if (val > 0.5) return colors.success
    if (val > 0) return colors.warning
    if (val > -0.5) return colors.amber
    return colors.danger
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
        <KPICard 
          title="BTC" 
          value={formatCurrency(currentBtcPrice)} 
          subtitle="30d"
          trend={btcChange30d}
        />
        <KPICard 
          title="ETH" 
          value={formatCurrency(currentEthPrice)} 
          subtitle="30d"
          trend={ethChange30d}
        />
        <KPICard 
          title="S&P 500" 
          value={currentSP ? currentSP.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'} 
          subtitle="Index"
        />
        <KPICard 
          title="13wk T-Bill" 
          value={currentTreasuryYield !== null ? `${currentTreasuryYield.toFixed(2)}%` : '—'} 
          subtitle="Risk-free"
        />
        <KPICard 
          title="DXY" 
          value={currentDXY !== null ? currentDXY.toFixed(2) : '—'} 
          subtitle="Dollar Index"
        />
        <KPICard 
          title="Gold" 
          value={currentGold ? `$${currentGold.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'} 
          subtitle="GC=F"
        />
        <KPICard 
          title="VIX" 
          value={currentVIX !== null ? currentVIX.toFixed(2) : '—'} 
          subtitle="Fear gauge"
        />
        <KPICard 
          title="DeFi APY" 
          value={medianDefiApy !== null ? `${medianDefiApy.toFixed(2)}%` : '—'} 
          subtitle="Stablecoin median"
        />
        <KPICard 
          title="Risk Premium" 
          value={cryptoRiskPremium !== null ? `${(cryptoRiskPremium * 100).toFixed(0)} bps` : '—'} 
          subtitle="DeFi - TBill"
        />
      </div>

      {/* Macro Regime + Fear & Greed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-(--color-rule) p-6 text-center">
          <p className="text-[11px] font-semibold text-(--color-ink-muted) uppercase tracking-widest mb-3">
            Current Macro Regime
          </p>
          <span 
            className="inline-block px-6 py-3 text-(--color-paper) text-xl font-bold font-serif"
            style={{ backgroundColor: macroRegime.color }}
          >
            {macroRegime.regime}
          </span>
          <p className="text-sm text-(--color-ink-muted) mt-3">
            Based on Treasury, DXY, VIX, crypto momentum, DeFi spreads, and sentiment
          </p>
        </div>

        <div className="border border-(--color-rule) p-6 text-center">
          <p className="text-[11px] font-semibold text-(--color-ink-muted) uppercase tracking-widest mb-3">
            Crypto Fear & Greed Index
          </p>
          {currentFearGreed ? (
            <>
              <span 
                className="inline-block px-6 py-3 text-(--color-paper) text-xl font-bold font-serif"
                style={{ 
                  backgroundColor: currentFearGreed.value >= 60 ? colors.success 
                    : currentFearGreed.value >= 40 ? colors.warning 
                    : colors.danger 
                }}
              >
                {currentFearGreed.value} — {currentFearGreed.classification}
              </span>
              <p className="text-sm text-(--color-ink-muted) mt-3">
                Historical range: 0 (Extreme Fear) to 100 (Extreme Greed)
              </p>
            </>
          ) : (
            <span className="text-(--color-ink-muted)">No data</span>
          )}
        </div>
      </div>

      {/* MVRV Indicator (if available) */}
      {currentMVRV !== null && (
        <div className="border border-(--color-rule) p-5 text-center">
          <p className="text-[11px] font-semibold text-(--color-ink-muted) uppercase tracking-widest">
            BTC MVRV Ratio (Santiment)
          </p>
          <p className="text-4xl font-bold font-serif mt-2" style={{
            color: currentMVRV > 3.5 ? colors.danger 
              : currentMVRV > 2.5 ? colors.warning 
              : currentMVRV < 1 ? colors.success 
              : colors.primary 
          }}>
            {currentMVRV.toFixed(2)}
          </p>
          <p className="text-sm text-(--color-text-secondary) mt-1">
            {currentMVRV > 3.5 ? 'Overvalued zone — historically precedes corrections' 
              : currentMVRV > 2.5 ? 'Elevated — caution warranted'
              : currentMVRV < 1 ? 'Undervalued zone — historically strong buying opportunity'
              : 'Fair value range'}
          </p>
        </div>
      )}

      {/* BTC vs S&P 500 Dual-Axis Chart */}
      <ChartCard title="BTC vs S&P 500 (2 Year)" subtitle="Dual-axis comparison — risk asset correlation">
        <Plot
          data={[
            {
              x: btcSpAligned.dates,
              y: btcSpAligned.values1,
              type: 'scatter',
              mode: 'lines',
              name: 'BTC',
              line: { color: colors.warning, width: 2 },
              yaxis: 'y',
              hovertemplate: 'BTC: $%{y:,.0f}<extra></extra>',
            },
            {
              x: btcSpAligned.dates,
              y: btcSpAligned.values2,
              type: 'scatter',
              mode: 'lines',
              name: 'S&P 500',
              line: { color: colors.primary, width: 2 },
              yaxis: 'y2',
              hovertemplate: 'S&P: %{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            yaxis: { 
              ...defaultLayout.yaxis, 
              title: 'BTC Price (USD)', 
              side: 'left',
              titlefont: { color: colors.warning },
              tickfont: { color: colors.warning },
            },
            yaxis2: {
              title: 'S&P 500',
              overlaying: 'y',
              side: 'right',
              gridcolor: 'transparent',
              titlefont: { color: colors.primary },
              tickfont: { size: 11, color: colors.primary },
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            annotations: [{
              x: 0.02, y: 0.98, xref: 'paper', yref: 'paper',
              text: `30d Correlation: ${btcSpCorrelation?.toFixed(2) ?? 'N/A'}`,
              showarrow: false,
              font: { size: 12, color: colors.slate },
              bgcolor: 'rgba(255,255,255,0.9)',
              borderpad: 4,
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* BTC vs Gold — Digital Gold Narrative */}
      <ChartCard title="BTC vs Gold — Digital Gold Narrative" subtitle="Dual-axis: BTC (left), Gold (right)">
        <Plot
          data={[
            {
              x: btcGoldAligned.dates,
              y: btcGoldAligned.values1,
              type: 'scatter',
              mode: 'lines',
              name: 'BTC',
              line: { color: colors.warning, width: 2 },
              yaxis: 'y',
              hovertemplate: 'BTC: $%{y:,.0f}<extra></extra>',
            },
            {
              x: btcGoldAligned.dates,
              y: btcGoldAligned.values2,
              type: 'scatter',
              mode: 'lines',
              name: 'Gold',
              line: { color: colors.amber, width: 2 },
              yaxis: 'y2',
              hovertemplate: 'Gold: $%{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { 
              ...defaultLayout.yaxis, 
              title: 'BTC Price (USD)', 
              side: 'left',
              titlefont: { color: colors.warning },
              tickfont: { color: colors.warning },
            },
            yaxis2: {
              title: 'Gold (USD/oz)',
              overlaying: 'y',
              side: 'right',
              gridcolor: 'transparent',
              titlefont: { color: colors.amber },
              tickfont: { size: 11, color: colors.amber },
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            annotations: [{
              x: 0.02, y: 0.98, xref: 'paper', yref: 'paper',
              text: `30d Correlation: ${btcGoldCorrelation?.toFixed(2) ?? 'N/A'}`,
              showarrow: false,
              font: { size: 12, color: colors.slate },
              bgcolor: 'rgba(255,255,255,0.9)',
              borderpad: 4,
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* DeFi Yield vs Treasury Yield with Spread */}
      <ChartCard title="DeFi Yield vs Treasury Yield" subtitle="Treasury yield over time with current DeFi median overlay">
        <Plot
          data={[
            {
              x: treasuryTimeSeries.map(d => d.date),
              y: treasuryTimeSeries.map(d => d.value),
              type: 'scatter',
              mode: 'lines',
              name: '13-Week Treasury',
              line: { color: colors.primary, width: 2 },
              hovertemplate: 'Treasury: %{y:.2f}%<extra></extra>',
            },
            medianDefiApy !== null ? {
              x: treasuryTimeSeries.map(d => d.date),
              y: treasuryTimeSeries.map(() => medianDefiApy),
              type: 'scatter',
              mode: 'lines',
              name: `DeFi Median APY (${medianDefiApy.toFixed(2)}%)`,
              line: { color: colors.secondary, width: 2, dash: 'dash' },
              hovertemplate: 'DeFi APY: %{y:.2f}%<extra></extra>',
            } : null,
            medianDefiApy !== null ? {
              x: treasuryTimeSeries.map(d => d.date),
              y: treasuryTimeSeries.map(d => medianDefiApy - d.value),
              type: 'scatter',
              mode: 'lines',
              name: 'Risk Premium (spread)',
              fill: 'tozeroy',
              line: { color: colors.success, width: 1 },
              fillcolor: 'rgba(16,185,129,0.2)',
              yaxis: 'y2',
              hovertemplate: 'Spread: %{y:.2f}%<extra></extra>',
            } : null,
          ].filter(Boolean)}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'Yield (%)' },
            yaxis2: {
              title: 'Spread (%)',
              overlaying: 'y',
              side: 'right',
              gridcolor: 'transparent',
              titlefont: { color: colors.success },
              tickfont: { size: 11, color: colors.success },
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.1 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Dollar Index vs BTC Scatter */}
      {dxyBtcAligned.dates.length > 0 && (
        <ChartCard title="Dollar Index vs BTC" subtitle="Scatter plot showing inverse correlation — color = time (darker = more recent)">
          <Plot
            data={[{
              x: dxyBtcAligned.values1,
              y: dxyBtcAligned.values2,
              text: dxyBtcAligned.dates,
              mode: 'markers',
              type: 'scatter',
              marker: {
                color: dxyBtcAligned.dates.map((_, i) => i / dxyBtcAligned.dates.length),
                colorscale: [[0, 'rgba(37,99,235,0.2)'], [1, 'rgba(37,99,235,1)']],
                size: 8,
                opacity: 0.7,
                colorbar: { title: 'Time', tickvals: [0, 1], ticktext: ['Old', 'Recent'], thickness: 12, len: 0.5 },
              },
              hovertemplate: 'Date: %{text}<br>DXY: %{x:.2f}<br>BTC: $%{y:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 400,
              xaxis: { ...defaultLayout.xaxis, title: 'Dollar Index (DXY)' },
              yaxis: { ...defaultLayout.yaxis, title: 'BTC Price (USD)' },
              annotations: [{
                x: 0.02, y: 0.98, xref: 'paper', yref: 'paper',
                text: `30d Correlation: ${btcDxyCorrelation?.toFixed(2) ?? 'N/A'}`,
                showarrow: false,
                font: { size: 12, color: colors.slate },
                bgcolor: 'rgba(255,255,255,0.9)',
                borderpad: 4,
              }],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* VIX vs Crypto Fear & Greed */}
      {vixFngAligned.dates.length > 0 && (
        <ChartCard title="VIX vs Crypto Fear & Greed" subtitle="Dual-axis: VIX (left, inverted scale), Fear & Greed (right)">
          <Plot
            data={[
              {
                x: vixFngAligned.dates,
                y: vixFngAligned.values1,
                type: 'scatter',
                mode: 'lines',
                name: 'VIX',
                line: { color: colors.danger, width: 2 },
                yaxis: 'y',
                hovertemplate: 'VIX: %{y:.2f}<extra></extra>',
              },
              {
                x: vixFngAligned.dates,
                y: vixFngAligned.values2,
                type: 'scatter',
                mode: 'lines',
                name: 'Fear & Greed',
                line: { color: colors.success, width: 2 },
                fill: 'tozeroy',
                fillcolor: 'rgba(16,185,129,0.1)',
                yaxis: 'y2',
                hovertemplate: 'F&G: %{y}<extra></extra>',
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 400,
              yaxis: { 
                ...defaultLayout.yaxis, 
                title: 'VIX', 
                side: 'left',
                autorange: 'reversed',
                titlefont: { color: colors.danger },
                tickfont: { color: colors.danger },
              },
              yaxis2: {
                title: 'Fear & Greed Index',
                overlaying: 'y',
                side: 'right',
                range: [0, 100],
                gridcolor: 'transparent',
                titlefont: { color: colors.success },
                tickfont: { size: 11, color: colors.success },
              },
              legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
              shapes: [
                { type: 'line', y0: 25, y1: 25, x0: 0, x1: 1, xref: 'paper', yref: 'y2', line: { color: colors.danger, width: 1, dash: 'dot' } },
                { type: 'line', y0: 75, y1: 75, x0: 0, x1: 1, xref: 'paper', yref: 'y2', line: { color: colors.success, width: 1, dash: 'dot' } },
              ],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Correlation Matrix as Bar Chart Heatmap */}
      <ChartCard title="30-Day Rolling Correlation Matrix" subtitle="Cross-asset correlations: BTC, S&P 500, Gold, DXY, VIX">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border)">
                <th className="py-3 px-4 text-left font-medium text-(--color-text-secondary)"></th>
                <th className="py-3 px-4 text-center font-medium text-(--color-text-secondary)">BTC</th>
                <th className="py-3 px-4 text-center font-medium text-(--color-text-secondary)">S&P</th>
                <th className="py-3 px-4 text-center font-medium text-(--color-text-secondary)">Gold</th>
                <th className="py-3 px-4 text-center font-medium text-(--color-text-secondary)">DXY</th>
                <th className="py-3 px-4 text-center font-medium text-(--color-text-secondary)">VIX</th>
              </tr>
            </thead>
            <tbody>
              {correlationMatrix.map((row, i) => (
                <tr key={row.name} className="border-b border-(--color-border) last:border-0">
                  <td className="py-3 px-4 font-medium">{row.name}</td>
                  {['btc', 'sp', 'gold', 'dxy', 'vix'].map((col, j) => {
                    const val = row[col]
                    const isIdentity = i === j
                    return (
                      <td key={col} className="py-2 px-2 text-center">
                        <div className="relative h-8 flex items-center justify-center">
                          {!isIdentity && val !== null && (
                            <div 
                              className="absolute inset-0 rounded"
                              style={{ 
                                backgroundColor: getCorrelationColor(val),
                                opacity: Math.abs(val) * 0.4,
                              }}
                            />
                          )}
                          <span className={`relative z-10 font-mono text-sm ${isIdentity ? 'text-(--color-text-secondary)' : ''}`}>
                            {isIdentity ? '1.00' : val !== null ? val.toFixed(2) : '—'}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-(--color-text-secondary)">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: colors.success, opacity: 0.6 }} /> Strong positive
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: colors.warning, opacity: 0.6 }} /> Weak positive
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: colors.danger, opacity: 0.6 }} /> Negative
            </span>
          </div>
        </div>
      </ChartCard>

      {/* MVRV Chart (if data available) */}
      {mvrvTimeSeries.length > 0 && (
        <ChartCard title="BTC MVRV Ratio (Santiment)" subtitle="Market Value to Realized Value — on-chain valuation metric">
          <Plot
            data={[
              {
                x: mvrvTimeSeries.map(d => d.date),
                y: mvrvTimeSeries.map(d => d.value),
                type: 'scatter',
                mode: 'lines',
                name: 'MVRV',
                line: { color: colors.primary, width: 2 },
                fill: 'tozeroy',
                fillcolor: 'rgba(37,99,235,0.1)',
                hovertemplate: '%{x}<br>MVRV: %{y:.2f}<extra></extra>',
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 350,
              yaxis: { ...defaultLayout.yaxis, title: 'MVRV Ratio' },
              shapes: [
                { type: 'line', y0: 1, y1: 1, x0: 0, x1: 1, xref: 'paper', yref: 'y', line: { color: colors.success, width: 2, dash: 'dash' } },
                { type: 'line', y0: 3.5, y1: 3.5, x0: 0, x1: 1, xref: 'paper', yref: 'y', line: { color: colors.danger, width: 2, dash: 'dash' } },
              ],
              annotations: [
                { x: 1, y: 1, xref: 'paper', yref: 'y', text: 'Undervalued', showarrow: false, font: { size: 10, color: colors.success }, xanchor: 'right' },
                { x: 1, y: 3.5, xref: 'paper', yref: 'y', text: 'Overvalued', showarrow: false, font: { size: 10, color: colors.danger }, xanchor: 'right' },
              ],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Fear & Greed Historical */}
      {fngTimeSeries.length > 0 && (
        <ChartCard title="Crypto Fear & Greed Index — Historical" subtitle="365-day sentiment history">
          <Plot
            data={[{
              x: fngTimeSeries.map(d => d.date),
              y: fngTimeSeries.map(d => d.value),
              type: 'scatter',
              mode: 'lines',
              fill: 'tozeroy',
              line: { color: colors.secondary, width: 1.5 },
              fillcolor: 'rgba(139,92,246,0.1)',
              hovertemplate: '%{x}<br>F&G: %{y}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 300,
              yaxis: { ...defaultLayout.yaxis, title: 'Fear & Greed Index', range: [0, 100] },
              shapes: [
                { type: 'rect', y0: 0, y1: 25, x0: 0, x1: 1, xref: 'paper', yref: 'y', fillcolor: 'rgba(239,68,68,0.1)', line: { width: 0 } },
                { type: 'rect', y0: 75, y1: 100, x0: 0, x1: 1, xref: 'paper', yref: 'y', fillcolor: 'rgba(16,185,129,0.1)', line: { width: 0 } },
              ],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Narrative Box */}
      <NarrativeBox title="Macro Correlations Analysis">
        <p>
          <strong>Risk Premium:</strong> The spread between DeFi yields and US Treasuries is 
          <strong> {cryptoRiskPremium !== null ? `${(cryptoRiskPremium * 100).toFixed(0)} bps` : 'N/A'}</strong>, 
          suggesting {spreadInterpretation}.
        </p>
        <p>
          <strong>Equity Correlation:</strong> BTC's 30-day correlation with S&P 500 is <strong>{correlationTrend}</strong> ({btcSpCorrelation?.toFixed(2) || 'N/A'}). 
          BTC is currently {btcGoldCorrelation !== null && btcGoldCorrelation > 0.3 ? 'positively correlated with gold' : 'showing independent price action from gold'}, {goldNarrative}.
        </p>
        <p>
          <strong>Dollar Impact:</strong> BTC-DXY correlation is {btcDxyCorrelation?.toFixed(2) || 'N/A'} — 
          {btcDxyCorrelation !== null && btcDxyCorrelation < -0.3 
            ? 'a strong dollar headwind is present, consistent with historical patterns.'
            : btcDxyCorrelation !== null && btcDxyCorrelation > 0.3
              ? 'unusually positive correlation suggests macro regime shift.'
              : 'correlation is weak, suggesting other factors dominate price action.'}
        </p>
        <p>
          <strong>Regime:</strong> Current environment is <strong>{macroRegime.regime}</strong>. 
          {macroRegime.regime === 'Risk-On' 
            ? ' Risk assets including crypto tend to outperform as capital seeks higher returns.' 
            : macroRegime.regime === 'Risk-Off'
              ? ' Defensive positioning warranted as capital seeks safety.'
              : ' Mixed signals suggest cautious positioning with focus on fundamentals.'}
          {currentMVRV !== null && (
            <> MVRV at {currentMVRV.toFixed(2)} suggests BTC is {currentMVRV > 3 ? 'overvalued' : currentMVRV < 1 ? 'undervalued' : 'fairly valued'} on-chain.</>
          )}
        </p>
      </NarrativeBox>
    </div>
  )
}
