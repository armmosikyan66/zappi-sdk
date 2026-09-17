import type { CashierCombo, WithdrawCombo } from '../../types/cashier'
import type {
  WithdrawOption,
  WithdrawalConfirmation,
  WithdrawalEstimate,
  WithdrawalRequest,
  WithdrawalStatus,
} from '../../types/withdraw'
import {
  isBtcNetwork,
  isCashierAsset,
  isStableNetwork,
  parseCashierCombo,
} from '../../combo'
import { btcSatsToUsdCents, usdCentsToBtcSats, type BtcUsdRate } from '../../amounts'
import { withdrawArrivalCopy } from '../../constants'
import type {
  NestPartnerWithdrawBody,
  NestWithdrawBody,
  NestWithdrawEstimateResponse,
  NestWithdrawExecuteResponse,
  NestWithdrawStatusResponse,
  NestWithdrawalOptionsResponse,
} from '../../types/partner'
import type { WithdrawQuotePayload } from '../../quote/quote-token'

/** Map a raw nest withdrawal-options response to the clean frontend catalog. */
export function mapNestWithdrawOptions(
  payload: NestWithdrawalOptionsResponse,
): WithdrawOption[] {
  const mapped: WithdrawOption[] = []

  for (const option of payload.options) {
    if (!isCashierAsset(option.asset)) continue

    if (option.asset === 'btc') {
      const networks = option.networks.flatMap((network) => {
        if (!isBtcNetwork(network.id)) return []
        return [
          {
            id: network.id,
            name: network.name,
            typicalFeeCopy: network.typicalFeeCopy,
            estimatedArrivalCopy: network.estimatedArrivalCopy,
            ...(network.minWithdrawCents !== undefined
              ? { minWithdrawCents: network.minWithdrawCents }
              : {}),
            ...(network.maxWithdrawCents !== undefined
              ? { maxWithdrawCents: network.maxWithdrawCents }
              : {}),
          },
        ]
      })
      if (networks.length === 0) continue
      mapped.push({ asset: 'btc', networks })
      continue
    }

    if (option.asset === 'eth') continue

    const networks = option.networks.flatMap((network) => {
      if (!isStableNetwork(network.id)) return []
      return [
        {
          id: network.id,
          name: network.name,
          typicalFeeCopy: network.typicalFeeCopy,
          estimatedArrivalCopy: network.estimatedArrivalCopy,
          ...(network.minWithdrawCents !== undefined
            ? { minWithdrawCents: network.minWithdrawCents }
            : {}),
          ...(network.maxWithdrawCents !== undefined
            ? { maxWithdrawCents: network.maxWithdrawCents }
            : {}),
        },
      ]
    })
    if (networks.length === 0) continue
    mapped.push({ asset: option.asset, networks })
  }

  return mapped
}

/** Nest asset code (uppercase) for a combo. */
export function nestAsset(combo: WithdrawCombo): string {
  return combo.asset.toUpperCase()
}

/** Lightning or on-chain destination address for a withdraw request. */
export function nestWithdrawAddress(req: WithdrawalRequest): string | null {
  if (req.combo.network === 'lightning' || req.bolt11) {
    const invoice = req.bolt11?.trim() || req.destinationAddress?.trim()
    return invoice || null
  }
  const address = req.destinationAddress?.trim()
  return address || null
}

/**
 * Nest execute/estimate always take USD cents of Spark USDB, including BTC
 * destinations (Orchestra off-ramp). BTC UI amounts are converted with the
 * caller-supplied spot rate — the SDK keeps **no** default/mock rate, so a
 * BTC request without a rate throws {@link MissingBtcRateError} rather than
 * pricing a real withdraw off a hardcoded number.
 */
export function nestAmountCents(
  req: WithdrawalRequest,
  btcRate?: BtcUsdRate | number,
): number | null {
  if (req.amountCents !== undefined && req.amountCents >= 1) return req.amountCents
  if (req.combo.asset === 'btc' && req.amountSats !== undefined && req.amountSats >= 1) {
    const cents = btcSatsToUsdCents(req.amountSats, btcRate)
    return cents >= 1 ? cents : null
  }
  return null
}

