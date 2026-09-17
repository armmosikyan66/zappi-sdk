import { USDB_UNITS_PER_CENT } from './constants'

/** Re-exported so callers can import all amount constants from one place. */
export { USDB_UNITS_PER_CENT } from './constants'

/**
 * Amount conversion helpers. Conventions:
 * - BTC amounts are in **satoshis**.
 * - USD amounts are in **cents** (the on-chain instrument is USDB on Spark).
 * - USDB smallest units are 6-decimal: `1 cent = 10_000 units`.
 *
 * The BTC↔USD rate is **never** a hidden global. Every conversion takes the
 * rate explicitly (or a {@link BtcUsdRate} built once from your live source)
 * so a stale or mock rate can never silently misprice a real withdraw. There
 * is no default: calling a converter without a rate throws
 * {@link MissingBtcRateError} instead of guessing.
 */

/**
 * A BTC↔USD spot rate (cents per satoshi). Build one from your live price
 * source and pass it to every conversion — e.g.
 * `new BtcUsdRate(0.11625)` ≈ $116,250/BTC.
 */
export class BtcUsdRate {
  readonly centsPerSat: number

  constructor(centsPerSat: number) {
    if (!Number.isFinite(centsPerSat)) {
      throw new RangeError('BtcUsdRate: centsPerSat must be a finite number')
    }
    if (centsPerSat < 0) {
      throw new RangeError('BtcUsdRate: centsPerSat must be >= 0')
    }
    this.centsPerSat = centsPerSat
  }

  /** USD price of one whole BTC at this rate, for display. */
  get usdPerBtc(): number {
    return this.centsPerSat * 100_000_000 / 100
  }
}

/** Thrown when a sats↔cents conversion runs without a rate. */
export class MissingBtcRateError extends Error {
  constructor() {
    super(
      'No BTC↔USD rate provided. Pass a BtcUsdRate (or centsPerSat) explicitly — ' +
        'the SDK deliberately has no default/mock rate for real conversions.',
    )
    this.name = 'MissingBtcRateError'
  }
}

/** Require a usable rate object or throw {@link MissingBtcRateError}. */
function requireRate(rate?: BtcUsdRate | number): BtcUsdRate {
  if (rate === undefined) throw new MissingBtcRateError()
  return typeof rate === 'number' ? new BtcUsdRate(rate) : rate
}

/** Convert satoshis to USD cents at the given rate. */
export function btcSatsToUsdCents(sats: number, rate?: BtcUsdRate | number): number {
  const r = requireRate(rate)
  return Math.round(sats * r.centsPerSat)
}

/** Convert USD cents to satoshis at the given rate. Returns 0 when the rate is 0. */
export function usdCentsToBtcSats(cents: number, rate?: BtcUsdRate | number): number {
  const r = requireRate(rate)
  if (r.centsPerSat <= 0) return 0
  return Math.round(cents / r.centsPerSat)
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
