---
type: reference
tags: [sdk, install]
updated: 2026-09-22
---

# Install

`package.json` name is **`@zappimoney/zappi-sdk`**, version **0.3.1**, MIT, Node **≥ 20.9**. `publishConfig.access` is `public`. Repository `https://github.com/armmosikyan66/zappi-sdk`.

> ⚠️ [[sources/readme]] says `npm install @zappi/sdk` and that the rename landed at 0.2.0. This tree’s package name is still `@zappimoney/zappi-sdk`. Source comments and the README heading use `@zappi/sdk`. Import whichever name your installed package actually resolves.

Published files are `dist` and `README.md`. Dual ESM and CJS. The CLI in this monorepo depends on it via `file:../zappi-sdk`.

## Subpaths

| Export | Entry | Peers |
| --- | --- | --- |
| `.` | `src/index.ts` | none |
| `./sign` | `src/sign/index.ts` | `@buildonspark/spark-sdk` ≥ 0.9 (optional peer) |
| `./react` | `src/react/index.ts` | `react` ≥ 18, `@tanstack/react-query` ≥ 5 (optional peers) |
| `./two-phase` | `src/quote/two-phase.ts` | none |

Peers are optional so the core install does not pull Spark or React. tsup marks `react`, `@tanstack/react-query`, and `@buildonspark/spark-sdk` as external.

In this monorepo, import `@zappimoney/zappi-sdk` unless a published rename has already been installed.
