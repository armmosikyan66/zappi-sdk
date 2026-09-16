import type { CustodyMode, NetworkId, SparkNetwork, WithdrawCombo } from './types/cashier'
import type { WithdrawNetworkOption } from './types/withdraw'

/** Withdrawal-option network id → Flashnet destination chain. */
export const NETWORK_TO_CHAIN: Record<string, string> = {
  mainnet: 'bitcoin',
  lightning: 'lightning',
  solana: 'solana',
  base: 'base',
  arbitrum: 'arbitrum',
  ethereum: 'ethereum',
  optimism: 'optimism',
  polygon: 'polygon',
  bsc: 'bsc',
  binance: 'bsc',
  avalanche: 'avalanche',
  tron: 'tron',
}

export const ASSET_TO_FLASHNET: Record<string, string> = {
  BTC: 'BTC',
  USDC: 'USDC',
  USDT: 'USDT',
}

/** USDB has 6 decimals at 1:1 with USD: 1 cent = 10_000 USDB smallest units. */
export const USDB_UNITS_PER_CENT = 10_000

export const SOURCE_CUSTODY_CUSTODIAL = 'custodial' as const satisfies CustodyMode
export const SOURCE_CUSTODY_WALLET = 'user-held' as const satisfies CustodyMode

export const WITHDRAW_STATUS_AWAITING_SIGNATURE = 'awaiting_signature'

/** HD account index for Integration product wallets created in the Zappi client. */
export const PRODUCT_SPARK_ACCOUNT_NUMBER = 0

/** Default Spark network when none is provided. */
export const DEFAULT_SPARK_NETWORK: SparkNetwork = 'MAINNET'

/** Default webhook timestamp tolerance (5 minutes), matches nest config. */
export const DEFAULT_WEBHOOK_TOLERANCE_MS = 300_000

/** Withdraw quote TTL enforced by the BFF via HMAC tokens. */
export const WITHDRAW_QUOTE_TTL_MS = 2 * 60 * 1000

/** Quote token version prefix. Bump if the payload shape changes. */
export const QUOTE_TOKEN_VERSION = 'v1'

export type WithdrawSourceWallet = {
  sparkAddress: string
  accountNumber: number
}

export type ResolvedWithdrawRoute = {
  chain: string
  flashnetAsset: string
  network: WithdrawNetworkOption<NetworkId>
}

/** Fallback arrival copy used when nest omits `estimatedArrivalCopy`. */
export const FALLBACK_ARRIVAL: Record<string, string> = {
  mainnet: 'Varies by network',
  lightning: 'Instant',
  solana: '~15 seconds',
  tron: '~1 minute',
  base: '~1 minute',
  arbitrum: '~1 minute',
  ethereum: '~3 minutes',
  optimism: '~1 minute',
  polygon: '~2 minutes',
  bsc: '~1 minute',
  avalanche: '~1 minute',
}

/** Arrival copy for a combo, falling back to the catalog default. */
export function withdrawArrivalCopy(combo: WithdrawCombo): string {
  return FALLBACK_ARRIVAL[combo.network] ?? 'Quoted before confirm'
}
