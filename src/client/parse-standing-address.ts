import type {
  StandingBitcoinLimits,
  StandingDepositAddress,
  StandingEffectiveMinimum,
} from '../types/standing'

const STANDING_FLOOR_SOURCES = new Set(['xchain_global_bound', 'source_asset_floor'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readTrimmed = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const readDigits = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim()
  }
  return null
}

const readAddresses = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {}
  const addresses: Record<string, string> = {}
  for (const [chain, raw] of Object.entries(value)) {
    const name = chain.trim()
    const address = readTrimmed(raw)
    if (name && address) addresses[name] = address
  }
  return addresses
}

const readEffectiveMinimum = (
  value: unknown,
): StandingEffectiveMinimum | null => {
  if (!isRecord(value)) return null
  const usdCents = readDigits(value.usdCents)
  const source = readTrimmed(value.source)
  if (!usdCents || !source) return null
  return {
    usdCents,
    source,
    sourceAmountSmallest: readDigits(value.sourceAmountSmallest),
  }
}

const readBitcoinLimits = (value: unknown): StandingBitcoinLimits | null => {
  if (!isRecord(value) || typeof value.largeUnitSupported !== 'boolean') {
    return null
  }
  return {
    largeUnitSupported: value.largeUnitSupported,
    source: isRecord(value.source) ? value.source : {},
    destination: 'destination' in value ? (value.destination ?? null) : null,
  }
}

/**
 * Typed standing-address body. Returns null when the payload is not an object.
 * An empty address map is still a valid read: a per-route probe may only
 * carry `effectiveMinimum`.
 */
export function parseStandingDepositAddress(
  payload: unknown,
): StandingDepositAddress | null {
  if (!isRecord(payload)) return null
  const effectiveMinimum = readEffectiveMinimum(payload.effectiveMinimum)
  const cents = effectiveMinimum ? Number(effectiveMinimum.usdCents) : NaN
  const standingFloor =
    effectiveMinimum !== null &&
    STANDING_FLOOR_SOURCES.has(effectiveMinimum.source) &&
    Number.isSafeInteger(cents)
  const enabled = payload.enabled
  return {
    standingAddressId: readTrimmed(payload.standingAddressId),
    addresses: readAddresses(payload.addresses),
    enabled: typeof enabled === 'boolean' ? enabled : true,
    effectiveMinimum,
    minimumUsdCents: standingFloor ? cents : null,
    minimumSource: standingFloor ? effectiveMinimum.source : null,
    bitcoinLimits: readBitcoinLimits(payload.bitcoinLimits),
  }
}
