export default function NarrativeBox({ title, children }) {
  return (
    <div className="bg-gray-50 border border-(--color-border) rounded-lg p-5">
      {title && (
        <h4 className="text-xs font-semibold text-(--color-primary) uppercase tracking-wide mb-2">
          {title}
        </h4>
      )}
      <div className="text-sm text-(--color-text-secondary) leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  )
}
