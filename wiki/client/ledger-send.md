---
type: client
tags: [sdk, ledger, send]
updated: 2026-09-22
---

# Ledger and send

## Ledger

`listTransactions()` returns `LedgerTransaction[]` from `GET /api/wallet/transactions` (defaults to `[]` when nest omits the array).

`getTransaction(id)` returns the receipt, including Orchestra detail on `NestTransactionDetailResponse['transaction']`.

Ledger types cover BTC and USD rows plus transfers. Status is `completed | pending | failed`. Orchestration stages, timeline, and tx hashes live on the transaction types in `src/types/ledger.ts` and `src/types/transaction.ts`.

## User send

`resolveSendTarget(recipientUserId)` returns the recipient Spark address and custody mode.

`sendInternal(input)` posts `ContactTransferInput` to `wallet/send/internal`. If `input.authorizationToken` is set, it is also sent as `X-Zappi-Authorization`.

`sendExternal(body, authorizationToken?)` posts `NestSendExternalBody` (`asset`, `networkId`, `address`, `amountCents`, `idempotencyKey`, optional `sparkTxHash`) and returns the raw nest execute response, same shape as partner withdraw. A `needsSignature` result is completed by signing and posting again with `sparkTxHash`. The SDK does not wrap this pair in `runTwoPhaseWithdraw`; that helper only calls `confirmWithdrawal`.

`getSendOptions` is the send catalog (same idea as withdrawal options).

`validateSendAddress({ asset, network, address })` and `estimateSend({ asset, networkId, amountCents, address? })` are stateless GETs. Estimate has no quote TTL.

`getSendStatus(withdrawId)` polls an external-address send.

## Events

`subscribeCashierEvents(onEvent, onError?, signal?)` opens `GET /api/wallet/events` as SSE via fetch and `ReadableStream`, not `EventSource`, so auth headers can be set. It returns an unsubscribe function. Events are untyped `unknown` at the client; the React hook casts them to `CashierEvent` ([[reference/react]]).

`CashierEvent` is the union of deposit, withdraw, and transfer events.
