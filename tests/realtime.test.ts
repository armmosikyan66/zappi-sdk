import { describe, expect, it } from 'vitest'
import { createBalanceApplyGuard } from '../src/realtime/balance-guard'
import { toWalletEvent } from '../src/realtime/events'
import { WalletRealtime } from '../src/realtime/wallet-realtime'

describe('toWalletEvent', () => {
  it('maps a Spark nudge to a refetch and not a balance', () => {
    const event = toWalletEvent({
      kind: 'nudge',
      nudge: true,
      reason: 'transfer',
      transactionId: 'spark-tx-1',
      amountCents: 0,
      eventId: 'nudge:transfer:spark-tx-1',
    })
    expect(event).toEqual({
      type: 'nudge',
      reason: 'transfer',
      sparkId: 'spark-tx-1',
      eventId: 'nudge:transfer:spark-tx-1',
    })
    expect(event?.type).not.toBe('balance.updated')
  })

  it('rejects a nudge that is not explicitly marked', () => {
    expect(
      toWalletEvent({ kind: 'nudge', reason: 'deposit', transactionId: 'dep-1' }),
    ).toBeNull()
  })

  it('maps cashier credits and sends', () => {
    expect(
      toWalletEvent({
        kind: 'credited',
        transactionId: 'tx-1',
        asset: 'usdc',
        network: 'base',
        amountCents: 100,
      })?.type,
    ).toBe('deposit.confirmed')
    expect(
      toWalletEvent({
        kind: 'spark_sent',
        transactionId: 'tx-2',
        amountCents: 50,
      })?.type,
    ).toBe('transfer.sent')
  })
})

describe('WalletRealtime', () => {
  it('drops token snapshots while the balance guard is blocked', async () => {
    const guard = createBalanceApplyGuard()
    guard.block(60_000)
    const seen: string[] = []
    const push: {
      current:
        | ((
            balances: Record<
              string,
              { ownedBalance: string; availableToSendBalance: string }
            >,
          ) => void)
        | null
    } = { current: null }
    const realtime = new WalletRealtime({
      guard,
      subscribeTokenBalances: async (listener) => {
        push.current = listener
        return async () => {}
      },
    })
    const stop = realtime.subscribe((event) => {
      seen.push(event.type)
    })
    await new Promise((resolve) => setImmediate(resolve))
    push.current?.({
      btkn1: { ownedBalance: '1', availableToSendBalance: '1' },
    })
    guard.reset()
    push.current?.({
      btkn1: { ownedBalance: '2', availableToSendBalance: '2' },
    })
    stop()
    expect(seen).toEqual(['stream.connected', 'balance.updated'])
  })

  it('forwards cashier nudges and ignores unknown payloads', () => {
    const seen: string[] = []
    const emit: { current: ((event: unknown) => void) | null } = { current: null }
    const realtime = new WalletRealtime({
      subscribeCashier: (onEvent) => {
        emit.current = onEvent
        return () => {}
      },
    })
    const stop = realtime.subscribe((event) => {
      seen.push(event.type)
    })
    emit.current?.({ kind: 'not-a-thing' })
    emit.current?.({
      kind: 'nudge',
      nudge: true,
      reason: 'resume',
      transactionId: '',
    })
    stop()
    expect(seen).toEqual(['nudge'])
  })
})
