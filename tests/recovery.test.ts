import { createHash, timingSafeEqual } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  EXIT_CHAIN_STATUSES,
  FEE_UTXO_CONFIRMATION_UNKNOWN_WARNING,
  ONE_PASS_ALLOCATION_WARNING,
  RecoveryError,
  SWEEP_FEE_WARNING,
  buildBundleFromNodes,
  canonicalAadHeader,
  canonicalPayload,
  classifyLeaves,
  decryptBundle,
  encodeTreeNodeHex,
  decodeTreeNodeHex,
  estimateExitFees,
  estimateFeeBumpTxSize,
  encryptBundle,
  loadSparkTreeNodeCodec,
  p2wpkhScriptHex,
  signBundle,
  verifyBundle,
  type RecoveryAadHeader,
  type RecoveryBundle,
  type TreeNodeCodec,
} from '../src/recovery'

/**
 * Offline unit tests. They must not call Spark, mempool.space, or fetch.
 */

const IDENTITY = `02${'11'.repeat(32)}`
const OTHER_IDENTITY = `03${'22'.repeat(32)}`
const CAPTURED_AT = '2026-10-15T07:00:00.000Z'
const CANONICAL_VECTOR =
  `{"freshness":{"capturedAt":"${CAPTURED_AT}","knownIncomplete":false,"trigger":"manual"},"leaves":[{"ancestorChainHex":["aa"],"leafId":"leaf-1","status":"AVAILABLE","treeNodeHex":"abcd","valueSats":"1000"}],"schema":1,"walletIdentity":{"accountNumber":1,"derivationOrigin":"mnemonic","identityPublicKey":"${IDENTITY}","network":"REGTEST"}}`
const CANONICAL_SHA256 = 'd1ff959da41d41db13e689234736e85b9b15c61382ec7bd307e6091c2a4f7b13'

const GENERATOR_PUBKEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
const GENERATOR_P2WPKH = '0014751e76e8199196d454941c45d1b3a323f1433bd6'
const FEE_TXID = '11'.repeat(32)

