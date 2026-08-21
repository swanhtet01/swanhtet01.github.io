# Founder bottleneck study — which founder-only steps are permanent and which are accidents

Date: 2026-08-20
Status: research (no deploy, production write, migration, release dispatch,
billing transition, customer contact, or gate change is authorized by this
document; it proposes no change to any `CLAUDE.md` hard limit).
Question answered: *of the founder-only steps on the client path, which ones
exist because removing the human would break a real security or legal
boundary, and which ones exist only because nobody built the automation?*

Primary source for the step enumeration: `hq/strategy/CLIENT-READINESS-BRIEF.md`
§2. That brief is treated here as a secondary source — every step below was
re-checked against the code or runbook that actually makes it manual, and
three of its statements are corrected in section 1.

Sources re-read for this study: `hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md`,
`supermega_runtime/billing_rail.py`, `supermega_runtime/trial_runtime.py`,
`supermega_runtime/trial_store.py`, `supermega_runtime/activation_email.py`,
`hq/strategy/SELF-SERVE-ONBOARDING-SPEC.md`, `hq/strategy/BILLING-RAIL-DESIGN.md`,
`hq/strategy/GTM-AI-OPERATIONS.md`, `docs/pilot-kit/` (all four documents),
`tools/create_shop_pilot_handoff.mjs`, `tools/prepare_managed_invoice.mjs`,
`tools/verify_self_serve_pilot.py`,
`showroom/src/core/shop-fulfillment-lead-time-summary.ts`,
`.github/workflows/supermega-public-release.yml`,
`hq/readiness/managed-pilot-readiness.json`. Revision 2 additionally read the
type definitions in `showroom/src/core/commerce-workspace.ts` and the
exact-field contracts in `supermega_runtime/commerce_runtime.py`.

