# HQ now

Updated: 2026-07-23
Owner: founder / CEO
Mode: guarded release; canonical `__release.json` metadata is the live authority

## North-star outcome

Prove one complete company workflow in which a real customer or operator starts through an existing channel, SuperMega maintains the operating record, a responsible owner resolves the exceptions, and the business can measure the result.

## Current outcomes

1. **Product** — validate the Website and Ecommerce & Orders prototypes without expanding the primary Today, Teams, and Operations navigation.
2. **Pilot** — select one Website-to-order, Commerce, or Production workflow with a named owner, baseline, acceptance test, and evidence plan.
3. **Managed mode** — keep activation locked until tenant persistence, signed identity, membership, audit, recovery, runtime role, and source coverage pass.

## Confirmed facts

- The canonical implementation repository is this checkout, not the OneDrive HQ archive.
- Today, Teams, and Operations remain the primary application navigation; Settings remains a utility.
- Website and Ecommerce & Orders are slash-addressable, lazy-loaded local prototypes at `/products/website/` and `/products/ecommerce/`, linked from Operations rather than added to the primary navigation.
- Commerce and Production use the canonical module paths `/operations/commerce/` and `/operations/production/`; legacy Shop and Plant URLs redirect into them.
- Product uses Discover, Define, Build, Release, and Learn.
- Settings captures the pilot entry point, current record, baseline, target, owner, authority boundary, and acceptance evidence without adding another route.
- One manifest defines three executable workflow profiles for each operational product; the application consumes it directly and HQ references it without copying template lists.
- Commerce covers channel order, stock, fulfilment, payment, and close.
- Production covers plan, output, quality, maintenance, materials, equipment, and issues.
- Switching products starts a clean pilot draft so workflow-specific evidence cannot be relabelled accidentally.
- The browser-local trial is useful for workflow validation but is not a managed customer system of record.
- Production release must run through the single coordinated GitHub workflow; the app workflow is a non-deploying guard.
- Vercel owns the real canonical mappings: `app.supermega.dev` to `megaos`, and `supermega.dev` plus `www.supermega.dev` to `supermega-public`.
- Both Vercel projects have native Git deployments disabled, protected preview automation configured, and bounded cron ownership.

## Latest verification

- Candidate identity is brand `terminal-v4-2026-07`, context `2026-07-22.7`, and catalogue `2026-07-22.6`.
- Six workflow profiles, 47 coordinated-release checks, 36 security checks, eleven Vercel contract checks, 73 contact checks, six RLS checks, six paired-identity checks, HQ, product-inclusive lint, strict TypeScript, YAML, and 46 Python tests pass locally.
- Website and Ecommerce desktop and 390 px paths pass without overflow or browser errors. Their `OP-`-gated handoff records one local audit, and its deterministic draft preserves the MMK price. A locked completion generates an opaque reference, captures bounded methods and evidence, rejects conflicts, and creates one `ready_for_confirmation` record plus a second audit. It changes no scenario order and performs no confirmation, stock, payment, send, Commerce, or external write.
- Core desktop and 390 px layouts remain verified. Operations, Product decisions, and `decision_packet.v1` reviews require attributable human evidence; stale authority reopens safely.
- Historical schema v1 is unchanged; additive v2 preserves old actors and decisions as `legacy`, requires reclassification, and enforces nonblank human decisions before readiness.
- Contact intake stores a SHA-256 payload fingerprint; changed cold-start replays conflict and ambiguous persistence fails closed.
- Read-only Vercel project, environment, domain, firewall, and cron contracts pass. One coordinated workflow verifies and rolls back both canonical domains as a pair.
- The product app remains `isolated_demo` until managed data, identity, and writes pass; no local or preview result can imply managed readiness.

## Blockers and unknowns

- Vercel environment audit identifies three obsolete app variables and 54 unused public-project variables. They are reported, not deleted, until a recoverable cleanup is approved.
- Separate noncanonical legacy hostnames still serve from older projects; they are outside this release and need an explicit redirect or retirement decision.
- Managed trial activation still requires a separately validated database runtime URL, the additive schema v2 migration proven on non-production data, a high-entropy signing secret of at least 32 bytes, and the explicit writes flag.
- No current pilot customer, managed tenant, revenue result, or time-saved baseline is verified in this repository.
- The OneDrive `codex_hq` archive is unpinned/offline on this Ally and cannot serve as dependable live authority.
- Durable workflow, AI SDK, telemetry, dense-table, and realtime candidates remain adoption-gated until current architecture gaps are measured.

## Decisions in force

- One company system; no public agent catalogue, internal-console product, or collection of demo domains.
- A pushed branch or local pass is not a release; review, explicit owner authorization, and the coordinated `main` workflow are mandatory.
- Company system, Commerce, and Production are operating entries; Website and Ecommerce & Orders are explicitly labelled local prototypes until their next evidence gates pass.
- AI prepares bounded work from approved records; responsible owners retain consequential authority.
- Social and open-source discovery must become a tested workflow, implementation recipe, or explicit rejection before entering the product.
- The long-term decision and implementation layer remains an HQ/R&D direction; a public resource catalogue is deferred behind proof from the core operational products.
- Do not add a second CRM, queue, orchestrator, or agent runtime while existing Supabase and hosted-worker contracts can satisfy the requirement.

## Next evidence

- Repeat the complete non-PII Website-to-Ecommerce intake, draft, and ready-record flow with one named user; measure handling time and correction effort before customer data, reservation, confirmation, or connectors.
- Approve a narrow Vercel environment cleanup from the audited name-only inventory; do not copy or expose values.
- Activate managed trial persistence only after v1 then v2 migration rehearsal, the read-only database role/RLS validator, backup, and restore evidence pass on non-production data.
- Complete one pilot intake containing channel, current record, owner, baseline, target outcome, authority boundary, and acceptance evidence.
