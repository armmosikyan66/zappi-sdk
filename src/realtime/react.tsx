import { useEffect, useState } from 'react'
import type { CreateWalletSignerOptions } from '../sign/wallet-signer-port'
import { useZappiClient } from '../react/context'
import type { WalletEvent } from './events'
import { WalletRealtime } from './wallet-realtime'

export interface UseWalletRealtimeOptions {
  /** When set, subscribe to Spark token balances for this seed. */
  session?: CreateWalletSignerOptions | null
}

export interface UseWalletRealtimeResult {
  lastEvent: WalletEvent | null
  connected: boolean
}

/**
 * Cashier SSE plus an optional Spark token stream.
 * Requires `<ZappiClientProvider>`. A `nudge` is a refetch hint, not a credit.
 */
export function useWalletRealtime(
  options: UseWalletRealtimeOptions = {},
): UseWalletRealtimeResult {
  const client = useZappiClient()
  const session = options.session ?? null
  const [lastEvent, setLastEvent] = useState<WalletEvent | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const realtime = new WalletRealtime({
      subscribeCashier: (onEvent) => client.subscribeCashierEvents(onEvent),
      subscribeTokenBalances: session
        ? async (listener) => {
            const { subscribeWalletTokenBalances } = await import('../sign/index.ts')
            return subscribeWalletTokenBalances(session, listener)
          }
        : undefined,
    })
    return realtime.subscribe((event) => {
      setLastEvent(event)
      if (event.type === 'stream.connected') setConnected(true)
      if (event.type === 'stream.disconnected') setConnected(false)
    })
  }, [client, session])

  return { lastEvent, connected }
}
