import type { BuildBundleFromNodesInput, RecoveryBundlePayload } from './types'
import { normalizePayload } from './validate'

/**
 * Build a v1 payload from nodes the caller already fetched.
 *
 * This does not call `sparkClient`, does not walk missing parents, and does
 * not classify. Capture must already have satisfied {@link AncestorFetch}:
 * parents included while operators were reachable. An empty `ancestorChainHex`
 * is stored as given (a root, or a gap). Call `assessChain` / `classifyLeaves`
 * before treating a leaf as eligible. Signing is `signBundle`.
 */
export function buildBundleFromNodes(input: BuildBundleFromNodesInput): RecoveryBundlePayload {
  return normalizePayload({
    schema: 1,
    walletIdentity: input.identity,
    freshness: {
      capturedAt: input.capturedAt,
      trigger: input.trigger,
      knownIncomplete: input.knownIncomplete,
    },
    leaves: input.leaves.map((leaf) => ({
      leafId: leaf.leafId,
      valueSats: leaf.valueSats,
      treeNodeHex: leaf.treeNodeHex,
      ancestorChainHex: [...leaf.ancestorChainHex],
      status: leaf.status,
      ...(leaf.timelock ? { timelock: leaf.timelock } : {}),
    })),
  })
}
