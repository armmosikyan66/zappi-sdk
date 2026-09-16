import { describe, expect, it } from 'vitest'
import { ZappiClient } from '../src/client/zappi-client'

const CATALOG = {
  ok: true,
  options: [
    {
      asset: 'btc',
      networks: [
        {
          id: 'mainnet',
          name: 'Bitcoin',
          typicalFeeCopy: '~$0.10–1',
          estimatedArrivalCopy: 'Usually instant',
        },
        {
          id: 'lightning',
          name: 'Lightning',
          typicalFeeCopy: '~$0.01',
          estimatedArrivalCopy: 'Instant',
        },
      ],
    },
    {
      asset: 'usdc',
      networks: [
        {
          id: 'base',
          name: 'Base',
          typicalFeeCopy: '~$0.01–0.10',
          estimatedArrivalCopy: '~1–3 min',
        },
      ],
    },
  ],
}

type Captured = { method: string; url: string; body: unknown }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function clientWith(handler: (req: Captured) => Response): {
  client: ZappiClient
  calls: Captured[]
} {
  const calls: Captured[] = []
  const client = new ZappiClient({
    apiUrl: 'http://nest.test',
    auth: { kind: 'projectKey', projectApiKey: 'pk_test' },
    fetch: (async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      const req: Captured = { method, url, body }
      calls.push(req)
      return handler(req)
    }) as typeof fetch,
  })
  return { client, calls }
}

describe('createPartnerDepositDestination', () => {
  it('POSTs accumulation-address for USDC and maps nested sourceToken', async () => {
    const { client, calls } = clientWith((req) => {
      if (req.url.endsWith('/api/wallet/deposit-options')) {
        return jsonResponse(CATALOG)
      }
      if (req.url.endsWith('/api/wallet/accumulation-address')) {
        return jsonResponse({
          ok: true,
          accumulationAddressId: 'acc_1',
          depositAddress: '0xAccum',
          recipientSparkAddress: 'spark1product',
          sourceChain: 'base',
          sourceAsset: 'USDC',
          destinationAsset: 'USDB',
          sourceToken: {
            chainId: 8453,
            contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            decimals: 6,
          },
        })
      }
      return jsonResponse({ ok: false, error: 'NOT_FOUND' }, 404)
    })

    const dest = await client.createPartnerDepositDestination(
      { asset: 'usdc', network: 'base' },
      { userId: 'user_123' },
    )

    expect(dest.address).toBe('0xAccum')
    expect(dest.feesCopy).toBe('~$0.01–0.10')
    expect(dest.estimatedArrivalCopy).toBe('~1–3 min')
    expect(dest.tokenContract).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    expect(dest.qrPayload).toContain('ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer')

    const accum = calls.find((call) => call.url.endsWith('/api/wallet/accumulation-address'))
    expect(accum?.method).toBe('POST')
    expect(accum?.body).toMatchObject({
      userId: 'user_123',
      sourceChain: 'base',
      sourceAsset: 'USDC',
      destinationAsset: 'USDB',
      idempotencyKey: 'acu:deposit:user_123:base:usdc',
    })
  })

  it('POSTs liquidation-address for BTC mainnet', async () => {
    const { client, calls } = clientWith((req) => {
      if (req.url.endsWith('/api/wallet/deposit-options')) return jsonResponse(CATALOG)
      if (req.url.endsWith('/api/wallet/liquidation-address')) {
        return jsonResponse({
          ok: true,
          addressId: 'liq_1',
          depositAddress: 'bc1qtest',
          destinationChain: 'spark',
          destinationAsset: 'USDB',
          destinationAddress: 'spark1product',
        })
      }
      return jsonResponse({ ok: false }, 404)
    })

    const dest = await client.createPartnerDepositDestination(
      { asset: 'btc', network: 'mainnet' },
      { userId: 'user_123' },
    )

    expect(dest.address).toBe('bc1qtest')
    expect(dest.qrPayload).toBe('bitcoin:bc1qtest')
    const liq = calls.find((call) => call.url.endsWith('/api/wallet/liquidation-address'))
    expect(liq?.body).toMatchObject({
      userId: 'user_123',
      nativeReference: 'user_123',
      destinationAsset: 'USDB',
      idempotencyKey: 'liq:deposit:user_123:btc:mainnet',
    })
  })

  it('POSTs partner lightning-address for BTC lightning', async () => {
    const { client } = clientWith((req) => {
      if (req.url.endsWith('/api/wallet/deposit-options')) return jsonResponse(CATALOG)
      if (req.url.endsWith('/api/partner/wallet/lightning-address')) {
        return jsonResponse({
          ok: true,
          address: 'puser@zappi.money',
          username: 'puser',
          domain: 'zappi.money',
          enabled: true,
          lnurl: 'lnurl1dp68gurn8ghj7',
        })
      }
      return jsonResponse({ ok: false }, 404)
    })

    const dest = await client.createPartnerDepositDestination(
      { asset: 'btc', network: 'lightning' },
      { userId: 'user_123' },
    )

    expect(dest.address).toBe('puser@zappi.money')
    expect(dest.qrPayload).toBe('lightning:puser@zappi.money')
    expect(dest.uriScheme).toBe('lightning:')
  })

  it('throws LIGHTNING_DISABLED when nest reports the rail off', async () => {
    const { client } = clientWith((req) => {
      if (req.url.endsWith('/api/wallet/deposit-options')) return jsonResponse(CATALOG)
      if (req.url.endsWith('/api/partner/wallet/lightning-address')) {
        return jsonResponse({
          ok: true,
          address: 'puser@zappi.money',
          username: 'puser',
          domain: 'zappi.money',
          enabled: false,
          lnurl: '',
        })
      }
      return jsonResponse({ ok: false }, 404)
    })

    await expect(
      client.createPartnerDepositDestination(
        { asset: 'btc', network: 'lightning' },
        { userId: 'user_123' },
      ),
    ).rejects.toMatchObject({ code: 'LIGHTNING_DISABLED', status: 503 })
  })

  it('throws DEPOSIT_RAIL_UNAVAILABLE when the catalog omits the combo', async () => {
    const { client } = clientWith((req) => {
      if (req.url.endsWith('/api/wallet/deposit-options')) {
        return jsonResponse({ ok: true, options: [] })
      }
      if (req.url.endsWith('/api/wallet/accumulation-address')) {
        return jsonResponse({
          ok: true,
          accumulationAddressId: 'acc_1',
          depositAddress: '0xAccum',
          recipientSparkAddress: 'spark1product',
          sourceChain: 'solana',
          sourceAsset: 'USDC',
          destinationAsset: 'USDB',
        })
      }
      return jsonResponse({ ok: false }, 404)
    })

    await expect(
      client.createPartnerDepositDestination(
        { asset: 'usdc', network: 'solana' },
        { userId: 'user_123' },
      ),
    ).rejects.toMatchObject({ code: 'DEPOSIT_RAIL_UNAVAILABLE', status: 400 })
  })
})
