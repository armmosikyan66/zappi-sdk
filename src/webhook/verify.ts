import { createHmac, timingSafeEqual } from 'node:crypto'
import { DEFAULT_WEBHOOK_TOLERANCE_MS } from '../constants'

/**
 * HMAC-SHA256 verification for inbound Zappi webhooks. Ported from
 * `server/src/common/security/hmac.ts` so partners (e.g. BitKong) can verify
 * `X-Zappi-Signature` without reimplementing in their stack.
 *
 * The signature is `HMAC_SHA256(secret, "${timestamp}.${rawBody}")` as hex.
 * Verification rejects when:
 * - signature or timestamp headers are missing,
 * - the signature is not hex,
 * - the timestamp is not a finite integer,
 * - the timestamp is outside `toleranceMs` of `now` (replay protection),
 * - the signature does not match (constant-time compare).
 *
 * @param rawBody The exact request body string (do not re-serialize JSON).
 * @param signature The `X-Zappi-Signature` header value (hex).
 * @param timestamp The `X-Zappi-Timestamp` header value (unix ms).
 * @param secret The shared HMAC secret (`FLASHNET_WEBHOOK_SECRET`).
 * @param toleranceMs Max allowed clock skew. Defaults to 5 minutes.
 * @param nowMs Override for the current time (tests).
 */
export function verifyZappiWebhook(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
  toleranceMs: number = DEFAULT_WEBHOOK_TOLERANCE_MS,
  nowMs: number = Date.now(),
): boolean {
  if (!signature || !timestamp || !secret) return false
  if (!/^[0-9a-f]+$/i.test(signature)) return false

  const timestampMs = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(timestampMs)) return false

  if (Math.abs(nowMs - timestampMs) > toleranceMs) return false

  const expected = signBody({ rawBody, secret, timestamp }).signature
  if (expected.length !== signature.length) return false

  return timingSafeEqualString(expected, signature)
}

/** Compute the signature for a body. Used by both verify and (rarely) mint. */
export function signBody(params: {
  rawBody: string
  secret: string
  timestamp?: string
}): { timestamp: string; signature: string } {
  const timestamp = params.timestamp ?? Date.now().toString()
  return {
    timestamp,
    signature: createHmac('sha256', params.secret)
      .update(`${timestamp}.${params.rawBody}`)
      .digest('hex'),
  }
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
