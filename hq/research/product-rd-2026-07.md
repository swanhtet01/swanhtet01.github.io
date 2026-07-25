# SuperMega product R&D brief — July 2026

Status: superseded in part by the founder's 2026-07-24 portfolio correction

Current interpretation: this brief remains useful research and implementation evidence, but its decision to make Commerce and Production public product names and retire Ecommerce is no longer authority. The current customer map is Shop, Plant, Website, and Ecommerce. Bounded AI assistance is shared infrastructure, not a fifth product. Commerce and Production remain internal runtime identifiers; Ecommerce owns the customer storefront and order-intent experience while Shop owns the operating record.

Evidence basis: released `7bb2c72973473d5cc10d9a89849065b22b9f18fa`, repository authority, and the shared “Curating Dev Resources” conversation

Prepared: 2026-07-22

Decision owner: founder / product lead

## Executive recommendation

Build depth in this corrected order:

1. **Shop and Plant identity and depth** — restore the founder-selected customer names and canonical slash routes while preserving the stable Commerce and Production runtime contracts.
2. **Website product** — prove a repeatable, evidence-backed website-delivery workflow before claiming customer or production success.
3. **Ecommerce product** — rebuild only the customer storefront, product, cart, and structured order-intent layer; hand accountable operations to Shop.
4. **Shared AI assistance** — make Order Intake the first bounded draft-and-review capability inside the products, then add Website Brief and Plant Shift Handoff only after the same evaluation gate passes.

This order preserves the current compact topology:

| Concern | Keep | Do not add now |
| --- | --- | --- |
| Public surface | `supermega.dev`: `/`, `/contact/`, `/privacy/` | A page per feature, public agent pages, public pricing theatre |
| Product app | One shell with `/shop/`, `/plant/`, `/website/`, and `/ecommerce/`; `/agents/` is compatibility-only for HQ delegated roles | Separate domains, duplicate back offices, or a new deployment authority |
| Product authority | Shop, Plant, Website, and Ecommerce; bounded AI assistance is shared infrastructure and internal HQ is not another customer product | Claims that a prototype is launched, managed, integrated, autonomous, or customer-proven |
| Data | Browser-local truthful demos; gated `/api/trial/v1`; private Postgres/Supabase state, events, approvals | A second CRM, database, queue, or direct browser-to-privileged database path |
| Release | The paired public/app candidate, promotion, verification, and rollback workflow | Local production deploys, a third Vercel project, agent-owned promotion |
| AI | Approved inputs, structured drafts, provenance, named human decisions | External sends, payments, publishing, access changes, machine control, production writes |

The implementation target is therefore **four complete products plus one evaluated Order Intake capability inside them**, not a fifth product or separate back office.

## Source availability and interpretation

