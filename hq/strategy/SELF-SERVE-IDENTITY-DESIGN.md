# Self-serve identity creation — design

Status: DESIGN ONLY — the founder must approve this document before any code is
written or merged. Account creation is auth surface, and auth surface changes
are founder-gated by house rule. Nothing in this file authorizes an
implementation, an env change, a Supabase dashboard change, or a release.
Author: tech lead. Date: 2026-08-19.

Context: the 2026-08-19 go-live roadmap names this as first-month fix #2 and
quarter feature #3. Today a stranger cannot complete signup alone because no
open path creates a Supabase identity. Everything AFTER the identity exists is
built and proven end-to-end (six-for-six,
`hq/readiness/self-serve-pilot-proof.json`, per
`hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md:3-7`); the identity itself is the
one missing link. This design adds exactly that link and nothing else.

---

## 1. The gap, precisely

The chain a stranger must walk today, and where it breaks:

1. **Device trial signup works.** The trial form mints a stable claim code
   `SM-XXXX-XXXX` derived from the trial id
   (`showroom/src/core/signup-trial.ts:119-127`) and stores a consent-typed
   record (`signup-trial.ts:129-171`). No account exists; nothing leaves the
   device.
2. **The second door is a human.** When managed auth is unconfigured the door
   action is `request-activation` (`signup-trial.ts:261-283`), which hands the
   claim code to the public contact form
   (`trialSignupContactUrl`, `signup-trial.ts:340-355`). A person answers, and
   the founder provisions per customer with the fail-closed
   `supermega_runtime/managed_activation.py` tool (plan compile at
   `managed_activation.py:476-564`, administrative provisioning at
   `managed_activation.py:749` onward). That is the founder fallback and it
   stays.
3. **Account setup only accepts links a human caused.** `/account/setup`
   (`showroom/src/core/ManagedAccountPage.tsx:41-55`) immediately runs
   `beginManagedAccountSetup`, whose parser accepts exactly an invite or
   recovery callback: `accountPurpose` allows only `'invite'` and `'recovery'`
   (`showroom/src/core/managed-trial.ts:2618-2624`), and
   `initializeManagedAccountSetup` requires a `code` or access/refresh token
   pair in the URL (`managed-trial.ts:2648-2705`). The page cannot START an
   account; it can only finish one.
4. **No signup call exists anywhere.** `managed-trial.ts` uses
   `signInWithPassword` (`managed-trial.ts:2784`), `resetPasswordForEmail`
   (`:2637`), `exchangeCodeForSession` (`:2688`), `setSession` (`:2693`) and
   `updateUser` (`:2768`). There is no `supabase.auth.signUp` in the codebase.
5. **Everything downstream is already built and proven.** A verified session
   with zero workspaces lands on the claim-code activation panel
   (`showroom/src/core/ManagedLoginPage.tsx:43-65`, `:91-97`, `:109-135`),
   which POSTs to the fail-closed tenant endpoint
   (`supermega_runtime/trial_runtime.py:1038-1114`), authenticated by
   `resolve_self_serve_signup_session`
   (`supermega_runtime/runtime.py:371-391`) via
   `verify_supabase_user_identity`
   (`supermega_runtime/supabase_auth.py:162-229`), creating the tenant in
   `create_self_serve_workspace` (`supermega_runtime/trial_store.py:3597`
   onward) and sending one courtesy welcome email
   (`supermega_runtime/activation_email.py:49-91`). All of it proven
   six-for-six through the real session pooler under real RLS
   (`hq/strategy/SELF-SERVE-REMEDIATION-FINDINGS.md:58-75`).

So the design problem is narrow: **create a verified-email Supabase identity
from the open web, land it on the already-hardened callback, and change
nothing else.**

## 2. The current activation chain, end to end (what this design composes with)

### 2.1 Claim code (client, pure)

- Minted from the trial id: 8 hex chars each mapped by
  `parseInt(hex,16) * 2 % 32` into a Crockford-ish alphabet with no I/L/O/U
  (`signup-trial.ts:117-127`). Because only even alphabet indices are
  reachable, the effective space is 16^8 ≈ 4.3 × 10^9 codes.
- Kept on device (`writeTrialSignup` fail-closed read-back,
  `signup-trial.ts:229-241`) and in a user-downloadable claim file
  (`signup-trial.ts:362-376`).

### 2.2 Login page and activation panel (client)

