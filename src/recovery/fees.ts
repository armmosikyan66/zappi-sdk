import { RecoveryError } from './errors'
import { hash160 } from './hash'
import { bytesToHex, hexToBytes, normalizeHex } from './hex'
import { asSats } from './validate'

/**
 * Pure exit-fee estimate. Does not import or call `isTxBroadcast`,
 * `constructUnilateralExitFeeBumpPackages`, or `sparkClient`.
 *
 * Child vsize matches spark-sdk 0.11.0 `estimateFeeBumpTxSize`:
 * `ceil(10.5 + 68 * numFundingUtxos + (ephemeral anchor ? 41 : 0) + 31)`.
 * One funding input plus an anchor is 151 vbytes. Parent vsize is caller
 * input. This module does not guess Zappi transaction vsizes.
 *
 * Package fee is `ceil((parentVsize + childVsize) * satPerVbyte)`. A missing
 * or zero rate is rejected. spark-sdk 0.11.0 would silently use 1500 sats.
 *
 * Shared ancestor keys are priced once, then split pro-rata by leaf value
 * (largest remainder, `leafId` ascending on a tie). A leaf's own nodes are
 * the keys that appear on that leaf alone. v1 does this in one pass: dropping
 * an uneconomical leaf changes the split, so the caller may re-run without it.
 *
 * The final destination sweep is not included. spark-sdk 0.11.0 does not
 * build that transaction, so `sweepFeeSats` is null.
 *
 * Leaf value is never added to fee funding. Fee inputs are only `FeeUtxo`s.
 */

export const DUST_CHANGE_SATS = 546n

export const SWEEP_FEE_WARNING =
  'The final destination sweep fee is not included (sweepFeeSats is null). Spark SDK 0.11.0 does not build that transaction.'

export const ONE_PASS_ALLOCATION_WARNING =
  'Shared-ancestor costs are split once. Excluding an uneconomical leaf changes that split; call estimateExitFees again without it to recompute.'

export const FEE_UTXO_CONFIRMATION_UNKNOWN_WARNING =
  'Fee UTXO confirmation is unknown. It is confirmed only when every fee UTXO is passed with confirmed: true. This estimate never defaults to OK.'

export const NO_FEE_UTXO_WARNING =
  'No fee UTXOs were provided. Child size assumes one P2WPKH funding input so the exit cost is visible. Leaf value is not used as fee funding.'

export const FEE_UTXO_NOT_RESERVED_WARNING =
  'Each package estimates funding independently. This does not reserve fee UTXOs across packages.'

export interface ExitFeeNode {
  /** Dedup key. The same ancestor hex or node id must use the same key on every leaf. */
  key: string
  /** Caller-supplied parent transaction vsize. Not inferred from hex. */
  parentVsize: number
  /** Defaults to true, matching the 0.11.0 helper. */
  hasEphemeralAnchor?: boolean
}

export interface ExitFeeLeafInput {
  leafId: string
  valueSats: bigint
  /**
   * Nodes that must be fee-bumped for this leaf, root first, including this
   * leaf's own node. Shared ancestors repeat the same `key`.
   */
  nodes: readonly ExitFeeNode[]
}

export interface FeeUtxo {
  txid: string
  vout: number
  valueSats: bigint
  scriptHex: string
  publicKeyHex: string
  /** Only `true` counts as confirmed. Omitted or false stays unknown. */
  confirmed?: boolean
}

export interface EstimateExitFeesInput {
  leaves: readonly ExitFeeLeafInput[]
  feeUtxos: readonly FeeUtxo[]
  satPerVbyte: number
  /** Txids from the exit-state transaction set. A fee outpoint in this set is rejected. */
  knownExitTxids?: readonly string[]
}

export interface ExitFeePackage {
  nodeKey: string
  parentVsize: number
  childVsize: number
  numFundingUtxos: number
  feeSats: bigint
  includedByLeafIds: readonly string[]
  shared: boolean
}

export interface LeafFeeAllocation {
  leafId: string
  valueSats: bigint
  ownFeeSats: bigint
  sharedFeeSats: bigint
  allocatedFeeSats: bigint
  uneconomical: boolean
}

