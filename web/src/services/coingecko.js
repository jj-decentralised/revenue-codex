const API_BASE = '/api/coingecko';

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

export async function fetchCoinMarkets() {
  return fetchApi('markets');
}

export async function fetchGlobalData() {
  return fetchApi('global');
}

export async function fetchDefiGlobal() {
  return fetchApi('defi');
}

export async function fetchExchanges() {
  return fetchApi('exchanges');
}

export async function fetchCoinChart(coinId, days) {
  return fetchApi('coin_chart', { coin_id: coinId, days });
}

export async function fetchCoinDetail(coinId) {
  return fetchApi('coin_detail', { coin_id: coinId });
}

export async function fetchCategories() {
  return fetchApi('categories');
}

export async function fetchTrending() {
  return fetchApi('trending');
}

export async function fetchCoinTickers(coinId) {
  return fetchApi('coin_tickers', { coin_id: coinId });
}

export async function fetchDerivativesExchanges() {
  return fetchApi('derivatives_exchanges');
}

export async function fetchPublicTreasuryBtc() {
  return fetchApi('public_treasury_btc');
}

export async function fetchPublicTreasuryEth() {
  return fetchApi('public_treasury_eth');
}

export async function fetchCoinOhlc(coinId, days) {
  return fetchApi('coin_ohlc', { coin_id: coinId, days });
}

export async function fetchNfts() {
  return fetchApi('nfts');
}

export async function fetchExchangeVolume(exchangeId) {
  return fetchApi('exchange_volume', { exchange_id: exchangeId });
}
