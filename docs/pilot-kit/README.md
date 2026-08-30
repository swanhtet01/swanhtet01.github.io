# SuperMega Shop pilot kit

**This kit is preparation for the managed pilot, not the pilot's acceptance evidence itself.** The Shop work order `shop-spa-owner-pilot`'s actual gate (`hq/portfolio.json`) requires one named Spa owner to complete reviewed client import, reconciled package sale, matching treatment redemption, daily close, and recovery on an isolated hosted tenant, with setup time, correction effort, and five-day evidence recorded. This kit prepares the operator, baseline, agreement, and rehearsal without pretending sample data is client proof. The authenticated run on an isolated hosted tenant remains a separate, founder-only step.

## Why this kit exists

The managed-pilot readiness ledger (contract `supermega.managed-pilot-readiness.v4`, stored at `hq/readiness/managed-pilot-readiness.json`) blocks every managed claim behind the founder decision `managed-production-activation`. It requires four explicit inputs: `approve_runtime_role_provisioning`, `approve_first_named_owner_identity`, `approve_exact_production_release`, and `approve_managed_activation_window`. Its operator block requires a measured baseline (`measuredBaselineRequired`) and acceptance evidence (`acceptanceEvidenceRequired`) alongside verified email, terms acceptance, and tenant-isolation proof. Separately, `shop-spa-owner-pilot` stays `owner-gated`; this local rehearsal cannot substitute for the named client's hosted run.

This kit is the paperwork for that preparation. It authorizes nothing: the founder decision remains `required` with `proposal_only` authority, and nothing in this kit touches a hosted service, spends a credential, or performs any network mutation.

## The documents, in order of use

1. [baseline-measurement.md](baseline-measurement.md) — the form the founder fills in WITH the Spa owner before day 1: named business, named operator, the measured package-and-treatment process, at least three observed timings, error and cost counts, and the four baseline numbers the handoff generator requires.
2. [acceptance-checklist.md](acceptance-checklist.md) — the day-by-day five-day plan: the four start gates, what evidence gets captured daily, what an accepted run means, and how each day maps to the readiness contract's acceptance-evidence requirement.
3. [pilot-agreement-outline.md](pilot-agreement-outline.md) — a plain-language outline of what the partner gets and gives. Outline only, marked NOT LEGAL ADVICE; it contains no invented commitments.

## How it connects to the existing machinery

- The concrete five-day evidence plan, the four owner gates, and the required baseline fields come verbatim from the pilot handoff generator, tools/create_shop_pilot_handoff.mjs (npm script `client:pilot:handoff`). This kit is the human-facing preparation for the inputs that generator refuses to run without.
- The private sales workspace flow around a real contact event is documented in `docs/supermega-shop-sales-agent.md`; its reporting boundary applies to everything captured with this kit: customer identity stays private.
- The in-person demo that usually precedes recruitment is docs/demo-playbooks/shop.md.

## Boundary

This kit's five-day rehearsal runs on the browser-local working sample only. Sample clients, package sales, treatments, and redemptions are preparation, not hosted client evidence. The readiness contract's does-not-authorize list holds throughout: `customer_message`, `payment`, `stock_move`, `hosted_scheduler_activation`, `additional_tenant_activation`, `billing_activation`, and `autonomous_external_write`. The authenticated Spa pilot happens only after the founder approves the exact production release and one named-owner activation. The production target has `maximumLifetimeHours` set to null and is not disposable; rollback closes the activation window and suspends access without deleting customer data.

Every backticked token in this kit is a verbatim contract checked against the repo sources by the drift guard tools/test_demo_playbooks.mjs (npm script `demo:playbooks:verify`).
