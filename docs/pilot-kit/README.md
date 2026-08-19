# SuperMega Shop pilot kit

**This kit is preparation for the managed pilot, not the pilot's acceptance evidence itself.** The Shop work order `shop-managed-order-close-pilot`'s actual gate (`hq/portfolio.json`) requires "one authenticated order-to-close and return-exception pilot on isolated hosted tenant; named operator, baseline, and five-day evidence plan" — the full sentence, including the isolated-hosted-tenant clause. This kit produces everything EXCEPT that clause: a named operator, a measured baseline, a signed-off agreement, and a full five-day rehearsal proving the operator and process are ready, all on the browser-local working sample (no hosted service touched). The authenticated run on an isolated hosted tenant is a separate, later, founder-only step — provisioning that tenant is infrastructure work this kit does not perform, gate, or claim to satisfy. Completing this kit means the moment the founder is ready to provision that tenant, the actual evidence run can start immediately with a trained operator and a proven process, instead of doing all of this setup from scratch on the clock.

## Why this kit exists

The managed-pilot readiness ledger (contract `supermega.managed-pilot-readiness.v4`, stored at `hq/readiness/managed-pilot-readiness.json`) blocks every managed claim behind one founder decision with the id `bounded-managed-pilot-rehearsal`. That decision requires exactly two inputs: `approve_preview_branch_target` and `approve_self_serve_activation_window`. Its operator block requires a measured baseline (`measuredBaselineRequired`) and acceptance evidence (`acceptanceEvidenceRequired`) alongside verified email, terms acceptance, and tenant-isolation proof for the broader self-serve activation window — this kit prepares the baseline and everything short of the hosted acceptance run itself. Separately, the Shop work order `shop-managed-order-close-pilot` stays `owner-gated` on the fuller requirement quoted above — this kit's local rehearsal is preparation for that gate, not a substitute for its hosted-tenant clause.

This kit is the paperwork for that preparation. It authorizes nothing: the founder decision remains `required` with `proposal_only` authority, and nothing in this kit touches a hosted service, spends a credential, or performs any network mutation.

## The documents, in order of use

1. [baseline-measurement.md](baseline-measurement.md) — the form the founder fills in WITH the shop owner before day 1: named business, named operator, the measured process, at least three observed timings, error and cost counts, and the four baseline numbers the handoff generator requires. Includes a worked fictional example.
2. [acceptance-checklist.md](acceptance-checklist.md) — the day-by-day five-day plan: the four start gates, what evidence gets captured daily, what an accepted run means, and how each day maps to the readiness contract's acceptance-evidence requirement.
3. [pilot-agreement-outline.md](pilot-agreement-outline.md) — a plain-language outline of what the partner gets and gives. Outline only, marked NOT LEGAL ADVICE; it contains no invented commitments.

## How it connects to the existing machinery

- The concrete five-day evidence plan, the four owner gates, and the required baseline fields come verbatim from the pilot handoff generator, tools/create_shop_pilot_handoff.mjs (npm script `client:pilot:handoff`). This kit is the human-facing preparation for the inputs that generator refuses to run without.
- The private sales workspace flow around a real contact event is documented in `docs/supermega-shop-sales-agent.md`; its reporting boundary applies to everything captured with this kit: customer identity stays private.
- The in-person demo that usually precedes recruitment is docs/demo-playbooks/shop.md.

## Boundary

This kit's five-day rehearsal runs on the browser-local working sample only — it is preparation, not the work order's hosted-tenant evidence run (see above). The readiness contract's does-not-authorize list holds throughout: `production_database_change`, `production_deploy`, `customer_message`, `payment`, `stock_move`, `managed_product_activation`, `hosted_scheduler_activation`. The actual authenticated pilot on an isolated hosted/managed tenant (`hq/portfolio.json`'s `shop-managed-order-close-pilot`) happens only after the founder separately approves and provisions it — that is a distinct decision from, and this document does not assume its technical shape matches, the `bounded-managed-pilot-rehearsal` self-serve infrastructure rehearsal (which IS specifically a `preview_branch` bounded by `maximumLifetimeHours` of 24 with `deleteAfterEvidence` set, per the readiness ledger's `founderDecision` block) — provisioning the client pilot's own tenant is not part of this kit either way.

Every backticked token in this kit is a verbatim contract checked against the repo sources by the drift guard tools/test_demo_playbooks.mjs (npm script `demo:playbooks:verify`).
