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
    default:
      return res.status(400).json({ error: 'Invalid action. Supported: funding, oi, liquidation, longshort, etf, oi_exchange' });
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
