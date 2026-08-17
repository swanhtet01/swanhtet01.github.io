# Customer support runbook — first response, no ticketing system

Status: v1. Written 2026-08-17 after a company review found no documented
support procedure existed anywhere in the repo — the only prior answer to
"a customer reports a problem" was the founder finding out by phone. This
does not add a support tool; it writes down what to actually do with the
tools that already exist, so the first real customer report does not start
from zero.

## The channel today

There is no ticketing system connector (no Zendesk/Freshdesk/Intercom). The
only inbound channel is `supermega.dev/contact`, which lands in
`supermega_leads` and fans out to the founder's email/Telegram
(`SUPERMEGA_CONTACT_NOTIFY_EMAIL`, default `swanhtet@supermega.dev`) — see
`tools/create_public_vercel_output.mjs`. Until a real support inbox exists,
**that email is support.** Reply from it directly; there is no queue to
triage against.

## "A customer says they lost data"

The product is honest about where data lives: browser-local storage for the
free tier, nothing on a SuperMega server unless the workspace is managed.
That means most data loss is either (a) genuinely gone (cleared browser data,
different device, private/incognito session) or (b) recoverable from a
restore point the product already made automatically.

1. Ask what device and browser they were using, and whether anything changed
   (new phone, browser update, "cleared my cache," reinstalled the app/PWA).
2. Ask them to open **Settings → Status and recovery** (`/settings/#controls`)
   on the SAME device and look at the "Browser workspace" panel. If a restore
   point exists, it says so ("Saved on this device") — that is an automatic
   safety net the product takes before any reset, not something they had to
   set up.
3. If they have a downloaded backup file (`.json`, from "Download workspace
   backup"), have them use "Load backup file" on that same screen. This
   verifies and previews before anything is restored — nothing is silently
   overwritten.
4. If neither exists: be honest that browser-local data with no backup taken
   is not recoverable by SuperMega — there is nothing to restore from because
   nothing left the device. Say this plainly and early; do not imply a
   recovery is being attempted if none is possible.
5. For a MANAGED workspace (the customer has a company account, not just a
   free trial): the trial store's durable event log means the record itself
   cannot silently vanish — a missing record is very likely a display/sync
   issue, not data loss. Escalate to engineering with the workspace id and
   the exact screen; do not attempt a database action from this runbook.

## "A customer says a sale didn't record"

1. Ask for the approximate time, item, and amount — Shop's daily-close and
   order history are searchable by these.
2. Ask them to check **Shop → Orders**. Every sale that reaches "Create
   order" exists as an order record even before payment/fulfilment is
   finished — if it is not there, the confirmation dialog was likely
   cancelled or never completed on their end (the product never silently
   drops a confirmed order; every write requires the explicit "Confirm to
   create the order" step, which they would remember).
3. If a sale shows in daily-close totals but the customer disputes it, or
   vice versa: this is a genuine discrepancy, not a support script item.
   Escalate to engineering with the exact order id/time; do not attempt to
   edit records — the ledger and order history are append-only by design
   (corrections post reversals, never edits), so "fixing" it directly is not
   possible even for the founder, and that is intentional.
4. Never promise a refund, credit, or compensation from this runbook. That is
   a business decision, not a support script step.

## What NOT to do

- Do not ask a customer to send you their raw backup file or workspace data
  over email/chat as a first step — walk them through the in-app recovery
  screen first (steps above). If engineering genuinely needs the file to
  diagnose a bug, say exactly why before asking.
- Do not attempt any direct database read/write for a managed workspace from
  this runbook. Every production database action stays behind the same
  founder-gated discipline as everywhere else in this project
  (`hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md`) — support escalates to
  engineering, engineering does not improvise a fix live on a call.
- Do not imply SuperMega can recover data that was never backed up. The
  product's local-first design is a real trade-off (see
  `hq/strategy/PRODUCT-CATALOG-AND-PRICING.md` UVP 1) and the honest answer
  when there's truly nothing to restore is part of keeping that trade-off
  honest, not a failure to hide.

## When to escalate vs. resolve on the spot

Resolve on the spot: restore-point/backup walkthroughs, "where do I find X"
questions, confirming a sale/order state that's visible in the UI.

Escalate to engineering: any managed-workspace data discrepancy, anything
that looks like a bug reproducing for more than one customer, any request
that would require a database write, anything involving money that already
moved outside the product (KBZPay/WavePay/bank transfer disputes — those are
between the customer and their payment provider, but flag it so the founder
knows a real transaction is in question).

## What this runbook deliberately does not cover

No SLA commitments, no support-hours promises, no escalation-tier structure —
those are business decisions for whenever support volume justifies them, not
something to invent preemptively for zero real customers. This is a "what do
I actually do right now" doc, not a support org design.
