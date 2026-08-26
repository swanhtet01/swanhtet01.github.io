# SuperMega AI-Native Architecture and Scalability Strategy

Updated: 2026-08-26
Author: Architecture Codex
Status: proposal (founder review required for any consequential change)
Sources: hq/portfolio.json, pilot-data/agent_team_system.json, kernel/README.md,
hq/readiness/managed-pilot-readiness.json, hq/NOW.md, hq/TIMELINE.md,
hq/WORKBOARD.md, tools/create_public_vercel_output.mjs, .github/workflows/

---

## 1. Thesis: what "AI-native company" means operationally

SuperMega is not a company that uses AI tools. It is a company whose employees
are AI agents and whose management system is a verified repository. Four
operating principles, all already implemented in code rather than aspiration:

1. The repo is the company. hq/WORKBOARD.md is the assignment ledger,
   hq/TIMELINE.md is the plan, hq/NOW.md is the live state contract, and
   hq/portfolio.json is the product authority. An agent's work exists only
   when it lands as a numbered, acceptance-checked row (CEO-NNN / OPS-NNN).
   There is no second control plane (pilot-data/agent_team_system.json,
   scaling_model.rules).

2. Verification gates are management. Humans do not review agent effort;
   gates review agent output. The current serial app:verify chain, the
   owner-named managed-pilot readiness ledger, and fail-closed release verifiers
   replace status meetings. An agent that cannot pass the gate has not
   worked. Note: lint runs separately from app:verify and can fail CI alone.

3. Spend is metered like payroll. Every model call reserves against a durable
   company-wide UTC-day budget: 500,000 bulk_equivalent_tokens default,
   2,000,000 hard max (portfolio.json companyAiBudget). Idle capabilities
   consume nothing (scaleToZero: true). Cache hits reserve no budget;
   provider failures stay charged. This is the company's cost of labor.

4. Consequential authority stays human. consequentialAuthority: "founder"
   (portfolio.json). No agent deploys, sends, pays, publishes, or writes
   production data. Agents propose; gates verify; the founder decides. The
   current release wave is owner-named: GitHub main protection, review-branch
   publication, preview rehearsal, production release, customer contact,
   payment/stock actions, credential changes, and managed activation each need
   separate owner approval.

The scalability claim follows: because employees are contracts (not
processes), headcount scales by registering role definitions, not by hiring;
because output is ledger rows, coordination scales by append, not by meetings;
because spend is a durable atomic reservation, cost scales linearly and
observably with accepted outcomes ("accepted outcomes per 1,000 work units",
OPS-028).

---

## 2. Internal systems: the agent-as-employee operating model

### 2.1 Roles and org shape (as registered today)

Authority: hq/portfolio.json agentOperatingModel + pilot-data/agent_team_system.json.

- 12 registered specialist roles maximum (registeredRoleLimit: 12), grouped
  into four build teams: product, engineering, growth, finance-risk.
- 1 active assignment, 1 batch job, 1 agent per cycle, 1 concurrent company
  cycle. Roster is dormant-by-default; unloaded roles consume zero compute.
- 15 validated crew capabilities back the 12 identities (kernel/crews/,
  contract-enforced, draft-only, idle by default).
- CEO cycle: one outcome per cycle (maxOutcomesPerCeoCycle: 1), selected
  deterministically by priority-then-ID under the ceo-outcome-authority.v2
  contract. Blocked, duplicate, or invented outcomes stop before any model
  call and consume no budget.
- dynamicDelegation: false, recursiveDelegation: false. The supervisor is
  deliberately not a model (kernel/README.md): it cannot invent agents,
  delegate recursively, or call a connector.
- Three shared-core teams describe the working shape (agent_team_system.json):
  Founder Desk (brief, release guard, product triage, tool scout), Revenue
  Pod (scout, list clerk, outreach drafter), Delivery Pod (task triage,
  receiving clerk, rollout architect, template clerk, browser sidecar).
  Autonomy level: operator-led (score 76). Approval stays human for pricing,
  client commitments, sends, and deploys.

### 2.2 Budgets as payroll

- Daily company AI budget: 500k bulk_equivalent_tokens default, 2M hard max,
  UTC-day window, durable-store-backed reservation before provider I/O
  (kernel gateway; portfolio.json). Hosted runtimes fail closed if the
  reservation store is unavailable.
- Tiers bulk / reason / deep with cost-weighted usage per client id
  (kernel/gateway.mjs via kernel/README.md).
- Local inference (ollama-local) is loopback-only, explicit-model-only,
  unloads after response, and draws from the same company budget.
- Efficiency metric: accepted outcomes per 1,000 work units; a metric exists
  only when record, evaluation, and usage coverage are complete (OPS-028).

### 2.3 Coordination through the repo

- hq/WORKBOARD.md: every unit of work is a row with ID, worker, status,
  outcome, write authority, and acceptance evidence. CEO-NNN rows are
  integrator-level outcomes (through CEO-020, done-live); OPS-NNN rows are
  bounded worker outcomes (through OPS-739). Write sets must not overlap;
  a worker is added only with one observable outcome, at most five in-scope
  paths, one acceptance check, and a named integrator.
