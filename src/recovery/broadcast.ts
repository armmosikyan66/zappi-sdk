import { RecoveryError } from './errors'
import { bytesToHex, doubleSha256 } from './hash'
import { hexToBytes, normalizeHex } from './hex'

/**
 * Offline exit planner.
 *
 * Does not call `constructUnilateralExitFeeBumpPackages`, `isTxBroadcast`, or
 * `sparkClient`. Upstream spark#146 skips a node that is already broadcast
 * before its refund is built, so a stateless re-run drops the refund. This
 * planner always keeps the refund (and the direct variants) from the stored
 * node, even when the node transaction is already in `alreadyBroadcastTxids`.
 */

export interface ExitNodeRecord {
  id: string
  parentNodeId?: string | null
  nodeTxHex: string
  refundTxHex: string
  directTxHex?: string
  directRefundTxHex?: string
  directFromCpfpRefundTxHex?: string
}

export interface PlannerUtxo {
  txid: string
  vout: number
  valueSats: bigint
  scriptHex: string
  publicKeyHex: string
  confirmed?: boolean
}

export interface FeeBumpDraft {
  feeBumpPsbt: string
  childTxHex: string
  usedUtxos: readonly PlannerUtxo[]
}

export interface FeeBumpBuilder {
  constructFeeBumpTx(
    txHex: string,
    utxos: readonly PlannerUtxo[],
    feeRate: { satPerVbyte: number },
    previousFeeBumpTx?: string,
  ): FeeBumpDraft
}

export type ExitPackageKind = 'node' | 'refund' | 'direct' | 'direct-refund' | 'direct-from-cpfp-refund'

export interface ExitPackage {
  id: string
  leafId: string
  kind: ExitPackageKind
  parentTxHex: string
  parentTxid: string
  feeBumpPsbt: string
  childTxHex: string
  childTxid: string
  dependsOnChildTxid: string | null
  /** True when spark#146 would have skipped this parent before building the refund. */
  keptAfterBroadcastSkip: boolean
}

export interface ExitLeafChain {
  leafId: string
  /** Root first, leaf last. The first node must have no parent. */
  chain: readonly ExitNodeRecord[]
}

export function planExitPackages(input: {
  leaves: readonly ExitLeafChain[]
  feeUtxos: readonly PlannerUtxo[]
  satPerVbyte: number
  builder: FeeBumpBuilder
  alreadyBroadcastTxids?: ReadonlySet<string>
}): ExitPackage[] {
  if (!(input.satPerVbyte > 0)) {
    throw new RecoveryError('FEE_RATE_REQUIRED', 'satPerVbyte is required and must be greater than 0.')
  }
  if (input.feeUtxos.length === 0) {
    throw new RecoveryError('FEE_UTXO_INVALID', 'At least one fee UTXO is required to plan an exit package.')
  }
  const broadcast = input.alreadyBroadcastTxids ?? new Set<string>()
  const packages: ExitPackage[] = []
  const seenParents = new Set<string>()
  for (const leaf of input.leaves) {
    assertCompleteChain(leaf)
    let previousChild: string | null = null
    for (const node of leaf.chain) {
      const variants = variantsOf(node)
      let nodeSkipped = false
      for (const variant of variants) {
        const parentTxid = txidOfRawTx(variant.txHex)
        const alreadyBroadcast = broadcast.has(parentTxid)
        if (seenParents.has(parentTxid)) {
          const existing = packages.find((item) => item.parentTxid === parentTxid)
          if (existing) previousChild = existing.childTxid
          continue
        }
        if (variant.kind === 'node' && alreadyBroadcast) {
          seenParents.add(parentTxid)
          previousChild = null
          nodeSkipped = true
          continue
        }
        seenParents.add(parentTxid)
        const draft = input.builder.constructFeeBumpTx(
          variant.txHex,
          input.feeUtxos,
          { satPerVbyte: input.satPerVbyte },
          undefined,
        )
        const childTxid = txidOfRawTx(draft.childTxHex)
        packages.push({
          id: `${leaf.leafId}:${variant.kind}:${parentTxid}`,
          leafId: leaf.leafId,
          kind: variant.kind,
          parentTxHex: variant.txHex,
          parentTxid,
          feeBumpPsbt: draft.feeBumpPsbt,
          childTxHex: draft.childTxHex,
          childTxid,
          dependsOnChildTxid: previousChild,
          keptAfterBroadcastSkip: alreadyBroadcast || (variant.kind === 'refund' && nodeSkipped),
        })
        previousChild = childTxid
      }
    }
  }
  return packages
}

