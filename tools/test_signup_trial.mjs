// Guard: the signup trial keeps its promises.
//
// /signup used to redirect to /login, and /login is gated on runtime.status === 'enterprise' AND
// managedTrialAuthConfigured(), neither true on a static build. There is no self-serve account
// creation anywhere -- /api/trial/v1/workspaces only LISTS companies an already-provisioned member
// belongs to. So a stranger had no way to start at all.
//
// The dangerous part of a signup is not the form, it is what happens to what someone typed. This
// asserts the three properties that would otherwise fail silently:
//   1. an email is never kept without recorded consent, and never quietly dropped either
//   2. a trial is never reported as saved unless storage actually kept it
//   3. the contact handoff never carries an email the receiving page would discard
//
// Nothing here renders React on purpose: no guard in this repo can, which is exactly why the
// decidable logic lives in signup-trial.ts and SignupPage.tsx is a thin shell over it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export * from './signup-trial.ts'
      export { shopIndustryPacks } from './shop-service-scheduling.ts'
      export { shopBusinessTemplates } from '../products/shop/business-templates.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/signup-trial-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  TRIAL_SIGNUP_KEY,
  TRIAL_SIGNUP_SCHEMA,
  TRIAL_SIGNUP_SCHEMA_V1,
  TRIAL_SIGNUP_PRODUCT_CHOICES,
  createTrialSignupRecord,
  readTrialSignup,
  restoreTrialSignup,
  trialSignupClaimCode,
  trialSignupClaimFile,
  trialSignupContactUrl,
  trialSignupDoors,
  trialSignupProductChoice,
  writeTrialSignup,
  signupBusinessChoices,
  shopIndustryPacks,
  shopBusinessTemplates,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
function throws(fn, label) {
  checks += 1
  let threw = false
  try { fn() } catch { threw = true }
  assert.ok(threw, label)
}

const ID = '7f3c92a1-4b8e-4d21-9c07-2ab5e6f10d34'
const AT = '2026-08-11T02:15:00.000Z'
const base = { id: ID, createdAt: AT, businessName: 'Yangon Tyre', product: 'commerce' }

// --- every product is an explicit front door ---------------------------------------
check(
  TRIAL_SIGNUP_PRODUCT_CHOICES.map((choice) => choice.id).join(',') === 'commerce,production,website,ecommerce',
  'signup offers the four products once, in canonical order',
)
check(new Set(TRIAL_SIGNUP_PRODUCT_CHOICES.map((choice) => choice.slug)).size === 4, 'every signup product has a distinct public slug')
for (const choice of TRIAL_SIGNUP_PRODUCT_CHOICES) {
  check(trialSignupProductChoice(choice.id) === choice, `${choice.id}: runtime id resolves to its signup choice`)
  check(trialSignupProductChoice(choice.slug) === choice, `${choice.slug}: public slug resolves to its signup choice`)
  check(choice.setupPath.includes(`product=${choice.slug}`), `${choice.label}: setup path preserves product intent`)
  check(choice.workspacePath.startsWith(`/${choice.slug}/`), `${choice.label}: workspace path is product-specific`)
}
check(trialSignupProductChoice('unknown').id === 'commerce', 'unknown product input fails to the visible Shop default')

// --- the record -----------------------------------------------------------------
const minimal = createTrialSignupRecord(base)
check(minimal.businessName === 'Yangon Tyre', 'a business name is all that is required to start')
check(minimal.ownerName === 'Business owner', 'an owner name defaults rather than blocking the start')
check(minimal.contact === null, 'no email means no contact record at all')

throws(() => createTrialSignupRecord({ ...base, businessName: '   ' }), 'a blank business name is refused')
throws(() => createTrialSignupRecord({ ...base, product: 'nonsense' }), 'an unknown product is refused')
throws(() => createTrialSignupRecord({ ...base, createdAt: 'yesterday' }), 'a non-ISO timestamp is refused')
throws(() => createTrialSignupRecord({ ...base, id: 'xyz' }), 'an id too short to form a claim code is refused')

// --- consent: refuse, never silently drop ----------------------------------------
// This is the property worth having. Dropping a typed email would leave the owner believing
// SuperMega could contact them, and leave no trace that anything was lost.
throws(
  () => createTrialSignupRecord({ ...base, email: 'ko@yangontyre.com' }),
  'AN EMAIL WITHOUT CONSENT IS REFUSED -- not stored, and not silently discarded either',
)
throws(
  () => createTrialSignupRecord({ ...base, email: 'not-an-email', emailConsent: true }),
  'an implausible email is refused rather than stored as a dead contact',
)
const consented = createTrialSignupRecord({ ...base, email: 'ko@yangontyre.com', emailConsent: true })
check(consented.contact?.email === 'ko@yangontyre.com', 'a consented email is kept')
check(consented.contact?.consentRecorded === true, 'and the consent is recorded alongside it')

