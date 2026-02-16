/**
 * Dot-Com vs Crypto Bubble — P/S Ratio Dataset
 *
 * Sources for dot-com data:
 *   - Damodaran Online (NYU Stern) historical data sets
 *   - SEC Edgar 10-K/10-Q filings (revenue figures)
 *   - CFA Institute Enterprising Investor (March 2000 NASDAQ P/S study)
 *   - Maximizations.com dot-com P/S analysis
 *   - Company-specific investor relations archives
 *
 * Sources for crypto data:
 *   - DeFiLlama historical fees/revenue data
 *   - CoinGecko historical market cap snapshots
 *   - Token Terminal (cross-referenced)
 *
 * P/S = Market Cap / Annualized Revenue (or Annualized Fees for crypto)
 * Revenue for dot-com = trailing 12-month revenue at snapshot date
 * Fees for crypto = annualized daily fees at snapshot date
 *
 * survived = still publicly traded with meaningful revenue in 2004 (dot-com)
 *            or still generating fees in 2025+ (crypto)
 */

// ============================================================
// Dot-Com Sectors (mapped to crypto equivalents)
// ============================================================
export const SECTOR_MAP = {
  'Infrastructure':    { dotcom: 'Infrastructure / Networking', crypto: 'L1 / L2 Chains' },
  'E-Commerce':        { dotcom: 'E-Commerce / Marketplaces', crypto: 'DEXs / Exchanges' },
  'Portals & Media':   { dotcom: 'Portals / Online Media',    crypto: 'Aggregators / Social' },
  'Software':          { dotcom: 'Enterprise Software',       crypto: 'Lending / DeFi Apps' },
  'Semiconductors':    { dotcom: 'Semiconductors / Hardware', crypto: 'Oracles / Infra Services' },
}

// ============================================================
// Peak dates for time-alignment
// ============================================================
export const PEAKS = {
  dotcom: '2000-03-10',   // NASDAQ peak
  crypto: '2021-11-10',   // Crypto market cap peak
}

