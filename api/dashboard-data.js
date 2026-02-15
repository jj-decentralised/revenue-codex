/**
 * Pre-aggregated Dashboard Data Endpoint
 *
 * Fetches ALL core datasets and returns a single cached response.
 * Uses server-side in-memory cache (survives warm Vercel invocations) + retry on 429.
 * Token Terminal calls are sequential (60 req/min limit).
 * CoinGecko pages are sequential with 200ms delay.
 * CDN caches for 15 min, serves stale for 1 hour.
 *
 * Data sources:
 * - DeFiLlama: protocols, fees/revenue, dexs, derivatives, options, stablecoins, bridges, raises, hacks, yield pools, historical TVL
 * - Token Terminal: bulk revenue, fees, earnings, P/S, P/E, token incentives, active users for ALL projects
 * - CoinGecko Pro: 1000 coins (4 pages × 250), global data, categories
 * - Coinglass: funding rates, liquidations, ETF flows, coins markets
 * - Alternative.me: Fear & Greed Index (365 days)
 */

import { cachedFetch, sequentialFetchAll, getCacheStats } from './_cache.js';

const DEFILLAMA_BASE = 'https://api.llama.fi';
const DEFILLAMA_STABLES = 'https://stablecoins.llama.fi';
const DEFILLAMA_BRIDGES = 'https://bridges.llama.fi';
const COINGECKO_BASE = 'https://pro-api.coingecko.com/api/v3';
const COINGLASS_BASE = 'https://open-api-v3.coinglass.com';
const ALTERNATIVE_BASE = 'https://api.alternative.me';
const TT_BASE = 'https://api.tokenterminal.com/v2';

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function cgHeaders(apiKey) {
  return { 'x-cg-pro-api-key': apiKey, 'Accept': 'application/json' };
}

