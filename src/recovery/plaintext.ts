import { RecoveryError } from './errors'
import type { RecoveryBundle } from './types'
import { bundleFromJson } from './validate'
import { assertPayloadDigest } from './integrity'

export function bundleFromPlaintextBytes(plaintext: Uint8Array): RecoveryBundle {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown
  } catch {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Recovery bundle plaintext is not a valid v1 bundle.')
  }
  const bundle = bundleFromJson(parsed)
  assertPayloadDigest(bundle)
  return bundle
}
