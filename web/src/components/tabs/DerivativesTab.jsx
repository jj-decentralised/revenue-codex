import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/helpers'

// Tracked coins for OI and Long/Short data
const OI_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'AVAX']
const LONG_SHORT_COINS = ['BTC', 'ETH', 'SOL']
const ALL_DISPLAY_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'AVAX', 'ADA', 'LINK']

async function fetchAllDerivativesData() {
  const parseResult = async (result) => {
    if (result.status === 'fulfilled' && result.value.ok) {
      return result.value.json()
    }
    return null
  }

  // Build all fetch promises
  const fetchPromises = [
    // Coinglass endpoints
    fetch('/api/coinglass?action=funding'),
    fetch('/api/coinglass?action=liquidation'),
    fetch('/api/coinglass?action=etf'),
    fetch('/api/coinglass?action=oi_exchange&symbol=BTC'),
    // OI for each tracked coin
    ...OI_COINS.map(symbol => fetch(`/api/coinglass?action=oi&symbol=${symbol}&range=4h`)),
    // Long/Short for BTC, ETH, SOL
    ...LONG_SHORT_COINS.map(symbol => fetch(`/api/coinglass?action=longshort&symbol=${symbol}&range=4h`)),
    // DeFiLlama endpoints
    fetch('https://api.llama.fi/overview/derivatives'),
    fetch('https://api.llama.fi/overview/options'),
  ]

  const results = await Promise.allSettled(fetchPromises)

  // Parse results in order
  let idx = 0
  const funding = await parseResult(results[idx++])
  const liquidation = await parseResult(results[idx++])
  const etf = await parseResult(results[idx++])
  const oiExchange = await parseResult(results[idx++])

  // OI data per coin
  const oiData = {}
  for (const symbol of OI_COINS) {
    oiData[symbol] = await parseResult(results[idx++])
  }

  // Long/Short data per coin
  const longShortData = {}
  for (const symbol of LONG_SHORT_COINS) {
    longShortData[symbol] = await parseResult(results[idx++])
  }

  // DeFiLlama data
  const defiDerivatives = await parseResult(results[idx++])
  const defiOptions = await parseResult(results[idx++])

  return {
    funding,
    liquidation,
    etf,
    oiExchange,
    oiData,
    longShortData,
    defiDerivatives,
    defiOptions,
  }
}

function getFundingColor(rate) {
  if (rate === null || rate === undefined) return '#9CA3AF'
  if (rate < -0.01) return colors.success // Strong negative (shorts pay longs)
  if (rate < 0) return '#86EFAC' // Light green
  if (rate > 0.1) return colors.danger // High positive (longs pay shorts)
  if (rate > 0.05) return '#FCA5A5' // Light red
  if (rate > 0.01) return colors.warning // Moderate
  return '#FDE68A' // Light yellow
}

const EXCHANGE_COLORS = {
  Binance: '#F3BA2F',
  OKX: '#FFFFFF',
  Bybit: '#F7A600',
  Bitget: '#00E5BE',
  dYdX: '#6966FF',
  Hyperliquid: '#00D4AA',
  CME: '#00A0DC',
  Deribit: '#00CC66',
  Bitmex: '#FF4444',
  Huobi: '#1A7FDB',
  Kraken: '#5741D9',
  Gate: '#17E6A1',
}

