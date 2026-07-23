# HQ now

Updated: 2026-07-24
Owner: founder / CEO
Mode: guarded release candidate; production remains isolated

## North-star outcome

Prove one real workflow in which SuperMega keeps the operating record, a responsible owner resolves exceptions, and the business measures the result.

## Current outcomes

1. **Release candidate** — review one combined candidate for the simpler company system, product apps, and managed-backend safety gates.
2. **Managed persistence** — carry the passing local PostgreSQL 17 contract into one isolated hosted Supabase rehearsal before production activation.
3. **Pilot** — choose one Commerce or Production workflow with a named owner, baseline, target, authority boundary, and evidence plan.
4. **Website-to-Commerce proof** — rehearse one approved, retained site artifact through managed Commerce intake and human confirmation without adding automatic deployment or customer sends.

## Current system

- Home, Work, and Products are the only primary destinations; Settings is a utility.
- Home reveals one accountable next action, then the three product entries.
- Work has one team picker and Work, Agents, Review. Mobile intake/details focus until Back; desktop stays split. New work appears only in Work.
- Products contains Commerce, Production, and Website. No public agent catalogue, demo-domain collection, POS product, or separate internal-console product is in scope.
- Commerce: Orders, Stock, collapsed close controls. At 1280x800, Review order stays at 562-606px inside its 219-625px panel; mobile stays page-flow. Production: Jobs, Problems, collapsed recurring-job intake. Website: desktop Pages, Navigation, Publish, Split; mobile Edit, Publish, and Site settings.
- Commerce, Production, and Website have authenticated tenant commands. Managed Production starts from real records and requires human-bound evidence.
- Website is the only lazy-loaded product workspace. An approved record retains one deterministic site file without deploying a site or changing a domain. Invalid local records remain unchanged, show one Recovery settings action, and can only be removed through the confirmed two-step local reset.
- The managed backend is the private `app_private` schema and dedicated runtime-role contract in Supabase Postgres. Browser code receives neither the database URL nor a service-role key.
- The repeatable local PostgreSQL 17.10 gate runs the real `PostgresTrialStore` with explicit non-autocommit transactions and passes migration, v1 upgrade, runtime role, TLS, transaction-local identity, RLS behavior, revocation, and fresh-cluster restore checks; it does not make hosted Supabase ready.
- Sends, payments, publishing, merges, deployments, access changes, and production writes remain responsible-human actions.
- Vercel canonical mappings remain `app.supermega.dev` → `megaos`, and `supermega.dev` plus `www.supermega.dev` → `supermega-public`.

## Latest verification

- Draft release candidate: GitHub PR `#258` on branch `agent/supermega-release-candidate`; its validated product implementation head is `e48d15b35ce0e4122cdae4eb2ab0541d5bcba84f`.
- GitHub `SuperMega App CI` run `173` passed every validation job for pushed head `e48d15b35ce0e4122cdae4eb2ab0541d5bcba84f`.
- Candidate lint and build pass with 178 product/runtime checks, 51 coordinated-release checks, 44 security checks, 10 migration-chain checks, 11 Vercel environment/domain checks, and 102 Python tests.
- The PostgreSQL 17.10 evidence records 20 passing migration, authority, isolation, revocation, recovery, and validator checks across two clean TLS clusters. Cleanup passed; external systems were unchanged.
- 375px browser audits show no overflow, undersized controls, or console errors. Website exposes one 44px Recovery settings action; reset scope was inspected without deletion. Work moves agent detail from 579px to 72px and its first field from 773px to 266px; work detail and new-work intake also start at 72px. Review Prepare moved from 806px to 724px.
- No Vercel deployment was created by the release-candidate push. The latest `megaos` and `supermega-public` production deployments still reference `main` commit `6885c3201d523d42d176c3dcd91de28dc1e17f6f`.
- The connected `supermegabase` project is active and healthy on hosted PostgreSQL 17.6.1. Read-only inspection confirms `app_private`, `app_private.trial_schema_meta`, and `supermega_trial_backend` are not installed.
- Supabase migration history currently contains one unrelated public-schema RLS migration, not the five SuperMega private-trial migrations.
- Existing public tables have 27 informational `rls_enabled_no_policy` findings; they are not private-schema readiness proof.

## Blockers

- No isolated Supabase branch or separate non-production project has repeated the five-migration PostgreSQL 17.6 proof.
- Hosted-only evidence is still missing: Security Advisor, Supavisor transaction-pool behavior, provider backup/restore, and the managed Production and Website-to-Commerce journeys.
- The connected production project contains unrelated existing public-schema objects and advisor findings. Do not treat its healthy status or server version as application readiness.
- Production still needs the server-only database URL, signing secret, explicit memberships/capabilities, writes-disabled smoke test, founder approval, and a separately authorized writes enablement.
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
3. Prove managed Production job-to-output and Website-to-Commerce workflows with named users and attributable records.
4. Repeat the validated migration against production with writes disabled; configure server-only identity and database secrets.
5. Merge and release the exact reviewed commit only after the coordinated live gates pass; enable writes in a separate owner-approved action.
