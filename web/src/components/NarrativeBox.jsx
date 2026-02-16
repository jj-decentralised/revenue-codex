export default function NarrativeBox({ title, children }) {
  return (
    <div className="border-l-4 border-(--color-ink) bg-(--color-paper-warm) p-5">
      {title && (
        <h4 className="text-[11px] font-semibold text-(--color-ink-muted) uppercase tracking-widest mb-2">
          {title}
        </h4>
      )}
      <div className="text-sm text-(--color-ink-light) leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  )
}
