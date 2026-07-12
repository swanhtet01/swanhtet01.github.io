# SuperMega Kernel

The cloud control plane for SuperMega operator products. See [../PLATFORM.md](../PLATFORM.md) for the
broader system boundaries.

## Runtime

| Area | Purpose | Current state |
|---|---|---|
| `gateway.mjs` | Model tiers, failover, cost caps, injection stripping, structured output | live |
| `store.mjs` | Supabase/Postgres/memory spine for clients, pipeline, usage, activity, idempotency | live |
| `connectors/` | Fixed-host provider adapters with health and resilience contracts | 69 live |
| `tools.mjs` + `api/operator.mjs` | Bounded read tools and grounded operations agent | live |
| `workcells.mjs` + `workcell-run.mjs` | Cash Close, Pipeline Control, and Owner Command products | live |
| `crews/` + `crew-run.mjs` | Contract-enforced, draft-only multi-role tasks | 5 live |
| `public/` + `api/` | Ops console, status, workcell activation, and scheduled delivery | live |

## Gateway

```js
import { complete } from './gateway.mjs'

const { data } = await complete({
  tier: 'reason',
  clientId: 'client_123',
  system: 'Use only the supplied evidence.',
  messages: [{ role: 'user', content: 'Summarize the owner metrics.' }],
  schema: {
    title: 'OwnerMetrics',
    type: 'object',
    required: ['headline'],
    properties: { headline: { type: 'string' } },
  },
})
```

Tiers are `bulk`, `reason`, and `deep`. The client id activates server-side plan resolution,
cost-weighted monthly usage, and the persistent response cache.

## Workcells

Workcells are the unit of recurring client value above connectors. Their tool plan is declared in
code; the model cannot add tools. Provider records are reduced before synthesis, raw rows are not
returned by the API, and scheduled owner delivery uses an atomic daily activity claim.

See [workcells/README.md](workcells/README.md) for the product matrix, isolated deployment model,
environment contract, and activation proof.

## Core Environment

- `ANTHROPIC_API_KEY` or another configured gateway provider.
- `SUPERMEGA_OPS_KEY` for protected APIs and the console.
- `CRON_SECRET` for Vercel cron authentication.
- `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`, or a supported Postgres URL.
- `SUPERMEGA_CLIENT_TOKEN_CAP` for the monthly client ceiling; default 2,000,000 weighted tokens.
- `SUPERMEGA_CLIENT_CAP_SOFT_RATIO` for pre-cap tier downgrade; default `0.8`.

## Honest Limits

- Client connector secrets are isolated per Vercel project, not stored in a shared multi-tenant vault.
- Workcells read and draft only. Customer sends, record changes, refunds, and payments require a
  separate approval and idempotency layer.
- The token cap can modestly overshoot under highly concurrent calls because storage updates are not
  a database-side atomic increment in every store mode.
- The default cron is one daily UTC schedule. Each isolated client deployment sets its own UTC time.

## Next

1. Automate isolated client-project provisioning and environment setup.
2. Add an approval inbox before any write-capable connector action.
3. Move from one cron per client deployment to a durable scheduler when a shared control plane is
   justified by real client volume.
