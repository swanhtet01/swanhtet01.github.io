# SUPERMEGA connector framework

The systematic way to add integrations. **Adding a payment processor, messaging channel, data
store, or AI provider is "write one adapter + `register()` it" — one file.** No editing handlers
across repos.

Every connector implements the same tiny interface, so the registry can list them, group them by
category, and health-check them all from a single endpoint (`GET /api/integrations`).

This framework is **additive**: the adapters *wrap* the existing `gateway.mjs` (AI) and `store.mjs`
(data) — they don't reimplement or replace them.

## The interface

```js
{
  key: 'payment-stripe',          // stable unique id
  name: 'Stripe',                 // human label
  category: 'payment',            // 'payment' | 'messaging' | 'data' | 'ai'
  configured() { return Boolean(process.env.STRIPE_SECRET_KEY) },  // creds present?
  async health() { return { ok: true, detail: 'auth ok' } },      // cheap liveness probe
  docs: 'kernel/connectors/payment-stripe.mjs',                    // optional pointer
  // ...plus any capabilities (createCheckout, verifyWebhook, send, ...) callers can use
}
```

The registry validates this shape at `register()` time, so a malformed adapter fails loudly on
load — not in production.

## How to add a connector

1. Create `connectors/<key>.mjs`.
2. Implement the interface above (`configured()` reads env; `health()` is a cheap probe — never a
   call that costs money or mutates data).
3. Call `register(theConnector)` at module load.
4. Add one `import './<key>.mjs'` line to `connectors/index.mjs`.

That's the whole wiring. The connector now appears in `list()`, `byCategory()`, and the
`/api/integrations` health page automatically.

```js
// connectors/messaging-viber.mjs  (example of a brand-new one)
import { register } from './registry.mjs'

const configured = () => Boolean(process.env.VIBER_BOT_TOKEN)
export const messagingViber = {
  key: 'messaging-viber',
  name: 'Viber',
  category: 'messaging',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing VIBER_BOT_TOKEN' }
    // ...cheap probe against the Viber API...
    return { ok: true, detail: 'ok' }
  },
  async send({ to, text }) { /* ... */ },
}
register(messagingViber)
export default messagingViber
```

Then add `import './messaging-viber.mjs'` to `index.mjs`. Done.

## The four categories

| Category | What goes here |
|---|---|
| `payment` | Stripe, MMQR/KBZPay, AYA Pay, PayPal, ... |
| `messaging` | Viber, LINE, Telegram, email/SMS senders, ... |
| `data` | Supabase spine, Postgres, KV, external warehouses, ... |
| `ai` | The Claude gateway, embeddings, OCR/vision providers, ... |

## Registered connectors (v0)

| key | category | wraps / implements | configured when | health |
|---|---|---|---|---|
| `ai-gateway` | ai | `kernel/gateway.mjs` | `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY`) set | configured() (no spend) |
| `data-supabase` | data | `kernel/store.mjs` | `store.mode === 'supabase'` | trivial 1-row read |
| `data-sheets` | data | **new** Google Sheets (REST, no SDK) | a Google service-account cred env present | mint Sheets-scope token |
| `data-gmail` | data | **new** Gmail (REST, no SDK) | a Google service-account cred env present | mint Gmail-scope token (needs subject mailbox) |
| `data-calendar` | data | **new** Google Calendar (REST, no SDK) | a Google service-account cred env present | mint Calendar-scope token |
| `payment-stripe` | payment | **new** (REST, no SDK) | `STRIPE_SECRET_KEY` set | `GET /v1/balance` auth check |
| `payment-mmqr` | payment | `spa-desk-pilot/src/lib/mmqr.ts` | always (no creds) | reports impl location |

`payment-stripe` also exposes `createCheckout({ amount, currency, ref })`, an idempotent
`verifyWebhook(rawBody, sig)`, and `reconcile(event)`. The webhook→reconcile path is now **wired**:
on `checkout.session.completed` (or `async_payment_succeeded`) with `payment_status === 'paid'`, it
marks the referenced `supermega_console_projects.deposit_status = 'paid'` (`deposit_method = 'stripe'`)
and appends a `kind:'deposit'` activity row via `store.mjs`. It is idempotent (per-event guard) and
best-effort (store errors are swallowed so the webhook still 200s). `verifyWebhook` fires the
reconcile as a non-blocking side-effect to keep its synchronous signature; callers that need to
await settlement can call `reconcile(event)` directly on the returned event.

