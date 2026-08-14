# Durable workflows comparison: Vercel Workflows vs. Cloud Tasks

Updated: 2026-08-11
Portfolio gate: `durable-workflows` — evaluate
Status: evaluation
Reference: https://vercel.com/docs/workflows
Mode: local evidence only; no hosted or production claim

## Gate statement

Compare Vercel Workflows with the existing Cloud Tasks runtime using one approval-wait use case. Source: `hq/portfolio.json` → `researchGates`.

---

## 1. The approval-wait use case

The reference workflow is: an AI agent in the Shop `ai-assistance` capability reads an approved set of recent order-history records and proposes a draft purchase order. The draft lands in an operator inbox. The operator (a named, authenticated Shop user) reviews, amends, and approves or discards the draft. Only after explicit approval does the system proceed to create the real order in the Shop record.

The wait is unbounded from the workflow's perspective. In practice it ranges from minutes to hours; overnight waits are plausible when the operator is off-shift. During the wait, nothing else should run on behalf of the same tenant: the portfolio rule is one active assignment, one specialist, one cycle. The workflow must hold its state durably, release compute to zero, and resume exactly once on approval — not on timeout, not on retry noise.

Failure modes that must not happen:

- The draft is created but the approval never arrives; the system must not auto-proceed.
- The operator approves but the resume call is lost; the system must not create a duplicate order.
- The approval arrives from a different tenant or an unauthenticated caller; the system must reject it.
- The wait exceeds a compute timeout and the draft state is lost; the system must not silently discard.

This is the canonical human-in-the-loop gate described in the `ai-assistance` shared capability: "Choose approved input → Review source-backed draft → Approve or discard."

---

## 2. Current approach: kernel queue + bounded scheduler

### How the existing system works

The kernel runs on a bounded demand-driven scheduler. `kernel/crew-runner.mjs` validates and loads crew definitions. `kernel/gateway.mjs` routes every model call through a single interface with per-tenant token ledger, budget reservation, and company-wide daily ceiling. The gateway's `REQUIRE_DURABLE_SPEND` flag forces a durable Supabase-backed spend record before any hosted model call proceeds.

The queue is PostgreSQL-backed. One lease blocks duplicate cycles. The `completionMustBeDurableBeforeNotification` contract means the system never sends a notification before the completion row is committed. Active assignment limit is 1; batch job limit is 1; max agents per cycle is 1.

For the approval-wait use case, the current approach would work as follows:

1. A crew run writes the draft record and emits a `draft_pending_approval` row to the PostgreSQL queue.
2. The scheduler cycle completes. The lease releases. Compute scales to zero.
3. A polling loop or a cron-triggered kernel cycle re-acquires the lease, checks the approval table for a row matching the draft ID and tenant, and either proceeds or does nothing.
4. When the operator approves, an API route writes an approval row. The next scheduler cycle finds it and runs the order-creation crew.

### Weaknesses in this pattern

- **Polling latency.** The scheduler runs on a bounded cron cadence. Approval response is delayed by the next cron tick, not by the approval event itself. At one cron per hour, the operator's approval sits idle for up to 59 minutes.
- **State held as a database row, not as a suspended workflow.** The draft ID, the pending-approval status, and the tenant context must all be re-read, re-validated, and re-assembled every poll cycle. There is no native "resume from step N" primitive.
- **Timeout ambiguity.** If the draft expires before approval arrives, the system needs explicit expiry logic. That logic must be tested against race conditions (approval and expiry arriving simultaneously).
- **No built-in suspend/resume.** The kernel's lease mechanism is a concurrency guard, not a workflow checkpoint. Recovering from a crash between polling cycles requires checking the database for the pending state and re-constructing execution context.

### What works

The existing approach is safe. It is fail-closed by design. The durable spend requirement means no model call runs without a committed reservation. Owner-gated consequential actions enforce that no order is created without an approval row. The single-assignment rule prevents parallel conflicting runs.

---

## 3. Vercel Workflows approach

### What Vercel Workflows provides

