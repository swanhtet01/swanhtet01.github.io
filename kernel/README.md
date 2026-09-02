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
| `crews/` + `crew-run.mjs` | Contract-enforced, draft-only multi-role capabilities | 15 validated; idle by default |
| `agent-company.mjs` + `agent-company-work-orders.mjs` | Bounded supervisor cycles and durable reviewed delegation | live |
| `agent-company-playbooks.mjs` + `agent-company-missions.mjs` | Fixed sellable outcomes with durable server-verified stages | live |
| `agent-company-operations.mjs` | Immutable outcome review and metadata-only operating targets | live |
| `agent-company-operator-auth.mjs` + `api/agent-company-auth.mjs` | One-use tenant codes, role-scoped HttpOnly sessions, and owner revocation | live |
| `agent-company-operator.mjs` + `scripts/operate-agent-company.mjs` | Guided plan, queue, dispatch, evaluation, and proof client | operator-run |
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
cost-weighted monthly usage, and the persistent response cache. Every cache miss also reserves a
company-wide UTC-day cost bound before provider I/O. Concurrent calls and retries share the same
atomic budget; provider failures remain conservatively charged, while cache hits consume no new
reservation. Hosted runtimes fail closed when the durable reservation store is unavailable.

The response cache is not an authority store. Sign-in codes, operator sessions, missions, work
orders, customer reviews, and internal evaluations use versioned `supermega_control_records` rows
with tenant metadata plus append-only `supermega_control_transitions` evidence. Compatibility calls
route only fixed control-key prefixes to that store; matching legacy rows in `supermega_ai_cache`
are never read as authority. Apply `supabase/control-records-migration.sql` only after review. Its
rollback fixture refuses to drop non-empty authority or transition tables.

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

`POST /api/agent-company` is the protected manager layer over twelve fixed specialist identities
backed by fifteen validated crew capability contracts. Callers must
choose `action: "plan"` or `action: "run"`, a stable client and cycle id, one or two allowlisted
specialists, and separate evidence for each specialist. A plan reports the exact role-call budget
before any model call. A run atomically claims the cycle in durable storage, then executes the crews
sequentially through the existing gateway.

Crew contracts are capability definitions, not always-running employees, and consume no work while
idle. Analytics is an allowlisted Operations capability, document extraction is an allowlisted
Knowledge capability, and meeting capture is an allowlisted Project Control capability. Fixed
playbook stages can select those secondary crews; ad-hoc cycles keep each specialist's primary crew.

The supervisor is deliberately not another model. It cannot invent agents, delegate recursively,
share one specialist's output with another, or call a connector. It preserves partial results in one
traceable envelope and returns drafts only; every external side effect remains behind the separate
approval path. Reusing a claimed cycle id is blocked to prevent duplicate spend.
Completed specialist and final envelopes are also stored under the claimed run id, so an idempotent
replay can return a finished result or expose the recoverable partial results without spending again.

Browser operators use `POST /api/agent-company-auth` to exchange one owner-issued, one-use code for a
tenant-bound HttpOnly, Secure, SameSite session. The server stores only code and session-token
fingerprints, revalidates immutable tenant, role, expiry, and any customer-proof scope metadata on
every request, and enforces operator, reviewer, viewer, or customer permissions before Agent Company
actions run. Cookie-authenticated
writes also require the console's explicit same-origin request marker. The owner key remains a
separate bootstrap and CLI path and is never copied into an operator session. Owner bootstrap access
can list active sessions and unredeemed codes for one tenant and revoke either entry atomically. That
inventory returns only operator, role, status, and time metadata; it never returns a code, session
token, credential fingerprint, or plan integrity field.

`playbook-plan` maps one client mission to one of eight fixed business outcomes. Each plan names the
exact ordered specialists, crew contracts, stage cycle ids, role budgets, returned fields, and handoff
gate before any model call or durable write. `mission-create` freezes that exact plan in durable state.
Only stage one starts ready. `mission-stage-queue` binds its reviewed evidence to one existing durable
work order, and `mission-stage-advance` unlocks exactly one later stage only after the server verifies
the previous terminal result hash, work-order plan hash, accepted four-check evaluation, current
mission revision, and reviewed handoff fingerprint. Mission records retain hashes and byte counts,
never raw handoffs. Playbooks never dispatch, forward raw output, or create a second runner; every
stage remains a separately reviewed work order.
See [AGENT-COMPANY-OPERATING-GUIDE.md](AGENT-COMPANY-OPERATING-GUIDE.md) for the sellable outcome
catalog and operating sequence.

For durable delegation, delivery proof, and operating evidence, the same endpoint accepts explicit
mission and work-order actions:

- `mission-create`, `mission-list`, and `mission-get` create and inspect client-bound durable playbook
  state without queueing work or making a model call.
- `mission-stage-queue` requires an exact mission-plan confirmation, queues only the server-reported
  ready stage, and binds its evidence fingerprint to one deterministic work order.
- `mission-stage-advance` requires the exact mission, stage, work order, and result hash. It verifies
  the accepted immutable evaluation and atomically advances the mission revision. For non-final
  stages, the supplied reviewed redacted handoff is persisted only as a digest and byte count.

