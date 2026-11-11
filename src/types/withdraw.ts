import type { BtcNetwork, NetworkId, StableNetwork, WithdrawCombo } from './cashier'

export interface WithdrawNetworkOption<N extends NetworkId> {
  id: N
  name: string
  minWithdrawCents?: number
  maxWithdrawCents?: number
  /** Source smallest units that still clear the rail. Sats for Bitcoin. */
  minAmountSmallest?: string
  typicalFeeCopy?: string
  estimatedArrivalCopy: string
  /**
   * Learned fee rate in basis points. Verified USDC and USDT rows only.
   * Indicative: the confirm-time estimate is the fee that binds.
   */
  feeBps?: number
  /** Minimum fee in USD cents for `feeBps`. */
  feeMinCents?: number
  /** All-in fee at `minimumGrossCents`, in cents. */
  feeCents?: number
  /** Estimated arrival when `minimumGrossCents` is sent, in cents. */
  netCents?: number
  /** Smallest send whose net still clears the floor, in cents. */
  minimumGrossCents?: number
  /** Address family. EVM chains share one family. */
  family?: 'spark' | 'solana' | 'tron' | 'evm' | 'bitcoin' | 'lightning'
}

export type UsdbWithdrawNetwork = 'lightning' | 'spark'

export interface UsdbWithdrawNetworkOption {
  id: UsdbWithdrawNetwork
  name: string
  minWithdrawCents?: number
  maxWithdrawCents?: number
  /** Source smallest units that still clear the rail. Sats for Bitcoin. */
  minAmountSmallest?: string
  typicalFeeCopy?: string
  estimatedArrivalCopy: string
  feeCents?: number
  netCents?: number
  minimumGrossCents?: number
  family?: 'spark' | 'solana' | 'tron' | 'evm' | 'bitcoin' | 'lightning'
}

/** Withdraw catalog. ETH is not withdrawable today (only depositable). */
export type WithdrawOption =
  | { asset: 'btc'; networks: ReadonlyArray<WithdrawNetworkOption<BtcNetwork>> }
  | { asset: 'usdb'; networks: ReadonlyArray<UsdbWithdrawNetworkOption> }
  | { asset: 'usdc' | 'usdt'; networks: ReadonlyArray<WithdrawNetworkOption<StableNetwork>> }

export interface WithdrawalRequest {
  combo: WithdrawCombo
  /** On-chain destination (mainnet / stables). Omit when `bolt11` is set. */
  destinationAddress?: string
  /** Lightning BOLT11 for Spark `payLightningInvoice`. Mutually exclusive with `destinationAddress`. */
  bolt11?: string
  amountSats?: number
  /** Gross spend in USD cents. Mutually exclusive with `receiveCents`. */
  amountCents?: number
  /**
   * Amount the recipient should get, in USD cents. The estimate solves the
   * gross (`amountCents` on the response) required to deliver it.
   * Mutually exclusive with `amountCents`.
   */
  receiveCents?: number
  /**
   * Spendable balance in USD cents. When set, the estimate includes
   * `maxReceiveCents` priced by the same fee.
   */
  balanceCents?: number
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
  /** The receive amount the caller asked for, when solved from `receiveCents`. */
  requestedReceiveCents?: number
  /**
   * False when the fee cannot be priced exactly yet, or rounding leaves the
   * destination with slightly more than requested.
   */
  receiveExact?: boolean
  /** Largest receivable amount if `balanceCents` is spent in full. */
  maxReceiveCents?: number
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
