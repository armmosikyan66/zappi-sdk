---
type: overview
tags: [sdk, wallet, contract]
updated: 2026-09-22
---

# Overview

The SDK is the shared deposit and withdraw contract for zappi-nest, the Next.js BFF, and partners (BitKong is the example in the package description). It replaces types that used to be copied between nest DTOs and `web/lib/api/types.ts` (from [[sources/readme]]).

Published package name in this repo is **`@zappimoney/zappi-sdk` version 0.3.1**. Source comments and the README title say `@zappi/sdk`. See [[reference/install]].

## What you import

| Import | Contents | Extra deps |
| --- | --- | --- |
| `@zappimoney/zappi-sdk` | Types, constants, amounts, cashier combos, address heuristics, `ZappiClient`, webhook verify, quote tokens, two-phase orchestrator | none |
| `…/sign` | `createWalletSigner()` | peer `@buildonspark/spark-sdk` |
| `…/react` | React Query hooks and `ZappiClientProvider` | peers `react`, `@tanstack/react-query` |
| `…/two-phase` | Same orchestrator as the root export, as its own entry | none |

Full method list: [[usages]].

## Who calls it

- **Partners and the BFF** construct `ZappiClient` with `projectKey` or `session` and point `apiUrl` at nest (`https://api.zappi.money`).
- **Browser code** uses `auth: { kind: 'bff' }` and points `apiUrl` at the app’s own BFF (often `''` for same-origin). Cookies go with `credentials: 'include'`. No project key is sent.
- **The buyer CLI** (`packages/zappi-cli`) builds a `ZappiClient` for wallet and pots commands. Pay and consume in that CLI still use their own HTTP path.

## What the library does not hold

The SDK never stores a mnemonic. `/sign` receives it only through `createWalletSigner({ mnemonic })`. It does not read argv or env. The partner keeps the Integration product wallet phrase. Nest records ledger history and does not custody user funds (from [[sources/readme]]).

There is no default BTC/USD rate. Conversions take a [[reference/amounts]] `BtcUsdRate` or throw `MissingBtcRateError`.

`projectKey` and `session` throw if constructed where `window.document` exists, because those kinds put the project API key on `Authorization`. See [[reference/auth]].