**All file citations in this document resolve against `origin/main`, not
against the working checkout.** During review of PR #500 two citations here
(`shop-fulfillment-lead-time-summary.ts` and `docs/pilot-kit/`) were reported
as non-existent on main. Both exist on `origin/main` — added by `4819163f`
(#454). The checkout at the repository root was pinned at `c9e0d436`, **1190
commits behind `origin/main` when measured on 2026-08-20** (that gap will
drift; re-measure rather than quoting it), which is what a grep there finds.
Anyone
re-checking this study should `git fetch` and grep `origin/main` (for example
`git ls-tree -r origin/main --name-only`) rather than the working tree.

---

## 1. Three corrections to the brief, before anything is classified

### Correction 1 — the founder-only count is nine, not eight

The brief's §2 table has eleven rows. Counting the literal `[founder-only]`
tag in the Tag column: rows **1, 2, 4, 5, 6, 7, 8, 10, 11** carry it. That is
**nine**, not eight. Row 3 is `[buildable-now]`. Row 9 carries only
`[blocked-by step 8]`.

Row 9 is under-tagged, by the brief's own text: its cost column says the
hosted acceptance run is "five days, but they are the *same* five days as
step 4 re-run against the real tenant", and step 4 is tagged founder-only.
A five-day on-site evidence run with a named operator is founder time
whether or not it is a `CLAUDE.md` hard limit.

**Honest count: 9 rows are tagged founder-only, 10 of 11 require founder
hours, and exactly one row (step 3, lead list and draft personalization) is
executable by an agent end to end.** The near-term picture is therefore
*worse* than the "8 of 11" framing, not better.

### Correction 2 — step 8 is founder-only exactly once, not per client

The brief tags step 8 ("Create and verify tenant #1") `[founder-only]`. That
is correct for tenant #1 and wrong as a description of steady state.

Tenant creation is already fully self-serve in shipped code.
`supermega_runtime/trial_runtime.py` mounts `POST /workspaces` (the
`trial_self_serve_workspace` handler): it fail-closes on the activation window
first, then requires a verified-email signup session, then calls
`store.create_self_serve_workspace(...)` and returns the created tenant. No
founder appears anywhere in that path.
`hq/strategy/SELF-SERVE-ONBOARDING-SPEC.md` §2 step D states the intent in as
many words: "**No human in the loop**; rate-limited per email, per IP, per
claim code." The rate limit is per-actor and small
(`SELF_SERVE_RATE_LIMIT_MAX = 5` in `trial_store.py`, counted per `actor_id`
in `_count_self_serve_attempt`), so it throttles one abusive signer, not
throughput. The welcome email is likewise automated and best-effort
(`supermega_runtime/activation_email.py`: sent after a new tenant, never on
idempotent replay, and a failure never changes the activation result).

The founder-only part of step 8 is the runbook's instruction *not to trust the
switch until you have watched it work once* — `PRODUCTION-ACTIVATION-RUNBOOK.md`
§4: "Do not enable writes (D) before you've personally verified a tenant
creates correctly on the target." That is a one-time verification, and it is
sound engineering practice, not a per-client tax.

### Correction 3 — counting founder-only *steps* is the wrong metric

Nine of eleven rows being founder-only sounds like a per-client tax of nine
founder actions. It is not. **Five of those nine — steps 1, 5, 6, 7, 8 — are
one-time activation costs** that are paid once and then amortize to zero
across every subsequent client. Of the remaining four: step 2 recurs per
outreach *batch* (its identity-and-cadence setup portion is one-time, its
per-message review is not), step 4 recurs per *design partner*, **step 10
recurs per client per billing cycle, and step 11 recurs only at onboarding or
after a revocation — not per cycle** (see "Why step 11 does not recur" below).
Step 9, which the brief left untagged, is a sixth one-time cost.

This is the single most important finding in this study, and section 2 is
built on it. "Number of founder-only steps" is a metric that cannot
distinguish a cost paid once from a cost paid forever, and using it as the
scaling ceiling produces a wrong answer in both directions at once.

---

## 2. The axis that actually matters: one-time vs per-client

| # | Step | Founder-only? | Recurrence | Founder cost (estimate — none of these are measured) |
|---|---|---|---|---|
| 1 | Pricing decisions D1–D5 | Yes | **One-time** (until repriced) | One sitting |
| 2 | Approve outreach identity, list, copy, cadence | Yes | **One-time setup + per batch** | Hours once; minutes per approved batch |
| 3 | Produce lead list, personalize drafts | No — agent | Per batch | Zero |
| 4 | Recruit design partner, run the five-day pilot kit | Yes | **Per design partner** | ~5 days on the partner's floor plus a pre-day-1 baseline session |
| 5 | Resolve runbook §0 precondition / release dispatch | Yes | **One-time** (then per release, not per client) | Minutes to check; a dispatch if not shipped |
| 6 | Decide the migration set for the activation window | Yes | **One-time** | Minutes |
| 7 | Production activation steps A→D | Yes | **One-time** | Under a working session |
| 8 | Create and verify tenant #1 | Yes, once | **One-time** (steady state: zero — see correction 2) | Under an hour, once |
| 9 | Hosted acceptance evidence run | De facto yes | **One-time** (closes the Shop gate once) | ~5 days |
| 10 | Issue invoice → receive transfer → `confirm-payment` | Yes | **Per client, per billing cycle** — two CLI commands | Minutes per invoice |
| 11 | `grant-entitlement` | Yes | **Per client, once** — at onboarding or after a revocation, **not** per cycle | Minutes |

**One-time subtotal:** steps 1, 5, 6, 7, 8, 9 — roughly one working week of
founder attention, dominated by step 9's five days, paid once for the whole
company.

**Per-client steady-state subtotal:** **step 10 only** — `issue-invoice` then
`confirm-payment`, two CLI commands per billing cycle — plus an amortized
slice of step 2's batch review. **Step 11 is onboarding work, not recurring
work.**

### Why step 11 does not recur — corrected after review

The second revision of this study said steps 10 **and** 11 recur per cycle.
Codex challenged it on PR #500 and **Codex was right**; the code refuses that
reading. `BillingLedger.grant_entitlement` raises
`BillingRailConflict("Premium entitlement is already granted.")` whenever the
stored entitlement status is already `granted` (`billing_rail.py:1091-1092`),
and `revoke_entitlement` refuses anything that is not currently granted
(`:1192-1193`). So for a client whose entitlement stays active between cycles,
step 11 *cannot* run a second time.

That leaves two possible processes, and **the code cannot tell us which one
the founder intends, because D5 is still an open founder ask:**

- **Reading A — entitlement persists (what recommended D5 implies).** Step 11
  runs once at onboarding. Each later cycle is step 10's two commands only.
  `BILLING-RAIL-DESIGN.md` D5 recommends "NO automatic expiry in v1: you
  review monthly and revoke manually", which describes exactly this: a
  standing grant plus a human monthly review.
- **Reading B — entitlement is re-established each cycle.** Then every cycle
  needs `revoke-entitlement` *and* `grant-entitlement` on top of step 10 — a
  **third and fourth** founder command per client per cycle, roughly doubling
  the steady-state load. The rail supports this; nothing selects it.

**This study takes Reading A as the working assumption because it is what D5
recommends, and flags plainly that it is not settled.** D5 sits in
`BILLING-RAIL-DESIGN.md`'s "Founder decision asks (**nothing below proceeds
without these**)" table, and all six of D1–D6 remain open. Until D5 is
answered, **the steady-state per-client founder cadence is genuinely
undefined**, and any capacity plan built on it inherits that. An unanswered
founder decision is the honest finding here; asserting a settled number would
not be.

**A consequence worth recording, since it strengthens A2.** Under Reading A
the entitlement row stays bound to the *first* paid invoice's digest and is
never revisited, so `premiumUnlocked` answers "was this workspace ever
granted", **not** "is this client current on payments". Whether a paying
client has stopped paying is therefore visible only in the invoice and
payment-event history — which is exactly what `_overdue_report` projects, and
exactly the query A2 makes runnable outside the founder's shell.

**Per-design-partner subtotal:** step 4, ~5 days, paid only for the small set
of early named partners the pilot kit exists for. `docs/pilot-kit/README.md`
frames the kit as preparation for `shop-spa-owner-pilot`, not as
onboarding for every customer; an ordinary customer's path is the self-serve
one in correction 2.

### What this does to the ceiling

The premise "every client costs founder hours, so revenue cannot outrun the
founder's calendar" is **true in the near term and materially wrong in the
steady state**, and the two need separating:

- **Near term (the first handful of design partners):** the ceiling is real
  and tight. It is step 4, at roughly five founder-days per design partner —
  the pilot kit's own five-day plan, not an invented figure. One founder
  working nothing else tops out in the low tens of partners a year. This is
  the binding constraint today and it deserves the whole of section 4.
- **Steady state (after the pilot gate closes):** the ceiling is **step 10**
  — two CLI commands per client per billing cycle — plus a monthly entitlement
  review per D5. It is a permanent `CLAUDE.md` hard limit and may not be
  automated. Where it binds depends on one number this repo has never
  measured, so the arithmetic is given rather than the conclusion: at *m*
  minutes per client per cycle and *h* founder-hours a month available for
  billing, the ceiling is `60h / m` clients. At m = 20 that is 150 clients per
  50-hour month; at m = 5 it is 600. **The honest statement is that it binds
  somewhere in the hundreds under any plausible *m*, and that *m* is a guess
  until a real billing cycle is run.** When it does bind, the
  correct answer is a second trusted human running the billing shift, not
  automation, because the boundary is *who is accountable for moving money*,
  not *how many keystrokes it takes*.

Neither of those is an optimistic reading. The near-term number is the one
that governs the next two quarters, and it is bad.

---

## 3. Classification: necessarily vs accidentally founder-only

The brief's binary does not survive contact with step 4, so this study uses
three buckets and says which is which rather than forcing a fit.

| Bucket | Meaning | Steps |
|---|---|---|
| **N — necessarily founder-only** | Removing the human breaks a real security or legal boundary. Permanent. Do not propose automating. | 1, 2, 5, 6, 7, 10, 11 |
| **A — accidentally founder-only** | Manual only because nobody built the automation, or because a credential sits in a founder shell instead of a service context. Addressable. | 8 (already resolved for steady state), and the measurement/preparation halves of 4, 9, 10 |
| **H — necessarily human, not necessarily the founder** | Cannot be automated (it is a trust, sales, or training act) but carries no boundary requiring *this specific* human. Delegable, not automatable. | 4, 9 (their on-site portions) |

### N — the permanent ones, stated plainly

These are hard limits. **They are permanent. This document proposes no change
to any of them and no workaround for any of them.**

- **Step 7 (production activation A→D) and step 6 (its migration-set fork).**
  `CLAUDE.md`: "Never mutate production Supabase. Migrations reach production
  only via the founder-run `hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md`."
  Runbook §1 names step D — enabling production writes — "the one genuinely
  consequential, hardest-to-reverse step: once real customer tenants exist,
  they exist." Correct, and one-time.
- **Step 5 (release dispatch).** `CLAUDE.md`: "Never dispatch the production
  release workflow — founder-only, typed phrase." This one is enforced in
  code, not only in policy:
  `.github/workflows/supermega-public-release.yml` requires the dispatch input
  to equal the typed confirmation phrase **and** checks `github.actor` against
  the owner account, in addition to pinning branch and repository. An agent
  cannot pass the actor check. This is the strongest control in the whole
  path.
- **Steps 10 and 11 (`confirm-payment`, `grant-entitlement`).** `CLAUDE.md`:
  "Billing/entitlement transitions are founder actions via the billing CLI;
  never automate them." The code agrees and defends the split twice:
  `billing_rail.py`'s module docstring — "Confirming a payment and granting
  entitlement are deliberately separate founder actions" — and
  `grant_entitlement`'s own docstring, "A separate founder action from
  confirm_payment". Confirming a payment is an assertion that money actually
  arrived, which only a human with access to the receiving account can make.
  Permanent.
- **Step 1 (pricing D1–D5).** Setting a price is a commercial and legal act.
  `BILLING-RAIL-DESIGN.md` D1: "Amounts are yours alone; no number appears in
  this document or in code." Permanent, and one-time.
- **Step 2 (approving who is contacted and what is sent).**
  `GTM-AI-OPERATIONS.md` (b)'s checkpoint table makes every real send founder-
  approved "per message or per approved batch", and the readiness kernel lists
  `customer_message` in `forbiddenUntilReady`
  (`kernel/managed-pilot-readiness.mjs`). Consent to contact a stranger is not
  delegable to an agent. Permanent — but note the contract *already* permits
  batch granularity, so its per-client cost is a policy choice the founder has
  already been granted, not an engineering gap.

### One honest flag on how these limits are enforced

Three of the five N-bucket limits are enforced only by `CLAUDE.md`, not by a
technical control against an agent lane:

- The release dispatch **is** technically enforced (owner lock above). Good.
- `tools/verify_self_serve_pilot.py` **is** technically enforced: it refuses a
  production target outright (`production_target_forbidden` raised when the
  parsed project ref equals the production one). Good.
- The **billing CLI is not.** `billing_rail.py`'s
  `--confirm-billing-action` typed phrase is a *friction* gate, not an
  authentication gate — the module comment says so, calling it a "deliberate
  typed-confirmation friction gate". An agent can type a fixed string. The
  real control on billing is **possession of the administrative database URL
  file**, which is exactly why that credential must never enter a service
  context. Section 4's item A2 is scoped around preserving this.
