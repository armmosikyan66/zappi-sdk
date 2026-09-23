---
type: log
tags: [meta]
updated: 2026-09-22
---

# Wiki Log

## [2026-09-22] bootstrap | zappi-sdk wiki
- new: wiki/index.md, wiki/overview.md, wiki/usages.md, wiki/log.md
- notes: No wiki existed under `packages/zappi-sdk`. Same shape as the zappi-cli wiki: frontmatter, wikilinks, index, log. Categories: sources, client, reference, flows.

## [2026-09-22] ingest | README and public API
- summary: wiki/sources/readme.md, wiki/sources/public-api.md
- touched: wiki/overview.md, wiki/usages.md, wiki/client/deposit.md, wiki/client/withdraw.md, wiki/client/partner.md, wiki/client/pots.md, wiki/client/ledger-send.md, wiki/reference/install.md, wiki/reference/auth.md, wiki/reference/amounts.md, wiki/reference/errors.md, wiki/reference/webhooks.md, wiki/reference/sign.md, wiki/reference/react.md, wiki/reference/migration.md, wiki/reference/develop.md, wiki/flows/two-phase.md, wiki/index.md
- notes: README and source comments say `@zappi/sdk`. `package.json` name is still `@zappimoney/zappi-sdk` at 0.3.1. README says 0.1.x aliases drop in 0.3; they are still exported. `package.json` exports `./two-phase`; the README subpath table omits it. Class comment says never import `ZappiClient` in the browser; `auth.kind: 'bff'` is the browser-safe path and is allowed.
