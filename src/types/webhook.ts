/**
 * Flashnet / Zappi webhook envelope shapes. Ported from
 * `server/src/wallet/webhooks/parse-webhook-envelope.ts` so partners can
 * verify and parse inbound webhooks without reimplementing in their stack.
 */

/** Headers attached to an inbound Zappi webhook. */
export interface ZappiWebhookHeaders {
  /** HMAC-SHA256 hex signature of `${timestamp}.${rawBody}`. */
  signature: string
  /** Unix-millisecond timestamp used in the signature. */
  timestamp: string
}

/** The parsed envelope produced from a verified webhook body. */
export interface FlashnetWebhookEnvelope {
  zappiEventId: string
  projectId: string
  nativeReference: string | null
  quoteId: string | null
  flashnetOrderId: string
  event: string
  flashnetTimestamp: string
  headerTimestamp: string | undefined
  payload: Record<string, unknown>
  receivedAt: string
}

/** Outbound `ledger.credited` event zappi-nest sends to partners. */
export interface LedgerCreditedEvent {
  ok: true
  event: 'ledger.credited'
  transactionId: string
  projectId: string
  userId: string
  amountCents: number
  amountUsdb: string
  type: string
  status: string
  combo?: {
    asset: string
    network: string
  }
  sparkTxHash?: string | null
  flashnetOrderId?: string | null
  occurredAt: string
}
