import { RecoveryError } from './errors'
import { bytesToHex } from './hash'

export { bytesToHex }

/** Even-length hex, lowercased, optional `0x` prefix stripped. */
export function normalizeHex(value: string, label: string): string {
  const hex = value.trim().toLowerCase().replace(/^0x/, '')
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', `${label} must be even-length hex.`)
  }
  return hex
}

export function hexToBytes(value: string, label: string): Uint8Array {
  const hex = normalizeHex(value, label)
  const out = new Uint8Array(hex.length / 2)
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return out
}

export function hexToBuffer(value: string, label: string): Buffer {
  return Buffer.from(hexToBytes(value, label))
}
