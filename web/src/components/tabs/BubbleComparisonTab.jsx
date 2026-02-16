import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchFeesOverview, fetchCoinGeckoMarketsAll, fetchAllProtocols } from '../../services/api'
import { formatCurrency, formatMultiple } from '../../utils/helpers'
import {
  DOTCOM_DATA, CRYPTO_SNAPSHOTS, SECTOR_MAP, PEAKS,
  ANALOG_PAIRS, KEY_EVENTS,
} from '../../data/dotcom-ps-data'

// ── helpers ──────────────────────────────────────────────────
const SNAPSHOT_DATES_DC = ['1999-Q1', '2000-Q1', '2001-Q1', '2002-Q1', '2003-Q1', '2004-Q1']
const SNAPSHOT_DATES_CR = ['2021-Q4', '2022-Q4', '2023-Q4', '2024-Q4', '2026-Q1']

// months-from-peak for each snapshot
const DC_OFFSETS = { '1999-Q1': -12, '2000-Q1': 0, '2001-Q1': 12, '2002-Q1': 24, '2003-Q1': 36, '2004-Q1': 48 }
const CR_OFFSETS = { '2021-Q4': 0, '2022-Q4': 13, '2023-Q4': 25, '2024-Q4': 37, '2026-Q1': 51 }

function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function pctl(arr, p) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil(p * s.length) - 1
  return s[Math.max(0, idx)]
}

const ERA_COLORS = { dotcom: '#2E5E8E', crypto: '#B8860B' }
const SURV_COLORS = { true: '#2E7D4F', false: '#C1352D' }

