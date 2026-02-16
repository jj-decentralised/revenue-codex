import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatPercent, formatNumber } from '../../utils/helpers'

// Top chains for stablecoin dominance breakdown
const STABLE_CHAINS = ['Ethereum', 'Tron', 'BSC', 'Arbitrum', 'Solana', 'Polygon', 'Avalanche', 'Base', 'Optimism']

async function fetchStablecoinFlowsData() {
  const results = await Promise.allSettled([
    // DeFiLlama stablecoins (free)
    fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true').then(r => r.ok ? r.json() : null),
    // DeFiLlama stablecoin chart (total supply over time)
    fetch('https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1').then(r => r.ok ? r.json() : null),
    // Individual stablecoin charts for composition (top 5 by ID)
    // IDs: 1=USDT, 2=USDC, 3=BUSD, 5=DAI, 9=TUSD, 33=FRAX, 48=PYUSD, 66=FDUSD, 72=USDE, 74=USDS
    ...[1, 2, 5, 66, 72, 74].map(id =>
      fetch(`https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=${id}`).then(r => r.ok ? r.json() : null)
    ),
    // CoinGecko BTC 1yr chart for overlay
    fetch('/api/coingecko?action=coin_chart&coin_id=bitcoin&days=365').then(r => r.ok ? r.json() : null),
    // CoinGecko global data for total market cap
    fetch('/api/coingecko?action=global').then(r => r.ok ? r.json() : null),
  ])

  const getValue = (idx) => results[idx]?.status === 'fulfilled' ? results[idx].value : null

  const stablecoinIds = [1, 2, 5, 66, 72, 74]
  const stablecoinNames = ['USDT', 'USDC', 'DAI', 'FDUSD', 'USDe', 'USDS']
  const individualCharts = {}
  stablecoinIds.forEach((id, i) => {
    individualCharts[stablecoinNames[i]] = getValue(2 + i)
  })

  return {
    stablecoins: getValue(0),
    totalChart: getValue(1),
    individualCharts,
    btcChart: getValue(2 + stablecoinIds.length),
    globalData: getValue(3 + stablecoinIds.length),
  }
}

