import {
  SparkWallet,
  SparkWalletEvent,
  type SparkWalletEvents,
} from '@buildonspark/spark-sdk'

/**
 * One live SparkWallet per seed. `SparkWallet.initialize()` does not dedupe
 * and opens a second gRPC event stream. There is still no address-only
 * listener (checked through spark-sdk 0.12.1): a balance subscription needs
 * the mnemonic. Wallets this process does not hold stay on
 * `ZappiClient.getWalletBalance` / `getPotBalance`.
 */

export interface NormalizedWalletSession {
  mnemonic: string
  accountNumber: number
  network: 'MAINNET' | 'REGTEST'
}

export interface WalletTokenBalanceAmounts {
  ownedBalance: string
  availableToSendBalance: string
}

export type WalletTokenBalances = Record<string, WalletTokenBalanceAmounts>

type TokenListener = (balances: WalletTokenBalances) => void

interface Hold {
  wallet: SparkWallet
  count: number
  listeners: Set<TokenListener>
  bound: boolean
}

const holds = new Map<string, Hold>()
const opening = new Map<string, Promise<SparkWallet>>()

function sessionKey(input: NormalizedWalletSession): string {
  return `${input.network}:${input.accountNumber}:${input.mnemonic}`
}

export async function acquireHeldWallet(
  input: NormalizedWalletSession,
): Promise<SparkWallet> {
  const id = sessionKey(input)
  const existing = holds.get(id)
  if (existing) {
    existing.count += 1
    return existing.wallet
  }

  let pending = opening.get(id)
  if (!pending) {
    pending = SparkWallet.getOrCreateWallet({
      mnemonicOrSeed: input.mnemonic,
      accountNumber: input.accountNumber,
      options: { network: input.network },
    }).then((opened) => opened.wallet)
    opening.set(id, pending)
  }

  try {
    const wallet = await pending
    const hold = holds.get(id) ?? {
      wallet,
      count: 0,
      listeners: new Set<TokenListener>(),
      bound: false,
    }
    hold.count += 1
    holds.set(id, hold)
    return wallet
  } finally {
    if (opening.get(id) === pending) opening.delete(id)
  }
}

export async function releaseHeldWallet(
  input: NormalizedWalletSession,
): Promise<void> {
  const id = sessionKey(input)
  const hold = holds.get(id)
  if (!hold) return
  hold.count -= 1
  if (hold.count > 0) return
  holds.delete(id)
  hold.listeners.clear()
  await hold.wallet.cleanup()
}

/**
 * Push USDB (and other token) balances for a wallet whose seed we hold.
 * Listens to `token-balance:update`. On subscribe and on `stream:connected`,
 * reads `getCachedBalance()` — a dropped stream does not replay missed events.
 */
export async function subscribeHeldWallet(
  input: NormalizedWalletSession,
  listener: TokenListener,
): Promise<() => Promise<void>> {
  const id = sessionKey(input)
  await acquireHeldWallet(input)
  const hold = holds.get(id)
  if (!hold) {
    await releaseHeldWallet(input)
    throw new Error('Spark wallet session closed before subscribe')
  }
  hold.listeners.add(listener)
  bind(hold)
  void publishCached(hold)
  return async () => {
    hold.listeners.delete(listener)
    await releaseHeldWallet(input)
  }
}

function bind(hold: Hold): void {
  if (hold.bound) return
  hold.bound = true
  hold.wallet.on(SparkWalletEvent.TokenBalanceUpdate, (event) => {
    emit(hold, event.tokenBalances)
  })
  hold.wallet.on(SparkWalletEvent.StreamConnected, () => {
    void publishCached(hold)
  })
}

function emit(
  hold: Hold,
  tokenBalances: Parameters<SparkWalletEvents['token-balance:update']>[0]['tokenBalances'],
): void {
  const record: WalletTokenBalances = {}
  for (const [tokenId, info] of tokenBalances) {
    record[tokenId] = {
      ownedBalance: info.ownedBalance.toString(),
      availableToSendBalance: info.availableToSendBalance.toString(),
    }
  }
  for (const listener of hold.listeners) listener(record)
}

async function publishCached(hold: Hold): Promise<void> {
  try {
    const { tokenBalances } = await hold.wallet.getCachedBalance()
    emit(hold, tokenBalances)
  } catch {
    // The next token-balance:update or stream:connected retries the fill.
  }
}
