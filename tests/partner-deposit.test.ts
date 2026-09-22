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
  it('POSTs standing-deposit-address for USDC and maps nested sourceToken', async () => {
    const { client, calls } = clientWith((req) => {
      if (req.url.endsWith('/api/wallet/deposit-options')) {
        return jsonResponse(CATALOG)
      }
      if (req.url.endsWith('/api/wallet/standing-deposit-address')) {
        return jsonResponse({
          ok: true,
          mode: 'created',
          created: true,
          projectId: 'native',
          ref: 'std:native:user_123:spark:USDB:spark1product',
          destinationChain: 'spark',
          destinationAsset: 'USDB',
          destinationAddress: 'spark1product',
          addresses: { base: '0xStanding' },
          depositAddress: '0xStanding',
          sourceChain: 'base',
          enabled: true,
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

    expect(dest.address).toBe('0xStanding')
    expect(dest.feesCopy).toBe('~$0.01–0.10')
    expect(dest.estimatedArrivalCopy).toBe('~1–3 min')
    expect(dest.tokenContract).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    expect(dest.qrPayload).toContain('ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer')

    const standing = calls.find((call) => call.url.endsWith('/api/wallet/standing-deposit-address'))
    expect(standing?.method).toBe('POST')
    expect(standing?.body).toMatchObject({
      userId: 'user_123',
      sourceChain: 'base',
      destinationAsset: 'USDB',
      idempotencyKey: 'std:deposit:user_123:base:usdc',
    })
  })

  it('POSTs standing-deposit-address for BTC mainnet and picks addresses.bitcoin', async () => {
    const { client, calls } = clientWith((req) => {
      if (req.url.endsWith('/api/wallet/deposit-options')) return jsonResponse(CATALOG)
      if (req.url.endsWith('/api/wallet/standing-deposit-address')) {
        return jsonResponse({
          ok: true,
          mode: 'created',
          created: true,
          projectId: 'native',
          ref: 'std:native:user_123:spark:USDB:spark1product',
          destinationChain: 'spark',
          destinationAsset: 'USDB',
          destinationAddress: 'spark1product',
          addresses: { bitcoin: 'bc1qtest', base: '0xignore' },
          depositAddress: 'bc1qtest',
          sourceChain: 'bitcoin',
          enabled: true,
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
    const standing = calls.find((call) => call.url.endsWith('/api/wallet/standing-deposit-address'))
    expect(standing?.body).toMatchObject({
      userId: 'user_123',
      sourceChain: 'bitcoin',
      destinationAsset: 'USDB',
      idempotencyKey: 'std:deposit:user_123:btc:mainnet',
    })
  })

  it('swaps BTC deep links for the Spark test wallet when nest is REGTEST', async () => {
    const { client } = clientWith((req) => {
      if (req.url.endsWith('/api/wallet/deposit-options')) {
        return jsonResponse({ ...CATALOG, sparkNetwork: 'REGTEST' })
      }
      if (req.url.endsWith('/api/wallet/standing-deposit-address')) {
        return jsonResponse({
          ok: true,
          mode: 'created',
          created: true,
          projectId: 'native',
          ref: 'std:native:user_123:spark-regtest:USDB:sparkrt1product',
          destinationChain: 'spark-regtest',
          destinationAsset: 'USDB',
          destinationAddress: 'sparkrt1product',
          addresses: { bitcoin: 'bcrt1qtest' },
          depositAddress: 'bcrt1qtest',
          sourceChain: 'bitcoin',
          enabled: true,
        })
      }
      return jsonResponse({ ok: false }, 404)
    })

    const dest = await client.createPartnerDepositDestination(
      { asset: 'btc', network: 'mainnet' },
      { userId: 'user_123' },
    )

    expect(dest.walletDeepLinks).toEqual([
      {
        id: 'spark-test-wallet',
        label: 'Spark test wallet',
        uri: 'https://docs.spark.money/tools/test-wallet',
      },
    ])
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
      if (req.url.endsWith('/api/wallet/standing-deposit-address')) {
        return jsonResponse({
          ok: true,
          mode: 'created',
          created: true,
          projectId: 'native',
          ref: 'std:native:user_123:spark:USDB:spark1product',
          destinationChain: 'spark',
          destinationAsset: 'USDB',
          destinationAddress: 'spark1product',
          addresses: { solana: 'So1' },
          depositAddress: 'So1',
          sourceChain: 'solana',
          enabled: true,
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
