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
// DeFiLlama Pro (via serverless proxy) — Primary data source
// ============================================================
function llamaFetch(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params })
  return deduplicatedFetch(`/api/defillama?${qs}`)
}

// Pro-only 🔒 endpoints
export function fetchLlamaYields() { return llamaFetch('yields') }
export function fetchLlamaYieldsBorrow() { return llamaFetch('yields_borrow') }
export function fetchLlamaYieldsPerps() { return llamaFetch('yields_perps') }
export function fetchLlamaYieldsLsd() { return llamaFetch('yields_lsd') }
export function fetchLlamaEmissions() { return llamaFetch('emissions') }
export function fetchLlamaEmission(protocol) { return llamaFetch('emission', { protocol }) }
export function fetchLlamaCategories() { return llamaFetch('categories') }
export function fetchLlamaForks() { return llamaFetch('forks') }
export function fetchLlamaOracles() { return llamaFetch('oracles') }
export function fetchLlamaEntities() { return llamaFetch('entities') }
export function fetchLlamaTreasuries() { return llamaFetch('treasuries') }
export function fetchLlamaChainAssets() { return llamaFetch('chain_assets') }
export function fetchLlamaEtfsBtc() { return llamaFetch('etfs_btc') }
export function fetchLlamaEtfsEth() { return llamaFetch('etfs_eth') }
export function fetchLlamaEtfsHistory() { return llamaFetch('etfs_history') }
export function fetchLlamaDatInstitutions() { return llamaFetch('dat_institutions') }
export function fetchLlamaFdvPerformance(period = '7d') { return llamaFetch('fdv_performance', { period }) }
export function fetchLlamaFeesRevenue() { return llamaFetch('fees_revenue') }
export function fetchLlamaFeesHolders() { return llamaFetch('fees_holders') }
export function fetchLlamaFeesProtocol(protocol) { return llamaFetch('fees_protocol', { protocol }) }

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
  const [fees, feesRevenue, protocols, fng, markets, emissions] = await Promise.allSettled([
    fetchFeesOverview(),
    fetchLlamaFeesRevenue(),
    fetchAllProtocols(),
    fetchFearGreedIndex(365),
    fetchCoinGeckoMarketsAll(),
    fetchLlamaEmissions(),
  ])

  return {
    fees: fees.status === 'fulfilled' ? fees.value : null,
    feesRevenue: feesRevenue.status === 'fulfilled' ? feesRevenue.value : null,
    protocols: protocols.status === 'fulfilled' ? protocols.value : null,
    fearGreed: fng.status === 'fulfilled' ? fng.value : null,
    markets: markets.status === 'fulfilled' ? markets.value : null,
    emissions: emissions.status === 'fulfilled' ? emissions.value : null,
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
  const [fees, feesRevenue, feesHolders, stablecoins, stablecoinCharts] = await Promise.allSettled([
    fetchFeesOverview(),
    fetchLlamaFeesRevenue(),
    fetchLlamaFeesHolders(),
    fetchStablecoins(),
    fetchStablecoinCharts(),
  ])

  return {
    fees: fees.status === 'fulfilled' ? fees.value : null,
    feesRevenue: feesRevenue.status === 'fulfilled' ? feesRevenue.value : null,
    feesHolders: feesHolders.status === 'fulfilled' ? feesHolders.value : null,
    stablecoins: stablecoins.status === 'fulfilled' ? stablecoins.value : null,
    stablecoinCharts: stablecoinCharts.status === 'fulfilled' ? stablecoinCharts.value : null,
  }
}

