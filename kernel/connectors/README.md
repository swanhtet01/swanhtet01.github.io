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
| `payment-stripe` | payment | **new** (REST, no SDK) | `STRIPE_SECRET_KEY` set | `GET /v1/balance` auth check |
| `payment-mmqr` | payment | `spa-desk-pilot/src/lib/mmqr.ts` | always (no creds) | reports impl location |

`payment-stripe` also exposes `createCheckout({ amount, currency, ref })` and an idempotent
`verifyWebhook(rawBody, sig)`. The webhook→reconcile path (mark a project's deposit paid) is a
documented **TODO stub** until reviewed.

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
