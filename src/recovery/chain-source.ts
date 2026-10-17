import { RecoveryError } from './errors'

/**
 * Read and submit chain data. A failed lookup is `unverified`, never success
 * and never "absent". Browsers implement this against Esplora. Core RPC is
 * not reachable from a page.
 */

export type ChainTxStatus = 'confirmed' | 'mempool' | 'missing' | 'not-in-block' | 'unverified'

export interface Outspend {
  spent: boolean
  spendingTxid?: string
}

export interface ChainSource {
  getOutspend(txid: string, vout: number): Promise<Outspend | 'unverified'>
  submitPackage(txs: readonly string[]): Promise<{ accepted: boolean; txids: string[] } | 'unverified'>
  getTxStatus(txid: string): Promise<ChainTxStatus>
}

const MEMPOOL_SPACE = /(^|\.)mempool\.space$/i

/** Refuse the hardcoded public explorer. Callers pass their own Esplora base. */
export function assertEsploraBaseUrl(baseUrl: string): URL {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new RecoveryError('ESPLORA_BLOCKED', 'Esplora base URL is not a valid URL.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new RecoveryError('ESPLORA_BLOCKED', 'Esplora base URL must be http or https.')
  }
  if (MEMPOOL_SPACE.test(url.hostname)) {
    throw new RecoveryError('ESPLORA_BLOCKED', 'Recovery must not use mempool.space.')
  }
  return url
}
