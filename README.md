# @zappi/sdk

Single source of truth for the Zappi deposit/withdraw contract. Replaces the
triply-duplicated types that previously lived in `zappi-nest` DTOs and the
Next.js BFF (`web/lib/api/types.ts`).

## Install

```sh
npm install @zappi/sdk
# optional subpaths (peer deps):
npm install @buildonspark/spark-sdk   # for /sign
npm install @tanstack/react-query react  # for /react
```

> **Upgrading from `@zappimoney/zappi-sdk`?** The package was renamed to
> `@zappi/sdk` at 0.2.0. Legacy names (`createSparkSigner`, `SparkSigner`,
> `SparkWalletBalance`, `sparkDestinationChain`, …) still work as deprecated
> aliases in 0.2.x — see *Migration* below.

## Subpaths

| Import | What you get | Peer deps |
|--------|--------------|-----------|
| `@zappi/sdk` | Types, constants, amount/combo/address utils, `ZappiClient`, webhook verify, quote-token, two-phase orchestrator | none |
| `@zappi/sdk/sign` | `createWalletSigner()` — in-process wallet USDB signer | `@buildonspark/spark-sdk` |
| `@zappi/sdk/react` | React Query hooks + `ZappiClientProvider` | `react`, `@tanstack/react-query` |

## Quick start

### Core client (server)

```ts
import { ZappiClient } from '@zappi/sdk'

const client = new ZappiClient({
  apiUrl: 'https://api.zappi.money',
  auth: { kind: 'projectKey', projectApiKey: process.env.ZAPPI_PROJECT_API_KEY! },
})

const options = await client.getWithdrawOptions()
const status = await client.getWithdrawalStatus('wd_123')
```

**Never construct a `projectKey` or `session` client in the browser** — those
auth kinds embed the project API key in request headers, and the SDK throws if
you try. Browser code uses the `bff` kind below.

### Browser client (same-origin BFF, cookie auth)

```ts
import { ZappiClient } from '@zappi/sdk'

// apiUrl points at YOUR app (the BFF), not zappi-nest. Requests carry the
// browser session cookies (`credentials: 'include'`); no API key is sent.
const client = new ZappiClient({
  apiUrl: '',            // same-origin: relative requests
  auth: { kind: 'bff' },
})

const options = await client.getWithdrawOptions()
```

### Partner deposit destination (Example / project-key)

Talks to nest's standing deposit address / Lightning Address routes — not the Next.js BFF `GET /wallet/deposit/destination` path.

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
import { runTwoPhaseWithdraw } from '@zappi/sdk'
import { createWalletSigner } from '@zappi/sdk/sign'