// --- terms: the literal true, an explicit false, and nothing in between -------------
// Schema v2 adds termsAccepted, mirroring consentRecorded one step further: only the literal
// `true` can ever claim the terms. A v1 record predates the field and restores as an explicit
// false; a looser value is refused at create and dropped at restore, never coerced to accepted.
check(minimal.termsAccepted === false, 'terms DEFAULT TO AN EXPLICIT FALSE -- unaccepted, not merely absent')
check(minimal.schema === TRIAL_SIGNUP_SCHEMA, 'a fresh record carries the v2 schema')
const agreed = createTrialSignupRecord({ ...base, termsAccepted: true })
check(agreed.termsAccepted === true, 'accepted terms are recorded as the literal true')
check(createTrialSignupRecord({ ...base, termsAccepted: false }).termsAccepted === false, 'an explicit false stays false')
throws(
  () => createTrialSignupRecord({ ...base, termsAccepted: 'yes' }),
  'A TRUTHY STAND-IN IS REFUSED AT CREATE -- acceptance is the literal true, never a coerced string',
)
throws(
  () => createTrialSignupRecord({ ...base, termsAccepted: 1 }),
  'a numeric stand-in is refused at create too',
)
check(restoreTrialSignup(agreed)?.termsAccepted === true, 'accepted terms survive restore')
check(
  restoreTrialSignup({ ...agreed, termsAccepted: 'yes' })?.termsAccepted === false,
  'A TAMPERED TERMS VALUE RESTORES AS FALSE -- acceptance cannot be smuggled in by editing the file',
)
check(restoreTrialSignup({ ...agreed, termsAccepted: 1 })?.termsAccepted === false, 'a numeric tamper restores as false')
const v1Record = { ...minimal, schema: TRIAL_SIGNUP_SCHEMA_V1 }
delete v1Record.termsAccepted
const restoredV1 = restoreTrialSignup(v1Record)
check(restoredV1 !== null, 'A V1 RECORD STILL RESTORES -- the schema bump does not orphan existing trials')
check(restoredV1.termsAccepted === false, 'and its terms default to an explicit false, not accepted')
check(restoredV1.schema === TRIAL_SIGNUP_SCHEMA, 'and it comes back as v2, so the next save upgrades it')
check(restoredV1.claimCode === minimal.claimCode, 'with its claim code intact')

// --- tamper: a stored email without consent is dropped on the way back in ---------
const tampered = restoreTrialSignup({ ...consented, contact: { email: 'ko@yangontyre.com' } })
check(tampered !== null, 'a record with a tampered contact still restores')
check(tampered.contact === null, 'BUT THE UNCONSENTED EMAIL IS DROPPED, not trusted back into the app')
check(restoreTrialSignup({ ...consented, schema: 'something.else' }) === null, 'a foreign schema is rejected')
check(restoreTrialSignup(null) === null && restoreTrialSignup('nope') === null, 'garbage restores to null')

// --- the claim code ---------------------------------------------------------------
const code = trialSignupClaimCode(ID)
check(code === trialSignupClaimCode(ID), 'the claim code is stable for the same trial')
check(/^SM-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code), `the claim code is readable down a phone line, got ${code}`)
check(!/[ILOU]/.test(code), `the claim code avoids letters misheard as digits, got ${code}`)
check(trialSignupClaimCode('a1b2c3d4-0000-0000-0000-000000000000') !== code, 'different trials get different codes')

// --- storage: fail closed, and prove the write ------------------------------------
function stubStorage({ onSet, readBack } = {}) {
  const map = new Map()
  return {
    getItem: (key) => (readBack ? readBack(key, map) : (map.has(key) ? map.get(key) : null)),
    setItem: (key, value) => { if (onSet) onSet(key, value); map.set(key, value) },
  }
}

const good = stubStorage()
const saved = writeTrialSignup(good, minimal)
check(saved.id === minimal.id, 'a healthy storage keeps the trial and hands it back')
check(good.getItem(TRIAL_SIGNUP_KEY) !== null, `the trial is written under ${TRIAL_SIGNUP_KEY}`)
check(readTrialSignup(good)?.claimCode === minimal.claimCode, 'and reads back with the same claim code')

