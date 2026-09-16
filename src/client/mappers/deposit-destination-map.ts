import type { CashierCombo, DepositCombo } from '../../types/cashier'
import type { DepositDestination, WalletDeepLink } from '../../types/deposit'
import {
  depositQrPayload,
  depositUriScheme,
  depositWalletDeepLinks,
  type EvmTokenMeta,
} from '../presentation/deposit-presentation'
import type {
  NestAccumulationAddressResponse,
  NestOrchestraSourceToken,
} from '../../types/partner'

type NestDestinationPayload = Partial<NestAccumulationAddressResponse> & {
  address?: string
  depositAddress?: string
  feesCopy?: string
  estimatedArrivalCopy?: string
  lnurl?: string
  sourceToken?: NestOrchestraSourceToken | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readNestedSourceToken(value: unknown): NestOrchestraSourceToken | null {
  if (!isRecord(value)) return null
  const chainId = value.chainId
  const contractAddress = value.contractAddress
  const decimals = value.decimals
  return {
    chainId: typeof chainId === 'number' ? chainId : null,
    contractAddress: typeof contractAddress === 'string' ? contractAddress : null,
    decimals: typeof decimals === 'number' ? decimals : null,
  }
}

/** Pull EIP-681 token meta from nested nest `sourceToken` or flattened aliases. */
export function nestSourceTokenMeta(res: unknown): EvmTokenMeta {
  const data = (isRecord(res) ? res : {}) as NestDestinationPayload
  const nested = readNestedSourceToken(data.sourceToken)
  return {
    tokenContract: data.tokenContract ?? nested?.contractAddress ?? null,
    chainId: data.chainId ?? nested?.chainId ?? null,
    tokenDecimals: data.tokenDecimals ?? nested?.decimals ?? null,
  }
}

/** Map a raw nest accumulation-address response to a deposit destination. */
export function mapNestDepositDestination(
  combo: CashierCombo,
  res: unknown,
): DepositDestination {
  const data = (res ?? {}) as NestDestinationPayload

  const address = String(data.depositAddress ?? data.address ?? '').trim()
  if (!address) {
    throw new Error('mapNestDepositDestination: nest response missing depositAddress')
  }

  const token = nestSourceTokenMeta(data)

  const qrPayload = depositQrPayload(combo as DepositCombo, address, data.lnurl, token)
  const copy = {
    feesCopy: data.feesCopy ?? '',
    estimatedArrivalCopy: data.estimatedArrivalCopy ?? '',
  }

  return {
    asset: combo.asset,
    network: combo.network,
    address,
    qrPayload,
    uriScheme: depositUriScheme(combo as DepositCombo),
    feesCopy: copy.feesCopy,
    estimatedArrivalCopy: copy.estimatedArrivalCopy,
    walletDeepLinks: depositWalletDeepLinks(combo as DepositCombo, qrPayload, data.lnurl),
    ...(token.tokenContract ? { tokenContract: token.tokenContract } : {}),
    ...(token.chainId != null ? { chainId: token.chainId } : {}),
    ...(token.tokenDecimals != null ? { tokenDecimals: token.tokenDecimals } : {}),
  }
}

export type { WalletDeepLink }
