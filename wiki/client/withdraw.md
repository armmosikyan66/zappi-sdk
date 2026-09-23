---
type: client
tags: [sdk, withdraw]
updated: 2026-09-22
---

# Withdraw

User or BFF withdraw against `/api/wallet/withdraw/*`. Partner product-wallet payout is [[client/partner]]. Orchestration is [[flows/two-phase]].

`getWithdrawOptions` maps `wallet/withdrawal-options` to `WithdrawOption[]`.

`validateWithdrawAddress(combo, address)` queries asset, network, and address. The SDK’s local [[reference/amounts]] `validateDestination` is a shape heuristic; this method asks nest, which re-checks.

`decodeLightningInvoice(bolt11)` posts the invoice and returns a `DecodedLightningInvoice`.

`estimateWithdrawal(req)` posts a `WithdrawalRequest`. If the body has nest’s `amountUsdb` field, `mapNestEstimate` converts it. Otherwise the response is already a `WithdrawalEstimate`. Estimate has no TTL. BTC pricing in the mapper takes an explicit rate when the caller uses `nestAmountCents` / `mapNestEstimate` directly; there is no mock rate.

`getWithdrawalQuote(req)` locks a quote (`quoteId` plus expiry). `getWithdrawalQuoteById(quoteId)` reloads it. BFF quote TTL is about 2 minutes via [[reference/webhooks]] HMAC tokens (`WITHDRAW_QUOTE_TTL_MS`).

`confirmWithdrawal(quoteId, sparkTxHash?, authorizationToken?)` posts `{ quoteId, sparkTxHash? }`. The first call may return `needsSignature: true` with `depositAddress`, `tokenIdentifier`, and `sendAmount`. The caller signs and retries with `sparkTxHash`. `authorizationToken` is sent as `X-Zappi-Authorization` (passkey step-up). Prefer `runTwoPhaseWithdraw` over hand-rolling the retry.

`getWithdrawalStatus(id)` polls `?id=`. A body `mapNestWithdrawStatus` cannot read throws 502 `GATEWAY_INVALID_RESPONSE`. Status values are `pending`, `completed`, `failed`. Nest’s awaiting-signature state is the constant `WITHDRAW_STATUS_AWAITING_SIGNATURE`.

`WithdrawalRequest` carries the combo plus either `destinationAddress` or `bolt11`, and `amountCents` and/or `amountSats`.
