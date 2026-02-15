const MEMORY_CACHE = new Map()
const DEFAULT_TTL = 15 * 60 * 1000 // 15 minutes

export function cachedFetch(url, options = {}, ttl = DEFAULT_TTL) {
  const cacheKey = url + JSON.stringify(options.body || "")
  
  // 1. Check memory cache first (fastest)
  const memEntry = MEMORY_CACHE.get(cacheKey)
  if (memEntry && Date.now() - memEntry.ts < ttl) {
    return Promise.resolve(memEntry.data)
  }
  
  // 2. Check localStorage (survives page reload)
  try {
    const stored = localStorage.getItem("rc_" + cacheKey)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Date.now() - parsed.ts < ttl) {
        MEMORY_CACHE.set(cacheKey, parsed)
        return Promise.resolve(parsed.data)
      }
    }
  } catch(e) {}
  
  // 3. Fetch from network
  return fetch(url, options)
    .then(res => {
      if (!res.ok) throw new Error(res.status)
      return res.json()
    })
    .then(data => {
      const entry = { data, ts: Date.now() }
      MEMORY_CACHE.set(cacheKey, entry)
      try { localStorage.setItem("rc_" + cacheKey, JSON.stringify(entry)) } catch(e) {}
      return data
    })
}

// Deduplication: if same URL is being fetched, reuse the pending promise
const PENDING = new Map()
export function deduplicatedFetch(url, options = {}, ttl = DEFAULT_TTL) {
  const key = url + JSON.stringify(options.body || "")
  if (PENDING.has(key)) return PENDING.get(key)
  const promise = cachedFetch(url, options, ttl).finally(() => PENDING.delete(key))
  PENDING.set(key, promise)
  return promise
}

export function clearCache() {
  MEMORY_CACHE.clear()
  Object.keys(localStorage).filter(k => k.startsWith("rc_")).forEach(k => localStorage.removeItem(k))
}

export function getCacheStats() {
  const memEntries = MEMORY_CACHE.size
  const lsEntries = Object.keys(localStorage).filter(k => k.startsWith("rc_")).length
  const lsSize = Object.keys(localStorage).filter(k => k.startsWith("rc_")).reduce((s, k) => s + localStorage.getItem(k).length, 0)
  return { memEntries, lsEntries, lsSizeKB: (lsSize / 1024).toFixed(1) }
}