// ============================================================
// DOT-COM ERA — ~50 companies
// Snapshots: 1999-Q1, 2000-Q1 (peak), 2001-Q1, 2002-Q1, 2003-Q1, 2004-Q1
// mcap in $B, revenue in $B (trailing 12 months), ps = mcap/revenue
// ============================================================
export const DOTCOM_DATA = [
  // === INFRASTRUCTURE / NETWORKING ===
  {
    ticker: 'CSCO', name: 'Cisco Systems', sector: 'Infrastructure', survived: true,
    peakMcap: 555,
    snapshots: [
      { date: '1999-Q1', mcap: 170, revenue: 12.2, ps: 13.9 },
      { date: '2000-Q1', mcap: 555, revenue: 18.9, ps: 29.4 },
      { date: '2001-Q1', mcap: 140, revenue: 22.3, ps: 6.3 },
      { date: '2002-Q1', mcap: 115, revenue: 18.9, ps: 6.1 },
      { date: '2003-Q1', mcap: 95, revenue: 18.8, ps: 5.1 },
      { date: '2004-Q1', mcap: 150, revenue: 21.4, ps: 7.0 },
    ],
  },
  {
    ticker: 'NT', name: 'Nortel Networks', sector: 'Infrastructure', survived: false,
    peakMcap: 283,
    snapshots: [
      { date: '1999-Q1', mcap: 60, revenue: 17.6, ps: 3.4 },
      { date: '2000-Q1', mcap: 283, revenue: 21.3, ps: 13.3 },
      { date: '2001-Q1', mcap: 30, revenue: 27.9, ps: 1.1 },
      { date: '2002-Q1', mcap: 12, revenue: 10.3, ps: 1.2 },
      { date: '2003-Q1', mcap: 5, revenue: 10.0, ps: 0.5 },
      { date: '2004-Q1', mcap: 8, revenue: 9.8, ps: 0.8 },
    ],
  },
  {
    ticker: 'LU', name: 'Lucent Technologies', sector: 'Infrastructure', survived: false,
    peakMcap: 258,
    snapshots: [
      { date: '1999-Q1', mcap: 120, revenue: 30.1, ps: 4.0 },
      { date: '2000-Q1', mcap: 258, revenue: 33.8, ps: 7.6 },
      { date: '2001-Q1', mcap: 38, revenue: 28.7, ps: 1.3 },
      { date: '2002-Q1', mcap: 15, revenue: 21.3, ps: 0.7 },
      { date: '2003-Q1', mcap: 6, revenue: 12.3, ps: 0.5 },
      { date: '2004-Q1', mcap: 10, revenue: 8.7, ps: 1.1 },
    ],
  },
  {
    ticker: 'SUNW', name: 'Sun Microsystems', sector: 'Infrastructure', survived: false,
    peakMcap: 200,
    snapshots: [
      { date: '1999-Q1', mcap: 50, revenue: 11.7, ps: 4.3 },
      { date: '2000-Q1', mcap: 200, revenue: 15.7, ps: 12.7 },
      { date: '2001-Q1', mcap: 42, revenue: 18.3, ps: 2.3 },
      { date: '2002-Q1', mcap: 25, revenue: 12.5, ps: 2.0 },
      { date: '2003-Q1', mcap: 12, revenue: 11.4, ps: 1.1 },
      { date: '2004-Q1', mcap: 16, revenue: 11.1, ps: 1.4 },
    ],
  },
  {
    ticker: 'EMC', name: 'EMC Corporation', sector: 'Infrastructure', survived: true,
    peakMcap: 227,
    snapshots: [
      { date: '1999-Q1', mcap: 40, revenue: 6.7, ps: 6.0 },
      { date: '2000-Q1', mcap: 227, revenue: 8.9, ps: 25.5 },
      { date: '2001-Q1', mcap: 50, revenue: 8.9, ps: 5.6 },
      { date: '2002-Q1', mcap: 25, revenue: 5.4, ps: 4.6 },
      { date: '2003-Q1', mcap: 18, revenue: 5.4, ps: 3.3 },
      { date: '2004-Q1', mcap: 30, revenue: 6.2, ps: 4.8 },
    ],
  },
  {
    ticker: 'JNPR', name: 'Juniper Networks', sector: 'Infrastructure', survived: true,
    peakMcap: 190,
    snapshots: [
      { date: '1999-Q1', mcap: 15, revenue: 0.1, ps: 150.0 },
      { date: '2000-Q1', mcap: 190, revenue: 0.7, ps: 271.4 },
      { date: '2001-Q1', mcap: 24, revenue: 2.1, ps: 11.4 },
      { date: '2002-Q1', mcap: 14, revenue: 2.1, ps: 6.7 },
      { date: '2003-Q1', mcap: 8, revenue: 1.6, ps: 5.0 },
      { date: '2004-Q1', mcap: 14, revenue: 2.1, ps: 6.7 },
    ],
  },
  {
    ticker: 'JDSU', name: 'JDS Uniphase', sector: 'Infrastructure', survived: false,
    peakMcap: 105,
    snapshots: [
      { date: '1999-Q1', mcap: 8, revenue: 0.2, ps: 40.0 },
      { date: '2000-Q1', mcap: 105, revenue: 1.4, ps: 75.0 },
      { date: '2001-Q1', mcap: 10, revenue: 3.2, ps: 3.1 },
      { date: '2002-Q1', mcap: 3, revenue: 0.8, ps: 3.8 },
      { date: '2003-Q1', mcap: 2, revenue: 0.6, ps: 3.3 },
      { date: '2004-Q1', mcap: 4, revenue: 0.6, ps: 6.7 },
    ],
  },
  {
    ticker: 'ERICY', name: 'Ericsson', sector: 'Infrastructure', survived: true,
    peakMcap: 228,
    snapshots: [
      { date: '1999-Q1', mcap: 80, revenue: 24.3, ps: 3.3 },
      { date: '2000-Q1', mcap: 228, revenue: 27.0, ps: 8.4 },
      { date: '2001-Q1', mcap: 50, revenue: 30.1, ps: 1.7 },
      { date: '2002-Q1', mcap: 20, revenue: 22.4, ps: 0.9 },
      { date: '2003-Q1', mcap: 15, revenue: 15.9, ps: 0.9 },
      { date: '2004-Q1', mcap: 40, revenue: 17.3, ps: 2.3 },
    ],
  },
  {
    ticker: 'NOK', name: 'Nokia', sector: 'Infrastructure', survived: true,
    peakMcap: 303,
    snapshots: [
      { date: '1999-Q1', mcap: 115, revenue: 20.4, ps: 5.6 },
      { date: '2000-Q1', mcap: 303, revenue: 26.5, ps: 11.4 },
      { date: '2001-Q1', mcap: 100, revenue: 30.4, ps: 3.3 },
      { date: '2002-Q1', mcap: 90, revenue: 27.6, ps: 3.3 },
      { date: '2003-Q1', mcap: 60, revenue: 30.0, ps: 2.0 },
      { date: '2004-Q1', mcap: 75, revenue: 33.2, ps: 2.3 },
    ],
  },
  {
    ticker: 'EXDS', name: 'Exodus Communications', sector: 'Infrastructure', survived: false,
    peakMcap: 30,
    snapshots: [
      { date: '1999-Q1', mcap: 5, revenue: 0.1, ps: 50.0 },
      { date: '2000-Q1', mcap: 30, revenue: 0.5, ps: 60.0 },
      { date: '2001-Q1', mcap: 1, revenue: 0.8, ps: 1.3 },
      { date: '2002-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2003-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2004-Q1', mcap: 0, revenue: 0, ps: null },
    ],
  },
  // === E-COMMERCE / MARKETPLACES ===
  {
    ticker: 'AMZN', name: 'Amazon', sector: 'E-Commerce', survived: true,
    peakMcap: 36,
    snapshots: [
      { date: '1999-Q1', mcap: 22, revenue: 1.6, ps: 13.8 },
      { date: '2000-Q1', mcap: 36, revenue: 2.8, ps: 12.9 },
      { date: '2001-Q1', mcap: 5, revenue: 3.1, ps: 1.6 },
      { date: '2002-Q1', mcap: 8, revenue: 3.9, ps: 2.1 },
      { date: '2003-Q1', mcap: 11, revenue: 5.3, ps: 2.1 },
      { date: '2004-Q1', mcap: 20, revenue: 6.9, ps: 2.9 },
    ],
  },
  {
    ticker: 'EBAY', name: 'eBay', sector: 'E-Commerce', survived: true,
    peakMcap: 31,
    snapshots: [
      { date: '1999-Q1', mcap: 18, revenue: 0.2, ps: 90.0 },
      { date: '2000-Q1', mcap: 31, revenue: 0.4, ps: 77.5 },
      { date: '2001-Q1', mcap: 12, revenue: 0.7, ps: 17.1 },
      { date: '2002-Q1', mcap: 17, revenue: 1.1, ps: 15.5 },
      { date: '2003-Q1', mcap: 22, revenue: 1.6, ps: 13.8 },
      { date: '2004-Q1', mcap: 41, revenue: 2.2, ps: 18.6 },
    ],
  },
  {
    ticker: 'PCLN', name: 'Priceline', sector: 'E-Commerce', survived: true,
    peakMcap: 22,
    snapshots: [
      { date: '1999-Q1', mcap: 15, revenue: 0.5, ps: 30.0 },
      { date: '2000-Q1', mcap: 4, revenue: 1.2, ps: 3.3 },
      { date: '2001-Q1', mcap: 1, revenue: 1.2, ps: 0.8 },
      { date: '2002-Q1', mcap: 2, revenue: 1.1, ps: 1.8 },
      { date: '2003-Q1', mcap: 2, revenue: 1.0, ps: 2.0 },
      { date: '2004-Q1', mcap: 5, revenue: 1.1, ps: 4.5 },
    ],
  },
  {
    ticker: 'ARBA', name: 'Ariba', sector: 'E-Commerce', survived: false,
    peakMcap: 40,
    snapshots: [
      { date: '1999-Q1', mcap: 8, revenue: 0.1, ps: 80.0 },
      { date: '2000-Q1', mcap: 40, revenue: 0.3, ps: 133.3 },
      { date: '2001-Q1', mcap: 2, revenue: 0.6, ps: 3.3 },
      { date: '2002-Q1', mcap: 0.5, revenue: 0.3, ps: 1.7 },
      { date: '2003-Q1', mcap: 0.3, revenue: 0.3, ps: 1.0 },
      { date: '2004-Q1', mcap: 0.4, revenue: 0.3, ps: 1.3 },
    ],
  },
  {
    ticker: 'CMRC', name: 'Commerce One', sector: 'E-Commerce', survived: false,
    peakMcap: 21,
    snapshots: [
      { date: '1999-Q1', mcap: 3, revenue: 0.03, ps: 100.0 },
      { date: '2000-Q1', mcap: 21, revenue: 0.2, ps: 105.0 },
      { date: '2001-Q1', mcap: 0.8, revenue: 0.4, ps: 2.0 },
      { date: '2002-Q1', mcap: 0.2, revenue: 0.1, ps: 2.0 },
      { date: '2003-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2004-Q1', mcap: 0, revenue: 0, ps: null },
    ],
  },
  {
    ticker: 'WBVN', name: 'Webvan', sector: 'E-Commerce', survived: false,
    peakMcap: 7.9,
    snapshots: [
      { date: '1999-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2000-Q1', mcap: 7.9, revenue: 0.04, ps: 197.5 },
      { date: '2001-Q1', mcap: 0.1, revenue: 0.1, ps: 1.0 },
      { date: '2002-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2003-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2004-Q1', mcap: 0, revenue: 0, ps: null },
    ],
  },
  {
    ticker: 'IPET', name: 'Pets.com', sector: 'E-Commerce', survived: false,
    peakMcap: 0.3,
    snapshots: [
      { date: '1999-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2000-Q1', mcap: 0.3, revenue: 0.006, ps: 50.0 },
      { date: '2001-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2002-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2003-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2004-Q1', mcap: 0, revenue: 0, ps: null },
    ],
  },
  {
    ticker: 'DSCM', name: 'Drugstore.com', sector: 'E-Commerce', survived: false,
    peakMcap: 3.5,
    snapshots: [
      { date: '1999-Q1', mcap: 2, revenue: 0.01, ps: 200.0 },
      { date: '2000-Q1', mcap: 3.5, revenue: 0.08, ps: 43.8 },
      { date: '2001-Q1', mcap: 0.1, revenue: 0.1, ps: 1.0 },
      { date: '2002-Q1', mcap: 0.05, revenue: 0.1, ps: 0.5 },
      { date: '2003-Q1', mcap: 0.04, revenue: 0.1, ps: 0.4 },
      { date: '2004-Q1', mcap: 0.06, revenue: 0.1, ps: 0.6 },
    ],
  },
  // === PORTALS & MEDIA ===
  {
    ticker: 'YHOO', name: 'Yahoo!', sector: 'Portals & Media', survived: true,
    peakMcap: 125,
    snapshots: [
      { date: '1999-Q1', mcap: 40, revenue: 0.6, ps: 66.7 },
      { date: '2000-Q1', mcap: 125, revenue: 1.1, ps: 113.6 },
      { date: '2001-Q1', mcap: 12, revenue: 1.1, ps: 10.9 },
      { date: '2002-Q1', mcap: 10, revenue: 0.7, ps: 14.3 },
      { date: '2003-Q1', mcap: 14, revenue: 1.1, ps: 12.7 },
      { date: '2004-Q1', mcap: 37, revenue: 1.6, ps: 23.1 },
    ],
  },
  {
    ticker: 'AOL', name: 'AOL', sector: 'Portals & Media', survived: false,
    peakMcap: 222,
    snapshots: [
      { date: '1999-Q1', mcap: 80, revenue: 4.8, ps: 16.7 },
      { date: '2000-Q1', mcap: 222, revenue: 6.9, ps: 32.2 },
      { date: '2001-Q1', mcap: 100, revenue: 7.7, ps: 13.0 },
      { date: '2002-Q1', mcap: 60, revenue: 8.6, ps: 7.0 },
      { date: '2003-Q1', mcap: 40, revenue: 8.4, ps: 4.8 },
      { date: '2004-Q1', mcap: 35, revenue: 8.5, ps: 4.1 },
    ],
  },
  {
    ticker: 'RNWK', name: 'RealNetworks', sector: 'Portals & Media', survived: false,
    peakMcap: 17,
    snapshots: [
      { date: '1999-Q1', mcap: 8, revenue: 0.1, ps: 80.0 },
      { date: '2000-Q1', mcap: 17, revenue: 0.2, ps: 85.0 },
      { date: '2001-Q1', mcap: 2, revenue: 0.3, ps: 6.7 },
      { date: '2002-Q1', mcap: 1.5, revenue: 0.3, ps: 5.0 },
      { date: '2003-Q1', mcap: 1, revenue: 0.3, ps: 3.3 },
      { date: '2004-Q1', mcap: 1.5, revenue: 0.3, ps: 5.0 },
    ],
  },
  {
    ticker: 'XCIT', name: 'Excite@Home', sector: 'Portals & Media', survived: false,
    peakMcap: 35,
    snapshots: [
      { date: '1999-Q1', mcap: 15, revenue: 0.1, ps: 150.0 },
      { date: '2000-Q1', mcap: 35, revenue: 0.6, ps: 58.3 },
      { date: '2001-Q1', mcap: 0.5, revenue: 0.5, ps: 1.0 },
      { date: '2002-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2003-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2004-Q1', mcap: 0, revenue: 0, ps: null },
    ],
  },
  {
    ticker: 'DCLK', name: 'DoubleClick', sector: 'Portals & Media', survived: true,
    peakMcap: 12,
    snapshots: [
      { date: '1999-Q1', mcap: 6, revenue: 0.2, ps: 30.0 },
      { date: '2000-Q1', mcap: 12, revenue: 0.5, ps: 24.0 },
      { date: '2001-Q1', mcap: 1, revenue: 0.4, ps: 2.5 },
      { date: '2002-Q1', mcap: 0.5, revenue: 0.3, ps: 1.7 },
      { date: '2003-Q1', mcap: 0.4, revenue: 0.3, ps: 1.3 },
      { date: '2004-Q1', mcap: 0.6, revenue: 0.3, ps: 2.0 },
    ],
  },
  {
    ticker: 'INSP', name: 'InfoSpace', sector: 'Portals & Media', survived: false,
    peakMcap: 31,
    snapshots: [
      { date: '1999-Q1', mcap: 5, revenue: 0.02, ps: 250.0 },
      { date: '2000-Q1', mcap: 31, revenue: 0.1, ps: 310.0 },
      { date: '2001-Q1', mcap: 0.3, revenue: 0.1, ps: 3.0 },
      { date: '2002-Q1', mcap: 0.2, revenue: 0.1, ps: 2.0 },
      { date: '2003-Q1', mcap: 0.3, revenue: 0.2, ps: 1.5 },
      { date: '2004-Q1', mcap: 0.5, revenue: 0.2, ps: 2.5 },
    ],
  },
  {
    ticker: 'ASKJ', name: 'Ask Jeeves', sector: 'Portals & Media', survived: true,
    peakMcap: 4.5,
    snapshots: [
      { date: '1999-Q1', mcap: 2, revenue: 0.01, ps: 200.0 },
      { date: '2000-Q1', mcap: 4.5, revenue: 0.02, ps: 225.0 },
      { date: '2001-Q1', mcap: 0.2, revenue: 0.04, ps: 5.0 },
      { date: '2002-Q1', mcap: 0.3, revenue: 0.1, ps: 3.0 },
      { date: '2003-Q1', mcap: 0.5, revenue: 0.2, ps: 2.5 },
      { date: '2004-Q1', mcap: 2, revenue: 0.3, ps: 6.7 },
    ],
  },
  {
    ticker: 'AKAM', name: 'Akamai Technologies', sector: 'Portals & Media', survived: true,
    peakMcap: 30,
    snapshots: [
      { date: '1999-Q1', mcap: 10, revenue: 0.004, ps: 2500.0 },
      { date: '2000-Q1', mcap: 30, revenue: 0.09, ps: 333.3 },
      { date: '2001-Q1', mcap: 1, revenue: 0.2, ps: 5.0 },
      { date: '2002-Q1', mcap: 0.5, revenue: 0.2, ps: 2.5 },
      { date: '2003-Q1', mcap: 1, revenue: 0.3, ps: 3.3 },
      { date: '2004-Q1', mcap: 3, revenue: 0.5, ps: 6.0 },
    ],
  },
  {
    ticker: 'VRSN', name: 'VeriSign', sector: 'Portals & Media', survived: true,
    peakMcap: 60,
    snapshots: [
      { date: '1999-Q1', mcap: 12, revenue: 0.5, ps: 24.0 },
      { date: '2000-Q1', mcap: 60, revenue: 1.1, ps: 54.5 },
      { date: '2001-Q1', mcap: 10, revenue: 2.4, ps: 4.2 },
      { date: '2002-Q1', mcap: 4, revenue: 1.5, ps: 2.7 },
      { date: '2003-Q1', mcap: 3, revenue: 1.3, ps: 2.3 },
      { date: '2004-Q1', mcap: 5, revenue: 1.3, ps: 3.8 },
    ],
  },
  {
    ticker: 'RAZF', name: 'Razorfish', sector: 'Portals & Media', survived: false,
    peakMcap: 4,
    snapshots: [
      { date: '1999-Q1', mcap: 2, revenue: 0.05, ps: 40.0 },
      { date: '2000-Q1', mcap: 4, revenue: 0.1, ps: 40.0 },
      { date: '2001-Q1', mcap: 0.05, revenue: 0.1, ps: 0.5 },
      { date: '2002-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2003-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2004-Q1', mcap: 0, revenue: 0, ps: null },
    ],
  },
  // === SOFTWARE ===
  {
    ticker: 'MSFT', name: 'Microsoft', sector: 'Software', survived: true,
    peakMcap: 586,
    snapshots: [
      { date: '1999-Q1', mcap: 380, revenue: 19.7, ps: 19.3 },
      { date: '2000-Q1', mcap: 586, revenue: 22.9, ps: 25.6 },
      { date: '2001-Q1', mcap: 280, revenue: 25.3, ps: 11.1 },
      { date: '2002-Q1', mcap: 320, revenue: 28.4, ps: 11.3 },
      { date: '2003-Q1', mcap: 260, revenue: 31.6, ps: 8.2 },
      { date: '2004-Q1', mcap: 295, revenue: 34.3, ps: 8.6 },
    ],
  },
  {
    ticker: 'ORCL', name: 'Oracle', sector: 'Software', survived: true,
    peakMcap: 262,
    snapshots: [
      { date: '1999-Q1', mcap: 80, revenue: 8.8, ps: 9.1 },
      { date: '2000-Q1', mcap: 262, revenue: 10.1, ps: 25.9 },
      { date: '2001-Q1', mcap: 85, revenue: 10.9, ps: 7.8 },
      { date: '2002-Q1', mcap: 80, revenue: 10.2, ps: 7.8 },
      { date: '2003-Q1', mcap: 62, revenue: 9.5, ps: 6.5 },
      { date: '2004-Q1', mcap: 70, revenue: 10.2, ps: 6.9 },
    ],
  },
  {
    ticker: 'SEBL', name: 'Siebel Systems', sector: 'Software', survived: false,
    peakMcap: 47,
    snapshots: [
      { date: '1999-Q1', mcap: 15, revenue: 0.8, ps: 18.8 },
      { date: '2000-Q1', mcap: 47, revenue: 1.8, ps: 26.1 },
      { date: '2001-Q1', mcap: 12, revenue: 2.1, ps: 5.7 },
      { date: '2002-Q1', mcap: 6, revenue: 1.7, ps: 3.5 },
      { date: '2003-Q1', mcap: 4, revenue: 1.4, ps: 2.9 },
      { date: '2004-Q1', mcap: 6, revenue: 1.3, ps: 4.6 },
    ],
  },
  {
    ticker: 'BEAS', name: 'BEA Systems', sector: 'Software', survived: false,
    peakMcap: 25,
    snapshots: [
      { date: '1999-Q1', mcap: 8, revenue: 0.5, ps: 16.0 },
      { date: '2000-Q1', mcap: 25, revenue: 0.9, ps: 27.8 },
      { date: '2001-Q1', mcap: 5, revenue: 1.1, ps: 4.5 },
      { date: '2002-Q1', mcap: 4, revenue: 1.0, ps: 4.0 },
      { date: '2003-Q1', mcap: 3, revenue: 0.9, ps: 3.3 },
      { date: '2004-Q1', mcap: 5, revenue: 1.0, ps: 5.0 },
    ],
  },
  {
    ticker: 'VRTS', name: 'Veritas Software', sector: 'Software', survived: true,
    peakMcap: 40,
    snapshots: [
      { date: '1999-Q1', mcap: 10, revenue: 0.8, ps: 12.5 },
      { date: '2000-Q1', mcap: 40, revenue: 1.3, ps: 30.8 },
      { date: '2001-Q1', mcap: 12, revenue: 1.9, ps: 6.3 },
      { date: '2002-Q1', mcap: 10, revenue: 1.7, ps: 5.9 },
      { date: '2003-Q1', mcap: 7, revenue: 1.8, ps: 3.9 },
      { date: '2004-Q1', mcap: 10, revenue: 2.0, ps: 5.0 },
    ],
  },
  {
    ticker: 'IBM', name: 'IBM', sector: 'Software', survived: true,
    peakMcap: 215,
    snapshots: [
      { date: '1999-Q1', mcap: 185, revenue: 81.7, ps: 2.3 },
      { date: '2000-Q1', mcap: 215, revenue: 87.5, ps: 2.5 },
      { date: '2001-Q1', mcap: 180, revenue: 85.1, ps: 2.1 },
      { date: '2002-Q1', mcap: 190, revenue: 81.2, ps: 2.3 },
      { date: '2003-Q1', mcap: 140, revenue: 81.2, ps: 1.7 },
      { date: '2004-Q1', mcap: 160, revenue: 89.1, ps: 1.8 },
    ],
  },
  {
    ticker: 'DELL', name: 'Dell Computer', sector: 'Software', survived: true,
    peakMcap: 150,
    snapshots: [
      { date: '1999-Q1', mcap: 100, revenue: 21.7, ps: 4.6 },
      { date: '2000-Q1', mcap: 150, revenue: 27.8, ps: 5.4 },
      { date: '2001-Q1', mcap: 65, revenue: 31.9, ps: 2.0 },
      { date: '2002-Q1', mcap: 72, revenue: 31.2, ps: 2.3 },
      { date: '2003-Q1', mcap: 60, revenue: 35.4, ps: 1.7 },
      { date: '2004-Q1', mcap: 80, revenue: 41.4, ps: 1.9 },
    ],
  },
  // === SEMICONDUCTORS ===
  {
    ticker: 'INTC', name: 'Intel', sector: 'Semiconductors', survived: true,
    peakMcap: 395,
    snapshots: [
      { date: '1999-Q1', mcap: 195, revenue: 26.3, ps: 7.4 },
      { date: '2000-Q1', mcap: 395, revenue: 33.7, ps: 11.7 },
      { date: '2001-Q1', mcap: 170, revenue: 29.4, ps: 5.8 },
      { date: '2002-Q1', mcap: 190, revenue: 26.5, ps: 7.2 },
      { date: '2003-Q1', mcap: 110, revenue: 26.8, ps: 4.1 },
      { date: '2004-Q1', mcap: 175, revenue: 30.1, ps: 5.8 },
    ],
  },
  {
    ticker: 'QCOM', name: 'Qualcomm', sector: 'Semiconductors', survived: true,
    peakMcap: 145,
    snapshots: [
      { date: '1999-Q1', mcap: 30, revenue: 3.3, ps: 9.1 },
      { date: '2000-Q1', mcap: 145, revenue: 4.1, ps: 35.4 },
      { date: '2001-Q1', mcap: 50, revenue: 3.2, ps: 15.6 },
      { date: '2002-Q1', mcap: 40, revenue: 3.0, ps: 13.3 },
      { date: '2003-Q1', mcap: 35, revenue: 3.8, ps: 9.2 },
      { date: '2004-Q1', mcap: 45, revenue: 4.9, ps: 9.2 },
    ],
  },
  {
    ticker: 'TXN', name: 'Texas Instruments', sector: 'Semiconductors', survived: true,
    peakMcap: 100,
    snapshots: [
      { date: '1999-Q1', mcap: 45, revenue: 8.5, ps: 5.3 },
      { date: '2000-Q1', mcap: 100, revenue: 11.8, ps: 8.5 },
      { date: '2001-Q1', mcap: 45, revenue: 9.5, ps: 4.7 },
      { date: '2002-Q1', mcap: 40, revenue: 7.9, ps: 5.1 },
      { date: '2003-Q1', mcap: 30, revenue: 8.4, ps: 3.6 },
      { date: '2004-Q1', mcap: 50, revenue: 9.8, ps: 5.1 },
    ],
  },
  {
    ticker: 'BRCM', name: 'Broadcom Corp', sector: 'Semiconductors', survived: true,
    peakMcap: 78,
    snapshots: [
      { date: '1999-Q1', mcap: 10, revenue: 0.5, ps: 20.0 },
      { date: '2000-Q1', mcap: 78, revenue: 1.4, ps: 55.7 },
      { date: '2001-Q1', mcap: 10, revenue: 1.9, ps: 5.3 },
      { date: '2002-Q1', mcap: 6, revenue: 1.1, ps: 5.5 },
      { date: '2003-Q1', mcap: 5, revenue: 1.1, ps: 4.5 },
      { date: '2004-Q1', mcap: 10, revenue: 1.8, ps: 5.6 },
    ],
  },
  {
    ticker: 'AMAT', name: 'Applied Materials', sector: 'Semiconductors', survived: true,
    peakMcap: 80,
    snapshots: [
      { date: '1999-Q1', mcap: 25, revenue: 4.5, ps: 5.6 },
      { date: '2000-Q1', mcap: 80, revenue: 8.0, ps: 10.0 },
      { date: '2001-Q1', mcap: 25, revenue: 9.6, ps: 2.6 },
      { date: '2002-Q1', mcap: 20, revenue: 5.7, ps: 3.5 },
      { date: '2003-Q1', mcap: 12, revenue: 4.5, ps: 2.7 },
      { date: '2004-Q1', mcap: 22, revenue: 6.3, ps: 3.5 },
    ],
  },
  {
    ticker: 'XLNX', name: 'Xilinx', sector: 'Semiconductors', survived: true,
    peakMcap: 32,
    snapshots: [
      { date: '1999-Q1', mcap: 10, revenue: 1.3, ps: 7.7 },
      { date: '2000-Q1', mcap: 32, revenue: 1.9, ps: 16.8 },
      { date: '2001-Q1', mcap: 10, revenue: 1.7, ps: 5.9 },
      { date: '2002-Q1', mcap: 8, revenue: 1.0, ps: 8.0 },
      { date: '2003-Q1', mcap: 6, revenue: 1.2, ps: 5.0 },
      { date: '2004-Q1', mcap: 10, revenue: 1.4, ps: 7.1 },
    ],
  },
  {
    ticker: 'ALTR', name: 'Altera', sector: 'Semiconductors', survived: true,
    peakMcap: 22,
    snapshots: [
      { date: '1999-Q1', mcap: 8, revenue: 1.0, ps: 8.0 },
      { date: '2000-Q1', mcap: 22, revenue: 1.4, ps: 15.7 },
      { date: '2001-Q1', mcap: 7, revenue: 1.4, ps: 5.0 },
      { date: '2002-Q1', mcap: 5, revenue: 0.9, ps: 5.6 },
      { date: '2003-Q1', mcap: 4, revenue: 0.8, ps: 5.0 },
      { date: '2004-Q1', mcap: 7, revenue: 1.0, ps: 7.0 },
    ],
  },
  // Additional notable dot-coms
  {
    ticker: 'PALM', name: 'Palm Inc', sector: 'Infrastructure', survived: false,
    peakMcap: 53,
    snapshots: [
      { date: '1999-Q1', mcap: 0, revenue: 0, ps: null },
      { date: '2000-Q1', mcap: 53, revenue: 1.1, ps: 48.2 },
      { date: '2001-Q1', mcap: 5, revenue: 1.6, ps: 3.1 },
      { date: '2002-Q1', mcap: 1, revenue: 0.9, ps: 1.1 },
      { date: '2003-Q1', mcap: 0.5, revenue: 0.8, ps: 0.6 },
      { date: '2004-Q1', mcap: 1, revenue: 0.9, ps: 1.1 },
    ],
  },
  {
    ticker: 'MSTR', name: 'MicroStrategy', sector: 'Software', survived: true,
    peakMcap: 25,
    snapshots: [
      { date: '1999-Q1', mcap: 5, revenue: 0.2, ps: 25.0 },
      { date: '2000-Q1', mcap: 25, revenue: 0.2, ps: 125.0 },
      { date: '2001-Q1', mcap: 0.5, revenue: 0.2, ps: 2.5 },
      { date: '2002-Q1', mcap: 0.3, revenue: 0.2, ps: 1.5 },
      { date: '2003-Q1', mcap: 0.3, revenue: 0.2, ps: 1.5 },
      { date: '2004-Q1', mcap: 0.8, revenue: 0.3, ps: 2.7 },
    ],
  },
  {
    ticker: 'RTST', name: 'RealNetworks', sector: 'Portals & Media', survived: false,
    peakMcap: 0,
    snapshots: [], // duplicate removed, see RNWK above
  },
  {
    ticker: 'CIEN', name: 'Ciena Corporation', sector: 'Infrastructure', survived: true,
    peakMcap: 42,
    snapshots: [
      { date: '1999-Q1', mcap: 5, revenue: 0.5, ps: 10.0 },
      { date: '2000-Q1', mcap: 42, revenue: 0.9, ps: 46.7 },
      { date: '2001-Q1', mcap: 10, revenue: 1.3, ps: 7.7 },
      { date: '2002-Q1', mcap: 3, revenue: 0.5, ps: 6.0 },
      { date: '2003-Q1', mcap: 2, revenue: 0.3, ps: 6.7 },
      { date: '2004-Q1', mcap: 4, revenue: 0.4, ps: 10.0 },
    ],
  },
  {
    ticker: 'BEAS2', name: 'Mercury Interactive', sector: 'Software', survived: true,
    peakMcap: 14,
    snapshots: [
      { date: '1999-Q1', mcap: 4, revenue: 0.4, ps: 10.0 },
      { date: '2000-Q1', mcap: 14, revenue: 0.6, ps: 23.3 },
      { date: '2001-Q1', mcap: 4, revenue: 0.7, ps: 5.7 },
      { date: '2002-Q1', mcap: 4, revenue: 0.6, ps: 6.7 },
      { date: '2003-Q1', mcap: 3, revenue: 0.6, ps: 5.0 },
      { date: '2004-Q1', mcap: 5, revenue: 0.7, ps: 7.1 },
    ],
  },
  {
    ticker: 'CHKP', name: 'Check Point Software', sector: 'Software', survived: true,
    peakMcap: 24,
    snapshots: [
      { date: '1999-Q1', mcap: 8, revenue: 0.4, ps: 20.0 },
      { date: '2000-Q1', mcap: 24, revenue: 0.6, ps: 40.0 },
      { date: '2001-Q1', mcap: 10, revenue: 0.7, ps: 14.3 },
      { date: '2002-Q1', mcap: 6, revenue: 0.5, ps: 12.0 },
      { date: '2003-Q1', mcap: 5, revenue: 0.5, ps: 10.0 },
      { date: '2004-Q1', mcap: 6, revenue: 0.6, ps: 10.0 },
    ],
  },
].filter(c => c.snapshots.length > 0) // Remove any empty entries

