---
type: reference
tags: [sdk, api]
updated: 2026-09-22
---

# Usages

Public surface at 0.3.1. Routes are under `{apiUrl}/api/…`. Default timeout is 15s. Non-2xx throws [[reference/errors]] `ZappiApiError`.

## Construct

```ts
import { ZappiClient } from '@zappimoney/zappi-sdk'

new ZappiClient({
  apiUrl: 'https://api.zappi.money',
  auth: { kind: 'projectKey', projectApiKey },
  timeoutMs: 15_000, // optional
  fetch,             // optional override
})
```

Browser: `apiUrl: ''`, `auth: { kind: 'bff' }`. Auth rules: [[reference/auth]].

`client.request<T>(path, { method, body, authorizationToken, signal, auth })` calls any `/api/<path>` with the same headers and errors. `path` has no `/api/` prefix.

## Deposit — [[client/deposit]]

| Method | Route |
| --- | --- |
| `getDepositOptions(signal?)` | `GET wallet/deposit-options` |
| `getDepositDestination(combo, signal?)` | `GET wallet/deposit/destination?asset&network` (BFF shape) |
| `createStandingDepositAddress(body, signal?)` | `POST wallet/standing-deposit-address` |
| `listStandingDeposits(userId, { limit, offset }, signal?)` | `GET wallet/standing-deposit-address/deposits` |
| `patchStandingDepositAddress(body, signal?)` | `PATCH wallet/standing-deposit-address` |
| `resolveStandingDeposits(body, signal?)` | `POST wallet/standing-deposit-address/resolve` |
| `createPartnerDepositDestination(combo, { userId, recipientSparkAddress?, nativeReference? }, signal?)` | catalog + standing or Lightning |
| `createPartnerLightningAddress(userId, signal?)` | `POST partner/wallet/lightning-address` |
| `generateLightningInvoice(amountSats, signal?)` | `POST wallet/lightning-invoices` |
| `getWalletBalance(signal?)` | `GET wallet/balance` |
| `createAccumulationAddress` | deprecated → standing |
| `createLiquidationAddress` | deprecated → standing |
| `getBalance` | deprecated alias of `getWalletBalance` |

## Withdraw — [[client/withdraw]]

| Method | Route |
| --- | --- |
| `getWithdrawOptions(signal?)` | `GET wallet/withdrawal-options` |
| `validateWithdrawAddress(combo, address, signal?)` | `GET wallet/withdraw/validate-address` |
| `decodeLightningInvoice(bolt11, signal?)` | `POST wallet/withdraw/decode-lightning-invoice` |
| `estimateWithdrawal(req, signal?)` | `POST wallet/withdraw/estimate` |
| `getWithdrawalQuote(req, signal?)` | `POST wallet/withdraw/quote` |
| `getWithdrawalQuoteById(quoteId, signal?)` | `GET wallet/withdraw/quote?quoteId=` |
| `confirmWithdrawal(quoteId, sparkTxHash?, authorizationToken?, signal?)` | `POST wallet/withdraw/confirm` |
| `getWithdrawalStatus(id, signal?)` | `GET wallet/withdraw/status?id=` |

## Partner — [[client/partner]]

| Method | Route |
| --- | --- |
| `partnerWithdraw(body, authorizationToken?, signal?)` | `POST partner/wallet/withdraw` |
| `partnerGetWithdrawalStatus(withdrawId, userId, signal?)` | `GET wallet/withdraw/status?withdrawId&userId` |
| `partnerDecodeLightningInvoice(bolt11, signal?)` | `POST partner/wallet/withdraw/decode-lightning-invoice` |
| `partnerSendInternal(body, signal?)` | `POST partner/wallet/send/internal` |

## Pots — [[client/pots]]

| Method | Route |
| --- | --- |
| `listPots({ origin?, spendMode? }, signal?)` | `GET wallet/pots` |
| `createPot(body, signal?)` | `POST wallet/pots` |
| `claimPotOrigin(id, body?, signal?)` | `PATCH wallet/pots/:id` |
| `createPotDepositAddress(id, body?, signal?)` | `POST wallet/pots/:id/deposit-address` |
| `getPotBalance(id, signal?)` | `GET wallet/pots/:id/balance` |
| `listPotGrants(id)` / `createPotGrant(id, body)` / `revokePotGrant(id, grantId)` | `…/grants` GET, POST, DELETE |
| `listPotSpendApprovals` / `createPotSpendApproval` | `…/spend-approvals` |
| `getPotSpendGate(id, action?)` | `GET …/spend-gate?action=` |
| `approvePotSpend(id, approvalId, authorizationToken?)` | `POST …/approve` |
| `rejectPotSpend(id, approvalId)` | `POST …/reject` |
| `consumePotSpend(id, approvalId)` | `POST …/consume` |
| `getPotBalanceByGrant(id, grantId)` | `GET …/agent/balance?grantId=` |
| `createPotDepositAddressByGrant(id, body)` | `POST …/agent/deposit-address` |
| `createPotAttach(body)` | `POST wallet/pots/attach` |
| `pollPotAttach(requestId)` | `GET wallet/pots/attach/:requestId` |
| `approvePotAttach(requestId, body)` | `POST …/approve` |
| `createPotSpendRequest` / `listPotSpendRequests` / `getPotSpendRequest` | `wallet/self-custody/pots/:potId/spend-requests` |
| `approvePotSpendRequest` / `denyPotSpendRequest` | `…/approve` and `…/deny` |

## Ledger and send — [[client/ledger-send]]

| Method | Route |
| --- | --- |
| `listTransactions(signal?)` | `GET wallet/transactions` |
| `getTransaction(id, signal?)` | `GET wallet/transactions/:id` |
| `sendInternal(input, signal?)` | `POST wallet/send/internal` |
| `resolveSendTarget(recipientUserId, signal?)` | `GET wallet/send/resolve?recipientUserId=` |
| `sendExternal(body, authorizationToken?, signal?)` | `POST wallet/send/external` |
| `getSendOptions(signal?)` | `GET wallet/send/options` |
| `validateSendAddress({ asset, network, address }, signal?)` | `GET wallet/send/validate-address` |
| `estimateSend({ asset, networkId, amountCents, address? }, signal?)` | `GET wallet/send/estimate` |
| `getSendStatus(withdrawId, signal?)` | `GET wallet/send/status?withdrawId=` |
| `subscribeCashierEvents(onEvent, onError?, signal?)` | `GET wallet/events` (SSE). Returns unsubscribe. |

## Other exports

Amounts, combos, address families: [[reference/amounts]]. Errors: [[reference/errors]]. Webhooks and quote tokens: [[reference/webhooks]]. Signer: [[reference/sign]]. Hooks: [[reference/react]]. Two-phase: [[flows/two-phase]].
