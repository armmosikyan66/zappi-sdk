/**
 * Raw zappi-nest response shapes. The BFF maps these to the clean frontend
 * types in `./deposit.ts` and `./withdraw.ts`. Partners that talk to nest
 * directly (e.g. BitKong) can consume these to avoid hand-rolling DTOs.
 *
 * Source: `server/src/wallet/<feature>/dto/*.dto.ts` and `web/lib/cashier/nest-*-map.ts`.
 */

/* --------------------------------- Deposit -------------------------------- */

export interface NestDepositNetworkOption {
  id: string
  name: string
  typicalFeeCopy?: string
  estimatedArrivalCopy: string
  minDepositCents?: number
  limitCopy?: string
}

export interface NestDepositAssetOption {
  asset: string
  networks: NestDepositNetworkOption[]
}

export interface NestDepositOptionsResponse {
  ok: true
  options: NestDepositAssetOption[]
}

export interface NestDepositAddressRequest {
  sourceChain: string
  sourceAsset: string
  destinationAsset?: string
  sourceToken?: string
  recipientSparkAddress?: string
}

/** Live Orchestra source token from nest `sourceToken`. Used for EIP-681. */
export interface NestOrchestraSourceToken {
  chainId: number | null
  contractAddress: string | null
  decimals: number | null
}

/** `POST /api/wallet/accumulation-address` body (project-key partner route). */
export interface NestAccumulationAddressRequest {
  userId: string
  sourceChain: string
  sourceAsset: string
  destinationAsset: string
  recipientSparkAddress?: string
  nativeReference?: string
  label?: string
  idempotencyKey?: string
  feeBps?: number
  slippageBps?: number
}

export interface NestAccumulationAddressResponse {
  ok: true
  accumulationAddressId: string
  depositAddress: string
  recipientSparkAddress: string
  sourceChain: string
  sourceAsset: string
  destinationAsset: string
  sourceToken?: NestOrchestraSourceToken | null
  /** Flattened aliases some BFF mappers historically used. */
  tokenContract?: string | null
  chainId?: number | null
  tokenDecimals?: number | null
}

/** `POST /api/wallet/liquidation-address` body (project-key partner route). */
export interface NestLiquidationAddressRequest {
  userId?: string
  nativeReference: string
  destinationAsset: string
  destinationAddress?: string
  destinationChain?: string
  idempotencyKey?: string
}

export interface NestLiquidationAddressResponse {
  ok: true
  addressId: string
  depositAddress: string
  destinationChain: string
  destinationAsset: string
  destinationAddress: string
}

/** `POST /api/wallet/standing-deposit-address` body (project-key partner route). */
export interface NestStandingDepositAddressRequest {
  userId: string
  /** Source chain the caller wants a deposit address for. The instruction spans all eligible chains. */
  sourceChain: string
  destinationAsset?: string
  destinationChain?: string
  destinationAddress?: string
  feeBps?: number
  slippageBps?: number
  refundAddresses?: Record<string, string>
  nativeReference?: string
  idempotencyKey?: string
}

export interface NestStandingDepositAddressResponse {
  ok: true
  mode: 'cached' | 'created'
  created: boolean
  projectId: string
  /** Customer reference sent to Flashnet. Stable per (project, user, destination). */
  ref: string
  destinationChain: string
  destinationAsset: string
  destinationAddress: string
  /** Per-source-chain deposit addresses from Flashnet. */
  addresses: Record<string, string>
  /** Address for the requested sourceChain (convenience). */
  depositAddress: string
  sourceChain: string
  enabled: boolean
  slippageBps?: number
  feeBps?: number
  sourceToken?: NestOrchestraSourceToken | null
  /** Flattened aliases some BFF mappers historically used. */
  tokenContract?: string | null
  chainId?: number | null
  tokenDecimals?: number | null
}

/** A single standing deposit row from `GET /api/wallet/standing-deposit-address/deposits`. */
export interface NestStandingDepositDto {
  depositId: string
  status: string
  code?: string | null
  orderId?: string | null
  batchId?: string | null
  amount?: string | null
  sourceChain?: string | null
  sourceAsset?: string | null
  zeroconfOffer?: {
    id?: string | null
    status?: string | null
    expiresAt?: string | null
    depositSats?: string | null
    feeSats?: string | null
    creditSats?: string | null
  } | null
  updatedAt?: string | null
}

