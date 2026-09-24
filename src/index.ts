/**
 * @zappi/sdk — Zappi deposit/withdraw contract, API client, webhook
 * verification, and two-phase withdraw orchestrator.
 *
 * Optional subpaths:
 * - `@zappi/sdk/sign` — Zappi wallet USDB signer (peer: `@buildonspark/spark-sdk`)
 * - `@zappi/sdk/react` — React Query hooks (peer: `react`, `@tanstack/react-query`)
 */

/* --------------------------------- types --------------------------------- */
export * from './types'

/* -------------------------------- constants ------------------------------- */
export {
  NETWORK_TO_CHAIN,
  ASSET_TO_FLASHNET,
  USDB_UNITS_PER_CENT,
  SOURCE_CUSTODY_CUSTODIAL,
  SOURCE_CUSTODY_WALLET,
  WITHDRAW_STATUS_AWAITING_SIGNATURE,
  PRODUCT_WALLET_ACCOUNT_NUMBER,
  DEFAULT_WALLET_NETWORK,
  DEFAULT_WEBHOOK_TOLERANCE_MS,
  WITHDRAW_QUOTE_TTL_MS,
  QUOTE_TOKEN_VERSION,
  FALLBACK_ARRIVAL,
  withdrawArrivalCopy,
  ZAPPI_DEVICE_CODE_HEADER,
  POT_ATTACH_RECLAIM_METHOD,
  potAttachReclaimPath,
} from './constants'

/* --------------------------------- amounts -------------------------------- */
export {
  BtcUsdRate,
  MissingBtcRateError,
  btcSatsToUsdCents,
  usdCentsToBtcSats,
  centsToUsdbUnits,
  usdbUnitsToCents,
  formatUsdCents,
  formatSats,
} from './amounts'

/* ---------------------------------- combo --------------------------------- */
export {
  CASHIER_ASSETS,
  BTC_NETWORKS,
  STABLE_NETWORKS,
  ALL_CASHIER_NETWORKS,
  isCashierAsset,
  isCashierNetwork,
  isBtcNetwork,
  isStableNetwork,
  isStableAsset,
  isValidCashierCombo,
  buildCashierCombo,
  resolveCashierCombo,
  parseCashierCombo,
  isBtcCombo,
  isStableCombo,
} from './combo'

/* ------------------------------ address detect ----------------------------- */
export {
  NETWORK_FAMILY,
  NETWORKS_BY_FAMILY,
  familyForNetworkId,
  uniqueNetworkForFamily,
  isAmbiguousAddressFamily,
  networksForFamily,
  uniqueNetworkInCatalog,
  detectAddressFamily,
  validateDestination,
} from './address-detect'

/* --------------------------------- errors --------------------------------- */
export { ZappiApiError, errorCode } from './errors'
export type { ZappiErrorCode, ZappiErrorBody } from './errors'

/* --------------------------------- client --------------------------------- */
export { ZappiClient } from './client/zappi-client'
export type {
  ZappiAuth,
  ZappiClientOptions,
  PartnerDepositDestinationOpts,
} from './client/zappi-client'
export {
  nestAmountCents,
  nestAsset,
  nestWithdrawAddress,
  toNestWithdrawBody,
} from './client/zappi-client'
/* client mappers (for partners that want raw nest → clean mapping) */
export { mapNestDepositOptions, lookupDepositNetworkCopy, nestSparkNetwork } from './client/mappers/deposit-map'
export {
  mapNestWithdrawOptions,
  mapNestEstimate,
  mapNestWithdrawStatus,
  mapWithdrawStatusValue,
  quotePayloadFromEstimate,
  toPartnerWithdrawBody,
  mapPartnerExecuteToConfirmation,
} from './client/mappers/withdraw-map'
export {
  mapNestDepositDestination,
  nestSourceTokenMeta,
} from './client/mappers/deposit-destination-map'

/* client presentation helpers (QR payload, deep links) */
export {
  isEvmStableNetwork,
  evmErc20TransferUri,
  depositUriScheme,
  depositQrPayload,
  depositWalletDeepLinks,
  toDepositDestination,
  walletDestinationChain,
  flashnetSourceAsset,
  SPARK_TEST_WALLET_URL,
  isSparkIdentityAddress,
  type EvmTokenMeta,
} from './client/presentation/deposit-presentation'

/* ------------------------- legacy presentation alias ------------------------ */
export {
  /** @deprecated Renamed to `walletDestinationChain`. */
  sparkDestinationChain,
} from './client/presentation/deposit-presentation'

/* --------------------------------- webhook ------------------------------- */
export { verifyZappiWebhook, signBody } from './webhook/verify'
export {
  parseWebhookEnvelope,
  envelopeFromHistoryOrder,
  isLedgerCredited,
  WebhookParseError,
} from './webhook/parse'

/* ---------------------------------- quote -------------------------------- */
export {
  mintWithdrawQuoteToken,
  readWithdrawQuoteToken,
  verifyWithdrawQuote,
  isWithdrawQuoteExpired,
  quoteFromPayload,
  quoteExpiresAt,
  type WithdrawQuotePayload,
} from './quote/quote-token'
export { runTwoPhaseWithdraw, runTwoPhasePartnerWithdraw, TwoPhaseWithdrawError } from './quote/two-phase'
export type {
  TwoPhaseSigner,
  TwoPhaseClient,
  RunTwoPhaseWithdrawOptions,
  PartnerWithdrawClient,
} from './quote/two-phase'

/* ---------------------------- signer port (types) ------------------------ */
export type {
  WalletSigner,
  CreateWalletSignerOptions,
  /** @deprecated Renamed to `WalletSigner`. */
  SparkSigner,
  /** @deprecated Renamed to `CreateWalletSignerOptions`. */
  CreateSparkSignerOptions,
} from './sign/wallet-signer-port'
