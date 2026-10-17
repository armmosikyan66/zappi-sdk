import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto'
import {
  joinRecoveryBlob,
  recoveryKdfInfo,
  splitRecoveryBlob,
  type RecoveryBlobRandom,
} from './blob'
import { RecoveryError } from './errors'
import { assertPayloadDigest } from './integrity'
import { bundleFromPlaintextBytes } from './plaintext'
import type { RecoveryAadHeader, RecoveryBundle } from './types'
import { canonicalAadHeader, canonicalBundle, normalizeAadHeader, normalizeBundle } from './validate'

/**
 * Recommended v1 encryption: HKDF-SHA256 from a 64-byte BIP-39 seed into
 * AES-256-GCM. The seed is already high entropy, and the bundle is useless
 * without the wallet keys.
 *
 * Passphrase KDF (PBKDF2 or Argon2id) is an open product decision and is not
 * implemented here. Pass seed bytes, never a mnemonic string.
 *
 * HKDF `info` is UTF-8 `zappi/recovery-bundle/v1`, a NUL, the network, a NUL,
 * and the decimal accountNumber. That domain separator is why a blob sealed
 * for one account or network will not open for another.
 *
 * AAD is the canonical header (version, network, accountNumber,
 * identityPublicKey). Wrong AAD, a flipped ciphertext byte, or the wrong
 * account fails closed: a typed error, no plaintext returned.
 *
 * Blob layout:
 * - byte 0: envelope version `1`
 * - byte 1: KDF id `1` (HKDF-SHA256)
 * - bytes 2..17: random 16-byte HKDF salt
 * - bytes 18..29: random 12-byte AES-GCM IV
 * - the rest: ciphertext || 16-byte GCM tag
 */
export const RECOVERY_BUNDLE_KDF_LABEL = 'zappi/recovery-bundle/v1'

const KEY_LENGTH = 32

export const RECOVERY_SEED_LENGTH = 64

export function encryptBundle(
  bundle: RecoveryBundle,
  seed: Uint8Array,
  random?: RecoveryBlobRandom,
): Uint8Array {
  const normalized = normalizeBundle(bundle)
  assertPayloadDigest(normalized)
  const header = headerFromBundle(normalized)
  const seedBytes = copySeed(seed)
  try {
    const salt = random ? Buffer.from(random.salt) : randomBytes(16)
    const iv = random ? Buffer.from(random.iv) : randomBytes(12)
    const key = deriveKey(seedBytes, salt, Buffer.from(recoveryKdfInfo(header.network, header.accountNumber)))
    try {
      const plaintext = Buffer.from(canonicalBundle(normalized), 'utf8')
      try {
        const sealed = seal(key, iv, Buffer.from(canonicalAadHeader(header), 'utf8'), plaintext)
        return Buffer.from(
          joinRecoveryBlob({
            salt,
            iv,
            ciphertext: sealed.ciphertext,
            tag: sealed.tag,
          }),
        )
      } finally {
        plaintext.fill(0)
      }
    } finally {
      key.fill(0)
    }
  } finally {
    seedBytes.fill(0)
  }
}

export function decryptBundle(
  blob: Uint8Array,
  seed: Uint8Array,
  expected: RecoveryAadHeader,
): RecoveryBundle {
  const header = normalizeAadHeader(expected)
  const parsed = parseBlob(blob)
  const seedBytes = copySeed(seed)
  try {
    const key = deriveKey(seedBytes, parsed.salt, Buffer.from(recoveryKdfInfo(header.network, header.accountNumber)))
    try {
      const plaintext = open(
        key,
        parsed.iv,
        Buffer.from(canonicalAadHeader(header), 'utf8'),
        parsed.ciphertext,
        parsed.tag,
      )
      try {
        const bundle = bundleFromPlaintext(plaintext)
        if (!headerMatches(bundle, header)) {
          throw new RecoveryError('RECOVERY_DECRYPT_FAILED', 'Recovery bundle could not be decrypted.')
        }
        return bundle
      } finally {
        plaintext.fill(0)
      }
    } finally {
      key.fill(0)
    }
  } finally {
    seedBytes.fill(0)
  }
}

function headerFromBundle(bundle: RecoveryBundle): RecoveryAadHeader {
  return normalizeAadHeader({
    version: bundle.schema,
    network: bundle.walletIdentity.network,
    accountNumber: bundle.walletIdentity.accountNumber,
    identityPublicKey: bundle.walletIdentity.identityPublicKey,
  })
}

function headerMatches(bundle: RecoveryBundle, header: RecoveryAadHeader): boolean {
  return (
    bundle.schema === header.version &&
    bundle.walletIdentity.network === header.network &&
    bundle.walletIdentity.accountNumber === header.accountNumber &&
    bundle.walletIdentity.identityPublicKey === header.identityPublicKey
  )
}

function copySeed(seed: Uint8Array): Buffer {
  if (typeof seed === 'string' || !(seed instanceof Uint8Array)) {
    throw new RecoveryError(
      'RECOVERY_SEED_INVALID',
      'Pass a 64-byte seed. Passphrase KDF is not implemented, and mnemonics are not accepted here.',
    )
  }
  if (seed.byteLength !== RECOVERY_SEED_LENGTH) {
    throw new RecoveryError('RECOVERY_SEED_INVALID', 'Recovery encryption expects a 64-byte BIP-39 seed.')
  }
  return Buffer.from(seed)
}

function deriveKey(seed: Buffer, salt: Buffer, info: Buffer): Buffer {
  const derived = hkdfSync('sha256', seed, salt, info, KEY_LENGTH)
  return Buffer.from(derived)
}

function seal(
  key: Buffer,
  iv: Buffer,
  aad: Buffer,
  plaintext: Buffer,
): { ciphertext: Buffer; tag: Buffer } {
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return { ciphertext, tag: cipher.getAuthTag() }
}

function open(
  key: Buffer,
  iv: Buffer,
  aad: Buffer,
  ciphertext: Buffer,
  tag: Buffer,
): Buffer {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(aad)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new RecoveryError('RECOVERY_DECRYPT_FAILED', 'Recovery bundle could not be decrypted.')
  }
}

function bundleFromPlaintext(plaintext: Buffer): RecoveryBundle {
  return bundleFromPlaintextBytes(plaintext)
}

function parseBlob(blob: Uint8Array): {
  salt: Buffer
  iv: Buffer
  ciphertext: Buffer
  tag: Buffer
} {
  const parts = splitRecoveryBlob(blob)
  return {
    salt: Buffer.from(parts.salt),
    iv: Buffer.from(parts.iv),
    ciphertext: Buffer.from(parts.ciphertext),
    tag: Buffer.from(parts.tag),
  }
}