const signer = await createWalletSigner({
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
import { runTwoPhasePartnerWithdraw } from '@zappi/sdk'

const result = await runTwoPhasePartnerWithdraw(client, signer, {
  userId: 'example-user-id',
  asset: 'USDC',
  networkId: 'solana',
  address: 'So111...',
  amountCents: 100,
  idempotencyKey: 'wd:quote-hash',
})
```

### BTC↔USD amounts — no hidden rate

There is **no default/mock exchange rate**. Conversions take the rate
explicitly and throw `MissingBtcRateError` when it is absent, so a stale
number can never silently misprice a real withdraw:

```ts
import { BtcUsdRate, btcSatsToUsdCents, usdCentsToBtcSats } from '@zappi/sdk'

const rate = new BtcUsdRate(0.11625) // from your live spot source
const cents = btcSatsToUsdCents(1000, rate)
const sats = usdCentsToBtcSats(cents, rate)
```

Mappers that price BTC (`nestAmountCents`, `mapNestEstimate`) accept the rate
as an optional trailing parameter for the same reason.

### Webhook verification

```ts
import { verifyZappiWebhook, parseWebhookEnvelope } from '@zappi/sdk'

const ok = verifyZappiWebhook(rawBody, signature, timestamp, secret, 300_000)
if (!ok) throw new Error('invalid signature')
const envelope = parseWebhookEnvelope(rawBody)
```

### Quote tokens — verify signature AND expiry in one call

```ts
import { verifyWithdrawQuote } from '@zappi/sdk'

// Returns null on tampering OR expiry — no separate step to forget.
const payload = verifyWithdrawQuote(secret, quoteId)
if (!payload || payload.userId !== sessionUserId) throw new Error('quote not found')
```

### React hooks

```tsx
'use client'
import { ZappiClientProvider, useWithdrawOptions } from '@zappi/sdk/react'

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

Pass a **`bff`-kind client** to the provider in the browser. Server
(`projectKey`/`session`) clients are for your BFF/node code only.

## Pots, ledger & send

`ZappiClient` also wraps the user-session pot, attach, spend-ticket, ledger, and send routes on zappi-nest. These are server-side calls (project key or user session) — never browser-side.

```ts
// Pots (user session)
const pots = await client.listPots({ spendMode: 'free' })
const pot = await client.createPot({ sparkAddress, spendMode: 'free' })
const balance = await client.getPotBalance(potId)
const grants = await client.listPotGrants(potId)
await client.createPotGrant(potId, { scopes: ['read', 'deposit'] })
await client.revokePotGrant(potId, grantId)
const gate = await client.getPotSpendGate(potId, 'withdraw')
await client.approvePotSpend(potId, approvalId, authorizationToken)

// Agent grant (no user JWT — the grant is the credential)
await client.getPotBalanceByGrant(potId, grantId)
await client.createPotDepositAddressByGrant(potId, { grantId })

// Device-code attach
const pending = await client.createPotAttach({ spendMode: 'free' })
const poll = await client.pollPotAttach(pending.requestId)
await client.approvePotAttach(pending.requestId, { spendMode: 'free' })

// Auth-required spend tickets
await client.createPotSpendRequest(potId, { amountCents, destinationAddress }, authorizationToken)
const requests = await client.listPotSpendRequests(potId)
await client.approvePotSpendRequest(potId, requestId, authorizationToken)
await client.denyPotSpendRequest(potId, requestId, authorizationToken)

// Ledger
const txs = await client.listTransactions()
const receipt = await client.getTransaction(txId)

// Send (user-facing)
const target = await client.resolveSendTarget(recipientUserId)
await client.sendExternal({ asset, networkId, address, amountCents }, authorizationToken)
const estimate = await client.estimateSend({ asset, networkId, amountCents, address })
const status = await client.getSendStatus(withdrawId)
```

The raw DTO shapes for these routes live in `@zappi/sdk` types: `AgentPot`,
`AgentPotSpendApproval`, `NestPotAttachPendingResponse`, `LedgerTransaction`,
`NestResolveSendTargetResponse`, etc.

## Custody model

The library never holds mnemonics. The `/sign` subpath takes the mnemonic via
`opts` only — never argv or env inside the library — and the partner is
responsible for secure storage. This matches zappi-nest's non-custodial model:
USDB lives on Spark (the wallet rail), the server records ledger history but
does not custody user funds.

## Amount conventions

- BTC amounts are in **satoshis**.
- USD amounts are in **cents** (the on-chain instrument is USDB on Spark, but
  users see one fungible dollar number).
- USDB smallest units: `USDB_UNITS_PER_CENT = 10_000` (6-decimal USDB).
- BTC↔USD conversion always requires an explicit `BtcUsdRate`.

## Migration from 0.1.x (`@zappimoney/zappi-sdk`)

| 0.1.x | 0.2.x |
|---|---|
| `@zappimoney/zappi-sdk` | `@zappi/sdk` |
| `createSparkSigner` | `createWalletSigner` |
| `SparkSigner` / `CreateSparkSignerOptions` | `WalletSigner` / `CreateWalletSignerOptions` |
| `SparkSignerError` | `WalletSignerError` |
| `SparkWalletBalance` | `WalletBalance` |
| `getBalance()` | `getWalletBalance()` |
| `sparkDestinationChain` | `walletDestinationChain` |
| `DEFAULT_SPARK_NETWORK` | `DEFAULT_WALLET_NETWORK` |
| `PRODUCT_SPARK_ACCOUNT_NUMBER` | `PRODUCT_WALLET_ACCOUNT_NUMBER` |
| `SparkNetwork` | `WalletNetwork` |
| `setBtcUsdRate` / `getBtcUsdRate` / `MOCK_BTC_USD_CENTS_PER_SAT` | removed — pass `BtcUsdRate` explicitly |
| `readWithdrawQuoteToken` + `isWithdrawQuoteExpired` | `verifyWithdrawQuote` (does both) |

Deprecated aliases for everything except the rate global remain exported in
0.2.x; they will be removed in 0.3. The rate global is removed outright
because silently keeping a mock price around was the hazard.

## License

MIT
