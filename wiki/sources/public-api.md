---
type: source
title: SDK public source
author: Zappi
date_published: 2026-09-22
date_ingested: 2026-09-22
source_path: packages/zappi-sdk/src
tags: [sdk, source]
updated: 2026-09-22
---

# Public source

Ingest of the export map and `ZappiClient`. This is the source of truth when [[sources/readme]] is behind the code.

| Area | Files |
| --- | --- |
| Barrel | `src/index.ts` |
| Client | `src/client/zappi-client.ts` |
| Mappers | `src/client/mappers/deposit-map.ts`, `withdraw-map.ts`, `deposit-destination-map.ts` |
| QR / deep links | `src/client/presentation/deposit-presentation.ts` |
| Amounts / combos / address | `src/amounts.ts`, `src/combo.ts`, `src/address-detect.ts`, `src/constants.ts` |
| Errors | `src/errors.ts` |
| Webhook | `src/webhook/verify.ts`, `src/webhook/parse.ts` |
| Quotes / two-phase | `src/quote/quote-token.ts`, `src/quote/two-phase.ts` |
| Signer | `src/sign/index.ts`, `src/sign/wallet-signer-port.ts` |
| React | `src/react/index.ts`, `use-deposit.ts`, `use-withdraw.ts`, `use-cashier-events.ts`, `context.tsx` |
| Types | `src/types/{cashier,deposit,withdraw,transaction,partner,webhook,pots,ledger,send}.ts` |
| Build entries | `tsup.config.ts`: `index`, `sign/index`, `react/index`, `two-phase` |

`call` prefixes every path with `/api/`. Empty project key on `projectKey` auth throws `ZappiApiError` 503 `GATEWAY_NOT_CONFIGURED`. Unreachable nest is 503 `GATEWAY_UNREACHABLE`. Aborted caller signal is 499 `CLIENT_CLOSED`. HTTP 204 returns `undefined`.

> ⚠️ The class docstring says the client is server-to-server only and must never be imported from the browser. `assertServerSideAuth` allows `kind: 'bff'` in the browser and rejects `projectKey` / `session` there. Browser use is the `bff` kind, not a ban on the class.

Filed into [[usages]] and the client pages.
