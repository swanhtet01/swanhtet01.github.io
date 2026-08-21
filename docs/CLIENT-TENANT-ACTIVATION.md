# Client tenant activation

This runbook creates one isolated SuperMega tenant with one owner membership and
only the products that the client approved. Shop and Ecommerce may share the
commerce data surface, but the immutable activation event preserves them as
separate portal entitlements.

Ecommerce is therefore activated with the governed `commerce.read/write`
capabilities used by the shared catalog and Shop handoff. Do not invent an
`ecommerce.*` database capability: product visibility comes from the immutable
Ecommerce entitlement, while operational writes stay on the existing commerce
RLS surface.

## One client launch board first (no provider writes)

For the Spa pilot, the reviewed private intake can first create its isolated,
Spa-configured Shop portal workspace without copying requester identity or
performing a hosted write:

```powershell
npm.cmd run client:pilot:workspace -- `
  --prepare-client-launch `
  --workspace C:\private\spa-pilot `
  --client-workspace C:\private\spa-client-portal `
  --implementation-owner "Responsible SuperMega operator"
```

The command requires the prepared pilot stage and every owner gate, selects the
`service-business` / beauty-and-spa template, retains only source digests in the
new workspace, prepares the selected Shop data, and creates and verifies
`client-preparation.private.json` plus `client-launch-board.private.json` in one
local operation. Its terminal response contains only counts, digests, and false
external-action controls. Activation remains `not_applied`.

The launch board lists only the client's selected products, exact setup routes,
entitlement-valid connections, custom-solution lifecycle, evidence gaps, and
next actions. It contains no raw client rows or secrets and cannot activate a
tenant. The lower-level commands remain available when an operator needs to
prepare or verify artifacts separately:

```powershell
npm run client:launch:board -- `
  --preparation C:\reviewed\client-preparation.json `
  --output C:\reviewed\client-launch-board.json

npm run client:launch:board:verify -- `
  --preparation C:\reviewed\client-preparation.json `
  --board C:\reviewed\client-launch-board.json
```

Add one `--managed-request-file` per purchased product, in canonical Shop,
Plant, Website, Ecommerce order, as those owner-reviewed outcomes become
available. The board advances only the gates proved by those exact requests.

## Add staff only after tenant activation

SuperMega does not create an Auth user or send an invitation email as a side
effect of granting workspace access. Create or invite the person separately
through a reviewed server-side Supabase Auth administration flow, confirm the
resulting non-anonymous user UUID, and then prepare a short-lived staff plan:

```powershell
npm run client:staff-access -- prepare `
  --activation-plan-file C:\reviewed\beauty-spa-activation-plan.json `
  --member-actor-id STAFF-SUPABASE-USER-UUID `
  --member-label "Named staff member" `
  --role-id product-operator `
  --approval-id OWNER-STAFF-APPROVAL-UUID `
  --approved-at 2026-08-21T00:00:00.000Z `
  --expires-at 2026-08-21T01:00:00.000Z `
  --output C:\reviewed\beauty-spa-staff-plan.json
```

The supported roles are `product-viewer`, `product-operator`, and
`workspace-manager`. Their capabilities are derived from the already activated
products and never include owner-only company control, baseline approval,
approval decision, or setup-write authority. `authorize` requires the active
owner's current Supabase session; `apply` verifies that the named Auth UUID
already exists before inserting one tenant membership and immutable event;
`revoke` requires the active owner session again and retains a revocation
receipt. Email delivery, Auth-user creation, billing, deployment, and product
purchase changes remain separate actions.

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

## Custom client solutions

A custom solution must extend one product already present in the client's
verified blueprint. First generate and verify a
`supermega.client_extension_manifest.v1` request. It may depend only on
capabilities already available to that client, owns records through one base
product, and cannot request cross-product writes.

Implementation does not activate the request. Before activation, generate and
verify a `supermega.client_extension_activation_plan.v1` containing four
independent SHA-256 proofs: implementation, versioned migration, rollback, and
security review. The named blueprint owner must approve after the security
review. A valid plan remains `planned-not-applied`; applying tenant changes is a
separate owner-approved operation and must retain the exact manifest and plan
digests in its receipt.

Use the internal CLI against the already verified client preparation:

```powershell
node tools/manage_client_extension.mjs request `
  --preparation C:\reviewed\private-review.json `
  --request C:\reviewed\extension-request.json `
  --created-at 2026-08-21T00:00:00.000Z `
  --output C:\reviewed\extension-manifest.json

node tools/manage_client_extension.mjs verify-request `
  --preparation C:\reviewed\private-review.json `
  --manifest C:\reviewed\extension-manifest.json

node tools/manage_client_extension.mjs plan `
  --preparation C:\reviewed\private-review.json `
  --manifest C:\reviewed\extension-manifest.json `
  --evidence C:\reviewed\extension-activation-evidence.json `
  --output C:\reviewed\extension-activation-plan.json

node tools/manage_client_extension.mjs verify-plan `
  --preparation C:\reviewed\private-review.json `
  --manifest C:\reviewed\extension-manifest.json `
  --plan C:\reviewed\extension-activation-plan.json
```

Every output is create-only. Reusing an existing output path fails instead of
silently replacing reviewed evidence.
