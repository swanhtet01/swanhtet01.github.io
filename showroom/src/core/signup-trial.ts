/**
 * Signup: the trial record and the two doors out of it.
 *
 * The product had no signup. `/signup` redirected to `/login`, and `/login` is gated on
 * `runtime.status === 'enterprise'` AND `managedTrialAuthConfigured()`, neither of which is true on
 * a static build. So the only way in was a contact form and a wait for a human. The hosted
 * `/api/trial/v1/workspaces` activation path now consumes this device claim and the selected
 * product, but remains fail-closed until the founder opens its reviewed activation window.
 *
 * This module is deliberately pure -- no window, no clock, no randomness, no fetch. Every guard in
 * tools/ tests plain modules because nothing in this repo can render React, so the logic worth
 * proving lives here and SignupPage.tsx stays a thin shell over it. Callers pass storage, the id
 * and the timestamp in.
 *
 * PRICING IS DELIBERATELY ABSENT. There is no plan, no tier and no amount anywhere in this file,
 * and the second door is an activation request answered by a person rather than a checkout. That
 * is a product decision, not an omission: what a shop pays is agreed with the founder.
 */

export const TRIAL_SIGNUP_KEY = 'supermega.trial_signup.v1'
export const TRIAL_SIGNUP_SCHEMA = 'supermega.trial_signup.v2' as const
/**
 * The schema this module wrote before terms acceptance existed. Still restorable: a v1 record is
 * a v2 record whose terms were never accepted, so restore defaults `termsAccepted` to an explicit
 * false instead of refusing the record. The storage KEY above deliberately stays v1 -- it is a
 * location registered with reset and backup, not a record format.
 */
export const TRIAL_SIGNUP_SCHEMA_V1 = 'supermega.trial_signup.v1' as const

/** The four products a trial can start in. Mirrors ClientSolutionId without importing it, so this
 * module stays free of the onboarding graph and can be bundled alone by a guard. */
export type TrialSignupProduct = 'commerce' | 'production' | 'website' | 'ecommerce'

/**
 * Contact details are only ever present WITH consent. `consentRecorded: true` is a literal type,
 * not a boolean, so a record carrying an email without recorded consent does not type-check and
 * does not survive `restoreTrialSignup`. Consent cannot be forgotten by a later edit that flips a
 * flag -- there is no false to flip to.
 */
export type TrialSignupContact = {
  email: string
  consentRecorded: true
}

export type TrialSignupRecord = {
  schema: typeof TRIAL_SIGNUP_SCHEMA
  id: string
  claimCode: string
  createdAt: string
  businessName: string
  ownerName: string
  product: TrialSignupProduct
  shopBusinessTemplateId: string | null
  shopIndustryPackId: string | null
  contact: TrialSignupContact | null
  /**
   * Terms follow the consent pattern: the only value that can ever claim acceptance is the
   * literal `true`. Unlike `consentRecorded` there IS a false -- a v1 record predates the field
   * and restores as an explicit "not accepted" rather than being refused -- but nothing looser
   * than the literal survives: `createTrialSignupRecord` refuses a non-boolean outright, and
   * `restoreTrialSignup` coerces any tampered value ('yes', 1, 'true') back to false rather than
   * trusting it. Acceptance the owner did not give cannot be smuggled in.
   */
  termsAccepted: true | false
}

export type TrialSignupInput = {
  id: string
  createdAt: string
  businessName: string
  ownerName?: string
  product: TrialSignupProduct
  shopBusinessTemplateId?: string | null
  shopIndustryPackId?: string | null
  /** Supplying an email REQUIRES consent. Passing an email with consent false is rejected rather
   * than quietly dropped, because a signup that silently discards what someone typed is worse than
   * one that refuses it. */
  email?: string
  emailConsent?: boolean
  /** Terms are recorded from the literal `true` only. A truthy stand-in ('yes', 1) is refused
   * rather than coerced, mirroring the email rule above: refuse, never silently reinterpret. */
  termsAccepted?: boolean
}

const TRIAL_PRODUCTS: readonly TrialSignupProduct[] = ['commerce', 'production', 'website', 'ecommerce']

export type TrialSignupProductChoice = {
  id: TrialSignupProduct
  slug: 'shop' | 'plant' | 'website' | 'ecommerce'
  label: 'Shop' | 'Plant' | 'Website' | 'Ecommerce'
  outcome: string
  setupPath: string
  workspacePath: string
}

