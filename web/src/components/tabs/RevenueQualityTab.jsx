import { useState, useEffect } from 'react'
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

  if (loading) return <LoadingSpinner message="Loading revenue quality data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  const feesProtocols = data?.fees?.protocols || []
  const totalRevenue24h = data?.fees?.totalRevenue24h || 0
  const totalDataChartBreakdown = data?.fees?.totalDataChartBreakdown || []

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

  // Calculate share percentages
  const exchangeShare = ((sectorRevenue['Exchanges'] || 0) / totalSectorRevenue) * 100
  const stablecoinShare = ((sectorRevenue['Stablecoins'] || 0) / totalSectorRevenue) * 100

  // Market share percentages for bar chart
  const sectorMarketShare = sortedSectors.map(([sector, revenue]) => ({
    sector,
    revenue,
    share: (revenue / totalSectorRevenue) * 100,
  }))

  // Sector revenue over time (stacked area) from totalDataChartBreakdown
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

  // Build traces for stacked area
  const uniqueDates = [...new Set(dates)]
  const sectorAreaTraces = Object.entries(sectorTimeSeries)
    .sort((a, b) => {
      const sumA = a[1].reduce((s, d) => s + d.value, 0)
      const sumB = b[1].reduce((s, d) => s + d.value, 0)
      return sumB - sumA
    })
    .slice(0, 8) // Top 8 sectors
    .map((entry, i) => {
      const [sector, dataPoints] = entry
      const dateMap = {}
      dataPoints.forEach(d => { dateMap[d.date] = d.value })
      return {
        x: uniqueDates,
        y: uniqueDates.map(d => dateMap[d] || 0),
        type: 'scatter',
        mode: 'lines',
        name: sector,
        stackgroup: 'one',
        fillcolor: colors.palette[i % colors.palette.length] + '80',
        line: { color: colors.palette[i % colors.palette.length], width: 0 },
        hovertemplate: `${sector}<br>%{x}<br>$%{y:,.0f}<extra></extra>`,
      }
    })

  // Protocol scatter by category
  const scatterProtocols = feesProtocols
    .filter(p => p.total24h > 1000)
    .map(p => ({
      name: p.name || p.slug,
      revenue24h: p.total24h,
      category: p.category || 'Other',
      sector: categorizeSector(p.category || 'Other'),
    }))
    .sort((a, b) => b.revenue24h - a.revenue24h)
    .slice(0, 80)

  const scatterSectors = [...new Set(scatterProtocols.map(p => p.sector))]
  const sectorColorMap = {}
  scatterSectors.forEach((sector, i) => { sectorColorMap[sector] = colors.palette[i % colors.palette.length] })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Revenue (24h)" value={formatCurrency(totalRevenue24h)} subtitle="All protocols" />
        <KPICard title="Stablecoin Market Cap" value={formatCurrency(totalStablecoinMcap)} subtitle="Total circulating" />
        <KPICard title="Exchange Share" value={formatPercent(exchangeShare)} subtitle="of total revenue" />
        <KPICard title="Stablecoin Share" value={formatPercent(stablecoinShare)} subtitle="of total revenue" />
      </div>

      <ChartCard title="Revenue Market Share by Sector" subtitle="Percentage breakdown of 24h protocol revenue by sector">
        <Plot
          data={[{
            x: sectorMarketShare.map(s => s.sector),
            y: sectorMarketShare.map(s => s.share),
            type: 'bar',
            marker: { color: sectorMarketShare.map((_, i) => colors.palette[i % colors.palette.length]) },
            hovertemplate: '%{x}<br>%{y:.1f}%<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 350,
            yaxis: { ...defaultLayout.yaxis, title: 'Market Share (%)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      <ChartCard title="Sector Revenue Over Time" subtitle="Stacked area chart — daily revenue breakdown by sector">
        <Plot
          data={sectorAreaTraces}
          layout={{
            ...defaultLayout,
            height: 450,
            yaxis: { ...defaultLayout.yaxis, title: 'Daily Revenue (USD)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      <ChartCard title="Stablecoin Market Cap Rankings" subtitle="Top 10 stablecoins by circulating supply">
        <Plot
          data={[{
            x: top10Stablecoins.map(s => s.name),
            y: top10Stablecoins.map(s => s.circulating?.peggedUSD || 0),
            type: 'bar',
            marker: { color: top10Stablecoins.map((_, i) => colors.palette[i % colors.palette.length]) },
            hovertemplate: '%{x}<br>$%{y:,.0f}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -30 },
            yaxis: { ...defaultLayout.yaxis, title: 'Market Cap (USD)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      <ChartCard title="Protocol Revenue by Category" subtitle="Each dot is a protocol — grouped by sector · Size = revenue">
        <Plot
          data={scatterSectors.map(sector => {
            const pts = scatterProtocols.filter(p => p.sector === sector)
            return {
              x: pts.map((_, i) => i),
              y: pts.map(p => p.revenue24h),
              text: pts.map(p => `${p.name}<br>$${p.revenue24h.toLocaleString()}`),
              mode: 'markers',
              type: 'scatter',
              name: sector,
              marker: {
                color: sectorColorMap[sector],
                size: pts.map(p => Math.max(8, Math.min(35, Math.sqrt(p.revenue24h / 1000) * 2))),
                opacity: 0.75,
                line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
            }
          })}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Protocol Index', showticklabels: false },
            yaxis: { ...defaultLayout.yaxis, title: 'Revenue (USD, 24h)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.12 },
          }}
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
