import { useQuery } from '@tanstack/react-query'
import { useZappiClient } from './context'
import type { CashierCombo } from '../types/cashier'
import type { DepositDestination, DepositOption } from '../types/deposit'
import type { WithdrawOption } from '../types/withdraw'

/** Query keys are stable strings so consumers can invalidate by prefix. */
export const depositKeys = {
  options: ['zappi', 'deposit', 'options'] as const,
  destination: (combo: CashierCombo) =>
    ['zappi', 'deposit', 'destination', combo.asset, combo.network] as const,
}

/** Fetch the deposit catalog. */
export function useDepositOptions() {
  const client = useZappiClient()
  return useQuery({
    queryKey: depositKeys.options,
    queryFn: ({ signal }) => client.getDepositOptions(signal),
    staleTime: 5 * 60 * 1000,
  })
}

/** Fetch a persistent deposit destination for a (asset, network) combo. */
export function useDepositDestination(combo: CashierCombo | null) {
  const client = useZappiClient()
  return useQuery({
    queryKey: combo
      ? depositKeys.destination(combo)
      : (['zappi', 'deposit', 'destination', 'none'] as const),
    queryFn: ({ signal }) => client.getDepositDestination(combo!, signal),
    enabled: !!combo,
    staleTime: Infinity, // persistent destinations are durable
  })
}

export type { DepositDestination, DepositOption, WithdrawOption }
