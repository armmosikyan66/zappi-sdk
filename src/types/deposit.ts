import type { AssetId, BtcNetwork, NetworkId, StableNetwork } from './cashier'

/** A per-wallet deep-link button rendered below the standard URI scheme. */
export interface WalletDeepLink {
  id: string
  label: string
  /** Full URI the OS will hand to the wallet app. */
  uri: string
}

interface DepositNetworkOption<N extends NetworkId> {
  id: N
  name: string
  /** Omit for "no minimum". */
  minDepositCents?: number
  /** Backend-driven display copy (no maths client-side): "<$0.01", "~$0.01–0.10", "~$1–5". */
  typicalFeeCopy?: string
  /** Backend-driven display copy: "Instant", "~15–30 seconds", "~3–12 min (12+ confirmations)". */
  estimatedArrivalCopy: string
  /** Backend-driven limit line, e.g. "min $5.00". */
  limitCopy?: string
}

/**
 * The backend-driven (asset × networks) matrix that powers the picker.
 * Discriminated by asset so a BTC option can only carry BTC networks, etc.
 */
export type DepositOption =
  | { asset: 'btc'; networks: ReadonlyArray<DepositNetworkOption<BtcNetwork>> }
  | { asset: 'usdc' | 'usdt'; networks: ReadonlyArray<DepositNetworkOption<StableNetwork>> }
  | { asset: 'eth'; networks: ReadonlyArray<DepositNetworkOption<'ethereum'>> }

/**
 * A persistent deposit destination. One per (user, asset, network). The
 * frontend never holds a "DepositIntent" — every address is durable.
 *
 * For Lightning, `address` is the Lightning Address (LNURL-pay,
 * `username@zappi.app`) — not a BOLT11 invoice. The per-amount BOLT11
 * sub-flow goes through {@link LightningInvoice} instead.
 */
export interface DepositDestination {
  asset: AssetId
  network: NetworkId
  address: string
  /**
   * What the QR encodes. `bitcoin:{addr}` for mainnet, `lightning:{addr}`
   * for Lightning, EIP-681 `ethereum:<token>@chainId/transfer?address=` for
   * EVM ERC-20 stables when Orchestra returned a contract, raw address
   * otherwise.
   */
  qrPayload: string
  /** URI scheme for the "Open in wallet" affordance. Null when none applies. */
  uriScheme: string | null
  /** Short marketing copy below the QR. Backend-driven. */
  feesCopy: string
  estimatedArrivalCopy: string
  /** Per-wallet deep-link buttons. Empty array means none. */
  walletDeepLinks: ReadonlyArray<WalletDeepLink>
  /** ERC-20 contract on the source chain, from live Orchestra routes. */
  tokenContract?: string | null
  /** EVM chain id for EIP-681 (`@chainId`). */
  chainId?: number | null
  tokenDecimals?: number | null
}

/** Amount-locked BOLT11 invoice produced by the Lightning sub-flow. */
export interface LightningInvoice {
  bolt11: string
  amountSats: number
  expiresAt: string
}

/** Request body for creating a user deposit address. */
export interface CreateDepositAddressRequest {
  asset: AssetId
  network: NetworkId
  /** Optional EIP-681 source token for EVM ERC-20 deposits. */
  sourceToken?: string
}

/** Readonly wallet balance envelope returned by the balance endpoint. */
export interface WalletBalance {
  ok: true
  walletAddress: string
  readonlyReady: boolean
  tokenBalances: Record<
    string,
    { ownedBalance: string; availableToSendBalance: string }
  >
  pendingTransfers: unknown[]
  recentTransfers: unknown[]
}

/** @deprecated Renamed to {@link WalletBalance}. */
export type SparkWalletBalance = WalletBalance

/**
 * Backend → frontend deposit event. Two kinds:
 * - `pending` — stables only. Orchestra detected the inbound; chain not final yet.
 * - `credited` — final, balance updated. Fires the receipt toast.
 *
 * BTC rails credit the Dollar ledger after server-side conversion. BTC mainnet
 * / Lightning skip `pending` when conversion is instant; may emit `pending`
 * while on-chain BTC is unconfirmed.
 */
export type DepositEvent =
  | {
      kind: 'pending'
      transactionId: string
      asset: AssetId
      network: NetworkId
      amountSats?: number
      amountCents?: number
    }
  | {
      kind: 'credited'
      transactionId: string
      asset: AssetId
      network: NetworkId
      amountSats?: number
      amountCents?: number
    }
