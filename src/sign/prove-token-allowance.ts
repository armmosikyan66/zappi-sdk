import type { PreparedAllowancePull } from '@buildonspark/spark-sdk'

/**
 * Proves Spark operator allowances on two wallets.
 *
 * The wallet port has create, pull, and commit only. This module never
 * calls transferTokens, so an operator refusal cannot fall through to a
 * pot-key send or a local clock check.
 */

export type AllowanceProofFailure =
  | 'ALREADY_ACTIVE'
  | 'BUDGET_EXHAUSTED'
  | 'PER_TRANSACTION_CAP_EXCEEDED'
  | 'EXPIRED'
  | 'OPERATOR_RPC_UNSUPPORTED'
  | 'UNEXPECTED'

export class AllowanceProofError extends Error {
  constructor(
    readonly code: AllowanceProofFailure,
    message: string,
  ) {
    super(message)
    this.name = 'AllowanceProofError'
  }
}

export interface AllowanceProofPull {
  allowanceId: string
  ownerPublicKey: string
  tokenIdentifier: string
  outputs: Array<{ receiverPublicKey: string; tokenAmount: bigint }>
}

export interface AllowanceProofWallet {
  getIdentityPublicKey(): Promise<string>
  createTokenAllowance(params: {
    spenderPublicKey: string
    tokenIdentifier: string
    perTransaction: { amount: bigint }
    total: { amount: bigint }
    expiryTime: Date
    recipientAllowlist: string[]
  }): Promise<{ allowanceId: string }>
  startAllowancePull(params: AllowanceProofPull): Promise<{ partialHash: string }>
  commitAllowancePull(prepared: { partialHash: string }): Promise<{ txId: string }>
}

export interface AllowanceProofReport {
  network: 'MAINNET' | 'synthetic'
  allowanceId: string
  txId: string
  capRefusal: 'BUDGET_EXHAUSTED' | 'PER_TRANSACTION_CAP_EXCEEDED'
  expiryRefusal: 'EXPIRED'
  secondAllowanceId: string
  steps: string[]
}

const SO_FAILURES: Array<[string, AllowanceProofFailure]> = [
  ['token allowance has expired', 'EXPIRED'],
  [
    'metered amount exceeds the allowance per-transaction cap',
    'PER_TRANSACTION_CAP_EXCEEDED',
  ],
  ['metered amount exceeds the allowance remaining budget', 'BUDGET_EXHAUSTED'],
  [
    'an active allowance already exists for this owner, spender, and token',
    'ALREADY_ACTIVE',
  ],
]

const RPC_UNSUPPORTED = [
  'unimplemented',
  'not implemented',
  'unknown method',
  'method not found',
  'unrecognized method',
  'unknown rpc',
]

export function classifyAllowanceFailure(error: unknown): AllowanceProofFailure | null {
  const tagged = readTaggedFailure(error)
  if (tagged) return tagged
  const message = errorText(error).toLowerCase()
  if (RPC_UNSUPPORTED.some((part) => message.includes(part))) {
    return 'OPERATOR_RPC_UNSUPPORTED'
  }
  for (const [soText, code] of SO_FAILURES) {
    if (message.includes(soText)) return code
  }
  if (message.includes('already_active')) return 'ALREADY_ACTIVE'
  if (message.includes('budget_exhausted')) return 'BUDGET_EXHAUSTED'
  if (message.includes('per_transaction_cap_exceeded')) {
    return 'PER_TRANSACTION_CAP_EXCEEDED'
  }
  if (/\bexpired\b/.test(message)) return 'EXPIRED'
  return null
}

