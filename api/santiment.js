const SANTIMENT_ENDPOINT = 'https://api.santiment.net/graphql';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.SANTIMENT_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'SANTIMENT_API_KEY not configured' });
  }

  const { query, variables } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'GraphQL query is required in request body' });
  }

  try {
    const response = await fetch(SANTIMENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Apikey ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.setHeader('Cache-Control', 's-maxage=300');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch from Santiment API', details: error.message });
  }
}
