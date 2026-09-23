import { beforeEach, describe, expect, it, vi } from 'vitest'

const getOrCreateWallet = vi.fn()
const cleanup = vi.fn(async () => undefined)
const getCachedBalance = vi.fn(async () => ({
  tokenBalances: new Map([
    ['btkn1usdb', { ownedBalance: 25_000_000n, availableToSendBalance: 20_000_000n }],
  ]),
}))
const on = vi.fn()

vi.mock('@buildonspark/spark-sdk', () => ({
  SparkWallet: { getOrCreateWallet },
  SparkWalletEvent: {
    TokenBalanceUpdate: 'token-balance:update',
    StreamConnected: 'stream:connected',
  },
}))

const { subscribeWalletTokenBalances, withHeldSparkWallet } = await import('../src/sign/index')

const opts = {
  mnemonic: 'test mnemonic twelve words here unused unused unused unused unused unused unused unused',
  accountNumber: 0,
  network: 'MAINNET' as const,
}

beforeEach(() => {
  getOrCreateWallet.mockReset()
  cleanup.mockClear()
  getCachedBalance.mockClear()
  on.mockClear()
  getOrCreateWallet.mockImplementation(async () => ({
    wallet: { on, getCachedBalance, cleanup, transferTokens: vi.fn() },
  }))
})

describe('subscribeWalletTokenBalances', () => {
  it('shares one wallet across a subscriber and a later hold', async () => {
    const seen: string[] = []
    const stop = await subscribeWalletTokenBalances(opts, (balances) => {
      seen.push(balances.btkn1usdb?.availableToSendBalance ?? '')
    })
    await vi.waitFor(() => {
      expect(seen).toContain('20000000')
    })
    await withHeldSparkWallet(opts, async () => undefined)

    expect(getOrCreateWallet).toHaveBeenCalledTimes(1)
    expect(cleanup).not.toHaveBeenCalled()

    await stop()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
