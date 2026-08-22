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

For any reviewed combination of Shop, Plant, Website, and Ecommerce, create one
private operator workspace instead of manually assembling separate provisioning,
launch-board, and dashboard commands:

```powershell
npm.cmd run client:portal:workspace -- prepare `
  --preparation C:\reviewed\client-preparation.json `
  --workspace C:\private\named-client-portal
```

Repeat `--managed-request-file C:\reviewed\product-request.json` once for each
reviewed product outcome that already exists. The command verifies the client
preparation, compiles the exact selected products and entitlement-valid
connections, and atomically publishes a private folder containing:

- `START-HERE.html` — mobile-friendly, identity-free operator dashboard;
- `client-preparation.private.json` — the reviewed private source;
- `client-portal-provisioning.private.json` — tenant and role design;
- `client-launch-board.private.json` — evidence gates and next actions; and
- `client-workspace-manifest.json` — digest-bound artifact inventory.

The terminal receipt contains only status, counts, digests, and false external
action controls. Existing output directories are never replaced. Verify the
whole folder at any time with the same managed request files:

```powershell
npm.cmd run client:portal:workspace -- verify `
  --workspace C:\private\named-client-portal
```

This is a local preparation workspace, not a tenant activation. It performs no
provider call, tenant write, deployment, message, or production action.

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
`client-preparation.private.json`, `client-launch-board.private.json`, and a
mobile-friendly `START-HERE.html` founder dashboard in one local operation. The
dashboard omits client identity and shows only selected products, readiness,
blockers, connected workflows, and next actions. Its terminal response contains
only counts, digests, and false external-action controls. Activation remains
`not_applied`.

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

At any point, inspect one private starter, pilot, protected client workspace, or
launch workspace with one metadata-only command:

```powershell
npm.cmd run client:pilot:workspace -- `
  --status `
  --workspace C:\private\spa-client-launch
```

The result reports one verified client stage, the safe entry filename, and one
next action. It never returns client identity or the supplied path. Optionally
add `--release-packet <packet.json>` and/or
`--activation-receipt <receipt.json>`. Those options validate the local packet
or receipt projection only. They do not query GitHub, Vercel, Supabase, or the
database, so current remote state and hosted activation remain explicitly
unproven; a database-derived receipt still requires its mandated requery and
portal smoke test.

Add one `--managed-request-file` per purchased product, in canonical Shop,
Plant, Website, Ecommerce order, as those owner-reviewed outcomes become
available. The board advances only the gates proved by those exact requests.

## Establish the named owner before tenant activation

Do not put a service-role key, owner access token, or raw owner email in a plan,
terminal argument, repository, or handoff. Store the owner email in a one-line
private file and prepare a one-hour, owner-approved invitation plan. This step
does not create a user or send email:

```powershell
npm run client:owner-identity -- prepare `
  --project-ref PRODUCTION-SUPABASE-PROJECT-REF `
  --release-commit EXACT-PROTECTED-RELEASE-SHA `
  --workspace-label "Named client business" `
  --owner-label "Named client owner" `
  --owner-email-file C:\private\owner-email.txt `
  --approval-id OWNER-APPROVAL-UUID `
  --approved-at 2026-08-22T00:00:00.000Z `
  --expires-at 2026-08-22T01:00:00.000Z `
  --output C:\reviewed\owner-identity-plan.json
```

The reviewed server-side Auth administrator may separately execute the exact
invitation through Supabase. That action sends email and is not performed by
this tool. After the owner accepts the invitation, confirms the address, and
signs in at `https://app.supermega.dev/account/setup`, prove the exact named
identity against Supabase Auth's live `/auth/v1/user` endpoint:

```powershell
npm run client:owner-identity -- verify-existing `
  --plan C:\reviewed\owner-identity-plan.json `
  --owner-token-file C:\private\owner-access-token.txt `
  --publishable-key-file C:\private\supabase-publishable-key.txt `
  --output C:\reviewed\owner-identity-proof.json
```

The proof contains the owner UUID required by the activation plan, but only
digests of the email and active session. It creates no workspace membership and
makes no provider write. Authorization remains in the tenant membership and
capability tables; editable `user_metadata` is never an authorization source.

Prepare the activation directly from that proof instead of copying its owner
UUID, project reference, or release commit into a command. Repeat
`--request-file` in canonical Shop, Plant, Website, Ecommerce order. The
invitation approval and this separate tenant-activation approval are never
treated as interchangeable authority:

```powershell
npm run client:owner-identity -- prepare-activation `
  --owner-plan C:\reviewed\owner-identity-plan.json `
  --owner-proof C:\reviewed\owner-identity-proof.json `
  --request-file C:\reviewed\shop-managed-request.json `
  --workspace-id named-client-workspace `
  --activation-approval-id TENANT-ACTIVATION-APPROVAL-UUID `
  --activation-approved-at 2026-08-22T00:30:00.000Z `
  --admin-ca-file C:\private\prod-ca.pem `
  --output C:\reviewed\proof-bound-activation-plan.json
```

This compiler rejects expired identity approval, changed client labels,
unconfirmed or mismatched email proof, noncanonical product order, and target
drift. It produces the same standard single- or multi-product activation plan
accepted by the database authorization and apply commands, with no provider or
tenant write.

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

Before opening the portal, requery the database and bind the original plan and
activation receipt into one create-only evidence file:

```powershell
npm run client:activation:requery -- `
  --plan-file C:\reviewed\beauty-spa-activation-plan.json `
  --database-url-file C:\secrets\admin-database-url.txt `
  --receipt-file C:\reviewed\beauty-spa-activation-receipt.json `
  --output C:\reviewed\beauty-spa-activation-requery.json
```

This command uses a read-only transaction and requires the exact approved
authorization, active workspace access, one matching owner membership, immutable
activation event, PostgreSQL 17, and managed schema version 11. Its evidence
still fails closed on the separate live-release, named-owner portal, and
cross-tenant denial smoke gates.

## 5. Verify the client portal

After the reviewed candidate is deployed, run the read-only hosted portal smoke
against that exact immutable release. Store each value in a separate local file;
never put access tokens or client identifiers on the command line.

```powershell
$env:EXPECTED_RELEASE_COMMIT = 'DEPLOYED-40-CHARACTER-GIT-SHA'
$env:SUPERMEGA_EXPECTED_PRODUCTS = 'shop,website'
$env:SUPERMEGA_EXPECTED_WORKSPACE_ID_FILE = 'C:\secrets\workspace-id.txt'
$env:SUPERMEGA_EXPECTED_OWNER_ID_FILE = 'C:\secrets\owner-user-id.txt'
$env:SUPERMEGA_OWNER_ACCESS_TOKEN_FILE = 'C:\secrets\owner-access-token.txt'
$env:SUPERMEGA_DENIED_ACCESS_TOKEN_FILE = 'C:\secrets\unrelated-user-access-token.txt'
$env:SUPERMEGA_HOSTED_PORTAL_EVIDENCE_FILE = 'C:\reviewed\beauty-spa-hosted-portal-smoke.json'
npm run client:portal:hosted-smoke
```

The unrelated user must be a valid named Supabase user, but must not belong to
the activated workspace. The verifier performs only six HTTPS GET requests. It
requires all of the following before creating its evidence file:

1. `/__release.json` matches the exact reviewed Git commit and canonical app
   domain.
2. `/api/health` proves managed PostgreSQL, Supabase user authentication,
   private runtime role, audit, and writes are ready.
3. The named owner sees exactly one matching owner directory entry.
4. The owner's bootstrap identity, write readiness, purchased product
   entitlements, capabilities, and required state surfaces agree.
5. A separately authenticated user cannot discover the owner workspace and
   receives `403 trial_membership_required` when requesting its bootstrap.
6. Every private response is non-cacheable and protected by `nosniff`.

The create-only evidence contains SHA-256 digests instead of workspace or owner
identifiers and never persists either token. It proves portal read access and
HTTP-level tenant denial; it does not deploy, mutate tenant data, prove a
bounded write/read-back, activate billing, send messages, or enable scheduled
automations.

After the read-only smoke passes, record the owner-approved bounded acceptance
event for every purchased product. This is a production database write, so the
approval UUID and exact confirmation remain separate from routine verification:

```powershell
$env:SUPERMEGA_OWNER_APPROVAL_ID_FILE = 'C:\secrets\owner-approval-id.txt'
$env:SUPERMEGA_HOSTED_ACCEPTANCE_CONFIRMATION = 'RECORD HOSTED PRODUCT ACCEPTANCE'
$env:SUPERMEGA_HOSTED_ACCEPTANCE_EVIDENCE_FILE = 'C:\reviewed\beauty-spa-product-acceptance.json'
npm run client:portal:hosted-acceptance -- --production-handoff
```