- hq/TIMELINE.md: phased plan with founder-decision markers and the test
  baseline (600 test files green; bundle budget 2,836,231 / 2,840,000 bytes).
- hq/NOW.md: the live state contract (supermega.hq-live-state.v1) -- live
  commit, operating mode (isolated_demo), scheduler status, readiness flags.
- hq/readiness/managed-pilot-readiness.json: digest-bound gate ledger,
  regenerated whenever a source file changes (OPS-737).

### 2.4 Scale rules for the internal company

- Add roles by registering contracts, never by running daemons. Raising
  registeredRoleLimit past 12 requires evidence that the four active-slot
  queue is the bottleneck, not model quality.
- Concurrency rises only after single-cycle acceptance rates are measured:
  raise maxConcurrentCompanyCycles from 1 only when the ledger shows queued
  ready outcomes waiting more than one UTC day.
- Never let an experiment become the control plane (agent_team_system.json).
  New frameworks enter via Tool Scout review into main stack / sidecar /
  nowhere, gated at hq/portfolio.json researchGates.

---

## 3. External systems: product architecture and the customer path

### 3.1 Today's shape

    Customer browser
      |
      |  supermega.dev  (Vercel project: supermega-public)
      |  static public site + one serverless contact/lead function
      |  (tools/create_public_vercel_output.mjs builds .vercel/output:
      |   static/ + functions/api; OG cards; manifest contract v2)
      |
      |  app.supermega.dev  (Vercel project: megaos)
      |  static React app; all four products run device-local:
      |  trial records live in browser storage, no server write
      |
      +-- Products (all release-candidate-local, hq/portfolio.json):
      |     Shop      -- orders, stock, close, accounting handoff (record authority)
      |     Plant     -- jobs, output, OEE, CAPA, shift close
      |     Website   -- brief -> reviewed site -> deterministic file
      |     Ecommerce -- storefront -> cart -> quote -> Shop order intent
      |     AI assistance -- shared capability, gated R&D, server-only eval first
      |
      +-- Managed backend (planned, currently isolated_demo):
            Supabase Postgres 17, project zvtzwcimpvvtkowflhda
            production schema v11 observed with the public-browser quarantine,
            browser roles denied, writes off until gates pass
            rehearsal flow: disposable preview branch, apply migrations,
            prove isolation/storage/recovery, delete after evidence
            (hq/readiness/managed-pilot-readiness.json founderDecision)

    Kernel control plane (kernel/): gateway (model tiers, caps), store
    (Supabase/Postgres/memory spine), 69 connectors (incl. messaging-resend
    for transactional email, console/api.mjs ops console), agent-company
    cycles, one-use-code operator auth, managed-pilot-readiness generator.

### 3.2 Owner-named Shop pilot before self-serve onboarding

The current managed onboarding path is owner-named. Self-serve remains a later
product expansion, not the active activation route. The immediate path is:

    owner-private intake accepted
      -> owner-observed manual baseline captured privately
      -> GitHub main protection and review PR gates
      -> exact-candidate preview rehearsal with no production refs or data
      -> owner-approved paired release while operating mode stays isolated_demo
      -> five-day private Shop pilot with operator-reviewed runs
      -> 20 consecutive accepted receipt-and-anchor-bound runs covering pilot
         days 1 through 5 before any managed activation recommendation

Design consequence: no public signup, claim-code provisioning, hosted tenant,
customer acknowledgement, payment, stock movement, production database write,
or managed persistence activation is implied by readiness documents. Owner
review can satisfy only the exact gate it names.

### 3.3 Scaling path for the data plane

Stage 0 (now): one Supabase project, writes off, device-local trials only.
  Trials cost zero marginal server spend regardless of user count; this is
  the cheapest possible top-of-funnel and should be preserved.

Stage 1: single project, per-tenant RLS. One database, tenant_id on every
  row, RLS policies already rehearsed locally (56 PostgreSQL 17 checks,
  tenant isolation, session revocation -- readiness gate local_postgres17 is
  ready-local). Preview-branch rehearsal proves the complete source-controlled
  migration chain against current v11 production parity and browser quarantine
  before production migration.

Stage 2: same project, operational hardening. Connection pooling, the
  dormant scheduler activated at its reviewed ceiling (hourly + daily,
  max 25 invocations/day -- OPS-026), analytics aggregates per the approved
  no-PII MetricEvent schema (researchGates: analytics, adopt).

Stage 3: regional. Second Supabase project in a second region only when a
  measured latency or data-residency requirement exists. Tenant home-region
  is an attribute at claim time; cross-region features stay out until a
  documented requirement survives the researchGates process (the same rule
  that rejected a second queue/CRM).

Anti-goals remain in force (portfolio.json nonGoals): no per-customer code
forks, no one-domain-per-capability, no duplicate back offices.

---

## 4. Infrastructure: deploy, cost, security

