/**
 * Cashier primitives: asset / network identifiers and the discriminated
 * unions that constrain valid (asset, network) pairings at the type level.
 *
 * Ported from `web/lib/api/types.ts` and `web/lib/cashier/combos.ts` so the
 * contract lives in one place. The unions are the part that breaks most
 * easily when hand-synced across nest DTOs, the BFF, and partner schemas.
 */

/** Deposit asset the user picks at step 1 of the wizard. */
export type AssetId = 'btc' | 'usdc' | 'usdt' | 'eth'

/** Bitcoin networks. `btc` covers both; the network differentiates them. */
export type BtcNetwork = 'mainnet' | 'lightning'

/** Stablecoin + native-Ether chains. Orchestra routes USDB ↔ these. */
export type StableNetwork =
  | 'solana'
  | 'tron'
  | 'base'
  | 'arbitrum'
  | 'ethereum'
  | 'optimism'
  | 'polygon'
  | 'bsc'
  | 'avalanche'

/** Every network id the cashier understands. */
export type NetworkId = BtcNetwork | StableNetwork

/**
 * Valid (asset, network) combinations. The union shape means TS rejects bad
 * pairings at the type system level — `{ asset: 'usdc', network: 'lightning' }`
 * won't compile. Used by every deposit/withdraw primitive.
 */
export type DepositCombo =
  | { asset: 'btc'; network: BtcNetwork }
  | { asset: 'usdc' | 'usdt'; network: StableNetwork }
  | { asset: 'eth'; network: 'ethereum' }

/** Valid (asset, network) pairs for on/off-ramp flows. */
export type CashierCombo = DepositCombo
export type WithdrawCombo = CashierCombo

/** Which ledger a balance / amount belongs to. */
export type AccountCurrency = 'btc' | 'usd'

/** Spark network selector used by the signer and address inspection. */
export type SparkNetwork = 'MAINNET' | 'REGTEST'

/** Custody model. Withdraw always resolves to `user-held` in current code. */
export type CustodyMode = 'custodial' | 'user-held'
