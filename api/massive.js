import { cachedFetch } from './_cache.js';

const BASE_URL = 'https://api.massive.com';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export default async function handler(req, res) {
  const apiKey = process.env.MASSIVE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'MASSIVE_API_KEY not configured' });
  }

  const { action, ticker, from, to, timespan, multiplier } = req.query;

  if (!action) {
    return res.status(400).json({
      error: 'Missing action. Supported: aggs, prev_close, ticker_details, snapshot, financials',
    });
  }

  let endpoint;

  switch (action) {
    case 'aggs': {
      if (!ticker || !from || !to) {
        return res.status(400).json({ error: 'ticker, from, to are required for aggs action' });
      }
      const ts = timespan || 'day';
      const mult = multiplier || '1';
      endpoint = `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${mult}/${ts}/${encodeURIComponent(from)}/${encodeURIComponent(to)}?adjusted=true&sort=asc&limit=50000`;
      break;
    }

    case 'prev_close': {
      if (!ticker) {
        return res.status(400).json({ error: 'ticker is required for prev_close action' });
      }
      endpoint = `/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true`;
      break;
    }

    case 'ticker_details': {
      if (!ticker) {
        return res.status(400).json({ error: 'ticker is required for ticker_details action' });
      }
      endpoint = `/v3/reference/tickers/${encodeURIComponent(ticker)}`;
      break;
    }

    case 'snapshot': {
      if (!ticker) {
        return res.status(400).json({ error: 'ticker is required for snapshot action' });
      }
      endpoint = `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`;
      break;
    }

    case 'financials': {
      if (!ticker) {
        return res.status(400).json({ error: 'ticker is required for financials action' });
      }
      endpoint = `/vX/reference/financials?ticker=${encodeURIComponent(ticker)}&limit=4&sort=filing_date&order=desc`;
      break;
    }

    default:
      return res.status(400).json({
        error: 'Invalid action. Supported: aggs, prev_close, ticker_details, snapshot, financials',
      });
  }

  // Massive.com uses apiKey query param for auth
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${endpoint}${separator}apiKey=${apiKey}`;

  try {
    const data = await cachedFetch(url, { headers: { Accept: 'application/json' } }, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch from Massive.com API', details: error.message });
  }
}
