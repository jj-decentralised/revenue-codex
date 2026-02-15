export default function TabNav({ tabs, activeTab, onTabChange }) {
  // Group tabs by their group property
  const groupedTabs = tabs.reduce((acc, tab) => {
    const group = tab.group || 'Other'
    if (!acc[group]) acc[group] = []
    acc[group].push(tab)
    return acc
  }, {})

  const groups = Object.keys(groupedTabs)

  return (
    <nav className="bg-white rounded-lg border border-(--color-border) p-2 overflow-x-auto">
      <div className="flex flex-wrap gap-x-1 gap-y-2 items-center">
        {groups.map((group, groupIndex) => (
          <div key={group} className="flex items-center">
            {/* Group divider (except for first group) */}
            {groupIndex > 0 && (
              <div className="w-px h-6 bg-(--color-border) mx-2" />
            )}
            {/* Group label */}
            <span className="text-xs font-medium text-(--color-text-secondary) uppercase tracking-wide mr-2 hidden sm:inline">
              {group}
            </span>
            {/* Group tabs */}
            <div className="flex gap-1">
              {groupedTabs[group].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-(--color-primary) text-white shadow-sm'
                      : 'text-(--color-text-secondary) hover:text-(--color-text) hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
