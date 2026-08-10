/**
 * Signup: the trial record and the two doors out of it.
 *
 * The product had no signup. `/signup` redirected to `/login`, and `/login` is gated on
 * `runtime.status === 'enterprise'` AND `managedTrialAuthConfigured()`, neither of which is true on
 * a static build. So the only way in was a contact form and a wait for a human. There is also no
 * self-serve account creation anywhere: `/api/trial/v1/workspaces` only LISTS companies an
 * already-provisioned member belongs to, and tells everyone else to "Ask the company owner to
 * activate access."
 *
 * This module is deliberately pure -- no window, no clock, no randomness, no fetch. Every guard in
 * tools/ tests plain modules because nothing in this repo can render React, so the logic worth
 * proving lives here and SignupPage.tsx stays a thin shell over it. Callers pass storage, the id
 * and the timestamp in.
 *
 * PRICING IS DELIBERATELY ABSENT. There is no plan, no tier and no amount anywhere in this file,
 * and the second door is a conversation rather than a checkout. That is a product decision, not an
 * omission: what a shop pays is agreed with the founder.
 */

export const TRIAL_SIGNUP_KEY = 'supermega.trial_signup.v1'
export const TRIAL_SIGNUP_SCHEMA = 'supermega.trial_signup.v1' as const

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
}

const TRIAL_PRODUCTS: readonly TrialSignupProduct[] = ['commerce', 'production', 'website', 'ecommerce']

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
  }
}

export function restoreTrialSignup(value: unknown): TrialSignupRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<TrialSignupRecord>
  if (record.schema !== TRIAL_SIGNUP_SCHEMA) return null
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
 * Both are ALWAYS available. When managed auth is off the second door is a conversation with the
 * founder rather than a sign-in form -- which is the honest description of how an account is
 * actually granted today, not a degraded state. Nothing here says "unavailable", "coming soon" or
 * "not active in this release", because none of those are true: the door works, it is just staffed
 * by a person. That also keeps commercial terms private, which is deliberate.
 */
export type TrialSignupDoor = {
  id: 'trial' | 'managed'
  label: string
  detail: string
  action: 'open-product' | 'sign-in' | 'request-account'
}

export function trialSignupDoors({ managedReady }: { managedReady: boolean }): readonly TrialSignupDoor[] {
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
        label: 'Talk to us about a company account',
        detail: 'Shared records, your team, and your data off this device. We set each company up by hand.',
        action: 'request-account',
      },
  ]
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
 * The published contact page parses the URL FRAGMENT, but it reads an allowlist: `company`, `goal`
 * and a fixed set of `proof_*` names (tools/create_public_vercel_output.mjs). Every other key is
 * ignored and the fragment is then stripped with history.replaceState. So an email put here would
 * be silently discarded -- the owner would think they had sent it. It is therefore NOT included,
 * and the form asks for it directly instead.
 *
 * The claim code travels in `goal`, which IS read, so the founder can match a conversation to the
 * trial already running on that owner's device.
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
  const handoff = new URLSearchParams({ company: record.businessName, goal })
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
    contactEmail: record.contact?.email ?? null,
  }, null, 2)}\n`
}
