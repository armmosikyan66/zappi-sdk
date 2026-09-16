import { describe, expect, it } from 'vitest'
import { signBody, verifyZappiWebhook } from '../src/webhook/verify'
import { parseWebhookEnvelope, envelopeFromHistoryOrder, isLedgerCredited, WebhookParseError } from '../src/webhook/parse'

const SECRET = 'whsec_test_secret'

function makeSigned(body: string, secret = SECRET, ts?: string) {
  const { timestamp, signature } = signBody({ rawBody: body, secret, timestamp: ts })
  return { timestamp, signature }
}

describe('webhook verify', () => {
  const body = JSON.stringify({ event: 'order.completed', timestamp: new Date().toISOString(), data: { id: 'ord_123' } })

  it('accepts a valid signature', () => {
    const { timestamp, signature } = makeSigned(body)
    expect(verifyZappiWebhook(body, signature, timestamp, SECRET)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const { timestamp, signature } = makeSigned(body)
    expect(verifyZappiWebhook(body + 'x', signature, timestamp, SECRET)).toBe(false)
  })

  it('rejects a wrong secret', () => {
    const { timestamp, signature } = makeSigned(body)
    expect(verifyZappiWebhook(body, signature, timestamp, 'whsec_other')).toBe(false)
  })

  it('rejects missing headers', () => {
    expect(verifyZappiWebhook(body, undefined, '123', SECRET)).toBe(false)
    expect(verifyZappiWebhook(body, 'abc', undefined, SECRET)).toBe(false)
  })

  it('rejects empty secret', () => {
    const { timestamp, signature } = makeSigned(body)
    expect(verifyZappiWebhook(body, signature, timestamp, '')).toBe(false)
  })

  it('rejects non-hex signature', () => {
    const { timestamp } = makeSigned(body)
    expect(verifyZappiWebhook(body, 'not-hex!', timestamp, SECRET)).toBe(false)
  })

  it('rejects a stale timestamp (replay)', () => {
    const { timestamp, signature } = makeSigned(body, SECRET, '1000')
    expect(verifyZappiWebhook(body, signature, timestamp, SECRET, 300_000, Date.now())).toBe(false)
  })

  it('rejects a future timestamp beyond tolerance', () => {
    const future = String(Date.now() + 10 * 60 * 1000)
    const { signature } = makeSigned(body, SECRET, future)
    expect(verifyZappiWebhook(body, signature, future, SECRET, 300_000, Date.now())).toBe(false)
  })

  it('signBody is deterministic for the same timestamp', () => {
    const a = signBody({ rawBody: body, secret: SECRET, timestamp: '123' })
    const b = signBody({ rawBody: body, secret: SECRET, timestamp: '123' })
    expect(a.signature).toBe(b.signature)
  })
})

describe('webhook parse', () => {
  it('parses a valid envelope', () => {
    const ts = new Date().toISOString()
    const body = JSON.stringify({
      event: 'order.completed',
      timestamp: ts,
      data: { id: 'ord_abc', quoteId: 'q_1' },
    })
    const env = parseWebhookEnvelope(body, '1700000000000', 'native')
    expect(env.flashnetOrderId).toBe('ord_abc')
    expect(env.quoteId).toBe('q_1')
    expect(env.event).toBe('order.completed')
    expect(env.projectId).toBe('native')
    expect(env.headerTimestamp).toBe('1700000000000')
    expect(env.zappiEventId).toContain('flashnet:ord_abc:order.completed:')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseWebhookEnvelope('not json')).toThrow(WebhookParseError)
  })

  it('throws on missing required fields', () => {
    const ts = new Date().toISOString()
    expect(() => parseWebhookEnvelope(JSON.stringify({ event: 'x', timestamp: ts }))).toThrow(WebhookParseError)
  })

  it('throws on invalid timestamp', () => {
    const body = JSON.stringify({
      event: 'order.completed',
      timestamp: 'not-a-date',
      data: { id: 'ord_1' },
    })
    expect(() => parseWebhookEnvelope(body)).toThrow(WebhookParseError)
  })

  it('envelopeFromHistoryOrder maps status to event', () => {
    const env = envelopeFromHistoryOrder({
      id: 'ord_1',
      status: 'completed',
      completedAt: '2024-01-01T00:00:00Z',
      quoteId: 'q_1',
    })
    expect(env?.event).toBe('order.completed')
    expect(env?.flashnetOrderId).toBe('ord_1')
  })

  it('envelopeFromHistoryOrder returns null for unknown status', () => {
    expect(envelopeFromHistoryOrder({ id: 'ord_1', status: 'pending' })).toBeNull()
  })

  it('isLedgerCredited guards shape', () => {
    expect(isLedgerCredited({ ok: true, event: 'ledger.credited' })).toBe(true)
    expect(isLedgerCredited({ ok: false, event: 'ledger.credited' })).toBe(false)
    expect(isLedgerCredited({ event: 'order.completed' })).toBe(false)
  })
})
