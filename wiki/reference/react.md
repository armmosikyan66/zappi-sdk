---
type: reference
tags: [sdk, react]
updated: 2026-09-22
---

# React

Import from `@zappimoney/zappi-sdk/react`. Pass a **`bff`** client into the provider in the browser ([[reference/auth]]).

```tsx
'use client'
import { ZappiClientProvider, useWithdrawOptions } from '@zappimoney/zappi-sdk/react'

<ZappiClientProvider client={client}>
  <Picker />
</ZappiClientProvider>
```

`useZappiClient()` reads that client. Hooks throw if they render outside the provider.

| Hook | Behavior |
| --- | --- |
| `useDepositOptions()` | Query. Key `depositKeys.options`. Stale time 5 minutes. |
| `useDepositDestination(combo \| null)` | Disabled when combo is null. Stale time `Infinity` (destinations are durable). |
| `useWithdrawOptions()` | Query. Stale time 5 minutes. |
| `useWithdrawalEstimate()` | Mutation. `retry: false`. Safe to debounce. |
| `useWithdrawalQuote()` | Mutation. `retry: false`. Quote TTL is about 2 minutes. |
| `useConfirmWithdrawal({ signer?, authorizationToken? })` | Mutation. Runs [[flows/two-phase]] `runTwoPhaseWithdraw`. `retry: false`. |
| `useWithdrawalStatus(id \| null)` | Query. Disabled when id is null. Refetches every 5s until status is `completed` or `failed`. |
| `useCashierEvents()` | Subscribes on mount, unsubscribes on unmount. Returns `lastEvent`, `events`, `error`. |

Query key prefixes: `['zappi', 'deposit', …]` and `['zappi', 'withdraw', …]`. Invalidate with `depositKeys` and `withdrawKeys`.

`useCashierEvents` keeps its own buffer. One shared stream means one hook at the root and events passed down. The hook does not share a subscription across components.
