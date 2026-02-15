/**
 * Server-side cache for Vercel serverless functions.
 *
 * - In-memory Map that persists across warm invocations (same Lambda container)
 * - fetchWithRetry: exponential backoff on 429 rate-limit responses
 * - cachedFetch: checks memory cache before network (default 15 min TTL)
 * - sequentialFetch: fetches an array of URLs one-by-one with delay between each
 */

const CACHE = new Map();
const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch with retry + exponential backoff on 429 / 5xx.
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 429 || (res.status >= 500 && attempt < maxRetries)) {
        // Rate limited or server error — back off and retry
        const retryAfter = res.headers.get('retry-after');
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(1000 * Math.pow(2, attempt), 10000);
        await sleep(delayMs);
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && err.name !== 'AbortError') {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
    }
  }
  throw lastError || new Error(`Failed after ${maxRetries} retries: ${url}`);
}

/**
 * Cached server-side fetch. Checks in-memory cache first.
 * Falls back to fetchWithRetry on cache miss.
 */
export async function cachedFetch(url, options = {}, ttl = DEFAULT_TTL) {
  const key = url + JSON.stringify(options.headers || '');
  const entry = CACHE.get(key);
  if (entry && Date.now() - entry.ts < ttl) {
    return entry.data;
  }
  const data = await fetchWithRetry(url, options);
  CACHE.set(key, { data, ts: Date.now() });
  return data;
}

/**
 * Fetch multiple URLs sequentially with a delay between each.
 * Returns array of { status: 'fulfilled'|'rejected', value?, reason? }
 * Respects rate limits by spacing out requests.
 */
export async function sequentialFetchAll(urls, options = {}, delayMs = 1000, ttl = DEFAULT_TTL) {
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const data = await cachedFetch(urls[i], options, ttl);
      results.push({ status: 'fulfilled', value: data });
    } catch (err) {
      results.push({ status: 'rejected', reason: err });
    }
    // Delay between requests (but not after the last one)
    if (i < urls.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return results;
}

/**
 * Get cache stats (for debugging).
 */
export function getCacheStats() {
  let valid = 0;
  let expired = 0;
  const now = Date.now();
  for (const [, entry] of CACHE) {
    if (now - entry.ts < DEFAULT_TTL) valid++;
    else expired++;
  }
  return { total: CACHE.size, valid, expired };
}

/**
 * Clear the server-side cache.
 */
export function clearCache() {
  CACHE.clear();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
