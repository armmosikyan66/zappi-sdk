/**
 * Recovery bundle v1. In memory, satoshi amounts are `bigint`. Canonical JSON
 * stores them as decimal strings. See `canonical.ts` for the byte rules.
 */

export const RECOVERY_BUNDLE_SCHEMA_VERSION = 1 as const

export type RecoveryBundleSchemaVersion = typeof RECOVERY_BUNDLE_SCHEMA_VERSION

export type RecoveryNetwork = 'MAINNET' | 'REGTEST'

export type DerivationOrigin = 'passkey-prf' | 'mnemonic'

/**
 * Known freshness triggers. The field itself is a free string so a new
 * capture site can be recorded without a schema bump. There is no default TTL.
 */
export const RECOVERY_FRESHNESS_TRIGGERS = [
  'manual',
  'balance-change',
  'periodic',
  'deposit-confirmed',
  'transfer-claimed',
  'stream-connected',
  'app-open',
] as const

export interface RecoveryWalletIdentity {
  network: RecoveryNetwork
  /** Resolved Spark account index. Never the sentinel `"unset"`. */
  accountNumber: number
  sparkAddress?: string
  /** Compressed secp256k1 identity key, 33 bytes hex. */
  identityPublicKey: string
  derivationOrigin: DerivationOrigin
}

export interface RecoveryFreshness {
  /** UTC timestamp, `YYYY-MM-DDTHH:mm:ss.sssZ` or without fractional seconds. */
  capturedAt: string
  trigger: string
  knownIncomplete: boolean
}

export interface RecoveryLeafTimelock {
  maturesAtHeight?: number
  relativeBlocks?: number
}

export interface RecoveryLeaf {
  leafId: string
  valueSats: bigint
  /** Opaque TreeNode protobuf hex. This module does not re-encode it. */
  treeNodeHex: string
  /** Ancestor TreeNode protobuf hex, root first, not including the leaf. */
  ancestorChainHex: string[]
  status: string
  timelock?: RecoveryLeafTimelock
}

export interface RecoveryIntegrity {
  leafCount: number
  totalSats: bigint
  /** Lowercase hex SHA-256 of the canonical payload bytes (no integrity object). */
  sha256: string
  /**
   * Lowercase hex signature from the wallet identity key over the hex digest
   * in `sha256`. See `signBundle`.
   */
  signatureByIdentityKey: string
}

/** Bundle body. Integrity is added by `signBundle`. */
export interface RecoveryBundlePayload {
  schema: RecoveryBundleSchemaVersion
  walletIdentity: RecoveryWalletIdentity
  freshness: RecoveryFreshness
  leaves: RecoveryLeaf[]
}

export interface RecoveryBundle extends RecoveryBundlePayload {
  integrity: RecoveryIntegrity
}

/**
 * Header bound into HKDF info and AES-GCM additional authenticated data.
 * A swapped network, account, or identity key fails decryption.
 */
export interface RecoveryAadHeader {
  version: RecoveryBundleSchemaVersion
  network: RecoveryNetwork
  accountNumber: number
  identityPublicKey: string
}

/**
 * Capture-time ancestor fetch.
 *
 * spark-sdk 0.11.0 `SparkWallet.getLeaves()` asks operators for available
 * leaves with `includeParents: false`. A complete exit chain has to be
 * fetched while operators are still up (`query_nodes` with
 * `includeParents: true`). Recovery time must not call `sparkClient` to fill
 * gaps. `buildBundleFromNodes` only validates nodes it is given.
 */
export interface AncestorFetch {
  includeParents: true
  phase: 'capture'
}

export interface CapturedLeafInput {
  leafId: string
  valueSats: bigint
  treeNodeHex: string
  ancestorChainHex: readonly string[]
  status: string
  timelock?: RecoveryLeafTimelock
}

export interface BuildBundleFromNodesInput {
  identity: RecoveryWalletIdentity
  leaves: readonly CapturedLeafInput[]
  capturedAt: string
  trigger: string
  knownIncomplete: boolean
}