- **Production migrations are not.** Agent lanes in this repo carry Supabase
  MCP tooling capable of applying a migration to an arbitrary project. Nothing
  in the repository can constrain a tool the repository does not own. Only
  `CLAUDE.md` stands between an agent and runbook step A. That is worth the
  founder knowing explicitly; it is not a reason to relax anything, and this
  document proposes no change to it.

---

## 4. The accidentally founder-only ones, with the smallest change that removes the human

### A1 — The pilot baseline and five-day evidence are typed by hand, though the product could measure them

**The blocker, precisely.** `tools/create_shop_pilot_handoff.mjs` refuses to
run without four baseline numbers, and takes every one of them from founder
keystrokes: `ownerInput.baseline?.medianMinutesPerOrder`,
`...weeklyOrders`, `...weeklyExceptionCount`, `...closeMinutesPerDay`, each
passed through `boundedNumber`. The generator then demands five measurements
back — `median_minutes_per_order`, `weekly_exception_rate`,
`close_minutes_per_day`, `operator_corrections`, `reload_and_retry_result`.
A repo-wide search finds those five names **only** in the generator, its test,
and the drift guard `tools/test_demo_playbooks.mjs`. Nothing in `showroom/`
computes any of them. So `docs/pilot-kit/acceptance-checklist.md` asks a human
to hold a stopwatch for five days: "Per run, record: run number, minutes
taken, review outcome, corrections needed…".

Both authority documents already promise this is automatic and neither is
true today. `SELF-SERVE-ONBOARDING-SPEC.md` §3 item 6: "Auto-measured
baseline: first order-to-close (shop) or equivalent funnel event, **recorded
by the system, not by a human**." `PRODUCTION-ACTIVATION-RUNBOOK.md` §5:
"Baseline auto-measured."

**A correction to this study's first revision — A1 is NOT a pure projection.**
The first revision of this document claimed all five measurements could be
computed as a pure projection over `CommerceState`, citing
`showroom/src/core/shop-fulfillment-lead-time-summary.ts`. Codex challenged
that on PR #500 and **Codex was right**; the claim is withdrawn and replaced
below. The failure mode it would have caused is the serious one: four of the
five measurements would have been *mislabelled* rather than measured, which is
the same class of error as a guided sample earning a proof counter. A study
whose top recommendation would fabricate acceptance evidence is worse than one
reporting a smaller win, so the smaller win is what is recorded here.

**Measurement-by-measurement verdict, checked against the type definitions.**

| Measurement | Derivable? | Evidence |
|---|---|---|
| `median_minutes_per_order` | **No** | The pilot means *operator handling minutes per run*. `CommerceOrder` (`commerce-workspace.ts:385-428`) carries `createdAt`, `paymentReconciledAt`, `refundSettledAt` and `completion` — and no per-transition timestamps at all; `advancementActionIds` records *that* steps happened, never *when*. The shipped `projectShopFulfillmentLeadTimeSummary` computes something genuinely different: order create→complete **lead time**, floored to whole **hours** (`Math.floor(… / (1000 * 3600))`). Wrong quantity, wrong unit. |
| `close_minutes_per_day` | **No** | `CommerceClose` (`:636-651`) has exactly one timestamp, `createdAt` — the instant the close was saved. There is no close-start time, so the close's *duration* does not exist in state. |
| `operator_corrections` | **No** | `CommerceOrderCorrection` (`:310-325`) is a **financial** credit/debit ledger entry with monetary reason codes (`pricing_error`, `service_recovery`, `fee_adjustment`, `other`) and a balance. Whether an edit was the operator fixing their own slip or a legitimate business change is a human judgement the record does not carry. Counting these and calling them operator corrections would be a mislabel. |
| `reload_and_retry_result` | **No** | A day-4 rehearsal act: the operator deliberately reloads mid-day and retries a step. Idempotent replay on `actionId` is a system *property* provable by test — a different claim from "this operator did this on this device and the record survived". |
| `weekly_exception_rate` | **Partly** | The domain-recorded subset genuinely exists: `CommerceClose.paymentExceptionOrderIds` and `.stockExceptionSkus`, plus `order.returns[]` and `order.supportCases[]`, over `close.orders` as denominator. What it cannot see is a process exception the operator observed that never became a domain record. Derivable **if labelled** "domain-recorded exception rate", never as the pilot's observed rate. |

**So the honest scope is one partial projection plus new instrumentation.**

**Why the instrumentation cannot simply add order timestamps.** The obvious
fix — timestamp each order transition — is blocked, and not by tooling.
`supermega_runtime/commerce_runtime.py` enforces exact-field contracts:
`_ORDER_REQUIRED_FIELDS` / `_ORDER_OPTIONAL_FIELDS` (`:321-370`) are frozensets
checked by `_exact_fields`, and `_STATE_FIELDS` (`:280`) does the same at the
top level. A new order key is rejected on every managed sync until the
deployed backend accepts it, and the backend only moves by the **founder-only
release dispatch**. This is exactly the constraint that forced loyalty PR3 to
be deferred (roadmap S3).

