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
// Token Terminal (via serverless proxy)
// ============================================================
export async function fetchTokenTerminalProjects() {
  return deduplicatedFetch('/api/token-terminal?endpoint=projects')
}

export async function fetchTokenTerminalMetrics(projectId, metric = 'revenue', interval = 'daily') {
  const params = new URLSearchParams({ endpoint: 'metrics', project_id: projectId, metric_id: metric, interval })
  return deduplicatedFetch(`/api/token-terminal?${params}`)
}

export async function fetchTokenTerminalBulkMetrics(metric = 'revenue') {
  const params = new URLSearchParams({ endpoint: 'bulk-metrics', metric_id: metric })
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
  const [fees, protocols, fng] = await Promise.allSettled([
    fetchFeesOverview(),
    fetchAllProtocols(),
    fetchFearGreedIndex(365),
  ])

  return {
    fees: fees.status === 'fulfilled' ? fees.value : null,
    protocols: protocols.status === 'fulfilled' ? protocols.value : null,
    fearGreed: fng.status === 'fulfilled' ? fng.value : null,
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
  const [fees, stablecoins, stablecoinCharts] = await Promise.allSettled([
    fetchFeesOverview(),
    fetchStablecoins(),
    fetchStablecoinCharts(),
  ])

  return {
    fees: fees.status === 'fulfilled' ? fees.value : null,
    stablecoins: stablecoins.status === 'fulfilled' ? stablecoins.value : null,
    stablecoinCharts: stablecoinCharts.status === 'fulfilled' ? stablecoinCharts.value : null,
  }
}

export async function fetchMoatsData() {
  const targetProtocols = ['aave', 'uniswap', 'lido', 'maker', 'hyperliquid', 'tether', 'ethena']
  const [allProtocols, fees] = await Promise.allSettled([
    fetchAllProtocols(),
    fetchFeesOverview(),
  ])

  const protocolDetails = await Promise.allSettled(
    targetProtocols.map(p => fetchProtocolFees(p).catch(() => null))
  )

  return {
    allProtocols: allProtocols.status === 'fulfilled' ? allProtocols.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
    protocolDetails: protocolDetails
      .map((r, i) => ({ slug: targetProtocols[i], data: r.status === 'fulfilled' ? r.value : null }))
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
  const targetCoins = [
    'ethereum', 'bitcoin', 'solana', 'uniswap', 'aave',
    'chainlink', 'maker', 'arbitrum', 'polygon-ecosystem-token', 'lido-dao'
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
  const [protocols, fees] = await Promise.allSettled([
    fetchAllProtocols(),
    fetchFeesOverview(),
  ])

  return {
    protocols: protocols.status === 'fulfilled' ? protocols.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
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
export async function fetchCoinGeckoMarkets() {
  const res = await fetch('/api/coingecko?action=markets')
  if (!res.ok) throw new Error(`CoinGecko markets: ${res.status}`)
  return res.json()
}

export async function fetchTokenomicsStudyData() {
  const targetCoins = [
    'ethereum', 'uniswap', 'aave', 'maker', 'lido-dao',
    'chainlink', 'curve-dao-token', 'compound-governance-token',
    'synthetix-network-token', 'gmx', 'pancakeswap-token', 'sushi'
  ]

  const [protocols, fees, markets, coinDetails] = await Promise.allSettled([
    fetchAllProtocols(),
    fetchFeesOverview(),
    fetchCoinGeckoMarkets(),
    Promise.allSettled(targetCoins.map(id => fetchCoinGeckoDetail(id))),
  ])

  const coins = coinDetails.status === 'fulfilled'
    ? coinDetails.value.map((r, i) => ({
        id: targetCoins[i],
        data: r.status === 'fulfilled' ? r.value : null,
      })).filter(c => c.data)
    : []

  return {
    protocols: protocols.status === 'fulfilled' ? protocols.value : null,
    fees: fees.status === 'fulfilled' ? fees.value : null,
    markets: markets.status === 'fulfilled' ? markets.value : null,
    coinDetails: coins,
  }
}
