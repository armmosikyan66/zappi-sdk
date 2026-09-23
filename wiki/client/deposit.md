---
type: client
tags: [sdk, deposit]
updated: 2026-09-22
---

# Deposit

Catalog, destinations, and balance. Method table: [[usages]].

## Catalog and BFF destination

`getDepositOptions` maps nest `wallet/deposit-options` to `DepositOption[]` (asset plus networks, fees, arrival copy).

`getDepositDestination({ asset, network })` is the **BFF** shape: `GET /api/wallet/deposit/destination?asset=&network=`. Partners talking to nest should use `createPartnerDepositDestination` instead (from [[sources/readme]]).

## Standing deposit addresses

New integrations use standing addresses. `createAccumulationAddress` and `createLiquidationAddress` are deprecated.

`createStandingDepositAddress` posts one immutable instruction per (project, user, destination) and returns per-source-chain addresses. The same instruction replays. A changed destination needs a new user or reference; nest returns **409 `INSTRUCTION_CONFLICT`**.

`listStandingDeposits(userId, { limit, offset })` returns pre-order deposits with status and hold codes (`standing_identity_pair`, dust below the route minimum, `standing_tron_refund_requires_operator`, and others).

`patchStandingDepositAddress` pauses (`enabled: false`) or resumes. Pause stops new source commitments. Already signed transactions keep their recovery path. Pause does not refund.

`resolveStandingDeposits` asks for refunds of held deposits. Body is `depositIds` (1–200, same address and asset; Bitcoin is exactly one) or `batchId`, plus a source-chain `refundAddress`. **202** means the refund was enqueued, not that it was broadcast.

## Partner destination

```ts
const destination = await client.createPartnerDepositDestination(
  { asset: 'usdc', network: 'base' },
  { userId: 'example-user-id', recipientSparkAddress, nativeReference },
)
```

It loads the deposit catalog and creates the address in parallel.

- BTC + Lightning → `createPartnerLightningAddress`. `enabled: false` throws 503 `LIGHTNING_DISABLED`. Missing address throws 502 `GATEWAY_INVALID_RESPONSE`.
- BTC + mainnet → standing address with `sourceChain: 'bitcoin'`, `destinationAsset: 'USDB'`, idempotency key `std:deposit:${userId}:btc:mainnet`.
- Other combos → standing address with `sourceChain` equal to the network id and idempotency key `std:deposit:${userId}:${network}:${asset}`.

`nativeReference` defaults to `userId`. Optional `recipientSparkAddress` is sent as `destinationAddress`. If the combo is not in the live catalog, the client throws 400 `DEPOSIT_RAIL_UNAVAILABLE`. The return value is a `DepositDestination` with catalog copy plus QR and wallet deep links ([[reference/amounts]]).

## Invoice and balance

`generateLightningInvoice(amountSats)` posts `{ amountSats }` and returns a `LightningInvoice` (amount-locked BOLT11).

`getWalletBalance` returns the readonly balance envelope (`walletAddress`, token balances, pending and recent transfers). `getBalance` is the old name.
