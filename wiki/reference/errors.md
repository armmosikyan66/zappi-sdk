---
type: reference
tags: [sdk, errors]
updated: 2026-09-22
---

# Errors

`ZappiApiError` is thrown on non-2xx and on a few client-side gateway failures. Fields: `status`, `statusText`, `body`, `code` (from `body.error` when it is a string). `errorCode(body)` is the same extractor.

Getters: `isUnauthorized` (401), `isSessionEnded` (401 and `SESSION_ENDED`), `isForbidden` (403), `isNotFound` (404), `isServerError` (≥ 500), `isInsufficientBalance` (402 or `INSUFFICIENT_BALANCE`), `isQuoteExpired` (`QUOTE_EXPIRED`).

Message preference: `body.message`, else a string body, else `"<status> <statusText>"`.

Known `ZappiErrorCode` values (the type is open: `string & {}`, so do not exhaustively switch):

`INSUFFICIENT_BALANCE`, `QUOTE_EXPIRED`, `WALLET_NOT_LINKED`, `SPARK_WALLET_NOT_CONFIGURED`, `PRODUCT_WALLET_NOT_CONFIGURED`, `SESSION_ENDED`, `GATEWAY_UNREACHABLE`, `GATEWAY_NOT_CONFIGURED`, `GATEWAY_INVALID_RESPONSE`, `DEPOSIT_RAIL_UNAVAILABLE`, `LIGHTNING_DISABLED`, `INVALID_FLASHNET_WEBHOOK_SIGNATURE`, `INVALID_FLASHNET_WEBHOOK_PAYLOAD`.

Client-synthesized codes also include `CLIENT_CLOSED` (caller abort, status 499) and `INSTRUCTION_CONFLICT` from nest on a changed standing-deposit destination ([[client/deposit]]).

`TwoPhaseWithdrawError` codes: `SIGNER_REQUIRED`, `MISSING_SEND_DETAILS` ([[flows/two-phase]]).

`WalletSignerError` codes: `MNEMONIC_REQUIRED`, `INVALID_ACCOUNT`, `INIT_FAILED`, `CLEANED_UP`, `INVALID_PARAMS`, `NO_HASH`, `TRANSFER_FAILED` ([[reference/sign]]).

`WebhookParseError` and `MissingBtcRateError` are separate classes ([[reference/webhooks]], [[reference/amounts]]).
