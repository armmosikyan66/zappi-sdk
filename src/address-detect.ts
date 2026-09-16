import type { AddressFamily, AddressValidationResult } from './types/withdraw'

/** Network id → address family. */
export const NETWORK_FAMILY: Record<string, AddressFamily> = {
  spark: 'spark',
  solana: 'solana',
  tron: 'tron',
  ethereum: 'evm',
  base: 'evm',
  arbitrum: 'evm',
  optimism: 'evm',
  polygon: 'evm',
  bsc: 'evm',
  binance: 'evm',
  avalanche: 'evm',
  mainnet: 'bitcoin',
  bitcoin: 'bitcoin',
  lightning: 'lightning',
}

/** Catalog ids that accept this address family. */
export const NETWORKS_BY_FAMILY: Record<AddressFamily, readonly string[]> = {
  spark: ['spark'],
  solana: ['solana'],
  tron: ['tron'],
  bitcoin: ['mainnet'],
  lightning: ['lightning'],
  evm: ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bsc', 'avalanche'],
}

/** Map a network id to its address family, or null if unknown. */
export function familyForNetworkId(
  networkId: string | null | undefined,
): AddressFamily | null {
  if (!networkId) return null
  return NETWORK_FAMILY[networkId.trim().toLowerCase()] ?? null
}

/** Is this family ambiguous (multiple networks share it, e.g. EVM)? */
export function isAmbiguousAddressFamily(family: AddressFamily | null): boolean {
  return family === 'evm'
}

/** The single catalog network for a family, or null if zero or several. */
export function uniqueNetworkForFamily(family: AddressFamily | null): string | null {
  if (!family) return null
  const ids = NETWORKS_BY_FAMILY[family]
  return ids.length === 1 ? (ids[0] ?? null) : null
}

/** Catalog ids that accept this address family. */
export function networksForFamily(
  networkIds: readonly string[],
  family: AddressFamily | null,
): string[] {
  if (!family) return []
  return networkIds.filter((id) => familyForNetworkId(id) === family)
}

/** One catalog network for this family, or null if zero or several. */
export function uniqueNetworkInCatalog(
  networkIds: readonly string[],
  family: AddressFamily | null,
): string | null {
  const matches = networksForFamily(networkIds, family)
  return matches.length === 1 ? (matches[0] ?? null) : null
}

interface DetectedAddress {
  family: AddressFamily | null
  valid: boolean
  reason: string | null
  candidates?: readonly AddressFamily[]
}

/* ----------------------------- shape detectors ----------------------------- */
// Lightweight shape checks. Full checksum validation lives in the wallet's
// `wallet-address` module (which pulls @noble/hashes / @scure/base); the SDK
// keeps a zero-dependency heuristic that is good enough to pick a network
// family and reject obviously-wrong input. The backend always re-validates.

function looksLikeLightning(address: string): boolean {
  const lower = address.trim().toLowerCase().replace(/^lightning:/, '')
  return lower.startsWith('lnbc') || lower.startsWith('lntb') || lower.startsWith('lnurl1')
}

function looksLikeEvm(address: string): boolean {
  return /^0x[a-f0-9]{40}$/i.test(address.trim())
}

function looksLikeEvmShape(address: string): boolean {
  return /^0x[a-f0-9]{0,40}$/i.test(address.trim())
}

function looksLikeTron(address: string): boolean {
  return /^t[a-z0-9]{33}$/i.test(address.trim())
}

function looksLikeBitcoin(address: string): boolean {
  const a = address.trim()
  return (
    /^(bc1|tb1|bcrt1)[02-9ac-hj-np-z]{6,87}$/i.test(a) || // bech32(m)
    /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a) // legacy / p2sh
  )
}

function looksLikeSolana(address: string): boolean {
  // Base58, 32-44 chars. Not a checksum check; backend re-validates.
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim())
}

/**
 * Detect the address family of a raw destination string.
 *
 * Note: this is a **shape detector**, not a checksum validator. It is good
 * enough to pick a network family and reject obviously-wrong input. The
 * backend always re-validates with full checksum logic.
 */
export function detectAddressFamily(raw: string | null | undefined): DetectedAddress {
  const address = (raw ?? '').trim()
  if (!address) return { family: null, valid: false, reason: 'empty' }

  if (looksLikeLightning(address)) {
    return { family: 'lightning', valid: true, reason: null, candidates: ['lightning'] }
  }
  if (looksLikeEvm(address)) {
    return { family: 'evm', valid: true, reason: null, candidates: ['evm'] }
  }
  if (looksLikeEvmShape(address)) {
    return { family: 'evm', valid: false, reason: 'Invalid EVM address checksum', candidates: ['evm'] }
  }
  if (looksLikeTron(address)) {
    return { family: 'tron', valid: true, reason: null, candidates: ['tron'] }
  }
  if (looksLikeBitcoin(address)) {
    return { family: 'bitcoin', valid: true, reason: null, candidates: ['bitcoin'] }
  }
  if (looksLikeSolana(address)) {
    return { family: 'solana', valid: true, reason: null, candidates: ['solana'] }
  }

  return { family: null, valid: false, reason: 'Unrecognized address format' }
}

/**
 * Validate a destination address against a cashier network id.
 *
 * Returns `{ valid: true, normalized }` on success, or `{ valid: false, errorCopy }`
 * with a human-readable reason. This is the same shape the BFF returns from
 * `GET /wallet/withdraw/validate-address`.
 *
 * Accepts a raw `string` network id (not the typed {@link NetworkId}) so the
 * "unsupported chain" branch is reachable for unknown networks.
 */
export function validateDestination(
  address: string,
  networkId: string,
): AddressValidationResult {
  const expected = familyForNetworkId(networkId)
  if (!expected) {
    return {
      valid: false,
      errorCopy: `Unsupported chain for ${networkId}`,
      expectedFamily: null,
    }
  }

  const detected = detectAddressFamily(address)
  if (!detected.family || !detected.valid) {
    return {
      valid: false,
      errorCopy: detected.reason && detected.reason !== 'empty'
        ? detected.reason
        : 'Unrecognized address format',
      detectedFamily: detected.family,
      expectedFamily: expected,
    }
  }

  if (detected.family !== expected) {
    return {
      valid: false,
      errorCopy: `Address is for ${detected.family}, not ${networkId}`,
      detectedFamily: detected.family,
      expectedFamily: expected,
    }
  }

  return {
    valid: true,
    normalized: normalizeAddress(address, expected),
    detectedFamily: detected.family,
    expectedFamily: expected,
  }
}

function normalizeAddress(address: string, family: AddressFamily): string {
  if (family === 'evm') return address.toLowerCase()
  if (family === 'bitcoin' && /^(bc1|tb1|bcrt1)/i.test(address)) return address.toLowerCase()
  if (family === 'lightning') return address.toLowerCase()
  return address
}
