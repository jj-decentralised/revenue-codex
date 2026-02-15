const BASE_URL = 'https://open-api-v3.coinglass.com';

export default async function handler(req, res) {
  const apiKey = process.env.COINGLASS_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'COINGLASS_API_KEY not configured' });
  }

  const { action, symbol, range } = req.query;

  let endpoint;
  switch (action) {
    case 'funding':
      endpoint = '/api/futures/fundingRate/v2/home';
      break;
    case 'oi':
      if (!symbol || !range) {
        return res.status(400).json({ error: 'symbol and range are required for oi action' });
      }
      endpoint = `/api/futures/openInterest/ohlc-aggregated-history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
      break;
    case 'liquidation':
      endpoint = '/api/futures/liquidation/v2/home';
      break;
    case 'longshort':
      if (!symbol || !range) {
        return res.status(400).json({ error: 'symbol and range are required for longshort action' });
      }
      endpoint = `/api/futures/globalLongShortAccountRatio/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
      break;
    case 'etf':
      endpoint = '/api/index/bitcoin-etf/history';
      break;
    case 'oi_exchange':
      if (!symbol) {
        return res.status(400).json({ error: 'symbol is required for oi_exchange action' });
      }
      endpoint = `/api/futures/openInterest/exchange-list?symbol=${encodeURIComponent(symbol)}`;
      break;
    case 'options_oi':
      if (!symbol || !range) {
        return res.status(400).json({ error: 'symbol and range are required for options_oi action' });
      }
      endpoint = `/api/option/openInterest/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
      break;
    case 'options_volume':
      if (!symbol || !range) {
        return res.status(400).json({ error: 'symbol and range are required for options_volume action' });
      }
      endpoint = `/api/option/volume/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
      break;
    case 'exchange_balance':
      if (!symbol || !range) {
        return res.status(400).json({ error: 'symbol and range are required for exchange_balance action' });
      }
      endpoint = `/api/indicator/exchange/balance?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
      break;
    case 'exchange_netflow':
      if (!symbol || !range) {
        return res.status(400).json({ error: 'symbol and range are required for exchange_netflow action' });
      }
      endpoint = `/api/indicator/exchange/netflow?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
      break;
    case 'basis':
      if (!symbol || !range) {
        return res.status(400).json({ error: 'symbol and range are required for basis action' });
      }
      endpoint = `/api/futures/basis/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
      break;
    case 'oi_weight':
      if (!symbol || !range) {
        return res.status(400).json({ error: 'symbol and range are required for oi_weight action' });
      }
      endpoint = `/api/futures/openInterest/ohlc-history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
      break;
    case 'grayscale':
      endpoint = '/api/index/grayscale/history';
      break;
    case 'coins_markets':
      endpoint = '/api/futures/coins/markets';
      break;
    default:
      return res.status(400).json({ 
        error: 'Invalid action. Supported: funding, oi, liquidation, longshort, etf, oi_exchange, options_oi, options_volume, exchange_balance, exchange_netflow, basis, oi_weight, grayscale, coins_markets' 
      });
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'CG-API-KEY': apiKey,
        'Accept': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.setHeader('Cache-Control', 's-maxage=180');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch from Coinglass API', details: error.message });
  }
}
