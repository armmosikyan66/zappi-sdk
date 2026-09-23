---
type: reference
tags: [sdk, auth]
updated: 2026-09-22
---

# Auth

`ZappiAuth` has three kinds. Headers are built in `ZappiClient.buildHeaders`.

| Kind | Where | Headers |
| --- | --- | --- |
| `projectKey` | Partner or server process. `apiUrl` is nest. | `Authorization: Bearer <projectApiKey>`. Empty key → 503 `GATEWAY_NOT_CONFIGURED`. |
| `session` | Server BFF acting for a logged-in user. | Bearer project key, plus optional `x-zappi-access-token`, `Cookie`, `User-Agent`, `Origin`, `X-Forwarded-Host`, `X-Forwarded-Proto`. |
| `bff` | Browser, pointed at your app. | No API key. `credentials: 'include'` so the session cookie is sent. `apiUrl` is the BFF (`''` means relative URLs). |

`projectKey` and `session` throw if `window.document` exists:

> auth kind '…' carries the project API key and must only be used server-side. In the browser, construct the client with `auth: { kind: 'bff' }`.

`bff` skips that check. The guard runs on every `call` and on `subscribeCashierEvents`.

Passkey step-up is separate: methods that take `authorizationToken` set `X-Zappi-Authorization`. That token is not the project key and not the pot seed.

Per-call `auth` on `request()` overrides the client default for that request only.

The buyer CLI’s session builder passes an empty `projectApiKey` when only `ZAPPI_ACCESS_TOKEN` is set. This SDK’s `session` kind still sends `Authorization: Bearer` with whatever string you put in `projectApiKey`. Give the BFF a real project key on session auth.
