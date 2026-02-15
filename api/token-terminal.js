const TT_BASE = 'https://api.tokenterminal.com/v2'

export default async function handler(req, res) {
  const apiKey = process.env.TOKEN_TERMINAL_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'TOKEN_TERMINAL_API_KEY not configured' })
  }

  const { endpoint, project_id, metric_id, interval } = req.query

  let url
  switch (endpoint) {
    case 'projects':
      url = `${TT_BASE}/projects`
      break
    case 'metrics':
      if (!project_id) return res.status(400).json({ error: 'project_id required' })
      url = `${TT_BASE}/projects/${project_id}/metrics?metric_id=${metric_id || 'revenue'}&interval=${interval || 'daily'}`
      break
    case 'bulk-metrics':
      url = `${TT_BASE}/metrics/${metric_id || 'revenue'}`
      break
    case 'project-detail':
      if (!project_id) return res.status(400).json({ error: 'project_id required' })
      url = `${TT_BASE}/projects/${project_id}`
      break
    case 'aggregations':
      url = `${TT_BASE}/metrics/${metric_id || 'revenue'}/aggregations`
      break
    default:
      return res.status(400).json({ error: 'Invalid endpoint. Use: projects, metrics, bulk-metrics, project-detail, aggregations' })
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      return res.status(response.status).json({ error: text })
    }

    const data = await response.json()

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
