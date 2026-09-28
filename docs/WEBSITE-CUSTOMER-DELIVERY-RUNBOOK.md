# Website customer delivery: assisted operating runbook

Status: source-owned operating procedure, not hosted acceptance or permission to
mutate a provider. This procedure was checked against local source; no customer
was enrolled or contacted during its preparation.

## Who does what

| Role | Responsibility | Must not do |
| --- | --- | --- |
| Customer | Use the assigned account, check the finished pages, accept or request changes | Supply passwords, tokens, technical IDs or database access to SuperMega |
| Delivery operator | Prepare approved content, select an enrolled reviewer, inspect decisions | Create membership, assume a matching name proves identity, publish from acceptance |
| Workspace owner and authorized administrator | Verify the intended account, authorize and apply the exact review-only grant | Guess an Auth ID, use another workspace, bypass expiry or production release checks |
| Release owner | Verify the approved revision, hosted behavior, rollback and telemetry before promotion | Treat a local preview or customer acceptance as production authority |

## 1. Establish the recipient before promising a review link

The current browser has no reviewer-enrollment workflow. Existing signup creates
an Auth account, not review access. Do not ask a reviewer to activate a new company
or start a trial to unlock somebody else's prepared Website.

The administrator must use a preexisting, non-anonymous Auth account in the exact
managed project. Confirm the intended customer/account through the existing
approved setup process; an account UUID or matching display name is not identity
proof. Never send the customer an administrative packet or ask them to inspect
browser storage. If account setup or identity verification is incomplete, stop
enrollment and resolve it before preparing a review.

The workspace must already have the exact active activation and owner membership
and include Website. Confirm the deployment and authorized target separately.
Do not create a second workspace or database as a workaround.

## 2. Use the existing administrative workflow, with separate authority

Entrypoint: `npm run client:staff-access -- <command> --help`.
Implementation: `supermega_runtime/managed_staff_access.py`.

| Phase | Inputs / result | Authority boundary |
| --- | --- | --- |
| `prepare` | Activation plan, administrator-verified member Auth ID, owner-reviewed label, role `website-reviewer`, approval reference and times, private output path | Local plan only; the plan records proposed approval metadata but does not prove approval |
| `validate` | Exact activation and staff plans | Local shape/digest check only; no enrollment |
| `authorize` | Exact plans, protected database/owner-session/publishable-key file inputs, matching owner approval reference and decision note | Requires separately authorized access; records durable approval after checking the actual owner and active session |
| `apply` | The same exact plans and approved target, matching approval reference, private receipt path | Separately authorized membership mutation; must find the durable authorization and eligible existing Auth user |
| `revoke` | Exact plans, fresh owner-session verification, approval reference, reason and receipt path | Separate authorized access removal; not a routine retry or cleanup action |

Use command help for required arguments; never put secret values into shell
arguments, reports or chat. Production additionally requires the source-owned
production handoff and exact release checkout. Supplying a confirmation string is
not a substitute for the owner's actual authorization. Keep private plans and
receipts outside source control and customer messages.

The expected role has exactly `website.review`. It grants no Website editing,
company-directory browsing, publishing, payment or deployment power. Applying it
does not create an Auth user or send an invitation. A receipt is retained evidence,
not proof that the customer's browser can use the review. Requery active access
and verify the intended hosted journey before claiming readiness.

## 3. Prepare the exact saved Website

In the authorized operator Website workspace:

1. Save the approved content. Open **Check saved Website before handoff** and
   inspect the saved pages, revision and source version; unsaved edits are excluded.
2. Choose **Choose customer for review**. Select the owner's enrolled grant, not
   just a familiar label. Check the full enrollment reference when names repeat.
3. Explicitly confirm the selected customer and revision, then choose
   **Prepare private review**. Nothing is automatically sent or published.
4. Read the retained decision for that review reference. Copy the handoff only
   when the exact review is current, undecided, unexpired and on the canonical
   application origin. Sending it remains a separate approved customer action.

The review is prepared with a 24-hour expiry. Later source changes invalidate the
old review. A new review of the corrected source needs fresh customer approval;
never reuse an earlier acceptance to publish changed content.

## 4. Customer's job: review, not build

The assigned customer opens the review link, signs in with the assigned account,
checks every prepared page and chooses acceptance or specific change requests.
Password recovery retains the exact review destination. No design work or new
company setup is required. Acceptance is permission for SuperMega's release
review of that exact revision, not publication, domain registration or payment.

## 5. Recover without guessing

| Symptom | Required next action |
| --- | --- |
| Administrative authorization/apply response lost | Preserve the exact plan and any receipt; use read-only server reconciliation before deciding whether another action is needed |
| No enrolled customer appears | Administrator checks the owner-approved grant, current membership, project and workspace; never substitute an unrelated account |
| Customer signs in but has no assignment | Verify the original enrollment through the approved process; do not create another company |
| Review unavailable or expired | Check retained status and assignment privately; prepare a new exact review when appropriate, never disclose other recipients |
| Preparation response lost | Retry the same command if offered, or refresh the list and read the exact pending reference; do not start a second review |
| Pending reference absent from one list page | Continue reference-ordered pagination or obtain administrative reconciliation; absence is not proof of failure |
| Recovery storage unavailable or invalid | Keep preparation blocked and reconcile; do not clear storage as a retry mechanism |
| Browser tab closed before reconciliation | Current session-only recovery is insufficient; obtain retained server-side reconciliation before preparing another review |
| Withdrawal response lost | Do not share the link; inspect its retained status before a deliberate retry |
| Review accepted | Complete independent release and hosted checks, approved promotion, paired verification and rollback readiness |

## Launch evidence still required

Use approved synthetic accounts in a protected hosted rehearsal first. Verify
assigned and wrong-account access, session revocation, stale/expired review,
acceptance/change exclusivity, lost-response recovery and operator withdrawal.
Then obtain authorized customer evidence; do not label synthetic tests as a user
study. Account enrollment UX, cross-session recovery and hosted acceptance remain
explicit unfinished work. This runbook does not close those gates.
