# Shop pilot baseline measurement form

Fill this in WITH the Spa owner, in person, before day 1 of the five-day pilot. Keep it in the founder's private workspace.

Why it exists: the readiness ledger (contract `supermega.managed-pilot-readiness.v4`) requires a measured baseline (`measuredBaselineRequired`) before the founder decision `managed-production-activation` can produce accepted Shop-pilot evidence. The Shop work order `shop-spa-owner-pilot` requires a named Spa owner, reviewed client import, package sale, matching treatment redemption, daily close, recovery, and five-day evidence (`hq/portfolio.json`). The four derived numbers in section 4 remain the baseline fields required by tools/create_shop_pilot_handoff.mjs and npm script `client:pilot:handoff`.

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

## 4. Derived baseline — the four numbers the handoff requires

| Field | Contract name | How to derive it | Value |
| --- | --- | --- | --- |
| Weekly orders | `weekly_orders` | Owner's count, confirmed against last week's records, not memory alone | |
| Median minutes per order | `median_minutes_per_order` | Middle value of the observed run timings in section 3 | |
| Weekly exception count | `weekly_exception_count` | Returns, wrong orders, and payment mismatches in a normal week | |
| Daily close minutes | `close_minutes_per_day` | Minutes the owner spends closing the day (counting cash, updating the book) | |

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

Golden Valley Trading is the fictional example business the app itself uses (setup shows `Example: Golden Valley Trading`). Every number below is invented for illustration.

- Business name: Golden Valley Trading. Named operator: Ma Thiri (fictional), counter lead. Founder observed on-site on 2026-08-12, morning shift.
- Process in one sentence: a customer orders at the counter or by phone, Ma Thiri writes it in the day book, collects payment, hands over goods, and crosses it off; returns are re-entered by hand.
- Observed runs: run 1 took 9 minutes, run 2 took 7 minutes, run 3 took 8 minutes. Run 2 had one error — wrong change given, 5,000 kyat lost.
- Derived baseline: weekly orders 120 (counted from last week's day book), median minutes per order 8 (middle of 7, 8, 9), weekly exception count 12, daily close minutes 45.
- Errors and cost: 1 of 3 observed runs had an error; total observed error cost 5,000 kyat.
- Sign-off: owner confirmed; operator agreed; start Monday 2026-08-17, review Friday 2026-08-21 (start plus four days).

These fictional numbers match the handoff generator's own built-in example payload (weekly orders 120, median 8, exceptions 12, close 45), so the founder can print that example from the generator and recognize the shape, and can dry-run the whole private workspace flow with fictional data via `npm.cmd run client:pilot:workspace:self-test`.
