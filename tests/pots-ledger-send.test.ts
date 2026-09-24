import { describe, expect, it } from 'vitest'
import { ZappiClient } from '../src/client/zappi-client'

type Captured = { method: string; url: string; body: unknown; headers: Headers }

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
      const headers = new Headers(init?.headers)
      const req: Captured = { method, url, body, headers }
      calls.push(req)
      return handler(req)
    }) as typeof fetch,
  })
  return { client, calls }
}

describe('pots', () => {
  it('listPots forwards origin/spendMode query and returns pots', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ pots: [{ id: 'p1', sparkAddress: 'spark1x', grants: [] }] }),
    )
    const pots = await client.listPots({ spendMode: 'free' })
    expect(pots).toHaveLength(1)
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots?spendMode=free')
  })

  it('listPots omits query string when no filters', async () => {
    const { client, calls } = clientWith(() => jsonResponse({ pots: [] }))
    await client.listPots()
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots')
  })

  it('createPot POSTs the body', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ id: 'p1', sparkAddress: 'spark1x', grants: [] }),
    )
    await client.createPot({ sparkAddress: 'spark1x', spendMode: 'free' })
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots')
    expect(calls[0]!.body).toEqual({ sparkAddress: 'spark1x', spendMode: 'free' })
  })

  it('claimPotOrigin PATCHes /wallet/pots/:id', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ id: 'p1', sparkAddress: 'spark1x', grants: [] }),
    )
    await client.claimPotOrigin('p1', { origin: 'user' })
    expect(calls[0]!.method).toBe('PATCH')
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/p1')
  })

  it('createPotDepositAddress POSTs to deposit-address', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ potId: 'p1', depositAddress: '0xabc' }),
    )
    await client.createPotDepositAddress('p1', { sourceChain: 'base' })
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/p1/deposit-address')
  })

  it('getPotBalance GETs balance', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ potId: 'p1', balanceUsdCents: 500, pendingUsdCents: 0 }),
    )
    const bal = await client.getPotBalance('p1')
    expect(bal.balanceUsdCents).toBe(500)
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/p1/balance')
  })

  it('listPotGrants returns grants array', async () => {
    const { client } = clientWith(() =>
      jsonResponse({ grants: [{ id: 'g1', potId: 'p1', scopes: ['read'] }] }),
    )
    const grants = await client.listPotGrants('p1')
    expect(grants).toHaveLength(1)
  })

  it('createPotGrant POSTs grant', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ id: 'g1', potId: 'p1', scopes: ['read'] }),
    )
    await client.createPotGrant('p1', { scopes: ['read'] })
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/p1/grants')
  })

  it('revokePotGrant DELETEs and resolves void', async () => {
    const { client, calls } = clientWith(() => new Response(null, { status: 204 }))
    await client.revokePotGrant('p1', 'g1')
    expect(calls[0]!.method).toBe('DELETE')
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/p1/grants/g1')
  })

  it('listPotSpendApprovals returns approvals', async () => {
    const { client } = clientWith(() =>
      jsonResponse({ approvals: [{ id: 'a1', potId: 'p1', action: 'withdraw' }] }),
    )
    const approvals = await client.listPotSpendApprovals('p1')
    expect(approvals).toHaveLength(1)
  })

  it('createPotSpendApproval POSTs', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ id: 'a1', potId: 'p1', action: 'withdraw' }),
    )
    await client.createPotSpendApproval('p1', { action: 'withdraw' })
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/p1/spend-approvals')
  })

  it('getPotSpendGate forwards action query', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ potId: 'p1', spendMode: 'free', gated: false, leash: 'empty_balance' }),
    )
    await client.getPotSpendGate('p1', 'withdraw')
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/pots/p1/spend-gate?action=withdraw',
    )
  })

  it('approvePotSpend forwards authorizationToken header', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ id: 'a1', potId: 'p1', action: 'withdraw' }),
    )
    await client.approvePotSpend('p1', 'a1', 'stepup-token')
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/pots/p1/spend-approvals/a1/approve',
    )
  })

  it('rejectPotSpend and consumePotSpend POST', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ id: 'a1', potId: 'p1', action: 'withdraw' }),
    )
    await client.rejectPotSpend('p1', 'a1')
    await client.consumePotSpend('p1', 'a1')
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/pots/p1/spend-approvals/a1/reject',
    )
    expect(calls[1]!.url).toBe(
      'http://nest.test/api/wallet/pots/p1/spend-approvals/a1/consume',
    )
  })
})

describe('agent grant routes', () => {
  it('getPotBalanceByGrant forwards grantId query', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ potId: 'p1', balanceUsdCents: 0, pendingUsdCents: 0 }),
    )
    await client.getPotBalanceByGrant('p1', 'g1')
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/pots/p1/agent/balance?grantId=g1',
    )
  })

  it('createPotDepositAddressByGrant POSTs', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ potId: 'p1', depositAddress: '0xabc' }),
    )
    await client.createPotDepositAddressByGrant('p1', { grantId: 'g1' })
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/p1/agent/deposit-address')
  })
})

