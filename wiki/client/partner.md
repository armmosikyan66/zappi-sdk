---
type: client
tags: [sdk, partner]
updated: 2026-09-22
---

# Partner routes

Project-key calls for an Integration product wallet. The mnemonic stays with the partner ([[reference/sign]]).

## Withdraw

`partnerWithdraw(body, authorizationToken?)` posts `NestPartnerWithdrawBody` to `partner/wallet/withdraw` and returns the **raw** nest execute response (`needsSignature`, `depositAddress`, `tokenIdentifier`, `sendAmount`, ids, status). Use [[flows/two-phase]] `runTwoPhasePartnerWithdraw` to sign and resubmit.

`partnerGetWithdrawalStatus(withdrawId, userId)` polls `wallet/withdraw/status?withdrawId=&userId=`. Nest requires `userId` so a project key cannot list every user’s withdrawals.

`partnerDecodeLightningInvoice(bolt11)` posts to the partner decode route. The client always returns `{ valid: true }` plus `amountSats` when nest sent a number.

## Internal send

`partnerSendInternal(body)` posts `NestSendInternalBody` to `partner/wallet/send/internal`. This is the partner-initiated transfer, not the user-session `sendInternal` on [[client/ledger-send]].

## Lightning address

`createPartnerLightningAddress(userId)` is also used inside [[client/deposit]] `createPartnerDepositDestination` for BTC Lightning. It returns the partner LNURL-pay address for that opaque user id.
