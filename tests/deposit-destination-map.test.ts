import { describe, expect, it } from 'vitest'
import { mapNestDepositDestination, nestSourceTokenMeta } from '../src/client/mappers/deposit-destination-map'
import { evmErc20TransferUri } from '../src/client/presentation/deposit-presentation'

describe('nestSourceTokenMeta', () => {
  it('reads nested nest sourceToken', () => {
    expect(
      nestSourceTokenMeta({
        sourceToken: {
          chainId: 8453,
          contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          decimals: 6,
        },
      }),
    ).toEqual({
      tokenContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      chainId: 8453,
      tokenDecimals: 6,
    })
  })

  it('prefers flattened aliases over nested sourceToken', () => {
    expect(
      nestSourceTokenMeta({
        tokenContract: '0xflat',
        chainId: 1,
        tokenDecimals: 18,
        sourceToken: {
          chainId: 8453,
          contractAddress: '0xnested',
          decimals: 6,
        },
      }),
    ).toEqual({
      tokenContract: '0xflat',
      chainId: 1,
      tokenDecimals: 18,
    })
  })

  it('returns nulls when nest omitted token meta', () => {
    expect(nestSourceTokenMeta({ depositAddress: '0xabc' })).toEqual({
      tokenContract: null,
      chainId: null,
      tokenDecimals: null,
    })
  })
})

describe('mapNestDepositDestination', () => {
  it('builds an EIP-681 QR from nested sourceToken', () => {
    const combo = { asset: 'usdc', network: 'base' } as const
    const dest = mapNestDepositDestination(combo, {
      ok: true,
      depositAddress: '0xDeposit',
      sourceToken: {
        chainId: 8453,
        contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
      },
    })
    expect(dest.address).toBe('0xDeposit')
    expect(dest.qrPayload).toBe(
      evmErc20TransferUri(
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        8453,
        '0xDeposit',
      ),
    )
    expect(dest.tokenContract).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    expect(dest.chainId).toBe(8453)
  })

  it('throws when nest omits the address', () => {
    expect(() =>
      mapNestDepositDestination({ asset: 'usdc', network: 'base' }, { ok: true }),
    ).toThrow(/missing depositAddress/)
  })
})
