import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import RevenueBreakdownChart from '../RevenueBreakdownChart'
import SectorTimeSeries from '../SectorTimeSeries'
import { fetchValuationsData } from '../../services/api'
import { formatCurrency, formatMultiple, formatPercent, categorizeSector } from '../../utils/helpers'
import { valuationsNarrative } from '../../data/narratives'

export default function ValuationsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showStablecoins, setShowStablecoins] = useState(true)
  const [selectedSector, setSelectedSector] = useState('All')
  const [corrPeriod, setCorrPeriod] = useState('7d')

  useEffect(() => {
    fetchValuationsData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const processed = useMemo(() => {
    if (!data) return null

    const feesProtocols = data?.fees?.protocols || []
    const totalFees24h = data?.fees?.total24h || feesProtocols.reduce((s, p) => s + (p.total24h || 0), 0)
    const revenueProtocols = data?.feesRevenue?.protocols || []
    const totalRevenue24h = data?.feesRevenue?.total24h || revenueProtocols.reduce((s, p) => s + (p.total24h || 0), 0)

    // Revenue protocols lookup (per-protocol take rate)
    const revLookup = {}
    revenueProtocols.forEach(p => { if (p.slug) revLookup[p.slug.toLowerCase()] = p })

    // CoinGecko 1000 coins market cap lookup
    const cgMarkets = Array.isArray(data?.markets) ? data.markets : []
    const mcapLookup = {}
    cgMarkets.forEach(m => {
      if (m.id) mcapLookup[m.id.toLowerCase()] = m
      if (m.symbol) mcapLookup[m.symbol.toLowerCase()] = m
      if (m.name) mcapLookup[m.name.toLowerCase()] = m
    })

    // DeFiLlama protocols (TVL, category, mcap)
    const llamaProtocols = data?.protocols || []
    const llamaLookup = {}
    llamaProtocols.forEach(p => {
      if (p.slug) llamaLookup[p.slug.toLowerCase()] = p
      if (p.name) llamaLookup[p.name.toLowerCase()] = p
    })

    // Merge: DeFiLlama fees + revenue + CoinGecko market data
    const mergedProtocols = feesProtocols
      .filter(p => p.total24h > 0)
      .map(p => {
        const slug = (p.slug || '').toLowerCase()
        const name = (p.name || '').toLowerCase()
        const llama = llamaLookup[slug] || llamaLookup[name]
        const cg = mcapLookup[slug] || mcapLookup[name] || mcapLookup[(llama?.gecko_id || '').toLowerCase()] || mcapLookup[(llama?.symbol || '').toLowerCase()]
        const rev = revLookup[slug]

        const mcap = cg?.market_cap || llama?.mcap || 0
        const tvl = llama?.tvl || 0
        const fees24h = p.total24h
        const revenue24h = rev?.total24h || 0
        const annualizedFees = fees24h * 365
        const takeRate = fees24h > 0 && revenue24h > 0 ? (revenue24h / fees24h) * 100 : null

        return {
          name: p.name || p.slug, slug: p.slug,
          fees24h, revenue24h, fees7d: p.total7d || 0, fees30d: p.total30d || 0,
          annualizedFees, mcap, tvl, takeRate,
          category: llama?.category || p.category || 'Other',
          sector: categorizeSector(llama?.category || p.category || 'Other'),
          psRatio: mcap > 0 && annualizedFees > 0 ? mcap / annualizedFees : null,
          priceChange7d: cg?.price_change_percentage_7d_in_currency || 0,
          priceChange30d: cg?.price_change_percentage_30d_in_currency || 0,
          feeChange7d: p.change_7d || 0,
          feeChange30d: p.change_1m || 0,
        }
      })
      .sort((a, b) => b.fees24h - a.fees24h)

    // KPIs
    const withPS = mergedProtocols.filter(p => p.psRatio > 0 && p.psRatio < 10000)
    const medianPS = withPS.length > 0
      ? withPS.map(p => p.psRatio).sort((a, b) => a - b)[Math.floor(withPS.length / 2)] : null
    const withTR = mergedProtocols.filter(p => p.takeRate > 0 && p.takeRate <= 100)
    const medianTakeRate = withTR.length > 0
      ? withTR.map(p => p.takeRate).sort((a, b) => a - b)[Math.floor(withTR.length / 2)] : null

    const allSectors = ['All', ...new Set(mergedProtocols.map(p => p.sector))]
      .sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b))

    // Revenue–Price correlation
    const corrData = mergedProtocols
      .filter(p => {
        const rc = corrPeriod === '7d' ? p.feeChange7d : p.feeChange30d
        const pc = corrPeriod === '7d' ? p.priceChange7d : p.priceChange30d
        return rc !== 0 && pc !== 0 && p.mcap > 0 && Math.abs(rc) < 500 && Math.abs(pc) < 500
      })
      .map(p => ({
        name: p.name, sector: p.sector,
        revChange: corrPeriod === '7d' ? p.feeChange7d : p.feeChange30d,
        priceChange: corrPeriod === '7d' ? p.priceChange7d : p.priceChange30d,
      }))

    let rSquared = null, slope = null, intercept = null
    if (corrData.length >= 5) {
      const n = corrData.length
      const xs = corrData.map(d => d.revChange), ys = corrData.map(d => d.priceChange)
      const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0)
      const sxy = xs.reduce((s, x, i) => s + x * ys[i], 0)
      const sx2 = xs.reduce((s, x) => s + x * x, 0), sy2 = ys.reduce((s, y) => s + y * y, 0)
      const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy))
      const r = den > 0 ? (n * sxy - sx * sy) / den : 0
      rSquared = r * r
      slope = (n * sx2 - sx * sx) !== 0 ? (n * sxy - sx * sy) / (n * sx2 - sx * sx) : 0
      intercept = (sy - slope * sx) / n
    }

    return {
      mergedProtocols, totalFees24h, totalRevenue24h,
      medianPS, medianTakeRate, allSectors,
      corrData, rSquared, slope, intercept,
      cgMarketCount: cgMarkets.length, llamaProtocolCount: feesProtocols.length,
    }
  }, [data, corrPeriod])

  if (loading) return <LoadingSpinner message="Loading valuations data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>
  if (!processed) return <div className="text-center py-20">No data available</div>

  const {
    mergedProtocols, totalFees24h, totalRevenue24h, medianPS, medianTakeRate,
    allSectors, corrData, rSquared, slope, intercept,
    cgMarketCount, llamaProtocolCount,
  } = processed

  let topProtocols = mergedProtocols
  if (!showStablecoins) {
    topProtocols = topProtocols.filter(p =>
      !['tether', 'circle', 'ethena', 'maker'].some(s => (p.slug || p.name || '').toLowerCase().includes(s))
    )
  }
  const top30 = topProtocols.slice(0, 30)

  // Scatter: ALL protocols, filtered by sector
  let scatterProtocols = mergedProtocols.filter(p => p.mcap > 0 && p.annualizedFees > 0)
  if (selectedSector !== 'All') scatterProtocols = scatterProtocols.filter(p => p.sector === selectedSector)
  const scatterCats = [...new Set(scatterProtocols.map(p => p.sector))]
  const catColors = {}
  scatterCats.forEach((c, i) => { catColors[c] = colors.palette[i % colors.palette.length] })

  // Regression line
  let regLine = null
  if (slope !== null && corrData.length >= 5) {
    const xs = corrData.map(d => d.revChange).sort((a, b) => a - b)
    regLine = { x: [xs[0], xs[xs.length - 1]], y: [slope * xs[0] + intercept, slope * xs[xs.length - 1] + intercept] }
  }

  return (
    <div className="space-y-6">
      <RevenueBreakdownChart feesData={data?.fees} />

      <SectorTimeSeries feesData={data?.fees} protocols={data?.protocols} markets={data?.markets} />

      <div className="text-xs text-(--color-text-secondary) text-right">
        {llamaProtocolCount.toLocaleString()} DeFiLlama protocols · {cgMarketCount.toLocaleString()} CoinGecko coins
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard title="Total Fees (24h)" value={formatCurrency(totalFees24h)} subtitle="All protocols" trend={data?.fees?.change_1d} />
        <KPICard title="Protocol Revenue (24h)" value={formatCurrency(totalRevenue24h)} subtitle="Revenue to protocol" />
        <KPICard title="Annualized Fees" value={formatCurrency(totalFees24h * 365)} subtitle="Extrapolated" />
        <KPICard title="Median P/S Ratio" value={medianPS ? formatMultiple(medianPS) : '—'} subtitle="Fee-earning protocols" />
        <KPICard title="Median Take Rate" value={medianTakeRate ? formatPercent(medianTakeRate) : '—'} subtitle="Revenue / Fees" />
        <KPICard title="Rev–Price R²" value={rSquared !== null ? rSquared.toFixed(3) : '—'} subtitle={`${corrPeriod} correlation`} />
      </div>

      <ChartCard title="Top 30 Protocol Fees (24h)" subtitle={`Daily fees — ${topProtocols.length.toLocaleString()} fee-earning protocols`}>
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-xs text-(--color-text-secondary) cursor-pointer">
            <input type="checkbox" checked={showStablecoins} onChange={e => setShowStablecoins(e.target.checked)} className="rounded" />
            Include Stablecoins
          </label>
        </div>
        <Plot
          data={[{
            x: top30.map(p => p.name), y: top30.map(p => p.fees24h), type: 'bar',
            marker: { color: top30.map((_, i) => colors.palette[i % colors.palette.length]), line: { width: 0 } },
            hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
          }]}
          layout={{ ...defaultLayout, height: 420, xaxis: { ...defaultLayout.xaxis, tickangle: -45, type: 'category' }, yaxis: { ...defaultLayout.yaxis, title: 'Fees (USD)' } }}
          config={defaultConfig} className="w-full"
        />
      </ChartCard>

      {/* P/S Scatter — ALL protocols */}
      <ChartCard title="Fees vs Market Cap — P/S Scatter" subtitle={`${scatterProtocols.length} protocols · Bubble = TVL · Color = Sector · Log scale`}>
        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs text-(--color-text-secondary)">Sector:</label>
          <select value={selectedSector} onChange={e => setSelectedSector(e.target.value)}
            className="text-xs border border-(--color-border) rounded px-2 py-1 bg-white">
            {allSectors.map(s => <option key={s} value={s}>{s}{s !== 'All' ? ` (${mergedProtocols.filter(p => p.sector === s && p.mcap > 0 && p.annualizedFees > 10000).length})` : ''}</option>)}
          </select>
        </div>
        <Plot
          data={scatterCats.map(cat => {
            const pts = scatterProtocols.filter(p => p.sector === cat)
            return {
              x: pts.map(p => p.annualizedFees), y: pts.map(p => p.mcap),
              text: pts.map(p => `${p.name}<br>P/S: ${p.psRatio ? p.psRatio.toFixed(1) + 'x' : 'N/A'}<br>Take Rate: ${p.takeRate ? p.takeRate.toFixed(1) + '%' : 'N/A'}<br>Fees: $${(p.annualizedFees / 1e6).toFixed(1)}M<br>MCap: $${(p.mcap / 1e6).toFixed(0)}M`),
              mode: 'markers', type: 'scatter', name: cat,
              marker: { color: catColors[cat], size: pts.map(p => Math.max(6, Math.min(40, Math.sqrt(p.tvl / 1e6) * 3))), opacity: 0.75, line: { width: 1, color: '#FFF' } },
              hovertemplate: '%{text}<extra></extra>',
            }
          })}
          layout={{
            ...defaultLayout, height: 520,
            xaxis: { ...defaultLayout.xaxis, title: 'Annualized Fees (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'Market Cap (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
          }}
          config={defaultConfig} className="w-full"
        />
      </ChartCard>

      {/* Revenue–Price Correlation */}
      <ChartCard title="Fee Growth vs Price Growth — Correlation"
        subtitle={`Does rising revenue affect price? ${corrData.length} protocols · R² = ${rSquared !== null ? rSquared.toFixed(3) : 'N/A'}`}>
        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs text-(--color-text-secondary)">Period:</label>
          <div className="flex rounded-md border border-(--color-border) overflow-hidden">
            {['7d', '30d'].map(p => (
              <button key={p} onClick={() => setCorrPeriod(p)}
                className={`px-3 py-1 text-xs font-medium cursor-pointer transition-colors ${corrPeriod === p ? 'bg-(--color-primary) text-white' : 'text-(--color-text-secondary) hover:bg-gray-50'}`}
              >{p.toUpperCase()}</button>
            ))}
          </div>
          {rSquared !== null && (
            <span className={`text-xs font-medium ${rSquared > 0.3 ? 'text-(--color-success)' : rSquared > 0.1 ? 'text-(--color-warning)' : 'text-(--color-text-secondary)'}`}>
              {rSquared > 0.3 ? 'Strong' : rSquared > 0.1 ? 'Moderate' : 'Weak'} correlation
            </span>
          )}
        </div>
        <Plot
          data={[
            ...scatterCats.map(cat => {
              const pts = corrData.filter(d => d.sector === cat)
              if (!pts.length) return null
              return {
                x: pts.map(d => d.revChange), y: pts.map(d => d.priceChange),
                text: pts.map(d => `${d.name}<br>Fee Δ: ${d.revChange > 0 ? '+' : ''}${d.revChange.toFixed(1)}%<br>Price Δ: ${d.priceChange > 0 ? '+' : ''}${d.priceChange.toFixed(1)}%`),
                mode: 'markers', type: 'scatter', name: cat,
                marker: { color: catColors[cat], size: 8, opacity: 0.7, line: { width: 1, color: '#FFF' } },
                hovertemplate: '%{text}<extra></extra>',
              }
            }).filter(Boolean),
            ...(regLine ? [{
              x: regLine.x, y: regLine.y, mode: 'lines', type: 'scatter',
              name: `R² = ${rSquared.toFixed(3)}`, line: { color: '#EF4444', width: 2, dash: 'dash' }, hoverinfo: 'skip',
            }] : []),
          ]}
          layout={{
            ...defaultLayout, height: 500,
            xaxis: { ...defaultLayout.xaxis, title: `Fee Change % (${corrPeriod})`, type: 'linear', zeroline: true, zerolinecolor: '#D1D5DB' },
            yaxis: { ...defaultLayout.yaxis, title: `Price Change % (${corrPeriod})`, type: 'linear', zeroline: true, zerolinecolor: '#D1D5DB' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
            shapes: [
              { type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', line: { color: '#E5E7EB', dash: 'dot', width: 1 } },
              { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, line: { color: '#E5E7EB', dash: 'dot', width: 1 } },
            ],
          }}
          config={defaultConfig} className="w-full"
        />
      </ChartCard>

      <NarrativeBox title={valuationsNarrative.title}>
        {valuationsNarrative.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>
    </div>
  )
}
