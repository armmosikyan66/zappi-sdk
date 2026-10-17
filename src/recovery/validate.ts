import { canonicalize } from './canonical'
import { sha256Hex as hashSha256Hex } from './hash'
import { RecoveryError } from './errors'
import { normalizeHex } from './hex'
import type {
  RecoveryAadHeader,
  RecoveryBundle,
  RecoveryBundlePayload,
  RecoveryFreshness,
  RecoveryIntegrity,
  RecoveryLeaf,
  RecoveryLeafTimelock,
  RecoveryWalletIdentity,
} from './types'
import { RECOVERY_BUNDLE_SCHEMA_VERSION } from './types'

const MAX_LEAVES = 5_000
const MAX_HEX_CHARS = 2_000_000
const MAX_TRIGGER_CHARS = 64
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/

export function sha256Hex(bytes: Uint8Array): string {
  return hashSha256Hex(bytes)
}

export function payloadSha256(payload: RecoveryBundlePayload): string {
  return sha256Hex(new TextEncoder().encode(canonicalPayload(payload)))
}

/** Canonical JSON of the bundle without the integrity object. */
export function canonicalPayload(payload: RecoveryBundlePayload): string {
  return canonicalize(payloadValue(normalizePayload(payload)))
}

/** Canonical JSON of a signed bundle, including integrity. */
export function canonicalBundle(bundle: RecoveryBundle): string {
  const normalized = normalizeBundle(bundle)
  return canonicalize({
    ...payloadValue(normalized),
    integrity: integrityValue(normalized.integrity),
  })
}

/**
 * AAD text: version, network, accountNumber, identityPublicKey.
 * Sorted keys, no insignificant whitespace.
 */
export function canonicalAadHeader(header: RecoveryAadHeader): string {
  const normalized = normalizeAadHeader(header)
  return canonicalize({
    accountNumber: normalized.accountNumber,
    identityPublicKey: normalized.identityPublicKey,
    network: normalized.network,
    version: normalized.version,
  })
}

export function normalizeAadHeader(header: RecoveryAadHeader): RecoveryAadHeader {
  return {
    version: RECOVERY_BUNDLE_SCHEMA_VERSION,
    network: assertNetwork(header.network),
    accountNumber: assertAccountNumber(header.accountNumber),
    identityPublicKey: assertIdentityPublicKey(header.identityPublicKey),
  }
}

export function normalizePayload(payload: RecoveryBundlePayload): RecoveryBundlePayload {
  if (payload.schema !== RECOVERY_BUNDLE_SCHEMA_VERSION) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Unsupported recovery bundle schema.')
  }
  return {
    schema: RECOVERY_BUNDLE_SCHEMA_VERSION,
    walletIdentity: normalizeIdentity(payload.walletIdentity),
    freshness: normalizeFreshness(payload.freshness),
    leaves: normalizeLeaves(payload.leaves),
  }
}

export function normalizeBundle(bundle: RecoveryBundle): RecoveryBundle {
  const payload = normalizePayload(bundle)
  return {
    ...payload,
    integrity: normalizeIntegrity(bundle.integrity, payload.leaves),
  }
}

export function bundleFromJson(value: unknown): RecoveryBundle {
  if (!isRecord(value)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Recovery bundle must be an object.')
  }
  const payload = normalizePayload({
    schema: value.schema as RecoveryBundlePayload['schema'],
    walletIdentity: value.walletIdentity as RecoveryWalletIdentity,
    freshness: value.freshness as RecoveryFreshness,
    leaves: jsonLeaves(value.leaves),
  })
  return {
    ...payload,
    integrity: normalizeIntegrity(jsonIntegrity(value.integrity), payload.leaves),
  }
}

function payloadValue(payload: RecoveryBundlePayload): Record<string, unknown> {
  return {
    schema: payload.schema,
    walletIdentity: identityValue(payload.walletIdentity),
    freshness: {
      capturedAt: payload.freshness.capturedAt,
      trigger: payload.freshness.trigger,
      knownIncomplete: payload.freshness.knownIncomplete,
    },
    leaves: payload.leaves.map(leafValue),
  }
}

function identityValue(identity: RecoveryWalletIdentity): Record<string, unknown> {
  return {
    network: identity.network,
    accountNumber: identity.accountNumber,
    ...(identity.sparkAddress !== undefined ? { sparkAddress: identity.sparkAddress } : {}),
    identityPublicKey: identity.identityPublicKey,
    derivationOrigin: identity.derivationOrigin,
  }
}

function leafValue(leaf: RecoveryLeaf): Record<string, unknown> {
  return {
    leafId: leaf.leafId,
    valueSats: leaf.valueSats,
    treeNodeHex: leaf.treeNodeHex,
    ancestorChainHex: leaf.ancestorChainHex,
    status: leaf.status,
    ...(leaf.timelock ? { timelock: leaf.timelock } : {}),
  }
}

