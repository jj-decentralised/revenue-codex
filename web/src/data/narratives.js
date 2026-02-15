export const valuationsNarrative = {
  title: 'The Tech P/S Analogy',
  paragraphs: [
    'Current crypto networks trading at 50x–100x P/S is not an anomaly — it mirrors how early-stage tech has always been priced. In 1999, infrastructure plays like Cisco traded at >130x P/S because the market was pricing in the infinite TAM of the internet. In 2020–21, SaaS companies like Snowflake traded at 50x–100x P/S.',
    'A bifurcation is emerging: Infrastructure (L1s/L2s) trades at massive dot-com-era multiples, while mature DeFi (Maker, Aave) trades at 15x–30x P/E — behaving much closer to TradFi value stocks.',
    'The scatter plot above visualizes this bifurcation: protocols in the upper-left quadrant are the "growth premium" plays; those in the lower-right are the "value" plays generating real cash flows.',
  ],
}

export const sentimentNarrative = {
  title: 'The TradFi "Divergence" Parallel: Energy in 2020',
  paragraphs: [
    'Has high revenue and low sentiment ever happened in TradFi? Yes. The Energy sector (XLE) in 2020–2021 experienced this exact dynamic. Sentiment was at historic lows due to ESG mandates, regulatory fears, and the "peak oil" narrative.',
    'Yet, as companies ruthlessly cut capex, Free Cash Flow exploded to record highs. Because the market refused to believe the cash flows were durable, P/E multiples actually compressed to single digits (3x–5x).',
    'Crypto is experiencing this exact "terminal fear discount" today despite record cash generation. The divergence between on-chain fundamentals and market sentiment represents one of the most compelling asymmetric setups in risk assets.',
  ],
}

export const revenueQualityNarrative = {
  title: 'Why Consumer Crypto Lags',
  paragraphs: [
    'Unlike Exchanges (where utility = speculation) and Stablecoins (where utility = frictionless fiat rail), Consumer Crypto suffers from the cold-start problem and mercenary liquidity.',
    'Apps like Farcaster struggle because their Lifetime Value (LTV) rarely exceeds Customer Acquisition Cost (CAC). They compete against free, frictionless Web2 monopolies.',
    'The only Web3 consumer apps generating massive revenue are hyper-financialized products — prediction markets (Polymarket) and memecoin platforms (Pump.fun). This suggests the market currently values crypto as financial infrastructure, not a consumer platform.',
  ],
  stablecoinDiversification: [
    'Are stablecoins diversifying away from T-Bills as rates drop? Yes.',
    'Ethena uses crypto-native yields (cash-and-carry basis trades). MakerDAO/Sky is aggressively diversifying into Private Credit and RWA loans. Tether is funding Bitcoin mining and investing in AI compute to hedge against falling yields.',
  ],
}

export const moatsNarrative = {
  title: 'Moat Durability Assessment',
  protocols: {
    tether: {
      name: 'Tether',
      rating: 'Highly Durable',
      analysis: 'Unmatched distribution and the "Lindy effect." It is the de facto checking account of emerging markets (Tron USDT in LATAM/Africa). Network effects compound — the more merchants accept USDT, the more users hold it.',
    },
    aave: {
      name: 'Aave',
      rating: 'Highly Durable',
      analysis: 'Its moat is composability and deep liquidity. Whales and institutions will not risk migrating to an unproven fork for a marginal 0.5% yield increase because they need deep liquidity to prevent slippage during liquidations.',
    },
    uniswap: {
      name: 'Uniswap',
      rating: 'Weakening',
      analysis: 'Brand and liquidity are strong, but DEX aggregators (1inch, CowSwap) commoditize liquidity. This is exactly why Uniswap is building a moat at the wallet/front-end layer and launching Unichain.',
    },
    hyperliquid: {
      name: 'Hyperliquid',
      rating: 'Emerging',
      analysis: 'Expanding from perp-DEX to L1. Their moat is architectural — an app-chain built exclusively for low-latency perps, completely bypassing Ethereum L1/L2 rent extraction.',
    },
    maker: {
      name: 'MakerDAO / Sky',
      rating: 'Durable',
      analysis: 'First-mover in decentralized stablecoins with DAI. Diversifying balance sheet into RWA gives it a unique hybrid position between DeFi and TradFi.',
    },
  },
}

