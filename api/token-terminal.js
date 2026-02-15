import { cachedFetch, sequentialFetchAll } from './_cache.js';

const TT_BASE = 'https://api.tokenterminal.com/v2'
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

const HEADERS = (apiKey) => ({
  'Authorization': `Bearer ${apiKey}`,
  'Accept': 'application/json',
})

export default async function handler(req, res) {
  const apiKey = process.env.TOKEN_TERMINAL_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'TOKEN_TERMINAL_API_KEY not configured' })
  }

  const opts = { headers: HEADERS(apiKey) }
  const { endpoint, project_id, metric_id, interval, market_sector_id, start, end, granularity } = req.query

  // Special endpoint: pull ALL key financial metrics SEQUENTIALLY (60 req/min limit)
  if (endpoint === 'all-financials') {
    try {
      const metrics = ['revenue', 'fees', 'earnings', 'token_incentives', 'price_to_sales', 'price_to_earnings', 'active_users']
      const urls = metrics.map(m => `${TT_BASE}/metrics/${m}`)
      // Sequential with 1s delay between each to respect 60 req/min
      const results = await sequentialFetchAll(urls, opts, 1000, CACHE_TTL)
      const financials = {}
      metrics.forEach((m, i) => {
        financials[m] = results[i].status === 'fulfilled' ? results[i].value : null
      })
      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600')
      return res.status(200).json(financials)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  let url
  switch (endpoint) {
    case 'projects':
      url = `${TT_BASE}/projects`
      break
    case 'metrics': {
      if (!project_id) return res.status(400).json({ error: 'project_id required' })
      const params = new URLSearchParams()
      params.set('metric_id', metric_id || 'revenue,fees,earnings')
      params.set('interval', interval || 'daily')
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      if (granularity) params.set('granularity', granularity)
      url = `${TT_BASE}/projects/${project_id}/metrics?${params}`
      break
    }
    case 'bulk-metrics': {
      const bParams = new URLSearchParams()
      if (market_sector_id) bParams.set('market_sector_id', market_sector_id)
      if (interval) bParams.set('interval', interval)
      if (start) bParams.set('start', start)
      if (end) bParams.set('end', end)
      const qs = bParams.toString()
      url = `${TT_BASE}/metrics/${metric_id || 'revenue'}${qs ? '?' + qs : ''}`
      break
    }
    case 'project-detail':
      if (!project_id) return res.status(400).json({ error: 'project_id required' })
      url = `${TT_BASE}/projects/${project_id}`
      break
    case 'aggregations': {
      const aParams = new URLSearchParams()
      if (project_id) aParams.set('project_id', project_id)
      if (market_sector_id) aParams.set('market_sector_id', market_sector_id)
      const aqs = aParams.toString()
      url = `${TT_BASE}/metrics/${metric_id || 'revenue'}/aggregations${aqs ? '?' + aqs : ''}`
      break
    }
    case 'market-sectors':
      url = `${TT_BASE}/market-sectors`
      break
    default:
      return res.status(400).json({ error: 'Invalid endpoint. Use: projects, metrics, bulk-metrics, project-detail, aggregations, market-sectors, all-financials' })
  }

  try {
    const data = await cachedFetch(url, opts, CACHE_TTL)
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600')
    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
