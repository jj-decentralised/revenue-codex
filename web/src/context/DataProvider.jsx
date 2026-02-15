import { createContext, useContext, useState, useEffect, useRef } from "react"
import { deduplicatedFetch } from "../services/cache"

const DataContext = createContext(null)

export function useData() {
  return useContext(DataContext)
}

/**
 * DataProvider warms the deduplicatedFetch cache in the BACKGROUND.
 * It does NOT block rendering — the app shell + tabs render immediately.
 * Each tab fetches its own data via api.js; those calls hit the same URLs
 * through deduplicatedFetch and get instant cache hits once the background
 * preload has completed.
 *
 * Tiered preload:
 *  - Tier 1 (critical): protocols, fees, markets — needed by default tab
 *  - Tier 2 (secondary): dexs, options, stablecoins, etc. — fired after Tier 1
 */
export default function DataProvider({ children }) {
  const [warming, setWarming] = useState(true)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    // ── Tier 1: Critical data for the first visible tab ──
    const tier1 = [
      deduplicatedFetch("https://api.llama.fi/protocols"),
      deduplicatedFetch("https://api.llama.fi/overview/fees?excludeTotalDataChartBreakdown=false"),
      deduplicatedFetch("/api/coingecko?action=markets_all"),
      deduplicatedFetch("https://api.alternative.me/fng/?limit=365&format=json"),
      deduplicatedFetch("/api/defillama?action=fees_revenue"),
      deduplicatedFetch("/api/defillama?action=emissions"),
    ]

    Promise.allSettled(tier1).then(() => {
      setWarming(false)

      // ── Tier 2: Background preload of secondary datasets ──
      // These fire after Tier 1 so they don't compete for bandwidth
      const tier2 = [
        deduplicatedFetch("https://api.llama.fi/overview/dexs"),
        deduplicatedFetch("https://api.llama.fi/overview/options"),
        deduplicatedFetch("https://api.llama.fi/v2/historicalChainTvl"),
        deduplicatedFetch("https://stablecoins.llama.fi/stablecoins?includePrices=true"),
        deduplicatedFetch("https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1"),
        deduplicatedFetch("https://api.llama.fi/pools"),
        deduplicatedFetch("/api/defillama?action=fees_holders"),
        deduplicatedFetch("/api/defillama?action=derivatives"),
        deduplicatedFetch("/api/defillama?action=yields"),
        deduplicatedFetch("/api/defillama?action=categories"),
        deduplicatedFetch("/api/defillama?action=treasuries"),
        deduplicatedFetch("/api/defillama?action=hacks"),
        deduplicatedFetch("/api/defillama?action=raises"),
        deduplicatedFetch("/api/defillama?action=bridges"),
        deduplicatedFetch("/api/coingecko?action=global"),
        deduplicatedFetch("/api/coingecko?action=categories"),
      ]
      Promise.allSettled(tier2).then(() => {
        // ── Tier 3: Low priority — load last ──
        Promise.allSettled([
          deduplicatedFetch("/api/defillama?action=yields_borrow"),
          deduplicatedFetch("/api/defillama?action=yields_perps"),
          deduplicatedFetch("/api/defillama?action=yields_lsd"),
          deduplicatedFetch("/api/defillama?action=etfs_btc"),
          deduplicatedFetch("/api/defillama?action=etfs_eth"),
          deduplicatedFetch("/api/defillama?action=dat_institutions"),
          deduplicatedFetch("/api/defillama?action=chain_assets"),
        ])
      })
    })
  }, [])

  return (
    <DataContext.Provider value={{ warming }}>
      {children}
    </DataContext.Provider>
  )
}