Vercel Workflows (https://vercel.com/docs/workflows) offers durable, resumable execution as a first-class serverless primitive. A workflow step can call `workflow.waitForEvent()` (or equivalent suspend primitive), which:

1. Persists the entire call stack and local state at the point of suspension.
2. Releases the serverless function and the associated compute cost.
3. Resumes exactly at the suspension point when an external HTTP callback delivers the matching event, identified by a workflow run ID.

For the approval-wait use case, this maps naturally:

1. The workflow run starts: reads approved records, constructs the draft, writes it to the database, and calls `suspend("awaiting-operator-approval", { draftId, tenantId })`.
2. The serverless instance terminates. Compute is zero.
3. The operator approves in the Shop UI. The UI calls a Vercel route that delivers the event to the workflow by run ID.
4. The workflow resumes exactly where it suspended. It reads the approval evidence, validates tenant/identity, and creates the order.

### Strengths for this scenario

- **Event-driven resume.** Approval triggers immediate resume, not the next cron tick. Latency is HTTP round-trip, not scheduler cadence.
- **Durable state.** Vercel persists workflow state between suspend and resume. No manual re-assembly of context from database rows.
- **Exactly-once semantics (with idempotency key).** The workflow run ID is the idempotency anchor. A duplicate callback for the same run ID is a no-op.
- **Compute released during wait.** No idle process holds the suspension; Vercel handles it.
- **Observability.** Vercel's agent run trace API (`get_agent_run_trace`) can expose step-level timing and status, feeding the OpenTelemetry gate that is already `adopt-with-managed-mode` in the portfolio.

### Weaknesses and open questions

- **Managed mode dependency.** Vercel Workflows requires a Vercel-hosted deployment. The current system is `isolated_demo`; managed persistence, tenant security, and hosted scheduling are all unproven. Workflows cannot be evaluated on a local dev server.
- **Callback URL exposure.** The workflow resume callback is an HTTPS endpoint that accepts a run ID. That endpoint must validate the caller's tenant identity and Supabase RLS boundary before acting. Without that validation, any caller who knows the run ID can resume an arbitrary workflow. The current kernel already enforces `ceoClientIdentityRequiredBeforeClaims`; the same guard must wrap every workflow callback.
- **Vercel Workflows pricing.** Durable state has a cost beyond serverless function execution time. The existing gateway's `REQUIRE_DURABLE_SPEND` contract already accounts for model costs; Vercel's workflow-state fees are a separate line item that must fit inside the daily budget contract (`companyAiBudgetWindow: utc_day`).
- **Single active assignment.** The portfolio enforces one active assignment per company cycle. Vercel Workflows does not enforce this internally. The application layer must still gate workflow starts behind the lease check, same as today.
- **Framework lock-in.** Vercel Workflows is tied to the Vercel platform and its Next.js or serverless function runtime. The current kernel is `kernel/crew-runner.mjs` — a plain Node.js module. Adopting workflows means either wrapping the existing crew API in a Vercel function entry point or rewriting the execution model.

---

## 4. Cloud Tasks approach

### What Cloud Tasks provides

Google Cloud Tasks queues an HTTP request for future delivery with configurable delay, retry policy, rate limits, and optional OIDC authentication. It does not hold workflow state; it dispatches tasks.

For the approval-wait use case, Cloud Tasks would be used as follows:

1. The initial crew run writes the draft and enqueues a "check approval" task with a delay matching the expected earliest approval.
2. The Cloud Tasks HTTP handler fires on schedule, checks the approval table, and either proceeds or re-enqueues with a new delay.
3. When approval is found, the handler runs the order-creation crew.

The existing kernel already has a Cloud Tasks compatibility shim (noted as a "read-only compatibility shim" after the GCP scheduler entry point was retired; `agent-operations-security-2026-07-26.md` item 12). The GCP Scheduler path is retired; Cloud Tasks dispatch remains a possible pattern.

### Strengths

- **No persistent process.** Cloud Tasks, like Vercel Workflows, releases compute between task deliveries.
- **Retry policy.** Built-in exponential backoff with configurable max attempts.
- **OIDC authentication.** Tasks can carry a service account token; the handler validates the token, enforcing that only Cloud Tasks itself can trigger the handler.
- **No framework dependency.** The handler is any HTTPS endpoint. The existing kernel's FastAPI surface can serve as the handler without restructuring.

### Weaknesses for this scenario

- **Still polling.** Cloud Tasks is a delayed delivery queue, not a suspend/resume primitive. The handler must poll the approval table, not react to the approval event. Latency is the enqueued delay, not the event itself. Setting a very short delay (e.g., 30 seconds) approximates event-driven response but burns invocations.
- **State re-assembly required.** Every task delivery must read the full draft context from the database. There is no durable call stack.
- **GCP dependency.** The GCP Scheduler entry point is retired. Cloud Tasks is a separate GCP service but still requires GCP credentials, project, queue configuration, and region. These are not provisioned and carry the same "no provider state was changed" constraint that blocked the old GCP path.
- **Race conditions.** Approval and the Cloud Tasks handler firing can race. The handler must be idempotent and must validate approval before creating the order.
- **Timeout window.** Cloud Tasks has a maximum task TTL (default 30 days for standard queues). An approval wait beyond that limit would silently drop the task.
- **No net benefit over existing queue.** The existing PostgreSQL queue plus cron poller is functionally equivalent to Cloud Tasks plus delayed delivery, with fewer external dependencies. The portfolio already rejected adding a second queue (`second-queue-or-crm`: `reject`).

---

## 5. Comparison matrix

| Dimension | Kernel queue + cron (current) | Vercel Workflows | Cloud Tasks |
|---|---|---|---|
| **Resume latency** | Cron cadence (minutes to hours) | HTTP round-trip on approval event | Configured delay (approximation) |
| **Durable state** | Database rows, manual re-assembly | Native call-stack persistence | Database rows, manual re-assembly |
| **Compute during wait** | Zero (scale-to-zero) | Zero (suspended) | Zero (between deliveries) |
| **Exactly-once** | Application-level idempotency required | Run ID idempotency + application check | Application-level idempotency required |
| **Operator experience** | Approval reflected at next cron tick | Approval reflected within seconds | Approval reflected at next delay tick |
| **Recovery after crash** | Re-read pending rows from DB | Vercel resumes from checkpoint | Re-read pending rows from DB; risk of silent drop at TTL |
| **Tenant isolation** | PostgreSQL RLS + lease | Requires explicit callback validation | OIDC token + application-level tenant check |
| **External dependencies** | Supabase (existing) | Vercel managed deployment (not yet proven) | GCP project + queue + credentials (not provisioned) |
| **Budget model** | Daily token ceiling via `gateway.mjs` | Model cost + workflow state cost | Model cost + Cloud Tasks invocation cost |
| **Complexity** | Low (existing codebase) | Medium (new primitive, framework touch) | Medium (new GCP infra, same polling pattern) |
| **Framework lock-in** | None | Vercel platform | GCP platform |
| **Portfolio compatibility** | Full (existing) | Conditional (requires managed mode proof) | Low (GCP path retired; second-queue rejected) |

---

## 6. SuperMega-specific constraints

Every approach must satisfy these non-negotiable operating rules before adoption:

**One active assignment.** The portfolio enforces `activeAssignmentLimit: 1` and `maxConcurrentCompanyCycles: 1`. No workflow primitive overrides this. The atomic lease in the existing kernel — acquired durably before any model work — must precede any workflow start. Vercel Workflows and Cloud Tasks must both gate behind this same check.

**Budget gating.** `gateway.mjs` reserves cost-weighted tokens before every provider network call. `REQUIRE_DURABLE_SPEND` is `true` in production. Any new workflow path must call `estimateCallBudgetUnits()` and commit a reservation before the model call, not after. Workflow state costs count separately; they must not be hidden from the daily budget window.

**RLS tenant isolation.** The Supabase schema enforces row-level security. Every resume callback, task handler, and polling route must authenticate as the correct tenant before reading or writing any row. A Vercel Workflows callback URL must carry a signed, tenant-scoped token — not just the workflow run ID. The `ceoClientIdentityRequiredBeforeClaims` rule applies equally here.

**No external sends without owner approval.** The order-creation step is a consequential write. It must not run on timeout, on system retry, or on an unauthenticated callback. `completionMustBeDurableBeforeNotification` and `explicitOwnerOutcomeAcceptance` both apply. Approval must be an immutable record in the database before the workflow proceeds.

**Scale-to-zero.** `scaleToZero: true` and `idleCapabilitiesConsumeCompute: false`. The waiting state must consume no running process.

**Managed mode not yet proven.** `NOW.md` states: "Live managed persistence ready: false", "Live security ready: false", "Hosted scheduling has no signed bundle, credentials, worker URL, or allowlist and stays blocked until managed storage, security, recovery, and owner evidence pass." No workflow primitive that requires hosted activation can be adopted before these blockers clear.

---

## 7. Decision

**Retain the existing kernel queue pattern as the current implementation. Treat Vercel Workflows as the intended target architecture, conditional on managed mode proof.**

The reasoning:

The existing PostgreSQL-backed queue with cron polling is safe, audited, and fully within the current boundary. Its weakness — polling latency — is real but not currently material: there are no live operators waiting for approval responses. The approval-wait use case is gated R&D (`ai-assistance` status: `gated-r-and-d`), and the next gate requires a named pilot operator on an isolated managed tenant before any interactive capability is exposed. Until that gate clears, sub-second approval resume is not a real user-facing requirement.

Vercel Workflows is the architecturally correct answer for the approval-wait pattern. Its suspend/resume primitive eliminates polling latency and removes the state re-assembly burden that makes the current polling approach fragile at scale. The per-run observability also feeds the OpenTelemetry gate that is already `adopt-with-managed-mode`. However, Vercel Workflows requires:

1. A Vercel-hosted deployment with managed persistence proven.
2. Supabase RLS, Storage privacy, tenant isolation, and hosted restore proven on an approved isolated tenant.
3. A signed activation bundle for the hosted scheduler (same prerequisite as the cron path).
4. A callback authentication design that satisfies the tenant boundary requirement.
5. Workflow-state costs confirmed to fit inside the daily budget contract.

None of these are currently satisfied. Adopting Workflows now would add a new external dependency and a new billing surface on top of an unproven hosted foundation. That is the wrong sequencing.

Cloud Tasks is rejected for this use case. It is functionally equivalent to the existing queue (polling pattern, manual state re-assembly) but adds GCP infrastructure that is not provisioned and was explicitly retired as a scheduler path. The portfolio's `second-queue-or-crm` gate is `reject`; Cloud Tasks as a second queue without demonstrated gap in the existing relational system does not pass that gate.

---

## 8. Adoption conditions

### To adopt Vercel Workflows

All of the following must be true before any workflow primitive is introduced:

1. **Managed persistence proven.** An approved isolated Supabase tenant with RLS, Storage privacy, Security Advisor clean pass, and durable command table has completed the six-request owner-verified storage proof (`supermega.private-storage-privacy.v1`).
2. **Hosted scheduler activated.** A signed HMAC bundle (`supermega.scheduler-activation-evidence.v1`) has been issued for the canonical `megaos` project with the correct deployed commit, managed tenant binding, and owner decision.
3. **Budget gate implemented for workflow state.** The daily AI budget contract (`supermega.company-ai-budget.v1`) is extended to account for Vercel Workflows state storage costs alongside model costs. The `hostedAiBudgetRequiresDurableStore: true` constraint applies to the combined daily ceiling.
4. **Callback authentication designed and tested.** Every workflow resume endpoint validates: (a) a signed, short-lived, tenant-scoped token issued at draft creation time, (b) that the run ID matches the token, and (c) that the approval row in the database is immutable and matches the tenant. Unauthenticated or cross-tenant callbacks fail closed with no state change.
5. **Single-assignment lease checked before workflow start.** The existing atomic durable capacity claim runs before `workflow.start()`. A second cycle attempt while a workflow is suspended is rejected by the lease, not by Vercel.
6. **Exactly-once order creation.** The order-creation step is wrapped in a database transaction with an idempotency key derived from the workflow run ID. A duplicate resume event (network retry, operator double-submit) produces no second order row.
7. **Observability wired.** Vercel Agent Run trace IDs are correlated with the OpenTelemetry span for the corresponding crew run and Supabase command row. This satisfies the `opentelemetry` gate (`adopt-with-managed-mode`).

### To reconsider Cloud Tasks

Cloud Tasks would be reconsidered only if:

1. The existing PostgreSQL queue and the crew scheduler demonstrate a documented, measured failure to meet a specific latency or throughput requirement that the managed Supabase queue cannot address.
2. The GCP project, credentials, and queue are provisioned through the same owner-approval and proof chain required of every other external write authority.
3. The `second-queue-or-crm` gate is revisited with evidence that the relational system is insufficient for the documented requirement.

Given the current operating model (one active assignment, one cycle, one specialist, bounded daily budget, no live operators), neither condition is likely to arise before the managed mode proof clears — at which point Vercel Workflows is already the preferred path.

---

## References

- Portfolio gate: `hq/portfolio.json` → `researchGates` → `durable-workflows`
- Kernel loader: `kernel/crew-runner.mjs`
- Gateway and budget: `kernel/gateway.mjs`
- Operating constraints: `hq/NOW.md`
- Enterprise roadmap: `hq/research/enterprise-product-roadmap-2026-07-28.md`
- Agent operations and security: `hq/research/agent-operations-security-2026-07-26.md`
- Vercel Workflows documentation: https://vercel.com/docs/workflows
- Portfolio operating model: `agentOperatingModel` in `hq/portfolio.json`
