import { describe, expect, it } from 'vitest'
import {
  isWithdrawQuoteExpired,
  mintWithdrawQuoteToken,
  quoteExpiresAt,
  quoteFromPayload,
  readWithdrawQuoteToken,
  verifyWithdrawQuote,
  type WithdrawQuotePayload,
} from '../src/quote/quote-token'
import { buildCashierCombo } from '../src/combo'

const SECRET = 'quote-secret'

function samplePayload(overrides: Partial<WithdrawQuotePayload> = {}): WithdrawQuotePayload {
  return {
    userId: 'user_1',
    combo: buildCashierCombo('usdc', 'solana'),
    address: '0x' + 'a'.repeat(40),
    amountCents: 1000,
    destinationDisplay: '0xAAAA',
    grossAmountCents: 1000,
    estimatedArrivalCopy: '~15 seconds',
    expiresAt: quoteExpiresAt(),
    ...overrides,
  }
}

describe('quote-token', () => {
  it('round-trips a payload through mint and read', () => {
    const payload = samplePayload()
    const token = mintWithdrawQuoteToken(SECRET, payload)
    expect(token.startsWith('v1.')).toBe(true)
    const decoded = readWithdrawQuoteToken(SECRET, token)
    expect(decoded).not.toBeNull()
    expect(decoded?.userId).toBe('user_1')
    expect(decoded?.combo).toEqual(payload.combo)
    expect(decoded?.amountCents).toBe(1000)
  })

  it('rejects a token signed with a different secret', () => {
    const token = mintWithdrawQuoteToken(SECRET, samplePayload())
    expect(readWithdrawQuoteToken('other-secret', token)).toBeNull()
  })

  it('rejects a tampered token', () => {
    const token = mintWithdrawQuoteToken(SECRET, samplePayload())
    const tampered = token.slice(0, -3) + 'xxx'
    expect(readWithdrawQuoteToken(SECRET, tampered)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(readWithdrawQuoteToken(SECRET, 'v1.abc')).toBeNull()
    expect(readWithdrawQuoteToken(SECRET, 'v2.abc.def')).toBeNull()
    expect(readWithdrawQuoteToken(SECRET, '')).toBeNull()
  })

  it('verifyWithdrawQuote checks signature AND expiry', () => {
    const fresh = mintWithdrawQuoteToken(SECRET, samplePayload())
    expect(verifyWithdrawQuote(SECRET, fresh)).not.toBeNull()

    const expired = mintWithdrawQuoteToken(
      SECRET,
      samplePayload({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    )
    // Signature valid, but expired → null.
    expect(readWithdrawQuoteToken(SECRET, expired)).not.toBeNull()
    expect(verifyWithdrawQuote(SECRET, expired)).toBeNull()

    // Tampered → still null.
    const tampered = fresh.slice(0, -3) + 'xxx'
    expect(verifyWithdrawQuote(SECRET, tampered)).toBeNull()
  })

  it('isWithdrawQuoteExpired', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(isWithdrawQuoteExpired(past)).toBe(true)
    expect(isWithdrawQuoteExpired(future)).toBe(false)
    expect(isWithdrawQuoteExpired('not-a-date')).toBe(true)
  })

  it('quoteExpiresAt is ~2 minutes in the future', () => {
    const expires = new Date(quoteExpiresAt()).getTime()
    expect(expires).toBeGreaterThan(Date.now() + 60_000)
    expect(expires).toBeLessThan(Date.now() + 3 * 60_000)
  })

  it('quoteFromPayload builds a clean quote', () => {
    const payload = samplePayload({ grossAmountSats: 1000, networkFeeSats: 50 })
    const quote = quoteFromPayload('q_123', payload)
    expect(quote.quoteId).toBe('q_123')
    expect(quote.combo).toEqual(payload.combo)
    expect(quote.grossAmountSats).toBe(1000)
    expect(quote.expiresAt).toBe(payload.expiresAt)
  })
})
