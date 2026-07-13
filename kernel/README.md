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
| `agent-company-operations.mjs` | Immutable outcome review and metadata-only operating targets | live |
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

`POST /api/agent-company` is the protected manager layer over twelve validated crews. Callers must
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

For durable delegation, delivery proof, and operating evidence, the same endpoint accepts eight
additional explicit actions:

- `work-order-create` validates and stores the exact cycle plan without a model call.
- `work-order-list` returns up to 40 client-bound order summaries, filtered in the store by kind and
  client. Raw queued evidence is never returned.
- `work-order-get` returns assignments, budgets, byte counts, evidence fingerprints, and any result.
- `work-order-run` requires the saved 64-character plan hash and exact `RUN <workOrderId>`
  confirmation, then reuses `runCompanyCycle`; there is no second runner or recursive delegation.
- `work-order-proof` returns a deterministic customer delivery packet with result and packet hashes,
  bounded specialist outputs, role-call usage, evidence fingerprints, and execution controls. It never
  returns queued raw evidence.
- `work-order-review` stores one immutable accepted or changes-requested decision against the exact
  result hash. It requires the exact customer statement, source, reviewer name, recorder name, and an
  `ACCEPT ...` or `REQUEST CHANGES ...` confirmation bound to that result.
- `work-order-evaluate` accepts one immutable internal checklist verdict for a terminal result. It
  requires the saved plan hash, exact `EVALUATE <workOrderId>` confirmation, and either four passing checks for
  `accepted` or at least one failed check for `revision_required`. It accepts no notes or raw text.
- `operations-report` measures only durable client-bound work orders over a fixed 7, 30, or 90 day
  window. It returns timestamps, counts, rates, target states, evaluation metadata, and fixed-roster
  utilization, never evidence or specialist model output. Utilization covers assignments, active
  load, specialist completion, and role calls so operators can manage capacity without opening
  private evidence or generated deliverables.

The work-order id is deterministic for one client and cycle. Re-creating the same exact plan replays
the saved order, while changed evidence under the same cycle id is a conflict. Dispatch first saves
the `running` state plus the first dispatch timestamp, so storage failure blocks model spend and
latency remains measurable. A concurrent or lost-response retry hits
the cycle runner's durable claim and either returns the saved result or reports the existing run.
Queued evidence remains inside the service-role-only cache record and is replaced by fingerprints
after a terminal dispatch state.
Customer review records are explicitly `operator_recorded_customer_review` with
`customerAuthenticated: false`; they are evidence copied by the operator from email, chat, call, or
an in-person conversation, not a customer login or digital signature. A different review cannot
overwrite the first immutable record. Revised work requires a new cycle and work order.

The console's normal operating path is `plan -> queue -> explicit dispatch -> internal evaluation`;
delivery proof and operator-recorded customer review are separate follow-up controls. The old direct
`run` API remains for compatibility but is not exposed in the Company UI and is explicitly excluded
from the operations report. Internal targets cover queue p90, execution p90, completed terminal
orders, durable result storage, role-budget compliance, draft-only boundary compliance, evaluation
coverage, and accepted evaluations. Readiness stays `collecting` until each target has at least five
relevant samples. These are operator targets, not a contractual customer SLA or customer acceptance.

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
- Customer review is operator-recorded provenance, not cryptographic proof of customer identity.
- Company health covers the latest 40 durable work orders in the selected window. It excludes direct
  compatibility cycles, returns no evidence or model output, and cannot prove customer acceptance
  from an internal evaluation. Customer acceptance remains the separate operator-recorded review.

## Next

1. Dispatch one legitimate redacted work order, record its internal checklist evaluation, download
   the delivery proof, and record the customer's exact decision from an allowed source.
2. After that proof, add an opt-in durable dispatcher, bounded evidence-retention sweeper, and alerts
   over the measured target states. Do not introduce recursive delegation.
3. Generate the isolated client plan, load its client-scoped inputs, and run the exact-confirmation
   provisioner. A matching bootstrap-only Supabase database URL applies the schema automatically;
   pre-applying `supabase/workcell-client.sql` remains the fallback.
4. Complete the client-owned test ClickUp draft, approval, execution, and recovery proof.
5. Move from one cron per client deployment to a durable scheduler when real client volume justifies
   a shared control plane.
