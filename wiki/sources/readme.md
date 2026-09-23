---
type: source
title: "@zappi/sdk README"
author: Zappi
date_published: 2026-09-22
date_ingested: 2026-09-22
source_path: packages/zappi-sdk/README.md
tags: [sdk, readme]
updated: 2026-09-22
---

# README

Ingest of `packages/zappi-sdk/README.md`. Routes and flags that the source implements more precisely are on [[sources/public-api]] and [[usages]].

## Takeaways

- Single contract for deposit and withdraw. Replaces duplicated nest DTOs and the Next.js BFF types.
- Install line in the README is `npm install @zappi/sdk`. Optional peers: `@buildonspark/spark-sdk` for `/sign`, `@tanstack/react-query` and `react` for `/react`.
- README says the package was renamed from `@zappimoney/zappi-sdk` to `@zappi/sdk` at 0.2.0. Deprecated Spark-named aliases remain through 0.2.x and were scheduled for removal in 0.3. The rate helpers `setBtcUsdRate` / `getBtcUsdRate` / `MOCK_BTC_USD_CENTS_PER_SAT` are removed. `verifyWithdrawQuote` replaces `readWithdrawQuoteToken` plus a separate expiry check.
- Three auth stories: server `projectKey`, browser `bff` (same-origin, cookies, no key), and session/BFF two-phase withdraw via `runTwoPhaseWithdraw`. Partner product-wallet payout is `runTwoPhasePartnerWithdraw`.
- Partner deposit uses `getDepositOptions` plus `createPartnerDepositDestination`. That talks to nest standing-address and Lightning Address routes, not the Next BFF `GET /wallet/deposit/destination`.
- BTC↔USD has no hidden rate. Pass `BtcUsdRate`. Mappers that price BTC take the rate as an optional trailing argument.
- Webhook: `verifyZappiWebhook(rawBody, signature, timestamp, secret, toleranceMs)` then `parseWebhookEnvelope(rawBody)`.
- Pots, ledger, and send are documented as server-side (project key or user session). Grant-scoped reads use `getPotBalanceByGrant` and `createPotDepositAddressByGrant`. Attach is device-code. Auth-required spend tickets are create / list / approve / deny.
- Amounts: sats for BTC, cents for USD, `USDB_UNITS_PER_CENT = 10_000`. The library does not hold mnemonics.

## Filed into

[[reference/install]], [[reference/auth]], [[reference/amounts]], [[reference/webhooks]], [[reference/sign]], [[reference/react]], [[reference/migration]], [[client/deposit]], [[client/pots]], [[client/ledger-send]], [[flows/two-phase]].

> ⚠️ README package name `@zappi/sdk` vs `package.json` `"name": "@zappimoney/zappi-sdk"` at 0.3.1. See [[reference/install]].
>
> ⚠️ README says aliases leave in 0.3. Version 0.3.1 still exports them. See [[reference/migration]].
>
> ⚠️ README subpath table omits `./two-phase`, which `package.json` exports. See [[flows/two-phase]].
