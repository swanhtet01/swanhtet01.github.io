# SuperMega Enterprise Activation

The application is intentionally usable in demo/free mode with SQLite, but it is not an enterprise system of record until a reachable managed Postgres database is attached to the Vercel `megaos` project.

## One-time activation

1. Create or install a managed Postgres resource for the Vercel `megaos` project through the Vercel Marketplace. Neon, Supabase Postgres, and Aurora Postgres are supported providers.
2. Save the provider connection URL in a local file that is not committed, for example `.tmp/supermega-production-database-url.txt`.
3. Validate only:

```powershell
powershell -ExecutionPolicy Bypass -File tools/activate_supermega_database.ps1 -DatabaseUrlFile .tmp\supermega-production-database-url.txt -ValidateOnly
```

4. Activate the Vercel production variable:

```powershell
powershell -ExecutionPolicy Bypass -File tools/activate_supermega_database.ps1 -DatabaseUrlFile .tmp\supermega-production-database-url.txt -Replace
```

5. Redeploy `megaos` and require the strict smoke gate. Live health must report `status=ready`, `enterprise_db_ready=true`, a non-SQLite scheme, and a non-zero data coverage score after the first real workspace source sync.

The helper never prints the connection URL and does not commit or persist the secret. Do not use the old Cloud SQL `/cloudsql/` socket URL on Vercel.
