/**
 * Browser entry. Does not import `encrypt.ts` (`node:crypto`).
 * Use `encryptBundleWithWebCrypto` in the page.
 */

export { RecoveryError } from './errors'
export type { RecoveryErrorCode } from './errors'
export {
  RECOVERY_BUNDLE_SCHEMA_VERSION,
  RECOVERY_FRESHNESS_TRIGGERS,
} from './types'
export type {
  RecoveryAadHeader,
  RecoveryBundle,
  RecoveryBundlePayload,
  RecoveryNetwork,
  RecoveryWalletIdentity,
} from './types'
export { classifyLeaves, EXIT_CHAIN_STATUSES, UNVERIFIED_EXIT_STATUSES } from './classify'
export type { ClassifiedLeaf, ClassifyLeafInput } from './classify'
export { estimateExitFees, p2wpkhScriptHex } from './fees'
export type { FeeUtxo } from './fees'
export { buildBundleFromNodes } from './bundle'
export { signBundle } from './integrity'
export { decryptBundleWithWebCrypto, encryptBundleWithWebCrypto } from './webcrypto'
export { planExitPackages, unsignedTxFromPsbt } from './broadcast'
export type { ExitLeafChain, ExitNodeRecord, ExitPackage, FeeBumpBuilder, PlannerUtxo } from './broadcast'
export { assertEsploraBaseUrl } from './chain-source'
export type { ChainSource, ChainTxStatus } from './chain-source'
export {
  applyChainRead,
  createExitSession,
  markSubmitted,
  markSwept,
  markWaitingTimelock,
  markWriteAhead,
  nextBroadcastable,
} from './session'
export type { ExitSession, ExitSessionStep } from './session'
export { buildSweepTransaction, matchRefundOutput } from './sweep'
export type { SweepMatch } from './sweep'
