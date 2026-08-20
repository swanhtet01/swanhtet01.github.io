# SuperMega Shop pilot kit

**This kit is preparation for the managed pilot, not the pilot's acceptance evidence itself.** The Shop work order `shop-managed-order-close-pilot`'s actual gate (`hq/portfolio.json`) requires "one authenticated order-to-close and return-exception pilot on isolated hosted tenant; named operator, baseline, and five-day evidence plan" — the full sentence, including the isolated-hosted-tenant clause. This kit produces everything EXCEPT that clause: a named operator, a measured baseline, a signed-off agreement, and a full five-day rehearsal proving the operator and process are ready, all on the browser-local working sample (no hosted service touched). The authenticated run on an isolated hosted tenant is a separate, later, founder-only step — provisioning that tenant is infrastructure work this kit does not perform, gate, or claim to satisfy. Completing this kit means the moment the founder is ready to provision that tenant, the actual evidence run can start immediately with a trained operator and a proven process, instead of doing all of this setup from scratch on the clock.

## Why this kit exists

The managed-pilot readiness ledger (contract `supermega.managed-pilot-readiness.v4`, stored at `hq/readiness/managed-pilot-readiness.json`) blocks every managed claim behind the founder decision `managed-production-activation`. It requires four explicit inputs: `approve_runtime_role_provisioning`, `approve_first_named_owner_identity`, `approve_exact_production_release`, and `approve_managed_activation_window`. Its operator block requires a measured baseline (`measuredBaselineRequired`) and acceptance evidence (`acceptanceEvidenceRequired`) alongside verified email, terms acceptance, and tenant-isolation proof — this kit prepares the baseline and everything short of the authenticated hosted acceptance run itself. Separately, the Shop work order `shop-managed-order-close-pilot` stays `owner-gated` on the fuller requirement quoted above — this kit's local rehearsal is preparation for that gate, not a substitute for its hosted-tenant clause.

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

This kit's five-day rehearsal runs on the browser-local working sample only — it is preparation, not the work order's hosted-tenant evidence run (see above). The readiness contract's does-not-authorize list holds throughout: `customer_message`, `payment`, `stock_move`, `hosted_scheduler_activation`, `additional_tenant_activation`, `billing_activation`, and `autonomous_external_write`. The authenticated Shop pilot happens only after the founder approves the exact production release and one named-owner activation. The production target has `maximumLifetimeHours` set to null and is not disposable; rollback closes the activation window and suspends access without deleting customer data. This kit never provisions that tenant or grants activation authority.

Every backticked token in this kit is a verbatim contract checked against the repo sources by the drift guard tools/test_demo_playbooks.mjs (npm script `demo:playbooks:verify`).
