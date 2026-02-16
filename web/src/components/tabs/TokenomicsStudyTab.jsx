import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchTokenomicsStudyData } from '../../services/api'
import { formatCurrency, formatMultiple, formatPercent } from '../../utils/helpers'
import { tokenomicsStudyNarrative } from '../../data/narratives'

// Token model classification for known protocols
const TOKEN_MODEL_MAP = {
  // Fee-burn (deflationary supply)
  ethereum: 'Fee-Burn',
  binancecoin: 'Fee-Burn',
  'bnb': 'Fee-Burn',
  // Staking rewards (direct yield to stakers)
  aave: 'Staking Rewards',
  'curve-dao-token': 'Staking Rewards',
  'lido-dao': 'Staking Rewards',
  gmx: 'Staking Rewards',
  'synthetix-network-token': 'Staking Rewards',
  sushi: 'Staking Rewards',
  'compound-governance-token': 'Staking Rewards',
  // Treasury accrual (revenue to DAO)
  uniswap: 'Treasury Accrual',
  chainlink: 'Treasury Accrual',
  'pancakeswap-token': 'Treasury Accrual',
  // Buyback & burn (hybrid)
  maker: 'Buyback & Burn',
  mkr: 'Buyback & Burn',
}

// Estimated capture rate by model type (% of fees to token holders)
const CAPTURE_RATES = {
  'Fee-Burn': 0.8,      // ~80% of fees burned (EIP-1559)
  'Staking Rewards': 0.5, // ~50% to stakers, rest to LPs/treasury
  'Treasury Accrual': 0.1, // ~10% indirect (future distributions)
  'Buyback & Burn': 0.6,   // ~60% to buybacks
}

// Model colors for consistency
const MODEL_COLORS = {
  'Fee-Burn': colors.primary,
  'Staking Rewards': colors.success,
  'Treasury Accrual': colors.secondary,
  'Buyback & Burn': colors.warning,
}

// Estimated staking APY and inflation for known tokens
const STAKING_DATA = {
  'aave': { stakingApy: 5.2, inflation: 0.8 },
  'curve-dao-token': { stakingApy: 12.5, inflation: 8.0 },
  'lido-dao': { stakingApy: 0, inflation: 2.0 },
  'gmx': { stakingApy: 15.0, inflation: 5.0 },
  'synthetix-network-token': { stakingApy: 18.0, inflation: 12.0 },
  'sushi': { stakingApy: 8.0, inflation: 10.0 },
  'compound-governance-token': { stakingApy: 3.5, inflation: 0.5 },
  'ethereum': { stakingApy: 4.0, inflation: 0 },
  'maker': { stakingApy: 8.0, inflation: -2.0 },
}

