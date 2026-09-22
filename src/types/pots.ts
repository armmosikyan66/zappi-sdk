/**
 * Raw zappi-nest pot/attach/spend-ticket response shapes. Source:
 * `server/src/wallet/pots/pots.dto.ts` and the pots/attach/spend controllers.
 *
 * Pots are prepaid Spark USDB wallets identified by a public Spark address.
 * Nest stores the public address only — never a mnemonic. Spend authority
 * lives on the host that holds the BIP-39 (agent) or in the browser vault
 * (user). `spendMode` is 1:1 with `origin`: free↔agent, auth_required↔user.
 */

/* --------------------------------- pots ----------------------------------- */

export type AgentPotOrigin = 'user' | 'agent' | 'unknown'
export type AgentPotSpendMode = 'auth_required' | 'free' | 'unknown'
export type AgentPotStatus = 'active' | 'revoked'
export type AgentPotGrantStatus = 'none' | 'active' | 'revoked'

export interface AgentPotGrant {
  id: string
  potId: string
  agentRef: string | null
  scopes: string[]
  createdAt: string
  revokedAt: string | null
  expiresAt?: string | null
}

export interface AgentPot {
  id: string
  sparkAddress: string
  label: string | null
  agentRef: string | null
  status: AgentPotStatus
  origin: AgentPotOrigin
  spendMode: AgentPotSpendMode
  connected: boolean
  grantStatus: AgentPotGrantStatus
  createdAt: string
  grants: AgentPotGrant[]
}

export interface NestListPotsResponse {
  pots: AgentPot[]
}

export interface NestListPotsQuery {
  origin?: AgentPotOrigin
  spendMode?: AgentPotSpendMode
}

/** `POST /api/wallet/pots` body. Send `spendMode` or `origin` (1:1). */
export interface NestCreatePotBody {
  sparkAddress: string
  label?: string
  spendMode?: 'auth_required' | 'free'
  origin?: 'user' | 'agent'
  agentRef?: string
}

/** `PATCH /api/wallet/pots/:id` body (claim legacy pot as user-held). */
export interface NestClaimPotBody {
  origin?: 'user'
}

export interface NestPotDepositAddressResponse {
  potId: string
  depositAddress: string
  recipientSparkAddress?: string
  sourceChain?: string
  sourceAsset?: string
  destinationAsset?: string
  sourceToken?: unknown | null
}

export interface NestPotBalanceResponse {
  potId: string
  balanceUsdCents: number
  pendingUsdCents: number
  cachedAt?: number
  stale?: boolean
  syncing?: boolean
}

export interface NestListPotGrantsResponse {
  grants: AgentPotGrant[]
}

export interface NestCreatePotGrantBody {
  agentRef?: string
  scopes?: string[]
  expiresAt?: string
}

/* ----------------------------- spend approvals ---------------------------- */

export type PotSpendAction = 'withdraw' | 'internal_send' | 'sweep'
export type PotSpendApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'consumed'
  | 'expired'

export interface AgentPotSpendApproval {
  id: string
  potId: string
  action: PotSpendAction
  amountCents: number | null
  destination: string | null
  status: PotSpendApprovalStatus
  expiresAt: string
  approvedAt: string | null
  consumedAt: string | null
  createdAt: string
}

export interface NestListPotSpendApprovalsResponse {
  approvals: AgentPotSpendApproval[]
}

export interface NestCreatePotSpendApprovalBody {
  action: PotSpendAction
  amountCents?: number
  destination?: string
}

export interface NestPotSpendGateResponse {
  potId: string
  spendMode: 'auth_required' | 'free'
  gated: boolean
  leash: 'human_approval' | 'empty_balance'
  approvalId?: string | null
}

/* --------------------------- agent grant routes --------------------------- */

/** `POST /api/wallet/pots/:id/agent/deposit-address` body. */
export interface NestAgentPotDepositAddressBody {
  grantId: string
  sourceChain?: string
  sourceAsset?: string
  destinationAsset?: string
}

/* ------------------------------ attach flow ------------------------------- */

export interface NestPotAttachPendingResponse {
  requestId: string
  userCode: string
  approveUrl: string
  expiresAt: string
  spendMode?: 'auth_required' | 'free' | null
}

/** `POST /api/wallet/pots/attach` body. */
export interface NestCreatePotAttachBody {
  sparkAddress?: string
  spendMode?: 'auth_required' | 'free'
  origin?: 'user' | 'agent'
  agentRef?: string
  label?: string
}

export interface NestPotAttachPollResponse {
  status: 'pending' | 'approved' | 'denied' | 'expired'
  requestId: string
  userCode?: string
  spendMode?: string | null
  expiresAt?: string
  potId?: string | null
  origin?: string | null
  grantId?: string | null
  potClientToken?: string | null
}

export interface NestPotAttachApprovedResponse {
  pot: AgentPot
  grant: AgentPotGrant
  spendMode: 'auth_required' | 'free'
  origin: 'user' | 'agent'
  potClientToken: string
}

/** `POST /api/wallet/pots/attach/:requestId/approve` body. */
export interface NestApprovePotAttachBody {
  spendMode?: 'auth_required' | 'free'
  origin?: 'user' | 'agent'
  sparkAddress?: string
  label?: string
}

/* --------------------------- spend tickets ------------------------------- */

export type PotSpendRequestStatus = 'pending' | 'approved' | 'denied' | 'expired'

export interface AgentPotSpendRequest {
  id: string
  potId: string
  amountCents: number
  destinationAddress: string
  destinationChain: string | null
  memo: string | null
  status: PotSpendRequestStatus
  expiresAt: string
  decidedAt: string | null
  createdAt: string
}

export interface NestListPotSpendRequestsResponse {
  requests: AgentPotSpendRequest[]
}

/** `POST /api/wallet/self-custody/pots/:potId/spend-requests` body. */
export interface NestCreatePotSpendRequestBody {
  amountCents: number
  destinationAddress: string
  destinationChain?: string
  memo?: string
}
