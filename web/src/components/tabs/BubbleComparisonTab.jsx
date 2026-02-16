import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchBubbleComparisonData } from '../../services/api'
import { formatCurrency, formatMultiple } from '../../utils/helpers'
import {
  DOTCOM_DATA, CRYPTO_SNAPSHOTS, SECTOR_MAP, PEAKS,
  ANALOG_PAIRS, KEY_EVENTS,
} from '../../data/dotcom-ps-data'

// ── constants ────────────────────────────────────────────────
const SNAPSHOT_DATES_DC = ['1999-Q1', '2000-Q1', '2001-Q1', '2002-Q1', '2003-Q1', '2004-Q1']
const DC_OFFSETS = { '1999-Q1': -12, '2000-Q1': 0, '2001-Q1': 12, '2002-Q1': 24, '2003-Q1': 36, '2004-Q1': 48 }

const ERA_COLORS = { dotcom: '#2E5E8E', crypto: '#B8860B' }
const SURV_COLORS = { true: '#2E7D4F', false: '#C1352D' }

const CRYPTO_PEAK_TS = new Date('2021-11-10').getTime()
const DAY_MS = 86400000

const SPAGHETTI_COLORS = [
  '#2E5E8E', '#6B5B8D', '#2E7D4F', '#B8860B', '#C1352D',
  '#1A7F8F', '#B5465A', '#4E5BA6', '#64748B', '#8B6914',
  '#3D8B6E', '#7A4F8E', '#A0522D', '#4682B4', '#DAA520',
]

