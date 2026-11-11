import type { AssetId, BtcNetwork, NetworkId } from './cashier'

/** A per-wallet deep-link button rendered below the standard URI scheme. */
export interface WalletDeepLink {
  id: string
  label: string
  /** Full URI the OS will hand to the wallet app. */
  uri: string
}

interface DepositNetworkOption<N extends string> {
  id: N
  name: string
  /** Omit for "no minimum". */
  minDepositCents?: number
  /**
   * Live `/limits` band in cents. Enforcement only. Not a displayed minimum.
   */
  limitFloorCents?: number
  /** Live `/limits` band maximum in cents. Absent when the band has no max. */
  maxDepositCents?: number
  /** Source smallest units that still clear the rail. Sats for Bitcoin. */
  minAmountSmallest?: string
  /** Backend-driven display copy (no maths client-side): "<$0.01", "~$0.01–0.10", "~$1–5". */
  typicalFeeCopy?: string
  /** Backend-driven display copy: "Instant", "~15–30 seconds", "~3–12 min (12+ confirmations)". */
  estimatedArrivalCopy: string
  /** Backend-driven limit line, e.g. "min $5.00". */
  limitCopy?: string
  /**
   * All-in fee at `minimumGrossCents`, in cents. Present only with `netCents`
   * on a verified stable rail. The static catalog omits it.
   */
  feeCents?: number
  /** Estimated arrival when `minimumGrossCents` is sent, in cents. */
  netCents?: number
  /**
   * Smallest send whose net still clears the floor. Equals `minDepositCents`
   * when this row is a verified quote.
   */
  minimumGrossCents?: number
  /**
   * Learned fee rate in basis points. Verified USDC and USDT rows only.
   * Indicative: the confirm-time estimate is the fee that binds.
   */
  feeBps?: number
  /** Minimum fee in USD cents for `feeBps`. */
  feeMinCents?: number
}

/**
 * The backend-driven (asset × networks) matrix that powers the picker.
 * Discriminated by asset so a BTC option can only carry BTC networks, etc.
 */
export type DepositOption =
  | { asset: 'btc'; networks: ReadonlyArray<DepositNetworkOption<BtcNetwork>> }
  | {
      asset: 'usdc' | 'usdt' | 'eth'
      networks: ReadonlyArray<DepositNetworkOption<string>>
    }

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
  /** `robinhood` is an ETH deposit rail that is not a stable network id. */
  network: NetworkId | 'robinhood'
  address: string
  /**
   * What the QR encodes. `bitcoin:{addr}` for mainnet, `lightning:{addr}`
   * for Lightning, `ethereum:{addr}@{chainId}` for native ETH, and the
   * deposit address itself for stablecoins (USDC, USDT) so a scan matches
   * the address shown on screen.
   */
  qrPayload: string
  /** URI scheme for the "Open in wallet" affordance. Null when none applies. */
  uriScheme: string | null
  /** Short marketing copy below the QR. Backend-driven. */
  feesCopy: string
  estimatedArrivalCopy: string
  /** Per-wallet deep-link buttons. Empty array means none. */
  walletDeepLinks: ReadonlyArray<WalletDeepLink>
  /**
   * All-in fee at `minimumGrossCents`, in cents. Same catalog probe as
   * `netCents`. Absent when the rail has no verified quote.
   */
  feeCents?: number
  /** Estimated arrival when `minimumGrossCents` is sent, in cents. */
  netCents?: number
  /** Smallest send whose net still clears the floor, in cents. */
  minimumGrossCents?: number
  /** Catalog floor for this rail, in cents. The list and the card share it. */
  minDepositCents?: number
  /** Live `/limits` band maximum in cents. Absent when the band has no max. */
  maxDepositCents?: number
  /** Verified source floor in smallest units. Sats for Bitcoin. */
  minAmountSmallest?: string
  /** Hold / limit explanation from the catalog. */
  limitCopy?: string
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
  /** Available Spark BTC in sats when Nest could read it. */
  balanceBtcSats?: number
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
