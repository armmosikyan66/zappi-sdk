import type { BtcNetwork, NetworkId, StableNetwork, WithdrawCombo } from './cashier'

export interface WithdrawNetworkOption<N extends NetworkId> {
  id: N
  name: string
  minWithdrawCents?: number
  maxWithdrawCents?: number
  typicalFeeCopy?: string
  estimatedArrivalCopy: string
}

/** Withdraw catalog. ETH is not withdrawable today (only depositable). */
export type WithdrawOption =
  | { asset: 'btc'; networks: ReadonlyArray<WithdrawNetworkOption<BtcNetwork>> }
  | { asset: 'usdc' | 'usdt'; networks: ReadonlyArray<WithdrawNetworkOption<StableNetwork>> }

export interface WithdrawalRequest {
  combo: WithdrawCombo
  /** On-chain destination (mainnet / stables). Omit when `bolt11` is set. */
  destinationAddress?: string
  /** Lightning BOLT11 for Spark `payLightningInvoice`. Mutually exclusive with `destinationAddress`. */
  bolt11?: string
  amountSats?: number
  amountCents?: number
}

/**
 * Fee / net preview while the user edits amount. Same pricing sources as
 * {@link WithdrawalQuote} but no `quoteId`, no TTL, and not persisted — safe
 * to call on debounced keystrokes. Backend: Spark fee estimate / Orchestra
 * simulate (not the commit quote).
 */
export interface WithdrawalEstimate {
  combo: WithdrawCombo
  grossAmountSats?: number
  grossAmountCents?: number
  networkFeeSats?: number
  networkFeeCents?: number
  netReceivedSats?: number
  netReceivedCents?: number
  maxWithdrawableSats?: number
  maxWithdrawableCents?: number
  estimatedArrivalCopy?: string
}

/**
 * Quote returned before confirm. Backend sources:
 * - BTC mainnet: Spark `getWithdrawalFeeQuote`.
 * - BTC Lightning: Spark `getLightningSendFeeEstimate` + decoded invoice amount.
 * - Stables: Orchestra `POST /v1/orchestration/quote` off-ramp (USDB → chain).
 */
export interface WithdrawalQuote {
  quoteId: string
  combo: WithdrawCombo
  destinationDisplay: string
  grossAmountSats?: number
  grossAmountCents?: number
  networkFeeSats?: number
  networkFeeCents?: number
  netReceivedSats?: number
  netReceivedCents?: number
  maxWithdrawableSats?: number
  maxWithdrawableCents?: number
  estimatedArrivalCopy: string
  expiresAt: string
}

export interface WithdrawalConfirmation {
  withdrawalId: string
  status: WithdrawalStatusValue
  /** Client must sign Spark USDB to depositAddress, then confirm again. */
  needsSignature?: boolean
  depositAddress?: string | null
  tokenIdentifier?: string | null
  sparkAddress?: string | null
  accountNumber?: number | null
  sendAmount?: string | null
}

export type WithdrawalStatusValue = 'pending' | 'completed' | 'failed'

export interface WithdrawalStatus {
  id: string
  combo: WithdrawCombo
  destinationDisplay: string
  status: WithdrawalStatusValue
  grossAmountSats?: number
  grossAmountCents?: number
  networkFeeSats?: number
  networkFeeCents?: number
  estimatedArrivalCopy: string
  explorerUrl?: string
  failureReasonCopy?: string
}

export type WithdrawEvent =
  | {
      kind: 'submitted'
      withdrawalId: string
      transactionId: string
      combo: WithdrawCombo
      amountSats?: number
      amountCents?: number
    }
  | {
      kind: 'completed'
      withdrawalId: string
      transactionId: string
    }
  | {
      kind: 'failed'
      withdrawalId: string
      transactionId: string
      reasonCopy: string
    }

/** Result of decoding a BOLT11 invoice. */
export interface DecodedLightningInvoice {
  valid: boolean
  amountSats?: number
  expiresAt?: string
  errorCopy?: string
}

/** Result of validating a destination address against a network. */
export interface AddressValidationResult {
  valid: boolean
  normalized?: string
  errorCopy?: string
  detectedFamily?: AddressFamily | null
  expectedFamily?: AddressFamily | null
}

/** Address family used by the address detector. */
export type AddressFamily =
  | 'spark'
  | 'solana'
  | 'tron'
  | 'evm'
  | 'bitcoin'
  | 'lightning'
