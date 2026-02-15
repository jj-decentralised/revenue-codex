import { useState, lazy, Suspense } from 'react'
import Layout from './components/Layout'
import TabNav from './components/TabNav'
import LoadingSpinner from './components/LoadingSpinner'
import { DashboardSkeleton } from './components/ChartSkeleton'
import { useData } from './context/DataProvider'

// Lazy load all tabs for code splitting
const ValuationsTab = lazy(() => import('./components/tabs/ValuationsTab'))
const SentimentTab = lazy(() => import('./components/tabs/SentimentTab'))
const RevenueQualityTab = lazy(() => import('./components/tabs/RevenueQualityTab'))
const MoatsTab = lazy(() => import('./components/tabs/MoatsTab'))
const FutureLeadersTab = lazy(() => import('./components/tabs/FutureLeadersTab'))
const CapitalEfficiencyTab = lazy(() => import('./components/tabs/CapitalEfficiencyTab'))
const MarketStructureTab = lazy(() => import('./components/tabs/MarketStructureTab'))
const DerivativesTab = lazy(() => import('./components/tabs/DerivativesTab'))
const YieldAnalysisTab = lazy(() => import('./components/tabs/YieldAnalysisTab'))
const MacroTab = lazy(() => import('./components/tabs/MacroTab'))
const OnChainEconomyTab = lazy(() => import('./components/tabs/OnChainEconomyTab'))
const DeveloperActivityTab = lazy(() => import('./components/tabs/DeveloperActivityTab'))
const OnChainMetricsTab = lazy(() => import('./components/tabs/OnChainMetricsTab'))
const PowerLawTab = lazy(() => import('./components/tabs/PowerLawTab'))
const RiskPremiumTab = lazy(() => import('./components/tabs/RiskPremiumTab'))
const NetworkEffectsTab = lazy(() => import('./components/tabs/NetworkEffectsTab'))
const MEVStudyTab = lazy(() => import('./components/tabs/MEVStudyTab'))
const TokenomicsStudyTab = lazy(() => import('./components/tabs/TokenomicsStudyTab'))

const TABS = [
  // Group 1: Revenue Fundamentals
  { id: 'valuations', label: 'Valuations & Multiples', group: 'Revenue Fundamentals' },
  { id: 'sentiment', label: 'Sentiment Disconnect', group: 'Revenue Fundamentals' },
  { id: 'quality', label: 'Revenue Quality', group: 'Revenue Fundamentals' },
  // Group 2: Moats & Strategy
  { id: 'moats', label: 'Moats', group: 'Moats & Strategy' },
  { id: 'future', label: 'Future Leaders', group: 'Moats & Strategy' },
  { id: 'efficiency', label: 'Capital Efficiency', group: 'Moats & Strategy' },
  // Group 3: Market Intelligence
  { id: 'structure', label: 'Market Structure', group: 'Market Intelligence' },
  { id: 'derivatives', label: 'Derivatives Intelligence', group: 'Market Intelligence' },
  { id: 'yield', label: 'Yield Analysis', group: 'Market Intelligence' },
  // Group 4: Macro & On-Chain
  { id: 'macro', label: 'Macro Correlations', group: 'Macro & On-Chain' },
  { id: 'onchain', label: 'On-Chain Economy', group: 'Macro & On-Chain' },
  { id: 'developer', label: 'Developer Activity', group: 'Macro & On-Chain' },
  { id: 'onchainmetrics', label: 'On-Chain Metrics', group: 'Macro & On-Chain' },
  // Group 5: Research Studies
  { id: 'powerlaw', label: 'Power Laws', group: 'Research Studies' },
  { id: 'riskpremium', label: 'Risk Premium', group: 'Research Studies' },
  { id: 'networkeffects', label: 'Network Effects', group: 'Research Studies' },
  { id: 'mevstudy', label: 'MEV & Revenue', group: 'Research Studies' },
  { id: 'tokenomics', label: 'Tokenomics', group: 'Research Studies' },
]

const TAB_COMPONENTS = {
  valuations: ValuationsTab,
  sentiment: SentimentTab,
  quality: RevenueQualityTab,
  moats: MoatsTab,
  future: FutureLeadersTab,
  efficiency: CapitalEfficiencyTab,
  tokenomics: TokenomicsStudyTab,
  structure: MarketStructureTab,
  derivatives: DerivativesTab,
  yield: YieldAnalysisTab,
  riskpremium: RiskPremiumTab,
  macro: MacroTab,
  onchain: OnChainEconomyTab,
  developer: DeveloperActivityTab,
  onchainmetrics: OnChainMetricsTab,
  powerlaw: PowerLawTab,
  networkeffects: NetworkEffectsTab,
  mevstudy: MEVStudyTab,
}

export default function App() {
  const [activeTab, setActiveTab] = useState('valuations')
  const { warming } = useData()
  const ActiveComponent = TAB_COMPONENTS[activeTab]

  return (
    <Layout>
      {/* Subtle top-bar indicator while background cache is warming */}
      {warming && (
        <div className="h-0.5 bg-(--color-border) rounded overflow-hidden mb-2">
          <div
            className="h-full bg-(--color-primary) rounded"
            style={{
              animation: 'warmingBar 2s ease-in-out infinite',
              width: '40%',
            }}
          />
          <style>{`
            @keyframes warmingBar {
              0% { margin-left: 0%; }
              50% { margin-left: 60%; }
              100% { margin-left: 0%; }
            }
          `}</style>
        </div>
      )}
      <TabNav tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="mt-6">
        <Suspense fallback={<DashboardSkeleton />}>
          <ActiveComponent />
        </Suspense>
      </div>
    </Layout>
  )
}
