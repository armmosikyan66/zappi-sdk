import { describe, expect, it } from 'vitest'
import {
  btcSatsToUsdCents,
  centsToUsdbUnits,
  formatSats,
  formatUsdCents,
  getBtcUsdRate,
  MOCK_BTC_USD_CENTS_PER_SAT,
  setBtcUsdRate,
  usdbUnitsToCents,
  usdCentsToBtcSats,
  USDB_UNITS_PER_CENT,
} from '../src/amounts'

describe('amounts', () => {
  it('converts sats to cents at the mock rate', () => {
    expect(btcSatsToUsdCents(0)).toBe(0)
    // 1000 sats * 0.11625 = 116.25 -> round 116
    expect(btcSatsToUsdCents(1000)).toBe(116)
  })

  it('round-trips cents to sats (within rounding)', () => {
    const cents = 10_000
    const sats = usdCentsToBtcSats(cents)
    expect(btcSatsToUsdCents(sats)).toBe(cents)
  })

  it('respects an overridden rate', () => {
    const original = getBtcUsdRate()
    try {
      setBtcUsdRate(0.5) // 1 sat = 0.5 cents
      expect(btcSatsToUsdCents(2)).toBe(1)
      expect(usdCentsToBtcSats(100)).toBe(200)
    } finally {
      setBtcUsdRate(original)
    }
  })

  it('returns 0 sats when rate is 0', () => {
    const original = getBtcUsdRate()
    try {
      setBtcUsdRate(0)
      expect(usdCentsToBtcSats(1000)).toBe(0)
    } finally {
      setBtcUsdRate(original)
    }
  })

  it('exports the mock rate constant', () => {
    expect(MOCK_BTC_USD_CENTS_PER_SAT).toBe(0.11625)
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
