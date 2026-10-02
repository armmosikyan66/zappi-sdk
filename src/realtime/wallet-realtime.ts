import type { BalanceApplyGuard } from './balance-guard'
import { createBalanceApplyGuard } from './balance-guard'
import { toWalletEvent, type TokenBalances, type WalletEvent } from './events'

export interface LightningSendWatch {
  requestId: string
  session: {
    mnemonic: string
    accountNumber?: number
    network?: 'MAINNET' | 'REGTEST'
  }
  intervalMs?: number
  signal?: AbortSignal
  onStatus: (status: string) => void
}

export interface WalletRealtimeSources {
  /** Nest `GET /api/wallet/events` (or the partner stream). */
  subscribeCashier?: (onEvent: (event: unknown) => void) => () => void
  /**
   * Spark `token-balance:update` for a seed this process holds.
   * Resolves when the stream is up. Rejects on init failure.
   */
  subscribeTokenBalances?: (
    listener: (balances: TokenBalances) => void,
  ) => Promise<() => Promise<void>>
  /** Shared with the caller's `getBalance()` so a stale cache cannot win. */
  guard?: BalanceApplyGuard
}

const TERMINAL_LIGHTNING_SEND = new Set([
  'TRANSFER_COMPLETED',
  'LIGHTNING_PAYMENT_SUCCEEDED',
  'TRANSFER_FAILED',
  'LIGHTNING_PAYMENT_FAILED',
])

/**
 * One subscription over the Spark token stream and the Nest cashier SSE.
 * Spark events are hints: `nudge` and `balance.updated` never credit.
 * Outgoing Lightning sends are polled — the Spark SDK does not emit them.
 */
export class WalletRealtime {
  private readonly guard: BalanceApplyGuard

  constructor(private readonly sources: WalletRealtimeSources = {}) {
    this.guard = sources.guard ?? createBalanceApplyGuard()
  }

  get balanceGuard(): BalanceApplyGuard {
    return this.guard
  }

  subscribe(listener: (event: WalletEvent) => void): () => void {
    const stops: Array<() => void> = []
    let cancelled = false

    if (this.sources.subscribeCashier) {
      stops.push(
        this.sources.subscribeCashier((raw) => {
          const event = toWalletEvent(raw)
          if (event) listener(event)
        }),
      )
    }

    if (this.sources.subscribeTokenBalances) {
      void this.sources
        .subscribeTokenBalances((balances) => {
          if (cancelled || this.guard.blocked()) return
          listener({ type: 'balance.updated', tokenBalances: balances })
        })
        .then((stop) => {
          if (cancelled) {
            void stop()
            return
          }
          stops.push(() => {
            void stop()
          })
          listener({ type: 'stream.connected' })
        })
        .catch((error: unknown) => {
          if (cancelled) return
          listener({
            type: 'stream.disconnected',
            reason: error instanceof Error ? error.message : String(error),
          })
        })
    }

    return () => {
      cancelled = true
      for (const stop of stops) stop()
    }
  }

  /**
   * Poll `getLightningSendRequest` until a terminal status or abort.
   * Loads `@zappimoney/zappi-sdk/sign` only when called.
   */
  watchLightningSend(input: LightningSendWatch): Promise<void> {
    return pollLightningSend(input)
  }
}

async function pollLightningSend(input: LightningSendWatch): Promise<void> {
  const load = new Function(
    'specifier',
    'return import(specifier)',
  ) as (specifier: string) => Promise<{
    withHeldSparkWallet: <T>(
      opts: LightningSendWatch['session'],
      fn: (wallet: {
        getLightningSendRequest: (id: string) => Promise<{ status?: string } | null>
      }) => Promise<T>,
    ) => Promise<T>
  }>
  const { withHeldSparkWallet } = await load('@zappimoney/zappi-sdk/sign')
  const intervalMs = input.intervalMs ?? 4_000
  const requestId = input.requestId.trim()
  if (!requestId) {
    throw new Error('requestId is required')
  }

  for (;;) {
    if (input.signal?.aborted) return
    const status = await withHeldSparkWallet(input.session, async (wallet) => {
      const request = await wallet.getLightningSendRequest(requestId)
      return request?.status ? String(request.status) : ''
    })
    if (status) input.onStatus(status)
    if (status && TERMINAL_LIGHTNING_SEND.has(status)) return
    await delay(intervalMs, input.signal)
    if (input.signal?.aborted) return
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
