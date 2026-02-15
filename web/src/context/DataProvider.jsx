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
 * - DeFiLlama Pro: protocols, fees (3 types), dexs, derivatives, options, yields, borrow rates,
 *   perps, LSD rates, emissions, categories, forks, oracles, entities, treasuries, hacks, raises,
 *   chainAssets, ETFs, bridges, DAT institutions, stablecoins, historical TVL
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
          // DeFiLlama (free endpoints, direct)
          deduplicatedFetch("https://api.llama.fi/protocols"),
          deduplicatedFetch("https://api.llama.fi/overview/fees?excludeTotalDataChartBreakdown=false"),
          deduplicatedFetch("https://api.llama.fi/overview/dexs"),
          deduplicatedFetch("https://api.llama.fi/overview/options"),
          deduplicatedFetch("https://api.llama.fi/v2/historicalChainTvl"),
          deduplicatedFetch("https://stablecoins.llama.fi/stablecoins?includePrices=true"),
          deduplicatedFetch("https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1"),
          deduplicatedFetch("https://api.llama.fi/pools"),
          // DeFiLlama Pro (via proxy) — 🔒 endpoints
          deduplicatedFetch("/api/defillama?action=fees_revenue"),
          deduplicatedFetch("/api/defillama?action=fees_holders"),
          deduplicatedFetch("/api/defillama?action=derivatives"),
          deduplicatedFetch("/api/defillama?action=yields"),
          deduplicatedFetch("/api/defillama?action=yields_borrow"),
          deduplicatedFetch("/api/defillama?action=yields_perps"),
          deduplicatedFetch("/api/defillama?action=yields_lsd"),
          deduplicatedFetch("/api/defillama?action=emissions"),
          deduplicatedFetch("/api/defillama?action=categories"),
          deduplicatedFetch("/api/defillama?action=treasuries"),
          deduplicatedFetch("/api/defillama?action=hacks"),
          deduplicatedFetch("/api/defillama?action=raises"),
          deduplicatedFetch("/api/defillama?action=etfs_btc"),
          deduplicatedFetch("/api/defillama?action=etfs_eth"),
          deduplicatedFetch("/api/defillama?action=bridges"),
          deduplicatedFetch("/api/defillama?action=dat_institutions"),
          deduplicatedFetch("/api/defillama?action=chain_assets"),
          // Alternative.me
          deduplicatedFetch("https://api.alternative.me/fng/?limit=365&format=json"),
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
            options: v(3),
            historicalTvl: v(4),
            stablecoins: v(5),
            stablecoinCharts: v(6),
            pools: v(7),
            feesRevenue: v(8),
            feesHolders: v(9),
            derivatives: v(10),
            yields: v(11),
            yieldsBorrow: v(12),
            yieldsPerps: v(13),
            yieldsLsd: v(14),
            emissions: v(15),
            categories: v(16),
            treasuries: v(17),
            hacks: v(18),
            raises: v(19),
            etfsBtc: v(20),
            etfsEth: v(21),
            bridges: v(22),
            datInstitutions: v(23),
            chainAssets: v(24),
            fearGreed: v(25)?.data || null,
            coinMarkets: v(26),
            cgGlobal: v(27),
            cgCategories: v(28),
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
