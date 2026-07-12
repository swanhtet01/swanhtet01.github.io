# Operator Workcells

A workcell is the sellable runtime unit above connectors: fixed owned-account reads, one structured
owner output, optional owner-channel delivery, and one bounded owner-approved ClickUp action.

## Products

| slug | output | required connectors | additional input |
|---|---|---|---|
| `cash-close` | settled cash, fees, net receipts, exceptions | PayPal | none |
| `pipeline-control` | deals and delivery work ranked by revenue risk | Pipedrive, ClickUp | ClickUp list id |
| `owner-command` | one cash, pipeline, and delivery command brief | PayPal, Pipedrive, ClickUp | ClickUp list id |

The runtime executes the declared reads directly. A model does not choose or expand the tool plan.
If one required source is unavailable, the workcell stops before synthesis.

## Approval-Backed Action

`pipeline-control` and `owner-command` can set `queueAction:true` on an explicit console/API run.
That creates a draft only. It does not call ClickUp.

1. Review the exact ClickUp list, task name, description, execution marker, and payload fingerprint
   in the Approval Inbox.
2. Approve the immutable payload.
3. Separately execute the approved payload.
4. If the provider response is lost, wait for the two-minute lease and use recovery. Recovery searches
   the bounded task list for the unique marker before it can re-arm the same payload.

The ClickUp create capability is not registered as an agent tool. No other connector write, message,
refund, payment, or record mutation is available through this approval executor.

## Client Isolation

Deploy one kernel project per client. The deployment's Vercel environment is the credential vault
and failure boundary for that client. Do not place multiple customers' provider credentials in one
kernel project.

Common production variables:

```text
SUPERMEGA_OPS_KEY
CRON_SECRET
ANTHROPIC_API_KEY (or another configured gateway provider)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_ALERT_CHAT_ID
SUPERMEGA_WORKCELL_SLUGS=cash-close,pipeline-control,owner-command
WORKCELL_CLIENT_NAME
WORKCELL_CLIENT_ID
WORKCELL_TIME_ZONE=Asia/Yangon
WORKCELL_CURRENCY=MMK
WORKCELL_LOOKBACK_HOURS=24
WORKCELL_CLICKUP_LIST_ID
```

Provider variables:

```text
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PIPEDRIVE_ACCESS_TOKEN (preferred) or PIPEDRIVE_API_TOKEN
CLICKUP_ACCESS_TOKEN (preferred) or CLICKUP_API_TOKEN
```

`SUPABASE_URL` and the service-role key are required for durable delivery claims. Scheduled delivery
fails closed without durable storage, so duplicate cron events cannot send the owner brief twice.

## Activation Proof

1. `GET /api/workcells` with `x-ops-key` reports all required configuration as present.
2. `POST /api/workcells {"slug":"owner-command","deliver":false}` proves provider access and returns a structured preview.
3. Repeat with `queueAction:true`, verify one draft in `GET /api/approvals`, approve it, then execute it
   only against a client-owned test ClickUp list.
4. Repeat with `deliver:true` and confirm one owner-channel message.
5. Trigger the scheduled route twice for the same local date and confirm the second result is
   `duplicate:true` with no second message.

The default production cron remains `01:30 UTC` (08:00 Myanmar). Because each client has an isolated
deployment, set that deployment's `vercel.json` schedule to the client's desired UTC delivery time
before release. Vercel cron schedules are UTC and only production deployments register them.

## Provisioner

Create a client manifest from `client-manifest.example.json`, then run the no-mutation plan:

```text
npm run workcell:provision -- --manifest workcells/client-manifest.example.json --scope <vercel-team>
```

The plan prints the exact project, UTC cron, non-secret variable names, deployed secret names,
required `SUPERMEGA_NEW_CLIENT_*` input names, missing inputs, clean-source state, and required
confirmation. It never prints values.

Create a dedicated Supabase project for the customer. For one-command schema setup, load its
direct or session-pooler port-5432 connection string into
`SUPERMEGA_NEW_CLIENT_SUPABASE_DB_URL`. The URL must match the project ref in
`SUPERMEGA_NEW_CLIENT_SUPABASE_URL` and target the `postgres` database. TLS is enforced by the
bootstrap client even when the dashboard connection string omits `sslmode`. It is used
only for bootstrap: it is never added to Vercel, printed, or returned. If the team does not provide
that temporary input, run `supabase/workcell-client.sql` in the dedicated project's SQL editor
before apply.

The bootstrap creates only the durable delivery claim, token ledger, AI cache, and action-queue
tables required by the workcells. It enables RLS, removes `anon`/`authenticated` access, and grants
access only to the Supabase service role.

Apply only after loading the plan's exact `SUPERMEGA_NEW_CLIENT_*` inputs into the current process
environment:

```text
npm run workcell:provision -- --apply --manifest <client.json> --scope <vercel-team> --confirm "PROVISION <project-name>"
```

Apply refuses dirty source and an existing project by default. `--allow-existing` is the explicit
upgrade path. Before touching Vercel, it validates/applies the optional bootstrap transaction,
checks the full shape of all four tables, inserts the same delivery claim twice to prove duplicate
suppression, proves one action-queue draft-to-approved compare-and-swap, proves the stale duplicate
transition loses, and deletes both probes. Every deployable environment value is then piped to
Vercel over stdin, never placed in command arguments. The provisioner copies the clean kernel to an
isolated temporary directory, patches only that copy's daily cron, deploys, verifies `/api/status`,
verifies every selected workcell and action-draft readiness in `/api/workcells`, verifies the live
`/api/approvals` inbox, reports only safe readiness metadata, then removes the temporary copy.

All credential inputs are deliberately client-namespaced, including Supabase, Telegram, provider,
and model keys. Generic names such as `SUPABASE_URL` or `PAYPAL_CLIENT_SECRET` are ignored by the
provisioner, preventing inherited shell credentials from silently crossing the client boundary.
`SUPERMEGA_NEW_CLIENT_OPS_KEY` must be distinct from the shared console key.
`SUPERMEGA_NEW_CLIENT_CRON_SECRET` is optional; the provisioner generates a random cron secret when
it is absent.
`SUPERMEGA_NEW_CLIENT_SUPABASE_DB_URL` is conditional and bootstrap-only; it never becomes a Vercel
environment variable.