export interface NestListStandingDepositsResponse {
  ok: true
  deposits: NestStandingDepositDto[]
  nextOffset: number | null
}

/** `PATCH /api/wallet/standing-deposit-address` body. */
export interface NestPatchStandingDepositAddressRequest {
  userId: string
  enabled: boolean
  idempotencyKey?: string
}

/** `POST /api/wallet/standing-deposit-address/resolve` body. */
export interface NestResolveStandingDepositsRequest {
  userId: string
  /** 1..200 held deposit ids (same address and asset; Bitcoin: exactly one). */
  depositIds?: string[]
  /** Alternative to depositIds: refund a whole batch. */
  batchId?: string
  refundAddress: string
  idempotencyKey?: string
}

export interface NestResolveStandingDepositsResponse {
  ok: true
  batchId: string | null
  status: string
}


/** `POST /api/partner/wallet/lightning-address` response. */
export interface NestPartnerLightningAddressResponse {
  ok: true
  address: string
  username: string
  domain: string
  enabled: boolean
  lnurl: string
}

/* -------------------------------- Withdraw -------------------------------- */

export interface NestWithdrawNetworkOption {
  id: string
  name: string
  typicalFeeCopy?: string
  estimatedArrivalCopy: string
  minWithdrawCents?: number
  maxWithdrawCents?: number
}

export interface NestWithdrawAssetOption {
  asset: string
  networks: NestWithdrawNetworkOption[]
}

export interface NestWithdrawalOptionsResponse {
  ok: true
  options: NestWithdrawAssetOption[]
}

export interface NestWithdrawEstimateResponse {
  ok: true
  asset: string
  networkId: string
  amountCents: number
  amountUsdb: string
  feeCents?: number | null
  receiveCents?: number | null
  feeBps?: number | null
  feeAsset?: string | null
  feeUsd?: string | null
  estimatedOut?: string | null
}

/**
 * Nest `POST /api/wallet/send/external` body (session route) and
 * `POST /api/partner/wallet/withdraw` body (project-key route). The second
 * phase retries the same endpoint with `sparkTxHash` after the client signs.
 */
export interface NestWithdrawBody {
  asset: string
  networkId: string
  address: string
  amountCents: number
  destinationType: 'external'
  idempotencyKey: string
  sparkTxHash?: string
}

/**
 * `POST /api/partner/wallet/withdraw` body. Nest identifies the product
 * wallet from the project API key and the partner user from `userId`.
 * Do not send `destinationType` — the partner DTO rejects unknown fields.
 */
export interface NestPartnerWithdrawBody {
  userId: string
  asset: string
  networkId: string
  address: string
  amountCents: number
  idempotencyKey: string
  sparkTxHash?: string
}

export interface NestWithdrawExecuteResponse {
  ok: true
  success: true
  withdrawId?: string
  userId: string
  asset: string
  networkId: string
  address: string
  amountCents: number
  amountUsdb: string
  quoteId?: string | null
  orderId?: string | null
  sparkTxHash?: string | null
  status: string
  balanceUsdb?: string | null
  sourceCustody?: 'user-held'
  needsSignature?: boolean
  depositAddress?: string | null
  tokenIdentifier?: string | null
  sparkAddress?: string | null
  accountNumber?: number | null
  sendAmount?: string | null
}

export interface NestWithdrawStatusResponse {
  ok: true
  withdrawId: string
  status: string
  quoteId?: string | null
  orderId?: string | null
  sparkTxHash?: string | null
  asset?: string | null
  networkId?: string | null
  address?: string | null
  amountCents?: number | null
  failureReason?: string | null
}

/* -------------------------------- Transfer -------------------------------- */

export interface NestSendInternalBody {
  userId: string
  currency: 'btc' | 'usd'
  amountSats?: number
  amountCents?: number
  memo?: string
  idempotencyKey: string
  saveContact?: boolean
}

export interface NestSendInternalResponse {
  ok: true
  transferId: string
  transactionId: string
  status: 'completed' | 'pending' | 'failed'
}
