# POS Database Go-Live Runbook

> 2026-06-29 superseding note: `pos.supermega.dev` is now the DeskPOS app on Vercel project `spa-desk-pilot`. This runbook is legacy `supermega-app` POS material and must not be used to repair or alias `pos.supermega.dev` back to `supermega-app`.

Use this when `https://pos.supermega.dev/api/health` reports `enterprise_db_ready=false` or strict POS smoke fails with `durable_database_not_ready_on_public_health`.

## Current Contract

- `pos.supermega.dev` runs from Vercel project `supermega-app`.
- Current production deployment proof should show `name supermega-app` when inspecting `pos.supermega.dev`.
- Required durable database env key: `SUPERMEGA_DATABASE_URL`.
- Accepted fallback keys are `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `DATABASE_URL`, `DATABASE_URL_POSTGRES_URL`, `DATABASE_URL_POSTGRES_PRISMA_URL`, and `DATABASE_URL_POSTGRES_URL_NON_POOLING`.
- The local repo can be linked to a different Vercel project during separated deploy work. Use the POS scripts below instead of raw `vercel env` commands.
- Current Vercel storage resource found for this project: `supermega-app-operating-db` / Neon.

## Diagnose

```powershell
npm run db:pos:diagnose
```

Expected production blocker when Neon is out of quota:

```text
enterprise_db_degraded_category = provider_quota_exceeded
```

This diagnostic redacts connection strings, validates the live POS Vercel project, checks local candidate env files, and restores `.vercel/project.json` when it exits.

## Fix Domain Alias First If Health Is 404

If `https://pos.supermega.dev/api/health` returns `404`, fix the domain before touching the database. The POS domain must point at the latest ready `supermega-app` deployment.

```powershell
$env:VERCEL_ORG_ID='team_wI4l7ZgSxcEztQPSlCCYVeJ5'
$env:VERCEL_PROJECT_ID='prj_gpwu3508jHmt8WTh0aevfg0lIbYa'
npx --yes vercel@53.2.0 ls --scope swanhtet01s-projects --local-config vercel.json
npx --yes vercel@53.2.0 alias set <latest-supermega-app-deployment>.vercel.app pos.supermega.dev --scope swanhtet01s-projects --local-config vercel.json
npx --yes vercel@53.2.0 inspect https://pos.supermega.dev --scope swanhtet01s-projects --local-config vercel.json
curl.exe -sS -H "Accept: application/json" https://pos.supermega.dev/api/health
```

The inspect output must show `name supermega-app` and the health JSON must include `enterprise_db_mode`.

## Fix Option A: Upgrade Or Reactivate Current Neon

Use this if the current Neon project contains data you need to keep.

1. Open Vercel project `supermega-app` -> Storage -> `supermega-app-operating-db` -> Open in Neon Console.
2. Upgrade/reactivate the project so connections no longer return quota errors.
3. Run the strict gate:

```powershell
npm run smoke:pos-enterprise:strict -- https://pos.supermega.dev
```

If strict passes, no env change is needed.

## Fix Option B: Replace With A Fresh Managed Postgres URL

Use this if the current DB is only pilot/demo state or the old quota-blocked project cannot be upgraded quickly.

1. Create a new managed Postgres database in Neon, Supabase, or another provider.
2. Copy the pooled production connection string.
3. Put only the URL in a temp file, for example:

```powershell
Set-Content -LiteralPath "$env:TEMP\supermega-pos-db-url.txt" -Value "postgresql://USER:PASSWORD@HOST/DB?sslmode=require" -NoNewline
```

4. Validate schema, update the correct Vercel project, redeploy, and require strict enterprise:

```powershell
powershell -ExecutionPolicy Bypass -File tools\activate_pos_database.ps1 `
  -DatabaseUrlFile "$env:TEMP\supermega-pos-db-url.txt" `
  -Replace `
  -Redeploy `
  -RequireStrictEnterprise
```

5. Delete the temp file:

```powershell
Remove-Item -LiteralPath "$env:TEMP\supermega-pos-db-url.txt" -Force
```

## Fix Option C: Activate From A Dotenv File

Use this if the provider gives you a `.env` export.

```powershell
powershell -ExecutionPolicy Bypass -File tools\activate_pos_database.ps1 `
  -DatabaseEnvFile "C:\path\to\.env.production.local" `
  -DatabaseEnvKey POSTGRES_URL `
  -Replace `
  -Redeploy `
  -RequireStrictEnterprise
```

If `-DatabaseEnvKey` is omitted, the script tries supported keys in priority order.

## Required Proof Before Sales Launch

```powershell
npm run db:pos:diagnose
npm run smoke:pos-host -- https://pos.supermega.dev
npm run smoke:pos-handoff -- https://pos.supermega.dev
npm run smoke:pos-enterprise -- https://pos.supermega.dev
npm run smoke:pos-enterprise:strict -- https://pos.supermega.dev
```

Do not sell as full enterprise production until strict passes. Pilot/demo/sales handoff can continue while strict is blocked, because the app has a snapshot audit fallback, but cross-deployment durable audit/history still needs managed Postgres.
