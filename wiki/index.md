---
type: index
tags: [meta, sdk]
updated: 2026-09-22
source_count: 2
page_count: 21
last_change: 2026-09-22 Bootstrap zappi-sdk wiki from README and public source.
---

# zappi-sdk Wiki

LLM-maintained knowledge base for the Zappi SDK in `packages/zappi-sdk`. The agent owns these pages. Read them, search them, and link to them. If something is wrong, ask the agent to fix it rather than editing by hand.

**How to use this wiki**

- Start at [[usages]] for every public function and `ZappiClient` method.
- Browse by category below.
- Every page has YAML frontmatter (`type`, `tags`, `updated`) and uses `[[wikilinks]]`.
- `log.md` is the chronological record of every ingest.
- Package at ingest: **`@zappimoney/zappi-sdk` 0.3.1**. Node.js **≥ 20.9**.

**Categories**

- `wiki/sources/` — ingested README and the public source surface.
- `wiki/client/` — `ZappiClient` route groups.
- `wiki/reference/` — install, auth, amounts, errors, webhooks, signer, React, migration.
- `wiki/flows/` — two-phase withdraw.

The buyer CLI that calls this client is documented in `packages/zappi-cli/wiki/`.

---

## Sources

- [[sources/readme]] — package README: install, subpaths, quick start, custody, migration table.
- [[sources/public-api]] — `src/index.ts` exports, `package.json` subpaths, and `ZappiClient` routes.

## Overview

- [[overview]] — what the SDK is, who calls it, and what it refuses to hold.

## Usages

- [[usages]] — import map and every client method with its HTTP route.

## Client

- [[client/deposit]] — deposit catalog, standing addresses, partner destination, Lightning invoice, balance.
- [[client/withdraw]] — options, estimate, quote, confirm, status.
- [[client/partner]] — partner withdraw, Lightning address, internal send, status poll.
- [[client/pots]] — pots, grants, spend gate, attach, spend tickets.
- [[client/ledger-send]] — transactions, resolve, internal and external send.

## Reference

- [[reference/install]] — package name, subpaths, peers.
- [[reference/auth]] — `projectKey`, `session`, `bff`.
- [[reference/amounts]] — sats, cents, USDB units, cashier combos, address families.
- [[reference/errors]] — `ZappiApiError` and known codes.
- [[reference/webhooks]] — HMAC verify and quote tokens.
- [[reference/sign]] — `@zappi/sdk/sign` wallet signer.
- [[reference/react]] — React Query hooks.
- [[reference/migration]] — 0.1.x aliases still exported at 0.3.1.
- [[reference/develop]] — build, test, publish.

## Flows

- [[flows/two-phase]] — session confirm and partner product-wallet payout.
