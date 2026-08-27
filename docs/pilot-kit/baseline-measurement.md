# Shop pilot baseline measurement form

Fill this in WITH the Spa owner, in person, before day 1 of the five-day pilot. Keep it in the founder's private workspace.

Why it exists: the readiness ledger (contract `supermega.managed-pilot-readiness.v5`) requires a measured baseline (`measuredBaselineRequired`) before the founder decision `managed-production-activation` can produce accepted Shop-pilot evidence. The Shop work order `shop-spa-owner-pilot` requires a named Spa owner, reviewed client import, package sale, matching treatment redemption, daily close, recovery, and five-day evidence (`hq/portfolio.json`). Section 4 contains both the Shop operating baseline and the Spa-specific fields required by tools/create_shop_pilot_handoff.mjs and npm script `client:pilot:handoff`.

## Rules of measurement

- Measure the owner's current manual process as it runs today — notebook, phone, paper, memory. Do not measure the SuperMega demo; the demo is not a baseline.
- Observe at least three uninterrupted runs in each required baseline stream: manual Shop order/package-sale runs, package-redemption/package-balance updates, and manual daily-close runs. Every private JSON `runId` must be unique across all three streams, so one underlying observation cannot be reused as separate baseline evidence. Daily-close evidence must cover three distinct close calendar dates; three repeated closes on one date are not enough. A generic set of three observed timings is not enough. Numbers recalled from memory go in as estimates and are marked as estimates.
- The observer watches and times; the observer does not help. If a run is interrupted, discard it and observe another.
- Privacy: this sheet names a real business and a real person. Keep it private. Per `docs/supermega-shop-sales-agent.md`, reporting outside the private workspace carries stage and hashes only — never the contact name, email, or company.

## Deterministic packet step

After this private form is complete, copy the same facts into a private JSON baseline input. Start from a blank template:

```powershell
npm.cmd run shop:pilot:baseline-packet -- --template "<private-baseline-input.json>"
```

Run the local input lint before generating any owner-safe packet. If the lint returns anything other than `baseline_input_ready`, stop and fix the private observation file locally; do not generate or hand-edit the owner-safe packet.

```powershell
npm.cmd run shop:pilot:baseline-packet -- --lint-input "<private-baseline-input.json>"
npm.cmd run shop:pilot:baseline-packet -- --input "<private-baseline-input.json>" --output "<owner-safe-baseline-packet.json>" --markdown-output "<owner-safe-baseline-packet.md>"
npm.cmd run shop:pilot:intake-packet -- --output "<owner-safe-intake-packet.json>"
npm.cmd run shop:pilot:launch-gate -- --baseline-packet "<owner-safe-baseline-packet.json>" --intake-packet "<owner-safe-intake-packet.json>"
npm.cmd run shop:pilot:day0-readiness -- --baseline-packet "<owner-safe-baseline-packet.json>" --intake-packet "<owner-safe-intake-packet.json>" --release-handoff "<release-handoff.json>" --github-protection-snapshot "<github-protection-snapshot.json>" --output "<owner-safe-day0-packet.json>" --markdown-output "<owner-safe-day0-packet.md>"
```

The owner-safe packet contains counts, derived medians, and a private-input digest only; it does not include the business name, operator name, raw notes, email, phone number, payment, stock movement, hosted write, or managed activation. Day-0 readiness must also be bound to the current local release handoff and GitHub protection snapshot, so it cannot accidentally treat a stale release gate as pilot-ready. Owner-safe does not mean public website, customer-facing, or publishable.

If only the intake packet is ready but the baseline is missing, `shop:pilot:launch-gate` reports `owner_private_intake_ready` and Day-0 readiness reports `blocked_owner_observed_baseline_required`. If the launch gate reports `owner_private_handoff_ready` and the Day-0 packet reports `day0_owner_private_handoff_ready`, the baseline and intake digests are ready for owner-private handoff. It still does not authorize customer contact, deployment, payment, stock movement, hosted writes, or managed activation.

## 1. Business and operator (who)

| Field | Value |
| --- | --- |
| Business name — exactly as it will be typed into the `Business name` field during setup | |
| Named operator — the one person who handles orders daily and will review every pilot run | |
| Operator role, in the owner's words | |
| Founder recording this baseline | |
| Date and place of observation | |

## 2. The measured process (what)

The Shop work order `shop-spa-owner-pilot` pins the process: import one client, sell and reconcile one prepaid package, complete the matching treatment, redeem one package use, close the day, and prove recovery. Capture the current manual equivalent in the owner's words.

| Field | Value |
| --- | --- |
| The process in one sentence | |
| Where a booking or package sale starts (walk-in, phone call, social message, ...) | |
| Where it ends (payment reconciled, treatment completed, package balance updated, book closed) | |
| How a wrong package, treatment, payment, or client record is corrected today | |
| Where the record lives today (notebook, phone, nowhere) | |

