# SUPERMEGA kernel

The smallest real spine the machine stands on. See [../PLATFORM.md](../PLATFORM.md) for the why and the build order.

## What's here

| File | What it is | Status |
|---|---|---|
| `gateway.mjs` | The AI gateway — one interface in front of every Claude call (tiers, retry, fallback, cost caps, injection-stripping, forced structured output). | **built (v0)** |
| `schema.sql` | The data spine — Lead → Client → Project → Build → OperatorRun + graduation tracker. Apply in Supabase. | **built (v0)** |
| `console/` | Login-gated internal app: leads inbox, run-a-deal, project pipeline. | to build |

## Using the gateway

```js
import { complete } from './gateway.mjs'

// plain text
const { text } = await complete({
  tier: 'reason',
  system: 'You scope software builds for Myanmar SMBs.',
  messages: [{ role: 'user', content: 'Shop owner: I lose track of which dealer paid. What do we build first?' }],
})

// validated structured output (forced tool-use — never JSON-from-text)
const { data } = await complete({
  tier: 'bulk',
  clientId: 'client_123',                 // enables per-client cost caps + logging
  system: 'Score this lead 0-100 for ICP fit and return the shape.',
  messages: [{ role: 'user', content: leadText }],
  schema: {
    title: 'LeadScore',
    type: 'object',
    required: ['score', 'reason'],
    properties: { score: { type: 'integer' }, reason: { type: 'string' } },
  },
})
```

**Tiers:** `bulk` (Haiku — classification/extraction), `reason` (Sonnet — scoping/drafting, the default), `deep` (Opus — hard build reasoning). On overload it backs off and drops a tier.

## Env
- `ANTHROPIC_API_KEY` (required) — already set on the `supermega-machine` project.
- `SUPERMEGA_CLIENT_TOKEN_CAP` (optional) — per-client token ceiling, default 2,000,000.

## Known limits (v0, honest)
- The response cache and per-client token ledger are **in-memory per warm instance** — they reset on cold start and don't share across instances. Back them with Supabase/KV before relying on the caps at scale. (Same caveat the Deal Desk hit with its rate-limiter.)
- No streaming yet — add when the console needs it.

## Next
1. Refactor `supermega-machine/api/deal.js` to call `complete()` instead of the Anthropic SDK directly — proves the gateway on live code.
2. Apply `schema.sql` to a Supabase project; wire `/contact/` submissions into `lead`.
3. Build `console/` v0 (leads inbox → run-a-deal → pipeline).
