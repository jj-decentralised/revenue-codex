import { useState, useEffect } from 'react'
import Plot, { defaultLayout, defaultConfig, colors } from '../Plot'
import ChartCard from '../ChartCard'
import KPICard from '../KPICard'
import NarrativeBox from '../NarrativeBox'
import LoadingSpinner from '../LoadingSpinner'
import { fetchDeveloperActivityData } from '../../services/api'
import { formatNumber, formatPercent } from '../../utils/helpers'
import { developerActivityNarrative } from '../../data/narratives'

export default function DeveloperActivityTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchDeveloperActivityData()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner message="Loading developer activity data..." />
  if (error) return <div className="text-center py-20 text-(--color-danger)">Error: {error}</div>

  const coins = data?.coins || []
  const feesProtocols = data?.fees?.protocols || []

  // Extract developer and community data
  const projectData = coins.map(c => {
    const dev = c.data?.developer_data || {}
    const community = c.data?.community_data || {}
    const name = c.data?.name || c.id

    // Find matching revenue from DeFiLlama
    const feeMatch = feesProtocols.find(p =>
      (p.slug || '').toLowerCase() === c.id.replace('-', '') ||
      (p.name || '').toLowerCase() === name.toLowerCase() ||
      (p.slug || '').toLowerCase().includes(c.id.split('-')[0])
    )

    return {
      id: c.id,
      name,
      symbol: c.data?.symbol?.toUpperCase() || '',
      commits4w: dev.commit_count_4_weeks || 0,
      forks: dev.forks || 0,
      stars: dev.stars || 0,
      totalIssues: dev.total_issues || 0,
      closedIssues: dev.closed_issues || 0,
      pullRequestsMerged: dev.pull_requests_merged || 0,
      twitterFollowers: community.twitter_followers || 0,
      redditSubscribers: community.reddit_subscribers || 0,
      revenue24h: feeMatch?.total24h || 0,
      issueCloseRate: dev.total_issues > 0 ? (dev.closed_issues / dev.total_issues) * 100 : 0,
    }
  }).filter(p => p.commits4w > 0 || p.twitterFollowers > 0)

  // KPI calculations
  const totalCommits = projectData.reduce((sum, p) => sum + p.commits4w, 0)
  const totalTwitter = projectData.reduce((sum, p) => sum + p.twitterFollowers, 0)
  const avgCloseRate = projectData.filter(p => p.totalIssues > 0).length > 0
    ? projectData.filter(p => p.totalIssues > 0).reduce((sum, p) => sum + p.issueCloseRate, 0) / projectData.filter(p => p.totalIssues > 0).length
    : 0
  const mostActive = [...projectData].sort((a, b) => b.commits4w - a.commits4w)[0]

  // Sort by commits for bar chart
  const byCommits = [...projectData].sort((a, b) => b.commits4w - a.commits4w)

  // Projects with revenue for efficiency scatter
  const withRevenue = projectData.filter(p => p.revenue24h > 0)

  // Sort by stars for stars vs revenue
  const byStars = [...projectData].filter(p => p.stars > 0).sort((a, b) => b.stars - a.stars)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Total GitHub Commits (4wk)"
          value={formatNumber(totalCommits, 0)}
          subtitle="Across tracked projects"
        />
        <KPICard
          title="Total Twitter Followers"
          value={formatNumber(totalTwitter, 1)}
          subtitle="Combined reach"
        />
        <KPICard
          title="Avg Issue Close Rate"
          value={formatPercent(avgCloseRate)}
          subtitle="Developer responsiveness"
        />
        <KPICard
          title="Most Active Project"
          value={mostActive?.name || '—'}
          subtitle={mostActive ? `${formatNumber(mostActive.commits4w, 0)} commits` : ''}
        />
      </div>

      {/* Developer Activity Rankings */}
      <ChartCard title="Developer Activity Rankings" subtitle="GitHub commits in the last 4 weeks — shows which protocols are shipping the most code">
        <Plot
          data={[{
            x: byCommits.map(p => p.name),
            y: byCommits.map(p => p.commits4w),
            type: 'bar',
            marker: { color: byCommits.map((_, i) => colors.palette[i % colors.palette.length]), line: { width: 0 } },
            hovertemplate: '%{x}<br>%{y:,.0f} commits<extra></extra>',
          }]}
          layout={{ ...defaultLayout, height: 400, xaxis: { ...defaultLayout.xaxis, tickangle: -45 }, yaxis: { ...defaultLayout.yaxis, title: 'Commits (4 weeks)' } }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Developer Efficiency Scatter */}
      {withRevenue.length > 0 && (
        <ChartCard title="Developer Efficiency Scatter" subtitle="X = Commits (4wk), Y = Protocol Revenue (24h) — reveals revenue per unit of development effort">
          <Plot
            data={[{
              x: withRevenue.map(p => p.commits4w),
              y: withRevenue.map(p => p.revenue24h),
              text: withRevenue.map(p => `${p.name}<br>Commits: ${p.commits4w}<br>Revenue: $${(p.revenue24h / 1e3).toFixed(1)}K`),
              mode: 'markers+text',
              type: 'scatter',
              textposition: 'top center',
              textfont: { size: 10 },
              marker: {
                size: withRevenue.map(p => Math.max(12, Math.min(40, Math.sqrt(p.revenue24h / 100)))),
                color: withRevenue.map((_, i) => colors.palette[i % colors.palette.length]),
                opacity: 0.75,
                line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 450,
              xaxis: { ...defaultLayout.xaxis, title: 'Commits (4 weeks)', type: 'log' },
              yaxis: { ...defaultLayout.yaxis, title: 'Protocol Revenue (USD, 24h)', type: 'log' },
              showlegend: false,
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      {/* Community Metrics - Grouped Bar */}
      <ChartCard title="Community Metrics" subtitle="Twitter followers and Reddit subscribers — shows social capital">
        <Plot
          data={[
            {
              x: projectData.map(p => p.name),
              y: projectData.map(p => p.twitterFollowers),
              name: 'Twitter Followers',
              type: 'bar',
              marker: { color: colors.primary },
              hovertemplate: '%{x}<br>%{y:,.0f} followers<extra>Twitter</extra>',
            },
            {
              x: projectData.map(p => p.name),
              y: projectData.map(p => p.redditSubscribers),
              name: 'Reddit Subscribers',
              type: 'bar',
              marker: { color: colors.secondary },
              hovertemplate: '%{x}<br>%{y:,.0f} subscribers<extra>Reddit</extra>',
            },
          ]}
          layout={{
            ...defaultLayout,
            height: 400,
            barmode: 'group',
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            yaxis: { ...defaultLayout.yaxis, title: 'Followers / Subscribers' },
            legend: { ...defaultLayout.legend, orientation: 'h', y: 1.08 },
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* Code Quality Indicators */}
      <ChartCard title="Code Quality Indicators" subtitle="Issue close rate (closed / total) — higher rate indicates more responsive development team">
        <Plot
          data={[{
            x: projectData.filter(p => p.totalIssues > 0).map(p => p.name),
            y: projectData.filter(p => p.totalIssues > 0).map(p => p.issueCloseRate),
            type: 'bar',
            marker: {
              color: projectData.filter(p => p.totalIssues > 0).map(p =>
                p.issueCloseRate >= 80 ? colors.success :
                p.issueCloseRate >= 50 ? colors.warning : colors.danger
              ),
              line: { width: 0 },
            },
            hovertemplate: '%{x}<br>Close rate: %{y:.1f}%<extra></extra>',
          }]}
          layout={{
            ...defaultLayout,
            height: 350,
            xaxis: { ...defaultLayout.xaxis, tickangle: -45 },
            yaxis: { ...defaultLayout.yaxis, title: 'Issue Close Rate (%)', range: [0, 100] },
            shapes: [{
              type: 'line',
              x0: -0.5,
              x1: projectData.filter(p => p.totalIssues > 0).length - 0.5,
              y0: avgCloseRate,
              y1: avgCloseRate,
              line: { color: '#9CA3AF', dash: 'dash', width: 1 },
            }],
          }}
          config={defaultConfig}
          className="w-full"
        />
      </ChartCard>

      {/* GitHub Stars vs Revenue */}
      {byStars.length > 0 && (
        <ChartCard title="GitHub Stars vs Revenue" subtitle="Do popular open-source projects generate more revenue?">
          <Plot
            data={[{
              x: byStars.map(p => p.stars),
              y: byStars.map(p => p.revenue24h || 1), // Use 1 as minimum for log scale
              text: byStars.map(p => p.name),
              mode: 'markers+text',
              type: 'scatter',
              textposition: 'top center',
              textfont: { size: 10 },
              marker: {
                size: byStars.map(p => Math.max(10, Math.min(35, Math.sqrt(p.commits4w) * 2))),
                color: byStars.map((_, i) => colors.palette[i % colors.palette.length]),
                opacity: 0.75,
                line: { width: 1, color: '#FFF' },
              },
              hovertemplate: '%{text}<br>Stars: %{x:,.0f}<br>Revenue: $%{y:,.0f}<extra></extra>',
            }]}
            layout={{
              ...defaultLayout,
              height: 450,
              xaxis: { ...defaultLayout.xaxis, title: 'GitHub Stars', type: 'log' },
              yaxis: { ...defaultLayout.yaxis, title: 'Protocol Revenue (USD, 24h)', type: 'log' },
              showlegend: false,
            }}
            config={defaultConfig}
            className="w-full"
          />
        </ChartCard>
      )}

      <NarrativeBox title={developerActivityNarrative.title}>
        {developerActivityNarrative.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </NarrativeBox>
    </div>
  )
}
