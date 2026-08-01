# SuperMega agent operating architecture

This directory contains the machine-readable workforce registry used by the internal SuperMega control surfaces. It is not a second application, a customer product, or evidence that every registered specialist is running.

## Runtime authority

The active managed runtime is the queue and governance path in `mark1_pilot/agent_governance.py`, `mark1_pilot/enterprise_store.py`, `supermega_runtime/cloud_runtime.py`, and the authenticated API boundary. The old OpenManus/LangGraph/AWS compose sketch is retired and must not be deployed.

Registry size and execution capacity are separate:

- registered specialists are reusable role definitions and consume no compute by themselves;
- no queued work means zero active execution;
- one assignment may run inside the single admitted company cycle;
- one job family may have only one in-flight reservation;
- the queue, daily runs, daily work units, batch size, retries, and lease duration are bounded;
- every worker claim receives a short-lived signed budget grant and one consumable reservation;
- idempotency, lease expiry, audit records, and human approval boundaries fail closed.

`agent_os/workforce/supermega_build_workforce.json` is the sole machine-readable company capacity contract. The default workspace links to it instead of repeating limits. The ceiling is twelve dormant roles, one cycle with one active specialist, and one waiting batch job; historical 175- or 256-role manifests are rejected rather than treated as a dormant company.

## Small company model

SuperMega has four internal operating teams:

1. Product — customer evidence, portfolio, acceptance, and learning.
2. Engineering — implementation, verification, security, incidents, and releases.
3. Growth — positioning, onboarding, qualified leads, and draft communications.
4. Finance / Risk — spend, privacy, access, exceptions, and approval evidence.

The customer portfolio remains Shop, Plant, Website, and Ecommerce. AI assistance is a shared capability. Agent teams live under HQ at `/work/?view=agents`; they are not additional products.

## Consequential-action boundary

Agents may inspect approved sources, prepare drafts, make bounded local changes, run tests, and assemble evidence. They may not independently send messages, spend money, change access, expose data, publish, merge, deploy, alter domains, enable production writes, execute payments/refunds, or control equipment.

Every consequential action requires an attributed human decision with scope, evidence, and time. An executor cannot waive a failed verification gate or approve its own release.

## Security baseline

- Secrets stay server-side and budget-signing secrets contain at least 32 UTF-8 bytes.
- Customer and operational data are tenant-scoped with deny-by-default authorization.
- Storage buckets are private by default; anonymous, broad authenticated, and cross-tenant listing are forbidden. A working individual file URL is not privacy proof: release evidence must include bucket inventory, listing denial, and short-lived purpose-bound access after authorization.
- Untrusted files, webpages, prompts, and connector content never become instructions or canonical memory without validation and provenance.
- Logs are structured and bounded; they exclude credentials and raw customer payloads.
- Vercel releases require immutable commit identity, preflight checks, rollback evidence, and a bounded post-deploy error scan. Observability configuration is an owner-gated infrastructure change.

## Operating loop

`signal → one owner → bounded work → independent verification → human gate → release or rollback → measured learning`

Scale comes from reusable templates and demand-driven execution, not from keeping idle agents alive.
