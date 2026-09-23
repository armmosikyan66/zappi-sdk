import type { Bech32mTokenIdentifier } from '@buildonspark/spark-sdk'
import { DEFAULT_WALLET_NETWORK } from '../constants'
import type {
  CreateWalletSignerOptions,
  WalletSigner,
} from './wallet-signer-port'
import {
  acquireHeldWallet,
  releaseHeldWallet,
  subscribeHeldWallet,
  subscribeHeldWalletTransfers,
  type NormalizedWalletSession,
  type WalletTokenBalances,
  type WalletTransferEvent,
} from './wallet-session'

/**
 * In-process Zappi wallet USDB signer (Spark is the underlying rail). Ports
 * `bitkong/server/spark-sign/sign-usdb.mjs` into a typed module — no
 * subprocess, no argv, no env reads inside the lib.
 *
 * The mnemonic arrives only via {@link CreateWalletSignerOptions.mnemonic}.
 * The library never logs it. The partner is responsible for secure storage —
 * this matches zappi-nest's non-custodial model (the server never holds user
 * mnemonics; the Integration product wallet mnemonic lives with the partner).
 *
 * @example
 * ```ts
 * import { createWalletSigner } from '@zappi/sdk/sign'
 * const signer = await createWalletSigner({
 *   mnemonic: process.env.ZAPPI_PRODUCT_MNEMONIC!,
 *   accountNumber: 0,
 *   network: 'MAINNET',
 * })
 * const { sparkTxHash } = await signer.transferUsdb({
 *   tokenIdentifier,
 *   tokenAmount: BigInt(sendAmount),
 *   receiverSparkAddress: depositAddress,
 * })
 * await signer.cleanup()
 * ```
 */
export async function createWalletSigner(
  opts: CreateWalletSignerOptions,
): Promise<WalletSigner> {
  const session = normalizeWalletSession(opts)
  let closed = false

  let wallet
  try {
    wallet = await acquireHeldWallet(session)
  } catch (error) {
    throw new WalletSignerError(
      'INIT_FAILED',
      `Wallet initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const signer: WalletSigner = {
    async transferUsdb({ tokenIdentifier, tokenAmount, receiverSparkAddress }) {
      if (closed) {
        throw new WalletSignerError('CLEANED_UP', 'Signer has been cleaned up')
      }
      const ti = tokenIdentifier?.trim()
      const rsa = receiverSparkAddress?.trim()
      if (!ti || !rsa) {
        throw new WalletSignerError(
          'INVALID_PARAMS',
          'tokenIdentifier and receiverSparkAddress are required',
        )
      }
      if (typeof tokenAmount !== 'bigint' || tokenAmount <= 0n) {
        throw new WalletSignerError('INVALID_PARAMS', 'tokenAmount must be a positive bigint')
      }

      try {
        const sparkTxHash = await wallet.transferTokens({
          tokenIdentifier: ti as Bech32mTokenIdentifier,
          tokenAmount,
          receiverSparkAddress: rsa,
        })
        if (typeof sparkTxHash !== 'string' || !sparkTxHash.trim()) {
          throw new WalletSignerError(
            'NO_HASH',
            'Spark SDK transferTokens did not return a hash',
          )
        }
        return { sparkTxHash: sparkTxHash.trim() }
      } catch (error) {
        if (error instanceof WalletSignerError) throw error
        throw new WalletSignerError(
          'TRANSFER_FAILED',
          error instanceof Error ? error.message : String(error),
        )
      }
    },

    async cleanup() {
      if (closed) return
      closed = true
      try {
        await releaseHeldWallet(session)
      } catch {
        // Best-effort cleanup; never throw.
      }
    },
  }
  return signer
}

/**
 * Live token balances for a seed this process holds. Cold addresses (no
 * mnemonic) cannot use this — read them with `ZappiClient.getWalletBalance`
 * or `getPotBalance`, and refresh those from `subscribeCashierEvents`.
 */
export async function subscribeWalletTokenBalances(
  opts: CreateWalletSignerOptions,
  listener: (balances: WalletTokenBalances) => void,
): Promise<() => Promise<void>> {
  const session = normalizeWalletSession(opts)
  try {
    return await subscribeHeldWallet(session, listener)
  } catch (error) {
    if (error instanceof WalletSignerError) throw error
    throw new WalletSignerError(
      'INIT_FAILED',
      `Wallet initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Live incoming transfer claims for a seed this process holds. Fires on
 * `transfer:claimed` (incoming Spark-to-Spark only). Cold addresses (no
 * mnemonic) cannot use this — reconcile those via transfer list polling.
 */
export async function subscribeWalletTransfers(
  opts: CreateWalletSignerOptions,
  listener: (event: WalletTransferEvent) => void,
): Promise<() => Promise<void>> {
  const session = normalizeWalletSession(opts)
  try {
    return await subscribeHeldWalletTransfers(session, listener)
  } catch (error) {
    if (error instanceof WalletSignerError) throw error
    throw new WalletSignerError(
      'INIT_FAILED',
      `Wallet initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** Run `fn` against the shared wallet, then release this hold. */
export async function withHeldSparkWallet<T>(
  opts: CreateWalletSignerOptions,
  fn: (wallet: Awaited<ReturnType<typeof acquireHeldWallet>>) => Promise<T>,
): Promise<T> {
  const session = normalizeWalletSession(opts)
  let wallet: Awaited<ReturnType<typeof acquireHeldWallet>>
  try {
    wallet = await acquireHeldWallet(session)
  } catch (error) {
    throw new WalletSignerError(
      'INIT_FAILED',
      `Wallet initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  try {
    return await fn(wallet)
  } finally {
    await releaseHeldWallet(session)
  }
}

function normalizeWalletSession(opts: CreateWalletSignerOptions): NormalizedWalletSession {
  const mnemonic = opts.mnemonic?.trim()
  if (!mnemonic) {
    throw new WalletSignerError('MNEMONIC_REQUIRED', 'mnemonic is required')
  }
  const accountNumber = opts.accountNumber ?? 0
  if (!Number.isInteger(accountNumber) || accountNumber < 0) {
    throw new WalletSignerError('INVALID_ACCOUNT', 'accountNumber must be an integer >= 0')
  }
  const network = (opts.network ?? DEFAULT_WALLET_NETWORK).toUpperCase() === 'REGTEST'
    ? 'REGTEST'
    : 'MAINNET'
  return { mnemonic, accountNumber, network }
}

/** Error thrown by the Zappi wallet signer. */
export class WalletSignerError extends Error {
  constructor(
    readonly code:
      | 'MNEMONIC_REQUIRED'
      | 'INVALID_ACCOUNT'
      | 'INIT_FAILED'
      | 'CLEANED_UP'
      | 'INVALID_PARAMS'
      | 'NO_HASH'
      | 'TRANSFER_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'WalletSignerError'
  }
}

/* ------------------------- legacy aliases (0.1.x) ------------------------- */

/** @deprecated Renamed to {@link createWalletSigner}. */
export const createSparkSigner = createWalletSigner

/** @deprecated Renamed to {@link WalletSignerError}. */
export const SparkSignerError = WalletSignerError

export type { WalletSigner, CreateWalletSignerOptions }
export type {
  WalletTokenBalances,
  WalletTokenBalanceAmounts,
  WalletTransferEvent,
} from './wallet-session'
