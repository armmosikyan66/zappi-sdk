import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  RecoveryError,
  applyChainRead,
  assertEsploraBaseUrl,
  buildSweepTransaction,
  createExitSession,
  decryptBundleWithWebCrypto,
  encryptBundle,
  encryptBundleWithWebCrypto,
  hash160,
  markSubmitted,
  markWriteAhead,
  matchRefundOutput,
  nextBroadcastable,
  p2wpkhScriptHex,
  planExitPackages,
  signBundle,
  unsignedTxFromPsbt,
  type ExitNodeRecord,
  type FeeBumpBuilder,
  type RecoveryBundle,
} from '../src/recovery'
import { bytesToHex } from '../src/recovery/hash'

const IDENTITY = `02${'11'.repeat(32)}`
const GENERATOR = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
const OTHER = `03${'22'.repeat(32)}`

function rawTx(marker: number): string {
  const prev = marker.toString(16).padStart(2, '0').repeat(32)
  return `0200000001${prev}0000000000ffffffff0100000000000000000000000000`
}

function psbtWrapping(txHex: string): string {
  const txLen = (txHex.length / 2).toString(16).padStart(2, '0')
  return `70736274ff0100${txLen}${txHex}00`
}

describe('browser hash and sealer', () => {
  it('matches node HASH160 for the secp256k1 generator', () => {
    const pub = Buffer.from(GENERATOR, 'hex')
    const node = createHash('ripemd160').update(createHash('sha256').update(pub).digest()).digest('hex')
    expect(bytesToHex(hash160(pub))).toBe(node)
    expect(p2wpkhScriptHex(GENERATOR)).toBe(`0014${node}`)
  })

  it('seals the same blob with WebCrypto and node:crypto', async () => {
    const bundle = await signed()
    const seed = new Uint8Array(64).fill(5)
    const random = { salt: new Uint8Array(16).fill(3), iv: new Uint8Array(12).fill(4) }
    const nodeBlob = encryptBundle(bundle, seed, random)
    const webBlob = await encryptBundleWithWebCrypto(bundle, seed, random)
    expect(Buffer.from(webBlob).equals(Buffer.from(nodeBlob))).toBe(true)
    const opened = await decryptBundleWithWebCrypto(webBlob, seed, {
      version: 1,
      network: 'REGTEST',
      accountNumber: 1,
      identityPublicKey: IDENTITY,
    })
    expect(opened.integrity.sha256).toBe(bundle.integrity.sha256)
  })
})

describe('offline exit planner and session', () => {
  it('keeps the refund when the node transaction was already broadcast', () => {
    const node = record('node-a', null, 0xaa, 0xab)
    const nodeTxid = txid(node.nodeTxHex)
    const packages = planExitPackages({
      leaves: [{ leafId: 'leaf-1', chain: [node] }],
      feeUtxos: [feeUtxo(true)],
      satPerVbyte: 2,
      builder: countingBuilder(),
      alreadyBroadcastTxids: new Set([nodeTxid]),
    })
    expect(packages.some((item) => item.kind === 'node')).toBe(false)
    const refund = packages.find((item) => item.kind === 'refund')
    expect(refund?.keptAfterBroadcastSkip).toBe(true)
    expect(refund?.dependsOnChildTxid).toBeNull()
    let session = createExitSession(packages, true)
    expect(nextBroadcastable(session)?.kind).toBe('refund')
    const step = nextBroadcastable(session)
    if (!step) throw new Error('missing refund')
    session = markWriteAhead(session, step.packageId)
    session = markSubmitted(session, step.packageId)
    expect(session.steps[0]?.status).toBe('submitted')
  })

  it('refuses an unconfirmed fee coin before write-ahead', () => {
    const node = record('node-a', null, 0xaa, 0xab)
    const packages = planExitPackages({
      leaves: [{ leafId: 'leaf-1', chain: [node] }],
      feeUtxos: [feeUtxo(false)],
      satPerVbyte: 1,
      builder: countingBuilder(),
    })
    const session = createExitSession(packages, false)
    expect(() => markWriteAhead(session, packages[0]!.id)).toThrow(RecoveryError)
  })

  it('waits for the child confirmation and supersedes the losing branch', () => {
    const node = record('node-a', null, 0xaa, 0xab, 0xac)
    const packages = planExitPackages({
      leaves: [{ leafId: 'leaf-1', chain: [node] }],
      feeUtxos: [feeUtxo(true)],
      satPerVbyte: 1,
      builder: countingBuilder(),
    })
    let session = createExitSession(packages, true)
    const first = nextBroadcastable(session)
    expect(first?.kind).toBe('node')
    if (!first) throw new Error('missing node')
    session = markSubmitted(markWriteAhead(session, first.packageId), first.packageId)
    expect(nextBroadcastable(session)).toBeNull()
    session = applyChainRead(session, first.packageId, 'unverified')
    expect(session.steps.find((step) => step.packageId === first.packageId)?.status).toBe('submitted')
    session = applyChainRead(session, first.packageId, 'confirmed')
    expect(session.steps.find((step) => step.packageId === first.packageId)?.status).toBe('ancestor-confirmed')
    expect(nextBroadcastable(session)?.kind).toBe('refund')
    const direct = packages.find((item) => item.kind === 'direct')
    if (!direct) throw new Error('missing direct')
    session = applyChainRead(
      markSubmitted(markWriteAhead(session, direct.id), direct.id),
      direct.id,
      'confirmed',
    )
    expect(session.steps.find((step) => step.kind === 'refund')?.status).toBe('superseded')
    session = applyChainRead(session, direct.id, 'not-in-block')
    expect(session.steps.find((step) => step.packageId === direct.id)?.status).toBe('pending')
  })

  it('rejects mempool.space and reads an unsigned psbt transaction', () => {
    expect(() => assertEsploraBaseUrl('https://mempool.space/api')).toThrow(RecoveryError)
    const tx = rawTx(0x44)
    expect(unsignedTxFromPsbt(psbtWrapping(tx))).toBe(tx)
  })
})

