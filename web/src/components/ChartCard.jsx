export default function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`bg-white rounded-lg border border-(--color-border) p-5 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-sm font-semibold text-(--color-text)">{title}</h3>
          )}
          {subtitle && (
            <p className="text-xs text-(--color-text-secondary) mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      <div className="w-full">{children}</div>
    </div>
  )
}