- `/login` is gated on `runtime.status === 'enterprise' &&
  managedTrialAuthConfigured()` (`ManagedLoginPage.tsx:41`; the config check
  validates `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` at
  `managed-trial.ts:40-41`, `:2470-2472`). `runtime.authReady` comes from
  `/api/health` `authentication.trusted_gateway_ready ||
  supabase_user_tokens_ready` (`showroom/src/core/CoreShell.tsx:271`).
- A signed-in session with zero workspaces is a STATE, not an error
  (`managed-trial.ts:2727-2737`): the login page opens the activation panel
  and prefills the stored claim code (`ManagedLoginPage.tsx:30-31`,
  `:43-65`).
- The panel maps errors honestly: `activation_window_closed`/503 → "not open
  yet, claim stays valid"; `claim_code_conflict` → field-attributed "already
  linked to a different account" (`ManagedLoginPage.tsx:125-133`).

### 2.3 Tenant endpoint (runtime)

`POST /api/trial/v1/workspaces` (`trial_runtime.py:1038-1114`) checks, in
order:

1. `SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW == "open"` exactly, else 503 —
   fail-closed founder switch, checked before any auth or parsing
   (`trial_runtime.py:139-147`, `:1043-1044`).
2. A signup-session resolver must be wired, else 503
   (`trial_runtime.py:1045-1046`); the wiring is
   `resolve_self_serve_signup_session` (`runtime.py:1269-1277`).
3. Verified identity: 401 without a session; **403
   `email_verification_required` unless the Supabase user record carries a
   confirmed email** (`trial_runtime.py:1053-1058`;
   `email_confirmed_at` is read server-side at `supabase_auth.py:217-228`).
4. Claim code and business name re-validated server-side
   (`trial_store.py:2964-2983`).

### 2.4 Tenant creation (store)

`create_self_serve_workspace` (`trial_store.py:3597-3846`):

- Workspace identity is DERIVED, not generated:
  `uuid5(NAMESPACE_URL, "supermega:self-serve-workspace:" + claim)`
  (`trial_store.py:2986-2995`) — one claim can only ever be one tenant.
- Refuses without `write_enabled` (`trial_store.py:3628-3629`, wired from
  `SUPERMEGA_TRIAL_WRITES_ENABLED` at `runtime.py:1006`).
- Refuses without target binding: `SUPERMEGA_SUPABASE_PROJECT_REF` and a
  40-hex release commit (`trial_store.py:3630-3646`).
- Per-actor attempt counter, max 5 → `TrialRateLimited` → HTTP 429
  `self_serve_rate_limited` (`trial_store.py:161`, `:3013-3019`;
  `trial_runtime.py:542-543`).
- SERIALIZABLE transaction, per-claim advisory lock
  (`trial_store.py:3670`), cross-actor collision detected via the
  workspace-scoped `workspace_access_controls` read (`trial_store.py:3744-3762`)
  and, under true concurrency, by the unique-constraint arbiter mapping
  SQLSTATE 23505 → `claim_code_conflict` (`trial_store.py:3794-3806`). This is
  remediation finding 7 (`SELF-SERVE-REMEDIATION-FINDINGS.md:33-56`) — the one
  only real RLS could expose — and this design must not touch any of it.
- Exact idempotent replay per claim; owner gets the 15 self-serve capabilities
  (`trial_store.py:166-183`).

### 2.5 The seven fixes and the six-for-six proof (what is already proven)

`SELF-SERVE-REMEDIATION-FINDINGS.md:25-33` lists the seven hosted defects
fixed on `fix/self-serve-remediation` (uuid authorization id, v11 CHECK widen,
v11 INSERT policies, env-configurable schema version, tolerated `postgres`
membership, pooler TLS posture, finding-7 conflict class). The proof ran
six-for-six through `aws-0-us-east-1.pooler.supabase.com:5432` as the real
runtime role under RLS (`SELF-SERVE-REMEDIATION-FINDINGS.md:58-75`), and the
production activation runbook's preconditions bind to exactly that evidence
(`PRODUCTION-ACTIVATION-RUNBOOK.md:14-28`). **This design changes none of the
proven store or endpoint code**, so the proof remains valid; the design only
adds the identity-creation step in front of it.

## 3. What Supabase Auth already provides (and what config the code already reads)

