# Agent Company Operating Guide

SuperMega Agent Company sells reviewed business outcomes, not an unbounded swarm. The protected
console combines a fixed specialist roster, fixed playbooks, exact work-order plans, explicit model
spend, internal evaluation, delivery proof, and a separately recorded customer decision.

## What Is Available

- 12 fixed registered specialist identities across operations, finance, revenue, growth, delivery,
  assurance, service, knowledge, and procurement.
- 8 fixed outcome playbooks.
- 15 validated crew capability contracts with structured outputs and no send, pay, or
  external-write tool. Analytics is owned by Operations, document extraction by Knowledge, and
  meeting capture by Project Control instead of creating three duplicate identities.
- Demand-driven execution that scales to zero, allows at most four active company assignments, and
  allows at most two registered specialists in one Kernel cycle.
- An all-crew adversarial security evaluation that poisons both owner intake and model-to-model
  handoffs before every release.
- Durable client-bound work orders with exact plan hashes and evidence fingerprints.
- Durable client-bound missions with revision-bound state transitions and server-verified stage gates.
- Explicit queue, dispatch, cancel-and-scrub, internal evaluation, proof, and review controls.
- Metadata-only health and workforce utilization for 7, 30, or 90 days.
- Owner-issued, one-use sign-in codes; tenant-bound operator, reviewer, viewer, and exact-result
  customer-review sessions; and an owner-only active-access inventory with targeted code/session
  revocation.

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

## First Sign-In

The owner opens `https://console.supermega.dev/#company`, enters the owner key in the header, and
uses **Workspace access** to create a code for one client, operator ID, role, and session duration.
The owner key remains only in that browser tab. Send the displayed code through an approved private
channel; it expires after 15 minutes and stops working immediately after its first successful use.

The operator opens the same URL, enters the code, and selects **Sign in**. The browser receives an
HttpOnly, Secure, SameSite session cookie. The code and session token are not stored in page storage,
and the client ID is locked to the signed-in tenant. Use **Sign out** when the shift or task is done.
The owner can return to **Active access** to refresh the tenant's active sessions and pending codes
and revoke one entry. The list exposes identity, role, and expiry metadata only.

For a completed, unreviewed work order, the owner can instead create a **customer review code** from
that order. That one-use code is bound to the tenant, work-order ID, and exact result hash. The
customer session exposes only the delivered result, result hash, and decision record, and can record one
immutable acceptance or changes-requested decision. It cannot inspect the workspace plan, source-evidence
fingerprints, or internal delivery metadata. It grants no workspace access and proves possession of the owner-issued code only; it is not
SSO, MFA, or a legal signature.

Roles are deliberately narrow:

| Role | Access |
|---|---|
| Operator | Plan, create, queue, dispatch, cancel, evaluate, review, and read |
| Reviewer | Plan, evaluate, record review, advance approved handoffs, and read; no dispatch |
| Viewer | Read missions, work orders, proof, and operating reports only |
| Customer | View one exact delivered proof and record one immutable decision; no workspace access |

## Operator Sequence

1. Sign in through **Workspace access**. The owner may use the owner key only for bootstrap and
   issuing codes; operators never need it.
2. Confirm the locked client ID, choose a playbook, keep or replace the generated mission ID, and select
   **Plan delegation**. This is plan-only and makes no model call.
3. Review every stage, specialist, role budget, output contract, handoff gate, mission ID, and plan
   hash.
4. Confirm the exact plan and select **Create durable mission**. This stores plan metadata only and
   makes no model call.
5. Open the mission and select **Prepare stage 1**. Add only approved evidence for that specialist.
6. Plan the cycle, review the exact client, evidence, assignment, and budget, then queue it. Queueing
   stores the plan but makes no model call.
7. Open the queued order, review its plan hash and evidence fingerprints, then explicitly dispatch.
8. Record the immutable internal checklist evaluation and download the delivery proof.
9. Return to the mission. For a later stage, provide only the reviewed redacted handoff package and
   select **Verify & unlock next stage**. The server verifies the exact terminal result, work-order
   plan hash, accepted evaluation, mission revision, and handoff fingerprint before unlocking one
   stage. The mission record stores the fingerprint and byte count, never the raw handoff.
10. Record customer acceptance or changes requested either from an allowed external source as
    operator-copied evidence, or by issuing a customer review code from the exact completed order. The
    customer-code record proves tenant-bound code possession only, not SSO, MFA, or a legal signature.

## Non-Negotiable Boundaries

- A playbook cannot create agents, change models, add tools, queue work, dispatch work, or write to an
  external system.
- A later specialist never receives another specialist's raw output automatically.
- One stage uses one allowlisted agent and its validated crew contract.
- Inside a crew, every role receives untrusted data in the user message only. Each intermediate
  handoff is sanitized again, and the runtime exposes no shell, browser, connector, memory, send,
  payment, or write tool.
- Final crew output is an exact allowlist: missing and undeclared top-level fields both fail closed.
  A crew is capped at 8 roles and 24 output fields before any model call. Untrusted intake and each
  handoff are capped at 12,000 characters and 16 KiB; oversized data fails instead of being silently
  truncated.
- Provider error text is never returned. Completed specialist results carry content-free runtime
  guardrail metadata so the work-order proof can show which boundary was applied without exposing
  evidence or model output.
- Every stage has its own cycle ID, role budget, queue decision, dispatch decision, evaluation, and
  proof.
- Mission transitions compare status, plan hash, and a monotonic revision atomically. A stale or
  concurrent operator cannot unlock the same stage twice.
- The first stage is the only initially ready stage. Every later stage requires the exact previous
  work order, terminal result hash, accepted four-check evaluation, and reviewed handoff digest.
- Failed, partial, or revision-required work starts a new cycle; there is no hidden retry loop.
- Secrets never belong in evidence, manifests, chat, source, or command arguments.
- Only owner bootstrap access can list or revoke tenant access. Operator sessions cannot administer
  sessions or pending codes, and revocation uses an atomic stored-record transition.
- Pricing is not inferred from the roster or playbook catalog.

## What Is Still Needed To Scale

1. **Legitimate retained proof:** run one owner-approved redacted mission through delivery and retain
   the exact evaluation, proof packet, and customer decision. This remains the evidence gate.
2. **Identity administration:** tenant-bound operator, reviewer, viewer, and exact-result customer
   review sessions plus owner-only active-access listing and revocation are live. Add recovery and
   SSO/MFA where required; customer-code possession remains narrower than a tenant identity provider.
3. **Async execution:** after proof, add an opt-in durable dispatcher, leases, bounded retries,
   evidence-retention expiry, and dead-letter recovery. Keep recursive delegation disabled.
4. **Tracing and evals:** the deterministic all-crew security suite now covers poisoned input,
   poisoned handoffs, tool absence, output smuggling, provider-error leakage, and shape limits. After
   the first retained proof, add model-backed accuracy datasets and retain structured stage, handoff,
   guardrail, latency, cost, and verdict events for every playbook.
5. **Usage and commercial controls:** meter role calls and provider cost per client and playbook, then
   define plan entitlements and measured service targets from real samples.
6. **Connector permissions:** add tenant-scoped OAuth and explicit action-specific approvals before
   any new external write capability.
7. **Customer onboarding:** provide guided source templates, sample data, empty-state help, recovery,
   and a first-run checklist for each playbook.

These are ordered gates. More agents without retained proof, tenant isolation, and eval coverage
would increase operational risk without making the product more sellable.
