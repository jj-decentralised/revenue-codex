export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-(--color-paper)">
      <header className="border-b-2 border-(--color-ink) px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-(--color-ink)">
              Revenue Codex
            </h1>
            <p className="text-sm text-(--color-ink-muted) mt-0.5">
              Crypto Revenue Analytics — On-chain Fundamentals vs TradFi
            </p>
          </div>
          <div className="text-[11px] font-mono text-(--color-ink-muted) uppercase tracking-wider">
            Data: DeFiLlama · CoinGecko · Coinglass
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
