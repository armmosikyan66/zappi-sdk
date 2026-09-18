import { ZappiApiError, errorCode } from '../errors'
import type {
  AccountCurrency,
  CashierCombo,
} from '../types/cashier'
import type {
  AddressValidationResult,
  DecodedLightningInvoice,
  WithdrawalConfirmation,
  WithdrawalEstimate,
  WithdrawalQuote,
  WithdrawalRequest,
  WithdrawalStatus,
  WithdrawOption,
} from '../types/withdraw'
import type {
  ContactTransferConfirmation,
  ContactTransferInput,
} from '../types/transaction'
import type {
  DepositDestination,
  DepositOption,
  LightningInvoice,
  WalletBalance,
} from '../types/deposit'
import type {
  NestAccumulationAddressRequest,
  NestAccumulationAddressResponse,
  NestDepositAddressRequest,
  NestDepositOptionsResponse,
  NestLiquidationAddressRequest,
  NestLiquidationAddressResponse,
  NestListStandingDepositsResponse,
  NestPartnerLightningAddressResponse,
  NestPatchStandingDepositAddressRequest,
  NestResolveStandingDepositsRequest,
  NestResolveStandingDepositsResponse,
  NestSendInternalBody,
  NestSendInternalResponse,
  NestPartnerWithdrawBody,
  NestStandingDepositAddressRequest,
  NestStandingDepositAddressResponse,
  NestWithdrawBody,
  NestWithdrawEstimateResponse,
  NestWithdrawExecuteResponse,
  NestWithdrawStatusResponse,
  NestWithdrawalOptionsResponse,
} from '../types/partner'
import { lookupDepositNetworkCopy, mapNestDepositOptions } from './mappers/deposit-map'
import {
  mapNestEstimate,
  mapNestWithdrawOptions,
  mapNestWithdrawStatus,
  nestAmountCents,
  nestAsset,
  nestWithdrawAddress,
  toNestWithdrawBody,
  toPartnerWithdrawBody,
} from './mappers/withdraw-map'
import {
  mapNestDepositDestination,
  nestSourceTokenMeta,
} from './mappers/deposit-destination-map'
import {
  flashnetSourceAsset,
  toDepositDestination,
} from './presentation/deposit-presentation'
import type { DepositCombo } from '../types/cashier'

/**
 * Authentication mode for a {@link ZappiClient} call.
 *
 * - `projectKey` — partner/server-to-server calls (`Authorization: Bearer <key>`).
 *   **Server only.** Constructing this kind in a browser throws — the project
 *   API key must never be shipped to the client.
 * - `session` — server-side BFF calls acting for a logged-in user: forwards
 *   the user's access token via `x-zappi-access-token` plus the browser
 *   cookie jar. **Server only.**
 * - `bff` — browser-safe. Talks to your same-origin BFF with `credentials:
 *   'include'` (cookie auth); sends no key. Point `apiUrl` at your BFF, not
 *   at zappi-nest.
 */
export type ZappiAuth =
  | { kind: 'projectKey'; projectApiKey: string }
  | {
      kind: 'session'
      projectApiKey: string
      /** User access token forwarded as `x-zappi-access-token`. */
      accessToken?: string
      /** Raw cookie header to forward (e.g. from an inbound request). */
      cookie?: string
      /** User-agent to forward. */
      userAgent?: string
      /** Browser origin to forward (for WebAuthn rp.id derivation). */
      origin?: string
      /** Forwarded host. */
      forwardedHost?: string
      /** Forwarded proto. */
      forwardedProto?: string
    }
  | {
      /** Browser-safe cookie auth against a same-origin BFF. No API key. */
      kind: 'bff'
    }

export interface ZappiClientOptions {
  /** Base URL of zappi-nest, e.g. `https://api.zappi.money`. */
  apiUrl: string
  auth: ZappiAuth
  /** Default request timeout in ms. Defaults to 15s. */
  timeoutMs?: number
  /** Optional fetch override (for tests / edge runtimes). */
  fetch?: typeof fetch
  /** Optional AbortSignal-like constructor. */
}

/** Partner opaque user for {@link ZappiClient.createPartnerDepositDestination}. */
export interface PartnerDepositDestinationOpts {
  userId: string
  /** Override the Integration product Spark address nest would otherwise use. */
  recipientSparkAddress?: string
  nativeReference?: string
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH'
  body?: unknown
  /** One-time passkey step-up token (`X-Zappi-Authorization`). */
  authorizationToken?: string | null
  /** Per-request signal. */
  signal?: AbortSignal
  /** Override auth for this single call. */
  auth?: ZappiAuth
}

