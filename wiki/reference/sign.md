---
type: reference
tags: [sdk, sign]
updated: 2026-09-22
---

# Signer

Import from the `/sign` subpath so the core bundle does not pull `@buildonspark/spark-sdk`.

```ts
import { createWalletSigner } from '@zappimoney/zappi-sdk/sign'

const signer = await createWalletSigner({
  mnemonic: process.env.ZAPPI_PRODUCT_MNEMONIC!,
  accountNumber: 0,
  network: 'MAINNET',
})

const { sparkTxHash } = await signer.transferUsdb({
  tokenIdentifier,
  tokenAmount: BigInt(sendAmount),
  receiverSparkAddress: depositAddress,
})
await signer.cleanup()
```

`mnemonic` is required and trimmed. The library does not log it and does not read env itself. `accountNumber` defaults to 0 and must be an integer ≥ 0. `network` defaults to `MAINNET`; only the string `REGTEST` (case-insensitive) selects regtest.

`transferUsdb` calls Spark `transferTokens`. `tokenAmount` must be a positive bigint (USDB smallest units, not cents). Empty identifier or receiver throws `INVALID_PARAMS`. A missing hash throws `NO_HASH`. After `cleanup`, further transfers throw `CLEANED_UP`. `cleanup` is best-effort and does not throw.

`WalletSigner` (the port in the core package) is `transferUsdb` plus `cleanup`. [[flows/two-phase]] accepts that port or any object with `transferUsdb`, so tests do not need the Spark SDK.

`createSparkSigner` and `SparkSignerError` are deprecated aliases of `createWalletSigner` and `WalletSignerError`.
