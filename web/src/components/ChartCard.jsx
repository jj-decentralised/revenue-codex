import { useRef, useCallback } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import { downloadCSV } from '../utils/csv'

export default function ChartCard({ title, subtitle, children, className = '', csvData }) {
  const chartRef = useRef(null)

  const handleJpegExport = useCallback(() => {
    // Find the Plotly graph div inside the chart card
    const plotDiv = chartRef.current?.querySelector('.js-plotly-plot')
    if (!plotDiv) return
    const fname = csvData?.filename || title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'chart'
    Plotly.downloadImage(plotDiv, {
      format: 'jpeg',
      width: 1200,
      height: 800,
      scale: 2,
      filename: fname,
    })
  }, [csvData, title])

  return (
    <div className={`border border-(--color-rule) bg-(--color-paper) p-6 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h3 className="font-serif text-lg font-bold text-(--color-ink)">{title}</h3>
            )}
            {subtitle && (
              <p className="text-sm text-(--color-ink-muted) mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleJpegExport}
              className="text-xs font-mono text-(--color-ink-muted) hover:text-(--color-ink) cursor-pointer flex items-center gap-1 px-2 py-1 border border-(--color-rule) hover:border-(--color-ink) transition-colors"
              title="Export JPEG"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              JPEG
            </button>
            {csvData && (
              <button
                onClick={() => downloadCSV(csvData.filename, csvData.headers, csvData.rows)}
                className="text-xs font-mono text-(--color-ink-muted) hover:text-(--color-ink) cursor-pointer flex items-center gap-1 px-2 py-1 border border-(--color-rule) hover:border-(--color-ink) transition-colors"
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
        </div>
      )}
      <div ref={chartRef} className="w-full">{children}</div>
    </div>
  )
}
