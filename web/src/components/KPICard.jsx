export default function KPICard({ title, value, subtitle, trend, className = '' }) {
  const trendColor = trend > 0
    ? 'text-(--color-positive)'
    : trend < 0
      ? 'text-(--color-negative)'
      : 'text-(--color-ink-muted)'

  return (
    <div className={`border border-(--color-rule) p-5 ${className}`}>
      <p className="text-[11px] font-semibold text-(--color-ink-muted) uppercase tracking-widest">
        {title}
      </p>
      <p className="text-2xl font-bold font-serif mt-1 text-(--color-ink)">
        {value ?? '—'}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {trend !== undefined && trend !== null && (
          <span className={`text-xs font-mono font-medium ${trendColor}`}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {subtitle && (
          <span className="text-xs text-(--color-ink-muted)">{subtitle}</span>
        )}
      </div>
    </div>
  )
}
