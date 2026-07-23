# HQ now

Updated: 2026-07-23
Owner: founder / CEO
Mode: guarded release; canonical `__release.json` metadata is the live authority

## North-star outcome

Prove one real workflow in which SuperMega keeps the operating record, a responsible owner resolves exceptions, and the business measures the result.

## Current outcomes

1. **Company system** — validate the simpler Today, Teams, and Operations shell plus one bounded internal agent handoff.
2. **Product** — validate the Website-to-Commerce order flow without expanding primary navigation.
3. **Pilot** — choose one Commerce or Production workflow with an owner, baseline, target, authority boundary, and evidence plan.
4. **Managed mode** — keep activation locked until tenant data, identity, membership, audit, recovery, runtime role, and source coverage pass.

## Current system

- Today, Teams, and Operations are the only primary destinations; Settings is a utility.
- Teams has one team picker and three views: Work, Agents, and Review. Agent records carry a role, human owner, bounded capabilities, one assignment, evidence, and a human approval boundary. They coordinate work only.
- Website is the only lazy-loaded local product prototype at `/products/website/`; its approved order intake lands inside Commerce Orders.
- Commerce and Production remain `/operations/commerce/` and `/operations/production/`; legacy Shop, Plant, and Ecommerce paths redirect into those operating modules.
- Product uses Discover, Define, Build, Release, and Learn. One shared manifest defines six executable Commerce/Production workflow profiles.
- The browser-local trial is not a customer system of record. Sends, payments, publishing, merges, deployments, access changes, and production writes require responsible human authority.
- Vercel canonical mappings remain `app.supermega.dev` → `megaos`, and `supermega.dev` plus `www.supermega.dev` → `supermega-public`.
- The OneDrive `codex_hq` archive is unpinned/offline and is not current authority.

## Latest verification

- Candidate identity is brand `jade-v1-2026-07`, context `2026-07-23.3`, and catalogue `2026-07-23.3`.
- Product-inclusive lint, strict TypeScript, HQ, one product prototype, one compatibility redirect, six workflow profiles, 12 order-completion checks, 34 Commerce state checks, 51 Production state checks, 48 release checks, 40 security checks, eleven Vercel contract checks, and six RLS checks pass locally.
- Core desktop and 390 px paths have no horizontal overflow. Production output, issue creation, attributed resolution, machine-state change, reload persistence, confirmation focus, and all four event types pass in the local browser with no console error.
- Team evidence and Product decisions require an attributed human reviewer. Agent handoffs cannot satisfy terminal authority.
- Website-to-Commerce intake remains non-PII and operator-gated. Its locked completion produces one idempotent `ready_for_confirmation` record; a separate accountable confirmation rechecks price and stock, inserts it once, and reserves local stock without a customer send, payment initiation, delivery request, or external write. Commerce v2 then serializes local writes, reconciles payment with human evidence, releases stock only from one proven reservation, preserves refund-due exceptions, and fails closed on malformed or unwritable storage.
- Production v2 serializes local writes into one revisioned event record, preserves valid v1 records without fabricated history, rejects silent output clamping and stale machine changes, and retains issue-resolution proof. It remains browser-local and does not control machinery.
- Production release still requires review, owner authorization, and the coordinated `main` workflow; a local pass or pushed branch is not a release.

## Blockers

- Managed activation still needs a separately validated runtime database URL, v1→v2 migration rehearsal on non-production data, backup/restore evidence, a high-entropy signing secret, and explicit writes enablement.
- No pilot customer, managed tenant, revenue result, or time-saved baseline is verified.
- Vercel audit reports obsolete/unused variable names and separate legacy hosts; no value is exposed and no cleanup or retirement is authorized here.
- Durable workflow, AI SDK, telemetry, dense-table, and realtime candidates remain adoption-gated.

## Decisions in force

- One company system; no public agent catalogue, internal-console product, or demo-domain collection.
- Company system, Commerce, and Production are operating entries. Website remains the one labelled local product prototype.
- AI prepares bounded work from approved records; responsible owners retain consequential authority.
- Agent Teams is an internal coordination module, not proof of an autonomous runtime.
- Do not add another CRM, queue, orchestrator, or agent runtime until a measured gap proves it necessary.

## Next evidence

- Repeat the Website-to-Commerce flow with one named user through reservation, payment reconciliation, fulfilment, one controlled cancellation, and stock-ledger review; measure handling time and correction effort.
- Run one named shift user through output, issue, resolution, and machine-state records; measure correction time and compare the event record with the source shift sheet.
- Exercise one agent assignment from accountable work through attributed evidence and human review.
- Complete one pilot definition and run its acceptance test.
- Activate managed persistence only after migration, RLS, backup, and restore rehearsal passes on non-production data.
