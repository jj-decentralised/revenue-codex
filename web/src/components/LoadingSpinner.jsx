export default function LoadingSpinner({ message = 'Loading data...', fullScreen = false }) {
  const content = (
    <div className="flex flex-col items-center justify-center">
      {/* Spinner */}
      <div className="relative mb-6">
        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-(--color-ink) opacity-10 animate-ping" />
        <div className="relative w-12 h-12 rounded-full border-2 border-(--color-rule) border-t-(--color-ink) animate-spin" />
      </div>

      {/* Brand Text */}
      <h2 className="font-serif text-xl font-bold text-(--color-ink) tracking-tight mb-2">
        Revenue Codex
      </h2>

      {/* Loading Message */}
      <p className="text-sm text-(--color-ink-muted) animate-pulse">
        {message}
      </p>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--color-paper)">
        {content}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-20">
      {content}
    </div>
  )
}
