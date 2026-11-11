/**
 * Fee model copied onto a catalog row. USDC and USDT only, matching the
 * server. A zero floor is not a floor: the rate still publishes.
 */
export function publishedFeeModel(
  asset: string,
  network: { feeBps?: number; feeMinCents?: number },
): { feeBps: number; feeMinCents?: number } | Record<string, never> {
  const ticker = asset.trim().toLowerCase()
  if (ticker !== 'usdc' && ticker !== 'usdt') return {}
  const feeBps = network.feeBps
  if (
    typeof feeBps !== 'number' ||
    !Number.isInteger(feeBps) ||
    feeBps < 0 ||
    feeBps >= 10_000
  ) {
    return {}
  }
  const feeMinCents = network.feeMinCents
  if (
    typeof feeMinCents !== 'number' ||
    !Number.isInteger(feeMinCents) ||
    feeMinCents <= 0
  ) {
    return { feeBps }
  }
  return { feeBps, feeMinCents }
}

/** Keep a quote only when fee and arrival are the same gross. */
export function quotedRailFields(network: {
  feeCents?: number | null
  netCents?: number | null
  minimumGrossCents?: number | null
}):
  | { feeCents: number; netCents: number; minimumGrossCents: number }
  | Record<string, never> {
  const feeCents = network.feeCents ?? undefined
  const netCents = network.netCents ?? undefined
  const minimumGrossCents = network.minimumGrossCents ?? undefined
  if (
    !isCents(feeCents) ||
    !isCents(netCents) ||
    !isCents(minimumGrossCents) ||
    feeCents + netCents !== minimumGrossCents
  ) {
    return {}
  }
  return { feeCents, netCents, minimumGrossCents }
}

function isCents(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
