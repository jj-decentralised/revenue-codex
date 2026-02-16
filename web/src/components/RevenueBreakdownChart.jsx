import { useState, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from './Plot'
import { formatCurrency } from '../utils/helpers'

const PERIODS = [
  { key: '24h', label: '24H', field: 'total24h' },
  { key: '7d', label: '7D', field: 'total7d' },
  { key: '30d', label: '30D', field: 'total30d' },
  { key: '90d', label: '90D', field: null },
  { key: '365d', label: '365D', field: 'total1y' },
  { key: 'all', label: 'All-Time', field: 'totalAllTime' },
]

// Fixed color map so categories keep the same color across renders
const CATEGORY_COLORS = {}
function getCategoryColor(name, idx) {
  if (!CATEGORY_COLORS[name]) {
    CATEGORY_COLORS[name] = colors.palette[Object.keys(CATEGORY_COLORS).length % colors.palette.length]
  }
  return CATEGORY_COLORS[name]
}

/**
 * Extract a numeric value from a breakdown entry value.
 * Handles both `{ "protocol": 12345 }` and `{ "protocol": { "Fees": 12345 } }`.
 */
function extractNum(val) {
  if (typeof val === 'number') return val
  if (typeof val === 'object' && val !== null) {
    for (const v of Object.values(val)) {
      if (typeof v === 'number') return v
    }
  }
  return 0
}

export default function RevenueBreakdownChart({ feesData }) {
  const [period, setPeriod] = useState('24h')
  const [viewMode, setViewMode] = useState('category')
  const [visibleCount, setVisibleCount] = useState(15)

  const { protocolRevenues, categories, availablePeriods, total } = useMemo(() => {
    const empty = { protocolRevenues: [], categories: [], availablePeriods: ['24h'], total: 0 }
    if (!feesData?.protocols?.length) return empty

    const protocols = feesData.protocols
    const breakdown = Array.isArray(feesData.totalDataChartBreakdown)
      ? feesData.totalDataChartBreakdown
      : []

    // Build lookup: lowered name/slug -> category
    const catLookup = {}
    const nameLookup = {} // lowered key -> protocol object
    protocols.forEach(p => {
      const cat = p.category || 'Other'
      if (p.slug) { catLookup[p.slug.toLowerCase()] = cat; nameLookup[p.slug.toLowerCase()] = p }
      if (p.name) { catLookup[p.name.toLowerCase()] = cat; nameLookup[p.name.toLowerCase()] = p }
    })

    // Detect which periods have data
    const available = ['24h', '7d', '30d']
    if (breakdown.length >= 90) available.push('90d')
    if (protocols.some(p => p.total1y > 0)) available.push('365d')
    if (protocols.some(p => p.totalAllTime > 0)) available.push('all')

    // Resolve values for the selected period
    let protRevs
    const conf = PERIODS.find(p => p.key === period)

    if (conf?.field && protocols.some(p => (p[conf.field] || 0) > 0)) {
      // Direct field on protocol objects
      protRevs = protocols
        .map(p => ({
          name: p.name || p.slug,
          slug: p.slug || p.name,
          value: p[conf.field] || 0,
          category: p.category || 'Other',
        }))
        .filter(p => p.value > 0)
        .sort((a, b) => b.value - a.value)
    } else if (period === '90d' && breakdown.length >= 90) {
      // Compute 90D from totalDataChartBreakdown
      const recent = breakdown.slice(-90)
      const sums = {}
      recent.forEach(entry => {
        const dayData = Array.isArray(entry) ? entry[1] : entry
        if (typeof dayData !== 'object' || dayData === null) return
        Object.entries(dayData).forEach(([key, val]) => {
          const n = extractNum(val)
          if (n > 0) sums[key] = (sums[key] || 0) + n
        })
      })
      protRevs = Object.entries(sums)
        .map(([key, value]) => {
          const k = key.toLowerCase()
          const prot = nameLookup[k]
          return {
            name: prot?.name || key,
            slug: prot?.slug || key,
            value,
            category: catLookup[k] || 'Other',
          }
        })
        .filter(p => p.value > 0)
        .sort((a, b) => b.value - a.value)
    } else {
      // Fallback to 24h
      protRevs = protocols
        .map(p => ({ name: p.name || p.slug, slug: p.slug, value: p.total24h || 0, category: p.category || 'Other' }))
        .filter(p => p.value > 0)
        .sort((a, b) => b.value - a.value)
    }

    // Category aggregation
    const catMap = {}
    protRevs.forEach(p => {
      const c = p.category
      if (!catMap[c]) catMap[c] = { name: c, value: 0, count: 0 }
      catMap[c].value += p.value
      catMap[c].count++
    })
    const cats = Object.values(catMap).sort((a, b) => b.value - a.value)
    const tot = protRevs.reduce((s, p) => s + p.value, 0)

    return { protocolRevenues: protRevs, categories: cats, availablePeriods: available, total: tot }
  }, [feesData, period])

  if (!protocolRevenues.length) return null

  const items = viewMode === 'category' ? categories : protocolRevenues
  const capped = Math.min(visibleCount, items.length)
  const visible = items.slice(0, capped)

  // Reverse for horizontal bar (highest at top)
  const rev = [...visible].reverse()
  const yLabels = rev.map(i => viewMode === 'category' ? `${i.name} (${i.count})` : i.name)
  const xValues = rev.map(i => i.value)
  const barColors = rev.map((item, i) => {
    const origIdx = visible.length - 1 - i
    if (viewMode === 'category') return getCategoryColor(item.name, origIdx)
    return getCategoryColor(item.category, origIdx)
  })

  const periodLabel = PERIODS.find(p => p.key === period)?.label || '24H'
  const chartHeight = Math.max(380, capped * 30 + 80)

  return (
    <div className="bg-(--color-paper) rounded-lg border border-(--color-border) p-5">
      {/* Title */}
      <div className="mb-1">
        <h3 className="text-base font-semibold text-(--color-text)">
          Crypto Revenue Breakdown
        </h3>
        <p className="text-xs text-(--color-text-secondary) mt-0.5">
          Total: {formatCurrency(total)} ({periodLabel}) · {protocolRevenues.length} revenue-earning protocols across {categories.length} categories · Source: DeFiLlama
        </p>
      </div>

      {/* Period Toggle */}
      <div className="flex flex-wrap items-center gap-2 mb-4 mt-3">
        <div className="flex rounded-md border border-(--color-border) overflow-hidden">
          {PERIODS.filter(p => availablePeriods.includes(p.key)).map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                period === p.key
                  ? 'bg-(--color-primary) text-white'
                  : 'text-(--color-text-secondary) hover:bg-(--color-paper-alt)'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <Plot
        data={[{
          y: yLabels,
          x: xValues,
          type: 'bar',
          orientation: 'h',
          marker: { color: barColors, line: { width: 0 } },
          text: xValues.map(v => ' ' + formatCurrency(v)),
          textposition: 'outside',
          textfont: { size: 11, color: '#374151', family: 'Inter, system-ui, sans-serif' },
          hovertemplate: '%{y}<br><b>%{x:$,.0f}</b><extra></extra>',
          cliponaxis: false,
        }]}
        layout={{
          ...defaultLayout,
          height: chartHeight,
          margin: { t: 10, r: 90, b: 40, l: 10 },
          xaxis: {
            ...defaultLayout.xaxis,
            title: { text: `Fees (USD, ${periodLabel})`, standoff: 10 },
            tickformat: '$,.2s',
            side: 'bottom',
          },
          yaxis: {
            ...defaultLayout.yaxis,
            automargin: true,
            tickfont: { size: 12, color: '#374151', family: 'Inter, system-ui, sans-serif' },
          },
          bargap: 0.18,
        }}
        config={{ ...defaultConfig, displayModeBar: false }}
        className="w-full"
      />

      {/* Controls underneath the chart */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-(--color-border)">
        {/* Category / Projects toggle */}
        <div className="flex rounded-md border border-(--color-border) overflow-hidden">
          <button
            onClick={() => { setViewMode('category'); setVisibleCount(15) }}
            className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'category'
                ? 'bg-(--color-primary) text-white'
                : 'text-(--color-text-secondary) hover:bg-(--color-paper-alt)'
            }`}
          >
            By Category
          </button>
          <button
            onClick={() => { setViewMode('projects'); setVisibleCount(20) }}
            className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'projects'
                ? 'bg-(--color-primary) text-white'
                : 'text-(--color-text-secondary) hover:bg-(--color-paper-alt)'
            }`}
          >
            By Project
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-(--color-text-secondary) mr-1">Zoom:</span>
          <button
            onClick={() => setVisibleCount(c => Math.max(5, c - 5))}
            disabled={visibleCount <= 5}
            className="w-7 h-7 flex items-center justify-center rounded border border-(--color-border) text-sm font-bold text-(--color-text-secondary) hover:bg-(--color-paper-alt) disabled:opacity-30 cursor-pointer transition-colors"
            title="Show fewer"
          >
            −
          </button>
          <span className="text-xs text-(--color-text-secondary) min-w-[56px] text-center font-medium">
            Top {capped}
          </span>
          <button
            onClick={() => setVisibleCount(c => Math.min(items.length, c + 10))}
            disabled={visibleCount >= items.length}
            className="w-7 h-7 flex items-center justify-center rounded border border-(--color-border) text-sm font-bold text-(--color-text-secondary) hover:bg-(--color-paper-alt) disabled:opacity-30 cursor-pointer transition-colors"
            title="Show more"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
