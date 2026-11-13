import { describe, expect, it, vi } from 'vitest'
import { FlashnetServerClient } from '../src/client/flashnet-server-client'
import { parseStandingDepositAddress } from '../src/client/parse-standing-address'
import { ZappiApiError } from '../src/errors'

describe('parseStandingDepositAddress', () => {
  it('reads a per-route source_asset_floor', () => {
    const parsed = parseStandingDepositAddress({
      standingAddressId: 'std_1',
      addresses: { tron: 'TXYZ' },
      enabled: true,
      effectiveMinimum: {
        usdCents: '1500',
        sourceAmountSmallest: '15000000',
        source: 'source_asset_floor',
      },
    })
    expect(parsed).toMatchObject({
      standingAddressId: 'std_1',
      addresses: { tron: 'TXYZ' },
      enabled: true,
      minimumUsdCents: 1500,
      minimumSource: 'source_asset_floor',
      effectiveMinimum: {
        usdCents: '1500',
        sourceAmountSmallest: '15000000',
        source: 'source_asset_floor',
      },
    })
  })

  it('reads the instruction-wide xchain_global_bound', () => {
    const parsed = parseStandingDepositAddress({
      standingAddressId: 'std_1',
      addresses: { base: '0xabc' },
      enabled: true,
      effectiveMinimum: {
        usdCents: 200,
        sourceAmountSmallest: null,
        source: 'xchain_global_bound',
      },
    })
    expect(parsed?.minimumUsdCents).toBe(200)
    expect(parsed?.minimumSource).toBe('xchain_global_bound')
    expect(parsed?.effectiveMinimum?.sourceAmountSmallest).toBeNull()
  })

  it('keeps a limits_band payload but does not treat it as a standing floor', () => {
    const parsed = parseStandingDepositAddress({
      standingAddressId: 'std_1',
      addresses: { base: '0xabc' },
      enabled: true,
      effectiveMinimum: { usdCents: '80', source: 'limits_band' },
    })
    expect(parsed?.effectiveMinimum?.source).toBe('limits_band')
    expect(parsed?.minimumUsdCents).toBeNull()
    expect(parsed?.minimumSource).toBeNull()
  })

  it('returns null cents when effectiveMinimum is missing', () => {
    const parsed = parseStandingDepositAddress({
      standingAddressId: 'std_1',
      addresses: { base: '0xabc' },
      enabled: false,
    })
    expect(parsed?.enabled).toBe(false)
    expect(parsed?.effectiveMinimum).toBeNull()
    expect(parsed?.minimumUsdCents).toBeNull()
  })

  it('rejects a non-object body', () => {
    expect(parseStandingDepositAddress(null)).toBeNull()
    expect(parseStandingDepositAddress('nope')).toBeNull()
  })
})

describe('FlashnetServerClient.getStandingDepositAddress', () => {
  it('GETs the documented path with the source rail and parses the floor', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://orchestration.flashnet.xyz/v1/standing-deposit-addresses/ref%201?sourceChain=base&sourceAsset=USDC',
      )
      expect(init?.method).toBe('GET')
      const headers = new Headers(init?.headers)
      expect(headers.get('accept')).toBe('application/json')
      expect(headers.get('authorization')).toBe('Bearer fn_test')
      return new Response(
        JSON.stringify({
          standingAddressId: 'std_1',
          addresses: { base: '0xabc' },
          enabled: true,
          effectiveMinimum: {
            usdCents: '200',
            sourceAmountSmallest: '2000000',
            source: 'xchain_global_bound',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })

    const client = new FlashnetServerClient({
      baseUrl: 'https://orchestration.flashnet.xyz/',
      serverKey: 'fn_test',
      fetchFn,
    })
    const detail = await client.getStandingDepositAddress('ref 1', {
      sourceChain: 'base',
      sourceAsset: 'USDC',
    })
    expect(detail.minimumUsdCents).toBe(200)
    expect(detail.addresses.base).toBe('0xabc')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('turns a non-2xx into ZappiApiError and keeps the status', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }),
    )
    const client = new FlashnetServerClient({
      baseUrl: 'https://orchestration.flashnet.xyz',
      serverKey: 'fn_test',
      fetchFn,
    })
    await expect(
      client.getStandingDepositAddress('missing'),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' })
    await expect(client.getStandingDepositAddress('missing')).rejects.toBeInstanceOf(
      ZappiApiError,
    )
  })
})
