const YAHOO_BASE = 'https://query1.finance.yahoo.com'

async function fetchChart(symbol, range, interval) {
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includeAdjustedClose=true`
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!resp.ok) throw new Error(`Yahoo chart ${symbol}: ${resp.status} ${resp.statusText}`)
  return resp.json()
}

export default async function handler(req, res) {
  const { action, symbol, period } = req.query

  if (!symbol) {
    return res.status(400).json({ error: 'symbol parameter required' })
  }

  try {
    let data

    switch (action) {
      case 'quote': {
        // Use chart endpoint for a quick quote (more reliable than v6/quote)
        const chart = await fetchChart(symbol, '5d', '1d')
        const meta = chart?.chart?.result?.[0]?.meta || {}
        data = {
          regularMarketPrice: meta.regularMarketPrice,
          previousClose: meta.chartPreviousClose || meta.previousClose,
          symbol: meta.symbol,
          currency: meta.currency,
        }
        break
      }
      case 'historical': {
        const rangeMap = {
          '1m': '1mo', '3m': '3mo', '6m': '6mo',
          '1y': '1y', '2y': '2y', '5y': '5y',
        }
        const range = rangeMap[period] || '2y'
        const interval = ['2y', '5y'].includes(range) ? '1wk' : '1d'

        const chart = await fetchChart(symbol, range, interval)
        const result = chart?.chart?.result?.[0]

        if (!result) {
          return res.status(200).json({ quotes: [] })
        }

        const timestamps = result.timestamp || []
        const quote = result.indicators?.quote?.[0] || {}
        const adjClose = result.indicators?.adjclose?.[0]?.adjclose || []

        data = {
          quotes: timestamps.map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().split('T')[0],
            open: quote.open?.[i] ?? null,
            high: quote.high?.[i] ?? null,
            low: quote.low?.[i] ?? null,
            close: quote.close?.[i] ?? null,
            adjclose: adjClose[i] ?? quote.close?.[i] ?? null,
            volume: quote.volume?.[i] ?? null,
          })).filter(d => d.close != null),
          meta: result.meta || {},
        }
        break
      }
      default:
        return res.status(400).json({ error: 'Invalid action. Use: quote, historical' })
    }

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800')
    return res.status(200).json(data)
  } catch (err) {
    console.error('Yahoo API error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
