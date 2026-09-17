/**
 * Structural port for a Zappi wallet USDB signer. The core SDK depends on
 * this interface only — the real implementation lives in `@zappi/sdk/sign`
 * and pulls `@buildonspark/spark-sdk`. This keeps the core tree-shakeable and
 * free of heavy crypto deps.
 */
export interface WalletSigner {
  transferUsdb(params: {
    tokenIdentifier: string
    tokenAmount: bigint
    receiverSparkAddress: string
  }): Promise<{ sparkTxHash: string }>
  cleanup(): Promise<void>
}

/** Options for creating a signer. */
export interface CreateWalletSignerOptions {
  /** Integration product wallet mnemonic. Partner-held; never logged by the SDK. */
  mnemonic: string
  /** HD account index. Defaults to 0. */
  accountNumber?: number
  /** Wallet network. Defaults to MAINNET. */
  network?: 'MAINNET' | 'REGTEST'
}

/* ------------------------- legacy aliases (0.1.x) ------------------------- */
/** @deprecated Renamed to {@link WalletSigner}. */
export type SparkSigner = WalletSigner
/** @deprecated Renamed to {@link CreateWalletSignerOptions}. */
export type CreateSparkSignerOptions = CreateWalletSignerOptions