/**
 * Typed client for zappi-nest's `/api/wallet/*` and `/api/partner/wallet/*`
 * routes. Server-to-server only — never import this from the browser. The
 * BFF constructs one per inbound request; partners construct one per
 * process (or per request when acting on behalf of a user).
 *
 * The client maps raw nest responses to the clean frontend types so callers
 * don't need to know the nest DTO shapes. Partners that want the raw shapes
 * can use the `raw*` methods or import from `@zappi/sdk` types directly.
 */
export class ZappiClient {
  private readonly apiUrl: string
  private readonly defaultAuth: ZappiAuth
  private readonly timeoutMs: number
  private readonly fetchFn: typeof fetch

  constructor(opts: ZappiClientOptions) {
    if (!opts.apiUrl) throw new Error('ZappiClient: apiUrl is required')
    this.apiUrl = opts.apiUrl.replace(/\/$/, '')
    this.defaultAuth = opts.auth
    this.timeoutMs = opts.timeoutMs ?? 15_000
    this.fetchFn = opts.fetch ?? fetch
  }

  /* --------------------------------- Deposit -------------------------------- */

  /** `GET /api/wallet/deposit-options` → mapped catalog. */
  async getDepositOptions(signal?: AbortSignal): Promise<DepositOption[]> {
    const res = await this.call<NestDepositOptionsResponse>(
      'wallet/deposit-options',
      { signal },
    )
    return mapNestDepositOptions(res)
  }

  /**
   * BFF-shaped `GET /api/wallet/deposit/destination?asset=&network=`.
   * Partners talking to nest should use {@link createPartnerDepositDestination}.
   */
  async getDepositDestination(
    combo: CashierCombo,
    signal?: AbortSignal,
  ): Promise<DepositDestination> {
    const query = `?asset=${combo.asset}&network=${combo.network}`
    const res = await this.call<unknown>(
      `wallet/deposit/destination${query}`,
      { signal },
    )
    return mapNestDepositDestination(combo, res)
  }

  /**
   * @deprecated Use {@link createStandingDepositAddress} for new integrations.
   * Legacy Flashnet accumulation addresses are being phased out in favor of
   * standing deposit addresses. Kept for rollback when
   * `STANDING_DEPOSITS_ENABLED` is off.
   *
   * `POST /api/wallet/accumulation-address` — create/reuse a stables/ETH destination.
   */
  async createAccumulationAddress(
    body: NestAccumulationAddressRequest,
    signal?: AbortSignal,
  ): Promise<NestAccumulationAddressResponse> {
    return this.call<NestAccumulationAddressResponse>('wallet/accumulation-address', {
      method: 'POST',
      body,
      signal,
    })
  }

  /**
   * @deprecated Use {@link createStandingDepositAddress} for new integrations.
   * Legacy Flashnet liquidation addresses are being phased out in favor of
   * standing deposit addresses. Kept for rollback when
   * `STANDING_DEPOSITS_ENABLED` is off.
   *
   * `POST /api/wallet/liquidation-address` — create/reuse a BTC L1 destination.
   */
  async createLiquidationAddress(
    body: NestLiquidationAddressRequest,
    signal?: AbortSignal,
  ): Promise<NestLiquidationAddressResponse> {
    return this.call<NestLiquidationAddressResponse>('wallet/liquidation-address', {
      method: 'POST',
      body,
      signal,
    })
  }

  /**
   * `POST /api/wallet/standing-deposit-address` — create/reuse a Flashnet
   * standing deposit address. One immutable instruction per
   * (project, user, destination) returns per-source-chain deposit
   * addresses. Replaces legacy accumulation + liquidation addresses for new
   * integrations. Identical instructions replay; a changed destination
   * needs a new user/reference (nest surfaces 409 INSTRUCTION_CONFLICT).
   */
  async createStandingDepositAddress(
    body: NestStandingDepositAddressRequest,
    signal?: AbortSignal,
  ): Promise<NestStandingDepositAddressResponse> {
    return this.call<NestStandingDepositAddressResponse>(
      'wallet/standing-deposit-address',
      { method: 'POST', body, signal },
    )
  }

