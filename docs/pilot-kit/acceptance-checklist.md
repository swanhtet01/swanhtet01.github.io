# Shop pilot rehearsal checklist — the five-day preparation plan

**This is preparation, not the hosted pilot's acceptance evidence.** The `shop-spa-owner-pilot` proof in `hq/portfolio.json` is a named Spa owner's reviewed client import, reconciled package sale, matching treatment redemption, daily close, and recovery on an isolated hosted tenant. This checklist rehearses that flow on browser-local sample data and records the existing five-day measurements; it cannot satisfy `acceptanceEvidenceRequired` or the founder decision `managed-production-activation` by itself.

## Before day 1 — start gates

The generator holds the handoff at status `blocked-owner-review` until the founder has explicitly confirmed all four gates; only then does it read `ready-for-private-pilot`. Confirm each one deliberately; every gate defaults to false.

- [ ] `isolatedNonProductionTenantApproved` — the founder has approved an isolated, non-production tenant label for the pilot. No hosted target exists or is touched at this point.
- [ ] `namedOperatorAuthorized` — the named operator from the baseline form has agreed, and the owner has authorized them to review every run.
- [ ] `pilotDataHandlingApproved` — the owner understands and approves how pilot data is handled (browser-local; identity kept private; see the agreement outline).
- [ ] `ownerReviewedCommercialDraft` — the owner has seen the commercial draft and knows no payment happens during the pilot (the draft records `paymentAccepted` as false).

Also before day 1:

- [ ] Baseline measurement form completed with the owner ([baseline-measurement.md](baseline-measurement.md)).
- [ ] Agreement outline read together ([pilot-agreement-outline.md](pilot-agreement-outline.md)).
- [ ] Pilot dates fixed: the review date is exactly the start date plus four days; the generator rejects anything else (`review_date_must_close_five_day_plan`).
- [ ] Workspace created on the shop's own device at `https://app.supermega.dev/settings/?product=shop`, with the real business name typed into `Business name`. Setup states `Stays on this device. Nothing is sent or published.`
- [ ] Sidebar badge confirmed to read `Demo mode`.

## What an accepted run means

A pilot run counts as accepted only when all of the following hold, following the owner-observed pilot measurement reference:

1. The run completed — the package sale, treatment, redemption, close, or recovery step reached its governed end state.
2. The end state is verifiable in the record, not just remembered.
3. The named operator reviewed the run and recorded the outcome as correct.
4. Zero wrong-target actions — nothing was done to the wrong order, item, or customer record.
5. Zero external effects — no real message, payment, or stock movement happened because of the run.

Each counted run also needs two distinct SHA-256 digests before it is recorded: `evidenceReferenceDigest` for the private evidence receipt, and `independentAnchorDigest` for the independently sealed private anchor. Create the private run input with `client:pilot:observed-evidence:template`, check it with `client:pilot:observed-evidence:validate`, then record and verify it with `client:pilot:observed-evidence`. If either digest is missing, reused, or equal to the other digest, the run does not count.

Any run failing any condition is recorded as not accepted, with the correction minutes it cost. Missing evidence is recorded as missing — per the generator's evidence rule: `Record failures and operator interventions; do not convert missing evidence into a success claim.` The measurement reference promotes a workflow only after 20 consecutive accepted runs whose accepted streak also covers pilot days 1 through 5; the five-day pilot feeds that same counting discipline, and the count restarts on any non-accepted run.

## The five days

Each day's focus and proof line is verbatim from the generator's evidence plan.

### Day 1 — Shop baseline and Spa services vertical pack client import review

Proof: `Record the Shop baseline, then review the Spa services vertical pack client import and resolve every row before applying sample data.`

- [ ] Shop baseline numbers from the form re-confirmed with the owner on-site: at least three manual order/package-sale runs, three package-redemption runs, and three daily-close runs.
- [ ] Review the Spa services vertical pack client import preview with the owner. Resolve duplicates, missing identities, and invalid rows before applying sample data. No sample row counts as client evidence.
- [ ] Evidence captured: baseline sheet finalized; walkthrough noted with date, time, and who was present.

### Day 2 — Client import and package sale

Proof: `Create and human-confirm a package sale for the reviewed client; reconcile payment and record completion time and corrections.`

- [ ] The operator reviews a sample client import, resolves any correction, sells a Spa prepaid package to the matching client, reconciles payment, and completes the order.
- [ ] Per run, record: run number, minutes taken, review outcome (correct or not), corrections needed, wrong-target actions (must be zero), external effects (must be none).
- [ ] Day closed with `Save daily close`; note total runs and the consecutive accepted count.

### Day 3 — Treatment and governed redemption