The shared direction URL, [“Curating Dev Resources”](https://chatgpt.com/share/6a60e4af-9424-83ec-bd7e-cbfd865984f7), was rendered successfully on 2026-07-22. Its useful instruction is to stop accumulating generic resource lists and instead maintain a compact reality pack grounded in the actual codebase: current product, founder constraints, user flows, examples of good and bad output, ownership, environment map, evidence, and evaluation cases.

SuperMega applies that guidance through the existing compact authority files rather than importing the suggested 50-file operating-system skeleton. `CURRENT.md`, `hq/NOW.md`, `hq/portfolio.json`, this research brief, implemented routes, tests, and release evidence are the reality pack. New files are added only when they own a durable decision, contract, or evaluation that cannot live clearly in those sources.

Repository authority takes precedence in this order:

1. [`CURRENT.md`](../../CURRENT.md), [`site-manifest.json`](../../site-manifest.json), and [`hq/portfolio.json`](../portfolio.json).
2. The implemented routes and records in [`showroom/src/App.tsx`](../../showroom/src/App.tsx), [`showroom/src/core/CoreApp.tsx`](../../showroom/src/core/CoreApp.tsx), and [`showroom/src/core/team-work.ts`](../../showroom/src/core/team-work.ts).
3. Runtime, data, approval, and release contracts.
4. Older `Super Mega Inc`, `agent_os`, `hyper_unicorn`, `kernel`, and sales/runbook material as historical traces only.

Historical traces repeatedly support useful constraints—prove a wedge, avoid rebuilding all ecommerce before a buyer, package outcomes rather than vague agents—but their old product catalogues, cloud assumptions, and agent-marketplace language are not current architecture.

## Current architecture readout

| Layer | What exists at this head | R&D implication |
| --- | --- | --- |
| Public | A Node-generated static site driven by `site-manifest.json`; three public routes; exactly Commerce and Production in the public catalogue; retired Shop, Plant, product, and agent URLs redirect | Reuse the manifest-and-generator discipline. Do not add Website to the public catalogue until its lifecycle gate passes. |
| App | React 19, React Router 7, and Vite 7; compact primary navigation plus two lazy `/products/` prototypes; Commerce tabs are Today, Orders, Inventory; Production tabs are Today, Production, Issues & equipment | Keep prototypes slash-addressable and code-split while their delivery records remain connected to Product and Commerce. |
| Product lifecycle | Product work uses Discover, Define, Build, Release, Learn with owner, outcome, evidence, acceptance, decision, and release checks | Website should be the next fully exercised lifecycle profile, not a detached builder. |
| Commerce | Browser-local items, single-line orders, channel, payment label, total, fulfilment status, stock decrement, receipts, daily close, and accountable before/after actions | The demo is real local state, but it is not ecommerce infrastructure or a system of record. Separate order intent, confirmation, reservation, payment reconciliation, and fulfilment. |
| Production | Browser-local jobs, target/good output, issues, machine observations, and attributable actions | Improve shift, output, quality, downtime, and handoff records. Never imply telemetry or equipment control. |
| Managed trial | FastAPI/Pydantic API; private `workspace_state`, immutable `workspace_events`, memberships, capabilities, and `decision_packet.v1` approvals; additive schema v2 maps Shop/Plant to Commerce/Production | A local prototype may use versioned surface state. Managed order/stock concurrency needs transactional domain commands before activation. |
| Hosted agents | A bounded scheduler exposes queue and daily cycles for task triage, ops watch, founder brief, and release watch, with no external-send or money authority | Do not create another runtime for the first demos. Agent output should enter existing records and approvals. |
| HQ | `hq/NOW.md` plus machine-readable portfolio and explicit research gates | This document is research input. Portfolio changes require a separate accepted decision and HQ contract update. |
| Release | One GitHub workflow builds immutable public and app candidates, verifies matching identity, promotes both, verifies both, and rolls back the pair on failure | Every eventual app/public change must preserve the paired identity and release checks. Customer-site publishing needs its own future authority; it cannot be smuggled into this workflow. |

### Truthful baseline gaps

- The app’s operational state is still browser-local by default.
- Commerce orders contain one item, use one combined status, decrement stock at confirmation, and do not model cancellation, reservation, reconciliation, or delivery exceptions separately.
- Production jobs contain target and good output but no shift, scrap, lot, downtime interval, quality hold, or maintenance work order.
- Managed persistence is gated and generic; the repository itself says it is not yet a customer system of record.
- The public site can qualify a workflow, but it is not yet a productized customer-website workflow or ecommerce storefront.
- No current pilot customer, revenue result, conversion baseline, time-saved baseline, or managed tenant is verified.

These are product opportunities only when the demo and claims continue to state those limits.

## Product sequence and route ownership

| Priority | R&D product slice | Existing owner surface | First truthful demo | Graduation evidence |
| --- | --- | --- | --- | --- |
| 1 | Website delivery | `/website/` plus the existing Product lifecycle | Approved sample brief → finite local preview → QA/release packet | One named user accepts the workflow and a real preview against explicit criteria |
| 2 | Ecommerce and orders capability | `/operations/commerce/?tab=orders` | Approved website/chat order intent → operator-confirmed order → reserved stock → fulfilment close | Idempotent, transactional managed pilot with measured handling time and completion |
| 3a | Shop depth (Commerce) | Existing Commerce tabs | Cancellation/release, reconciliation, exception, and daily-close evidence | One operator runs a full day with zero unexplained stock variance |
| 3b | Plant depth (Production) | Existing Production tabs | Shift output, issue ownership, machine observation, and evidence-backed handoff | One shift closes with traceable output and all exceptions owned |
| 4 | Embedded AI demos | Product, Commerce, and Production panels | Website Brief, Order Intake, and Shift Handoff drafts | Golden-set quality, provenance, zero side effects, and named user usefulness |

## Priority 1 — Website product

### Problem

Owner-led businesses often need a credible website, clear offer, contact or order intake, and a safe path to publish, but they do not have a product manager, content system, QA discipline, or release evidence. A conventional custom build can turn into unbounded design work, while a generic site builder does not connect the customer signal to accountable delivery and follow-up.

### Target user

- Primary buyer: founder or business owner of a Myanmar SME.
- Daily operator: owner, marketing/generalist staff member, or SuperMega delivery operator.
- Initial fit: one business, one primary offer, one conversion action, three or fewer launch pages, and a named approver.
- Poor fit: media publishers, marketplaces, complex membership sites, regulated transactions, or organizations asking for a custom CMS before they have approved content.

### Product promise

Turn an approved business brief into a reviewable website release packet: page plan, content, assets, conversion path, privacy boundary, responsive QA, and named release decision. The first product is the **delivery workflow and evidence**, not a drag-and-drop page builder.

### Must-have modules

1. **Website brief** — business goal, target audience, offer, proof, primary call to action, exclusions, owner, baseline, and acceptance rule.
2. **Content and source register** — approved copy, claims, asset references, owner, provenance, visibility, verification state, and expiry/review date.
3. **Page plan** — Home, Contact/Order, Privacy by default; one optional Offer page only when the brief requires it.
4. **Theme contract** — logo, colors, typography, spacing, image treatment, and accessibility-safe contrast; configuration rather than arbitrary per-page styling.
5. **Preview and responsive review** — desktop and 390 px mobile, keyboard path, form labels/errors, metadata, canonical links, and broken-link checks.
6. **Conversion handoff** — contact request or order intent enters a controlled record with source URL and idempotency key; submission alone does not create an account, automation, or confirmed order.
7. **Release packet** — candidate identity, source digest, test evidence, approver, decision note, domain/DNS plan, rollback target, and post-release check.

### Minimum record contract: `website_project.v1`

| Field group | Required content |
| --- | --- |
| Identity | `project_id`, `workspace_id`, version, owner, named human reviewer |
| Outcome | problem, audience, primary offer, CTA, baseline, target, acceptance rule |
| Pages | stable page IDs, purpose, required sections, status; maximum four in the first release |
| Content | claim text, source reference, captured time, verification state, visibility, optional digest |
| Assets | reference only, rights/approval status, alt text, dimensions; no opaque bulk upload |
| Conversion | form type, fields, consent/privacy copy, destination record type, idempotency behavior |
| Quality | viewport checks, WCAG review, performance result type, link/form checks, known exceptions |
| Release | candidate ID, commit or artifact digest, approval, release note, rollback reference, live verification |

Do not store HTML as the authority. Store structured intent and approved content; generate the preview artifact deterministically.

### Five-minute demo

1. Select a synthetic “local retailer” fixture.
2. Review its goal, audience, proof, CTA, and authority boundary.
3. Generate or load a deterministic three-page plan and preview summary.
4. Open the responsive, accessibility, links, and form checklist.
5. Prepare a `decision_packet.v1` asking a named human to accept or reject the candidate.

The demo may say “local preview prepared.” It may not say “website launched,” “SEO achieved,” “leads generated,” or “domain connected.”

### Data and approval boundaries

- Use synthetic data or copy/assets explicitly supplied and approved for the named project.
- Record the source and visibility of every factual claim. Unknown or unsupported claims remain visibly unresolved.
- Do not scrape a client, competitor, review site, or social profile into public copy without an approved source and rights review.
- Public contact data is personal data: collect the minimum fields, disclose purpose, and do not reuse it for model training or outreach by default.
- Domain, DNS, analytics, email delivery, public publishing, deletion, and external account changes require owner approval and auditable execution.
- A local preview is not a live site. A live candidate is not production. Production is not successful until the canonical URL, form path, release identity, and rollback evidence are verified.
- Customer websites are outside the current two-domain release authority. Production graduation requires a separate, reviewed release contract with immutable artifacts, explicit owner approval, rollback, and secret isolation.

### Lifecycle milestones

| Stage | Deliverable | Exit gate |
| --- | --- | --- |
| Discover | One named user, current workflow, approved source sample, baseline, and desired conversion | User confirms the problem and agrees to one primary CTA |
| Define | `website_project.v1`, page cap, content/source rules, privacy boundary, acceptance criteria | Named product reviewer accepts scope and anti-bloat cuts |
| Build | Product-workspace profile, fixture, deterministic preview artifact, QA and release packet | All local acceptance checks pass without external writes |
| Release candidate | Immutable preview, candidate identity, owner review, DNS/publish plan, rollback plan | Named owner approves the exact artifact and production authority exists |
| Learn | Field performance, qualified conversion, operator effort, defects, support burden | Continue only if the user accepts the result and one metric improves |

### Measurable acceptance criteria

- A new operator can take the supplied fixture from brief to review packet in **five minutes or less** without leaving the existing app route family.
- The launch page set is **three pages by default and never more than four** in the first release.
- Every public factual claim has a source reference and verification state; **zero unsupported claims** can enter an approved candidate.
- At 390 px and 1280 px, all launch pages have **zero horizontal overflow**, usable focus order, labelled controls, visible error/status messages, and no critical automated accessibility findings. Automated checks do not by themselves justify a WCAG conformance claim.
- The manual acceptance checklist covers WCAG 2.2 Level AA concerns relevant to the page set, including keyboard use, focus visibility, contrast, reflow, target size, labels, errors, and status messages.
- Before real traffic exists, performance is described as synthetic. After sufficient field traffic, the 75th percentile target is LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.1.
- Contact/order-intent retries with the same idempotency key create **one** record; changed payload replays conflict visibly.
- Candidate metadata identifies the exact source/artifact version, and every production release has a tested rollback reference.

### Implementation touchpoints

- Model the R&D work first in the existing Product work contract in `team-work.ts` and `TeamWorkspace.tsx`; do not create a top-level route.
- Reuse the explicit manifest validation and deterministic static-output pattern from `site-manifest.json` and `tools/create_public_vercel_output.mjs` for a fixture preview. Do not turn the SuperMega public generator into a multi-tenant CMS.
- Reuse `decision_packet.v1` for candidate approval and existing evidence records for content/QA provenance.
- Do not edit `hq/portfolio.json` or advertise Website publicly until Discover, Define, and one accepted preview are complete.

### Anti-bloat cuts

- No drag-and-drop canvas, plugin marketplace, general CMS, theme store, blog engine, membership system, localization engine, or arbitrary code injection.
- No new framework, app, domain, database, or Vercel project for the local prototype.
- No automatic publishing, DNS mutation, analytics installation, email campaign, or claim generation.
- No bespoke page component unless it is required by the named acceptance journey and reusable in a second approved project.
- If two discovery cycles produce no named user, approved source pack, or primary conversion metric, stop the Website work and retain only the reusable research contract.

## Priority 2 — Ecommerce & Orders

### Problem

Orders arrive from websites, Messenger, Viber, phone, and walk-in channels, but a message is not an order record. The current local Commerce demo proves capture, stock checking, status progression, receipts, and close, yet it combines concerns that must be separate before managed operation: order intent, confirmation, stock reservation, payment reconciliation, fulfilment, cancellation, and evidence.

### Target user

- Primary buyer: owner or commerce lead at a small retail, wholesale, restaurant, or social-commerce business.
- Daily operator: order desk, counter staff, stock keeper, or fulfilment lead.
- Initial fit: one branch, one currency, one stock location, a small catalogue, and human-confirmed orders.
- Poor fit: marketplace settlement, complex tax jurisdictions, subscriptions, multi-vendor payouts, advanced shipping rating, or high-volume warehouse automation.

### Product promise

Convert an untrusted channel or website submission into a controlled order record, reserve available stock exactly once, guide fulfilment, reconcile the chosen payment method, close the day, and preserve who confirmed each consequential change.

### Must-have modules

1. **Order intake** — channel/source reference, customer reference, one or more line items, notes, requested fulfilment, idempotency key, and missing-field state.
2. **Catalogue and price snapshot** — SKU, display name, active flag, unit price in integer minor units, currency, and price captured on the order.
3. **Order state machine** — `draft → awaiting_confirmation → confirmed → preparing → ready → completed`, with explicit cancellation from allowed states.
4. **Stock ledger** — on-hand, reserve, release, receive, and fulfil movements; available stock is derived, not independently edited.
5. **Payment record** — method, expected amount, status (`unrecorded`, `pending`, `reconciled`, `failed`), reference, and named reconciler. It is not a payment processor.
6. **Fulfilment and exception queue** — owner, due time, status, delivery/pickup reference, reason, and next action.
7. **Daily close** — completed orders, reconciled amount, unresolved payment/stock exceptions, operator, evidence, and immutable close snapshot.
8. **Audit and approval** — command ID, actor kind, before/after, reason, evidence reference, immutable event, and human approval where a policy requires it.

### Minimum contracts

| Contract | Minimum fields and invariants |
| --- | --- |
| `order.v1` | Workspace/order ID, source and source reference, idempotency key, customer reference, lines, currency, immutable price snapshot, order/payment/fulfilment status, created/confirmed actor and time |
| `stock_movement.v1` | Movement ID, SKU/location, type, positive quantity, order/reference ID, version, actor, reason, evidence, captured time; append-only |
| `payment_record.v1` | Order ID, method label, expected and observed integer amounts, currency, status, external reference if supplied, reconciler, evidence; no secret or wallet credential |
| `commerce_close.v1` | Business date, operator, order count/value by terminal status, reconciled amount, exception IDs, source versions, decision/approval reference |

Website intake creates `order.v1` in `draft` or `awaiting_confirmation`. It never confirms the order, reserves stock, charges money, or sends a message by itself.

### Three-minute demo

1. Paste or select an approved website/chat fixture.
2. Review a structured order draft with source references and visibly missing fields.
3. A named operator confirms the order and reason; stock is reserved once.
4. Advance fulfilment and record a mock payment reference.
5. Complete and show the close/audit record.

The demo must keep “mock,” “local,” and “not sent/not charged” labels visible. Revenue is “recorded order value” until completion and reconciliation; it is not verified revenue.

### Data and approval boundaries

- Treat website/chat input as untrusted. Normalize and validate it before any state transition.
- Minimize customer PII. Use a customer reference for the demo; do not require full address, phone, or message history unless the accepted workflow needs it.
- Use integer minor units plus an ISO currency code; do not use binary floating-point values as the managed money authority.
- Confirmation, cancellation after preparation, reconciliation, refund, external message, and payment initiation remain human/policy gated.
- Reserve and release stock in one database transaction with optimistic version or row locking. A successful HTTP response without the expected row/version change is failure.
- Preserve source text or a digest/reference according to the agreed retention policy; do not hide uncertainty introduced by extraction.
- Never put provider secrets, private tokens, or service-role credentials in the React bundle.

### Lifecycle milestones

| Stage | Deliverable | Exit gate |
| --- | --- | --- |
| Discover | One channel, current order record, named operator, baseline handling time/error rate | Buyer accepts the bounded order journey |
| Define | Four contracts above, state-transition table, idempotency rule, data/approval map | Product and risk reviewers accept invariants |
| Build local | Multi-line fixture order, reservation ledger, cancellation/release, payment status, close evidence | Deterministic local tests and five-minute operator test pass |
| Managed pilot | Transactional private-schema commands, typed membership/capability, immutable events, backup/restore evidence | Non-production migration, concurrency, RLS, identity, and recovery gates pass |
| Connector | One approved Website or existing merchant/channel adapter | Adapter passes contract tests and cannot bypass confirmation |
| Learn | Handling time, completion, exception, stock variance, and operator effort | Continue only on measured improvement and acceptable support burden |

### Measurable acceptance criteria

- The same idempotency key and same payload produce one order; a changed payload under the same key returns a visible conflict.
- Concurrent attempts cannot reserve more than available stock; the losing command returns a typed stock conflict and creates no partial state.
- Every state change is accepted or rejected by a tested transition table; **100% of terminal and cancellation transitions** have actor, reason, and event evidence.
- Order totals equal the sum of immutable line snapshots using integer arithmetic; currency is required and cannot change after confirmation.
- Cancelling an eligible order releases its remaining reservation exactly once.
- A completed order cannot imply reconciled payment unless a named operator records the matching amount/reference.
- The local demo performs **zero external sends and zero payment calls**; a network/write audit is part of its test evidence.
- In the first pilot, median order handling time, completion rate, exception rate, and stock variance all have defined baselines; at least one target improves without worsening the guardrails.

### Anti-bloat cuts

- No promotion engine, loyalty, subscriptions, marketplace, multi-vendor settlement, multi-currency pricing, tax engine, shipping-rate engine, recommendation engine, or customer account portal in v1.
- No payment gateway until merchant eligibility, reconciliation, refund, secret, webhook, dispute, and approval requirements are accepted.
- No headless commerce engine by default. If a customer already operates Shopify, integrate its supported API behind the SuperMega adapter rather than duplicating its commerce core.
- No general connector framework before one approved Website or merchant connector passes the order contract.
- No realtime layer until simultaneous operators create a measured stale-state problem.

## Priority 3 — improve Shop and Plant as the operating products

**Shop** maps to the stable internal `commerce` surface and **Plant** maps to the stable internal `production` surface in migrations and local-state normalization. Use Shop and Plant in routes, UI, HQ, release checks, and public claims. Keep the internal identifiers until a separately tested data migration provides enough value to justify changing them.

### Problems and target users

- **Shop problem:** order-desk and stock operators need one trustworthy order, reservation, payment-status, fulfilment, and close record; the current local demo proves the flow but hosted concurrency and reconciliation still require validation.
- **Shop target user:** a named order operator, stock keeper, or shop owner in a one-branch pilot.
- **Plant problem:** supervisors need shift output, issues, quality decisions, machine observations, and handoff evidence without claiming that SuperMega controls equipment or replaces MRP/SCADA.
- **Plant target user:** a shift supervisor, production lead, quality lead, or maintenance coordinator on one line or bounded workflow.

The must-have modules remain the current canonical modules. Shop deepens Orders and Stock; Plant deepens Jobs and Problems. New records should compose inside those modules before any new tab is proposed.

### Shop / Commerce next slice

Current truthful baseline: single-line local orders, five intake channels, a payment label, four fulfilment states, immediate stock decrement, simple receipts, daily-close snapshots, and human-attributed action history.

Implement in this order:

1. Split order, payment, and fulfilment statuses.
2. Add line items and immutable price snapshots.
3. Replace direct decrement with reserve/release/fulfil stock movements.
4. Add idempotent cancellation and typed exceptions.
5. Make daily close report unresolved stock/payment exceptions rather than only total order value.
6. Connect one approved Website order-intent adapter only after the above contracts pass.

Acceptance:

- Existing local fixtures migrate without silently relabelling unknown legacy customer data.
- All eight current accountable action kinds remain attributable; new cancellation/reservation actions use the same actor, reason, evidence, and before/after contract.
- One scripted operating day ends with zero negative availability, zero duplicate orders, and zero unexplained reservation balance.
- The UI still fits the current Commerce route and three-tab depth; add a bounded panel before considering another tab.

Cuts: no POS hardware programme, barcode platform, customer CRM, wholesale pricing matrix, branch transfer system, or finance ledger in this slice.

### Plant / Production next slice

Current truthful baseline: local jobs with target and capped good output, categorized issues, machine observations, and human-attributed state changes. It has no live machine connection.

Implement in this order:

1. Add shift, line, product/batch reference, and operator to each output record.
2. Record good and scrap quantities separately, with reason/evidence for scrap.
3. Add issue severity, owner, due time, containment, and close evidence.
4. Replace mutable machine status with timestamped observation events and a derived current state.
5. Add a quality hold/release decision tied to batch/lot evidence.
6. Generate a shift handoff from open jobs, holds, issues, and latest machine observations.

Acceptance:

- Good plus scrap output cannot be negative and cannot exceed the allowed job quantity without an explicit approved adjustment.
- Every open issue has severity, owner, next action, and age; every close has a named human and evidence reference.
- Machine observations display source and capture time and trigger **no equipment command**.
- Quality hold and release are distinct events; release requires a named human decision and nonblank note.
- A shift handoff lists every open critical/high issue, stale observation, and held batch, with no unsupported causal claim.
- The UI stays under the existing Production route and tabs.

Cuts: no MRP, OEE suite, SCADA, PLC/IoT control, predictive maintenance, digital twin, procurement suite, or full maintenance-management system in this slice.

## Priority 4 — usable, easy-demo AI assistance

The product should demonstrate useful AI behavior without pretending that an agent is an employee or a system of record. The smallest safe shape is:

> one approved input + one typed output + visible provenance + one named reviewer + zero side effects

### Problem, target user, and must-have modules

Product owners and operators repeatedly spend time turning approved records into page plans, order drafts, and shift briefs. Historical agent traces tried to solve this with broad catalogues and runtimes; the current product needs smaller assistance that is easy to understand, correct, and review.

The target users are the same people who own the underlying work: the Product reviewer for Website, the order operator for Commerce, and the shift supervisor for Production. Each demo requires only five shared modules: approved-input selection, typed generation, source/provenance display, human review/edit/accept-discard, and evaluation/usage evidence.

### Three embedded demos

| Demo | Approved input | Structured output | Existing surface | Explicitly forbidden |
| --- | --- | --- | --- | --- |
| Website Brief | `website_project.v1` brief and approved source register | Page plan, draft sections, missing evidence, QA checklist, `decision_packet.v1` | Product work review | Publishing, invented claims, asset scraping, DNS/domain changes |
| Order Intake | Synthetic/approved message or website order intent plus current catalogue snapshot | `order.v1` draft, source span per extracted field, missing/ambiguous fields | Commerce Orders | Confirmation, stock reservation, payment, customer reply |
| Shift Handoff | Approved jobs, outputs, issues, holds, and machine observations | `shift_handoff.v1` facts, analysis labelled separately, owner questions, decision packet | Production Today/Control | Machine commands, issue closure, quality release, unsupported diagnosis |

The existing company “Prepare brief” and `decision_packet.v1` interaction are the common review pattern. Do not create a new `/agents` route; that route intentionally redirects to the company brief.

### Demo implementation contract

- Use the official OpenAI Python SDK and Responses API directly for the first single-step demos.
- Define outputs as Pydantic models and use Structured Outputs. If a later demo calls a read-only function, use a strict JSON schema and permit at most one tool call unless an evaluated need proves otherwise.
- Version prompt, model configuration, input schema, output schema, and evaluation set. Keep model choice in server configuration, not UI copy or durable business records.
- Start with no tools: pass the bounded approved record as input and return a draft. Add a read-only tool only when the input is too large or stale to pass safely.
- Do not adopt the Agents SDK for these three demos. Reconsider only when a measured workflow needs SDK-managed multi-turn state, handoff, guardrail, or trace behavior. If adopted, disable sensitive trace content by default and document retention.
- Do not attach the demos to the hosted scheduler until synchronous, user-invoked quality and authority checks pass.

### Demo truthfulness and data boundaries

- Label every output “AI draft” and show source coverage, unresolved fields, capture time, schema version, and model/prompt version.
- A source-backed fact must point to the supplied record or span. Analysis must be labelled and must not be upgraded to verified fact by fluent wording.
- Use synthetic data by default. Customer data requires an approved purpose, field minimization, visibility classification, retention choice, and model-processing decision.
- Do not include secrets, credentials, raw payment data, private keys, full message histories, or unnecessary personal identifiers.
- Refusal, schema failure, timeout, and low-confidence extraction fail closed to a review state; they do not silently create an operational record.
- No AI result can make the terminal human decision in `decision_packet.v1`.

### Lifecycle milestones

| Stage | Deliverable | Exit gate |
| --- | --- | --- |
| Define | One schema, one fixture set, one rubric, prohibited actions, and visible truth labels per demo | Product/risk reviewer accepts the test contract |
| Offline/local evaluation | Deterministic parser/validator tests plus recorded model outputs for golden fixtures | Quality and zero-side-effect thresholds pass |
| Guided demo | User-invoked panel with review/edit/accept-discard path | Five named users can complete it without explanation or false belief |
| Pilot | Approved data policy, server key boundary, cost/latency logs, redacted observability | Owner accepts processing, support, and budget |
| Learn | Usefulness, edit distance, correction rate, completion time, failure rate, latency, cost | Keep only demos that improve the workflow without authority leakage |

### Measurable acceptance criteria

- At least **20 golden fixtures per demo**, including missing, conflicting, malicious, multilingual, and unsupported inputs.
- **100% schema-valid outputs** after SDK parsing; a parse/refusal failure produces no draft record.
- **100% source coverage** for extracted critical fields and **zero fabricated critical facts** in the golden set.
- At least **90% exact required-field accuracy** on the accepted fixture set before a guided pilot.
- **Zero external writes, sends, payments, publishing actions, access changes, or production-control calls** in automated network/tool audits.
- A user can invoke, review, correct, and accept/discard a demo in **three minutes or less**.
- Record p50/p95 latency, input/output tokens, estimated cost, schema failures, refusals, and correction rate. Set a production SLA only after measured pilot data.
- Every accepted draft records the named human action; raw model output alone never changes the managed record.

### Anti-bloat cuts

- No agent marketplace, employee avatars, public agent catalogue, multi-agent swarm, autonomous browser, general memory system, voice layer, or “24/7 employee” claim.
- No Agents SDK, LangGraph, PydanticAI, or second orchestrator for a single structured response.
- No tool with side effects in the first demos.
- No background scheduling until user-invoked value and safe failure behavior are proven.
- No fourth demo until one of the first three reaches the guided-pilot acceptance threshold.

## Recommended current technical resources

The safest recommendation is to retain the current stack and add only one R&D dependency when the AI demo is implemented.

| Decision | Library/framework | Role and reason | Adoption gate |
| --- | --- | --- | --- |
| Keep | React 19 + React Router 7 | Existing compact SPA, route aliases, accessible components, and internal views already work. A framework migration adds release risk but no required product capability. | Continue current lint, responsive, route, and release tests. |
| Keep | Vite 7 | Existing build produces the static app artifact used by the guarded release. Current Vite production builds target broadly available modern browsers and support static hosting. | Add legacy support only from measured target-browser evidence. |
| Keep | Native CSS and current components | The app already meets the compact desktop/mobile contract. A component system would add design and dependency surface before repeated UI needs exist. | Extract a component only after the same interaction appears three times. |
| Keep | FastAPI 0.139 + Pydantic 2.13 | Existing runtime and strict request models align domain validation with OpenAPI/JSON Schema. Use Pydantic for Website, order, payment, stock, and agent-output contracts. | Preserve strict requests, typed errors, and API tests. |
| Keep | Psycopg 3 + Postgres transactions | Existing server path can enforce idempotency, row/version checks, append-only events, and atomic order/stock changes without an ORM migration. | Managed non-production concurrency and recovery tests. |
| Keep, gated | Supabase-hosted Postgres in `app_private` | Existing private schema, dedicated backend role, RLS, immutable events, and approvals match the authority model. Current Supabase guidance separates explicit grants from RLS; server-only tables should stay outside the exposed Data API. | Rehearse v1 then v2 on non-production; verify Postgres version/extensions, grants, non-`BYPASSRLS` role, backup, restore, identity, and write flag. |
| Add for R&D only | Official `openai` Python SDK + Responses API | It is the recommended OpenAI primitive for new agent-like integrations and supports structured outputs and function tools. Direct use is simpler than a second orchestration runtime for one-step drafts. | Separate implementation task, server-side key gate, golden evals, data policy, budget, and zero-side-effect evidence. |
| Use only if already owned | Shopify Storefront API adapter | For a merchant already on Shopify, reuse its catalogue/cart/commerce core and map approved data into SuperMega Commerce instead of rebuilding it. | Named customer, scopes/token plan, API-version maintenance owner, and contract tests. |
| Defer | OpenAI Agents SDK | Useful when the SDK should own turns, tools, handoffs, guardrails, sessions, and tracing. The first demos do not need that complexity, and tracing can contain sensitive model/tool data unless configured. | A demo proves a real multi-step orchestration gap and a trace-retention plan. |
| Defer | Vercel Workflows | Current Workflows provide pause/resume, durable replay, persistence, and observability; Python support is marked beta. The repository already has a bounded scheduler and no approved long-wait use case. | Compare one human-approval wait against the existing worker path; adopt only on measured reliability/operational advantage. |
| Defer | TanStack Table + TanStack Virtual | Useful for sorting/filtering and virtualization at real row volume; Table does not virtualize by itself. Current native lists are smaller and clearer. | Measured row count or interaction latency fails the native UI budget. |
| Reject by default | Next.js/Astro migration, headless CMS, Medusa/Vendure/Saleor core, second CRM/queue/agent runtime | These duplicate working architecture or introduce a broad product before a named requirement. | Reconsider only through a separately accepted architecture decision with migration and release evidence. |

Current source notes that materially affect implementation:

- Supabase changed new-project defaults in 2026 so tables may no longer be automatically exposed through the Data/GraphQL API. Grants and RLS are separate controls; keep SuperMega domain tables private and make any exposure explicit.
- Supabase support for Postgres 14 ended on 2026-07-01. Managed activation must verify the actual database version and extension compatibility rather than assume the migration target.
- Vercel Workflows support durable JavaScript/TypeScript and Python, but the current documentation marks Python beta. That reinforces a bounded evaluation rather than an immediate runtime switch.
- OpenAI recommends Responses for new projects. Structured Outputs provide schema adherence; strict function tools require closed schemas. Those mechanisms improve format reliability but do not replace business validation, authorization, provenance, or human approval.

## Delivery plan: smallest releasable slices

Each slice should be one reviewable change set with its own acceptance evidence. Do not batch all four priorities into one release.

| Slice | Change | Validation | Stop condition |
| --- | --- | --- | --- |
| 1 | Define `website_project.v1`, fixture, and Product lifecycle profile; no public catalogue change | Contract tests, source/provenance checks, five-minute walkthrough | No named user or accepted CTA/problem |
| 2 | Add deterministic local preview summary and QA/release packet under Product | 390/1280 checks, keyboard/forms, links, synthetic performance, decision packet | Requires arbitrary layout/CMS work to satisfy first user |
| 3 | Define `order.v1`, stock/payment/close contracts and transition tests | Idempotency, integer totals, transition matrix, cancellation/release | No approved channel, operator, or baseline |
| 4 | Upgrade local Commerce demo to transactional concepts while preserving legacy migration | Scripted operating day and existing app/release verification | Native UI cannot remain within current route depth |
| 5 | Add Production shift/output/issue/observation/handoff records | Output invariants, issue ownership, no equipment calls | Buyer actually needs MRP/SCADA rather than bounded control |
| 6 | Add one AI demo endpoint and panel, starting with Order Intake | 20-fixture eval, schema/provenance, network/tool audit, review path | Any unauthorized side effect or fabricated critical fact |
| 7 | Add Website Brief, then Shift Handoff only after the first demo passes | Same eval contract; measure user corrections and time | First demo does not improve the accepted workflow |
| 8 | Prepare managed persistence only after product proof | Migration rehearsal, dedicated role/RLS, concurrency, backup/restore, acceptance | Any identity, RLS, recovery, approval, or exact-row check fails |

If a slice touches either canonical app or public release artifact, it must pass the existing build/security/HQ/Vercel contracts and go through the coordinated paired workflow after review and explicit owner authorization. This R&D document does not authorize that release.

## Portfolio scorecard

Review these measures at each Learn stage:

| Product slice | Primary outcome | Guardrails |
| --- | --- | --- |
| Website | Time from approved brief to accepted candidate; qualified conversion rate after launch | Unsupported claim count, accessibility defects, form failure rate, release/rollback defects |
| Ecommerce & Orders | Median intake-to-confirm and confirm-to-complete time; completion rate | Duplicate rate, oversell attempts, stock variance, unreconciled amount, PII exceptions |
| Commerce depth | Orders closed with explained stock/payment state | Cancellation/release defects, unexplained adjustments, operator correction rate |
| Production depth | Shift plan/output trace completeness and issue closure time | Unowned issues, stale observations, unsupported causal claims, unauthorized control attempts |
| AI demos | User time saved and accepted-without-correction rate | Fabricated critical facts, missing provenance, side effects, schema failure, latency, cost |

No product may claim revenue, conversion, time saved, reliability, or autonomy until the corresponding field measure exists with source, sample window, owner, and uncertainty.

## Explicit global anti-bloat rules

1. Preserve four app route families and three public pages through the local R&D stages.
2. Do not add a public Website portfolio item until a named user accepts one real preview and HQ records the decision.
3. Keep Shop and Plant as the canonical customer names; do not rename internal storage contracts without a tested migration.
4. Do not create a second database, CRM, queue, scheduler, agent runtime, CMS, UI system, or deployment project without a proven gap.
5. Do not add realtime, virtualization, or durable workflow infrastructure from projected scale; require a measured failure first.
6. Do not build ecommerce breadth before order integrity, reservation, reconciliation, and close are correct.
7. Do not build plant breadth before shift, output, issue, observation, and handoff evidence are correct.
8. Do not let an AI draft publish, contact, pay, grant access, close an issue, release quality, change equipment, or write production state.
9. Retire a candidate when two discovery cycles fail to produce a named user, baseline, acceptance rule, and approved input.
10. A local pass, preview, pushed branch, or model output is evidence of only that thing—not a production release or customer outcome.

## Evidence and official resource index

Repository evidence reviewed:

- Current direction and release authority: [`CURRENT.md`](../../CURRENT.md), [`PLATFORM.md`](../../PLATFORM.md), [`STRATEGY.md`](../../STRATEGY.md), [`README.md`](../../README.md), and [`DOCUMENTATION-INDEX.md`](../../DOCUMENTATION-INDEX.md).
- Public architecture: [`site-manifest.json`](../../site-manifest.json), [`tools/create_public_vercel_output.mjs`](../../tools/create_public_vercel_output.mjs), and [`tools/verify_public_vercel_output.mjs`](../../tools/verify_public_vercel_output.mjs).
- App architecture and records: [`showroom/package.json`](../../showroom/package.json), [`showroom/src/App.tsx`](../../showroom/src/App.tsx), [`showroom/src/core/CoreApp.tsx`](../../showroom/src/core/CoreApp.tsx), [`showroom/src/core/TeamWorkspace.tsx`](../../showroom/src/core/TeamWorkspace.tsx), and [`showroom/src/core/team-work.ts`](../../showroom/src/core/team-work.ts).
- HQ and lifecycle: [`hq/NOW.md`](../NOW.md), [`hq/portfolio.json`](../portfolio.json), and [`tools/verify_hq_contract.mjs`](../../tools/verify_hq_contract.mjs).
- Runtime/data/approval: [`supermega_runtime/runtime.py`](../../supermega_runtime/runtime.py), [`supermega_runtime/trial_runtime.py`](../../supermega_runtime/trial_runtime.py), [`supermega_runtime/trial_store.py`](../../supermega_runtime/trial_store.py), [`supermega_runtime/cloud_runtime.py`](../../supermega_runtime/cloud_runtime.py), and [`supabase/migrations`](../../supabase/migrations/).
- Coordinated release: [`.github/workflows/supermega-public-release.yml`](../../.github/workflows/supermega-public-release.yml), [`tools/verify_app_build.mjs`](../../tools/verify_app_build.mjs), and [`tools/verify_app_release_live.mjs`](../../tools/verify_app_release_live.mjs).
- Historical traces used only for pattern/rejection evidence: [`Super Mega Inc/ops/07_product_roadmap.md`](../../Super%20Mega%20Inc/ops/07_product_roadmap.md), [`Super Mega Inc/ops/16_next_gen_company_stack.md`](../../Super%20Mega%20Inc/ops/16_next_gen_company_stack.md), [`Super Mega Inc/runbooks/product_ladder_2026-04-06.md`](../../Super%20Mega%20Inc/runbooks/product_ladder_2026-04-06.md), [`Super Mega Inc/sales/ai_agent_product_catalog.md`](../../Super%20Mega%20Inc/sales/ai_agent_product_catalog.md), and [`Super Mega Inc/runbooks/supermega_product_reset_2026-04-03.md`](../../Super%20Mega%20Inc/runbooks/supermega_product_reset_2026-04-03.md).

Current primary/official technical sources, accessed 2026-07-22:

- [Vite: Building for Production](https://vite.dev/guide/build) — static production builds and browser target behavior.
- [FastAPI features](https://fastapi.tiangolo.com/features/) — OpenAPI, JSON Schema, Pydantic validation, and typed Python contracts.
- [W3C: How to Meet WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/) — accessibility acceptance reference.
- [web.dev: Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds) — LCP, INP, CLS, and 75th-percentile interpretation.
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api) — grants, RLS, private/exposed boundaries, and explicit access.
- [Supabase: Tables not exposed automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) and [Postgres 14 support ending](https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026) — current activation-impacting changes.
- [OpenAI: Migrate to the Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and [Function calling](https://developers.openai.com/api/docs/guides/function-calling) — recommended API primitive, typed outputs, and strict tools.
- [OpenAI Agents SDK: Agents](https://openai.github.io/openai-agents-python/agents/), [Guardrails](https://openai.github.io/openai-agents-python/guardrails/), and [Tracing](https://openai.github.io/openai-agents-python/tracing/) — the conditional orchestration path and sensitive trace-data consideration.
- [Vercel Workflows](https://vercel.com/docs/workflows) — current durability, pause/resume, replay, observability, and Python-beta status.
- [Shopify Storefront API](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api) — conditional reuse of an existing merchant commerce core.
- [TanStack Table virtualization guide](https://tanstack.com/table/latest/docs/guide/virtualization) — conditional dense-table/virtualization path.

## Decision recorded

The founder corrected the portfolio on 2026-07-24:

1. Shop and Plant are the canonical customer-facing operating products.
2. Commerce and Production remain internal runtime identifiers during a compatibility-preserving migration.
3. Website and Ecommerce are distinct maker products. Ecommerce owns the storefront and order-intent layer and feeds Shop; it does not duplicate Shop's stock, fulfilment, payment-status, refund, or close records.
4. AI assistance is a bounded shared capability, not a customer product. Order Intake remains the first workflow and must pass provenance, structured-output, zero-side-effect, and human-review gates.
5. SuperMega HQ, R&D, Agent Teams, Ops, Console, and machine coordination are internal systems rather than public products.

This decision authorizes local product implementation and validation. Schema changes, external data, API keys, managed activation, customer publishing, payment integration, connector writes, and production release each retain their existing separate gates.
