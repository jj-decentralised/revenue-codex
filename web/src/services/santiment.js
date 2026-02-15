const API_BASE = '/api/santiment';

// Helper to get default date range (1 year ago to now)
function getDefaultDateRange() {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return {
    from: oneYearAgo.toISOString(),
    to: now.toISOString(),
  };
}

// Helper function to generate GraphQL query for any metric
export function makeMetricQuery(metric, slug, from, to, interval = '1d') {
  return `
    query GetMetric($slug: String!, $from: DateTime!, $to: DateTime!) {
      getMetric(metric: "${metric}") {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "${interval}") {
          datetime
          value
        }
      }
    }
  `;
}

// Core fetch function for GraphQL queries
async function fetchSantiment(query, variables = {}) {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(result.errors.map(e => e.message).join(', '));
  }

  return result.data;
}

// Generic metric fetcher
async function fetchMetric(metric, slug, from, to, interval = '1d') {
  const defaults = getDefaultDateRange();
  const query = makeMetricQuery(metric, slug, from || defaults.from, to || defaults.to, interval);
  const variables = {
    slug,
    from: from || defaults.from,
    to: to || defaults.to,
  };
  const data = await fetchSantiment(query, variables);
  return data.getMetric?.timeseriesData || [];
}

// 1. Developer Activity
export async function fetchDevActivity(slug, from, to) {
  return fetchMetric('dev_activity', slug, from, to);
}

// 2. Daily Active Addresses
export async function fetchDailyActiveAddresses(slug, from, to) {
  return fetchMetric('daily_active_addresses', slug, from, to);
}

// 3. Network Growth
export async function fetchNetworkGrowth(slug, from, to) {
  return fetchMetric('network_growth', slug, from, to);
}

// 4. Transaction Volume
export async function fetchTransactionVolume(slug, from, to) {
  return fetchMetric('transaction_volume', slug, from, to);
}

// 5. Exchange Inflow
export async function fetchExchangeInflow(slug, from, to) {
  return fetchMetric('exchange_inflow', slug, from, to);
}

// 6. Exchange Outflow
export async function fetchExchangeOutflow(slug, from, to) {
  return fetchMetric('exchange_outflow', slug, from, to);
}

// 7. MVRV (Market Value to Realized Value)
export async function fetchMVRV(slug, from, to) {
  return fetchMetric('mvrv_usd', slug, from, to);
}

// 8. NVT (Network Value to Transactions)
export async function fetchNVT(slug, from, to) {
  return fetchMetric('nvt', slug, from, to);
}

// 9. Social Volume
export async function fetchSocialVolume(slug, from, to) {
  return fetchMetric('social_volume_total', slug, from, to);
}

// 10. Sentiment (positive and negative)
export async function fetchSentiment(slug, from, to) {
  const defaults = getDefaultDateRange();
  const fromDate = from || defaults.from;
  const toDate = to || defaults.to;

  const query = `
    query GetSentiment($slug: String!, $from: DateTime!, $to: DateTime!) {
      positive: getMetric(metric: "sentiment_positive_total") {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") {
          datetime
          value
        }
      }
      negative: getMetric(metric: "sentiment_negative_total") {
        timeseriesData(slug: $slug, from: $from, to: $to, interval: "1d") {
          datetime
          value
        }
      }
    }
  `;

  const variables = { slug, from: fromDate, to: toDate };
  const data = await fetchSantiment(query, variables);

  return {
    positive: data.positive?.timeseriesData || [],
    negative: data.negative?.timeseriesData || [],
  };
}

// 11. Token Age Consumed
export async function fetchTokenAgeConsumed(slug, from, to) {
  return fetchMetric('age_consumed', slug, from, to);
}

// 12. Top Holders
export async function fetchTopHolders(slug, from, to) {
  return fetchMetric('amount_in_top_holders', slug, from, to);
}

// 13. All Projects Summary
export async function fetchAllProjectsSummary() {
  const query = `
    query AllProjects {
      allProjects(page: 1, pageSize: 500) {
        slug
        name
        ticker
        marketcapUsd
        infrastructure
      }
    }
  `;

  const data = await fetchSantiment(query);
  return data.allProjects || [];
}

// 14. Historical Balance (Mean Dollar Invested Age)
export async function fetchHistoricalBalance(slug, from, to) {
  return fetchMetric('mean_dollar_invested_age', slug, from, to);
}
