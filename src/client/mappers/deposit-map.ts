import type { DepositOption } from '../../types/deposit'
import { isCashierAsset, isOrchestraDepositChain, isBtcNetwork } from '../../combo'
import type { NestDepositOptionsResponse } from '../../types/partner'
import { publishedFeeModel, quotedRailFields } from './published-fee'

/** Spark network stamped by nest onto the deposit catalog. */
export function nestSparkNetwork(
  payload: NestDepositOptionsResponse | null | undefined,
): 'MAINNET' | 'REGTEST' {
  const value = String(payload?.sparkNetwork ?? '').trim().toUpperCase()
  if (value === '' || value === 'MAINNET') return 'MAINNET'
  if (value === 'REGTEST') return 'REGTEST'
  throw new Error('SPARK_NETWORK must be MAINNET or REGTEST.')
}

/** Map a raw nest deposit-options response to the clean frontend catalog. */
export function mapNestDepositOptions(
  payload: NestDepositOptionsResponse,
): DepositOption[] {
  const mapped: DepositOption[] = []

  for (const option of payload.options) {
    if (!isCashierAsset(option.asset)) continue

    if (option.asset === 'usdb') continue

    if (option.asset === 'btc') {
      const networks = option.networks.flatMap((network) => {
        if (!isBtcNetwork(network.id)) return []
        return [{ ...depositNetwork(option.asset, network), id: network.id }]
      })
      if (networks.length === 0) continue
      mapped.push({ asset: 'btc', networks })
      continue
    }

    const networks = option.networks.flatMap((network) => {
      if (!isOrchestraDepositChain(network.id)) return []
      return [depositNetwork(option.asset, network)]
    })
    if (networks.length === 0) continue
    mapped.push({ asset: option.asset, networks })
  }

  return mapped
}

function depositNetwork(asset: string, network: {
  id: string
  name: string
  typicalFeeCopy?: string
  estimatedArrivalCopy: string
  minDepositCents?: number
  limitFloorCents?: number
  maxDepositCents?: number
  minAmountSmallest?: string
  limitCopy?: string
  feeCents?: number
  netCents?: number
  minimumGrossCents?: number
  feeBps?: number
  feeMinCents?: number
}) {
  return {
    id: network.id,
    name: network.name,
    typicalFeeCopy: network.typicalFeeCopy,
    estimatedArrivalCopy: network.estimatedArrivalCopy,
    ...(network.minDepositCents !== undefined
      ? { minDepositCents: network.minDepositCents }
      : {}),
    ...(network.limitFloorCents !== undefined
      ? { limitFloorCents: network.limitFloorCents }
      : {}),
    ...(network.maxDepositCents !== undefined
      ? { maxDepositCents: network.maxDepositCents }
      : {}),
    ...(network.minAmountSmallest
      ? { minAmountSmallest: network.minAmountSmallest }
      : {}),
    ...(network.limitCopy ? { limitCopy: network.limitCopy } : {}),
    ...quotedRailFields(network),
    ...publishedFeeModel(asset, network),
  }
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
