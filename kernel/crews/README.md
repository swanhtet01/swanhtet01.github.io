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

## Shipped crews

| slug | plan | what it does |
|---|---|---|
| `read-my-chaos` | all | own-account inbox/chat exports → structured ledgers + operator brief; bright line embedded |
| `chase-the-money` | all | own-account threads + POS ledger → unpaid balances (MMK) + drafted reminders in the customer's language; drafts only, bright line |
| `daily-operator-brief` | all | any trade's day numbers → actions ranked by money-at-stake + tomorrow's risk |
| `reconcile-premium` | pro | MMQR/KBZPay/WavePay ↔ POS reconciliation with LIVE intra-day shortfall flagging by staff/shift; free tier keeps the end-of-day close |
| `source-to-screen-pilot` | pilot | the paid upgrade from a free browser-only draft → one source-traced first proof + owner approval queue |