// Three distinct ways storage lies, all of which end with the owner believing a trial exists.
throws(
  () => writeTrialSignup(stubStorage({ onSet: () => { throw new Error('QuotaExceededError') } }), minimal),
  'a full storage FAILS CLOSED rather than reporting a trial that was never saved',
)
throws(
  () => writeTrialSignup(stubStorage({ readBack: () => null }), minimal),
  'a private-mode storage that accepts writes and returns null FAILS CLOSED',
)
throws(
  () => writeTrialSignup(stubStorage({ readBack: () => JSON.stringify({ ...minimal, id: 'someone-elses' }) }), minimal),
  'a storage that hands back a DIFFERENT record fails closed instead of trusting it',
)
throws(() => writeTrialSignup(null, minimal), 'no storage at all fails closed')
check(readTrialSignup(null) === null, 'reading with no storage is null, not a crash')
check(readTrialSignup(stubStorage({ readBack: () => '{not json' })) === null, 'unparseable storage reads as no trial')

// --- both doors are always open ----------------------------------------------------
for (const managedReady of [true, false]) {
  const doors = trialSignupDoors({ managedReady })
  check(doors.length === 2, `both doors exist when managedReady=${managedReady}`)
  const managed = doors.find((door) => door.id === 'managed')
  check(Boolean(doors.find((door) => door.id === 'trial')), `the trial door exists when managedReady=${managedReady}`)
  check(
    managed.action === (managedReady ? 'sign-in' : 'request-activation'),
    `the managed door routes to ${managedReady ? 'sign-in' : 'an activation request'} when managedReady=${managedReady}`,
  )
  // Never tell an owner the door is broken. When managed auth is off the activation request is
  // answered by a person, which is a real route, not a degraded one.
  const words = `${managed.label} ${managed.detail}`.toLowerCase()
  for (const dead of ['not active', 'unavailable', 'coming soon', 'disabled', 'not configured']) {
    check(!words.includes(dead), `the managed door never reads as broken (managedReady=${managedReady}): "${dead}"`)
  }
  // Founder decision 2026-08-12: self-serve. The owner names themselves and sends the activation
  // request -- the door must not describe a service performed on them by hand.
  check(!words.includes('by hand'), `the managed door sells self-setup, not hand setup (managedReady=${managedReady})`)
}

// --- the contact handoff carries only what the receiving page reads -----------------
// tools/create_public_vercel_output.mjs parses the fragment against an allowlist -- `company`,
// `goal`, `claim` and a fixed set of proof_* names -- then strips it with history.replaceState.
// Anything else is silently discarded, so putting an email here would look sent and never arrive.
const url = new URL(trialSignupContactUrl(consented))
const fragmentKeys = [...new URLSearchParams(url.hash.slice(1)).keys()]
check(
  fragmentKeys.every((key) => key === 'company' || key === 'goal' || key === 'claim'),
  `the handoff fragment only uses keys the contact page actually reads, got ${fragmentKeys.join(', ')}`,
)
check(
  !trialSignupContactUrl(consented).includes('ko@yangontyre.com'),
  'THE EMAIL IS NEVER PUT IN THE URL -- the contact page would discard it, and it does not belong in a link',
)
const goal = new URLSearchParams(url.hash.slice(1)).get('goal')
check(goal.includes(consented.claimCode), 'the claim code travels in goal, which the contact page does read')
check(
  new URLSearchParams(url.hash.slice(1)).get('claim') === consented.claimCode,
  'the claim code also travels structured in claim, so the lead record carries it without parsing prose',
)
check(url.searchParams.get('product') === 'shop', 'the contact link names the product')

// --- the claim file is the durable copy ---------------------------------------------
const claim = JSON.parse(trialSignupClaimFile(consented))
check(claim.claimCode === consented.claimCode, 'the claim file carries the code')
check(claim.contactEmail === 'ko@yangontyre.com', 'and the email the owner consented to')
check(JSON.parse(trialSignupClaimFile(minimal)).contactEmail === null, 'and null when no email was given')
check(claim.termsAccepted === false, 'the claim file carries unaccepted terms as an explicit false')
check(JSON.parse(trialSignupClaimFile(agreed)).termsAccepted === true, 'and accepted terms as the literal true')

