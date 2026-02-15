import { deduplicatedFetch } from './cache'

// ============================================================
// DeFiLlama (free, client-side)
// ============================================================
const LLAMA_BASE = 'https://api.llama.fi'
const LLAMA_STABLES = 'https://stablecoins.llama.fi'
const LLAMA_BRIDGES = 'https://bridges.llama.fi'

export async function fetchFeesOverview() {
  return deduplicatedFetch(`${LLAMA_BASE}/overview/fees?excludeTotalDataChartBreakdown=false`)
}

export async function fetchProtocolFees(protocol) {
  return deduplicatedFetch(`${LLAMA_BASE}/summary/fees/${protocol}?dataType=dailyRevenue`)
}

export async function fetchAllProtocols() {
  return deduplicatedFetch(`${LLAMA_BASE}/protocols`)
}

export async function fetchProtocolDetail(protocol) {
  return deduplicatedFetch(`${LLAMA_BASE}/protocol/${protocol}`)
}

export async function fetchStablecoins() {
  return deduplicatedFetch(`${LLAMA_STABLES}/stablecoins?includePrices=true`)
}

export async function fetchStablecoinCharts() {
  return deduplicatedFetch(`${LLAMA_STABLES}/stablecoincharts/all?stablecoin=1`)
}

export async function fetchHistoricalChainTvl() {
  return deduplicatedFetch(`${LLAMA_BASE}/v2/historicalChainTvl`)
}

export async function fetchChainTvl(chain) {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/v2/historicalChainTvl/${chain}`)
  } catch {
    return null
  }
}

export async function fetchDexOverview() {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/overview/dexs`)
  } catch {
    return null
  }
}

export async function fetchDexByChain(chain) {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/overview/dexs/${chain}`)
  } catch {
    return null
  }
}

export async function fetchDexProtocol(protocol) {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/summary/dexs/${protocol}`)
  } catch {
    return null
  }
}

export async function fetchOptionsOverview() {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/overview/options`)
  } catch {
    return null
  }
}

export async function fetchDerivativesOverview() {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/overview/derivatives`)
  } catch {
    return null
  }
}

export async function fetchBridges() {
  try {
    return await deduplicatedFetch(`${LLAMA_BRIDGES}/bridges`)
  } catch {
    return null
  }
}

export async function fetchBridgeVolume(id) {
  try {
    return await deduplicatedFetch(`${LLAMA_BRIDGES}/bridge/${id}`)
  } catch {
    return null
  }
}

export async function fetchRaises() {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/raises`)
  } catch {
    return null
  }
}

export async function fetchHacks() {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/hacks`)
  } catch {
    return null
  }
}

export async function fetchFeesByChain(chain) {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/overview/fees/${chain}`)
  } catch {
    return null
  }
}

export async function fetchTreasury(protocol) {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/treasury/${protocol}`)
  } catch {
    return null
  }
}

export async function fetchProtocolUsers(protocol) {
  try {
    return await deduplicatedFetch(`${LLAMA_BASE}/userData/users/${protocol}`)
  } catch {
    return null
  }
}

// ============================================================
// Alternative.me — Fear & Greed Index (free, client-side)
// ============================================================
export async function fetchFearGreedIndex(limit = 0) {
  const data = await deduplicatedFetch(`https://api.alternative.me/fng/?limit=${limit}&format=json`)
  return data.data // array of { value, value_classification, timestamp }
}

// ============================================================
// Token Terminal (via serverless proxy) — Revenue & Income data
// ============================================================
export async function fetchTokenTerminalProjects() {
  return deduplicatedFetch('/api/token-terminal?endpoint=projects')
}

export async function fetchTokenTerminalMetrics(projectId, metrics = 'revenue,fees,earnings', interval = 'daily') {
  const params = new URLSearchParams({ endpoint: 'metrics', project_id: projectId, metric_id: metrics, interval })
  return deduplicatedFetch(`/api/token-terminal?${params}`)
}

export async function fetchTokenTerminalBulkMetrics(metric = 'revenue') {
  const params = new URLSearchParams({ endpoint: 'bulk-metrics', metric_id: metric })
  return deduplicatedFetch(`/api/token-terminal?${params}`)
}

export async function fetchTokenTerminalMarketSectors() {
  return deduplicatedFetch('/api/token-terminal?endpoint=market-sectors')
}

