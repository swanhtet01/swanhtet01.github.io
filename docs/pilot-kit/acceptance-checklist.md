# Shop pilot acceptance checklist — the five-day evidence plan

The readiness ledger requires acceptance evidence (`acceptanceEvidenceRequired`) for the `owner_named_pilot` gate, and the Shop work order's required proof names "a named operator, baseline, and five-day evidence plan". This checklist is that plan, day by day. The five days, their proofs, the four start gates, and the five required measurements are taken verbatim from the pilot handoff generator (tools/create_shop_pilot_handoff.mjs), so the paper plan and the generated private handoff can never disagree.

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

1. The run completed — the order reached its end state (or the return exception reached its resolution).
2. The end state is verifiable in the record, not just remembered.
3. The named operator reviewed the run and recorded the outcome as correct.
4. Zero wrong-target actions — nothing was done to the wrong order, item, or customer record.
5. Zero external effects — no real message, payment, or stock movement happened because of the run.

Any run failing any condition is recorded as not accepted, with the correction minutes it cost. Missing evidence is recorded as missing — per the generator's evidence rule: `Record failures and operator interventions; do not convert missing evidence into a success claim.` The measurement reference promotes a workflow only after 20 consecutive accepted runs; the five-day pilot feeds that same counting discipline, and the count restarts on any non-accepted run.

## The five days

Each day's focus and proof line is verbatim from the generator's evidence plan.

### Day 1 — Baseline and operator walkthrough

Proof: `Record the baseline metrics and complete one observation-only walkthrough.`

- [ ] Baseline numbers from the form re-confirmed with the owner on-site.
- [ ] One observation-only walkthrough: the founder demonstrates the order flow on the working sample (`/shop/?tab=counter`, then `Review order`, `Create order`, and the order steps in `/shop/?tab=orders`); the operator watches. No evidence run is counted today.
- [ ] Evidence captured: baseline sheet finalized; walkthrough noted with date, time, and who was present.

### Day 2 — Order entry and review

Proof: `Create and human-confirm test orders; record completion time and corrections.`

- [ ] The operator creates test orders themselves: items in, `Review order`, cashier name at the `Review counter order` gate, `Create order`, then `Start preparing`, `Mark ready`, `Reconcile payment`, `Complete`.
- [ ] Per run, record: run number, minutes taken, review outcome (correct or not), corrections needed, wrong-target actions (must be zero), external effects (must be none).
- [ ] Day closed with `Save daily close`; note total runs and the consecutive accepted count.

### Day 3 — Daily close and exception

Proof: `Run a reviewed close and one controlled exception without external posting.`

- [ ] Normal order runs continue; same per-run records as day 2.
- [ ] One controlled exception is rehearsed (for example a payment mismatch caught at `Reconcile payment`) with no external posting of any kind.
- [ ] A reviewed daily close: the operator runs `Save daily close` and the owner checks the day's numbers against the paper day book. Record close minutes for comparison with `close_minutes_per_day`.

### Day 4 — Return and recovery

Proof: `Rehearse one return exception plus reload and safe retry evidence.`

- [ ] One return exception rehearsed end to end — the process the work order `shop-managed-order-close-pilot` names.
- [ ] Reload evidence: close and reopen the browser mid-day and confirm the record survived; retry a step safely and confirm no duplicate was created. This is the `reload_and_retry_result` measurement.
- [ ] Stock checked against reality on `/shop/?tab=inventory` after the return.

### Day 5 — Replay, export, and acceptance

Proof: `Verify retained evidence, compare measurements, and record the operator decision.`

- [ ] All per-run records and daily closes gathered and counted: total runs, accepted runs, best consecutive accepted streak.
- [ ] Comparison against the baseline, per the generator: `Compare median order time, exception rate, close time, operator corrections, and reload/retry evidence with the recorded baseline.`
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

## Boundary for all five days

Nothing on the readiness contract's does-not-authorize list ever happens during the pilot: `customer_message`, `payment`, `stock_move`, `production_database_change`, `production_deploy`, `managed_product_activation`, `hosted_scheduler_activation`. The app's own gate states the same boundary: `Browser-local sample only. Confirming creates a sample order and reserves sample stock in this browser. Payment and fulfilment stay pending for review in Orders. No payment is captured, no customer is contacted, no server or company account is written, and no real stock is moved.`

A hosted rehearsal is not part of these five days. If the owner separately approves the provider actions in `replace-failed-preview-and-prepare-owner-named-shop-pilot`, that rehearsal runs on an isolated `preview_branch`, is bounded by `maximumLifetimeHours` of 24, starts with no production data, and is deleted after evidence (`delete_preview_branch_after_evidence`).

## Mapping to the readiness contract

| Contract requirement | Satisfied by |
| --- | --- |
| `namedBusinessRequired` | Baseline form section 1, business name |
| `namedOperatorRequired` | Baseline form section 1 plus the `namedOperatorAuthorized` gate |
| `measuredBaselineRequired` | Baseline form sections 3 through 5 |
| `acceptanceEvidenceRequired` | This checklist's daily records, the five required measurements, and the day 5 operator decision |
| `name_shop_pilot_business` (decision input) | The owner carries the completed baseline form into the private decision record |
| `name_shop_pilot_operator` (decision input) | The owner carries the completed baseline form into the private decision record |
| `approve_preview_branch_target` (decision input) | Owner-only; nothing in this kit performs it |
| `approve_failed_preview_branch_deletion` (decision input) | Owner-only; nothing in this kit performs it |
| `confirm_preview_branch_cost` (decision input) | Owner-only; nothing in this kit performs it |
