import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { deduplicatedFetch } from "../services/cache"

const DataContext = createContext(null)

export function useData() {
  return useContext(DataContext)
}

/**
 * DataProvider preloads ALL heavy datasets through the deduplicatedFetch cache layer.
 * When individual tabs later call fetchAllProtocols(), fetchFeesOverview(), etc.,
 * they hit the same URLs through deduplicatedFetch and get instant cache hits.
 *
 * Data sources preloaded:
 * - DeFiLlama: protocols (3000+), fees/revenue (1000+ protocols), dexs, derivatives, options,
 *   stablecoins, stablecoin charts, bridges, raises, hacks, yield pools, historical TVL
 * - Token Terminal: bulk financials for ALL projects (revenue, fees, earnings, P/S, P/E, etc.)
 * - CoinGecko Pro: 1000 coins market data, global stats, categories
 * - Alternative.me: Fear & Greed Index (365 days)
 */
export default function DataProvider({ children }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)

    // Try pre-aggregated endpoint first (fastest — single request, Vercel edge cached)
    fetch("/api/dashboard-data")
      .then(res => res.ok ? res.json() : Promise.reject("prefetch unavailable"))
      .then(d => { setData(d); setLoading(false) })
      .catch(() => {
        // Fallback: fetch core datasets individually via deduplicatedFetch
        // This warms the cache so tabs get instant hits on matching URLs
        Promise.allSettled([
          // DeFiLlama (free, no auth)
          deduplicatedFetch("https://api.llama.fi/protocols"),
          deduplicatedFetch("https://api.llama.fi/overview/fees?excludeTotalDataChartBreakdown=false"),
          deduplicatedFetch("https://api.llama.fi/overview/dexs"),
          deduplicatedFetch("https://api.llama.fi/overview/derivatives"),
          deduplicatedFetch("https://api.llama.fi/overview/options"),
          deduplicatedFetch("https://api.llama.fi/v2/historicalChainTvl"),
          deduplicatedFetch("https://stablecoins.llama.fi/stablecoins?includePrices=true"),
          deduplicatedFetch("https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1"),
          deduplicatedFetch("https://api.llama.fi/pools"),
          deduplicatedFetch("https://bridges.llama.fi/bridges"),
          deduplicatedFetch("https://api.llama.fi/raises"),
          deduplicatedFetch("https://api.llama.fi/hacks"),
          // Alternative.me
          deduplicatedFetch("https://api.alternative.me/fng/?limit=365&format=json"),
          // Token Terminal: all-financials endpoint (pulls revenue, fees, earnings, P/S, P/E for ALL projects)
          deduplicatedFetch("/api/token-terminal?endpoint=all-financials"),
          // CoinGecko Pro: 1000 coins
          deduplicatedFetch("/api/coingecko?action=markets_all"),
          deduplicatedFetch("/api/coingecko?action=global"),
          deduplicatedFetch("/api/coingecko?action=categories"),
        ]).then(results => {
          const v = (idx) => results[idx]?.status === "fulfilled" ? results[idx].value : null
          const hasAnyData = results.some(r => r.status === "fulfilled")
          if (!hasAnyData) {
            setError("Failed to fetch data from all sources")
          }
          setData({
            protocols: v(0),
            fees: v(1),
            dexs: v(2),
            derivatives: v(3),
            options: v(4),
            historicalTvl: v(5),
            stablecoins: v(6),
            stablecoinCharts: v(7),
            pools: v(8),
            bridges: v(9),
            raises: v(10),
            hacks: v(11),
            fearGreed: v(12)?.data || null,
            ttFinancials: v(13),
            coinMarkets: v(14),
            cgGlobal: v(15),
            cgCategories: v(16),
          })
          setLoading(false)
        }).catch(err => {
          setError(err.message || "Failed to fetch data")
          setLoading(false)
        })
      })
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <DataContext.Provider value={{ data, loading, error, refetch: fetchData }}>
      {children}
    </DataContext.Provider>
  )
}
