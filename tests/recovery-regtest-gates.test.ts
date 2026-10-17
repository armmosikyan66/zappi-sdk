import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  RecoveryError,
  assertEsploraBaseUrl,
  classifyLeaves,
  createExitSession,
  markWriteAhead,
  planExitPackages,
  p2wpkhScriptHex,
  type FeeBumpBuilder,
} from '../src/recovery'

/**
 * Regtest gates that do not need a live operator or bitcoind.
 * A failed chain read is unverified. CONSOLIDATED is not eligible.
 * Fee coins must be confirmed. mempool.space is never contacted.
 */

const GENERATOR = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
const calls: string[] = []

beforeAll(() => {
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(String(url))
    return Promise.reject(new Error('recovery gates must not use the network'))
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('l1 recovery regtest gates', () => {
  it('holds the offline rules without a network call', () => {
    const classified = classifyLeaves(
      [
        {
          leafId: 'consolidated',
          status: 'CONSOLIDATED',
          valueSats: 50_000n,
          allocatedFeeSats: 100n,
          leaf: { id: 'consolidated', parentNodeId: null },
          ancestors: [],
        },
      ],
      { now: Date.parse('2026-10-15T08:00:00Z'), capturedAt: '2026-10-15T08:00:00.000Z' },
    )
    expect(classified[0]?.classification).toBe('unverified-status')

    const packages = planExitPackages({
      leaves: [
        {
          leafId: 'leaf-1',
          chain: [
            {
              id: 'root',
              parentNodeId: null,
              nodeTxHex: rawTx(0x61),
              refundTxHex: rawTx(0x62),
            },
          ],
        },
      ],
      feeUtxos: [
        {
          txid: '33'.repeat(32),
          vout: 0,
          valueSats: 20_000n,
          scriptHex: p2wpkhScriptHex(GENERATOR),
          publicKeyHex: GENERATOR,
          confirmed: false,
        },
      ],
      satPerVbyte: 1,
      builder: builder(),
    })
    expect(() => markWriteAhead(createExitSession(packages, false), packages[0]!.id)).toThrow(RecoveryError)
    expect(() => assertEsploraBaseUrl('https://mempool.space/api')).toThrow(/mempool\.space/)
    expect(calls).toEqual([])
  })
})

function rawTx(marker: number): string {
  const prev = marker.toString(16).padStart(2, '0').repeat(32)
  return `0200000001${prev}0000000000ffffffff0100000000000000000000000000`
}

function builder(): FeeBumpBuilder {
  return {
    constructFeeBumpTx() {
      const childTxHex = rawTx(0x70)
      return { feeBumpPsbt: '70736274ff', childTxHex, usedUtxos: [] }
    },
  }
}