// --- every industry pack must be reachable from signup ----------------------------------
// Offering only trade templates silently excluded spa, gym and school -- the three packs with no
// trade -- so the owner of a spa picked "Standard starter catalog" and was handed a RETAIL shop.
// A spa pilot is a real client shape, and this is the same defect class as a bookable service
// with no catalog item: N options exist, only the demoed ones work.
const choices = signupBusinessChoices(shopBusinessTemplates, shopIndustryPacks)
const reachablePacks = new Set(choices.map((choice) => choice.industryPackId))
for (const pack of shopIndustryPacks) {
  check(
    reachablePacks.has(pack.id),
    `${pack.id}: no signup option leads to this industry pack, so that owner silently gets a different business`,
  )
}
for (const template of shopBusinessTemplates) {
  check(
    choices.some((choice) => choice.id === `trade:${template.id}`),
    `${template.id}: trade template is not offered at signup`,
  )
}
check(
  new Set(choices.map((choice) => choice.id)).size === choices.length,
  'signup offers no duplicate choices',
)
// A pack that already has trades must NOT also appear as its own option -- two doors to the same
// room is a choice an owner cannot make correctly.
for (const choice of choices.filter((candidate) => candidate.kind === 'pack')) {
  check(
    !shopBusinessTemplates.some((template) => template.industryPackId === choice.industryPackId),
    `${choice.id}: listed as a service pack although trades already reach that pack`,
  )
}

// --- no pricing, anywhere -------------------------------------------------------------
// A deliberate product decision: what a shop pays is agreed with the founder, not published.
const moduleSource = readFileSync('showroom/src/core/signup-trial.ts', 'utf8')
const pageSource = readFileSync('showroom/src/core/SignupPage.tsx', 'utf8')
for (const [name, source] of [['signup-trial.ts', moduleSource], ['SignupPage.tsx', pageSource]]) {
  const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  for (const word of ['per month', 'per year', 'subscription', 'billing', 'checkout', 'upgrade to']) {
    check(!body.includes(word), `${name} ships no pricing surface -- found "${word}"`)
  }
  // A bare $ is template-literal syntax in TS, so only a currency-shaped one counts.
  for (const [pattern, label] of [[/\$\s?\d/, 'a dollar amount'], [/\d[\d,_]*\s*MMK/i, 'an MMK amount'], [/\bprice[A-Z]?\w*\s*[:=]/, 'a price field']]) {
    check(!pattern.test(body), `${name} ships no pricing surface -- found ${label}`)
  }
}

// --- the wiring the page depends on ----------------------------------------------------
const appSource = readFileSync('showroom/src/App.tsx', 'utf8')
check(appSource.includes('<SignupPage /></Suspense>} path="signup"'), '/signup renders the trial page')
check(!appSource.includes('<Navigate replace to="/login" />} path="signup"'), 'and no longer dead-ends at /login')

const shellSource = readFileSync('showroom/src/core/CoreShell.tsx', 'utf8')
const loginSource = readFileSync('showroom/src/core/ManagedLoginPage.tsx', 'utf8')
check(shellSource.split('to={signupPath}').length - 1 === 2, 'desktop and mobile product pages preserve product intent in Free trial links')
check(loginSource.split('to={signupPath}').length - 1 === 2, 'both login-to-trial links preserve the requested product')

const coreCss = readFileSync('showroom/src/core/core-app.css', 'utf8')
check(coreCss.includes('.managed-login-panel input, .managed-login-panel select { width: 100%; min-width: 0;'), 'signup controls cannot overflow the mobile content width')
check(coreCss.includes('.managed-login-panel input, .managed-login-panel select { font-size: 1rem; }'), 'mobile signup inputs retain a zoom-safe font size')

const storageSource = readFileSync('showroom/src/core/local-workspace-storage.ts', 'utf8')
check(
  storageSource.includes(`'${TRIAL_SIGNUP_KEY}'`),
  `${TRIAL_SIGNUP_KEY} is a registered workspace key, so "Reset this device" erases the stored email`,
)

// The terms checkbox is wired into the form, above the submit button, in the same 12px
// signup-consent styling as the email consent row.
check(pageSource.includes('I accept the SuperMega trial terms'), 'the signup form offers the terms checkbox')
check(
  pageSource.split('className="signup-consent"').length - 1 === 2,
  'both consent-style rows share the signup-consent styling',
)
check(
  pageSource.indexOf('I accept the SuperMega trial terms') < pageSource.indexOf('Start my ${selectedProductChoice.label} trial'),
  'the terms checkbox sits above the submit button',
)
check(pageSource.includes("product: selectedProduct"), 'the saved trial records the product the owner selected')
check(pageSource.includes("selectedProduct === 'commerce' ? selectedProductChoice.workspacePath : selectedProductChoice.setupPath"), 'Shop keeps fast start while other products enter their own setup')

console.log(`signup trial contract: ${checks} checks passed`)
