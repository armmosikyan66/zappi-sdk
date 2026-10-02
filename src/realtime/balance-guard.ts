/**
 * Drop stream cache snapshots while a coordinator `getBalance()` is in
 * flight, and for a short tail after it lands. The first stream snapshot
 * can be the pre-deposit figure and would otherwise overwrite the fresh read.
 */
export interface BalanceApplyGuard {
  block(ms: number): void
  blocked(now?: number): boolean
  reset(): void
}

export function createBalanceApplyGuard(): BalanceApplyGuard {
  let blockedUntil = 0
  return {
    block(ms: number) {
      blockedUntil = Math.max(blockedUntil, Date.now() + ms)
    },
    blocked(now = Date.now()) {
      return now < blockedUntil
    },
    reset() {
      blockedUntil = 0
    },
  }
}
