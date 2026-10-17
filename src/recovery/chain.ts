import { RecoveryError } from './errors'

/**
 * Node linkage used to judge an exit chain. Hex stays opaque; capture code
 * passes the ids it already decoded while online.
 */
export interface ChainNodeRef {
  id: string
  parentNodeId?: string | null
}

export interface ChainAssessment {
  complete: boolean
  /**
   * Incomplete chains are `missing-ancestor`. This is never `eligible`.
   * `classifyLeaves` is what promotes a complete chain to `eligible`.
   */
  classification: 'complete' | 'missing-ancestor'
}

/**
 * A chain is complete only when `ancestors` is ordered root → parent-of-leaf,
 * the first node has no parent, each next node's parent is the previous node,
 * and the leaf's parent is the last ancestor. A root leaf has no ancestors
 * and no parent. This does not call `sparkClient`.
 */
export function assessChain(
  leaf: ChainNodeRef,
  ancestors: readonly ChainNodeRef[],
): ChainAssessment {
  const leafId = nodeId(leaf)
  if (leafId === null) return incomplete()
  if (!Array.isArray(ancestors)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'ancestors must be an array.')
  }

  if (ancestors.length === 0) {
    return parentId(leaf) === null ? complete() : incomplete()
  }

  const first = ancestors[0]
  if (!first || parentId(first) !== null) return incomplete()

  let previousId = nodeId(first)
  if (previousId === null) return incomplete()

  for (let index = 1; index < ancestors.length; index += 1) {
    const node = ancestors[index]
    if (!node) return incomplete()
    const id = nodeId(node)
    if (id === null || parentId(node) !== previousId) return incomplete()
    previousId = id
  }

  if (parentId(leaf) !== previousId || leafId === previousId) return incomplete()
  return complete()
}

function complete(): ChainAssessment {
  return { complete: true, classification: 'complete' }
}

function incomplete(): ChainAssessment {
  return { complete: false, classification: 'missing-ancestor' }
}

function nodeId(node: ChainNodeRef): string | null {
  if (!node || typeof node.id !== 'string') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Chain node id must be a string.')
  }
  const id = node.id.trim()
  return id === '' ? null : id
}

function parentId(node: ChainNodeRef): string | null {
  const parent = node.parentNodeId
  if (parent === undefined || parent === null) return null
  if (typeof parent !== 'string') {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'parentNodeId must be a string.')
  }
  const trimmed = parent.trim()
  return trimmed === '' ? null : trimmed
}
