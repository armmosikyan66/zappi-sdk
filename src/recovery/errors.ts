/**
 * Typed failures for the recovery module. Messages stay static: they never
 * include seeds, keys, mnemonics, or bundle plaintext.
 */

export type RecoveryErrorCode =
  | 'RECOVERY_ACCOUNT_UNSET'
  | 'RECOVERY_BUNDLE_INVALID'
  | 'RECOVERY_DECRYPT_FAILED'
  | 'RECOVERY_SEED_INVALID'
  | 'RECOVERY_INTEGRITY_MISMATCH'
  | 'RECOVERY_SIGNATURE_INVALID'
  | 'RECOVERY_CODEC_UNAVAILABLE'
  | 'FEE_RATE_REQUIRED'
  | 'FEE_UTXO_INVALID'
  | 'FEE_UTXO_NOT_P2WPKH'
  | 'FEE_UTXO_IS_EXIT_TX'
  | 'FEE_NODE_INVALID'
  | 'FEE_NODE_CONFLICT'
  | 'FEE_UTXO_UNCONFIRMED'
  | 'EXIT_CHAIN_INCOMPLETE'
  | 'EXIT_PACKAGE_INVALID'
  | 'EXIT_SESSION_INVALID'
  | 'SWEEP_SCRIPT_UNMATCHED'
  | 'SWEEP_FEE_INVALID'
  | 'ESPLORA_BLOCKED'
  | 'CAPTURE_GAP'

export class RecoveryError extends Error {
  readonly code: RecoveryErrorCode

  constructor(code: RecoveryErrorCode, message: string) {
    super(message)
    this.name = 'RecoveryError'
    this.code = code
  }
}