export async function fetchTokenTerminalAggregations(metric = 'revenue', projectId) {
  const params = new URLSearchParams({ endpoint: 'aggregations', metric_id: metric })
  if (projectId) params.set('project_id', projectId)
  return deduplicatedFetch(`/api/token-terminal?${params}`)
}

// Pull ALL key financial metrics for ALL projects in one call
// Returns { revenue, fees, earnings, token_incentives, price_to_sales, price_to_earnings, active_users }
export async function fetchTokenTerminalAllFinancials() {
  return deduplicatedFetch('/api/token-terminal?endpoint=all-financials')
}

// Pull historical revenue+fees+earnings for a specific project
export async function fetchTokenTerminalIncomeStatement(projectId) {
  const params = new URLSearchParams({
    endpoint: 'metrics',
    project_id: projectId,
    metric_id: 'revenue,fees,earnings,token_incentives,cost_of_revenue',
    interval: 'daily',
  })
  return deduplicatedFetch(`/api/token-terminal?${params}`)
}

// ============================================================
// Yahoo Finance (via serverless proxy)
// ============================================================
export async function fetchYahooQuote(symbol) {
  return deduplicatedFetch(`/api/yahoo?action=quote&symbol=${encodeURIComponent(symbol)}`)
}

export async function fetchYahooHistorical(symbol, period = '2y') {
  return deduplicatedFetch(`/api/yahoo?action=historical&symbol=${encodeURIComponent(symbol)}&period=${period}`)
}

// ============================================================
// Aggregated fetchers for tabs
// ============================================================
export async function fetchValuationsData() {
  const [fees, protocols, fng, markets, ttFinancials] = await Promise.allSettled([
    fetchFeesOverview(),
    fetchAllProtocols(),
    fetchFearGreedIndex(365),
    fetchCoinGeckoMarketsAll(),
    fetchTokenTerminalAllFinancials(),
  ])

  return {
    fees: fees.status === 'fulfilled' ? fees.value : null,
    protocols: protocols.status === 'fulfilled' ? protocols.value : null,
    fearGreed: fng.status === 'fulfilled' ? fng.value : null,
    markets: markets.status === 'fulfilled' ? markets.value : null,
    ttFinancials: ttFinancials.status === 'fulfilled' ? ttFinancials.value : null,
  }
}

export async function fetchSentimentData() {
  const [fees, fng] = await Promise.allSettled([
    fetchFeesOverview(),
    fetchFearGreedIndex(0),
  ])

  return {
    fees: fees.status === 'fulfilled' ? fees.value : null,
    fearGreed: fng.status === 'fulfilled' ? fng.value : null,
  }
}

export async function fetchRevenueQualityData() {
  const [fees, stablecoins, stablecoinCharts, ttFinancials] = await Promise.allSettled([
    fetchFeesOverview(),
    fetchStablecoins(),
    fetchStablecoinCharts(),
    fetchTokenTerminalAllFinancials(),
  ])

  return {
    fees: fees.status === 'fulfilled' ? fees.value : null,
    stablecoins: stablecoins.status === 'fulfilled' ? stablecoins.value : null,
    stablecoinCharts: stablecoinCharts.status === 'fulfilled' ? stablecoinCharts.value : null,
    ttFinancials: ttFinancials.status === 'fulfilled' ? ttFinancials.value : null,
  }
}

export async function fetchMoatsData() {
  const [allProtocols, fees, markets, ttFinancials, dexOverview] = await Promise.allSettled([
    fetchAllProtocols(),
    fetchFeesOverview(),
    fetchCoinGeckoMarketsAll(),
    fetchTokenTerminalAllFinancials(),
    fetchDexOverview(),
  ])

  // Fetch historical revenue for top 30 fee-earning protocols
  const feesProtocols = fees.status === 'fulfilled' ? (fees.value?.protocols || []) : []
  const top30Slugs = feesProtocols
    .filter(p => p.total24h > 0)
    .sort((a, b) => (b.total24h || 0) - (a.total24h || 0))
    .slice(0, 30)
    .map(p => p.slug)

  const protocolDetails = await Promise.allSettled(
    top30Slugs.map(p => fetchProtocolFees(p).catch(() => null))
  )

  return {
    allProtocols: allProtocols.status === 'fulfilled' ? allProtocols.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
    markets: markets.status === 'fulfilled' ? markets.value : null,
    ttFinancials: ttFinancials.status === 'fulfilled' ? ttFinancials.value : null,
    dexOverview: dexOverview.status === 'fulfilled' ? dexOverview.value : null,
    protocolDetails: protocolDetails
      .map((r, i) => ({ slug: top30Slugs[i], data: r.status === 'fulfilled' ? r.value : null }))
      .filter(r => r.data),
  }
}

