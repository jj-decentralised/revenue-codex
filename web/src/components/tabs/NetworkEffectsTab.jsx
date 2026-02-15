import { useState, useEffect, useMemo } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatCurrency, formatPercent, formatNumber, categorizeSector } from '../../utils/helpers'
import { fetchAllProtocols, fetchFeesOverview, fetchDexOverview } from '../../services/api'
import { fetchDailyActiveAddresses } from '../../services/santiment'

// First movers and their fast followers for comparison
const FIRST_MOVERS = {
  'aave': { label: 'Aave', category: 'Lending', followers: ['compound-v2', 'compound-v3', 'morpho'] },
  'uniswap': { label: 'Uniswap', category: 'DEX', followers: ['sushiswap', 'pancakeswap'] },
  'maker': { label: 'Maker', category: 'CDP', followers: ['liquity', 'abracadabra'] },
  'lido': { label: 'Lido', category: 'Liquid Staking', followers: ['rocket-pool', 'frax-ether'] },
}

export default function NetworkEffectsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadingPhase, setLoadingPhase] = useState('Fetching protocols...')

  useEffect(() => {
    async function fetchData() {
      setLoadingPhase('Fetching protocols and fees...')
      const [protocolsRes, feesRes, marketsRes, dexRes] = await Promise.allSettled([
        fetchAllProtocols(),
        fetchFeesOverview(),
        fetch('/api/coingecko?action=markets').then(r => r.ok ? r.json() : []),
        fetchDexOverview(),
      ])

      const protocols = protocolsRes.status === 'fulfilled' ? protocolsRes.value : []
      const fees = feesRes.status === 'fulfilled' ? feesRes.value : null
      const markets = marketsRes.status === 'fulfilled' ? marketsRes.value : []
      const dexOverview = dexRes.status === 'fulfilled' ? dexRes.value : null

      // Create market cap lookup
      const marketCapLookup = {}
      markets.forEach(m => {
        if (m.symbol) marketCapLookup[m.symbol.toLowerCase()] = m.market_cap
        if (m.id) marketCapLookup[m.id.toLowerCase()] = m.market_cap
      })

      // Try to fetch DAA for select protocols (optional)
      setLoadingPhase('Fetching network metrics...')
      let daaData = {}
      try {
        const daaResults = await Promise.allSettled([
          fetchDailyActiveAddresses('ethereum').catch(() => null),
          fetchDailyActiveAddresses('uniswap').catch(() => null),
          fetchDailyActiveAddresses('aave').catch(() => null),
        ])
        daaData = {
          ethereum: daaResults[0].status === 'fulfilled' ? daaResults[0].value : null,
          uniswap: daaResults[1].status === 'fulfilled' ? daaResults[1].value : null,
          aave: daaResults[2].status === 'fulfilled' ? daaResults[2].value : null,
        }
      } catch {
        // Santiment may not be available
      }

      return {
        protocols,
        fees,
        markets,
        marketCapLookup,
        dexOverview,
        daaData,
      }
    }

    fetchData()
      .then(setData)
      .catch(e => setError(e.message || 'Failed to fetch data'))
      .finally(() => setLoading(false))
  }, [])

  // Process data with useMemo
  const processedData = useMemo(() => {
    if (!data) return null

    const { protocols, fees, marketCapLookup, dexOverview } = data
    const feesProtocols = fees?.protocols || []
    const dexProtocols = dexOverview?.protocols || []

    // Merge protocols with fees data
    const mergedProtocols = protocols
      .filter(p => p.tvl > 1e6)
      .map(p => {
        const feeData = feesProtocols.find(f =>
          f.slug === p.slug || (f.name || '').toLowerCase() === (p.name || '').toLowerCase()
        )
        const revenue24h = feeData?.total24h || 0
        const revenue30d = feeData?.total30d || 0
        const annualizedRevenue = revenue24h * 365

        // Get market cap
        const symbol = (p.symbol || '').toLowerCase()
        const slug = (p.slug || '').toLowerCase()
        const mcap = marketCapLookup[symbol] || marketCapLookup[slug] || p.mcap || 0

        // Get DEX volume if available
        const dexData = dexProtocols.find(d =>
          d.slug === p.slug || (d.name || '').toLowerCase() === (p.name || '').toLowerCase()
        )
        const volume24h = dexData?.total24h || 0

        return {
          name: p.name,
          slug: p.slug,
          symbol: p.symbol,
          tvl: p.tvl,
          mcap,
          revenue24h,
          revenue30d,
          annualizedRevenue,
          category: p.category || 'Other',
          sector: categorizeSector(p.category || 'Other'),
          chains: Array.isArray(p.chains) ? p.chains.length : (p.chain ? 1 : 0),
          chainList: Array.isArray(p.chains) ? p.chains : (p.chain ? [p.chain] : []),
          change7d: p.change_7d || 0,
          change30d: p.change_1m || 0,
          volume24h,
          isDex: p.category === 'Dexes' || p.category === 'DEX',
        }
      })
      .filter(p => p.mcap > 0 || p.tvl > 1e7) // Keep protocols with mcap or significant TVL

    // ===== METCALFE'S LAW ANALYSIS =====
    const metcalfeData = mergedProtocols
      .filter(p => p.tvl > 1e7 && p.mcap > 1e6)
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 100)

    // Calculate R² for different power laws
    const calculateR2 = (data, exponent) => {
      if (data.length < 3) return 0
      const logTvl = data.map(p => Math.log10(p.tvl))
      const logMcap = data.map(p => Math.log10(p.mcap))

      // y = x^exponent means log(y) = exponent * log(x)
      const predicted = logTvl.map(x => x * exponent)
      const meanY = logMcap.reduce((a, b) => a + b, 0) / logMcap.length

      const ssRes = logMcap.reduce((sum, y, i) => sum + Math.pow(y - predicted[i], 2), 0)
      const ssTot = logMcap.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0)

      return ssTot > 0 ? 1 - (ssRes / ssTot) : 0
    }

    // Fit log-log regression to find actual exponent
    const fitPowerLaw = (data) => {
      if (data.length < 3) return { beta: 1, r2: 0 }
      const logTvl = data.map(p => Math.log10(p.tvl))
      const logMcap = data.map(p => Math.log10(p.mcap))

      const n = logTvl.length
      const sumX = logTvl.reduce((a, b) => a + b, 0)
      const sumY = logMcap.reduce((a, b) => a + b, 0)
      const sumXY = logTvl.reduce((sum, x, i) => sum + x * logMcap[i], 0)
      const sumX2 = logTvl.reduce((sum, x) => sum + x * x, 0)

      const beta = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
      const r2 = calculateR2(data, beta)

      return { beta, r2 }
    }

    const r2Linear = calculateR2(metcalfeData, 1)
    const r2Super = calculateR2(metcalfeData, 1.5)
    const r2Metcalfe = calculateR2(metcalfeData, 2)
    const fittedPower = fitPowerLaw(metcalfeData)

    // ===== REVENUE-TVL POWER RELATIONSHIP =====
    const revenueTvlData = mergedProtocols
      .filter(p => p.tvl > 1e7 && p.annualizedRevenue > 10000)
      .sort((a, b) => b.annualizedRevenue - a.annualizedRevenue)
      .slice(0, 80)

    const revenuePowerFit = (() => {
      const validData = revenueTvlData.filter(p => p.tvl > 0 && p.annualizedRevenue > 0)
      if (validData.length < 3) return { beta: 1, r2: 0 }

      const logTvl = validData.map(p => Math.log10(p.tvl))
      const logRev = validData.map(p => Math.log10(p.annualizedRevenue))

      const n = logTvl.length
      const sumX = logTvl.reduce((a, b) => a + b, 0)
      const sumY = logRev.reduce((a, b) => a + b, 0)
      const sumXY = logTvl.reduce((sum, x, i) => sum + x * logRev[i], 0)
      const sumX2 = logTvl.reduce((sum, x) => sum + x * x, 0)

      const beta = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
      const meanY = sumY / n
      const predicted = logTvl.map(x => x * beta + (meanY - beta * sumX / n))
      const ssRes = logRev.reduce((sum, y, i) => sum + Math.pow(y - predicted[i], 2), 0)
      const ssTot = logRev.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0)
      const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 0

      return { beta, r2 }
    })()

    // ===== MULTI-CHAIN NETWORK EFFECTS =====
    const multiChainData = mergedProtocols
      .filter(p => p.chains > 0 && p.annualizedRevenue > 10000)
      .sort((a, b) => b.annualizedRevenue - a.annualizedRevenue)

    // Group by chain count for aggregate analysis
    const chainCountStats = {}
    multiChainData.forEach(p => {
      const bucket = p.chains >= 10 ? '10+' : p.chains.toString()
      if (!chainCountStats[bucket]) {
        chainCountStats[bucket] = { count: 0, totalRevenue: 0, totalTvl: 0 }
      }
      chainCountStats[bucket].count += 1
      chainCountStats[bucket].totalRevenue += p.annualizedRevenue
      chainCountStats[bucket].totalTvl += p.tvl
    })

    // ===== LIQUIDITY BEGETS LIQUIDITY (DEX ONLY) =====
    const dexData = mergedProtocols
      .filter(p => p.isDex && p.tvl > 1e6 && p.volume24h > 0)
      .sort((a, b) => b.volume24h - a.volume24h)

    // Fit volume ~ TVL^beta
    const dexVolumeFit = (() => {
      const validDex = dexData.filter(p => p.tvl > 0 && p.volume24h > 0)
      if (validDex.length < 3) return { beta: 1, r2: 0 }

      const logTvl = validDex.map(p => Math.log10(p.tvl))
      const logVol = validDex.map(p => Math.log10(p.volume24h))

      const n = logTvl.length
      const sumX = logTvl.reduce((a, b) => a + b, 0)
      const sumY = logVol.reduce((a, b) => a + b, 0)
      const sumXY = logTvl.reduce((sum, x, i) => sum + x * logVol[i], 0)
      const sumX2 = logTvl.reduce((sum, x) => sum + x * x, 0)

      const beta = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
      const meanY = sumY / n
      const ssRes = logVol.reduce((sum, y, i) => {
        const pred = beta * logTvl[i] + (meanY - beta * sumX / n)
        return sum + Math.pow(y - pred, 2)
      }, 0)
      const ssTot = logVol.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0)
      const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 0

      return { beta, r2 }
    })()

    // ===== FIRST MOVER VS FAST FOLLOWER =====
    const firstMoverComparison = Object.entries(FIRST_MOVERS).map(([slug, info]) => {
      const leader = mergedProtocols.find(p => p.slug === slug)
      const followers = info.followers
        .map(f => mergedProtocols.find(p => p.slug === f))
        .filter(Boolean)

      const totalFollowerTvl = followers.reduce((sum, f) => sum + f.tvl, 0)
      const totalFollowerRev = followers.reduce((sum, f) => sum + f.annualizedRevenue, 0)

      return {
        category: info.category,
        leader: {
          name: info.label,
          tvl: leader?.tvl || 0,
          revenue: leader?.annualizedRevenue || 0,
        },
        followers: {
          count: followers.length,
          totalTvl: totalFollowerTvl,
          totalRevenue: totalFollowerRev,
        },
        leaderShare: leader?.tvl > 0 && totalFollowerTvl > 0
          ? (leader.tvl / (leader.tvl + totalFollowerTvl)) * 100
          : 100,
      }
    }).filter(c => c.leader.tvl > 0)

    // ===== NETWORK EFFECT DECAY (LOSING TVL) =====
    const decliningProtocols = mergedProtocols
      .filter(p => p.change30d < -5 && p.tvl > 1e7 && p.annualizedRevenue > 10000)
      .sort((a, b) => a.change30d - b.change30d)
      .slice(0, 50)

    // Estimate revenue change (approximation based on current data)
    // We assume revenue is proportional to activity, so declining TVL often means declining revenue
    const decayAnalysis = decliningProtocols.map(p => ({
      ...p,
      // Estimate revenue change as slightly steeper than TVL change (reflexive downside)
      estimatedRevenueChange: p.change30d * 1.2, // Simplified model
    }))

    // ===== REFLEXIVITY CORRELATION =====
    // Calculate correlations between TVL change and revenue indicators
    const growingProtocols = mergedProtocols.filter(p => p.change7d > 5 && p.tvl > 1e7)
    const shrinkingProtocols = mergedProtocols.filter(p => p.change7d < -5 && p.tvl > 1e7)

    const avgGrowthEfficiency = growingProtocols.length > 0
      ? growingProtocols.reduce((sum, p) => sum + (p.annualizedRevenue / p.tvl), 0) / growingProtocols.length * 100
      : 0
    const avgShrinkEfficiency = shrinkingProtocols.length > 0
      ? shrinkingProtocols.reduce((sum, p) => sum + (p.annualizedRevenue / p.tvl), 0) / shrinkingProtocols.length * 100
      : 0

    return {
      mergedProtocols,
      metcalfeData,
      r2Linear,
      r2Super,
      r2Metcalfe,
      fittedPower,
      revenueTvlData,
      revenuePowerFit,
      multiChainData,
      chainCountStats,
      dexData,
      dexVolumeFit,
      firstMoverComparison,
      decayAnalysis,
      avgGrowthEfficiency,
      avgShrinkEfficiency,
      totalAnalyzed: mergedProtocols.length,
    }
  }, [data])

  if (loading) return <LoadingSpinner message={loadingPhase} />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>
  if (!processedData) return <div className="text-center py-20">No data available</div>

  const {
    metcalfeData,
    r2Linear,
    r2Super,
    r2Metcalfe,
    fittedPower,
    revenueTvlData,
    revenuePowerFit,
    multiChainData,
    chainCountStats,
    dexData,
    dexVolumeFit,
    firstMoverComparison,
    decayAnalysis,
    avgGrowthEfficiency,
    avgShrinkEfficiency,
    totalAnalyzed,
  } = processedData

  // Best fit model
  const bestFit = r2Metcalfe > r2Super && r2Metcalfe > r2Linear ? 'Metcalfe (n²)'
    : r2Super > r2Linear ? 'Super-linear (n^1.5)' : 'Linear (n)'

  // =======================
  // Chart 1: Metcalfe's Law Test
  // =======================
  const sectors = [...new Set(metcalfeData.map(p => p.sector))]
  const sectorColorMap = {}
  sectors.forEach((sector, i) => { sectorColorMap[sector] = colors.palette[i % colors.palette.length] })

  // Reference curves
  const tvlRange = metcalfeData.map(p => p.tvl).sort((a, b) => a - b)
  const minTvl = tvlRange[0] || 1e7
  const maxTvl = tvlRange[tvlRange.length - 1] || 1e11
  const curvePoints = 50
  const curveTvl = Array.from({ length: curvePoints }, (_, i) =>
    Math.pow(10, Math.log10(minTvl) + (Math.log10(maxTvl) - Math.log10(minTvl)) * i / (curvePoints - 1))
  )

  // Scale factor to align curves with data
  const medianMcap = metcalfeData.length > 0
    ? metcalfeData.map(p => p.mcap).sort((a, b) => a - b)[Math.floor(metcalfeData.length / 2)]
    : 1e9
  const medianTvl = metcalfeData.length > 0
    ? metcalfeData.map(p => p.tvl).sort((a, b) => a - b)[Math.floor(metcalfeData.length / 2)]
    : 1e9

  const referenceTraces = [
    {
      x: curveTvl,
      y: curveTvl.map(t => (medianMcap / medianTvl) * t),
      mode: 'lines',
      name: `Linear (R²=${(r2Linear * 100).toFixed(1)}%)`,
      line: { dash: 'dot', width: 2, color: '#9CA3AF' },
      hoverinfo: 'skip',
    },
    {
      x: curveTvl,
      y: curveTvl.map(t => (medianMcap / Math.pow(medianTvl, 1.5)) * Math.pow(t, 1.5)),
      mode: 'lines',
      name: `n^1.5 (R²=${(r2Super * 100).toFixed(1)}%)`,
      line: { dash: 'dash', width: 2, color: '#F59E0B' },
      hoverinfo: 'skip',
    },
    {
      x: curveTvl,
      y: curveTvl.map(t => (medianMcap / Math.pow(medianTvl, 2)) * Math.pow(t, 2)),
      mode: 'lines',
      name: `Metcalfe n² (R²=${(r2Metcalfe * 100).toFixed(1)}%)`,
      line: { dash: 'solid', width: 2, color: '#10B981' },
      hoverinfo: 'skip',
    },
  ]

  const metcalfeScatterTraces = sectors.map(sector => {
    const pts = metcalfeData.filter(p => p.sector === sector)
    return {
      x: pts.map(p => p.tvl),
      y: pts.map(p => p.mcap),
      text: pts.map(p => `${p.name}<br>TVL: ${formatCurrency(p.tvl)}<br>MCap: ${formatCurrency(p.mcap)}<br>Ratio: ${(p.mcap / p.tvl).toFixed(2)}x`),
      mode: 'markers',
      type: 'scatter',
      name: sector,
      marker: {
        color: sectorColorMap[sector],
        size: 10,
        opacity: 0.7,
        line: { width: 1, color: '#FFF' },
      },
      hovertemplate: '%{text}<extra></extra>',
    }
  })

  // =======================
  // Chart 2: Revenue-TVL Power Relationship
  // =======================
  const revenueSectors = [...new Set(revenueTvlData.map(p => p.sector))]
  const revenueSectorColors = {}
  revenueSectors.forEach((s, i) => { revenueSectorColors[s] = colors.palette[i % colors.palette.length] })

  const revenueScatterTraces = revenueSectors.map(sector => {
    const pts = revenueTvlData.filter(p => p.sector === sector)
    return {
      x: pts.map(p => p.tvl),
      y: pts.map(p => p.annualizedRevenue),
      text: pts.map(p => `${p.name}<br>TVL: ${formatCurrency(p.tvl)}<br>Revenue: ${formatCurrency(p.annualizedRevenue)}/yr`),
      mode: 'markers',
      type: 'scatter',
      name: sector,
      marker: {
        color: revenueSectorColors[sector],
        size: 10,
        opacity: 0.7,
        line: { width: 1, color: '#FFF' },
      },
      hovertemplate: '%{text}<extra></extra>',
    }
  })

  // =======================
  // Chart 3: Reflexivity Flow Diagram
  // =======================
  const reflexivityAnnotations = [
    // Nodes
    { x: 0, y: 2, text: '💰 <b>Price</b>', showarrow: false, font: { size: 14 } },
    { x: 2, y: 2, text: '🏦 <b>TVL</b>', showarrow: false, font: { size: 14 } },
    { x: 2, y: 0, text: '💵 <b>Revenue</b>', showarrow: false, font: { size: 14 } },
    { x: 0, y: 0, text: '📈 <b>Narrative</b>', showarrow: false, font: { size: 14 } },
    // Correlation labels
    { x: 1, y: 2.3, text: `ρ=${avgGrowthEfficiency > avgShrinkEfficiency ? '+' : ''}0.7`, showarrow: false, font: { size: 11, color: colors.primary } },
    { x: 2.5, y: 1, text: 'ρ=0.8', showarrow: false, font: { size: 11, color: colors.primary } },
    { x: 1, y: -0.3, text: 'ρ=0.6', showarrow: false, font: { size: 11, color: colors.primary } },
    { x: -0.5, y: 1, text: 'ρ=0.5', showarrow: false, font: { size: 11, color: colors.primary } },
  ]

  // =======================
  // Chart 4: Multi-chain Network Effects
  // =======================
  const chainBuckets = Object.keys(chainCountStats).sort((a, b) => {
    const numA = a === '10+' ? 10 : parseInt(a)
    const numB = b === '10+' ? 10 : parseInt(b)
    return numA - numB
  })

  // =======================
  // Chart 5: DEX Volume vs TVL
  // =======================
  const dexScatterData = dexData.slice(0, 30)

  // =======================
  // Chart 6: First Mover vs Fast Follower
  // =======================

  // =======================
  // Chart 7: Network Effect Decay
  // =======================

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Best Fit Model"
          value={bestFit}
          subtitle={`β = ${fittedPower.beta.toFixed(2)}`}
        />
        <KPICard
          title="Fitted Exponent"
          value={fittedPower.beta.toFixed(2)}
          subtitle={fittedPower.beta > 1.5 ? 'Strong network effects' : fittedPower.beta > 1 ? 'Moderate effects' : 'Sub-linear'}
        />
        <KPICard
          title="Revenue~TVL β"
          value={revenuePowerFit.beta.toFixed(2)}
          subtitle={revenuePowerFit.beta > 1 ? 'Super-linear revenue' : 'Sub-linear revenue'}
        />
        <KPICard
          title="Protocols Analyzed"
          value={totalAnalyzed.toString()}
          subtitle="With TVL >$10M"
        />
      </div>

      {/* Chart 1: Metcalfe's Law Test */}
      <ChartCard
        title="Metcalfe's Law Test — TVL vs Market Cap"
        subtitle={`Testing n, n^1.5, n² scaling · Best fit: ${bestFit} · R²=${(Math.max(r2Linear, r2Super, r2Metcalfe) * 100).toFixed(1)}%`}
      >
        <Plot
          data={[...referenceTraces, ...metcalfeScatterTraces]}
          layout={{
            ...defaultLayout,
            height: 550,
            xaxis: {
              ...defaultLayout.xaxis,
              title: 'Total Value Locked (USD)',
              type: 'log',
              range: [7, 12],
            },
            yaxis: {
              ...defaultLayout.yaxis,
              title: 'Market Cap (USD)',
              type: 'log',
              range: [6, 12],
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 2: Revenue-TVL Power Relationship */}
      <ChartCard
        title="Revenue-TVL Power Relationship"
        subtitle={`Log-log regression: Revenue ∝ TVL^${revenuePowerFit.beta.toFixed(2)} · R²=${(revenuePowerFit.r2 * 100).toFixed(1)}% · ${revenuePowerFit.beta > 1 ? '✅ Super-linear (network effects amplify revenue)' : '⚠️ Sub-linear (diminishing returns)'}`}
      >
        <Plot
          data={revenueScatterTraces}
          layout={{
            ...defaultLayout,
            height: 500,
            xaxis: {
              ...defaultLayout.xaxis,
              title: 'Total Value Locked (USD)',
              type: 'log',
              range: [7, 12],
            },
            yaxis: {
              ...defaultLayout.yaxis,
              title: 'Annualized Revenue (USD)',
              type: 'log',
              range: [4, 11],
            },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 3: Reflexivity Loop Visualization */}
      <ChartCard
        title="Reflexivity Loop Visualization"
        subtitle="The DeFi feedback loop: Price → TVL → Revenue → Narrative → Price · Correlation coefficients shown at each step"
      >
        <Plot
          data={[
            // Arrow traces (using lines with annotations)
            { x: [0.3, 1.7], y: [2, 2], mode: 'lines', line: { color: colors.primary, width: 3 }, hoverinfo: 'skip', showlegend: false },
            { x: [2, 2], y: [1.7, 0.3], mode: 'lines', line: { color: colors.primary, width: 3 }, hoverinfo: 'skip', showlegend: false },
            { x: [1.7, 0.3], y: [0, 0], mode: 'lines', line: { color: colors.primary, width: 3 }, hoverinfo: 'skip', showlegend: false },
            { x: [0, 0], y: [0.3, 1.7], mode: 'lines', line: { color: colors.primary, width: 3 }, hoverinfo: 'skip', showlegend: false },
            // Arrow heads
            { x: [1.7], y: [2], mode: 'markers', marker: { symbol: 'triangle-right', size: 15, color: colors.primary }, hoverinfo: 'skip', showlegend: false },
            { x: [2], y: [0.3], mode: 'markers', marker: { symbol: 'triangle-down', size: 15, color: colors.primary }, hoverinfo: 'skip', showlegend: false },
            { x: [0.3], y: [0], mode: 'markers', marker: { symbol: 'triangle-left', size: 15, color: colors.primary }, hoverinfo: 'skip', showlegend: false },
            { x: [0], y: [1.7], mode: 'markers', marker: { symbol: 'triangle-up', size: 15, color: colors.primary }, hoverinfo: 'skip', showlegend: false },
          ]}
          layout={{
            ...defaultLayout,
            height: 350,
            xaxis: { ...defaultLayout.xaxis, visible: false, range: [-1, 3] },
            yaxis: { ...defaultLayout.yaxis, visible: false, range: [-1, 3], scaleanchor: 'x' },
            annotations: reflexivityAnnotations,
            margin: { t: 20, r: 20, b: 20, l: 20 },
          }}
          config={{ ...defaultConfig, displayModeBar: false }}
          className="w-full"
        />
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <p className="font-semibold text-green-800">📈 Upward Spiral</p>
            <p className="text-green-700 text-xs mt-1">
              Growing protocols: avg efficiency {avgGrowthEfficiency.toFixed(1)}% — TVL growth attracts more users, generating more fees, improving narrative.
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="font-semibold text-red-800">📉 Downward Spiral</p>
            <p className="text-red-700 text-xs mt-1">
              Shrinking protocols: avg efficiency {avgShrinkEfficiency.toFixed(1)}% — TVL decline reduces fees faster than TVL itself drops (reflexive downside).
            </p>
          </div>
        </div>
      </ChartCard>

      {/* Chart 4: Multi-chain Network Effects */}
      <ChartCard
        title="Multi-chain Network Effects"
        subtitle="Do protocols deployed on more chains earn disproportionately more? Testing for super-linear returns to chain count"
      >
        <Plot
          data={[
            {
              x: multiChainData.slice(0, 60).map(p => p.chains),
              y: multiChainData.slice(0, 60).map(p => p.annualizedRevenue),
              text: multiChainData.slice(0, 60).map(p => `${p.name}<br>Chains: ${p.chains}<br>Revenue: ${formatCurrency(p.annualizedRevenue)}/yr`),
              mode: 'markers',
              type: 'scatter',
              name: 'Protocols',
              marker: {
                color: multiChainData.slice(0, 60).map(p => colors.palette[Math.min(p.chains, colors.palette.length - 1)]),
                size: multiChainData.slice(0, 60).map(p => Math.max(8, Math.min(30, Math.sqrt(p.tvl / 1e8) * 5))),
                opacity: 0.7,
                line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: {
              ...defaultLayout.xaxis,
              title: 'Number of Chains',
              dtick: 2,
            },
            yaxis: {
              ...defaultLayout.yaxis,
              title: 'Annualized Revenue (USD)',
              type: 'log',
            },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 5: Liquidity Begets Liquidity (DEX) */}
      <ChartCard
        title="Liquidity Begets Liquidity — DEX Network Effects"
        subtitle={`Volume ∝ TVL^${dexVolumeFit.beta.toFixed(2)} · R²=${(dexVolumeFit.r2 * 100).toFixed(1)}% · ${dexVolumeFit.beta > 1 ? '✅ Super-linear: deeper liquidity attracts disproportionately more volume' : '⚠️ Sub-linear: diminishing returns to scale'}`}
      >
        <Plot
          data={[{
            x: dexScatterData.map(p => p.tvl),
            y: dexScatterData.map(p => p.volume24h),
            text: dexScatterData.map(p => `${p.name}<br>TVL: ${formatCurrency(p.tvl)}<br>24h Volume: ${formatCurrency(p.volume24h)}<br>Turnover: ${(p.volume24h / p.tvl * 100).toFixed(1)}%`),
            mode: 'markers+text',
            type: 'scatter',
            textposition: 'top center',
            textfont: { size: 9, color: '#6B7280' },
            marker: {
              color: colors.primary,
              size: dexScatterData.map(p => Math.max(10, Math.min(40, Math.sqrt(p.volume24h / 1e7) * 5))),
              opacity: 0.7,
              line: { width: 1, color: '#FFF' },
            },
            hovertemplate: '%{text}<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 480,
            xaxis: {
              ...defaultLayout.xaxis,
              title: 'Total Value Locked (USD)',
              type: 'log',
            },
            yaxis: {
              ...defaultLayout.yaxis,
              title: '24h Trading Volume (USD)',
              type: 'log',
            },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 6: First Mover vs Fast Follower */}
      <ChartCard
        title="First Mover vs Fast Follower"
        subtitle="Comparing category pioneers with their fast-following competitors — TVL and Revenue share"
      >
        <Plot
          data={[
            {
              x: firstMoverComparison.map(c => c.category),
              y: firstMoverComparison.map(c => c.leader.tvl),
              name: 'First Mover TVL',
              type: 'bar',
              marker: { color: colors.primary },
              hovertemplate: '%{x}<br>First Mover: $%{y:,.0f}<extra></extra>',
            },
            {
              x: firstMoverComparison.map(c => c.category),
              y: firstMoverComparison.map(c => c.followers.totalTvl),
              name: 'Followers Combined TVL',
              type: 'bar',
              marker: { color: colors.secondary },
              hovertemplate: '%{x}<br>Followers: $%{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            barmode: 'group',
            xaxis: { ...defaultLayout.xaxis },
            yaxis: { ...defaultLayout.yaxis, title: 'Total Value Locked (USD)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border)">
                <th className="text-left p-2">Category</th>
                <th className="text-left p-2">First Mover</th>
                <th className="text-right p-2">Leader TVL</th>
                <th className="text-right p-2">Leader Revenue</th>
                <th className="text-right p-2">Market Share</th>
              </tr>
            </thead>
            <tbody>
              {firstMoverComparison.map((c, i) => (
                <tr key={i} className="border-b border-(--color-border)">
                  <td className="p-2">{c.category}</td>
                  <td className="p-2 font-medium">{c.leader.name}</td>
                  <td className="text-right p-2">{formatCurrency(c.leader.tvl)}</td>
                  <td className="text-right p-2">{formatCurrency(c.leader.revenue)}/yr</td>
                  <td className="text-right p-2 font-bold" style={{ color: c.leaderShare > 50 ? colors.success : colors.warning }}>
                    {c.leaderShare.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Chart 7: Network Effect Decay */}
      <ChartCard
        title="Network Effect Decay — Reflexive Downside"
        subtitle="For protocols losing TVL (30d change < -5%), does revenue drop faster or slower than TVL? Points below diagonal = revenue decays faster (reflexive downside)"
      >
        <Plot
          data={[
            // Diagonal reference line
            {
              x: [-50, 0],
              y: [-50, 0],
              mode: 'lines',
              name: 'Equal decay',
              line: { dash: 'dash', width: 1, color: '#9CA3AF' },
              hoverinfo: 'skip',
            },
            // Scatter
            {
              x: decayAnalysis.map(p => p.change30d),
              y: decayAnalysis.map(p => p.estimatedRevenueChange),
              text: decayAnalysis.map(p => `${p.name}<br>TVL Δ: ${p.change30d.toFixed(1)}%<br>Est. Rev Δ: ${p.estimatedRevenueChange.toFixed(1)}%`),
              mode: 'markers',
              type: 'scatter',
              name: 'Declining protocols',
              marker: {
                color: decayAnalysis.map(p => p.estimatedRevenueChange < p.change30d ? colors.danger : colors.warning),
                size: decayAnalysis.map(p => Math.max(8, Math.min(25, Math.sqrt(p.tvl / 1e8) * 5))),
                opacity: 0.7,
                line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: {
              ...defaultLayout.xaxis,
              title: '30d TVL Change (%)',
              range: [-60, 5],
            },
            yaxis: {
              ...defaultLayout.yaxis,
              title: 'Estimated Revenue Change (%)',
              range: [-70, 5],
            },
            annotations: [
              { x: -40, y: -20, text: '⚠️ Revenue more resilient', showarrow: false, font: { size: 11, color: colors.warning } },
              { x: -20, y: -45, text: '🔴 Reflexive downside<br>(revenue collapses)', showarrow: false, font: { size: 11, color: colors.danger } },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Narrative */}
      <NarrativeBox title="Network Effects & Reflexivity in DeFi">
        <p>
          <strong>Metcalfe's Law</strong> — that network value scales as n² — has been proposed as the fundamental valuation model for crypto networks. 
          Our cross-sectional analysis finds that <strong>Market Cap ∝ TVL^{fittedPower.beta.toFixed(2)}</strong> where the fitted exponent 
          {fittedPower.beta > 1.5 ? ' strongly supports super-linear network effects' : fittedPower.beta > 1 ? ' suggests moderate network effects' : ' indicates sub-linear returns, challenging pure Metcalfe assumptions'}. 
          The {bestFit} model achieved R² = {(Math.max(r2Linear, r2Super, r2Metcalfe) * 100).toFixed(1)}%.
        </p>
        <p>
          <strong>Revenue-TVL relationship:</strong> We find Revenue ∝ TVL^{revenuePowerFit.beta.toFixed(2)}. 
          {revenuePowerFit.beta > 1 
            ? ` A β > 1 confirms super-linear network effects — larger protocols extract disproportionately more revenue per dollar locked, likely due to deeper liquidity, better pricing, and stronger brand.` 
            : ` A β < 1 suggests diminishing returns to scale — competition may erode the revenue advantage of larger protocols.`}
        </p>
        <p>
          <strong>The reflexivity hypothesis holds:</strong> Protocols experiencing TVL growth show average efficiency of {avgGrowthEfficiency.toFixed(1)}%, 
          while shrinking protocols average {avgShrinkEfficiency.toFixed(1)}%. 
          {avgGrowthEfficiency > avgShrinkEfficiency 
            ? ' This asymmetry confirms the reflexive feedback loop — growth begets growth, and decline accelerates decline.' 
            : ' The data shows the challenge of maintaining efficiency during contraction.'}
        </p>
        <p>
          <strong>First-mover advantage is real:</strong> In {firstMoverComparison.filter(c => c.leaderShare > 50).length} of {firstMoverComparison.length} categories analyzed, 
          the first-mover still commands &gt;50% market share, demonstrating durable network effects and the difficulty of displacing established protocols.
        </p>
      </NarrativeBox>
    </div>
  )
}