- `work-order-create` validates and stores the exact cycle plan without a model call.
- `work-order-list` returns up to 40 client-bound order summaries, filtered in the store by kind and
  client. Raw queued evidence is never returned.
- `work-order-get` returns assignments, budgets, byte counts, evidence fingerprints, and any result.
- `work-order-run` requires the saved 64-character plan hash and exact `RUN <workOrderId>`
  confirmation, then reuses `runCompanyCycle`; there is no second runner or recursive delegation.
- `work-order-cancel` requires the same saved plan hash plus exact
  `CANCEL AND SCRUB <workOrderId> <planHash>` confirmation. It cancels only a still-planned order and
  atomically removes its queued source evidence before any model request.
- `work-order-proof` returns a deterministic customer delivery packet with result and packet hashes,
  bounded specialist outputs, role-call usage, evidence fingerprints, and execution controls. It never
  returns queued raw evidence.
- `work-order-review` stores one immutable accepted or changes-requested decision against the exact
  result hash. Operator-recorded reviews require the exact statement, source, reviewer name, recorder
  name, and an `ACCEPT ...` or `REQUEST CHANGES ...` confirmation. A customer-review session can act
  only on its one tenant/work-order/result scope; the server sets its reviewer, recorder, source, and
  tenant-bound session provenance.
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
the `running` state plus the first dispatch timestamp through the same atomic transition used by
cancellation, so only dispatch or cancellation can win and storage failure blocks model spend.
A concurrent or lost-response retry hits
the cycle runner's durable claim and either returns the saved result or reports the existing run.
Queued evidence remains inside the service-role-only control record until an explicit dispatch or
cancel decision. Terminal dispatch and cancellation both scrub the raw input while preserving its
fingerprints.
Operator-recorded customer reviews are explicitly `operator_recorded_customer_review` with
`customerAuthenticated: false`; they are evidence copied by the operator from email, chat, call, or
an in-person conversation, not a customer login or digital signature. An owner can instead issue a
one-use `tenant_bound_customer_session` code scoped to one tenant, work order, and exact result hash.
That customer session receives only the delivered result, result hash, and decision record; it does
not receive the workspace plan, source-evidence fingerprints, or internal delivery metadata. It records
`customerAuthenticated: true` for owner-issued-code possession only, not SSO, MFA, or a legal signature. A different review cannot
overwrite the first immutable record. Revised work requires a new cycle and work order.

The console's normal operating path is `plan -> queue -> explicit dispatch -> internal evaluation`;
delivery proof and either operator-recorded or tenant-bound customer-session review are separate
follow-up controls. The old direct `run` API remains for compatibility but is not exposed in the
Company UI and is explicitly excluded from the operations report. Internal targets cover queue p90,
execution p90, completed terminal orders, durable result storage, role-budget compliance, draft-only
boundary compliance, evaluation coverage, and accepted evaluations. Readiness stays `collecting`
until each target has at least five relevant samples. These are operator targets, not a contractual
customer SLA or retained customer proof.

When a report is built with any target `missed`, a metadata-only founder Telegram alert lists the
breached target ids with measured vs target values (never customer data, evidence, or output). An
identical breach set re-pings at most every 6 hours; a changed set alerts immediately, and recovery
clears the stored state so the same ids alert again if they return. Dedupe state is a durable
compare-and-swap record; alerting is best-effort and can never affect the report response, and
without `TELEGRAM_BOT_TOKEN` + a chat id it is a silent no-op with no I/O.

### Guided Operator

The operator CLI is a thin client over the same protected API and durable queue. It does not add a
runner, scheduler, or model supervisor. Start from the redacted example and keep the real manifest
outside version control:

```powershell
npm run agent-company:operate -- --manifest C:\secure-local\work-order.json --preflight
$secureOpsKey = Read-Host 'Ops key' -AsSecureString
$opsKeyBuffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureOpsKey)
try {
  $env:SUPERMEGA_OPS_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($opsKeyBuffer)
  npm run agent-company:operate -- --manifest C:\secure-local\work-order.json
} finally {
  Remove-Item Env:SUPERMEGA_OPS_KEY -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($opsKeyBuffer)
}
```

`--preflight` is offline and keyless. It validates the redacted manifest against the same local roster,
crew definitions, role budget, and no-write controls used by the server, prints evidence byte counts
without evidence content, and computes the exact expected run ID, work-order ID, and `expectedPlanHash`
that the durable queue must return. It creates no claim and makes no network or model call. Normal
operation refuses planning or queue creation if any identity differs. It also fingerprints the exact
server plan the owner reviews and refuses dispatch if the durable queue or terminal result contains a
different plan. The default remains plan-only.
Queueing requires exact `QUEUE <runId>` confirmation, dispatch requires a separate exact
`RUN <workOrderId>` confirmation, and optional internal evaluation requires the four fixed checks plus
`EVALUATE <workOrderId>`. The command then retrieves the deterministic delivery proof. It rejects
credential-shaped manifest fields before network access, fixes the API host to `console.supermega.dev`,
accepts the Ops key only from the process environment, and has no customer review or connector-write
command. Customer decisions still belong in the console after the operator has exact evidence from an
allowed source.

