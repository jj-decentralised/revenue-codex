import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatPercent } from '../../utils/helpers'

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

// Classify macro regime based on indicators
function classifyMacroRegime(treasuryYield, dxyLevel, btcChange30d, defiSpread) {
  // Risk-On: low yields (<4%), weak dollar (DXY <100), positive crypto momentum, high DeFi spread
  // Risk-Off: high yields (>5%), strong dollar (DXY >105), negative crypto, low DeFi spread
  // Transition: mixed signals
  
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
  
  if (riskOnSignals >= 3) return { regime: 'Risk-On', color: colors.success }
  if (riskOffSignals >= 3) return { regime: 'Risk-Off', color: colors.danger }
  return { regime: 'Transition', color: colors.warning }
}

export default function MacroTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchAllData() {
      const results = await Promise.allSettled([
        // BTC historical data (365 days)
        fetch('/api/coingecko?action=coin_chart&coin_id=bitcoin&days=365').then(r => r.json()),
        // Global crypto market data
        fetch('/api/coingecko?action=global').then(r => r.json()),
        // S&P 500 historical
        fetch('/api/yahoo?action=historical&symbol=^GSPC&period=1y').then(r => r.json()),
        // 13-week Treasury yield historical
        fetch('/api/yahoo?action=historical&symbol=^IRX&period=1y').then(r => r.json()),
        // S&P 500 current quote
        fetch('/api/yahoo?action=quote&symbol=^GSPC').then(r => r.json()),
        // Dollar Index quote
        fetch('/api/yahoo?action=quote&symbol=DX-Y.NYB').then(r => r.json()),
        // DeFiLlama pools for yield data
        fetch('https://api.llama.fi/pools').then(r => r.json()),
      ])

      const [btcChart, globalData, spHistory, treasuryHistory, spQuote, dxyQuote, defiPools] = results

      return {
        btcChart: btcChart.status === 'fulfilled' ? btcChart.value : null,
        globalData: globalData.status === 'fulfilled' ? globalData.value : null,
        spHistory: spHistory.status === 'fulfilled' ? spHistory.value : null,
        treasuryHistory: treasuryHistory.status === 'fulfilled' ? treasuryHistory.value : null,
        spQuote: spQuote.status === 'fulfilled' ? spQuote.value : null,
        dxyQuote: dxyQuote.status === 'fulfilled' ? dxyQuote.value : null,
        defiPools: defiPools.status === 'fulfilled' ? defiPools.value : null,
      }
    }

    fetchAllData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading macro correlations data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  // Process BTC data
  const btcPrices = data?.btcChart?.prices || []
  const btcTimeSeries = btcPrices.map(([ts, price]) => ({
    date: new Date(ts).toISOString().split('T')[0],
    value: price,
  }))
  const currentBtcPrice = btcTimeSeries.length > 0 ? btcTimeSeries[btcTimeSeries.length - 1].value : null
  const btcPrice30dAgo = btcTimeSeries.length > 30 ? btcTimeSeries[btcTimeSeries.length - 31]?.value : null
  const btcChange30d = currentBtcPrice && btcPrice30dAgo ? ((currentBtcPrice - btcPrice30dAgo) / btcPrice30dAgo) * 100 : null

  // Process S&P 500 data
  const spHistoricalData = data?.spHistory?.historical || data?.spHistory?.quotes || []
  const spTimeSeries = spHistoricalData.map(d => ({
    date: d.date || new Date(d.timestamp * 1000).toISOString().split('T')[0],
    value: d.close || d.adjclose || d.price,
  })).filter(d => d.value)
  const currentSP = data?.spQuote?.price || data?.spQuote?.regularMarketPrice || 
    (spTimeSeries.length > 0 ? spTimeSeries[spTimeSeries.length - 1].value : null)

  // Process Treasury yield data
  const treasuryHistoricalData = data?.treasuryHistory?.historical || data?.treasuryHistory?.quotes || []
  const treasuryTimeSeries = treasuryHistoricalData.map(d => ({
    date: d.date || new Date(d.timestamp * 1000).toISOString().split('T')[0],
    value: d.close || d.adjclose || d.price,
  })).filter(d => d.value)
  const currentTreasuryYield = treasuryTimeSeries.length > 0 
    ? treasuryTimeSeries[treasuryTimeSeries.length - 1].value 
    : null

  // Process DXY data
  const currentDXY = data?.dxyQuote?.price || data?.dxyQuote?.regularMarketPrice || null

  // Process DeFi yields - filter for stablecoin lending pools
  const defiPoolsData = data?.defiPools?.data || data?.defiPools || []
  const stablecoinPools = Array.isArray(defiPoolsData) 
    ? defiPoolsData.filter(p => 
        p.stablecoin === true && 
        p.apy > 0 && 
        p.apy < 100 && // Filter outliers
        p.tvlUsd > 1000000 // Only pools with >$1M TVL
      )
    : []
  
  // Calculate median DeFi yield
  const defiApys = stablecoinPools.map(p => p.apy).sort((a, b) => a - b)
  const medianDefiApy = defiApys.length > 0 
    ? defiApys[Math.floor(defiApys.length / 2)] 
    : null

  // Calculate crypto risk premium (DeFi yield - Treasury yield)
  const cryptoRiskPremium = medianDefiApy !== null && currentTreasuryYield !== null
    ? medianDefiApy - currentTreasuryYield
    : null

  // Calculate BTC-S&P correlation
  const aligned = btcTimeSeries.length > 0 && spTimeSeries.length > 0
    ? alignTimeSeries(btcTimeSeries, spTimeSeries)
    : null
  const btcSpCorrelation = aligned ? calculateCorrelation(aligned.values1, aligned.values2) : null

  // Macro regime classification
  const macroRegime = classifyMacroRegime(currentTreasuryYield, currentDXY, btcChange30d, cryptoRiskPremium)

  // Prepare chart data for BTC vs S&P
  const btcDates = btcTimeSeries.map(d => d.date)
  const btcValues = btcTimeSeries.map(d => d.value)
  const spDates = spTimeSeries.map(d => d.date)
  const spValues = spTimeSeries.map(d => d.value)

  // Prepare DeFi vs Treasury chart (use current values as snapshot)
  const yieldComparison = [
    { category: 'DeFi Median APY', value: medianDefiApy || 0 },
    { category: '13-Week Treasury', value: currentTreasuryYield || 0 },
    { category: 'Risk Premium', value: cryptoRiskPremium || 0 },
  ]

  // Prepare DXY vs BTC scatter data (use aligned data)
  // For scatter, we need DXY historical which we may not have - use BTC time series colored by date
  const scatterDates = btcTimeSeries.slice(-90) // Last 90 days
  const dateColorScale = scatterDates.map((_, i) => i / scatterDates.length)

  // Generate narrative
  const correlationTrend = btcSpCorrelation !== null 
    ? (btcSpCorrelation > 0.6 ? 'strong' : btcSpCorrelation > 0.3 ? 'moderate' : 'weak')
    : 'unknown'
  const riskAssetBehavior = btcSpCorrelation !== null && btcSpCorrelation > 0.5 
    ? 'behaving as' 
    : 'decoupling from'
  const spreadInterpretation = cryptoRiskPremium !== null
    ? (cryptoRiskPremium > 5 
        ? 'genuine on-chain demand or elevated risk compensation' 
        : cryptoRiskPremium < 2 
          ? 'rational capital may flow to risk-free TradFi alternatives'
          : 'moderate risk-adjusted opportunity in DeFi')
    : 'insufficient data to assess'

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard 
          title="BTC Price" 
          value={formatCurrency(currentBtcPrice)} 
          subtitle="Current"
          trend={btcChange30d}
        />
        <KPICard 
          title="S&P 500" 
          value={currentSP ? currentSP.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'} 
          subtitle="Index level"
        />
        <KPICard 
          title="13-Week T-Bill" 
          value={currentTreasuryYield !== null ? `${currentTreasuryYield.toFixed(2)}%` : '—'} 
          subtitle="Risk-free rate"
        />
        <KPICard 
          title="DeFi Median APY" 
          value={medianDefiApy !== null ? `${medianDefiApy.toFixed(2)}%` : '—'} 
          subtitle="Stablecoin pools"
        />
        <KPICard 
          title="BTC-S&P Correlation" 
          value={btcSpCorrelation !== null ? btcSpCorrelation.toFixed(2) : '—'} 
          subtitle="365-day rolling"
        />
      </div>

      {/* Macro Regime Badge */}
      <div className="bg-white border border-(--color-border) rounded-lg p-6 text-center">
        <p className="text-xs font-medium text-(--color-text-secondary) uppercase tracking-wide mb-2">
          Current Macro Regime
        </p>
        <span 
          className="inline-block px-6 py-3 rounded-full text-white text-xl font-bold"
          style={{ backgroundColor: macroRegime.color }}
        >
          {macroRegime.regime}
        </span>
        <p className="text-sm text-(--color-text-secondary) mt-3">
          Based on Treasury yields, Dollar strength, crypto momentum, and DeFi spreads
        </p>
      </div>

      {/* Risk Premium KPI (prominent display) */}
      {cryptoRiskPremium !== null && (
        <div className="bg-white border border-(--color-border) rounded-lg p-5 text-center">
          <p className="text-xs font-medium text-(--color-text-secondary) uppercase tracking-wide">
            Crypto Risk Premium
          </p>
          <p className="text-4xl font-bold mt-2" style={{ color: cryptoRiskPremium > 3 ? colors.success : cryptoRiskPremium < 1 ? colors.danger : colors.warning }}>
            {(cryptoRiskPremium * 100).toFixed(0)} bps
          </p>
          <p className="text-sm text-(--color-text-secondary) mt-1">
            DeFi Yield ({medianDefiApy?.toFixed(2)}%) − Treasury ({currentTreasuryYield?.toFixed(2)}%)
          </p>
        </div>
      )}

      {/* BTC vs S&P 500 Dual-Axis Chart */}
      <ChartCard title="BTC vs S&P 500" subtitle="Dual-axis comparison — BTC (left), S&P 500 (right)">
        <Plot
          data={[
            {
              x: btcDates,
              y: btcValues,
              type: 'scatter',
              mode: 'lines',
              name: 'BTC',
              line: { color: colors.warning, width: 2 },
              yaxis: 'y',
              hovertemplate: 'BTC: $%{y:,.0f}<extra></extra>',
            },
            {
              x: spDates,
              y: spValues,
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
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* DeFi Yield vs Treasury Yield */}
      <ChartCard title="DeFi Yield vs Treasury Yield" subtitle="Current snapshot — the spread represents crypto risk premium">
        <Plot
          data={[
            {
              x: yieldComparison.map(d => d.category),
              y: yieldComparison.map(d => d.value),
              type: 'bar',
              marker: { 
                color: [colors.secondary, colors.primary, cryptoRiskPremium > 3 ? colors.success : cryptoRiskPremium < 1 ? colors.danger : colors.warning],
              },
              text: yieldComparison.map(d => `${d.value.toFixed(2)}%`),
              textposition: 'outside',
              hovertemplate: '%{x}: %{y:.2f}%<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 300,
            yaxis: { ...defaultLayout.yaxis, title: 'Yield (%)', range: [0, Math.max(...yieldComparison.map(d => d.value)) * 1.3] },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Treasury Yield Time Series */}
      {treasuryTimeSeries.length > 0 && (
        <ChartCard title="13-Week Treasury Yield — Historical" subtitle="US risk-free rate over time">
          <Plot
            data={[{
              x: treasuryTimeSeries.map(d => d.date),
              y: treasuryTimeSeries.map(d => d.value),
              type: 'scatter',
              mode: 'lines',
              fill: 'tozeroy',
              line: { color: colors.primary, width: 1.5 },
              fillcolor: 'rgba(37,99,235,0.1)',
              hovertemplate: '%{x}<br>Yield: %{y:.2f}%<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 300,
              yaxis: { ...defaultLayout.yaxis, title: 'Yield (%)' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Dollar Index vs BTC Scatter */}
      <ChartCard title="BTC Price Over Time (for DXY Correlation)" subtitle="Color intensity = recency (darker = more recent) · Use alongside DXY tracking">
        <Plot
          data={[{
            x: scatterDates.map((_, i) => i),
            y: scatterDates.map(d => d.value),
            text: scatterDates.map(d => d.date),
            mode: 'markers',
            type: 'scatter',
            marker: {
              color: dateColorScale,
              colorscale: [[0, 'rgba(37,99,235,0.3)'], [1, 'rgba(37,99,235,1)']],
              size: 10,
              opacity: 0.8,
              colorbar: { title: 'Time', tickvals: [0, 1], ticktext: ['90d ago', 'Today'], thickness: 12, len: 0.5 },
            },
            hovertemplate: 'Date: %{text}<br>BTC: $%{y:,.0f}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, title: 'Days (0 = 90 days ago)', showgrid: false },
            yaxis: { ...defaultLayout.yaxis, title: 'BTC Price (USD)' },
            annotations: currentDXY ? [{
              x: 0.02,
              y: 0.98,
              xref: 'paper',
              yref: 'paper',
              text: `Current DXY: ${currentDXY.toFixed(2)}`,
              showarrow: false,
              font: { size: 12, color: colors.slate },
              bgcolor: 'rgba(255,255,255,0.8)',
              borderpad: 4,
            }] : [],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Narrative Box */}
      <NarrativeBox title="Macro Correlations Analysis">
        <p>
          The crypto risk premium — the spread between DeFi yields and US Treasuries — is the single most important 
          metric for capital allocation. When DeFi yields compress to &lt;2% above Treasuries, rational capital flows 
          to TradFi (risk-free). When the spread widens &gt;5%, it signals either genuine on-chain demand or 
          unsustainable incentive spending.
        </p>
        <p>
          Currently the spread is <strong>{cryptoRiskPremium !== null ? `${(cryptoRiskPremium * 100).toFixed(0)} bps` : 'N/A'}</strong>, 
          suggesting {spreadInterpretation}.
        </p>
        <p>
          BTC correlation with S&P 500 is currently <strong>{correlationTrend}</strong> ({btcSpCorrelation?.toFixed(2) || 'N/A'}), 
          meaning crypto is {riskAssetBehavior} a traditional risk asset. In {macroRegime.regime.toLowerCase()} environments, 
          {macroRegime.regime === 'Risk-On' 
            ? ' risk assets including crypto tend to outperform as capital seeks higher returns.' 
            : macroRegime.regime === 'Risk-Off'
              ? ' defensive positioning and quality assets tend to outperform as capital seeks safety.'
              : ' mixed signals warrant cautious positioning with a focus on fundamentals over momentum.'}
        </p>
      </NarrativeBox>
    </div>
  )
}
