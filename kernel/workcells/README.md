# Operator Workcells

A workcell is the sellable runtime unit above connectors: fixed owned-account reads, one structured
owner output, optional owner-channel delivery, and no customer-facing send/write/pay capability.

## Products

| slug | output | required connectors | additional input |
|---|---|---|---|
| `cash-close` | settled cash, fees, net receipts, exceptions | PayPal | none |
| `pipeline-control` | deals and delivery work ranked by revenue risk | Pipedrive, ClickUp | ClickUp list id |
| `owner-command` | one cash, pipeline, and delivery command brief | PayPal, Pipedrive, ClickUp | ClickUp list id |

The runtime executes the declared reads directly. A model does not choose or expand the tool plan.
If one required source is unavailable, the workcell stops before synthesis.

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
3. Repeat with `deliver:true` and confirm one owner-channel message.
4. Trigger the scheduled route twice for the same local date and confirm the second result is
   `duplicate:true` with no second message.

The default production cron remains `01:30 UTC` (08:00 Myanmar). Because each client has an isolated
deployment, set that deployment's `vercel.json` schedule to the client's desired UTC delivery time
before release. Vercel cron schedules are UTC and only production deployments register them.
