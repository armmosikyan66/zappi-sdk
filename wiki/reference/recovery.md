---
type: reference
tags: [sdk, recovery, bitcoin, l1]
updated: 2026-10-17
---

# Recovery

Pure helpers for a unilateral bitcoin exit. Source is `src/recovery/`. The web map and the feature flag are in the web wiki at `web/wiki/codebase/l1-recovery.md`. The byte format is `web/wiki/analyses/l1-recovery-bundle-v1.md`.

`package.json` exports `./recovery` from `src/recovery/browser.ts` (tsup entry `recovery/index`). That published build does not include `encrypt.ts`. Node callers that need `encryptBundle` / `decryptBundle` import `src/recovery/index.ts` in this repo; that file is not a package export.

Nothing in this folder calls `sparkClient`, `isTxBroadcast`, or mempool.space. Chain reads go through an injected `ChainSource`. Nest must not receive a seed, a bundle plaintext, or a leaf graph.

## Entries

`index.ts` exports the Node sealer (`encryptBundle` / `decryptBundle`) and the WebCrypto sealer. `browser.ts` exports only `encryptBundleWithWebCrypto` / `decryptBundleWithWebCrypto`. Both sealers write the same blob: version byte, KDF id, 16-byte salt, 12-byte IV, ciphertext, 16-byte GCM tag (`src/recovery/blob.ts`). HKDF info is `zappi/recovery-bundle/v1`, the network, and the account number.

| Area | Module | What it does |
| --- | --- | --- |
| Bundle | `bundle.ts`, `canonical.ts`, `validate.ts`, `integrity.ts` | Build from captured nodes, canonical bytes, payload digest, identity-key sign and verify |
| Classify | `chain.ts`, `classify.ts` | Ancestor walk and leaf classes, including stale and unverified |
| Seal | `encrypt.ts`, `webcrypto.ts`, `hash.ts` | Seed HKDF and AES-256-GCM. Hash helpers are pure JS (no `node:crypto`) so the browser build can use them |
| Fees | `fees.ts` | Caller-supplied sat/vB. Zero or missing rate is rejected. Shared ancestors are priced once. Unconfirmed fee coins stay `unknown` |
| Broadcast | `broadcast.ts` | `planExitPackages`: parent-first packages, refund kept when the node tx is already broadcast, direct variants for RBF roots. `txidOfRawTx`, `unsignedTxFromPsbt` |
| Session | `session.ts` | Write-ahead statuses. `nextBroadcastable` holds package N+1 until child N is confirmed. Reorg demotion only on a positive `not-in-block` |
| Sweep | `sweep.ts` | `matchRefundOutput` tries the signing key and the identity key against P2WPKH and P2TR. `buildSweepTransaction` spends the matched output |
| Chain port | `chain-source.ts` | `getOutspend`, `submitPackage`, `getTxStatus`. `assertEsploraBaseUrl` refuses mempool.space |

The web app supplies the Esplora client, the 0.11.0 `constructFeeBumpTx` adapter, IndexedDB, and the screen. This package plans and checks. It does not broadcast by itself.

## Tests

`packages/zappi-sdk/node_modules/.bin/vitest run --root packages/zappi-sdk`

Recovery cases live in `tests/recovery.test.ts`, `tests/recovery-exit.test.ts`, and `tests/recovery-regtest-gates.test.ts`. They run offline. The regtest-gates file checks the rules (consolidated leaves stay unverified, an unconfirmed fee coin blocks submit, the refund survives a broadcast skip, a direct branch supersedes, no mempool.space traffic). It does not talk to a regtest node. That live run is Linear [1-754](https://linear.app/skribz/issue/1-754). The manual checklist is [1-755](https://linear.app/skribz/issue/1-755).
