---
type: reference
tags: [sdk, develop]
updated: 2026-10-17
---

# Develop

```bash
npm run build       # tsup: ESM + CJS + .d.ts, then clean on prepublish
npm test            # vitest run
npm run test:watch
npm run typecheck   # tsc --noEmit
npm run dev         # tsup --watch
```

`prepublishOnly` cleans `dist` and rebuilds. Tests cover pots/ledger/send, partner deposit and withdraw, deposit presentation and destination mapping, quote tokens, amounts, two-phase, webhooks, address detect, cashier combos, and recovery (`tests/`).

GitHub Actions runs `npm run typecheck` and `npm test` twice: once on the lockfile `@buildonspark/spark-sdk` pin, and once after installing 0.11.0 (the web app pin). The lockfile job also builds and checks that `dist/recovery` has no `node:crypto` import.

Target is ES2022, platform `neutral`, `sideEffects: false`. Node `crypto` is not bundled; webhook verify and quote tokens need a Node runtime (or a runtime that provides `node:crypto`).

The signer entry imports `@buildonspark/spark-sdk` and stays off the core entry so partners who only need types and `ZappiClient` do not load Spark.