export interface DustChange {
  nodeKey: string
  changeSats: bigint
  /** Sats that must be added so change is at least 546. */
  extraSats: bigint
}

export interface UnderfundedPackage {
  nodeKey: string
  feeSats: bigint
  feeUtxoValueSats: bigint
  /** Sats short of a 546-sat change after paying the package fee. */
  shortfallSats: bigint
}

export interface EstimateExitFeesResult {
  packages: ExitFeePackage[]
  allocations: LeafFeeAllocation[]
  totalPackageFeeSats: bigint
  destinationValueSats: bigint
  excludedUneconomicalValueSats: bigint
  dustChanges: DustChange[]
  underfundedPackages: UnderfundedPackage[]
  /** `'confirmed'` only when every fee UTXO was passed with `confirmed: true`. */
  feeUtxoConfirmation: 'unknown' | 'confirmed'
  sweepFeeSats: null
  warnings: string[]
}

interface PricedNode {
  key: string
  parentVsize: number
  hasEphemeralAnchor: boolean
  leafIds: string[]
}

interface ValidFeeUtxo {
  txid: string
  vout: number
  valueSats: bigint
  confirmed: boolean
}

/** P2WPKH script `0014 || HASH160(pubkey)`. */
export function p2wpkhScriptHex(publicKeyHex: string): string {
  const pub = publicKeyBytes(publicKeyHex)
  return `0014${bytesToHex(hash160(pub))}`
}

/**
 * Child vsize for one CPFP fee-bump. `hasEphemeralAnchor` defaults to true.
 * With one funding input that is `ceil(150.5) = 151`.
 */
export function estimateFeeBumpTxSize(numFundingUtxos: number, hasEphemeralAnchor = true): number {
  if (!Number.isInteger(numFundingUtxos) || numFundingUtxos < 0) {
    throw new RecoveryError('FEE_UTXO_INVALID', 'Funding input count must be a non-negative integer.')
  }
  const anchorVbytes = hasEphemeralAnchor ? 41 : 0
  return Math.ceil(10.5 + 68 * numFundingUtxos + anchorVbytes + 31)
}

export function estimateExitFees(input: EstimateExitFeesInput): EstimateExitFeesResult {
  const satPerVbyte = assertSatPerVbyte(input.satPerVbyte)
  const feeUtxos = validateFeeUtxos(input.feeUtxos, input.knownExitTxids ?? [])
  const leaves = validateLeaves(input.leaves)
  const priced = priceNodes(leaves)
  const packages: ExitFeePackage[] = []
  const dustChanges: DustChange[] = []
  const underfundedPackages: UnderfundedPackage[] = []
  const own = new Map<string, bigint>()
  const shared = new Map<string, bigint>()
  for (const leaf of leaves) {
    own.set(leaf.leafId, 0n)
    shared.set(leaf.leafId, 0n)
  }

  for (const node of priced) {
    const funding = selectFunding(feeUtxos, node.parentVsize, node.hasEphemeralAnchor, satPerVbyte)
    const isShared = node.leafIds.length > 1
    packages.push({
      nodeKey: node.key,
      parentVsize: node.parentVsize,
      childVsize: funding.childVsize,
      numFundingUtxos: funding.count,
      feeSats: funding.feeSats,
      includedByLeafIds: node.leafIds,
      shared: isShared,
    })
    const split = sharesFor(funding.feeSats, node.leafIds, (leafId) => valueOf(leaves, leafId))
    for (const [leafId, share] of split) {
      const bucket = isShared ? shared : own
      bucket.set(leafId, (bucket.get(leafId) ?? 0n) + share)
    }
    const change = funding.valueSats - funding.feeSats
    if (change > 0n && change < DUST_CHANGE_SATS) {
      dustChanges.push({
        nodeKey: node.key,
        changeSats: change,
        extraSats: DUST_CHANGE_SATS - change,
      })
    } else if (change <= 0n) {
      underfundedPackages.push({
        nodeKey: node.key,
        feeSats: funding.feeSats,
        feeUtxoValueSats: funding.valueSats,
        shortfallSats: funding.feeSats + DUST_CHANGE_SATS - funding.valueSats,
      })
    }
  }

  const allocations = leaves.map((leaf) => {
    const ownFeeSats = own.get(leaf.leafId) ?? 0n
    const sharedFeeSats = shared.get(leaf.leafId) ?? 0n
    const allocatedFeeSats = ownFeeSats + sharedFeeSats
    return {
      leafId: leaf.leafId,
      valueSats: leaf.valueSats,
      ownFeeSats,
      sharedFeeSats,
      allocatedFeeSats,
      uneconomical: allocatedFeeSats >= leaf.valueSats,
    }
  })

  let destinationValueSats = 0n
  let excludedUneconomicalValueSats = 0n
  for (const allocation of allocations) {
    if (allocation.uneconomical) excludedUneconomicalValueSats += allocation.valueSats
    else destinationValueSats += allocation.valueSats
  }

  const confirmed =
    feeUtxos.length > 0 && feeUtxos.every((utxo) => utxo.confirmed)
      ? 'confirmed'
      : 'unknown'

  return {
    packages,
    allocations,
    totalPackageFeeSats: packages.reduce((total, item) => total + item.feeSats, 0n),
    destinationValueSats,
    excludedUneconomicalValueSats,
    dustChanges,
    underfundedPackages,
    feeUtxoConfirmation: confirmed,
    sweepFeeSats: null,
    warnings: warningsFor(feeUtxos.length, confirmed),
  }
}

