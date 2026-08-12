# Self-Serve Managed Onboarding Spec

Status: PROPOSAL (spec only -- no kernel/, tools/, or showroom/ changes applied)
Date: 2026-08-12
Decision: Founder, 2026-08-12 -- managed pilot goes self-serve. "Let it be unnamed
and the user always names themselves... all full self setup or etc and onboarding."
No founder-named operator. Users name themselves and self-setup end to end.

## 1. Current state: where the founder bottleneck sits

The product already lets a user name themselves at trial signup. Everything AFTER
the device trial is founder-gated, in four places:

1. The second door is a human conversation.
   showroom/src/core/signup-trial.ts:227-248 (trialSignupDoors): when managed auth
   is off, door two is action 'request-account' -- "We set each company up by
   hand." showroom/src/core/signup-trial.ts:306-321 (trialSignupContactUrl) hands
   the claim code SM-XXXX-XXXX to the public contact form (structured `claim=`
   param since OPS-739) so THE FOUNDER can link a managed account to the exact
   trial by hand. The claim code itself (signup-trial.ts:100-108) is stable,
   derived from the trial id -- it is already the right join key for automation.

2. Managed accounts exist only by invitation.
   showroom/src/core/managed-trial.ts:2602-2659 (initializeManagedAccountSetup):
   the ONLY way into /account/setup is a callback URL carrying a Supabase auth
   `code` or access/refresh tokens -- i.e. an invite or recovery email that a
   human caused to be sent. There is no self-serve account creation call
   anywhere. showroom/src/core/ManagedAccountPage.tsx:41-55 confirms: the page
   only accepts a link, it cannot start one.

3. Workspaces cannot be created, only listed.
   showroom/src/core/managed-trial.ts:2672-2691 (discoverManagedWorkspaces):
   GET /api/trial/v1/workspaces lists companies an already-provisioned member
   belongs to; everyone else gets 'workspace_membership_missing' -- "Ask the
   company owner to activate access." (Also documented at signup-trial.ts:6-9.)

