---
type: client
tags: [sdk, pots]
updated: 2026-09-22
---

# Pots

User-session pot, grant, attach, and spend-ticket routes. README treats these as server-side (`projectKey` or `session`). A browser may call them only through a `bff` client pointed at your app, which then talks to nest. Types: `AgentPot`, `AgentPotGrant`, `AgentPotSpendApproval`, `AgentPotSpendRequest`, `NestPotAttachPendingResponse`.

## Register and read

`listPots({ origin?, spendMode? })` filters `user | agent | unknown` and `free | auth_required | unknown`.

`createPot({ sparkAddress, label?, spendMode? })` registers by the **public** Spark address.

`claimPotOrigin(id, body?)` patches a legacy pot to claim it as user-held.

`getPotBalance(id)` reads Spark USDB through nest’s readonly client. Response is `NestPotBalanceResponse` (`balanceUsdCents`, `pendingUsdCents`).

`createPotDepositAddress(id, body?)` mints an Orchestra deposit address that credits the pot. Optional body fields (the CLI sends `sourceChain`) pass through.

## Grants and money-out

`listPotGrants` / `createPotGrant(id, { scopes })` / `revokePotGrant(id, grantId)`. Revoke is DELETE and treats 204 as success.

`getPotSpendGate(id, action?)` — action is `withdraw | internal_send | sweep`. Response includes `gated`, `leash`, and `spendMode`.

`listPotSpendApprovals` / `createPotSpendApproval(id, { action, amountCents?, destination? })`.

`approvePotSpend(id, approvalId, authorizationToken?)` sends the passkey header. `rejectPotSpend` does not. `consumePotSpend` marks an approved money-out as consumed.

Revoking a grant does not delete a key the agent already holds. Empty pot is the spend cap.

## Agent grant credential

These routes do not use the user JWT as the grant. The grant id is the credential:

- `getPotBalanceByGrant(id, grantId)` → `…/agent/balance?grantId=`
- `createPotDepositAddressByGrant(id, { grantId, … })` → `…/agent/deposit-address`

## Attach

Device-code pairing:

1. `createPotAttach({ sparkAddress?, spendMode?, label? })` → `requestId`, `deviceCode`, `approveUrl`. The verification code is not in this response.
2. `pollPotAttach(requestId)` until the status leaves `pending`. Poll may include `potId` and `grantId`. It does not include the verification code or `potClientToken`.
3. `approvePotAttach(requestId, { spendMode })` is the signed-in user binding the pot.

The SDK returns `potClientToken` when nest sends it. Callers must store it as a host secret.

## Spend tickets (auth-required)

Under `wallet/self-custody/pots/:potId/spend-requests`:

- `createPotSpendRequest(potId, { amountCents, destinationAddress, … }, authorizationToken?)`
- `listPotSpendRequests(potId)`
- `getPotSpendRequest(potId, requestId, authorizationToken?)`
- `approvePotSpendRequest` / `denyPotSpendRequest`

Status is `pending | approved | denied | expired`. These are the human approve/deny tickets, separate from `spend-approvals`.