export default function DerivativesTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAllDerivativesData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading derivatives data from Coinglass & DeFiLlama..." />

  // Check if we have any data at all
  const hasCoinglassData = data && (data.funding || data.liquidation || data.etf || data.oiExchange ||
    Object.values(data.oiData || {}).some(v => v) || Object.values(data.longShortData || {}).some(v => v))
  const hasDefiLlamaData = data && (data.defiDerivatives || data.defiOptions)
  const hasAnyData = hasCoinglassData || hasDefiLlamaData

  if (!hasAnyData) {
    return (
      <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-center">
          <p className="text-amber-800 font-medium">Derivatives Data Unavailable</p>
          <p className="text-amber-600 text-sm mt-1">
            Configure Coinglass API proxy for on-chain derivatives data, or check DeFiLlama connectivity.
          </p>
        </div>
        <NarrativeBox title="Derivatives Intelligence">
          <p>
            Derivatives data reveals the leveraged positioning that drives crypto revenue. When funding rates spike &gt;0.1%, 
            it signals extreme greed — perp DEXs like Hyperliquid earn outsized revenue from these imbalanced markets.
          </p>
          <p>
            Liquidation cascades generate fee windfalls for lending protocols (Aave) and DEXs simultaneously. 
            ETF flows represent the new bridge between TradFi capital allocation and on-chain activity.
          </p>
        </NarrativeBox>
      </div>
    )
  }

  // === EXTRACT & PROCESS DATA ===

  // Funding data
  const fundingData = data?.funding?.data || []
  const btcFunding = fundingData.find(d => d.symbol === 'BTC')
  const ethFunding = fundingData.find(d => d.symbol === 'ETH')
  const currentBtcFundingRate = btcFunding?.uMarginList?.[0]?.rate ?? null
  const currentEthFundingRate = ethFunding?.uMarginList?.[0]?.rate ?? null

  // Funding rates for heatmap
  const fundingRates = ALL_DISPLAY_COINS.map(symbol => {
    const coinData = fundingData.find(d => d.symbol === symbol)
    const exchanges = coinData?.uMarginList || []
    return {
      symbol,
      avgRate: exchanges.length > 0
        ? (exchanges.reduce((s, e) => s + e.rate, 0) / exchanges.length) * 100
        : null,
    }
  })

  // OI data aggregation
  const oiByCoins = OI_COINS.map(symbol => {
    const coinOiData = data?.oiData?.[symbol]?.data || []
    const latestOI = coinOiData.length > 0 ? coinOiData[coinOiData.length - 1]?.openInterest || 0 : 0
    return { symbol, oi: latestOI }
  })
  const totalOIAllCoins = oiByCoins.reduce((sum, c) => sum + c.oi, 0)

  // BTC OI time series for reference
  const btcOiTimeSeries = (data?.oiData?.BTC?.data || []).map(d => ({
    time: new Date(d.createTime).toISOString(),
    oi: d.openInterest,
    price: d.price,
  }))

  // OI by exchange (BTC)
  const oiExchangeData = data?.oiExchange?.data || []
  const oiByExchange = oiExchangeData
    .filter(d => d.openInterest > 0)
    .sort((a, b) => b.openInterest - a.openInterest)
    .slice(0, 10)

  // Liquidation data
  const liquidationData = data?.liquidation?.data || []
  const totalLongLiq = liquidationData.reduce((s, d) => s + (d.longLiquidationUsd || 0), 0)
  const totalShortLiq = liquidationData.reduce((s, d) => s + (d.shortLiquidationUsd || 0), 0)
  const total24hLiquidations = totalLongLiq + totalShortLiq
  const topLiquidated = [...liquidationData]
    .sort((a, b) => (b.longLiquidationUsd + b.shortLiquidationUsd) - (a.longLiquidationUsd + a.shortLiquidationUsd))
    .slice(0, 12)

  // Long/Short ratio data
  const longShortTimeSeries = {}
  let btcLongShortCurrent = null
  for (const symbol of LONG_SHORT_COINS) {
    const lsData = data?.longShortData?.[symbol]?.data || []
    longShortTimeSeries[symbol] = lsData.map(d => ({
      time: new Date(d.createTime).toISOString(),
      ratio: d.longShortRatio,
    }))
    if (symbol === 'BTC' && lsData.length > 0) {
      btcLongShortCurrent = lsData[lsData.length - 1]?.longShortRatio ?? null
    }
  }

  // ETF flows
  const etfData = data?.etf?.data || []
  const etfFlows = etfData.slice(-30).map(d => ({
    date: d.date || new Date(d.createTime).toISOString().split('T')[0],
    netflow: d.netflow || d.totalNetflow || 0,
  }))

  // DeFiLlama derivatives protocols
  const defiProtocols = data?.defiDerivatives?.protocols || []
  const topDerivativesProtocols = [...defiProtocols]
    .filter(p => p.dailyRevenue && p.dailyRevenue > 0)
    .sort((a, b) => (b.dailyRevenue || 0) - (a.dailyRevenue || 0))
    .slice(0, 10)

  // DeFiLlama options protocols
  const optionsProtocols = data?.defiOptions?.protocols || []
  const topOptionsProtocols = [...optionsProtocols]
    .filter(p => p.dailyVolume && p.dailyVolume > 0)
    .sort((a, b) => (b.dailyVolume || 0) - (a.dailyVolume || 0))
    .slice(0, 8)

  // Build Long/Short chart traces
  const longShortTraces = LONG_SHORT_COINS.map((symbol, idx) => {
    const ts = longShortTimeSeries[symbol] || []
    const lineColors = [colors.primary, colors.secondary, colors.warning]
    return {
      x: ts.map(d => d.time),
      y: ts.map(d => d.ratio),
      type: 'scatter',
      mode: 'lines',
      name: symbol,
      line: { color: lineColors[idx], width: 2 },
      hovertemplate: `${symbol}: %{y:.2f}<extra></extra>`,
    }
  })

  // Reference line timestamps for long/short chart
  const allLSTimes = LONG_SHORT_COINS.flatMap(s => (longShortTimeSeries[s] || []).map(d => d.time))
  const minLSTime = allLSTimes.length > 0 ? allLSTimes[0] : null
  const maxLSTime = allLSTimes.length > 0 ? allLSTimes[allLSTimes.length - 1] : null

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard
          title="Total Open Interest"
          value={formatCurrency(totalOIAllCoins)}
          subtitle={`Across ${OI_COINS.length} coins`}
        />
        <KPICard
          title="24h Liquidations"
          value={formatCurrency(total24hLiquidations)}
          subtitle={`L: ${formatCurrency(totalLongLiq)} / S: ${formatCurrency(totalShortLiq)}`}
        />
        <KPICard
          title="BTC Funding Rate"
          value={currentBtcFundingRate !== null ? `${(currentBtcFundingRate * 100).toFixed(4)}%` : '—'}
          subtitle={currentBtcFundingRate > 0.0001 ? 'Longs pay shorts' : currentBtcFundingRate < -0.0001 ? 'Shorts pay longs' : 'Neutral'}
          trend={currentBtcFundingRate !== null ? currentBtcFundingRate * 10000 : null}
        />
        <KPICard
          title="ETH Funding Rate"
          value={currentEthFundingRate !== null ? `${(currentEthFundingRate * 100).toFixed(4)}%` : '—'}
          subtitle={currentEthFundingRate > 0.0001 ? 'Longs pay shorts' : currentEthFundingRate < -0.0001 ? 'Shorts pay longs' : 'Neutral'}
          trend={currentEthFundingRate !== null ? currentEthFundingRate * 10000 : null}
        />
        <KPICard
          title="BTC Long/Short Ratio"
          value={btcLongShortCurrent !== null ? btcLongShortCurrent.toFixed(2) : '—'}
          subtitle={btcLongShortCurrent > 1.5 ? 'Overleveraged long' : btcLongShortCurrent < 0.7 ? 'Overleveraged short' : 'Balanced'}
          trend={btcLongShortCurrent !== null ? (btcLongShortCurrent - 1) * 100 : null}
        />
      </div>

      {/* Funding Rate Heatmap */}
      <ChartCard
        title="Funding Rate Heatmap"
        subtitle="Multi-coin funding rates — green: negative (shorts pay longs), red: high positive (longs pay shorts)"
        csvData={{ filename: 'funding-rates', headers: ['Symbol','AvgFundingRate%'], rows: fundingRates.map(d => [d.symbol, d.avgRate?.toFixed(4)]) }}
      >
        <Plot
          data={[{
            x: fundingRates.map(d => d.symbol),
            y: fundingRates.map(d => d.avgRate),
            type: 'bar',
            marker: {
              color: fundingRates.map(d => getFundingColor(d.avgRate)),
            },
            text: fundingRates.map(d => d.avgRate !== null ? `${d.avgRate.toFixed(4)}%` : '—'),
            textposition: 'outside',
            hovertemplate: '%{x}: %{y:.4f}%<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 320,
            xaxis: { ...defaultLayout.xaxis, type: 'category' },
            yaxis: {
              ...defaultLayout.yaxis,
              title: 'Funding Rate (%)',
              zeroline: true,
              zerolinecolor: colors.slate,
              zerolinewidth: 2,
            },
            shapes: [
              { type: 'line', x0: -0.5, x1: ALL_DISPLAY_COINS.length - 0.5, y0: 0.1, y1: 0.1, line: { color: colors.danger, dash: 'dash', width: 1 } },
              { type: 'line', x0: -0.5, x1: ALL_DISPLAY_COINS.length - 0.5, y0: -0.01, y1: -0.01, line: { color: colors.success, dash: 'dash', width: 1 } },
            ],
            annotations: [
              { x: ALL_DISPLAY_COINS.length - 0.5, y: 0.1, xanchor: 'right', text: 'High (0.1%)', showarrow: false, font: { size: 10, color: colors.danger } },
              { x: ALL_DISPLAY_COINS.length - 0.5, y: -0.01, xanchor: 'right', text: 'Negative', showarrow: false, font: { size: 10, color: colors.success } },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Open Interest by Coin */}
      <ChartCard title="Open Interest by Coin" subtitle="Current OI for tracked coins"
        csvData={{ filename: 'open-interest', headers: ['Symbol','OpenInterest'], rows: oiByCoins.map(d => [d.symbol, d.oi]) }}>
        <Plot
          data={[{
            x: oiByCoins.map(d => d.symbol),
            y: oiByCoins.map(d => d.oi),
            type: 'bar',
            marker: {
              color: oiByCoins.map((_, i) => [
                colors.primary, colors.secondary, colors.warning,
                colors.success, colors.indigo, colors.pink
              ][i % 6]),
            },
            text: oiByCoins.map(d => formatCurrency(d.oi)),
            textposition: 'outside',
            hovertemplate: '%{x}: $%{y:,.0f}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 350,
            xaxis: { ...defaultLayout.xaxis, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'Open Interest (USD)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* OI by Exchange (BTC) */}
      {oiByExchange.length > 0 && (
        <ChartCard title="BTC OI by Exchange" subtitle="Exchange market share of Bitcoin open interest"
          csvData={{ filename: 'btc-oi-by-exchange', headers: ['Exchange','OpenInterest'], rows: oiByExchange.map(d => [d.exchangeName || d.exchange, d.openInterest]) }}>
          <Plot
            data={[{
              labels: oiByExchange.map(d => d.exchangeName || d.exchange),
              values: oiByExchange.map(d => d.openInterest),
              type: 'pie',
              hole: 0.4,
              marker: {
                colors: oiByExchange.map(d => EXCHANGE_COLORS[d.exchangeName || d.exchange] || colors.slate),
              },
              textinfo: 'label+percent',
              hovertemplate: '%{label}: $%{value:,.0f} (%{percent})<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 400,
              showlegend: true,
              legend: { ...defaultLayout.legend, orientation: 'v', x: 1.02, y: 0.5 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Liquidation Bars */}
      <ChartCard title="Liquidation Analysis" subtitle="24h liquidations by coin — Longs (green) vs Shorts (red)"
        csvData={{ filename: 'liquidations', headers: ['Symbol','LongLiquidation','ShortLiquidation'], rows: topLiquidated.map(d => [d.symbol, d.longLiquidationUsd, d.shortLiquidationUsd]) }}>
        <Plot
          data={[
            {
              x: topLiquidated.map(d => d.symbol),
              y: topLiquidated.map(d => d.longLiquidationUsd),
              type: 'bar',
              name: 'Long Liquidations',
              marker: { color: colors.success, opacity: 0.85 },
              hovertemplate: '%{x} Longs: $%{y:,.0f}<extra></extra>',
            },
            {
              x: topLiquidated.map(d => d.symbol),
              y: topLiquidated.map(d => d.shortLiquidationUsd),
              type: 'bar',
              name: 'Short Liquidations',
              marker: { color: colors.danger, opacity: 0.85 },
              hovertemplate: '%{x} Shorts: $%{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 380,
            barmode: 'group',
            xaxis: { ...defaultLayout.xaxis, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'Liquidation Volume (USD)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Long/Short Ratio Lines */}
      <ChartCard title="Long/Short Ratio — BTC, ETH, SOL" subtitle="Time series with reference line at 1.0 — >1.5 overleveraged long, <0.7 overleveraged short">
        <Plot
          data={longShortTraces}
          layout={{
            ...defaultLayout,
            height: 350,
            yaxis: {
              ...defaultLayout.yaxis,
              title: 'Long/Short Ratio',
              range: [0.4, 2.2],
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            shapes: minLSTime && maxLSTime ? [
              { type: 'line', x0: minLSTime, x1: maxLSTime, y0: 1.0, y1: 1.0, line: { color: colors.slate, dash: 'solid', width: 2 } },
              { type: 'line', x0: minLSTime, x1: maxLSTime, y0: 1.5, y1: 1.5, line: { color: colors.danger, dash: 'dash', width: 1 } },
              { type: 'line', x0: minLSTime, x1: maxLSTime, y0: 0.7, y1: 0.7, line: { color: colors.success, dash: 'dash', width: 1 } },
            ] : [],
            annotations: maxLSTime ? [
              { x: maxLSTime, y: 1.0, xanchor: 'left', text: ' Neutral', showarrow: false, font: { size: 10, color: colors.slate } },
              { x: maxLSTime, y: 1.5, xanchor: 'left', text: ' Long Heavy', showarrow: false, font: { size: 10, color: colors.danger } },
              { x: maxLSTime, y: 0.7, xanchor: 'left', text: ' Short Heavy', showarrow: false, font: { size: 10, color: colors.success } },
            ] : [],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* BTC ETF Daily Flows */}
      {etfFlows.length > 0 && (
        <ChartCard title="Bitcoin ETF Daily Flows" subtitle="Net inflows/outflows — green: inflow, red: outflow"
          csvData={{ filename: 'btc-etf-flows', headers: ['Date','NetFlow_USD_M'], rows: etfFlows.map(d => [d.date, d.netflow]) }}>
          <Plot
            data={[{
              x: etfFlows.map(d => d.date),
              y: etfFlows.map(d => d.netflow),
              type: 'bar',
              marker: {
                color: etfFlows.map(d => d.netflow >= 0 ? colors.success : colors.danger),
              },
              hovertemplate: '%{x}<br>Net Flow: $%{y:,.0f}M<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 320,
              yaxis: {
                ...defaultLayout.yaxis,
                title: 'Net Flow (USD millions)',
                zeroline: true,
                zerolinecolor: colors.slate,
                zerolinewidth: 2,
              },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* DeFi Derivatives Revenue */}
      {topDerivativesProtocols.length > 0 && (
        <ChartCard title="DeFi Derivatives Protocol Revenue" subtitle="Top protocols by daily revenue (DeFiLlama)"
          csvData={{ filename: 'defi-derivatives-revenue', headers: ['Protocol','DailyRevenue'], rows: topDerivativesProtocols.map(p => [p.name, p.dailyRevenue]) }}>
          <Plot
            data={[{
              x: topDerivativesProtocols.map(p => p.name),
              y: topDerivativesProtocols.map(p => p.dailyRevenue),
              type: 'bar',
              marker: {
                color: topDerivativesProtocols.map((_, i) =>
                  [colors.primary, colors.secondary, colors.warning, colors.success,
                    colors.indigo, colors.pink, colors.danger, '#9333EA', '#0EA5E9', '#84CC16'][i % 10]
                ),
              },
              text: topDerivativesProtocols.map(p => formatCurrency(p.dailyRevenue)),
              textposition: 'outside',
              hovertemplate: '%{x}<br>Daily Revenue: $%{y:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 380,
              yaxis: { ...defaultLayout.yaxis, title: 'Daily Revenue (USD)' },
              xaxis: { ...defaultLayout.xaxis, tickangle: -30, type: 'category' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Options Volume */}
      {topOptionsProtocols.length > 0 && (
        <ChartCard title="DeFi Options Protocol Volume" subtitle="Top options protocols by daily volume (DeFiLlama)"
          csvData={{ filename: 'defi-options-volume', headers: ['Protocol','DailyVolume'], rows: topOptionsProtocols.map(p => [p.name, p.dailyVolume]) }}>
          <Plot
            data={[{
              x: topOptionsProtocols.map(p => p.name),
              y: topOptionsProtocols.map(p => p.dailyVolume),
              type: 'bar',
              marker: {
                color: topOptionsProtocols.map((_, i) =>
                  [colors.indigo, colors.pink, colors.warning, colors.success,
                    colors.primary, colors.secondary, '#9333EA', '#0EA5E9'][i % 8]
                ),
              },
              text: topOptionsProtocols.map(p => formatCurrency(p.dailyVolume)),
              textposition: 'outside',
              hovertemplate: '%{x}<br>Daily Volume: $%{y:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 360,
              yaxis: { ...defaultLayout.yaxis, title: 'Daily Volume (USD)' },
              xaxis: { ...defaultLayout.xaxis, tickangle: -30, type: 'category' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Narrative */}
      <NarrativeBox title="Derivatives Intelligence">
        <p>
          Derivatives data reveals the leveraged positioning that drives crypto revenue. When funding rates spike &gt;0.1%,
          it signals extreme greed — perp DEXs like Hyperliquid and GMX earn outsized revenue from these imbalanced markets.
        </p>
        <p>
          Liquidation cascades generate fee windfalls for lending protocols (Aave) and DEXs simultaneously.
          ETF flows now represent the primary bridge between TradFi capital allocation and on-chain activity,
          with daily flows often exceeding $500M during volatile periods.
        </p>
        <p>
          DeFi derivatives protocols compete for market share against CEX giants. Protocols with deep liquidity
          and competitive funding rates capture the most volume — and revenue.
        </p>
      </NarrativeBox>
    </div>
  )
}