## Google Workspace connectors (`data-sheets`, `data-gmail`, `data-calendar`)

All three share one zero-dependency auth helper, `connectors/_google-auth.mjs`: it RS256-signs a JWT
with the service-account private key (`node:crypto`), exchanges it for an OAuth2 access token, and
caches the token until just before expiry. No `googleapis` SDK.

**Credentials (one of):**

| env | meaning |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the full service-account JSON as a string — **or** base64 of it (handy for single-line env vars) |
| `GOOGLE_APPLICATION_CREDENTIALS` | filesystem path to that JSON file (read lazily, only if the inline env is absent) |

**Optional:**

| env | used by | meaning |
|---|---|---|
| `GOOGLE_WORKSPACE_SUBJECT` | gmail (required for live send/search), calendar (optional) | a real mailbox to impersonate via **domain-wide delegation** (e.g. `ops@supermega.dev`). The service account must have domain-wide delegation granted for the relevant scopes in the Workspace admin console. |
| `GOOGLE_CALENDAR_ID` | calendar | default calendar id (defaults to `primary`) |

**Scopes requested** (grant these in the Workspace admin when enabling domain-wide delegation):
`https://www.googleapis.com/auth/spreadsheets` (sheets),
`https://www.googleapis.com/auth/gmail.send` + `.../gmail.readonly` (gmail),
`https://www.googleapis.com/auth/calendar.events` (calendar).

**Capabilities:**
- `data-sheets`: `readRange(spreadsheetId, range)`, `appendRow(spreadsheetId, range, values)`.
  The service account must be able to see the sheet — share the spreadsheet with its `client_email`.
- `data-gmail`: `send({ to, subject, text })`, `search(query, { maxResults })`. Acts on the
  `GOOGLE_WORKSPACE_SUBJECT` mailbox (Gmail cannot send "as" a bare service account).
- `data-calendar`: `createEvent({ summary, start, end, attendees })`, `listEvents()`. Either share a
  calendar with the service account or use `GOOGLE_WORKSPACE_SUBJECT` to act on a user's `primary`.

Health is a **cheap token mint** (proves creds parse + Google accepts the JWT) — it does not read or
mutate any spreadsheet/mailbox/calendar. `data-gmail.health()` reports "no subject mailbox" when
`GOOGLE_WORKSPACE_SUBJECT` is unset, since send/search can't work without one.

## The endpoint

`GET /api/integrations` (passcode-gated with `x-ops-key`, like every other kernel endpoint)
returns `registry.healthAll()`:

```json
{
  "ok": true,
  "mode": "memory",
  "counts": { "total": 4, "configured": 2, "healthy": 2 },
  "byCategory": {
    "payment":   { "total": 2, "configured": 1, "healthy": 1 },
    "messaging": { "total": 0, "configured": 0, "healthy": 0 },
    "data":      { "total": 1, "configured": 0, "healthy": 0 },
    "ai":        { "total": 1, "configured": 1, "healthy": 1 }
  },
  "connectors": [
    { "key": "ai-gateway", "name": "Claude (AI gateway)", "category": "ai", "configured": true, "ok": true, "detail": "configured (tiers: bulk/reason/deep)", "docs": "kernel/gateway.mjs" },
    { "key": "payment-mmqr", "name": "MMQR (KBZPay / AYA / CB — EMVCo)", "category": "payment", "configured": true, "ok": true, "detail": "implemented in DeskPOS ...", "docs": "spa-desk-pilot/src/lib/mmqr.ts" }
    // ...
  ]
}
```

`ok` is `true` when **every *configured* connector is healthy** — unconfigured ones are expected
(not yet wired) and don't fail the page. Each health probe is isolated and time-capped (4s), so one
dead integration can't break the console.
