import { createHmac, timingSafeEqual } from 'node:crypto'
import { QUOTE_TOKEN_VERSION, WITHDRAW_QUOTE_TTL_MS } from '../constants'
import type { WithdrawalQuote } from '../types/withdraw'
import type { WithdrawCombo } from '../types/cashier'

/**
 * HMAC-signed, stateless quote token used by the BFF to enforce a ~2-minute
 * withdraw quote TTL without storing anything in nest. Ported from
 * `web/lib/cashier/withdraw-quote-token.ts`.
 *
 * Token format: `v1.<base64url(payload)>.<base64url(hmac)>`
 *
 * The secret is **caller-supplied** — the BFF passes its server secret, nest
 * never sees it. This keeps the quote lifecycle entirely in the BFF.
 */
export interface WithdrawQuotePayload {
  /** Session user who minted the quote. Confirm must match this id. */
  userId: string
  combo: WithdrawCombo
  address: string
  amountCents: number
  amountSats?: number
  destinationDisplay: string
  grossAmountSats?: number
  grossAmountCents?: number
  networkFeeSats?: number
  networkFeeCents?: number
  netReceivedSats?: number
  netReceivedCents?: number
  estimatedArrivalCopy: string
  expiresAt: string
}

function payloadBytes(payload: WithdrawQuotePayload): Buffer {
  return Buffer.from(JSON.stringify(payload), 'utf8')
}

function sign(secret: string, body: Buffer): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

/** Mint a signed quote token. The secret never leaves the caller. */
export function mintWithdrawQuoteToken(
  secret: string,
  payload: WithdrawQuotePayload,
): string {
  const body = payloadBytes(payload)
  return `${QUOTE_TOKEN_VERSION}.${body.toString('base64url')}.${sign(secret, body)}`
}

/** Verify and decode a quote token. Returns null on any tampering or bad shape. */
export function readWithdrawQuoteToken(
  secret: string,
  token: string,
): WithdrawQuotePayload | null {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== QUOTE_TOKEN_VERSION) return null
  const [, encoded, mac] = parts
  if (!encoded || !mac) return null

  let body: Buffer
  try {
    body = Buffer.from(encoded, 'base64url')
  } catch {
    return null
  }

  const expected = sign(secret, body)
  const given = Buffer.from(mac)
  const want = Buffer.from(expected)
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null
  }

  try {
    return JSON.parse(body.toString('utf8')) as WithdrawQuotePayload
  } catch {
    return null
  }
}

/** Is a quote expired relative to `now`? */
export function isWithdrawQuoteExpired(expiresAt: string, now: number = Date.now()): boolean {
  const ts = new Date(expiresAt).getTime()
  return Number.isNaN(ts) || ts <= now
}

/** Build a clean {@link WithdrawalQuote} from a decoded payload. */
export function quoteFromPayload(
  quoteId: string,
  payload: WithdrawQuotePayload,
): WithdrawalQuote {
  return {
    quoteId,
    combo: payload.combo,
    destinationDisplay: payload.destinationDisplay,
    grossAmountSats: payload.grossAmountSats,
    grossAmountCents: payload.grossAmountCents,
    networkFeeSats: payload.networkFeeSats,
    networkFeeCents: payload.networkFeeCents,
    netReceivedSats: payload.netReceivedSats,
    netReceivedCents: payload.netReceivedCents,
    estimatedArrivalCopy: payload.estimatedArrivalCopy,
    expiresAt: payload.expiresAt,
  }
}

/** Compute an `expiresAt` ISO string `TTL_MS` from now. */
export function quoteExpiresAt(now: number = Date.now()): string {
  return new Date(now + WITHDRAW_QUOTE_TTL_MS).toISOString()
}
