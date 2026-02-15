import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchRevenueQualityData } from '../../services/api'
import { formatCurrency, formatPercent, categorizeSector } from '../../utils/helpers'
import { revenueQualityNarrative } from '../../data/narratives'

export default function RevenueQualityTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchRevenueQualityData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const processed = useMemo(() => {
    if (!data) return null

    const feesProtocols = data?.fees?.protocols || []
    const totalRevenue24h = data?.fees?.totalRevenue24h || 0
    const totalFees24h = data?.fees?.totalFees24h || 0
    const totalDataChartBreakdown = data?.fees?.totalDataChartBreakdown || []

    // Token Terminal income data
    const ttRevData = data?.ttFinancials?.revenue?.data || []
    const ttFeesData = data?.ttFinancials?.fees?.data || []
    const ttEarnData = data?.ttFinancials?.earnings?.data || []
    const ttIncentData = data?.ttFinancials?.token_incentives?.data || []

    // Build TT lookup
    const ttLookup = {}
    const addTT = (arr, field) => {
      if (!Array.isArray(arr)) return
      arr.forEach(d => {
        const id = d.project_id
        if (!id) return
        if (!ttLookup[id]) ttLookup[id] = { project_id: id, project_name: d.project_name }
        ttLookup[id][field] = d[field]
      })
    }
    addTT(ttRevData, 'revenue')
    addTT(ttFeesData, 'fees')
    addTT(ttEarnData, 'earnings')
    addTT(ttIncentData, 'token_incentives')

    const ttProjects = Object.values(ttLookup).filter(p => p.fees > 0)

    // Aggregate income metrics
    const totalTTFees = ttProjects.reduce((s, p) => s + (p.fees || 0), 0)
    const totalTTRevenue = ttProjects.reduce((s, p) => s + (p.revenue || 0), 0)
    const totalTTEarnings = ttProjects.reduce((s, p) => s + (p.earnings || 0), 0)
    const totalTTIncentives = ttProjects.reduce((s, p) => s + (p.token_incentives || 0), 0)
    const takeRate = totalTTFees > 0 ? (totalTTRevenue / totalTTFees) * 100 : null
    const earningsMargin = totalTTRevenue > 0 ? (totalTTEarnings / totalTTRevenue) * 100 : null
    const incentiveBurn = totalTTRevenue > 0 ? (totalTTIncentives / totalTTRevenue) * 100 : null

    // Top 20 by TT fees for income waterfall
    const top20TT = ttProjects.sort((a, b) => (b.fees || 0) - (a.fees || 0)).slice(0, 20)

    // Profitable vs unprofitable
    const profitable = ttProjects.filter(p => (p.earnings || 0) > 0)
    const unprofitable = ttProjects.filter(p => (p.earnings || 0) <= 0 && p.revenue > 0)

    // Stablecoin data
    const stablecoins = data?.stablecoins?.peggedAssets || []
    const totalStablecoinMcap = stablecoins.reduce((sum, s) => sum + (s.circulating?.peggedUSD || 0), 0)
    const top10Stablecoins = [...stablecoins]
      .sort((a, b) => (b.circulating?.peggedUSD || 0) - (a.circulating?.peggedUSD || 0))
      .slice(0, 10)

    // Sector revenue breakdown from DeFiLlama
    const sectorRevenue = {}
    feesProtocols.forEach(p => {
      const sector = categorizeSector(p.category || 'Other')
      sectorRevenue[sector] = (sectorRevenue[sector] || 0) + (p.total24h || 0)
    })
    const sortedSectors = Object.entries(sectorRevenue).sort((a, b) => b[1] - a[1])
    const totalSectorRevenue = sortedSectors.reduce((sum, s) => sum + s[1], 0)

    // Sector revenue over time (stacked area)
    const sectorTimeSeries = {}
    const dates = []
    totalDataChartBreakdown.forEach(([timestamp, breakdown]) => {
      const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0]
      dates.push(dateStr)
      Object.entries(breakdown || {}).forEach(([protocol, value]) => {
        const p = feesProtocols.find(fp => fp.slug === protocol || fp.name === protocol)
        const sector = categorizeSector(p?.category || 'Other')
        if (!sectorTimeSeries[sector]) sectorTimeSeries[sector] = []
        const lastIdx = sectorTimeSeries[sector].length - 1
        if (lastIdx >= 0 && sectorTimeSeries[sector][lastIdx].date === dateStr) {
          sectorTimeSeries[sector][lastIdx].value += value
        } else {
          sectorTimeSeries[sector].push({ date: dateStr, value })
        }
      })
    })
    const uniqueDates = [...new Set(dates)]

    return {
      feesProtocols, totalRevenue24h, totalFees24h,
      ttProjects, top20TT, profitable, unprofitable,
      totalTTFees, totalTTRevenue, totalTTEarnings, totalTTIncentives,
      takeRate, earningsMargin, incentiveBurn,
      stablecoins, totalStablecoinMcap, top10Stablecoins,
      sortedSectors, totalSectorRevenue, sectorTimeSeries, uniqueDates,
    }
  }, [data])

  if (loading) return <LoadingSpinner message="Loading revenue quality data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>
  if (!processed) return <div className="text-center py-20">No data available</div>

  const {
    feesProtocols, totalRevenue24h, totalFees24h,
    ttProjects, top20TT, profitable, unprofitable,
    totalTTFees, totalTTRevenue, totalTTEarnings, totalTTIncentives,
    takeRate, earningsMargin, incentiveBurn,
    totalStablecoinMcap, top10Stablecoins,
    sortedSectors, totalSectorRevenue, sectorTimeSeries, uniqueDates,
  } = processed

  const exchangeShare = ((sortedSectors.find(s => s[0] === 'Exchanges')?.[1] || 0) / totalSectorRevenue) * 100

  // Stacked area traces
  const sectorAreaTraces = Object.entries(sectorTimeSeries)
    .sort((a, b) => b[1].reduce((s, d) => s + d.value, 0) - a[1].reduce((s, d) => s + d.value, 0))
    .slice(0, 8)
    .map(([sector, dataPoints], i) => {
      const dateMap = {}
      dataPoints.forEach(d => { dateMap[d.date] = d.value })
      return {
        x: uniqueDates, y: uniqueDates.map(d => dateMap[d] || 0),
        type: 'scatter', mode: 'lines', name: sector, stackgroup: 'one',
        fillcolor: colors.palette[i % colors.palette.length] + '80',
        line: { color: colors.palette[i % colors.palette.length], width: 0 },
        hovertemplate: `${sector}<br>%{x}<br>$%{y:,.0f}<extra></extra>`,
      }
    })

  return (
    <div className="space-y-6">
      <div className="text-xs text-(--color-text-secondary) text-right">
        {feesProtocols.length.toLocaleString()} DeFiLlama protocols · {ttProjects.length} Token Terminal projects
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard title="Total Fees (24h)" value={formatCurrency(totalFees24h)} subtitle="DeFiLlama" />
        <KPICard title="Protocol Revenue (24h)" value={formatCurrency(totalRevenue24h)} subtitle="After supply-side" />
        <KPICard title="Take Rate" value={takeRate ? formatPercent(takeRate) : '—'} subtitle="Revenue / Fees (TT)" />
        <KPICard title="Earnings Margin" value={earningsMargin ? formatPercent(earningsMargin) : '—'} subtitle="Net / Revenue (TT)" />
        <KPICard title="Token Incentive Burn" value={incentiveBurn ? formatPercent(incentiveBurn) : '—'} subtitle="Incentives / Revenue" />
        <KPICard title="Profitable Projects" value={`${profitable.length} / ${ttProjects.length}`} subtitle="Positive earnings" />
      </div>

      {/* Income Waterfall: Fees → Revenue → Earnings (Token Terminal) */}
      {top20TT.length > 0 && (
        <ChartCard title="Income Decomposition — Fees → Revenue → Earnings" subtitle="Token Terminal Pro · Top 20 projects · Shows how fees convert to revenue and then to earnings">
          <Plot
            data={[
              { x: top20TT.map(p => p.project_name || p.project_id), y: top20TT.map(p => p.fees || 0), type: 'bar', name: 'Fees (total)', marker: { color: colors.palette[0] }, hovertemplate: '%{x}<br>Fees: $%{y:,.0f}<extra></extra>' },
              { x: top20TT.map(p => p.project_name || p.project_id), y: top20TT.map(p => p.revenue || 0), type: 'bar', name: 'Revenue (protocol)', marker: { color: colors.palette[1] }, hovertemplate: '%{x}<br>Revenue: $%{y:,.0f}<extra></extra>' },
              { x: top20TT.map(p => p.project_name || p.project_id), y: top20TT.map(p => p.earnings || 0), type: 'bar', name: 'Earnings (net)', marker: { color: top20TT.map(p => (p.earnings || 0) >= 0 ? colors.success : colors.danger) }, hovertemplate: '%{x}<br>Earnings: $%{y:,.0f}<extra></extra>' },
            ]}
            layout={{
              ...defaultLayout, height: 480, barmode: 'group',
              xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
              yaxis: { ...defaultLayout.yaxis, title: 'USD (daily)' },
              legend: { ...defaultLayout.legend, orientation: 'h', y: -0.2 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Earnings Margin Distribution */}
      {ttProjects.length > 0 && (
        <ChartCard title="Earnings Margin Distribution" subtitle={`${profitable.length} profitable (green) vs ${unprofitable.length} unprofitable (red) — Token Terminal`}>
          <Plot
            data={[{
              x: ttProjects.filter(p => p.revenue > 0).map(p => p.revenue > 0 ? (p.earnings / p.revenue) * 100 : 0),
              type: 'bar',
              name: 'Earnings Margin %',
              marker: { color: ttProjects.filter(p => p.revenue > 0).map(p => (p.earnings || 0) >= 0 ? colors.success + 'A0' : colors.danger + 'A0') },
              hovertemplate: 'Margin: %{x:.1f}%<extra></extra>',
              nbinsx: 30,
            }]}
            layout={{
              ...defaultLayout, height: 350, bargap: 0.05,
              xaxis: { ...defaultLayout.xaxis, title: 'Earnings Margin (%)' },
              yaxis: { ...defaultLayout.yaxis, title: 'Number of Projects' },
              shapes: [{ type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', line: { color: '#9CA3AF', dash: 'dash', width: 2 } }],
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      <ChartCard title="Revenue Market Share by Sector" subtitle={`${sortedSectors.length} sectors — ${feesProtocols.length.toLocaleString()} protocols`}>
        <Plot
          data={[{
            x: sortedSectors.map(s => s[0]),
            y: sortedSectors.map(s => (s[1] / totalSectorRevenue) * 100),
            type: 'bar',
            marker: { color: sortedSectors.map((_, i) => colors.palette[i % colors.palette.length]) },
            hovertemplate: '%{x}<br>%{y:.1f}%<extra></extra>',
          }]}
          layout={{ ...defaultLayout, height: 350, yaxis: { ...defaultLayout.yaxis, title: 'Market Share (%)' } }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {sectorAreaTraces.length > 0 && (
        <ChartCard title="Sector Revenue Over Time" subtitle="Stacked area — daily revenue breakdown by sector">
          <Plot
            data={sectorAreaTraces}
            layout={{
              ...defaultLayout, height: 450,
              yaxis: { ...defaultLayout.yaxis, title: 'Daily Revenue (USD)' },
              legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      <ChartCard title="Stablecoin Market Cap Rankings" subtitle="Top 10 stablecoins by circulating supply">
        <Plot
          data={[{
            x: top10Stablecoins.map(s => s.name),
            y: top10Stablecoins.map(s => s.circulating?.peggedUSD || 0),
            type: 'bar',
            marker: { color: top10Stablecoins.map((_, i) => colors.palette[i % colors.palette.length]) },
            hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
          }]}
          layout={{ ...defaultLayout, height: 380, xaxis: { ...defaultLayout.xaxis, tickangle: -30 }, yaxis: { ...defaultLayout.yaxis, title: 'Market Cap (USD)' } }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      <NarrativeBox title={revenueQualityNarrative.title}>
        {revenueQualityNarrative.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>

      <NarrativeBox title="Stablecoin Diversification">
        {revenueQualityNarrative.stablecoinDiversification.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>
    </div>
  )
}
