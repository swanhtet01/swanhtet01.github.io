# Crews — the One Factory discipline

A **crew** is the unit of sale in the One Factory model: a fixed cast of AI roles that turns a
defined intake into a defined output contract. Cost is decided at **design time** — every role pins
a gateway tier — not at runtime, so a crew's worst-case burn is knowable before it ever runs.

Every crew is one file: `crews/{slug}.json`. The loader (`../crew-runner.mjs`) enumerates and
validates them; `crew-runner.test.mjs` keeps the shipped definitions honest. **Execution is live**
(`../crew-run.mjs`): `runCrew(slug, intake, {clientId})` folds the roles through `gateway.complete()`
with each role's tier and the tenant's `clientId` — so the plan gate, the cost-weighted cap, provider
failover, and injection-stripping all apply, never the SDK directly. It enforces the `output_contract`
(a missing field → `crew_contract_violation`) and has **no send/write/pay** capability: it drafts and
returns `blocked_actions`/`approval_queue` as data — the approve → act gate stays with the human.
Adversarially gated by `../../tools/test_crew_resilience.mjs` (wired into `verify` + CI).

## Schema

```jsonc
{
  "slug": "example-crew",          // required — lowercase kebab-case, MUST match the filename
  "name": "Example Crew",          // required — display name
  "version": 1,                    // required — positive integer, bump on breaking contract changes
  "description": "…",              // required — what the crew does, one paragraph
  "plan": "pro",                   // optional — minimum tenant plan; omit = available to all plans
  "free_tier_fallback": "…",       // optional — what free tenants get instead (when plan-gated)

  "requires_account_access": true, // optional — set true if the crew reads a tenant's inbox/chats
  "policy": {                      // REQUIRED (all three true) when requires_account_access is true
    "own_accounts_only": true,     //   only accounts the tenant owns and exports themselves
    "skip_personal": true,         //   personal/non-business threads are skipped, never stored
    "read_only": true,             //   never sends, replies, or mutates the source account
    "notes": "…"                   //   optional free text
  },

  "intake": {                      // required — the front door (every crew's first role reads this)
    "accepts": ["…", "…"],         //   non-empty list of input kinds
    "description": "…"             //   what arrives and in what state
  },

  "roles": [                       // required — explicit, ordered; roles[0].id MUST be "intake"
    {
      "id": "intake",              //   lowercase kebab-case, unique within the crew
      "title": "Intake",           //   display name
      "tier": "bulk",              //   gateway tier: bulk | reason | deep (see ../gateway.mjs TIERS)
      "goal": "…"                  //   the role's single job, written as an instruction
    }
  ],

  "output_contract": {             // required — what the crew is contractually obliged to emit
    "format": "json",              //   emitted shape (json | markdown | …)
    "fields": ["…"],               //   non-empty list of top-level fields the output MUST contain
    "description": "…"             //   optional
  }
}
```

## Conventions (enforced by `validateCrew`)

1. **Generic INTAKE role first.** `roles[0].id === "intake"` — every crew normalizes its input
   before anything reasons about it. Garbage isolation lives in one place.
2. **Tier per role.** Each role pins `bulk` / `reason` / `deep`. Default cheap: `bulk` unless the
   role genuinely needs cross-checking or judgment. The gateway still applies the tenant's plan on
   top (free tenants are forced to `bulk` regardless).
3. **Output contract is law.** `output_contract.fields` is what downstream code may rely on.
   Changing it means bumping `version`.
4. **The legal bright line is structural.** Any crew with `requires_account_access: true` fails
   validation unless `policy.own_accounts_only`, `policy.skip_personal`, and `policy.read_only`
   are all `true`. Never build a crew that reads third-party groups or scraped chats.
5. **No prices in crew files.** Plans are named (`"pro"`), never priced — pricing lives in the
   workspace `pricing.json` only.

## Loader API