export async function proveSparkAllowanceCalls(input: {
  network: 'MAINNET' | 'synthetic'
  tokenIdentifier: string
  receiverPublicKey: string
  now: () => number
  waitUntil: (unixMs: number) => Promise<void>
  withOwner: <T>(fn: (owner: AllowanceProofWallet) => Promise<T>) => Promise<T>
  withSpender: <T>(fn: (spender: AllowanceProofWallet) => Promise<T>) => Promise<T>
  capUnits?: bigint
  pullUnits?: bigint
  lifetimeMs?: number
}): Promise<AllowanceProofReport> {
  const capUnits = input.capUnits ?? 10_000n
  const pullUnits = input.pullUnits ?? capUnits / 2n
  const lifetimeMs = input.lifetimeMs ?? 20_000
  if (pullUnits <= 0n || pullUnits > capUnits) {
    throw new AllowanceProofError(
      'UNEXPECTED',
      'The under-cap pull must be inside the grant.',
    )
  }
  const steps: string[] = []
  const spenderPublicKey = await input.withSpender((spender) =>
    spender.getIdentityPublicKey(),
  )
  const ownerPublicKey = await input.withOwner((owner) =>
    owner.getIdentityPublicKey(),
  )
  const expiryMs = input.now() + lifetimeMs
  const created = await input.withOwner(async (owner) => {
    const allowanceId = await createOrStop(owner, {
      spenderPublicKey,
      tokenIdentifier: input.tokenIdentifier,
      perTransaction: { amount: capUnits },
      total: { amount: capUnits },
      expiryTime: new Date(expiryMs),
      recipientAllowlist: [],
    })
    steps.push('create')
    const duplicate = await refusalOf(
      () =>
        owner.createTokenAllowance({
          spenderPublicKey,
          tokenIdentifier: input.tokenIdentifier,
          perTransaction: { amount: capUnits },
          total: { amount: capUnits },
          expiryTime: new Date(expiryMs),
          recipientAllowlist: [],
        }),
      ['ALREADY_ACTIVE'],
    )
    steps.push(duplicate)
    return allowanceId
  })

  const pulled = await input.withSpender(async (spender) => {
    const prepared = await spender.startAllowancePull({
      allowanceId: created,
      ownerPublicKey,
      tokenIdentifier: input.tokenIdentifier,
      outputs: [
        {
          receiverPublicKey: input.receiverPublicKey,
          tokenAmount: pullUnits,
        },
      ],
    })
    const committed = await spender.commitAllowancePull(prepared)
    steps.push('pull')
    const capRefusal = await refusalOf(
      () =>
        spender.startAllowancePull({
          allowanceId: created,
          ownerPublicKey,
          tokenIdentifier: input.tokenIdentifier,
          outputs: [
            {
              receiverPublicKey: input.receiverPublicKey,
              tokenAmount: capUnits + 1n,
            },
          ],
        }),
      ['BUDGET_EXHAUSTED', 'PER_TRANSACTION_CAP_EXCEEDED'],
    )
    steps.push(capRefusal)
    return { txId: committed.txId, capRefusal }
  })

  await input.waitUntil(expiryMs + 1)
  const expiryRefusal = await input.withSpender((spender) =>
    refusalOf(
      () =>
        spender.startAllowancePull({
          allowanceId: created,
          ownerPublicKey,
          tokenIdentifier: input.tokenIdentifier,
          outputs: [
            {
              receiverPublicKey: input.receiverPublicKey,
              tokenAmount: 1n,
            },
          ],
        }),
      ['EXPIRED'],
    ),
  )
  steps.push(expiryRefusal)

  const secondAllowanceId = await input.withOwner((owner) =>
    createOrStop(owner, {
      spenderPublicKey,
      tokenIdentifier: input.tokenIdentifier,
      perTransaction: { amount: capUnits },
      total: { amount: capUnits },
      expiryTime: new Date(input.now() + lifetimeMs),
      recipientAllowlist: [],
    }),
  )
  steps.push('create-after-expiry')

  return {
    network: input.network,
    allowanceId: created,
    txId: pulled.txId,
    capRefusal: pulled.capRefusal,
    expiryRefusal: 'EXPIRED',
    secondAllowanceId,
    steps,
  }
}

async function createOrStop(
  owner: AllowanceProofWallet,
  params: Parameters<AllowanceProofWallet['createTokenAllowance']>[0],
): Promise<string> {
  try {
    const created = await owner.createTokenAllowance(params)
    if (!/^[0-9a-f]{32}$/i.test(created.allowanceId)) {
      throw new AllowanceProofError(
        'UNEXPECTED',
        'createTokenAllowance did not return a 16-byte allowance id.',
      )
    }
    return created.allowanceId.toLowerCase()
  } catch (error) {
    if (error instanceof AllowanceProofError) throw error
    const code = classifyAllowanceFailure(error)
    if (code === 'OPERATOR_RPC_UNSUPPORTED') {
      throw new AllowanceProofError(
        'OPERATOR_RPC_UNSUPPORTED',
        'Operators rejected createTokenAllowance. Stop. Do not wire a local clock check.',
      )
    }
    throw new AllowanceProofError(
      'UNEXPECTED',
      errorText(error) || 'createTokenAllowance failed.',
    )
  }
}

