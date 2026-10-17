import { assessChain, type ChainNodeRef } from './chain'
import { RecoveryError } from './errors'
import { capturedAtEpochMs } from './validate'

/**
 * Statuses spark-sdk 0.11.0 `buildUnilateralExitChain` will keep walking.
 * `EXIT_CHAIN_STATUSES` in unilateral-exit.ts is AVAILABLE, SPLITTED,
 * SPLIT_LOCKED, and ON_CHAIN (the `TREE_NODE_STATUS_` prefix stripped).
 *
 * CONSOLIDATED, EXITED, PARENT_EXITED, and WATCHTOWER_EXITED exist on the
 * 0.11.0 enum but are not in that set. The chain walk stops on them. Until a
 * regtest probe shows a complete exit through those states, they are
 * `unverified-status`, never `eligible`. Other statuses, including
 * WATCHTOWER_EXIT_RECOVERED, are `ineligible`.
 */
export const EXIT_CHAIN_STATUSES: ReadonlySet<string> = new Set([
  'AVAILABLE',
  'SPLITTED',
  'SPLIT_LOCKED',
  'ON_CHAIN',
])

export const UNVERIFIED_EXIT_STATUSES: ReadonlySet<string> = new Set([
  'CONSOLIDATED',
  'EXITED',
  'PARENT_EXITED',
  'WATCHTOWER_EXITED',
])

const STATUS_PREFIX = 'TREE_NODE_STATUS_'

export type LeafClassification =
  | 'eligible'
  | 'missing-ancestor'
  | 'unverified-status'
  | 'ineligible'
  | 'uneconomical'

export interface ClassifyLeafInput {
  leafId: string
  status: string
  valueSats: bigint
  leaf: ChainNodeRef
  ancestors: readonly ChainNodeRef[]
  /** Cost from `estimateExitFees` for this leaf. Leaf value is not fee funding. */
  allocatedFeeSats: bigint
}

export interface ClassifiedLeaf {
  leafId: string
  classification: LeafClassification
  /** Caller-supplied. There is no built-in TTL. */
  stale: boolean
  reason: string
}

export interface ClassifyLeavesOptions {
  now: Date | number
  capturedAt: string
  /**
   * When set, a bundle older than this many milliseconds is stale.
   * Omitted means age alone does not mark the bundle stale.
   */
  staleAfterMs?: number
  knownIncomplete?: boolean
}

/**
 * Classify leaves without a network. `stale` is a flag beside the
 * classification: `knownIncomplete`, or age greater than `staleAfterMs` when
 * the caller passes that window. An incomplete chain is `missing-ancestor`
 * and is never `eligible`.
 */
export function classifyLeaves(
  leaves: readonly ClassifyLeafInput[],
  options: ClassifyLeavesOptions,
): ClassifiedLeaf[] {
  const stale = isStale(options)
  return leaves.map((leaf) => classifyOne(leaf, stale))
}

export function normalizeTreeNodeStatus(status: string): string {
  const trimmed = status.trim()
  return trimmed.startsWith(STATUS_PREFIX) ? trimmed.slice(STATUS_PREFIX.length) : trimmed
}

function classifyOne(leaf: ClassifyLeafInput, stale: boolean): ClassifiedLeaf {
  if (typeof leaf.leafId !== 'string' || leaf.leafId.trim() === '') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'leafId must be a non-empty string.')
  }
  if (typeof leaf.valueSats !== 'bigint' || leaf.valueSats < 0n) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'valueSats must be >= 0.')
  }
  if (typeof leaf.allocatedFeeSats !== 'bigint' || leaf.allocatedFeeSats < 0n) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'allocatedFeeSats must be >= 0.')
  }

  const chain = assessChain(leaf.leaf, leaf.ancestors)
  if (!chain.complete) {
    return result(leaf.leafId, 'missing-ancestor', stale, 'Ancestor chain is incomplete.')
  }

  const status = normalizeTreeNodeStatus(leaf.status)
  if (status === '') {
    return result(leaf.leafId, 'ineligible', stale, 'Leaf status is empty.')
  }
  if (UNVERIFIED_EXIT_STATUSES.has(status)) {
    return result(
      leaf.leafId,
      'unverified-status',
      stale,
      `${status} is outside EXIT_CHAIN_STATUSES until a regtest probe exists.`,
    )
  }
  if (!EXIT_CHAIN_STATUSES.has(status)) {
    return result(leaf.leafId, 'ineligible', stale, `${status} cannot continue an exit chain.`)
  }
  if (leaf.allocatedFeeSats >= leaf.valueSats) {
    return result(leaf.leafId, 'uneconomical', stale, 'Allocated exit cost is at least the leaf value.')
  }
  return result(leaf.leafId, 'eligible', stale, 'Chain, status, and fee check passed.')
}

/**
 * Stale when the caller says the capture is incomplete, or when the capture
 * is older than the caller-supplied window. No window means no age check.
 */
export function isStale(options: ClassifyLeavesOptions): boolean {
  if (options.knownIncomplete === true) return true
  if (options.staleAfterMs === undefined) return false
  if (!Number.isFinite(options.staleAfterMs) || options.staleAfterMs < 0) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'staleAfterMs must be a non-negative number.')
  }
  const nowMs = options.now instanceof Date ? options.now.getTime() : options.now
  if (!Number.isFinite(nowMs)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'now must be a finite timestamp.')
  }
  const ageMs = nowMs - capturedAtEpochMs(options.capturedAt)
  return ageMs > options.staleAfterMs
}

function result(
  leafId: string,
  classification: LeafClassification,
  stale: boolean,
  reason: string,
): ClassifiedLeaf {
  return { leafId, classification, stale, reason }
}
