/**
 * Live operator proof. Prints nothing from the phrases.
 *
 * Set all four variables to call operators. Otherwise this exits without
 * opening a wallet:
 *   ZAPPI_ALLOWANCE_PROOF_OWNER
 *   ZAPPI_ALLOWANCE_PROOF_SPENDER
 *   ZAPPI_ALLOWANCE_PROOF_RECEIVER  (33-byte compressed hex)
 *   ZAPPI_ALLOWANCE_PROOF_TOKEN     (32-byte token id hex)
 *
 * Exit 1 when operators reject createTokenAllowance.
 */
import {
  AllowanceProofError,
  runLiveSparkAllowanceProof,
} from '../src/sign/prove-token-allowance'

async function main(): Promise<void> {
  const result = await runLiveSparkAllowanceProof()
  if (!result.ran) {
    console.log(
      'Spark allowance proof did not run. Set ZAPPI_ALLOWANCE_PROOF_OWNER, ZAPPI_ALLOWANCE_PROOF_SPENDER, ZAPPI_ALLOWANCE_PROOF_RECEIVER, and ZAPPI_ALLOWANCE_PROOF_TOKEN to call operators.',
    )
    return
  }
  const report = result.report
  console.log(
    JSON.stringify({
      network: report.network,
      allowanceId: report.allowanceId,
      txId: report.txId,
      capRefusal: report.capRefusal,
      expiryRefusal: report.expiryRefusal,
      secondAllowanceId: report.secondAllowanceId,
      steps: report.steps,
    }),
  )
}

main().catch((error: unknown) => {
  if (
    error instanceof AllowanceProofError &&
    error.code === 'OPERATOR_RPC_UNSUPPORTED'
  ) {
    console.error(error.message)
    process.exitCode = 1
    return
  }
  const message =
    error instanceof Error ? error.message : 'Spark allowance proof failed.'
  console.error(message)
  process.exitCode = 1
})