export default function StablecoinFlowsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchStablecoinFlowsData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const processed = useMemo(() => {
    if (!data) return null

    const stablecoinsList = data.stablecoins?.peggedAssets || []
    const totalChart = data.totalChart || []
    const btcPrices = data.btcChart?.prices || []
    const globalData = data.globalData?.data || {}
    const totalCryptoMcap = globalData.total_market_cap?.usd || 0

    // Sort stablecoins by circulating supply
    const sorted = [...stablecoinsList]
      .map(s => ({
        name: s.name,
        symbol: s.symbol,
        circulating: s.circulating?.peggedUSD || 0,
        circulatingPrev30d: s.circulatingPrevMonth?.peggedUSD || 0,
        circulatingPrev7d: s.circulatingPrevWeek?.peggedUSD || 0,
        chains: s.chains || [],
        chainCirculating: s.chainCirculating || {},
        price: s.price,
      }))
      .filter(s => s.circulating > 0)
      .sort((a, b) => b.circulating - a.circulating)

    const totalStablecoinMcap = sorted.reduce((s, sc) => s + sc.circulating, 0)
    const totalPrev30d = sorted.reduce((s, sc) => s + sc.circulatingPrev30d, 0)
    const supply30dChange = totalPrev30d > 0 ? ((totalStablecoinMcap - totalPrev30d) / totalPrev30d) * 100 : 0
    const usdtDominance = sorted.length > 0 ? (sorted[0].circulating / totalStablecoinMcap) * 100 : 0
    const stablecoinRatio = totalCryptoMcap > 0 ? (totalStablecoinMcap / totalCryptoMcap) * 100 : 0

    // === Chart 1: Total Stablecoin Supply vs BTC Price ===
    const supplyDates = totalChart.map(d => new Date(d.date * 1000).toISOString().split('T')[0])
    const supplyValues = totalChart.map(d => d.totalCirculatingUSD?.peggedUSD || 0)

    // Align BTC prices to stablecoin dates
    const btcDateMap = {}
    btcPrices.forEach(([ts, price]) => {
      btcDateMap[new Date(ts).toISOString().split('T')[0]] = price
    })

    // === Chart 2: Stablecoin Composition Over Time ===
    const compositionTraces = []
    const stablecoinOrder = ['USDT', 'USDC', 'DAI', 'FDUSD', 'USDe', 'USDS']
    stablecoinOrder.forEach((name, i) => {
      const chartData = data.individualCharts[name]
      if (!chartData || chartData.length === 0) return
      compositionTraces.push({
        name,
        dates: chartData.map(d => new Date(d.date * 1000).toISOString().split('T')[0]),
        values: chartData.map(d => d.totalCirculatingUSD?.peggedUSD || 0),
        color: colors.palette[i % colors.palette.length],
      })
    })

    // === Chart 3: Market Share Pie ===
    const top10 = sorted.slice(0, 10)
    const otherCirculating = sorted.slice(10).reduce((s, sc) => s + sc.circulating, 0)

    // === Chart 4: Stablecoin Dominance by Chain ===
    const chainTotals = {}
    sorted.forEach(sc => {
      Object.entries(sc.chainCirculating || {}).forEach(([chain, data]) => {
        const val = data?.peggedUSD || (typeof data === 'number' ? data : 0)
        if (val > 0) {
          chainTotals[chain] = (chainTotals[chain] || 0) + val
        }
      })
    })
    const sortedChains = Object.entries(chainTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)

    // === Chart 5: 30d Supply Change by Stablecoin ===
    const supplyChanges = sorted
      .filter(s => s.circulatingPrev30d > 0)
      .map(s => ({
        name: s.symbol || s.name,
        change: s.circulating - s.circulatingPrev30d,
        changePct: ((s.circulating - s.circulatingPrev30d) / s.circulatingPrev30d) * 100,
        circulating: s.circulating,
      }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 15)

    // === Chart 6: Stablecoin/Total-MCap Ratio vs BTC ===
    // Use total chart dates where we also have BTC price
    const ratioDates = []
    const ratioValues = []
    const ratioBtcPrices = []
    supplyDates.forEach((date, i) => {
      const btcPrice = btcDateMap[date]
      if (btcPrice && supplyValues[i] > 0 && totalCryptoMcap > 0) {
        ratioDates.push(date)
        // Estimate total mcap on that day proportionally (rough proxy)
        ratioValues.push((supplyValues[i] / totalCryptoMcap) * 100)
        ratioBtcPrices.push(btcPrice)
      }
    })

    return {
      totalStablecoinMcap,
      supply30dChange,
      usdtDominance,
      stablecoinRatio,
      supplyDates,
      supplyValues,
      btcDateMap,
      compositionTraces,
      top10,
      otherCirculating,
      sortedChains,
      supplyChanges,
      ratioDates,
      ratioValues,
      ratioBtcPrices,
      totalChart,
    }
  }, [data])

  if (loading) return <LoadingSpinner message="Loading stablecoin flow data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>
  if (!processed) return <div className="text-center py-20">No data available</div>

  const {
    totalStablecoinMcap, supply30dChange, usdtDominance, stablecoinRatio,
    supplyDates, supplyValues, btcDateMap,
    compositionTraces, top10, otherCirculating,
    sortedChains, supplyChanges,
    ratioDates, ratioValues, ratioBtcPrices,
  } = processed

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Stablecoin Supply"
          value={formatCurrency(totalStablecoinMcap)}
          subtitle="Total circulating"
        />
        <KPICard
          title="USDT Dominance"
          value={formatPercent(usdtDominance)}
          subtitle="Market share"
        />
        <KPICard
          title="30d Supply Change"
          value={formatPercent(supply30dChange)}
          trend={supply30dChange}
          subtitle="Capital flow signal"
        />
        <KPICard
          title="Stablecoin / Total MCap"
          value={formatPercent(stablecoinRatio)}
          subtitle="Dry powder ratio"
        />
      </div>

      <NarrativeBox title="Reading Stablecoin Flows">
        <p>
          Stablecoin supply is the on-chain equivalent of money supply — when it grows, capital is entering the system.
          The stablecoin/total-market-cap ratio acts as a risk gauge: a high ratio means capital is parked (risk-off),
          while a declining ratio signals capital rotating into risk assets. Composition shifts reveal trust migration
          and regulatory pressure.
        </p>
      </NarrativeBox>

      {/* Chart 1: Stablecoin Supply vs BTC Price */}
      <ChartCard
        title="Stablecoin Supply vs BTC Price"
        subtitle="Rising stablecoin supply with flat BTC = dry powder accumulating · Divergence signals potential breakout"
        csvData={{
          filename: 'stablecoin-supply-vs-btc',
          headers: ['Date', 'StablecoinSupply', 'BTCPrice'],
          rows: supplyDates.map((d, i) => [d, supplyValues[i], btcDateMap[d] || '']),
        }}
      >
        <Plot
          data={[
            {
              x: supplyDates,
              y: supplyValues,
              type: 'scatter',
              mode: 'lines',
              fill: 'tozeroy',
              fillcolor: colors.primary + '20',
              line: { color: colors.primary, width: 2 },
              name: 'Stablecoin Supply',
              yaxis: 'y',
              hovertemplate: '%{x}<br>Supply: $%{y:,.0f}<extra></extra>',
            },
            {
              x: supplyDates,
              y: supplyDates.map(d => btcDateMap[d] || null),
              type: 'scatter',
              mode: 'lines',
              line: { color: colors.warning, width: 2 },
              name: 'BTC Price',
              yaxis: 'y2',
              connectgaps: true,
              hovertemplate: '%{x}<br>BTC: $%{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            yaxis: { ...defaultLayout.yaxis, title: 'Stablecoin Supply (USD)', side: 'left' },
            yaxis2: {
              title: 'BTC Price (USD)',
              overlaying: 'y',
              side: 'right',
              gridcolor: 'transparent',
              tickfont: { size: 11, color: '#7A7A7A', family: 'Consolas, Courier New, monospace' },
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 2: Stablecoin Composition Over Time */}
      {compositionTraces.length > 0 && (
        <ChartCard
          title="Stablecoin Composition Over Time"
          subtitle="Market share shifts between major stablecoins — USDT vs USDC vs DAI vs newer entrants"
        >
          <Plot
            data={compositionTraces.map((t, i) => ({
              x: t.dates,
              y: t.values,
              type: 'scatter',
              mode: 'lines',
              name: t.name,
              stackgroup: 'one',
              fillcolor: t.color + '80',
              line: { color: t.color, width: 0 },
              hovertemplate: `${t.name}<br>%{x}<br>$%{y:,.0f}<extra></extra>`,
            }))}
            layout={{
              ...defaultLayout,
              height: 420,
              yaxis: { ...defaultLayout.yaxis, title: 'Circulating Supply (USD)' },
              legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 3: Market Share Pie */}
      <ChartCard
        title="Stablecoin Market Share"
        subtitle="Current circulating supply distribution across top stablecoins"
        csvData={{
          filename: 'stablecoin-market-share',
          headers: ['Stablecoin', 'Circulating', 'MarketShare%'],
          rows: top10.map(s => [s.symbol || s.name, s.circulating, ((s.circulating / totalStablecoinMcap) * 100).toFixed(1)]),
        }}
      >
        <Plot
          data={[{
            labels: [...top10.map(s => s.symbol || s.name), 'Other'],
            values: [...top10.map(s => s.circulating), otherCirculating],
            type: 'pie',
            hole: 0.4,
            marker: {
              colors: [...top10.map((_, i) => colors.palette[i % colors.palette.length]), '#D1D5DB'],
            },
            textinfo: 'label+percent',
            textposition: 'outside',
            textfont: { size: 11 },
            hovertemplate: '%{label}<br>$%{value:,.0f}<br>%{percent}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 420,
            showlegend: false,
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 4: Stablecoin Dominance by Chain */}
      {sortedChains.length > 0 && (
        <ChartCard
          title="Stablecoin Distribution by Chain"
          subtitle="Where stablecoins live — chain-level capital allocation"
          csvData={{
            filename: 'stablecoin-by-chain',
            headers: ['Chain', 'StablecoinValue'],
            rows: sortedChains.map(([chain, val]) => [chain, val]),
          }}
        >
          <Plot
            data={[{
              x: sortedChains.map(([chain]) => chain),
              y: sortedChains.map(([_, val]) => val),
              type: 'bar',
              marker: {
                color: sortedChains.map((_, i) => colors.palette[i % colors.palette.length]),
              },
              hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 400,
              xaxis: { ...defaultLayout.xaxis, tickangle: -25, type: 'category' },
              yaxis: { ...defaultLayout.yaxis, title: 'Stablecoin Value (USD)' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 5: 30d Supply Change */}
      {supplyChanges.length > 0 && (
        <ChartCard
          title="30-Day Supply Change by Stablecoin"
          subtitle="Where capital is flowing — green = inflows, red = outflows"
          csvData={{
            filename: 'stablecoin-30d-change',
            headers: ['Stablecoin', 'AbsoluteChange', 'PercentChange', 'CurrentSupply'],
            rows: supplyChanges.map(s => [s.name, s.change, s.changePct.toFixed(2), s.circulating]),
          }}
        >
          <Plot
            data={[{
              y: supplyChanges.map(s => s.name),
              x: supplyChanges.map(s => s.change),
              type: 'bar',
              orientation: 'h',
              marker: {
                color: supplyChanges.map(s => s.change >= 0 ? colors.success : colors.danger),
              },
              text: supplyChanges.map(s =>
                `${s.change >= 0 ? '+' : ''}${formatCurrency(s.change)} (${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(1)}%)`
              ),
              textposition: 'outside',
              textfont: { size: 10, color: '#7A7A7A' },
              hovertemplate: '%{y}<br>Change: $%{x:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: Math.max(350, supplyChanges.length * 30),
              xaxis: { ...defaultLayout.xaxis, title: 'Supply Change (USD, 30d)' },
              yaxis: { ...defaultLayout.yaxis, autorange: 'reversed' },
              margin: { ...defaultLayout.margin, l: 80, r: 120 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 6: Stablecoin/Total-MCap Ratio vs BTC */}
      {ratioDates.length > 5 && (
        <ChartCard
          title="Stablecoin / Total Market Cap Ratio vs BTC"
          subtitle="High ratio = capital parked in stables (risk-off) · Low ratio = capital deployed into risk assets"
        >
          <Plot
            data={[
              {
                x: ratioDates,
                y: ratioValues,
                type: 'scatter',
                mode: 'lines',
                fill: 'tozeroy',
                fillcolor: colors.primary + '20',
                line: { color: colors.primary, width: 2 },
                name: 'Stablecoin / MCap Ratio',
                yaxis: 'y',
                hovertemplate: '%{x}<br>Ratio: %{y:.2f}%<extra></extra>',
              },
              {
                x: ratioDates,
                y: ratioBtcPrices,
                type: 'scatter',
                mode: 'lines',
                line: { color: colors.warning, width: 2 },
                name: 'BTC Price',
                yaxis: 'y2',
                hovertemplate: '%{x}<br>BTC: $%{y:,.0f}<extra></extra>',
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 400,
              yaxis: { ...defaultLayout.yaxis, title: 'Stablecoin / Total MCap (%)', side: 'left' },
              yaxis2: {
                title: 'BTC Price (USD)',
                overlaying: 'y',
                side: 'right',
                gridcolor: 'transparent',
                tickfont: { size: 11, color: '#7A7A7A', family: 'Consolas, Courier New, monospace' },
              },
              legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}
    </div>
  )
}
