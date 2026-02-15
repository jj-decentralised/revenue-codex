/**
 * Pre-aggregated Dashboard Data Endpoint
 * 
 * Fetches ALL core datasets in parallel and returns a single cached response.
 * Vercel CDN caches for 5 minutes, serves stale for 10 minutes.
 * 
 * This endpoint is also configured as a Vercel Cron Job to warm the cache every 5 minutes.
 */

const DEFILLAMA_BASE = 'https://api.llama.fi';
const COINGECKO_BASE = 'https://pro-api.coingecko.com/api/v3';
const COINGLASS_BASE = 'https://open-api-v3.coinglass.com';
const ALTERNATIVE_BASE = 'https://api.alternative.me';

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return response.json();
}

// DeFiLlama fetchers (no auth required)
async function fetchDefiLlamaProtocols() {
  return fetchJSON(`${DEFILLAMA_BASE}/protocols`);
}

async function fetchDefiLlamaFees() {
  return fetchJSON(`${DEFILLAMA_BASE}/overview/fees`);
}

async function fetchDefiLlamaDexs() {
  return fetchJSON(`${DEFILLAMA_BASE}/overview/dexs`);
}

async function fetchDefiLlamaHistoricalTvl() {
  return fetchJSON(`${DEFILLAMA_BASE}/v2/historicalChainTvl`);
}

async function fetchDefiLlamaStablecoins() {
  return fetchJSON(`${DEFILLAMA_BASE}/stablecoins`);
}

// CoinGecko fetchers (requires API key)
async function fetchCoinGeckoGlobal(apiKey) {
  return fetchJSON(`${COINGECKO_BASE}/global`, {
    headers: {
      'x-cg-pro-api-key': apiKey,
      'Accept': 'application/json',
    },
  });
}

async function fetchCoinGeckoMarkets(apiKey) {
  return fetchJSON(
    `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false`,
    {
      headers: {
        'x-cg-pro-api-key': apiKey,
        'Accept': 'application/json',
      },
    }
  );
}

// Coinglass fetchers (requires API key)
async function fetchCoinglassFunding(apiKey) {
  return fetchJSON(`${COINGLASS_BASE}/api/futures/fundingRate/v2/home`, {
    headers: {
      'CG-API-KEY': apiKey,
      'Accept': 'application/json',
    },
  });
}

async function fetchCoinglassLiquidation(apiKey) {
  return fetchJSON(`${COINGLASS_BASE}/api/futures/liquidation/v2/home`, {
    headers: {
      'CG-API-KEY': apiKey,
      'Accept': 'application/json',
    },
  });
}

async function fetchCoinglassETF(apiKey) {
  return fetchJSON(`${COINGLASS_BASE}/api/index/bitcoin-etf/history`, {
    headers: {
      'CG-API-KEY': apiKey,
      'Accept': 'application/json',
    },
  });
}

// Alternative.me Fear & Greed Index
async function fetchFearGreed() {
  return fetchJSON(`${ALTERNATIVE_BASE}/fng/?limit=365&format=json`);
}

export default async function handler(req, res) {
  const coinGeckoApiKey = process.env.COINGECKO_API_KEY;
  const coinglassApiKey = process.env.COINGLASS_API_KEY;
  
  const timestamp = new Date().toISOString();
  const errors = [];
  
  // Define all fetch operations
  const fetchers = {
    // DeFiLlama (no auth)
    protocols: fetchDefiLlamaProtocols(),
    fees: fetchDefiLlamaFees(),
    dexs: fetchDefiLlamaDexs(),
    historicalTvl: fetchDefiLlamaHistoricalTvl(),
    stablecoins: fetchDefiLlamaStablecoins(),
    
    // Alternative.me (no auth)
    fearGreed: fetchFearGreed(),
  };
  
  // Add CoinGecko fetchers if API key is available
  if (coinGeckoApiKey) {
    fetchers.globalMarket = fetchCoinGeckoGlobal(coinGeckoApiKey);
    fetchers.coinMarkets = fetchCoinGeckoMarkets(coinGeckoApiKey);
  }
  
  // Add Coinglass fetchers if API key is available
  if (coinglassApiKey) {
    fetchers.funding = fetchCoinglassFunding(coinglassApiKey);
    fetchers.liquidation = fetchCoinglassLiquidation(coinglassApiKey);
    fetchers.etf = fetchCoinglassETF(coinglassApiKey);
  }
  
  // Execute all fetches in parallel with error handling
  const fetcherEntries = Object.entries(fetchers);
  const results = await Promise.allSettled(fetcherEntries.map(([_, promise]) => promise));
  
  // Build response object
  const data = {
    timestamp,
    _meta: {
      cached: true,
      cacheMaxAge: 300,
      staleWhileRevalidate: 600,
    },
  };
  
  results.forEach((result, index) => {
    const [key] = fetcherEntries[index];
    if (result.status === 'fulfilled') {
      data[key] = result.value;
    } else {
      data[key] = null;
      errors.push({ source: key, error: result.reason?.message || 'Unknown error' });
    }
  });
  
  // Include errors in response if any
  if (errors.length > 0) {
    data._errors = errors;
  }
  
  // Set aggressive caching headers for Vercel CDN
  // s-maxage=300: CDN caches for 5 minutes
  // stale-while-revalidate=600: Serve stale content for up to 10 more minutes while revalidating
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Content-Type', 'application/json');
  
  return res.status(200).json(data);
}