function integrityValue(integrity: RecoveryIntegrity): Record<string, unknown> {
  return {
    leafCount: integrity.leafCount,
    totalSats: integrity.totalSats,
    sha256: integrity.sha256,
    signatureByIdentityKey: integrity.signatureByIdentityKey,
  }
}

function normalizeIdentity(identity: RecoveryWalletIdentity): RecoveryWalletIdentity {
  if (!isRecord(identity)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'walletIdentity must be an object.')
  }
  if (identity.sparkAddress !== undefined && typeof identity.sparkAddress !== 'string') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'sparkAddress must be a string.')
  }
  const sparkAddress = identity.sparkAddress
  return {
    network: assertNetwork(identity.network),
    accountNumber: assertAccountNumber(identity.accountNumber),
    ...(sparkAddress !== undefined ? { sparkAddress: assertSparkAddress(sparkAddress) } : {}),
    identityPublicKey: assertIdentityPublicKey(identity.identityPublicKey),
    derivationOrigin: assertDerivationOrigin(identity.derivationOrigin),
  }
}

function normalizeFreshness(freshness: RecoveryFreshness): RecoveryFreshness {
  if (!isRecord(freshness)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'freshness must be an object.')
  }
  if (typeof freshness.knownIncomplete !== 'boolean') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'knownIncomplete must be a boolean.')
  }
  return {
    capturedAt: assertCapturedAt(freshness.capturedAt),
    trigger: assertTrigger(freshness.trigger),
    knownIncomplete: freshness.knownIncomplete,
  }
}

function normalizeLeaves(leaves: readonly RecoveryLeaf[]): RecoveryLeaf[] {
  if (!Array.isArray(leaves)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'leaves must be an array.')
  }
  if (leaves.length > MAX_LEAVES) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Recovery bundle has too many leaves.')
  }
  const seen = new Set<string>()
  return leaves.map((leaf) => {
    const normalized = normalizeLeaf(leaf)
    if (seen.has(normalized.leafId)) {
      throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Duplicate leafId in recovery bundle.')
    }
    seen.add(normalized.leafId)
    return normalized
  })
}

function normalizeLeaf(leaf: RecoveryLeaf): RecoveryLeaf {
  if (!isRecord(leaf)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Each leaf must be an object.')
  }
  if (typeof leaf.leafId !== 'string' || leaf.leafId.trim() === '' || leaf.leafId.length > 200) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'leafId must be a non-empty string.')
  }
  if (typeof leaf.status !== 'string' || leaf.status.trim() === '' || leaf.status.length > 80) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Leaf status must be a non-empty string.')
  }
  if (!Array.isArray(leaf.ancestorChainHex)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'ancestorChainHex must be an array.')
  }
  const timelock = normalizeTimelock(leaf.timelock)
  return {
    leafId: leaf.leafId.trim(),
    valueSats: asSats(leaf.valueSats, 'valueSats'),
    treeNodeHex: assertNodeHex(leaf.treeNodeHex, 'treeNodeHex'),
    ancestorChainHex: leaf.ancestorChainHex.map((hex, index) =>
      assertNodeHex(hex, `ancestorChainHex[${index}]`),
    ),
    status: leaf.status.trim(),
    ...(timelock ? { timelock } : {}),
  }
}

function normalizeTimelock(timelock: RecoveryLeafTimelock | undefined): RecoveryLeafTimelock | undefined {
  if (timelock === undefined) return undefined
  if (!isRecord(timelock)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'timelock must be an object.')
  }
  const maturesAtHeight = optionalBlock(timelock.maturesAtHeight, 'maturesAtHeight')
  const relativeBlocks = optionalBlock(timelock.relativeBlocks, 'relativeBlocks')
  if (maturesAtHeight === undefined && relativeBlocks === undefined) return undefined
  return {
    ...(maturesAtHeight !== undefined ? { maturesAtHeight } : {}),
    ...(relativeBlocks !== undefined ? { relativeBlocks } : {}),
  }
}

function normalizeIntegrity(
  integrity: RecoveryIntegrity,
  leaves: readonly RecoveryLeaf[],
): RecoveryIntegrity {
  if (!isRecord(integrity)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'integrity must be an object.')
  }
  if (integrity.leafCount !== leaves.length) {
    throw new RecoveryError('RECOVERY_INTEGRITY_MISMATCH', 'Recovery bundle integrity check failed.')
  }
  const totalSats = sumSats(leaves)
  const declaredTotal = asSats(integrity.totalSats, 'totalSats')
  if (declaredTotal !== totalSats) {
    throw new RecoveryError('RECOVERY_INTEGRITY_MISMATCH', 'Recovery bundle integrity check failed.')
  }
  const sha256 = typeof integrity.sha256 === 'string' ? integrity.sha256.trim().toLowerCase() : ''
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new RecoveryError('RECOVERY_INTEGRITY_MISMATCH', 'Recovery bundle integrity check failed.')
  }
  const signature = assertSignatureHex(integrity.signatureByIdentityKey)
  return {
    leafCount: leaves.length,
    totalSats,
    sha256,
    signatureByIdentityKey: signature,
  }
}