export default function TokenomicsStudyTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchTokenomicsStudyData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading tokenomics study data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  const feesProtocols = data?.fees?.protocols || []
  const llamaProtocols = data?.protocols || []
  const markets = data?.markets || []
  const coinDetails = data?.coinDetails || []

  // Build unified protocol dataset with token model classification
  const protocolsWithModels = feesProtocols
    .filter(p => p.total24h > 10000)
    .map(p => {
      const slug = (p.slug || p.name || '').toLowerCase()
      const llama = llamaProtocols.find(lp =>
        lp.slug === p.slug || (lp.name || '').toLowerCase() === (p.name || '').toLowerCase()
      )
      const market = markets.find(m =>
        (m.id || '').toLowerCase().includes(slug) ||
        (m.symbol || '').toLowerCase() === slug ||
        slug.includes((m.symbol || '').toLowerCase())
      )
      
      // Determine token model
      let tokenModel = 'Other'
      for (const [key, model] of Object.entries(TOKEN_MODEL_MAP)) {
        if (slug.includes(key) || (market?.id || '').includes(key)) {
          tokenModel = model
          break
        }
      }

      const revenue24h = p.total24h || 0
      const annualizedRevenue = revenue24h * 365
      const mcap = llama?.mcap || market?.market_cap || 0
      const totalVolume = market?.total_volume || 0
      const captureRate = CAPTURE_RATES[tokenModel] || 0.2

      return {
        name: p.name || p.slug,
        slug,
        revenue24h,
        annualizedRevenue,
        mcap,
        totalVolume,
        tvl: llama?.tvl || 0,
        tokenModel,
        captureRate,
        psRatio: mcap > 0 && annualizedRevenue > 0 ? mcap / annualizedRevenue : null,
        peRatio: mcap > 0 && annualizedRevenue > 0 ? mcap / (annualizedRevenue * captureRate) : null,
        velocity: mcap > 0 && totalVolume > 0 ? (totalVolume * 365) / mcap : null,
        revenueYield: mcap > 0 ? (annualizedRevenue / mcap) * 100 : null,
        category: p.category || llama?.category || 'Other',
      }
    })
    .filter(p => p.mcap > 1e6 && p.annualizedRevenue > 1e5)
    .sort((a, b) => b.annualizedRevenue - a.annualizedRevenue)
    .slice(0, 50)

  // 1. Value Accrual Model Classification - Grouped bar of total revenue by model
  const modelRevenue = {}
  const modelCount = {}
  protocolsWithModels.forEach(p => {
    modelRevenue[p.tokenModel] = (modelRevenue[p.tokenModel] || 0) + p.annualizedRevenue
    modelCount[p.tokenModel] = (modelCount[p.tokenModel] || 0) + 1
  })
  const modelTypes = Object.keys(modelRevenue).sort((a, b) => modelRevenue[b] - modelRevenue[a])

  // 2. P/E by Token Model - Box plot style scatter
  const peByModel = {}
  protocolsWithModels.forEach(p => {
    if (p.peRatio && p.peRatio > 0 && p.peRatio < 500) {
      if (!peByModel[p.tokenModel]) peByModel[p.tokenModel] = []
      peByModel[p.tokenModel].push({ name: p.name, pe: p.peRatio })
    }
  })

  // Calculate quartiles for each model
  const modelPEStats = Object.entries(peByModel).map(([model, protocols]) => {
    const pes = protocols.map(p => p.pe).sort((a, b) => a - b)
    return {
      model,
      protocols,
      min: pes[0],
      q1: pes[Math.floor(pes.length * 0.25)] || pes[0],
      median: pes[Math.floor(pes.length * 0.5)] || pes[0],
      q3: pes[Math.floor(pes.length * 0.75)] || pes[pes.length - 1],
      max: pes[pes.length - 1],
      count: pes.length,
    }
  }).sort((a, b) => a.median - b.median)

  // 3. Revenue Capture Efficiency - Scatter of total fees vs capture %
  const captureScatter = protocolsWithModels.filter(p => p.annualizedRevenue > 1e6)

  // 4. Token Velocity Problem - Scatter of velocity vs revenue yield
  const velocityScatter = protocolsWithModels.filter(p => p.velocity && p.revenueYield && p.velocity < 100)

  // 5. Dilution-Adjusted Returns for staking tokens
  const stakingTokens = coinDetails
    .map(c => {
      const stakingInfo = STAKING_DATA[c.id] || { stakingApy: 0, inflation: 0 }
      return {
        name: c.data?.name || c.id,
        id: c.id,
        stakingApy: stakingInfo.stakingApy,
        inflation: stakingInfo.inflation,
        realYield: stakingInfo.stakingApy - stakingInfo.inflation,
      }
    })
    .filter(t => t.stakingApy > 0 || t.inflation !== 0)
    .sort((a, b) => b.realYield - a.realYield)

  // 6. Market Cap vs Revenue by Model - Scatter with model colors
  const mcapRevenueScatter = protocolsWithModels.filter(p => p.mcap > 1e6 && p.annualizedRevenue > 1e5)

  // KPI calculations
  const feeBurnAvgPS = protocolsWithModels.filter(p => p.tokenModel === 'Fee-Burn' && p.psRatio).length > 0
    ? protocolsWithModels.filter(p => p.tokenModel === 'Fee-Burn' && p.psRatio).reduce((s, p) => s + p.psRatio, 0) /
      protocolsWithModels.filter(p => p.tokenModel === 'Fee-Burn' && p.psRatio).length
    : null

  const stakingAvgPS = protocolsWithModels.filter(p => p.tokenModel === 'Staking Rewards' && p.psRatio).length > 0
    ? protocolsWithModels.filter(p => p.tokenModel === 'Staking Rewards' && p.psRatio).reduce((s, p) => s + p.psRatio, 0) /
      protocolsWithModels.filter(p => p.tokenModel === 'Staking Rewards' && p.psRatio).length
    : null

  const totalRevenueByModel = modelRevenue['Fee-Burn'] || 0
  const stakingTotalRevenue = modelRevenue['Staking Rewards'] || 0

  // Premium calculation
  const psPremium = feeBurnAvgPS && stakingAvgPS ? ((feeBurnAvgPS / stakingAvgPS - 1) * 100) : null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Fee-Burn Avg P/S"
          value={feeBurnAvgPS ? formatMultiple(feeBurnAvgPS) : '—'}
          subtitle="ETH-style tokens"
        />
        <KPICard
          title="Staking Avg P/S"
          value={stakingAvgPS ? formatMultiple(stakingAvgPS) : '—'}
          subtitle="Reward tokens"
        />
        <KPICard
          title="Fee-Burn Premium"
          value={psPremium ? formatPercent(psPremium) : '—'}
          subtitle="vs staking tokens"
          trend={psPremium > 0 ? psPremium : undefined}
        />
        <KPICard
          title="Protocols Analyzed"
          value={protocolsWithModels.length}
          subtitle="With token models"
        />
      </div>

      {/* 1. Value Accrual Model Classification */}
      <ChartCard title="Value Accrual Model Classification" subtitle="Total annualized revenue by token model type — how protocols capture value"
        csvData={{ filename: 'value-accrual-models', headers: ['Model','AnnualizedRevenue','ProtocolCount'], rows: modelTypes.map(m => [m, modelRevenue[m], modelCount[m]]) }}>
        <Plot
          data={[
            {
              x: modelTypes,
              y: modelTypes.map(m => modelRevenue[m]),
              type: 'bar',
              marker: { color: modelTypes.map(m => MODEL_COLORS[m] || colors.slate) },
              text: modelTypes.map(m => `${modelCount[m]} protocols`),
              textposition: 'outside',
              hovertemplate: '%{x}<br>$%{y:,.0f}<br>%{text}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'Annualized Revenue (USD)' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 2. P/E by Token Model - Box plot style */}
      <ChartCard title="P/E by Token Model" subtitle="Do fee-burn tokens trade at different multiples than staking tokens? · Diamond = median"
        csvData={{ filename: 'pe-by-model', headers: ['Model','Protocol','PE_Ratio'], rows: modelPEStats.flatMap(s => s.protocols.map(p => [s.model, p.name, p.pe.toFixed(1)])) }}>
        <Plot
          data={[
            // Individual protocol dots
            ...modelPEStats.map(({ model, protocols }) => ({
              x: protocols.map(() => model),
              y: protocols.map(p => p.pe),
              text: protocols.map(p => `${p.name}<br>P/E: ${p.pe.toFixed(1)}x`),
              type: 'scatter',
              mode: 'markers',
              name: model,
              marker: {
                color: MODEL_COLORS[model] || colors.slate,
                size: 10,
                opacity: 0.6,
              },
              hovertemplate: '%{text}<extra></extra>',
            })),
            // Median markers
            {
              x: modelPEStats.map(s => s.model),
              y: modelPEStats.map(s => s.median),
              type: 'scatter',
              mode: 'markers',
              name: 'Median',
              marker: { color: colors.warning, size: 16, symbol: 'diamond' },
              hovertemplate: '%{x}<br>Median P/E: %{y:.1f}x<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 450,
            showlegend: false,
            xaxis: { ...defaultLayout.xaxis, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'P/E Ratio (Adjusted for Capture Rate)', type: 'log' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 3. Revenue Capture Efficiency */}
      <ChartCard title="Revenue Capture Efficiency" subtitle="X = Total fees, Y = % captured by token · Protocols with high capture = better tokenomics"
        csvData={{ filename: 'revenue-capture', headers: ['Protocol','Model','AnnualizedRevenue','CaptureRate%','MCap'], rows: captureScatter.map(p => [p.name, p.tokenModel, p.annualizedRevenue, (p.captureRate*100).toFixed(1), p.mcap]) }}>
        <Plot
          data={modelTypes.filter(m => m !== 'Other').map(model => {
            const pts = captureScatter.filter(p => p.tokenModel === model)
            return {
              x: pts.map(p => p.annualizedRevenue),
              y: pts.map(p => p.captureRate * 100),
              text: pts.map(p => `${p.name}<br>Revenue: $${(p.annualizedRevenue / 1e6).toFixed(1)}M<br>Capture: ${(p.captureRate * 100).toFixed(0)}%`),
              type: 'scatter',
              mode: 'markers',
              name: model,
              marker: {
                color: MODEL_COLORS[model],
                size: pts.map(p => Math.max(10, Math.min(30, Math.sqrt(p.mcap / 1e8) * 3))),
                opacity: 0.7,
                line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
            }
          })}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Annualized Revenue (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'Token Capture Rate (%)', range: [0, 100] },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 4. Token Velocity Problem */}
      <ChartCard title="Token Velocity Problem" subtitle="High velocity + low yield = tokens dumped · Low velocity + high yield = tokens held for yield"
        csvData={{ filename: 'token-velocity', headers: ['Protocol','Model','Velocity','RevenueYield%'], rows: velocityScatter.map(p => [p.name, p.tokenModel, p.velocity.toFixed(1), p.revenueYield.toFixed(2)]) }}>
        <Plot
          data={modelTypes.filter(m => m !== 'Other').map(model => {
            const pts = velocityScatter.filter(p => p.tokenModel === model)
            return {
              x: pts.map(p => p.velocity),
              y: pts.map(p => p.revenueYield),
              text: pts.map(p => `${p.name}<br>Velocity: ${p.velocity.toFixed(1)}x<br>Revenue Yield: ${p.revenueYield.toFixed(2)}%`),
              type: 'scatter',
              mode: 'markers',
              name: model,
              marker: {
                color: MODEL_COLORS[model],
                size: 12,
                opacity: 0.7,
              },
              hovertemplate: '%{text}<extra></extra>',
            }
          })}
          layout={{
            ...defaultLayout,
            height: 450,
            xaxis: { ...defaultLayout.xaxis, title: 'Token Velocity (Annual Volume / Market Cap)', type: 'linear' },
            yaxis: { ...defaultLayout.yaxis, title: 'Revenue Yield (Annual Rev / Market Cap %)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.15 },
            shapes: [
              // Quadrant dividers
              { type: 'line', x0: 10, x1: 10, y0: 0, y1: 20, line: { color: '#E5E3E0', dash: 'dash', width: 1 } },
              { type: 'line', x0: 0, x1: 50, y0: 5, y1: 5, line: { color: '#E5E3E0', dash: 'dash', width: 1 } },
            ],
            annotations: [
              { x: 5, y: 18, text: 'Held for Yield', showarrow: false, font: { size: 10, color: colors.success } },
              { x: 35, y: 2, text: 'Dumped', showarrow: false, font: { size: 10, color: colors.danger } },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 5. Dilution-Adjusted Returns */}
      <ChartCard title="Dilution-Adjusted Returns" subtitle="Staking APY MINUS inflation = real yield · Positive = value creation, Negative = dilutive"
        csvData={{ filename: 'dilution-adjusted-returns', headers: ['Protocol','StakingAPY%','Inflation%','RealYield%'], rows: stakingTokens.map(t => [t.name, t.stakingApy.toFixed(1), t.inflation.toFixed(1), t.realYield.toFixed(1)]) }}>
        <Plot
          data={[
            {
              x: stakingTokens.map(t => t.name),
              y: stakingTokens.map(t => t.realYield),
              type: 'bar',
              marker: {
                color: stakingTokens.map(t => t.realYield >= 0 ? colors.success : colors.danger),
              },
              text: stakingTokens.map(t => `APY: ${t.stakingApy.toFixed(1)}%<br>Inflation: ${t.inflation.toFixed(1)}%`),
              hovertemplate: '%{x}<br>Real Yield: %{y:.1f}%<br>%{text}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            xaxis: { ...defaultLayout.xaxis, tickangle: -30, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'Real Yield (Staking APY - Inflation %)', zeroline: true, zerolinecolor: '#1A1A1A', zerolinewidth: 2 },
            shapes: [
              { type: 'line', x0: -0.5, x1: stakingTokens.length - 0.5, y0: 0, y1: 0, line: { color: '#1A1A1A', width: 2 } },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 6. Market Cap vs Revenue by Model */}
      <ChartCard title="Market Cap vs Revenue by Model" subtitle="Different colors/shapes for token models · Test if market prices models differently"
        csvData={{ filename: 'mcap-vs-revenue-model', headers: ['Protocol','Model','AnnualizedRevenue','MCap','TVL','PS_Ratio'], rows: mcapRevenueScatter.map(p => [p.name, p.tokenModel, p.annualizedRevenue, p.mcap, p.tvl, p.psRatio?.toFixed(1)]) }}>
        <Plot
          data={modelTypes.filter(m => m !== 'Other').map(model => {
            const pts = mcapRevenueScatter.filter(p => p.tokenModel === model)
            return {
              x: pts.map(p => p.annualizedRevenue),
              y: pts.map(p => p.mcap),
              text: pts.map(p => `${p.name}<br>P/S: ${p.psRatio ? p.psRatio.toFixed(1) + 'x' : 'N/A'}<br>Rev: $${(p.annualizedRevenue / 1e6).toFixed(1)}M<br>MCap: $${(p.mcap / 1e6).toFixed(0)}M`),
              type: 'scatter',
              mode: 'markers',
              name: model,
              marker: {
                color: MODEL_COLORS[model],
                size: pts.map(p => Math.max(10, Math.min(35, Math.sqrt(p.tvl / 1e7) * 3))),
                opacity: 0.7,
                line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
            }
          })}
          layout={{
            ...defaultLayout,
            height: 500,
            xaxis: { ...defaultLayout.xaxis, title: 'Annualized Revenue (USD)', type: 'log' },
            yaxis: { ...defaultLayout.yaxis, title: 'Market Cap (USD)', type: 'log' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: -0.12 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* 7. Protocol Revenue to Token Price Correlation */}
      <ChartCard title="Revenue-to-Price Sensitivity by Model" subtitle="Average P/S ratio by model — higher = market pays premium per $ of revenue">
        <Plot
          data={[
            {
              x: modelTypes.filter(m => {
                const pts = protocolsWithModels.filter(p => p.tokenModel === m && p.psRatio)
                return pts.length > 0
              }),
              y: modelTypes.filter(m => {
                const pts = protocolsWithModels.filter(p => p.tokenModel === m && p.psRatio)
                return pts.length > 0
              }).map(m => {
                const pts = protocolsWithModels.filter(p => p.tokenModel === m && p.psRatio)
                return pts.reduce((s, p) => s + p.psRatio, 0) / pts.length
              }),
              type: 'bar',
              marker: {
                color: modelTypes.filter(m => {
                  const pts = protocolsWithModels.filter(p => p.tokenModel === m && p.psRatio)
                  return pts.length > 0
                }).map(m => MODEL_COLORS[m] || colors.slate),
              },
              hovertemplate: '%{x}<br>Avg P/S: %{y:.1f}x<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 350,
            xaxis: { ...defaultLayout.xaxis, type: 'category' },
            yaxis: { ...defaultLayout.yaxis, title: 'Average P/S Ratio' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      <NarrativeBox title={tokenomicsStudyNarrative.title}>
        {tokenomicsStudyNarrative.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        <p className="font-medium mt-2">{tokenomicsStudyNarrative.conclusion}</p>
      </NarrativeBox>
    </div>
  )
}