  /**
   * `GET /api/wallet/standing-deposit-address/deposits?userId=&limit=&offset=` —
   * pre-order deposit tracking with status and hold codes
   * (standing_identity_pair, dust below route minimum,
   * standing_tron_refund_requires_operator, …).
   */
  async listStandingDeposits(
    userId: string,
    opts: { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
  ): Promise<NestListStandingDepositsResponse> {
    const query = new URLSearchParams({ userId })
    if (opts.limit != null) query.set('limit', String(opts.limit))
    if (opts.offset != null) query.set('offset', String(opts.offset))
    return this.call<NestListStandingDepositsResponse>(
      `wallet/standing-deposit-address/deposits?${query.toString()}`,
      { signal },
    )
  }

  /**
   * `PATCH /api/wallet/standing-deposit-address` — pause/resume. `enabled:
   * false` pauses new source commitments (already signed transactions keep
   * their recovery path); `true` resumes retryable pause holds. Pausing
   * never refunds.
   */
  async patchStandingDepositAddress(
    body: NestPatchStandingDepositAddressRequest,
    signal?: AbortSignal,
  ): Promise<NestStandingDepositAddressResponse> {
    return this.call<NestStandingDepositAddressResponse>(
      'wallet/standing-deposit-address',
      { method: 'PATCH', body, signal },
    )
  }

  /**
   * `POST /api/wallet/standing-deposit-address/resolve` — request refunds for
   * held deposits. Send `depositIds` (1..200, same address and asset;
   * Bitcoin exactly one) or `batchId`, plus a source-chain `refundAddress`.
   * 202 confirms enqueueing, not broadcast.
   */
  async resolveStandingDeposits(
    body: NestResolveStandingDepositsRequest,
    signal?: AbortSignal,
  ): Promise<NestResolveStandingDepositsResponse> {
    return this.call<NestResolveStandingDepositsResponse>(
      'wallet/standing-deposit-address/resolve',
      { method: 'POST', body, signal },
    )
  }

  /** `POST /api/partner/wallet/lightning-address` — LNURL-pay address for a partner user. */
  async createPartnerLightningAddress(
    userId: string,
    signal?: AbortSignal,
  ): Promise<NestPartnerLightningAddressResponse> {
    return this.call<NestPartnerLightningAddressResponse>(
      'partner/wallet/lightning-address',
      { method: 'POST', body: { userId }, signal },
    )
  }

  /**
   * Partner deposit destination against nest (not the Next BFF).
   * Branches Lightning / BTC mainnet / accumulation, then attaches catalog copy
   * and QR / deep-link presentation.
   */
  async createPartnerDepositDestination(
    combo: CashierCombo,
    opts: PartnerDepositDestinationOpts,
    signal?: AbortSignal,
  ): Promise<DepositDestination> {
    const userId = opts.userId.trim()
    const nativeReference = opts.nativeReference?.trim() || userId

    const optionsPromise = this.getDepositOptions(signal)
    const createdPromise = this.resolvePartnerDepositAddress(
      combo,
      { userId, nativeReference, recipientSparkAddress: opts.recipientSparkAddress },
      signal,
    )
    const [options, created] = await Promise.all([optionsPromise, createdPromise])

    const copy = lookupDepositNetworkCopy(options, combo.asset, combo.network)
    if (!copy) {
      throw new ZappiApiError(400, 'Bad Request', {
        ok: false,
        error: 'DEPOSIT_RAIL_UNAVAILABLE',
        message: 'That asset and network is not in the live deposit catalog.',
      })
    }

    return toDepositDestination(
      combo as DepositCombo,
      created.address,
      copy,
      created.lnurl,
      created.token,
    )
  }

  private async resolvePartnerDepositAddress(
    combo: CashierCombo,
    opts: {
      userId: string
      nativeReference: string
      recipientSparkAddress?: string
    },
    signal?: AbortSignal,
  ): Promise<{
    address: string
    lnurl?: string
    token?: ReturnType<typeof nestSourceTokenMeta>
  }> {
    if (combo.asset === 'btc' && combo.network === 'lightning') {
      const res = await this.createPartnerLightningAddress(opts.userId, signal)
      if (!res.enabled) {
        throw new ZappiApiError(503, 'Service Unavailable', {
          ok: false,
          error: 'LIGHTNING_DISABLED',
          message:
            'Lightning Address receive is disabled on this server. Set LIGHTNING_ENABLED=true in zappi-nest.',
        })
      }
      const address = String(res.address ?? '').trim()
      if (!address) {
        throw new ZappiApiError(502, 'Bad Gateway', {
          ok: false,
          error: 'GATEWAY_INVALID_RESPONSE',
          message: 'zappi-nest did not return a Lightning Address.',
        })
      }
      return { address, lnurl: res.lnurl }
    }

    if (combo.asset === 'btc' && combo.network === 'mainnet') {
      const res = await this.createStandingDepositAddress(
        {
          userId: opts.userId,
          sourceChain: 'bitcoin',
          destinationAsset: 'USDB',
          nativeReference: opts.nativeReference,
          idempotencyKey: `std:deposit:${opts.userId}:btc:mainnet`,
          ...(opts.recipientSparkAddress
            ? { destinationAddress: opts.recipientSparkAddress }
            : {}),
        },
        signal,
      )
      const address = String(
        res.addresses?.bitcoin ?? res.depositAddress ?? '',
      ).trim()
      if (!address) {
        throw new ZappiApiError(502, 'Bad Gateway', {
          ok: false,
          error: 'GATEWAY_INVALID_RESPONSE',
          message: 'zappi-nest did not return a Bitcoin deposit address.',
        })
      }
      return { address, token: nestSourceTokenMeta(res) }
    }

    const res = await this.createStandingDepositAddress(
      {
        userId: opts.userId,
        sourceChain: combo.network,
        destinationAsset: 'USDB',
        nativeReference: opts.nativeReference,
        idempotencyKey: `std:deposit:${opts.userId}:${combo.network}:${combo.asset}`,
        ...(opts.recipientSparkAddress
          ? { destinationAddress: opts.recipientSparkAddress }
          : {}),
      },
      signal,
    )
    const address = String(
      res.addresses?.[combo.network] ?? res.depositAddress ?? '',
    ).trim()
    if (!address) {
      throw new ZappiApiError(502, 'Bad Gateway', {
        ok: false,
        error: 'GATEWAY_INVALID_RESPONSE',
        message: 'zappi-nest did not return a deposit address.',
      })
    }
    return { address, token: nestSourceTokenMeta(res) }
  }

  /** `POST /api/wallet/lightning-invoices` → amount-locked BOLT11. */
  async generateLightningInvoice(
    amountSats: number,
    signal?: AbortSignal,
  ): Promise<LightningInvoice> {
    return this.call<LightningInvoice>('wallet/lightning-invoices', {
      method: 'POST',
      body: { amountSats },
      signal,
    })
  }

  /** `GET /api/wallet/balance` → readonly wallet balance envelope. */
  async getWalletBalance(signal?: AbortSignal): Promise<WalletBalance> {
    return this.call<WalletBalance>('wallet/balance', { signal })
  }

  /** @deprecated Renamed to {@link getWalletBalance}. */
  async getBalance(signal?: AbortSignal): Promise<WalletBalance> {
    return this.getWalletBalance(signal)
  }

  /* -------------------------------- Withdraw -------------------------------- */

  /** `GET /api/wallet/withdrawal-options` → mapped catalog. */
  async getWithdrawOptions(signal?: AbortSignal): Promise<WithdrawOption[]> {
    const res = await this.call<NestWithdrawalOptionsResponse>(
      'wallet/withdrawal-options',
      { signal },
    )
    return mapNestWithdrawOptions(res)
  }

  /** `GET /api/wallet/withdraw/validate-address` (or local) → validation result. */
  async validateWithdrawAddress(
    combo: CashierCombo,
    address: string,
    signal?: AbortSignal,
  ): Promise<AddressValidationResult> {
    return this.call<AddressValidationResult>(
      `wallet/withdraw/validate-address?asset=${combo.asset}&network=${combo.network}&address=${encodeURIComponent(address)}`,
      { signal },
    )
  }

  /** `POST /api/wallet/withdraw/decode-lightning-invoice` → decoded invoice. */
  async decodeLightningInvoice(
    bolt11: string,
    signal?: AbortSignal,
  ): Promise<DecodedLightningInvoice> {
    return this.call<DecodedLightningInvoice>(
      'wallet/withdraw/decode-lightning-invoice',
      { method: 'POST', body: { bolt11 }, signal },
    )
  }

  /** `POST /api/wallet/withdraw/estimate` → fee/net preview (no TTL). */
  async estimateWithdrawal(
    req: WithdrawalRequest,
    signal?: AbortSignal,
  ): Promise<WithdrawalEstimate> {
    const res = await this.call<NestWithdrawEstimateResponse | WithdrawalEstimate>(
      'wallet/withdraw/estimate',
      { method: 'POST', body: req, signal },
    )
    // Nest returns the raw estimate shape; map to the clean type when it has
    // the nest-specific `amountUsdb` field.
    if (res && typeof res === 'object' && 'amountUsdb' in res) {
      return mapNestEstimate(req, res as NestWithdrawEstimateResponse)
    }
    return res as WithdrawalEstimate
  }

  /** `POST /api/wallet/withdraw/quote` → locked quote with `quoteId` + TTL. */
  async getWithdrawalQuote(
    req: WithdrawalRequest,
    signal?: AbortSignal,
  ): Promise<WithdrawalQuote> {
    return this.call<WithdrawalQuote>('wallet/withdraw/quote', {
      method: 'POST',
      body: req,
      signal,
    })
  }

  /** `GET /api/wallet/withdraw/quote?quoteId=` → re-fetch a quote. */
  async getWithdrawalQuoteById(quoteId: string, signal?: AbortSignal): Promise<WithdrawalQuote> {
    return this.call<WithdrawalQuote>(
      `wallet/withdraw/quote?quoteId=${encodeURIComponent(quoteId)}`,
      { signal },
    )
  }

  /**
   * `POST /api/wallet/withdraw/confirm` (BFF) → two-phase confirmation. The
   * first call may return `needsSignature: true`; the caller then signs Spark
   * USDB and retries with `sparkTxHash`. For the full orchestration see
   * {@link runTwoPhaseWithdraw} in `@zappi/sdk`.
   */
  async confirmWithdrawal(
    quoteId: string,
    sparkTxHash?: string,
    authorizationToken?: string | null,
    signal?: AbortSignal,
  ): Promise<WithdrawalConfirmation> {
    return this.call<WithdrawalConfirmation>('wallet/withdraw/confirm', {
      method: 'POST',
      body: { quoteId, ...(sparkTxHash ? { sparkTxHash } : {}) },
      authorizationToken,
      signal,
    })
  }

  /** `GET /api/wallet/withdraw/status?id=` → poll a withdrawal. */
  async getWithdrawalStatus(id: string, signal?: AbortSignal): Promise<WithdrawalStatus> {
    const res = await this.call<NestWithdrawStatusResponse>(
      `wallet/withdraw/status?id=${encodeURIComponent(id)}`,
      { signal },
    )
    const mapped = mapNestWithdrawStatus(res)
    if (!mapped) throw new ZappiApiError(502, 'Bad Gateway', { ok: false, error: 'GATEWAY_INVALID_RESPONSE' })
    return mapped
  }

  /* ------------------------------ Partner routes ----------------------------- */

  /**
   * `GET /api/wallet/withdraw/status?withdrawId=&userId=` — project-key poll
   * of a partner product-wallet payout. Nest requires `userId` so a project
   * key cannot enumerate withdrawals across users.
   */
  async partnerGetWithdrawalStatus(
    withdrawId: string,
    userId: string,
    signal?: AbortSignal,
  ): Promise<WithdrawalStatus> {
    const query = new URLSearchParams({ withdrawId, userId })
    const res = await this.call<NestWithdrawStatusResponse>(
      `wallet/withdraw/status?${query.toString()}`,
      { signal },
    )
    const mapped = mapNestWithdrawStatus(res)
    if (!mapped) {
      throw new ZappiApiError(502, 'Bad Gateway', {
        ok: false,
        error: 'GATEWAY_INVALID_RESPONSE',
      })
    }
    return mapped
  }

  /**
   * `POST /api/partner/wallet/withdraw` — two-phase partner withdraw from the
   * Integration product wallet. Returns the raw nest execute response so
   * partners can read `needsSignature`, `depositAddress`, `tokenIdentifier`,
   * `sendAmount` directly. Orchestrate with {@link runTwoPhasePartnerWithdraw}.
   */
  async partnerWithdraw(
    body: NestPartnerWithdrawBody,
    authorizationToken?: string | null,
    signal?: AbortSignal,
  ): Promise<NestWithdrawExecuteResponse> {
    return this.call<NestWithdrawExecuteResponse>('partner/wallet/withdraw', {
      method: 'POST',
      body,
      authorizationToken,
      signal,
    })
  }

  /**
   * `POST /api/partner/wallet/withdraw/decode-lightning-invoice` — decode a
   * BOLT11 for a partner withdraw destination.
   */
  async partnerDecodeLightningInvoice(
    bolt11: string,
    signal?: AbortSignal,
  ): Promise<DecodedLightningInvoice> {
    const res = await this.call<{
      ok: true
      amountSats: number | null
    }>('partner/wallet/withdraw/decode-lightning-invoice', {
      method: 'POST',
      body: { bolt11 },
      signal,
    })
    return {
      valid: true,
      ...(res.amountSats != null ? { amountSats: res.amountSats } : {}),
    }
  }

  /** `POST /api/partner/wallet/send/internal` — partner-initiated internal send. */
  async partnerSendInternal(
    body: NestSendInternalBody,
    signal?: AbortSignal,
  ): Promise<NestSendInternalResponse> {
    return this.call<NestSendInternalResponse>('partner/wallet/send/internal', {
      method: 'POST',
      body,
      signal,
    })
  }

  /* -------------------------------- Transfer -------------------------------- */

  /** `POST /api/wallet/send/internal` — user-to-user internal send. */
  async sendInternal(
    input: ContactTransferInput,
    signal?: AbortSignal,
  ): Promise<ContactTransferConfirmation> {
    return this.call<ContactTransferConfirmation>('wallet/send/internal', {
      method: 'POST',
      body: input,
      authorizationToken: input.authorizationToken,
      signal,
    })
  }

  /* --------------------------- Generic passthrough -------------------------- */

  /**
   * Generic typed request to any `/api/<path>` route on zappi-nest. This is
   * the escape hatch partners and the BFF use for endpoints that don't have
   * a dedicated typed method (or while migrating off a hand-rolled fetch
   * helper). It applies the same auth, headers, timeout, and error mapping
   * as the typed methods.
   *
   * @param path Nest path without the `/api/` prefix, e.g. `'wallet/ledger'`.
   * @param opts Method, body, passkey `authorizationToken`, per-request signal,
   *   or an `auth` override for this single call.
   */
  async request<T>(
    path: string,
    opts: {
      method?: 'GET' | 'POST' | 'DELETE' | 'PATCH'
      body?: unknown
      authorizationToken?: string | null
      signal?: AbortSignal
      auth?: ZappiAuth
    } = {},
  ): Promise<T> {
    return this.call<T>(path, opts)
  }

  /* --------------------------------- SSE -------------------------------- */

  /**
   * Subscribe to the unified cashier event stream
   * (`GET /api/wallet/events` as SSE). Returns an unsubscribe function.
   *
   * Uses the Fetch + ReadableStream SSE reader so it works in both Node 20+
   * (undici) and modern browsers without an EventSource polyfill. Note:
   * EventSource cannot set custom headers, so we use fetch streaming.
   */
  subscribeCashierEvents(
    onEvent: (event: unknown) => void,
    onError?: (error: Error) => void,
    signal?: AbortSignal,
  ): () => void {
    const controller = new AbortController()
    const linked = signal
      ? linkSignals(signal, controller)
      : undefined

    const url = `${this.apiUrl}/api/wallet/events`
    assertServerSideAuth(this.defaultAuth, 'subscribeCashierEvents')
    const headers = this.buildHeaders(this.defaultAuth, undefined)
    headers.set('Accept', 'text/event-stream')

    let closed = false

    void (async () => {
      try {
        const res = await this.fetchFn(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
          cache: 'no-store',
          credentials: this.defaultAuth.kind === 'bff' ? 'include' : undefined,
        })
        if (!res.ok || !res.body) {
          throw new ZappiApiError(res.status, res.statusText, await safeJson(res))
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            const data = parseSsePart(part)
            if (data !== undefined) onEvent(data)
          }
        }
      } catch (error) {
        if (!closed && onError) onError(error instanceof Error ? error : new Error(String(error)))
      } finally {
        linked?.unlink()
      }
    })()

