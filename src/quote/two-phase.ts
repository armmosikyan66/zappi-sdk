import type { WithdrawalConfirmation } from '../types/withdraw'
import type { WalletSigner } from '../sign/wallet-signer-port'
import type { NestPartnerWithdrawBody, NestWithdrawExecuteResponse } from '../types/partner'
import { mapPartnerExecuteToConfirmation } from '../client/mappers/withdraw-map'

/**
 * The minimal client surface the two-phase orchestrator needs. This is a
 * structural interface so callers can pass either a full {@link ZappiClient}
 * (server/partner) or a thin shim that delegates to a BFF route (browser).
 * It only ever calls `confirmWithdrawal`.
 */
export interface TwoPhaseClient {
  confirmWithdrawal(
    quoteId: string,
    sparkTxHash?: string,
    authorizationToken?: string | null,
    signal?: AbortSignal,
  ): Promise<WithdrawalConfirmation>
}

/**
 * The minimal signer surface the two-phase orchestrator needs. This is a
 * structural interface so callers can pass either the real `/sign` signer or
 * a test double without depending on `@buildonspark/spark-sdk`.
 */
export interface TwoPhaseSigner {
  transferUsdb(params: {
    tokenIdentifier: string
    tokenAmount: bigint
    receiverSparkAddress: string
  }): Promise<{ sparkTxHash: string }>
}

/* ------------------------- legacy alias (0.1.x) ------------------------- */
/** @deprecated The two-phase flow now speaks {@link WalletSigner}. */
export type SparkSigner = WalletSigner

export interface RunTwoPhaseWithdrawOptions {
  quoteId: string
  /** Passkey step-up token (`X-Zappi-Authorization`). Omit / null for none. */
  authorizationToken?: string | null
  /** Per-request signal. */
  signal?: AbortSignal
  /**
   * Optional override for the signer to use. Defaults to the `signer` arg.
   * Useful when the caller wants a different signer per request.
   */
  signer?: TwoPhaseSigner
}

/**
 * Orchestrate the two-phase withdraw flow:
 *
 * 1. `confirmWithdrawal(quoteId)` — if `!needsSignature`, return immediately.
 * 2. Sign Spark USDB to `depositAddress` for `sendAmount` of `tokenIdentifier`.
 * 3. `confirmWithdrawal(quoteId, sparkTxHash)` — final confirmation.
 *
 * This is the exact sequence in `web/hooks/use-confirm-withdrawal.ts` and
 * BitKong's `withdraw.py` confirm phase — extracted once so both reuse it.
 *
 * Throws if the first phase returns `needsSignature` but is missing the
 * required send details (`depositAddress`, `tokenIdentifier`, `sendAmount`),
 * or if no signer is provided when one is required.
 */
export async function runTwoPhaseWithdraw(
  client: TwoPhaseClient,
  signer: WalletSigner | TwoPhaseSigner | null,
  options: RunTwoPhaseWithdrawOptions,
): Promise<WithdrawalConfirmation> {
  const { quoteId, authorizationToken = null, signal } = options
  const activeSigner = options.signer ?? signer

  const first = await client.confirmWithdrawal(quoteId, undefined, authorizationToken, signal)
  if (!first.needsSignature) return first

  if (!activeSigner) {
    throw new TwoPhaseWithdrawError(
      'SIGNER_REQUIRED',
      'Withdraw requires a Spark signature but no signer was provided.',
    )
  }
  if (!first.depositAddress || !first.tokenIdentifier || !first.sendAmount) {
    throw new TwoPhaseWithdrawError(
      'MISSING_SEND_DETAILS',
      'Withdraw quote is missing send details (depositAddress, tokenIdentifier, sendAmount).',
    )
  }

  const { sparkTxHash } = await activeSigner.transferUsdb({
    tokenIdentifier: first.tokenIdentifier,
    tokenAmount: BigInt(first.sendAmount),
    receiverSparkAddress: first.depositAddress,
  })

  return client.confirmWithdrawal(quoteId, sparkTxHash, authorizationToken, signal)
}

/**
 * Two-phase partner payout from the Integration product Spark wallet.
 *
 * 1. `partnerWithdraw(body)` — if `!needsSignature`, return immediately.
 * 2. Sign Spark USDB to `depositAddress` for `sendAmount` of `tokenIdentifier`.
 * 3. `partnerWithdraw({ ...body, sparkTxHash })` — complete the Orchestra order.
 *
 * Nest never holds the product mnemonic. The partner signs locally with
 * {@link createWalletSigner} from `@zappi/sdk/sign`.
 */
export async function runTwoPhasePartnerWithdraw(
  client: PartnerWithdrawClient,
  signer: WalletSigner | TwoPhaseSigner | null,
  body: NestPartnerWithdrawBody,
  options: Omit<RunTwoPhaseWithdrawOptions, 'quoteId'> = {},
): Promise<WithdrawalConfirmation> {
  const { authorizationToken = null, signal } = options
  const activeSigner = options.signer ?? signer

  const first = mapPartnerExecuteToConfirmation(
    await client.partnerWithdraw(body, authorizationToken, signal),
  )
  if (!first.needsSignature) return first

  if (!activeSigner) {
    throw new TwoPhaseWithdrawError(
      'SIGNER_REQUIRED',
      'Withdraw requires a Spark signature but no signer was provided.',
    )
  }
  if (!first.depositAddress || !first.tokenIdentifier || !first.sendAmount) {
    throw new TwoPhaseWithdrawError(
      'MISSING_SEND_DETAILS',
      'Withdraw quote is missing send details (depositAddress, tokenIdentifier, sendAmount).',
    )
  }

  const { sparkTxHash } = await activeSigner.transferUsdb({
    tokenIdentifier: first.tokenIdentifier,
    tokenAmount: BigInt(first.sendAmount),
    receiverSparkAddress: first.depositAddress,
  })

  return mapPartnerExecuteToConfirmation(
    await client.partnerWithdraw(
      { ...body, sparkTxHash },
      authorizationToken,
      signal,
    ),
  )
}

/** Minimal client surface for {@link runTwoPhasePartnerWithdraw}. */
export interface PartnerWithdrawClient {
  partnerWithdraw(
    body: NestPartnerWithdrawBody,
    authorizationToken?: string | null,
    signal?: AbortSignal,
  ): Promise<NestWithdrawExecuteResponse>
}

/** Error thrown when the two-phase flow cannot proceed. */
export class TwoPhaseWithdrawError extends Error {
  constructor(
    readonly code: 'SIGNER_REQUIRED' | 'MISSING_SEND_DETAILS',
    message: string,
  ) {
    super(message)
    this.name = 'TwoPhaseWithdrawError'
  }
}
