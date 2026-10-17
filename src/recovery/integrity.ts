import { RecoveryError } from './errors'
import type { RecoveryBundle, RecoveryBundlePayload } from './types'
import {
  hexDigestEqual,
  normalizeBundle,
  normalizePayload,
  payloadSha256,
} from './validate'

/**
 * Production wiring is the wallet identity key:
 *
 * ```ts
 * (messageHex) => wallet.signMessageWithIdentityKey(messageHex)
 * ```
 *
 * Spark's `signMessageWithIdentityKey(string)` SHA-256s that UTF-8 string
 * before signing (spark-sdk 0.11.0). The string passed here is already the
 * hex SHA-256 of the canonical payload bytes, so the signature covers
 * `sha256(hexDigest)`, not the raw canonical bytes. `verifyBundle` calls
 * `verifyFn` with that same hex digest. `validateMessageWithIdentityKey`
 * applies the same extra hash.
 */
export type RecoverySignFn = (messageHex: string) => Promise<string>

export type RecoveryVerifyFn = (messageHex: string, signatureHex: string) => Promise<boolean>

export async function signBundle(
  payload: RecoveryBundlePayload,
  signFn: RecoverySignFn,
): Promise<RecoveryBundle> {
  const normalized = normalizePayload(payload)
  const digest = payloadSha256(normalized)
  const signature = await signFn(digest)
  return normalizeBundle({
    ...normalized,
    integrity: {
      leafCount: normalized.leaves.length,
      totalSats: normalized.leaves.reduce((total, leaf) => total + leaf.valueSats, 0n),
      sha256: digest,
      signatureByIdentityKey: signature,
    },
  })
}

/**
 * Recompute the canonical payload hash, then ask `verifyFn` to check the
 * identity signature over that hex digest. A body change fails the hash.
 * A signature change fails `verifyFn`. Nothing is returned on failure.
 */
export async function verifyBundle(bundle: RecoveryBundle, verifyFn: RecoveryVerifyFn): Promise<void> {
  const digest = assertPayloadDigest(bundle)
  const signature = normalizeBundle(bundle).integrity.signatureByIdentityKey
  const ok = await verifyFn(digest, signature)
  if (ok !== true) {
    throw new RecoveryError('RECOVERY_SIGNATURE_INVALID', 'Recovery bundle signature was rejected.')
  }
}

/** Hash and totals match. Does not check the identity signature. Returns the digest. */
export function assertPayloadDigest(bundle: RecoveryBundle): string {
  const normalized = normalizeBundle(bundle)
  const digest = payloadSha256(normalized)
  if (!hexDigestEqual(digest, normalized.integrity.sha256)) {
    throw new RecoveryError('RECOVERY_INTEGRITY_MISMATCH', 'Recovery bundle integrity check failed.')
  }
  return digest
}
