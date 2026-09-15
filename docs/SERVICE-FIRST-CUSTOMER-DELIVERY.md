# Service-first customer delivery

Status: implementation contract, not a claim of hosted readiness.

## Product promise

SuperMega prepares the customer's system. Customers describe their business,
review the proposed result and operate the delivered product. Learning a builder,
selecting technical templates or configuring AI is not an onboarding prerequisite.
Reuse the existing product templates and safety boundaries; do not create a second
backend, identity system or publishing authority for this service model.

| Product | Customer provides | SuperMega prepares | Customer operates |
| --- | --- | --- | --- |
| Website | Business brief, approved copy/photos, desired contact action | Responsive pages, preview, accessibility checks and release package | Preview approval and change requests; no editor knowledge required |
| Ecommerce | Catalog, actual product photos, prices and fulfillment rules | Catalog layout, request/cart flow and Shop handoff | Incoming requests and catalog change requests; payment/stock changes require their own verified capabilities |
| Shop | Trade type, catalog/services, opening balances, staff and devices | Reviewed import, roles, receipt settings and a ready daily-work screen | Sales, manual tender records, stock operations where enabled and daily close |

Do not promise support for an arbitrary trade merely because its template exists.
Qualify the actual workflow against a tested template, document exceptions and
decline or scope missing capabilities before promising delivery.

## Customer-facing sequence

1. **Request setup:** name, reply email, business name, product or “help me choose”,
   and a plain-language description of the desired result. Template IDs and trial
   evidence are optional handoff metadata, not required customer decisions.
2. **Confirm scope:** an operator reviews requirements, exclusions, price and
   timing. A submitted brief is not an accepted order or a live account.
3. **Review preview:** provide the exact preview and a short acceptance checklist.
   The customer can request changes or approve this specific revision.
4. **Prepare live use:** separately verify publishing, access, import, recovery and
   device requirements. Preview approval does not grant provider mutation authority.
5. **Handoff and support:** provide the working address, named support contact,
   concise operating guide and a visible route for requesting changes.

Never label an unsent brief “received”, a local draft “published”, a preview
“live”, a queued event “observed”, or an AI suggestion “approved”.

## Internal delivery record

Use the existing company work queue as the coordination index; it is not the
transaction store or an authorization mechanism. Bind each delivery to:

- Product, qualified template, named delivery owner and current state.
- Brief reference, agreed scope/exclusions and customer-approved content sources.
- Source revision, preview identity and QA evidence reference.
- Customer approval of that exact revision, or outstanding change requests.
- Separate release authorization and hosted verification references.
- Handoff date, support owner and next review date.

Keep customer records and private attachments in their authorized storage, not in
public source, analytics, prompts or this document. AI can draft and summarize;
an accountable reviewer must accept factual copy, imagery and delivery decisions.

## State and revision rules

`brief_received -> scope_review -> preparing -> customer_review -> release_ready -> live -> support`

- Only a validated intake receipt establishes `brief_received`.
- Requested changes return to `preparing` and create a new review revision.
- Approval binds the exact content/source revision; subsequent material edits
  invalidate it and require review again.
- `release_ready` requires product-specific QA, explicit exclusions and recovery
  evidence. It does not authorize deployment.
- Only successful hosted identity and journey verification establishes `live`.
- Failed release verification remains blocked, with the existing rollback process;
  it must not advance to live based on an HTTP 200 or deployment READY flag alone.

## Entry-page implementation requirements

- Lead with “We set it up for you”; samples are optional supporting examples.
- Keep existing-customer login separate from new setup requests.
- Explain “what we need / what you receive / what happens next” using everyday words.
- Do not expose internal builder, experimental AI or provider controls by default.
- Show a trustworthy submission status and preserve the brief on uncertain errors.
- Test the actual form at desktop, tablet and 390px mobile sizes, including keyboard
  operation, validation, failed submission, retry and receipt confirmation.
- Keep request payloads out of analytics and error logs.

## Evidence and experiments

Compare the existing intake with the service-first version using the same tasks:
request a website, request a catalog and request a configured Shop. Measure task
completion, clarification requests, errors and time to an agreed brief. Synthetic
tests can find defects but cannot establish conversion or customer preference.
Real-user sessions require an identified participant and appropriate consent; do
not invent observations or run unsolicited outreach. Retain the baseline and
explicit accept/reject reasons instead of optimizing for an arbitrary test count.

## Current gaps

The local app entry and header have service-first copy. The contact receipt guard
and its release-test wiring are independently accepted source changes. The public
contact page still needs a captured visual review and copy simplification. The
customer preview/approval lifecycle described here is not yet verified end-to-end.
No new hosted, customer, publishing, payment, stock or provider authority is granted.
