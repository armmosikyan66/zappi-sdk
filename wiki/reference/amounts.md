---
type: reference
tags: [sdk, amounts, cashier]
updated: 2026-09-22
---

# Amounts, combos, and addresses

## Units

- BTC amounts are **satoshis**.
- USD amounts are **cents**. Users see one dollar number. The on-chain instrument is USDB on Spark.
- `USDB_UNITS_PER_CENT = 10_000` (6-decimal USDB, 1:1 with USD). `centsToUsdbUnits` / `usdbUnitsToCents`.
- `formatUsdCents` and `formatSats` are display helpers.

`BtcUsdRate` is cents per satoshi. `new BtcUsdRate(0.11625)` is about $116,250 per BTC (`usdPerBtc`). Non-finite or negative rates throw `RangeError`. A rate of 0 makes `usdCentsToBtcSats` return 0.

`btcSatsToUsdCents(sats, rate)` and `usdCentsToBtcSats(cents, rate)` require a `BtcUsdRate` or a number. Missing rate throws `MissingBtcRateError`. There is no module-level mock.

`nestAmountCents` and `mapNestEstimate` take the rate as an optional trailing argument for the same reason.

## Cashier combos

Assets: `btc`, `usdc`, `usdt`, `eth`.

Networks: BTC `mainnet | lightning`. Stables `solana`, `tron`, `base`, `arbitrum`, `ethereum`, `optimism`, `polygon`, `bsc`, `avalanche`.

`isValidCashierCombo` rules:

- `btc` → `mainnet` or `lightning` only.
- `eth` → `ethereum` only.
- `tron` → `usdt` only (Orchestra has spark:USDB ↔ tron:USDT, not USDC or native TRX).
- `usdc` / `usdt` → any other stable network.

`parseCashierCombo(asset, network)` returns a typed combo or null. `isBtcCombo` / `isStableCombo` split on asset `btc`.

`NETWORK_TO_CHAIN` maps network ids to Flashnet destination chains (`binance` → `bsc`). `ASSET_TO_FLASHNET` maps `BTC`, `USDC`, `USDT`. `FALLBACK_ARRIVAL` plus `withdrawArrivalCopy(combo)` fill arrival text when nest omits it.

`WalletNetwork` is `MAINNET | REGTEST`. `DEFAULT_WALLET_NETWORK` is `MAINNET`. `PRODUCT_WALLET_ACCOUNT_NUMBER` is `0`. Custody constants: `custodial` and `user-held`.

## Address families

`detectAddressFamily` and `validateDestination` are zero-dependency shape checks (Spark, Solana, Tron, Bitcoin, Lightning, EVM). They pick a family and reject obvious garbage. Full checksums stay in the wallet `wallet-address` module. Nest re-validates.

EVM is the ambiguous family (`isAmbiguousAddressFamily`): ethereum, base, arbitrum, optimism, polygon, bsc, avalanche share it. `uniqueNetworkForFamily` returns null for EVM.

Deposit presentation (QR and deep links): `depositQrPayload`, `depositUriScheme`, `depositWalletDeepLinks`, `evmErc20TransferUri`, `isSparkIdentityAddress`, `walletDestinationChain`. `SPARK_TEST_WALLET_URL` is the Spark docs test wallet. `sparkDestinationChain` is the old name of `walletDestinationChain`.
