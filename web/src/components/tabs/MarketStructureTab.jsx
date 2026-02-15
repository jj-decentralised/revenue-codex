import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatPercent, formatNumber } from '../../utils/helpers'

// Top DEX protocols to fetch individual data for
const TOP_DEX_PROTOCOLS = [
  'uniswap', 'raydium', 'orca', 'pancakeswap', 'curve', 'aerodrome',
  'sushiswap', 'balancer', 'jupiter', 'trader-joe'
]

export default function MarketStructureTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      // Build all fetch promises
      const fetchPromises = [
        // CoinGecko Pro data via proxy
        fetch('/api/coingecko?action=exchanges').then(r => r.json()),
        fetch('/api/coingecko?action=global').then(r => r.json()),
        fetch('/api/coingecko?action=markets').then(r => r.json()),
        fetch('/api/coingecko?action=categories').then(r => r.json()),
        // DeFiLlama data (direct)
        fetch('https://api.llama.fi/overview/dexs').then(r => r.json()),
        fetch('https://bridges.llama.fi/bridges').then(r => r.json()),
        fetch('https://api.llama.fi/overview/derivatives').then(r => r.json()),
        // Individual DEX protocol data
        ...TOP_DEX_PROTOCOLS.map(protocol =>
          fetch(`https://api.llama.fi/summary/dexs/${protocol}`).then(r => r.json())
        )
      ]

      const results = await Promise.allSettled(fetchPromises)

      // Parse results
      const [
        exchangesRes, globalRes, marketsRes, categoriesRes,
        dexOverviewRes, bridgesRes, derivativesRes,
        ...dexProtocolResults
      ] = results

      // Map individual DEX results
      const dexProtocolData = {}
      TOP_DEX_PROTOCOLS.forEach((protocol, i) => {
        const result = dexProtocolResults[i]
        if (result.status === 'fulfilled') {
          dexProtocolData[protocol] = result.value
        }
      })

      setData({
        exchanges: exchangesRes.status === 'fulfilled' ? exchangesRes.value : null,
        global: globalRes.status === 'fulfilled' ? globalRes.value : null,
        markets: marketsRes.status === 'fulfilled' ? marketsRes.value : null,
        categories: categoriesRes.status === 'fulfilled' ? categoriesRes.value : null,
        dexOverview: dexOverviewRes.status === 'fulfilled' ? dexOverviewRes.value : null,
        bridges: bridgesRes.status === 'fulfilled' ? bridgesRes.value : null,
        derivatives: derivativesRes.status === 'fulfilled' ? derivativesRes.value : null,
        dexProtocols: dexProtocolData,
      })
    }

    fetchData()
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading market structure data..." />
  if (error && !data) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  // ============ EXTRACT GLOBAL DATA ============
  const globalData = data?.global?.data || {}
  const totalMarketCap = globalData.total_market_cap?.usd || 0
  const totalVolume24h = globalData.total_volume?.usd || 0
  const btcDominance = globalData.market_cap_percentage?.btc || 0
  const ethDominance = globalData.market_cap_percentage?.eth || 0
  const activeExchanges = globalData.markets || 0

  // ============ EXTRACT EXCHANGE DATA ============
  const exchanges = data?.exchanges || []
  const numExchangesTracked = exchanges.length

  // Estimate BTC price for volume conversion
  const btcPrice = totalMarketCap > 0 && btcDominance > 0
    ? (totalMarketCap * btcDominance / 100) / (19700000) // ~19.7M BTC mined
    : 50000

  // Calculate CEX total volume
  const cexVolumeEstimate = exchanges.reduce((sum, e) => {
    return sum + (e.trade_volume_24h_btc || 0) * btcPrice
  }, 0)

  // ============ EXTRACT DEX DATA ============
  const dexOverview = data?.dexOverview || {}
  const totalDexVolume24h = dexOverview.total24h || 0
  const dexProtocols = (dexOverview.protocols || [])
    .filter(p => p.total24h > 0)
    .sort((a, b) => (b.total24h || 0) - (a.total24h || 0))

  // ============ EXTRACT DERIVATIVES DATA ============
  const derivativesData = data?.derivatives || {}
  const totalDerivativesVolume = derivativesData.total24h || 0
  const derivativesProtocols = (derivativesData.protocols || [])
    .filter(p => p.total24h > 0)
    .sort((a, b) => (b.total24h || 0) - (a.total24h || 0))

  // ============ EXTRACT BRIDGES DATA ============
  const bridgesData = data?.bridges?.bridges || []
  const topBridges = [...bridgesData]
    .filter(b => b.lastDayVolume > 0)
    .sort((a, b) => (b.lastDayVolume || 0) - (a.lastDayVolume || 0))
    .slice(0, 15)

  // ============ EXTRACT MARKETS DATA ============
  const markets = data?.markets || []
  const topCoinsByVolume = [...markets]
    .filter(m => m.total_volume > 0)
    .sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0))
    .slice(0, 20)

  // ============ CALCULATE METRICS ============
  // DEX/CEX Volume Ratio
  const dexCexRatio = cexVolumeEstimate > 0 ? (totalDexVolume24h / cexVolumeEstimate) : 0
  const dexSharePercent = totalDexVolume24h > 0 && cexVolumeEstimate > 0
    ? (totalDexVolume24h / (totalDexVolume24h + cexVolumeEstimate) * 100)
    : 0

  // ============ EXCHANGE RANKINGS ============
  const topCexByVolume = [...exchanges]
    .filter(e => e.trade_volume_24h_btc > 0)
    .sort((a, b) => (b.trade_volume_24h_btc || 0) - (a.trade_volume_24h_btc || 0))
    .slice(0, 20)
    .map(e => ({
      name: e.name,
      volume: (e.trade_volume_24h_btc || 0) * btcPrice,
      volumeBtc: e.trade_volume_24h_btc || 0,
      trustScore: e.trust_score || 0,
      pairs: e.number_of_trading_pairs || 0,
      year: e.year_established,
      country: e.country,
    }))

  // ============ HERFINDAHL INDEX (HHI) ============
  const totalTopVolume = topCexByVolume.reduce((sum, e) => sum + e.volume, 0)
  const marketShares = topCexByVolume.map(e => ({
    ...e,
    share: totalTopVolume > 0 ? (e.volume / totalTopVolume) * 100 : 0,
  }))
  const hhi = marketShares.reduce((sum, e) => sum + Math.pow(e.share, 2), 0)
  const hhiClassification = hhi > 2500 ? 'Concentrated' : hhi > 1500 ? 'Moderately Concentrated' : 'Competitive'

  // Trust score color coding function
  const getTrustScoreColor = (score) => {
    if (score >= 9) return colors.success
    if (score >= 7) return colors.primary
    if (score >= 5) return colors.warning
    return colors.danger
  }

  // ============ DEX PROTOCOL DETAILS ============
  const dexProtocolDetails = Object.entries(data?.dexProtocols || {}).map(([name, details]) => ({
    name,
    displayName: details?.name || name,
    total24h: details?.total24h || 0,
    total7d: details?.total7d || 0,
    chains: details?.chains?.length || 0,
    change24h: details?.change_1d || 0,
  })).filter(p => p.total24h > 0).sort((a, b) => b.total24h - a.total24h)

  return (
    <div className="space-y-6">
      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          title="Total Market Cap"
          value={formatCurrency(totalMarketCap)}
          subtitle="All cryptocurrencies"
        />
        <KPICard
          title="24h Volume"
          value={formatCurrency(totalVolume24h)}
          subtitle="Global trading"
        />
        <KPICard
          title="BTC Dominance"
          value={formatPercent(btcDominance)}
          subtitle="Market cap share"
        />
        <KPICard
          title="ETH Dominance"
          value={formatPercent(ethDominance)}
          subtitle="Market cap share"
        />
        <KPICard
          title="DEX/CEX Ratio"
          value={`${(dexCexRatio * 100).toFixed(1)}%`}
          subtitle={`DEX: ${formatCurrency(totalDexVolume24h)}`}
        />
        <KPICard
          title="Exchanges Tracked"
          value={formatNumber(numExchangesTracked, 0)}
          subtitle="CoinGecko Pro"
        />
      </div>

      {/* CEX Rankings */}
      <ChartCard title="CEX Rankings — Top 20 by 24h Volume" subtitle="Centralized exchanges from CoinGecko Pro · Color = Trust Score">
        <Plot
          data={[{
            x: topCexByVolume.map(e => e.name),
            y: topCexByVolume.map(e => e.volume),
            type: 'bar',
            marker: {
              color: topCexByVolume.map(e => getTrustScoreColor(e.trustScore)),
              line: { width: 1, color: '#FFFFFF' },
            },
            text: topCexByVolume.map(e => `Trust: ${e.trustScore}/10`),
            hovertemplate: '%{x}<br>Volume: $%{y:,.0f}<br>%{text}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            yaxis: { ...defaultLayout.yaxis, title: '24h Volume (USD)' },
            annotations: [{
              x: 0.99, y: 0.98, xref: 'paper', yref: 'paper', showarrow: false,
              text: '🟢 Trust≥9 · 🔵 Trust≥7 · 🟡 Trust≥5 · 🔴 Trust<5',
              font: { size: 10, color: '#6B7280' }, xanchor: 'right',
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* DEX Rankings */}
      <ChartCard title="DEX Rankings — Top 15 by 24h Volume" subtitle="Decentralized exchanges from DeFiLlama">
        <Plot
          data={[{
            x: dexProtocols.slice(0, 15).map(p => p.displayName || p.name),
            y: dexProtocols.slice(0, 15).map(p => p.total24h || 0),
            type: 'bar',
            marker: {
              color: dexProtocols.slice(0, 15).map((_, i) => colors.palette[i % colors.palette.length]),
            },
            hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 380,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            yaxis: { ...defaultLayout.yaxis, title: '24h Volume (USD)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* CEX vs DEX Volume Share */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="CEX vs DEX Volume Share" subtitle="24h trading volume comparison">
          <Plot
            data={[{
              values: [cexVolumeEstimate, totalDexVolume24h],
              labels: ['CEX', 'DEX'],
              type: 'pie',
              hole: 0.5,
              marker: {
                colors: [colors.primary, colors.secondary],
              },
              textinfo: 'label+percent',
              textfont: { size: 14, color: '#FFFFFF' },
              hovertemplate: '%{label}<br>$%{value:,.0f}<br>%{percent}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 320,
              showlegend: true,
              legend: { ...defaultLayout.legend, orientation: 'h', y: -0.1 },
              annotations: [{
                text: `<b>${formatCurrency(cexVolumeEstimate + totalDexVolume24h)}</b><br>Total`,
                x: 0.5, y: 0.5, showarrow: false,
                font: { size: 14, color: '#111827' },
              }],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>

        <ChartCard title="Derivatives vs Spot DEX Volume" subtitle="24h volume by market type · DeFiLlama">
          <Plot
            data={[{
              x: ['DEX Spot', 'Derivatives'],
              y: [totalDexVolume24h, totalDerivativesVolume],
              type: 'bar',
              marker: {
                color: [colors.secondary, colors.rose],
              },
              hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 320,
              yaxis: { ...defaultLayout.yaxis, title: '24h Volume (USD)' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      </div>

      {/* Exchange Trust Score vs Volume Scatter */}
      <ChartCard title="Exchange Trust Score vs Volume" subtitle="X = Trust Score · Y = 24h Volume · Size = Number of Trading Pairs">
        <Plot
          data={[{
            x: marketShares.map(e => e.trustScore),
            y: marketShares.map(e => e.volume),
            text: marketShares.map(e => `${e.name}<br>Pairs: ${formatNumber(e.pairs, 0)}<br>Share: ${e.share.toFixed(1)}%`),
            mode: 'markers',
            type: 'scatter',
            marker: {
              color: marketShares.map(e => getTrustScoreColor(e.trustScore)),
              size: marketShares.map(e => Math.max(10, Math.min(60, Math.sqrt(e.pairs) * 1.2))),
              opacity: 0.75,
              line: { width: 1, color: '#FFFFFF' },
            },
            hovertemplate: '%{text}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 420,
            xaxis: { ...defaultLayout.xaxis, title: 'Trust Score', range: [0, 11], dtick: 1 },
            yaxis: { ...defaultLayout.yaxis, title: '24h Volume (USD)', type: 'log' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Market Concentration (HHI) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <KPICard
            title="Herfindahl Index (HHI)"
            value={hhi.toFixed(0)}
            subtitle={hhiClassification}
            className="h-auto"
          />
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
            <p><strong>HHI Scale:</strong></p>
            <p>• &lt;1500: Competitive</p>
            <p>• 1500–2500: Moderate</p>
            <p>• &gt;2500: Concentrated</p>
          </div>
        </div>
        <div className="lg:col-span-3">
          <ChartCard title="Market Share by Exchange" subtitle="Top 10 exchanges by trading volume share">
            <Plot
              data={[{
                x: marketShares.slice(0, 10).map(e => e.name),
                y: marketShares.slice(0, 10).map(e => e.share),
                type: 'bar',
                marker: {
                  color: marketShares.slice(0, 10).map((_, i) => colors.palette[i % colors.palette.length]),
                },
                hovertemplate: '%{x}<br>%{y:.1f}%<extra></extra>',
              }]}
              layout={{
                ...defaultLayout,
                height: 300,
                xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
                yaxis: { ...defaultLayout.yaxis, title: 'Market Share (%)' },
                annotations: [{
                  x: 0.5, y: 1.1, xref: 'paper', yref: 'paper',
                  text: hhi > 2500 ? '⚠️ Concentrated Market' : hhi > 1500 ? '📊 Moderate Concentration' : '✅ Competitive Market',
                  showarrow: false,
                  font: { size: 12, color: hhi > 2500 ? colors.danger : hhi > 1500 ? colors.warning : colors.success },
                }],
              }}
              config={defaultConfig}
              className="w-full"
            />
          </ChartCard>
        </div>
      </div>

      {/* Top Coins by Volume */}
      <ChartCard title="Top Coins by 24h Trading Volume" subtitle="Top 20 cryptocurrencies by trading volume · CoinGecko Pro">
        <Plot
          data={[{
            x: topCoinsByVolume.map(c => c.symbol?.toUpperCase() || c.name),
            y: topCoinsByVolume.map(c => c.total_volume || 0),
            type: 'bar',
            marker: {
              color: topCoinsByVolume.map((_, i) => colors.palette[i % colors.palette.length]),
            },
            text: topCoinsByVolume.map(c => c.name),
            hovertemplate: '%{text} (%{x})<br>Volume: $%{y:,.0f}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 380,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            yaxis: { ...defaultLayout.yaxis, title: '24h Volume (USD)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Bridge Volume */}
      {topBridges.length > 0 && (
        <ChartCard title="Bridge Volume — Top 15" subtitle="Cross-chain bridge 24h volume · DeFiLlama">
          <Plot
            data={[{
              x: topBridges.map(b => b.displayName || b.name),
              y: topBridges.map(b => b.lastDayVolume || 0),
              type: 'bar',
              marker: {
                color: topBridges.map((_, i) => colors.palette[i % colors.palette.length]),
              },
              hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 380,
              xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
              yaxis: { ...defaultLayout.yaxis, title: '24h Volume (USD)' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Top Derivatives Protocols */}
      {derivativesProtocols.length > 0 && (
        <ChartCard title="Derivatives Protocols — Top 15" subtitle="Perpetual & options protocols by 24h volume · DeFiLlama">
          <Plot
            data={[{
              x: derivativesProtocols.slice(0, 15).map(p => p.displayName || p.name),
              y: derivativesProtocols.slice(0, 15).map(p => p.total24h || 0),
              type: 'bar',
              marker: {
                color: derivativesProtocols.slice(0, 15).map((_, i) => colors.palette[i % colors.palette.length]),
              },
              hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 380,
              xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
              yaxis: { ...defaultLayout.yaxis, title: '24h Volume (USD)' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Individual DEX Protocol Details */}
      {dexProtocolDetails.length > 0 && (
        <ChartCard title="Featured DEX Protocols — Deep Dive" subtitle="Individual protocol data with chain support · DeFiLlama">
          <Plot
            data={[
              {
                x: dexProtocolDetails.map(p => p.displayName),
                y: dexProtocolDetails.map(p => p.total24h),
                name: '24h Volume',
                type: 'bar',
                marker: { color: colors.primary },
                hovertemplate: '%{x}<br>24h: $%{y:,.0f}<extra></extra>',
              },
              {
                x: dexProtocolDetails.map(p => p.displayName),
                y: dexProtocolDetails.map(p => p.total7d / 7),
                name: '7d Avg Daily',
                type: 'bar',
                marker: { color: colors.secondary },
                hovertemplate: '%{x}<br>7d Avg: $%{y:,.0f}<extra></extra>',
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 380,
              barmode: 'group',
              xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
              yaxis: { ...defaultLayout.yaxis, title: 'Volume (USD)' },
              legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Narrative */}
      <NarrativeBox title="Market Structure Analysis">
        <p>
          <strong>DEX vs CEX:</strong> Decentralized exchanges now account for {dexSharePercent.toFixed(1)}% of combined volume,
          processing {formatCurrency(totalDexVolume24h)} daily. The DEX/CEX ratio of {(dexCexRatio * 100).toFixed(1)}%
          reflects growing on-chain trading adoption, though centralized venues still dominate with {formatCurrency(cexVolumeEstimate)} in daily volume.
        </p>
        <p>
          <strong>Market Concentration:</strong> The Herfindahl Index of {hhi.toFixed(0)} indicates a {hhiClassification.toLowerCase()} exchange market.
          The top exchange ({marketShares[0]?.name || 'N/A'}) holds {marketShares[0]?.share.toFixed(1) || 0}% market share —
          significantly less concentrated than traditional equity markets where NYSE+NASDAQ control &gt;90% of US volume.
        </p>
        <p>
          <strong>Derivatives Dominance:</strong> On-chain derivatives volume ({formatCurrency(totalDerivativesVolume)})
          {totalDerivativesVolume > totalDexVolume24h ? ' exceeds ' : ' trails '}
          spot DEX volume, following the pattern seen in TradFi where futures typically exceed spot by 5–10×.
        </p>
        <p>
          <strong>Cross-Chain Infrastructure:</strong> Bridge volume of {formatCurrency(topBridges.reduce((s, b) => s + (b.lastDayVolume || 0), 0))}
          across top bridges enables multi-chain liquidity, with {topBridges[0]?.displayName || topBridges[0]?.name || 'leading bridges'}
          processing the majority of cross-chain transfers.
        </p>
      </NarrativeBox>
    </div>
  )
}
