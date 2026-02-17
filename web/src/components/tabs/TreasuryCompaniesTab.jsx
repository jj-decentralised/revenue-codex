import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatNumber, formatPercent, formatMultiple } from '../../utils/helpers'

// ─── Ticker symbol mapping: CoinGecko symbol → Massive.com stock ticker ───
// CoinGecko returns "MSTR.US" style; strip suffix for Massive.com
function toStockTicker(cgSymbol) {
  if (!cgSymbol) return null
  return cgSymbol.replace(/\.\w+$/, '').toUpperCase()
}

// All known crypto treasury company tickers
const TREASURY_TICKERS = [
  'MSTR', 'BMNR', 'XXI', 'SBET', 'ETHM', 'PURR', 'BTBT', 'ASST', 'FWDI',
  'MBAV', 'FGNX', 'CEPO', 'BRR', 'BNC', 'NAKA', 'DFDV', 'SUIG', 'SLMT',
  'HSDT', 'BTCS', 'ETHZ', 'SQNS', 'UPXI', 'STSS', 'HYPD', 'WGRX', 'STKE',
  'GAME', 'VVPR', 'BNKK', 'PAPL', 'SLAI', 'WETO', 'IPST', 'SBLX', 'NVVE',
  'LGHL', 'AGRI', 'MARA', 'CLSK', 'RIOT', 'COIN', 'HUT', 'BITF', 'CIFR', 'CORZ',
]

// Extended color palette for 40+ tickers
const EXT_PALETTE = [
  '#2E5E8E', '#E88C30', '#2E7D4F', '#C1352D', '#6B5B8D',
  '#1A7F8F', '#B5465A', '#4E5BA6', '#B8860B', '#64748B',
  '#D97706', '#059669', '#7C3AED', '#DC2626', '#0891B2',
  '#EA580C', '#4338CA', '#15803D', '#BE185D', '#0369A1',
  '#A16207', '#6D28D9', '#047857', '#9F1239', '#1D4ED8',
  '#92400E', '#5B21B6', '#065F46', '#881337', '#1E40AF',
  '#78350F', '#4C1D95', '#064E3B', '#7F1D1D', '#1E3A5F',
  '#713F12', '#3B0764', '#022C22', '#B91C1C', '#0E7490',
  '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
]

