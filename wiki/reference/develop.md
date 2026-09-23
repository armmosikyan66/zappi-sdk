---
type: reference
tags: [sdk, develop]
updated: 2026-09-22
---

# Develop

```bash
npm run build       # tsup: ESM + CJS + .d.ts, then clean on prepublish
npm test            # vitest run
npm run test:watch
npm run typecheck   # tsc --noEmit
npm run dev         # tsup --watch
```

`prepublishOnly` cleans `dist` and rebuilds. Tests cover pots/ledger/send, partner deposit and withdraw, deposit presentation and destination mapping, quote tokens, amounts, two-phase, webhooks, address detect, and cashier combos (`packages/zappi-sdk/tests/`).

Target is ES2022, platform `neutral`, `sideEffects: false`. Node `crypto` is not bundled; webhook verify and quote tokens need a Node runtime (or a runtime that provides `node:crypto`).

The signer entry imports `@buildonspark/spark-sdk` and stays off the core entry so partners who only need types and `ZappiClient` do not load Spark.
