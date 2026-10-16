import { RecoveryError } from './errors'
import { bytesToHex, hash160 } from './hash'
import { hexToBytes, normalizeHex } from './hex'

/**
 * The refund pays the leaf key, not the user's Bitcoin address. Match the
 * refund output to the signing pubkey or the identity pubkey before signing.
 * The script type on real leaves is unverified, so both P2WPKH and P2TR
 * (x-only) are tried. The fee comes out of the exited output.
 */

export type SweepKey = 'signing' | 'identity'
export type SweepScript = 'p2wpkh' | 'p2tr'

export interface TxOutput {
  vout: number
  valueSats: bigint
  scriptHex: string
}

export interface SweepMatch {
  vout: number
  valueSats: bigint
  scriptHex: string
  which: SweepKey
  scriptType: SweepScript
}

export interface SweepWitness {
  /** DER or 64-byte schnorr hex, plus the sighash byte when the script needs it. */
  signatureHex: string
  /** Compressed pubkey for P2WPKH. Omitted for a key-path P2TR spend. */
  publicKeyHex?: string
}

const DUST_SATS = 546n

export function listTxOutputs(rawHex: string): TxOutput[] {
  const raw = hexToBytes(rawHex, 'transaction')
  let offset = 4
  if (raw[4] === 0x00 && raw[5] === 0x01) offset = 6
  const inputs = readVarint(raw, offset)
  offset = inputs.next
  for (let index = 0; index < inputs.value; index += 1) {
    offset += 36
    const script = readVarint(raw, offset)
    offset = script.next + script.value + 4
  }
  const outputs = readVarint(raw, offset)
  offset = outputs.next
  const listed: TxOutput[] = []
  for (let vout = 0; vout < outputs.value; vout += 1) {
    const value = readUint64(raw, offset)
    offset += 8
    const script = readVarint(raw, offset)
    const scriptBytes = raw.slice(script.next, script.next + script.value)
    offset = script.next + script.value
    listed.push({ vout, valueSats: value, scriptHex: bytesToHex(scriptBytes) })
  }
  return listed
}

export function matchRefundOutput(input: {
  refundTxHex: string
  signingPublicKeyHex: string
  identityPublicKeyHex: string
}): SweepMatch {
  const outputs = listTxOutputs(input.refundTxHex)
  const candidates = scriptCandidates(input.signingPublicKeyHex, input.identityPublicKeyHex)
  for (const output of outputs) {
    const match = candidates.find((candidate) => candidate.scriptHex === output.scriptHex)
    if (match) {
      return {
        vout: output.vout,
        valueSats: output.valueSats,
        scriptHex: output.scriptHex,
        which: match.which,
        scriptType: match.scriptType,
      }
    }
  }
  throw new RecoveryError(
    'SWEEP_SCRIPT_UNMATCHED',
    'Refund output did not match the signing key or the identity key.',
  )
}

export function buildSweepTransaction(input: {
  refundTxid: string
  vout: number
  inputValueSats: bigint
  destinationScriptHex: string
  feeSats: bigint
  witness: SweepWitness
}): string {
  if (input.feeSats <= 0n) {
    throw new RecoveryError('SWEEP_FEE_INVALID', 'Sweep fee must be greater than 0 and comes from the exited bitcoin.')
  }
  const outputValue = input.inputValueSats - input.feeSats
  if (outputValue < DUST_SATS) {
    throw new RecoveryError('SWEEP_FEE_INVALID', 'Sweep output would be below the dust limit.')
  }
  const txid = hexToBytes(input.refundTxid, 'refundTxid')
  if (txid.length !== 32) {
    throw new RecoveryError('EXIT_PACKAGE_INVALID', 'Refund txid must be 32 bytes.')
  }
  const destination = hexToBytes(input.destinationScriptHex, 'destination script')
  const signature = hexToBytes(input.witness.signatureHex, 'sweep signature')
  const pubkey = input.witness.publicKeyHex
    ? hexToBytes(input.witness.publicKeyHex, 'sweep pubkey')
    : null
  const parts: Uint8Array[] = [
    hexToBytes('02000000', 'version'),
    hexToBytes('0001', 'marker'),
    hexToBytes('01', 'inputs'),
    reverse(txid),
    uint32(input.vout),
    hexToBytes('00', 'scriptSig'),
    hexToBytes('ffffffff', 'sequence'),
    hexToBytes('01', 'outputs'),
    uint64(outputValue),
    varBytes(destination),
  ]
  const witnessItems = pubkey ? [signature, pubkey] : [signature]
  parts.push(varint(witnessItems.length))
  for (const item of witnessItems) parts.push(varBytes(item))
  parts.push(hexToBytes('00000000', 'locktime'))
  return bytesToHex(concat(parts))
}