export async function fetchFutureLeadersData() {
  const [protocols, fees] = await Promise.allSettled([
    fetchAllProtocols(),
    fetchFeesOverview(),
  ])

  return {
    protocols: protocols.status === 'fulfilled' ? protocols.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
  }
}

export async function fetchYieldPools() {
  return deduplicatedFetch('https://api.llama.fi/pools')
}

export async function fetchYieldAnalysisData() {
  const [pools, treasury] = await Promise.allSettled([
    fetchYieldPools(),
    fetchYahooQuote('^IRX'),
  ])

  // Treasury yield from Yahoo Finance ^IRX (13-week T-Bill rate)
  let treasuryYield = 4.5 // fallback
  if (treasury.status === 'fulfilled' && treasury.value?.regularMarketPrice) {
    treasuryYield = treasury.value.regularMarketPrice
  }

  return {
    pools: pools.status === 'fulfilled' ? pools.value : [],
    treasuryYield,
  }
}

// ============================================================
// CoinGecko (via serverless proxy)
// ============================================================
export async function fetchCoinGeckoDetail(coinId) {
  return deduplicatedFetch(`/api/coingecko?action=coin_detail&coin_id=${encodeURIComponent(coinId)}`)
}

export async function fetchDeveloperActivityData() {
  // Broader set — top 25 dev-active coins
  const targetCoins = [
    'ethereum', 'bitcoin', 'solana', 'uniswap', 'aave',
    'chainlink', 'maker', 'arbitrum', 'polygon-ecosystem-token', 'lido-dao',
    'optimism', 'near', 'cosmos', 'polkadot', 'avalanche-2',
    'the-graph', 'filecoin', 'starknet', 'aptos', 'sui',
    'compound-governance-token', 'synthetix-network-token', 'rocket-pool', 'celestia', 'eigenlayer'
  ]

  const [coinDetails, fees, ttFinancials] = await Promise.allSettled([
    Promise.allSettled(targetCoins.map(id => fetchCoinGeckoDetail(id))),
    fetchFeesOverview(),
    fetchTokenTerminalAllFinancials(),
  ])

  const coins = coinDetails.status === 'fulfilled'
    ? coinDetails.value.map((r, i) => ({
        id: targetCoins[i],
        data: r.status === 'fulfilled' ? r.value : null,
      })).filter(c => c.data)
    : []

  return {
    coins,
    fees: fees.status === 'fulfilled' ? fees.value : null,
    ttFinancials: ttFinancials.status === 'fulfilled' ? ttFinancials.value : null,
  }
}

export async function fetchCapitalEfficiencyData() {
  const [protocols, fees, markets, ttFinancials] = await Promise.allSettled([
    fetchAllProtocols(),
    fetchFeesOverview(),
    fetchCoinGeckoMarketsAll(),
    fetchTokenTerminalAllFinancials(),
  ])

  return {
    protocols: protocols.status === 'fulfilled' ? protocols.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
    markets: markets.status === 'fulfilled' ? markets.value : null,
    ttFinancials: ttFinancials.status === 'fulfilled' ? ttFinancials.value : null,
  }
}

export async function fetchMarketStructureData() {
  const [dexOverview, fees] = await Promise.allSettled([
    fetchDexOverview(),
    fetchFeesOverview(),
  ])

  return {
    dexOverview: dexOverview.status === 'fulfilled' ? dexOverview.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
  }
}

export async function fetchOnChainEconomyData() {
  const [historicalTvl, fees, stablecoins, stablecoinCharts, dexOverview] = await Promise.allSettled([
    fetchHistoricalChainTvl(),
    fetchFeesOverview(),
    fetchStablecoins(),
    fetchStablecoinCharts(),
    fetchDexOverview(),
  ])

  return {
    historicalTvl: historicalTvl.status === 'fulfilled' ? historicalTvl.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
    stablecoins: stablecoins.status === 'fulfilled' ? stablecoins.value : null,
    stablecoinCharts: stablecoinCharts.status === 'fulfilled' ? stablecoinCharts.value : null,
    dexOverview: dexOverview.status === 'fulfilled' ? dexOverview.value : null,
  }
}

