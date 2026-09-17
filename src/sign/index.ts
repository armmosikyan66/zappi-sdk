import { SparkWallet, type Bech32mTokenIdentifier } from '@buildonspark/spark-sdk'
import { DEFAULT_WALLET_NETWORK } from '../constants'
import type {
  CreateWalletSignerOptions,
  WalletSigner,
} from './wallet-signer-port'

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

  let wallet: SparkWallet | null = null
  let cleanupFns: Array<() => Promise<void>> = []

  try {
    const initialized = await SparkWallet.initialize({
      mnemonicOrSeed: mnemonic,
      accountNumber,
      options: { network },
    })
    wallet = initialized.wallet
  } catch (error) {
    throw new WalletSignerError(
      'INIT_FAILED',
      `Wallet initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const signer: WalletSigner = {
    async transferUsdb({ tokenIdentifier, tokenAmount, receiverSparkAddress }) {
      if (!wallet) {
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
      const w = wallet
      wallet = null
      if (w && typeof w.cleanup === 'function') {
        try {
          await w.cleanup()
        } catch {
          // Best-effort cleanup; never throw.
        }
      }
      for (const fn of cleanupFns) {
        try {
          await fn()
        } catch {
          // ignore
        }
      }
      cleanupFns = []
    },
  }
  return signer
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
