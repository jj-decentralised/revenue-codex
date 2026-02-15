# Revenue Codex
Crypto Revenue Analytics Dashboard — bridging on-chain fundamentals with TradFi market analysis.

## Features
- 13 analytical tabs with comprehensive crypto revenue intelligence
- Real-time data from 7 professional data sources
- Professional scatter plots, categorical breakdowns, and economic analysis
- Clean white aesthetic with interactive Plotly.js charts
- React.lazy code splitting for optimized bundle sizes

## Dashboard Tabs (13 Total)

### Group 1: Revenue Fundamentals
1. **Valuations & Multiples** — P/S ratios, market cap vs revenue analysis
2. **Sentiment Disconnect** — Fear & Greed vs price action, market psychology
3. **Revenue Quality** — Revenue sustainability, concentration risk, volatility

### Group 2: Moats & Strategy
4. **Moats** — Protocol defensibility, network effects, switching costs
5. **Future Leaders** — Emerging protocols, growth trajectory analysis
6. **Capital Efficiency** — TVL efficiency, revenue per dollar locked

### Group 3: Market Intelligence
7. **Market Structure** — Order book depth, liquidity analysis, exchange metrics
8. **Derivatives Intelligence** — Funding rates, open interest, futures analysis
9. **Yield Analysis** — Staking yields, DeFi rates, risk-adjusted returns

### Group 4: Macro & On-Chain
10. **Macro Correlations** — Crypto vs traditional assets, macro regime analysis
11. **On-Chain Economy** — Transaction volumes, fee markets, network activity
12. **Developer Activity** — GitHub commits, active developers, protocol health
13. **On-Chain Metrics** — Santiment on-chain data, holder behavior, network value

## Data Sources (7 Total)
1. **DeFiLlama** — TVL, protocol revenues, fees (free API)
2. **Token Terminal Pro** — Professional protocol metrics
3. **CoinGecko Pro** — Market data, prices, exchange volumes
4. **Coinglass Pro** — Derivatives data, funding rates, liquidations
5. **Santiment Pro** — On-chain metrics, social sentiment, developer activity
6. **Alternative.me** — Fear & Greed Index (free API)
7. **Yahoo Finance** — Traditional market data, macro indicators

## Tech Stack
- React 19 + Vite 6 + Tailwind CSS v4
- Plotly.js (basic dist) for interactive charts
- Vercel serverless functions for API proxying
- React.lazy + Suspense for code splitting

## Environment Variables
Required API keys for full functionality:
```
TOKEN_TERMINAL_API_KEY=your_token_terminal_key
COINGECKO_API_KEY=your_coingecko_pro_key
COINGLASS_API_KEY=your_coinglass_pro_key
SANTIMENT_API_KEY=your_santiment_pro_key
```

## Quick Start
```bash
# Install dependencies
cd web && npm install

# Development
npm run dev

# Production build
npm run build
```

## Deployment
Deploy to Vercel with environment variables configured in project settings.
