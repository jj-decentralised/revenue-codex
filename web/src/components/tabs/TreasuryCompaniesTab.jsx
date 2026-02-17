import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatNumber, formatPercent, formatMultiple } from '../../utils/helpers'

// ─── Ticker symbol mapping ──────────────────────────────────────────────────
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

const TOP_FINANCIALS_TICKERS = ['MSTR', 'MARA', 'RIOT', 'CLSK', 'COIN', 'HUT', 'BITF', 'CIFR', 'CORZ', 'BTBT']

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

const COMPANY_CATEGORY = {
  'MSTR': 'Treasury', 'XXI': 'Treasury', 'SBET': 'Treasury', 'BMNR': 'Treasury',
  'BRR': 'Treasury', 'BTCS': 'Treasury', 'PURR': 'Treasury', 'ETHM': 'Treasury',
  'FWDI': 'Treasury', 'CEPO': 'Treasury', 'BNC': 'Treasury', 'NAKA': 'Treasury',
  'DFDV': 'Treasury', 'SUIG': 'Treasury', 'SLMT': 'Treasury', 'HSDT': 'Treasury',
  'STSS': 'Treasury', 'HYPD': 'Treasury', 'STKE': 'Treasury', 'WGRX': 'Treasury',
  'SQNS': 'Treasury', 'ETHZ': 'Treasury', 'UPXI': 'Treasury',
  'MARA': 'Miner', 'RIOT': 'Miner', 'CLSK': 'Miner', 'CIFR': 'Miner',
  'HUT': 'Miner', 'BITF': 'Miner', 'CORZ': 'Miner', 'BTBT': 'Miner',
  'COIN': 'Exchange',
}
const CATEGORY_COLORS = { 'Treasury': '#2E5E8E', 'Miner': '#B8860B', 'Exchange': '#6B5B8D', 'Other': '#64748B' }
function getCategory(ticker) { return COMPANY_CATEGORY[ticker] || 'Other' }

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildFinancialTicks(values) {
  if (!values || !values.length) return {}
  const max = Math.max(...values)
  const min = Math.min(...values, 0)
  const range = max - min
  if (range === 0) return {}
  const rawStep = range / 6
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const residual = rawStep / mag
  const niceStep = residual <= 1 ? mag : residual <= 2 ? 2 * mag : residual <= 5 ? 5 * mag : 10 * mag
  const tickvals = []
  const start = Math.floor(min / niceStep) * niceStep
  for (let v = start; v <= max + niceStep * 0.1; v += niceStep) tickvals.push(v)
  return { tickvals, ticktext: tickvals.map(v => v < 0 ? '-' + formatCurrency(Math.abs(v)) : formatCurrency(v)) }
}

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function enrichCompanies(companies, currentPrice, tickerDetails) {
  return companies.map(c => {
    const ticker = toStockTicker(c.symbol)
    const details = ticker ? tickerDetails?.[ticker] : null
    const stockMcap = details?.market_cap || null
    const sharesOut = details?.share_class_shares_outstanding || details?.weighted_shares_outstanding || null
    const holdingsValue = c.total_current_value_usd || (c.total_holdings * currentPrice)
    const mNAV = stockMcap && holdingsValue > 0 ? stockMcap / holdingsValue : null
    const premiumToNAV = stockMcap && holdingsValue > 0 ? stockMcap - holdingsValue : null
    const costBasis = c.total_entry_value_usd > 0 ? c.total_entry_value_usd / c.total_holdings : null
    return { ...c, ticker, stockMcap, sharesOut, holdingsValue, mNAV, premiumToNAV, costBasis }
  }).sort((a, b) => (b.total_holdings || 0) - (a.total_holdings || 0))
}

function extractFinancials(filings) {
  if (!filings?.length) return null
  const f = filings[0]
  const is = f?.financials?.income_statement || {}
  const bs = f?.financials?.balance_sheet || {}
  return {
    revenue: is.revenues?.value || 0, netIncome: is.net_income_loss?.value || 0,
    assets: bs.assets?.value || 0, liabilities: bs.liabilities?.value || 0,
    equity: bs.equity?.value || 0,
    debtToEquity: bs.equity?.value ? (bs.liabilities?.value || 0) / bs.equity.value : null,
    period: `${f.fiscal_period || ''} ${f.fiscal_year || ''}`.trim(),
  }
}

// ─── Data fetching ──────────────────────────────────────────────────────────

