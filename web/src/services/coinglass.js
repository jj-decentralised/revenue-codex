const API_BASE = '/api/coinglass';

async function fetchApi(action, params = {}) {
  const url = new URL(API_BASE, window.location.origin);
  url.searchParams.set('action', action);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

export async function fetchFundingRates() {
  return fetchApi('funding');
}

export async function fetchOpenInterest(symbol, range) {
  return fetchApi('oi', { symbol, range });
}

export async function fetchLiquidations() {
  return fetchApi('liquidation');
}

export async function fetchLongShortRatio(symbol, range) {
  return fetchApi('longshort', { symbol, range });
}

export async function fetchEtfFlows() {
  return fetchApi('etf');
}

export async function fetchOIByExchange(symbol) {
  return fetchApi('oi_exchange', { symbol });
}

export async function fetchOptionsOI(symbol, range) {
  return fetchApi('options_oi', { symbol, range });
}

export async function fetchOptionsVolume(symbol, range) {
  return fetchApi('options_volume', { symbol, range });
}

export async function fetchExchangeBalance(symbol, range) {
  return fetchApi('exchange_balance', { symbol, range });
}

export async function fetchExchangeNetflow(symbol, range) {
  return fetchApi('exchange_netflow', { symbol, range });
}

export async function fetchBasis(symbol, range) {
  return fetchApi('basis', { symbol, range });
}

export async function fetchOIWeight(symbol, range) {
  return fetchApi('oi_weight', { symbol, range });
}

export async function fetchGrayscale() {
  return fetchApi('grayscale');
}

export async function fetchCoinsMarkets() {
  return fetchApi('coins_markets');
}
