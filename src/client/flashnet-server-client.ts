import { ZappiApiError } from '../errors'
import type { StandingDepositAddress } from '../types/standing'
import { parseStandingDepositAddress } from './parse-standing-address'

export interface FlashnetServerClientOptions {
  /** Orchestra origin, e.g. `https://orchestration.flashnet.xyz`. */
  baseUrl: string
  /** Server key. Sent as `Authorization: Bearer`. */
  serverKey: string
  fetchFn?: typeof fetch
  timeoutMs?: number
}

export interface StandingDepositAddressQuery {
  sourceChain?: string
  sourceAsset?: string
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Server-key client for Flashnet standing deposit addresses.
 * Partners and zappi-nest use this instead of hand-rolling the GET.
 */
export class FlashnetServerClient {
  private readonly baseUrl: string
  private readonly serverKey: string
  private readonly fetchFn: typeof fetch
  private readonly timeoutMs: number

  constructor(opts: FlashnetServerClientOptions) {
    const baseUrl = opts.baseUrl.trim().replace(/\/+$/, '')
    const serverKey = opts.serverKey.trim()
    if (!baseUrl) {
      throw new ZappiApiError(503, 'Service Unavailable', {
        ok: false,
        error: 'GATEWAY_NOT_CONFIGURED',
        message: 'Flashnet base URL is not configured.',
      })
    }
    if (!serverKey) {
      throw new ZappiApiError(503, 'Service Unavailable', {
        ok: false,
        error: 'GATEWAY_NOT_CONFIGURED',
        message: 'Flashnet server key is not configured.',
      })
    }
    this.baseUrl = baseUrl
    this.serverKey = serverKey
    this.fetchFn = opts.fetchFn ?? fetch
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /**
   * `GET /v1/standing-deposit-addresses/{ref}`.
   * Pass `sourceChain` and `sourceAsset` to read that rail's
   * `effectiveMinimum`. Omit them for the instruction-wide bound.
   */
  async getStandingDepositAddress(
    ref: string,
    params?: StandingDepositAddressQuery,
    signal?: AbortSignal,
  ): Promise<StandingDepositAddress> {
    const id = ref.trim()
    if (!id) {
      throw new ZappiApiError(400, 'Bad Request', {
        ok: false,
        error: 'INVALID_REF',
        message: 'Standing address ref is required.',
      })
    }

    const url = new URL(
      `${this.baseUrl}/v1/standing-deposit-addresses/${encodeURIComponent(id)}`,
    )
    const sourceChain = params?.sourceChain?.trim()
    const sourceAsset = params?.sourceAsset?.trim()
    if (sourceChain) url.searchParams.set('sourceChain', sourceChain)
    if (sourceAsset) url.searchParams.set('sourceAsset', sourceAsset)

    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs)
    const onAbort = () => timeout.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    let response: Response
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.serverKey}`,
        },
        signal: timeout.signal,
      })
    } catch (error) {
      if (signal?.aborted) {
        throw new ZappiApiError(499, 'Client Closed Request', {
          ok: false,
          error: 'CLIENT_CLOSED',
        })
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new ZappiApiError(503, 'Service Unavailable', {
        ok: false,
        error: 'GATEWAY_UNREACHABLE',
        message: `Could not reach Flashnet: ${message}`,
      })
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    const body = await readBody(response)
    if (!response.ok) {
      throw new ZappiApiError(response.status, response.statusText, body)
    }
    const parsed = parseStandingDepositAddress(body)
    if (!parsed) {
      throw new ZappiApiError(502, 'Bad Gateway', {
        ok: false,
        error: 'GATEWAY_INVALID_RESPONSE',
        message: 'Flashnet did not return a standing deposit address.',
      })
    }
    return parsed
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}