// ── math helpers ─────────────────────────────────────────────
function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function pctl(arr, p) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.max(0, Math.ceil(p * s.length) - 1)]
}
function rollingAvg(arr, window) {
  return arr.map((_, i) => {
    const start = Math.max(0, i - window + 1)
    const slice = arr.slice(start, i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

// ── daily P/S computation ────────────────────────────────────
function computeDailyPS(feeData, mcapData) {
  if (!feeData || !mcapData) return null
  const feeChart = feeData?.totalDataChart
  if (!Array.isArray(feeChart) || feeChart.length < 30) return null
  const mcapChart = mcapData?.market_caps
  if (!Array.isArray(mcapChart) || mcapChart.length < 30) return null

  const feeMap = new Map()
  feeChart.forEach(([ts, fee]) => {
    const d = new Date(ts > 1e12 ? ts : ts * 1000)
    const key = d.toISOString().slice(0, 10)
    feeMap.set(key, (feeMap.get(key) || 0) + (typeof fee === 'number' ? fee : 0))
  })

  const mcapMap = new Map()
  mcapChart.forEach(([ts, mcap]) => {
    const key = new Date(ts).toISOString().slice(0, 10)
    mcapMap.set(key, mcap)
  })

  const allDates = [...new Set([...feeMap.keys(), ...mcapMap.keys()])].sort()
  if (allDates.length < 60) return null

  const feeDates = allDates.filter(d => feeMap.has(d))
  const feeVals = feeDates.map(d => feeMap.get(d) || 0)
  const rollingFees = rollingAvg(feeVals, 30)

  const result = []
  feeDates.forEach((date, i) => {
    const mcap = mcapMap.get(date)
    const avgDailyFee = rollingFees[i]
    if (!mcap || mcap <= 0 || avgDailyFee <= 0) return
    const annualizedFees = avgDailyFee * 365
    const ps = mcap / annualizedFees
    if (ps > 10000 || ps < 0.01) return
    const ts = new Date(date).getTime()
    result.push({ date, ts, mcap, annualizedFees, ps, monthsFromPeak: (ts - CRYPTO_PEAK_TS) / (DAY_MS * 30.44) })
  })

  return result.length > 30 ? result : null
}

// ── Component ────────────────────────────────────────────────
export default function BubbleComparisonTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBubbleComparisonData()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const processed = useMemo(() => {
    if (!data) return null

    // ── Build daily P/S series per protocol ──
    const dailyPSMap = {}
    const feeHistMap = {}
    const mcapHistMap = {}
    ;(data.feeHistories || []).forEach(h => { if (h.data) feeHistMap[h.slug] = h.data })
    ;(data.mcapHistories || []).forEach(h => { if (h.data) mcapHistMap[h.slug] = h.data })

    Object.keys(feeHistMap).filter(s => mcapHistMap[s]).forEach(slug => {
      const series = computeDailyPS(feeHistMap[slug], mcapHistMap[slug])
      if (series) dailyPSMap[slug] = series
    })

    // ── Daily aggregates ──
    const allDatesSet = new Set()
    Object.values(dailyPSMap).forEach(series => series.forEach(d => allDatesSet.add(d.date)))
    const relevantDates = [...allDatesSet].sort().filter(d => d >= '2020-06-01')

    const dailyMedian = [], dailyP25 = [], dailyP75 = [], dailyMonths = []
    relevantDates.forEach(date => {
      const vals = []
      Object.values(dailyPSMap).forEach(series => { const pt = series.find(d => d.date === date); if (pt) vals.push(pt.ps) })
      if (vals.length >= 3) {
        dailyMedian.push(median(vals)); dailyP25.push(pctl(vals, 0.25)); dailyP75.push(pctl(vals, 0.75))
      } else {
        dailyMedian.push(null); dailyP25.push(null); dailyP75.push(null)
      }
      dailyMonths.push((new Date(date).getTime() - CRYPTO_PEAK_TS) / (DAY_MS * 30.44))
    })

    // ── Froth indicator ──
    const thresholds = [50, 100, 200]
    const frothData = {}
    thresholds.forEach(t => { frothData[t] = [] })
    relevantDates.forEach(date => {
      const vals = []
      Object.values(dailyPSMap).forEach(series => { const pt = series.find(d => d.date === date); if (pt) vals.push(pt.ps) })
      thresholds.forEach(t => { frothData[t].push(vals.length >= 3 ? (vals.filter(v => v > t).length / vals.length) * 100 : null) })
    })

    // ── Live enrichment for current snapshot ──
    const feesProtos = data.fees?.protocols || []
    const cgMarkets = Array.isArray(data.markets) ? data.markets : []
    const llamaProtos = data.protocols || []
    const feesLookup = {}; feesProtos.forEach(p => { if (p.slug) feesLookup[p.slug.toLowerCase()] = p })
    const mcapLookup = {}; cgMarkets.forEach(m => { if (m.id) mcapLookup[m.id.toLowerCase()] = m; if (m.symbol) mcapLookup[m.symbol.toLowerCase()] = m; if (m.name) mcapLookup[m.name.toLowerCase()] = m })
    const llamaLookup = {}; llamaProtos.forEach(p => { if (p.slug) llamaLookup[p.slug.toLowerCase()] = p; if (p.name) llamaLookup[p.name.toLowerCase()] = p })

    const cryptoEnriched = CRYPTO_SNAPSHOTS.map(proto => {
      const slug = proto.slug.toLowerCase()
      const fees = feesLookup[slug]
      const llama = llamaLookup[slug] || llamaLookup[proto.name.toLowerCase()]
      const cg = mcapLookup[slug] || mcapLookup[proto.name.toLowerCase()] || mcapLookup[(llama?.gecko_id || '').toLowerCase()] || mcapLookup[(llama?.symbol || '').toLowerCase()]
      const mcap = (llama?.mcap || cg?.market_cap || 0) / 1e9
      const annualizedFees = ((fees?.total24h || 0) * 365) / 1e9
      return { ...proto, snapshots: [...proto.snapshots, { date: '2026-Q1', mcap, annualizedFees, ps: mcap > 0 && annualizedFees > 0 ? mcap / annualizedFees : null }] }
    })

    // ── Static dot-com ──
    const dcByDate = {}
    SNAPSHOT_DATES_DC.forEach(d => { dcByDate[d] = DOTCOM_DATA.map(c => c.snapshots.find(s => s.date === d)?.ps).filter(v => v != null && v < 5000) })
    const dcTrajectory = SNAPSHOT_DATES_DC.map(d => ({ offset: DC_OFFSETS[d], date: d, median: median(dcByDate[d]), p25: pctl(dcByDate[d], 0.25), p75: pctl(dcByDate[d], 0.75) }))

    // ── Crypto snapshots ──
    const SNAPSHOT_DATES_CR = ['2021-Q4', '2022-Q4', '2023-Q4', '2024-Q4', '2026-Q1']
    const crByDate = {}
    SNAPSHOT_DATES_CR.forEach(d => { crByDate[d] = cryptoEnriched.map(c => c.snapshots.find(s => s.date === d)?.ps).filter(v => v != null && v < 5000) })

    // Rankings
    const dcPeakPS = DOTCOM_DATA.map(c => ({ name: c.name, ps: c.snapshots.find(s => s.date === '2000-Q1')?.ps, survived: c.survived, sector: c.sector })).filter(c => c.ps != null && c.ps < 5000).sort((a, b) => b.ps - a.ps)
    const crPeakPS = cryptoEnriched.map(c => ({ name: c.name, ps: c.snapshots.find(s => s.date === '2021-Q4')?.ps, survived: c.survived, sector: c.sector })).filter(c => c.ps != null && c.ps < 5000).sort((a, b) => b.ps - a.ps)

    // Sector heatmap
    const sctrs = Object.keys(SECTOR_MAP)
    const sectorGrid = { dotcom: {}, crypto: {} }
    sctrs.forEach(sec => {
      sectorGrid.dotcom[sec] = {}; sectorGrid.crypto[sec] = {}
      SNAPSHOT_DATES_DC.forEach(d => { sectorGrid.dotcom[sec][d] = median(DOTCOM_DATA.filter(c => c.sector === sec).map(c => c.snapshots.find(s => s.date === d)?.ps).filter(v => v != null && v < 5000)) })
      SNAPSHOT_DATES_CR.forEach(d => { sectorGrid.crypto[sec][d] = median(cryptoEnriched.filter(c => c.sector === sec).map(c => c.snapshots.find(s => s.date === d)?.ps).filter(v => v != null && v < 5000)) })
    })

    // Compression scatter
    const dcCompression = DOTCOM_DATA.map(c => ({ name: c.name, peakPS: c.snapshots.find(s => s.date === '2000-Q1')?.ps, troughPS: c.snapshots.find(s => s.date === '2002-Q1')?.ps, survived: c.survived, mcap: c.peakMcap })).filter(c => c.peakPS && c.troughPS)
    const crCompression = cryptoEnriched.map(c => ({ name: c.name, peakPS: c.snapshots.find(s => s.date === '2021-Q4')?.ps, troughPS: c.snapshots.find(s => s.date === '2024-Q4')?.ps || c.snapshots.find(s => s.date === '2026-Q1')?.ps, survived: c.survived, mcap: c.snapshots.find(s => s.date === '2021-Q4')?.mcap })).filter(c => c.peakPS && c.troughPS)

    // Survival
    const dcSurvival = computeSurvival(DOTCOM_DATA, '2000-Q1')
    const crSurvival = computeSurvival(cryptoEnriched, '2021-Q4')

    // Decomposition
    const decomposition = cryptoEnriched.map(c => {
      const peak = c.snapshots.find(s => s.date === '2021-Q4')
      const now = c.snapshots.find(s => s.date === '2026-Q1') || c.snapshots.find(s => s.date === '2024-Q4')
      if (!peak?.ps || !now?.ps || !peak.mcap || !now.mcap) return null
      const peakFees = peak.annualizedFees || (peak.mcap / peak.ps)
      const nowFees = now.annualizedFees || (now.mcap / now.ps)
      if (!peakFees || !nowFees) return null
      return { name: c.name, mcapChange: ((now.mcap - peak.mcap) / peak.mcap) * 100, feeChange: ((nowFees - peakFees) / peakFees) * 100, psChange: ((now.ps - peak.ps) / peak.ps) * 100, survived: c.survived }
    }).filter(Boolean).sort((a, b) => a.psChange - b.psChange)

    // KPIs
    const dcMedianPeak = median(dcByDate['2000-Q1'])
    const crMedianPeak = median(crByDate['2021-Q4'])
    const dcMedianTrough = median(dcByDate['2002-Q1'])
    const crMedianCurrent = median(crByDate['2026-Q1'] || crByDate['2024-Q4'])

    return {
      dailyPSMap, dailyMedian, dailyP25, dailyP75, dailyMonths, relevantDates, frothData, decomposition,
      dcTrajectory, dcByDate, crByDate, SNAPSHOT_DATES_CR, dcPeakPS, crPeakPS,
      sectorGrid, sectors: sctrs, dcCompression, crCompression, dcSurvival, crSurvival,
      dcMedianPeak, crMedianPeak, dcMedianTrough, crMedianCurrent,
      dcSurvivedPct: DOTCOM_DATA.filter(c => c.survived).length / DOTCOM_DATA.length * 100,
      crSurvivedPct: cryptoEnriched.filter(c => c.survived).length / cryptoEnriched.length * 100,
      cryptoEnriched,
    }
  }, [data])

  if (loading) return <LoadingSpinner message="Loading bubble comparison data (fetching 15 protocol histories)..." />
  if (!processed) return <div className="text-center py-20 text-(--color-ink-muted)">No data available</div>

  const {
    dailyPSMap, dailyMedian, dailyP25, dailyP75, dailyMonths, relevantDates, frothData, decomposition,
    dcTrajectory, dcByDate, crByDate, SNAPSHOT_DATES_CR, dcPeakPS, crPeakPS,
    sectorGrid, sectors, dcCompression, crCompression, dcSurvival, crSurvival,
    dcMedianPeak, crMedianPeak, dcMedianTrough, crMedianCurrent, dcSurvivedPct, crSurvivedPct, cryptoEnriched,
  } = processed

  const hasDaily = dailyMonths.length > 0

  // ════════════════════════════════════════════════════════════
  // CHART 1: Bubble Overlay — smooth daily crypto line
  // ════════════════════════════════════════════════════════════
  const chart1Traces = [
    { x: [...dcTrajectory.map(d => d.offset), ...dcTrajectory.slice().reverse().map(d => d.offset)], y: [...dcTrajectory.map(d => d.p75), ...dcTrajectory.slice().reverse().map(d => d.p25)], fill: 'toself', fillcolor: 'rgba(46,94,142,0.12)', line: { width: 0 }, showlegend: false, hoverinfo: 'skip', type: 'scatter' },
    { x: dcTrajectory.map(d => d.offset), y: dcTrajectory.map(d => d.median), name: 'Dot-Com Median P/S', line: { color: ERA_COLORS.dotcom, width: 3 }, mode: 'lines+markers', type: 'scatter', text: dcTrajectory.map(d => `${d.date}: ${d.median?.toFixed(1)}x`), hovertemplate: '%{text}<extra></extra>' },
  ]

  if (hasDaily) {
    const vi = dailyMonths.map((_, i) => i).filter(i => dailyP25[i] != null)
    chart1Traces.push(
      { x: [...vi.map(i => dailyMonths[i]), ...[...vi].reverse().map(i => dailyMonths[i])], y: [...vi.map(i => dailyP75[i]), ...[...vi].reverse().map(i => dailyP25[i])], fill: 'toself', fillcolor: 'rgba(184,134,11,0.10)', line: { width: 0 }, showlegend: false, hoverinfo: 'skip', type: 'scatter' },
    )
    const step = 7
    const si = vi.filter((_, i) => i % step === 0 || i === vi.length - 1)
    chart1Traces.push(
      { x: si.map(i => dailyMonths[i]), y: si.map(i => dailyMedian[i]), name: 'Crypto Median P/S (daily)', line: { color: ERA_COLORS.crypto, width: 2.5 }, mode: 'lines', type: 'scatter', text: si.map(i => `${relevantDates[i]}: ${dailyMedian[i]?.toFixed(1)}x`), hovertemplate: '%{text}<extra></extra>' },
    )
  }

  const lastMonth = hasDaily ? dailyMonths[dailyMonths.length - 1] : 51
  const lastPS = hasDaily ? dailyMedian.filter(Boolean).pop() : crMedianCurrent

  const chart1Layout = {
    ...defaultLayout,
    xaxis: { ...defaultLayout.xaxis, title: 'Months from Bubble Peak', zeroline: true, zerolinewidth: 2, zerolinecolor: '#C1352D' },
    yaxis: { ...defaultLayout.yaxis, title: 'Median P/S Ratio', type: 'log' },
    annotations: [
      { x: lastMonth, y: Math.log10(lastPS || 10), text: '\u2190 YOU ARE HERE', showarrow: true, arrowhead: 2, arrowcolor: ERA_COLORS.crypto, font: { size: 11, color: ERA_COLORS.crypto, family: 'Consolas, monospace' }, ax: 50, ay: -30 },
      { x: 0, y: Math.log10(dcTrajectory[1]?.median || 1), text: 'PEAK', showarrow: false, font: { size: 10, color: '#C1352D', family: 'Consolas, monospace' }, yshift: 15 },
    ],
    shapes: [{ type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', line: { color: '#C1352D', width: 1, dash: 'dot' } }],
  }

  // ════════════════════════════════════════════════════════════
  // NEW: Spaghetti Chart
  // ════════════════════════════════════════════════════════════
  const spaghettiTraces = []
  Object.keys(dailyPSMap).forEach((slug, idx) => {
    const series = dailyPSMap[slug]
    const step = 7
    const sampled = series.filter((_, i) => i % step === 0 || i === series.length - 1)
    spaghettiTraces.push({ x: sampled.map(d => d.monthsFromPeak), y: sampled.map(d => d.ps), name: slug, mode: 'lines', type: 'scatter', line: { color: SPAGHETTI_COLORS[idx % SPAGHETTI_COLORS.length], width: 1.2 }, opacity: 0.6, hovertemplate: `${slug}<br>%{x:.0f} months: %{y:.1f}x<extra></extra>` })
  })
  if (hasDaily) {
    const vi = dailyMonths.map((_, i) => i).filter(i => dailyMedian[i] != null)
    const si = vi.filter((_, i) => i % 7 === 0 || i === vi.length - 1)
    spaghettiTraces.push({ x: si.map(i => dailyMonths[i]), y: si.map(i => dailyMedian[i]), name: 'MEDIAN', mode: 'lines', type: 'scatter', line: { color: '#1A1A1A', width: 3.5 }, hovertemplate: 'Median: %{y:.1f}x<extra></extra>' })
  }
  const spaghettiLayout = { ...defaultLayout, xaxis: { ...defaultLayout.xaxis, title: 'Months from Crypto Peak (Nov 2021)' }, yaxis: { ...defaultLayout.yaxis, title: 'P/S Ratio', type: 'log' }, showlegend: true, legend: { ...defaultLayout.legend, font: { size: 9 } }, shapes: [{ type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', line: { color: '#C1352D', width: 1, dash: 'dot' } }] }

  // ════════════════════════════════════════════════════════════
  // NEW: Decomposition Chart
  // ════════════════════════════════════════════════════════════
  const decompTraces = [
    { y: decomposition.map(d => d.name), x: decomposition.map(d => d.mcapChange), name: 'Market Cap Change %', type: 'bar', orientation: 'h', marker: { color: decomposition.map(d => d.mcapChange >= 0 ? '#2E7D4F' : '#C1352D') }, text: decomposition.map(d => `${d.mcapChange >= 0 ? '+' : ''}${d.mcapChange.toFixed(0)}%`), textposition: 'outside', textfont: { size: 9 }, hovertemplate: '%{y}: Mcap %{x:.0f}%<extra></extra>' },
    { y: decomposition.map(d => d.name), x: decomposition.map(d => d.feeChange), name: 'Fee Revenue Change %', type: 'bar', orientation: 'h', marker: { color: decomposition.map(d => d.feeChange >= 0 ? '#B8860B' : '#6B5B8D') }, text: decomposition.map(d => `${d.feeChange >= 0 ? '+' : ''}${d.feeChange.toFixed(0)}%`), textposition: 'outside', textfont: { size: 9 }, hovertemplate: '%{y}: Fees %{x:.0f}%<extra></extra>' },
  ]
  const decompLayout = { ...defaultLayout, barmode: 'group', margin: { ...defaultLayout.margin, l: 120 }, yaxis: { ...defaultLayout.yaxis, autorange: 'reversed' }, xaxis: { ...defaultLayout.xaxis, title: 'Change from Peak (%)', zeroline: true, zerolinewidth: 2, zerolinecolor: '#1A1A1A' } }

  // ════════════════════════════════════════════════════════════
  // NEW: Froth Indicator
  // ════════════════════════════════════════════════════════════
  const frothColors = { 50: '#B8860B', 100: '#C1352D', 200: '#6B5B8D' }
  const frothTraces = [50, 100, 200].map(t => {
    const vals = frothData[t]; const step = 7
    const vi = vals.map((_, i) => i).filter(i => vals[i] != null)
    const si = vi.filter((_, i) => i % step === 0 || i === vi.length - 1)
    return { x: si.map(i => relevantDates[i]), y: si.map(i => vals[i]), name: `> ${t}x P/S`, mode: 'lines', type: 'scatter', line: { color: frothColors[t], width: 2 }, fill: t === 50 ? 'tozeroy' : undefined, fillcolor: t === 50 ? 'rgba(184,134,11,0.08)' : undefined, hovertemplate: `%{x}: %{y:.0f}% > ${t}x<extra></extra>` }
  })
  const frothLayout = { ...defaultLayout, yaxis: { ...defaultLayout.yaxis, title: '% of Protocols Above Threshold', range: [0, 105] }, xaxis: { ...defaultLayout.xaxis, title: '' }, annotations: KEY_EVENTS.crypto.filter(e => e.offset >= 0).map(e => ({ x: e.date, y: 100, text: e.label.split(' ').slice(0, 3).join(' '), showarrow: true, arrowhead: 0, ax: 0, ay: -30, font: { size: 8, color: '#999' } })) }

  // ════════════════════════════════════════════════════════════
  // Chart 2: Violin plots
  // ════════════════════════════════════════════════════════════
  const stages = [{ label: 'Peak', dc: '2000-Q1', cr: '2021-Q4' }, { label: 'Trough', dc: '2002-Q1', cr: '2022-Q4' }, { label: 'Recovery', dc: '2004-Q1', cr: '2024-Q4' }, { label: 'Now', dc: null, cr: '2026-Q1' }]
  const chart2Traces = []
  stages.forEach(stage => {
    if (stage.dc) chart2Traces.push({ y: dcByDate[stage.dc] || [], type: 'violin', name: `DC ${stage.label}`, x0: stage.label, side: 'negative', line: { color: ERA_COLORS.dotcom }, meanline: { visible: true }, points: 'outliers', scalemode: 'width', width: 0.9 })
    if (stage.cr) chart2Traces.push({ y: crByDate[stage.cr] || [], type: 'violin', name: `Crypto ${stage.label}`, x0: stage.label, side: 'positive', line: { color: ERA_COLORS.crypto }, meanline: { visible: true }, points: 'outliers', scalemode: 'width', width: 0.9 })
  })
  const chart2Layout = { ...defaultLayout, violinmode: 'overlay', yaxis: { ...defaultLayout.yaxis, title: 'P/S Ratio', type: 'log' } }

  // ════════════════════════════════════════════════════════════
  // Remaining charts (ranking, heatmap, compression, survival, rhyming)
  // ════════════════════════════════════════════════════════════
  const top25dc = dcPeakPS.slice(0, 25), top25cr = crPeakPS.slice(0, 25)
  const chart3aTraces = [{ y: top25dc.map(c => c.name), x: top25dc.map(c => c.ps), type: 'bar', orientation: 'h', marker: { color: top25dc.map(c => SURV_COLORS[c.survived]) }, text: top25dc.map(c => `${c.ps.toFixed(0)}x ${c.survived ? '\u2713' : '\u2717'}`), textposition: 'outside', hovertemplate: '%{y}: %{x:.1f}x P/S<extra></extra>' }]
  const chart3bTraces = [{ y: top25cr.map(c => c.name), x: top25cr.map(c => c.ps), type: 'bar', orientation: 'h', marker: { color: top25cr.map(c => SURV_COLORS[c.survived]) }, text: top25cr.map(c => `${c.ps.toFixed(0)}x ${c.survived ? '\u2713' : '\u2717'}`), textposition: 'outside', hovertemplate: '%{y}: %{x:.1f}x P/S<extra></extra>' }]
  const chart3Layout = (title) => ({ ...defaultLayout, xaxis: { ...defaultLayout.xaxis, title: 'P/S at Peak', type: 'log' }, yaxis: { ...defaultLayout.yaxis, autorange: 'reversed' }, margin: { ...defaultLayout.margin, l: 140 }, title: { text: title, font: { size: 14, family: 'Georgia, serif' } } })
  const chart3CSV = { filename: 'dotcom_vs_crypto_peak_ps', headers: ['Era', 'Name', 'Peak P/S', 'Sector', 'Survived'], rows: [...dcPeakPS.map(c => ['Dot-Com', c.name, c.ps?.toFixed(1), c.sector, c.survived ? 'Yes' : 'No']), ...crPeakPS.map(c => ['Crypto', c.name, c.ps?.toFixed(1), c.sector, c.survived ? 'Yes' : 'No'])] }

  const dcSectorZ = sectors.map(sec => SNAPSHOT_DATES_DC.map(d => sectorGrid.dotcom[sec][d] ?? 0))
  const crSectorZ = sectors.map(sec => SNAPSHOT_DATES_CR.map(d => sectorGrid.crypto[sec][d] ?? 0))
  const chart4aTraces = [{ z: dcSectorZ, x: SNAPSHOT_DATES_DC, y: sectors.map(s => SECTOR_MAP[s].dotcom), type: 'heatmap', colorscale: [[0, '#FFFFFF'], [0.5, '#7FB3D8'], [1, '#1A3A5C']], text: dcSectorZ.map(r => r.map(v => v ? `${v.toFixed(1)}x` : '\u2014')), hovertemplate: '%{y}<br>%{x}: %{text}<extra></extra>', showscale: false }]
  const chart4bTraces = [{ z: crSectorZ, x: SNAPSHOT_DATES_CR, y: sectors.map(s => SECTOR_MAP[s].crypto), type: 'heatmap', colorscale: [[0, '#FFFFFF'], [0.5, '#E8C547'], [1, '#8B6914']], text: crSectorZ.map(r => r.map(v => v ? `${v.toFixed(1)}x` : '\u2014')), hovertemplate: '%{y}<br>%{x}: %{text}<extra></extra>', showscale: false }]
  const chart4Layout = (title) => ({ ...defaultLayout, margin: { ...defaultLayout.margin, l: 180 }, title: { text: title, font: { size: 14, family: 'Georgia, serif' } } })

  const maxPS = Math.max(...dcCompression.map(c => c.peakPS), ...crCompression.map(c => c.peakPS), 100)
  const chart5Traces = [
    { x: dcCompression.map(c => c.peakPS), y: dcCompression.map(c => c.troughPS), text: dcCompression.map(c => `${c.name}\n${c.peakPS.toFixed(0)}x \u2192 ${c.troughPS.toFixed(0)}x`), name: 'Dot-Com', mode: 'markers', type: 'scatter', marker: { color: ERA_COLORS.dotcom, size: dcCompression.map(c => Math.max(6, Math.sqrt(c.mcap || 1) * 1.5)), opacity: 0.7, line: { width: 1, color: '#fff' } }, hovertemplate: '%{text}<extra></extra>' },
    { x: crCompression.map(c => c.peakPS), y: crCompression.map(c => c.troughPS), text: crCompression.map(c => `${c.name}\n${c.peakPS.toFixed(0)}x \u2192 ${c.troughPS.toFixed(0)}x`), name: 'Crypto', mode: 'markers', type: 'scatter', marker: { color: ERA_COLORS.crypto, size: crCompression.map(c => Math.max(6, Math.sqrt((c.mcap || 0.1) * 10) * 1.5)), opacity: 0.7, symbol: 'diamond', line: { width: 1, color: '#fff' } }, hovertemplate: '%{text}<extra></extra>' },
  ]
  const chart5Layout = { ...defaultLayout, xaxis: { ...defaultLayout.xaxis, title: 'P/S at Peak', type: 'log' }, yaxis: { ...defaultLayout.yaxis, title: 'P/S at Trough / Current', type: 'log' }, shapes: [{ type: 'line', x0: 0.1, x1: maxPS, y0: 0.1, y1: maxPS, line: { color: '#E5E3E0', width: 1, dash: 'dot' } }] }

  const chart6Traces = [
    { x: dcSurvival.map(q => q.label), y: dcSurvival.map(q => q.survivalRate), name: 'Dot-Com', type: 'bar', marker: { color: ERA_COLORS.dotcom }, text: dcSurvival.map(q => `${q.survivalRate.toFixed(0)}%`), textposition: 'outside' },
    { x: crSurvival.map(q => q.label), y: crSurvival.map(q => q.survivalRate), name: 'Crypto', type: 'bar', marker: { color: ERA_COLORS.crypto }, text: crSurvival.map(q => `${q.survivalRate.toFixed(0)}%`), textposition: 'outside' },
  ]
  const chart6Layout = { ...defaultLayout, barmode: 'group', yaxis: { ...defaultLayout.yaxis, title: 'Survival Rate (%)', range: [0, 110] }, xaxis: { ...defaultLayout.xaxis, title: 'P/S Quintile at Peak' } }

  // Rhyming table
  const pairData = ANALOG_PAIRS.map(pair => {
    const dc = DOTCOM_DATA.find(c => c.ticker === pair.dotcom)
    const cr = cryptoEnriched.find(c => c.slug === pair.crypto)
    return { dcName: dc?.name || pair.dotcom, crName: cr?.name || pair.crypto, dcPeak: dc?.snapshots.find(s => s.date === '2000-Q1')?.ps, dcTrough: dc?.snapshots.find(s => s.date === '2002-Q1')?.ps, crPeak: cr?.snapshots.find(s => s.date === '2021-Q4')?.ps, crNow: cr?.snapshots.find(s => s.date === '2026-Q1')?.ps || cr?.snapshots.find(s => s.date === '2024-Q4')?.ps, dcSurvived: dc?.survived, crSurvived: cr?.survived, thesis: pair.thesis }
  })

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <NarrativeBox title="Research Study">
        <p className="font-serif text-base"><strong>Does history rhyme?</strong> This study compares Price-to-Sales ratios of top tech companies during the dot-com bubble (1999-2004) with top crypto protocols (2021-2026). P/S is the only valuation metric that works across both eras.</p>
        <p className="text-xs font-mono mt-2" style={{ color: '#999' }}>{DOTCOM_DATA.length} dot-com companies (static) &middot; {Object.keys(dailyPSMap).length} crypto protocols (daily P/S) &middot; Peak alignment: NASDAQ {PEAKS.dotcom} &harr; Crypto {PEAKS.crypto}</p>
      </NarrativeBox>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title="DC Median P/S Peak" value={dcMedianPeak ? `${dcMedianPeak.toFixed(1)}x` : '\u2014'} subtitle="Q1 2000" />
        <KPICard title="Crypto Median P/S Peak" value={crMedianPeak ? `${crMedianPeak.toFixed(1)}x` : '\u2014'} subtitle="Q4 2021" />
        <KPICard title="DC Median P/S Trough" value={dcMedianTrough ? `${dcMedianTrough.toFixed(1)}x` : '\u2014'} subtitle="Q1 2002" />
        <KPICard title="Crypto Median P/S Now" value={crMedianCurrent ? `${crMedianCurrent.toFixed(1)}x` : '\u2014'} subtitle="Q1 2026 (live)" />
        <KPICard title="DC Survival" value={`${dcSurvivedPct.toFixed(0)}%`} subtitle={`${DOTCOM_DATA.filter(c => c.survived).length}/${DOTCOM_DATA.length}`} />
        <KPICard title="Crypto Survival" value={`${crSurvivedPct.toFixed(0)}%`} subtitle={`${cryptoEnriched.filter(c => c.survived).length}/${cryptoEnriched.length}`} />
      </div>

      <ChartCard title="The Bubble Overlay \u2014 Median P/S Trajectory" subtitle={hasDaily ? 'Crypto: smooth daily P/S from DeFiLlama fees + CoinGecko market cap. Dot-com: quarterly.' : 'Quarterly snapshots.'}>
        <Plot data={chart1Traces} layout={chart1Layout} config={defaultConfig} className="w-full" style={{ height: 480 }} />
      </ChartCard>

      <NarrativeBox title="Editorial Note">
        <p>The dot-com median P/S compressed from ~{dcMedianPeak?.toFixed(0)}x to ~{dcMedianTrough?.toFixed(0)}x ({dcMedianPeak && dcMedianTrough ? ((1 - dcMedianTrough / dcMedianPeak) * 100).toFixed(0) : '?'}% compression). Crypto stands at ~{crMedianCurrent?.toFixed(0)}x today.{hasDaily && ' The daily series reveals P/S volatility far higher than quarterly data suggests.'}</p>
      </NarrativeBox>

      {hasDaily && (
        <ChartCard title="Individual P/S Journeys" subtitle="Each protocol's daily P/S (thin lines). Bold black = median. Shows who compressed via revenue growth vs. price collapse.">
          <Plot data={spaghettiTraces} layout={spaghettiLayout} config={defaultConfig} className="w-full" style={{ height: 500 }} />
        </ChartCard>
      )}

      {decomposition.length > 0 && (
        <>
          <ChartCard title="P/S Compression Decomposition" subtitle="Why did P/S change? Market cap shift (green/red) vs fee revenue shift (gold/purple).">
            <Plot data={decompTraces} layout={decompLayout} config={defaultConfig} className="w-full" style={{ height: Math.max(400, decomposition.length * 28) }} />
          </ChartCard>
          <NarrativeBox title="Decomposition Insight">
            <p>Healthy P/S compression comes from <strong>revenue growth</strong> (gold bars right) not price collapse (red bars left). Protocols where fees outgrew market cap decline achieved genuine valuation normalization.</p>
          </NarrativeBox>
        </>
      )}

      {hasDaily && (
        <ChartCard title="Froth Indicator \u2014 % Above P/S Thresholds" subtitle="When >80% of protocols trade above 100x P/S, it's a bubble. Key events annotated.">
          <Plot data={frothTraces} layout={frothLayout} config={defaultConfig} className="w-full" style={{ height: 400 }} />
        </ChartCard>
      )}

      <ChartCard title="P/S Distribution at Key Moments" subtitle="Violin plots: left (blue) = dot-com, right (gold) = crypto. Shows full distribution shape.">
        <Plot data={chart2Traces} layout={chart2Layout} config={defaultConfig} className="w-full" style={{ height: 440 }} />
      </ChartCard>

      <ChartCard title="Peak P/S Rankings" subtitle="Top 25 by P/S at bubble peak. Green = survived, Red = failed." csvData={chart3CSV}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Plot data={chart3aTraces} layout={chart3Layout('Dot-Com (Q1 2000)')} config={defaultConfig} className="w-full" style={{ height: 600 }} />
          <Plot data={chart3bTraces} layout={chart3Layout('Crypto (Q4 2021)')} config={defaultConfig} className="w-full" style={{ height: 600 }} />
        </div>
      </ChartCard>

      <ChartCard title="Sector-Level P/S Evolution" subtitle="Median P/S by sector. Darker = higher valuation.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Plot data={chart4aTraces} layout={chart4Layout('Dot-Com Sectors')} config={defaultConfig} className="w-full" style={{ height: 320 }} />
          <Plot data={chart4bTraces} layout={chart4Layout('Crypto Sectors')} config={defaultConfig} className="w-full" style={{ height: 320 }} />
        </div>
      </ChartCard>

      <ChartCard title="P/S Compression \u2014 Peak vs. Trough" subtitle="Below diagonal = compressed. Bubble size \u221d peak market cap.">
        <Plot data={chart5Traces} layout={chart5Layout} config={defaultConfig} className="w-full" style={{ height: 480 }} />
      </ChartCard>

      <ChartCard title="The Graveyard \u2014 Survival by P/S Quintile" subtitle="Does high P/S at peak predict death?">
        <Plot data={chart6Traces} layout={chart6Layout} config={defaultConfig} className="w-full" style={{ height: 400 }} />
      </ChartCard>

      <ChartCard title={`"History Doesn't Repeat, But It Rhymes"`} subtitle="Dot-com \u2194 crypto analog pairs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono border-collapse">
            <thead><tr className="border-b-2 border-(--color-ink)">
              <th className="text-left py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Dot-Com</th>
              <th className="text-right py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Peak</th>
              <th className="text-right py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Trough</th>
              <th className="text-center py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">&harr;</th>
              <th className="text-left py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Crypto</th>
              <th className="text-right py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Peak</th>
              <th className="text-right py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Now</th>
            </tr></thead>
            <tbody>
              {pairData.map((p, i) => (
                <tr key={i} className="border-b border-(--color-rule) hover:bg-(--color-paper-warm)">
                  <td className="py-2.5 px-3"><span style={{ color: p.dcSurvived ? '#2E7D4F' : '#C1352D' }}>{p.dcSurvived ? '\u25CF' : '\u2717'}</span> <span className="font-semibold">{p.dcName}</span></td>
                  <td className="text-right py-2.5 px-3">{p.dcPeak != null ? `${p.dcPeak.toFixed(0)}x` : '\u2014'}</td>
                  <td className="text-right py-2.5 px-3">{p.dcTrough != null ? `${p.dcTrough.toFixed(0)}x` : '\u2014'}</td>
                  <td className="text-center py-2.5 px-3 text-(--color-ink-muted)">&harr;</td>
                  <td className="py-2.5 px-3"><span style={{ color: p.crSurvived ? '#2E7D4F' : '#C1352D' }}>{p.crSurvived ? '\u25CF' : '\u2717'}</span> <span className="font-semibold">{p.crName}</span></td>
                  <td className="text-right py-2.5 px-3">{p.crPeak != null ? `${p.crPeak.toFixed(0)}x` : '\u2014'}</td>
                  <td className="text-right py-2.5 px-3">{p.crNow != null ? `${p.crNow.toFixed(0)}x` : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 space-y-3">
            {pairData.map((p, i) => (
              <div key={i} className="flex gap-3 text-xs text-(--color-ink-light) leading-relaxed">
                <span className="shrink-0 font-semibold text-(--color-ink)" style={{ minWidth: '140px' }}>{p.dcName} &harr; {p.crName}</span>
                <span>{p.thesis}</span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      <NarrativeBox title="Data Sources">
        <p><strong>Dot-com:</strong> SEC 10-K filings, Damodaran (NYU), CFA Institute. Quarterly snapshots.</p>
        <p><strong>Crypto:</strong> Daily P/S from DeFiLlama per-protocol fee history (30d rolling avg &times; 365) &divide; CoinGecko daily market cap. {Object.keys(dailyPSMap).length} protocols with daily series.</p>
      </NarrativeBox>
    </div>
  )
}

function computeSurvival(data, peakDate) {
  const withPS = data.map(c => ({ ...c, peakPS: c.snapshots.find(s => s.date === peakDate)?.ps })).filter(c => c.peakPS != null && c.peakPS < 5000).sort((a, b) => a.peakPS - b.peakPS)
  if (!withPS.length) return []
  const qs = Math.ceil(withPS.length / 5)
  const result = []
  for (let i = 0; i < 5; i++) {
    const sl = withPS.slice(i * qs, (i + 1) * qs)
    if (!sl.length) continue
    result.push({ label: `Q${i + 1} (${sl[0].peakPS.toFixed(0)}\u2013${sl[sl.length - 1].peakPS.toFixed(0)}x)`, survivalRate: (sl.filter(c => c.survived).length / sl.length) * 100 })
  }
  return result
}
