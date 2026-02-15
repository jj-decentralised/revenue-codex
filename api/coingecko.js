const BASE_URL = 'https://pro-api.coingecko.com/api/v3';

export default async function handler(req, res) {
  const apiKey = process.env.COINGECKO_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'COINGECKO_API_KEY not configured' });
  }

  const { action, coin_id, days, exchange_id } = req.query;

  let endpoint;
  switch (action) {
    case 'markets':
      endpoint = '/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false';
      break;
    case 'global':
      endpoint = '/global';
      break;
    case 'defi':
      endpoint = '/global/decentralized_finance_defi';
      break;
    case 'exchanges':
      endpoint = '/exchanges?per_page=50';
      break;
    case 'categories':
      endpoint = '/coins/categories?order=market_cap_desc';
      break;
    case 'coin_chart':
      if (!coin_id || !days) {
        return res.status(400).json({ error: 'coin_id and days are required for coin_chart action' });
      }
      endpoint = `/coins/${encodeURIComponent(coin_id)}/market_chart?vs_currency=usd&days=${encodeURIComponent(days)}`;
      break;
    case 'coin_detail':
      if (!coin_id) {
        return res.status(400).json({ error: 'coin_id is required for coin_detail action' });
      }
      endpoint = `/coins/${encodeURIComponent(coin_id)}?localization=false&tickers=false&community_data=true&developer_data=true`;
      break;
    case 'trending':
      endpoint = '/search/trending';
      break;
    case 'coin_tickers':
      if (!coin_id) {
        return res.status(400).json({ error: 'coin_id is required for coin_tickers action' });
      }
      endpoint = `/coins/${encodeURIComponent(coin_id)}/tickers?include_exchange_logo=true&depth=true`;
      break;
    case 'derivatives_exchanges':
      endpoint = '/derivatives/exchanges?order=open_interest_btc_desc&per_page=20';
      break;
    case 'public_treasury_btc':
      endpoint = '/companies/public_treasury/bitcoin';
      break;
    case 'public_treasury_eth':
      endpoint = '/companies/public_treasury/ethereum';
      break;
    case 'coin_ohlc':
      if (!coin_id || !days) {
        return res.status(400).json({ error: 'coin_id and days are required for coin_ohlc action' });
      }
      endpoint = `/coins/${encodeURIComponent(coin_id)}/ohlc?vs_currency=usd&days=${encodeURIComponent(days)}`;
      break;
    case 'nfts':
      endpoint = '/nfts/list?per_page=50';
      break;
    case 'exchange_volume':
      if (!exchange_id) {
        return res.status(400).json({ error: 'exchange_id is required for exchange_volume action' });
      }
      endpoint = `/exchanges/${encodeURIComponent(exchange_id)}/volume_chart?days=30`;
      break;
    default:
      return res.status(400).json({ 
        error: 'Invalid action. Supported: markets, global, defi, exchanges, coin_chart, coin_detail, categories, trending, coin_tickers, derivatives_exchanges, public_treasury_btc, public_treasury_eth, coin_ohlc, nfts, exchange_volume' 
      });
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'x-cg-pro-api-key': apiKey,
        'Accept': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch from CoinGecko API', details: error.message });
  }
}
