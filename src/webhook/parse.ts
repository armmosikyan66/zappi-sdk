import type { FlashnetWebhookEnvelope, LedgerCreditedEvent } from '../types/webhook'

/**
 * Parse a verified webhook body into a {@link FlashnetWebhookEnvelope}.
 * Ported from `server/src/wallet/webhooks/parse-webhook-envelope.ts`.
 *
 * Throws on invalid JSON or missing required fields. Callers should
 * {@link verifyZappiWebhook} first.
 */
export function parseWebhookEnvelope(
  rawBody: string,
  headerTimestamp?: string,
  defaultProjectId: string = 'native',
): FlashnetWebhookEnvelope {
  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    throw new WebhookParseError('INVALID_JSON', 'Webhook body is not valid JSON')
  }

  if (!isRecord(payload)) {
    throw new WebhookParseError('INVALID_JSON', 'Webhook body must be a JSON object')
  }

  const eventName = readString(payload.event)
  const payloadTimestamp = readString(payload.timestamp)
  const data = isRecord(payload.data) ? payload.data : null
  const flashnetOrderId = data ? readString(data.id) : null

  if (!eventName || !payloadTimestamp || !flashnetOrderId || !data) {
    throw new WebhookParseError(
      'INVALID_FLASHNET_WEBHOOK_PAYLOAD',
      'Missing required Flashnet webhook fields',
    )
  }

  const flashnetTimestamp = new Date(payloadTimestamp)
  if (!Number.isFinite(flashnetTimestamp.getTime())) {
    throw new WebhookParseError(
      'INVALID_FLASHNET_WEBHOOK_TIMESTAMP',
      'Invalid Flashnet webhook timestamp',
    )
  }

  const zappiEventId = [
    'flashnet',
    flashnetOrderId,
    eventName,
    String(flashnetTimestamp.getTime()),
  ].join(':')

  return {
    zappiEventId,
    projectId: defaultProjectId,
    nativeReference: readNativeReference(payload),
    quoteId: data ? readString(data.quoteId) : null,
    flashnetOrderId,
    event: eventName,
    flashnetTimestamp: flashnetTimestamp.toISOString(),
    headerTimestamp,
    payload,
    receivedAt: new Date().toISOString(),
  }
}

const HISTORY_STATUS_TO_EVENT: Record<string, string> = {
  completed: 'order.completed',
  failed: 'order.failed',
  refunded: 'order.refunded',
}

/** Build an envelope from an Orchestra history order (used by the reconcile poller). */
export function envelopeFromHistoryOrder(
  order: Record<string, unknown>,
  defaultProjectId: string = 'native',
): FlashnetWebhookEnvelope | null {
  const flashnetOrderId = readString(order.id)
  const status = readString(order.status)?.trim().toLowerCase()
  const eventName = status ? HISTORY_STATUS_TO_EVENT[status] : undefined
  const rawTimestamp =
    readString(order.completedAt) ??
    readString(order.updatedAt) ??
    readString(order.createdAt)
  if (!flashnetOrderId || !eventName || !rawTimestamp) return null

  const flashnetTimestamp = new Date(rawTimestamp)
  if (!Number.isFinite(flashnetTimestamp.getTime())) return null

  const timestamp = flashnetTimestamp.toISOString()
  const payload = { event: eventName, timestamp, data: order }

  return {
    zappiEventId: [
      'flashnet',
      flashnetOrderId,
      eventName,
      String(flashnetTimestamp.getTime()),
    ].join(':'),
    projectId: defaultProjectId,
    nativeReference: readNativeReference(payload),
    quoteId: readString(order.quoteId),
    flashnetOrderId,
    event: eventName,
    flashnetTimestamp: timestamp,
    headerTimestamp: undefined,
    payload,
    receivedAt: new Date().toISOString(),
  }
}

/** Type guard: is this a `ledger.credited` outbound event? */
export function isLedgerCredited(
  event: unknown,
): event is LedgerCreditedEvent {
  return isRecord(event) && event.event === 'ledger.credited' && event.ok === true
}

export class WebhookParseError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'WebhookParseError'
  }
}

/* --------------------------------- helpers -------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readNativeReference(payload: Record<string, unknown>): string | null {
  const data = isRecord(payload.data) ? payload.data : null
  const metadata = data && isRecord(data.metadata) ? data.metadata : null
  return (
    readString(payload.nativeReference) ??
    (data ? readString(data.nativeReference) : null) ??
    (data ? readString(data.label) : null) ??
    (metadata ? readString(metadata.nativeReference) : null) ??
    (metadata ? readString(metadata.label) : null)
  )
}
