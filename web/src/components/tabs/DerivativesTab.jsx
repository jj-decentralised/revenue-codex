import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/helpers'

const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK']

async function fetchCoinglassData() {
  const [fundingRes, oiBtcRes, oiEthRes, liquidationRes, longShortRes, etfRes] = await Promise.allSettled([
    fetch('/api/coinglass?action=funding'),
    fetch('/api/coinglass?action=oi&symbol=BTC&range=4h'),
    fetch('/api/coinglass?action=oi&symbol=ETH&range=4h'),
    fetch('/api/coinglass?action=liquidation'),
    fetch('/api/coinglass?action=longshort&symbol=BTC&range=4h'),
    fetch('/api/coinglass?action=etf'),
  ])

  const parseResult = async (result) => {
    if (result.status === 'fulfilled' && result.value.ok) {
      return result.value.json()
    }
    return null
  }

  return {
    funding: await parseResult(fundingRes),
    oiBtc: await parseResult(oiBtcRes),
    oiEth: await parseResult(oiEthRes),
    liquidation: await parseResult(liquidationRes),
    longShort: await parseResult(longShortRes),
    etf: await parseResult(etfRes),
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

export default function DerivativesTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchCoinglassData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading derivatives data..." />

  // Check if all data is null (Coinglass proxy not configured)
  const hasAnyData = data && Object.values(data).some(v => v !== null)

  if (!hasAnyData) {
    return (
      <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-center">
          <p className="text-amber-800 font-medium">Coinglass API Not Configured</p>
          <p className="text-amber-600 text-sm mt-1">
            To view derivatives data, configure the Coinglass API proxy in your environment.
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

  // Extract KPI values
  const fundingData = data?.funding?.data || []
  const btcFunding = fundingData.find(d => d.symbol === 'BTC')
  const currentBtcFundingRate = btcFunding?.uMarginList?.[0]?.rate ?? null

  const oiBtcData = data?.oiBtc?.data || []
  const totalOI = oiBtcData.length > 0 
    ? oiBtcData[oiBtcData.length - 1]?.openInterest || 0 
    : 0

  const liquidationData = data?.liquidation?.data || []
  const total24hLiquidations = liquidationData.reduce((sum, d) => {
    return sum + (d.longLiquidationUsd || 0) + (d.shortLiquidationUsd || 0)
  }, 0)

  const longShortData = data?.longShort?.data || []
  const currentLongShort = longShortData.length > 0 
    ? longShortData[longShortData.length - 1]?.longShortRatio ?? null 
    : null

  // Funding rate data for multi-coin chart
  const fundingRates = COINS.map(symbol => {
    const coinData = fundingData.find(d => d.symbol === symbol)
    const exchanges = coinData?.uMarginList || []
    return {
      symbol,
      rates: exchanges.slice(0, 5).map(e => ({ 
        exchange: e.exchangeName, 
        rate: e.rate * 100 
      })),
      avgRate: exchanges.length > 0 
        ? (exchanges.reduce((s, e) => s + e.rate, 0) / exchanges.length) * 100 
        : null,
    }
  })

  // OI time series
  const oiBtcTimeSeries = oiBtcData.map(d => ({
    time: new Date(d.createTime).toISOString(),
    oi: d.openInterest,
    price: d.price,
  }))

  const oiEthData = data?.oiEth?.data || []
  const oiEthTimeSeries = oiEthData.map(d => ({
    time: new Date(d.createTime).toISOString(),
    oi: d.openInterest,
    price: d.price,
  }))

  // Liquidation aggregation
  const totalLongLiq = liquidationData.reduce((s, d) => s + (d.longLiquidationUsd || 0), 0)
  const totalShortLiq = liquidationData.reduce((s, d) => s + (d.shortLiquidationUsd || 0), 0)
  const topLiquidated = [...liquidationData]
    .sort((a, b) => (b.longLiquidationUsd + b.shortLiquidationUsd) - (a.longLiquidationUsd + a.shortLiquidationUsd))
    .slice(0, 10)

  // Long/short time series
  const longShortTimeSeries = longShortData.map(d => ({
    time: new Date(d.createTime).toISOString(),
    ratio: d.longShortRatio,
  }))

  // ETF flows
  const etfData = data?.etf?.data || []
  const etfFlows = etfData.slice(-30).map(d => ({
    date: d.date || new Date(d.createTime).toISOString().split('T')[0],
    netflow: d.netflow || d.totalNetflow || 0,
  }))

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="BTC Funding Rate"
          value={currentBtcFundingRate !== null ? `${(currentBtcFundingRate * 100).toFixed(4)}%` : '—'}
          subtitle={currentBtcFundingRate > 0.0001 ? 'Longs pay shorts' : currentBtcFundingRate < -0.0001 ? 'Shorts pay longs' : 'Neutral'}
          trend={currentBtcFundingRate !== null ? currentBtcFundingRate * 10000 : null}
        />
        <KPICard
          title="BTC Open Interest"
          value={formatCurrency(totalOI)}
          subtitle="Total OI"
        />
        <KPICard
          title="24h Liquidations"
          value={formatCurrency(total24hLiquidations)}
          subtitle={`L: ${formatCurrency(totalLongLiq)} / S: ${formatCurrency(totalShortLiq)}`}
        />
        <KPICard
          title="Long/Short Ratio"
          value={currentLongShort !== null ? currentLongShort.toFixed(2) : '—'}
          subtitle={currentLongShort > 1.5 ? 'Overleveraged long' : currentLongShort < 0.7 ? 'Overleveraged short' : 'Balanced'}
          trend={currentLongShort !== null ? (currentLongShort - 1) * 100 : null}
        />
      </div>

      {/* Funding Rate Chart */}
      <ChartCard 
        title="Funding Rates by Coin" 
        subtitle="Current funding rates across top coins — green: negative (shorts pay), red: high positive (longs pay)"
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
            height: 300,
            yaxis: { 
              ...defaultLayout.yaxis, 
              title: 'Funding Rate (%)',
              zeroline: true,
              zerolinecolor: colors.slate,
              zerolinewidth: 2,
            },
            shapes: [
              { type: 'line', x0: -0.5, x1: COINS.length - 0.5, y0: 0.1, y1: 0.1, line: { color: colors.danger, dash: 'dash', width: 1 } },
              { type: 'line', x0: -0.5, x1: COINS.length - 0.5, y0: -0.01, y1: -0.01, line: { color: colors.success, dash: 'dash', width: 1 } },
            ],
            annotations: [
              { x: COINS.length - 0.5, y: 0.1, xanchor: 'right', text: 'High (0.1%)', showarrow: false, font: { size: 10, color: colors.danger } },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Open Interest Chart */}
      <ChartCard title="Open Interest — BTC & ETH" subtitle="Time series of open interest with price overlay">
        <Plot
          data={[
            {
              x: oiBtcTimeSeries.map(d => d.time),
              y: oiBtcTimeSeries.map(d => d.oi),
              type: 'scatter',
              mode: 'lines',
              name: 'BTC OI',
              line: { color: colors.primary, width: 2 },
              yaxis: 'y',
              hovertemplate: 'BTC OI: $%{y:,.0f}<extra></extra>',
            },
            {
              x: oiEthTimeSeries.map(d => d.time),
              y: oiEthTimeSeries.map(d => d.oi),
              type: 'scatter',
              mode: 'lines',
              name: 'ETH OI',
              line: { color: colors.secondary, width: 2 },
              yaxis: 'y',
              hovertemplate: 'ETH OI: $%{y:,.0f}<extra></extra>',
            },
            {
              x: oiBtcTimeSeries.map(d => d.time),
              y: oiBtcTimeSeries.map(d => d.price),
              type: 'scatter',
              mode: 'lines',
              name: 'BTC Price',
              line: { color: colors.warning, width: 1, dash: 'dot' },
              yaxis: 'y2',
              hovertemplate: 'BTC: $%{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'Open Interest (USD)' },
            yaxis2: {
              title: 'BTC Price (USD)',
              overlaying: 'y',
              side: 'right',
              gridcolor: 'transparent',
              tickfont: { size: 11, color: '#6B7280' },
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Liquidation Analysis */}
      <ChartCard title="Liquidation Analysis" subtitle="24h liquidations by coin — longs (red) vs shorts (green)">
        <Plot
          data={[
            {
              x: topLiquidated.map(d => d.symbol),
              y: topLiquidated.map(d => d.longLiquidationUsd),
              type: 'bar',
              name: 'Long Liquidations',
              marker: { color: colors.danger, opacity: 0.8 },
              hovertemplate: '%{x} Longs: $%{y:,.0f}<extra></extra>',
            },
            {
              x: topLiquidated.map(d => d.symbol),
              y: topLiquidated.map(d => d.shortLiquidationUsd),
              type: 'bar',
              name: 'Short Liquidations',
              marker: { color: colors.success, opacity: 0.8 },
              hovertemplate: '%{x} Shorts: $%{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 350,
            barmode: 'group',
            yaxis: { ...defaultLayout.yaxis, title: 'Liquidation Volume (USD)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Long/Short Ratio */}
      <ChartCard title="BTC Long/Short Ratio" subtitle="Global account ratio — >1.5 overleveraged long, <0.7 overleveraged short">
        <Plot
          data={[{
            x: longShortTimeSeries.map(d => d.time),
            y: longShortTimeSeries.map(d => d.ratio),
            type: 'scatter',
            mode: 'lines',
            fill: 'tozeroy',
            line: { color: colors.indigo, width: 2 },
            fillcolor: 'rgba(99,102,241,0.1)',
            hovertemplate: 'Ratio: %{y:.2f}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 300,
            yaxis: { 
              ...defaultLayout.yaxis, 
              title: 'Long/Short Ratio',
              range: [0.5, 2],
            },
            shapes: [
              { 
                type: 'line', 
                x0: longShortTimeSeries[0]?.time, 
                x1: longShortTimeSeries[longShortTimeSeries.length - 1]?.time, 
                y0: 1.0, y1: 1.0, 
                line: { color: colors.slate, dash: 'solid', width: 2 } 
              },
              { 
                type: 'line', 
                x0: longShortTimeSeries[0]?.time, 
                x1: longShortTimeSeries[longShortTimeSeries.length - 1]?.time, 
                y0: 1.5, y1: 1.5, 
                line: { color: colors.danger, dash: 'dash', width: 1 } 
              },
              { 
                type: 'line', 
                x0: longShortTimeSeries[0]?.time, 
                x1: longShortTimeSeries[longShortTimeSeries.length - 1]?.time, 
                y0: 0.7, y1: 0.7, 
                line: { color: colors.success, dash: 'dash', width: 1 } 
              },
            ],
            annotations: [
              { x: longShortTimeSeries[longShortTimeSeries.length - 1]?.time, y: 1.0, xanchor: 'left', text: ' Neutral (1.0)', showarrow: false, font: { size: 10, color: colors.slate } },
              { x: longShortTimeSeries[longShortTimeSeries.length - 1]?.time, y: 1.5, xanchor: 'left', text: ' Overleveraged Long', showarrow: false, font: { size: 10, color: colors.danger } },
              { x: longShortTimeSeries[longShortTimeSeries.length - 1]?.time, y: 0.7, xanchor: 'left', text: ' Overleveraged Short', showarrow: false, font: { size: 10, color: colors.success } },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* ETF Flows */}
      <ChartCard title="Bitcoin ETF Daily Flows" subtitle="Net inflows/outflows — TradFi money flow into crypto">
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
            height: 300,
            yaxis: { 
              ...defaultLayout.yaxis, 
              title: 'Net Flow (USD)',
              zeroline: true,
              zerolinecolor: colors.slate,
              zerolinewidth: 2,
            },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Narrative */}
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