**The viable shape, and it has a shipped precedent.** Record operator timings
in a **device-local store that never enters `CommerceState`** — the pattern
`showroom/src/core/shop-loyalty.ts` PR1 already uses ("an opt-in settings
record on this device, plus a pure projection") and `product-image-store.ts`
uses for photos, both chosen for this same contract reason. That buys
`median_minutes_per_order` and `close_minutes_per_day` as genuine measurements
with no backend gate, provided the product defines what starts and ends a
task — a real product-design question, not a mechanical derivation.

**The deliverable must include a provenance contract.** Each of the five
measurements has to carry how it was obtained — machine-derived, or
human-attested — so a handoff can never present an attested number as a
measured one. Without that field this item is a liability rather than an
improvement, and the generator should refuse a packet that omits it.

**Revised scope:** one partial projection (exception rate, relabelled) +
device-local task instrumentation for two measurements + a provenance-tagged
result contract + the two permanently-human measurements left explicitly
human.

**Size:** **L** (was stated as M). **Prerequisite:** none for the device-local
route — still not blocked by PG17, the v13 conflict, or production activation.
Any route that extends `CommerceState` instead is founder-gated on a release
dispatch and should not be taken for this.

**What it saves, honestly, after the correction.** Two of five measurements
stop being stopwatch work; a third becomes machine-derived under a narrower
name; **two remain irreducibly human**. So this does *not* make the pilot
self-measuring, and the first revision's "~2,400 minutes unlocked" was built
on that false premise and is withdrawn. What survives is real but smaller: it
removes some measurement labour, removes transcription error, and makes the
*machine-derived* portion trustworthy when someone other than the founder runs
the pilot. That still improves delegation — a hired operator's three
machine-derived numbers plus two explicitly-attested ones is a far better
artifact than five hand-typed ones — but it does not by itself convert step 4
into a delegable task.

### A2 — The billing *read* path is welded to the billing *write* credential

**The blocker, precisely.** `BillingLedger._assert_schema` takes a
`require_write_privilege` flag, and `get_billing_state` passes it `False`
after issuing `set transaction read only`. But the privileged-role assertion
sits *outside* that conditional: the check that raises "The billing ledger
requires the reviewed administrative role, never the runtime role" fires
whenever the current role lacks `rolsuper or rolbypassrls`, regardless of
`require_write_privilege`. Only the *bounded-privilege* check below it is
conditioned on the flag.

The consequence: the read-only `status` subcommand — which produces the
overdue projection `_overdue_report`, explicitly documented as "READ-ONLY …
Pure projection: no auto-charge, no sends, no new event types, no mutation" —
can only be run by the same superuser-class role that can insert billing
events. So the founder must personally run every "who owes me money" query,
because the only credential that answers it is the one that can also move
money.

**A correction to this study's second revision — the first A2 spec did not
enforce its own invariant.** That revision proposed merely *gating* the
privileged-role assertion on `require_write_privilege`. Codex challenged it on
PR #500 and **Codex was right.** Skipping an assertion is not the same as
adding one: `_assert_schema` only ever *requires* the mutation flags when
`require_write_privilege` is true (`billing_rail.py:562-572`) and **never
rejects them when it is false**. A read role accidentally provisioned with
`INSERT` or `UPDATE` would therefore sail through the read branch. Since A2's
whole purpose is putting that credential in a service context, the claimed
invariant "the service cannot mutate billing" would have rested entirely on
someone provisioning the role correctly by hand, with nothing in code to catch
a slip. That is precisely the failure that shows up when a role is created
slightly wrong under time pressure.

**Checking it went further than the review did.** Reading the probe SQL
(`:513-520`), the `current_user` privilege set is narrower than the check
needs in two more ways:

- **`DELETE` is never probed on any of the three tables** — so it could not be
  rejected even if the code wanted to.
- **`UPDATE` on `billing_events` is never probed either** — only `SELECT` and
  `INSERT` are, so an events-table UPDATE grant is invisible to every branch.

**Revised smallest change — the read branch must fail closed on every
mutation privilege, not merely decline to require them.**

1. Extend the probe to **every table privilege PostgreSQL 17 defines** —
   `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`,
   `MAINTAIN` — for `current_user` across all three billing tables: **24
   cells**, with the select list generated from the same tuple the checks read.
2. When `require_write_privilege` is false, **raise unless every one of the 21
   non-`SELECT` cells is absent.**

   **Enumerate the whole privilege set for the TARGET VERSION, not a curated
   subset and not the version in front of you.** This spec narrowed *four*
   times — missing `DELETE`, then `TRUNCATE`, then `TRIGGER`, then `MAINTAIN` —
   and each revision read complete when written. The fix is to the class:
   generate the query from one tuple, and derive that tuple from the target's
   own catalog.

   **`MAINTAIN` is the instructive one.** It is a PostgreSQL **17** table
   privilege (maintenance operations, and it can take table locks — so a role
   holding it can block billing activity while changing no row). The
   implementation's live harness ran on **PostgreSQL 16**, whose catalog has
   seven table privileges, and enumerated "all of them" from there. Worse,
   `_assert_schema` **already refuses any server that is not PostgreSQL 17**
   (`billing_rail.py:693`, `postgresMajor != 17`) — and the harness worked by
   overriding `server_version_num`, the one column that would have flagged the
   mismatch. The lesson is not "add `MAINTAIN`": it is that a harness which
   silences a version assertion cannot validate anything that depends on
   version. Because the module only ever runs on PG17, `MAINTAIN` needs no
   conditional branch.

   Three further corrections from the implementation (PR #506), all measured on
   a live server and all against what an earlier revision of this document
   asserted:
   - **`TRIGGER` belongs in the refused set.** A `SELECT`+`TRIGGER` role
     installed a `before insert` trigger returning `NULL`; the founder's next
     insert reported `INSERT 0 0`. The ledger silently stops recording while
     writes appear to succeed — no row changed by the role itself, and worse
     than if one had been. `REFERENCES` is weaker (it cannot read or change a
     row; it yields an invoice-id existence oracle) and is refused anyway.
   - **Twelve was the wrong count**, and so was 18. Twelve covers only the
     directly row-changing class; 18 was the PG16 enumeration. The refused set
     is **21**.

   **`TRUNCATE` was missing from an earlier revision of this spec, and it is
   the most dangerous omission of the set** (found in review 2026-08-20,
   verified in source). It is a *separate* PostgreSQL table privilege, so
   probing `INSERT`/`UPDATE`/`DELETE` does not cover it — and neither of the
   two defences this design otherwise leans on applies to it:
   - **RLS does not restrict `TRUNCATE`.** Policies govern
     SELECT/INSERT/UPDATE/DELETE, so `force row level security` on the billing
     tables is no obstacle.
   - **The immutability triggers do not fire on `TRUNCATE`.**
     `billing_events_immutable` is `before update or delete … **for each
     row**` (v12 migration :146-148), and the invoice and entitlement guards
     are row-level too (:105, :219). `TRUNCATE` fires no row-level trigger.
     The v12 migration contains no `TRUNCATE` handling at all — zero
     occurrences.

   So a `BYPASSRLS` role holding only `SELECT` plus an accidental `TRUNCATE`
   would pass a nine-privilege check while being able to **empty the entire
   billing ledger in one statement**, silently, past every existing guard.
3. Keep unconditional, exactly as today: the refusal of the two runtime role
   names, the read-only-transaction assertion, and the three `SELECT` checks.
4. ~~Only then gate the privileged-role assertion on `require_write_privilege`.~~
   **WITHDRAWN 2026-08-20 — do NOT implement this step. It is unsafe, and it
   was measured, not argued.** The v12 migration puts `force row level
   security` on all three billing tables with no policies
   (`20260817090000_private_trial_backend_v12_billing_rail.sql:221-226`, pinned
   independently by `tests/test_database_activation_contract.py:337-341`), and
   forced RLS is **not** bypassed by the table owner — only by
   `rolsuper`/`rolbypassrls`, which is precisely what that assertion probes. On
   a live PostgreSQL server, a `nosuperuser nobypassrls` role holding `SELECT`
   on all three tables read **0 of 1** seeded rows. Gated, such a role would
   connect cleanly and `get_billing_state` would report a paid-up workspace as
   having no invoices, `entitlement.status: "none"`, `premiumUnlocked: false`
   and an **empty overdue report** — a silent under-report of money owed. That
   is strictly worse than a refusal, and it is the exact revenue leakage
   `_overdue_report` exists to surface. The assertion therefore stays
   unconditional, with its own distinct message.
   **Consequence for A2's bounded read role:** it must be `BYPASSRLS` holding
   `SELECT` **only** — none of the other six table privileges on any billing
   table. What bounds the credential is the refusal in step 2, not this
   assertion, and it bounds it only because that refusal now covers all 21
   non-`SELECT` cells rather than a curated subset. Steps 1-3 stand as written
   (1-2 as amended above) and are implemented in PR #506.

**This mirrors a pattern the file already contains.** The `runtime_role_denied`
probe (`:500-512`) already does exactly this shape — `bool_and` over
`SELECT/INSERT/UPDATE/DELETE` across all three tables — for the
`supermega_trial_backend` role. The fix applies the existing idiom to the
*connecting* role in the read branch, rather than inventing a new one.

**The invariant is then enforced by the probe, not by provisioning
discipline.** That distinction is load-bearing and is the reason A2 outranks
A1: a mis-provisioned read role fails closed at connection time with a clear
error, instead of silently becoming a mutation-capable credential sitting in a
service context. Without step 2 above, A2 would be trading a founder-shell
credential for an unverified one — a worse position than the status quo, not a
better one.

**Size:** S–M (was S) — the probe extension, one new rejection branch, and
tests covering a read role that wrongly holds each of the 21 refused cells.

**The write path deliberately does NOT refuse `TRUNCATE`,** and the reasoning
is worth keeping because it looks like an inconsistency. That role is
superuser-class by construction, and `has_table_privilege` reports every
privilege true for a superuser regardless of `GRANT` — **measured 21/21
non-`SELECT` held on a real PostgreSQL 17.10 server.** Refusing `TRUNCATE` or
`MAINTAIN` there would reject every superuser administrative role and brick all
six mutation commands. The intent — the ledger is append-only, so the write
role has no business truncating — is right; it simply cannot be enforced
through this probe, and the read path owns that bound instead. Pinned by a test
so the next lane does not "fix" it.

**The harness now runs on the version the code requires.** An earlier revision
of this section carried the 21/21 as *inference*, because the harness ran on
PG16 and overrode `server_version_num`. That override is gone: PG17 server
binaries are reachable through npm (`@embedded-postgres/linux-x64`) even though
the PGDG apt repo is proxy-blocked, so the probe row is passed through
untouched and `billing_rail.py:693`'s version assertion is **live during the
harness rather than silenced by it**. Every earlier finding was re-run on
17.10 rather than argued to be version-stable: forced-RLS row blindness (0 of 1
seeded rows), the `TRUNCATE` exploit (all three tables to 0 rows while `DELETE`
was denied), and `TRIGGER` voiding an insert (rowcount 0) all reproduce. This
is a scratch test cluster only — it does **not** touch the PG17 rehearsal
cascade, which still needs the Windows EDB archive.

**The enumeration is now a mechanism, not a checked fact.** The eight
privileges were read from the server's own catalog (`grant all on table …`
then `aclexplode(relacl)`), which also confirms why this kept happening: PG16
reports seven and errors outright on `has_table_privilege(…, 'MAINTAIN')`. The
harness now asserts on every run that the probed set equals what the live
server's catalog defines, and a unit test pins the eight. A fifth narrowing
fails loudly instead of shipping.

**Prerequisite, and it is a real one.** The founder must create that bounded
read role on the target and place its URL in a service secret. Two conditions
are non-negotiable and this document does not propose relaxing either: the
read role's URL **never** enters this public repo (`CLAUDE.md` hard limit on
credentials and DSN-shaped literals — keys live only in `.secrets/` or a
secret manager), and the **write** URL never enters any service context,
because as section 3 established, possession of that file is the actual
security boundary on billing. This change moves a read into a service context;
it moves no mutation anywhere, and steps 10 and 11 remain exactly as
founder-only as they are today.

