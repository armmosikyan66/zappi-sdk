import { USDB_UNITS_PER_CENT } from './constants'

/** Re-exported so callers can import all amount constants from one place. */
export { USDB_UNITS_PER_CENT } from './constants'

/**
 * Amount conversion helpers. Conventions:
 * - BTC amounts are in **satoshis**.
 * - USD amounts are in **cents** (the on-chain instrument is USDB on Spark).
 * - USDB smallest units are 6-decimal: `1 cent = 10_000 units`.
 *
 * The BTC↔USD rate is a mock until the backend ships a live spot rate
 * (Phase 5). Callers can override the rate via {@link setBtcUsdRate}.
 */

/** Mock BTC↔USD conversion rate (cents per sat) until a live rate ships. */
export const MOCK_BTC_USD_CENTS_PER_SAT = 0.11625

let btcUsdCentsPerSat = MOCK_BTC_USD_CENTS_PER_SAT

/** Override the BTC↔USD spot rate (cents per sat). Pass 0 to disable conversion. */
export function setBtcUsdRate(centsPerSat: number): void {
  btcUsdCentsPerSat = centsPerSat
}

/** Read the current BTC↔USD rate (cents per sat). */
export function getBtcUsdRate(): number {
  return btcUsdCentsPerSat
}

/** Convert satoshis to USD cents at the current spot rate. */
export function btcSatsToUsdCents(sats: number): number {
  return Math.round(sats * btcUsdCentsPerSat)
}

/** Convert USD cents to satoshis at the current spot rate. */
export function usdCentsToBtcSats(cents: number): number {
  if (btcUsdCentsPerSat <= 0) return 0
  return Math.round(cents / btcUsdCentsPerSat)
}

/** Convert USD cents to USDB smallest units (1 cent = 10_000 units). */
export function centsToUsdbUnits(cents: number): bigint {
  return BigInt(cents) * BigInt(USDB_UNITS_PER_CENT)
}

/** Convert USDB smallest units (as a string from the SDK) to USD cents. */
export function usdbUnitsToCents(units: string | bigint): number {
  const big = typeof units === 'string' ? BigInt(units) : units
  return Number(big / BigInt(USDB_UNITS_PER_CENT))
}

/** Format a cents amount as a USD display string, e.g. `1234` → `$12.34`. */
export function formatUsdCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const remainder = abs % 100
  return `${sign}$${dollars}.${remainder.toString().padStart(2, '0')}`
}

/** Format a satoshi amount with a `sats` suffix, e.g. `12345` → `12,345 sats`. */
export function formatSats(sats: number): string {
  return `${sats.toLocaleString('en-US')} sats`
}
