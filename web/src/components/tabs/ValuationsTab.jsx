import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import RevenueBreakdownChart from '../RevenueBreakdownChart'
import { fetchValuationsData } from '../../services/api'
import { formatCurrency, formatMultiple, formatPercent, categorizeSector } from '../../utils/helpers'
import { valuationsNarrative } from '../../data/narratives'

export default function ValuationsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showStablecoins, setShowStablecoins] = useState(true)

  useEffect(() => {
    fetchValuationsData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Process all data with useMemo
  const processed = useMemo(() => {
    if (!data) return null

    const feesProtocols = data?.fees?.protocols || []
    const totalFees24h = data?.fees?.totalFees24h || 0
    const totalRevenue24h = data?.fees?.totalRevenue24h || 0

    // Token Terminal financial data
    const ttRevenue = data?.ttFinancials?.revenue?.data || []
    const ttFees = data?.ttFinancials?.fees?.data || []
    const ttEarnings = data?.ttFinancials?.earnings?.data || []
    const ttPS = data?.ttFinancials?.price_to_sales?.data || []
    const ttPE = data?.ttFinancials?.price_to_earnings?.data || []
    const ttIncentives = data?.ttFinancials?.token_incentives?.data || []

    // Build TT lookup by project_id
    const ttLookup = {}
    const addToLookup = (arr, field) => {
      if (!Array.isArray(arr)) return
      arr.forEach(d => {
        const id = d.project_id
        if (!id) return
        if (!ttLookup[id]) ttLookup[id] = { project_id: id, project_name: d.project_name }
        ttLookup[id][field] = d[field]
      })
    }
    addToLookup(ttRevenue, 'revenue')
    addToLookup(ttFees, 'fees')
    addToLookup(ttEarnings, 'earnings')
    addToLookup(ttPS, 'price_to_sales')
    addToLookup(ttPE, 'price_to_earnings')
    addToLookup(ttIncentives, 'token_incentives')

    const ttProjects = Object.values(ttLookup).filter(p => p.revenue > 0 || p.fees > 0)

    // CoinGecko 1000 coins market cap lookup
    const cgMarkets = Array.isArray(data?.markets) ? data.markets : []
    const mcapLookup = {}
    cgMarkets.forEach(m => {
      if (m.id) mcapLookup[m.id.toLowerCase()] = m
      if (m.symbol) mcapLookup[m.symbol.toLowerCase()] = m
    })

    // DeFiLlama protocols
    const llamaProtocols = data?.protocols || []
    const llamaLookup = {}
    llamaProtocols.forEach(p => {
      if (p.slug) llamaLookup[p.slug.toLowerCase()] = p
      if (p.name) llamaLookup[p.name.toLowerCase()] = p
    })

    // Merge DeFiLlama fees + CoinGecko market cap + Token Terminal financials
    const mergedProtocols = feesProtocols
      .filter(p => p.total24h > 0)
      .map(p => {
        const slug = (p.slug || '').toLowerCase()
        const name = (p.name || '').toLowerCase()
        const llama = llamaLookup[slug] || llamaLookup[name]
        const cg = mcapLookup[slug] || mcapLookup[name] || mcapLookup[(llama?.symbol || '').toLowerCase()]
        const tt = ttLookup[slug] || ttLookup[name]

        const mcap = cg?.market_cap || llama?.mcap || 0
        const tvl = llama?.tvl || 0
        const annualizedRevenue = p.total24h * 365

        return {
          name: p.name || p.slug,
          slug: p.slug,
          revenue24h: p.total24h,
          revenue7d: p.total7d || 0,
          revenue30d: p.total30d || 0,
          annualizedRevenue,
          mcap,
          tvl,
          category: llama?.category || p.category || 'Other',
          sector: categorizeSector(llama?.category || p.category || 'Other'),
          // Token Terminal income data
          ttRevenue: tt?.revenue || 0,
          ttFees: tt?.fees || 0,
          ttEarnings: tt?.earnings || 0,
          ttPS: tt?.price_to_sales || null,
          ttPE: tt?.price_to_earnings || null,
          ttIncentives: tt?.token_incentives || 0,
          earningsMargin: tt?.revenue > 0 ? (tt?.earnings / tt.revenue) * 100 : null,
          // Computed
          psRatio: mcap > 0 && annualizedRevenue > 0 ? mcap / annualizedRevenue : null,
          priceChange7d: cg?.price_change_percentage_7d_in_currency || 0,
          priceChange30d: cg?.price_change_percentage_30d_in_currency || 0,
        }
      })
      .sort((a, b) => b.revenue24h - a.revenue24h)

    // KPIs
    const protocolsWithPS = mergedProtocols.filter(p => p.psRatio && p.psRatio > 0 && p.psRatio < 10000)
    const avgPS = protocolsWithPS.length > 0
      ? protocolsWithPS.reduce((s, p) => s + p.psRatio, 0) / protocolsWithPS.length
      : null
    const medianPS = protocolsWithPS.length > 0
      ? protocolsWithPS.map(p => p.psRatio).sort((a, b) => a - b)[Math.floor(protocolsWithPS.length / 2)]
      : null

    const totalTTRevenue = ttProjects.reduce((s, p) => s + (p.revenue || 0), 0)
    const totalTTEarnings = ttProjects.reduce((s, p) => s + (p.earnings || 0), 0)
    const overallEarningsMargin = totalTTRevenue > 0 ? (totalTTEarnings / totalTTRevenue) * 100 : null

    // Sector breakdown
    const sectorRevenue = {}
    mergedProtocols.forEach(p => {
      sectorRevenue[p.sector] = (sectorRevenue[p.sector] || 0) + p.revenue24h
    })
    const sortedSectors = Object.entries(sectorRevenue).sort((a, b) => b[1] - a[1])

    // Top protocols for income statement view (TT data)
    const incomeStatementProtocols = ttProjects
      .filter(p => p.fees > 0)
      .sort((a, b) => (b.fees || 0) - (a.fees || 0))
      .slice(0, 25)

    return {
      mergedProtocols,
      totalFees24h,
      totalRevenue24h,
      avgPS,
      medianPS,
      totalTTRevenue,
      totalTTEarnings,
      overallEarningsMargin,
      sortedSectors,
      ttProjects,
      incomeStatementProtocols,
      cgMarketCount: cgMarkets.length,
      llamaProtocolCount: feesProtocols.length,
      ttProjectCount: ttProjects.length,
    }
  }, [data])

  if (loading) return <LoadingSpinner message="Loading valuations data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>
  if (!processed) return <div className="text-center py-20">No data available</div>

  const {
    mergedProtocols, totalFees24h, totalRevenue24h, avgPS, medianPS,
    totalTTRevenue, totalTTEarnings, overallEarningsMargin,
    sortedSectors, incomeStatementProtocols,
    cgMarketCount, llamaProtocolCount, ttProjectCount,
  } = processed

  let topProtocols = mergedProtocols
  if (!showStablecoins) {
    topProtocols = topProtocols.filter(p =>
      !['tether', 'circle', 'ethena', 'maker'].some(s => (p.slug || p.name || '').toLowerCase().includes(s))
    )
  }
  const top30 = topProtocols.slice(0, 30)

  // Scatter: all protocols with mcap + revenue (up to 200)
  const scatterProtocols = mergedProtocols
    .filter(p => p.mcap > 0 && p.annualizedRevenue > 100000)
    .slice(0, 200)

  const scatterCategories = [...new Set(scatterProtocols.map(p => p.sector))]
  const catColorMap = {}
  scatterCategories.forEach((cat, i) => { catColorMap[cat] = colors.palette[i % colors.palette.length] })

  // Income statement bar chart (Token Terminal)
  const incomeNames = incomeStatementProtocols.map(p => p.project_name || p.project_id)
  const incomeFees = incomeStatementProtocols.map(p => p.fees || 0)
  const incomeRevenue = incomeStatementProtocols.map(p => p.revenue || 0)
  const incomeEarnings = incomeStatementProtocols.map(p => p.earnings || 0)
  const incomeIncentives = incomeStatementProtocols.map(p => -(p.token_incentives || 0))

  return (
    <div className="space-y-6">
      {/* Hero: Revenue Breakdown */}
      <RevenueBreakdownChart feesData={data?.fees} />

      {/* Data coverage badge */}
      <div className="text-xs text-(--color-text-secondary) text-right">
        {llamaProtocolCount.toLocaleString()} DeFiLlama protocols · {ttProjectCount} Token Terminal projects · {cgMarketCount.toLocaleString()} CoinGecko coins
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard title="Total Fees (24h)" value={formatCurrency(totalFees24h)} subtitle="All protocols" trend={data?.fees?.change_1d} />
        <KPICard title="Protocol Revenue (24h)" value={formatCurrency(totalRevenue24h)} subtitle="Revenue to protocol" />
        <KPICard title="Annualized Revenue" value={formatCurrency(totalRevenue24h * 365)} subtitle="Extrapolated" />
        <KPICard title="Median P/S Ratio" value={medianPS ? formatMultiple(medianPS) : '—'} subtitle="Revenue-earning protocols" />
        <KPICard title="TT Earnings (ann.)" value={totalTTEarnings ? formatCurrency(totalTTEarnings * 365) : '—'} subtitle="Token Terminal net" />
        <KPICard title="Earnings Margin" value={overallEarningsMargin ? formatPercent(overallEarningsMargin) : '—'} subtitle="Aggregate" />
      </div>

      <ChartCard title="Top 30 Protocol Revenue (24h)" subtitle={`Daily revenue — ${topProtocols.length.toLocaleString()} revenue-earning protocols tracked`}>
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-xs text-(--color-text-secondary) cursor-pointer">
            <input type="checkbox" checked={showStablecoins} onChange={e => setShowStablecoins(e.target.checked)} className="rounded" />
            Include Stablecoins
          </label>
        </div>
        <Plot
          data={[{
            x: top30.map(p => p.name),
            y: top30.map(p => p.revenue24h),
            type: 'bar',
            marker: { color: top30.map((_, i) => colors.palette[i % colors.palette.length]), line: { width: 0 } },
            hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
          }]}
          layout={{ ...defaultLayout, height: 420, xaxis: { ...defaultLayout.xaxis, tickangle: -45 }, yaxis: { ...defaultLayout.yaxis, title: 'Revenue (USD)' } }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Income Statement: Fees → Revenue → Earnings (Token Terminal) */}
      {incomeStatementProtocols.length > 0 && (
        <ChartCard title="Income Statement — Fees vs Revenue vs Earnings" subtitle="Token Terminal Pro · Top 25 projects by fees · Revenue = fees after supply-side share · Earnings = net after all costs">
          <Plot
            data={[
              { x: incomeNames, y: incomeFees, type: 'bar', name: 'Fees', marker: { color: colors.palette[0] }, hovertemplate: '%{x}<br>Fees: $%{y:,.0f}<extra></extra>' },
              { x: incomeNames, y: incomeRevenue, type: 'bar', name: 'Revenue', marker: { color: colors.palette[1] }, hovertemplate: '%{x}<br>Revenue: $%{y:,.0f}<extra></extra>' },
              { x: incomeNames, y: incomeEarnings, type: 'bar', name: 'Earnings', marker: { color: incomeEarnings.map(e => e >= 0 ? colors.success : colors.danger) }, hovertemplate: '%{x}<br>Earnings: $%{y:,.0f}<extra></extra>' },
              { x: incomeNames, y: incomeIncentives, type: 'bar', name: 'Token Incentives (cost)', marker: { color: colors.warning + '90' }, hovertemplate: '%{x}<br>Token Incentives: $%{y:,.0f}<extra></extra>' },
            ]}
            layout={{
              ...defaultLayout, height: 500, barmode: 'group',
              xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
              yaxis: { ...defaultLayout.yaxis, title: 'USD (daily)' },
              legend: { ...defaultLayout.legend, orientation: 'h', y: -0.2 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      <ChartCard title="Revenue vs Market Cap — P/S Scatter" subtitle={`${scatterProtocols.length} protocols · Bubble = TVL · Color = Sector · Log scale`}>
        <Plot
          data={scatterCategories.map(cat => {
            const pts = scatterProtocols.filter(p => p.sector === cat)
            return {
              x: pts.map(p => p.annualizedRevenue),
              y: pts.map(p => p.mcap),
              text: pts.map(p => `${p.name}<br>P/S: ${p.psRatio ? p.psRatio.toFixed(1) + 'x' : 'N/A'}${p.ttPE ? '<br>P/E: ' + p.ttPE.toFixed(1) + 'x' : ''}<br>Rev: $${(p.annualizedRevenue / 1e6).toFixed(1)}M<br>MCap: $${(p.mcap / 1e6).toFixed(0)}M`),
              mode: 'markers', type: 'scatter', name: cat,
              marker: {
                color: catColorMap[cat],
                size: pts.map(p => Math.max(8, Math.min(40, Math.sqrt(p.tvl / 1e6) * 3))),
                opacity: 0.75, line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
            }
          })}
          layout={{
            ...defaultLayout, height: 520,
            xaxis: { ...defaultLayout.xaxis, title: 'Annualized Revenue (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'Market Cap (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Earnings Margin Scatter */}
      {incomeStatementProtocols.length > 0 && (
        <ChartCard title="Earnings Margin vs Revenue" subtitle="Token Terminal · X = daily revenue · Y = earnings margin % · Color = positive (green) / negative (red)">
          <Plot
            data={[{
              x: incomeStatementProtocols.filter(p => p.revenue > 0).map(p => p.revenue),
              y: incomeStatementProtocols.filter(p => p.revenue > 0).map(p => p.earnings != null ? (p.earnings / p.revenue) * 100 : 0),
              text: incomeStatementProtocols.filter(p => p.revenue > 0).map(p => `${p.project_name}<br>Rev: $${p.revenue?.toLocaleString()}<br>Earn: $${p.earnings?.toLocaleString()}<br>Margin: ${p.revenue > 0 ? ((p.earnings / p.revenue) * 100).toFixed(1) : 0}%`),
              mode: 'markers', type: 'scatter',
              marker: {
                color: incomeStatementProtocols.filter(p => p.revenue > 0).map(p => (p.earnings || 0) >= 0 ? colors.success : colors.danger),
                size: 12, opacity: 0.8, line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout, height: 450,
              xaxis: { ...defaultLayout.xaxis, title: 'Daily Revenue (USD)', type: 'log' },
              yaxis: { ...defaultLayout.yaxis, title: 'Earnings Margin (%)' },
              shapes: [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, line: { color: '#9CA3AF', dash: 'dash' } }],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}


      <NarrativeBox title={valuationsNarrative.title}>
        {valuationsNarrative.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>
    </div>
  )
}
