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
    const totalFees24h = data?.fees?.total24h || feesProtocols.reduce((s, p) => s + (p.total24h || 0), 0)
    const revenueProtocols = data?.feesRevenue?.protocols || []
    const totalRevenue24h = data?.feesRevenue?.total24h || revenueProtocols.reduce((s, p) => s + (p.total24h || 0), 0)
    const totalDataChartBreakdown = data?.fees?.totalDataChartBreakdown || []

    // Revenue protocols lookup (per-protocol take rate)
    const revLookup = {}
    revenueProtocols.forEach(p => { if (p.slug) revLookup[p.slug.toLowerCase()] = p })

    // Compute take rate per protocol
    const protocolsWithTakeRate = feesProtocols
      .filter(p => p.total24h > 0)
      .map(p => {
        const rev = revLookup[(p.slug || '').toLowerCase()]
        const revenue = rev?.total24h || 0
        const takeRate = p.total24h > 0 ? (revenue / p.total24h) * 100 : 0
        return {
          name: p.name || p.slug, slug: p.slug,
          fees: p.total24h, revenue, takeRate,
          category: p.category || 'Other',
          sector: categorizeSector(p.category || 'Other'),
        }
      })
      .sort((a, b) => b.fees - a.fees)

    const withValidTR = protocolsWithTakeRate.filter(p => p.takeRate > 0 && p.takeRate <= 100)
    const medianTakeRate = withValidTR.length > 0
      ? withValidTR.map(p => p.takeRate).sort((a, b) => a - b)[Math.floor(withValidTR.length / 2)] : null
    const highTakeRate = withValidTR.filter(p => p.takeRate > 50).length
    const lowTakeRate = withValidTR.filter(p => p.takeRate <= 50).length
    const top20 = protocolsWithTakeRate.filter(p => p.revenue > 0).slice(0, 20)

    // Stablecoin data
    const stablecoins = data?.stablecoins?.peggedAssets || []
    const totalStablecoinMcap = stablecoins.reduce((sum, s) => sum + (s.circulating?.peggedUSD || 0), 0)
    const top10Stablecoins = [...stablecoins]
      .sort((a, b) => (b.circulating?.peggedUSD || 0) - (a.circulating?.peggedUSD || 0))
      .slice(0, 10)

    // Sector revenue breakdown
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
      feesProtocols, totalFees24h, totalRevenue24h,
      protocolsWithTakeRate, top20, medianTakeRate, highTakeRate, lowTakeRate,
      totalStablecoinMcap, top10Stablecoins,
      sortedSectors, totalSectorRevenue, sectorTimeSeries, uniqueDates,
    }
  }, [data])

  if (loading) return <LoadingSpinner message="Loading revenue quality data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>
  if (!processed) return <div className="text-center py-20">No data available</div>

  const {
    feesProtocols, totalFees24h, totalRevenue24h,
    protocolsWithTakeRate, top20, medianTakeRate, highTakeRate, lowTakeRate,
    totalStablecoinMcap, top10Stablecoins,
    sortedSectors, totalSectorRevenue, sectorTimeSeries, uniqueDates,
  } = processed

  const overallTakeRate = totalFees24h > 0 ? (totalRevenue24h / totalFees24h) * 100 : null

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
        {feesProtocols.length.toLocaleString()} DeFiLlama protocols
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard title="Total Fees (24h)" value={formatCurrency(totalFees24h)} subtitle="DeFiLlama" />
        <KPICard title="Protocol Revenue (24h)" value={formatCurrency(totalRevenue24h)} subtitle="After supply-side" />
        <KPICard title="Overall Take Rate" value={overallTakeRate ? formatPercent(overallTakeRate) : '—'} subtitle="Revenue / Fees" />
        <KPICard title="Median Take Rate" value={medianTakeRate ? formatPercent(medianTakeRate) : '—'} subtitle="Per protocol" />
        <KPICard title="High Take Rate" value={highTakeRate} subtitle=">50% of fees kept" />
        <KPICard title="Low Take Rate" value={lowTakeRate} subtitle="≤50% of fees kept" />
      </div>

      {top20.length > 0 && (
        <ChartCard title="Fees vs Revenue — Take Rate" subtitle="Top 20 protocols · Fees (paid by users) vs Revenue (kept by protocol)"
          csvData={{ filename: 'fees-vs-revenue-take-rate', headers: ['Protocol','Fees24h','Revenue24h','TakeRate%','Sector'], rows: top20.map(p => [p.name, p.fees, p.revenue, p.takeRate.toFixed(1), p.sector]) }}>
          <Plot
            data={[
              { x: top20.map(p => p.name), y: top20.map(p => p.fees), type: 'bar', name: 'Fees', marker: { color: colors.palette[0] }, hovertemplate: '%{x}<br>Fees: $%{y:,.0f}<extra></extra>' },
              { x: top20.map(p => p.name), y: top20.map(p => p.revenue), type: 'bar', name: 'Revenue', marker: { color: colors.palette[1] }, hovertemplate: '%{x}<br>Revenue: $%{y:,.0f}<extra></extra>' },
            ]}
            layout={{
              ...defaultLayout, height: 480, barmode: 'group',
              xaxis: { ...defaultLayout.xaxis, tickangle: -45, type: 'category' },
              yaxis: { ...defaultLayout.yaxis, title: 'USD (daily)' },
              legend: { ...defaultLayout.legend, orientation: 'h', y: -0.2 },
            }}
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      {protocolsWithTakeRate.length > 0 && (
        <ChartCard title="Take Rate Distribution" subtitle={`${protocolsWithTakeRate.filter(p => p.takeRate > 0 && p.takeRate <= 100).length} protocols — how much of user-paid fees does the protocol keep?`}
          csvData={{ filename: 'take-rate-distribution', headers: ['Protocol','Fees24h','Revenue24h','TakeRate%','Sector'], rows: protocolsWithTakeRate.filter(p => p.takeRate > 0 && p.takeRate <= 100).map(p => [p.name, p.fees, p.revenue, p.takeRate.toFixed(1), p.sector]) }}>
          <Plot
            data={[{
              x: protocolsWithTakeRate.filter(p => p.takeRate > 0 && p.takeRate <= 100).map(p => p.takeRate),
              type: 'histogram', nbinsx: 20,
              marker: { color: colors.primary + 'A0' },
              hovertemplate: 'Take Rate: %{x:.0f}%<br>Count: %{y}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout, height: 350, bargap: 0.05,
              xaxis: { ...defaultLayout.xaxis, title: 'Take Rate (%)', range: [0, 100], type: 'linear' },
              yaxis: { ...defaultLayout.yaxis, title: 'Number of Protocols' },
              shapes: [{ type: 'line', x0: 50, x1: 50, y0: 0, y1: 1, yref: 'paper', line: { color: '#9CA3AF', dash: 'dash', width: 2 } }],
            }}
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      <ChartCard title="Revenue Market Share by Sector" subtitle={`${sortedSectors.length} sectors — ${feesProtocols.length.toLocaleString()} protocols`}
        csvData={{ filename: 'sector-revenue-share', headers: ['Sector','Revenue24h','MarketShare%'], rows: sortedSectors.map(s => [s[0], s[1], ((s[1] / totalSectorRevenue) * 100).toFixed(1)]) }}>
        <Plot
          data={[{
            x: sortedSectors.map(s => s[0]),
            y: sortedSectors.map(s => (s[1] / totalSectorRevenue) * 100),
            type: 'bar',
            marker: { color: sortedSectors.map((_, i) => colors.palette[i % colors.palette.length]) },
            hovertemplate: '%{x}<br>%{y:.1f}%<extra></extra>',
          }]}
          layout={{ ...defaultLayout, height: 350, xaxis: { ...defaultLayout.xaxis, type: 'category' }, yaxis: { ...defaultLayout.yaxis, title: 'Market Share (%)' } }}
          config={defaultConfig} className="w-full"
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
            config={defaultConfig} className="w-full"
          />
        </ChartCard>
      )}

      <ChartCard title="Stablecoin Market Cap Rankings" subtitle="Top 10 stablecoins by circulating supply"
        csvData={{ filename: 'stablecoin-rankings', headers: ['Stablecoin','MarketCap'], rows: top10Stablecoins.map(s => [s.name, s.circulating?.peggedUSD || 0]) }}>
        <Plot
          data={[{
            x: top10Stablecoins.map(s => s.name),
            y: top10Stablecoins.map(s => s.circulating?.peggedUSD || 0),
            type: 'bar',
            marker: { color: top10Stablecoins.map((_, i) => colors.palette[i % colors.palette.length]) },
            hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
          }]}
          layout={{ ...defaultLayout, height: 380, xaxis: { ...defaultLayout.xaxis, tickangle: -30, type: 'category' }, yaxis: { ...defaultLayout.yaxis, title: 'Market Cap (USD)' } }}
          config={defaultConfig} className="w-full"
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
