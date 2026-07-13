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
| `owner-evidence.mjs` + `api/owner-evidence.mjs` | Reviewed LINE/Viber evidence preview, immutable storage, and bounded read | live |
| `approval-actions.mjs` + `api/approvals.mjs` | Immutable owner approval and idempotent ClickUp execution | live |
| `crews/` + `crew-run.mjs` | Contract-enforced, draft-only multi-role tasks | 8 live |
| `agent-company.mjs` + `agent-company-work-orders.mjs` | Bounded supervisor cycles and durable reviewed delegation | live |
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

Owner Command accepts two evidence paths inside the same fixed workcell: incoming messages from the
client's private Telegram bot and operator-reviewed LINE/Viber updates. Reviewed updates are
previewed first, frozen by payload hash, and inserted into an immutable service-role-only table.
The agent receives only the bounded read tool and cannot write to the inbox.

## Agent Company Cycles

`POST /api/agent-company` is the protected manager layer over the eight validated crews. Callers must
choose `action: "plan"` or `action: "run"`, a stable client and cycle id, one or two allowlisted
specialists, and separate evidence for each specialist. A plan reports the exact role-call budget
before any model call. A run atomically claims the cycle in durable storage, then executes the crews
sequentially through the existing gateway.

The supervisor is deliberately not another model. It cannot invent agents, delegate recursively,
share one specialist's output with another, or call a connector. It preserves partial results in one
traceable envelope and returns drafts only; every external side effect remains behind the separate
approval path. Reusing a claimed cycle id is blocked to prevent duplicate spend.
Completed specialist and final envelopes are also stored under the claimed run id, so an idempotent
replay can return a finished result or expose the recoverable partial results without spending again.

For durable delegation, the same endpoint accepts four additional explicit actions:

- `work-order-create` validates and stores the exact cycle plan without a model call.
- `work-order-list` returns up to 40 client-bound order summaries, filtered in the store by kind and
  client. Raw queued evidence is never returned.
- `work-order-get` returns assignments, budgets, byte counts, evidence fingerprints, and any result.
- `work-order-run` requires the saved 64-character plan hash and exact `RUN <workOrderId>`
  confirmation, then reuses `runCompanyCycle`; there is no second runner or recursive delegation.

The work-order id is deterministic for one client and cycle. Re-creating the same exact plan replays
the saved order, while changed evidence under the same cycle id is a conflict. Dispatch first saves
the `running` state, so storage failure blocks model spend. A concurrent or lost-response retry hits
the cycle runner's durable claim and either returns the saved result or reports the existing run.
Queued evidence remains inside the service-role-only cache record and is replaced by fingerprints
after a terminal dispatch state.

## Core Environment

- `ANTHROPIC_API_KEY` or another configured gateway provider.
- `SUPERMEGA_OPS_KEY` for protected APIs and the console.
- `CRON_SECRET` for Vercel cron authentication.
- `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`, or a supported Postgres URL.
- `SUPERMEGA_CLIENT_TOKEN_CAP` for the monthly client ceiling; default 150,000 weighted tokens.
- `SUPERMEGA_CLIENT_CAP_SOFT_RATIO` for pre-cap tier downgrade; default `0.8`.

## Action Approval

Pipeline Control and Owner Command can explicitly queue one ClickUp task draft. The agent never
receives a write tool. The owner reviews the exact list, task name, description, marker, and payload
fingerprint in the Approval Inbox, approves the frozen payload, and executes it in a separate step.
Execution uses a compare-and-swap lease plus a visible provider marker; an uncertain response stays
in recovery instead of being retried blindly.

## Honest Limits

- Client connector secrets are isolated per Vercel project, not stored in a shared multi-tenant vault.
- ClickUp task creation is the only approval-backed write. Customer sends, other record changes,
  refunds, and payments remain unavailable.
- The token cap can modestly overshoot under highly concurrent calls because storage updates are not
  a database-side atomic increment in every store mode.
- The default cron is one daily UTC schedule. Each isolated client deployment sets its own UTC time.
- Agent Company cycles are synchronous waves capped at two specialists and eight planned role calls.
  Failed or partial waves require a new explicit cycle id; there is no automatic retry or hidden loop.
- Planned work orders retain their bounded evidence in the protected cache until dispatch. There is
  no unattended dispatcher or retention sweeper; an owner still reviews and dispatches each order.

## Next

1. Generate the isolated client plan, load its client-scoped inputs, and run the exact-confirmation
   provisioner. A matching bootstrap-only Supabase database URL applies the schema automatically;
   pre-applying `supabase/workcell-client.sql` remains the fallback.
2. Complete the client-owned test ClickUp draft, approval, execution, and recovery proof.
3. Move from one cron per client deployment to a durable scheduler when a shared control plane is
   justified by real client volume.
