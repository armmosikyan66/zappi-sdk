import { RecoveryError } from './errors'

/**
 * Canonical bytes for recovery bundle v1.
 *
 * JCS-like encoding (RFC 8785) narrowed to the types this schema stores.
 * It is not a full RFC 8785 implementation.
 *
 * 1. Walk objects, arrays, strings, booleans, null, safe integers, and bigint.
 * 2. Objects emit keys in ascending UTF-16 code-unit order (`Array.sort` on
 *    the strings). Keys whose value is `undefined` are dropped. No whitespace
 *    before or after `:` or `,`.
 * 3. Arrays keep their order. Ancestor chains are root-first and are not sorted.
 * 4. Strings use `JSON.stringify` escaping.
 * 5. Safe integers use `JSON.stringify` (decimal, no exponent).
 * 6. Bigint satoshi amounts become quoted decimal strings: `1000n` → `"1000"`.
 * 7. The text is UTF-8. SHA-256 covers those bytes.
 *
 * The integrity object is not part of the signed payload. Hex strings are
 * lowercased by `normalizePayload` before this function runs.
 */

export function canonicalize(value: unknown): string {
  return serialize(value)
}

function serialize(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'bigint') return JSON.stringify(value.toString(10))
  if (typeof value === 'number') return serializeNumber(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item)).join(',')}]`
  }
  if (typeof value === 'object') return serializeObject(value)
  throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Recovery bundle contains an unsupported value.')
}

function serializeNumber(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new RecoveryError('RECOVERY_BUNDLE_INVALID', 'Recovery bundle numbers must be safe integers.')
  }
  return JSON.stringify(value)
}

function serializeObject(value: object): string {
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
  const body = keys.map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`).join(',')
  return `{${body}}`
}