function warningsFor(feeUtxoCount: number, confirmation: 'unknown' | 'confirmed'): string[] {
  const warnings = [SWEEP_FEE_WARNING, ONE_PASS_ALLOCATION_WARNING, FEE_UTXO_NOT_RESERVED_WARNING]
  if (feeUtxoCount === 0) warnings.push(NO_FEE_UTXO_WARNING)
  if (confirmation === 'unknown') warnings.push(FEE_UTXO_CONFIRMATION_UNKNOWN_WARNING)
  return warnings
}

function assertSatPerVbyte(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RecoveryError(
      'FEE_RATE_REQUIRED',
      'satPerVbyte is required and must be greater than 0. A missing rate is not treated as 1500 sats.',
    )
  }
  return value
}

function validateFeeUtxos(utxos: readonly FeeUtxo[], knownExitTxids: readonly string[]): ValidFeeUtxo[] {
  if (!Array.isArray(utxos)) {
    throw new RecoveryError('FEE_UTXO_INVALID', 'feeUtxos must be an array.')
  }
  const exitTxids = new Set(knownExitTxids.map(normalizeTxid))
  const seen = new Set<string>()
  return utxos.map((utxo) => {
    const txid = normalizeTxid(utxo.txid)
    if (!Number.isSafeInteger(utxo.vout) || utxo.vout < 0) {
      throw new RecoveryError('FEE_UTXO_INVALID', 'Fee UTXO vout must be a non-negative integer.')
    }
    const outpoint = `${txid}:${utxo.vout}`
    if (seen.has(outpoint)) {
      throw new RecoveryError('FEE_UTXO_INVALID', 'Duplicate fee outpoint.')
    }
    seen.add(outpoint)
    assertP2wpkh(utxo.scriptHex, utxo.publicKeyHex)
    if (exitTxids.has(txid)) {
      throw new RecoveryError(
        'FEE_UTXO_IS_EXIT_TX',
        'Fee UTXO spends an exit-state transaction. Fees must come from an independent output, not recovered leaf value.',
      )
    }
    return {
      txid,
      vout: utxo.vout,
      valueSats: asSats(utxo.valueSats, 'valueSats'),
      confirmed: utxo.confirmed === true,
    }
  })
}

function assertP2wpkh(scriptHex: string, publicKeyHex: string): void {
  let actual: string
  let expected: string
  try {
    actual = normalizeHex(scriptHex, 'scriptHex')
    expected = p2wpkhScriptHex(publicKeyHex)
  } catch (error) {
    if (error instanceof RecoveryError && error.code === 'FEE_UTXO_NOT_P2WPKH') throw error
    throw new RecoveryError(
      'FEE_UTXO_NOT_P2WPKH',
      'Fee UTXO script does not match P2WPKH for that public key (expected 0014 || HASH160(pubkey)).',
    )
  }
  if (actual !== expected) {
    throw new RecoveryError(
      'FEE_UTXO_NOT_P2WPKH',
      'Fee UTXO script does not match P2WPKH for that public key (expected 0014 || HASH160(pubkey)).',
    )
  }
}

