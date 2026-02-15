/**
 * Pre-aggregated Dashboard Data Endpoint
 *
 * Fetches ALL core datasets in parallel and returns a single cached response.
 * Vercel CDN caches for 5 minutes, serves stale for 10 minutes.
 *
 * Data sources:
 * - DeFiLlama: protocols, fees/revenue, dexs, derivatives, options, stablecoins, bridges, raises, hacks, yield pools, historical TVL
 * - Token Terminal: bulk revenue, fees, earnings, P/S, P/E, token incentives, active users for ALL projects
 * - CoinGecko Pro: 1000 coins (4 pages × 250), global data, categories
 * - Coinglass: funding rates, liquidations, ETF flows, coins markets
 * - Alternative.me: Fear & Greed Index (365 days)
 */

const DEFILLAMA_BASE = 'https://api.llama.fi';
const DEFILLAMA_STABLES = 'https://stablecoins.llama.fi';
const DEFILLAMA_BRIDGES = 'https://bridges.llama.fi';
const COINGECKO_BASE = 'https://pro-api.coingecko.com/api/v3';
const COINGLASS_BASE = 'https://open-api-v3.coinglass.com';
const ALTERNATIVE_BASE = 'https://api.alternative.me';
const TT_BASE = 'https://api.tokenterminal.com/v2';

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

function cgHeaders(apiKey) {
  return { 'x-cg-pro-api-key': apiKey, 'Accept': 'application/json' };
}

function ttHeaders(apiKey) {
  return { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' };
}

function glassHeaders(apiKey) {
  return { 'CG-API-KEY': apiKey, 'Accept': 'application/json' };
}

export default async function handler(req, res) {
  const ttApiKey = process.env.TOKEN_TERMINAL_API_KEY;
  const cgApiKey = process.env.COINGECKO_API_KEY;
  const glassApiKey = process.env.COINGLASS_API_KEY;

  const timestamp = new Date().toISOString();
  const errors = [];

  // ── Build all fetch operations ──
  const fetchers = {
    // DeFiLlama (no auth — always available)
    protocols: fetchJSON(`${DEFILLAMA_BASE}/protocols`),
    fees: fetchJSON(`${DEFILLAMA_BASE}/overview/fees?excludeTotalDataChartBreakdown=false`),
    dexs: fetchJSON(`${DEFILLAMA_BASE}/overview/dexs`),
    derivatives: fetchJSON(`${DEFILLAMA_BASE}/overview/derivatives`),
    options: fetchJSON(`${DEFILLAMA_BASE}/overview/options`),
    historicalTvl: fetchJSON(`${DEFILLAMA_BASE}/v2/historicalChainTvl`),
    stablecoins: fetchJSON(`${DEFILLAMA_STABLES}/stablecoins?includePrices=true`),
    stablecoinCharts: fetchJSON(`${DEFILLAMA_STABLES}/stablecoincharts/all?stablecoin=1`),
    bridges: fetchJSON(`${DEFILLAMA_BRIDGES}/bridges`),
    raises: fetchJSON(`${DEFILLAMA_BASE}/raises`),
    hacks: fetchJSON(`${DEFILLAMA_BASE}/hacks`),
    yieldPools: fetchJSON(`${DEFILLAMA_BASE}/pools`),
    // Alternative.me (no auth)
    fearGreed: fetchJSON(`${ALTERNATIVE_BASE}/fng/?limit=365&format=json`),
  };

  // Token Terminal — bulk financial metrics for ALL projects
  if (ttApiKey) {
    const h = { headers: ttHeaders(ttApiKey) };
    fetchers.ttProjects = fetchJSON(`${TT_BASE}/projects`, h);
    fetchers.ttRevenue = fetchJSON(`${TT_BASE}/metrics/revenue`, h);
    fetchers.ttFees = fetchJSON(`${TT_BASE}/metrics/fees`, h);
    fetchers.ttEarnings = fetchJSON(`${TT_BASE}/metrics/earnings`, h);
    fetchers.ttTokenIncentives = fetchJSON(`${TT_BASE}/metrics/token_incentives`, h);
    fetchers.ttPriceToSales = fetchJSON(`${TT_BASE}/metrics/price_to_sales`, h);
    fetchers.ttPriceToEarnings = fetchJSON(`${TT_BASE}/metrics/price_to_earnings`, h);
    fetchers.ttActiveUsers = fetchJSON(`${TT_BASE}/metrics/active_users`, h);
  }

  // CoinGecko Pro — 1000 coins (4 pages × 250) + global + categories
  if (cgApiKey) {
    const h = { headers: cgHeaders(cgApiKey) };
    for (let p = 1; p <= 4; p++) {
      fetchers[`cgMarkets${p}`] = fetchJSON(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${p}&sparkline=false&price_change_percentage=1h,24h,7d,30d`, h
      );
    }
    fetchers.cgGlobal = fetchJSON(`${COINGECKO_BASE}/global`, h);
    fetchers.cgCategories = fetchJSON(`${COINGECKO_BASE}/coins/categories?order=market_cap_desc`, h);
  }

  // Coinglass
  if (glassApiKey) {
    const h = { headers: glassHeaders(glassApiKey) };
    fetchers.glassFunding = fetchJSON(`${COINGLASS_BASE}/api/futures/fundingRate/v2/home`, h);
    fetchers.glassLiquidation = fetchJSON(`${COINGLASS_BASE}/api/futures/liquidation/v2/home`, h);
    fetchers.glassETF = fetchJSON(`${COINGLASS_BASE}/api/index/bitcoin-etf/history`, h);
    fetchers.glassCoinsMarkets = fetchJSON(`${COINGLASS_BASE}/api/futures/coins/markets`, h);
  }

  // ── Execute all in parallel ──
  const entries = Object.entries(fetchers);
  const results = await Promise.allSettled(entries.map(([, p]) => p));

  const data = {
    timestamp,
    _meta: { cached: true, cacheMaxAge: 300, staleWhileRevalidate: 600, sources: entries.length },
  };

  results.forEach((result, index) => {
    const [key] = entries[index];
    if (result.status === 'fulfilled') {
      data[key] = result.value;
    } else {
      data[key] = null;
      errors.push({ source: key, error: result.reason?.message || 'Unknown error' });
    }
  });

  // Merge CoinGecko market pages into single array
  if (cgApiKey) {
    const allMarkets = [];
    for (let p = 1; p <= 4; p++) {
      const k = `cgMarkets${p}`;
      if (Array.isArray(data[k])) allMarkets.push(...data[k]);
      delete data[k];
    }
    data.coinMarkets = allMarkets;
  }

  // Merge Token Terminal bulk metrics into financials object
  if (ttApiKey) {
    data.ttFinancials = {
      revenue: data.ttRevenue,
      fees: data.ttFees,
      earnings: data.ttEarnings,
      token_incentives: data.ttTokenIncentives,
      price_to_sales: data.ttPriceToSales,
      price_to_earnings: data.ttPriceToEarnings,
      active_users: data.ttActiveUsers,
    };
    ['ttRevenue', 'ttFees', 'ttEarnings', 'ttTokenIncentives', 'ttPriceToSales', 'ttPriceToEarnings', 'ttActiveUsers'].forEach(k => delete data[k]);
  }

  if (errors.length > 0) data._errors = errors;

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(data);
}
