export default function KPICard({ title, value, subtitle, trend, className = '' }) {
  const trendColor = trend > 0
    ? 'text-(--color-success)'
    : trend < 0
      ? 'text-(--color-danger)'
      : 'text-(--color-text-secondary)'

  return (
    <div className={`bg-white rounded-lg border border-(--color-border) p-5 ${className}`}>
      <p className="text-xs font-medium text-(--color-text-secondary) uppercase tracking-wide">
        {title}
      </p>
      <p className="text-2xl font-semibold mt-1 text-(--color-text)">
        {value ?? '—'}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {trend !== undefined && trend !== null && (
          <span className={`text-xs font-medium ${trendColor}`}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {subtitle && (
          <span className="text-xs text-(--color-text-secondary)">{subtitle}</span>
        )}
      </div>
    </div>
  )
}
