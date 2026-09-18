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

The local app entry, header, public brief and product preview entry points now
use service-first copy. Public brief desktop/tablet/mobile inspection is retained
in the local three-product QA evidence folder; this is not hosted delivery proof.
Contact receipts preserve later edits, pin uncertain retries to the original
payload/reference and permit corrections after narrowly recognized pre-delivery
validation failures. Those source corrections through `338ae787` were independently
accepted. Full-field regression coverage was added in `89f26891`.

The customer preview/approval lifecycle described here is not yet verified end-to-end.
No new hosted, customer, publishing, payment, stock or provider authority is granted.

## Reuse map for the next delivery slice

Source reconciliation on 2026-09-18 identified these existing boundaries:

| Existing source | Reuse | Missing proof or implementation |
| --- | --- | --- |
| `showroom/src/core/CoreShell.tsx` | Assigned-product portal routing and managed access state | A route chooses presentation only; server membership remains authoritative |
| `WebsiteCustomerReview.tsx`, `website_customer_review.py`, `website_customer_review_store.py` and `trial_runtime.py` | Authenticated recipient-only preview, exact revision/digest binding, expiry, idempotent change request and retained inbox | Current-source behavior still needs exact hosted authorization, expiry, retry and recovery proof |
| `20260915184728_website_customer_review_storage.sql` and `20260918011500_website_customer_acceptance.sql` | Forced RLS, separate `website.review` capability, immutable feedback/acceptance and stale-on-edit review invalidation | Local PostgreSQL tests and rehearsal exist; exact hosted Supabase migration, Auth and cross-tenant acceptance are still required before activation |
| `showroom/src/products/website/WebsiteProduct.tsx` | Operator approval, evidence capture and retained approved site file | Operator approval is not authenticated customer acceptance |
| `tools/create_public_vercel_output.mjs` | Validated brief intake, idempotent receipt and product-specific customer acknowledgement | An intake receipt is not a delivery record, customer account or approval |

Do not create a second identity, publishing or approval authority. Extend the
existing review assignment and revision contract. Never widen `website.write` for
a customer, infer access from a URL, or convert change-request feedback into an
approval. A typed reviewer name is an attestation, not authenticated customer proof.

The next complete journey must demonstrate:

1. An authorized customer sees only their prepared revision, with a concise
   checklist and no mandatory editing controls.
2. A change request retains the exact reviewed revision and does not publish or
   silently change the operator's work.
3. Approval records the authenticated actor and exact revision; later edits make
   that approval stale. Operator approval must not be relabeled customer approval.
4. Unauthorized and stale-revision actions fail without losing the customer's
   draft feedback; retries do not duplicate requests.
5. A separate release step binds hosted identity and recovery evidence. The
   customer can distinguish preview approval, deployment pending and verified live.

Items 1–4 now have local implementation and focused evidence: separate immutable
customer acceptance, exact revision/digest binding, change-request exclusivity,
lost-response replay, stale/withdrawn review denial and nonempty backup/restore.
Staff can inspect the verified saved source and retained decisions. An eligible
prepared review can produce a manual handoff draft on the canonical app host;
this does not send a message or grant access. These are not hosted acceptance
evidence. Item 5 remains a separate release concern.

### Account-assignment gap

The runtime membership policy is self-only. There is no customer directory or
review-only enrollment UI to reuse, and ordinary self-serve Website ownership
grants editing capabilities rather than the dedicated `website.review` role.
The existing owner-gated `managed_staff_access` workflow now supports a distinct
`website-reviewer` role: exactly `website.review`, with Website as its only product,
even in a multi-product workspace. It requires an activated Website owner and
uses the existing exact-plan authorization, active owner/session checks,
preexisting non-anonymous Auth account check, conflicting-membership denial,
immutable grant event, idempotent replay and owner-authorized revocation. It
does not create an account or send an invitation. The legacy staff-access packet
name is retained for compatibility; this role grants no staff read/edit powers.

Plan compilation and validation are local operations, not proof of owner approval
or enrollment. Applying or revoking a membership remains a separate authorized
administrative action. The operator must not receive database credentials or type
raw actor IDs; the later enrollment UI must bind a verified account through the
private owner-reviewed workflow rather than widen runtime directory access.

Recipient selection now has a bounded private API: the owner with Website write,
company write and approval-decision capabilities can list only their own active,
approved `website-reviewer` grants in the current workspace. The response contains
the grant reference and owner-reviewed display label, not Auth IDs, email addresses,
other roles or a global directory. Each result must match its durable approval and
currently eligible membership; revoked grants disappear. Pages have at most 50
entries in grant-reference order, not alphabetical order. The implemented staff
UI keeps grant references visible, makes no default selection and does not merge
identical labels.

