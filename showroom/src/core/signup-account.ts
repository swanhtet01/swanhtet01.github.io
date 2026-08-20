/**
 * Create-account groundwork: validation, panel states and copy for self-serve identity creation.
 *
 * PR-1 of hq/strategy/SELF-SERVE-IDENTITY-DESIGN.md (section 6). This module is DEAD CODE by
 * design until PR-2: nothing in showroom imports it, no route renders it, and it performs no
 * network call of any kind. The Supabase `signUp` call, the create-account panel in
 * ManagedLoginPage, and the `/api/health` `self_serve_signup_open` signal are all PR-2. Even after
 * PR-2 ships, the surface stays dark until the founder sets `SUPERMEGA_SELF_SERVE_SIGNUP_WINDOW`
 * to exactly `open` at the runtime AND turns the provider-side signup toggle on -- the fail-closed
 * pattern of SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW (design section 7).
 *
 * This module is deliberately pure -- no window, no clock, no randomness, no fetch, no Supabase
 * import. Every guard in tools/ tests plain modules because nothing in this repo can render React,
 * so the logic worth proving lives here and the PR-2 panel stays a thin shell over it. It mirrors
 * signup-trial.ts, whose header states the same constraint.
 *
 * Unlike the trial's contact email (a note to call someone back), the email here becomes an auth
 * identifier, so validation mirrors managed-trial.ts exactly: the same AUTH_EMAIL shape and
 * 160-character bound as `normalizeAuthEmail`, and the same 12..128 password floor as
 * `completeManagedAccountPassword`. If PR-2 tightens one side, tighten both.
 *
 * PRICING IS DELIBERATELY ABSENT, exactly as in signup-trial.ts: what a shop pays is agreed with
 * the founder, and no plan, tier or amount appears anywhere in this flow.
 */

/**
 * Terms follow the consent pattern of TrialSignupContact.consentRecorded (signup-trial.ts): the
 * only value that can ever claim acceptance is the literal `true`. There is no false to flip to --
 * a request without accepted terms does not validate and therefore cannot exist as a
 * CreateAccountRequest. A truthy stand-in ('yes', 1) is refused rather than coerced: refuse,
 * never silently reinterpret.
 */
export type CreateAccountRequest = {
  email: string
  password: string
  termsAccepted: true
}

export type CreateAccountInput = {
  email?: string
  password?: string
  confirmation?: string
  /** Only the literal `true` validates. Anything non-boolean is refused outright. */
  termsAccepted?: boolean
}

/** Same shape and bound as managed-trial.ts `normalizeAuthEmail`: this address becomes a
 * credential identifier, not a callback note, so it is held to the auth surface's rule. */
const ACCOUNT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_ACCOUNT_EMAIL = 160

/** Same floor and ceiling as `completeManagedAccountPassword` (managed-trial.ts): the password
 * set at signup must satisfy exactly what account setup and recovery already enforce. */
const MIN_ACCOUNT_PASSWORD = 12
const MAX_ACCOUNT_PASSWORD = 128

/**
 * DESIGN DEFAULT — founder may override before window opens. Open question 4 of the design:
 * this request carries NO claim-code field -- identity first, claim at activation -- because the
 * claim is re-validated server-side at the tenant endpoint anyway and requiring it here would add
 * friction without security. A founder decision for claim-required signup would add the field in
 * PR-2, not loosen anything here.
 */
export function validateCreateAccountRequest(input: CreateAccountInput): CreateAccountRequest {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!email || email.length > MAX_ACCOUNT_EMAIL || !ACCOUNT_EMAIL.test(email)) {
    // Same copy as managed-trial.ts `normalizeAuthEmail`, so the two surfaces never disagree.
    throw new Error('Enter a valid work email.')
  }

  const password = typeof input.password === 'string' ? input.password : ''
  if (password.length < MIN_ACCOUNT_PASSWORD || password.length > MAX_ACCOUNT_PASSWORD || !password.trim()) {
    // Same copy as `completeManagedAccountPassword`, which is the floor this mirrors.
    throw new Error('Use a password with at least 12 characters.')
  }

  // Refuse, never silently accept a typo. The confirmation exists only to prove the owner can
  // type the password twice; it is deliberately NOT part of the validated request.
  if (input.confirmation !== password) throw new Error('The passwords do not match.')

  // Literal or nothing, mirroring createTrialSignupRecord: a caller that "accepts" with 'yes' or
  // 1 wrote code this module does not trust with an acceptance record.
  if (input.termsAccepted !== undefined && typeof input.termsAccepted !== 'boolean') {
    throw new Error('Terms acceptance must be recorded as exactly true, or not at all.')
  }
  if (input.termsAccepted !== true) throw new Error('Accept the terms to create your company account.')

  return { email, password, termsAccepted: true }
}