The command first repeats the exact-release, owner-portal, entitlement, and
unrelated-user checks above. It then derives one deterministic probe UUID per
approved product and performs four checks: insert or exact replay, owner
read-back, unrelated-user denial, and exact idempotent replay. Each event binds
the workspace, owner approval, product, release commit, current product-state
version, and current state digest. It is append-only and does not increment or
change product state.

The command can therefore prove the hosted write path without creating fake
orders, inventory, jobs, leads, pages, payments, messages, or customer records.
Retries reuse the same deterministic probe IDs and create no duplicate events.
The output remains create-only and stores digests instead of client identifiers
or credentials. Deployment, billing, messaging, and automation remain false.
Keep `SUPERMEGA_HOSTED_PORTAL_EVIDENCE_FILE` pointed at the create-only portal
smoke artifact while running acceptance. Acceptance reads that artifact,
repeats the hosted portal checks, and records both its exact file digest and a
timestamp-independent full-evidence binding. It fails before an acceptance
event if the release, HTTP response evidence, tenant denial, entitlements,
capabilities, or runtime posture changed.

Finally, bind the reviewed release handoff, database requery, portal smoke, and
per-product acceptance into one create-only launch proof:

```powershell
npm run client:portal:launch-proof -- `
  --release-handoff C:\reviewed\release-handoff.json `
  --activation-requery C:\reviewed\beauty-spa-activation-requery.json `
  --portal-smoke C:\reviewed\beauty-spa-hosted-portal-smoke.json `
  --product-acceptance C:\reviewed\beauty-spa-product-acceptance.json `
  --output C:\reviewed\beauty-spa-client-portal-launch-proof.json
```

The launch proof fails closed unless every artifact names the same immutable
release, hashed workspace, hashed owner, hashed owner approval, and canonically
ordered product set.
It also requires the acceptance artifact to name the exact portal-smoke file
digest and the same full portal-evidence binding, preventing a stale or
substituted smoke result from being paired with a newer acceptance run.
It also requires database activation before portal isolation, and portal
isolation before product write/read-back acceptance. The resulting artifact
contains the exact entitled product links under `app.supermega.dev`, but no raw
workspace ID, owner ID, access token, approval ID, or client row. Its status
`ready_for_named_use` proves tenant access, isolation, and bounded data-path
acceptance; it does not claim that a client's real operating workflow, business
outcome, billing, messages, integrations, or custom extension has been accepted.

Activation requery evidence v2 includes the exact reviewed product set so a
later proof cannot silently add or remove a portal entitlement. Older v1
requery evidence must be regenerated from the database before launch proof.

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

Every artifact output is create-only. Reusing an existing output path fails
instead of silently replacing reviewed evidence. Successful CLI receipts
expose only a SHA-256 workspace digest, never the raw workspace UUID or client
records; the reviewed artifacts retain the tenant binding needed by later
verification.

After the extension has a verified activation receipt and the same named owner
has a retained managed-context profile, bind the custom module into an advisory
agent-context artifact:

```powershell
node tools/manage_client_extension.mjs bind-agent-context `
  --preparation C:\reviewed\private-review.json `
  --manifest C:\reviewed\extension-manifest.json `
  --plan C:\reviewed\extension-activation-plan.json `
  --portal C:\reviewed\portal-activation.json `
  --binding C:\reviewed\extension-portal-binding.json `
  --authorization C:\reviewed\extension-runtime-authorization.json `
  --receipt C:\reviewed\extension-activation-receipt.json `
  --context-profile C:\reviewed\managed-context-profile.json `
  --output C:\reviewed\extension-agent-context.json
```

`supermega.client_extension_agent_context.v1` binds the exact activation
receipt, context profile, approved context digest, workspace, owner, product,
implementation, and requested advisory actions. It contains no product,
behavior, decision, or customer rows; model training remains forbidden. The
agent may rank, summarize, draft, and propose according to the retained context,
but cannot execute extension configuration writes, customer writes, messages,
payments, stock moves, production writes, publishing, CRM writes, or external
tool calls. Those actions still require a separate reviewed runtime path and
receipt.
