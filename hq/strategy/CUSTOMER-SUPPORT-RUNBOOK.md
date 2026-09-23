# Customer support runbook — first response, no ticketing system

Status: v2. Local operating guidance; hosted intake and staffing must be verified before launch. Originally written 2026-08-17 after a company review found no documented
support procedure existed anywhere in the repo — the only prior answer to
"a customer reports a problem" was the founder finding out by phone. This
does not add a support tool; it writes down what to actually do with the
tools that already exist, so the first real customer report does not start
from zero.

## The channel today

There is no ticketing system connector (no Zendesk/Freshdesk/Intercom). The
public intake route is `supermega.dev/contact`. Depending on configuration,
it may retain a request in `supermega_leads` and/or deliver it through email,
Telegram or a webhook
(`SUPERMEGA_CONTACT_NOTIFY_EMAIL`, default `swanhtet@supermega.dev`) — see
`tools/create_public_vercel_output.mjs`. Until a real support inbox exists,
**that configured email is the support contact**, not proof of a staffed queue.
The generated handler may return a receipt after durable retention even if
notifications fail. It can also accept through a configured delivery channel
when durable storage is not configured. A receipt is therefore not proof that
someone read the request, that an email reached an inbox, or that an account
was created. The status endpoint reports configuration, not end-to-end delivery.

## Request received → assigned → prepared → reviewed

Before accepting real setup work, name an intake owner and backup, verify the
configured inbox is accessible, and prove an authorized synthetic request can
be found there or in the approved retained-intake workflow. Do not call intake
operational if there is no staffed route to find accepted requests. Record the
test reference and observed result; provider acceptance alone is insufficient.

Use the existing private operating tracker, not a new public spreadsheet or
an unapproved integration. Track only reference, product, assigned owner,
stage, next action and agreed follow-up date. Keep contact details and briefs
in their approved source rather than copying them across agent workspaces.

1. **Received:** locate the exact `LEAD-…` reference; reconcile retries by that
   reference before creating another task. If it cannot be located, escalate
   as intake-unconfirmed; do not ask the customer to submit repeatedly.
2. **Assigned:** a named person accepts responsibility and confirms needs,
   scope, price and timing. Do not infer that an acknowledgement email is a
   human response or an agreed deadline.
3. **Prepared:** SuperMega prepares the Website/catalog preview or Shop setup.
   Ask for the business result, not for the customer to learn a builder.
4. **Reviewed:** record the customer's explicit decision against the exact
   preview/setup revision. A request for changes is not publication approval.
5. **Ready for activation:** separately verify account access, data/import
   scope, recovery and product-specific release checks. Receipt, price
   agreement and preview approval do not bypass deployment or data gates.

At each agreed intake review, reconcile open references with assigned owners
and next actions. Notification failure or an unassigned retained request is an
operational issue to resolve, not a reason to claim the customer was contacted.

## Prepare a received setup request with the existing tools

This is a staff-only local workflow, not a customer-facing builder or a hosted
inbox. First locate the authorized private `supermega.contact.created` event
for the exact received reference. Do not reconstruct an event from analytics,
paste customer information into source, or treat a notification as assignment.
Run from the current verified repository checkout. Replace the quoted path
placeholders with approved private locations outside Git; outputs must be new.

```powershell
npm.cmd run client:workspace:contact:review-template -- "<private-event.json>" --out "<new-private-owner-review.json>"
```

An accountable person must review the generated template: exact lead, workspace,
implementation owner, preset, selected products, company/goal review, private
workspace approval and review time. Leave gates false until that review occurs.
The v2 review binds `requestDigest` to the normalized lead, product, company,
goal, requested template and submission time. If any of these changes, generate
a new review template and review the changed brief; do not copy the old approvals.
Legacy v1 reviews are rejected. This digest detects changed content, not the
identity or authenticity of the reviewer. Names, email and raw contact fields
are excluded from this preparation binding and remain in the private intake system.
Preparation also verifies any retained CONTACT-INTAKE.json against client.json
before compiling packages. A changed owner, product selection or damaged receipt
must be resolved through reviewed intake, not by skipping the standalone verifier.
New contact-created folders use `supermega.client_contact_profile.v1` and pin the
intake digest in client.json. Removing or replacing the receipt fails preparation.
Older contact folders must be regenerated into a new private directory after review;
they are not silently migrated. Generic local sample folders remain supported but
do not establish customer approval. These local integrity checks are not signatures
or protection against an actor rewriting the entire folder.
Website requests select Website; Ecommerce preparation includes Shop for its
request handoff. Do not use the generic default initializer, which can include
unrequested products. A template suggestion is not agreed scope.

```powershell
npm.cmd run client:workspace:from-contact -- "<new-private-client-folder>" --contact-event "<private-event.json>" --owner-review "<private-owner-review.json>"
npm.cmd run client:workspace:contact:verify -- "<private-client-folder>"
```

Follow the generated `START-HERE.md`. Review only selected product CSVs; replace
every sample row before using customer data. An absent CSV deliberately retains
a labelled sample fixture, so preparation success alone is not live readiness.

```powershell
npm.cmd run client:prepare -- --data-dir "<private-client-folder>" --out "<new-private-preparation.json>"
npm.cmd run client:prepare:verify -- "<private-preparation.json>"
```

