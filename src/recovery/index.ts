/**
 * BTC L1 recovery helpers: bundle v1, chain checks, classification,
 * seed encryption, exit fee estimates, offline package planning, and the
 * write-ahead broadcast session.
 *
 * Nothing here calls `sparkClient`, `isTxBroadcast`, or mempool.space.
 * Chain reads go through an injected {@link ChainSource}.
 */

export { RecoveryError } from './errors'
export type { RecoveryErrorCode } from './errors'

export {
  RECOVERY_BUNDLE_SCHEMA_VERSION,
  RECOVERY_FRESHNESS_TRIGGERS,
} from './types'
export type {
  AncestorFetch,
  BuildBundleFromNodesInput,
  CapturedLeafInput,
  DerivationOrigin,
  RecoveryAadHeader,
  RecoveryBundle,
  RecoveryBundlePayload,
  RecoveryBundleSchemaVersion,
  RecoveryFreshness,
  RecoveryIntegrity,
  RecoveryLeaf,
  RecoveryLeafTimelock,
  RecoveryNetwork,
  RecoveryWalletIdentity,
} from './types'

export { canonicalize } from './canonical'
export {
  canonicalAadHeader,
  canonicalBundle,
  canonicalPayload,
  payloadSha256,
} from './validate'

export { assessChain } from './chain'
export type { ChainAssessment, ChainNodeRef } from './chain'

export {
  EXIT_CHAIN_STATUSES,
  UNVERIFIED_EXIT_STATUSES,
  classifyLeaves,
  isStale,
  normalizeTreeNodeStatus,
} from './classify'
export type { ClassifiedLeaf, ClassifyLeafInput, ClassifyLeavesOptions, LeafClassification } from './classify'

export { buildBundleFromNodes } from './bundle'

export { signBundle, verifyBundle, assertPayloadDigest } from './integrity'
export type { RecoverySignFn, RecoveryVerifyFn } from './integrity'

export { decryptBundle, encryptBundle, RECOVERY_BUNDLE_KDF_LABEL, RECOVERY_SEED_LENGTH } from './encrypt'

export {
  DUST_CHANGE_SATS,
  FEE_UTXO_CONFIRMATION_UNKNOWN_WARNING,
  FEE_UTXO_NOT_RESERVED_WARNING,
  NO_FEE_UTXO_WARNING,
  ONE_PASS_ALLOCATION_WARNING,
  SWEEP_FEE_WARNING,
  estimateExitFees,
  estimateFeeBumpTxSize,
  p2wpkhScriptHex,
} from './fees'
export type {
  DustChange,
  EstimateExitFeesInput,
  EstimateExitFeesResult,
  ExitFeeLeafInput,
  ExitFeeNode,
  ExitFeePackage,
  FeeUtxo,
  LeafFeeAllocation,
  UnderfundedPackage,
} from './fees'

export { decodeTreeNodeHex, encodeTreeNodeHex, loadSparkTreeNodeCodec } from './tree-node'
export type { TreeNodeCodec } from './tree-node'

export { encryptBundleWithWebCrypto, decryptBundleWithWebCrypto } from './webcrypto'
export { hash160, sha256 } from './hash'

export { planExitPackages, txidOfRawTx, unsignedTxFromPsbt } from './broadcast'
export type {
  ExitLeafChain,
  ExitNodeRecord,
  ExitPackage,
  ExitPackageKind,
  FeeBumpBuilder,
  FeeBumpDraft,
  PlannerUtxo,
} from './broadcast'

export { assertEsploraBaseUrl } from './chain-source'
export type { ChainSource, ChainTxStatus, Outspend } from './chain-source'

export {
  applyChainRead,
  assertFeeUtxosConfirmed,
  createExitSession,
  markFailed,
  markSubmitted,
  markSwept,
  markWaitingTimelock,
  markWriteAhead,
  nextBroadcastable,
} from './session'
export type { ExitSession, ExitSessionStep, ExitStepStatus } from './session'

export { buildSweepTransaction, listTxOutputs, matchRefundOutput } from './sweep'
export type { SweepKey, SweepMatch, SweepScript, SweepWitness, TxOutput } from './sweep'
