---
type: client
tags: [sdk, swap, btc]
updated: 2026-09-29
---

# Swap and deposit-into-BTC

Nest-only contract for Linear 1-396. The web swap sheet is a sibling ticket; it depends on these methods landing first.

`getSwapRoutes()` reads live Orchestra routes (`GET wallet/swap/routes`). `inVault` is spark/USDB ↔ spark/BTC. `depositIntoBtc` is every live source whose destination is spark/BTC. Never hardcode that list.

`executeSwap(body, authorizationToken?)` posts `{ direction: usdb_to_btc | btc_to_usdb, amountCents | amountSats, idempotencyKey, sparkTxHash? }`. Omit the hash to receive `needsSignature`, `depositAddress`, `sendKind` (`usdb` or `sats`), and `quoteExpiresAt`. Retry the same idempotency key with `sparkTxHash` after the browser signs. Passkey accounts send `X-Zappi-Authorization` (`withdraw`).

`executeDepositBtc(body, authorizationToken?)` posts a live source → spark/BTC quote. Spark sources retry with `sparkTxHash`. On-chain sources send to `depositAddress` then retry with `sourceTxHash` (`needsDeposit`). Standing spark/BTC is not used — Flashnet's standing allowlist does not list it.

`getSwapStatus(swapId)` polls. Nest also applies Orchestra webhooks and a poll fallback.

`WalletBalance.balanceBtcSats` is the Spark sats read next to USDB token balances. `LedgerTransaction` may be `type: 'swap'` with `currency: 'usd' | 'btc'` and `amountSats`. The frontend union includes `SwapTransaction`.
