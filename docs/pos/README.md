# SuperMega POS Documentation

> 2026-06-29 superseding note: `pos.supermega.dev` is now the DeskPOS app on Vercel project `spa-desk-pilot`. This folder describes the older `supermega-app` POS path and must not be used to repair or alias `pos.supermega.dev` back to `supermega-app`. Use `C:\Users\swann\OneDrive - BDA\spa-desk-pilot` for DeskPOS deploys and alias checks.

This folder is the operator handoff for `pos.supermega.dev`.

## Current Release Status

Last verified: 2026-06-29 +06:30

Live deployment: `dpl_77HEPkEPjmmyBVmA4f7rTGqt1P3Q`

Status:

- Ready for pilot/demo/sales handoff on `https://pos.supermega.dev/pos/login`.
- Client-facing login is POS-only with simple username access.
- Login and role selection show the pilot/manual-payment boundary before a client enters the workspace.
- Client users see `POS`, `Setup`, and `Help`; internal sales/admin tooling stays hidden from normal client accounts.
- Client owners route directly to the POS workspace, not the internal Sales Admin URL.
- Excel/JSON exports, Help quick-start Markdown export, Help support-request Markdown export, owner daily closeout Markdown export, browser printing flow, client go-live acceptance Markdown, hardware policy export, support packet export, change request export, workspace backup export, and restore-drill report export are verified.
- Desktop POS status rail is readable on the light workspace shell; mobile POS and Help remain one-page with zero overlap/overflow in the release proof.
- Internal Sales Admin includes sellable offer packaging, qualification prompts, onboarding setup path, a downloadable outsourced sales/onboarding playbook, a client proposal export, a Client Intake Workbook for setup data collection, a Setup Copilot export for missing data/role/device/approval gaps, a Hardware Readiness export for device/printer/payment-proof acceptance, a Client Handoff Pack for day-one training, a Client Launch Brief for internal handoff, a Client Start Message for owner handoff, and a client-safe update note for patches or setup changes.
- Strict enterprise gate is currently blocked by the active `SUPERMEGA_DATABASE_URL` provider quota. Host/login, client handoff, setup packs, exports, manual payment proof, and browser print/PDF are pilot-ready; durable production history/SLA must wait until Neon/Vercel Postgres is upgraded/reactivated or replaced.

## Start Here

- [Client Manual](SUPERMEGA_POS_CLIENT_MANUAL.md) - how a client or demo user signs in and uses the one-page POS workspace.
- [Sales Team Handoff](SUPERMEGA_POS_SALES_TEAM_HANDOFF.md) - demo script, client launch package, what to sell, and what not to promise.
- [Sales And Onboarding Playbook](SUPERMEGA_POS_SALES_AND_ONBOARDING_PLAYBOOK.md) - concrete POS offers, qualification questions, client setup data, onboarding steps, and demo close flow.
- [Sell, Onboard, Setup Manual](SUPERMEGA_POS_SELL_ONBOARD_SETUP_MANUAL.md) - sales flow, client setup data, SuperMega setup responsibilities, self-managed client scope, hardware policy, and current go-live gates.
- [Launch Runbook](SUPERMEGA_POS_LAUNCH_RUNBOOK.md) - one checklist for sales, onboarding, setup, production DB activation, launch gates, handoff, support, and change requests.
- [Module Documentation](SUPERMEGA_POS_MODULE_DOCUMENTATION.md) - business packs, roles, modules, exports, and internal SuperMega implementation lanes.
- [Hardware Implementation Policy](SUPERMEGA_POS_HARDWARE_IMPLEMENTATION_POLICY.md) - supported client devices, printer/scanner/cash drawer policy, offline rules, and go-live acceptance checks.
- [Release And Change Manual](SUPERMEGA_POS_RELEASE_AND_CHANGE_MANUAL.md) - how updates, patches, testing, screenshots, and cloud deploys should work.
- [Benchmark And AI-Native Roadmap](SUPERMEGA_POS_BENCHMARK_AND_AI_NATIVE_ROADMAP.md) - what is live, what is still missing versus world-class POS/SaaS, and what to build next.

## Verified Screenshots

Generated from the live cloud host with:

```powershell
node tools/capture_pos_manual_screenshots.mjs
```

- Desktop: `assets/pos-login-desktop.png`, `assets/pos-role-selection-desktop.png`, `assets/pos-workspace-desktop.png`, `assets/pos-control-desktop.png`, `assets/pos-setup-staff-desktop.png`, `assets/pos-sales-admin-desktop.png`
- Mobile: `assets/pos-login-mobile.png`, `assets/pos-role-selection-mobile.png`, `assets/pos-workspace-mobile.png`, `assets/pos-control-mobile.png`, `assets/pos-setup-staff-mobile.png`, `assets/pos-sales-admin-mobile.png`