Preparing a review may use `recipientGrantId` instead of `recipientActorId`.
The server resolves it under the same source/review lock and rechecks current
membership, expiry and exact saved version. Unknown, foreign, unapproved or revoked
grants fail closed. Supplying both recipient identifiers is invalid. The original
actor-ID API remains compatible for existing reviewed internal callers; it is not
the customer-facing selection UX. Listing a grant never creates membership, sends
an invitation or publishes content.

The staff recipient-selection/preparation UI is implemented: inspect saved source,
choose an enrolled customer, explicitly confirm the recipient and revision, then
prepare a private 24-hour review. Lost-response retries reuse the same command
within the mounted component; after a reload the operator must reconcile retained
reviews before creating another. Command recovery across reload is not yet durable.

Before claiming the complete delivery journey, finish and review the verified
account-enrollment UX, then exercise the full hosted journey. Do not rebuild the
recipient picker or grant customers `website.write` as a shortcut.
Preserve authenticated membership as authority; the
review URL is not a bearer credential. A local database-backed login regression
must prove assigned-company discovery, an empty business-data bootstrap for
review-only users, denial of staff preparation, and immediate revoked-session
denial before returning readiness or capabilities.

Reuse the Website path first, then qualify Ecommerce catalog review and Shop
setup acceptance against their actual state models rather than assuming identical
semantics.

## Prioritized setup experiments

Status: prepared study protocol; no participants recruited or results observed.
The existing `tools/product_copy_experiment.mjs` remains a synthetic internal copy
experiment. It must not be counted as an onboarding A/B test or customer evidence.

| ID | Hypothesis | Comparison | Observable task outcome |
| --- | --- | --- | --- |
| SETUP-01 | Result-first briefs reduce confusion relative to template-first setup | Retained earlier template-first design versus current assisted brief, same fictional business | Participant chooses the correct product, supplies enough scope to prepare it, and explains what happens next without coaching |
| REVIEW-01 | A preview plus a short checklist is easier than exposing the builder | Existing operator review versus the current customer review/change-request route, using the same exact synthetic revision | Participant identifies the exact revision, requests one change, and distinguishes feedback, customer acceptance and publication |
| SHOP-01 | Prepared catalog and trade defaults reduce first-sale setup effort | Self-configuration versus operator-prepared synthetic workspace | Participant records the specified sale and manual tender correctly, finds the receipt and knows how to correct a mistake |

Run these sequentially, not as concurrent local model workloads. SETUP-01 is first.
REVIEW-01 may run locally with approved synthetic fixtures after its exact candidate,
moderator script and expected outcomes are pinned; hosted customer-access proof and
the missing acceptance decision remain separate gates. SHOP-01 uses disposable
synthetic fixtures only until a real customer separately approves use.

### Study controls and decision rules

- A named study owner prepares identical task scripts, exact variant revisions,
  fixture data and a moderator script before sessions. Never route live customers
  randomly into incomplete or unsafe flows.
- Recruit only consenting participants from the intended segment. Include Myanmar
  operators using their normal language and devices; do not substitute AI personas
  for them. Keep contact/consent records private and outside product analytics.
- First run formative usability sessions. Counterbalance variant order when a
  participant tries both; record prior familiarity and moderator help. These
  sessions find defects; their small counts do not establish conversion uplift.
- Capture pseudonymous session code, variant/revision, product, device class,
  task success, active task time, help requests, errors, and understanding of the
  data/publication boundary. No real phone numbers, sales values or client files
  in shared R&D output. Screen recordings need separate consent.
- Any data loss, tenant exposure, wrong money result or false published/received
  status stops that variant. Fix the cause and rerun the same regression task.
- Prefer a variant only when it improves the prespecified task outcome without
  worsening correctness, accessibility or recovery. Retain inconclusive and
  negative results; do not keep changing the metric until a variant wins.
- Before a quantitative live A/B test, declare the primary metric, baseline,
  minimum worthwhile effect, sample-size calculation, assignment unit, run window
  and stopping rule. Avoid repeated significance checking, mixing template
  segments or claiming a win from pageviews. Traffic and permission are currently
  unverified, so no live allocation or statistical winner is authorized here.

Record each consented formative session with
`tools/record_product_usability_observation.mjs`. Its input stays private; the
one-write receipt retains only a pseudonymous session digest, closed issue codes,
task timing/outcome, boundary checks and safety flags. It rejects dirty or wrong
source state and does not retain names, contacts, notes or recordings. The manual
observer attestation is explicitly non-cryptographic, and no number of formative
receipts proves a quantitative winner. Hundreds of synthetic generations are not
a substitute for one observed target-user task; quantitative testing starts only
after the prespecified sample-size and stopping rule above are approved.

Keep the private input outside the repository and use a random session code:

```powershell
$head = git rev-parse HEAD
npm run research:usability:record -- --input C:\private\session-input.json `
  --out C:\reviewed\session-receipt.json --expected-head $head
```

The exact input fields are `contract`, `experimentId`, `candidateCommit`,
`comparisonCommit`, `variant`, `sessionCode`, `consentAttested`, `observerRole`,
`observedAt`, `language`, `deviceClass`, `taskOutcome`, `activeSeconds`,
`helpRequests`, `moderatorInterventions`, `issueCodes`, `boundaryChecks` and
`safety`. Use only the closed values enforced by the tool and its self-test; never
put participant identity or free text into this input or its retained receipt.

### Delivery and scaling work order

1. Reliable brief intake and a named operator to own the reply.
2. Existing-customer access plus revision-bound preview/change-request workflow.
3. Repeatable template setup with reviewed import and explicit exceptions.
4. Hosted tenant isolation, backup/restore and complete operating journey proof.
5. Consented usability sessions, then evidence-based iteration and measured rollout.

Company coordination records the owner, next action and evidence link for each
item. It does not authorize outreach, account creation or a release. The current
corporate task's administrator/authenticated-agent dependency remains unresolved;
do not claim an autonomous R&D team is operating until that dependency is verified.

### Preparation ownership (proposed, not accepted assignments)

- Corporate agent: task/moderator scripts, pseudonymous result fields and balanced
  variant order, using the existing corporate preparation role.
- Product lead with Corporate agent: exact variant revisions, disposable fixtures,
  expected task results and failure/recovery checks.
- Owner with Corporate agent: name the accountable study owner/moderator and
  intended participant segment before any recruitment.
- Workspace administrator: verify restricted consent/contact storage before any
  participant information is collected. This dependency remains unresolved.

The retained predecessor for the service-first app-entry comparison is the parent
of `b6712b71` (resolve and inspect its full SHA before use); the current study
candidate must likewise be pinned after implementation stabilizes. Do not treat
unbuilt historical source as a usable baseline or compare unequal starting data.

Backend inspection: `supermega_runtime/website_runtime.py` validates exact content
source and lifecycle record relationships. The separate customer-review path now
uses `website.review`, recipient-scoped RLS, exact preview digests, stale-on-edit
invalidation and idempotent feedback. This does not prove live authorization or
customer access. A separate immutable customer acceptance record is now implemented
in the existing review store and acceptance migration. It binds the authenticated
recipient, exact revision/digest and idempotent command; feedback and acceptance
are mutually exclusive. It grants no broader Website write access and does not
publish or deploy. Changed/withdrawn reviews retain historical decisions without
reopening customer access.

### Local evidence checkpoint — 2026-09-18

At `40c9a3ae350e669fe131735277c00cd19f1b5147`, the dedicated Website review SQL suite
passed 48/48 against disposable loopback PostgreSQL 17, including actual guarded
transactions, synthetic Auth/session records, cross-tenant denial, source changes,
revocation, replay and acceptance conflicts. Cleanup completed with zero PostgreSQL
processes left. This does not test hosted Supabase Auth or a real customer account.

The full 662-step app verification belongs to predecessor
`d1786642fb80d1bfe7bb002f10dd9b98ac795ec9`, not automatically to its children.
The `40c9a3ae` setup-disclosure follow-up has its own focused tests, exact build and
tablet/mobile browser observations. Neither result proves hosted acceptance,
conversion improvement, actual-user study completion or production readiness.

Remaining delivery work is explicit: verified account enrollment; durable recovery
of uncertain preparation after reload; independent exact-candidate review; authorized
immutable hosted preview; real managed login, customer review and recovery journeys;
then separately approved production promotion with rollback and telemetry evidence.

## ERRC operating decisions

Owner-requested 2026-09-15; hypotheses below are not demonstrated market advantage.
Use the [ERRC framework](https://www.blueoceanstrategy.com/tools/errc-grid/) to
improve customer value and delivery cost together, not to add modules indefinitely.

| Action | Product and company decision | Evidence required |
| --- | --- | --- |
| Eliminate | Mandatory builder/template learning; unsupported live claims; duplicate status reports and invented customer evidence | Customer reaches the correct brief without configuration; each delivery has one authoritative queue record |
| Reduce | Above-fold choices, repeated data entry, manual retyping between intake and setup, duplicate builds and idle model work | Task time/help requests plus measured operator minutes and compute cost; no regression in correctness |
| Raise | Understandable status, stable drafts, access isolation, restoration, Myanmar device/language usability and predictable support | Exact task completion and failure-recovery checks; consented operator observation; hosted isolation/restore evidence |
| Create | Prepared trade-specific Shop workspace; done-for-you Website/catalog delivery; revision-bound customer review and clear change requests | End-to-end prepared delivery and customer acceptance of the exact revision; not just a new screen |

For every experiment record the problem, current evidence, ERRC action, owner,
variant/source revision, expected outcome, primary metric, risk guardrail,
test cost and decision (adopt/revise/reject/inconclusive). Reuse SETUP-01,
REVIEW-01 and SHOP-01 above instead of creating overlapping studies. Add another
variant only when it answers a distinct unresolved question. Hundreds of property
tests or fault simulations are useful when they cover real cases; repeated AI
opinions are not independent samples or proof of customer preference.

## Engineering and operations assurance

Use [NIST SSDF SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final) for secure
development practices and [OWASP ASVS](https://github.com/OWASP/ASVS) for concrete
application-security verification. Pin the selected version and applicable
requirement IDs in each security review; this document is not a full mapping,
certification or assertion of compliance. Do not claim ISO certification without
an actual assessed management system and valid certification evidence.

Prioritize verified server-side membership/roles, input validation, session
revocation, tenant isolation, private exports, idempotent writes, dependency review,
secret handling, restore drills and actionable incident ownership. Tests must
exercise denial and failure paths as well as success. Human review owns security
decisions; generated code and green source checks do not establish hosted safety.

Architecture efficiency decisions need a measured baseline: initial/route bytes,
device responsiveness, API latency, storage growth, recurring infrastructure cost,
support time and restore time. Preserve the canonical backend and template
contracts. Prefer focused checks during iteration and one final full gate per
stabilized candidate; keep diagnostic subsets clearly distinct from a full seal.
No new framework, model service or database solely to make the stack sound modern.

### Canonical domain and runtime topology

Use the fewest public origins that preserve a clear trust boundary:

| Origin | Sole responsibility | Must not become |
| --- | --- | --- |
| `supermega.dev` and `www.supermega.dev` | Public positioning, product explanation, privacy and validated setup intake | A customer workspace, privileged API, builder or tenant authority |
| `app.supermega.dev` | Named-user portal, assigned products and same-origin `/api/*` managed operations | A public marketing CMS or an origin that infers workspace access from a URL |
| Immutable Vercel preview origins | Exact-commit release and customer-preview evidence before promotion | Stable customer addresses or evidence of production acceptance |
| Optional branded customer hostname | Approved presentation and product entry after exact preview acceptance | Authentication, membership, workspace selection or a second backend |
| Independently hosted status origin, when adopted | Availability and incident communication when the primary pair is impaired | Application telemetry, customer records or a substitute for provider evidence |

Keep the existing `supermega-public` and `megaos` Vercel projects and the one
canonical private Supabase data plane. Do not create product-specific APIs,
databases, auth systems or permanent subdomains for Website, Ecommerce or Shop.
Add a distinct API origin only after an external machine-client contract requires
versioned public APIs, separate rate limits and explicit CORS; internal browser
traffic remains same-origin under `app.supermega.dev/api/*`.

Hostnames choose presentation, never tenant authority. Every private operation
derives the named user, active membership, workspace, capability and current
version on the server. Cookies and credentials stay host-only where possible;
wildcard credentialed CORS is prohibited. Public intake payloads never enter URLs,
analytics, error text or release artifacts.

Release the public and app surfaces as one exact-commit pair: immutable candidates,
release-identity probes, route/browser acceptance, explicit promotion, paired
production verification and exact rollback targets. A READY deployment, DNS answer
or HTTP 200 is not sufficient. Branded domains attach only after the tested target
is known and never by force-reassigning an origin from another project.

Keep product telemetry closed-vocabulary and content-free. Product stages may
record product and lifecycle state; operations may measure availability, latency,
error rate, conflict/outbox age, backup age and restore result. Names, contacts,
notes, prices, receipts, workspace identifiers, preview content and prompts remain
outside analytics. Provider queueing is not proof of ingestion, customer use or
commercial value.

## Premium onboarding communication

The corporate task audits existing source-owned templates before new copy is
implemented. A useful welcome/invitation has a recognizable sender, reason for
receipt, the exact product/customer context, one clear next action, honest access
status, accurate expiry/recovery guidance when applicable, and a support route.
Provide readable plain text as well as responsive HTML. Never request passwords
by email, echo invitation tokens into logs/reports, imply payment confirmation,
or announce a workspace as ready before its acceptance gate. Draft generation,
provider acceptance, mailbox receipt and successful customer access are separate
states. Received SOL invitation metadata alone is not sign-in acceptance.

Review English/Myanmar wording with intended operators; do not fabricate a
translation review. Test links, keyboard/readability, missing/expired access,
resend cooldown and duplicate-send prevention with approved synthetic fixtures.
No live email A/B allocation, customer recruitment or sends are authorized by
this protocol. Email quality is measured by understood next action and successful
authorized access, not decorative copy or open-tracking pixels.
