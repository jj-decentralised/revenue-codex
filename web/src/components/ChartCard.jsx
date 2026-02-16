import { downloadCSV } from '../utils/csv'

export default function ChartCard({ title, subtitle, children, className = '', csvData }) {
  return (
    <div className={`bg-white rounded-lg border border-(--color-border) p-5 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-(--color-text)">{title}</h3>
            )}
            {subtitle && (
              <p className="text-xs text-(--color-text-secondary) mt-0.5">{subtitle}</p>
            )}
          </div>
          {csvData && (
            <button
              onClick={() => downloadCSV(csvData.filename, csvData.headers, csvData.rows)}
              className="shrink-0 text-xs text-(--color-text-secondary) hover:text-(--color-primary) cursor-pointer flex items-center gap-1 px-2 py-1 rounded border border-(--color-border) hover:border-(--color-primary) transition-colors"
              title="Export CSV"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              CSV
            </button>
          )}
        </div>
      )}
      <div className="w-full">{children}</div>
    </div>
  )
}
