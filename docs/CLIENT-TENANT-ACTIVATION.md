# Client tenant activation

This runbook creates one isolated SuperMega tenant with one owner membership and
only the products that the client approved. Shop and Ecommerce may share the
commerce data surface, but the immutable activation event preserves them as
separate portal entitlements.

## Required reviewed inputs

- One current managed trial request per purchased product, in this order:
  Shop, Plant, Website, Ecommerce. Omit products the client did not purchase.
- Named workspace ID, Supabase Auth owner UUID, owner approval UUID and approval
  timestamp.
- Exact protected release commit and production Supabase project reference.
- Reviewed CA certificate plus an administrative PostgreSQL URL stored in a
  local secret file. The URL must use `sslmode=verify-full`.
- Owner access token and Supabase publishable key in separate local secret
  files. Never place credentials in a request, plan, receipt, command history,
  or this repository.

## 1. Prepare the immutable plan (no provider writes)

Repeat `--request-file` once per purchased product in canonical order. A single
request creates the legacy-compatible v1 plan; two to four requests create one
atomic v2 tenant plan.

```powershell
python -s -m supermega_runtime.managed_activation prepare `
  --request-file C:\reviewed\shop-request.json `
  --request-file C:\reviewed\website-request.json `
  --request-file C:\reviewed\ecommerce-request.json `
  --workspace-id beauty-spa `
  --owner-actor-id OWNER-SUPABASE-USER-UUID `
  --approval-id OWNER-APPROVAL-UUID `
  --approved-by "Named Spa Owner" `
  --approved-at 2026-08-21T00:00:00.000Z `
  --project-ref PRODUCTION-PROJECT-REF `
  --release-commit PROTECTED-ORIGIN-MAIN-COMMIT `
  --admin-ca-file C:\secrets\supabase-ca.crt `
  --output C:\reviewed\beauty-spa-activation-plan.json
```

Review the plan's `products`, `ownerCapabilities`, target, expiry, source plan
digests, rollback authorization, and `secretValuesExposed: false` before any
write-capable operation.

## 2. Inspect the target (read-only)

```powershell
python -s -m supermega_runtime.managed_activation validate `
  --plan-file C:\reviewed\beauty-spa-activation-plan.json `
  --database-url-file C:\secrets\admin-database-url.txt
```

Continue only when the result is `authorization_required` or an idempotent
replay state. Any conflict requires investigation; do not replace the plan or
delete tenant records to bypass it.

## 3. Record owner authorization

This is the first database mutation and requires the owner-approved production
handoff. The authenticated Supabase user must match `ownerActorId`.

```powershell
python -s -m supermega_runtime.managed_activation authorize `
  --plan-file C:\reviewed\beauty-spa-activation-plan.json `
  --database-url-file C:\secrets\admin-database-url.txt `
  --owner-access-token-file C:\secrets\owner-access-token.txt `
  --publishable-key-file C:\secrets\supabase-publishable-key.txt `
  --decision-note "Owner approved this exact product set and plan digest." `
  --confirm-owner-approval OWNER-APPROVAL-UUID `
  --production-handoff
```

## 4. Apply one atomic tenant activation

```powershell
python -s -m supermega_runtime.managed_activation apply `
  --plan-file C:\reviewed\beauty-spa-activation-plan.json `
  --database-url-file C:\secrets\admin-database-url.txt `
  --confirm-owner-approval OWNER-APPROVAL-UUID `
  --production-handoff `
  --receipt-file C:\reviewed\beauty-spa-activation-receipt.json
```

The transaction inserts one access control, one owner membership with the union
of required surface capabilities, and one immutable activation event carrying
the explicit product list. Re-running the same command must return an
idempotent replay; a changed product set must conflict.

## 5. Verify the client portal

1. Sign in as the named owner and request `/api/trial/v1/bootstrap`.
2. Confirm `identity.workspace_id` is the activated tenant.
3. Confirm `readiness.productEntitlements` exactly matches the approved runtime
   products (`commerce`, `production`, `website`, `ecommerce`).
4. Confirm the app navigation shows only those products.
5. Create and read back one bounded record in each purchased product, then
   confirm another tenant cannot read it.
6. Preserve the database-derived activation receipt and smoke-test evidence.

Deployment, domain publication, billing activation, customer messages, and
scheduled automations remain separate owner-approved operations.