**What it saves.** Overdue detection and dunning *preparation* stop being
founder tasks. The founder still performs every transition; an agent can
surface "invoice X is N days overdue, outstanding recomputed net of refunds,
draft prepared". Minutes per client per cycle, plus the far larger saving of
not having revenue leak silently — which is the exact failure
`_overdue_report`'s own docstring was written to stop ("the rail stores
dueDate but nothing computed overdue -- silent revenue leakage").

### A3 — Invoice packet preparation is built but nothing feeds it

**The blocker, precisely.** `tools/prepare_managed_invoice.mjs` already does
the hard, careful half deterministically: it validates the packet shape,
performs zero network activity, writes only with `wx`, and takes "every
monetary value exclusively from the founder-supplied config file". It is
agent-runnable today. What does not exist is anything that produces that
config per client per cycle. So the founder assembles the config by hand
before every invoice.

**Smallest change.** A generator that emits a draft invoice config from the
tenant's billing state plus a founder-approved price file, for the founder to
review and then feed to the existing preparer.

**Size:** M.

**Prerequisites, both hard.** (i) Decision D1 must exist — there is nothing to
generate before a price exists. (ii) The price file must live outside this
repository, in `.secrets/`-class storage: `CLAUDE.md` forbids prices anywhere
in this public repo, and `BILLING-RAIL-DESIGN.md` D1 confirms "no number
appears in this document or in code". The generator must fail closed and make
no network call when the price file is absent, in line with the standing
fail-closed rule for key-dependent capabilities.