## Core Environment

- `ANTHROPIC_API_KEY` or another configured gateway provider.
- On the Ally only, set `SUPERMEGA_OLLAMA_ENABLED=1` and an installed model name in
  `SUPERMEGA_OLLAMA_MODEL` to use local inference before paid providers. The gateway fixes this lane
  to `127.0.0.1:11434`, ignores it in hosted/production runtimes, makes one bounded attempt, applies
  the same company AI budget, and sends `keep_alive: 0` so the model unloads after every response.
  Never set these as Vercel production configuration.
- `SUPERMEGA_OPS_KEY` for protected APIs and the console.
- `CRON_SECRET` for Vercel cron authentication.
- `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`, or a supported Postgres URL.
- `SUPERMEGA_CLIENT_TOKEN_CAP` for the monthly client ceiling; default 150,000 weighted tokens.
- `SUPERMEGA_CLIENT_CAP_SOFT_RATIO` for pre-cap tier downgrade; default `0.8`.
- `SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS` for the global provider-attempt ceiling; default
  500,000 and compiled/database hard maximum 2,000,000 bulk-equivalent units per UTC day.

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
- The 25 invocations/day scheduler ceiling is cron arithmetic, not a counter: the dormant activation
  plan in `tools/supermega_scheduler_authority.json` is `5 * * * *` (24 firings per UTC day) plus
  `45 0 * * *` (1), and no code counts scheduler runs — the hosted cron handlers admit an
  authenticated 26th request exactly like the first. What this kernel's own cron receiver enforces,
  per workcell slug, is one execution per UTC hour and one owner delivery per client-local date
  (`WORKCELL_TIME_ZONE`): 1,440 once-a-minute deliveries over one UTC day produced 24 executions and
  1 send, the first delivery of the next UTC day was admitted again, and 2, 8, 32, and 128
  simultaneous deliveries admitted exactly 1 execution (2 when the burst straddled midnight UTC),
  measured 2026-09-02 in memory mode and pinned by `kernel/api/brief.scheduler-ceiling.test.mjs`.
  Not measured: the Python cron handlers (read, not exercised) and the live Vercel cron.
- Pool pressure queues; it never refuses or times out: postgres mode holds one `pg.Pool` of 3
  clients per process with no checkout timeout, so 2, 8, 32, and 128 simultaneous checkouts held 3,
  queued the rest (0 refused, 0 timed out), and served the queue first-in first-out, measured
  2026-09-02 through pg-pool with an in-process client and, for the store's own claim and
  reservation paths, on a loopback Postgres 16 (0 of 128 refused), pinned by
  `kernel/store.pool-pressure.test.mjs`. A queued caller waits as long as the three holders do, and
  nothing reads the queue length. Memory mode has no pool (512 simultaneous claims, 0 refused);
  supabase mode is one fetch per call, so pooling there belongs to Supabase's side. Not measured:
  the live Supabase pooler, the peak backend count on a live database, and the HTTP agent behind
  supabase mode.
- Agent Company cycles admit one specialist and at most eight planned role calls.
  Failed or partial waves require a new explicit cycle id; there is no automatic retry or hidden loop.
- Durable missions remain operator-staged. The server verifies stage eligibility, but no mission
  automatically queues or dispatches work and no stage receives raw prior output automatically.
- Planned work orders retain their bounded evidence in the protected cache until dispatch or an
  explicit cancel-and-scrub decision. There is no unattended dispatcher or retention sweeper.
- A tenant-bound customer review proves possession of an owner-issued one-use code for one exact
  result, not cryptographic identity, SSO/MFA, or a legal signature. Operator-recorded review remains
  separate copied provenance.
- Company health covers the latest 40 durable work orders in the selected window. It excludes direct
  compatibility cycles and cancelled orders from delivery metrics, returns no evidence or model
  output, and cannot prove customer acceptance from an internal evaluation. Customer acceptance
  remains the separate operator-recorded or tenant-bound customer-session review.

## Next

1. Dispatch one legitimate redacted work order, record its internal checklist evaluation, download
   the delivery proof, and retain the customer's decision from an allowed source or tenant-bound
   customer session.
2. After that proof, add operator recovery, then SSO/MFA where a tenant requires it. Owner-issued
   tenant sessions, targeted revocation, and customer-code acceptance are already live.
3. Then add an opt-in durable dispatcher and bounded evidence-retention sweeper (alerts over the
   measured target states shipped: see the operations-report section). Do not introduce recursive
   delegation.
4. Generate the isolated client plan, load its client-scoped inputs, and run the exact-confirmation
   provisioner. A matching bootstrap-only Supabase database URL applies the schema automatically;
   pre-applying `supabase/workcell-client.sql` remains the fallback.
5. Complete the client-owned test ClickUp draft, approval, execution, and recovery proof.
6. Move from one cron per client deployment to a durable scheduler when real client volume justifies
   a shared control plane.