function jsonLeaves(value: unknown): RecoveryLeaf[] {
  if (!Array.isArray(value)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'leaves must be an array.')
  }
  return value.map((leaf) => {
    if (!isRecord(leaf)) {
      throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Each leaf must be an object.')
    }
    return {
      leafId: leaf.leafId as string,
      valueSats: asSats(leaf.valueSats, 'valueSats'),
      treeNodeHex: leaf.treeNodeHex as string,
      ancestorChainHex: leaf.ancestorChainHex as string[],
      status: leaf.status as string,
      ...(isRecord(leaf.timelock) ? { timelock: leaf.timelock as RecoveryLeafTimelock } : {}),
    }
  })
}

function jsonIntegrity(value: unknown): RecoveryIntegrity {
  if (!isRecord(value)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'integrity must be an object.')
  }
  if (typeof value.leafCount !== 'number') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'leafCount must be a number.')
  }
  return {
    leafCount: value.leafCount,
    totalSats: asSats(value.totalSats, 'totalSats'),
    sha256: value.sha256 as string,
    signatureByIdentityKey: value.signatureByIdentityKey as string,
  }
}

export function assertAccountNumber(value: unknown): number {
  if (value === 'unset' || value === undefined || value === null || value === '') {
    throw new RecoveryError(
      'RECOVERY_ACCOUNT_UNSET',
      'accountNumber must be a resolved non-negative integer.',
    )
  }
  const parsed = typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RecoveryError(
      'RECOVERY_ACCOUNT_UNSET',
      'accountNumber must be a resolved non-negative integer.',
    )
  }
  return parsed
}

function assertNetwork(value: unknown): RecoveryWalletIdentity['network'] {
  if (value !== 'MAINNET' && value !== 'REGTEST') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'network must be MAINNET or REGTEST.')
  }
  return value
}

function assertDerivationOrigin(value: unknown): RecoveryWalletIdentity['derivationOrigin'] {
  if (value !== 'passkey-prf' && value !== 'mnemonic') {
    throw new RecoveryError(
      'RECOVERY_BUNDLE_INVALID',
      'derivationOrigin must be passkey-prf or mnemonic.',
    )
  }
  return value
}

function assertIdentityPublicKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'identityPublicKey must be hex.')
  }
  const hex = normalizeHex(value, 'identityPublicKey')
  if (hex.length !== 66 || (!hex.startsWith('02') && !hex.startsWith('03'))) {
    throw new RecoveryError(
      'RECOVERY_BUNDLE_INVALID',
      'identityPublicKey must be a 33-byte compressed key.',
    )
  }
  return hex
}

function assertSparkAddress(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 200) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'sparkAddress must be a non-empty string.')
  }
  return trimmed
}

export function capturedAtEpochMs(capturedAt: string): number {
  if (!ISO_UTC.test(capturedAt) || !Number.isFinite(Date.parse(capturedAt))) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'capturedAt must be a UTC ISO-8601 timestamp.')
  }
  return Date.parse(capturedAt)
}

function assertCapturedAt(value: unknown): string {
  if (typeof value !== 'string') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'capturedAt must be a UTC ISO-8601 timestamp.')
  }
  capturedAtEpochMs(value)
  return value
}

function assertTrigger(value: unknown): string {
  if (typeof value !== 'string') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'trigger must be a non-empty string.')
  }
  const trigger = value.trim()
  if (trigger.length === 0 || trigger.length > MAX_TRIGGER_CHARS) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'trigger must be a non-empty string.')
  }
  return trigger
}

function assertNodeHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', `${label} must be even-length hex.`)
  }
  if (value.length > MAX_HEX_CHARS) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', `${label} is too long.`)
  }
  return normalizeHex(value, label)
}

function optionalBlock(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', `${label} must be a non-negative integer.`)
  }
  return value
}

export function asSats(value: unknown, label: string): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new RecoveryError('RECOVERY_BUNDLE_INVALID', `${label} must be >= 0.`)
    return value
  }
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return BigInt(value)
  throw new RecoveryError('RECOVERY_BUNDLE_INVALID', `${label} must be a non-negative integer.`)
}

function assertSignatureHex(value: unknown): string {
  if (typeof value !== 'string') {
    throw new RecoveryError('RECOVERY_SIGNATURE_INVALID', 'Identity signature was not hex.')
  }
  const hex = value.trim().toLowerCase().replace(/^0x/, '')
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) {
    throw new RecoveryError('RECOVERY_SIGNATURE_INVALID', 'Identity signature was not hex.')
  }
  return hex
}

export function sumSats(leaves: readonly RecoveryLeaf[]): bigint {
  return leaves.reduce((total, leaf) => total + leaf.valueSats, 0n)
}

export function hexDigestEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
