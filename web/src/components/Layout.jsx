export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-(--color-bg)">
      <header className="bg-white border-b border-(--color-border) px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-(--color-text)">
              Revenue Codex
            </h1>
            <p className="text-sm text-(--color-text-secondary) mt-0.5">
              Crypto Revenue Analytics — On-chain Fundamentals vs TradFi
            </p>
          </div>
          <div className="text-xs text-(--color-text-secondary)">
            Data: DeFiLlama · CoinGecko · Coinglass
          </div>
        </div>
      </header>
      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  )
}