function scriptCandidates(
  signingPublicKeyHex: string,
  identityPublicKeyHex: string,
): { which: SweepKey; scriptType: SweepScript; scriptHex: string }[] {
  const signing = scriptsFor(signingPublicKeyHex)
  const identity = scriptsFor(identityPublicKeyHex)
  return [
    { which: 'signing', scriptType: signing.p2wpkh.scriptType, scriptHex: signing.p2wpkh.scriptHex },
    { which: 'signing', scriptType: signing.p2tr.scriptType, scriptHex: signing.p2tr.scriptHex },
    { which: 'identity', scriptType: identity.p2wpkh.scriptType, scriptHex: identity.p2wpkh.scriptHex },
    { which: 'identity', scriptType: identity.p2tr.scriptType, scriptHex: identity.p2tr.scriptHex },
  ]
}

function scriptsFor(publicKeyHex: string): {
  p2wpkh: { scriptType: SweepScript; scriptHex: string }
  p2tr: { scriptType: SweepScript; scriptHex: string }
} {
  const pub = hexToBytes(publicKeyHex, 'public key')
  if (pub.length !== 33 || (pub[0] !== 0x02 && pub[0] !== 0x03)) {
    throw new RecoveryError('SWEEP_SCRIPT_UNMATCHED', 'Sweep matching expects a compressed public key.')
  }
  return {
    p2wpkh: { scriptType: 'p2wpkh', scriptHex: `0014${bytesToHex(hash160(pub))}` },
    p2tr: { scriptType: 'p2tr', scriptHex: `5120${bytesToHex(pub.slice(1))}` },
  }
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  const first = bytes[offset]
  if (first === undefined) {
    throw new RecoveryError('EXIT_PACKAGE_INVALID', 'Transaction hex is truncated.')
  }
  if (first < 0xfd) return { value: first, next: offset + 1 }
  if (first === 0xfd) {
    return { value: (bytes[offset + 1] ?? 0) | ((bytes[offset + 2] ?? 0) << 8), next: offset + 3 }
  }
  throw new RecoveryError('EXIT_PACKAGE_INVALID', 'Transaction varint is too large for the sweep parser.')
}

function readUint64(bytes: Uint8Array, offset: number): bigint {
  let value = 0n
  for (let index = 0; index < 8; index += 1) {
    value |= BigInt(bytes[offset + index] ?? 0) << BigInt(index * 8)
  }
  return value
}

function uint32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

function uint64(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  let rest = value
  for (let index = 0; index < 8; index += 1) {
    out[index] = Number(rest & 0xffn)
    rest >>= 8n
  }
  return out
}

function varint(value: number): Uint8Array {
  if (value < 0xfd) return Uint8Array.of(value)
  const out = new Uint8Array(3)
  out[0] = 0xfd
  out[1] = value & 0xff
  out[2] = (value >> 8) & 0xff
  return out
}

function varBytes(bytes: Uint8Array): Uint8Array {
  return concat([varint(bytes.length), bytes])
}

function reverse(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes).reverse()
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function normalizeDestinationScript(scriptHex: string): string {
  return normalizeHex(scriptHex, 'destination script')
}