/**
 * The panel's three states, and the only moves between them. Pure so a guard can prove the
 * machine refuses what the design forbids -- there is no path to `verified` that skips `sent`,
 * because verification only ever arrives through the emailed confirmation link.
 *
 *   idle -----confirmation-sent----> sent
 *   sent -----resend--------------> sent      (same enumeration-safe copy, same screen)
 *   sent -----start-over----------> idle      ("Try another email", as recovery already offers)
 *   sent -----email-verified------> verified
 */
export type CreateAccountPanelState = 'idle' | 'sent' | 'verified'
export type CreateAccountPanelEvent = 'confirmation-sent' | 'resend' | 'start-over' | 'email-verified'

const PANEL_TRANSITIONS: Readonly<Record<CreateAccountPanelState, Partial<Record<CreateAccountPanelEvent, CreateAccountPanelState>>>> = {
  idle: { 'confirmation-sent': 'sent' },
  sent: { resend: 'sent', 'start-over': 'idle', 'email-verified': 'verified' },
  verified: {},
}

export function createAccountPanelTransition(
  state: CreateAccountPanelState,
  event: CreateAccountPanelEvent,
): CreateAccountPanelState {
  const next = PANEL_TRANSITIONS[state]?.[event]
  // An illegal move is a coding error in the caller, not a state to absorb: refuse loudly rather
  // than silently staying put, exactly as validation refuses rather than reinterprets.
  if (!next) throw new Error(`The create-account panel cannot apply "${event}" while "${state}".`)
  return next
}

/**
 * The panel's words, in one place so the guard can hold them to the design's posture:
 *
 * - The sent screen treats "address already registered" indistinguishably from success -- "if
 *   this address is new, a confirmation is on its way" -- so the panel is never an account
 *   enumeration oracle. Same posture password recovery already takes ("the result is the same
 *   whether or not the address has an account", ManagedAccountPage.tsx).
 * - DESIGN DEFAULT — founder may override before window opens. Open question 7 of the design:
 *   no canonical terms-of-service document, URL or version exists today (the trial checkbox has
 *   the same gap), so the checkbox names the SuperMega terms generically and links nowhere. The
 *   founder decides the artifact before the window opens; the literal-`true` recording is
 *   unaffected by whatever document it ends up naming.
 * - Nothing here says "unavailable", "coming soon" or "not active": while the window is closed
 *   the panel simply does not render (PR-2 gates it on the health signal), so no copy for a
 *   closed state exists at all.
 */
export const CREATE_ACCOUNT_PANEL_COPY = {
  eyebrow: 'Company account',
  title: 'Create your company account.',
  detail: 'One work email and one strong password. You verify the address before anything else happens.',
  emailLabel: 'Work email',
  passwordLabel: 'Password',
  passwordHint: 'Use at least 12 characters.',
  confirmationLabel: 'Confirm password',
  termsLabel: 'I accept the SuperMega terms',
  submit: 'Create account',
  sentEyebrow: 'Check your inbox',
  sentTitle: 'Confirmation requested.',
  sentDetail: 'If this address is new to SuperMega, a confirmation email is on its way. Open the link it contains to verify your address.',
  resend: 'Resend the confirmation email',
  startOver: 'Try another email',
  verifiedEyebrow: 'Email verified',
  verifiedTitle: 'Your address is confirmed.',
  verifiedDetail: 'Sign in to your account, then activate your company with the claim code from your trial.',
} as const