export async function fetchMoatsData() {
  const [allProtocols, fees, markets, dexOverview, forks] = await Promise.allSettled([
    fetchAllProtocols(),
    fetchFeesOverview(),
    fetchCoinGeckoMarketsAll(),
    fetchDexOverview(),
    fetchLlamaForks(),
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
    dexOverview: dexOverview.status === 'fulfilled' ? dexOverview.value : null,
    forks: forks.status === 'fulfilled' ? forks.value : null,
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

  const [coinDetails, fees] = await Promise.allSettled([
    Promise.allSettled(targetCoins.map(id => fetchCoinGeckoDetail(id))),
    fetchFeesOverview(),
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
  }
}

export async function fetchCapitalEfficiencyData() {
  const [protocols, fees, feesRevenue, markets, yields] = await Promise.allSettled([
    fetchAllProtocols(),
    fetchFeesOverview(),
    fetchLlamaFeesRevenue(),
    fetchCoinGeckoMarketsAll(),
    fetchLlamaYields(),
  ])

  return {
    protocols: protocols.status === 'fulfilled' ? protocols.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
    feesRevenue: feesRevenue.status === 'fulfilled' ? feesRevenue.value : null,
    markets: markets.status === 'fulfilled' ? markets.value : null,
    yields: yields.status === 'fulfilled' ? yields.value : null,
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

export async function fetchCoinChart(coinId, days = 365) {
  return deduplicatedFetch(`/api/coingecko?action=coin_chart&coin_id=${encodeURIComponent(coinId)}&days=${days}`)
}

// Fetch market chart data for multiple coins in parallel (with batching)
export async function fetchCoinChartsBatch(coinIds, days = 365) {
  const BATCH_SIZE = 6
  const results = []
  for (let i = 0; i < coinIds.length; i += BATCH_SIZE) {
    const batch = coinIds.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.allSettled(
      batch.map(id => fetchCoinChart(id, days))
    )
    results.push(...batch.map((id, j) => ({
      id,
      data: batchResults[j].status === 'fulfilled' ? batchResults[j].value : null,
    })))
  }
  return results
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

// Protocol slugs and CoinGecko IDs for bubble comparison
const BUBBLE_PROTOCOLS = [
  { slug: 'ethereum', geckoId: 'ethereum' },
  { slug: 'solana', geckoId: 'solana' },
  { slug: 'uniswap', geckoId: 'uniswap' },
  { slug: 'aave', geckoId: 'aave' },
  { slug: 'lido', geckoId: 'lido-dao' },
  { slug: 'makerdao', geckoId: 'maker' },
  { slug: 'tron', geckoId: 'tron' },
  { slug: 'pancakeswap', geckoId: 'pancakeswap-token' },
  { slug: 'curve-finance', geckoId: 'curve-dao-token' },
  { slug: 'gmx', geckoId: 'gmx' },
  { slug: 'jito', geckoId: 'jito-governance-token' },
  { slug: 'raydium', geckoId: 'raydium' },
  { slug: 'pendle', geckoId: 'pendle' },
  { slug: 'compound', geckoId: 'compound-governance-token' },
  { slug: 'dydx', geckoId: 'dydx-chain' },
]

export async function fetchBubbleComparisonData() {
  // Phase 1: Bulk data (current snapshot)
  const [fees, markets, protocols] = await Promise.allSettled([
    fetchFeesOverview(),
    fetchCoinGeckoMarketsAll(),
    fetchAllProtocols(),
  ])

  // Phase 2: Historical data — batch in groups of 5 with delay
  const BATCH = 5
  const feeHistories = []
  const mcapHistories = []

  for (let i = 0; i < BUBBLE_PROTOCOLS.length; i += BATCH) {
    const batch = BUBBLE_PROTOCOLS.slice(i, i + BATCH)
    const [feesBatch, chartBatch] = await Promise.all([
      Promise.allSettled(batch.map(p => fetchLlamaFeesProtocol(p.slug))),
      Promise.allSettled(batch.map(p => fetchCoinChart(p.geckoId, 'max'))),
    ])
    batch.forEach((p, j) => {
      feeHistories.push({ slug: p.slug, data: feesBatch[j].status === 'fulfilled' ? feesBatch[j].value : null })
      mcapHistories.push({ geckoId: p.geckoId, slug: p.slug, data: chartBatch[j].status === 'fulfilled' ? chartBatch[j].value : null })
    })
    // Small delay between batches to respect rate limits
    if (i + BATCH < BUBBLE_PROTOCOLS.length) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  return {
    fees: fees.status === 'fulfilled' ? fees.value : null,
    markets: markets.status === 'fulfilled' ? markets.value : null,
    protocols: protocols.status === 'fulfilled' ? protocols.value : null,
    feeHistories,
    mcapHistories,
  }
}

export async function fetchTokenomicsStudyData() {
  // Fetch broad CoinGecko data for ALL 1000 coins + DeFiLlama Pro emissions
  const [protocols, fees, markets, emissions, categories] = await Promise.allSettled([
    fetchAllProtocols(),
    fetchFeesOverview(),
    fetchCoinGeckoMarketsAll(),
    fetchLlamaEmissions(),
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
    emissions: emissions.status === 'fulfilled' ? emissions.value : null,
    categories: categories.status === 'fulfilled' ? categories.value : null,
    coinDetails,
  }
}
