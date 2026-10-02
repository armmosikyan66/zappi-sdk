import type { DepositEvent } from '../types/deposit'
import type { TransferEvent } from '../types/transaction'
import type { WithdrawEvent } from '../types/withdraw'

export type TokenBalanceAmounts = {
  ownedBalance: string
  availableToSendBalance: string
}

export type TokenBalances = Record<string, TokenBalanceAmounts>

export type NudgeReason = 'transfer' | 'deposit' | 'resume'

/**
 * One normalized event for Spark token streams and Nest cashier SSE.
 * `nudge` means refetch. It is never a balance or a credit.
 */
export type WalletEvent =
  | { type: 'balance.updated'; tokenBalances: TokenBalances }
  | {
      type: 'nudge'
      reason: NudgeReason
      sparkId: string
      eventId?: string
      occurredAt?: string
    }
  | { type: 'deposit.pending'; event: DepositEvent }
  | { type: 'deposit.confirmed'; event: DepositEvent }
  | { type: 'transfer.received'; event: TransferEvent }
  | { type: 'transfer.sent'; event: TransferEvent }
  | { type: 'withdraw.submitted'; event: WithdrawEvent }
  | { type: 'withdraw.completed'; event: WithdrawEvent }
  | { type: 'withdraw.failed'; event: WithdrawEvent }
  | { type: 'stream.connected' }
  | { type: 'stream.disconnected'; reason: string }
  | {
      type: 'stream.reconnecting'
      attempt: number
      maxAttempts: number
      delayMs: number
      error: string
    }

const NUDGE_REASONS = new Set<NudgeReason>(['transfer', 'deposit', 'resume'])

/** Map a Nest SSE payload into a wallet event. Unknown shapes return null. */
export function toWalletEvent(raw: unknown): WalletEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const kind = record.kind
  if (typeof kind !== 'string') return null

  if (kind === 'nudge') {
    if (record.nudge !== true) return null
    const reason = record.reason
    if (typeof reason !== 'string' || !NUDGE_REASONS.has(reason as NudgeReason)) {
      return null
    }
    return {
      type: 'nudge',
      reason: reason as NudgeReason,
      sparkId: typeof record.transactionId === 'string' ? record.transactionId : '',
      ...(typeof record.eventId === 'string' ? { eventId: record.eventId } : {}),
      ...(typeof record.occurredAt === 'string' ? { occurredAt: record.occurredAt } : {}),
    }
  }

  if (kind === 'pending' || kind === 'credited') {
    if (typeof record.transactionId !== 'string' || typeof record.asset !== 'string') {
      return null
    }
    const event = raw as DepositEvent
    return kind === 'pending'
      ? { type: 'deposit.pending', event }
      : { type: 'deposit.confirmed', event }
  }

  if (
    kind === 'transfer_sent' ||
    kind === 'transfer_received' ||
    kind === 'spark_sent' ||
    kind === 'spark_received'
  ) {
    if (typeof record.transactionId !== 'string') return null
    const event = raw as TransferEvent
    return kind === 'transfer_sent' || kind === 'spark_sent'
      ? { type: 'transfer.sent', event }
      : { type: 'transfer.received', event }
  }

  if (kind === 'submitted' || kind === 'completed' || kind === 'failed') {
    if (typeof record.withdrawalId !== 'string' && typeof record.transactionId !== 'string') {
      return null
    }
    const event = raw as WithdrawEvent
    if (kind === 'submitted') return { type: 'withdraw.submitted', event }
    if (kind === 'completed') return { type: 'withdraw.completed', event }
    return { type: 'withdraw.failed', event }
  }

  return null
}

export function isNudgeEvent(
  event: WalletEvent,
): event is Extract<WalletEvent, { type: 'nudge' }> {
  return event.type === 'nudge'
}
