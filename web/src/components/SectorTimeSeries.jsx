import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from './Plot'
import ChartCard from './ChartCard'
import { formatCurrency, categorizeSector } from '../utils/helpers'
import { fetchCoinChartsBatch } from '../services/api'

// ─── Sector color map (stable across renders) ───
const SECTOR_COLORS = {
  'Layer 1':         '#2563EB',
  'Layer 2':         '#7C3AED',
  'DeFi':            '#0EA5E9',
  'Exchanges':       '#F59E0B',
  'Exchange Tokens': '#F59E0B',
  'DeFi Lending':    '#10B981',
  'Staking':         '#8B5CF6',
  'Stablecoins':     '#6B7280',
  'Infrastructure':  '#EC4899',
  'DeFi Yield':      '#14B8A6',
  'Consumer':        '#F97316',
  'Gaming/NFT':      '#EF4444',
  'Memecoins':       '#FBBF24',
  'Payments':        '#06B6D4',
  'RWA':             '#84CC16',
  'Other':           '#9CA3AF',
}

function sectorColor(sector, fallbackIdx) {
  return SECTOR_COLORS[sector] || colors.palette[fallbackIdx % colors.palette.length]
}

// ─── Manual sector mapping for top CoinGecko coins ───
const COIN_SECTOR = {
  // Layer 1
  bitcoin: 'Layer 1', ethereum: 'Layer 1', solana: 'Layer 1',
  cardano: 'Layer 1', tron: 'Layer 1', polkadot: 'Layer 1',
  'avalanche-2': 'Layer 1', near: 'Layer 1', aptos: 'Layer 1',
  sui: 'Layer 1', toncoin: 'Layer 1', cosmos: 'Layer 1',
  'hedera-hashgraph': 'Layer 1', algorand: 'Layer 1',
  'internet-computer': 'Layer 1', sei: 'Layer 1',
  injective: 'Layer 1', kaspa: 'Layer 1', fantom: 'Layer 1',
  'eos': 'Layer 1', 'elrond-erd-2': 'Layer 1',
  // Layer 2
  arbitrum: 'Layer 2', optimism: 'Layer 2',
  'polygon-ecosystem-token': 'Layer 2', 'matic-network': 'Layer 2',
  starknet: 'Layer 2', mantle: 'Layer 2', 'immutable-x': 'Layer 2',
  // Exchange tokens
  binancecoin: 'Exchange Tokens', okb: 'Exchange Tokens',
  'gatechain-token': 'Exchange Tokens', 'crypto-com-chain': 'Exchange Tokens',
  'kucoin-shares': 'Exchange Tokens', 'leo-token': 'Exchange Tokens',
  // Stablecoins
  tether: 'Stablecoins', 'usd-coin': 'Stablecoins', dai: 'Stablecoins',
  'first-digital-usd': 'Stablecoins', 'ethena-usde': 'Stablecoins',
  'true-usd': 'Stablecoins',
  // Memecoins
  dogecoin: 'Memecoins', 'shiba-inu': 'Memecoins',
  pepe: 'Memecoins', bonk: 'Memecoins', floki: 'Memecoins',
  'trump-official': 'Memecoins', 'brett': 'Memecoins',
  // Payments
  ripple: 'Payments', litecoin: 'Payments',
  stellar: 'Payments', 'bitcoin-cash': 'Payments',
  // Wrapped
  'wrapped-bitcoin': 'Layer 1',
}

// Map DeFiLlama categories → market cap sector
function mcapSector(category) {
  const map = {
    'Dexes': 'DeFi', 'Lending': 'DeFi', 'CDP': 'DeFi',
    'Yield': 'DeFi', 'Yield Aggregator': 'DeFi', 'Derivatives': 'DeFi',
    'DEX Aggregator': 'DeFi', 'Options': 'DeFi', 'Farm': 'DeFi',
    'Prediction Market': 'DeFi', 'Liquid Staking': 'DeFi', 'Restaking': 'DeFi',
    'Bridge': 'Infrastructure', 'Oracle': 'Infrastructure',
    'Services': 'Infrastructure', 'Launchpad': 'Infrastructure',
    'Chain': 'Layer 1', 'CEX': 'Exchange Tokens',
    'Gaming': 'Gaming/NFT', 'NFT Marketplace': 'Gaming/NFT',
    'RWA': 'RWA', 'Stablecoins': 'Stablecoins', 'Algo-Stables': 'Stablecoins',
  }
  return map[category] || 'Other'
}

