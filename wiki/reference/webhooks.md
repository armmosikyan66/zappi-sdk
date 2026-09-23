---
type: reference
tags: [sdk, webhook, quote]
updated: 2026-09-22
---

# Webhooks and quote tokens

Both use HMAC-SHA256 and a caller-supplied secret. Nest does not see the BFF quote secret.

## Inbound webhooks

```ts
const ok = verifyZappiWebhook(rawBody, signature, timestamp, secret, 300_000)
if (!ok) throw new Error('invalid signature')
const envelope = parseWebhookEnvelope(rawBody)
```

`verifyZappiWebhook` checks `X-Zappi-Signature` (hex) and `X-Zappi-Timestamp` (unix ms). The signed string is `` `${timestamp}.${rawBody}` ``. Pass the **raw** body. Do not re-serialize JSON. Default tolerance is `DEFAULT_WEBHOOK_TOLERANCE_MS` (5 minutes). It returns false when the signature or timestamp is missing, the signature is not hex, the timestamp is not a finite integer, the skew is too large, or the constant-time compare fails. `signBody({ rawBody, secret, timestamp? })` mints the same pair.

`parseWebhookEnvelope` requires `event`, `timestamp`, and `data.id`. It throws `WebhookParseError` (`INVALID_JSON`, `INVALID_FLASHNET_WEBHOOK_PAYLOAD`, `INVALID_FLASHNET_WEBHOOK_TIMESTAMP`). Verify first. `envelopeFromHistoryOrder` rebuilds an envelope from a stored order. `isLedgerCredited` narrows a ledger-credited event. Default project id when the body omits one is `'native'`.

The verify comment names the partner secret `FLASHNET_WEBHOOK_SECRET`.

## Withdraw quote tokens

Stateless BFF tokens. Format: `v1.<base64url(payload)>.<base64url(hmac)>`. TTL is `WITHDRAW_QUOTE_TTL_MS` (2 minutes). `QUOTE_TOKEN_VERSION` is `v1`.

- `mintWithdrawQuoteToken(secret, payload)` — payload includes `userId`, combo, address, amounts, fees, `expiresAt`.
- `readWithdrawQuoteToken(secret, token)` — null on tamper or bad shape. Does **not** check expiry.
- `isWithdrawQuoteExpired(expiresAt, now?)`.
- `verifyWithdrawQuote(secret, token, now?)` — signature and expiry. Null if either fails. Prefer this so expiry is not skipped.
- `quoteFromPayload(quoteId, payload)` → `WithdrawalQuote`.
- `quoteExpiresAt(now?)` — ISO time one TTL ahead.

Confirm must check `payload.userId` against the session user. A valid signature for another user is still the wrong quote.
