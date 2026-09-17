import { describe, expect, it } from 'vitest'
import {
  BtcUsdRate,
  MissingBtcRateError,
  btcSatsToUsdCents,
  centsToUsdbUnits,
  formatSats,
  formatUsdCents,
  usdbUnitsToCents,
  usdCentsToBtcSats,
  USDB_UNITS_PER_CENT,
} from '../src/amounts'

const RATE = new BtcUsdRate(0.11625)

describe('BtcUsdRate', () => {
  it('rejects non-finite rates', () => {
    expect(() => new BtcUsdRate(Number.NaN)).toThrow(RangeError)
    expect(() => new BtcUsdRate(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('rejects negative rates', () => {
    expect(() => new BtcUsdRate(-1)).toThrow(RangeError)
  })

  it('exposes usdPerBtc for display', () => {
    expect(new BtcUsdRate(0.11625).usdPerBtc).toBeCloseTo(116_250, 5)
  })
})

describe('amounts', () => {
  it('converts sats to cents at the given rate', () => {
    expect(btcSatsToUsdCents(0, RATE)).toBe(0)
    // 1000 sats * 0.11625 = 116.25 -> round 116
    expect(btcSatsToUsdCents(1000, RATE)).toBe(116)
  })

  it('accepts a raw number rate too', () => {
    expect(btcSatsToUsdCents(2, 0.5)).toBe(1)
  })

  it('throws MissingBtcRateError without a rate', () => {
    expect(() => btcSatsToUsdCents(1000)).toThrow(MissingBtcRateError)
    expect(() => usdCentsToBtcSats(1000)).toThrow(MissingBtcRateError)
  })

  it('round-trips cents to sats (within rounding)', () => {
    const cents = 10_000
    const sats = usdCentsToBtcSats(cents, RATE)
    expect(btcSatsToUsdCents(sats, RATE)).toBe(cents)
  })

  it('returns 0 sats when rate is 0', () => {
    expect(usdCentsToBtcSats(1000, new BtcUsdRate(0))).toBe(0)
  })

  it('converts cents to USDB units (1 cent = 10_000 units)', () => {
    expect(centsToUsdbUnits(0)).toBe(0n)
    expect(centsToUsdbUnits(1)).toBe(10_000n)
    expect(centsToUsdbUnits(100)).toBe(1_000_000n)
  })

  it('converts USDB units back to cents', () => {
    expect(usdbUnitsToCents('10000')).toBe(1)
    expect(usdbUnitsToCents(1_000_000n)).toBe(100)
  })

  it('formatUsdCents renders dollars', () => {
    expect(formatUsdCents(0)).toBe('$0.00')
    expect(formatUsdCents(1234)).toBe('$12.34')
    expect(formatUsdCents(5)).toBe('$0.05')
    expect(formatUsdCents(-1234)).toBe('-$12.34')
  })

  it('formatSats renders with sats suffix', () => {
    expect(formatSats(12345)).toBe('12,345 sats')
    expect(formatSats(0)).toBe('0 sats')
  })

  it('USDB_UNITS_PER_CENT is 10_000', () => {
    expect(USDB_UNITS_PER_CENT).toBe(10_000)
  })
})