async function fetchTreasuryData() {
  const parseJSON = async (r) => { if (!r.ok) return null; return r.json() }
  const fromDate = '2023-01-01'
  const daysSinceStart = Math.ceil((Date.now() - new Date(fromDate).getTime()) / 86400000)

  // Phase 1: CoinGecko — treasury lists, price history, categories
  const [btcTreasury, ethTreasury, btcChart, ethChart, categories] = await Promise.all([
    fetch('/api/coingecko?action=public_treasury_btc').then(parseJSON).catch(() => null),
    fetch('/api/coingecko?action=public_treasury_eth').then(parseJSON).catch(() => null),
    fetch(`/api/coingecko?action=coin_chart&coin_id=bitcoin&days=${daysSinceStart}`).then(parseJSON).catch(() => null),
    fetch(`/api/coingecko?action=coin_chart&coin_id=ethereum&days=${daysSinceStart}`).then(parseJSON).catch(() => null),
    fetch('/api/coingecko?action=categories').then(parseJSON).catch(() => null),
  ])

  // Collect ALL tickers from BTC + ETH companies
  const btcCompanies = btcTreasury?.companies || []
  const ethCompanies = ethTreasury?.companies || []
  const knownTickers = new Set(TREASURY_TICKERS)
  btcCompanies.forEach(c => { const t = toStockTicker(c.symbol); if (t) knownTickers.add(t) })
  ethCompanies.forEach(c => { const t = toStockTicker(c.symbol); if (t) knownTickers.add(t) })
  const tickersToFetch = [...knownTickers]
  const today = daysAgo(0)

  // Phase 2: Massive.com — stock details + daily aggs
  const detailPromises = tickersToFetch.map(t =>
    fetch(`/api/massive?action=ticker_details&ticker=${t}`).then(parseJSON).catch(() => null)
  )
  const aggsPromises = tickersToFetch.map(t =>
    fetch(`/api/massive?action=aggs&ticker=${t}&from=${fromDate}&to=${today}`).then(parseJSON).catch(() => null)
  )

  // Phase 3: Snapshot, financials, events
  const snapshotPromise = fetch(`/api/massive?action=snapshot_tickers&tickers=${tickersToFetch.join(',')}`)
    .then(parseJSON).catch(() => null)
  const financialsPromises = TOP_FINANCIALS_TICKERS.map(t =>
    fetch(`/api/massive?action=financials&ticker=${t}`).then(parseJSON).catch(() => null)
  )
  const dividendsPromises = TOP_FINANCIALS_TICKERS.map(t =>
    fetch(`/api/massive?action=dividends&ticker=${t}`).then(parseJSON).catch(() => null)
  )
  const splitsPromises = TOP_FINANCIALS_TICKERS.map(t =>
    fetch(`/api/massive?action=splits&ticker=${t}`).then(parseJSON).catch(() => null)
  )

  const [detailResults, aggsResults, snapshot, financialsResults, dividendsResults, splitsResults] = await Promise.all([
    Promise.allSettled(detailPromises), Promise.allSettled(aggsPromises), snapshotPromise,
    Promise.allSettled(financialsPromises), Promise.allSettled(dividendsPromises), Promise.allSettled(splitsPromises),
  ])

  const tickerDetails = {}, tickerAggs = {}
  tickersToFetch.forEach((t, i) => {
    const dr = detailResults[i]; if (dr.status === 'fulfilled' && dr.value?.results) tickerDetails[t] = dr.value.results
    const ar = aggsResults[i]; if (ar.status === 'fulfilled' && ar.value?.results) tickerAggs[t] = ar.value.results
  })

  const tickerFinancials = {}
  TOP_FINANCIALS_TICKERS.forEach((t, i) => {
    const r = financialsResults[i]
    if (r.status === 'fulfilled' && r.value?.results?.length > 0) tickerFinancials[t] = r.value.results
  })

  const allDividends = [], allSplits = []
  TOP_FINANCIALS_TICKERS.forEach((t, i) => {
    const dr = dividendsResults[i]
    if (dr.status === 'fulfilled' && dr.value?.results) dr.value.results.forEach(d => allDividends.push({ ...d, ticker: t }))
    const sr = splitsResults[i]
    if (sr.status === 'fulfilled' && sr.value?.results) sr.value.results.forEach(s => allSplits.push({ ...s, ticker: t }))
  })

  return {
    btcTreasury, ethTreasury, btcChart, ethChart, tickerDetails, tickerAggs, tickersToFetch,
    snapshot: snapshot?.tickers || [], tickerFinancials, allDividends, allSplits,
    categories: Array.isArray(categories) ? categories : [],
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TreasuryCompaniesTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [assetView, setAssetView] = useState('btc')
  const [mcapView, setMcapView] = useState('mcap')
  const [mcapRange, setMcapRange] = useState('ALL')

  useEffect(() => {
    fetchTreasuryData().then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading treasury companies data from CoinGecko & Massive.com..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  // ─── Extract & enrich ───────────────────────────────────────────────────

  const btcCompanies = data?.btcTreasury?.companies || []
  const ethCompanies = data?.ethTreasury?.companies || []
  const btcPrices = data?.btcChart?.prices || []
  const ethPrices = data?.ethChart?.prices || []
  const currentBtcPrice = btcPrices.length > 0 ? btcPrices[btcPrices.length - 1][1] : 0
  const currentEthPrice = ethPrices.length > 0 ? ethPrices[ethPrices.length - 1][1] : 0

  const totalBtcHeld = data?.btcTreasury?.total_holdings || btcCompanies.reduce((s, c) => s + (c.total_holdings || 0), 0)
  const totalBtcValueUsd = data?.btcTreasury?.total_value_usd || btcCompanies.reduce((s, c) => s + (c.total_current_value_usd || 0), 0)
  const btcSupplyPct = data?.btcTreasury?.market_cap_dominance || 0
  const totalEthHeld = ethCompanies.reduce((s, c) => s + (c.total_holdings || 0), 0)
  const totalEthValue = ethCompanies.reduce((s, c) => s + (c.total_current_value_usd || 0), 0)

  const enrichedBtcCompanies = enrichCompanies(btcCompanies, currentBtcPrice, data?.tickerDetails)
  const enrichedEthCompanies = enrichCompanies(ethCompanies, currentEthPrice, data?.tickerDetails)

  // Combined: merge by company name, sum USD value
  const combinedCompanies = (() => {
    const map = new Map()
    enrichedBtcCompanies.forEach(c => map.set(c.name, { ...c, btcHeld: c.total_holdings, ethHeld: 0, assets: ['BTC'], totalCryptoValue: c.holdingsValue || 0 }))
    enrichedEthCompanies.forEach(c => {
      const ex = map.get(c.name)
      if (ex) { ex.ethHeld = c.total_holdings; ex.totalCryptoValue += c.holdingsValue || 0; ex.holdingsValue = ex.totalCryptoValue; ex.assets.push('ETH') }
      else map.set(c.name, { ...c, btcHeld: 0, ethHeld: c.total_holdings, assets: ['ETH'], totalCryptoValue: c.holdingsValue || 0 })
    })
    return [...map.values()].sort((a, b) => b.totalCryptoValue - a.totalCryptoValue)
  })()

  // Active data based on toggle
  const isEth = assetView === 'eth'
  const isCombined = assetView === 'combined'
  const activeCompanies = isCombined ? combinedCompanies : isEth ? enrichedEthCompanies : enrichedBtcCompanies
  const activeLabel = isCombined ? 'Crypto' : isEth ? 'ETH' : 'BTC'
  const activePrices = isEth ? ethPrices : btcPrices
  const activeCurrentPrice = isEth ? currentEthPrice : currentBtcPrice
  const activeTotalHeld = isEth ? totalEthHeld : totalBtcHeld
  const activeTotalValue = isCombined ? totalBtcValueUsd + totalEthValue : isEth ? totalEthValue : totalBtcValueUsd
  const activeCompanyCount = isEth ? ethCompanies.length : isCombined ? btcCompanies.length + ethCompanies.length : btcCompanies.length

  const withMNAV = activeCompanies.filter(c => c.mNAV !== null && c.mNAV > 0 && c.mNAV < 50)
  const totalStockMcap = withMNAV.reduce((s, c) => s + (c.stockMcap || 0), 0)
  const totalHoldingsVal = withMNAV.reduce((s, c) => s + (c.holdingsValue || 0), 0)
  const aggregateMNAV = totalHoldingsVal > 0 ? totalStockMcap / totalHoldingsVal : null

  // ─── Chart data ───────────────────────────────────────────────────────

  const top20Holdings = activeCompanies.slice(0, 20)
  const holdingsChartData = [...top20Holdings].reverse()

  const top20Value = [...activeCompanies].sort((a, b) => (b.holdingsValue || 0) - (a.holdingsValue || 0)).slice(0, 20)
  const valueChartData = [...top20Value].reverse()

  const mnavSorted = [...withMNAV].sort((a, b) => b.mNAV - a.mNAV).slice(0, 20)
  const mnavChartData = [...mnavSorted].reverse()

  const navTimeSeries = isCombined
    ? btcPrices.map(([ts, btcP]) => {
        const ethP = ethPrices.find(([et]) => Math.abs(et - ts) < 86400000)?.[1] || 0
        return { date: new Date(ts).toISOString().split('T')[0], nav: totalBtcHeld * btcP + totalEthHeld * ethP }
      })
    : activePrices.map(([ts, price]) => ({ date: new Date(ts).toISOString().split('T')[0], nav: activeTotalHeld * price }))

  const allPremiums = activeCompanies.filter(c => c.premiumToNAV !== null).sort((a, b) => (b.premiumToNAV || 0) - (a.premiumToNAV || 0))
  const premiumData = [...allPremiums.slice(0, 10), ...allPremiums.filter(c => c.premiumToNAV < 0).slice(-5)]
    .filter((c, i, arr) => arr.findIndex(x => x.symbol === c.symbol) === i)
    .sort((a, b) => (b.premiumToNAV || 0) - (a.premiumToNAV || 0))
  const premiumChartData = [...premiumData].reverse()

  // Stock performance
  const perfTickers = isEth ? ['COIN'] : ['MSTR', 'MARA', 'CLSK', 'RIOT']
  const perfCryptoLabel = isCombined ? 'BTC' : activeLabel
  const cryptoDailyPrices = (isCombined ? btcPrices : activePrices).map(([ts, price]) => ({ date: new Date(ts).toISOString().split('T')[0], price }))
  const cryptoBasePrice = cryptoDailyPrices.length > 0 ? cryptoDailyPrices[0].price : 1

  const stockPerfTraces = perfTickers.filter(t => data?.tickerAggs?.[t]?.length > 0).map((ticker, i) => {
    const bars = data.tickerAggs[ticker]; const baseClose = bars[0]?.c || 1
    return { x: bars.map(b => new Date(b.t).toISOString().split('T')[0]), y: bars.map(b => ((b.c / baseClose) - 1) * 100), type: 'scatter', mode: 'lines', name: ticker, line: { color: colors.palette[i % colors.palette.length], width: 2 }, hovertemplate: `${ticker}: %{y:+.1f}%<extra></extra>` }
  })
  if (cryptoDailyPrices.length > 0) {
    stockPerfTraces.push({ x: cryptoDailyPrices.map(d => d.date), y: cryptoDailyPrices.map(d => ((d.price / cryptoBasePrice) - 1) * 100), type: 'scatter', mode: 'lines', name: perfCryptoLabel, line: { color: colors.warning, width: 3, dash: 'dot' }, hovertemplate: `${perfCryptoLabel}: %{y:+.1f}%<extra></extra>` })
    if (isCombined && ethPrices.length > 0) {
      const ethDaily = ethPrices.map(([ts, p]) => ({ date: new Date(ts).toISOString().split('T')[0], price: p }))
      const ethBase = ethDaily[0]?.price || 1
      stockPerfTraces.push({ x: ethDaily.map(d => d.date), y: ethDaily.map(d => ((d.price / ethBase) - 1) * 100), type: 'scatter', mode: 'lines', name: 'ETH', line: { color: colors.secondary, width: 3, dash: 'dash' }, hovertemplate: 'ETH: %{y:+.1f}%<extra></extra>' })
    }
  }

  // Cost basis (skip for combined)
  const withCostBasis = isCombined ? [] : activeCompanies
    .filter(c => c.costBasis && c.costBasis > (isEth ? 100 : 1000) && c.total_holdings > (isEth ? 10 : 100))
    .sort((a, b) => a.costBasis - b.costBasis).slice(0, 20)
  const costBasisChartData = [...withCostBasis].reverse()

  // Snapshot rows
  const snapshotRows = (data?.snapshot || []).filter(s => s?.ticker && s?.day?.c).map(s => {
    const detail = data?.tickerDetails?.[s.ticker]; const name = detail?.name || s.ticker
    const btcCo = btcCompanies.find(c => toStockTicker(c.symbol) === s.ticker)
    const ethCo = ethCompanies.find(c => toStockTicker(c.symbol) === s.ticker)
    const asset = btcCo && ethCo ? 'BTC+ETH' : ethCo ? 'ETH' : 'BTC'
    return { ticker: s.ticker, name, asset, price: s.day?.c || s.prevDay?.c || 0, changePerc: s.todaysChangePerc || 0, volume: s.day?.v || 0, mcap: (s.day?.c || 0) * (detail?.share_class_shares_outstanding || detail?.weighted_shares_outstanding || 0) }
  }).sort((a, b) => b.mcap - a.mcap)

  // Financial health
  const financialRows = TOP_FINANCIALS_TICKERS.map(t => {
    const f = extractFinancials(data?.tickerFinancials?.[t]); if (!f) return null
    return { ticker: t, name: data?.tickerDetails?.[t]?.name || t, ...f }
  }).filter(Boolean)

  // Events
  const allSplits = (data?.allSplits || []).filter(s => s.execution_date)
  const allDividends = (data?.allDividends || []).filter(d => d.ex_dividend_date && d.cash_amount > 0)

  // Categories (top 25)
  const categoryData = (data?.categories || []).filter(c => c.market_cap > 0).sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0)).slice(0, 25)
  const categoryChartData = [...categoryData].reverse()

  // Precomputed
  const hasMassiveData = Object.keys(data?.tickerDetails || {}).length > 0
  const holdingsValueTicks = buildFinancialTicks(valueChartData.map(c => c.holdingsValue))
  const navTicks = buildFinancialTicks(navTimeSeries.map(d => d.nav))
  const premiumTicks = buildFinancialTicks(premiumChartData.map(c => c.premiumToNAV))

  const fmtD = d => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const perfStart = stockPerfTraces[0]?.x?.[0]
  const perfEnd = stockPerfTraces[0]?.x?.[stockPerfTraces[0]?.x?.length - 1]
  const perfTitle = perfStart && perfEnd ? `Stock Performance vs ${perfCryptoLabel} (${fmtD(perfStart)} — ${fmtD(perfEnd)})` : `Stock Performance vs ${perfCryptoLabel}`

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Asset Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-(--color-text-secondary)">View:</span>
        <div className="flex rounded-md border border-(--color-rule) overflow-hidden">
          {[['btc', '₿ Bitcoin'], ['eth', 'Ξ Ethereum'], ['combined', '⊕ Combined']].map(([key, label]) => (
            <button key={key} onClick={() => setAssetView(key)}
              className={`px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer ${assetView === key ? 'bg-(--color-primary) text-white' : 'text-(--color-text-secondary) hover:bg-(--color-paper-alt)'}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title={isCombined ? 'Total Crypto Value' : `Total ${activeLabel} Held`}
          value={isCombined ? formatCurrency(activeTotalValue) : formatNumber(activeTotalHeld, 0)}
          subtitle={isCombined ? `${btcCompanies.length} BTC + ${ethCompanies.length} ETH companies` : isEth ? `${activeCompanyCount} companies` : `${btcSupplyPct.toFixed(2)}% of supply`} />
        <KPICard title="Holdings Value" value={formatCurrency(activeTotalValue)} subtitle={`${activeCompanyCount} companies`} />
        <KPICard title={`Companies Holding ${activeLabel}`} value={activeCompanyCount.toString()} subtitle="Public companies" />
        <KPICard title="Aggregate mNAV" value={aggregateMNAV ? formatMultiple(aggregateMNAV) : '—'} subtitle={hasMassiveData ? 'Market cap / Holdings value' : 'Requires Massive.com API'} />
      </div>

      {!hasMassiveData && (
        <div className="bg-amber-50 border border-amber-200 p-4 text-center">
          <p className="text-amber-800 text-sm font-medium">Stock data unavailable. Configure <code className="bg-amber-100 px-1 rounded">MASSIVE_API_KEY</code> in Vercel.</p>
        </div>
      )}

      {/* Live Prices Table */}
      {snapshotRows.length > 0 && (
        <ChartCard title="Live Stock Prices" subtitle={`${snapshotRows.length} treasury company stocks — Source: Massive.com`}
          csvData={{ filename: 'live-treasury-prices', headers: ['Ticker', 'Company', 'Asset', 'Price', 'Change_Pct', 'Volume', 'Market_Cap'], rows: snapshotRows.map(r => [r.ticker, r.name, r.asset, r.price?.toFixed(2), r.changePerc?.toFixed(2), r.volume, r.mcap?.toFixed(0)]) }}>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-(--color-rule) text-left text-xs uppercase tracking-wider text-(--color-text-secondary)">
                  <th className="py-2 px-3">Ticker</th><th className="py-2 px-3">Company</th><th className="py-2 px-3">Asset</th>
                  <th className="py-2 px-3 text-right">Price</th><th className="py-2 px-3 text-right">Daily Chg</th>
                  <th className="py-2 px-3 text-right">Volume</th><th className="py-2 px-3 text-right">Market Cap</th>
                </tr>
              </thead>
              <tbody>
                {snapshotRows.slice(0, 30).map(r => (
                  <tr key={r.ticker} className="border-b border-(--color-rule)/30 hover:bg-(--color-paper-alt)/50 transition-colors">
                    <td className="py-1.5 px-3 font-mono font-semibold">{r.ticker}</td>
                    <td className="py-1.5 px-3 truncate max-w-48">{r.name}</td>
                    <td className="py-1.5 px-3"><span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${r.asset === 'BTC+ETH' ? 'bg-purple-100 text-purple-700' : r.asset === 'ETH' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{r.asset}</span></td>
                    <td className="py-1.5 px-3 text-right font-mono">${r.price?.toFixed(2)}</td>
                    <td className={`py-1.5 px-3 text-right font-mono font-medium ${r.changePerc >= 0 ? 'text-green-600' : 'text-red-600'}`}>{r.changePerc >= 0 ? '+' : ''}{r.changePerc?.toFixed(2)}%</td>
                    <td className="py-1.5 px-3 text-right font-mono">{formatNumber(r.volume, 1)}</td>
                    <td className="py-1.5 px-3 text-right font-mono">{formatCurrency(r.mcap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {/* Holdings by Company */}
      <ChartCard title={`${activeLabel} Holdings by Company`}
        subtitle={`Top 20 public companies ${isCombined ? 'by total crypto value' : `by ${activeLabel} held`} — Source: CoinGecko`}
        csvData={{ filename: `${activeLabel.toLowerCase()}-holdings`, headers: ['Company', 'Symbol', isCombined ? 'Value_USD' : `${activeLabel}_Held`], rows: top20Holdings.map(c => [c.name, c.symbol, isCombined ? c.holdingsValue?.toFixed(0) : c.total_holdings]) }}>
        <Plot
          data={[{
            y: holdingsChartData.map(c => `${c.name} (${c.symbol})`),
            x: holdingsChartData.map(c => isCombined ? c.holdingsValue : c.total_holdings),
            type: 'bar', orientation: 'h',
            marker: { color: holdingsChartData.map((_, i) => colors.palette[i % colors.palette.length]), line: { width: 0 } },
            text: holdingsChartData.map(c => isCombined ? ` ${formatCurrency(c.holdingsValue)}` : ` ${formatNumber(c.total_holdings, 0)} ${activeLabel}`),
            textposition: 'outside', textfont: { size: 10, color: '#374151' },
            hovertemplate: isCombined ? '%{y}<br><b>$%{x:,.0f}</b><extra></extra>' : `%{y}<br><b>%{x:,.0f} ${activeLabel}</b><extra></extra>`,
            cliponaxis: false,
          }]}
          layout={{ ...defaultLayout, height: Math.max(500, holdingsChartData.length * 28 + 80), margin: { t: 10, r: 100, b: 40, l: 10 },
            xaxis: { ...defaultLayout.xaxis, title: isCombined ? 'Holdings Value (USD)' : `${activeLabel} Holdings`, type: 'linear', ...(isCombined ? buildFinancialTicks(holdingsChartData.map(c => c.holdingsValue)) : {}) },
            yaxis: { ...defaultLayout.yaxis, automargin: true }, bargap: 0.15 }}
          config={defaultConfig} className="w-full"
        />
      </ChartCard>

      {/* Holdings Value */}
      {!isCombined && (
        <ChartCard title={`${activeLabel} Holdings Value by Company`} subtitle={`USD value of ${activeLabel} treasury — Source: CoinGecko`}
          csvData={{ filename: `${activeLabel.toLowerCase()}-value`, headers: ['Company', 'Symbol', 'Value_USD'], rows: top20Value.map(c => [c.name, c.symbol, c.holdingsValue?.toFixed(0)]) }}>
          <Plot
            data={[{
              y: valueChartData.map(c => `${c.name} (${c.symbol})`), x: valueChartData.map(c => c.holdingsValue),
              type: 'bar', orientation: 'h',
              marker: { color: valueChartData.map((_, i) => colors.palette[i % colors.palette.length]), line: { width: 0 } },
              text: valueChartData.map(c => ` ${formatCurrency(c.holdingsValue)}`), textposition: 'outside', textfont: { size: 10, color: '#374151' },
              hovertemplate: '%{y}<br><b>$%{x:,.0f}</b><extra></extra>', cliponaxis: false,
            }]}
            layout={{ ...defaultLayout, height: Math.max(500, valueChartData.length * 28 + 80), margin: { t: 10, r: 100, b: 40, l: 10 },
              xaxis: { ...defaultLayout.xaxis, title: 'Holdings Value (USD)', type: 'linear', ...holdingsValueTicks },
              yaxis: { ...defaultLayout.yaxis, automargin: true }, bargap: 0.15 }}
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      {/* mNAV */}
      {withMNAV.length > 0 && (
        <ChartCard title={`mNAV by Company (${activeLabel})`} subtitle="Market cap / holdings value — Treasury (blue), Miner (gold), Exchange (purple), Other (gray)"
          csvData={{ filename: `${activeLabel.toLowerCase()}-mnav`, headers: ['Company', 'Ticker', 'Category', 'mNAV'], rows: mnavSorted.map(c => [c.name, c.ticker, getCategory(c.ticker), c.mNAV?.toFixed(2)]) }}>
          <Plot
            data={[{
              y: mnavChartData.map(c => `${c.name} (${c.ticker}) [${getCategory(c.ticker)}]`), x: mnavChartData.map(c => c.mNAV),
              type: 'bar', orientation: 'h',
              marker: { color: mnavChartData.map(c => CATEGORY_COLORS[getCategory(c.ticker)]), line: { width: 0 } },
              text: mnavChartData.map(c => ` ${c.mNAV?.toFixed(2)}x`), textposition: 'outside', textfont: { size: 10, color: '#374151' },
              hovertemplate: '%{y}<br><b>mNAV: %{x:.2f}x</b><extra></extra>', cliponaxis: false,
            }]}
            layout={{ ...defaultLayout, height: Math.max(400, mnavChartData.length * 28 + 80), margin: { t: 10, r: 80, b: 40, l: 10 },
              xaxis: { ...defaultLayout.xaxis, title: 'mNAV Multiple', type: 'linear' }, yaxis: { ...defaultLayout.yaxis, automargin: true },
              shapes: [{ type: 'line', x0: 1, x1: 1, y0: -0.5, y1: mnavChartData.length - 0.5, line: { color: colors.danger, width: 2, dash: 'dash' } }],
              annotations: [{ x: 1, y: mnavChartData.length - 0.5, text: 'NAV Parity (1.0x)', showarrow: false, font: { size: 10, color: colors.danger }, xanchor: 'left', yanchor: 'bottom', xshift: 5 }],
              bargap: 0.15 }}
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      {/* Aggregate NAV Over Time */}
      {navTimeSeries.length > 0 && (
        <ChartCard title={`Aggregate ${activeLabel} NAV Over Time`}
          subtitle={isCombined ? `${formatNumber(totalBtcHeld, 0)} BTC + ${formatNumber(totalEthHeld, 0)} ETH × daily prices` : `${formatNumber(activeTotalHeld, 0)} ${activeLabel} × daily price`}
          csvData={{ filename: `${activeLabel.toLowerCase()}-nav`, headers: ['Date', 'NAV_USD'], rows: navTimeSeries.filter((_, i) => i % 7 === 0).map(d => [d.date, d.nav.toFixed(0)]) }}>
          <Plot
            data={[{ x: navTimeSeries.map(d => d.date), y: navTimeSeries.map(d => d.nav), type: 'scatter', mode: 'lines', fill: 'tozeroy',
              fillcolor: isEth ? 'rgba(107,91,141,0.1)' : 'rgba(46,94,142,0.1)',
              line: { color: isEth ? colors.secondary : colors.primary, width: 2 },
              hovertemplate: '%{x}<br><b>$%{y:,.0f}</b><extra>Aggregate NAV</extra>' }]}
            layout={{ ...defaultLayout, height: 400, yaxis: { ...defaultLayout.yaxis, title: 'Aggregate NAV (USD)', ...navTicks }, xaxis: { ...defaultLayout.xaxis, title: '' } }}
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      {/* Premium / Discount to NAV */}
      {premiumData.length > 0 && (
        <ChartCard title={`Premium / Discount to NAV (${activeLabel})`} subtitle="Market cap minus holdings value — green = premium, red = discount"
          csvData={{ filename: `${activeLabel.toLowerCase()}-premium`, headers: ['Company', 'Ticker', 'Premium_USD'], rows: premiumData.map(c => [c.name, c.ticker, c.premiumToNAV?.toFixed(0)]) }}>
          <Plot
            data={[{
              y: premiumChartData.map(c => `${c.name} (${c.ticker})`), x: premiumChartData.map(c => c.premiumToNAV),
              type: 'bar', orientation: 'h',
              marker: { color: premiumChartData.map(c => c.premiumToNAV > 0 ? colors.success : colors.danger), line: { width: 0 } },
              text: premiumChartData.map(c => ` ${formatCurrency(c.premiumToNAV)}`), textposition: 'outside', textfont: { size: 10, color: '#374151' },
              hovertemplate: '%{y}<br><b>$%{x:,.0f}</b><extra></extra>', cliponaxis: false,
            }]}
            layout={{ ...defaultLayout, height: Math.max(400, premiumChartData.length * 28 + 80), margin: { t: 10, r: 100, b: 40, l: 10 },
              xaxis: { ...defaultLayout.xaxis, title: 'Premium / Discount (USD)', type: 'linear', ...premiumTicks },
              yaxis: { ...defaultLayout.yaxis, automargin: true },
              shapes: [{ type: 'line', x0: 0, x1: 0, y0: -0.5, y1: premiumChartData.length - 0.5, line: { color: '#999', width: 1, dash: 'dash' } }], bargap: 0.15 }}
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      {/* Stock Performance vs Crypto */}
      {stockPerfTraces.length > 1 && (
        <ChartCard title={perfTitle} subtitle="Normalized returns — each line starts at 0% on day 1"
          csvData={{ filename: `stock-vs-${activeLabel.toLowerCase()}`, headers: ['Ticker', 'Start', 'End_Return_Pct'], rows: stockPerfTraces.map(t => [t.name, t.x?.[0], t.y?.[t.y.length - 1]?.toFixed(1)]) }}>
          <Plot data={stockPerfTraces}
            layout={{ ...defaultLayout, height: 450, yaxis: { ...defaultLayout.yaxis, title: 'Return (%)', ticksuffix: '%' }, xaxis: { ...defaultLayout.xaxis },
              legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
              shapes: [{ type: 'line', x0: stockPerfTraces[0]?.x?.[0], x1: stockPerfTraces[0]?.x?.[stockPerfTraces[0].x.length - 1], y0: 0, y1: 0, line: { color: '#999', width: 1, dash: 'dash' } }] }}
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      {/* Cost Basis */}
      {costBasisChartData.length > 0 && (
        <ChartCard title={`${activeLabel} Cost Basis by Company`} subtitle={`Avg entry price vs current ($${formatNumber(activeCurrentPrice, 0)}) — Source: CoinGecko`}
          csvData={{ filename: `${activeLabel.toLowerCase()}-cost-basis`, headers: ['Company', 'Ticker', 'Avg_Cost', 'Holdings'], rows: withCostBasis.map(c => [c.name, c.ticker || c.symbol, c.costBasis?.toFixed(0), c.total_holdings]) }}>
          <Plot
            data={[{
              y: costBasisChartData.map(c => `${c.name} (${c.ticker || c.symbol})`), x: costBasisChartData.map(c => c.costBasis),
              type: 'bar', orientation: 'h',
              marker: { color: costBasisChartData.map(c => c.costBasis < activeCurrentPrice ? colors.success : colors.danger), line: { width: 0 } },
              text: costBasisChartData.map(c => ` $${formatNumber(c.costBasis, 0)}`), textposition: 'outside', textfont: { size: 10, color: '#374151' },
              hovertemplate: '%{y}<br>Cost Basis: <b>$%{x:,.0f}</b><extra></extra>', cliponaxis: false,
            }]}
            layout={{ ...defaultLayout, height: Math.max(400, costBasisChartData.length * 28 + 80), margin: { t: 10, r: 100, b: 40, l: 10 },
              xaxis: { ...defaultLayout.xaxis, title: `Avg Cost per ${activeLabel} (USD)`, type: 'linear', tickformat: '$,.0f' },
              yaxis: { ...defaultLayout.yaxis, automargin: true },
              shapes: [{ type: 'line', x0: activeCurrentPrice, x1: activeCurrentPrice, y0: -0.5, y1: costBasisChartData.length - 0.5, line: { color: colors.warning, width: 2, dash: 'dash' } }],
              annotations: [{ x: activeCurrentPrice, y: costBasisChartData.length - 0.5, text: `Current: $${formatNumber(activeCurrentPrice, 0)}`, showarrow: false, font: { size: 10, color: colors.warning }, xanchor: 'left', yanchor: 'bottom', xshift: 5 }], bargap: 0.15 }}
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      {/* Financial Health */}
      {financialRows.length > 0 && (
        <ChartCard title="Financial Health — Treasury Companies" subtitle={`Liabilities vs Equity from latest SEC filings (${financialRows[0]?.period}) — Source: Massive.com / SEC EDGAR`}
          csvData={{ filename: 'treasury-financials', headers: ['Ticker', 'Company', 'Revenue', 'NetIncome', 'Liabilities', 'Equity', 'D/E'], rows: financialRows.map(r => [r.ticker, r.name, r.revenue, r.netIncome, r.liabilities, r.equity, r.debtToEquity?.toFixed(2)]) }}>
          <Plot
            data={[
              { y: [...financialRows].reverse().map(r => `${r.name} (${r.ticker})`), x: [...financialRows].reverse().map(r => r.liabilities), type: 'bar', orientation: 'h', name: 'Liabilities', marker: { color: colors.danger }, opacity: 0.8, hovertemplate: '%{y}<br>Liabilities: <b>$%{x:,.0f}</b><extra></extra>' },
              { y: [...financialRows].reverse().map(r => `${r.name} (${r.ticker})`), x: [...financialRows].reverse().map(r => r.equity), type: 'bar', orientation: 'h', name: 'Equity', marker: { color: colors.success }, opacity: 0.8, hovertemplate: '%{y}<br>Equity: <b>$%{x:,.0f}</b><extra></extra>' },
            ]}
            layout={{ ...defaultLayout, height: Math.max(350, financialRows.length * 35 + 80), margin: { t: 10, r: 20, b: 40, l: 10 }, barmode: 'group',
              xaxis: { ...defaultLayout.xaxis, title: 'USD', type: 'linear', ...buildFinancialTicks([...financialRows.map(r => r.liabilities), ...financialRows.map(r => r.equity)]) },
              yaxis: { ...defaultLayout.yaxis, automargin: true }, legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 } }}
            config={defaultConfig} className="w-full"
          />
          {financialRows.filter(r => r.debtToEquity !== null).length > 2 && (
            <div className="mt-6 pt-4 border-t border-(--color-rule)">
              <h4 className="text-sm font-medium text-(--color-text-secondary) mb-3">Debt-to-Equity Ratio</h4>
              <Plot
                data={[{
                  x: financialRows.filter(r => r.debtToEquity !== null).map(r => r.ticker),
                  y: financialRows.filter(r => r.debtToEquity !== null).map(r => r.debtToEquity),
                  type: 'bar', marker: { color: financialRows.filter(r => r.debtToEquity !== null).map(r => r.debtToEquity > 5 ? colors.danger : r.debtToEquity > 2 ? colors.warning : colors.success), line: { width: 0 } },
                  text: financialRows.filter(r => r.debtToEquity !== null).map(r => `${r.debtToEquity?.toFixed(1)}x`), textposition: 'outside', textfont: { size: 10 },
                  hovertemplate: '%{x}<br>D/E: <b>%{y:.2f}x</b><extra></extra>',
                }]}
                layout={{ ...defaultLayout, height: 300, xaxis: { ...defaultLayout.xaxis, type: 'category' }, yaxis: { ...defaultLayout.yaxis, title: 'Debt / Equity' },
                  shapes: [{ type: 'line', x0: -0.5, x1: financialRows.filter(r => r.debtToEquity !== null).length - 0.5, y0: 1, y1: 1, line: { color: '#999', width: 1, dash: 'dash' } }] }}
                config={defaultConfig} className="w-full"
              />
            </div>
          )}
        </ChartCard>
      )}

      {/* Corporate Events Timeline */}
      {(allSplits.length > 0 || allDividends.length > 0) && (
        <ChartCard title="Corporate Events Timeline" subtitle="Stock splits and dividends for top treasury companies — Source: Massive.com"
          csvData={{ filename: 'treasury-events', headers: ['Type', 'Ticker', 'Date', 'Detail'], rows: [...allSplits.map(s => ['Split', s.ticker, s.execution_date, `${s.split_to}:${s.split_from}`]), ...allDividends.map(d => ['Dividend', d.ticker, d.ex_dividend_date, `$${d.cash_amount}`])] }}>
          <Plot
            data={[
              ...(allSplits.length > 0 ? [{ x: allSplits.map(s => s.execution_date), y: allSplits.map(s => s.ticker), text: allSplits.map(s => `${s.split_to}:${s.split_from}`), mode: 'markers+text', type: 'scatter', name: 'Splits', marker: { size: 14, color: colors.primary, symbol: 'diamond' }, textposition: 'top center', textfont: { size: 9 }, hovertemplate: '%{y}<br>%{x}<br>%{text}<extra>Split</extra>' }] : []),
              ...(allDividends.length > 0 ? [{ x: allDividends.map(d => d.ex_dividend_date), y: allDividends.map(d => d.ticker), text: allDividends.map(d => `$${d.cash_amount?.toFixed(2)}`), mode: 'markers', type: 'scatter', name: 'Dividends', marker: { size: 8, color: colors.success, symbol: 'circle' }, hovertemplate: '%{y}<br>%{x}<br>$%{text}<extra>Dividend</extra>' }] : []),
            ]}
            layout={{ ...defaultLayout, height: 350, xaxis: { ...defaultLayout.xaxis }, yaxis: { ...defaultLayout.yaxis, automargin: true, type: 'category' }, legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 }, margin: { t: 10, r: 20, b: 40, l: 10 } }}
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      {/* Market Cap / Indexed Performance */}
      {(() => {
        const allTickerAggs = data?.tickerAggs || {}; const allTickerDetails = data?.tickerDetails || {}
        const availableTickers = Object.keys(allTickerAggs).filter(t => allTickerAggs[t]?.length > 5)
        if (availableTickers.length === 0) return null
        const rangeMap = { '3M': 90, '6M': 180, '1Y': 365, '2Y': 730, 'ALL': 9999 }
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (rangeMap[mcapRange] || 9999)); const cutoffTs = cutoff.getTime()
        const tickersBySize = availableTickers.map(t => {
          const bars = allTickerAggs[t]; const lastClose = bars[bars.length - 1]?.c || 0
          const shares = allTickerDetails[t]?.share_class_shares_outstanding || allTickerDetails[t]?.weighted_shares_outstanding || 0
          return { ticker: t, mcap: lastClose * shares }
        }).sort((a, b) => b.mcap - a.mcap)
        const traces = tickersBySize.map(({ ticker }, i) => {
          const bars = allTickerAggs[ticker]; const details = allTickerDetails[ticker]
          const sharesOut = details?.share_class_shares_outstanding || details?.weighted_shares_outstanding || 1
          const filtered = bars.filter(b => b.t >= cutoffTs); if (filtered.length < 2) return null
          const baseClose = filtered[0]?.c || 1
          return { x: filtered.map(b => new Date(b.t).toISOString().split('T')[0]), y: mcapView === 'indexed' ? filtered.map(b => (b.c / baseClose) * 100) : filtered.map(b => b.c * sharesOut), type: 'scatter', mode: 'lines', name: ticker, line: { color: EXT_PALETTE[i % EXT_PALETTE.length], width: i === 0 ? 2.5 : 1.5 }, visible: i < 10 ? true : 'legendonly', hovertemplate: mcapView === 'indexed' ? `${ticker}: %{y:.1f}<extra></extra>` : `${ticker}: $%{y:,.0f}<extra></extra>` }
        }).filter(Boolean)
        if (traces.length === 0) return null
        let mcapTickCfg = {}
        if (mcapView !== 'indexed') { let yMax = 0; traces.forEach(t => { if (t.visible === true) t.y.forEach(v => { if (v > yMax) yMax = v }) }); if (yMax > 0) mcapTickCfg = buildFinancialTicks([0, yMax]) }
        return (
          <ChartCard title={mcapView === 'indexed' ? 'Treasury Companies: Indexed Performance (Base 100)' : 'Treasury Companies: Market Cap'}
            subtitle={`${traces.length} stocks — Source: Massive.com`}
            csvData={{ filename: `treasury-${mcapView}-${mcapRange}`, headers: ['Ticker', 'Value'], rows: tickersBySize.map(({ ticker, mcap }) => [ticker, mcap.toFixed(0)]) }}>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex rounded-md border border-(--color-rule) overflow-hidden">
                {[['mcap', 'Market Cap'], ['indexed', 'Indexed (100)']].map(([k, l]) => (
                  <button key={k} onClick={() => setMcapView(k)} className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${mcapView === k ? 'bg-(--color-primary) text-white' : 'text-(--color-text-secondary) hover:bg-(--color-paper-alt)'}`}>{l}</button>
                ))}
              </div>
              <div className="flex rounded-md border border-(--color-rule) overflow-hidden">
                {['3M', '6M', '1Y', '2Y', 'ALL'].map(r => (
                  <button key={r} onClick={() => setMcapRange(r)} className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${mcapRange === r ? 'bg-(--color-primary) text-white' : 'text-(--color-text-secondary) hover:bg-(--color-paper-alt)'}`}>{r}</button>
                ))}
              </div>
            </div>
            <Plot data={traces}
              layout={{ ...defaultLayout, height: 550, yaxis: { ...defaultLayout.yaxis, title: mcapView === 'indexed' ? 'Indexed (100 = Start)' : 'Market Cap (USD)', ...mcapTickCfg },
                xaxis: { ...defaultLayout.xaxis, rangeslider: { visible: true, thickness: 0.06 } },
                legend: { ...defaultLayout.legend, orientation: 'v', x: 1.02, y: 1, font: { size: 10 } }, margin: { t: 10, r: 120, b: 60, l: 70 },
                ...(mcapView === 'indexed' ? { shapes: [{ type: 'line', x0: traces[0]?.x?.[0], x1: traces[0]?.x?.[traces[0].x.length - 1], y0: 100, y1: 100, line: { color: '#999', width: 1, dash: 'dash' } }] } : {}) }}
              config={defaultConfig} className="w-full"
            />
          </ChartCard>
        )
      })()}

      {/* Category Performance */}
      {categoryChartData.length > 0 && (
        <ChartCard title="Crypto Sector Performance" subtitle="CoinGecko category market caps — color = 24h change"
          csvData={{ filename: 'crypto-categories', headers: ['Category', 'Market_Cap', 'Change_24h_Pct'], rows: categoryData.map(c => [c.name, c.market_cap?.toFixed(0), c.market_cap_change_24h?.toFixed(2)]) }}>
          <Plot
            data={[{
              y: categoryChartData.map(c => c.name), x: categoryChartData.map(c => c.market_cap),
              type: 'bar', orientation: 'h',
              marker: { color: categoryChartData.map(c => c.market_cap_change_24h || 0), colorscale: [[0, '#C1352D'], [0.5, '#E5E3E0'], [1, '#2E7D4F']], cmin: -10, cmax: 10, colorbar: { title: '24h %', ticksuffix: '%', len: 0.5 } },
              text: categoryChartData.map(c => ` ${formatCurrency(c.market_cap)}  ${c.market_cap_change_24h >= 0 ? '+' : ''}${c.market_cap_change_24h?.toFixed(1)}%`),
              textposition: 'outside', textfont: { size: 9, color: '#374151' },
              hovertemplate: '%{y}<br>MCap: <b>$%{x:,.0f}</b><br>24h: %{marker.color:+.2f}%<extra></extra>', cliponaxis: false,
            }]}
            layout={{ ...defaultLayout, height: Math.max(500, categoryChartData.length * 22 + 80), margin: { t: 10, r: 160, b: 40, l: 10 },
              xaxis: { ...defaultLayout.xaxis, title: 'Market Cap (USD)', type: 'linear', ...buildFinancialTicks(categoryChartData.map(c => c.market_cap)) },
              yaxis: { ...defaultLayout.yaxis, automargin: true }, bargap: 0.12 }}
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      {/* Narrative */}
      <NarrativeBox title="Treasury Company Analysis">
        <p>
          Corporate crypto treasuries represent a structural shift in reserve management.
          {btcCompanies.length} public companies hold {formatNumber(totalBtcHeld, 0)} BTC (~{btcSupplyPct.toFixed(2)}% of supply),
          while {ethCompanies.length} companies hold {formatNumber(totalEthHeld, 0)} ETH ({formatCurrency(totalEthValue)}).
        </p>
        <p>
          The <strong>mNAV multiple</strong> shows how the market values a company relative to its crypto holdings.
          Above 1.0x indicates premium for operational business or leveraged crypto exposure.
          <strong> Cost basis</strong> reveals acquisition quality — the gap to current price measures treasury management effectiveness.
        </p>
        <p>
          The <strong>financial health</strong> section shows leverage exposure — critical for companies like Strategy
          that issue convertible debt to fund purchases. The <strong>category performance</strong> chart contextualizes
          broader crypto sector flows.
        </p>
      </NarrativeBox>
    </div>
  )
}
