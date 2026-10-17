import {
  joinRecoveryBlob,
  recoveryKdfInfo,
  splitRecoveryBlob,
  type RecoveryBlobRandom,
} from './blob'
import { bundleFromPlaintextBytes } from './plaintext'
import { RecoveryError } from './errors'
import { utf8Bytes } from './hash'
import type { RecoveryAadHeader, RecoveryBundle } from './types'
import { canonicalAadHeader, canonicalBundle, normalizeAadHeader, normalizeBundle } from './validate'
import { assertPayloadDigest } from './integrity'

/**
 * Same blob as `encryptBundle`, sealed with WebCrypto instead of `node:crypto`.
 * Pass the same salt and IV to prove the bytes match. Random salt and IV are
 * used when `random` is omitted.
 */

const KEY_LENGTH = 32

export async function encryptBundleWithWebCrypto(
  bundle: RecoveryBundle,
  seed: Uint8Array,
  random?: RecoveryBlobRandom,
): Promise<Uint8Array> {
  const normalized = normalizeBundle(bundle)
  assertPayloadDigest(normalized)
  const header = headerFromBundle(normalized)
  const seedBytes = copySeed(seed)
  const salt = random ? copyExact(random.salt, 16, 'salt') : crypto.getRandomValues(new Uint8Array(16))
  const iv = random ? copyExact(random.iv, 12, 'iv') : crypto.getRandomValues(new Uint8Array(12))
  try {
    const key = await deriveKey(seedBytes, salt, recoveryKdfInfo(header.network, header.accountNumber))
    const plaintext = utf8Bytes(canonicalBundle(normalized))
    try {
      const sealed = await seal(key, iv, utf8Bytes(canonicalAadHeader(header)), plaintext)
      return joinRecoveryBlob({ salt, iv, ciphertext: sealed.ciphertext, tag: sealed.tag })
    } finally {
      plaintext.fill(0)
      key.fill(0)
    }
  } finally {
    seedBytes.fill(0)
  }
}

export async function decryptBundleWithWebCrypto(
  blob: Uint8Array,
  seed: Uint8Array,
  expected: RecoveryAadHeader,
): Promise<RecoveryBundle> {
  const header = normalizeAadHeader(expected)
  const parsed = splitRecoveryBlob(blob)
  const seedBytes = copySeed(seed)
  try {
    const key = await deriveKey(seedBytes, parsed.salt, recoveryKdfInfo(header.network, header.accountNumber))
    const plaintext = await open(key, parsed.iv, utf8Bytes(canonicalAadHeader(header)), parsed.ciphertext, parsed.tag)
    key.fill(0)
    try {
      const bundle = bundleFromPlaintextBytes(plaintext)
      if (
        bundle.schema !== header.version ||
        bundle.walletIdentity.network !== header.network ||
        bundle.walletIdentity.accountNumber !== header.accountNumber ||
        bundle.walletIdentity.identityPublicKey !== header.identityPublicKey
      ) {
        throw new RecoveryError('RECOVERY_DECRYPT_FAILED', 'Recovery bundle could not be decrypted.')
      }
      return bundle
    } finally {
      plaintext.fill(0)
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

function copySeed(seed: Uint8Array): Uint8Array {
  if (typeof seed === 'string' || !(seed instanceof Uint8Array) || seed.byteLength !== 64) {
    throw new RecoveryError('RECOVERY_SEED_INVALID', 'Recovery encryption expects a 64-byte BIP-39 seed.')
  }
  return new Uint8Array(seed)
}

function copyExact(bytes: Uint8Array, length: number, label: string): Uint8Array {
  if (bytes.length !== length) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', `Recovery blob ${label} has the wrong length.`)
  }
  return new Uint8Array(bytes)
}

async function deriveKey(seed: Uint8Array, salt: Uint8Array, info: Uint8Array): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', copyBuffer(seed), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: copyBuffer(salt), info: copyBuffer(info) },
    base,
    KEY_LENGTH * 8,
  )
  return new Uint8Array(bits)
}

async function seal(
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
): Promise<{ ciphertext: Uint8Array; tag: Uint8Array }> {
  const cryptoKey = await crypto.subtle.importKey('raw', copyBuffer(key), 'AES-GCM', false, ['encrypt'])
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: copyBuffer(iv), additionalData: copyBuffer(aad), tagLength: 128 },
      cryptoKey,
      copyBuffer(plaintext),
    ),
  )
  return {
    ciphertext: sealed.slice(0, sealed.length - 16),
    tag: sealed.slice(sealed.length - 16),
  }
}

async function open(
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
): Promise<Uint8Array> {
  const combined = new Uint8Array(ciphertext.length + tag.length)
  combined.set(ciphertext, 0)
  combined.set(tag, ciphertext.length)
  try {
    const cryptoKey = await crypto.subtle.importKey('raw', copyBuffer(key), 'AES-GCM', false, ['decrypt'])
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: copyBuffer(iv), additionalData: copyBuffer(aad), tagLength: 128 },
        cryptoKey,
        combined,
      ),
    )
  } catch {
    throw new RecoveryError('RECOVERY_DECRYPT_FAILED', 'Recovery bundle could not be decrypted.')
  }
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer
}
