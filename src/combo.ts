import type {
  AssetId,
  BtcNetwork,
  CashierCombo,
  NetworkId,
  StableNetwork,
} from './types/cashier'

export const CASHIER_ASSETS = ['btc', 'usdc', 'usdt', 'eth'] as const satisfies readonly AssetId[]

export const BTC_NETWORKS = ['mainnet', 'lightning'] as const satisfies readonly BtcNetwork[]

export const STABLE_NETWORKS = [
  'solana',
  'tron',
  'base',
  'arbitrum',
  'ethereum',
  'optimism',
  'polygon',
  'bsc',
  'avalanche',
] as const satisfies readonly StableNetwork[]

export const ALL_CASHIER_NETWORKS = [...BTC_NETWORKS, ...STABLE_NETWORKS] as const

/** Type guard: is this string a known cashier asset id? */
export function isCashierAsset(value: string | null): value is AssetId {
  return value !== null && (CASHIER_ASSETS as readonly string[]).includes(value)
}

/** Type guard: is this string a known cashier network id? */
export function isCashierNetwork(value: string | null): value is NetworkId {
  return (
    value !== null && (ALL_CASHIER_NETWORKS as readonly string[]).includes(value)
  )
}

/** Is this network a BTC network? */
export function isBtcNetwork(value: string): value is BtcNetwork {
  return value === 'mainnet' || value === 'lightning'
}

/** Is this network a stable/ETH network? */
export function isStableNetwork(value: string): value is StableNetwork {
  return (STABLE_NETWORKS as readonly string[]).includes(value)
}

/** Is this asset a stablecoin? */
export function isStableAsset(value: string): value is 'usdc' | 'usdt' {
  return value === 'usdc' || value === 'usdt'
}

/**
 * Is the (asset, network) pairing valid? Encodes the catalog constraints:
 * - btc → mainnet | lightning
 * - eth → ethereum only
 * - tron → usdt only (Orchestra has spark:USDB ↔ tron:USDT, not USDC or native TRX)
 * - usdc/usdt → any stable network (subject to the tron rule above)
 */
export function isValidCashierCombo(
  asset: AssetId | null,
  network: NetworkId | null,
): network is NetworkId {
  if (!asset || !network) return false
  if (asset === 'btc') return (BTC_NETWORKS as readonly string[]).includes(network)
  if (asset === 'eth') return network === 'ethereum'
  // Orchestra has spark:USDB ↔ tron:USDT, not USDC or native TRX.
  if (network === 'tron') return asset === 'usdt'
  return (STABLE_NETWORKS as readonly string[]).includes(network)
}

/** Build a typed combo from a validated (asset, network) pair. */
export function buildCashierCombo(asset: AssetId, network: NetworkId): CashierCombo {
  if (asset === 'btc') return { asset: 'btc', network: network as BtcNetwork }
  if (asset === 'eth') return { asset: 'eth', network: 'ethereum' }
  return { asset, network: network as StableNetwork }
}

/** Resolve a typed combo from possibly-null inputs, or null if invalid. */
export function resolveCashierCombo(
  asset: AssetId | null,
  network: NetworkId | null,
): CashierCombo | null {
  if (!asset || !isValidCashierCombo(asset, network)) return null
  return buildCashierCombo(asset, network)
}

/** Parse query/path strings into a typed combo without assuming they are typed. */
export function parseCashierCombo(
  asset: string | null,
  network: string | null,
): CashierCombo | null {
  if (!isCashierAsset(asset) || !isCashierNetwork(network)) return null
  return resolveCashierCombo(asset, network)
}

/** Is this a BTC combo (asset === 'btc')? */
export function isBtcCombo(combo: CashierCombo): boolean {
  return combo.asset === 'btc'
}

/** Is this a stable/ETH combo (non-BTC)? */
export function isStableCombo(combo: CashierCombo): boolean {
  return combo.asset !== 'btc'
}