Client documentation intentionally shows only client-visible POS and Setup screens. SuperMega internal Sales Admin screenshots are for sales/support handoff only and should not be sent as the client daily-use manual.

## Release Gates

Use these before a handoff:

- Sales documentation freshness: `node tools/audit_pos_sales_handoff_docs.mjs` checks the current POS deployment lock, public deployment lock, live POS login, live POS DB health, and stale handoff-doc claims.
- Client setup pack: `npm run pos:client-setup-pack -- --client "Yangon Spa Pilot" --vertical spa --owner "Owner Name" --location "Main branch"` creates a clean folder under `output/pos-client-setup-packs/` with client intake CSV, role CSV, hardware readiness, go-live acceptance, support request, change request, and an internal implementation brief. Validate it with `npm run pos:client-setup-pack:audit`.
- Cloud deploy: use `npm run vercel:deploy:pos:prod`; it forces `supermega-app`, aliases `pos.supermega.dev` after inspection, and runs the POS smoke gates.
- Pilot/demo handoff: `npm run smoke:pos-host -- https://pos.supermega.dev`, `npm run smoke:pos-handoff -- https://pos.supermega.dev`, and `npm run smoke:pos-enterprise -- https://pos.supermega.dev`.
- Client quick-start and support handoff: `npm run smoke:pos-host -- https://pos.supermega.dev` must include `client_quick_start_download` and `client_support_request_download`; the exported Markdown files must contain first-day checklist, payment/printing, support request, and human-approval copy without internal admin or infrastructure terms.
- Sales/onboarding handoff: verify `Sales Admin > Playbook` and `Sales Admin > Clients` on desktop and mobile, including `Export sales + onboarding playbook`, `Export client proposal`, `Export intake workbook`, `Export setup copilot`, `Export hardware readiness`, `Export client handoff pack`, `Export launch brief`, `Export client update note`, and `Export client start message`, with zero overlap or viewport overflow. The handoff smoke must also confirm the Client Proposal, Setup Copilot, Hardware Readiness, Client Handoff Pack, Client Update Note, and Client Start Message contain safe copy and do not expose control-plane/database/deployment language, while the Client Launch Brief stays internal-only and does not expose raw first-login secrets.
- Owner closeout handoff: `npm run smoke:pos-enterprise -- https://pos.supermega.dev` must include `download_owner_closeout_brief_md`; the exported Markdown must contain the daily closeout brief, risks to review, and human-approval boundary.
- Client go-live acceptance: `npm run smoke:pos-enterprise -- https://pos.supermega.dev` must include `download_client_acceptance_md`; the exported Markdown must explain the accepted operating model, client confirmations, not-included scope, send-separately items, and human-approval boundary without internal admin or infrastructure terms.
- Production client handoff with durable history/SLA: `npm run smoke:pos-enterprise:strict -- https://pos.supermega.dev` must pass. It is currently blocked because `/api/health` reports `provider_quota_exceeded` for the active `SUPERMEGA_DATABASE_URL`.

The strict gate intentionally fails if managed Postgres is not active. Manual payments, browser printing, Excel exports, setup, and support packets can be piloted without card terminal integration, but multi-client production history should not be promised if `/api/health` reports `enterprise_db_write_blocked: true`.

If the strict gate fails, validate the production database env without printing secrets:

```powershell
npx vercel env pull .tmp\supermega-app-production.env --environment=production --yes
npm run db:pos:diagnose -- -SkipLocalCandidates
```

If the validator reports `provider_quota_exceeded`, the fix is not a code patch: upgrade/reactivate the managed database project or replace the Vercel database env with a fresh managed Postgres URL, redeploy, then rerun `npm run smoke:pos-enterprise:strict -- https://pos.supermega.dev`.

If `npm run db:pos:diagnose -- -SkipLocalCandidates` reports `status: ready` with `enterprise_db_env_source: SUPERMEGA_DATABASE_URL`, POS is already using the correct production database. Stale inherited `POSTGRES_*` variables can still appear as quota-blocked in diagnostics; do not delete them blindly because other repo tools may inspect those names. Replace or remove them only after auditing non-POS consumers.

When a fresh managed Postgres URL is available, use the guarded activation command instead of manual Vercel env edits:

```powershell
npm run db:pos:activate -- -DatabaseUrlFile .tmp\pos-production-database-url.txt -Replace -Redeploy -RequireStrictEnterprise
```

This validates the database and schema before changing `SUPERMEGA_DATABASE_URL`, redeploys the fixed POS Vercel project, and runs the strict durable-production smoke gate.
