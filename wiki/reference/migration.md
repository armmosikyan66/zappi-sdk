---
type: reference
tags: [sdk, migration]
updated: 2026-09-22
---

# Migration

README table from 0.1.x `@zappimoney/zappi-sdk` to the 0.2 names. At **0.3.1** the new names are canonical and the old names are still exported with `@deprecated`.

| 0.1.x | Current |
| --- | --- |
| package `@zappimoney/zappi-sdk` | README: `@zappi/sdk`. This repo’s `package.json` name is still `@zappimoney/zappi-sdk`. |
| `createSparkSigner` | `createWalletSigner` |
| `SparkSigner` / `CreateSparkSignerOptions` | `WalletSigner` / `CreateWalletSignerOptions` |
| `SparkSignerError` | `WalletSignerError` |
| `SparkWalletBalance` | `WalletBalance` |
| `getBalance()` | `getWalletBalance()` |
| `sparkDestinationChain` | `walletDestinationChain` |
| `DEFAULT_SPARK_NETWORK` | `DEFAULT_WALLET_NETWORK` |
| `PRODUCT_SPARK_ACCOUNT_NUMBER` | `PRODUCT_WALLET_ACCOUNT_NUMBER` |
| `SparkNetwork` | `WalletNetwork` |
| `setBtcUsdRate` / `getBtcUsdRate` / `MOCK_BTC_USD_CENTS_PER_SAT` | Removed. Pass `BtcUsdRate`. |
| `readWithdrawQuoteToken` + `isWithdrawQuoteExpired` | Prefer `verifyWithdrawQuote` (both checks). The two old functions are still exported. |

> ⚠️ [[sources/readme]] says the aliases except the rate global “will be removed in 0.3”. Version 0.3.1 still exports them from `src/index.ts` and `src/sign/index.ts`. Do not treat 0.3.1 as the removal release.

`TwoPhaseSigner`’s deprecated alias `SparkSigner` in `two-phase.ts` is the same `WalletSigner` port, not the Spark SDK class.
