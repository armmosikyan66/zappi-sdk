/**
 * GET /v1/standing-deposit-addresses/{ref}
 * https://docs.flashnet.xyz/api-reference/standing-deposit-addresses/get-standing-address
 *
 * The published schema is `standingAddressId`, `addresses`, and `enabled`.
 * `effectiveMinimum` is returned by the live API when the caller asks for one
 * source rail (`sourceChain` + `sourceAsset`) and also on the unscoped GET.
 */

/** Why Flashnet chose this floor. `limits_band` is the swap minimum, not a standing floor. */
export type StandingMinimumSource =
  | 'xchain_global_bound'
  | 'source_asset_floor'
  | 'limits_band'
  | (string & {})

/** Floor the standing address enforces. A send below it is held. */
export interface StandingEffectiveMinimum {
  /** USD cents, as digits. Flashnet sends this as a string. */
  usdCents: string
  /** Source-asset smallest units at this floor. Null on the instruction-wide bound. */
  sourceAmountSmallest: string | null
  source: StandingMinimumSource
}

/** Bitcoin flags sometimes copied onto the same payload. */
export interface StandingBitcoinLimits {
  largeUnitSupported: boolean
  source: Record<string, unknown>
  destination: unknown
}

/**
 * Permanent deposit addresses for one instruction, plus the floor that
 * instruction enforces for the requested source rail.
 */
export interface StandingDepositAddress {
  standingAddressId: string | null
  /** Source chain → deposit address. */
  addresses: Record<string, string>
  enabled: boolean
  effectiveMinimum: StandingEffectiveMinimum | null
  /**
   * `effectiveMinimum.usdCents` when the source is a standing bound.
   * Null when the payload is missing, partial, or only a swap `limits_band`.
   */
  minimumUsdCents: number | null
  /** Standing bound name. Null when `minimumUsdCents` is null. */
  minimumSource: string | null
  bitcoinLimits: StandingBitcoinLimits | null
}
