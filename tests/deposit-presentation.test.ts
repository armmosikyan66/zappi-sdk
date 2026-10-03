import { describe, expect, it } from 'vitest'
import {
  depositQrPayload,
  depositWalletDeepLinks,
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
  it('offers Phantom for USDC on Solana', () => {
    const links = depositWalletDeepLinks(
      { asset: 'usdc', network: 'solana' },
      'solana:abc',
      undefined,
      'MAINNET',
    )
    expect(links[0]?.id).toBe('phantom')
  })

  it('offers Cash App for a mainnet Bitcoin deposit', () => {
    expect(
      depositWalletDeepLinks(
        { asset: 'btc', network: 'mainnet' },
        'bitcoin:bc1qtest',
        undefined,
        'MAINNET',
      )[0]?.id,
    ).toBe('cashapp')
  })
})