function publicKeyBytes(publicKeyHex: string): Uint8Array {
  let pub: Uint8Array
  try {
    pub = hexToBytes(publicKeyHex, 'publicKeyHex')
  } catch {
    throw new RecoveryError(
      'FEE_UTXO_NOT_P2WPKH',
      'Fee UTXO public key must be a compressed or uncompressed secp256k1 key.',
    )
  }
  const compressed = pub.length === 33 && (pub[0] === 0x02 || pub[0] === 0x03)
  const uncompressed = pub.length === 65 && pub[0] === 0x04
  if (!compressed && !uncompressed) {
    throw new RecoveryError(
      'FEE_UTXO_NOT_P2WPKH',
      'Fee UTXO public key must be a compressed or uncompressed secp256k1 key.',
    )
  }
  return pub
}

function normalizeTxid(txid: string): string {
  let hex: string
  try {
    hex = normalizeHex(txid, 'txid')
  } catch {
    throw new RecoveryError('FEE_UTXO_INVALID', 'Fee UTXO txid must be 32-byte hex.')
  }
  if (hex.length !== 64) {
    throw new RecoveryError('FEE_UTXO_INVALID', 'Fee UTXO txid must be 32-byte hex.')
  }
  return hex
}

interface ValidLeaf {
  leafId: string
  valueSats: bigint
  nodes: PricedNode[]
}

function validateLeaves(leaves: readonly ExitFeeLeafInput[]): ValidLeaf[] {
  if (!Array.isArray(leaves)) {
    throw new RecoveryError('FEE_NODE_INVALID', 'leaves must be an array.')
  }
  const seen = new Set<string>()
  return leaves.map((leaf) => {
    if (typeof leaf.leafId !== 'string' || leaf.leafId.trim() === '') {
      throw new RecoveryError('FEE_NODE_INVALID', 'leafId must be a non-empty string.')
    }
    const leafId = leaf.leafId.trim()
    if (seen.has(leafId)) {
      throw new RecoveryError('FEE_NODE_INVALID', 'Duplicate leafId in fee estimate.')
    }
    seen.add(leafId)
    if (!Array.isArray(leaf.nodes) || leaf.nodes.length === 0) {
      throw new RecoveryError(
        'FEE_NODE_INVALID',
        'Each leaf needs its own node and any ancestors, with caller-supplied parentVsize.',
      )
    }
    return {
      leafId,
      valueSats: asSats(leaf.valueSats, 'valueSats'),
      nodes: leaf.nodes.map(priceNode),
    }
  })
}

function priceNode(node: ExitFeeNode): PricedNode {
  if (typeof node.key !== 'string' || node.key.trim() === '' || node.key.length > 2_000_000) {
    throw new RecoveryError('FEE_NODE_INVALID', 'Fee node key must be a non-empty string.')
  }
  return {
    key: node.key,
    parentVsize: assertParentVsize(node.parentVsize),
    hasEphemeralAnchor: anchorOf(node.hasEphemeralAnchor),
    leafIds: [],
  }
}

function assertParentVsize(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 4_000_000) {
    throw new RecoveryError(
      'FEE_NODE_INVALID',
      'parentVsize must be a positive integer supplied by the caller.',
    )
  }
  return value
}

function anchorOf(value: boolean | undefined): boolean {
  if (value === undefined) return true
  if (typeof value !== 'boolean') {
    throw new RecoveryError('FEE_NODE_INVALID', 'hasEphemeralAnchor must be a boolean.')
  }
  return value
}

function priceNodes(leaves: readonly ValidLeaf[]): PricedNode[] {
  const groups = new Map<string, PricedNode>()
  for (const leaf of leaves) {
    const seen = new Set<string>()
    for (const node of leaf.nodes) {
      if (seen.has(node.key)) {
        throw new RecoveryError('FEE_NODE_CONFLICT', 'A leaf chain lists the same node key twice.')
      }
      seen.add(node.key)
      const existing = groups.get(node.key)
      if (!existing) {
        groups.set(node.key, { ...node, leafIds: [leaf.leafId] })
        continue
      }
      if (
        existing.parentVsize !== node.parentVsize ||
        existing.hasEphemeralAnchor !== node.hasEphemeralAnchor
      ) {
        throw new RecoveryError(
          'FEE_NODE_CONFLICT',
          'The same node key was given two different parent vsizes or anchor flags.',
        )
      }
      existing.leafIds.push(leaf.leafId)
    }
  }
  return [...groups.values()]
}