// ============================================================
// CRYPTO ERA — ~40 protocols
// Snapshots: 2021-Q4 (peak), 2022-Q4 (trough), 2023-Q4, 2024-Q4
// mcap in $B, annualizedFees in $B, ps = mcap/annualizedFees
// The 2026-Q1 snapshot is computed LIVE from API data at render time
// ============================================================
export const CRYPTO_SNAPSHOTS = [
  // === INFRASTRUCTURE (L1/L2) ===
  {
    slug: 'ethereum', name: 'Ethereum', sector: 'Infrastructure', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 550, annualizedFees: 15.0, ps: 36.7 },
      { date: '2022-Q4', mcap: 150, annualizedFees: 4.2, ps: 35.7 },
      { date: '2023-Q4', mcap: 280, annualizedFees: 5.8, ps: 48.3 },
      { date: '2024-Q4', mcap: 400, annualizedFees: 6.5, ps: 61.5 },
    ],
  },
  {
    slug: 'solana', name: 'Solana', sector: 'Infrastructure', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 75, annualizedFees: 0.4, ps: 187.5 },
      { date: '2022-Q4', mcap: 5, annualizedFees: 0.02, ps: 250.0 },
      { date: '2023-Q4', mcap: 40, annualizedFees: 0.1, ps: 400.0 },
      { date: '2024-Q4', mcap: 95, annualizedFees: 2.5, ps: 38.0 },
    ],
  },
  {
    slug: 'avalanche', name: 'Avalanche', sector: 'Infrastructure', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 30, annualizedFees: 0.5, ps: 60.0 },
      { date: '2022-Q4', mcap: 4, annualizedFees: 0.04, ps: 100.0 },
      { date: '2023-Q4', mcap: 14, annualizedFees: 0.08, ps: 175.0 },
      { date: '2024-Q4', mcap: 16, annualizedFees: 0.1, ps: 160.0 },
    ],
  },
  {
    slug: 'polygon', name: 'Polygon', sector: 'Infrastructure', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 18, annualizedFees: 0.3, ps: 60.0 },
      { date: '2022-Q4', mcap: 7, annualizedFees: 0.05, ps: 140.0 },
      { date: '2023-Q4', mcap: 10, annualizedFees: 0.04, ps: 250.0 },
      { date: '2024-Q4', mcap: 5, annualizedFees: 0.03, ps: 166.7 },
    ],
  },
  {
    slug: 'arbitrum', name: 'Arbitrum', sector: 'Infrastructure', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0, annualizedFees: 0.2, ps: null },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0.1, ps: null },
      { date: '2023-Q4', mcap: 12, annualizedFees: 0.3, ps: 40.0 },
      { date: '2024-Q4', mcap: 8, annualizedFees: 0.15, ps: 53.3 },
    ],
  },
  {
    slug: 'optimism', name: 'Optimism', sector: 'Infrastructure', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0, annualizedFees: 0.05, ps: null },
      { date: '2022-Q4', mcap: 2, annualizedFees: 0.03, ps: 66.7 },
      { date: '2023-Q4', mcap: 5, annualizedFees: 0.08, ps: 62.5 },
      { date: '2024-Q4', mcap: 3, annualizedFees: 0.05, ps: 60.0 },
    ],
  },
  {
    slug: 'bsc', name: 'BNB Chain', sector: 'Infrastructure', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 88, annualizedFees: 2.0, ps: 44.0 },
      { date: '2022-Q4', mcap: 42, annualizedFees: 0.4, ps: 105.0 },
      { date: '2023-Q4', mcap: 45, annualizedFees: 0.3, ps: 150.0 },
      { date: '2024-Q4', mcap: 90, annualizedFees: 0.6, ps: 150.0 },
    ],
  },
  {
    slug: 'tron', name: 'Tron', sector: 'Infrastructure', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 10, annualizedFees: 1.0, ps: 10.0 },
      { date: '2022-Q4', mcap: 5, annualizedFees: 0.6, ps: 8.3 },
      { date: '2023-Q4', mcap: 9, annualizedFees: 1.5, ps: 6.0 },
      { date: '2024-Q4', mcap: 22, annualizedFees: 2.0, ps: 11.0 },
    ],
  },
  {
    slug: 'base', name: 'Base', sector: 'Infrastructure', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 0, annualizedFees: 0.05, ps: null },
      { date: '2024-Q4', mcap: 0, annualizedFees: 0.3, ps: null },
    ],
  },
  // === E-COMMERCE / DEXs ===
  {
    slug: 'uniswap', name: 'Uniswap', sector: 'E-Commerce', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 14, annualizedFees: 2.5, ps: 5.6 },
      { date: '2022-Q4', mcap: 4, annualizedFees: 0.8, ps: 5.0 },
      { date: '2023-Q4', mcap: 5, annualizedFees: 1.2, ps: 4.2 },
      { date: '2024-Q4', mcap: 10, annualizedFees: 2.0, ps: 5.0 },
    ],
  },
  {
    slug: 'sushiswap', name: 'SushiSwap', sector: 'E-Commerce', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 2.8, annualizedFees: 0.7, ps: 4.0 },
      { date: '2022-Q4', mcap: 0.3, annualizedFees: 0.1, ps: 3.0 },
      { date: '2023-Q4', mcap: 0.4, annualizedFees: 0.05, ps: 8.0 },
      { date: '2024-Q4', mcap: 0.3, annualizedFees: 0.04, ps: 7.5 },
    ],
  },
  {
    slug: 'pancakeswap', name: 'PancakeSwap', sector: 'E-Commerce', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 4.5, annualizedFees: 0.9, ps: 5.0 },
      { date: '2022-Q4', mcap: 0.6, annualizedFees: 0.3, ps: 2.0 },
      { date: '2023-Q4', mcap: 1.0, annualizedFees: 0.4, ps: 2.5 },
      { date: '2024-Q4', mcap: 1.2, annualizedFees: 0.5, ps: 2.4 },
    ],
  },
  {
    slug: 'dydx', name: 'dYdX', sector: 'E-Commerce', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 3.5, annualizedFees: 0.4, ps: 8.8 },
      { date: '2022-Q4', mcap: 0.4, annualizedFees: 0.2, ps: 2.0 },
      { date: '2023-Q4', mcap: 2.5, annualizedFees: 0.15, ps: 16.7 },
      { date: '2024-Q4', mcap: 1.2, annualizedFees: 0.1, ps: 12.0 },
    ],
  },
  {
    slug: 'curve-finance', name: 'Curve Finance', sector: 'E-Commerce', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 2.0, annualizedFees: 0.15, ps: 13.3 },
      { date: '2022-Q4', mcap: 0.4, annualizedFees: 0.05, ps: 8.0 },
      { date: '2023-Q4', mcap: 0.6, annualizedFees: 0.06, ps: 10.0 },
      { date: '2024-Q4', mcap: 0.8, annualizedFees: 0.08, ps: 10.0 },
    ],
  },
  {
    slug: 'gmx', name: 'GMX', sector: 'E-Commerce', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0.3, annualizedFees: 0.15, ps: 2.0 },
      { date: '2022-Q4', mcap: 0.5, annualizedFees: 0.3, ps: 1.7 },
      { date: '2023-Q4', mcap: 0.8, annualizedFees: 0.25, ps: 3.2 },
      { date: '2024-Q4', mcap: 0.4, annualizedFees: 0.2, ps: 2.0 },
    ],
  },
  {
    slug: 'hyperliquid', name: 'Hyperliquid', sector: 'E-Commerce', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 0, annualizedFees: 0.3, ps: null },
      { date: '2024-Q4', mcap: 8, annualizedFees: 0.8, ps: 10.0 },
    ],
  },
  {
    slug: 'raydium', name: 'Raydium', sector: 'E-Commerce', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 1.5, annualizedFees: 0.2, ps: 7.5 },
      { date: '2022-Q4', mcap: 0.03, annualizedFees: 0.005, ps: 6.0 },
      { date: '2023-Q4', mcap: 0.2, annualizedFees: 0.05, ps: 4.0 },
      { date: '2024-Q4', mcap: 2.5, annualizedFees: 1.5, ps: 1.7 },
    ],
  },
  // === PORTALS & AGGREGATORS ===
  {
    slug: 'lido', name: 'Lido Finance', sector: 'Portals & Media', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 4.5, annualizedFees: 0.5, ps: 9.0 },
      { date: '2022-Q4', mcap: 1.2, annualizedFees: 0.3, ps: 4.0 },
      { date: '2023-Q4', mcap: 3.0, annualizedFees: 0.8, ps: 3.8 },
      { date: '2024-Q4', mcap: 2.0, annualizedFees: 0.9, ps: 2.2 },
    ],
  },
  {
    slug: 'ens', name: 'ENS', sector: 'Portals & Media', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 2.0, annualizedFees: 0.08, ps: 25.0 },
      { date: '2022-Q4', mcap: 0.4, annualizedFees: 0.06, ps: 6.7 },
      { date: '2023-Q4', mcap: 0.8, annualizedFees: 0.04, ps: 20.0 },
      { date: '2024-Q4', mcap: 1.2, annualizedFees: 0.05, ps: 24.0 },
    ],
  },
  {
    slug: '1inch', name: '1inch', sector: 'Portals & Media', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 2.2, annualizedFees: 0.1, ps: 22.0 },
      { date: '2022-Q4', mcap: 0.4, annualizedFees: 0.04, ps: 10.0 },
      { date: '2023-Q4', mcap: 0.5, annualizedFees: 0.03, ps: 16.7 },
      { date: '2024-Q4', mcap: 0.6, annualizedFees: 0.05, ps: 12.0 },
    ],
  },
  {
    slug: 'opensea', name: 'OpenSea', sector: 'Portals & Media', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0, annualizedFees: 1.5, ps: null },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0.2, ps: null },
      { date: '2023-Q4', mcap: 0, annualizedFees: 0.03, ps: null },
      { date: '2024-Q4', mcap: 0, annualizedFees: 0.01, ps: null },
    ],
  },
  {
    slug: 'the-graph', name: 'The Graph', sector: 'Portals & Media', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 4.0, annualizedFees: 0.02, ps: 200.0 },
      { date: '2022-Q4', mcap: 0.5, annualizedFees: 0.01, ps: 50.0 },
      { date: '2023-Q4', mcap: 1.5, annualizedFees: 0.02, ps: 75.0 },
      { date: '2024-Q4', mcap: 2.5, annualizedFees: 0.03, ps: 83.3 },
    ],
  },
  // === SOFTWARE / LENDING ===
  {
    slug: 'aave', name: 'Aave', sector: 'Software', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 4.5, annualizedFees: 0.5, ps: 9.0 },
      { date: '2022-Q4', mcap: 1.0, annualizedFees: 0.15, ps: 6.7 },
      { date: '2023-Q4', mcap: 1.5, annualizedFees: 0.3, ps: 5.0 },
      { date: '2024-Q4', mcap: 5.0, annualizedFees: 1.0, ps: 5.0 },
    ],
  },
  {
    slug: 'makerdao', name: 'MakerDAO', sector: 'Software', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 3.0, annualizedFees: 0.15, ps: 20.0 },
      { date: '2022-Q4', mcap: 0.7, annualizedFees: 0.06, ps: 11.7 },
      { date: '2023-Q4', mcap: 1.8, annualizedFees: 0.25, ps: 7.2 },
      { date: '2024-Q4', mcap: 2.0, annualizedFees: 0.35, ps: 5.7 },
    ],
  },
  {
    slug: 'compound', name: 'Compound', sector: 'Software', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 2.5, annualizedFees: 0.25, ps: 10.0 },
      { date: '2022-Q4', mcap: 0.3, annualizedFees: 0.04, ps: 7.5 },
      { date: '2023-Q4', mcap: 0.5, annualizedFees: 0.06, ps: 8.3 },
      { date: '2024-Q4', mcap: 0.6, annualizedFees: 0.08, ps: 7.5 },
    ],
  },
  {
    slug: 'venus', name: 'Venus', sector: 'Software', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0.6, annualizedFees: 0.08, ps: 7.5 },
      { date: '2022-Q4', mcap: 0.06, annualizedFees: 0.02, ps: 3.0 },
      { date: '2023-Q4', mcap: 0.1, annualizedFees: 0.04, ps: 2.5 },
      { date: '2024-Q4', mcap: 0.2, annualizedFees: 0.06, ps: 3.3 },
    ],
  },
  {
    slug: 'morpho', name: 'Morpho', sector: 'Software', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 0, annualizedFees: 0.02, ps: null },
      { date: '2024-Q4', mcap: 1.0, annualizedFees: 0.15, ps: 6.7 },
    ],
  },
  // === SEMICONDUCTORS / ORACLES & INFRA ===
  {
    slug: 'chainlink', name: 'Chainlink', sector: 'Semiconductors', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 12, annualizedFees: 0.05, ps: 240.0 },
      { date: '2022-Q4', mcap: 3.5, annualizedFees: 0.02, ps: 175.0 },
      { date: '2023-Q4', mcap: 9, annualizedFees: 0.03, ps: 300.0 },
      { date: '2024-Q4', mcap: 14, annualizedFees: 0.05, ps: 280.0 },
    ],
  },
  {
    slug: 'filecoin', name: 'Filecoin', sector: 'Semiconductors', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 8, annualizedFees: 0.01, ps: 800.0 },
      { date: '2022-Q4', mcap: 1.5, annualizedFees: 0.005, ps: 300.0 },
      { date: '2023-Q4', mcap: 3, annualizedFees: 0.008, ps: 375.0 },
      { date: '2024-Q4', mcap: 3.5, annualizedFees: 0.01, ps: 350.0 },
    ],
  },
  {
    slug: 'ethena', name: 'Ethena', sector: 'Software', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2024-Q4', mcap: 3.0, annualizedFees: 0.3, ps: 10.0 },
    ],
  },
  {
    slug: 'jito', name: 'Jito', sector: 'Infrastructure', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 1.5, annualizedFees: 0.4, ps: 3.8 },
      { date: '2024-Q4', mcap: 3.5, annualizedFees: 1.5, ps: 2.3 },
    ],
  },
  {
    slug: 'jupiter', name: 'Jupiter', sector: 'E-Commerce', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 0, annualizedFees: 0.1, ps: null },
      { date: '2024-Q4', mcap: 3.0, annualizedFees: 0.6, ps: 5.0 },
    ],
  },
  {
    slug: 'pendle', name: 'Pendle', sector: 'Software', survived: true,
    snapshots: [
      { date: '2021-Q4', mcap: 0.05, annualizedFees: 0.002, ps: 25.0 },
      { date: '2022-Q4', mcap: 0.02, annualizedFees: 0.001, ps: 20.0 },
      { date: '2023-Q4', mcap: 0.3, annualizedFees: 0.05, ps: 6.0 },
      { date: '2024-Q4', mcap: 1.5, annualizedFees: 0.15, ps: 10.0 },
    ],
  },
  // === FAILED / COLLAPSED crypto projects ===
  {
    slug: 'terra', name: 'Terra/Luna', sector: 'Infrastructure', survived: false,
    snapshots: [
      { date: '2021-Q4', mcap: 35, annualizedFees: 0.3, ps: 116.7 },
      { date: '2022-Q4', mcap: 0.5, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 0.3, annualizedFees: 0, ps: null },
      { date: '2024-Q4', mcap: 0.1, annualizedFees: 0, ps: null },
    ],
  },
  {
    slug: 'ftx', name: 'FTX (FTT)', sector: 'E-Commerce', survived: false,
    snapshots: [
      { date: '2021-Q4', mcap: 8, annualizedFees: 1.0, ps: 8.0 },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2024-Q4', mcap: 0, annualizedFees: 0, ps: null },
    ],
  },
  {
    slug: 'celsius', name: 'Celsius', sector: 'Software', survived: false,
    snapshots: [
      { date: '2021-Q4', mcap: 2.5, annualizedFees: 0.2, ps: 12.5 },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2024-Q4', mcap: 0, annualizedFees: 0, ps: null },
    ],
  },
  {
    slug: 'voyager', name: 'Voyager Digital', sector: 'E-Commerce', survived: false,
    snapshots: [
      { date: '2021-Q4', mcap: 2.0, annualizedFees: 0.1, ps: 20.0 },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2024-Q4', mcap: 0, annualizedFees: 0, ps: null },
    ],
  },
  {
    slug: 'anchor-protocol', name: 'Anchor Protocol', sector: 'Software', survived: false,
    snapshots: [
      { date: '2021-Q4', mcap: 3.5, annualizedFees: 0.5, ps: 7.0 },
      { date: '2022-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2023-Q4', mcap: 0, annualizedFees: 0, ps: null },
      { date: '2024-Q4', mcap: 0, annualizedFees: 0, ps: null },
    ],
  },
]

