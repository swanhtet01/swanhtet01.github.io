# SuperMega POS Release And Change Manual

> 2026-06-29 superseding note: `pos.supermega.dev` is now the DeskPOS app on Vercel project `spa-desk-pilot`. Do not use this legacy `supermega-app` release flow to deploy or repair the canonical POS domain.

Last verified: 2026-06-13

## How Changes Should Work

When you or a client asks for a change:

1. Capture the requested behavior in plain language.
2. Export `Change request JSON` from `Internal Control > Go-live` or `Internal Support` so the request has category, priority, approval boundary, acceptance criteria, and release-note follow-up.
3. Identify the affected lane: `Login`, `Role selection`, `POS`, `Control`, `Sales Admin`, or backend/API.
4. Patch the code in this repo.
5. Run local checks.
6. Deploy to cloud preview or production.
7. Run live smoke tests against `https://pos.supermega.dev`.
8. Capture updated screenshots if the UI changed.
9. Add a short release note for the sales/support team.

Yes, I can patch changes from here when you ask. The safe pattern is to patch the repo, validate locally, deploy through Vercel, then verify the live cloud host. Do not let clients rely on unverified local-only changes.

## Standard Commands

From repo root:

```powershell
npm --prefix showroom run lint
npm --prefix showroom run build
node tools/verify_app_vercel_output.mjs
node tools/smoke_pos_host_login.mjs
npm run smoke:pos-enterprise -- https://pos.supermega.dev
node tools/capture_pos_manual_screenshots.mjs
```

For POS app deployments, `npm run vercel:build:app` must end with `node tools/verify_app_vercel_output.mjs`. That guard blocks the exact failure mode where a public marketing-site Vercel output is accidentally deployed to `pos.supermega.dev`.

Preferred guarded deploy path for the separated POS/app Vercel project:

```powershell
npm run vercel:deploy:pos:prod
```

That command forces the `supermega-app` Vercel project, aliases `pos.supermega.dev` only after inspection/runtime guard, warms `/api/health`, then runs the POS host/login, sales-admin handoff, and enterprise release smoke gates with one retry for transient cold-start misses.

For paid production go-live, require the strict durable-database gate:

```powershell
powershell -ExecutionPolicy Bypass -File tools/deploy_pos_to_project.ps1 -RequireStrictEnterprise
```

Do not run raw `npx vercel deploy --prebuilt` for POS unless `.vercel/project.json`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` have been confirmed for `supermega-app`. The POS wrapper exists because a raw deploy can drift into another Vercel project and put the wrong artifact behind `pos.supermega.dev`.

After any UI deploy, capture updated manual screenshots:

```powershell
node tools/capture_pos_manual_screenshots.mjs
```

## Cloud Reliability

Production should not depend on your PC being on.

Current cloud split:

- `pos.supermega.dev`: POS product host and demo/client POS entry.
- `app.supermega.dev`: broader SuperMega client workspace hub.
- Vercel: web host and serverless API deployment target.

What must be cloud-backed for paid clients:

- Tenant auth/session store.
- Client/workspace registry.
- Staff directory, roles, PINs, and invite state.
- POS transactions and payment proof.
- Inventory, receiving, stock movements, closeout, and audit logs.
- File/object storage for export packets and evidence.
- Monitoring, error reporting, and uptime alerts.

## Release Gates

Do not mark a client production-ready until these gates pass:

- Live login works on mobile and desktop.
- Role selection works for each assigned role.
- POS screen fits one viewport without overlap.
- Control screen shows readiness, deployment, sync, and staff.
- Sales Admin can generate handoff and export packets.
- Sales Admin > Clients can run `Client setup wizard > Create pilot setup` for a real client lane.
- Sales Admin > Clients can export a client launch room workbook.
- Sales Admin > Ops shows POS audit trail events after login/provisioning/handoff actions.
- Role invite exports and control-plane API responses redact generated temporary passwords.
- Excel exports open cleanly.
- API session returns authenticated state.
- Smoke test passes against live URL.
- Enterprise smoke passes against live URL, including blocked role gates, secure cookie policy, Excel/JSON downloads, and mobile/desktop layout checks.
- Manual/external payment proof policy is configured, tested, and approved by tenant. Payment provider integration is optional future scope.
- Backup/restore path is documented.
- Change request JSON is attached for any client-requested behavior change, especially money, access, data/export, offline, printer, role, or workflow changes.

## Rollback

If a release breaks the live POS:

1. Stop using the broken release for demos.
2. Restore the last known working Vercel deployment.
3. Run `node tools/smoke_pos_host_login.mjs`.
4. Run `npm run smoke:pos-enterprise -- https://pos.supermega.dev`.
5. Recapture screenshots if the UI changed.
6. Log the regression and patch on a new deployment.

## Client Change SLA

Practical promise for early clients:

- Copy/text/style issue: same day if low risk.
- UI behavior issue: 1-2 days including testing.
- New export/report: 1-3 days depending on data shape.
- New module: 3-10 days depending on backend and workflow scope.
- Payment/hardware/offline changes: only after a proper integration test plan.