**What it saves.** Minutes per client per cycle of assembly, and the class of
error where a hand-assembled config disagrees with what the tenant actually
owes.

### A4 — Already resolved: per-client tenant creation

Recorded here so it is not re-chased. Correction 2 established that steady-
state tenant creation costs the founder nothing: the endpoint, the isolation,
the claim linkage, the rate limiting, and the welcome email all ship. The
brief's `[founder-only]` tag on step 8 should be read as "for tenant #1".
**No work item.**

### Not accidental, despite looking it

- **Step 3** is already `[buildable-now]` and correctly so; it is not a
  bottleneck.
- **Step 2's per-message review** is bucket N. The batch granularity that
  would cut its per-client cost is already granted by contract; no code is
  needed and none should be written.
- **Readiness ledger v5** (the brief's contradiction 4) is a recording gap,
  not a client-path step, and it stays blocked on the PG17 rehearsal cascade
  that `CLAUDE.md` records as currently impossible. It costs zero founder
  minutes per client. Do not pull it into this queue.

---

## 5. Ranking

Ordered by founder-minutes saved per client. Every minute figure is an
**estimate**, not a measurement; nothing in this repo has ever timed a real
client engagement, because no client exists.

**A "clients until payback" column has been removed from this table.** The
previous revision carried one (~10, 2–4, ~20). Payback requires build cost ÷
saving per client, and this study never estimated build cost in hours — so
those numbers were division by an absent operand and could not be checked
against anything. Sizes (S/M/L) and per-client savings are given instead;
whoever plans the work can supply the build estimate and do the division with
their own number. Flagging this on my own initiative rather than waiting for a
fourth review round: two of the three rounds so far have caught exactly this
shape of unsupported figure.

**This ranking changed after review.** The first revision put A1 first on the
strength of a "pure projection, size M, no prerequisite" claim that did not
survive checking (section 4, A1). Re-costed as instrumentation plus a
provenance contract, and delivering three of five measurements rather than
five, A1 drops to second and **A2 becomes the top recommendation.**

| Rank | Item | Size | Prereq | Est. founder-minutes saved |
|---|---|---|---|---|
| 1 | **A2 — read path fails closed on every mutation privilege, then decouples from the write credential** | S–M | Founder creates a bounded read role; write URL stays out of every service context | ~10–20 per client per cycle, plus prevented revenue leakage |
| 2 | **A1 — instrument the pilot measurements (3 of 5) + provenance contract** | L | None on the device-local route | ~150–300/partner directly; does **not** unlock full delegation |
| 3 | **A3 — invoice config generator feeding the existing preparer** | M | D1 pricing decision; price file outside the repo | ~10–15 per client per cycle |

**A2 is still first, but for a narrower reason than the last revision gave.**
That revision called it "a one-conditional change" — which was true of the
spec as then written, and that spec did not enforce its own invariant (section
4, A2). The corrected version is a probe extension plus a fail-closed
rejection branch: still small, still a verified defect against quoted code,
still free of product-design questions. What earns it the top spot is that
**its invariant ends up enforced in code rather than by provisioning
discipline** — which is exactly what the first spec got wrong, and exactly
what makes it safe to put a billing credential in a service context at all.

**A1 stays second on strategic grounds, stated with its limits.** It is still
the only item touching the step that actually binds today, and it is still
unblocked. But it now buys three of five measurements, one of them only under
a narrower name, and it leaves two permanently human — so it improves the
*quality* of pilot evidence and shaves some measurement labour without making
the pilot self-measuring. Anyone planning capacity off this document should
**not** assume A1 turns five founder-days into zero. It does not.

A3 is unchanged and remains gated on D1.

---

## 6. The honest verdict

**The ceiling is real, and it is one step, not eight.**

Of the nine founder-only steps, seven are necessarily founder-only and
permanent. That is not a disappointing result to be engineered around; it is
the correct architecture. A system whose differentiator is that every
transaction has an accountable record cannot have an agent assert that money
arrived, cannot have an agent decide a price, cannot have an agent contact a
stranger, and cannot have an agent arm a production database. Those four
boundaries are the product.

But seven permanent founder-only steps do **not** produce a per-client tax of
seven founder actions, because **four of them — steps 1, 5, 6 and 7 — are
paid once for the entire company.** The other three recur: step 2 per approved
outreach batch, and steps 10 and 11 per client per cycle. (An earlier revision
of this section said "five", which contradicted this study's own recurrence
table in section 2; Codex caught it on PR #500 and it is corrected here. Step
2's *setup* is one-time but its per-message review is not, so it cannot be
counted as paid-once.)

The steady-state per-client founder-only load is therefore **step 10's two
commands per billing cycle** — `issue-invoice` and `confirm-payment` — plus a
monthly entitlement review and a share of batch outreach review. Step 11 is
onboarding work, not recurring work: `grant_entitlement` refuses an
already-granted entitlement, so it cannot run again unless the founder first
revokes. That is a genuine ceiling and it is permanent. It binds somewhere in
the hundreds of clients on the arithmetic in section 2 — and the correct
response when it binds is a second trusted human, not automation.

**With one caveat that no amount of code reading resolves:** the recurring
cadence is only settled once D5 (entitlement lapse policy) is answered. Under
the *recommended* D5 the figure above holds. Under a re-establish-each-cycle
policy it roughly doubles. D5 is still open, so treat this number as
conditional rather than measured.

The step that binds *now*, at client one through ten, is step 4: five founder-
days per design partner, on a shop floor, with a stopwatch. It is not a hard
limit and not a security boundary — it is a trust and training problem that
needs a human but does not need *this* human.

**But it is less automatable than this study first claimed.** The first
revision described step 4 as "roughly half a measurement problem the product
is already most of the way to solving". Checking the type definitions
(section 4, A1) shows that is not so: of the five measurements the pilot
requires, one is derivable from state, two need instrumentation that does not
exist, and two are irreducibly human observations. Engineering effort still
converts into founder calendar here, but at a worse exchange rate than stated,
and no amount of it removes the five days. **Step 4 is delegable, not
automatable, and delegating it is a hiring decision rather than an engineering
one.** That is the honest shape of the near-term ceiling.

**One thing this study will not claim:** that any of this makes revenue
possible sooner. Every path to a first paying client still runs through the
same one-time founder gates — pricing, the release-precondition check, the
migration fork, activation, and a real transfer. Nothing in section 4 moves
any of those a day earlier. A1, A2, and A3 change what happens *after* the
first client, not whether the first one arrives.

---

## What this document does not do

It authorizes no deploy, no production write, no migration, no release
dispatch, no billing or entitlement transition, no customer contact, and no
gate change. It quotes no price, because none is approved. It proposes no
change to any `CLAUDE.md` hard limit, and its one credential-adjacent proposal
(A2) moves a read-only projection into a bounded service role while leaving
every mutation, and the credential that permits mutation, exactly where they
are. Where it disagrees with `hq/strategy/CLIENT-READINESS-BRIEF.md` it states
the disagreement and cites the source line rather than smoothing it.
