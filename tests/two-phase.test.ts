import { describe, expect, it, vi } from 'vitest'
import { runTwoPhaseWithdraw, runTwoPhasePartnerWithdraw, TwoPhaseWithdrawError } from '../src/quote/two-phase'
import type { ZappiClient } from '../src/client/zappi-client'
import type { WithdrawalConfirmation } from '../src/types/withdraw'

/** Minimal mocked client — only `confirmWithdrawal` is exercised. */
function mockClient(confirms: WithdrawalConfirmation[]): ZappiClient {
  return {
    confirmWithdrawal: vi.fn(async () => {
      const next = confirms.shift()
      if (!next) throw new Error('no more mock confirmations')
      return next
    }),
  } as unknown as ZappiClient
}

function mockSigner(hash = '0xsparkhash'): { transferUsdb: ReturnType<typeof vi.fn> } {
  return {
    transferUsdb: vi.fn(async () => ({ sparkTxHash: hash })),
  }
}

describe('runTwoPhaseWithdraw', () => {
  it('returns immediately when no signature is needed', async () => {
    const client = mockClient([{ withdrawalId: 'w1', status: 'pending' }])
    const signer = mockSigner()
    const result = await runTwoPhaseWithdraw(client as unknown as ZappiClient, signer, {
      quoteId: 'q1',
    })
    expect(result.needsSignature).toBeUndefined()
    expect(result.withdrawalId).toBe('w1')
    expect(signer.transferUsdb).not.toHaveBeenCalled()
    expect(client.confirmWithdrawal).toHaveBeenCalledTimes(1)
  })

  it('signs and completes when needsSignature is true', async () => {
    const client = mockClient([
      {
        withdrawalId: 'w1',
        status: 'pending',
        needsSignature: true,
        depositAddress: 'sparkaddr1',
        tokenIdentifier: 'usdb-token',
        sendAmount: '10000000',
      },
      { withdrawalId: 'w1', status: 'pending' },
    ])
    const signer = mockSigner('0xsigned')
    const result = await runTwoPhaseWithdraw(client as unknown as ZappiClient, signer, {
      quoteId: 'q1',
      authorizationToken: 'passkey-token',
    })

    expect(result.withdrawalId).toBe('w1')
    expect(client.confirmWithdrawal).toHaveBeenCalledTimes(2)
    // Second call carries the sparkTxHash.
    const secondCall = (client.confirmWithdrawal as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(secondCall?.[1]).toBe('0xsigned')
    // Signer received the BigInt amount and the deposit address.
    expect(signer.transferUsdb).toHaveBeenCalledWith({
      tokenIdentifier: 'usdb-token',
      tokenAmount: 10_000_000n,
      receiverSparkAddress: 'sparkaddr1',
    })
  })

  it('throws SIGNER_REQUIRED when a signature is needed but no signer', async () => {
    const client = mockClient([
      {
        withdrawalId: 'w1',
        status: 'pending',
        needsSignature: true,
        depositAddress: 'sparkaddr1',
        tokenIdentifier: 'usdb-token',
        sendAmount: '10000000',
      },
    ])
    await expect(
      runTwoPhaseWithdraw(client as unknown as ZappiClient, null, { quoteId: 'q1' }),
    ).rejects.toMatchObject({ code: 'SIGNER_REQUIRED' })
  })

  it('throws MISSING_SEND_DETAILS when needsSignature but no depositAddress', async () => {
    const client = mockClient([
      { withdrawalId: 'w1', status: 'pending', needsSignature: true, sendAmount: '100' },
    ])
    const signer = mockSigner()
    await expect(
      runTwoPhaseWithdraw(client as unknown as ZappiClient, signer, { quoteId: 'q1' }),
    ).rejects.toMatchObject({ code: 'MISSING_SEND_DETAILS' })
  })

  it('TwoPhaseWithdrawError carries a code', () => {
    const err = new TwoPhaseWithdrawError('SIGNER_REQUIRED', 'msg')
    expect(err.code).toBe('SIGNER_REQUIRED')
    expect(err.message).toBe('msg')
    expect(err.name).toBe('TwoPhaseWithdrawError')
  })
})

const partnerBody = {
  userId: 'u1',
  asset: 'USDC',
  networkId: 'solana',
  address: 'So111',
  amountCents: 100,
  idempotencyKey: 'wd:1',
}

describe('runTwoPhasePartnerWithdraw', () => {
  it('returns immediately when no signature is needed', async () => {
    const partnerWithdraw = vi.fn(async () => ({
      ok: true as const,
      success: true as const,
      withdrawId: 'pw1',
      userId: 'u1',
      asset: 'USDC',
      networkId: 'solana',
      address: 'So111',
      amountCents: 100,
      amountUsdb: '1000000',
      status: 'processing',
    }))
    const signer = mockSigner()
    const result = await runTwoPhasePartnerWithdraw(
      { partnerWithdraw },
      signer,
      partnerBody,
    )
    expect(result).toEqual({ withdrawalId: 'pw1', status: 'pending' })
    expect(partnerWithdraw).toHaveBeenCalledTimes(1)
    expect(signer.transferUsdb).not.toHaveBeenCalled()
  })

  it('signs and completes with sparkTxHash on the second partnerWithdraw', async () => {
    const partnerWithdraw = vi.fn(async (body: { sparkTxHash?: string }) => {
      if (body.sparkTxHash) {
        return {
          ok: true as const,
          success: true as const,
          withdrawId: 'pw1',
          userId: 'u1',
          asset: 'USDC',
          networkId: 'solana',
          address: 'So111',
          amountCents: 100,
          amountUsdb: '1000000',
          status: 'processing',
          sparkTxHash: body.sparkTxHash,
        }
      }
      return {
        ok: true as const,
        success: true as const,
        withdrawId: 'pw1',
        userId: 'u1',
        asset: 'USDC',
        networkId: 'solana',
        address: 'So111',
        amountCents: 100,
        amountUsdb: '1000000',
        status: 'awaiting_signature',
        needsSignature: true,
        depositAddress: 'sparkaddr1',
        tokenIdentifier: 'usdb-token',
        sendAmount: '10000000',
      }
    })
    const signer = mockSigner('0xsigned')
    const result = await runTwoPhasePartnerWithdraw(
      { partnerWithdraw },
      signer,
      partnerBody,
    )

    expect(result.withdrawalId).toBe('pw1')
    expect(partnerWithdraw).toHaveBeenCalledTimes(2)
    expect(partnerWithdraw.mock.calls[1]?.[0]).toMatchObject({
      ...partnerBody,
      sparkTxHash: '0xsigned',
    })
    expect(signer.transferUsdb).toHaveBeenCalledWith({
      tokenIdentifier: 'usdb-token',
      tokenAmount: 10_000_000n,
      receiverSparkAddress: 'sparkaddr1',
    })
  })

  it('throws SIGNER_REQUIRED when a signature is needed but no signer', async () => {
    await expect(
      runTwoPhasePartnerWithdraw(
        {
          partnerWithdraw: async () => ({
            ok: true as const,
            success: true as const,
            withdrawId: 'pw1',
            userId: 'u1',
            asset: 'USDC',
            networkId: 'solana',
            address: 'So111',
            amountCents: 100,
            amountUsdb: '1000000',
            status: 'awaiting_signature',
            needsSignature: true,
            depositAddress: 'sparkaddr1',
            tokenIdentifier: 'usdb-token',
            sendAmount: '10000000',
          }),
        },
        null,
        partnerBody,
      ),
    ).rejects.toMatchObject({ code: 'SIGNER_REQUIRED' })
  })
})
