import type { DepositOption } from '../../types/deposit'
import {
  isBtcNetwork,
  isCashierAsset,
  isStableNetwork,
} from '../../combo'
import type { NestDepositOptionsResponse } from '../../types/partner'

/** Spark network stamped by nest onto the deposit catalog. */
export function nestSparkNetwork(
  payload: NestDepositOptionsResponse | null | undefined,
): 'MAINNET' | 'REGTEST' {
  return payload?.sparkNetwork === 'REGTEST' ? 'REGTEST' : 'MAINNET'
}

/** Map a raw nest deposit-options response to the clean frontend catalog. */
export function mapNestDepositOptions(
  payload: NestDepositOptionsResponse,
): DepositOption[] {
  const mapped: DepositOption[] = []

  for (const option of payload.options) {
    if (!isCashierAsset(option.asset)) continue

    if (option.asset === 'btc') {
      const networks = option.networks.flatMap((network) => {
        if (!isBtcNetwork(network.id)) return []
        return [
          {
            id: network.id,
            name: network.name,
            typicalFeeCopy: network.typicalFeeCopy,
            estimatedArrivalCopy: network.estimatedArrivalCopy,
            ...(network.minDepositCents !== undefined
              ? { minDepositCents: network.minDepositCents }
              : {}),
            ...(network.limitCopy ? { limitCopy: network.limitCopy } : {}),
          },
        ]
      })
      if (networks.length === 0) continue
      mapped.push({ asset: 'btc', networks })
      continue
    }

    if (option.asset === 'eth') {
      const networks = option.networks.flatMap((network) => {
        if (network.id !== 'ethereum') return []
        return [
          {
            id: 'ethereum' as const,
            name: network.name,
            typicalFeeCopy: network.typicalFeeCopy,
            estimatedArrivalCopy: network.estimatedArrivalCopy,
            ...(network.minDepositCents !== undefined
              ? { minDepositCents: network.minDepositCents }
              : {}),
            ...(network.limitCopy ? { limitCopy: network.limitCopy } : {}),
          },
        ]
      })
      if (networks.length === 0) continue
      mapped.push({ asset: 'eth', networks })
      continue
    }

    const networks = option.networks.flatMap((network) => {
      if (!isStableNetwork(network.id)) return []
      return [
        {
          id: network.id,
          name: network.name,
          typicalFeeCopy: network.typicalFeeCopy,
          estimatedArrivalCopy: network.estimatedArrivalCopy,
          ...(network.minDepositCents !== undefined
            ? { minDepositCents: network.minDepositCents }
            : {}),
          ...(network.limitCopy ? { limitCopy: network.limitCopy } : {}),
        },
      ]
    })
    if (networks.length === 0) continue
    mapped.push({ asset: option.asset, networks })
  }

  return mapped
}

/** Look up display copy for a (asset, network) from a mapped catalog. */
export function lookupDepositNetworkCopy(
  options: DepositOption[],
  asset: string,
  network: string,
): { feesCopy: string; estimatedArrivalCopy: string } | null {
  const option = options.find((entry) => entry.asset === asset)
  const match = option?.networks.find((entry) => entry.id === network)
  if (!match) return null
  return {
    feesCopy: match.typicalFeeCopy ?? match.name,
    estimatedArrivalCopy: match.estimatedArrivalCopy,
  }
}
