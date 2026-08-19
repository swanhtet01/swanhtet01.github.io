# SuperMega Shop pilot kit

Everything a Shop design partner needs on day one of the five-day managed pilot, prepared before any partner is named, so recruitment has zero friction the moment the founder names a business.

## Why this kit exists

The managed-pilot readiness ledger (contract `supermega.managed-pilot-readiness.v4`, stored at `hq/readiness/managed-pilot-readiness.json`) blocks every managed claim behind one founder decision with the id `bounded-managed-pilot-rehearsal`. That decision requires exactly two inputs: `approve_preview_branch_target` and `approve_self_serve_activation_window`. Its operator block requires a measured baseline (`measuredBaselineRequired`) and acceptance evidence (`acceptanceEvidenceRequired`) alongside verified email, terms acceptance, and tenant-isolation proof for the broader self-serve activation window — this kit prepares the first two, which are exactly what a founder-led pilot produces. Separately, the Shop work order `shop-managed-order-close-pilot` stays `owner-gated` on its own plainly stated requirement: "named operator, baseline, and five-day evidence plan" (`hq/portfolio.json`).

This kit is the paperwork for that requirement. It authorizes nothing: the founder decision remains `required` with `proposal_only` authority, and nothing in this kit touches a hosted service, spends a credential, or performs any network mutation.

## The documents, in order of use

1. [baseline-measurement.md](baseline-measurement.md) — the form the founder fills in WITH the shop owner before day 1: named business, named operator, the measured process, at least three observed timings, error and cost counts, and the four baseline numbers the handoff generator requires. Includes a worked fictional example.
2. [acceptance-checklist.md](acceptance-checklist.md) — the day-by-day five-day plan: the four start gates, what evidence gets captured daily, what an accepted run means, and how each day maps to the readiness contract's acceptance-evidence requirement.
3. [pilot-agreement-outline.md](pilot-agreement-outline.md) — a plain-language outline of what the partner gets and gives. Outline only, marked NOT LEGAL ADVICE; it contains no invented commitments.

## How it connects to the existing machinery

- The concrete five-day evidence plan, the four owner gates, and the required baseline fields come verbatim from the pilot handoff generator, tools/create_shop_pilot_handoff.mjs (npm script `client:pilot:handoff`). This kit is the human-facing preparation for the inputs that generator refuses to run without.
- The private sales workspace flow around a real contact event is documented in `docs/supermega-shop-sales-agent.md`; its reporting boundary applies to everything captured with this kit: customer identity stays private.
- The in-person demo that usually precedes recruitment is docs/demo-playbooks/shop.md.

## Boundary

The pilot itself runs on the browser-local working sample. The readiness contract's does-not-authorize list holds for the entire pilot: `production_database_change`, `production_deploy`, `customer_message`, `payment`, `stock_move`, `managed_product_activation`, `hosted_scheduler_activation`. Any hosted rehearsal happens only after the founder decision is approved, on an isolated `preview_branch`, bounded by `maximumLifetimeHours` of 24 with `deleteAfterEvidence` set.

Every backticked token in this kit is a verbatim contract checked against the repo sources by the drift guard tools/test_demo_playbooks.mjs (npm script `demo:playbooks:verify`).
