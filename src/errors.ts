/**
 * Typed errors thrown by the SDK. Mirrors the gateway error envelope
 * `{ ok: false, error: string, message: string }` and the common error
 * codes zappi-nest returns.
 */

/** Known gateway error codes. `*` fields are extensible — callers should not exhaustively switch. */
export type ZappiErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'QUOTE_EXPIRED'
  | 'WALLET_NOT_LINKED'
  | 'SPARK_WALLET_NOT_CONFIGURED'
  | 'PRODUCT_WALLET_NOT_CONFIGURED'
  | 'SESSION_ENDED'
  | 'GATEWAY_UNREACHABLE'
  | 'GATEWAY_NOT_CONFIGURED'
  | 'GATEWAY_INVALID_RESPONSE'
  | 'DEPOSIT_RAIL_UNAVAILABLE'
  | 'LIGHTNING_DISABLED'
  | 'INVALID_FLASHNET_WEBHOOK_SIGNATURE'
  | 'INVALID_FLASHNET_WEBHOOK_PAYLOAD'
  | (string & {})

export interface ZappiErrorBody {
  ok: false
  error: string
  message?: string
}

/** Error thrown when a zappi-nest call fails or returns a non-2xx status. */
export class ZappiApiError extends Error {
  readonly status: number
  readonly statusText: string
  readonly body: unknown
  readonly code: string | null

  constructor(
    status: number,
    statusText: string,
    body?: unknown,
  ) {
    super(messageFromBody(status, statusText, body))
    this.name = 'ZappiApiError'
    this.status = status
    this.statusText = statusText
    this.body = body
    this.code = errorCode(body)
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }
  get isSessionEnded(): boolean {
    return this.status === 401 && this.code === 'SESSION_ENDED'
  }
  get isForbidden(): boolean {
    return this.status === 403
  }
  get isNotFound(): boolean {
    return this.status === 404
  }
  get isServerError(): boolean {
    return this.status >= 500
  }
  get isInsufficientBalance(): boolean {
    return this.status === 402 || this.code === 'INSUFFICIENT_BALANCE'
  }
  get isQuoteExpired(): boolean {
    return this.code === 'QUOTE_EXPIRED'
  }
}

/** Extract the `error` code from a gateway error body, if present. */
export function errorCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  if (!('error' in body) || typeof (body as Record<string, unknown>).error !== 'string') {
    return null
  }
  return (body as Record<string, unknown>).error as string
}

function messageFromBody(status: number, statusText: string, body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const message = (body as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim()) return message
  }
  if (typeof body === 'string' && body.trim()) return body
  return `${status} ${statusText}`
}
