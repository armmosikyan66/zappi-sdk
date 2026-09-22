/**
 * Raw zappi-nest send (user-facing) response shapes. Source:
 * `server/src/wallet/transfer/dto/transfer.dto.ts` and
 * `server/src/wallet/withdraw/dto/withdraw.dto.ts`.
 *
 * The session-scoped `POST /api/wallet/send/external` route shares its body
 * shape with the project-key withdraw body but is keyed off the user JWT.
 */

import type { NestWithdrawEstimateResponse } from './partner'

/** `GET /api/wallet/send/resolve?recipientUserId=` response. */
export interface NestResolveSendTargetResponse {
  ok: true
  recipient: {
    id: string
    displayName?: string
    username?: string
  }
  recipientCustody: 'user-held' | 'custodial'
  destinationSparkAddress: string | null
}

/** `POST /api/wallet/send/external` body (session route). */
export interface NestSendExternalBody {
  asset: string
  networkId: string
  address: string
  amountCents: number
  destinationType?: 'external'
  idempotencyKey?: string
  sparkTxHash?: string
}

/** `GET /api/wallet/send/options` response — same shape as withdrawal options. */
export interface NestSendOptionsResponse {
  ok: true
  options: Array<{ asset: string; networks: Array<Record<string, unknown>> }>
}

/** `GET /api/wallet/send/validate-address?asset=&network=&address=` response. */
export interface NestValidateSendAddressResponse {
  valid: boolean
  normalized?: string
  errorCopy?: string
}

/** `GET /api/wallet/send/estimate?...` response — same shape as withdraw estimate. */
export type NestEstimateSendResponse = NestWithdrawEstimateResponse

/** `GET /api/wallet/send/status?withdrawId=` response. */
export interface NestSendStatusResponse {
  ok: true
  withdrawId: string
  status: string
  destinationType?: 'external'
  quoteId?: string | null
  orderId?: string | null
  sparkTxHash?: string | null
  asset?: string | null
  networkId?: string | null
  address?: string | null
  amountCents?: number | null
  failureReason?: string | null
  sourceCustody?: 'user-held'
}
