/**
 * Pre-aggregated Dashboard Data Endpoint
 *
 * Fetches ALL core datasets and returns a single cached response.
 * PRIMARY source: DeFiLlama Pro (1000 req/min) — all free + Pro-only 🔒 endpoints
 * SECONDARY: CoinGecko Pro (market caps), Coinglass (derivatives), Alternative.me (sentiment)
 * Token Terminal removed — DeFiLlama Pro covers everything and more.
 *
 * Data sources (40+ datasets):
 * - DeFiLlama Pro: protocols, fees (3 types), revenue, holdersRevenue, dexs, derivatives,
 *   options, yields, borrowRates, perps, LSD rates, emissions, categories, forks, oracles,
 *   entities, treasuries, hacks, raises, chainAssets, ETFs (BTC+ETH), bridges,
 *   stablecoins, DAT institutions, FDV performance, historicalTvl
 * - CoinGecko Pro: 1000 coins market data, global stats, categories
 * - Coinglass: funding rates, liquidations, ETF flows, coins markets
 * - Alternative.me: Fear & Greed Index (365 days)
 */

import { cachedFetch, sequentialFetchAll, getCacheStats } from './_cache.js';

const PRO_LLAMA = 'https://pro-api.llama.fi';
const COINGECKO_BASE = 'https://pro-api.coingecko.com/api/v3';
const COINGLASS_BASE = 'https://open-api-v3.coinglass.com';
const ALTERNATIVE_BASE = 'https://api.alternative.me';

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function llamaUrl(apiKey, path) {
  return apiKey ? `${PRO_LLAMA}/${apiKey}${path}` : `${PRO_LLAMA}${path}`;
}

function cgHeaders(apiKey) {
  return { 'x-cg-pro-api-key': apiKey, 'Accept': 'application/json' };
}

function glassHeaders(apiKey) {
  return { 'CG-API-KEY': apiKey, 'Accept': 'application/json' };
}

/** Fetch DeFiLlama endpoint, collect errors */
function llamaFetch(apiKey, path) {
  return cachedFetch(llamaUrl(apiKey, path), {}, CACHE_TTL);
}

export default async function handler(req, res) {
  const llamaKey = process.env.DEFILLAMA_API_KEY;
  const cgApiKey = process.env.COINGECKO_API_KEY;
  const glassApiKey = process.env.COINGLASS_API_KEY;

  const timestamp = new Date().toISOString();
  const errors = [];

  // ── DeFiLlama Pro (1000 req/min) — ALL parallel ──
  const llamaEndpoints = {
    // Core data (free + pro)
    protocols: '/api/protocols',
    fees: '/api/overview/fees?excludeTotalDataChartBreakdown=false',
    feesRevenue: '/api/overview/fees?dataType=dailyRevenue&excludeTotalDataChartBreakdown=false',
    feesHolders: '/api/overview/fees?dataType=dailyHoldersRevenue&excludeTotalDataChartBreakdown=false',
    dexs: '/api/overview/dexs',
    options: '/api/overview/options',
    historicalTvl: '/api/v2/historicalChainTvl',
    chains: '/api/v2/chains',
    stablecoins: '/stablecoins/stablecoins?includePrices=true',
    stablecoinCharts: '/stablecoins/stablecoincharts/all',
    // Pro-only 🔒
    derivatives: '/api/overview/derivatives',
    yields: '/yields/pools',
    yieldsBorrow: '/yields/poolsBorrow',
    yieldsPerps: '/yields/perps',
    yieldsLsd: '/yields/lsdRates',
    emissions: '/api/emissions',
    categories: '/api/categories',
    forks: '/api/forks',
    oracles: '/api/oracles',
    entities: '/api/entities',
    treasuries: '/api/treasuries',
    hacks: '/api/hacks',
    raises: '/api/raises',
    chainAssets: '/api/chainAssets',
    etfsBtc: '/etfs/overview',
    etfsEth: '/etfs/overviewEth',
    etfsHistory: '/etfs/history',
    bridges: '/bridges/bridges',
    datInstitutions: '/dat/institutions',
    fdvPerformance: '/fdv/performance/7d',
  };

  const llamaKeys = Object.keys(llamaEndpoints);
  const llamaResults = await Promise.allSettled(
    llamaKeys.map(k => llamaFetch(llamaKey, llamaEndpoints[k]))
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

  // ── Alternative.me (free) ──
  try {
    data.fearGreed = await cachedFetch(`${ALTERNATIVE_BASE}/fng/?limit=365&format=json`, {}, CACHE_TTL);
  } catch (e) {
    data.fearGreed = null;
    errors.push({ source: 'fearGreed', error: e.message });
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
    proEndpoints: llamaKeys.length,
  };

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(data);
}