export const TRIAL_SIGNUP_PRODUCT_CHOICES: readonly TrialSignupProductChoice[] = [
  { id: 'commerce', slug: 'shop', label: 'Shop', outcome: 'Sell, book, stock, and close the day.', setupPath: '/settings/?product=shop', workspacePath: '/shop/' },
  { id: 'production', slug: 'plant', label: 'Plant', outcome: 'Plan work, materials, quality, and maintenance.', setupPath: '/settings/?product=plant', workspacePath: '/plant/' },
  { id: 'website', slug: 'website', label: 'Website', outcome: 'Build, preview, approve, and publish your business site.', setupPath: '/settings/?product=website', workspacePath: '/website/' },
  { id: 'ecommerce', slug: 'ecommerce', label: 'Ecommerce', outcome: 'Open a storefront and turn requests into reviewed orders.', setupPath: '/settings/?product=ecommerce', workspacePath: '/ecommerce/' },
] as const

export function trialSignupProductChoice(value: unknown): TrialSignupProductChoice {
  const normalized = trimmed(value).toLowerCase()
  return TRIAL_SIGNUP_PRODUCT_CHOICES.find((choice) => choice.id === normalized || choice.slug === normalized)
    ?? TRIAL_SIGNUP_PRODUCT_CHOICES[0]
}

/** Same bound the rest of onboarding uses for a business name (ProductOnboardingPage requires a
 * non-empty name; client-onboarding bounds workspace strings at 120). */
const MAX_BUSINESS_NAME = 120
const MAX_OWNER_NAME = 120
const MAX_EMAIL = 160

const DEFAULT_OWNER_NAME = 'Business owner'

function trimmed(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Deliberately permissive: one @, something either side, one dot in the domain, no whitespace.
 * A signup form is the wrong place to argue with a real address, and this value is never used as a
 * credential or an auth identifier -- it is a note to call someone back.
 */
export function isPlausibleContactEmail(value: string) {
  const email = trimmed(value)
  if (!email || email.length > MAX_EMAIL) return false
  if (/\s/.test(email)) return false
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(email)
}

/**
 * A code the owner can read down a phone line. Derived from the record id rather than generated,
 * so it is stable across reloads and a guard can assert it without stubbing randomness.
 * Crockford-ish alphabet: no I, L, O or U, so it cannot be misheard as 1, 0 or spoken as a word.
 */
const CLAIM_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function trialSignupClaimCode(id: string) {
  const source = trimmed(id).replace(/[^0-9a-fA-F]/g, '').toLowerCase()
  if (source.length < 8) throw new Error('A trial id needs at least eight hex characters to form a claim code.')
  let code = ''
  for (let index = 0; index < 8; index += 1) {
    code += CLAIM_ALPHABET[parseInt(source[index], 16) * 2 % CLAIM_ALPHABET.length]
  }
  return `SM-${code.slice(0, 4)}-${code.slice(4, 8)}`
}

export function createTrialSignupRecord(input: TrialSignupInput): TrialSignupRecord {
  const businessName = trimmed(input.businessName)
  if (!businessName) throw new Error('Enter a business name.')
  if (businessName.length > MAX_BUSINESS_NAME) throw new Error('That business name is too long.')

  const ownerName = trimmed(input.ownerName) || DEFAULT_OWNER_NAME
  if (ownerName.length > MAX_OWNER_NAME) throw new Error('That name is too long.')

  if (!TRIAL_PRODUCTS.includes(input.product)) throw new Error('Choose a product to start in.')

  const id = trimmed(input.id)
  const claimCode = trialSignupClaimCode(id)

  const createdAt = trimmed(input.createdAt)
  if (Number.isNaN(Date.parse(createdAt)) || new Date(Date.parse(createdAt)).toISOString() !== createdAt) {
    throw new Error('A trial needs an exact ISO timestamp.')
  }

  const email = trimmed(input.email)
  // Refuse rather than drop. Silently discarding a typed email is the failure this guards against.
  if (email && !input.emailConsent) throw new Error('Tick the box to keep your email on this device, or clear the field.')
  if (email && !isPlausibleContactEmail(email)) throw new Error('That email address does not look right.')

  // Literal or nothing. A caller that "accepts" the terms with 'yes' or 1 wrote code this module
  // does not trust with an acceptance record, so it gets an error, not a record.
  if (input.termsAccepted !== undefined && typeof input.termsAccepted !== 'boolean') {
    throw new Error('Terms acceptance must be recorded as exactly true, or not at all.')
  }

  return {
    schema: TRIAL_SIGNUP_SCHEMA,
    id,
    claimCode,
    createdAt,
    businessName,
    ownerName,
    product: input.product,
    shopBusinessTemplateId: trimmed(input.shopBusinessTemplateId) || null,
    shopIndustryPackId: trimmed(input.shopIndustryPackId) || null,
    contact: email ? { email, consentRecorded: true } : null,
    termsAccepted: input.termsAccepted === true,
  }
}

export function restoreTrialSignup(value: unknown): TrialSignupRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<TrialSignupRecord>
  // A v1 record is welcome back: same fields, written before terms acceptance existed. It
  // restores with an explicit termsAccepted: false and is re-written as v2 on the next save.
  const schema = (value as { schema?: unknown }).schema
  if (schema !== TRIAL_SIGNUP_SCHEMA && schema !== TRIAL_SIGNUP_SCHEMA_V1) return null
  if (!trimmed(record.id) || !trimmed(record.businessName) || !trimmed(record.claimCode)) return null
  if (!TRIAL_PRODUCTS.includes(record.product as TrialSignupProduct)) return null
  if (Number.isNaN(Date.parse(trimmed(record.createdAt)))) return null

  // A stored email without recorded consent is dropped, not trusted. Tampering with the file, or a
  // future writer that forgets the flag, loses the email rather than gaining an unconsented one.
  const contact = record.contact
  const restoredContact: TrialSignupContact | null =
    contact && typeof contact === 'object'
      && contact.consentRecorded === true
      && isPlausibleContactEmail(trimmed(contact.email))
      ? { email: trimmed(contact.email), consentRecorded: true }
      : null

  return {
    schema: TRIAL_SIGNUP_SCHEMA,
    id: trimmed(record.id),
    claimCode: trimmed(record.claimCode),
    createdAt: trimmed(record.createdAt),
    businessName: trimmed(record.businessName),
    ownerName: trimmed(record.ownerName) || DEFAULT_OWNER_NAME,
    product: record.product as TrialSignupProduct,
    shopBusinessTemplateId: trimmed(record.shopBusinessTemplateId) || null,
    shopIndustryPackId: trimmed(record.shopIndustryPackId) || null,
    contact: restoredContact,
    // Only the literal survives. A v1 record has no field here, a tampered one may hold 'yes' or
    // 1 -- both restore as an explicit false, exactly like an unconsented email is dropped.
    termsAccepted: record.termsAccepted === true,
  }
}

