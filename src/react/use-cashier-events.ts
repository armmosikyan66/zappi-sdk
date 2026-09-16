import { useEffect, useRef, useState } from 'react'
import { useZappiClient } from './context'
import type { CashierEvent } from '../types/transaction'

export interface UseCashierEventsResult {
  /** Most recent event received, or null. */
  lastEvent: CashierEvent | null
  /** All events received since mount. */
  events: CashierEvent[]
  /** Connection error, if any. */
  error: Error | null
}

/**
 * Subscribe to the unified cashier event stream (`GET /api/wallet/events` SSE).
 * Returns the latest event plus the full buffer. The subscription is opened on
 * mount and closed on unmount; the SDK's `subscribeCashierEvents` uses fetch
 * streaming (not EventSource) so it can attach the auth headers.
 *
 * Per Vercel React best practices 4.1, the underlying listener is owned by
 * the client; this hook just attaches a per-component callback. Callers that
 * want a single shared stream should wrap a single `useCashierEvents` at the
 * root and pass events down via context.
 */
export function useCashierEvents(): UseCashierEventsResult {
  const client = useZappiClient()
  const [lastEvent, setLastEvent] = useState<CashierEvent | null>(null)
  const [events, setEvents] = useState<CashierEvent[]>([])
  const [error, setError] = useState<Error | null>(null)
  const eventsRef = useRef<CashierEvent[]>([])

  useEffect(() => {
    const unsubscribe = client.subscribeCashierEvents(
      (event) => {
        const cashierEvent = event as CashierEvent
        setLastEvent(cashierEvent)
        eventsRef.current = [...eventsRef.current, cashierEvent]
        setEvents(eventsRef.current)
      },
      (err) => setError(err),
    )
    return unsubscribe
  }, [client])

  return { lastEvent, events, error }
}
