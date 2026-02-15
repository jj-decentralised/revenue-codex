import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchRiskPremiumData } from '../../services/api'
import { formatPercent, formatCurrency, formatNumber } from '../../utils/helpers'
import { riskPremiumNarrative } from '../../data/narratives'

export default function RiskPremiumTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchRiskPremiumData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Process all data with useMemo
  const processedData = useMemo(() => {
    if (!data) return null

    const { pools, treasuryYield, fees } = data
    const riskFreeRate = treasuryYield || 4.5

    // Filter stablecoin pools with TVL > $100K and valid APY
    const stablecoinPools = pools
      .filter(p => 
        p.stablecoin === true && 
        p.tvlUsd > 100000 && 
        p.apy !== null && 
        p.apy !== undefined && 
        !isNaN(p.apy) && 
        p.apy >= 0 && 
        p.apy < 500 // Cap at 500% to filter outliers
      )

    // Calculate risk premiums (APY - Treasury Rate)
    const poolsWithPremium = stablecoinPools.map(p => ({
      ...p,
      riskPremium: p.apy - riskFreeRate,
      riskPremiumBps: (p.apy - riskFreeRate) * 100,
    }))

    // Risk premium distribution stats
    const premiums = poolsWithPremium.map(p => p.riskPremium).sort((a, b) => a - b)
    const meanPremium = premiums.reduce((a, b) => a + b, 0) / premiums.length
    const medianPremium = premiums[Math.floor(premiums.length / 2)]
    const variance = premiums.reduce((sum, p) => sum + Math.pow(p - meanPremium, 2), 0) / premiums.length
    const stdDev = Math.sqrt(variance)

    // 1. Risk Premium Distribution - buckets for histogram
    const premiumBuckets = [
      { label: '<-2%', min: -100, max: -2, count: 0, tvl: 0 },
      { label: '-2% to 0%', min: -2, max: 0, count: 0, tvl: 0 },
      { label: '0-2%', min: 0, max: 2, count: 0, tvl: 0 },
      { label: '2-5%', min: 2, max: 5, count: 0, tvl: 0 },
      { label: '5-10%', min: 5, max: 10, count: 0, tvl: 0 },
      { label: '10-20%', min: 10, max: 20, count: 0, tvl: 0 },
      { label: '20-50%', min: 20, max: 50, count: 0, tvl: 0 },
      { label: '50%+', min: 50, max: 1000, count: 0, tvl: 0 },
    ]

    poolsWithPremium.forEach(p => {
      const bucket = premiumBuckets.find(b => p.riskPremium >= b.min && p.riskPremium < b.max)
      if (bucket) {
        bucket.count++
        bucket.tvl += p.tvlUsd || 0
      }
    })

    // 2. Risk Premium by Chain
    const chainData = {}
    poolsWithPremium.forEach(p => {
      const chain = p.chain || 'Unknown'
      if (!chainData[chain]) chainData[chain] = []
      chainData[chain].push(p.riskPremium)
    })

    const chainStats = Object.entries(chainData)
      .filter(([_, premiums]) => premiums.length >= 10)
      .map(([chain, premiums]) => {
        const sorted = premiums.sort((a, b) => a - b)
        return {
          chain,
          min: Math.max(sorted[0], -10),
          q1: sorted[Math.floor(sorted.length * 0.25)],
          median: sorted[Math.floor(sorted.length * 0.5)],
          q3: sorted[Math.floor(sorted.length * 0.75)],
          max: Math.min(sorted[sorted.length - 1], 50),
          count: sorted.length,
        }
      })
      .sort((a, b) => b.median - a.median)
      .slice(0, 12)

    // 3. Risk Premium by Protocol Category
    const categoryData = {}
    poolsWithPremium.forEach(p => {
      const category = p.project ? categorizeProtocol(p.project) : 'Other'
      if (!categoryData[category]) categoryData[category] = []
      categoryData[category].push(p.riskPremium)
    })

    const categoryStats = Object.entries(categoryData)
      .filter(([_, premiums]) => premiums.length >= 5)
      .map(([category, premiums]) => {
        const sorted = premiums.sort((a, b) => a - b)
        return {
          category,
          min: Math.max(sorted[0], -10),
          q1: sorted[Math.floor(sorted.length * 0.25)],
          median: sorted[Math.floor(sorted.length * 0.5)],
          q3: sorted[Math.floor(sorted.length * 0.75)],
          max: Math.min(sorted[sorted.length - 1], 50),
          count: sorted.length,
        }
      })
      .sort((a, b) => b.median - a.median)
      .slice(0, 10)

    // 4. TVL-Weighted Risk Premium (scatter with regression)
    const tvlPremiumScatter = poolsWithPremium
      .filter(p => p.tvlUsd > 100000 && p.apy > 0 && p.apy < 100)
      .slice(0, 500)

    // Simple linear regression on log(TVL) vs APY
    const logTvls = tvlPremiumScatter.map(p => Math.log10(p.tvlUsd))
    const apys = tvlPremiumScatter.map(p => p.apy)
    const { slope, intercept, rSquared } = linearRegression(logTvls, apys)

    // 5. Efficient Frontier - APY volatility proxy using spread within project
    const projectData = {}
    poolsWithPremium.forEach(p => {
      const project = p.project || 'Unknown'
      if (!projectData[project]) projectData[project] = { pools: [], tvl: 0 }
      projectData[project].pools.push(p)
      projectData[project].tvl += p.tvlUsd || 0
    })

    const efficientPools = Object.entries(projectData)
      .filter(([_, data]) => data.pools.length >= 2 && data.tvl > 1e6)
      .map(([project, data]) => {
        const apys = data.pools.map(p => p.apy)
        const avgApy = apys.reduce((a, b) => a + b, 0) / apys.length
        const variance = apys.reduce((sum, a) => sum + Math.pow(a - avgApy, 2), 0) / apys.length
        const volatility = Math.sqrt(variance)
        return {
          project,
          avgApy,
          volatility: Math.max(volatility, 0.1), // Minimum volatility
          tvl: data.tvl,
          poolCount: data.pools.length,
          sharpeProxy: volatility > 0 ? (avgApy - riskFreeRate) / volatility : 0,
        }
      })
      .filter(p => p.volatility > 0 && p.avgApy > 0 && p.avgApy < 100)
      .sort((a, b) => b.sharpeProxy - a.sharpeProxy)

    const top10Efficient = efficientPools.slice(0, 10)

    // 6. DeFi Sharpe Ratio by Protocol
    const sharpeByProtocol = efficientPools
      .filter(p => p.tvl > 1e6 && p.poolCount >= 3)
      .sort((a, b) => b.sharpeProxy - a.sharpeProxy)
      .slice(0, 20)

    // 7. Risk Premium Term Structure (by lockup proxy using exposure/ilRisk)
    const termStructure = [
      { term: 'Flexible (No IL)', pools: poolsWithPremium.filter(p => p.ilRisk === 'no') },
      { term: 'Low Risk', pools: poolsWithPremium.filter(p => p.ilRisk === 'yes' && !p.exposure?.includes('multi')) },
      { term: 'Multi-Asset', pools: poolsWithPremium.filter(p => p.exposure?.includes('multi')) },
    ].map(bucket => ({
      term: bucket.term,
      avgPremium: bucket.pools.length > 0 
        ? bucket.pools.reduce((sum, p) => sum + p.riskPremium, 0) / bucket.pools.length 
        : 0,
      count: bucket.pools.length,
    })).filter(b => b.count > 10)

    // 8. Risk Premium vs Protocol TVL
    const protocolTvlData = {}
    poolsWithPremium.forEach(p => {
      const project = p.project || 'Unknown'
      if (!protocolTvlData[project]) protocolTvlData[project] = { tvl: 0, premiums: [] }
      protocolTvlData[project].tvl += p.tvlUsd || 0
      protocolTvlData[project].premiums.push(p.riskPremium)
    })

    const protocolScatter = Object.entries(protocolTvlData)
      .filter(([_, data]) => data.tvl > 1e6 && data.premiums.length >= 2)
      .map(([project, data]) => ({
        project,
        tvl: data.tvl,
        medianPremium: data.premiums.sort((a, b) => a - b)[Math.floor(data.premiums.length / 2)],
        avgPremium: data.premiums.reduce((a, b) => a + b, 0) / data.premiums.length,
        poolCount: data.premiums.length,
      }))
      .filter(p => p.medianPremium > -20 && p.medianPremium < 100)
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 100)

    // KPIs for large vs small pools
    const largePools = poolsWithPremium.filter(p => p.tvlUsd > 100e6)
    const smallPools = poolsWithPremium.filter(p => p.tvlUsd < 1e6 && p.tvlUsd > 100000)
    const largePoolAvgPremium = largePools.length > 0 
      ? largePools.reduce((sum, p) => sum + p.riskPremium, 0) / largePools.length 
      : 0
    const smallPoolAvgPremium = smallPools.length > 0 
      ? smallPools.reduce((sum, p) => sum + p.riskPremium, 0) / smallPools.length 
      : 0

    return {
      poolsWithPremium,
      riskFreeRate,
      meanPremium,
      medianPremium,
      stdDev,
      premiumBuckets,
      chainStats,
      categoryStats,
      tvlPremiumScatter,
      regression: { slope, intercept, rSquared },
      efficientPools,
      top10Efficient,
      sharpeByProtocol,
      termStructure,
      protocolScatter,
      totalPools: poolsWithPremium.length,
      largePoolAvgPremium,
      smallPoolAvgPremium,
    }
  }, [data])

  if (loading) return <LoadingSpinner message="Loading risk premium data across all DeFi pools..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>
  if (!processedData) return <div className="text-center py-20">No data available</div>

  const {
    riskFreeRate,
    meanPremium,
    medianPremium,
    stdDev,
    premiumBuckets,
    chainStats,
    categoryStats,
    tvlPremiumScatter,
    regression,
    efficientPools,
    top10Efficient,
    sharpeByProtocol,
    termStructure,
    protocolScatter,
    totalPools,
    largePoolAvgPremium,
    smallPoolAvgPremium,
  } = processedData

  // Dynamic narrative
  const dynamicNarrative = riskPremiumNarrative.paragraphs.map(p =>
    p.replace('{totalPools}', formatNumber(totalPools, 0))
      .replace('{medianPremium}', (medianPremium * 100).toFixed(0))
      .replace('{largePoolPremium}', formatPercent(largePoolAvgPremium))
      .replace('{smallPoolPremium}', formatPercent(smallPoolAvgPremium))
  )

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Risk-Free Rate"
          value={formatPercent(riskFreeRate)}
          subtitle="13-week T-Bill"
        />
        <KPICard
          title="Median Risk Premium"
          value={`${(medianPremium * 100).toFixed(0)} bps`}
          subtitle="vs Treasury"
          trend={medianPremium > 0 ? medianPremium * 100 : undefined}
        />
        <KPICard
          title="Mean Risk Premium"
          value={formatPercent(meanPremium)}
          subtitle={`σ = ${formatPercent(stdDev)}`}
        />
        <KPICard
          title="Pools Analyzed"
          value={formatNumber(totalPools, 0)}
          subtitle="Stablecoins, TVL >$100K"
        />
      </div>

      {/* 1. Risk Premium Distribution Histogram */}
      <ChartCard 
        title="Risk Premium Distribution — THE Crypto Risk Premium" 
        subtitle="Histogram of (Pool APY - Treasury Rate) for all stablecoin pools with TVL >$100K"
      >
        <Plot
          data={[
            {
              x: premiumBuckets.map(b => b.label),
              y: premiumBuckets.map(b => b.count),
              type: 'bar',
              name: 'Pool Count',
              marker: { color: colors.primary },
              hovertemplate: '%{x}<br>%{y} pools<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, title: 'Risk Premium (APY - Treasury)' },
            yaxis: { ...defaultLayout.yaxis, title: 'Number of Pools' },
            annotations: [
              {
                x: '2-5%',
                y: Math.max(...premiumBuckets.map(b => b.count)) * 0.95,
                text: `Mean: ${formatPercent(meanPremium)}<br>Median: ${formatPercent(medianPremium)}<br>Std Dev: ${formatPercent(stdDev)}`,
                showarrow: false,
                font: { size: 11, color: '#E5E7EB' },
                align: 'left',
                bgcolor: 'rgba(17,24,39,0.8)',
                borderpad: 6,
              },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 2. Risk Premium by Chain - Box Plot Style */}
      <ChartCard 
        title="Risk Premium by Chain" 
        subtitle="Which blockchains command higher risk premiums? Box-plot showing distribution per chain"
      >
        <Plot
          data={[
            // Q1 to Q3 range
            {
              x: chainStats.map(c => c.chain),
              y: chainStats.map(c => c.q1),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.primary, size: 8, symbol: 'line-ew', line: { width: 2 } },
              name: 'Q1',
              hovertemplate: '%{x}: %{y:.1f}% (Q1)<extra></extra>',
            },
            {
              x: chainStats.map(c => c.chain),
              y: chainStats.map(c => c.q3),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.primary, size: 8, symbol: 'line-ew', line: { width: 2 } },
              name: 'Q3',
              hovertemplate: '%{x}: %{y:.1f}% (Q3)<extra></extra>',
            },
            // Median
            {
              x: chainStats.map(c => c.chain),
              y: chainStats.map(c => c.median),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.warning, size: 14, symbol: 'diamond' },
              name: 'Median Premium',
              hovertemplate: '%{x}: %{y:.1f}% (Median)<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            yaxis: { ...defaultLayout.yaxis, title: 'Risk Premium (%)', range: [-5, 30] },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.1 },
            shapes: [
              {
                type: 'line',
                x0: -0.5,
                x1: chainStats.length - 0.5,
                y0: 0,
                y1: 0,
                line: { color: colors.danger, width: 2, dash: 'dash' },
              },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 3. Risk Premium by Protocol Category */}
      <ChartCard 
        title="Risk Premium by Protocol Category" 
        subtitle="Lending vs DEX LP vs Staking vs CDP — which categories demand higher premiums?"
      >
        <Plot
          data={[
            {
              x: categoryStats.map(c => c.category),
              y: categoryStats.map(c => c.q1),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.secondary, size: 8, symbol: 'line-ew', line: { width: 2 } },
              name: 'Q1',
              hovertemplate: '%{x}: %{y:.1f}% (Q1)<extra></extra>',
            },
            {
              x: categoryStats.map(c => c.category),
              y: categoryStats.map(c => c.q3),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.secondary, size: 8, symbol: 'line-ew', line: { width: 2 } },
              name: 'Q3',
              hovertemplate: '%{x}: %{y:.1f}% (Q3)<extra></extra>',
            },
            {
              x: categoryStats.map(c => c.category),
              y: categoryStats.map(c => c.median),
              type: 'scatter',
              mode: 'markers',
              marker: { color: colors.success, size: 14, symbol: 'diamond' },
              name: 'Median Premium',
              hovertemplate: '%{x}: %{y:.1f}% (Median)<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 420,
            xaxis: { ...defaultLayout.xaxis, tickangle: -30 },
            yaxis: { ...defaultLayout.yaxis, title: 'Risk Premium (%)', range: [-5, 40] },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.1 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 4. TVL-Weighted Risk Premium Scatter */}
      <ChartCard 
        title="TVL-Weighted Risk Premium — Scale Effect" 
        subtitle={`Larger pools = lower APY · R² = ${regression.rSquared.toFixed(3)} · Slope = ${regression.slope.toFixed(2)}%/decade`}
      >
        <Plot
          data={[
            {
              x: tvlPremiumScatter.map(p => p.tvlUsd),
              y: tvlPremiumScatter.map(p => p.apy),
              text: tvlPremiumScatter.map(p => `${p.symbol || p.pool}<br>${p.chain}<br>APY: ${p.apy.toFixed(2)}%<br>TVL: ${formatCurrency(p.tvlUsd)}`),
              type: 'scatter',
              mode: 'markers',
              name: 'Pools',
              marker: {
                color: tvlPremiumScatter.map(p => p.apy - riskFreeRate > 0 ? colors.success : colors.danger),
                size: 6,
                opacity: 0.5,
              },
              hovertemplate: '%{text}<extra></extra>',
            },
            // Regression line
            {
              x: [1e5, 1e10],
              y: [regression.intercept + regression.slope * 5, regression.intercept + regression.slope * 10],
              type: 'scatter',
              mode: 'lines',
              name: 'Trend',
              line: { color: colors.warning, width: 2, dash: 'dash' },
              hoverinfo: 'skip',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Total Value Locked (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'APY (%)', range: [0, 50] },
            shapes: [
              {
                type: 'line',
                x0: 1e5,
                x1: 1e10,
                y0: riskFreeRate,
                y1: riskFreeRate,
                line: { color: colors.muted, width: 1, dash: 'dot' },
              },
            ],
            annotations: [
              {
                x: Math.log10(1e9),
                y: riskFreeRate + 2,
                text: `Treasury: ${formatPercent(riskFreeRate)}`,
                showarrow: false,
                font: { size: 10, color: colors.muted },
              },
            ],
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 5. Efficient Frontier */}
      <ChartCard 
        title="DeFi Efficient Frontier" 
        subtitle="X = APY Volatility (spread proxy), Y = Avg APY · Top-left = best risk-adjusted yield"
      >
        <Plot
          data={[
            {
              x: efficientPools.slice(0, 80).map(p => p.volatility),
              y: efficientPools.slice(0, 80).map(p => p.avgApy),
              text: efficientPools.slice(0, 80).map(p => `${p.project}<br>Avg APY: ${p.avgApy.toFixed(2)}%<br>Volatility: ${p.volatility.toFixed(2)}%<br>TVL: ${formatCurrency(p.tvl)}<br>Sharpe: ${p.sharpeProxy.toFixed(2)}`),
              type: 'scatter',
              mode: 'markers',
              name: 'Protocols',
              marker: {
                color: efficientPools.slice(0, 80).map(p => p.sharpeProxy),
                colorscale: 'Viridis',
                size: efficientPools.slice(0, 80).map(p => Math.max(8, Math.min(25, Math.sqrt(p.tvl / 1e7) * 2))),
                opacity: 0.7,
                colorbar: { title: 'Sharpe', thickness: 15 },
              },
              hovertemplate: '%{text}<extra></extra>',
            },
            // Label top 10
            {
              x: top10Efficient.map(p => p.volatility),
              y: top10Efficient.map(p => p.avgApy),
              text: top10Efficient.map(p => p.project),
              type: 'scatter',
              mode: 'text',
              textposition: 'top center',
              textfont: { size: 9, color: '#E5E7EB' },
              hoverinfo: 'skip',
              showlegend: false,
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 500,
            xaxis: { ...defaultLayout.xaxis, title: 'APY Volatility (Spread Proxy, %)', range: [0, 30] },
            yaxis: { ...defaultLayout.yaxis, title: 'Average APY (%)', range: [0, 40] },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 6. DeFi Sharpe Ratio by Protocol */}
      <ChartCard 
        title="DeFi Sharpe Ratio Proxy by Protocol" 
        subtitle="(Median APY - Treasury) / APY Spread · Higher = better risk-adjusted returns"
      >
        <Plot
          data={[
            {
              y: sharpeByProtocol.map(p => p.project),
              x: sharpeByProtocol.map(p => p.sharpeProxy),
              type: 'bar',
              orientation: 'h',
              marker: {
                color: sharpeByProtocol.map(p => p.sharpeProxy > 1 ? colors.success : p.sharpeProxy > 0.5 ? colors.warning : colors.danger),
              },
              text: sharpeByProtocol.map(p => p.sharpeProxy.toFixed(2)),
              textposition: 'outside',
              textfont: { size: 10, color: '#E5E7EB' },
              hovertemplate: '%{y}<br>Sharpe: %{x:.2f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 550,
            xaxis: { ...defaultLayout.xaxis, title: 'DeFi Sharpe Ratio Proxy', range: [0, Math.max(...sharpeByProtocol.map(p => p.sharpeProxy)) * 1.2] },
            yaxis: { ...defaultLayout.yaxis, autorange: 'reversed', tickfont: { size: 10 } },
            margin: { ...defaultLayout.margin, l: 130 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 7. Risk Premium Term Structure */}
      {termStructure.length > 0 && (
        <ChartCard 
          title="Risk Premium Term Structure" 
          subtitle="Does DeFi have a yield curve? Average premium by risk profile"
        >
          <Plot
            data={[
              {
                x: termStructure.map(t => t.term),
                y: termStructure.map(t => t.avgPremium),
                type: 'bar',
                marker: { 
                  color: termStructure.map((_, i) => colors.palette[i % colors.palette.length]),
                },
                text: termStructure.map(t => `${t.avgPremium.toFixed(1)}%`),
                textposition: 'outside',
                textfont: { size: 12, color: '#E5E7EB' },
                hovertemplate: '%{x}<br>Avg Premium: %{y:.2f}%<extra></extra>',
              },
            ]}
            layout={{
              ...defaultLayout,
              height: 350,
              xaxis: { ...defaultLayout.xaxis, title: 'Risk Profile' },
              yaxis: { ...defaultLayout.yaxis, title: 'Average Risk Premium (%)' },
              annotations: termStructure.map((t, i) => ({
                x: t.term,
                y: -2,
                text: `n=${t.count}`,
                showarrow: false,
                font: { size: 9, color: colors.muted },
              })),
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* 8. Risk Premium vs Protocol TVL Scatter */}
      <ChartCard 
        title="Protocol Risk Premium vs TVL" 
        subtitle="Each dot = a protocol · X = Total Protocol TVL · Y = Median APY of its pools"
      >
        <Plot
          data={[
            {
              x: protocolScatter.map(p => p.tvl),
              y: protocolScatter.map(p => p.medianPremium + riskFreeRate), // Convert back to APY
              text: protocolScatter.map(p => `${p.project}<br>TVL: ${formatCurrency(p.tvl)}<br>Median APY: ${formatPercent(p.medianPremium + riskFreeRate)}<br>Pools: ${p.poolCount}`),
              type: 'scatter',
              mode: 'markers',
              marker: {
                color: protocolScatter.map(p => p.medianPremium > 5 ? colors.success : p.medianPremium > 0 ? colors.warning : colors.danger),
                size: protocolScatter.map(p => Math.max(8, Math.min(30, Math.sqrt(p.poolCount) * 3))),
                opacity: 0.7,
              },
              hovertemplate: '%{text}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Protocol Total TVL (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'Median Pool APY (%)', range: [0, 30] },
            shapes: [
              {
                type: 'line',
                x0: 1e6,
                x1: 1e11,
                y0: riskFreeRate,
                y1: riskFreeRate,
                line: { color: colors.warning, width: 2, dash: 'dash' },
              },
            ],
            annotations: [
              {
                x: Math.log10(5e9),
                y: riskFreeRate,
                text: `Treasury: ${formatPercent(riskFreeRate)}`,
                showarrow: false,
                font: { size: 11, color: colors.warning },
                yshift: -15,
              },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Narrative Box */}
      <NarrativeBox title={riskPremiumNarrative.title}>
        {dynamicNarrative.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>
    </div>
  )
}

// Helper: Categorize protocols by type
function categorizeProtocol(project) {
  const lendingProtocols = ['aave', 'compound', 'morpho', 'spark', 'venus', 'radiant', 'benqi', 'silo']
  const dexProtocols = ['uniswap', 'curve', 'balancer', 'velodrome', 'aerodrome', 'pancakeswap', 'sushiswap', 'camelot']
  const stakingProtocols = ['lido', 'rocketpool', 'frax', 'ankr', 'stader', 'mantle']
  const cdpProtocols = ['maker', 'liquity', 'prisma', 'crvusd']
  const yieldProtocols = ['yearn', 'convex', 'beefy', 'pendle', 'sommelier']

  const p = project.toLowerCase()
  if (lendingProtocols.some(l => p.includes(l))) return 'Lending'
  if (dexProtocols.some(d => p.includes(d))) return 'DEX LP'
  if (stakingProtocols.some(s => p.includes(s))) return 'Liquid Staking'
  if (cdpProtocols.some(c => p.includes(c))) return 'CDP'
  if (yieldProtocols.some(y => p.includes(y))) return 'Yield Aggregator'
  return 'Other'
}

// Helper: Simple linear regression
function linearRegression(x, y) {
  const n = x.length
  if (n === 0) return { slope: 0, intercept: 0, rSquared: 0 }
  
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0)
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0)
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0)
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  
  // R-squared
  const yMean = sumY / n
  const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0)
  const ssResidual = y.reduce((sum, yi, i) => sum + Math.pow(yi - (intercept + slope * x[i]), 2), 0)
  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0
  
  return { slope, intercept, rSquared: Math.max(0, rSquared) }
}