    return () => {
      closed = true
      controller.abort()
    }
  }

  /* -------------------------------- internals ------------------------------- */

  private buildHeaders(auth: ZappiAuth, authorizationToken?: string | null): Headers {
    const headers = new Headers()
    headers.set('Accept', 'application/json')

    // `bff` never carries a key — it authenticates with the browser's cookies.
    if (auth.kind !== 'bff') {
      headers.set('Authorization', `Bearer ${auth.projectApiKey}`)
    }

    if (auth.kind === 'session') {
      if (auth.accessToken) headers.set('x-zappi-access-token', auth.accessToken)
      if (auth.cookie) headers.set('Cookie', auth.cookie)
      if (auth.userAgent) headers.set('User-Agent', auth.userAgent)
      if (auth.origin) headers.set('Origin', auth.origin)
      if (auth.forwardedHost) headers.set('X-Forwarded-Host', auth.forwardedHost)
      if (auth.forwardedProto) headers.set('X-Forwarded-Proto', auth.forwardedProto)
    }
    if (authorizationToken) headers.set('X-Zappi-Authorization', authorizationToken)
    return headers
  }

  private async call<T>(path: string, opts: CallOptions = {}): Promise<T> {
    const auth = opts.auth ?? this.defaultAuth
    assertServerSideAuth(auth, 'ZappiClient.call')
    if (auth.kind === 'projectKey' && !auth.projectApiKey) {
      throw new ZappiApiError(503, 'Service Unavailable', {
        ok: false,
        error: 'GATEWAY_NOT_CONFIGURED',
        message: 'ZAPPI_PROJECT_API_KEY is not set.',
      })
    }

    const method = opts.method ?? 'GET'
    const headers = this.buildHeaders(auth, opts.authorizationToken)
    if (opts.body !== undefined) headers.set('Content-Type', 'application/json')
    const timeoutController = new AbortController()
    const timeout = setTimeout(
      () => timeoutController.abort(),
      this.timeoutMs,
    )
    const linked = opts.signal ? linkSignals(opts.signal, timeoutController) : undefined

    let res: Response
    try {
      res = await this.fetchFn(`${this.apiUrl}/api/${path}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
        credentials: auth.kind === 'bff' ? 'include' : undefined,
        signal: timeoutController.signal,
      })
    } catch (error) {
      if (opts.signal?.aborted) {
        throw new ZappiApiError(499, 'Client Closed Request', { ok: false, error: 'CLIENT_CLOSED' })
      }
      throw new ZappiApiError(503, 'Service Unavailable', {
        ok: false,
        error: 'GATEWAY_UNREACHABLE',
        message: `Could not reach zappi-nest at ${this.apiUrl}.`,
      })
    } finally {
      clearTimeout(timeout)
      linked?.unlink()
    }

    if (!res.ok) {
      const body = await safeJson(res)
      throw new ZappiApiError(res.status, res.statusText, body)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }
}

/* --------------------------------- helpers -------------------------------- */

/**
 * Guard: `projectKey` / `session` auth embeds the project API key in headers,
 * so using them from a browser would leak the key into any shipped bundle.
 * `bff` is the only browser-safe kind. Runs once per call; cheap (`typeof
 * window` check).
 */
function assertServerSideAuth(auth: ZappiAuth, where: string): void {
  if (auth.kind === 'bff') return
  const isBrowser =
    typeof window !== 'undefined' &&
    typeof window.document !== 'undefined' &&
    window.document !== null
  if (isBrowser) {
    throw new Error(
      `${where}: auth kind '${auth.kind}' carries the project API key and must only be ` +
        `used server-side. In the browser, construct the client with ` +
        `auth: { kind: 'bff' } pointed at your same-origin BFF (cookie auth, no key).`,
    )
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    try {
      return await res.text()
    } catch {
      return undefined
    }
  }
}

function parseSsePart(part: string): unknown {
  const lines = part.split('\n')
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const data = line.slice(5).trim()
      if (!data) return undefined
      try {
        return JSON.parse(data)
      } catch {
        return data
      }
    }
  }
  return undefined
}

/** Link an external signal to a controller so abort propagates both ways. */
function linkSignals(
  external: AbortSignal,
  controller: AbortController,
): { unlink: () => void } {
  const onAbort = () => controller.abort()
  if (external.aborted) controller.abort()
  else external.addEventListener('abort', onAbort, { once: true })
  return {
    unlink: () => external.removeEventListener('abort', onAbort),
  }
}

/* ---------------------------- re-exported helpers --------------------------- */
// Re-export the nest-body builders so partners using `partnerWithdraw` can
// construct the body without importing the mapper subpath.
export {
  nestAmountCents,
  nestAsset,
  nestWithdrawAddress,
  toNestWithdrawBody,
  toPartnerWithdrawBody,
}
export type {
  AccountCurrency,
  NestDepositAddressRequest,
  NestPartnerWithdrawBody,
  NestWithdrawBody,
}