describe('attach flow', () => {
  it('createPotAttach POSTs to /wallet/pots/attach', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ requestId: 'r1', userCode: 'ABCD', approveUrl: 'https://x', expiresAt: 't' }),
    )
    await client.createPotAttach({ spendMode: 'free' })
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/attach')
  })

  it('pollPotAttach GETs the request', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ status: 'pending', requestId: 'r1' }),
    )
    await client.pollPotAttach('r1')
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/attach/r1')
  })


  it('reclaimPotAttachCredentials POSTs credentials with X-Zappi-Device-Code', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({
        status: 'approved',
        requestId: 'r1',
        potId: 'p1',
        grantId: 'g1',
        potClientToken: 'zpc_secret',
      }),
    )
    const res = await client.reclaimPotAttachCredentials('r1', 'device_secret')
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/attach/r1/credentials')
    expect(calls[0]!.headers.get('X-Zappi-Device-Code')).toBe('device_secret')
    expect(res.potClientToken).toBe('zpc_secret')
  })

  it('pollPotAttach does not require potClientToken on approved public status', async () => {
    const { client } = clientWith(() =>
      jsonResponse({ status: 'approved', requestId: 'r1', potId: 'p1', grantId: 'g1' }),
    )
    const res = await client.pollPotAttach('r1')
    expect(res.status).toBe('approved')
    expect(res.potClientToken).toBeUndefined()
  })

  it('approvePotAttach POSTs approve', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ pot: { id: 'p1', grants: [] }, grant: { id: 'g1' }, spendMode: 'free', origin: 'agent', potClientToken: 'zpc_x' }),
    )
    await client.approvePotAttach('r1', { spendMode: 'free' })
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/pots/attach/r1/approve')
  })
})

describe('spend tickets', () => {
  it('createPotSpendRequest POSTs to self-custody path', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ id: 's1', potId: 'p1', amountCents: 100, destinationAddress: '0x' }),
    )
    await client.createPotSpendRequest('p1', { amountCents: 100, destinationAddress: '0x' }, 'stepup')
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/self-custody/pots/p1/spend-requests',
    )
  })

  it('listPotSpendRequests returns requests', async () => {
    const { client } = clientWith(() =>
      jsonResponse({ requests: [{ id: 's1', potId: 'p1' }] }),
    )
    const reqs = await client.listPotSpendRequests('p1')
    expect(reqs).toHaveLength(1)
  })

  it('getPotSpendRequest GETs by id', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ id: 's1', potId: 'p1' }),
    )
    await client.getPotSpendRequest('p1', 's1')
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/self-custody/pots/p1/spend-requests/s1',
    )
  })

  it('approvePotSpendRequest and denyPotSpendRequest POST', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ id: 's1', potId: 'p1' }),
    )
    await client.approvePotSpendRequest('p1', 's1', 'stepup')
    await client.denyPotSpendRequest('p1', 's1', 'stepup')
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/self-custody/pots/p1/spend-requests/s1/approve',
    )
    expect(calls[1]!.url).toBe(
      'http://nest.test/api/wallet/self-custody/pots/p1/spend-requests/s1/deny',
    )
  })
})

describe('ledger', () => {
  it('listTransactions returns transactions array', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ ok: true, transactions: [{ id: 't1', type: 'deposit' }] }),
    )
    const txs = await client.listTransactions()
    expect(txs).toHaveLength(1)
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/transactions')
  })

  it('getTransaction returns the transaction', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ ok: true, transaction: { id: 't1', type: 'deposit' } }),
    )
    const tx = await client.getTransaction('t1')
    expect(tx.id).toBe('t1')
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/transactions/t1')
  })
})

describe('send (user-facing)', () => {
  it('resolveSendTarget forwards recipientUserId', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ ok: true, recipient: { id: 'u1' }, recipientCustody: 'user-held', destinationSparkAddress: 'spark1x' }),
    )
    await client.resolveSendTarget('u1')
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/send/resolve?recipientUserId=u1',
    )
  })

  it('sendExternal POSTs', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ ok: true, success: true, userId: 'u1', asset: 'USDC', networkId: 'solana', address: '0x', amountCents: 100, amountUsdb: '1000000', status: 'pending' }),
    )
    await client.sendExternal({ asset: 'USDC', networkId: 'solana', address: '0x', amountCents: 100 })
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/send/external')
  })

  it('getSendOptions GETs options', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ ok: true, options: [] }),
    )
    await client.getSendOptions()
    expect(calls[0]!.url).toBe('http://nest.test/api/wallet/send/options')
  })

  it('validateSendAddress forwards query', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ valid: true }),
    )
    await client.validateSendAddress({ asset: 'USDC', network: 'solana', address: '0x' })
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/send/validate-address?asset=USDC&network=solana&address=0x',
    )
  })

  it('estimateSend forwards query with optional address', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ ok: true, asset: 'USDC', networkId: 'solana', amountCents: 100, amountUsdb: '1000000' }),
    )
    await client.estimateSend({ asset: 'USDC', networkId: 'solana', amountCents: 100, address: '0x' })
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/send/estimate?asset=USDC&networkId=solana&amountCents=100&address=0x',
    )
  })

  it('getSendStatus forwards withdrawId', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ ok: true, withdrawId: 'w1', status: 'completed' }),
    )
    await client.getSendStatus('w1')
    expect(calls[0]!.url).toBe(
      'http://nest.test/api/wallet/send/status?withdrawId=w1',
    )
  })
})