describe('destination sweep', () => {
  it('matches the signing key and subtracts the fee from the exited output', () => {
    const script = p2wpkhScriptHex(GENERATOR)
    const refund = txWithOutput(script, 10_000n)
    const match = matchRefundOutput({
      refundTxHex: refund,
      signingPublicKeyHex: GENERATOR,
      identityPublicKeyHex: OTHER,
    })
    expect(match.which).toBe('signing')
    expect(match.scriptType).toBe('p2wpkh')
    const swept = buildSweepTransaction({
      refundTxid: '11'.repeat(32),
      vout: match.vout,
      inputValueSats: match.valueSats,
      destinationScriptHex: script,
      feeSats: 200n,
      witness: { signatureHex: '11', publicKeyHex: GENERATOR },
    })
    const outputs = matchRefundOutput({
      refundTxHex: swept,
      signingPublicKeyHex: GENERATOR,
      identityPublicKeyHex: OTHER,
    })
    expect(outputs.valueSats).toBe(9800n)
  })

  it('refuses a refund output that matches neither key', () => {
    const refund = txWithOutput(p2wpkhScriptHex(GENERATOR), 10_000n)
    expect(() =>
      matchRefundOutput({
        refundTxHex: refund,
        signingPublicKeyHex: OTHER,
        identityPublicKeyHex: `02${'33'.repeat(32)}`,
      }),
    ).toThrow(RecoveryError)
  })
})

function record(
  id: string,
  parent: string | null,
  nodeMarker: number,
  refundMarker: number,
  directMarker?: number,
): ExitNodeRecord {
  return {
    id,
    parentNodeId: parent,
    nodeTxHex: rawTx(nodeMarker),
    refundTxHex: rawTx(refundMarker),
    ...(directMarker !== undefined ? { directTxHex: rawTx(directMarker) } : {}),
  }
}

function countingBuilder(): FeeBumpBuilder {
  let marker = 0x30
  return {
    constructFeeBumpTx() {
      marker += 1
      const childTxHex = rawTx(marker)
      return { feeBumpPsbt: psbtWrapping(childTxHex), childTxHex, usedUtxos: [] }
    },
  }
}

function feeUtxo(confirmed: boolean) {
  return {
    txid: '22'.repeat(32),
    vout: 0,
    valueSats: 50_000n,
    scriptHex: p2wpkhScriptHex(GENERATOR),
    publicKeyHex: GENERATOR,
    confirmed,
  }
}

function txid(raw: string): string {
  const stripped = Buffer.from(raw, 'hex')
  return createHash('sha256').update(createHash('sha256').update(stripped).digest()).digest().reverse().toString('hex')
}

function txWithOutput(scriptHex: string, value: bigint): string {
  const scriptLen = (scriptHex.length / 2).toString(16).padStart(2, '0')
  let rest = value
  let valueHex = ''
  for (let index = 0; index < 8; index += 1) {
    valueHex += Number(rest & 0xffn).toString(16).padStart(2, '0')
    rest >>= 8n
  }
  return `0200000001${'ab'.repeat(32)}0000000000ffffffff01${valueHex}${scriptLen}${scriptHex}00000000`
}

async function signed(): Promise<RecoveryBundle> {
  const payload = {
    schema: 1 as const,
    walletIdentity: {
      network: 'REGTEST' as const,
      accountNumber: 1,
      identityPublicKey: IDENTITY,
      derivationOrigin: 'mnemonic' as const,
    },
    freshness: {
      capturedAt: '2026-10-15T07:00:00.000Z',
      trigger: 'manual',
      knownIncomplete: false,
    },
    leaves: [
      {
        leafId: 'leaf-1',
        valueSats: 1000n,
        treeNodeHex: 'abcd',
        ancestorChainHex: ['aa'],
        status: 'AVAILABLE',
      },
    ],
  }
  return signBundle(payload, async () => 'aa')
}
