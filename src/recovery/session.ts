import type { ChainTxStatus } from './chain-source'
import { RecoveryError } from './errors'
import type { ExitPackage, ExitPackageKind } from './broadcast'

/**
 * Write-ahead exit session. `submitPackage` is only legal after the step has
 * been marked for write-ahead. Package N+1 waits until child N is confirmed
 * (one unconfirmed descendant). An unverified read never counts as confirmed
 * or as missing. A reorg demotes a confirmed step only on a positive
 * `not-in-block` read.
 */

export type ExitStepStatus =
  | 'pending'
  | 'submitted'
  | 'ancestor-confirmed'
  | 'refund-broadcast'
  | 'waiting-timelock'
  | 'swept'
  | 'failed'
  | 'unverified'
  | 'superseded'

export interface ExitSessionStep {
  packageId: string
  leafId: string
  kind: ExitPackageKind
  parentTxid: string
  childTxid: string
  status: ExitStepStatus
  writeAhead: boolean
  dependsOnChildTxid: string | null
}

export interface ExitSession {
  version: 1
  feeUtxosConfirmed: boolean
  steps: ExitSessionStep[]
}

const DIRECT_KINDS = new Set<ExitPackageKind>(['direct', 'direct-refund', 'direct-from-cpfp-refund'])

export function createExitSession(
  packages: readonly ExitPackage[],
  feeUtxosConfirmed: boolean,
): ExitSession {
  return {
    version: 1,
    feeUtxosConfirmed,
    steps: packages.map((item) => ({
      packageId: item.id,
      leafId: item.leafId,
      kind: item.kind,
      parentTxid: item.parentTxid,
      childTxid: item.childTxid,
      status: 'pending',
      writeAhead: false,
      dependsOnChildTxid: item.dependsOnChildTxid,
    })),
  }
}

export function assertFeeUtxosConfirmed(session: ExitSession): void {
  if (!session.feeUtxosConfirmed) {
    throw new RecoveryError(
      'FEE_UTXO_UNCONFIRMED',
      'Fee UTXOs must be confirmed before a package is submitted. An unknown confirmation is not OK.',
    )
  }
}

/** Persist this before `submitPackage`. Submitting without it throws. */
export function markWriteAhead(session: ExitSession, packageId: string): ExitSession {
  assertFeeUtxosConfirmed(session)
  return mapStep(session, packageId, (step) => {
    if (step.status !== 'pending' && step.status !== 'unverified') {
      throw new RecoveryError('EXIT_SESSION_INVALID', 'Only a pending step can be written ahead.')
    }
    return { ...step, writeAhead: true }
  })
}

export function markSubmitted(session: ExitSession, packageId: string): ExitSession {
  return mapStep(session, packageId, (step) => {
    if (!step.writeAhead) {
      throw new RecoveryError(
        'EXIT_SESSION_INVALID',
        'Write the session ahead before submitting a package.',
      )
    }
    return { ...step, status: 'submitted' }
  })
}

export function applyChainRead(
  session: ExitSession,
  packageId: string,
  status: ChainTxStatus,
): ExitSession {
  if (status === 'unverified') {
    return mapStep(session, packageId, (step) => {
      if (step.status !== 'pending') return step
      return { ...step, status: 'unverified' }
    })
  }
  if (status === 'not-in-block') {
    return mapStep(session, packageId, (step) => ({
      ...step,
      status: 'pending',
      writeAhead: false,
    }))
  }
  if (status === 'missing' || status === 'mempool') return session
  return mapStep(session, packageId, (step) => {
    const next = confirmStatus(step)
    const superseded = session.steps.map((item) => {
      if (item.packageId === step.packageId) return { ...item, status: next }
      if (
        DIRECT_KINDS.has(step.kind) &&
        item.leafId === step.leafId &&
        !DIRECT_KINDS.has(item.kind) &&
        item.status !== 'swept'
      ) {
        return { ...item, status: 'superseded' as const }
      }
      return item
    })
    return { ...session, steps: superseded }
  })
}

export function markWaitingTimelock(session: ExitSession, packageId: string): ExitSession {
  return mapStep(session, packageId, (step) => ({ ...step, status: 'waiting-timelock' }))
}

export function markSwept(session: ExitSession, packageId: string): ExitSession {
  return mapStep(session, packageId, (step) => ({ ...step, status: 'swept' }))
}

export function markFailed(session: ExitSession, packageId: string): ExitSession {
  return mapStep(session, packageId, (step) => ({ ...step, status: 'failed' }))
}

/**
 * Next package that may be submitted. Null when the chain is waiting on a
 * child confirmation, a timelock, or there is nothing left.
 */
export function nextBroadcastable(session: ExitSession): ExitSessionStep | null {
  const confirmedChildren = new Set(
    session.steps
      .filter((step) => step.status === 'ancestor-confirmed' || step.status === 'refund-broadcast' || step.status === 'swept')
      .map((step) => step.childTxid),
  )
  for (const step of session.steps) {
    if (step.status === 'superseded' || step.status === 'failed' || step.status === 'swept') continue
    if (step.status === 'waiting-timelock') continue
    if (step.status !== 'pending' && step.status !== 'unverified') continue
    if (step.dependsOnChildTxid && !confirmedChildren.has(step.dependsOnChildTxid)) continue
    return step
  }
  return null
}

function confirmStatus(step: ExitSessionStep): ExitStepStatus {
  if (step.kind === 'node' || step.kind === 'direct') return 'ancestor-confirmed'
  if (step.kind === 'refund' || step.kind === 'direct-refund' || step.kind === 'direct-from-cpfp-refund') {
    return 'refund-broadcast'
  }
  return 'ancestor-confirmed'
}

function mapStep(
  session: ExitSession,
  packageId: string,
  update: (step: ExitSessionStep) => ExitSessionStep | ExitSession,
): ExitSession {
  const index = session.steps.findIndex((step) => step.packageId === packageId)
  if (index < 0) {
    throw new RecoveryError('EXIT_SESSION_INVALID', 'That package is not in the exit session.')
  }
  const step = session.steps[index]
  if (!step) {
    throw new RecoveryError('EXIT_SESSION_INVALID', 'That package is not in the exit session.')
  }
  const updated = update(step)
  if ('steps' in updated) return updated
  const steps = session.steps.slice()
  steps[index] = updated
  return { ...session, steps }
}