```js
import { loadCrew, listCrews, validateCrew } from '../crew-runner.mjs'

await loadCrew('read-my-chaos')   // one validated definition (throws crew_invalid with .errors)
await listCrews()                 // every valid crew in this directory (bad files logged + skipped)
validateCrew(def, { slug })       // pure — returns [] when valid, else human-readable errors
```

## Run · forge · install · serve — the full loop

```js
import { runCrew } from '../crew-run.mjs'
await runCrew('read-my-chaos', intakeText, { clientId })   // → { ok, output, usageByRole, trace }

import { buildCrewFromSpec, forgeCrewFromDescription } from '../crew-forge.mjs'
buildCrewFromSpec(spec)                        // tiny spec → GUARANTEED-valid crew def (compiler, not a model)
await forgeCrewFromDescription(text, { model }) // a sentence → a valid crew (AI drafts the spec; compiler guarantees the rest)

import { installCrewFromSpec } from '../crew-install.mjs'
await installCrewFromSpec(spec)                // writes crews/<slug>.json → auto-enumerated + gate-checked + live
```

HTTP (`../api/crew.mjs`, LIVE at `console.supermega.dev/api/crew`):
- `GET  /api/crew` → the catalog (public product metadata: slug, roles, tiers, accepts, returns, bright-line flag)
- `POST /api/crew { slug, intake, clientId? }` → runs one (ops-gated, `x-ops-key`; goes through `runCrew`)

Adding a task is: **write or forge one JSON → it's registered, gated, runnable, and served.**

The separate ops-gated `../api/agent-company.mjs` manager runs bounded multi-crew cycles. It accepts
only the fixed roster, isolates evidence per specialist, budgets role calls before execution, claims
one durable cycle id, and returns draft-only partial results without cross-agent context or writes.
`../agent-company-work-orders.mjs` adds durable reviewed delegation around that same runner: exact
plan fingerprints, no-spend queue creation, client-filtered listing, explicit dispatch, and
duplicate-safe recovery. It never exposes queued raw evidence in list or detail responses.
`../agent-company-operations.mjs` adds one immutable checklist verdict per terminal work order and a
client-bound 7/30/90-day operating report. The report measures durable queue, execution, completion,
budget, boundary, review, and acceptance evidence without returning the intake or model output.

## Shipped crews

| slug | plan | what it does |
|---|---|---|
| `data-insights-desk` | all | approved exports + definitions + business questions -> data-quality findings, traceable metrics, chart specs, and decision story |
| `customer-support-desk` | all | approved tickets + account facts + policy -> triage, resolution path, escalations, and reply draft |
| `knowledge-base-desk` | all | approved policies + manuals + ownership metadata -> canonical answers, procedures, conflicts, and publication queue |
| `project-control-desk` | all | approved baseline + current status + dependencies -> critical path, risks, accountable actions, and update draft |
| `read-my-chaos` | all | own-account inbox/chat exports → structured ledgers + operator brief; bright line embedded |
| `chase-the-money` | all | own-account threads + POS ledger → unpaid balances (MMK) + drafted reminders in the customer's language; drafts only, bright line |
| `daily-operator-brief` | all | any trade's day numbers → actions ranked by money-at-stake + tomorrow's risk |
| `reconcile-premium` | pro | MMQR/KBZPay/WavePay ↔ POS reconciliation with LIVE intra-day shortfall flagging by staff/shift; free tier keeps the end-of-day close |
| `source-to-screen-pilot` | pilot | the paid upgrade from a free browser-only draft → one source-traced first proof + owner approval queue |
| `lead-qualification-desk` | all | approved lead facts → fit decision, proof step, open questions, and owner-reviewed follow-up draft |
| `delivery-planning-desk` | all | accepted outcome → milestones, dependencies, owner inputs, and objective acceptance checks |
| `quality-review-desk` | all | draft + sources + acceptance rules → proof-linked ship, revise, or block recommendation |
