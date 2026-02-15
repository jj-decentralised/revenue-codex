import { useState } from 'react'
import Layout from './components/Layout'
import TabNav from './components/TabNav'
import ValuationsTab from './components/tabs/ValuationsTab'
import SentimentTab from './components/tabs/SentimentTab'
import RevenueQualityTab from './components/tabs/RevenueQualityTab'
import MoatsTab from './components/tabs/MoatsTab'
import FutureLeadersTab from './components/tabs/FutureLeadersTab'
import CapitalEfficiencyTab from './components/tabs/CapitalEfficiencyTab'
import MarketStructureTab from './components/tabs/MarketStructureTab'
import DerivativesTab from './components/tabs/DerivativesTab'
import YieldAnalysisTab from './components/tabs/YieldAnalysisTab'
import MacroTab from './components/tabs/MacroTab'
import OnChainEconomyTab from './components/tabs/OnChainEconomyTab'
import DeveloperActivityTab from './components/tabs/DeveloperActivityTab'

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
]

const TAB_COMPONENTS = {
  valuations: ValuationsTab,
  sentiment: SentimentTab,
  quality: RevenueQualityTab,
  moats: MoatsTab,
  future: FutureLeadersTab,
  efficiency: CapitalEfficiencyTab,
  structure: MarketStructureTab,
  derivatives: DerivativesTab,
  yield: YieldAnalysisTab,
  macro: MacroTab,
  onchain: OnChainEconomyTab,
  developer: DeveloperActivityTab,
}

export default function App() {
  const [activeTab, setActiveTab] = useState('valuations')
  const ActiveComponent = TAB_COMPONENTS[activeTab]

  return (
    <Layout>
      <TabNav tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="mt-6">
        <ActiveComponent />
      </div>
    </Layout>
  )
}
