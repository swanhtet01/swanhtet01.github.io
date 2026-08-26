# Competitive execution cut — audit findings to sellable SuperMega work

Date: 2026-08-26  
Contract: `supermega.competitive-execution-cut.v1`  
Status: local source authority only. No deploy, provider write, credential
change, customer contact, payment, stock movement, or managed activation is
authorized by this document.

This cut exists because the strategy library is now larger than the operating
question: what does the SuperMega technical agent do next so the product becomes
real, usable, and sellable without overclaiming?

## 1. Inputs and authority

Current source authority for this cut:

- `hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md`
- `hq/strategy/PRODUCT-CATALOG-AND-PRICING.md`
- `hq/strategy/CLIENT-READINESS-BRIEF.md`
- `hq/strategy/ENTERPRISE-READINESS-SCORECARD.md`
- `hq/operating-action-board.json`
- `hq/readiness/managed-pilot-readiness.json`
- `hq/technical-estate.json`

OneDrive expert/audit exports are advisory inputs only. They are useful when
they repeat a live concern, especially the warning that the public app must not
be treated as a customer system of record while production remains
`isolated_demo`. They are not current authority when they conflict with the
source-controlled ledgers, because several older audit outputs predate later
Shop, Plant, Website, Ecommerce, billing, and managed-readiness work.

## 2. Non-negotiable product boundary

The customer products remain exactly:

1. Shop
2. Plant
3. Website
4. Ecommerce

AI is a shared capability, not a customer product. The AI lane prepares bounded
drafts and advisory synthesis only; it does not create orders, payments,
messages, stock movements, migrations, releases, or customer records.

No new product shell should be created until one of the four products completes
a real owner-reviewed learning loop. Add depth inside the four products before
adding breadth.

## 3. Current market position, stated honestly

SuperMega's wedge against SAP, Odoo, Shopify, and POS SaaS is not module count.
It is:

- local-first operation that can run without an account, server, subscription,
  or card;
- Myanmar-first workflows for MMK, manual local payments, channel commerce,
  owner review, and offline reality;
- evidence-gated operations where important state transitions fail closed
  rather than merely warning;
- one shared approval/evidence/recovery model across Shop, Plant, Website, and
  Ecommerce;
- managed intelligence only after tenant isolation, recovery, observability,
  support, pricing, and owner activation gates pass.

Do not claim SAP, Odoo, Shopify, or POS-SaaS replacement parity until managed
tenant, support, observability, recovery, and commercial evidence gates pass.
The allowed near-term claim is narrower: SuperMega is a locally usable
operating system for one small business workflow, with managed scale still
gated.

## 4. One outcome that matters first

Shop remains the money-path product until its owner-private pilot has at least
20 consecutive accepted observed runs covering pilot days 1 through 5.

The next evidence chain is:

1. protect GitHub `main` and restore review authority;
2. push/review the release-stack integration candidate through a PR;
3. rehearse Supabase from source on a clean preview branch;
4. promote paired Vercel candidates only after owner approval;
5. run owner-private Shop baseline and five-day pilot evidence;
6. decide whether managed activation is justified.

Plant, Website, and Ecommerce keep security, dependency, regression, and
handoff maintenance until Shop produces a decision packet. Their next commercial
proofs remain sequenced after Shop:

- Plant: one order-bound OEE/quality loop with operator, supervisor, source
  mapping, and correction effort.
- Website: one named-business brief through accepted responsive preview and
  retained artifact.
- Ecommerce: one customer request through Shop review, exception handling, and
  recovery without payment, delivery, refund, or stock automation.

## 5. Technical work assignment

Use this assignment map until a newer source-controlled cut replaces it.

| Lane | Owner role | Work allowed now | Blocked action |
| --- | --- | --- | --- |
| Release integrity | Technical Steward | Keep release packets, status briefs, branch/PR plans, and owner approval packets current. | GitHub writes, merges, Vercel deploys, and production releases. |
| Security/readiness | Risk reviewer | Verify gates, overclaims, secret shapes, browser-role denial, RLS assumptions, and no-production-write controls. | Credential rotation, Supabase branch creation/deletion, production DDL, or data reads beyond metadata-only approval. |
| Product engineering | Senior engineer | One bounded local product slice with focused tests and recovery behavior. Prefer Shop pilot utility before other product expansion. | New product shells, automatic external actions, hosted agents, payment APIs, stock automation, or unreviewed messaging. |
| Infrastructure | Infra engineer | Metadata-only drift checks, migration-source parity, preview rehearsal planning, Vercel health evidence, rollback planning. | Provider mutation or managed activation. |
| Growth | Growth lead | Draft lead lists, positioning, and pilot materials for founder review using counts, stages, and digests only. | Contacting people, sending messages, posting, payment terms, or exposing private participant identity. |
| Admin / hardware | Admin ROG Ally task | Keep the machine stable, audit OneDrive/source handoffs, manage local runtime cost, and preserve one active SuperMega worker/server. | Code changes without a handoff, killing owner-visible apps, or spawning persistent agents. |

The implementer cannot sign its own verification. When a source change affects
release, readiness, claims, or security, use one bounded independent reviewer.
Do not create persistent subagents, recursive delegation, hosted agent runs, or
parallel local model work.

## 6. Next local implementation queue

While external gates are blocked, the highest-value local queue is:

1. keep the release-stack integration candidate reproducible and reviewable;
2. keep the owner-private Shop pilot kit and baseline packets current;
3. add only pilot-critical product reliability work that improves a real
   operator run;
4. improve observability locally without a new vendor or PII-bearing beacon;
5. prepare evidence-backed pricing and outreach packets, but do not send or
   quote amounts until the founder decides.

This queue intentionally rejects attractive but premature work: broad analytics
expansion, self-serve public activation, automatic acknowledgement email,
hosted AI, scheduler activation, billing execution, payment capture, and any
"unicorn platform" claim that lacks real observed use.

## 7. Insecurity and overclaim watchlist

Every future slice must explicitly check these failure modes:

- exposed or credential-shaped values in public issues, generated packets,
  reports, logs, or fixtures;
- public-browser access to private Supabase tables, views, functions, Storage
  objects, or privileged runtime credentials;
- managed schema changes whose source migrations, environment schema versions,
  and recovery plan do not agree;
- `logs.all` Management API consumers or other provider APIs scheduled for
  removal;
- public-table migrations without explicit grant or revoke posture;
- sample, seeded, or synthetic runs being described as customer proof;
- private participant identity leaking into Git, CI, generated HQ reports, or
  public docs;
- model output taking action without deterministic validation and human review;
- claims of revenue, activation, tenant existence, compliance, uptime,
  accuracy, payment processing, stock movement, or ERP replacement before the
  specific gate evidence exists.

## 8. Current practical next action

The current first external gate is GitHub `main` protection. The current first
commercial evidence gate is the owner-private Shop baseline and pilot.

Until those gates move, the SuperMega technical agent's useful work is not
"make more agents." It is to keep one release candidate reviewable, one pilot
path measurable, and every product claim tied to a source and a gate.
