---
type: flow
tags: [sdk, withdraw]
updated: 2026-09-22
---

# Two-phase withdraw

The pot key or product mnemonic never goes to nest. The client signs Spark USDB locally and sends only `sparkTxHash`.

Both functions live on the root export and on the `./two-phase` subpath. `TwoPhaseSigner` is structural (`transferUsdb` only), so a test double does not import [[reference/sign]].

## Session or BFF confirm

`runTwoPhaseWithdraw(client, signer, { quoteId, authorizationToken?, signal?, signer? })`

1. `confirmWithdrawal(quoteId)`. If `needsSignature` is false, return that confirmation.
2. If a signature is required and `signer` is null, throw `TwoPhaseWithdrawError` `SIGNER_REQUIRED`.
3. If `depositAddress`, `tokenIdentifier`, or `sendAmount` is missing, throw `MISSING_SEND_DETAILS`.
4. `signer.transferUsdb` with `tokenAmount: BigInt(sendAmount)` (already USDB smallest units).
5. `confirmWithdrawal(quoteId, sparkTxHash, authorizationToken)`.

`useConfirmWithdrawal` in [[reference/react]] calls this. The `client` argument only needs `confirmWithdrawal`, so a browser can pass a thin BFF shim instead of a full `ZappiClient`.

## Partner product wallet

`runTwoPhasePartnerWithdraw(client, signer, body, options?)`

`body` is `NestPartnerWithdrawBody` (`userId`, asset, `networkId`, address, `amountCents`, `idempotencyKey`, …).

1. `partnerWithdraw(body)`. Map the raw execute response to a confirmation.
2. If `needsSignature`, sign to `depositAddress` the same way.
3. `partnerWithdraw({ ...body, sparkTxHash })`.

Nest does not hold the product mnemonic. Build the signer with [[reference/sign]] `createWalletSigner` on the partner host. Poll with `partnerGetWithdrawalStatus(withdrawId, userId)` so the project key is scoped to that user ([[client/partner]]).

`options.signer` overrides the signer argument for one call.
