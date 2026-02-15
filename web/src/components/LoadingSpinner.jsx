export default function LoadingSpinner({ message = 'Loading data...', fullScreen = false }) {
  const content = (
    <div className="flex flex-col items-center justify-center">
      {/* Logo / Brand */}
      <div className="relative mb-6">
        {/* Outer ring pulse */}
        <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-(--color-primary) opacity-20 animate-ping" />
        {/* Spinner */}
        <div className="relative w-16 h-16 rounded-full border-3 border-(--color-border) border-t-(--color-primary) animate-spin" />
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-(--color-primary) animate-pulse" />
        </div>
      </div>
      
      {/* Brand Text */}
      <h2 className="text-xl font-semibold text-(--color-text) tracking-wide mb-2">
        Revenue Codex
      </h2>
      
      {/* Loading Message */}
      <p className="text-sm text-(--color-text-secondary) animate-pulse">
        {message}
      </p>
      
      {/* Progress dots animation */}
      <div className="flex gap-1 mt-4">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-(--color-primary)"
            style={{
              animation: 'bounce 1s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
              opacity: 0.6
            }}
          />
        ))}
      </div>
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--color-background)">
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