export const futureLeadersNarrative = {
  title: 'Next Wave: RWA & AI Agents',
  rwa: [
    'If RWA grows 10x, value capture flows to Issuers/Packagers (Ondo, Securitize, Blackrock) who take AUM management fees, and Infrastructure/Oracles (Chainlink) that pipe off-chain pricing data on-chain.',
    'RWA is the clearest bridge between TradFi and DeFi — it brings the $500T+ traditional asset market on-chain, starting with the most liquid instruments: T-Bills, money markets, and corporate bonds.',
  ],
  ai: [
    'The 2024–25 cycle proved that attention can be tokenized via AI. However, for agents to be sticky, they need to actually DO things — not just exist as memecoins.',
    'The immediate winners are not the agents themselves, but the infrastructure they pay to exist: Base compute/data networks (Render, Akash) and routing networks (Morpheus, Bittensor) have clear, predictable revenue models driven by agentic compute demand.',
  ],
}

export const yieldAnalysisNarrative = {
  title: 'The DeFi Yield Landscape',
  paragraphs: [
    'The DeFi yield landscape reveals a fundamental truth: sustainable yields in crypto converge toward Treasury rates plus a risk premium. Pools offering >20% APY on stablecoins are either subsidized by token emissions (unsustainable), taking on smart contract risk, or running complex strategies.',
    'The median stablecoin yield of {medianStable} vs Treasury at {treasuryYield} implies a crypto risk premium of {riskPremium}bps — this premium compensates for smart contract risk, bridge risk, and counterparty risk.',
    'Higher yields almost always come with higher risk. The yield-TVL scatter shows this clearly: large, battle-tested pools offer modest yields, while smaller pools must offer premium APY to attract capital. This is rational market behavior — LPs demand compensation for illiquidity and smart contract risk.',
  ],
}

export const developerActivityNarrative = {
  title: 'Developer Activity: The Leading Indicator',
  paragraphs: [
    'Developer activity is the leading indicator of protocol health. Projects with high commit counts are shipping features that drive future revenue. The developer efficiency metric — revenue per commit — reveals which teams create the most economic value per unit of engineering effort.',
    'Ethereum ecosystem dominates in absolute dev count, but Solana projects show higher commit velocity per developer, suggesting faster iteration cycles. Bitcoin development remains conservative by design, prioritizing stability over rapid feature deployment.',
    'Community metrics (Twitter followers, Reddit subscribers) represent social capital that translates into user acquisition potential. Projects with strong developer activity AND community engagement exhibit the most durable competitive moats.',
  ],
}

export const riskPremiumNarrative = {
  title: 'The Crypto Risk Premium: A Cross-Sectional Study',
  paragraphs: [
    'The crypto risk premium — the spread between DeFi yields and the risk-free rate — compensates investors for smart contract vulnerability, oracle manipulation, bridge risk, and regulatory uncertainty. Our cross-sectional analysis of {totalPools} stablecoin pools with TVL >$100K reveals a median risk premium of {medianPremium}bps above the 13-week Treasury rate.',
    'This premium exhibits a clear scale effect: pools with >$100M TVL earn {largePoolPremium} average premium vs {smallPoolPremium} for <$1M pools, consistent with information-efficient markets where large, battle-tested protocols trade at tighter spreads. Capital flows rationally to where risk-adjusted returns are most attractive.',
    'The efficient frontier analysis reveals which protocols offer the best risk-adjusted yields — high APY with low volatility. The DeFi Sharpe Ratio proxy (return over spread) identifies protocols that consistently deliver premium returns without excessive variance, the holy grail for yield-seeking capital.',
    'Chain-level analysis shows significant dispersion in risk premiums. Newer chains and L2s command higher premiums, reflecting the market\'s rational pricing of bridge risk, ecosystem maturity, and liquidity depth. This premium compression as chains mature mirrors the corporate bond market\'s treatment of emerging vs established issuers.',
  ],
}

export const tokenomicsStudyNarrative = {
  title: 'Tokenomics & Value Accrual Mechanisms',
  paragraphs: [
    'Not all protocol revenue is created equal from a token valuation perspective. The critical question is: how much of protocol-generated fees actually accrues to the token? Our analysis reveals a stark bifurcation between value accrual mechanisms.',
    'Fee-burn mechanisms (ETH-style) create deflationary pressure proportional to usage, directly linking network activity to token scarcity. Staking-reward models distribute fees directly to stakers but face dilution headwinds from token emissions.',
    'Treasury accrual models (UNI, MKR) route revenue to the DAO, creating optionality but no direct token holder yield until governance votes for distributions. Buyback & burn hybrids attempt to combine direct value accrual with deflationary mechanics.',
  ],
  conclusion: 'The market currently prices fee-burn tokens at premium multiples — rational given that fee-burn has no dilution overhead and creates reflexive buying pressure during high-usage periods.',
}