// ─── 7-day EMA helper ───
function ema(values, span = 7) {
  const k = 2 / (span + 1)
  const out = new Array(values.length)
  out[0] = values[0]
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k)
  }
  return out
}

// ─── Weekly bucketing ───
function weeklyBucket(dates, values) {
  const weeks = {}
  dates.forEach((d, i) => {
    const dt = new Date(d)
    // ISO week start (Monday)
    const day = dt.getDay() || 7
    const monday = new Date(dt)
    monday.setDate(dt.getDate() - day + 1)
    const key = monday.toISOString().split('T')[0]
    if (!weeks[key]) weeks[key] = { sum: 0, count: 0 }
    weeks[key].sum += values[i] || 0
    weeks[key].count++
  })
  const sortedKeys = Object.keys(weeks).sort()
  return {
    dates: sortedKeys,
    values: sortedKeys.map(k => weeks[k].sum / weeks[k].count), // daily average
  }
}

// ═══════════════════════════════════════
// Component
// ═══════════════════════════════════════

export default function SectorTimeSeries({ feesData, protocols, markets }) {
  const [mcapCharts, setMcapCharts] = useState(null)
  const [mcapLoading, setMcapLoading] = useState(true)
  const [revPeriod, setRevPeriod] = useState('all') // '1y', '6m', '3m', 'all'
  const [mcapPeriod, setMcapPeriod] = useState('1y')
  const [revSmoothing, setRevSmoothing] = useState('7d') // 'raw', '7d', 'weekly'

  // ── Fetch market cap chart data for top 30 coins ──
  useEffect(() => {
    if (!markets || markets.length === 0) return
    const top30 = markets
      .filter(m => m.market_cap > 0)
      .sort((a, b) => b.market_cap - a.market_cap)
      .slice(0, 30)
      .map(m => m.id)

    fetchCoinChartsBatch(top30, 365)
      .then(setMcapCharts)
      .catch(() => setMcapCharts([]))
      .finally(() => setMcapLoading(false))
  }, [markets])

  // ── Build gecko_id → sector mapping ──
  const geckoToSector = useMemo(() => {
    const map = {}
    ;(protocols || []).forEach(p => {
      if (p.gecko_id) map[p.gecko_id] = mcapSector(p.category || 'Other')
    })
    return map
  }, [protocols])

  // ═══════════════════════════════════════
  // REVENUE TIME SERIES BY SECTOR
  // ═══════════════════════════════════════
  const revenueTimeSeries = useMemo(() => {
    if (!feesData?.totalDataChartBreakdown?.length || !feesData?.protocols?.length) return null

    // Build slug → sector lookup
    const slugToSector = new Map()
    feesData.protocols.forEach(p => {
      if (p.slug) slugToSector.set(p.slug, categorizeSector(p.category || 'Other'))
      if (p.name) slugToSector.set(p.name, categorizeSector(p.category || 'Other'))
    })

    // Aggregate by sector per day
    const sectorDays = new Map() // sector → Map(dateStr → value)
    const allDates = []

    feesData.totalDataChartBreakdown.forEach(([ts, breakdown]) => {
      if (!breakdown || typeof breakdown !== 'object') return
      const dateStr = new Date(ts * 1000).toISOString().split('T')[0]
      allDates.push(dateStr)

      Object.entries(breakdown).forEach(([key, val]) => {
        const value = typeof val === 'number' ? val : (typeof val === 'object' ? Object.values(val).find(v => typeof v === 'number') || 0 : 0)
        if (value <= 0) return
        const sector = slugToSector.get(key) || 'Other'
        if (!sectorDays.has(sector)) sectorDays.set(sector, new Map())
        const dayMap = sectorDays.get(sector)
        dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + value)
      })
    })

    const uniqueDates = [...new Set(allDates)].sort()

    // Build sorted sector list (by total revenue, descending)
    const sectorTotals = []
    sectorDays.forEach((dayMap, sector) => {
      let total = 0
      dayMap.forEach(v => { total += v })
      sectorTotals.push({ sector, total })
    })
    sectorTotals.sort((a, b) => b.total - a.total)
    const topSectors = sectorTotals.slice(0, 10).map(s => s.sector)

    // Build traces
    const traces = topSectors.map(sector => {
      const dayMap = sectorDays.get(sector)
      const values = uniqueDates.map(d => dayMap?.get(d) || 0)
      return { sector, dates: uniqueDates, values }
    })

    // Compute total
    const totalByDay = uniqueDates.map((_, i) =>
      traces.reduce((sum, t) => sum + t.values[i], 0)
    )

    return { traces, dates: uniqueDates, totalByDay }
  }, [feesData])

  // ═══════════════════════════════════════
  // MARKET CAP TIME SERIES BY SECTOR
  // ═══════════════════════════════════════
  const mcapTimeSeries = useMemo(() => {
    if (!mcapCharts || mcapCharts.length === 0) return null

    // Build per-coin time series mapped to sectors
    const sectorDays = new Map() // sector → Map(dateStr → mcap)

    mcapCharts.forEach(({ id, data }) => {
      if (!data?.market_caps?.length) return
      const sector = COIN_SECTOR[id] || geckoToSector[id] || 'Other'

      data.market_caps.forEach(([tsMs, mcap]) => {
        if (!mcap || mcap <= 0) return
        const dateStr = new Date(tsMs).toISOString().split('T')[0]
        if (!sectorDays.has(sector)) sectorDays.set(sector, new Map())
        const dayMap = sectorDays.get(sector)
        dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + mcap)
      })
    })

    // Collect all unique dates
    const allDatesSet = new Set()
    sectorDays.forEach(dayMap => dayMap.forEach((_, d) => allDatesSet.add(d)))
    const uniqueDates = [...allDatesSet].sort()

    // Sort sectors by total market cap
    const sectorTotals = []
    sectorDays.forEach((dayMap, sector) => {
      const lastDate = uniqueDates[uniqueDates.length - 1]
      sectorTotals.push({ sector, total: dayMap.get(lastDate) || 0 })
    })
    sectorTotals.sort((a, b) => b.total - a.total)
    const topSectors = sectorTotals.slice(0, 10).map(s => s.sector)

    const traces = topSectors.map(sector => {
      const dayMap = sectorDays.get(sector)
      const values = uniqueDates.map(d => dayMap?.get(d) || 0)
      return { sector, dates: uniqueDates, values }
    })

    const totalByDay = uniqueDates.map((_, i) =>
      traces.reduce((sum, t) => sum + t.values[i], 0)
    )

    return { traces, dates: uniqueDates, totalByDay }
  }, [mcapCharts, geckoToSector])

  // ── Period filter ──
  function filterByPeriod(dates, period) {
    if (period === 'all') return { start: 0, end: dates.length }
    const now = new Date()
    const months = { '3m': 3, '6m': 6, '1y': 12 }[period] || 12
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate()).toISOString().split('T')[0]
    const start = dates.findIndex(d => d >= cutoff)
    return { start: Math.max(0, start), end: dates.length }
  }

  // ═══════════════════════════════════════
  // RENDER REVENUE CHART
  // ═══════════════════════════════════════
  function renderRevenueChart() {
    if (!revenueTimeSeries) return <div className="text-center py-12 text-(--color-text-secondary)">No revenue data</div>

    const { traces, dates } = revenueTimeSeries
    const { start, end } = filterByPeriod(dates, revPeriod)
    const filteredDates = dates.slice(start, end)

    const plotTraces = traces.map((t, i) => {
      let y = t.values.slice(start, end)

      // Apply smoothing
      if (revSmoothing === '7d') {
        y = ema(y, 7)
      } else if (revSmoothing === 'weekly') {
        const bucketed = weeklyBucket(filteredDates, y)
        return {
          x: bucketed.dates,
          y: bucketed.values,
          type: 'scatter', mode: 'lines', name: t.sector, stackgroup: 'rev',
          fillcolor: sectorColor(t.sector, i) + '90',
          line: { color: sectorColor(t.sector, i), width: 0 },
          hovertemplate: `${t.sector}<br>%{x}<br>$%{y:,.0f}/day<extra></extra>`,
        }
      }

      return {
        x: filteredDates,
        y,
        type: 'scatter', mode: 'lines', name: t.sector, stackgroup: 'rev',
        fillcolor: sectorColor(t.sector, i) + '90',
        line: { color: sectorColor(t.sector, i), width: 0 },
        hovertemplate: `${t.sector}<br>%{x}<br>$%{y:,.0f}/day<extra></extra>`,
      }
    })

    // Total latest daily revenue
    const latestTotal = traces.reduce((s, t) => s + (t.values[t.values.length - 1] || 0), 0)

    return (
      <ChartCard
        title="Total Revenue by Sector — Time Series"
        subtitle={`Daily protocol fees stacked by sector · ${traces.length} sectors · ${feesData?.protocols?.length?.toLocaleString() || '?'} protocols · Latest: ${formatCurrency(latestTotal)}/day`}
      >
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex rounded-md border border-(--color-border) overflow-hidden">
            {[['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'All']].map(([k, label]) => (
              <button key={k} onClick={() => setRevPeriod(k)}
                className={`px-3 py-1 text-xs font-medium cursor-pointer transition-colors ${revPeriod === k ? 'bg-(--color-primary) text-white' : 'text-(--color-text-secondary) hover:bg-gray-50'}`}
              >{label}</button>
            ))}
          </div>
          <div className="flex rounded-md border border-(--color-border) overflow-hidden">
            {[['raw', 'Raw'], ['7d', '7D EMA'], ['weekly', 'Weekly']].map(([k, label]) => (
              <button key={k} onClick={() => setRevSmoothing(k)}
                className={`px-3 py-1 text-xs font-medium cursor-pointer transition-colors ${revSmoothing === k ? 'bg-(--color-primary) text-white' : 'text-(--color-text-secondary) hover:bg-gray-50'}`}
              >{label}</button>
            ))}
          </div>
        </div>
        <Plot
          data={plotTraces}
          layout={{
            ...defaultLayout, height: 500,
            yaxis: { ...defaultLayout.yaxis, title: 'Daily Fees (USD)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.12, x: 0.5, xanchor: 'center' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>
    )
  }

  // ═══════════════════════════════════════
  // RENDER MARKET CAP CHART
  // ═══════════════════════════════════════
  function renderMcapChart() {
    if (mcapLoading) return (
      <div className="bg-white rounded-lg border border-(--color-border) p-8 text-center">
        <div className="animate-pulse text-sm text-(--color-text-secondary)">Loading market cap data for top 30 coins…</div>
      </div>
    )

    if (!mcapTimeSeries) return <div className="text-center py-12 text-(--color-text-secondary)">No market cap data</div>

    const { traces, dates } = mcapTimeSeries
    const { start, end } = filterByPeriod(dates, mcapPeriod)
    const filteredDates = dates.slice(start, end)

    const plotTraces = traces.map((t, i) => ({
      x: filteredDates,
      y: t.values.slice(start, end),
      type: 'scatter', mode: 'lines', name: t.sector, stackgroup: 'mcap',
      fillcolor: sectorColor(t.sector, i) + '90',
      line: { color: sectorColor(t.sector, i), width: 0 },
      hovertemplate: `${t.sector}<br>%{x}<br>$%{y:,.0f}<extra></extra>`,
    }))

    const latestTotal = traces.reduce((s, t) => s + (t.values[t.values.length - 1] || 0), 0)

    return (
      <ChartCard
        title="Total Market Cap by Sector — Time Series"
        subtitle={`Top 30 coins by market cap mapped to sectors · Latest: ${formatCurrency(latestTotal)} · Source: CoinGecko`}
      >
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex rounded-md border border-(--color-border) overflow-hidden">
            {[['3m', '3M'], ['6m', '6M'], ['1y', '1Y']].map(([k, label]) => (
              <button key={k} onClick={() => setMcapPeriod(k)}
                className={`px-3 py-1 text-xs font-medium cursor-pointer transition-colors ${mcapPeriod === k ? 'bg-(--color-primary) text-white' : 'text-(--color-text-secondary) hover:bg-gray-50'}`}
              >{label}</button>
            ))}
          </div>
          <span className="text-xs text-(--color-text-secondary)">
            {mcapCharts?.filter(c => c.data).length || 0} coins tracked
          </span>
        </div>
        <Plot
          data={plotTraces}
          layout={{
            ...defaultLayout, height: 500,
            yaxis: { ...defaultLayout.yaxis, title: 'Market Cap (USD)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.12, x: 0.5, xanchor: 'center' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>
    )
  }

  return (
    <div className="space-y-6">
      {renderRevenueChart()}
      {renderMcapChart()}
    </div>
  )
}
