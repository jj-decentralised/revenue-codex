/**
 * DeFiLlama Pro API Proxy
 *
 * Single gateway for ALL DeFiLlama endpoints (free + Pro-only 🔒).
 * Auth: API key inserted in URL path → https://pro-api.llama.fi/{KEY}/endpoint
 * Rate limit: 1000 req/min (Pro plan).
 * Server-side cached (15 min) with retry on 429.
 */

import { cachedFetch } from './_cache.js';

const PRO_BASE = 'https://pro-api.llama.fi';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function proUrl(apiKey, path) {
  // Pro endpoints: key goes between base and path
  return apiKey ? `${PRO_BASE}/${apiKey}${path}` : `${PRO_BASE}${path}`;
}

export default async function handler(req, res) {
  const apiKey = process.env.DEFILLAMA_API_KEY;
  const { action, slug, chain, protocol, symbol, token, timestamp, period, dataType, id } = req.query;

  if (!action) {
    return res.status(400).json({ error: 'action parameter required' });
  }

  let path;
  switch (action) {
    // ── Free TVL endpoints ──
    case 'protocols':
      path = '/api/protocols'; break;
    case 'protocol':
      if (!slug) return res.status(400).json({ error: 'slug required' });
      path = `/api/protocol/${encodeURIComponent(slug)}`; break;
    case 'tvl':
      if (!slug) return res.status(400).json({ error: 'slug required' });
      path = `/api/tvl/${encodeURIComponent(slug)}`; break;
    case 'chains':
      path = '/api/v2/chains'; break;
    case 'historical_tvl':
      path = chain ? `/api/v2/historicalChainTvl/${encodeURIComponent(chain)}` : '/api/v2/historicalChainTvl'; break;

    // ── Fees & Revenue ──
    case 'fees': {
      const dt = dataType ? `&dataType=${encodeURIComponent(dataType)}` : '';
      path = `/api/overview/fees?excludeTotalDataChartBreakdown=false${dt}`; break;
    }
    case 'fees_revenue':
      path = '/api/overview/fees?dataType=dailyRevenue&excludeTotalDataChartBreakdown=false'; break;
    case 'fees_holders':
      path = '/api/overview/fees?dataType=dailyHoldersRevenue&excludeTotalDataChartBreakdown=false'; break;
    case 'fees_chain':
      if (!chain) return res.status(400).json({ error: 'chain required' });
      path = `/api/overview/fees/${encodeURIComponent(chain)}`; break;
    case 'fees_protocol':
      if (!protocol) return res.status(400).json({ error: 'protocol required' });
      path = `/api/summary/fees/${encodeURIComponent(protocol)}`; break;

    // ── Volumes ──
    case 'dexs':
      path = '/api/overview/dexs'; break;
    case 'dexs_chain':
      if (!chain) return res.status(400).json({ error: 'chain required' });
      path = `/api/overview/dexs/${encodeURIComponent(chain)}`; break;
    case 'dex_protocol':
      if (!protocol) return res.status(400).json({ error: 'protocol required' });
      path = `/api/summary/dexs/${encodeURIComponent(protocol)}`; break;
    case 'options':
      path = '/api/overview/options'; break;

    // ── Pro-only 🔒: Derivatives ──
    case 'derivatives':
      path = '/api/overview/derivatives'; break;
    case 'derivatives_protocol':
      if (!protocol) return res.status(400).json({ error: 'protocol required' });
      path = `/api/summary/derivatives/${encodeURIComponent(protocol)}`; break;

    // ── Pro-only 🔒: Yields ──
    case 'yields':
      path = '/yields/pools'; break;
    case 'yields_borrow':
      path = '/yields/poolsBorrow'; break;
    case 'yields_perps':
      path = '/yields/perps'; break;
    case 'yields_lsd':
      path = '/yields/lsdRates'; break;
    case 'yields_chart':
      if (!id) return res.status(400).json({ error: 'id (pool UUID) required' });
      path = `/yields/chart/${encodeURIComponent(id)}`; break;

    // ── Stablecoins ──
    case 'stablecoins':
      path = '/stablecoins/stablecoins?includePrices=true'; break;
    case 'stablecoin_charts':
      path = chain ? `/stablecoins/stablecoincharts/${encodeURIComponent(chain)}` : '/stablecoins/stablecoincharts/all'; break;
    case 'stablecoin_dominance':
      if (!chain) return res.status(400).json({ error: 'chain required' });
      path = `/stablecoins/stablecoindominance/${encodeURIComponent(chain)}`; break;

    // ── Pro-only 🔒: Emissions / Unlocks ──
    case 'emissions':
      path = '/api/emissions'; break;
    case 'emission':
      if (!protocol) return res.status(400).json({ error: 'protocol required' });
      path = `/api/emission/${encodeURIComponent(protocol)}`; break;

    // ── Pro-only 🔒: Ecosystem Data ──
    case 'categories':
      path = '/api/categories'; break;
    case 'forks':
      path = '/api/forks'; break;
    case 'oracles':
      path = '/api/oracles'; break;
    case 'entities':
      path = '/api/entities'; break;
    case 'treasuries':
      path = '/api/treasuries'; break;
    case 'hacks':
      path = '/api/hacks'; break;
    case 'raises':
      path = '/api/raises'; break;
    case 'chain_assets':
      path = '/api/chainAssets'; break;

    // ── Pro-only 🔒: Inflows ──
    case 'inflows':
      if (!protocol || !timestamp) return res.status(400).json({ error: 'protocol and timestamp required' });
      path = `/api/inflows/${encodeURIComponent(protocol)}/${encodeURIComponent(timestamp)}`; break;

    // ── Pro-only 🔒: Token Data ──
    case 'token_protocols':
      if (!symbol) return res.status(400).json({ error: 'symbol required' });
      path = `/api/tokenProtocols/${encodeURIComponent(symbol)}`; break;
    case 'historical_liquidity':
      if (!token) return res.status(400).json({ error: 'token required (chain:address format)' });
      path = `/api/historicalLiquidity/${encodeURIComponent(token)}`; break;

    // ── Pro-only 🔒: ETFs ──
    case 'etfs_btc':
      path = '/etfs/overview'; break;
    case 'etfs_eth':
      path = '/etfs/overviewEth'; break;
    case 'etfs_history':
      path = '/etfs/history'; break;
    case 'etfs_history_eth':
      path = '/etfs/historyEth'; break;

    // ── Pro-only 🔒: FDV Performance ──
    case 'fdv_performance':
      path = `/fdv/performance/${encodeURIComponent(period || '7d')}`; break;

    // ── Pro-only 🔒: Bridges ──
    case 'bridges':
      path = '/bridges/bridges'; break;
    case 'bridge':
      if (!id) return res.status(400).json({ error: 'id required' });
      path = `/bridges/bridge/${encodeURIComponent(id)}`; break;
    case 'bridge_volume':
      if (!chain) return res.status(400).json({ error: 'chain required' });
      path = `/bridges/bridgevolume/${encodeURIComponent(chain)}`; break;

    // ── Pro-only 🔒: DAT (Digital Asset Treasury) ──
    case 'dat_institutions':
      path = '/dat/institutions'; break;
    case 'dat_institution':
      if (!symbol) return res.status(400).json({ error: 'symbol required' });
      path = `/dat/institutions/${encodeURIComponent(symbol)}`; break;

    default:
      return res.status(400).json({
        error: `Invalid action: ${action}`,
        supported: 'protocols, protocol, tvl, chains, historical_tvl, fees, fees_revenue, fees_holders, fees_chain, fees_protocol, dexs, dexs_chain, dex_protocol, options, derivatives, derivatives_protocol, yields, yields_borrow, yields_perps, yields_lsd, yields_chart, stablecoins, stablecoin_charts, stablecoin_dominance, emissions, emission, categories, forks, oracles, entities, treasuries, hacks, raises, chain_assets, inflows, token_protocols, historical_liquidity, etfs_btc, etfs_eth, etfs_history, etfs_history_eth, fdv_performance, bridges, bridge, bridge_volume, dat_institutions, dat_institution'
      });
  }

  try {
    const url = proUrl(apiKey, path);
    const data = await cachedFetch(url, {}, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: `DeFiLlama API error: ${error.message}` });
  }
}
