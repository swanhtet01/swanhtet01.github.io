# HQ now

Updated: 2026-07-24
Owner: founder / CEO
Mode: guarded release candidate; production remains isolated

## North-star outcome

Prove one measured workflow where SuperMega keeps the record and a responsible owner resolves exceptions.

## Current outcomes

1. **Release candidate** — review one candidate for the simpler company system, products, and backend gates.
2. **Managed persistence** — repeat the passing PostgreSQL 17 contract and Website-to-Commerce journey on one isolated hosted Supabase target.
3. **Pilot** — choose one Commerce or Production workflow with a named owner, baseline, target, authority boundary, and evidence plan.

## Current system

- Home, Work, and Products are the only primary destinations; Settings is a utility. Home shows one accountable next action, then the three products.
- Home loads managed Commerce and Production through the same authenticated identity; it never mixes a managed product with local sample records.
- Work has one team picker and Work, Agents, Review. Mobile focuses intake or detail until Back; desktop stays split. New work appears only in Work.
- Products contains Commerce, Production, and Website. No public agent catalogue, demo-domain collection, POS product, or separate internal-console product is in scope.
- Commerce: Orders and Stock, compact manual entry, visible Sample or managed-data boundary, and refund due as a primary exception. Production: Jobs and Problems, job-first mobile context, observation-only equipment status, and write gating. Website: one Page selector and Site, Preview, Publish action bar; edit opens first and recovery stays under Site.
- All three products have authenticated tenant commands. Managed Production starts from real records and requires human-bound evidence.
- Website is the only lazy-loaded product workspace. Approval retains one deterministic site file without deploying a site or changing a domain. Invalid local records stay unchanged and require confirmed recovery or the two-step local reset. Web Locks and revisions prevent overlapping saves from silently winning.
- The managed backend is the private `app_private` schema and dedicated runtime-role contract in Supabase Postgres. Browser code receives neither the database URL nor a service-role key.
- The PostgreSQL 17.10 gate runs the real `PostgresTrialStore`, proves both product journeys, and restores a fresh TLS cluster; hosted Supabase remains separate.
- Sends, payments, publishing, merges, deployments, access changes, and production writes remain responsible-human actions.
- Vercel canonical mappings remain `app.supermega.dev` → `megaos`, and `supermega.dev` plus `www.supermega.dev` → `supermega-public`.

## Latest verification

- Draft PR `#258` remains the release candidate; its validated implementation head is `338b6fd11bc27da9b7aa42bee2c293a5c0e3a9ef`.
- GitHub `SuperMega App CI` run `180` passed every validation job for that head.
- Candidate lint and build pass with 207 product/runtime, 51 release, 44 security, 10 migration, and 11 Vercel checks.
- PostgreSQL 17.10 was repeated locally at `d49aae0`: 24 migration, authority, journey, isolation, retry, recovery, and validator checks passed across two clean TLS clusters. Cleanup passed; external systems were unchanged. GitHub CI still covers remote head `338b6fd`.
- Fresh 1280px and 375px audits show no horizontal overflow, error overlay, warning, or console error. At 375px, Commerce Review order is 304×44px; Production has no undersized controls; Website reorder and preview controls are 44×44px. Invalid Website data stayed unchanged in session-only recovery mode.
- Existing Work focus evidence remains: agent detail moved from 579px to 72px, its first field from 773px to 266px, work detail and new-work intake start at 72px, and Review Prepare moved from 806px to 724px.
- No Vercel deployment was created by the release-candidate push. The latest `megaos` and `supermega-public` production deployments still reference `main` commit `6885c3201d523d42d176c3dcd91de28dc1e17f6f`.
- The connected `supermegabase` project is active and healthy on hosted PostgreSQL 17.6.1. Read-only inspection confirms `app_private`, `app_private.trial_schema_meta`, and `supermega_trial_backend` are not installed.
- Supabase migration history currently contains one unrelated public-schema RLS migration, not the five SuperMega private-trial migrations.
- Existing public tables have 27 informational `rls_enabled_no_policy` findings; they are not private-schema readiness proof.

## Coordination

- This Codex task integrates PR `#258` and owns the go/no-go recommendation. A second Codex task may audit read-only; Claude Code may prepare one backend-rehearsal fix on an isolated branch based on the exact PR head.
- Workers do not edit this branch or `hq/NOW.md`. Handoffs state base/head SHA, changed paths, checks, risks, and one next action; this task alone decides whether to port a change.

## Blockers

- No isolated Supabase branch or separate non-production project has repeated the five-migration PostgreSQL 17.6 proof.
- Hosted-only evidence is missing: Security Advisor, transaction-pool behavior, provider recovery, and authenticated repetition of both proven product journeys.
- The connected production project contains unrelated existing public-schema objects and advisor findings. Do not treat its healthy status or server version as application readiness.
- Production still needs server-only secrets, explicit memberships/capabilities, a writes-disabled smoke test, founder approval, and separately authorized write enablement.
- No pilot customer, managed tenant, revenue result, or time-saved baseline is verified.

## Decisions in force

- PR `#258` is the single integration candidate; its component drafts are not separate release candidates.
- Do not apply the private-trial migrations to the connected production project before an isolated rehearsal passes.
- Do not create a paid Supabase branch or project without confirming its organization and cost.
- One company system; no public agent catalogue, internal-console product, or demo-domain collection.
- AI prepares bounded work from approved records; responsible owners retain consequential authority.
- Do not add another CRM, queue, orchestrator, or agent runtime until a measured gap proves it necessary.

## Next evidence

1. Approve and provision one isolated hosted Supabase rehearsal target.
2. Repeat the locally proven five-migration, runtime-role, validator, isolation, revocation, and recovery gate; run Supabase Security Advisor and the transaction-mode pooler check.
3. Repeat both locally proven workflows through authenticated users on the isolated hosted runtime.
4. Repeat the validated migration against production with writes disabled; configure server-only identity and database secrets.
5. Merge and release the exact reviewed commit only after the coordinated live gates pass; enable writes in a separate owner-approved action.
