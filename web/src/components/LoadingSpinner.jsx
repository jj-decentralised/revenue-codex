export default function LoadingSpinner({ message = 'Loading data...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-(--color-border) border-t-(--color-primary) rounded-full animate-spin" />
      <p className="text-sm text-(--color-text-secondary) mt-3">{message}</p>
    </div>
  )
}
