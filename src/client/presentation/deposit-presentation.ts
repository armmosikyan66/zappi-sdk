import type { DepositCombo, NetworkId } from '../../types/cashier'
import type { WalletDeepLink } from '../../types/deposit'
import {
  isBtcNetwork,
  isStableNetwork,
} from '../../combo'

/** Live Orchestra source-token fields used to encode EIP-681 ERC-20 transfers. */
export type EvmTokenMeta = {
  tokenContract?: string | null
  chainId?: number | null
  tokenDecimals?: number | null
}

/** Is this an EVM stable network (not solana/tron)? */
export function isEvmStableNetwork(
  value: string,
): value is Exclude<NetworkId, 'solana' | 'tron' | 'mainnet' | 'lightning'> {
  return isStableNetwork(value) && value !== 'solana' && value !== 'tron'
}

/** Lightspark hosted Spark web wallet used on REGTEST instead of Cash App / Strike. */
export const SPARK_TEST_WALLET_URL = 'https://docs.spark.money/tools/test-wallet'

export function isSparkIdentityAddress(address: string): boolean {
  const value = address.trim().toLowerCase()
  return (
    value.startsWith('spark1') ||
    value.startsWith('sparkrt1') ||
    value.startsWith('sp1') ||
    value.startsWith('sprt1')
  )
}

function isRegtestSparkNetwork(
  network?: 'MAINNET' | 'REGTEST' | null,
): boolean {
  return network === 'REGTEST'
}

/**
 * EIP-681 ERC-20 transfer URI. Wallets that scan this send the token, not
 * native ETH. Amount is omitted — standing deposit addresses accept any size.
 * https://eips.ethereum.org/EIPS/eip-681
 */
export function evmErc20TransferUri(
  tokenContract: string,
  chainId: number,
  recipient: string,
): string {
  return `ethereum:${tokenContract.trim()}@${chainId}/transfer?address=${recipient.trim()}`
}

/** URI scheme for the "Open in wallet" affordance, or null when none applies. */
export function depositUriScheme(combo: DepositCombo): string | null {
  if (combo.asset === 'btc' && combo.network === 'mainnet') return 'bitcoin:'
  if (combo.asset === 'btc' && combo.network === 'lightning') return 'lightning:'
  if (combo.network === 'solana') return 'solana:'
  if (combo.network === 'tron') return 'tron:'
  return 'ethereum:'
}

/** Build the QR payload string for a deposit destination. */
export function depositQrPayload(
  combo: DepositCombo,
  address: string,
  _lnurl?: string,
  token?: EvmTokenMeta,
  _sparkNetwork?: 'MAINNET' | 'REGTEST' | null,
): string {
  if (isSparkIdentityAddress(address)) return address
  if (combo.asset === 'btc' && combo.network === 'mainnet') {
    return `bitcoin:${address}`
  }
  if (combo.asset === 'btc' && combo.network === 'lightning') {
    // Lightning Address URI (LUD-16). Breez/Phoenix resolve the LNURL endpoint.
    return `lightning:${address}`
  }
  if (combo.asset === 'eth') {
    if (token?.chainId != null) {
      return `ethereum:${address.trim()}@${token.chainId}`
    }
    return address
  }
  if (isEvmStableNetwork(combo.network) && token?.tokenContract && token.chainId != null) {
    return evmErc20TransferUri(token.tokenContract, token.chainId, address)
  }
  if (combo.network === 'tron') return `tron:${address.trim()}`
  return address
}

/** Build per-wallet deep-link buttons for a deposit destination. */
export function depositWalletDeepLinks(
  combo: DepositCombo,
  qrPayload: string,
  _lnurl?: string,
  sparkNetwork?: 'MAINNET' | 'REGTEST' | null,
): WalletDeepLink[] {
  const { asset, network } = combo
  if (
    isRegtestSparkNetwork(sparkNetwork) &&
    !((asset === 'usdc' || asset === 'usdt') && network === 'solana')
  ) {
    return [
      {
        id: 'spark-test-wallet',
        label: 'Spark test wallet',
        uri: SPARK_TEST_WALLET_URL,
      },
    ]
  }
  if (asset === 'btc' && network === 'mainnet') {
    return [
      { id: 'cashapp', label: 'Cash App', uri: qrPayload },
      { id: 'strike', label: 'Strike', uri: qrPayload },
    ]
  }
  if (asset === 'btc' && network === 'lightning') {
    return [
      { id: 'cashapp', label: 'Cash App', uri: qrPayload },
      { id: 'strike', label: 'Strike', uri: qrPayload },
      { id: 'phoenix', label: 'Phoenix', uri: qrPayload },
      { id: 'wos', label: 'Wallet of Satoshi', uri: qrPayload },
    ]
  }
  if ((asset === 'usdc' || asset === 'usdt') && network === 'solana') {
    return [
      { id: 'phantom', label: 'Phantom', uri: qrPayload },
      { id: 'solflare', label: 'Solflare', uri: qrPayload },
    ]
  }
  if (asset === 'usdt' && network === 'tron') {
    return [{ id: 'tronlink', label: 'TronLink', uri: qrPayload }]
  }
  if (asset === 'eth' || isEvmStableNetwork(network)) {
    return [
      { id: 'metamask', label: 'MetaMask', uri: qrPayload },
      { id: 'rainbow', label: 'Rainbow', uri: qrPayload },
      { id: 'coinbase', label: 'Coinbase Wallet', uri: qrPayload },
    ]
  }
  return []
}

/** Build a full deposit destination from raw inputs (no nest round-trip). */
export function toDepositDestination(
  combo: DepositCombo,
  address: string,
  copy: { feesCopy: string; estimatedArrivalCopy: string },
  lnurl?: string,
  token?: EvmTokenMeta,
  sparkNetwork?: 'MAINNET' | 'REGTEST' | null,
): import('../../types/deposit').DepositDestination {
  const qrPayload = depositQrPayload(combo, address, lnurl, token, sparkNetwork)
  return {
    asset: combo.asset,
    network: combo.network,
    address,
    qrPayload,
    uriScheme: depositUriScheme(combo),
    feesCopy: copy.feesCopy,
    estimatedArrivalCopy: copy.estimatedArrivalCopy,
    walletDeepLinks: depositWalletDeepLinks(combo, qrPayload, lnurl, sparkNetwork),
    ...(token?.tokenContract ? { tokenContract: token.tokenContract } : {}),
    ...(token?.chainId != null ? { chainId: token.chainId } : {}),
    ...(token?.tokenDecimals != null ? { tokenDecimals: token.tokenDecimals } : {}),
  }
}

/** Destination chain name for a network, as the wallet rail reports it. */
export function walletDestinationChain(network: 'MAINNET' | 'REGTEST' | null): string {
  return network === 'REGTEST' ? 'spark-regtest' : 'spark'
}

/** @deprecated Renamed to {@link walletDestinationChain}. */
export const sparkDestinationChain = walletDestinationChain

/** Flashnet source asset code for an asset id. */
export function flashnetSourceAsset(asset: 'usdc' | 'usdt' | 'btc' | 'eth'): 'USDC' | 'USDT' | 'BTC' | 'ETH' {
  if (asset === 'usdt') return 'USDT'
  if (asset === 'btc') return 'BTC'
  if (asset === 'eth') return 'ETH'
  return 'USDC'
}

/** Type guard for the BTC network ids. Re-exported for presentation callers. */
export { isBtcNetwork }
