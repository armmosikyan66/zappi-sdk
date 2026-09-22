/**
 * Raw zappi-nest ledger response shapes. Source:
 * `server/src/wallet/ledger/dto/ledger.dto.ts`.
 *
 * The clean frontend `Transaction` discriminated union lives in
 * `./transaction.ts`; the BFF maps these raw rows to it. Partners/CLI that
 * talk to nest directly consume these raw shapes.
 */

export type LedgerTransactionType =
  | 'deposit'
  | 'withdraw'
  | 'withdraw_refund'
  | 'transfer_out'
  | 'transfer_in'
  | 'sweep_out'
  | 'spark_send_out'
  | 'spark_receive_in'
  | 'lightning_receive'

export type LedgerTransactionStatus = 'completed' | 'pending' | 'failed'

export interface LedgerOrchestrationStage {
  name: string
  label: string
  status: string
  completedAt: string | null
}

export interface LedgerTransactionOrchestration {
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
  stages: LedgerOrchestrationStage[]
}

export interface LedgerTransaction {
  id: string
  type: LedgerTransactionType
  currency: 'usd'
  status: LedgerTransactionStatus
  amountCents: number
  occurredAt: string
  combo?: { asset: string; network: string }
  direction?: 'sent' | 'received'
  counterpartyLabel?: string
  counterpartyUserId?: string
  contactId?: string
  sourceProjectName?: string
  transferId?: string
  sourceCustody?: 'user-held'
  withdrawalId?: string
  flashnetOrderId?: string
  sparkTxHash?: string
  orchestration?: LedgerTransactionOrchestration
}

export interface NestListTransactionsResponse {
  ok: true
  transactions: LedgerTransaction[]
}

export interface NestTransactionDetailResponse {
  ok: true
  transaction: LedgerTransaction
}
