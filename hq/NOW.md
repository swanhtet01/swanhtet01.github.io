# HQ now

Updated: 2026-07-24
Owner: founder / CEO
Mode: guarded release candidate; production remains isolated

## North-star outcome

Prove one real workflow in which SuperMega keeps the operating record, a responsible owner resolves exceptions, and the business measures the result.

## Current outcomes

1. **Release candidate** — review one combined candidate for the simpler company system, product apps, and managed-backend safety gates.
2. **Managed persistence** — rehearse the complete private-schema migration and runtime-role contract on isolated hosted PostgreSQL before production activation.
3. **Pilot** — choose one Commerce or Production workflow with a named owner, baseline, target, authority boundary, and evidence plan.
4. **Website-to-Commerce proof** — rehearse one approved, retained site artifact through managed Commerce intake and human confirmation without adding automatic deployment or customer sends.
5. **AI intake** — keep model execution disconnected until the source-backed order-intake evaluation passes without operational side effects.

## Current system

- Home, Work, and Products are the only primary destinations; Settings is a utility.
- Home reveals one accountable next action, then the three product entries.
- Work has one team picker and three views: Work, Agents, and Review. On mobile, work records and agent roles use list-to-detail navigation; desktop keeps the split workspace.
- Products contains Commerce, Production, and Website. No public agent catalogue, demo-domain collection, POS product, or separate internal-console product is in scope.
- Commerce opens directly on Orders and has one second task, Stock; daily close and exceptions stay collapsed inside Orders. Production opens directly on Jobs and has one second task, Problems; Jobs keeps the completion context and one collapsed recurring-job intake. Website keeps Pages, Navigation, Publish, and Split on desktop; mobile reduces the primary choice to Edit or Publish and moves page, navigation, and search controls into Site settings.
- Commerce, Production, and Website have authenticated tenant command paths. Managed Production starts from one real job and machine, copies no browser demo data, and requires human-bound evidence for job, output, issue, resolution, and machine-state commands.
- Website is the only lazy-loaded product workspace at `/products/website/`. Its local mode is labelled, and an approved record retains ready public content plus one deterministic, self-contained site file without deploying a site or changing a domain.
- The managed backend is the private `app_private` schema and dedicated runtime-role contract in Supabase Postgres. Browser code receives neither the database URL nor a service-role key.
- Sends, payments, publishing, merges, deployments, access changes, and production writes remain responsible-human actions.
- Vercel canonical mappings remain `app.supermega.dev` → `megaos`, and `supermega.dev` plus `www.supermega.dev` → `supermega-public`.

## Latest verification

- Draft release candidate: GitHub PR `#258` on branch `agent/supermega-release-candidate`; its validated implementation head is `4ac6a88c1d9699249169bad081807b894e82f4fe`.
- GitHub `SuperMega App CI` run `158` passed every validation job for pushed head `4ac6a88c1d9699249169bad081807b894e82f4fe`.
- Candidate lint and build pass with 178 product/runtime checks, 50 coordinated-release checks, 44 security checks, 10 migration-chain checks, 11 Vercel environment/domain checks, and 96 Python tests.
- Desktop and 375px audits rechecked Commerce, Production, legacy routes, and Website Edit/Publish. Website puts the page, Preview, Site settings, and first Hero field in the initial phone viewport while retaining desktop Split. Audited products have no horizontal overflow, undersized controls, or console errors; the existing candidate audit covers Home, Products, Work, Agents, and Settings.
- No Vercel deployment was created by the release-candidate push. The latest `megaos` and `supermega-public` production deployments still reference `main` commit `6885c3201d523d42d176c3dcd91de28dc1e17f6f`.
- The connected `supermegabase` project is active and healthy on hosted PostgreSQL 17.6.1. Read-only inspection confirms `app_private`, `app_private.trial_schema_meta`, and `supermega_trial_backend` are not installed.
- Supabase migration history currently contains one unrelated public-schema RLS migration, not the five SuperMega private-trial migrations.
- Supabase Security Advisor currently reports 27 informational `rls_enabled_no_policy` findings on existing public tables. Performance Advisor reports 64 informational findings. These are existing-project findings, not proof that the SuperMega private schema is ready.

## Blockers

- No isolated Supabase branch or separate non-production project has completed the five-migration PostgreSQL 17.6 rehearsal.
- The dedicated runtime login, exact role membership, read-only contract audit, cross-workspace denial, revocation, backup, and restore evidence are still missing.
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

1. Approve and provision one isolated hosted PostgreSQL rehearsal target.
2. Apply the five migrations in filename order, create the dedicated runtime login, and run the read-only v4 validator plus Supabase Security Advisor.
3. Prove backup/restore, isolation, revocation, optimistic concurrency, managed Production job-to-output flow, and the managed Website-to-Commerce workflow with named users and attributable records.
4. Repeat the validated migration against production with writes disabled; configure server-only identity and database secrets.
5. Merge and release the exact reviewed commit only after the coordinated live gates pass; enable writes in a separate owner-approved action.