Server env (already read, `supabase_auth.py:41-55`):
`SUPERMEGA_SUPABASE_URL` / `SUPABASE_URL` / `VITE_SUPABASE_URL` and
`SUPERMEGA_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` /
`SUPABASE_ANON_KEY` / `VITE_*` variants. Client build env (already read,
`managed-trial.ts:40-41`): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`). No new
credential of any kind is needed; the publishable key is the only browser
credential, exactly as today.

Supabase Auth features this design uses (all standard, dashboard-configurable):

- **`supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`**
  — creates the identity. With "Confirm email" enabled the user gets a
  confirmation email and has NO usable session until the link is clicked; the
  runtime independently re-checks this because `email_confirmed_at` gates the
  tenant endpoint (`supabase_auth.py:217-228`, `trial_runtime.py:1057-1058`)
  — defense in depth even if the dashboard toggle were wrong.
- **Confirmation callback** — the emailed link redirects to our
  `emailRedirectTo` with a `code` (PKCE) or token-hash parameters: the same
  shapes the hardened `/account/setup` parser already accepts and bounds
  (`managed-trial.ts:2656-2701`). Only the purpose allowlist needs the one new
  value (`'signup'`, section 4 step D).
- **"Allow new users to sign up" toggle** — the provider-side master switch;
  OFF today is why no signup exists even by hand-crafted API call. Turning it
  ON is a founder dashboard action listed in section 7.
- **Auth rate limits** — dashboard-configurable per-endpoint limits (emails
  sent per hour, sign-up/sign-in attempts per IP window, verifications per
  window). Numbers are a founder decision (section 8).
- **CAPTCHA integration** — Supabase Auth has built-in hCaptcha / Cloudflare
  Turnstile enforcement on signup/signin/recovery endpoints (client passes
  `captchaToken`). Whether to enable it is an open founder question
  (section 8), because it is enforced provider-side and cannot be bypassed by
  skipping our UI.
- **Custom SMTP** — Supabase's built-in sender is rate-limited to a handful of
  mails per hour and is not suitable for production signup volume. Resend
  (already the platform's mail provider: `activation_email.py:9-11`, `:21-23`,
  verified `supermega.dev` domain, `RESEND_API_KEY` already provisioned)
  offers SMTP credentials that plug into Supabase Auth SMTP settings, so
  confirmation emails would come from the same verified domain as the welcome
  email. Recommended, but it is an env/dashboard change → founder-run.

Deliberate divergence from the 2026-08-12 spec:
`SELF-SERVE-ONBOARDING-SPEC.md:71-76` (step C) proposed `signInWithOtp` magic
links. This design proposes **email/password signup with email confirmation**
instead, because the product's entire existing auth surface is
password-shaped: sign-in is `signInWithPassword` (`managed-trial.ts:2784`),
account setup sets a password (`completeManagedAccountPassword`,
`managed-trial.ts:2756-2776`), and recovery re-sets one
(`ManagedAccountPage.tsx:79-111`). An OTP-only mode would add a second
parallel auth mode to maintain and test. The confirmation link still travels
the same hardened callback the spec wanted reused. Flagged for founder
sign-off in section 8.

## 4. Proposed signup UX flow

The user's journey, A→F. Steps A, E, F exist today and are unchanged.

**A. Device trial (unchanged).** User names the business, gets claim code
`SM-XXXX-XXXX` (`signup-trial.ts:119-127`), works locally.

**B. "Create your account" panel (NEW).** Entry points:
- a third door state in `trialSignupDoors` when signup is open: label
  "Create your company account", action `create-account` (today's
  `request-activation` door and copy stay as the fallback whenever signup is
  closed — the founder conversation door never disappears,
  `signup-trial.ts:243-283`);
- a "Create account" link on `/login` beside "No account yet? Free trial"
  (`ManagedLoginPage.tsx:161`).

The panel (a new panel state inside `ManagedLoginPage.tsx`, which already
hosts the activation panel) asks for: work email, password (min 12 chars,
matching `completeManagedAccountPassword`'s floor at
`managed-trial.ts:2757`), password confirmation, and a terms checkbox recorded
as the literal `true` only — the exact consent pattern of
`TrialSignupContact.consentRecorded` and `termsAccepted`
(`signup-trial.ts:36-44`, `:57-66`). Visibility is gated on BOTH
`managedTrialAuthConfigured()` AND a new `signup_open` field in the `/api/health`
payload (section 7), so the panel never renders while the founder keeps signup
closed.

**C. Identity creation (NEW — the only new network call).**
`supabase.auth.signUp` with
`emailRedirectTo = <origin>/account/setup?mode=signup` (same secure-origin
construction as `managedAccountRedirectUrl`, `managed-trial.ts:2590-2601`).
UX: "Check your inbox" screen with a resend button (resend goes through the
same signUp/resend API, subject to Supabase's server-side email rate limits).
The panel treats "address already registered" indistinguishably from success
("if this address is new, a confirmation is on its way") to avoid an account
enumeration oracle — the same posture recovery already takes
(`ManagedAccountPage.tsx:133`).

**D. Email verification callback (ONE-LINE-CLASS change to hardened code).**
The confirmation link lands on `/account/setup`, which already:
scrubs the URL (`managed-trial.ts:2614-2616`), enforces exact parameter
allowlists (`:2666-2667`), rejects provider errors and malformed tokens
(`:2674-2683`), and exchanges the code (`:2686-2690`). The single change:
`accountPurpose` (`managed-trial.ts:2618-2624`) accepts `'signup'` alongside
`'invite'` and `'recovery'` (both the `mode` query value we set and the
`type` fragment value Supabase sets). Everything else — token validation,
session establishment, password screen — is reused verbatim. Since the user
already chose a password at signup, the `'signup'` purpose skips the
password-set form and goes straight to workspace discovery
(`discoverManagedWorkspacesForCurrentSession`, `managed-trial.ts:2740-2754`).

**E. Claim activation (unchanged, proven).** Zero workspaces → the existing
activation panel (`ManagedLoginPage.tsx:43-65`, `:109-135`) → existing
`createSelfServeWorkspace` (`managed-trial.ts:2924-2941`) → existing
`POST /api/trial/v1/workspaces` with every server-side gate intact
(section 2.3-2.4). The claim-code conflict guarantees are untouched by
construction: this design adds no code that reads, writes, derives, or
validates claim codes.

**F. First session (unchanged).** Directory discovery, workspace open,
welcome email on first creation only (`trial_runtime.py:1081-1097`,
`activation_email.py`).

## 5. Abuse and rate-limit posture

Open signup is a new spam surface with three distinct resources to protect:
outbound confirmation emails, Supabase identity rows, and tenant rows.

**What Supabase enforces natively (provider-side, cannot be skipped):**
- Per-endpoint auth rate limits: emails/hour, signups per IP window,
  verifications per window (dashboard numbers — founder sets them; proposed
  starting point: 10 signup emails/hour total while the pilot is small, raise
  with evidence).
- Optional CAPTCHA on exactly the abused endpoints (open question, section 8).
- "Allow new users to sign up" OFF = the entire surface is dark.

**What our runtime already enforces (all existing, none weakened):**
- Tenant creation stays behind FOUR server-side gates regardless of how many
  identities exist: activation window env (`trial_runtime.py:1043-1044`),
  verified email (`:1057-1058`), writes flag (`trial_store.py:3628-3629`),
  target binding (`trial_store.py:3643-3646`).
- Per-actor creation attempts capped at 5 → 429
  (`trial_store.py:161`, `:3013-3019`; `trial_runtime.py:542-543`).
- One claim = one tenant forever (uuid5 derivation,
  `trial_store.py:2986-2995`); collisions are 409 `claim_code_conflict`
  (`trial_store.py:3744-3762`, `:3804-3806`).
- Request body bounded at 4096 bytes (`trial_runtime.py:1059`).

**Proposed additions (server-side, concrete):**
1. **Durable attempt accounting.** The in-process counter
   (`trial_store.py:3013-3019`) is per-instance and resets on redeploy — on
   serverless it is nearly cosmetic. Proposal: an `app_private` attempt table
   keyed by `actor_id` with a rolling 24h window (5 creates/day/actor), written
   in the same transaction pattern the store already uses. Additive migration;
   does not alter v11 semantics.
2. **Claim-squat friction.** The 4.3 × 10^9 code space (section 2.1) makes
   blind squatting impractical at 5 attempts/actor/day, but conflicts should be
   observable: count `claim_code_conflict` responses per actor in the same
   attempt table so a scanning pattern is visible in one query. No behavior
   change for honest users.
3. **Email-domain posture stays a data decision, not code.** No hardcoded
   domain lists anywhere; if the founder wants domain restrictions (section 8)
   they land as Supabase-side configuration (auth hook), not in our runtime.

## 6. What changes, where — PR batches

No batch is written until the founder approves this document. Order is strict;
each batch is independently green and independently revertable.

**PR-1 — Pure groundwork (client-only, zero network, zero auth surface).**
- `showroom/src/core/signup-account.ts` (NEW, pure): email/password/terms
  validation with literal-`true` terms typing mirroring
  `signup-trial.ts:36-44`; panel state machine (idle → sent → verified);
  copy. No fetch, no Supabase import — testable exactly like `signup-trial.ts`
  is (its header explains the pure-module testing constraint,
  `signup-trial.ts:11-14`).
- `trialSignupDoors` gains the `create-account` door variant behind a
  parameter, default off (`signup-trial.ts:261-283`).
- New guard in `tools/` covering the pure module, wired into the `app:verify`
  chain in `package.json` (house rule: a test tool not wired into app:verify
  never runs — see `tools/run_app_verify.mjs` parsing the canonical chain).
- Size: ~250-350 new lines + guard. Risk: none (dead code until PR-2).

**PR-2 — The auth-surface PR (founder review focus).**
- `managed-trial.ts`: new `createManagedAccount(email, password)` calling
  `supabase.auth.signUp` with the secure redirect (pattern of
  `managed-trial.ts:2590-2601`); `accountPurpose` accepts `'signup'`
  (`:2618-2624`); a resend helper.
- `ManagedLoginPage.tsx`: the create-account panel (section 4B-C), gated on
  `runtime.signupOpen && managedTrialAuthConfigured()`.
- `ManagedAccountPage.tsx`: `'signup'` purpose skips the password form and
  goes to workspace discovery (section 4D).
- `supermega_runtime/runtime.py`: `/api/health` gains
  `authentication.self_serve_signup_open` read from the new env flag
  (section 7); `CoreShell.tsx:271` area parses it into `RuntimeHealth`.
- Size: ~200-300 changed lines across 4 files + guards. Risk: the entire risk
  of this design lives here; everything is dark until the env flag opens.

**PR-3 — Durable abuse accounting (runtime + additive migration).**
- The rolling-window attempt table and conflict counting (section 5 proposals
  1-2), plus store wiring behind the existing `TrialRateLimited` error class so
  the endpoint contract (429 `self_serve_rate_limited`,
  `trial_runtime.py:542-543`) is unchanged.
- Size: one additive migration + ~150 store lines + tests. Can ship after
  PR-2 but before the founder opens the window.

**PR-4 — Docs lockstep.**
- `PRODUCTION-ACTIVATION-RUNBOOK.md` step C checklist grows the signup items:
  the new env flag, Supabase dashboard settings (signups ON, confirm email ON,
  SMTP provider, rate limit numbers, CAPTCHA per founder decision).
- `SELF-SERVE-ONBOARDING-SPEC.md` cross-reference (step C superseded by this
  design's password flow).
- Size: docs only. (`tools/verify_hq_contract.mjs` pins other hq docs —
  `verify_hq_contract.mjs:31-69` — but no `hq/strategy/*.md`, so no digest
  cascade; verified by grep.)

## 7. Rollback and kill-switch

Layered, consistent with the existing window-flag pattern
(`trial_runtime.py:139-147`; runbook rollback section,
`PRODUCTION-ACTIVATION-RUNBOOK.md:82-89`):

1. **New env flag: `SUPERMEGA_SELF_SERVE_SIGNUP_WINDOW`** — must equal exactly
   `open`; absent, blank, or anything else keeps signup closed. Read at
   request time by `/api/health` and surfaced as
   `authentication.self_serve_signup_open`; the client renders the
   create-account panel only when it is true. Unset → panel disappears on the
   next health poll. Same fail-closed shape, same one-word contract as
   `SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW`.
2. **Provider-side hard kill:** Supabase dashboard "Allow new users to sign
   up" OFF. Honest limitation, stated plainly: our env flag hides the UI and
   the health signal, but the publishable key is a public browser credential,
   so a determined caller could invoke the Supabase signup API directly even
   with our flag closed. Only the dashboard toggle (or CAPTCHA) stops that at
   the provider. **This is acceptable because an identity grants nothing:**
   every consequential action still dies at the four server-side gates
   (section 5) — a bare Supabase identity with zero memberships can list zero
   workspaces (`workspace_membership_missing`,
   `managed-trial.ts:2800-2819` client-side and membership checks
   server-side) and cannot create a tenant while the activation window or
   writes flag is closed. Identity ≠ authority is the existing architecture
   (`supabase_auth.py:232-250`: authorization happens in the private trial
   store through membership, never from the token alone).
3. **Existing switches keep their meaning, untouched:**
   `SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW` (tenant creation),
   `SUPERMEGA_TRIAL_WRITES_ENABLED` (all writes), schema-version fail-close
   (`PRODUCTION-ACTIVATION-RUNBOOK.md:36-44`). Rolling back signup never
   requires touching them, and vice versa.
4. **No data rollback needed:** closing signup strands at worst some verified
   identities with zero workspaces — inert rows in `auth.users`, deletable via
   dashboard if ever desired (founder action, never automated).

## 8. Open questions for the founder (honest list — each blocks a specific item)

1. **Email provider and volume.** Supabase built-in SMTP is a few mails/hour —
   fine for a 2-3 shop pilot, dead on arrival for real traffic. Move Auth
   email to Resend SMTP on the verified `supermega.dev` domain
   (`activation_email.py:9-11`)? Resend free tier is ~100 emails/day, 3,000
   /month — is that ceiling acceptable for the quarter, or budget a paid tier?
   Blocks: PR-4 runbook numbers, dashboard config.
2. **CAPTCHA or not.** Turnstile/hCaptcha on signup is the only control that
   stops direct-API signup abuse (section 7.2), but it adds friction and a
   third-party script for Myanmar users on low-end devices, and the app is
   otherwise fully self-contained. Options: none / Turnstile from day one /
   enable only if abuse observed. Blocks: PR-2 form wiring (captchaToken),
   dashboard config.
3. **Allowed email domains.** Accept any address, or block disposable-mail
   domains, or require "work" domains? Supabase has no simple native
   allowlist; enforcement would be an auth hook (provider-side config).
   Recommendation: accept any address for the pilot — the claim code, window
   flag, and rate limits already bound the blast radius — but this is a
   posture call. Blocks: nothing in code; dashboard/hook config only.
4. **Signup with or without a claim code in hand.** Should the create-account
   panel require a device-trial claim code before creating an identity
   (tighter: every identity traces to a trial) or allow account-first signup
   (looser: matches "sign up then look around")? This design assumes
   claim-optional (identity first, claim at activation), because the claim is
   re-validated server-side anyway and requiring it client-side adds no
   security (`trial_store.py:2964-2970`). Blocks: PR-1 panel flow.
5. **Rate-limit numbers.** Proposed: Supabase 10 signup emails/hour during
   pilot; runtime 5 tenant-creates/actor/day durable (section 5.1). Approve or
   adjust. Blocks: PR-3 constants, dashboard config.
6. **Password flow vs magic-link (spec divergence).** Section 3 diverges from
   `SELF-SERVE-ONBOARDING-SPEC.md:71-76` (OTP) to password+confirmation.
   Approve the divergence or direct otherwise. Blocks: PR-2 shape.
7. **Terms of service artifact.** The panel records literal-`true` acceptance,
   but of WHAT document, hosted where, versioned how? Today `termsAccepted`
   exists on the trial record (`signup-trial.ts:57-66`) without a canonical
   terms URL. Blocks: PR-1 copy.
8. **Sequencing against production activation.** Signup UI is inert until
   managed auth is configured on the deployed build AND the runbook's steps
   A-D run (`PRODUCTION-ACTIVATION-RUNBOOK.md:46-74`, and its one open
   precondition at `:24-28`). Ship the signup PRs dark ahead of that (so one
   founder session opens everything), or hold them until after first manual
   tenants prove the runbook? Blocks: merge timing only, not content.

## 9. Explicitly out of scope

- Any change to `create_self_serve_workspace`, the v11 migration, the claim
  derivation, conflict handling, or anything the six-for-six proof covers.
- Any change to `managed_activation.py` (the founder tool remains the managed
  path and the fallback).
- Pricing, tiers, or payment anywhere in the flow (`signup-trial.ts:16-18`
  states the standing product decision; unchanged).
- OAuth/social login, invitations, team member self-signup, email change
  flows.
- Opening any window, flag, or dashboard toggle — every activation step in
  this document is founder-run.

---

End of design. This document authorizes nothing; the founder decides.