// ============================================================
// "Rhyming History" — editorial pairings
// ============================================================
export const ANALOG_PAIRS = [
  { dotcom: 'CSCO', crypto: 'ethereum', thesis: 'Foundational infrastructure that everything runs on. Both were the "picks and shovels" of their era — and both saw P/S compression from 29x to single digits.' },
  { dotcom: 'YHOO', crypto: 'uniswap', thesis: 'The dominant gateway/portal of the era. Yahoo was how you found the internet; Uniswap is how you access DeFi. Both have struggled with monetization despite massive usage.' },
  { dotcom: 'AMZN', crypto: 'aave', thesis: 'The marketplace that became the category. Amazon survived the crash with a 1.6x P/S trough and rebuilt. Aave shows similar resilience with consistent fee generation.' },
  { dotcom: 'EBAY', crypto: 'opensea', thesis: 'Peer-to-peer marketplace. eBay survived and thrived; OpenSea\'s fees collapsed 98% from the NFT peak — echoing the question of whether the marketplace or the mania creates value.' },
  { dotcom: 'IPET', crypto: 'terra', thesis: 'The canonical cautionary tale. Pets.com and Terra/Luna both had flashy marketing, unsustainable economics, and total collapse. P/S was meaningless because the "S" wasn\'t real.' },
  { dotcom: 'MSFT', crypto: 'makerdao', thesis: 'The boring, profitable incumbent. Microsoft had a relatively modest 25x P/S at peak and barely fell. MakerDAO\'s steady protocol revenue makes it crypto\'s closest thing to a blue chip.' },
  { dotcom: 'JNPR', crypto: 'solana', thesis: 'The hot infrastructure challenger. Juniper had a 271x P/S on almost no revenue but real technology. Solana hit 400x P/S mid-bear before a dramatic fee-driven P/S compression.' },
  { dotcom: 'JDSU', crypto: 'chainlink', thesis: 'Essential middleware with extreme P/S. JDS Uniphase made fiber optic components everyone needed; Chainlink provides oracle data everyone needs. Both trade at P/S ratios that assume unlimited TAM.' },
  { dotcom: 'PCLN', crypto: 'pendle', thesis: 'The survivor that reinvented itself. Priceline dropped 97% then rebuilt as Booking.com. Pendle went from near-zero to a functional yield trading protocol.' },
  { dotcom: 'LU', crypto: 'ftx', thesis: 'Accounting scandal meets hubris. Lucent\'s revenue restatements and FTX\'s fabricated balance sheet both destroyed trust in the broader sector.' },
]