export type TrialSignupStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function readTrialSignup(storage: TrialSignupStorage | undefined | null): TrialSignupRecord | null {
  if (!storage) return null
  let raw: string | null
  try { raw = storage.getItem(TRIAL_SIGNUP_KEY) } catch { return null }
  if (raw === null) return null
  try { return restoreTrialSignup(JSON.parse(raw)) } catch { return null }
}

/**
 * Fail closed, and prove it. A quota-exceeded setItem throws; a private-mode storage can accept the
 * write and hand back null on read. Both end with the owner believing a trial exists when nothing
 * was kept, so the write is confirmed by reading it back and comparing the id.
 */
export function writeTrialSignup(storage: TrialSignupStorage | undefined | null, record: TrialSignupRecord) {
  if (!storage) throw new Error('Browser storage is unavailable, so the trial was not saved.')
  try {
    storage.setItem(TRIAL_SIGNUP_KEY, JSON.stringify(record))
  } catch {
    throw new Error('Browser storage is full, so the trial was not saved. Free some space and try again.')
  }
  const confirmed = readTrialSignup(storage)
  if (!confirmed || confirmed.id !== record.id) {
    throw new Error('Browser storage did not keep the trial. Private browsing can block it.')
  }
  return confirmed
}

/**
 * The two doors, and the reason this file exists.
 *
 * Both are ALWAYS available. Founder decision 2026-08-12: managed pilots are self-serve -- the
 * user names themselves. So when managed auth is off the second door is an activation REQUEST the
 * owner sends, not a service a human performs on them. The request still travels the existing
 * contact channel (trialSignupContactUrl) and a person answers it -- that is the founder
 * fallback, not a degraded state. Nothing here says "unavailable", "coming soon" or "not active
 * in this release", because none of those are true: the door works. Commercial terms stay out of
 * the copy, which is deliberate.
 */
export type TrialSignupDoor = {
  id: 'trial' | 'managed' | 'create-account'
  label: string
  detail: string
  action: 'open-product' | 'sign-in' | 'request-activation' | 'create-account'
}

/**
 * `signupOpen` (default OFF) is PR-1 of hq/strategy/SELF-SERVE-IDENTITY-DESIGN.md: when the
 * founder-held signup window is open a THIRD door appears -- create your company account
 * yourself -- while both existing doors keep their exact state. The founder-conversation door
 * never disappears: activation requests remain answered by a person whether signup is open or
 * not. No caller passes `signupOpen` yet, so today's behavior is unchanged by construction; PR-2
 * wires it from the `/api/health` `self_serve_signup_open` signal AND
 * `managedTrialAuthConfigured()`, both required, and the signal is fail-closed at the runtime
 * behind SUPERMEGA_SELF_SERVE_SIGNUP_WINDOW (design section 7).
 */
