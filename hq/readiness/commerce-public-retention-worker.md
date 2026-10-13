# Commerce public-contact retention worker

**Status: source only; not scheduled, deployed, or proven on a managed target.**
The public buyer route remains disabled. The intake SQL is still in
`supabase/rehearsal`, not the production migration chain.

`tools/run_commerce_public_retention.py` performs one bounded run against the
dedicated runtime role. Check mode is read-only. Apply mode first repairs a
private request only when a matching human Shop close event already exists,
then redacts due closed requests. The database retains per-run receipts, so a
retry with the same UUID v4 replays the counts. It never sends a customer
message, confirms an order, records payment, or moves stock.

The worker requires the target class (`preview` or `production`), exact project
ref, explicit TLS and schema version 13. A preview target cannot bind the
production project. A production target requires `sslmode=verify-full`.
Production apply is refused in this source revision until the staging and
founder release gates are met and a separately reviewed activation is added.
Shared transaction-pooler URLs are refused; for an IPv4-only persistent VPS,
use the exact session-pooler URL shown in the project Connect panel. See
[Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).
Only a dedicated runtime-role URL belongs in `SUPERMEGA_DATABASE_URL`; keep it
in the host's protected environment, never a command argument or log.

Required environment: `SUPERMEGA_COMMERCE_RETENTION_TARGET`,
`SUPERMEGA_COMMERCE_RETENTION_PROJECT_REF`, `SUPERMEGA_DATABASE_URL`,
`SUPERMEGA_TRIAL_SCHEMA_VERSION=13` and
`SUPERMEGA_BILLING_SCHEMA_VERSION=13`. Apply additionally requires
`SUPERMEGA_COMMERCE_RETENTION_ENABLED=1` and
`SUPERMEGA_TRIAL_WRITES_ENABLED=true`. These switches are operational guards,
not evidence of founder approval or safe deployment.

From the repository root on the approved host:

```text
python tools/run_commerce_public_retention.py --expected-target preview --limit 100
python tools/run_commerce_public_retention.py --expected-target preview --apply --run-id <stable-uuid-v4> --limit 100
```

Exit `0` means the checked redaction-due queue is clear; check mode does not
count stranded Shop closes. Exit `2` means contact is due after the
check or bounded apply, or a reconciliation batch hit its cap; page the
operator and run another measured batch.
Exit `1` means configuration was refused or a database acknowledgement is
uncertain. An apply failure must be retried with the **same** run ID after
checking the private run receipts; do not assume no write occurred. Output is
limited to target, counts, status and run ID, without contact or database URL.
Store job logs under the same retention policy and test alert delivery.

Before any scheduler or production use: promote reviewed SQL through the
staging migration chain; prove the managed role, tenant isolation, TLS,
duplicate retry and restore behavior; measure the maximum due backlog and
runtime; choose one scheduler authority consistent with
`tools/supermega_scheduler_authority.json`; wire retries and exit-code alerts;
prove that backups, exports, logs and support views meet the approved 30-day
unconverted-request contact policy; and record the founder's release decision.
The existing Vercel scheduler authority is dormant and permits no active cron.
Authorization to use paid VPS/cloud capacity does not activate this worker.
