import { describe, expect, it } from 'vitest'
import {
  depositQrPayload,
  depositWalletDeepLinks,
  SPARK_TEST_WALLET_URL,
} from '../src/client/presentation/deposit-presentation'

describe('depositQrPayload', () => {
  it('encodes USDC on an EVM chain as the deposit address', () => {
    const address = '0x2222222222222222222222222222222222222222'
    expect(
      depositQrPayload(
        { asset: 'usdc', network: 'base' },
        address,
        undefined,
        {
          tokenContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          chainId: 8453,
        },
      ),
    ).toBe(address)
  })

  it('keeps Spark identity addresses as a raw QR payload', () => {
    const address =
      'sparkrt1pgss9tadw7jj52mz8yu48tzcvq3kxsct69f55drud56rtnwgqpajyf0stj62w6'
    expect(
      depositQrPayload({ asset: 'btc', network: 'mainnet' }, address),
    ).toBe(address)
  })
})

describe('depositWalletDeepLinks', () => {
  it('keeps Phantom on USDC-Solana even in REGTEST', () => {
    const links = depositWalletDeepLinks(
      { asset: 'usdc', network: 'solana' },
      'solana:abc',
      undefined,
      'REGTEST',
    )
    expect(links[0]?.id).toBe('phantom')
  })

  it('swaps Cash App / Strike for the Spark test wallet on REGTEST', () => {
    expect(
      depositWalletDeepLinks(
        { asset: 'btc', network: 'mainnet' },
        'bitcoin:bc1qtest',
        undefined,
        'REGTEST',
      ),
    ).toEqual([
      {
        id: 'spark-test-wallet',
        label: 'Spark test wallet',
        uri: SPARK_TEST_WALLET_URL,
      },
    ])
  })
})