Proof: `Complete the matching treatment, record one immutable redemption, and prove mismatched or ineligible redemptions are refused.`

- [ ] The operator schedules and completes the treatment that matches the purchased package, then records one immutable package redemption.
- [ ] One controlled mismatch is rehearsed (wrong customer, wrong treatment, unreconciled payment, or refunded package); the system must refuse redemption without an external effect.
- [ ] A reviewed daily close: the operator runs `Save daily close` and the owner checks the day's numbers against the paper day book. Record close minutes for comparison with `close_minutes_per_day`.

### Day 4 — Daily close and recovery

Proof: `Run a reviewed close, reload the workspace, and prove safe retry without duplicate sale, treatment, or redemption events.`

- [ ] One correction or refund boundary is rehearsed end to end — part of the process `shop-spa-owner-pilot` names.
- [ ] Reload evidence: close and reopen the browser mid-day and confirm the record survived; retry a step safely and confirm no duplicate was created. This is the `reload_and_retry_result` measurement.
- [ ] Stock checked against reality on `/shop/?tab=inventory` after the return.

### Day 5 — Replay, export, and owner acceptance

Proof: `Verify retained package balance and evidence, compare measurements, create a backup, and record the owner decision.`

- [ ] All per-run records and daily closes gathered and counted: total runs, accepted runs, best consecutive accepted streak.
- [ ] Comparison against the baseline, per the generator: `Compare import time, package-sale time, treatment-redemption time, package balance, close time, operator corrections, and reload/retry evidence with the recorded baseline.`
- [ ] The operator's decision recorded in their own words. No improvement claim is made before this review — the handoff contract records `improvementClaimAllowedBeforeReview` as false.
- [ ] Owner keeps a backup of their workspace (`Download workspace backup`).

## The five required measurements

The handoff contract requires exactly these, and the daily records above produce all of them:

| Measurement | Produced by |
| --- | --- |
| `median_minutes_per_order` | Per-run minutes, days 2 through 5 |
| `weekly_exception_rate` | Exception runs counted across the week against total runs |
| `close_minutes_per_day` | Timed daily close, days 2 through 5 |
| `operator_corrections` | Corrections column of the per-run records |
| `reload_and_retry_result` | Day 4 reload and safe-retry rehearsal |
| `client_import_minutes` | Day 1 reviewed import preparation |
| `package_sale_minutes` | Day 2 reconciled prepaid package sale |
| `treatment_redemption_minutes` | Day 3 completed treatment and immutable redemption |
| `package_balance_result` | Day 5 retained balance reconciliation |

## Boundary for all five days

Nothing on the readiness contract's does-not-authorize list ever happens during these five days: `customer_message`, `payment`, `stock_move`, `hosted_scheduler_activation`, `additional_tenant_activation`, `billing_activation`, or `autonomous_external_write`. The app's own gate states the same boundary: `Browser-local sample only. Confirming creates a sample order and reserves sample stock in this browser. Payment and fulfilment stay pending for review in Orders. No payment is captured, no customer is contacted, no server or company account is written, and no real stock is moved.`

**These five days do not, by themselves, close the Shop work order's gate.** That gate requires `shop-spa-owner-pilot` to run with a real named Spa owner on an isolated hosted tenant. Sample client or package evidence is explicitly rejected. The founder decision `managed-production-activation` creates only the first named-owner Shop workspace on production and authorizes none of the additional external effects listed above.

## Mapping to the readiness contract

| Contract requirement | Satisfied by |
| --- | --- |
| Shop work order's preparation — named Spa owner, baseline, reviewed import, package sale, treatment redemption, close, and recovery (`hq/portfolio.json`) | Baseline form plus the `namedOperatorAuthorized` gate and this checklist's rehearsal evidence |
| Shop work order's hosted-tenant proof (`hq/portfolio.json`) | **NOT satisfied by this kit.** Founder-only: provision and run the flow with the real owner and reviewed client data |
| `measuredBaselineRequired` (readiness ledger operator block) | Baseline form sections 3 through 5 |
| `acceptanceEvidenceRequired` (readiness ledger operator block) | Prepared, not fully satisfied: this checklist's daily records, the five required measurements, and the day 5 operator decision are the rehearsal evidence; the flag's own hosted acceptance run is the step above, not part of this kit |
| `approve_runtime_role_provisioning` (decision input) | Founder-only; nothing in this kit performs it |
| `approve_first_named_owner_identity` (decision input) | Founder-only; the named pilot operator does not automatically become the production account owner |
| `approve_exact_production_release` (decision input) | Founder-only; nothing in this kit pushes, merges, or deploys code |
| `approve_managed_activation_window` (decision input) | Founder-only; nothing in this kit opens hosted writes |
