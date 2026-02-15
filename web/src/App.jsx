import { useState } from 'react'
import Layout from './components/Layout'
import TabNav from './components/TabNav'
import ValuationsTab from './components/tabs/ValuationsTab'
import SentimentTab from './components/tabs/SentimentTab'
import RevenueQualityTab from './components/tabs/RevenueQualityTab'
import MoatsTab from './components/tabs/MoatsTab'
import FutureLeadersTab from './components/tabs/FutureLeadersTab'
import MarketStructureTab from './components/tabs/MarketStructureTab'

const TABS = [
  { id: 'valuations', label: 'Valuations & Multiples' },
  { id: 'sentiment', label: 'Sentiment Disconnect' },
  { id: 'quality', label: 'Revenue Quality' },
  { id: 'moats', label: 'Moats' },
  { id: 'future', label: 'Future Leaders' },
  { id: 'structure', label: 'Market Structure' },
]

const TAB_COMPONENTS = {
  valuations: ValuationsTab,
  sentiment: SentimentTab,
  quality: RevenueQualityTab,
  moats: MoatsTab,
  future: FutureLeadersTab,
  structure: MarketStructureTab,
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
