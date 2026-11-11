import { describe, expect, it } from 'vitest'
import {
  proveSparkAllowanceCalls,
  runLiveSparkAllowanceProof,
  type AllowanceProofWallet,
} from '../src/sign/prove-token-allowance'

const TOKEN = '11'.repeat(32)
const RECEIVER = `02${'ab'.repeat(32)}`
const OWNER_KEY = `02${'11'.repeat(32)}`
const SPENDER_KEY = `03${'22'.repeat(32)}`

describe('proveSparkAllowanceCalls', () => {
  it('creates, pulls, refuses the cap, then refuses expiry', async () => {
    let now = 1_700_000_000_000
    const ownerCalls = { pull: 0, transfer: 0 }
    const spenderCalls = { create: 0 }
    const operator = fakeOperator(() => now)
    const report = await proveSparkAllowanceCalls({
      network: 'synthetic',
      tokenIdentifier: TOKEN,
      receiverPublicKey: RECEIVER,
      now: () => now,
      waitUntil: async (unixMs) => {
        now = unixMs
      },
      withOwner: (fn) => fn(ownerWallet(operator, ownerCalls)),
      withSpender: (fn) => fn(spenderWallet(operator, spenderCalls)),
      lifetimeMs: 1_000,
    })

    expect(report.txId).toMatch(/^[0-9a-f]{64}$/)
    expect(report.allowanceId).toMatch(/^[0-9a-f]{32}$/)
    expect(report.secondAllowanceId).not.toBe(report.allowanceId)
    expect(['BUDGET_EXHAUSTED', 'PER_TRANSACTION_CAP_EXCEEDED']).toContain(
      report.capRefusal,
    )
    expect(report.expiryRefusal).toBe('EXPIRED')
    expect(report.steps).toEqual([
      'create',
      'ALREADY_ACTIVE',
      'pull',
      report.capRefusal,
      'EXPIRED',
      'create-after-expiry',
    ])
    expect(ownerCalls.pull).toBe(0)
    expect(ownerCalls.transfer).toBe(0)
    expect(spenderCalls.create).toBe(0)
    expect(operator.transferTokens).toBe(0)
  })

  it('stops when operators reject the create RPC', async () => {
    const operator = fakeOperator(() => Date.now())
    operator.rejectCreate = 'UNIMPLEMENTED: create_token_allowance'
    const spender = spenderWallet(operator, { create: 0 })
    let pulls = 0
    const wrapped: AllowanceProofWallet = {
      ...spender,
      startAllowancePull: async (params) => {
        pulls += 1
        return spender.startAllowancePull(params)
      },
    }

    await expect(
      proveSparkAllowanceCalls({
        network: 'synthetic',
        tokenIdentifier: TOKEN,
        receiverPublicKey: RECEIVER,
        now: () => Date.now(),
        waitUntil: async () => {},
        withOwner: (fn) => fn(ownerWallet(operator, { pull: 0, transfer: 0 })),
        withSpender: (fn) => fn(wrapped),
        lifetimeMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: 'OPERATOR_RPC_UNSUPPORTED' })
    expect(pulls).toBe(0)
    expect(operator.transferTokens).toBe(0)
  })

  it('does not open wallets when the operator phrases are unset', async () => {
    const result = await runLiveSparkAllowanceProof({})
    expect(result.ran).toBe(false)
  })
})

interface Grant {
  id: string
  expiryMs: number
  cap: bigint
  perTx: bigint
  spent: bigint
  status: 'active' | 'expired'
}

interface Operator {
  grant: Grant | null
  nextId: number
  rejectCreate: string | null
  transferTokens: number
  now: () => number
}

function fakeOperator(now: () => number): Operator {
  return {
    grant: null,
    nextId: 1,
    rejectCreate: null,
    transferTokens: 0,
    now,
  }
}

function ownerWallet(
  operator: Operator,
  calls: { pull: number; transfer: number },
): AllowanceProofWallet & { transferTokens: () => void } {
  return {
    getIdentityPublicKey: async () => OWNER_KEY,
    transferTokens: () => {
      calls.transfer += 1
      operator.transferTokens += 1
    },
    createTokenAllowance: async (params) => {
      if (operator.rejectCreate) throw new Error(operator.rejectCreate)
      if (activeGrant(operator)) {
        throw new Error(
          'an active allowance already exists for this owner, spender, and token',
        )
      }
      const id = operator.nextId.toString(16).padStart(32, '0')
      operator.nextId += 1
      operator.grant = {
        id,
        expiryMs: params.expiryTime.getTime(),
        cap: params.total.amount,
        perTx: params.perTransaction.amount,
        spent: 0n,
        status: 'active',
      }
      return { allowanceId: id }
    },
    startAllowancePull: async () => {
      calls.pull += 1
      throw new Error('owner must not pull')
    },
    commitAllowancePull: async () => {
      calls.pull += 1
      throw new Error('owner must not commit')
    },
  }
}

function spenderWallet(
  operator: Operator,
  calls: { create: number },
): AllowanceProofWallet {
  return {
    getIdentityPublicKey: async () => SPENDER_KEY,
    createTokenAllowance: async () => {
      calls.create += 1
      throw new Error('spender must not create')
    },
    startAllowancePull: async (params) => {
      const grant = requireGrant(operator, params.allowanceId)
      const amount = params.outputs.reduce(
        (sum, output) => sum + output.tokenAmount,
        0n,
      )
      if (operator.now() >= grant.expiryMs) {
        grant.status = 'expired'
        throw tagged('EXPIRED', 'token allowance has expired')
      }
      if (amount > grant.perTx) {
        throw tagged(
          'PER_TRANSACTION_CAP_EXCEEDED',
          'metered amount exceeds the allowance per-transaction cap',
        )
      }
      if (grant.spent + amount > grant.cap) {
        throw tagged(
          'BUDGET_EXHAUSTED',
          'metered amount exceeds the allowance remaining budget',
        )
      }
      grant.spent += amount
      return { partialHash: 'aa'.repeat(32) }
    },
    commitAllowancePull: async (prepared) => {
      if (prepared.partialHash !== 'aa'.repeat(32)) {
        throw new Error('unknown partial')
      }
      return { txId: 'bb'.repeat(32) }
    },
  }
}

function requireGrant(operator: Operator, id: string): Grant {
  const grant = operator.grant
  if (!grant || grant.id !== id) throw new Error('token allowance not found')
  return grant
}

function activeGrant(operator: Operator): Grant | null {
  const grant = operator.grant
  if (!grant || grant.status !== 'active') return null
  if (operator.now() >= grant.expiryMs) {
    grant.status = 'expired'
    return null
  }
  return grant
}

function tagged(code: string, message: string): Error {
  const error = new Error(message) as Error & { allowanceFailure: string }
  error.allowanceFailure = code
  return error
}
