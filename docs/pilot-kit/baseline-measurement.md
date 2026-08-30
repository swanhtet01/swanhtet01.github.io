# Shop pilot baseline measurement form

Fill this in WITH the Spa owner, in person, before day 1 of the five-day pilot. Keep it in the founder's private workspace.

Why it exists: the readiness ledger (contract `supermega.managed-pilot-readiness.v4`) requires a measured baseline (`measuredBaselineRequired`) before the founder decision `managed-production-activation` can produce accepted Shop-pilot evidence. The Shop work order `shop-spa-owner-pilot` requires a named Spa owner, reviewed client import, package sale, matching treatment redemption, daily close, recovery, and five-day evidence (`hq/portfolio.json`). Section 4 contains both the Shop operating baseline and the Spa-specific fields required by tools/create_shop_pilot_handoff.mjs and npm script `client:pilot:handoff`.

## Rules of measurement

- Measure the owner's current manual process as it runs today — notebook, phone, paper, memory. Do not measure the SuperMega demo; the demo is not a baseline.
- Observe at least three real runs end to end with a timer. The pilot measurement reference accepts a baseline only when it is owner-observed across three or more runs. Numbers recalled from memory go in as estimates and are marked as estimates.
- The observer watches and times; the observer does not help. If a run is interrupted, discard it and observe another.
- Privacy: this sheet names a real business and a real person. Keep it private. Per `docs/supermega-shop-sales-agent.md`, reporting outside the private workspace carries stage and hashes only — never the contact name, email, or company.

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

## 3. Observed runs (minimum three)

One row per observed run of the real process, timed start to end.

| Run | Date and time | Started when / ended when | Human minutes | Error in this run? | Cost of the error |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| more... | | | | | |

## 4. Derived baseline — operating and Spa-package measurements

| Field | Contract name | How to derive it | Value |
| --- | --- | --- | --- |
| Weekly orders | `weekly_orders` | Owner's count, confirmed against last week's records, not memory alone | |
| Median minutes per order | `median_minutes_per_order` | Middle value of the observed run timings in section 3 | |
| Weekly exception count | `weekly_exception_count` | Returns, wrong orders, and payment mismatches in a normal week | |
| Daily close minutes | `close_minutes_per_day` | Minutes the owner spends closing the day (counting cash, updating the book) | |
| Client rows prepared for import | `client_import_row_count` | Count the real client rows the owner has reviewed for the first import | |
| Weekly prepaid package sales | `weekly_package_sales` | Count completed package sales from the current book or payment records | |
| Weekly treatment redemptions | `weekly_treatment_redemptions` | Count package uses actually consumed by completed matching treatments | |
| Median minutes per redemption | `median_minutes_per_redemption` | Middle timing from at least three current package-balance updates | |
| Weekly package corrections | `weekly_package_correction_count` | Wrong client, treatment, package, payment, refund, or balance corrections in a normal week | |

## 5. Errors and cost

| Field | Value |
| --- | --- |
| Observed runs that contained an error (of the runs in section 3) | |
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
- Observed runs: package-balance updates took 4, 3, and 2 minutes. One run initially used the wrong client row and required correction before the balance changed.
- Derived baseline: weekly orders 120 (counted from last week's day book), median minutes per order 8 (middle of 7, 8, 9), weekly exception count 12, daily close minutes 45.
- Spa services vertical pack baseline: 40 reviewed client rows, 12 weekly package sales, 24 weekly treatment redemptions, median 3 minutes per redemption, and 2 weekly package corrections.
- Errors and cost: 1 of 3 observed balance updates needed correction; no invented financial saving is claimed.
- Sign-off: owner confirmed; operator agreed; start Monday 2026-08-17, review Friday 2026-08-21 (start plus four days).

These fictional numbers match the handoff generator's built-in example payload, so the owner can recognize the shape and dry-run the private workspace flow with fictional data via `npm.cmd run client:pilot:workspace:self-test`. They can never close the real-client gate.
