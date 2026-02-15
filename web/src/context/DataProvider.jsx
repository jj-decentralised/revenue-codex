import { createContext, useContext, useState, useEffect, useCallback } from "react"

const DataContext = createContext(null)

export function useData() {
  return useContext(DataContext)
}

export default function DataProvider({ children }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)

    // Try pre-aggregated endpoint first (fastest — single request, edge cached)
    fetch("/api/dashboard-data")
      .then(res => res.ok ? res.json() : Promise.reject("prefetch unavailable"))
      .then(d => { setData(d); setLoading(false) })
      .catch(() => {
        // Fallback: fetch core datasets individually
        Promise.allSettled([
          fetch("https://api.llama.fi/protocols").then(r => r.json()),
          fetch("https://api.llama.fi/overview/fees?excludeTotalDataChartBreakdown=false").then(r => r.json()),
          fetch("https://api.alternative.me/fng/?limit=365&format=json").then(r => r.json()),
          fetch("https://stablecoins.llama.fi/stablecoins?includePrices=true").then(r => r.json()),
          fetch("https://api.llama.fi/v2/historicalChainTvl").then(r => r.json()),
          fetch("https://api.llama.fi/overview/dexs").then(r => r.json()),
          fetch("https://api.llama.fi/pools").then(r => r.json()),
        ]).then(results => {
          const hasAnyData = results.some(r => r.status === "fulfilled")
          if (!hasAnyData) {
            setError("Failed to fetch data from all sources")
          }
          setData({
            protocols: results[0].status === "fulfilled" ? results[0].value : null,
            fees: results[1].status === "fulfilled" ? results[1].value : null,
            fearGreed: results[2].status === "fulfilled" ? results[2].value?.data : null,
            stablecoins: results[3].status === "fulfilled" ? results[3].value : null,
            historicalTvl: results[4].status === "fulfilled" ? results[4].value : null,
            dexs: results[5].status === "fulfilled" ? results[5].value : null,
            pools: results[6].status === "fulfilled" ? results[6].value : null,
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
