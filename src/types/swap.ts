/**
 * Raw zappi-nest swap / deposit-into-BTC shapes.
 * Source: `server/src/wallet/swap/dto/swap.dto.ts`.
 */

export type NestSwapDirection = 'usdb_to_btc' | 'btc_to_usdb'
export type NestSwapPurpose = 'swap' | 'deposit_btc'
export type NestSwapSendKind = 'usdb' | 'sats' | 'on_chain'

export interface NestSwapRoutePair {
  sourceChain: string
  sourceAsset: string
  destinationChain: string
  destinationAsset: string
}

export interface NestSwapRoutesResponse {
  ok: true
  inVault: NestSwapRoutePair[]
  depositIntoBtc: NestSwapRoutePair[]
}

export interface NestCreateSwapBody {
  direction: NestSwapDirection
  amountCents?: number
  amountSats?: number
  idempotencyKey: string
  sparkTxHash?: string
}

export interface NestCreateDepositBtcBody {
  sourceChain: string
  sourceAsset: string
  amount?: string
  amountCents?: number
  amountSats?: number
  idempotencyKey: string
  sparkTxHash?: string
  sourceTxHash?: string
}

export interface NestSwapExecuteResponse {
  ok: true
  swapId: string
  purpose: NestSwapPurpose
  status: string
  sourceChain: string
  sourceAsset: string
  destinationChain: string
  destinationAsset: string
  amountIn: string
  amountOut?: string | null
  quoteId?: string | null
  orderId?: string | null
  sparkTxHash?: string | null
  sourceTxHash?: string | null
  needsSignature?: boolean
  needsDeposit?: boolean
  depositAddress?: string | null
  tokenIdentifier?: string | null
  sparkAddress?: string | null
  accountNumber?: number | null
  sendAmount?: string | null
  sendKind?: NestSwapSendKind
  quoteExpiresAt?: string | null
  feeAttached: boolean
  feeRejected: boolean
  failureReason?: string | null
}

export interface NestSwapStatusResponse {
  ok: true
  swapId: string
  status: string
  purpose: NestSwapPurpose
  quoteId?: string | null
  orderId?: string | null
  sparkTxHash?: string | null
  sourceTxHash?: string | null
  quoteExpiresAt?: string | null
  feeAttached: boolean
  feeRejected: boolean
  failureReason?: string | null
}