export function trialSignupDoors({ managedReady, signupOpen = false }: { managedReady: boolean; signupOpen?: boolean }): readonly TrialSignupDoor[] {
  return [
    {
      id: 'trial',
      label: 'Open your workspace',
      detail: 'Your trial runs on this device with a full starter catalog. Nothing to install, no card, no waiting.',
      action: 'open-product',
    },
    managedReady
      ? {
        id: 'managed',
        label: 'Sign in to your company',
        detail: 'Your company account is active. Sign in to work with your team on shared records.',
        action: 'sign-in',
      }
      : {
        id: 'managed',
        label: 'Activate your company account',
        detail: 'Shared records, your team, and your data off this device. You have already named your business and hold the claim code -- send your activation request, and a person is on hand whenever you want help.',
        action: 'request-activation',
      },
    ...(signupOpen
      ? [{
        id: 'create-account' as const,
        label: 'Create your company account',
        detail: 'Sign up with your work email and a password, verify your address, and activate your company with the claim code you already hold.',
        action: 'create-account' as const,
      }]
      : []),
  ]
}

/**
 * What signup offers as "what kind of business".
 *
 * This is a pure function so a guard can assert the property that actually matters: EVERY industry
 * pack must be reachable. Offering only trade templates silently excluded spa, gym and school --
 * the three packs with no trade -- so the owner of a spa picked "Standard starter catalog" and was
 * handed a retail shop. The same defect class as a bookable service with no catalog item: N options
 * exist, only the demoed ones work.
 */
export type SignupBusinessChoice = {
  id: string
  label: string
  kind: 'trade' | 'pack'
  industryPackId: string
}

export function signupBusinessChoices(
  templates: readonly { id: string; name: { en: string }; industryPackId: string }[],
  packs: readonly { id: string; name: string }[],
): readonly SignupBusinessChoice[] {
  const trades = templates.map((template) => ({
    id: `trade:${template.id}`,
    label: template.name.en,
    kind: 'trade' as const,
    industryPackId: template.industryPackId,
  }))
  // Only packs with no trade template. A pack that HAS trades is already reachable through them,
  // and listing it twice would make an owner choose between two doors to the same room.
  const covered = new Set(templates.map((template) => template.industryPackId))
  const servicePacks = packs
    .filter((pack) => !covered.has(pack.id))
    .map((pack) => ({ id: `pack:${pack.id}`, label: pack.name, kind: 'pack' as const, industryPackId: pack.id }))
  return [...trades, ...servicePacks]
}

const CONTACT_PRODUCT_SLUGS: Readonly<Record<TrialSignupProduct, string>> = {
  commerce: 'shop',
  production: 'plant',
  website: 'website',
  ecommerce: 'ecommerce',
}

/**
 * The handoff to the contact form.
 *
 * The published contact page parses the URL FRAGMENT, but it reads an allowlist: `company`, `goal`,
 * `claim` and a fixed set of `proof_*` names (tools/create_public_vercel_output.mjs). Every other
 * key is ignored and the fragment is then stripped with history.replaceState. So an email put here
 * would be silently discarded -- the owner would think they had sent it. It is therefore NOT
 * included, and the form asks for it directly instead.
 *
 * The claim code travels twice on purpose: in `goal` so the human conversation carries it, and in
 * `claim` so the lead record carries it structured -- the founder links a managed account to the
 * exact trial without parsing prose.
 */
export function trialSignupContactUrl(record: TrialSignupRecord, base = 'https://supermega.dev/contact/') {
  const query = new URLSearchParams({
    product: CONTACT_PRODUCT_SLUGS[record.product],
    template: 'managed-account',
    utm_source: 'app',
    utm_medium: 'trial_signup',
  })
  const goal = [
    `Company account enquiry for ${record.businessName}.`,
    `Trial claim code ${record.claimCode}.`,
    record.shopBusinessTemplateId ? `Trade: ${record.shopBusinessTemplateId}.` : '',
    'Started from the in-app trial.',
  ].filter(Boolean).join(' ')
  const handoff = new URLSearchParams({ company: record.businessName, goal, claim: record.claimCode })
  return `${base}?${query.toString()}#${handoff.toString()}`
}

/**
 * A file the owner keeps. The contact URL is a one-shot -- the fragment is stripped on arrival --
 * so the claim must also exist somewhere the owner controls, or "connect to real use later" depends
 * on a browser they might clear. Contains the email only when consent was recorded.
 */
export function trialSignupClaimFile(record: TrialSignupRecord) {
  return `${JSON.stringify({
    schema: TRIAL_SIGNUP_SCHEMA,
    claimCode: record.claimCode,
    id: record.id,
    createdAt: record.createdAt,
    businessName: record.businessName,
    ownerName: record.ownerName,
    product: record.product,
    shopBusinessTemplateId: record.shopBusinessTemplateId,
    shopIndustryPackId: record.shopIndustryPackId,
    termsAccepted: record.termsAccepted,
    contactEmail: record.contact?.email ?? null,
  }, null, 2)}\n`
}
