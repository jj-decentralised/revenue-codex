// ============================================================
// DeFiLlama (free, client-side)
// ============================================================
const LLAMA_BASE = 'https://api.llama.fi'
const LLAMA_STABLES = 'https://stablecoins.llama.fi'

export async function fetchFeesOverview() {
  const res = await fetch(`${LLAMA_BASE}/overview/fees?excludeTotalDataChartBreakdown=false`)
  if (!res.ok) throw new Error(`DeFiLlama fees: ${res.status}`)
  return res.json()
}

export async function fetchProtocolFees(protocol) {
  const res = await fetch(`${LLAMA_BASE}/summary/fees/${protocol}?dataType=dailyRevenue`)
  if (!res.ok) throw new Error(`DeFiLlama protocol fees: ${res.status}`)
  return res.json()
}

export async function fetchAllProtocols() {
  const res = await fetch(`${LLAMA_BASE}/protocols`)
  if (!res.ok) throw new Error(`DeFiLlama protocols: ${res.status}`)
  return res.json()
}

export async function fetchProtocolDetail(protocol) {
  const res = await fetch(`${LLAMA_BASE}/protocol/${protocol}`)
  if (!res.ok) throw new Error(`DeFiLlama protocol detail: ${res.status}`)
  return res.json()
}

export async function fetchStablecoins() {
  const res = await fetch(`${LLAMA_STABLES}/stablecoins?includePrices=true`)
  if (!res.ok) throw new Error(`Stablecoins: ${res.status}`)
  return res.json()
}

export async function fetchStablecoinCharts() {
  const res = await fetch(`${LLAMA_STABLES}/stablecoincharts/all?stablecoin=1`)
  if (!res.ok) throw new Error(`Stablecoin charts: ${res.status}`)
  return res.json()
}

export async function fetchHistoricalChainTvl() {
  const res = await fetch(`${LLAMA_BASE}/v2/historicalChainTvl`)
  if (!res.ok) throw new Error(`Historical TVL: ${res.status}`)
  return res.json()
}

// ============================================================
// Alternative.me — Fear & Greed Index (free, client-side)
// ============================================================
export async function fetchFearGreedIndex(limit = 0) {
  const res = await fetch(`https://api.alternative.me/fng/?limit=${limit}&format=json`)
  if (!res.ok) throw new Error(`Fear & Greed: ${res.status}`)
  const data = await res.json()
  return data.data // array of { value, value_classification, timestamp }
}

// ============================================================
// Token Terminal (via serverless proxy)
// ============================================================
export async function fetchTokenTerminalProjects() {
  const res = await fetch('/api/token-terminal?endpoint=projects')
  if (!res.ok) throw new Error(`Token Terminal projects: ${res.status}`)
  return res.json()
}

export async function fetchTokenTerminalMetrics(projectId, metric = 'revenue', interval = 'daily') {
  const params = new URLSearchParams({ endpoint: 'metrics', project_id: projectId, metric_id: metric, interval })
  const res = await fetch(`/api/token-terminal?${params}`)
  if (!res.ok) throw new Error(`Token Terminal metrics: ${res.status}`)
  return res.json()
}

export async function fetchTokenTerminalBulkMetrics(metric = 'revenue') {
  const params = new URLSearchParams({ endpoint: 'bulk-metrics', metric_id: metric })
  const res = await fetch(`/api/token-terminal?${params}`)
  if (!res.ok) throw new Error(`Token Terminal bulk metrics: ${res.status}`)
  return res.json()
}

// ============================================================
// Yahoo Finance (via serverless proxy)
// ============================================================
export async function fetchYahooQuote(symbol) {
  const res = await fetch(`/api/yahoo?action=quote&symbol=${encodeURIComponent(symbol)}`)
  if (!res.ok) throw new Error(`Yahoo quote: ${res.status}`)
  return res.json()
}

export async function fetchYahooHistorical(symbol, period = '2y') {
  const res = await fetch(`/api/yahoo?action=historical&symbol=${encodeURIComponent(symbol)}&period=${period}`)
  if (!res.ok) throw new Error(`Yahoo historical: ${res.status}`)
  return res.json()
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
  const res = await fetch('https://api.llama.fi/pools')
  if (!res.ok) throw new Error(`DeFiLlama pools: ${res.status}`)
  return res.json()
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
