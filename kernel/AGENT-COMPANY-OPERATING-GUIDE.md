# Agent Company Operating Guide

SuperMega Agent Company sells reviewed business outcomes, not an unbounded swarm. The protected
console combines a fixed specialist roster, fixed playbooks, exact work-order plans, explicit model
spend, internal evaluation, delivery proof, and a separately recorded customer decision.

## What Is Available

- 15 fixed specialists across operations, finance, revenue, growth, delivery, assurance, insights,
  service, knowledge, and procurement.
- 8 fixed outcome playbooks.
- 15 validated crew contracts with structured outputs and no send, pay, or external-write tool.
- Durable client-bound work orders with exact plan hashes and evidence fingerprints.
- Explicit queue, dispatch, cancel-and-scrub, internal evaluation, proof, and review controls.
- Metadata-only health and workforce utilization for 7, 30, or 90 days.

## Sellable Outcomes

| Playbook | Required input | Customer receives |
|---|---|---|
| Source to decision | Approved sources, definitions, question, and gaps | Evidence ledger, analysis, and quality verdict |
| Lead to first proof | Buyer facts, repeated task, sources, and useful-result definition | Fit decision, delivery plan, first proof, and release verdict |
| Support to knowledge | Tickets, account facts, policy, and prior actions | Resolution packet, reusable procedure, and quality verdict |
| Cash control | POS, cash, payment-channel, shift, and exception evidence | Reconciled close, ranked actions, and quality verdict |
| Project recovery | Baseline, current status, owners, dates, and blockers | Critical-path diagnosis, recovery plan, and quality verdict |
| Documents to system | Documents or approved OCR, required fields, and validation rules | Validated document register, knowledge update, and quality verdict |
| Meeting to delivery | Transcript or notes, roles, context, and decision rules | Decision register, accountable actions, project update, and quality verdict |
| Quote to decision | Quotes, specifications, terms, currency rules, and criteria | Normalized comparison, decision analysis, and quality verdict |

No playbook contains a price. Commercial terms remain governed by the workspace `pricing.json` after
owner ratification.

## Operator Sequence

1. Open `https://console.supermega.dev/#company` and enter the internal ops passcode.
2. Enter the client ID, choose a playbook, keep or replace the generated mission ID, and select
   **Plan delegation**. This is plan-only and makes no model call.
3. Review every stage, specialist, role budget, output contract, handoff gate, mission ID, and plan
   hash.
4. Select **Prepare stage 1**. Add only approved evidence for that specialist.
5. Plan the cycle, review the exact client, evidence, assignment, and budget, then queue it. Queueing
   stores the plan but makes no model call.
6. Open the queued order, review its plan hash and evidence fingerprints, then explicitly dispatch.
7. Record the immutable internal checklist evaluation and download the delivery proof.
8. For a later stage, first obtain an accepted evaluation, redact the prior output, review the exact
   handoff, check the stage gate, and prepare that stage as a new work order.
9. Record customer acceptance or changes requested only from an allowed source. The record is
   operator-copied evidence, not a customer login or digital signature.

## Non-Negotiable Boundaries

- A playbook cannot create agents, change models, add tools, queue work, dispatch work, or write to an
  external system.
- A later specialist never receives another specialist's raw output automatically.
- One stage uses one allowlisted agent and its validated crew contract.
- Every stage has its own cycle ID, role budget, queue decision, dispatch decision, evaluation, and
  proof.
- Failed, partial, or revision-required work starts a new cycle; there is no hidden retry loop.
- Secrets never belong in evidence, manifests, chat, source, or command arguments.
- Pricing is not inferred from the roster or playbook catalog.

## What Is Still Needed To Scale

1. **Legitimate retained proof:** run one owner-approved redacted mission through delivery and retain
   the exact evaluation, proof packet, and customer decision. This remains the evidence gate.
2. **Tenant identity:** replace the shared internal passcode experience with authenticated tenant
   operators, role-based access, session expiry, and customer-authenticated acceptance.
3. **Durable missions:** persist playbook plans and stage links so the server can verify accepted
   evaluation and handoff eligibility before preparing the next stage.
4. **Async execution:** after proof, add an opt-in durable dispatcher, leases, bounded retries,
   evidence-retention expiry, and dead-letter recovery. Keep recursive delegation disabled.
5. **Tracing and evals:** retain structured stage, handoff, tool, guardrail, latency, cost, and verdict
   events; build regression datasets for each playbook before broader autonomy.
6. **Usage and commercial controls:** meter role calls and provider cost per client and playbook, then
   define plan entitlements and measured service targets from real samples.
7. **Connector permissions:** add tenant-scoped OAuth and explicit action-specific approvals before
   any new external write capability.
8. **Customer onboarding:** provide guided source templates, sample data, empty-state help, recovery,
   and a first-run checklist for each playbook.

These are ordered gates. More agents without retained proof, tenant isolation, durable mission state,
and eval coverage would increase operational risk without making the product more sellable.