async function refusalOf<T extends AllowanceProofFailure>(
  call: () => Promise<unknown>,
  accepted: readonly T[],
): Promise<T> {
  try {
    await call()
  } catch (error) {
    if (error instanceof AllowanceProofError) throw error
    const code = classifyAllowanceFailure(error)
    if (code === 'OPERATOR_RPC_UNSUPPORTED') {
      throw new AllowanceProofError(
        'OPERATOR_RPC_UNSUPPORTED',
        'Operators rejected the allowance RPC. Stop.',
      )
    }
    if (code && accepted.includes(code as T)) return code as T
    throw new AllowanceProofError(
      'UNEXPECTED',
      errorText(error) || 'Operators refused with an unexpected error.',
    )
  }
  throw new AllowanceProofError(
    'UNEXPECTED',
    'Operators accepted a call they must refuse.',
  )
}

function readTaggedFailure(error: unknown): AllowanceProofFailure | null {
  if (!error || typeof error !== 'object') return null
  const context =
    'getContext' in error && typeof error.getContext === 'function'
      ? error.getContext()
      : null
  const tagged =
    context && typeof context === 'object' && 'allowanceFailure' in context
      ? context.allowanceFailure
      : 'allowanceFailure' in error
        ? error.allowanceFailure
        : null
  if (tagged === 'ALREADY_ACTIVE') return 'ALREADY_ACTIVE'
  if (tagged === 'BUDGET_EXHAUSTED') return 'BUDGET_EXHAUSTED'
  if (tagged === 'PER_TRANSACTION_CAP_EXCEEDED') return 'PER_TRANSACTION_CAP_EXCEEDED'
  if (tagged === 'EXPIRED') return 'EXPIRED'
  return null
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const details = (error as { details?: unknown }).details
    return typeof details === 'string' && details.length > 0
      ? `${error.message} ${details}`
      : error.message
  }
  return typeof error === 'string' ? error : ''
}

/**
 * Live operator proof. Returns `{ ran: false }` when any phrase or the
 * receiver or token id is missing. Does not print phrases.
 */
export async function runLiveSparkAllowanceProof(
  env: Record<string, string | undefined> = process.env,
): Promise<{ ran: false } | { ran: true; report: AllowanceProofReport }> {
  const ownerPhrase = env.ZAPPI_ALLOWANCE_PROOF_OWNER?.trim()
  const spenderPhrase = env.ZAPPI_ALLOWANCE_PROOF_SPENDER?.trim()
  const receiver = env.ZAPPI_ALLOWANCE_PROOF_RECEIVER?.trim()
  const token = env.ZAPPI_ALLOWANCE_PROOF_TOKEN?.trim()
  if (!ownerPhrase || !spenderPhrase || !receiver || !token) {
    return { ran: false }
  }
  const { withHeldSparkWallet } = await import('./index')
  const report = await proveSparkAllowanceCalls({
    network: 'MAINNET',
    tokenIdentifier: token,
    receiverPublicKey: receiver,
    now: () => Date.now(),
    waitUntil: (unixMs) => sleep(Math.max(0, unixMs - Date.now())),
    lifetimeMs: 20_000,
    withOwner: (fn) =>
      withHeldSparkWallet(
        { mnemonic: ownerPhrase, accountNumber: 1, network: 'MAINNET' },
        (wallet) => fn(adaptLiveWallet(wallet)),
      ),
    withSpender: (fn) =>
      withHeldSparkWallet(
        { mnemonic: spenderPhrase, accountNumber: 1, network: 'MAINNET' },
        (wallet) => fn(adaptLiveWallet(wallet)),
      ),
  })
  return { ran: true, report }
}

function adaptLiveWallet(wallet: {
  getIdentityPublicKey: () => Promise<string>
  createTokenAllowance: AllowanceProofWallet['createTokenAllowance']
  startAllowancePull: (
    params: AllowanceProofPull,
  ) => Promise<{ partialTokenTransactionHash: Uint8Array }>
  commitAllowancePull: (
    prepared: PreparedAllowancePull,
  ) => Promise<{ txId: string }>
}): AllowanceProofWallet {
  return {
    getIdentityPublicKey: () => wallet.getIdentityPublicKey(),
    createTokenAllowance: (params) => wallet.createTokenAllowance(params),
    startAllowancePull: async (params) => {
      const prepared = await wallet.startAllowancePull(params)
      return {
        partialHash: bytesToHex(prepared.partialTokenTransactionHash),
        prepared,
      } as { partialHash: string }
    },
    commitAllowancePull: async (value) => {
      const prepared = (value as { prepared?: PreparedAllowancePull }).prepared
      if (!prepared) {
        throw new AllowanceProofError(
          'UNEXPECTED',
          'commitAllowancePull needs the prepared pull.',
        )
      }
      const committed = await wallet.commitAllowancePull(prepared)
      return { txId: committed.txId }
    },
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
