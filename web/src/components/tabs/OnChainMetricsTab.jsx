import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { formatNumber, formatMultiple, rollingAverage } from '../../utils/helpers'

// Santiment API configuration
const SLUGS = ['bitcoin', 'ethereum', 'uniswap', 'aave', 'chainlink']
const METRICS = [
  'dev_activity',
  'daily_active_addresses',
  'network_growth',
  'transaction_volume',
  'exchange_inflow',
  'exchange_outflow',
  'mvrv_usd',
  'nvt',
  'social_volume_total',
  'age_consumed',
]

// Get date range (last 365 days)
function getDateRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 365)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

// Fetch a single metric for a single slug from Santiment
async function fetchMetric(metric, slug) {
  const { from, to } = getDateRange()
  const query = `{ getMetric(metric: "${metric}") { timeseriesData(slug: "${slug}" from: "${from}" to: "${to}" interval: "1d") { datetime value } } }`
  
  const response = await fetch('/api/santiment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  
  if (!response.ok) {
    throw new Error(`Santiment API error: ${response.status}`)
  }
  
  const data = await response.json()
  return data?.data?.getMetric?.timeseriesData || []
}

// Fetch all projects from Santiment
async function fetchAllProjects() {
  const query = `{ allProjects(page: 1 pageSize: 100) { slug name ticker marketcapUsd } }`
  
  const response = await fetch('/api/santiment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  
  if (!response.ok) {
    throw new Error(`Santiment API error: ${response.status}`)
  }
  
  const data = await response.json()
  return data?.data?.allProjects || []
}

// Fetch all Santiment data
async function fetchOnChainMetricsData() {
  // Build all metric+slug combinations
  const metricPromises = []
  const metricKeys = []
  
  for (const slug of SLUGS) {
    for (const metric of METRICS) {
      metricPromises.push(fetchMetric(metric, slug))
      metricKeys.push({ metric, slug })
    }
  }
  
  // Add allProjects fetch
  metricPromises.push(fetchAllProjects())
  metricKeys.push({ metric: 'allProjects', slug: null })
  
  const results = await Promise.allSettled(metricPromises)
  
  // Organize results
  const data = {}
  let hasAnyData = false
  let allFailed = true
  
  results.forEach((result, i) => {
    const { metric, slug } = metricKeys[i]
    
    if (result.status === 'fulfilled' && result.value) {
      if (metric === 'allProjects') {
        data.allProjects = result.value
      } else {
        if (!data[metric]) data[metric] = {}
        data[metric][slug] = result.value
        if (result.value.length > 0) {
          hasAnyData = true
          allFailed = false
        }
      }
    }
  })
  
  // Check if Santiment is configured
  if (allFailed && metricPromises.length > 0) {
    // Try to detect if it's a configuration issue
    try {
      const testResponse = await fetch('/api/santiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      })
      if (testResponse.status === 401 || testResponse.status === 403) {
        return { notConfigured: true }
      }
    } catch {
      return { notConfigured: true }
    }
  }
  
  return { ...data, hasAnyData, notConfigured: !hasAnyData && allFailed }
}

// Extract latest value from time series
function getLatestValue(timeseries) {
  if (!timeseries || timeseries.length === 0) return null
  return timeseries[timeseries.length - 1]?.value
}

// Convert Santiment timeseries to chart format
function toChartData(timeseries) {
  if (!timeseries || timeseries.length === 0) return { dates: [], values: [] }
  return {
    dates: timeseries.map(d => d.datetime.split('T')[0]),
    values: timeseries.map(d => d.value),
  }
}

export default function OnChainMetricsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchOnChainMetricsData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading on-chain metrics from Santiment..." />
  
  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-(--color-danger)">Error: {error}</p>
      </div>
    )
  }

  // Check if Santiment is not configured
  if (data?.notConfigured) {
    return (
      <div className="text-center py-20">
        <div className="bg-amber-50 border border-amber-200 p-6 max-w-lg mx-auto">
          <h3 className="text-lg font-semibold text-amber-800 mb-2">Santiment API Not Configured</h3>
          <p className="text-sm text-amber-700">
            Configure <code className="bg-amber-100 px-1 rounded">SANTIMENT_API_KEY</code> in Vercel environment variables to enable on-chain metrics.
          </p>
        </div>
      </div>
    )
  }

  // Extract data for charts
  const mvrvBtc = data?.mvrv_usd?.bitcoin || []
  const mvrvEth = data?.mvrv_usd?.ethereum || []
  const nvtBtc = data?.nvt?.bitcoin || []
  const nvtEth = data?.nvt?.ethereum || []
  const daaBtc = data?.daily_active_addresses?.bitcoin || []
  const daaEth = data?.daily_active_addresses?.ethereum || []
  const inflowBtc = data?.exchange_inflow?.bitcoin || []
  const inflowEth = data?.exchange_inflow?.ethereum || []
  const outflowBtc = data?.exchange_outflow?.bitcoin || []
  const outflowEth = data?.exchange_outflow?.ethereum || []
  const devEth = data?.dev_activity?.ethereum || []
  const devUni = data?.dev_activity?.uniswap || []
  const devAave = data?.dev_activity?.aave || []
  const devLink = data?.dev_activity?.chainlink || []
  const socialBtc = data?.social_volume_total?.bitcoin || []
  const socialEth = data?.social_volume_total?.ethereum || []
  const ageBtc = data?.age_consumed?.bitcoin || []
  const networkBtc = data?.network_growth?.bitcoin || []
  const networkEth = data?.network_growth?.ethereum || []

  // KPI values
  const btcMvrv = getLatestValue(mvrvBtc)
  const ethMvrv = getLatestValue(mvrvEth)
  const btcNvt = getLatestValue(nvtBtc)
  const btcDaa = getLatestValue(daaBtc)
  const ethDaa = getLatestValue(daaEth)
  const totalDaa = (btcDaa || 0) + (ethDaa || 0)

  // Chart data
  const mvrvBtcChart = toChartData(mvrvBtc)
  const mvrvEthChart = toChartData(mvrvEth)
  const nvtBtcChart = toChartData(nvtBtc)
  const nvtEthChart = toChartData(nvtEth)
  const daaBtcChart = toChartData(daaBtc)
  const daaEthChart = toChartData(daaEth)
  const devEthChart = toChartData(devEth)
  const devUniChart = toChartData(devUni)
  const devAaveChart = toChartData(devAave)
  const devLinkChart = toChartData(devLink)
  const socialBtcChart = toChartData(socialBtc)
  const socialEthChart = toChartData(socialEth)
  const ageBtcChart = toChartData(ageBtc)
  const networkBtcChart = toChartData(networkBtc)
  const networkEthChart = toChartData(networkEth)

  // Calculate net flow (inflow - outflow)
  const netFlowBtc = inflowBtc.map((d, i) => ({
    datetime: d.datetime,
    value: d.value - (outflowBtc[i]?.value || 0),
  }))
  const netFlowEth = inflowEth.map((d, i) => ({
    datetime: d.datetime,
    value: d.value - (outflowEth[i]?.value || 0),
  }))
  const netFlowBtcChart = toChartData(netFlowBtc)
  const netFlowEthChart = toChartData(netFlowEth)

  // MVRV interpretation
  const getMvrvStatus = (mvrv) => {
    if (mvrv === null) return 'Unknown'
    if (mvrv >= 3.5) return 'Overvalued'
    if (mvrv <= 0.7) return 'Undervalued'
    return 'Fair Value'
  }

  // Narrative data
  const btcMvrvStatus = getMvrvStatus(btcMvrv)
  const ethMvrvStatus = getMvrvStatus(ethMvrv)
  const avgNetFlow = netFlowBtcChart.values.slice(-30).reduce((s, v) => s + v, 0) / 30
  const flowSignal = avgNetFlow < 0 ? 'accumulation' : 'distribution'

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="BTC MVRV"
          value={btcMvrv !== null ? formatMultiple(btcMvrv) : '—'}
          subtitle={btcMvrvStatus}
          trend={btcMvrv !== null && btcMvrv > 1 ? ((btcMvrv - 1) * 100) : null}
        />
        <KPICard
          title="ETH MVRV"
          value={ethMvrv !== null ? formatMultiple(ethMvrv) : '—'}
          subtitle={ethMvrvStatus}
          trend={ethMvrv !== null && ethMvrv > 1 ? ((ethMvrv - 1) * 100) : null}
        />
        <KPICard
          title="BTC NVT"
          value={btcNvt !== null ? formatMultiple(btcNvt) : '—'}
          subtitle="Network value to transactions"
        />
        <KPICard
          title="Total Daily Active Addresses"
          value={formatNumber(totalDaa)}
          subtitle="BTC + ETH combined"
        />
      </div>

      {/* Chart 1: MVRV Ratio */}
      <ChartCard 
        title="MVRV Ratio — Market Value to Realized Value" 
        subtitle="MVRV > 3.5 = overvalued, MVRV < 0.7 = undervalued, MVRV ~ 1 = fair value"
      >
        <Plot
          data={[
            {
              x: mvrvBtcChart.dates,
              y: mvrvBtcChart.values,
              type: 'scatter',
              mode: 'lines',
              name: 'BTC MVRV',
              line: { color: colors.warning, width: 2 },
              hovertemplate: '%{x}<br>BTC MVRV: %{y:.2f}x<extra></extra>',
            },
            {
              x: mvrvEthChart.dates,
              y: mvrvEthChart.values,
              type: 'scatter',
              mode: 'lines',
              name: 'ETH MVRV',
              line: { color: colors.primary, width: 2 },
              hovertemplate: '%{x}<br>ETH MVRV: %{y:.2f}x<extra></extra>',
            },
            // Reference lines
            {
              x: mvrvBtcChart.dates.length > 0 ? [mvrvBtcChart.dates[0], mvrvBtcChart.dates[mvrvBtcChart.dates.length - 1]] : [],
              y: [1.0, 1.0],
              type: 'scatter',
              mode: 'lines',
              name: 'Fair Value (1.0)',
              line: { color: colors.success, width: 1, dash: 'dash' },
              hoverinfo: 'skip',
            },
            {
              x: mvrvBtcChart.dates.length > 0 ? [mvrvBtcChart.dates[0], mvrvBtcChart.dates[mvrvBtcChart.dates.length - 1]] : [],
              y: [3.5, 3.5],
              type: 'scatter',
              mode: 'lines',
              name: 'Overvalued (3.5)',
              line: { color: colors.danger, width: 1, dash: 'dot' },
              hoverinfo: 'skip',
            },
            {
              x: mvrvBtcChart.dates.length > 0 ? [mvrvBtcChart.dates[0], mvrvBtcChart.dates[mvrvBtcChart.dates.length - 1]] : [],
              y: [0.7, 0.7],
              type: 'scatter',
              mode: 'lines',
              name: 'Undervalued (0.7)',
              line: { color: colors.cyan, width: 1, dash: 'dot' },
              hoverinfo: 'skip',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'MVRV Ratio' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.12 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 2: NVT Ratio */}
      <ChartCard 
        title="NVT Ratio — Network Value to Transactions" 
        subtitle="High NVT indicates overvaluation relative to on-chain utility; low NVT suggests undervaluation"
      >
        <Plot
          data={[
            {
              x: nvtBtcChart.dates,
              y: nvtBtcChart.values,
              type: 'scatter',
              mode: 'lines',
              name: 'BTC NVT',
              line: { color: colors.warning, width: 2 },
              hovertemplate: '%{x}<br>BTC NVT: %{y:.1f}<extra></extra>',
            },
            {
              x: nvtEthChart.dates,
              y: nvtEthChart.values,
              type: 'scatter',
              mode: 'lines',
              name: 'ETH NVT',
              line: { color: colors.primary, width: 2 },
              hovertemplate: '%{x}<br>ETH NVT: %{y:.1f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'NVT Ratio' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 3: Daily Active Addresses */}
      <ChartCard 
        title="Daily Active Addresses" 
        subtitle="Network usage indicator — more addresses = more adoption and utility"
      >
        <Plot
          data={[
            {
              x: daaBtcChart.dates,
              y: daaBtcChart.values,
              type: 'scatter',
              mode: 'lines',
              name: 'BTC',
              line: { color: colors.warning, width: 2 },
              hovertemplate: '%{x}<br>BTC DAA: %{y:,.0f}<extra></extra>',
            },
            {
              x: daaEthChart.dates,
              y: daaEthChart.values,
              type: 'scatter',
              mode: 'lines',
              name: 'ETH',
              line: { color: colors.primary, width: 2 },
              hovertemplate: '%{x}<br>ETH DAA: %{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'Active Addresses' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 4: Exchange Net Flow */}
      <ChartCard 
        title="Exchange Net Flow" 
        subtitle="Inflow - Outflow: Negative = accumulation (bullish), Positive = sell pressure (bearish)"
      >
        <Plot
          data={[
            {
              x: netFlowBtcChart.dates,
              y: netFlowBtcChart.values,
              type: 'bar',
              name: 'BTC Net Flow',
              marker: {
                color: netFlowBtcChart.values.map(v => v < 0 ? colors.success : colors.danger),
              },
              hovertemplate: '%{x}<br>BTC Net Flow: %{y:,.2f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'Net Flow (BTC)' },
            bargap: 0.1,
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
            shapes: [
              {
                type: 'line',
                x0: netFlowBtcChart.dates[0],
                x1: netFlowBtcChart.dates[netFlowBtcChart.dates.length - 1],
                y0: 0,
                y1: 0,
                line: { color: colors.slate, width: 1, dash: 'dash' },
              },
            ],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 5: Developer Activity */}
      <ChartCard 
        title="Developer Activity" 
        subtitle="GitHub commit activity — sustained dev work indicates long-term commitment"
      >
        <Plot
          data={[
            {
              x: devEthChart.dates,
              y: rollingAverage(devEthChart.values, 7),
              type: 'scatter',
              mode: 'lines',
              name: 'Ethereum',
              line: { color: colors.primary, width: 2 },
              hovertemplate: '%{x}<br>ETH Dev Activity: %{y:.1f}<extra></extra>',
            },
            {
              x: devUniChart.dates,
              y: rollingAverage(devUniChart.values, 7),
              type: 'scatter',
              mode: 'lines',
              name: 'Uniswap',
              line: { color: colors.secondary, width: 2 },
              hovertemplate: '%{x}<br>UNI Dev Activity: %{y:.1f}<extra></extra>',
            },
            {
              x: devAaveChart.dates,
              y: rollingAverage(devAaveChart.values, 7),
              type: 'scatter',
              mode: 'lines',
              name: 'Aave',
              line: { color: colors.success, width: 2 },
              hovertemplate: '%{x}<br>AAVE Dev Activity: %{y:.1f}<extra></extra>',
            },
            {
              x: devLinkChart.dates,
              y: rollingAverage(devLinkChart.values, 7),
              type: 'scatter',
              mode: 'lines',
              name: 'Chainlink',
              line: { color: colors.warning, width: 2 },
              hovertemplate: '%{x}<br>LINK Dev Activity: %{y:.1f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'Dev Activity (7-day avg)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 6: Social Volume */}
      <ChartCard 
        title="Social Volume" 
        subtitle="Social media mentions — spikes often precede or coincide with price movements"
      >
        <Plot
          data={[
            {
              x: socialBtcChart.dates,
              y: socialBtcChart.values,
              type: 'scatter',
              mode: 'lines',
              name: 'BTC',
              line: { color: colors.warning, width: 2 },
              fill: 'tozeroy',
              fillcolor: 'rgba(245,158,11,0.1)',
              hovertemplate: '%{x}<br>BTC Social Volume: %{y:,.0f}<extra></extra>',
            },
            {
              x: socialEthChart.dates,
              y: socialEthChart.values,
              type: 'scatter',
              mode: 'lines',
              name: 'ETH',
              line: { color: colors.primary, width: 2 },
              fill: 'tozeroy',
              fillcolor: 'rgba(37,99,235,0.1)',
              hovertemplate: '%{x}<br>ETH Social Volume: %{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'Social Mentions' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 7: Token Age Consumed */}
      <ChartCard 
        title="Token Age Consumed (BTC)" 
        subtitle="Spikes indicate old coins moving — potential sell signal from long-term holders"
      >
        <Plot
          data={[
            {
              x: ageBtcChart.dates,
              y: ageBtcChart.values,
              type: 'scatter',
              mode: 'lines',
              name: 'BTC Age Consumed',
              line: { color: colors.danger, width: 1.5 },
              fill: 'tozeroy',
              fillcolor: 'rgba(239,68,68,0.1)',
              hovertemplate: '%{x}<br>Age Consumed: %{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'Coin Days Destroyed' },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Chart 8: Network Growth */}
      <ChartCard 
        title="Network Growth" 
        subtitle="New addresses created per day — indicates adoption rate and network expansion"
      >
        <Plot
          data={[
            {
              x: networkBtcChart.dates,
              y: rollingAverage(networkBtcChart.values, 7),
              type: 'scatter',
              mode: 'lines',
              name: 'BTC',
              line: { color: colors.warning, width: 2 },
              hovertemplate: '%{x}<br>BTC New Addresses: %{y:,.0f}<extra></extra>',
            },
            {
              x: networkEthChart.dates,
              y: rollingAverage(networkEthChart.values, 7),
              type: 'scatter',
              mode: 'lines',
              name: 'ETH',
              line: { color: colors.primary, width: 2 },
              hovertemplate: '%{x}<br>ETH New Addresses: %{y:,.0f}<extra></extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            yaxis: { ...defaultLayout.yaxis, title: 'New Addresses (7-day avg)' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Narrative Box */}
      <NarrativeBox title="On-Chain Metrics Analysis">
        <p>
          <strong>MVRV Analysis:</strong> Bitcoin MVRV at <strong>{btcMvrv !== null ? formatMultiple(btcMvrv) : '—'}</strong> ({btcMvrvStatus}) 
          and Ethereum at <strong>{ethMvrv !== null ? formatMultiple(ethMvrv) : '—'}</strong> ({ethMvrvStatus}). 
          MVRV above 3.5 historically signals market tops; below 0.7 indicates capitulation bottoms.
        </p>
        <p>
          <strong>Exchange Flows:</strong> Recent 30-day average net flow shows {flowSignal} pattern. 
          Negative net flow (coins leaving exchanges) suggests investors are moving to cold storage — a bullish signal. 
          Positive net flow indicates potential selling pressure ahead.
        </p>
        <p>
          <strong>Network Health:</strong> Daily active addresses of <strong>{formatNumber(totalDaa)}</strong> (BTC+ETH combined) 
          reflect current network usage. Sustained growth in active addresses and new address creation 
          typically precedes or confirms bullish price action.
        </p>
        <p>
          <strong>Developer Commitment:</strong> Consistent developer activity across Ethereum ecosystem projects 
          indicates ongoing innovation and maintenance. Declining dev activity can be an early warning sign 
          of project stagnation.
        </p>
      </NarrativeBox>
    </div>
  )
}
