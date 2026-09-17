import { useMutation, useQuery } from '@tanstack/react-query'
import { useZappiClient } from './context'
import type { CashierCombo } from '../types/cashier'
import type {
  WithdrawOption,
  WithdrawalConfirmation,
  WithdrawalEstimate,
  WithdrawalQuote,
  WithdrawalRequest,
  WithdrawalStatus,
} from '../types/withdraw'
import { runTwoPhaseWithdraw, type TwoPhaseSigner } from '../quote/two-phase'
import type { WalletSigner } from '../sign/wallet-signer-port'

export const withdrawKeys = {
  options: ['zappi', 'withdraw', 'options'] as const,
  status: (id: string) => ['zappi', 'withdraw', 'status', id] as const,
}

/** Fetch the withdraw catalog. */
export function useWithdrawOptions() {
  const client = useZappiClient()
  return useQuery({
    queryKey: withdrawKeys.options,
    queryFn: ({ signal }) => client.getWithdrawOptions(signal),
    staleTime: 5 * 60 * 1000,
  })
}

/** Estimate a withdrawal (no TTL; safe to call on debounced keystrokes). */
export function useWithdrawalEstimate() {
  const client = useZappiClient()
  return useMutation({
    mutationFn: (req: WithdrawalRequest) => client.estimateWithdrawal(req),
    retry: false,
  })
}

/** Quote a withdrawal (locked, ~2 min TTL). */
export function useWithdrawalQuote() {
  const client = useZappiClient()
  return useMutation({
    mutationFn: (req: WithdrawalRequest) => client.getWithdrawalQuote(req),
    retry: false,
  })
}

export interface UseConfirmWithdrawalOptions {
  /** Signer used when the first phase returns `needsSignature`. */
  signer?: WalletSigner | TwoPhaseSigner | null
  /** Passkey step-up token. */
  authorizationToken?: string | null
}

/**
 * Confirm a withdrawal. Runs the two-phase flow when the quote requires a
 * Spark signature. Mirrors `web/hooks/use-confirm-withdrawal.ts`. Consumers
 * invalidate their own balance/transactions queries on success via the
 * returned mutation's `onSuccess` or the query client.
 */
export function useConfirmWithdrawal(opts: UseConfirmWithdrawalOptions = {}) {
  const client = useZappiClient()
  return useMutation({
    mutationFn: (quoteId: string) =>
      runTwoPhaseWithdraw(client, opts.signer ?? null, {
        quoteId,
        authorizationToken: opts.authorizationToken ?? null,
      }),
    retry: false,
  })
}

/** Poll a withdrawal status. Stops polling once terminal. */
export function useWithdrawalStatus(id: string | null) {
  const client = useZappiClient()
  return useQuery({
    queryKey: id
      ? withdrawKeys.status(id)
      : (['zappi', 'withdraw', 'status', 'none'] as const),
    queryFn: ({ signal }) => client.getWithdrawalStatus(id!, signal),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'completed' || status === 'failed' ? false : 5_000
    },
  })
}

export type {
  CashierCombo,
  WithdrawOption,
  WithdrawalConfirmation,
  WithdrawalEstimate,
  WithdrawalQuote,
  WithdrawalRequest,
  WithdrawalStatus,
}
