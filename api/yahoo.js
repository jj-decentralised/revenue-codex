import yahooFinance from 'yahoo-finance2'

export default async function handler(req, res) {
  const { action, symbol, period } = req.query

  if (!symbol) {
    return res.status(400).json({ error: 'symbol parameter required' })
  }

  try {
    let data

    switch (action) {
      case 'quote': {
        data = await yahooFinance.quote(symbol)
        break
      }
      case 'historical': {
        const periodMap = {
          '1m': 30, '3m': 90, '6m': 180, '1y': 365, '2y': 730, '5y': 1825,
        }
        const days = periodMap[period] || 730
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        data = await yahooFinance.chart(symbol, {
          period1: startDate.toISOString().split('T')[0],
          interval: days > 365 ? '1wk' : '1d',
        })
        break
      }
      default:
        return res.status(400).json({ error: 'Invalid action. Use: quote, historical' })
    }

    // Cache for 15 minutes
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800')
    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