export async function fetchMacroData() {
  const [fearGreed, fees] = await Promise.allSettled([
    fetchFearGreedIndex(365),
    fetchFeesOverview(),
  ])

  return {
    fearGreed: fearGreed.status === 'fulfilled' ? fearGreed.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
  }
}

export async function fetchDerivativesData() {
  const [derivatives, options, fees] = await Promise.allSettled([
    fetchDerivativesOverview(),
    fetchOptionsOverview(),
    fetchFeesOverview(),
  ])

  return {
    derivatives: derivatives.status === 'fulfilled' ? derivatives.value : null,
    options: options.status === 'fulfilled' ? options.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
  }
}

export async function fetchRaisesAndHacks() {
  const [raises, hacks] = await Promise.allSettled([
    fetchRaises(),
    fetchHacks(),
  ])

  return {
    raises: raises.status === 'fulfilled' ? raises.value : null,
    hacks: hacks.status === 'fulfilled' ? hacks.value : null,
  }
}

export async function fetchRiskPremiumData() {
  const [pools, treasury, fees] = await Promise.allSettled([
    fetchYieldPools(),
    fetchYahooQuote('^IRX'),
    fetchFeesOverview(),
  ])

  // Treasury yield from Yahoo Finance ^IRX (13-week T-Bill rate)
  let treasuryYield = 4.5 // fallback
  if (treasury.status === 'fulfilled' && treasury.value?.regularMarketPrice) {
    treasuryYield = treasury.value.regularMarketPrice
  }

  return {
    pools: pools.status === 'fulfilled' ? pools.value : [],
    treasuryYield,
    fees: fees.status === 'fulfilled' ? fees.value : null,
  }
}

// ============================================================
// CoinGecko Markets (via serverless proxy)
// ============================================================
export async function fetchCoinGeckoMarkets(page = 1) {
  return deduplicatedFetch(`/api/coingecko?action=markets&page=${page}&per_page=250`)
}

// Fetch 1000 coins (4 pages × 250) — uses Pro API server-side pagination
export async function fetchCoinGeckoMarketsAll() {
  return deduplicatedFetch('/api/coingecko?action=markets_all')
}

export async function fetchCoinGeckoCategories() {
  return deduplicatedFetch('/api/coingecko?action=categories')
}

export async function fetchCoinGeckoGlobal() {
  return deduplicatedFetch('/api/coingecko?action=global')
}

export async function fetchCoinGeckoExchanges() {
  return deduplicatedFetch('/api/coingecko?action=exchanges')
}

export async function fetchCoinGeckoTrending() {
  return deduplicatedFetch('/api/coingecko?action=trending')
}

export async function fetchTokenomicsStudyData() {
  // Fetch broad CoinGecko data for ALL 1000 coins + Token Terminal financials
  const [protocols, fees, markets, ttFinancials, categories] = await Promise.allSettled([
    fetchAllProtocols(),
    fetchFeesOverview(),
    fetchCoinGeckoMarketsAll(),
    fetchTokenTerminalAllFinancials(),
    fetchCoinGeckoCategories(),
  ])

  // Fetch detailed data for top 30 coins by market cap
  const allMarkets = markets.status === 'fulfilled' ? (markets.value || []) : []
  const topCoinIds = allMarkets
    .filter(m => m.market_cap > 0)
    .sort((a, b) => b.market_cap - a.market_cap)
    .slice(0, 30)
    .map(m => m.id)

  const coinDetailsResults = await Promise.allSettled(
    topCoinIds.map(id => fetchCoinGeckoDetail(id))
  )

  const coinDetails = coinDetailsResults
    .map((r, i) => ({
      id: topCoinIds[i],
      data: r.status === 'fulfilled' ? r.value : null,
    }))
    .filter(c => c.data)

  return {
    protocols: protocols.status === 'fulfilled' ? protocols.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
    markets: allMarkets,
    ttFinancials: ttFinancials.status === 'fulfilled' ? ttFinancials.value : null,
    categories: categories.status === 'fulfilled' ? categories.value : null,
    coinDetails,
  }
}
