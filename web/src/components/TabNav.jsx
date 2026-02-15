export default function TabNav({ tabs, activeTab, onTabChange }) {
  return (
    <nav className="flex gap-1 bg-white rounded-lg border border-(--color-border) p-1 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
            activeTab === tab.id
              ? 'bg-(--color-primary) text-white shadow-sm'
              : 'text-(--color-text-secondary) hover:text-(--color-text) hover:bg-gray-50'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