Keep the preparation private: it may contain business data and is not a shareable
customer preview URL. Record only the reference, owner, stage and evidence pointer
in the approved tracker. Staff then prepare a separately reviewed preview and
obtain the customer's decision on that revision. No command above sends a message,
creates a live account, imports operational records or publishes a site.

On existing output, missing approval or a binding error, stop and verify the
existing workspace; never overwrite it or invent approval to make the tool pass.
The Vision inbox processor is not the intake queue for Shop/Website/Ecommerce.
Hosted receipt-to-staff discovery still requires separate observed evidence.

## Service-first setup and bounded experiments

Operating decision: Website and Ecommerce are prepared by SuperMega, not sold
as a requirement to learn an editor. Shop is prepared with the customer and
then handed over for daily use. Builder, import and deployment controls stay
in the staff workflow. The customer needs one next action and a clear status.

| Product | Customer supplies | Staff prepares | Customer reviews | First-value evidence |
| --- | --- | --- | --- | --- |
| Shop | Trade, item list and operating needs | Reviewed template, items, roles and backup walkthrough | Items, prices and daily workflow | Authorized operator completes a sale-to-close journey and recovery check |
| Website | Business brief and approved content | Responsive preview, copy and images for review | Exact preview and requested changes | Owner approves the exact preview; publication is a separate gate |
| Ecommerce | Catalog and request-handling needs | Catalog preview and request-to-Shop handoff | Items and request wording | Authorized test request is found once in the intended staff workflow |

Do not describe a screenshot, local sample sale or generated package as any
of these customer outcomes. Preview links and staff preparation receipts are
different deliverables. Never send private preparation JSON as the preview.

### One experiment card, one accountable owner

Use the existing private tracker. Each card records: experiment reference,
product, named owner and independent reviewer, exact source/preview revision,
hypothesis, control, proposed variant, eligibility and consent, task script,
primary measure, safety measures, sample/stopping rule, evidence references,
decision and follow-up. No new analytics vendor or automatic assignment is
authorized here. Avoid copying customer details into research records.

Initial hypotheses (queued, not validated):

- Shop: a staff-prepared trade setup reduces help needed to complete the first
  sale-to-close task compared with an unprepared template selection flow.
- Website: brief-to-prepared-preview needs fewer customer corrections and less
  customer effort than asking the owner to configure an editor.
- Ecommerce: a prepared catalog plus an explicit request-only handoff improves
  accurate understanding of what happens after submission.

Begin with formative usability sessions, not a conversion A/B claim: five
consenting participants per product, one synthetic scenario per session, no
real sale, message, payment, stock change or publication. This is a planning
target, not five completed sessions. Record unaided task completion, assistance
count, active task minutes, staff preparation minutes, correction count and
whether the participant correctly describes the storage/payment/publication
boundary. Include mobile, tablet and desktop across the recruited sessions;
record device/language context coarsely, without contact or device identifiers.

Stop a session for data exposure, destructive ambiguity, mistaken payment or
publication belief, or an unrecoverable error. Preserve only approved minimal
evidence, fix and re-review before resuming. Report failures and withdrawals
in the denominator. State observed n and uncertainty; five sessions can reveal
usability problems but cannot establish a statistically reliable A/B winner.

A later live A/B experiment requires separate approval and a preregistered
allocation method, baseline, minimum meaningful effect, sample-size rationale,
duration, primary metric and stopping rule. Keep assignment stable, do not
change price or safety gates between variants, and do not repeatedly peek and
declare a winner. Until real evidence exists, decision = not yet tested.

### Capacity and handover before wider reach

Start with one active preparation per named delivery owner. This is an initial
work-in-progress limit, not a proven capacity or a customer SLA. Queue additional
requests with an agreed next update; do not generate unlimited agent tasks.
Review queue age, time to prepared preview, support minutes, correction rate
and unresolved incidents weekly. Increase capacity only after handovers and
recovery are observed to work, not because more variants can be generated.

For every handover retain the exact accepted revision, named operating owner,
access check, product-specific first-value evidence, backup/recovery result,
support route and next review date in the approved private tracker. Separate
states are local-tested, hosted-verified and customer-accepted. None implies
the next. Enterprise readiness additionally needs measured isolation,
availability, recovery and support evidence; it is not a UI label or an
experiment outcome. This runbook grants no contact, account, deployment,
database or commercial action authority.

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
5. For a MANAGED workspace: treat a missing record as an unresolved incident.
   A durable event-log design does not prove this particular write was
   committed, retained or recoverable. Preserve the visible status and
   approximate time; escalate through the approved private engineering
   channel. Do not assume a display issue, promise recovery, retry a financial
   operation, or attempt a database action from this runbook.

## "A customer says a sale didn't record"

1. Ask for the approximate time, item, and amount — Shop's daily-close and
   order history are searchable by these.
2. Ask them to check **Shop → Orders**, including the selected workspace,
   date/filter and any pending sync or conflict notice. A clicked button or
   remembered confirmation is not proof of a committed order. If the result
   is missing or uncertain, preserve the reference/status and escalate before
   repeating the sale, payment or stock action. Do not blame customer
   cancellation or claim the product cannot lose a confirmed write.
3. If a sale shows in daily-close totals but the customer disputes it, or
   vice versa: this is a genuine discrepancy, not a support script item.
   Escalate to engineering with the exact order id/time; do not attempt to
   edit records. Engineering must inspect the exact evidence and use the
   applicable reviewed correction/reversal workflow. Never improvise a direct
   database repair or represent a manual payment record as provider settlement.
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
