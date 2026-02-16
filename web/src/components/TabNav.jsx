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
    <nav className="border-b border-(--color-rule) overflow-x-auto">
      <div className="flex flex-wrap gap-x-1 gap-y-0 items-end">
        {groups.map((group, groupIndex) => (
          <div key={group} className="flex items-end">
            {/* Group divider (except for first group) */}
            {groupIndex > 0 && (
              <div className="w-px h-5 bg-(--color-rule) mx-2 mb-2" />
            )}
            {/* Group label */}
            <span className="text-[10px] font-semibold text-(--color-ink-muted) uppercase tracking-widest mr-1.5 mb-2.5 hidden sm:inline">
              {group}
            </span>
            {/* Group tabs */}
            <div className="flex gap-0">
              {groupedTabs[group].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer border-b-2 ${
                    activeTab === tab.id
                      ? 'border-(--color-ink) text-(--color-ink)'
                      : 'border-transparent text-(--color-ink-muted) hover:text-(--color-ink) hover:border-(--color-rule)'
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