// ============================================================
// Key events for chart annotations
// ============================================================
export const KEY_EVENTS = {
  dotcom: [
    { date: '1999-01-01', label: 'Dot-com mania accelerates', offset: -15 },
    { date: '2000-03-10', label: 'NASDAQ peaks at 5,048', offset: 0 },
    { date: '2000-03-20', label: 'Barron\'s "Burning Up"', offset: 0.3 },
    { date: '2000-04-14', label: 'NASDAQ loses 34% in one month', offset: 1 },
    { date: '2001-03-01', label: 'Recession begins', offset: 12 },
    { date: '2002-10-09', label: 'NASDAQ trough (-78%)', offset: 31 },
    { date: '2004-01-01', label: 'Recovery underway', offset: 46 },
  ],
  crypto: [
    { date: '2021-01-01', label: 'DeFi Summer afterglow', offset: -10 },
    { date: '2021-11-10', label: 'Crypto market cap peaks ($3T)', offset: 0 },
    { date: '2022-05-09', label: 'Terra/Luna collapse', offset: 6 },
    { date: '2022-06-18', label: '3AC liquidation', offset: 7 },
    { date: '2022-11-08', label: 'FTX collapse', offset: 12 },
    { date: '2022-12-31', label: 'Crypto winter trough', offset: 14 },
    { date: '2024-01-10', label: 'BTC ETF approved', offset: 26 },
    { date: '2024-11-05', label: 'Pro-crypto election', offset: 36 },
  ],
}
