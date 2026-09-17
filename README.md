# @zappimoney/zappi-sdk

Single source of truth for the Zappi deposit/withdraw contract. Replaces the
triply-duplicated types that previously lived in `zappi-nest` DTOs, the Next.js
BFF (`web/lib/api/types.ts`).

## Install

```sh
npm install @zappimoney/zappi-sdk
# optional subpaths (peer deps):
npm install @buildonspark/spark-sdk   # for /sign
npm install @tanstack/react-query react  # for /react
```

## Subpaths

| Import | What you get | Peer deps |
|--------|--------------|-----------|
| `@zappimoney/zappi-sdk` | Types, constants, amount/combo/address utils, `ZappiClient`, webhook verify, quote-token, two-phase orchestrator | none |
| `@zappimoney/zappi-sdk/sign` | `createSparkSigner()` — in-process Spark USDB signer | `@buildonspark/spark-sdk` |
| `@zappimoney/zappi-sdk/react` | React Query hooks + `ZappiClientProvider` | `react`, `@tanstack/react-query` |

## Quick start

### Core client

```ts
import { ZappiClient } from '@zappimoney/zappi-sdk'

const client = new ZappiClient({
  apiUrl: 'https://api.zappi.money',
  auth: { kind: 'projectKey', projectApiKey: process.env.ZAPPI_PROJECT_API_KEY! },
})

const options = await client.getWithdrawOptions()
const status = await client.getWithdrawalStatus('wd_123')
```

### Partner deposit destination (Example / project-key)

Talks to nest's accumulation / liquidation / Lightning Address routes — not the Next.js BFF `GET /wallet/deposit/destination` path.

```ts
const options = await client.getDepositOptions()
const destination = await client.createPartnerDepositDestination(
  { asset: 'usdc', network: 'base' },
  { userId: 'example-user-id' },
)
```

### Two-phase withdraw with a signer

Session / BFF path (`confirmWithdrawal`):

```ts
import { runTwoPhaseWithdraw } from '@zappimoney/zappi-sdk'
import { createSparkSigner } from '@zappimoney/zappi-sdk/sign'

const signer = await createSparkSigner({
  mnemonic: process.env.ZAPPI_PRODUCT_MNEMONIC!, // partner-held, never logged
  accountNumber: 0,
  network: 'MAINNET',
})

const result = await runTwoPhaseWithdraw(client, signer, {
  quoteId: 'q_abc',
  authorizationToken: null,
})
```

Partner product-wallet path (`partnerWithdraw`) — Example:

```ts
import { runTwoPhasePartnerWithdraw } from '@zappimoney/zappi-sdk'

const result = await runTwoPhasePartnerWithdraw(client, signer, {
  userId: 'example-user-id',
  asset: 'USDC',
  networkId: 'solana',
  address: 'So111...',
  amountCents: 100,
  idempotencyKey: 'wd:quote-hash',
})
```

### Webhook verification

```ts
import { verifyZappiWebhook, parseWebhookEnvelope } from '@zappimoney/zappi-sdk'

const ok = verifyZappiWebhook(rawBody, signature, timestamp, secret, 300_000)
if (!ok) throw new Error('invalid signature')
const envelope = parseWebhookEnvelope(rawBody)
```

### React hooks

```tsx
'use client'
import { ZappiClientProvider, useWithdrawOptions } from '@zappimoney/zappi-sdk/react'

function App() {
  return (
    <ZappiClientProvider client={client}>
      <Picker />
    </ZappiClientProvider>
  )
}

function Picker() {
  const { data } = useWithdrawOptions()
  // ...
}
```

## Custody model

The library never holds mnemonics. The `/sign` subpath takes the mnemonic via
`opts` only — never argv or env inside the library — and the partner is
responsible for secure storage. This matches zappi-nest's non-custodial model:
USDB lives on Spark, the server records ledger history but does not custody
user funds.

## Amount conventions

- BTC amounts are in **satoshis**.
- USD amounts are in **cents** (the on-chain instrument is USDB on Spark, but
  users see one fungible dollar number).
- USDB smallest units: `USDB_UNITS_PER_CENT = 10_000` (6-decimal USDB).

## License

MIT