// Date helpers
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchTreasuryData() {
  const parseJSON = async (r) => {
    if (!r.ok) return null
    return r.json()
  }

  // Phase 1: CoinGecko treasury + BTC price history (parallel)
  const [btcTreasury, ethTreasury, btcChart] = await Promise.all([
    fetch('/api/coingecko?action=public_treasury_btc').then(parseJSON).catch(() => null),
    fetch('/api/coingecko?action=public_treasury_eth').then(parseJSON).catch(() => null),
    fetch('/api/coingecko?action=coin_chart&coin_id=bitcoin&days=365').then(parseJSON).catch(() => null),
  ])

  // Phase 2: Massive.com stock data — ticker details + history back to 2023
  const btcCompanies = btcTreasury?.companies || []
  const knownTickers = new Set(TREASURY_TICKERS)
  btcCompanies.forEach(c => {
    const t = toStockTicker(c.symbol)
    if (t) knownTickers.add(t)
  })

  const tickersToFetch = [...knownTickers]
  const fromDate = '2023-01-01'
  const today = daysAgo(0)

  const detailPromises = tickersToFetch.map(t =>
    fetch(`/api/massive?action=ticker_details&ticker=${t}`).then(parseJSON).catch(() => null)
  )
  const aggsPromises = tickersToFetch.map(t =>
    fetch(`/api/massive?action=aggs&ticker=${t}&from=${fromDate}&to=${today}`).then(parseJSON).catch(() => null)
  )

  const [detailResults, aggsResults] = await Promise.all([
    Promise.allSettled(detailPromises),
    Promise.allSettled(aggsPromises),
  ])

  // Build lookups
  const tickerDetails = {}
  const tickerAggs = {}
  tickersToFetch.forEach((t, i) => {
    const detailRes = detailResults[i]
    if (detailRes.status === 'fulfilled' && detailRes.value?.results) {
      tickerDetails[t] = detailRes.value.results
    }
    const aggsRes = aggsResults[i]
    if (aggsRes.status === 'fulfilled' && aggsRes.value?.results) {
      tickerAggs[t] = aggsRes.value.results
    }
  })

  return {
    btcTreasury,
    ethTreasury,
    btcChart,
    tickerDetails,
    tickerAggs,
    tickersToFetch,
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TreasuryCompaniesTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mcapView, setMcapView] = useState('mcap') // 'mcap' | 'indexed'
  const [mcapRange, setMcapRange] = useState('ALL') // '3M' | '6M' | '1Y' | '2Y' | 'ALL'

  useEffect(() => {
    fetchTreasuryData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading treasury companies data from CoinGecko & Massive.com..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  // ─── Extract data ──────────────────────────────────────────────────────────

  const btcCompanies = data?.btcTreasury?.companies || []
  const ethCompanies = data?.ethTreasury?.companies || []
  const totalBtcHeld = data?.btcTreasury?.total_holdings || btcCompanies.reduce((s, c) => s + (c.total_holdings || 0), 0)
  const totalBtcValueUsd = data?.btcTreasury?.total_value_usd || btcCompanies.reduce((s, c) => s + (c.total_current_value_usd || 0), 0)
  const btcSupplyPct = data?.btcTreasury?.market_cap_dominance || 0

  // BTC price history for NAV over time
  const btcPrices = data?.btcChart?.prices || []
  const currentBtcPrice = btcPrices.length > 0 ? btcPrices[btcPrices.length - 1][1] : 0

  // Enrich companies with Massive.com stock data
  const enrichedBtcCompanies = btcCompanies.map(c => {
    const ticker = toStockTicker(c.symbol)
    const details = ticker ? data?.tickerDetails?.[ticker] : null
    const stockMcap = details?.market_cap || null
    const sharesOut = details?.share_class_shares_outstanding || details?.weighted_shares_outstanding || null
    const holdingsValue = c.total_current_value_usd || (c.total_holdings * currentBtcPrice)
    const mNAV = stockMcap && holdingsValue > 0 ? stockMcap / holdingsValue : null
    const premiumToNAV = stockMcap && holdingsValue > 0 ? stockMcap - holdingsValue : null
    const costBasis = c.total_entry_value_usd > 0 ? c.total_entry_value_usd / c.total_holdings : null

    return {
      ...c,
      ticker,
      stockMcap,
      sharesOut,
      holdingsValue,
      mNAV,
      premiumToNAV,
      costBasis,
    }
  }).sort((a, b) => (b.total_holdings || 0) - (a.total_holdings || 0))

  // Companies with stock data for mNAV calculations
  const withMNAV = enrichedBtcCompanies.filter(c => c.mNAV !== null && c.mNAV > 0 && c.mNAV < 50)

  // Aggregate mNAV (market-cap-weighted)
  const totalStockMcap = withMNAV.reduce((s, c) => s + (c.stockMcap || 0), 0)
  const totalHoldingsValue = withMNAV.reduce((s, c) => s + (c.holdingsValue || 0), 0)
  const aggregateMNAV = totalHoldingsValue > 0 ? totalStockMcap / totalHoldingsValue : null

  // ─── Chart 1: BTC Holdings by Company (top 20) ────────────────────────────

  const top20Holdings = enrichedBtcCompanies.slice(0, 20)
  const holdingsChartData = [...top20Holdings].reverse()

  // ─── Chart 2: Holdings Value by Company ────────────────────────────────────

  const top20Value = [...enrichedBtcCompanies]
    .sort((a, b) => (b.holdingsValue || 0) - (a.holdingsValue || 0))
    .slice(0, 20)
  const valueChartData = [...top20Value].reverse()

  // ─── Chart 3: mNAV by Company ─────────────────────────────────────────────

  const mnavSorted = [...withMNAV].sort((a, b) => b.mNAV - a.mNAV).slice(0, 20)
  const mnavChartData = [...mnavSorted].reverse()

  // ─── Chart 4: Aggregate NAV Over Time ──────────────────────────────────────

  // Use BTC price history × total BTC held to approximate aggregate NAV
  const navTimeSeries = btcPrices.map(([ts, price]) => ({
    date: new Date(ts).toISOString().split('T')[0],
    nav: totalBtcHeld * price,
  }))

  // ─── Chart 5: Premium to NAV ───────────────────────────────────────────────

  const premiumData = enrichedBtcCompanies
    .filter(c => c.premiumToNAV !== null)
    .sort((a, b) => (b.premiumToNAV || 0) - (a.premiumToNAV || 0))
    .slice(0, 15)
  const premiumChartData = [...premiumData].reverse()

  // ─── Chart 6: Stock Performance vs BTC (normalized) ────────────────────────

  const performanceTickers = ['MSTR', 'MARA', 'CLSK', 'RIOT']
  const btcDailyPrices = btcPrices.map(([ts, price]) => ({
    date: new Date(ts).toISOString().split('T')[0],
    price,
  }))
  const btcBasePrice = btcDailyPrices.length > 0 ? btcDailyPrices[0].price : 1

  const stockPerformanceTraces = performanceTickers
    .filter(t => data?.tickerAggs?.[t]?.length > 0)
    .map((ticker, i) => {
      const bars = data.tickerAggs[ticker]
      const baseClose = bars[0]?.c || 1
      return {
        x: bars.map(b => new Date(b.t).toISOString().split('T')[0]),
        y: bars.map(b => ((b.c / baseClose) - 1) * 100),
        type: 'scatter',
        mode: 'lines',
        name: ticker,
        line: { color: colors.palette[i % colors.palette.length], width: 2 },
        hovertemplate: `${ticker}: %{y:+.1f}%<extra></extra>`,
      }
    })

  // Add BTC performance trace
  if (btcDailyPrices.length > 0) {
    stockPerformanceTraces.push({
      x: btcDailyPrices.map(d => d.date),
      y: btcDailyPrices.map(d => ((d.price / btcBasePrice) - 1) * 100),
      type: 'scatter',
      mode: 'lines',
      name: 'BTC',
      line: { color: colors.warning, width: 3, dash: 'dot' },
      hovertemplate: 'BTC: %{y:+.1f}%<extra></extra>',
    })
  }

  // ─── Chart 7: Cost Basis Analysis ──────────────────────────────────────────

  const withCostBasis = enrichedBtcCompanies
    .filter(c => c.costBasis && c.costBasis > 0 && c.total_holdings > 100)
    .sort((a, b) => a.costBasis - b.costBasis)
    .slice(0, 20)

  // ─── Chart 8: ETH Treasury Holdings ────────────────────────────────────────

  const ethSorted = [...ethCompanies]
    .sort((a, b) => (b.total_holdings || 0) - (a.total_holdings || 0))
    .slice(0, 15)
  const ethChartData = [...ethSorted].reverse()
  const totalEthHeld = ethCompanies.reduce((s, c) => s + (c.total_holdings || 0), 0)
  const totalEthValue = ethCompanies.reduce((s, c) => s + (c.total_current_value_usd || 0), 0)

  // ─── Check if Massive.com data is available ────────────────────────────────

  const hasMassiveData = Object.keys(data?.tickerDetails || {}).length > 0
  const hasAggsData = Object.keys(data?.tickerAggs || {}).length > 0

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Total BTC Held"
          value={formatNumber(totalBtcHeld, 0)}
          subtitle={`${btcSupplyPct.toFixed(2)}% of supply`}
        />
        <KPICard
          title="Total Holdings Value"
          value={formatCurrency(totalBtcValueUsd)}
          subtitle={`${btcCompanies.length} companies`}
        />
        <KPICard
          title="Companies Holding BTC"
          value={btcCompanies.length.toString()}
          subtitle="Public companies"
        />
        <KPICard
          title="Aggregate mNAV"
          value={aggregateMNAV ? formatMultiple(aggregateMNAV) : '—'}
          subtitle={hasMassiveData ? 'Market cap / Holdings value' : 'Requires Massive.com API'}
        />
      </div>

      {/* Massive.com not configured warning */}
      {!hasMassiveData && (
        <div className="bg-amber-50 border border-amber-200 p-4 text-center">
          <p className="text-amber-800 text-sm font-medium">
            Stock market data from Massive.com is not available. Configure <code className="bg-amber-100 px-1 rounded">MASSIVE_API_KEY</code> in
            Vercel to enable mNAV, premium-to-NAV, and stock performance charts.
          </p>
        </div>
      )}

      {/* Chart 1: BTC Holdings by Company */}
      <ChartCard
        title="BTC Holdings by Company"
        subtitle="Top 20 public companies by Bitcoin held — Source: CoinGecko"
        csvData={{
          filename: 'btc-holdings-by-company',
          headers: ['Company', 'Symbol', 'BTC_Held', 'Value_USD', 'Pct_Supply', 'Country'],
          rows: top20Holdings.map(c => [c.name, c.symbol, c.total_holdings, c.holdingsValue?.toFixed(0), c.percentage_of_total_supply, c.country]),
        }}
      >
        <Plot
          data={[{
            y: holdingsChartData.map(c => `${c.name} (${c.symbol})`),
            x: holdingsChartData.map(c => c.total_holdings),
            type: 'bar',
            orientation: 'h',
            marker: {
              color: holdingsChartData.map((_, i) => colors.palette[i % colors.palette.length]),
              line: { width: 0 },
            },
            text: holdingsChartData.map(c => ` ${formatNumber(c.total_holdings, 0)} BTC`),
            textposition: 'outside',
            textfont: { size: 10, color: '#374151' },
            hovertemplate: '%{y}<br><b>%{x:,.0f} BTC</b><extra></extra>',
            cliponaxis: false,
          }]}
          layout={{
            ...defaultLayout,
            height: Math.max(500, holdingsChartData.length * 28 + 80),
            margin: { t: 10, r: 100, b: 40, l: 10 },
            xaxis: { ...defaultLayout.xaxis, title: 'BTC Holdings' },
            yaxis: { ...defaultLayout.yaxis, automargin: true },
            bargap: 0.15,
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 2: Holdings Value by Company */}
      <ChartCard
        title="Holdings Value by Company"
        subtitle="USD value of Bitcoin treasury holdings — Source: CoinGecko"
        csvData={{
          filename: 'btc-holdings-value',
          headers: ['Company', 'Symbol', 'Value_USD', 'BTC_Held'],
          rows: top20Value.map(c => [c.name, c.symbol, c.holdingsValue?.toFixed(0), c.total_holdings]),
        }}
      >
        <Plot
          data={[{
            y: valueChartData.map(c => `${c.name} (${c.symbol})`),
            x: valueChartData.map(c => c.holdingsValue),
            type: 'bar',
            orientation: 'h',
            marker: {
              color: valueChartData.map((_, i) => colors.palette[i % colors.palette.length]),
              line: { width: 0 },
            },
            text: valueChartData.map(c => ` ${formatCurrency(c.holdingsValue)}`),
            textposition: 'outside',
            textfont: { size: 10, color: '#374151' },
            hovertemplate: '%{y}<br><b>$%{x:,.0f}</b><extra></extra>',
            cliponaxis: false,
          }]}
          layout={{
            ...defaultLayout,
            height: Math.max(500, valueChartData.length * 28 + 80),
            margin: { t: 10, r: 100, b: 40, l: 10 },
            xaxis: { ...defaultLayout.xaxis, title: 'Holdings Value (USD)', tickformat: '$,.2s' },
            yaxis: { ...defaultLayout.yaxis, automargin: true },
            bargap: 0.15,
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 3: mNAV by Company */}
      {withMNAV.length > 0 && (
        <ChartCard
          title="mNAV by Company (Market Cap / Holdings Value)"
          subtitle="Companies trading above 1.0x are at a premium to their crypto holdings — Source: Massive.com + CoinGecko"
          csvData={{
            filename: 'mnav-by-company',
            headers: ['Company', 'Ticker', 'mNAV', 'Market_Cap', 'Holdings_Value'],
            rows: mnavSorted.map(c => [c.name, c.ticker, c.mNAV?.toFixed(2), c.stockMcap?.toFixed(0), c.holdingsValue?.toFixed(0)]),
          }}
        >
          <Plot
            data={[{
              y: mnavChartData.map(c => `${c.name} (${c.ticker})`),
              x: mnavChartData.map(c => c.mNAV),
              type: 'bar',
              orientation: 'h',
              marker: {
                color: mnavChartData.map(c =>
                  c.mNAV > 3 ? colors.danger :
                  c.mNAV > 1.5 ? colors.warning :
                  c.mNAV > 1 ? colors.success :
                  colors.slate
                ),
                line: { width: 0 },
              },
              text: mnavChartData.map(c => ` ${c.mNAV?.toFixed(2)}x`),
              textposition: 'outside',
              textfont: { size: 10, color: '#374151' },
              hovertemplate: '%{y}<br><b>mNAV: %{x:.2f}x</b><extra></extra>',
              cliponaxis: false,
            }]}
            layout={{
              ...defaultLayout,
              height: Math.max(400, mnavChartData.length * 28 + 80),
              margin: { t: 10, r: 80, b: 40, l: 10 },
              xaxis: { ...defaultLayout.xaxis, title: 'mNAV Multiple' },
              yaxis: { ...defaultLayout.yaxis, automargin: true },
              shapes: [{
                type: 'line', x0: 1, x1: 1, y0: -0.5, y1: mnavChartData.length - 0.5,
                line: { color: colors.danger, width: 2, dash: 'dash' },
              }],
              annotations: [{
                x: 1, y: mnavChartData.length - 0.5, text: 'NAV Parity (1.0x)',
                showarrow: false, font: { size: 10, color: colors.danger },
                xanchor: 'left', yanchor: 'bottom', xshift: 5,
              }],
              bargap: 0.15,
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 4: Aggregate NAV Over Time */}
      {navTimeSeries.length > 0 && (
        <ChartCard
          title="Aggregate NAV Over Time"
          subtitle={`Total BTC holdings (${formatNumber(totalBtcHeld, 0)} BTC) × daily BTC price — 365 days`}
          csvData={{
            filename: 'aggregate-nav-over-time',
            headers: ['Date', 'Aggregate_NAV_USD'],
            rows: navTimeSeries.filter((_, i) => i % 7 === 0).map(d => [d.date, d.nav.toFixed(0)]),
          }}
        >
          <Plot
            data={[{
              x: navTimeSeries.map(d => d.date),
              y: navTimeSeries.map(d => d.nav),
              type: 'scatter',
              mode: 'lines',
              fill: 'tozeroy',
              fillcolor: 'rgba(46,94,142,0.1)',
              line: { color: colors.primary, width: 2 },
              hovertemplate: '%{x}<br><b>$%{y:,.0f}</b><extra>Aggregate NAV</extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 400,
              yaxis: { ...defaultLayout.yaxis, title: 'Aggregate NAV (USD)', tickformat: '$,.2s' },
              xaxis: { ...defaultLayout.xaxis, title: '' },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 5: Premium to NAV */}
      {premiumData.length > 0 && (
        <ChartCard
          title="Premium to NAV"
          subtitle="Market cap minus crypto holdings value — positive = trading at premium — Source: Massive.com + CoinGecko"
          csvData={{
            filename: 'premium-to-nav',
            headers: ['Company', 'Ticker', 'Premium_USD', 'Market_Cap', 'Holdings_Value'],
            rows: premiumData.map(c => [c.name, c.ticker, c.premiumToNAV?.toFixed(0), c.stockMcap?.toFixed(0), c.holdingsValue?.toFixed(0)]),
          }}
        >
          <Plot
            data={[{
              y: premiumChartData.map(c => `${c.name} (${c.ticker})`),
              x: premiumChartData.map(c => c.premiumToNAV),
              type: 'bar',
              orientation: 'h',
              marker: {
                color: premiumChartData.map(c =>
                  c.premiumToNAV > 0 ? colors.success : colors.danger
                ),
                line: { width: 0 },
              },
              text: premiumChartData.map(c => ` ${formatCurrency(c.premiumToNAV)}`),
              textposition: 'outside',
              textfont: { size: 10, color: '#374151' },
              hovertemplate: '%{y}<br><b>$%{x:,.0f}</b><extra></extra>',
              cliponaxis: false,
            }]}
            layout={{
              ...defaultLayout,
              height: Math.max(400, premiumChartData.length * 28 + 80),
              margin: { t: 10, r: 100, b: 40, l: 10 },
              xaxis: { ...defaultLayout.xaxis, title: 'Premium to NAV (USD)', tickformat: '$,.2s' },
              yaxis: { ...defaultLayout.yaxis, automargin: true },
              shapes: [{
                type: 'line', x0: 0, x1: 0, y0: -0.5, y1: premiumChartData.length - 0.5,
                line: { color: '#999', width: 1, dash: 'dash' },
              }],
              bargap: 0.15,
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 6: Stock Performance vs BTC */}
      {stockPerformanceTraces.length > 1 && (
        <ChartCard
          title="Stock Performance vs BTC (365 Days)"
          subtitle="Normalized returns — each line starts at 0% on day 1 — Source: Massive.com + CoinGecko"
          csvData={{
            filename: 'stock-vs-btc-performance',
            headers: ['Ticker', 'Start_Date', 'End_Return_Pct'],
            rows: stockPerformanceTraces.map(t => [t.name, t.x?.[0], t.y?.[t.y.length - 1]?.toFixed(1)]),
          }}
        >
          <Plot
            data={stockPerformanceTraces}
            layout={{
              ...defaultLayout,
              height: 450,
              yaxis: { ...defaultLayout.yaxis, title: 'Return (%)', ticksuffix: '%' },
              xaxis: { ...defaultLayout.xaxis },
              legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
              shapes: [{
                type: 'line', x0: stockPerformanceTraces[0]?.x?.[0], x1: stockPerformanceTraces[0]?.x?.[stockPerformanceTraces[0].x.length - 1],
                y0: 0, y1: 0, line: { color: '#999', width: 1, dash: 'dash' },
              }],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 7: Cost Basis Analysis */}
      {withCostBasis.length > 0 && (
        <ChartCard
          title="BTC Cost Basis by Company"
          subtitle={`Average entry price per BTC vs current price ($${formatNumber(currentBtcPrice, 0)}) — Source: CoinGecko`}
          csvData={{
            filename: 'btc-cost-basis',
            headers: ['Company', 'Symbol', 'Avg_Cost_Per_BTC', 'BTC_Held', 'Total_Entry_Value', 'Unrealized_PnL'],
            rows: withCostBasis.map(c => [
              c.name, c.symbol, c.costBasis?.toFixed(0), c.total_holdings,
              c.total_entry_value_usd?.toFixed(0),
              ((c.total_holdings * currentBtcPrice) - c.total_entry_value_usd)?.toFixed(0),
            ]),
          }}
        >
          <Plot
            data={[
              {
                x: withCostBasis.map(c => c.name),
                y: withCostBasis.map(c => c.costBasis),
                type: 'bar',
                name: 'Avg Cost Basis',
                marker: {
                  color: withCostBasis.map(c =>
                    c.costBasis < currentBtcPrice ? colors.success : colors.danger
                  ),
                  line: { width: 0 },
                },
                hovertemplate: '%{x}<br>Cost Basis: $%{y:,.0f}<extra></extra>',
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 420,
              xaxis: { ...defaultLayout.xaxis, tickangle: -45, type: 'category' },
              yaxis: { ...defaultLayout.yaxis, title: 'Avg Cost per BTC (USD)', tickformat: '$,.0f' },
              shapes: [{
                type: 'line', x0: -0.5, x1: withCostBasis.length - 0.5,
                y0: currentBtcPrice, y1: currentBtcPrice,
                line: { color: colors.warning, width: 2, dash: 'dash' },
              }],
              annotations: [{
                x: withCostBasis.length - 1, y: currentBtcPrice,
                text: `Current BTC: $${formatNumber(currentBtcPrice, 0)}`,
                showarrow: false, font: { size: 10, color: colors.warning },
                yshift: 12,
              }],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Chart 8: ETH Treasury Holdings */}
      {ethChartData.length > 0 && (
        <ChartCard
          title="ETH Treasury Holdings by Company"
          subtitle={`${ethCompanies.length} companies holding ${formatNumber(totalEthHeld, 0)} ETH (${formatCurrency(totalEthValue)}) — Source: CoinGecko`}
          csvData={{
            filename: 'eth-treasury-holdings',
            headers: ['Company', 'Symbol', 'ETH_Held', 'Value_USD', 'Country'],
            rows: ethSorted.map(c => [c.name, c.symbol, c.total_holdings, c.total_current_value_usd?.toFixed(0), c.country]),
          }}
        >
          <Plot
            data={[{
              y: ethChartData.map(c => `${c.name} (${c.symbol})`),
              x: ethChartData.map(c => c.total_holdings),
              type: 'bar',
              orientation: 'h',
              marker: {
                color: ethChartData.map((_, i) => colors.palette[(i + 2) % colors.palette.length]),
                line: { width: 0 },
              },
              text: ethChartData.map(c => ` ${formatNumber(c.total_holdings, 0)} ETH`),
              textposition: 'outside',
              textfont: { size: 10, color: '#374151' },
              hovertemplate: '%{y}<br><b>%{x:,.0f} ETH</b><extra></extra>',
              cliponaxis: false,
            }]}
            layout={{
              ...defaultLayout,
              height: Math.max(400, ethChartData.length * 28 + 80),
              margin: { t: 10, r: 100, b: 40, l: 10 },
              xaxis: { ...defaultLayout.xaxis, title: 'ETH Holdings' },
              yaxis: { ...defaultLayout.yaxis, automargin: true },
              bargap: 0.15,
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* ─── Market Cap / Indexed Performance Chart ─────────────────────── */}
      {(() => {
        const allTickerAggs = data?.tickerAggs || {}
        const allTickerDetails = data?.tickerDetails || {}
        const availableTickers = Object.keys(allTickerAggs).filter(t => allTickerAggs[t]?.length > 5)

        if (availableTickers.length === 0) return null

        // Time range filter
        const rangeMap = { '3M': 90, '6M': 180, '1Y': 365, '2Y': 730, 'ALL': 9999 }
        const rangeDays = rangeMap[mcapRange] || 9999
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - rangeDays)
        const cutoffTs = cutoffDate.getTime()

        // Sort tickers by latest market cap
        const tickersBySize = availableTickers
          .map(t => {
            const bars = allTickerAggs[t]
            const lastClose = bars[bars.length - 1]?.c || 0
            const shares = allTickerDetails[t]?.share_class_shares_outstanding
              || allTickerDetails[t]?.weighted_shares_outstanding || 0
            return { ticker: t, mcap: lastClose * shares, lastClose }
          })
          .sort((a, b) => b.mcap - a.mcap)

        const traces = tickersBySize.map(({ ticker }, i) => {
          const bars = allTickerAggs[ticker]
          const details = allTickerDetails[ticker]
          const sharesOut = details?.share_class_shares_outstanding
            || details?.weighted_shares_outstanding || 1

          const filtered = bars.filter(b => b.t >= cutoffTs)
          if (filtered.length < 2) return null

          const baseClose = filtered[0]?.c || 1
          const dates = filtered.map(b => new Date(b.t).toISOString().split('T')[0])
          const values = mcapView === 'indexed'
            ? filtered.map(b => (b.c / baseClose) * 100)
            : filtered.map(b => b.c * sharesOut)

          // Show top 10 by default, rest hidden in legend
          const visible = i < 10 ? true : 'legendonly'

          return {
            x: dates,
            y: values,
            type: 'scatter',
            mode: 'lines',
            name: ticker,
            line: { color: EXT_PALETTE[i % EXT_PALETTE.length], width: i === 0 ? 2.5 : 1.5 },
            visible,
            hovertemplate: mcapView === 'indexed'
              ? `${ticker}: %{y:.1f}<extra></extra>`
              : `${ticker}: $%{y:,.0f}<extra></extra>`,
          }
        }).filter(Boolean)

        if (traces.length === 0) return null

        const yTitle = mcapView === 'indexed' ? 'Indexed Value (100 = Start)' : 'Market Cap (USD)'
        const yFormat = mcapView === 'indexed' ? '' : '$,.2s'

        return (
          <ChartCard
            title={mcapView === 'indexed'
              ? 'Crypto Treasury Companies: Indexed Performance (Base 100)'
              : 'Crypto Treasury Companies: Market Cap'}
            subtitle={`${traces.length} treasury company stocks — ${mcapView === 'indexed' ? 'Indexed to 100 at start of period' : 'Price × shares outstanding'} — Source: Massive.com`}
            csvData={{
              filename: `treasury-${mcapView}-${mcapRange}`,
              headers: ['Ticker', 'Latest_Value'],
              rows: tickersBySize.filter(t => allTickerAggs[t.ticker]?.length > 5).map(({ ticker, mcap }) => [ticker, mcap.toFixed(0)]),
            }}
          >
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {/* View toggle */}
              <div className="flex rounded-md border border-(--color-rule) overflow-hidden">
                {[['mcap', 'Market Cap'], ['indexed', 'Indexed (100)']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMcapView(key)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      mcapView === key
                        ? 'bg-(--color-primary) text-white'
                        : 'text-(--color-text-secondary) hover:bg-(--color-paper-alt)'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Time range */}
              <div className="flex rounded-md border border-(--color-rule) overflow-hidden">
                {['3M', '6M', '1Y', '2Y', 'ALL'].map(range => (
                  <button
                    key={range}
                    onClick={() => setMcapRange(range)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      mcapRange === range
                        ? 'bg-(--color-primary) text-white'
                        : 'text-(--color-text-secondary) hover:bg-(--color-paper-alt)'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <Plot
              data={traces}
              layout={{
                ...defaultLayout,
                height: 550,
                yaxis: { ...defaultLayout.yaxis, title: yTitle, tickformat: yFormat },
                xaxis: {
                  ...defaultLayout.xaxis,
                  rangeslider: { visible: true, thickness: 0.06 },
                },
                legend: {
                  ...defaultLayout.legend,
                  orientation: 'v',
                  x: 1.02,
                  y: 1,
                  font: { size: 10 },
                },
                margin: { t: 10, r: 120, b: 60, l: 70 },
                ...(mcapView === 'indexed' ? {
                  shapes: [{
                    type: 'line',
                    x0: traces[0]?.x?.[0],
                    x1: traces[0]?.x?.[traces[0].x.length - 1],
                    y0: 100, y1: 100,
                    line: { color: '#999', width: 1, dash: 'dash' },
                  }],
                } : {}),
              }}
              config={defaultConfig}
              className="w-full"
            />
          </ChartCard>
        )
      })()}

      {/* Narrative */}
      <NarrativeBox title="Treasury Company Analysis">
        <p>
          Corporate Bitcoin treasuries represent a structural shift in how public companies manage reserves.
          Strategy (formerly MicroStrategy) pioneered the model, and now {btcCompanies.length} public companies
          collectively hold {formatNumber(totalBtcHeld, 0)} BTC — approximately {btcSupplyPct.toFixed(2)}% of
          total Bitcoin supply.
        </p>
        <p>
          The <strong>mNAV multiple</strong> shows how the market values a company relative to its crypto
          holdings. An mNAV above 1.0x indicates the market is pricing in a premium for the company's
          operational business, leveraged BTC exposure, or perceived ability to acquire more Bitcoin. Companies
          like Strategy historically trade at significant premiums due to their convertible debt strategy and
          perceived "BTC yield."
        </p>
        <p>
          <strong>Cost basis</strong> reveals who bought well. Companies that acquired BTC at lower average prices
          sit on larger unrealized gains, providing a buffer against drawdowns. The gap between cost basis and
          current price is effectively a measure of treasury management quality.
        </p>
        {ethCompanies.length > 0 && (
          <p>
            ETH treasury holdings remain more concentrated — {ethCompanies.length} companies hold {formatNumber(totalEthHeld, 0)} ETH
            ({formatCurrency(totalEthValue)}), reflecting Ethereum's different adoption curve among corporate treasurers.
          </p>
        )}
      </NarrativeBox>
    </div>
  )
}
