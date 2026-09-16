import { describe, expect, it } from 'vitest'
import { ZappiClient } from '../src/client/zappi-client'
import {
  mapPartnerExecuteToConfirmation,
  toPartnerWithdrawBody,
} from '../src/client/mappers/withdraw-map'
import type { WithdrawQuotePayload } from '../src/quote/quote-token'

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

describe('toPartnerWithdrawBody', () => {
  it('does not send destinationType', () => {
    const payload: WithdrawQuotePayload = {
      userId: 'u1',
      combo: { asset: 'usdc', network: 'solana' },
      address: 'So111',
      amountCents: 100,
      destinationDisplay: 'So111',
      estimatedArrivalCopy: '~15 seconds',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    expect(toPartnerWithdrawBody(payload, 'u1', 'wd:1')).toEqual({
      userId: 'u1',
      asset: 'USDC',
      networkId: 'solana',
      address: 'So111',
      amountCents: 100,
      idempotencyKey: 'wd:1',
    })
  })
})

describe('partnerWithdraw', () => {
  it('POSTs /api/partner/wallet/withdraw with the partner body', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({
        ok: true,
        success: true,
        withdrawId: 'pw1',
        userId: 'u1',
        asset: 'USDC',
        networkId: 'solana',
        address: 'So111',
        amountCents: 100,
        amountUsdb: '1000000',
        status: 'awaiting_signature',
        needsSignature: true,
        depositAddress: 'spark1dest',
        tokenIdentifier: 'usdb-token',
        sendAmount: '10000000',
      }),
    )

    const res = await client.partnerWithdraw({
      userId: 'u1',
      asset: 'USDC',
      networkId: 'solana',
      address: 'So111',
      amountCents: 100,
      idempotencyKey: 'wd:1',
    })

    expect(calls).toEqual([
      {
        method: 'POST',
        url: 'http://nest.test/api/partner/wallet/withdraw',
        body: {
          userId: 'u1',
          asset: 'USDC',
          networkId: 'solana',
          address: 'So111',
          amountCents: 100,
          idempotencyKey: 'wd:1',
        },
      },
    ])
    expect(mapPartnerExecuteToConfirmation(res)).toMatchObject({
      withdrawalId: 'pw1',
      status: 'pending',
      needsSignature: true,
      depositAddress: 'spark1dest',
      sendAmount: '10000000',
    })
  })

  it('decodes a partner lightning invoice', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ ok: true, amountSats: 2500 }),
    )
    const decoded = await client.partnerDecodeLightningInvoice('lnbc2500n1...')
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'http://nest.test/api/partner/wallet/withdraw/decode-lightning-invoice',
      body: { bolt11: 'lnbc2500n1...' },
    })
    expect(decoded).toEqual({ valid: true, amountSats: 2500 })
  })

  it('maps a completed execute response as completed', () => {
    expect(
      mapPartnerExecuteToConfirmation({
        ok: true,
        success: true,
        withdrawId: 'pw1',
        userId: 'u1',
        asset: 'USDC',
        networkId: 'solana',
        address: 'So111',
        amountCents: 100,
        amountUsdb: '1000000',
        status: 'completed',
      }),
    ).toEqual({ withdrawalId: 'pw1', status: 'completed' })
  })

  it('polls partner withdraw status with withdrawId and userId', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({
        ok: true,
        withdrawId: 'pw1',
        status: 'completed',
        asset: 'USDC',
        networkId: 'solana',
        address: 'So111',
        amountCents: 100,
      }),
    )
    const status = await client.partnerGetWithdrawalStatus('pw1', 'u1')
    expect(calls[0]?.url).toBe(
      'http://nest.test/api/wallet/withdraw/status?withdrawId=pw1&userId=u1',
    )
    expect(status).toMatchObject({
      id: 'pw1',
      status: 'completed',
      combo: { asset: 'usdc', network: 'solana' },
    })
  })
})