function ttHeaders(apiKey) {
  return { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' };
}

function glassHeaders(apiKey) {
  return { 'CG-API-KEY': apiKey, 'Accept': 'application/json' };
}

/** Wrap cachedFetch to return { status, value/reason } like Promise.allSettled */
async function safeFetch(url, options = {}) {
  try {
    const data = await cachedFetch(url, options, CACHE_TTL);
    return { status: 'fulfilled', value: data };
  } catch (err) {
    return { status: 'rejected', reason: err };
  }
}

export default async function handler(req, res) {
  const ttApiKey = process.env.TOKEN_TERMINAL_API_KEY;
  const cgApiKey = process.env.COINGECKO_API_KEY;
  const glassApiKey = process.env.COINGLASS_API_KEY;

  const timestamp = new Date().toISOString();
  const errors = [];

  // ── DeFiLlama (free, no rate limits) — parallel ──
  const llamaUrls = {
    protocols: `${DEFILLAMA_BASE}/protocols`,
    fees: `${DEFILLAMA_BASE}/overview/fees?excludeTotalDataChartBreakdown=false`,
    dexs: `${DEFILLAMA_BASE}/overview/dexs`,
    derivatives: `${DEFILLAMA_BASE}/overview/derivatives`,
    options: `${DEFILLAMA_BASE}/overview/options`,
    historicalTvl: `${DEFILLAMA_BASE}/v2/historicalChainTvl`,
    stablecoins: `${DEFILLAMA_STABLES}/stablecoins?includePrices=true`,
    stablecoinCharts: `${DEFILLAMA_STABLES}/stablecoincharts/all?stablecoin=1`,
    bridges: `${DEFILLAMA_BRIDGES}/bridges`,
    raises: `${DEFILLAMA_BASE}/raises`,
    hacks: `${DEFILLAMA_BASE}/hacks`,
    yieldPools: `${DEFILLAMA_BASE}/pools`,
    fearGreed: `${ALTERNATIVE_BASE}/fng/?limit=365&format=json`,
  };

  const llamaKeys = Object.keys(llamaUrls);
  const llamaResults = await Promise.allSettled(
    llamaKeys.map(k => cachedFetch(llamaUrls[k], {}, CACHE_TTL))
  );

  const data = { timestamp };
  llamaKeys.forEach((key, i) => {
    if (llamaResults[i].status === 'fulfilled') {
      data[key] = llamaResults[i].value;
    } else {
      data[key] = null;
      errors.push({ source: key, error: llamaResults[i].reason?.message || 'Unknown' });
    }
  });

  // ── Token Terminal (60 req/min limit) — SEQUENTIAL with 1s delay ──
  if (ttApiKey) {
    const ttOpts = { headers: ttHeaders(ttApiKey) };
    const ttMetrics = ['revenue', 'fees', 'earnings', 'token_incentives', 'price_to_sales', 'price_to_earnings', 'active_users'];
    const ttUrls = [`${TT_BASE}/projects`, ...ttMetrics.map(m => `${TT_BASE}/metrics/${m}`)];
    const ttResults = await sequentialFetchAll(ttUrls, ttOpts, 1000, CACHE_TTL);

    data.ttProjects = ttResults[0].status === 'fulfilled' ? ttResults[0].value : null;
    if (ttResults[0].status === 'rejected') errors.push({ source: 'ttProjects', error: ttResults[0].reason?.message });

    const ttFinancials = {};
    ttMetrics.forEach((m, i) => {
      const r = ttResults[i + 1];
      ttFinancials[m] = r.status === 'fulfilled' ? r.value : null;
      if (r.status === 'rejected') errors.push({ source: `tt_${m}`, error: r.reason?.message });
    });
    data.ttFinancials = ttFinancials;
  }

  // ── CoinGecko Pro (500 req/min) — SEQUENTIAL pages with 300ms delay ──
  if (cgApiKey) {
    const cgOpts = { headers: cgHeaders(cgApiKey) };
    const cgPageUrls = [1, 2, 3, 4].map(p =>
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${p}&sparkline=false&price_change_percentage=1h,24h,7d,30d`
    );
    const cgPageResults = await sequentialFetchAll(cgPageUrls, cgOpts, 300, CACHE_TTL);

    const allMarkets = [];
    cgPageResults.forEach((r, i) => {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) allMarkets.push(...r.value);
      else errors.push({ source: `cgMarkets_p${i + 1}`, error: r.reason?.message || 'empty' });
    });
    data.coinMarkets = allMarkets;

    // Global + categories can be parallel (only 2 calls)
    const [cgGlobal, cgCategories] = await Promise.allSettled([
      cachedFetch(`${COINGECKO_BASE}/global`, cgOpts, CACHE_TTL),
      cachedFetch(`${COINGECKO_BASE}/coins/categories?order=market_cap_desc`, cgOpts, CACHE_TTL),
    ]);
    data.cgGlobal = cgGlobal.status === 'fulfilled' ? cgGlobal.value : null;
    data.cgCategories = cgCategories.status === 'fulfilled' ? cgCategories.value : null;
    if (cgGlobal.status === 'rejected') errors.push({ source: 'cgGlobal', error: cgGlobal.reason?.message });
    if (cgCategories.status === 'rejected') errors.push({ source: 'cgCategories', error: cgCategories.reason?.message });
  }

  // ── Coinglass (plan-dependent limit) — parallel (only 4 calls) ──
  if (glassApiKey) {
    const glOpts = { headers: glassHeaders(glassApiKey) };
    const glKeys = ['glassFunding', 'glassLiquidation', 'glassETF', 'glassCoinsMarkets'];
    const glUrls = [
      `${COINGLASS_BASE}/api/futures/fundingRate/v2/home`,
      `${COINGLASS_BASE}/api/futures/liquidation/v2/home`,
      `${COINGLASS_BASE}/api/index/bitcoin-etf/history`,
      `${COINGLASS_BASE}/api/futures/coins/markets`,
    ];
    const glResults = await Promise.allSettled(glUrls.map(u => cachedFetch(u, glOpts, CACHE_TTL)));
    glKeys.forEach((key, i) => {
      data[key] = glResults[i].status === 'fulfilled' ? glResults[i].value : null;
      if (glResults[i].status === 'rejected') errors.push({ source: key, error: glResults[i].reason?.message });
    });
  }

  if (errors.length > 0) data._errors = errors;
  data._meta = {
    cached: true,
    cacheMaxAge: 900,
    staleWhileRevalidate: 3600,
    sources: Object.keys(data).filter(k => !k.startsWith('_')).length,
    serverCache: getCacheStats(),
  };

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(data);
}