4. The readiness kernel encodes founder naming as a gate.
   kernel/managed-pilot-readiness.mjs:38 -- NEXT_ACTION_REQUIREMENTS includes
   'name_shop_pilot_operator'. Line 178 -- gate('named_pilot', 'blocked', 'HQ
   records no named pilot customer or measured baseline.', 'Select one Shop
   design partner, named operator, baseline, and acceptance evidence.').
   Lines 218-222 -- founderDecision.operator hard-requires namedBusinessRequired,
   namedOperatorRequired, measuredBaselineRequired, acceptanceEvidenceRequired,
   all re-asserted by validateManagedPilotReadiness at lines 261-265.
   hq/readiness/managed-pilot-readiness.json carries the same texts: named_pilot
   (lines 118-123), managed_persistence (lines 106-111), production_activation
   (lines 124-129), and per-product blockingReason "Needs founder-selected
   operator..." (e.g. line 139).

Login gates (unchanged by this spec, listed for completeness):
showroom/src/core/SignupPage.tsx:61 and ManagedLoginPage.tsx:28 --
`runtime.status === 'enterprise' && managedTrialAuthConfigured()` (the config
check itself is managed-trial.ts:2424-2426).

## 2. Target flow

Step A. Signup (EXISTS, unchanged). User names business and self on the device
trial form (SignupPage.tsx:194-204 -> createTrialSignupRecord). Workspace name =
whatever the user typed. Claim code SM-XXXX-XXXX minted from the trial id.

Step B. Self-serve managed activation request (NEW, replaces 'request-account').
In-app flow, not a contact-form handoff:
  - user supplies a work email (REAL verification, unlike the consent-only
    contact note at signup-trial.ts:86-91),
  - user accepts terms (typed literal `accepted: true`, same pattern as
    TrialSignupContact.consentRecorded at signup-trial.ts:34-37),
  - the request carries claimCode + businessName + product automatically.
Door action becomes 'request-activation'; the founder conversation door remains
as a fallback while auth is unconfigured.

Step C. Email verification (NEW endpoint use, existing client machinery).
Supabase Auth signInWithOtp/magic link. The callback lands on /account/setup and
flows through the EXISTING hardened parser (initializeManagedAccountSetup,
managed-trial.ts:2602-2659) -- purpose 'invite' generalizes to 'signup'. User
sets a password via completeManagedAccountPassword. No new token handling code.

Step D. Automated tenant provisioning (NEW, behind existing security gates).
POST /api/trial/v1/workspaces { claimCode, businessName } (authenticated,
verified-email session required). Server: validates claim format, creates one
RLS-isolated tenant labeled with the user's own businessName, records
claimCode -> workspaceId linkage, returns the directory entry. Fail-closed:
endpoint returns 503 unless managed_persistence and security gates are green.
No human in the loop; rate-limited per email, per IP, per claim code.

Step E. First-run. Sign-in discovers the self-created workspace via the existing
directory (discoverManagedWorkspaces), user opens it, optionally imports the
device-trial claim file (trialSignupClaimFile, signup-trial.ts:328-341) to carry
their catalog and settings over. Measured baseline is auto-captured from first
activity instead of founder-recorded.

## 3. Gate redefinition: named_pilot -> self_serve_pilot

Objective evidence that replaces founder naming -- ALL required to flip the gate:
  1. >= 1 completed self-setup: signup -> verified email -> accepted terms ->
     tenant created -> first authenticated session in that tenant.
  2. Verified email receipt (Supabase auth user with email_confirmed, not the
     device-trial contact note).
  3. Terms-acceptance receipt (timestamped, tenant-linked, literal-typed).
  4. Tenant isolation proof ON THAT TENANT (the same RLS + quarantine checks the
     56-check rehearsal proves locally, run hosted against the created tenant).
  5. Claim linkage: claimCode joins the device trial to the tenant.
  6. Auto-measured baseline: first order-to-close (shop) or equivalent funnel
     event, recorded by the system, not by a human.

Diff shape for kernel/managed-pilot-readiness.mjs (DO NOT APPLY -- every field
below is re-checked by validateManagedPilotReadiness and by
tools/verify_hq_contract.mjs:1066, and the kernel file is its own source receipt,
so this lands as one lockstep change with a ledger rebuild):

  - line 3:  MANAGED_PILOT_READINESS_CONTRACT v3 -> v4 (contract bump is
             mandatory; verify_hq_contract.mjs:1066 pins the v3 string).
  - line 14: GATE_IDS: 'named_pilot' -> 'self_serve_pilot'.
  - line 20: PROPOSED_ACTIONS: 'create_one_named_preview_operator' ->
             'provision_one_self_serve_preview_tenant'.
  - line 38: NEXT_ACTION_REQUIREMENTS: 'name_shop_pilot_operator' ->
             'approve_self_serve_activation_window'.
  - line 178: gate('self_serve_pilot', <computed>, evidence from a new
             selfServeEvidence input (counts of completed self-setups with the
             six proofs above), nextAction 'Open the self-serve activation
             window on the approved isolated target.').
  - lines 218-222 + validator 261-265: operator block becomes
             { productId: 'shop', selfServeAllowed: true,
               verifiedEmailRequired: true, termsAcceptanceRequired: true,
               tenantIsolationProofRequired: true,
               measuredBaselineRequired: true } -- keep measuredBaseline and
             acceptance evidence; DROP namedBusinessRequired /
             namedOperatorRequired (the user names themselves).
  - line 247: blockingGateCount stays 7 until hosted evidence exists; the
             validator's hard-coded `=== 7` must become input-derived in v4.
  - JSON blockingReason texts regenerate automatically from the kernel via
             tools/manage_managed_pilot_readiness.mjs (kernel digest is source
             receipt #7, so the rebuild is forced -- lines 13-21, 26).
  - product blockingReason strings drop 'founder-selected operator' in favor of
             'needs one completed self-serve setup on approved isolated tenant'.

What does NOT change: founderDecision on the TARGET stays. Approving an isolated
hosted environment (preview branch, charges, lifetime) remains a founder call
(NEXT_ACTION_REQUIREMENTS keeps 'approve_preview_branch_target'). Self-serve
removes founder NAMING of users, not founder approval of INFRASTRUCTURE.
production_activation stays founder-gated verbatim.

## 4. This sprint vs behind the security gates

Ship this sprint (no hosted writes, no gate semantics change):
  - Door copy + action: 'request-account' -> 'request-activation' framing in
    trialSignupDoors; remove "We set each company up by hand" once the request
    flow exists. Pure client + pure-function change, guardable like OPS-739.
  - Terms-acceptance field on the trial record (schema v2, literal-typed,
    restore-safe -- mirror of consentRecorded).
  - Activation-request record + UX: structured request carrying claim, kept
    on-device and mirrored through the existing contact channel as interim
    transport (allowlist already passes `claim`).
  - This spec + the v4 kernel diff reviewed with verify_hq_contract.mjs owners.

Waits on the security gates (RLS hardening + browser-grant quarantine):
  - POST /api/trial/v1/workspaces (tenant creation). Blocked until: 27 advisor
    findings cleared, metadataRlsEnabled true (currently false, readiness JSON
    line 76), schema v8-v10 applied hosted, browser-grant quarantine applied
    (built but unapplied), hosted storage privacy proof run.
  - Email verification against hosted Supabase auth for NEW users (auth service
    on an approved isolated target; managedTrialAuthConfigured is false on the
    static build today).
  - The kernel v3 -> v4 change itself (ships only with the hosted evidence
    inputs it validates, plus verify_hq_contract.mjs updated in the same change).
  - Any production activation (unchanged founder gate).

## 5. Risks

Removed by self-serve:
  - Human review of each tenant before it exists (founder vetting of business
    legitimacy, dedupe of claim codes, pacing of onboarding volume).
  - Human sanity check of the claim -> account linkage.
  - A named accountable human per pilot tenant.

Compensating controls:
  - Verified email + accepted terms before any tenant exists (stronger than
    today, where the founder links accounts off a contact-form fragment).
  - Tenant isolation by construction: RLS + public-browser quarantine are
    already proven in the 56-check local rehearsal (REQUIRED_QUARANTINE_CHECKS,
    kernel lines 33-37) and must pass hosted before the endpoint exists.
  - Rate limits per email / IP / claim code; claim codes are single-use.
  - Fail-closed provisioning: endpoint disabled unless gates are green; no
    silent partial tenants (mirror the writeTrialSignup read-back pattern).
  - External actions stay review-gated: FORBIDDEN_ACTIONS (customer_message,
    payment, stock_move, production_deploy...) are untouched -- a self-served
    tenant can work its own data but cannot reach the outside world without
    the existing owner-gated approvals.
  - Bounded blast radius: first self-serve window runs on the founder-approved
    isolated target with deleteAfterEvidence semantics, not production.
  - production_activation remains a separate founder decision after all hosted
    gates pass -- self-serve changes who names the user, not who arms the prod
    database.