### 4.1 Deploy and release gates (.github/workflows/)

Seven workflows: supermega-app-deploy (release guard on push),
supermega-public-release (coordinated verified release), showroom-ci,
public-hosting-guard, supermega-public-live-health, kernel-deploy,
dependency-security.

Release shape (supermega-public-release.yml): workflow_dispatch only;
requires the exact 40-char approved commit, the typed confirmation
"DEPLOY SUPERMEGA PAIRED PRODUCTION", and actor swanhtet01; single
concurrency group; paired promotion of both Vercel projects; exact live
identity verification after promotion. A stale-verifier failure rolls both
domains back (CEO-020 evidence). Kernel deploys are likewise owner-gated
immutable promotions with prebuilt artifacts and exact-SHA checks (OPS-010,
OPS-020). Note for agents: app:verify is not the whole gate -- lint and
showroom CI run separately and fail CI on their own.

### 4.2 Cost model

- Serving: static output on Vercel; the only always-on server cost is one
  contact function invocation per lead. Trials are device-local: user growth
  before claim is free.
- Agents: scale-to-zero; dormant roles, idle crews, and an unclaimed queue
  cost nothing. Spend occurs only inside a claimed, budget-reserved cycle.
- AI: 500k units/day default, 2M hard cap, durable atomic reservation,
  cache-first (cache hits reserve nothing). Duplicate cycles are blocked by
  claim ids, so retries cannot double-spend.
- Scheduler: dormant today (zero crons); reviewed activation ceiling is 25
  invocations/day. Hosted database: one project until Stage 3.

### 4.3 Security posture

- Public repo, zero secrets in source: env-only credentials
  (RESEND_API_KEY et al.), GitGuardian in CI, dependency-security workflow,
  no keys in the built artifact (verified by the public output gate).
- Database: RLS on every managed table, browser roles denied, metadata
  quarantine for legacy public tables observed on production schema v11 and
  required to remain reproducible from source; production writes remain
  disabled until separate founder approval
  (production_activation gate).
- Sessions: one-use tenant codes exchanged for HttpOnly, Secure, SameSite
  role-scoped sessions; server stores only fingerprints; owner can revoke
  atomically (kernel/README.md).
- Agents: injection stripping at the gateway, allowlisted hosts
  narrowing-only (OPS-016), no connector calls from the supervisor, drafts
  only, one human approval authorizes at most one launch (OPS-018).
- Everything fails closed: unavailable budget store, stale verifier,
  tampered readiness ledger, or unknown release commit all stop the action.

---

## 5. 90-day scalability roadmap (concrete triggers)

Day 0 state: zero managed tenants, owner-named Shop pilot not yet observed,
GitHub main protection still owner-gated, and production/external writes
disabled. Current release packets must be generated from the reviewed candidate
SHA and treated as stale when a newer artifact family supersedes them.

Phase A -- prove the hosted spine (target: days 0-14)
- After separate owner approval, execute the bounded rehearsal exactly as scoped
  in managed-pilot-readiness.json: create one preview branch, apply the complete
  source-controlled migration chain, prove v11 parity, browser quarantine,
  hosted isolation / storage / recovery / session-revocation, capture evidence,
  and delete the branch (max lifetime 24h).
- Trigger: rehearsal green -> propose production migration to the founder.
  Rehearsal red -> fix locally, repeat; production stays untouched.

Phase B -- owner-named Shop pilot (target: days 14-45)
- Capture the private manual baseline before pilot day one, then run the
  five-day owner-named Shop sequence without external messages, payments,
  stock movement, production writes, or managed activation.
- Trigger: 20 consecutive accepted, operator-reviewed, receipt-and-anchor-bound
  runs covering pilot days 1 through 5 -> prepare a pilot decision packet and
  managed activation recommendation.
- Trigger: fewer or failed accepted runs -> keep Shop in learning mode and fix
  locally before any activation proposal.
- Self-serve tenant provisioning, customer acknowledgement automation, and
  aggregate analytics remain deferred until after pilot acceptance and separate
  owner decisions.

Phase C -- steady-state scale rules (target: days 45-90)
- Trigger: AI spend > 400k units (80% of default) for 3 consecutive UTC
  days -> raise the default toward the 2M hard max or add caching; never
  raise the hard max and the default in the same change.
- Trigger: queued ready CEO outcomes wait > 1 UTC day for a slot -> raise
  active-cycle concurrency 1 -> 2 and re-measure acceptance rate before
  going further.
- Trigger: 100 tenants or sustained connection-pool pressure -> add
  pooling/pgBouncer and read-path aggregates; re-run the Security Advisor
  audit at the new scale.
- Trigger: a paying tenant with a measured latency or residency requirement
  -> open Stage 3 regional design through researchGates; not before.
- Standing rule: every trigger fires as a WORKBOARD row with acceptance
  evidence, and every consequential step (production migration, scheduler
  activation, regional project) remains a named founder decision.

---

End of document. Nothing here authorizes a deploy, push, provider write, or
production change; those remain owner-gated per hq/NOW.md.
