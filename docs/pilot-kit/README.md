# SuperMega Shop pilot kit

Everything a Shop design partner needs on day one of the five-day owner-named pilot, prepared before any partner is named.

## Why this kit exists

The managed-pilot readiness ledger (contract `supermega.managed-pilot-readiness.v5`, stored at `hq/readiness/managed-pilot-readiness.json`) keeps the hosted preview rehearsal and the private owner-named Shop pilot as separate blocking gates. Its next owner decision is `replace-failed-preview-and-prepare-owner-named-shop-pilot`; the decision requires explicit approval of the failed-branch deletion, preview cost, and preview target, plus `name_shop_pilot_business` and `name_shop_pilot_operator`. The operator block requires a named business (`namedBusinessRequired`), a named operator (`namedOperatorRequired`), a measured baseline (`measuredBaselineRequired`), acceptance evidence (`acceptanceEvidenceRequired`), and 20 consecutive accepted runs. The Shop work order `shop-managed-order-close-pilot` stays `owner-gated` until those inputs and proofs exist.

This kit prepares only the private business/operator inputs and pilot evidence. It does not approve `approve_failed_preview_branch_deletion`, `confirm_preview_branch_cost`, or `approve_preview_branch_target`. It authorizes nothing: the owner decision remains `required` with `proposal_only` authority, and nothing in this kit touches a hosted service, uses a credential, or performs any network mutation.

## The documents, in order of use

1. [baseline-measurement.md](baseline-measurement.md) — the form the founder fills in WITH the shop owner before day 1: named business, named operator, the measured process, at least three observed timings, error and cost counts, and the four baseline numbers the handoff generator requires. Includes a worked fictional example.
2. [acceptance-checklist.md](acceptance-checklist.md) — the day-by-day five-day plan: the four start gates, what evidence gets captured daily, what an accepted run means, and how each day maps to the readiness contract's acceptance-evidence requirement.
3. [pilot-agreement-outline.md](pilot-agreement-outline.md) — a plain-language outline of what the partner gets and gives. Outline only, marked NOT LEGAL ADVICE; it contains no invented commitments.

## How it connects to the existing machinery

- The concrete five-day evidence plan, the four owner gates, and the required baseline fields come verbatim from the pilot handoff generator, tools/create_shop_pilot_handoff.mjs (npm script `client:pilot:handoff`). This kit is the human-facing preparation for the inputs that generator refuses to run without.
- The private sales workspace flow around a real contact event is documented in `docs/supermega-shop-sales-agent.md`; its reporting boundary applies to everything captured with this kit: customer identity stays private.
- The in-person demo that usually precedes recruitment is docs/demo-playbooks/shop.md.

## Boundary

The pilot itself runs on the browser-local working sample. The readiness contract's does-not-authorize list holds for the entire pilot: `production_database_change`, `production_deploy`, `customer_message`, `payment`, `stock_move`, `managed_product_activation`, `hosted_scheduler_activation`. Any hosted rehearsal is separate and happens only after the owner approves the exact provider actions, on an isolated `preview_branch`, bounded by `maximumLifetimeHours` of 24 with `deleteAfterEvidence` set.

Every backticked token in this kit is a verbatim contract checked against the repo sources by the drift guard tools/test_demo_playbooks.mjs (npm script `demo:playbooks:verify`).