// ── Component ────────────────────────────────────────────────
export default function BubbleComparisonTab() {
  const [liveData, setLiveData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      fetchFeesOverview(),
      fetchCoinGeckoMarketsAll(),
      fetchAllProtocols(),
    ]).then(([fees, markets, protocols]) => {
      setLiveData({
        fees: fees.status === 'fulfilled' ? fees.value : null,
        markets: markets.status === 'fulfilled' ? markets.value : null,
        protocols: protocols.status === 'fulfilled' ? protocols.value : null,
      })
    }).finally(() => setLoading(false))
  }, [])

  // Enrich crypto snapshots with live 2026-Q1 P/S
  const cryptoEnriched = useMemo(() => {
    if (!liveData) return CRYPTO_SNAPSHOTS

    const normName = s => (s || '').toLowerCase().replace(/[-_.\\s]+/g, '').replace(/[^a-z0-9]/g, '')

    const feesProtos = liveData.fees?.protocols || []
    const cgMarkets = Array.isArray(liveData.markets) ? liveData.markets : []
    const llamaProtos = liveData.protocols || []

    // Build lookups
    const feesLookup = {}
    feesProtos.forEach(p => { if (p.slug) feesLookup[p.slug.toLowerCase()] = p })

    const mcapLookup = {}
    cgMarkets.forEach(m => {
      if (m.id) mcapLookup[m.id.toLowerCase()] = m
      if (m.symbol) mcapLookup[m.symbol.toLowerCase()] = m
      if (m.name) mcapLookup[m.name.toLowerCase()] = m
    })

    const llamaLookup = {}
    llamaProtos.forEach(p => {
      if (p.slug) llamaLookup[p.slug.toLowerCase()] = p
      if (p.name) llamaLookup[p.name.toLowerCase()] = p
    })

    return CRYPTO_SNAPSHOTS.map(proto => {
      const slug = proto.slug.toLowerCase()
      const fees = feesLookup[slug]
      const llama = llamaLookup[slug] || llamaLookup[proto.name.toLowerCase()]
      const cg = mcapLookup[slug] || mcapLookup[proto.name.toLowerCase()]
        || mcapLookup[(llama?.gecko_id || '').toLowerCase()]
        || mcapLookup[(llama?.symbol || '').toLowerCase()]

      const mcap = (llama?.mcap || cg?.market_cap || 0) / 1e9 // convert to $B
      const annualizedFees = ((fees?.total24h || 0) * 365) / 1e9

      const liveSnap = {
        date: '2026-Q1',
        mcap,
        annualizedFees,
        ps: mcap > 0 && annualizedFees > 0 ? mcap / annualizedFees : null,
      }

      return {
        ...proto,
        snapshots: [...proto.snapshots, liveSnap],
      }
    })
  }, [liveData])

  // ── Processed data for charts ──────────────────────────────
  const processed = useMemo(() => {
    // Dotcom: get PS arrays per snapshot
    const dcByDate = {}
    SNAPSHOT_DATES_DC.forEach(d => {
      dcByDate[d] = DOTCOM_DATA
        .map(c => c.snapshots.find(s => s.date === d)?.ps)
        .filter(v => v != null && v < 5000)
    })

    // Crypto: get PS arrays per snapshot
    const crByDate = {}
    SNAPSHOT_DATES_CR.forEach(d => {
      crByDate[d] = cryptoEnriched
        .map(c => c.snapshots.find(s => s.date === d)?.ps)
        .filter(v => v != null && v < 5000)
    })

    // Median trajectories
    const dcTrajectory = SNAPSHOT_DATES_DC.map(d => ({
      offset: DC_OFFSETS[d], date: d,
      median: median(dcByDate[d]),
      p25: pctl(dcByDate[d], 0.25),
      p75: pctl(dcByDate[d], 0.75),
    }))

    const crTrajectory = SNAPSHOT_DATES_CR.map(d => ({
      offset: CR_OFFSETS[d], date: d,
      median: median(crByDate[d]),
      p25: pctl(crByDate[d], 0.25),
      p75: pctl(crByDate[d], 0.75),
    }))

    // Peak P/S for ranking chart
    const dcPeakPS = DOTCOM_DATA
      .map(c => {
        const peak = c.snapshots.find(s => s.date === '2000-Q1')
        return { name: c.name, ticker: c.ticker, ps: peak?.ps, survived: c.survived, sector: c.sector }
      })
      .filter(c => c.ps != null && c.ps < 5000)
      .sort((a, b) => b.ps - a.ps)

    const crPeakPS = cryptoEnriched
      .map(c => {
        const peak = c.snapshots.find(s => s.date === '2021-Q4')
        return { name: c.name, slug: c.slug, ps: peak?.ps, survived: c.survived, sector: c.sector }
      })
      .filter(c => c.ps != null && c.ps < 5000)
      .sort((a, b) => b.ps - a.ps)

    // Sector medians
    const sectors = Object.keys(SECTOR_MAP)
    const sectorGrid = { dotcom: {}, crypto: {} }
    sectors.forEach(sec => {
      sectorGrid.dotcom[sec] = {}
      sectorGrid.crypto[sec] = {}
      SNAPSHOT_DATES_DC.forEach(d => {
        const vals = DOTCOM_DATA.filter(c => c.sector === sec)
          .map(c => c.snapshots.find(s => s.date === d)?.ps)
          .filter(v => v != null && v < 5000)
        sectorGrid.dotcom[sec][d] = median(vals)
      })
      SNAPSHOT_DATES_CR.forEach(d => {
        const vals = cryptoEnriched.filter(c => c.sector === sec)
          .map(c => c.snapshots.find(s => s.date === d)?.ps)
          .filter(v => v != null && v < 5000)
        sectorGrid.crypto[sec][d] = median(vals)
      })
    })

    // Compression: peak vs trough/current
    const dcCompression = DOTCOM_DATA.map(c => {
      const peak = c.snapshots.find(s => s.date === '2000-Q1')?.ps
      const trough = c.snapshots.find(s => s.date === '2002-Q1')?.ps
      return { name: c.name, peakPS: peak, troughPS: trough, survived: c.survived, sector: c.sector, mcap: c.peakMcap }
    }).filter(c => c.peakPS && c.troughPS)

    const crCompression = cryptoEnriched.map(c => {
      const peak = c.snapshots.find(s => s.date === '2021-Q4')?.ps
      const current = c.snapshots.find(s => s.date === '2024-Q4')?.ps
        || c.snapshots.find(s => s.date === '2026-Q1')?.ps
      const peakMcap = c.snapshots.find(s => s.date === '2021-Q4')?.mcap
      return { name: c.name, peakPS: peak, troughPS: current, survived: c.survived, sector: c.sector, mcap: peakMcap }
    }).filter(c => c.peakPS && c.troughPS)

    // Survival by P/S quintile
    const dcSurvival = computeSurvival(DOTCOM_DATA, '2000-Q1')
    const crSurvival = computeSurvival(cryptoEnriched, '2021-Q4')

    // KPIs
    const dcMedianPeak = median(dcByDate['2000-Q1'])
    const crMedianPeak = median(crByDate['2021-Q4'])
    const dcMedianTrough = median(dcByDate['2002-Q1'])
    const crMedianCurrent = median(crByDate['2026-Q1'] || crByDate['2024-Q4'])
    const dcSurvivedPct = (DOTCOM_DATA.filter(c => c.survived).length / DOTCOM_DATA.length * 100)
    const crSurvivedPct = (cryptoEnriched.filter(c => c.survived).length / cryptoEnriched.length * 100)

    return {
      dcTrajectory, crTrajectory,
      dcByDate, crByDate,
      dcPeakPS, crPeakPS,
      sectorGrid, sectors,
      dcCompression, crCompression,
      dcSurvival, crSurvival,
      dcMedianPeak, crMedianPeak,
      dcMedianTrough, crMedianCurrent,
      dcSurvivedPct, crSurvivedPct,
    }
  }, [cryptoEnriched])

  if (loading) return <LoadingSpinner message="Loading bubble comparison data..." />

  const {
    dcTrajectory, crTrajectory,
    dcByDate, crByDate,
    dcPeakPS, crPeakPS,
    sectorGrid, sectors,
    dcCompression, crCompression,
    dcSurvival, crSurvival,
    dcMedianPeak, crMedianPeak,
    dcMedianTrough, crMedianCurrent,
    dcSurvivedPct, crSurvivedPct,
  } = processed

  // ── CHART 1: The Bubble Overlay ────────────────────────────
  const chart1Traces = [
    // dotcom band
    {
      x: [...dcTrajectory.map(d => d.offset), ...dcTrajectory.slice().reverse().map(d => d.offset)],
      y: [...dcTrajectory.map(d => d.p75), ...dcTrajectory.slice().reverse().map(d => d.p25)],
      fill: 'toself', fillcolor: 'rgba(46,94,142,0.12)', line: { width: 0 },
      showlegend: false, hoverinfo: 'skip', type: 'scatter',
    },
    // dotcom median
    {
      x: dcTrajectory.map(d => d.offset),
      y: dcTrajectory.map(d => d.median),
      name: 'Dot-Com Median P/S',
      line: { color: ERA_COLORS.dotcom, width: 3 },
      mode: 'lines+markers', type: 'scatter',
      text: dcTrajectory.map(d => `${d.date}: ${d.median?.toFixed(1)}x`),
      hovertemplate: '%{text}<extra></extra>',
    },
    // crypto band
    {
      x: [...crTrajectory.map(d => d.offset), ...crTrajectory.slice().reverse().map(d => d.offset)],
      y: [...crTrajectory.map(d => d.p75), ...crTrajectory.slice().reverse().map(d => d.p25)],
      fill: 'toself', fillcolor: 'rgba(184,134,11,0.12)', line: { width: 0 },
      showlegend: false, hoverinfo: 'skip', type: 'scatter',
    },
    // crypto median
    {
      x: crTrajectory.map(d => d.offset),
      y: crTrajectory.map(d => d.median),
      name: 'Crypto Median P/S',
      line: { color: ERA_COLORS.crypto, width: 3, dash: 'dash' },
      mode: 'lines+markers', type: 'scatter',
      text: crTrajectory.map(d => `${d.date}: ${d.median?.toFixed(1)}x`),
      hovertemplate: '%{text}<extra></extra>',
    },
  ]

  const chart1Layout = {
    ...defaultLayout,
    xaxis: { ...defaultLayout.xaxis, title: 'Months from Bubble Peak', zeroline: true, zerolinewidth: 2, zerolinecolor: '#C1352D' },
    yaxis: { ...defaultLayout.yaxis, title: 'Median P/S Ratio', type: 'log' },
    annotations: [
      {
        x: crTrajectory[crTrajectory.length - 1]?.offset,
        y: Math.log10(crTrajectory[crTrajectory.length - 1]?.median || 1),
        text: '← YOU ARE HERE',
        showarrow: true, arrowhead: 2, arrowcolor: ERA_COLORS.crypto,
        font: { size: 11, color: ERA_COLORS.crypto, family: 'Consolas, monospace' },
        ax: 50, ay: -30,
      },
      {
        x: 0, y: Math.log10(dcTrajectory[1]?.median || 1),
        text: 'PEAK',
        showarrow: false,
        font: { size: 10, color: '#C1352D', family: 'Consolas, monospace' },
        yshift: 15,
      },
    ],
    shapes: [
      { type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', line: { color: '#C1352D', width: 1, dash: 'dot' } },
    ],
  }

  // ── CHART 2: P/S Distribution Box Plots ────────────────────
  const stages = [
    { label: 'Peak', dc: '2000-Q1', cr: '2021-Q4' },
    { label: 'Trough', dc: '2002-Q1', cr: '2022-Q4' },
    { label: 'Recovery', dc: '2004-Q1', cr: '2024-Q4' },
    { label: 'Now', dc: null, cr: '2026-Q1' },
  ]

  const chart2Traces = []
  stages.forEach((stage, i) => {
    if (stage.dc) {
      chart2Traces.push({
        y: dcByDate[stage.dc] || [],
        name: `Dot-Com ${stage.label}`,
        type: 'box',
        marker: { color: ERA_COLORS.dotcom },
        boxpoints: 'outliers',
        x: Array((dcByDate[stage.dc] || []).length).fill(`${stage.label}`),
        offsetgroup: 'dc',
      })
    }
    if (stage.cr) {
      chart2Traces.push({
        y: crByDate[stage.cr] || [],
        name: `Crypto ${stage.label}`,
        type: 'box',
        marker: { color: ERA_COLORS.crypto },
        boxpoints: 'outliers',
        x: Array((crByDate[stage.cr] || []).length).fill(`${stage.label}`),
        offsetgroup: 'cr',
      })
    }
  })

  const chart2Layout = {
    ...defaultLayout,
    boxmode: 'group',
    yaxis: { ...defaultLayout.yaxis, title: 'P/S Ratio', type: 'log' },
  }

  // ── CHART 3: Top 50 P/S Ranking ───────────────────────────
  const top25dc = dcPeakPS.slice(0, 25)
  const top25cr = crPeakPS.slice(0, 25)

  const chart3aTraces = [{
    y: top25dc.map(c => c.name),
    x: top25dc.map(c => c.ps),
    type: 'bar',
    orientation: 'h',
    marker: { color: top25dc.map(c => SURV_COLORS[c.survived]) },
    text: top25dc.map(c => `${c.ps.toFixed(0)}x ${c.survived ? '✓' : '✗'}`),
    textposition: 'outside',
    hovertemplate: '%{y}: %{x:.1f}x P/S<extra></extra>',
  }]

  const chart3bTraces = [{
    y: top25cr.map(c => c.name),
    x: top25cr.map(c => c.ps),
    type: 'bar',
    orientation: 'h',
    marker: { color: top25cr.map(c => SURV_COLORS[c.survived]) },
    text: top25cr.map(c => `${c.ps.toFixed(0)}x ${c.survived ? '✓' : '✗'}`),
    textposition: 'outside',
    hovertemplate: '%{y}: %{x:.1f}x P/S<extra></extra>',
  }]

  const chart3Layout = (title) => ({
    ...defaultLayout,
    xaxis: { ...defaultLayout.xaxis, title: 'P/S Ratio at Peak', type: 'log' },
    yaxis: { ...defaultLayout.yaxis, autorange: 'reversed' },
    margin: { ...defaultLayout.margin, l: 140 },
    title: { text: title, font: { size: 14, family: 'Georgia, serif' } },
  })

  // ── CHART 4: Sector Heatmap ────────────────────────────────
  // Build z-values, x-labels, y-labels for two heatmaps
  const dcSectorZ = sectors.map(sec =>
    SNAPSHOT_DATES_DC.map(d => sectorGrid.dotcom[sec][d] ?? 0)
  )
  const crSectorZ = sectors.map(sec =>
    SNAPSHOT_DATES_CR.map(d => sectorGrid.crypto[sec][d] ?? 0)
  )

  const chart4aTraces = [{
    z: dcSectorZ,
    x: SNAPSHOT_DATES_DC,
    y: sectors.map(s => SECTOR_MAP[s].dotcom),
    type: 'heatmap',
    colorscale: [[0, '#FFFFFF'], [0.5, '#7FB3D8'], [1, '#1A3A5C']],
    text: dcSectorZ.map(row => row.map(v => v ? `${v.toFixed(1)}x` : '—')),
    hovertemplate: '%{y}<br>%{x}: %{text}<extra></extra>',
    showscale: false,
  }]

  const chart4bTraces = [{
    z: crSectorZ,
    x: SNAPSHOT_DATES_CR,
    y: sectors.map(s => SECTOR_MAP[s].crypto),
    type: 'heatmap',
    colorscale: [[0, '#FFFFFF'], [0.5, '#E8C547'], [1, '#8B6914']],
    text: crSectorZ.map(row => row.map(v => v ? `${v.toFixed(1)}x` : '—')),
    hovertemplate: '%{y}<br>%{x}: %{text}<extra></extra>',
    showscale: false,
  }]

  const chart4Layout = (title) => ({
    ...defaultLayout,
    margin: { ...defaultLayout.margin, l: 180 },
    title: { text: title, font: { size: 14, family: 'Georgia, serif' } },
  })

  // ── CHART 5: Compression Scatter ──────────────────────────
  const chart5Traces = [
    {
      x: dcCompression.map(c => c.peakPS),
      y: dcCompression.map(c => c.troughPS),
      text: dcCompression.map(c => `${c.name}\nPeak: ${c.peakPS.toFixed(0)}x → ${c.troughPS.toFixed(0)}x`),
      name: 'Dot-Com',
      mode: 'markers', type: 'scatter',
      marker: {
        color: ERA_COLORS.dotcom, size: dcCompression.map(c => Math.max(6, Math.sqrt(c.mcap || 1) * 1.5)),
        opacity: 0.7, line: { width: 1, color: '#fff' },
      },
      hovertemplate: '%{text}<extra></extra>',
    },
    {
      x: crCompression.map(c => c.peakPS),
      y: crCompression.map(c => c.troughPS),
      text: crCompression.map(c => `${c.name}\nPeak: ${c.peakPS.toFixed(0)}x → ${c.troughPS.toFixed(0)}x`),
      name: 'Crypto',
      mode: 'markers', type: 'scatter',
      marker: {
        color: ERA_COLORS.crypto, size: crCompression.map(c => Math.max(6, Math.sqrt((c.mcap || 0.1) * 10) * 1.5)),
        opacity: 0.7, symbol: 'diamond', line: { width: 1, color: '#fff' },
      },
      hovertemplate: '%{text}<extra></extra>',
    },
  ]

  // Diagonal "no change" line
  const maxPS = Math.max(
    ...dcCompression.map(c => c.peakPS), ...crCompression.map(c => c.peakPS), 100
  )
  const chart5Layout = {
    ...defaultLayout,
    xaxis: { ...defaultLayout.xaxis, title: 'P/S at Peak', type: 'log' },
    yaxis: { ...defaultLayout.yaxis, title: 'P/S at Trough / Current', type: 'log' },
    shapes: [{
      type: 'line', x0: 0.1, x1: maxPS, y0: 0.1, y1: maxPS,
      line: { color: '#E5E3E0', width: 1, dash: 'dot' },
    }],
    annotations: [{
      x: Math.log10(100), y: Math.log10(100),
      text: 'No change ↗', showarrow: false,
      font: { size: 10, color: '#999', family: 'Consolas, monospace' },
      xshift: -40, yshift: 10,
    }],
  }

  // ── CHART 6: Survival Analysis ────────────────────────────
  const chart6Traces = [
    {
      x: dcSurvival.map(q => q.label),
      y: dcSurvival.map(q => q.survivalRate),
      name: 'Dot-Com',
      type: 'bar',
      marker: { color: ERA_COLORS.dotcom },
      text: dcSurvival.map(q => `${q.survivalRate.toFixed(0)}%`),
      textposition: 'outside',
    },
    {
      x: crSurvival.map(q => q.label),
      y: crSurvival.map(q => q.survivalRate),
      name: 'Crypto',
      type: 'bar',
      marker: { color: ERA_COLORS.crypto },
      text: crSurvival.map(q => `${q.survivalRate.toFixed(0)}%`),
      textposition: 'outside',
    },
  ]

  const chart6Layout = {
    ...defaultLayout,
    barmode: 'group',
    yaxis: { ...defaultLayout.yaxis, title: 'Survival Rate (%)', range: [0, 110] },
    xaxis: { ...defaultLayout.xaxis, title: 'P/S Quintile at Peak' },
  }

  // ── CHART 7: Rhyming History Table ────────────────────────
  const pairData = ANALOG_PAIRS.map(pair => {
    const dc = DOTCOM_DATA.find(c => c.ticker === pair.dotcom)
    const cr = cryptoEnriched.find(c => c.slug === pair.crypto)
    const dcPeak = dc?.snapshots.find(s => s.date === '2000-Q1')?.ps
    const dcTrough = dc?.snapshots.find(s => s.date === '2002-Q1')?.ps
    const dcNow = dc?.snapshots.find(s => s.date === '2004-Q1')?.ps
    const crPeak = cr?.snapshots.find(s => s.date === '2021-Q4')?.ps
    const crTrough = cr?.snapshots.find(s => s.date === '2022-Q4')?.ps
    const crNow = cr?.snapshots.find(s => s.date === '2026-Q1')?.ps
      || cr?.snapshots.find(s => s.date === '2024-Q4')?.ps
    return {
      dcName: dc?.name || pair.dotcom,
      crName: cr?.name || pair.crypto,
      dcPeak, dcTrough, dcNow,
      crPeak, crTrough, crNow,
      dcSurvived: dc?.survived,
      crSurvived: cr?.survived,
      thesis: pair.thesis,
    }
  })

  // ── CSV data ──────────────────────────────────────────────
  const chart3CSV = {
    filename: 'dotcom_vs_crypto_peak_ps',
    headers: ['Era', 'Name', 'Peak P/S', 'Sector', 'Survived'],
    rows: [
      ...dcPeakPS.map(c => ['Dot-Com', c.name, c.ps?.toFixed(1), c.sector, c.survived ? 'Yes' : 'No']),
      ...crPeakPS.map(c => ['Crypto', c.name, c.ps?.toFixed(1), c.sector, c.survived ? 'Yes' : 'No']),
    ],
  }

  const chart7CSV = {
    filename: 'rhyming_history_pairs',
    headers: ['Dot-Com', 'DC Peak P/S', 'DC Trough P/S', 'DC Survived', 'Crypto', 'CR Peak P/S', 'CR Trough P/S', 'CR Survived'],
    rows: pairData.map(p => [
      p.dcName, p.dcPeak?.toFixed(1), p.dcTrough?.toFixed(1), p.dcSurvived ? 'Yes' : 'No',
      p.crName, p.crPeak?.toFixed(1), p.crTrough?.toFixed(1), p.crSurvived ? 'Yes' : 'No',
    ]),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <NarrativeBox title="Research Study">
        <p className="font-serif text-base">
          <strong>Does history rhyme?</strong> This study compares the Price-to-Sales ratios of the top tech companies
          during the dot-com bubble (1999–2004) with the top crypto protocols during the crypto bubble (2021–2026).
          P/S is the only valuation metric that works across both eras — 86% of dot-com companies and most crypto
          protocols lacked meaningful earnings, making P/E unusable.
        </p>
        <p className="text-xs font-mono mt-2" style={{ color: '#999' }}>
          Dot-com data: {DOTCOM_DATA.length} companies · Crypto data: {cryptoEnriched.length} protocols (live-enriched) ·
          Peak alignment: NASDAQ {PEAKS.dotcom} ↔ Crypto {PEAKS.crypto}
        </p>
      </NarrativeBox>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title="DC Median P/S at Peak" value={dcMedianPeak ? `${dcMedianPeak.toFixed(1)}x` : '—'} subtitle="Q1 2000" />
        <KPICard title="Crypto Median P/S at Peak" value={crMedianPeak ? `${crMedianPeak.toFixed(1)}x` : '—'} subtitle="Q4 2021" />
        <KPICard title="DC Median P/S Trough" value={dcMedianTrough ? `${dcMedianTrough.toFixed(1)}x` : '—'} subtitle="Q1 2002" />
        <KPICard title="Crypto Median P/S Now" value={crMedianCurrent ? `${crMedianCurrent.toFixed(1)}x` : '—'} subtitle="Q1 2026 (live)" />
        <KPICard title="DC Survival Rate" value={`${dcSurvivedPct.toFixed(0)}%`} subtitle={`${DOTCOM_DATA.filter(c => c.survived).length} of ${DOTCOM_DATA.length}`} />
        <KPICard title="Crypto Survival Rate" value={`${crSurvivedPct.toFixed(0)}%`} subtitle={`${cryptoEnriched.filter(c => c.survived).length} of ${cryptoEnriched.length}`} />
      </div>

      {/* Chart 1: Bubble Overlay */}
      <ChartCard
        title="The Bubble Overlay — Median P/S Trajectory"
        subtitle="Both eras indexed to Month 0 = bubble peak. Shaded bands show 25th–75th percentile range."
      >
        <Plot data={chart1Traces} layout={chart1Layout} config={defaultConfig} className="w-full" style={{ height: 480 }} />
      </ChartCard>

      <NarrativeBox title="Editorial Note">
        <p>
          The dot-com median P/S compressed from ~{dcMedianPeak?.toFixed(0)}x at peak to ~{dcMedianTrough?.toFixed(0)}x at trough — a{' '}
          {dcMedianPeak && dcMedianTrough ? ((1 - dcMedianTrough / dcMedianPeak) * 100).toFixed(0) : '?'}% compression.
          Crypto's median P/S stands at ~{crMedianCurrent?.toFixed(0)}x today. The question is whether crypto has completed
          its compression cycle or whether there's further to fall.
        </p>
      </NarrativeBox>

      {/* Chart 2: Distribution */}
      <ChartCard
        title="P/S Distribution at Key Moments"
        subtitle="Side-by-side box plots at Peak, Trough, Recovery, and Now (log scale)"
      >
        <Plot data={chart2Traces} layout={chart2Layout} config={defaultConfig} className="w-full" style={{ height: 420 }} />
      </ChartCard>

      {/* Chart 3: Top 50 Ranking */}
      <ChartCard
        title="Peak P/S Rankings — Who Was Most Overvalued?"
        subtitle="Top 25 by P/S at bubble peak. Green = survived, Red = failed."
        csvData={chart3CSV}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Plot data={chart3aTraces} layout={chart3Layout('Dot-Com (Q1 2000)')} config={defaultConfig}
            className="w-full" style={{ height: 600 }} />
          <Plot data={chart3bTraces} layout={chart3Layout('Crypto (Q4 2021)')} config={defaultConfig}
            className="w-full" style={{ height: 600 }} />
        </div>
      </ChartCard>

      {/* Chart 4: Sector Heatmap */}
      <ChartCard
        title="Sector-Level P/S Evolution"
        subtitle="Median P/S by sector mapped across eras. Darker = higher valuation."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Plot data={chart4aTraces} layout={chart4Layout('Dot-Com Sectors')} config={defaultConfig}
            className="w-full" style={{ height: 320 }} />
          <Plot data={chart4bTraces} layout={chart4Layout('Crypto Sectors')} config={defaultConfig}
            className="w-full" style={{ height: 320 }} />
        </div>
      </ChartCard>

      <NarrativeBox title="Sector Parallels">
        <p>
          Infrastructure commanded the highest P/S premiums in both eras — networking equipment (Cisco, Juniper, Nortel)
          in the dot-com era and L1/L2 chains (Ethereum, Solana) in crypto. The "pick-and-shovel" thesis creates
          the same valuation dynamics regardless of the underlying technology.
        </p>
      </NarrativeBox>

      {/* Chart 5: Compression Scatter */}
      <ChartCard
        title="P/S Compression — Peak vs. Trough"
        subtitle="Below the diagonal = P/S compressed. Bubble size ∝ peak market cap."
      >
        <Plot data={chart5Traces} layout={chart5Layout} config={defaultConfig} className="w-full" style={{ height: 480 }} />
      </ChartCard>

      {/* Chart 6: Survival Analysis */}
      <ChartCard
        title="The Graveyard — Survival by P/S Quintile"
        subtitle="Does high P/S at peak predict death? Split by P/S quintile."
      >
        <Plot data={chart6Traces} layout={chart6Layout} config={defaultConfig} className="w-full" style={{ height: 400 }} />
      </ChartCard>

      <NarrativeBox title="Survival Insight">
        <p>
          In the dot-com era, companies with the lowest P/S ratios at peak had the highest survival rates — they were
          the profitable incumbents (IBM, Dell, Intel) that could weather the storm. The same pattern emerges in crypto:
          protocols with lower, more sustainable P/S ratios (Aave, MakerDAO, Uniswap) continue to generate fees,
          while high-P/S, low-revenue projects (Terra, Celsius) collapsed entirely.
        </p>
      </NarrativeBox>

      {/* Chart 7: Rhyming History Table */}
      <ChartCard
          title={`"History Doesn't Repeat, But It Rhymes" — Analog Pairs`}
        subtitle="Each dot-com company paired with its closest crypto counterpart"
        csvData={chart7CSV}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono border-collapse">
            <thead>
              <tr className="border-b-2 border-(--color-ink)">
                <th className="text-left py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Dot-Com</th>
                <th className="text-right py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Peak</th>
                <th className="text-right py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Trough</th>
                <th className="text-center py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">↔</th>
                <th className="text-left py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Crypto</th>
                <th className="text-right py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Peak</th>
                <th className="text-right py-2 px-3 font-serif text-xs uppercase tracking-wider text-(--color-ink-muted)">Now</th>
              </tr>
            </thead>
            <tbody>
              {pairData.map((p, i) => (
                <tr key={i} className="border-b border-(--color-rule) hover:bg-(--color-paper-warm) group">
                  <td className="py-2.5 px-3">
                    <span style={{ color: p.dcSurvived ? '#2E7D4F' : '#C1352D' }}>{p.dcSurvived ? '●' : '✗'}</span>{' '}
                    <span className="font-semibold">{p.dcName}</span>
                  </td>
                  <td className="text-right py-2.5 px-3">{p.dcPeak != null ? `${p.dcPeak.toFixed(0)}x` : '—'}</td>
                  <td className="text-right py-2.5 px-3">{p.dcTrough != null ? `${p.dcTrough.toFixed(0)}x` : '—'}</td>
                  <td className="text-center py-2.5 px-3 text-(--color-ink-muted)">↔</td>
                  <td className="py-2.5 px-3">
                    <span style={{ color: p.crSurvived ? '#2E7D4F' : '#C1352D' }}>{p.crSurvived ? '●' : '✗'}</span>{' '}
                    <span className="font-semibold">{p.crName}</span>
                  </td>
                  <td className="text-right py-2.5 px-3">{p.crPeak != null ? `${p.crPeak.toFixed(0)}x` : '—'}</td>
                  <td className="text-right py-2.5 px-3">{p.crNow != null ? `${p.crNow.toFixed(0)}x` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Theses below table */}
          <div className="mt-4 space-y-3">
            {pairData.map((p, i) => (
              <div key={i} className="flex gap-3 text-xs text-(--color-ink-light) leading-relaxed">
                <span className="shrink-0 font-semibold text-(--color-ink)" style={{ minWidth: '140px' }}>
                  {p.dcName} ↔ {p.crName}
                </span>
                <span>{p.thesis}</span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      <NarrativeBox title="API Enhancement Note">
        <p>
          <strong>Current data sources:</strong> Dot-com P/S ratios are curated from SEC filings, Damodaran datasets,
          and CFA Institute research. Crypto current P/S (2026-Q1) is computed <em>live</em> from DeFiLlama fees × 365
          ÷ CoinGecko market cap.
        </p>
        <p>
          <strong>Potential API upgrades:</strong> For richer historical crypto P/S, DeFiLlama's per-protocol
          fee history endpoint (<code>/summary/fees/{'protocol'}</code>) could provide daily fee snapshots,
          and CoinGecko's <code>/coins/{'id'}/market_chart</code> provides historical market cap.
          Combining these would allow a smooth daily P/S time series instead of quarterly snapshots.
          For dot-com data, the Quandl/NASDAQ Data Link API provides historical fundamentals for a fee,
          and EDGAR XBRL API could source raw 10-K revenue figures.
        </p>
      </NarrativeBox>
    </div>
  )
}

// ── Survival computation ─────────────────────────────────────
function computeSurvival(data, peakDate) {
  const withPS = data
    .map(c => {
      const ps = c.snapshots.find(s => s.date === peakDate)?.ps
      return { ...c, peakPS: ps }
    })
    .filter(c => c.peakPS != null && c.peakPS < 5000)
    .sort((a, b) => a.peakPS - b.peakPS)

  if (withPS.length === 0) return []

  const quintileSize = Math.ceil(withPS.length / 5)
  const quintiles = []
  for (let i = 0; i < 5; i++) {
    const slice = withPS.slice(i * quintileSize, (i + 1) * quintileSize)
    if (slice.length === 0) continue
    const survived = slice.filter(c => c.survived).length
    const lo = slice[0].peakPS.toFixed(0)
    const hi = slice[slice.length - 1].peakPS.toFixed(0)
    quintiles.push({
      label: `Q${i + 1} (${lo}–${hi}x)`,
      survivalRate: (survived / slice.length) * 100,
      total: slice.length,
      survived,
    })
  }
  return quintiles
}
