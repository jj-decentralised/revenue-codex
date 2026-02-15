// Shimmer animation CSS-only loading skeletons for charts and KPIs

const shimmerStyle = {
  background: 'linear-gradient(90deg, var(--color-card) 25%, var(--color-border) 50%, var(--color-card) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite ease-in-out',
}

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('shimmer-keyframes')) {
  const style = document.createElement('style')
  style.id = 'shimmer-keyframes'
  style.textContent = `
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `
  document.head.appendChild(style)
}

export function ChartSkeleton({ height = 300, className = '' }) {
  return (
    <div 
      className={`rounded-lg overflow-hidden ${className}`}
      style={{ 
        ...shimmerStyle,
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: '200px'
      }}
    />
  )
}

export function KPISkeleton({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i}
          className="rounded-lg p-4"
          style={{ ...shimmerStyle, height: '80px' }}
        />
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 5, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header */}
      <div 
        className="rounded-lg"
        style={{ ...shimmerStyle, height: '40px' }}
      />
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div 
          key={i}
          className="rounded-lg"
          style={{ ...shimmerStyle, height: '48px', opacity: 1 - (i * 0.1) }}
        />
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* KPI Cards */}
      <KPISkeleton count={4} />
      
      {/* Main Chart */}
      <ChartSkeleton height={400} />
      
      {/* Two smaller charts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartSkeleton height={250} />
        <ChartSkeleton height={250} />
      </div>
    </div>
  )
}

export default ChartSkeleton
