import { RecoveryError } from './errors'
import { utf8Bytes } from './hash'

/** Shared sealed-blob layout for the Node sealer and the WebCrypto sealer. */

export const RECOVERY_BLOB_ENVELOPE_VERSION = 1
export const RECOVERY_BLOB_KDF_HKDF_SHA256 = 1
export const RECOVERY_BLOB_SALT_LENGTH = 16
export const RECOVERY_BLOB_IV_LENGTH = 12
export const RECOVERY_BLOB_TAG_LENGTH = 16

export interface RecoveryBlobParts {
  salt: Uint8Array
  iv: Uint8Array
  ciphertext: Uint8Array
  tag: Uint8Array
}

export interface RecoveryBlobRandom {
  salt: Uint8Array
  iv: Uint8Array
}

export function recoveryKdfInfo(network: string, accountNumber: number): Uint8Array {
  return utf8Bytes(`zappi/recovery-bundle/v1\0${network}\0${accountNumber}`)
}

export function joinRecoveryBlob(parts: RecoveryBlobParts): Uint8Array {
  assertLength(parts.salt, RECOVERY_BLOB_SALT_LENGTH, 'salt')
  assertLength(parts.iv, RECOVERY_BLOB_IV_LENGTH, 'iv')
  assertLength(parts.tag, RECOVERY_BLOB_TAG_LENGTH, 'tag')
  const out = new Uint8Array(2 + parts.salt.length + parts.iv.length + parts.ciphertext.length + parts.tag.length)
  out[0] = RECOVERY_BLOB_ENVELOPE_VERSION
  out[1] = RECOVERY_BLOB_KDF_HKDF_SHA256
  out.set(parts.salt, 2)
  out.set(parts.iv, 2 + parts.salt.length)
  const bodyAt = 2 + parts.salt.length + parts.iv.length
  out.set(parts.ciphertext, bodyAt)
  out.set(parts.tag, bodyAt + parts.ciphertext.length)
  return out
}

export function splitRecoveryBlob(blob: Uint8Array): RecoveryBlobParts {
  const headerLength = 2 + RECOVERY_BLOB_SALT_LENGTH + RECOVERY_BLOB_IV_LENGTH
  if (blob.length < headerLength + RECOVERY_BLOB_TAG_LENGTH) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Recovery blob is truncated.')
  }
  const version = blob[0]
  const kdfId = blob[1]
  if (version !== RECOVERY_BLOB_ENVELOPE_VERSION || kdfId !== RECOVERY_BLOB_KDF_HKDF_SHA256) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Unsupported recovery blob version.')
  }
  const salt = blob.slice(2, 2 + RECOVERY_BLOB_SALT_LENGTH)
  const iv = blob.slice(2 + RECOVERY_BLOB_SALT_LENGTH, headerLength)
  const body = blob.slice(headerLength)
  return {
    salt,
    iv,
    ciphertext: body.slice(0, body.length - RECOVERY_BLOB_TAG_LENGTH),
    tag: body.slice(body.length - RECOVERY_BLOB_TAG_LENGTH),
  }
}

export function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes)
}

function assertLength(bytes: Uint8Array, length: number, label: string): void {
  if (bytes.length !== length) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', `Recovery blob ${label} has the wrong length.`)
  }
}