function valueOf(leaves: readonly ValidLeaf[], leafId: string): bigint {
  const leaf = leaves.find((item) => item.leafId === leafId)
  if (!leaf) {
    throw new RecoveryError('FEE_NODE_INVALID', 'Fee allocation referred to a missing leaf.')
  }
  return leaf.valueSats
}

function selectFunding(
  utxos: readonly ValidFeeUtxo[],
  parentVsize: number,
  hasEphemeralAnchor: boolean,
  satPerVbyte: number,
): { count: number; valueSats: bigint; childVsize: number; feeSats: bigint } {
  if (utxos.length === 0) {
    const childVsize = estimateFeeBumpTxSize(1, hasEphemeralAnchor)
    return {
      count: 1,
      valueSats: 0n,
      childVsize,
      feeSats: packageFeeSats(parentVsize, childVsize, satPerVbyte),
    }
  }
  const sorted = [...utxos].sort((left, right) => {
    if (left.valueSats !== right.valueSats) return left.valueSats > right.valueSats ? -1 : 1
    const leftId = `${left.txid}:${left.vout}`
    const rightId = `${right.txid}:${right.vout}`
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
  })
  let total = 0n
  let count = 0
  let childVsize = 0
  let feeSats = 0n
  for (const utxo of sorted) {
    count += 1
    total += utxo.valueSats
    childVsize = estimateFeeBumpTxSize(count, hasEphemeralAnchor)
    feeSats = packageFeeSats(parentVsize, childVsize, satPerVbyte)
    if (total >= feeSats + DUST_CHANGE_SATS) {
      return { count, valueSats: total, childVsize, feeSats }
    }
  }
  return { count, valueSats: total, childVsize, feeSats }
}

function packageFeeSats(parentVsize: number, childVsize: number, satPerVbyte: number): bigint {
  const vbytes = parentVsize + childVsize
  if (Number.isInteger(satPerVbyte)) return BigInt(vbytes) * BigInt(satPerVbyte)
  const fee = Math.ceil(vbytes * satPerVbyte)
  if (!Number.isSafeInteger(fee)) {
    throw new RecoveryError('FEE_RATE_REQUIRED', 'satPerVbyte produced a fee that is not a safe integer.')
  }
  return BigInt(fee)
}

/**
 * Largest-remainder split. Remainder sats go to the largest fractional part,
 * then to the smaller `leafId`. Shares sum to `fee`.
 */
function sharesFor(
  fee: bigint,
  leafIds: readonly string[],
  valueOfLeaf: (leafId: string) => bigint,
): Map<string, bigint> {
  const only = leafIds[0]
  if (leafIds.length === 1 && only !== undefined) return new Map([[only, fee]])
  const parts = leafIds.map((leafId) => ({ leafId, value: valueOfLeaf(leafId) }))
  const total = parts.reduce((sum, part) => sum + part.value, 0n)
  if (total <= 0n) {
    throw new RecoveryError(
      'FEE_NODE_INVALID',
      'Cannot split a shared exit cost across leaves with no value.',
    )
  }
  const rows = parts.map((part) => ({
    leafId: part.leafId,
    base: (fee * part.value) / total,
    remainder: (fee * part.value) % total,
  }))
  let leftover = fee - rows.reduce((sum, row) => sum + row.base, 0n)
  const ranked = [...rows].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1
    return left.leafId < right.leafId ? -1 : left.leafId > right.leafId ? 1 : 0
  })
  const extra = new Map<string, bigint>()
  for (const row of ranked) {
    if (leftover <= 0n) break
    extra.set(row.leafId, 1n)
    leftover -= 1n
  }
  return new Map(rows.map((row) => [row.leafId, row.base + (extra.get(row.leafId) ?? 0n)]))
}