## 3. Observed baseline runs

The owner-safe baseline packet is accepted only after all three tables below have at least three uninterrupted owner-observed runs. Use a distinct private JSON `runId` for every row across all three tables. If one run is interrupted, keep the note privately and add another run; do not count the interrupted run toward the ready baseline.

### 3A. Manual Shop order/package-sale runs

One row per observed run of the real process, timed start to end.

| Run | Date and time | Started when / ended when | Human minutes | Error in this run? | Cost of the error |
| --- | --- | --- | --- | --- | --- |
| order 1 | | | | | |
| order 2 | | | | | |
| order 3 | | | | | |
| more... | | | | | |

### 3B. Package-redemption/package-balance updates

One row per observed package use after a matching treatment has completed, timed until the current manual balance is updated.

| Run | Date and time | Started when / ended when | Human minutes | Error in this run? | Cost of the error |
| --- | --- | --- | --- | --- | --- |
| redemption 1 | | | | | |
| redemption 2 | | | | | |
| redemption 3 | | | | | |
| more... | | | | | |

### 3C. Manual daily-close runs

One row per observed day close, timed from the last relevant transaction or treatment to the finished close record. Record at least three uninterrupted closes on three distinct close calendar dates. The `close_minutes_per_day` field must match the median of these close runs.

| Run | Date and time | Started when / ended when | Human minutes | Error in this run? | Cost of the error |
| --- | --- | --- | --- | --- | --- |
| close 1 | | | | | |
| close 2 | | | | | |
| close 3 | | | | | |
| more... | | | | | |

## 4. Derived baseline — operating and Spa-package measurements

| Field | Contract name | How to derive it | Value |
| --- | --- | --- | --- |
| Weekly orders | `weekly_orders` | Owner's count, confirmed against last week's records, not memory alone | |
| Median minutes per order | `median_minutes_per_order` | Middle value of section 3A manual Shop order/package-sale timings | |
| Weekly exception count | `weekly_exception_count` | Returns, wrong orders, and payment mismatches in a normal week | |
| Daily close minutes | `close_minutes_per_day` | Middle value of section 3C manual daily-close timings | |
| Client rows prepared for import | `client_import_row_count` | Count the real client rows the owner has reviewed for the first import | |
| Weekly prepaid package sales | `weekly_package_sales` | Count completed package sales from the current book or payment records | |
| Weekly treatment redemptions | `weekly_treatment_redemptions` | Count package uses actually consumed by completed matching treatments | |
| Median minutes per redemption | `median_minutes_per_redemption` | Middle timing from at least three current package-balance updates | |
| Weekly package corrections | `weekly_package_correction_count` | Wrong client, treatment, package, payment, refund, or balance corrections in a normal week | |

## 5. Errors and cost

| Field | Value |
| --- | --- |
| Observed runs that contained an error (across sections 3A, 3B, and 3C) | |
| Total observed error cost across those runs (money lost, goods written off, rework) | |
| The most expensive error the owner remembers from the last month, and its cost (marked estimate) | |

## 6. Owner sign-off

| Field | Value |
| --- | --- |
| Owner confirms these numbers describe the current process | yes / no |
| Operator agrees to review every pilot run personally | yes / no |
| Proposed pilot start date (day 1) | |
| Review date — must be exactly start date plus four days; the handoff generator rejects anything else (`review_date_must_close_five_day_plan`) | |

## Worked example — entirely fictional

Golden Lotus Spa is an entirely fictional example. Every person and number below is invented for illustration.

- Business name: Golden Lotus Spa. Named operator: Ma Thiri (fictional), Spa manager. Founder observed on-site on 2026-08-12, morning shift.
- Process in one sentence: a client buys a massage package, Ma Thiri records payment and remaining uses in a notebook, then manually reduces the balance after each completed treatment.
- Observed runs: manual order/package-sale entries took 7, 8, and 9 minutes; package-balance updates took 4, 3, and 2 minutes; daily closes took 40, 45, and 50 minutes. One redemption run initially used the wrong client row and required correction before the balance changed.
- Derived baseline: weekly orders 120 (counted from last week's day book), median minutes per order 8, weekly exception count 12, daily close minutes 45.
- Spa services vertical pack baseline: 40 reviewed client rows, 12 weekly package sales, 24 weekly treatment redemptions, median 3 minutes per redemption, and 2 weekly package corrections.
- Errors and cost: 1 of 3 observed balance updates needed correction; no invented financial saving is claimed.
- Sign-off: owner confirmed; operator agreed; start Monday 2026-08-17, review Friday 2026-08-21 (start plus four days).

These fictional numbers match the handoff generator's built-in example payload, so the owner can recognize the shape and dry-run the private workspace flow with fictional data via `npm.cmd run client:pilot:workspace:self-test`. They can never close the real-client gate.
