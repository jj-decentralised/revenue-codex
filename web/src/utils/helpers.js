export function formatCurrency(value, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) return '—'
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(decimals || 1)}B`
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(decimals || 1)}M`
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(decimals || 1)}K`
  return `$${value.toFixed(decimals)}`
}

export function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '—'
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(decimals)}B`
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(decimals)}M`
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(decimals)}K`
  return value.toFixed(decimals)
}

export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return '—'
  return `${value.toFixed(decimals)}%`
}

export function formatMultiple(value) {
  if (value === null || value === undefined || isNaN(value)) return '—'
  return `${value.toFixed(1)}x`
}

export function formatDate(timestamp) {
  const d = new Date(timestamp * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateShort(timestamp) {
  const d = new Date(timestamp * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export function percentile(arr, val) {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = sorted.findIndex(v => v >= val)
  return idx >= 0 ? (idx / sorted.length) * 100 : 100
}

export function rollingAverage(data, window = 7) {
  return data.map((_, i, arr) => {
    const start = Math.max(0, i - window + 1)
    const slice = arr.slice(start, i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

export function calculatePSRatio(marketCap, annualizedRevenue) {
  if (!annualizedRevenue || annualizedRevenue === 0) return null
  return marketCap / annualizedRevenue
}

export function calculatePERatio(marketCap, annualizedEarnings) {
  if (!annualizedEarnings || annualizedEarnings === 0) return null
  return marketCap / annualizedEarnings
}

export function categorizeSector(category) {
  const mapping = {
    'Dexes': 'Exchanges',
    'CEX': 'Exchanges',
    'Derivatives': 'Exchanges',
    'Lending': 'DeFi Lending',
    'CDP': 'DeFi Lending',
    'Bridge': 'Infrastructure',
    'Chain': 'Infrastructure',
    'Liquid Staking': 'Staking',
    'Restaking': 'Staking',
    'Stablecoins': 'Stablecoins',
    'RWA': 'RWA',
    'Yield': 'DeFi Yield',
    'Yield Aggregator': 'DeFi Yield',
    'NFT Marketplace': 'Consumer',
    'Gaming': 'Consumer',
    'Social': 'Consumer',
    'Prediction Market': 'Consumer',
  }
  return mapping[category] || 'Other'
}

export function groupByCategory(protocols) {
  const groups = {}
  for (const p of protocols) {
    const sector = categorizeSector(p.category)
    if (!groups[sector]) groups[sector] = []
    groups[sector].push(p)
  }
  return groups
}
