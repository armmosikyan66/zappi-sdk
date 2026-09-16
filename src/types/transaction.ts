import type { AccountCurrency, CashierCombo } from './cashier'
import type { DepositEvent } from './deposit'
import type { WithdrawEvent } from './withdraw'

/** In-app P2P transfer. Custodial USDB stays in the Spark vault; nest moves ledgers. */
export interface TransferEvent {
  kind:
    | 'transfer_sent'
    | 'transfer_received'
    | 'spark_sent'
    | 'spark_received'
  transactionId: string
  amountCents: number
  counterpartyLabel?: string
  status?: 'pending' | 'completed' | 'failed'
}

export type CashierEvent = DepositEvent | WithdrawEvent | TransferEvent

export type TransactionStatus = 'completed' | 'pending' | 'failed'

interface BaseTransaction {
  id: string
  status: TransactionStatus
  occurredAt: string
  /** On/off-ramp rail for deposit and withdrawal rows. Absent on reward/transfer. */
  combo?: CashierCombo
  /** Present on withdrawal rows that map to `/cashier/withdraw/[id]`. */
  withdrawalId?: string
  /** Source integration name for partner end-user deposits. */
  sourceProjectName?: string
  /** Orchestra on/off-ramp receipt. Loaded on the detail endpoint; list rows omit it. */
  orchestration?: TransactionOrchestration
}

export interface TransactionOrchestrationStage {
  name: string
  label: string
  status: string
  completedAt: string | null
}

export interface TransactionOrchestration {
  orderId: string | null
  quoteId: string | null
  status: string | null
  sourceChain: string | null
  sourceAsset: string | null
  destinationChain: string | null
  destinationAsset: string | null
  amountIn: string | null
  amountOut: string | null
  sourceDecimals: number
  destinationDecimals: number
  sourceTxHash: string | null
  destinationTxHash: string | null
  sparkTxHash: string | null
  sourceExplorerUrl: string | null
  destinationExplorerUrl: string | null
  createdAt: string | null
  completedAt: string | null
  stages: TransactionOrchestrationStage[]
}

export interface LedgerTransactionBtc extends BaseTransaction {
  type: 'deposit' | 'withdrawal' | 'reward' | 'refund'
  currency: 'btc'
  amountSats: number
}

export interface LedgerTransactionUsd extends BaseTransaction {
  type: 'deposit' | 'withdrawal' | 'reward' | 'refund'
  currency: 'usd'
  amountCents: number
}

export interface TransferTransactionBtc extends BaseTransaction {
  type: 'transfer'
  direction: 'sent' | 'received'
  currency: 'btc'
  amountSats: number
  counterpartyLabel: string
  contactId?: string
}

export interface TransferTransactionUsd extends BaseTransaction {
  type: 'transfer'
  direction: 'sent' | 'received'
  currency: 'usd'
  amountCents: number
  counterpartyLabel: string
  contactId?: string
}

/**
 * Transactions are a **discriminated union**, not a single shape with optional
 * amount fields. Every row is a single-currency ledger event — exactly one of
 * `amountSats` / `amountCents` is present, matching `currency`. The union
 * prevents the "currency says btc but the amount is in cents" footgun.
 */
export type Transaction =
  | LedgerTransactionBtc
  | LedgerTransactionUsd
  | TransferTransactionBtc
  | TransferTransactionUsd

export type TransactionType = Transaction['type']

/** Contact (P2P transfer recipient) — used by the internal send flow. */
export interface Contact {
  id: string
  userId: string
  displayName: string
  username: string
  addedAt: string
}

export interface ContactTransferInput {
  userId: string
  contactId?: string
  currency: AccountCurrency
  amountSats?: number
  amountCents?: number
  memo?: string
  idempotencyKey: string
  saveContact?: boolean
  /** Passkey Nest token (`X-Zappi-Authorization`). Omit / null for no-passkey. */
  authorizationToken?: string | null
}

export interface ContactTransferConfirmation {
  transferId: string
  transactionId: string
  status: 'completed' | 'pending' | 'failed'
}