/** Pull the unsigned transaction out of a PSBT (global key 0x00). */
export function unsignedTxFromPsbt(psbtHex: string): string {
  const bytes = hexToBytes(psbtHex, 'psbt')
  if (bytesToHex(bytes.slice(0, 5)) !== '70736274ff') {
    throw new RecoveryError('EXIT_PACKAGE_INVALID', 'Fee-bump PSBT is missing its magic.')
  }
  let offset = 5
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset)
    if (key.value === 0) break
    const keyBytes = bytes.slice(key.next, key.next + key.value)
    offset = key.next + key.value
    const value = readVarint(bytes, offset)
    const valueBytes = bytes.slice(value.next, value.next + value.value)
    offset = value.next + value.value
    if (keyBytes.length === 1 && keyBytes[0] === 0x00) return bytesToHex(valueBytes)
  }
  throw new RecoveryError('EXIT_PACKAGE_INVALID', 'Fee-bump PSBT has no unsigned transaction.')
}

export function txidOfRawTx(rawHex: string): string {
  const raw = hexToBytes(rawHex, 'transaction')
  const stripped = stripWitness(raw)
  return bytesToHex(reverse(doubleSha256(stripped)))
}

function assertCompleteChain(leaf: ExitLeafChain): void {
  if (!leaf.leafId.trim() || leaf.chain.length === 0) {
    throw new RecoveryError('EXIT_CHAIN_INCOMPLETE', 'Exit chain is missing.')
  }
  const first = leaf.chain[0]
  if (!first || parentOf(first) !== null) {
    throw new RecoveryError('EXIT_CHAIN_INCOMPLETE', 'Exit chain does not reach the root.')
  }
  let previous = first.id
  for (let index = 1; index < leaf.chain.length; index += 1) {
    const node = leaf.chain[index]
    if (!node || parentOf(node) !== previous) {
      throw new RecoveryError('EXIT_CHAIN_INCOMPLETE', 'Exit chain is missing an ancestor.')
    }
    previous = node.id
  }
}

function parentOf(node: ExitNodeRecord): string | null {
  const parent = node.parentNodeId
  if (parent === undefined || parent === null || parent.trim() === '') return null
  return parent
}

function variantsOf(node: ExitNodeRecord): { kind: ExitPackageKind; txHex: string }[] {
  const variants: { kind: ExitPackageKind; txHex: string }[] = [
    { kind: 'node', txHex: requireHex(node.nodeTxHex) },
    { kind: 'refund', txHex: requireHex(node.refundTxHex) },
  ]
  if (node.directTxHex) variants.push({ kind: 'direct', txHex: requireHex(node.directTxHex) })
  if (node.directRefundTxHex) {
    variants.push({ kind: 'direct-refund', txHex: requireHex(node.directRefundTxHex) })
  }
  if (node.directFromCpfpRefundTxHex) {
    variants.push({
      kind: 'direct-from-cpfp-refund',
      txHex: requireHex(node.directFromCpfpRefundTxHex),
    })
  }
  return variants
}

function requireHex(value: string): string {
  return normalizeHex(value, 'transaction')
}

function reverse(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes).reverse()
}

/** Non-witness serialization, so the txid matches Bitcoin's definition. */
function stripWitness(raw: Uint8Array): Uint8Array {
  if (raw.length < 10) {
    throw new RecoveryError('EXIT_PACKAGE_INVALID', 'Transaction hex is too short.')
  }
  const marker = raw[4]
  const flag = raw[5]
  if (marker !== 0x00 || flag !== 0x01) return raw
  let offset = 6
  const inputs = readVarint(raw, offset)
  offset = inputs.next
  for (let index = 0; index < inputs.value; index += 1) {
    offset += 36
    const script = readVarint(raw, offset)
    offset = script.next + script.value + 4
  }
  const outputs = readVarint(raw, offset)
  offset = outputs.next
  for (let index = 0; index < outputs.value; index += 1) {
    offset += 8
    const script = readVarint(raw, offset)
    offset = script.next + script.value
  }
  const witnessStart = offset
  for (let index = 0; index < inputs.value; index += 1) {
    const stack = readVarint(raw, offset)
    offset = stack.next
    for (let item = 0; item < stack.value; item += 1) {
      const size = readVarint(raw, offset)
      offset = size.next + size.value
    }
  }
  const out = new Uint8Array(4 + (witnessStart - 6) + (raw.length - offset))
  out.set(raw.slice(0, 4), 0)
  out.set(raw.slice(6, witnessStart), 4)
  out.set(raw.slice(offset), 4 + (witnessStart - 6))
  return out
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  const first = bytes[offset]
  if (first === undefined) {
    throw new RecoveryError('EXIT_PACKAGE_INVALID', 'Transaction hex is truncated.')
  }
  if (first < 0xfd) return { value: first, next: offset + 1 }
  if (first === 0xfd) {
    return { value: (bytes[offset + 1] ?? 0) | ((bytes[offset + 2] ?? 0) << 8), next: offset + 3 }
  }
  throw new RecoveryError('EXIT_PACKAGE_INVALID', 'Transaction varint is too large for this planner.')
}