beforeAll(() => {
  vi.stubGlobal('fetch', () => Promise.reject(new Error('recovery tests must not use the network')))
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('recovery bundle canonical bytes', () => {
  it('matches the fixed v1 vector', () => {
    const payload = samplePayload()
    const canonical = canonicalPayload(payload)
    expect(canonical).toBe(CANONICAL_VECTOR)
    expect(createHash('sha256').update(CANONICAL_VECTOR, 'utf8').digest('hex')).toBe(CANONICAL_SHA256)
    expect(createHash('sha256').update(canonical, 'utf8').digest('hex')).toBe(CANONICAL_SHA256)
    expect(canonical).not.toMatch(/\s/)
  })

  it('sorts keys and lowercases hex before hashing', () => {
    const payload = samplePayload()
    const firstLeaf = payload.leaves[0]
    if (!firstLeaf) throw new Error('missing leaf')
    firstLeaf.treeNodeHex = 'ABCD'
    firstLeaf.timelock = { relativeBlocks: 144, maturesAtHeight: 900_000 }
    const canonical = canonicalPayload(payload)
    expect(canonical.indexOf('"maturesAtHeight"')).toBeLessThan(canonical.indexOf('"relativeBlocks"'))
    expect(canonical).toContain('"treeNodeHex":"abcd"')
  })
})

describe('recovery bundle encryption', () => {
  it('round-trips a signed bundle', async () => {
    const bundle = await signedSample()
    const seed = Buffer.alloc(64, 7)
    const first = encryptBundle(bundle, seed)
    const second = encryptBundle(bundle, seed)
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false)
    const opened = decryptBundle(first, seed, headerFor(bundle))
    expect(opened.leaves[0]?.valueSats).toBe(1000n)
    expect(opened.integrity.sha256).toBe(bundle.integrity.sha256)
    await verifyBundle(opened, verifyFn)
  })

  it('rejects an AAD tamper and returns no plaintext', async () => {
    const bundle = await signedSample()
    const seed = Buffer.alloc(64, 9)
    const blob = encryptBundle(bundle, seed)
    const header = headerFor(bundle, { identityPublicKey: OTHER_IDENTITY })
    const error = errorFrom(() => decryptBundle(blob, seed, header))
    expect(error.code).toBe('RECOVERY_DECRYPT_FAILED')
    expect(error.message).not.toContain('leaf-1')
    expect(error.message).not.toContain(IDENTITY)
  })

  it('rejects the wrong account', async () => {
    const bundle = await signedSample()
    const seed = Buffer.alloc(64, 4)
    const blob = encryptBundle(bundle, seed)
    const error = errorFrom(() => decryptBundle(blob, seed, headerFor(bundle, { accountNumber: 2 })))
    expect(error.code).toBe('RECOVERY_DECRYPT_FAILED')
  })

  it('rejects the wrong network', async () => {
    const bundle = await signedSample()
    const seed = Buffer.alloc(64, 5)
    const blob = encryptBundle(bundle, seed)
    const error = errorFrom(() => decryptBundle(blob, seed, headerFor(bundle, { network: 'MAINNET' })))
    expect(error.code).toBe('RECOVERY_DECRYPT_FAILED')
  })

  it('rejects a flipped ciphertext byte', async () => {
    const bundle = await signedSample()
    const seed = Buffer.alloc(64, 6)
    const blob = Buffer.from(encryptBundle(bundle, seed))
    const index = blob.length - 1
    const current = blob[index]
    if (current === undefined) throw new Error('empty blob')
    blob[index] = current ^ 0xff
    const error = errorFrom(() => decryptBundle(blob, seed, headerFor(bundle)))
    expect(error.code).toBe('RECOVERY_DECRYPT_FAILED')
  })

  it('binds the canonical header into AAD', () => {
    expect(canonicalAadHeader({
      version: 1,
      network: 'REGTEST',
      accountNumber: 1,
      identityPublicKey: IDENTITY,
    })).toBe(
      `{"accountNumber":1,"identityPublicKey":"${IDENTITY}","network":"REGTEST","version":1}`,
    )
  })
})

describe('recovery bundle integrity', () => {
  it('signs the hex sha256 of the canonical payload', async () => {
    const payload = samplePayload()
    const digest = createHash('sha256').update(canonicalPayload(payload), 'utf8').digest('hex')
    let seen = ''
    const bundle = await signBundle(payload, async (messageHex) => {
      seen = messageHex
      return signWith(messageHex)
    })
    expect(seen).toBe(digest)
    expect(seen).toHaveLength(64)
    expect(bundle.integrity.sha256).toBe(digest)
    await verifyBundle(bundle, verifyFn)
  })

  it('detects a tampered signature', async () => {
    const bundle = await signedSample()
    const signature = bundle.integrity.signatureByIdentityKey
    const flipped = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`
    const error = await errorFromAsync(() => verifyBundle({
      ...bundle,
      integrity: { ...bundle.integrity, signatureByIdentityKey: flipped },
    }, verifyFn))
    expect(error.code).toBe('RECOVERY_SIGNATURE_INVALID')
  })

  it('detects a tampered body', async () => {
    const bundle = await signedSample()
    const leaf = bundle.leaves[0]
    if (!leaf) throw new Error('missing leaf')
    const error = await errorFromAsync(() => verifyBundle({
      ...bundle,
      leaves: [{ ...leaf, status: 'SPLITTED' }],
    }, verifyFn))
    expect(error.code).toBe('RECOVERY_INTEGRITY_MISMATCH')
  })
})

describe('exit chain classification', () => {
  it('marks an incomplete ancestor chain missing-ancestor and never eligible', () => {
    const [leaf] = classifyLeaves([{
      leafId: 'leaf-1',
      status: 'AVAILABLE',
      valueSats: 50_000n,
      leaf: { id: 'leaf-1', parentNodeId: 'missing-parent' },
      ancestors: [],
      allocatedFeeSats: 1n,
    }], freshOptions())
    expect(leaf?.classification).toBe('missing-ancestor')
    expect(leaf?.classification).not.toBe('eligible')
  })

  it('does not treat CONSOLIDATED as eligible', () => {
    for (const status of [
      'CONSOLIDATED',
      'EXITED',
      'PARENT_EXITED',
      'WATCHTOWER_EXITED',
      'TREE_NODE_STATUS_CONSOLIDATED',
    ]) {
      const [leaf] = classifyLeaves([{
        leafId: 'leaf-c',
        status,
        valueSats: 50_000n,
        leaf: { id: 'leaf-c', parentNodeId: 'root' },
        ancestors: [{ id: 'root' }],
        allocatedFeeSats: 1n,
      }], freshOptions())
      expect(leaf?.classification).toBe('unverified-status')
      expect(EXIT_CHAIN_STATUSES.has('CONSOLIDATED')).toBe(false)
    }

    const [frozen] = classifyLeaves([{
      leafId: 'leaf-f',
      status: 'FROZEN_BY_ISSUER',
      valueSats: 50_000n,
      leaf: { id: 'leaf-f' },
      ancestors: [],
      allocatedFeeSats: 1n,
    }], freshOptions())
    expect(frozen?.classification).toBe('ineligible')
  })

  it('flags stale from the caller window or knownIncomplete without a default TTL', () => {
    const input = {
      leafId: 'leaf-1',
      status: 'AVAILABLE',
      valueSats: 50_000n,
      leaf: { id: 'leaf-1' },
      ancestors: [],
      allocatedFeeSats: 1n,
    }
    const capturedAt = CAPTURED_AT
    const now = Date.parse('2026-10-15T08:00:00.000Z')
    expect(classifyLeaves([input], { now, capturedAt })[0]?.stale).toBe(false)
    expect(classifyLeaves([input], { now, capturedAt, staleAfterMs: 30 * 60 * 1000 })[0]?.stale).toBe(true)
    expect(classifyLeaves([input], { now: Date.parse(capturedAt), capturedAt, knownIncomplete: true })[0]?.stale).toBe(true)
    expect(classifyLeaves([input], { now, capturedAt, staleAfterMs: 30 * 60 * 1000 })[0]?.classification).toBe('eligible')
  })
})

describe('exit fee estimate', () => {
  it('rejects a zero or missing sat per vbyte', () => {
    expect(errorFrom(() => estimateExitFees({
      leaves: [],
      feeUtxos: [],
      satPerVbyte: 0,
    })).code).toBe('FEE_RATE_REQUIRED')
    expect(errorFrom(() => estimateExitFees({
      leaves: [],
      feeUtxos: [],
      satPerVbyte: undefined as unknown as number,
    })).message).toContain('1500')
  })

  it('counts a shared ancestor once and splits it pro-rata', () => {
    expect(estimateFeeBumpTxSize(1, true)).toBe(151)
    expect(estimateFeeBumpTxSize(2, true)).toBe(219)
    expect(p2wpkhScriptHex(GENERATOR_PUBKEY)).toBe(GENERATOR_P2WPKH)

    const result = estimateExitFees({
      satPerVbyte: 1,
      feeUtxos: [feeUtxo(10_000_000n)],
      leaves: [
        {
          leafId: 'leaf-a',
          valueSats: 3000n,
          nodes: [
            { key: 'root', parentVsize: 100 },
            { key: 'leaf-a', parentVsize: 80 },
          ],
        },
        {
          leafId: 'leaf-b',
          valueSats: 1000n,
          nodes: [
            { key: 'root', parentVsize: 100 },
            { key: 'leaf-b', parentVsize: 80 },
          ],
        },
      ],
    })

    const root = result.packages.filter((item) => item.nodeKey === 'root')
    expect(root).toHaveLength(1)
    expect(root[0]?.feeSats).toBe(251n)
    expect(root[0]?.childVsize).toBe(151)
    expect(root[0]?.shared).toBe(true)
    expect(result.totalPackageFeeSats).toBe(713n)
    expect(result.allocations.find((item) => item.leafId === 'leaf-a')).toMatchObject({
      sharedFeeSats: 188n,
      ownFeeSats: 231n,
      allocatedFeeSats: 419n,
      uneconomical: false,
    })
    expect(result.allocations.find((item) => item.leafId === 'leaf-b')).toMatchObject({
      sharedFeeSats: 63n,
      ownFeeSats: 231n,
      allocatedFeeSats: 294n,
    })
    expect(result.allocations.reduce((sum, item) => sum + item.allocatedFeeSats, 0n)).toBe(713n)
    expect(result.sweepFeeSats).toBeNull()
    expect(result.warnings).toContain(SWEEP_FEE_WARNING)
    expect(result.warnings).toContain(ONE_PASS_ALLOCATION_WARNING)
    expect(result.feeUtxoConfirmation).toBe('unknown')
    expect(result.warnings).toContain(FEE_UTXO_CONFIRMATION_UNKNOWN_WARNING)
  })

  it('marks a leaf uneconomical when its allocated cost meets its value', () => {
    const result = estimateExitFees({
      satPerVbyte: 10,
      feeUtxos: [feeUtxo(5_000_000n, { confirmed: true })],
      leaves: [{
        leafId: 'tiny',
        valueSats: 1000n,
        nodes: [{ key: 'tiny', parentVsize: 100 }],
      }],
    })
    expect(result.allocations[0]?.allocatedFeeSats).toBe(2510n)
    expect(result.allocations[0]?.uneconomical).toBe(true)
    expect(result.destinationValueSats).toBe(0n)
    expect(result.excludedUneconomicalValueSats).toBe(1000n)
    expect(result.feeUtxoConfirmation).toBe('confirmed')
    expect(result.sweepFeeSats).toBeNull()

    const [classified] = classifyLeaves([{
      leafId: 'tiny',
      status: 'AVAILABLE',
      valueSats: 1000n,
      leaf: { id: 'tiny' },
      ancestors: [],
      allocatedFeeSats: result.allocations[0]?.allocatedFeeSats ?? 0n,
    }], freshOptions())
    expect(classified?.classification).toBe('uneconomical')
  })

  it('reports dust change instead of hiding it', () => {
    const result = estimateExitFees({
      satPerVbyte: 1,
      feeUtxos: [feeUtxo(300n)],
      leaves: [{
        leafId: 'leaf-1',
        valueSats: 1_000_000n,
        nodes: [{ key: 'leaf-1', parentVsize: 100 }],
      }],
    })
    expect(result.dustChanges).toEqual([{
      nodeKey: 'leaf-1',
      changeSats: 49n,
      extraSats: 497n,
    }])
    expect(result.underfundedPackages).toEqual([])
  })

  it('does not fund fees from leaf value when the fee utxo is short', () => {
    const result = estimateExitFees({
      satPerVbyte: 1,
      feeUtxos: [feeUtxo(100n)],
      leaves: [{
        leafId: 'leaf-1',
        valueSats: 1_000_000n,
        nodes: [{ key: 'leaf-1', parentVsize: 100 }],
      }],
    })
    expect(result.underfundedPackages[0]).toMatchObject({
      feeSats: 251n,
      feeUtxoValueSats: 100n,
      shortfallSats: 251n + 546n - 100n,
    })
  })

  it('rejects a fee script that is not P2WPKH for the pubkey', () => {
    const error = errorFrom(() => estimateExitFees({
      satPerVbyte: 1,
      feeUtxos: [{
        ...feeUtxo(50_000n),
        scriptHex: `0014${'ab'.repeat(20)}`,
      }],
      leaves: [{
        leafId: 'leaf-1',
        valueSats: 50_000n,
        nodes: [{ key: 'leaf-1', parentVsize: 100 }],
      }],
    }))
    expect(error.code).toBe('FEE_UTXO_NOT_P2WPKH')
  })

  it('rejects a fee outpoint whose txid is in the exit-state set', () => {
    const error = errorFrom(() => estimateExitFees({
      satPerVbyte: 1,
      knownExitTxids: [FEE_TXID.toUpperCase()],
      feeUtxos: [feeUtxo(50_000n)],
      leaves: [{
        leafId: 'leaf-1',
        valueSats: 50_000n,
        nodes: [{ key: 'leaf-1', parentVsize: 100 }],
      }],
    }))
    expect(error.code).toBe('FEE_UTXO_IS_EXIT_TX')
  })

  it('keeps confirmation unknown unless the caller passes confirmed true', () => {
    const leaves = [{
      leafId: 'leaf-1',
      valueSats: 50_000n,
      nodes: [{ key: 'leaf-1', parentVsize: 100 }],
    }]
    expect(estimateExitFees({
      satPerVbyte: 1,
      leaves,
      feeUtxos: [feeUtxo(50_000n, { confirmed: false })],
    }).feeUtxoConfirmation).toBe('unknown')
  })
})

describe('captured nodes', () => {
  it('validates a fetched node list and does not invent a chain', () => {
    const payload = buildBundleFromNodes({
      identity: samplePayload().walletIdentity,
      capturedAt: CAPTURED_AT,
      trigger: 'manual',
      knownIncomplete: false,
      leaves: [{
        leafId: 'leaf-1',
        valueSats: 1000n,
        status: 'AVAILABLE',
        treeNodeHex: 'abcd',
        ancestorChainHex: [],
      }],
    })
    expect(payload.leaves[0]?.ancestorChainHex).toEqual([])
    expect(errorFrom(() => buildBundleFromNodes({
      identity: { ...samplePayload().walletIdentity, accountNumber: 'unset' as unknown as number },
      capturedAt: CAPTURED_AT,
      trigger: 'manual',
      knownIncomplete: false,
      leaves: [],
    })).code).toBe('RECOVERY_ACCOUNT_UNSET')
  })

  it('round-trips TreeNode protobuf hex offline', async () => {
    const proto = await import('@buildonspark/spark-sdk/proto/spark') as {
      TreeNode: TreeNodeCodec<unknown> & { fromPartial: (value: object) => unknown }
    }
    const codec = await loadSparkTreeNodeCodec()
    const node = proto.TreeNode.fromPartial({
      id: 'leaf-1',
      treeId: 'tree-1',
      value: 10_000,
      parentNodeId: 'parent-1',
      nodeTx: new Uint8Array([1, 2, 3]),
      refundTx: new Uint8Array([4, 5]),
      vout: 0,
      verifyingPublicKey: new Uint8Array(33),
      ownerIdentityPublicKey: new Uint8Array(33),
      status: 'AVAILABLE',
    })
    const hex = encodeTreeNodeHex(node, codec)
    const decoded = decodeTreeNodeHex(hex, codec) as {
      id: string
      value: number
      parentNodeId?: string
    }
    expect(hex).toMatch(/^[0-9a-f]+$/)
    expect(decoded.id).toBe('leaf-1')
    expect(decoded.value).toBe(10_000)
    expect(decoded.parentNodeId).toBe('parent-1')
  })
})

function samplePayload() {
  return buildBundleFromNodes({
    identity: {
      network: 'REGTEST',
      accountNumber: 1,
      identityPublicKey: IDENTITY,
      derivationOrigin: 'mnemonic',
    },
    capturedAt: CAPTURED_AT,
    trigger: 'manual',
    knownIncomplete: false,
    leaves: [{
      leafId: 'leaf-1',
      valueSats: 1000n,
      treeNodeHex: 'abcd',
      ancestorChainHex: ['aa'],
      status: 'AVAILABLE',
    }],
  })
}

async function signedSample(): Promise<RecoveryBundle> {
  return signBundle(samplePayload(), async (messageHex) => signWith(messageHex))
}

function signWith(messageHex: string): string {
  return createHash('sha256').update(`test-identity:${messageHex}`).digest('hex')
}

function verifyFn(messageHex: string, signature: string): Promise<boolean> {
  const expected = signWith(messageHex)
  if (expected.length !== signature.length) return Promise.resolve(false)
  return Promise.resolve(timingSafeEqual(Buffer.from(expected), Buffer.from(signature)))
}

function headerFor(
  bundle: RecoveryBundle,
  overrides: Partial<RecoveryAadHeader> = {},
): RecoveryAadHeader {
  return {
    version: 1,
    network: bundle.walletIdentity.network,
    accountNumber: bundle.walletIdentity.accountNumber,
    identityPublicKey: bundle.walletIdentity.identityPublicKey,
    ...overrides,
  }
}

function freshOptions() {
  return {
    now: Date.parse(CAPTURED_AT),
    capturedAt: CAPTURED_AT,
  }
}

function feeUtxo(valueSats: bigint, overrides: { confirmed?: boolean } = {}) {
  return {
    txid: FEE_TXID,
    vout: 0,
    valueSats,
    scriptHex: GENERATOR_P2WPKH,
    publicKeyHex: GENERATOR_PUBKEY,
    ...overrides,
  }
}

function errorFrom(run: () => unknown): RecoveryError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(RecoveryError)
    return error as RecoveryError
  }
  throw new Error('expected RecoveryError')
}

async function errorFromAsync(run: () => Promise<unknown>): Promise<RecoveryError> {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(RecoveryError)
    return error as RecoveryError
  }
  throw new Error('expected RecoveryError')
}