/** Map a raw nest estimate response to the clean frontend estimate type. */
export function mapNestEstimate(
  req: WithdrawalRequest,
  estimate: NestWithdrawEstimateResponse | null,
  maxWithdrawableCents?: number,
  btcRate?: BtcUsdRate | number,
): WithdrawalEstimate {
  const isBtc = req.combo.asset === 'btc'
  const amountCents = estimate?.amountCents ?? nestAmountCents(req, btcRate)
  const feeCents = nullableNumber(estimate?.feeCents)
  const receiveCents = nullableNumber(estimate?.receiveCents)
  const maxSats =
    maxWithdrawableCents !== undefined ? usdCentsToBtcSats(maxWithdrawableCents, btcRate) : undefined

  if (isBtc) {
    const grossSats = req.amountSats
    const feeSats = feeCents !== undefined ? usdCentsToBtcSats(feeCents, btcRate) : undefined
    const netSats =
      receiveCents !== undefined
        ? usdCentsToBtcSats(receiveCents, btcRate)
        : grossSats !== undefined && feeSats !== undefined
          ? Math.max(0, grossSats - feeSats)
          : undefined
    return {
      combo: req.combo,
      ...(grossSats !== undefined ? { grossAmountSats: grossSats } : {}),
      ...(feeSats !== undefined ? { networkFeeSats: feeSats } : {}),
      ...(netSats !== undefined ? { netReceivedSats: netSats } : {}),
      ...(amountCents !== null ? { grossAmountCents: amountCents } : {}),
      ...(feeCents !== undefined ? { networkFeeCents: feeCents } : {}),
      ...(receiveCents !== undefined ? { netReceivedCents: receiveCents } : {}),
      ...(maxSats !== undefined ? { maxWithdrawableSats: maxSats } : {}),
      ...(maxWithdrawableCents !== undefined ? { maxWithdrawableCents } : {}),
      estimatedArrivalCopy: withdrawArrivalCopy(req.combo),
    }
  }

  return {
    combo: req.combo,
    ...(amountCents !== null ? { grossAmountCents: amountCents } : {}),
    ...(feeCents !== undefined ? { networkFeeCents: feeCents } : {}),
    ...(receiveCents !== undefined
      ? { netReceivedCents: receiveCents }
      : amountCents !== null && feeCents !== undefined
        ? { netReceivedCents: Math.max(0, amountCents - feeCents) }
        : {}),
    ...(maxWithdrawableCents !== undefined ? { maxWithdrawableCents } : {}),
    estimatedArrivalCopy: withdrawArrivalCopy(req.combo),
  }
}

/** Map a raw nest withdraw-status response to the clean frontend status type. */
export function mapNestWithdrawStatus(
  payload: NestWithdrawStatusResponse,
): WithdrawalStatus | null {
  const combo = parseCashierCombo(
    payload.asset?.toLowerCase() ?? null,
    payload.networkId ?? null,
  )
  if (!combo) return null
  const address = payload.address ?? ''
  return {
    id: payload.withdrawId,
    combo,
    destinationDisplay: address,
    status: mapWithdrawStatusValue(payload.status),
    ...(payload.amountCents != null ? { grossAmountCents: payload.amountCents } : {}),
    estimatedArrivalCopy: withdrawArrivalCopy(combo),
    ...(payload.failureReason ? { failureReasonCopy: payload.failureReason } : {}),
  }
}

/** Normalize a nest status string to the frontend status union. */
export function mapWithdrawStatusValue(status: string): WithdrawalStatus['status'] {
  if (status === 'completed') return 'completed'
  if (status === 'failed' || status === 'refunded') return 'failed'
  return 'pending'
}

/** Build the nest withdraw body from a quote payload (used by two-phase). */
export function toNestWithdrawBody(
  payload: WithdrawQuotePayload,
  idempotencyKey: string,
  sparkTxHash?: string,
): NestWithdrawBody {
  return {
    asset: nestAsset(payload.combo),
    networkId: payload.combo.network,
    address: payload.address,
    amountCents: payload.amountCents,
    destinationType: 'external',
    idempotencyKey,
    ...(sparkTxHash ? { sparkTxHash } : {}),
  }
}

/** Build the partner product-wallet withdraw body from a BFF quote payload. */
export function toPartnerWithdrawBody(
  payload: WithdrawQuotePayload,
  userId: string,
  idempotencyKey: string,
  sparkTxHash?: string,
): NestPartnerWithdrawBody {
  return {
    userId,
    asset: nestAsset(payload.combo),
    networkId: payload.combo.network,
    address: payload.address,
    amountCents: payload.amountCents,
    idempotencyKey,
    ...(sparkTxHash ? { sparkTxHash } : {}),
  }
}

/** Map a nest partner execute response to the clean confirmation type. */
export function mapPartnerExecuteToConfirmation(
  res: NestWithdrawExecuteResponse,
): WithdrawalConfirmation {
  return {
    withdrawalId: res.withdrawId ?? '',
    status: mapWithdrawStatusValue(res.status),
    ...(res.needsSignature ? { needsSignature: true } : {}),
    ...(res.depositAddress != null ? { depositAddress: res.depositAddress } : {}),
    ...(res.tokenIdentifier != null ? { tokenIdentifier: res.tokenIdentifier } : {}),
    ...(res.sparkAddress != null ? { sparkAddress: res.sparkAddress } : {}),
    ...(res.accountNumber != null ? { accountNumber: res.accountNumber } : {}),
    ...(res.sendAmount != null ? { sendAmount: res.sendAmount } : {}),
  }
}

function nullableNumber(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Build a quote payload from an estimate (used by the BFF quote route). */
export function quotePayloadFromEstimate(
  req: WithdrawalRequest,
  address: string,
  amountCents: number,
  estimate: WithdrawalEstimate,
  expiresAt: string,
  userId: string,
): WithdrawQuotePayload {
  return {
    userId,
    combo: req.combo,
    address,
    amountCents,
    ...(req.amountSats !== undefined ? { amountSats: req.amountSats } : {}),
    destinationDisplay: address,
    grossAmountSats: estimate.grossAmountSats,
    grossAmountCents: estimate.grossAmountCents ?? amountCents,
    networkFeeSats: estimate.networkFeeSats,
    networkFeeCents: estimate.networkFeeCents,
    netReceivedSats: estimate.netReceivedSats,
    netReceivedCents: estimate.netReceivedCents,
    estimatedArrivalCopy:
      estimate.estimatedArrivalCopy ?? withdrawArrivalCopy(req.combo),
    expiresAt,
  }
}

export type { CashierCombo }
