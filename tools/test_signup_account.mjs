// Guard: the create-account groundwork keeps its promises before any of it is reachable.
//
// PR-1 of hq/strategy/SELF-SERVE-IDENTITY-DESIGN.md ships pure client groundwork for self-serve
// identity creation, and it must be DEAD CODE: no auth surface, no supabase.auth.signUp (PR-2),
// nothing reachable from any rendered route. Signup itself stays dark behind the founder-held
// SUPERMEGA_SELF_SERVE_SIGNUP_WINDOW runtime flag and the provider-side signup toggle, so the
// dangerous property to guard here is not what this code does -- it is what it must NOT do yet.
//
// This asserts, in order:
//   1. validation mirrors the managed auth surface exactly (email shape, 12..128 password floor)
//   2. terms acceptance is the literal `true` only -- refused, never coerced, mirroring the
//      trial's consent pattern
//   3. the panel machine has no path to `verified` that skips `sent`
//   4. the sent copy is enumeration-safe: "already registered" is indistinguishable from success
//   5. the module is pure AND unreferenced -- no fetch, no supabase, no window, and no import
//      from any other showroom source (PR-2 deletes the unreferenced check when it wires the panel)
//   6. the third signup door exists only behind the default-off parameter, and both existing
//      doors are byte-identical with it open or closed -- the founder-conversation door never
//      disappears
//
// Nothing here renders React on purpose: no guard in this repo can, which is exactly why the
// decidable logic lives in signup-account.ts and the PR-2 panel stays a thin shell over it.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export * from './signup-account.ts'
      export { trialSignupDoors } from './signup-trial.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/signup-account-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  CREATE_ACCOUNT_PANEL_COPY,
  createAccountPanelTransition,
  validateCreateAccountRequest,
  trialSignupDoors,
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

const PASSWORD = 'correct-horse-battery'
const base = { email: 'ko@yangontyre.com', password: PASSWORD, confirmation: PASSWORD, termsAccepted: true }

// --- validation mirrors the managed auth surface ------------------------------------
const request = validateCreateAccountRequest(base)
check(request.email === 'ko@yangontyre.com', 'a valid request keeps its email')
check(request.password === PASSWORD, 'and its password')
check(request.termsAccepted === true, 'and records terms as the literal true')
check(
  validateCreateAccountRequest({ ...base, email: '  Ko@YangonTyre.COM ' }).email === 'ko@yangontyre.com',
  'the email is normalized exactly as managed sign-in normalizes it -- trimmed and lowercased',
)
check(
  Object.keys(request).sort().join(',') === 'email,password,termsAccepted',
  'THE REQUEST CARRIES EXACTLY EMAIL, PASSWORD AND TERMS -- no claim code (identity first, claim at '
  + 'activation, design default for open question 4) and never the confirmation duplicate',
)

throws(() => validateCreateAccountRequest({ ...base, email: '' }), 'a missing email is refused')
throws(() => validateCreateAccountRequest({ ...base, email: 'not-an-email' }), 'a non-address is refused')
throws(() => validateCreateAccountRequest({ ...base, email: 'two words@shop.com' }), 'whitespace inside an address is refused')
throws(() => validateCreateAccountRequest({ ...base, email: 'ko@yangontyre' }), 'a domain without a dot is refused')
throws(
  () => validateCreateAccountRequest({ ...base, email: `${'k'.repeat(170)}@yangontyre.com` }),
  'an address over the 160-character auth bound is refused',
)

// The 12..128 floor is completeManagedAccountPassword's, verbatim: the password chosen at signup
// must satisfy exactly what account setup and recovery already enforce.
throws(() => validateCreateAccountRequest({ ...base, password: 'eleven-char', confirmation: 'eleven-char' }), 'eleven characters are refused')
const twelve = 'exactly-12ch'
check(
  validateCreateAccountRequest({ ...base, password: twelve, confirmation: twelve }).password === twelve,
  'twelve characters pass, the exact managed floor',
)
const long = 'p'.repeat(129)
throws(() => validateCreateAccountRequest({ ...base, password: long, confirmation: long }), '129 characters are refused, the exact managed ceiling')
const blank = ' '.repeat(16)
throws(() => validateCreateAccountRequest({ ...base, password: blank, confirmation: blank }), 'sixteen spaces are refused -- length alone is not a password')
throws(() => validateCreateAccountRequest({ ...base, confirmation: `${PASSWORD}x` }), 'A MISMATCHED CONFIRMATION IS REFUSED, never silently reconciled')
throws(() => validateCreateAccountRequest({ ...base, confirmation: undefined }), 'a missing confirmation is refused too')

// --- terms: the literal true, and nothing looser ------------------------------------
throws(() => validateCreateAccountRequest({ ...base, termsAccepted: undefined }), 'AN ACCOUNT REQUEST WITHOUT ACCEPTED TERMS DOES NOT VALIDATE')
throws(() => validateCreateAccountRequest({ ...base, termsAccepted: false }), 'an explicit false does not validate either')
throws(() => validateCreateAccountRequest({ ...base, termsAccepted: 'yes' }), 'a truthy stand-in is refused at validate -- acceptance is the literal true, never a coerced string')
throws(() => validateCreateAccountRequest({ ...base, termsAccepted: 1 }), 'a numeric stand-in is refused too')

// Acceptance must be RECORDED, never INHERITED. A bare `input.termsAccepted` read walks the
// prototype chain, so one polluted `Object.prototype.termsAccepted = true` anywhere in the bundle
// would turn every unticked box into a consent record for a human who never gave one.
const unticked = { email: base.email, password: PASSWORD, confirmation: PASSWORD }
throws(() => validateCreateAccountRequest(unticked), 'an unticked box is refused on a clean prototype')
Object.defineProperty(Object.prototype, 'termsAccepted', { value: true, configurable: true })
try {
  throws(
    () => validateCreateAccountRequest(unticked),
    'A POLLUTED Object.prototype.termsAccepted CANNOT FORGE AN ACCEPTANCE -- consent is an own '
    + 'property or it is not consent',
  )
} finally {
  delete Object.prototype.termsAccepted
}
check(Object.prototype.termsAccepted === undefined, 'the guard leaves Object.prototype as it found it')
throws(
  () => validateCreateAccountRequest(Object.assign(Object.create({ termsAccepted: true }), unticked)),
  'terms inherited from a caller-supplied prototype are refused too',
)

// --- the panel machine: no path to verified that skips sent --------------------------
check(createAccountPanelTransition('idle', 'confirmation-sent') === 'sent', 'submitting moves idle to sent')
check(createAccountPanelTransition('sent', 'resend') === 'sent', 'resending stays on the sent screen')
check(createAccountPanelTransition('sent', 'start-over') === 'idle', 'trying another email returns to idle')
check(createAccountPanelTransition('sent', 'email-verified') === 'verified', 'the confirmation link is the only way to verified')
throws(() => createAccountPanelTransition('idle', 'email-verified'), 'VERIFIED IS UNREACHABLE FROM IDLE -- verification only arrives through the emailed link')
throws(() => createAccountPanelTransition('idle', 'resend'), 'nothing to resend before anything was sent')
throws(() => createAccountPanelTransition('idle', 'start-over'), 'nothing to start over from idle')
throws(() => createAccountPanelTransition('sent', 'confirmation-sent'), 'a second submit from sent is refused -- resend is the named move')
throws(() => createAccountPanelTransition('verified', 'resend'), 'verified is terminal: no resend')
throws(() => createAccountPanelTransition('verified', 'confirmation-sent'), 'verified is terminal: no re-submit')
throws(() => createAccountPanelTransition('verified', 'email-verified'), 'verified is terminal: no re-verify')
throws(() => createAccountPanelTransition('nonsense', 'resend'), 'an unknown state is refused, not absorbed')

// The transition table is consulted with OWN-PROPERTY lookups at both levels. A bare
// `PANEL_TRANSITIONS[state]?.[event]` reads through Object.prototype, so an inherited builtin --
// 'constructor', 'toString', anything a polluted prototype carries -- resolves to a truthy value
// and is therefore an ACCEPTED move. Both slots are checked because each is separately exposed.
for (const state of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf']) {
  for (const event of ['name', 'call', 'constructor', 'resend']) {
    throws(
      () => createAccountPanelTransition(state, event),
      `AN INHERITED STATE IS NOT A STATE -- "${state}" + "${event}" must be refused, not read off Object.prototype`,
    )
  }
}
for (const event of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf']) {
  for (const state of ['idle', 'sent', 'verified']) {
    throws(
      () => createAccountPanelTransition(state, event),
      `AN INHERITED EVENT IS NOT AN EVENT -- "${state}" + "${event}" must be refused, not read off Object.prototype`,
    )
  }
}

// The invariant this machine exists to hold must not depend on Object.prototype being clean:
// with `email-verified` inherited, a bare lookup walks idle straight to verified without a
// confirmation link ever having been opened.
Object.defineProperty(Object.prototype, 'email-verified', { value: 'verified', configurable: true })
try {
  throws(
    () => createAccountPanelTransition('idle', 'email-verified'),
    'A POLLUTED PROTOTYPE CANNOT VERIFY AN EMAIL -- idle still refuses email-verified when the '
    + 'move is inherited rather than declared',
  )
  check(createAccountPanelTransition('sent', 'email-verified') === 'verified', 'and the declared move still works with the prototype polluted')
} finally {
  delete Object.prototype['email-verified']
}
check(Object.prototype['email-verified'] === undefined, 'the guard leaves Object.prototype as it found it')

// --- copy: enumeration-safe, floor-accurate, and no terms URL yet ---------------------
check(
  CREATE_ACCOUNT_PANEL_COPY.sentDetail.includes('If this address is new'),
  'THE SENT COPY IS ENUMERATION-SAFE -- "already registered" reads exactly like success',
)
check(
  CREATE_ACCOUNT_PANEL_COPY.passwordHint.includes('at least 12 characters'),
  'the password hint states the real floor',
)
check(CREATE_ACCOUNT_PANEL_COPY.termsLabel.includes('terms'), 'the terms checkbox names the terms')
for (const [key, value] of Object.entries(CREATE_ACCOUNT_PANEL_COPY)) {
  for (const oracle of ['already registered', 'already exists', 'already has an account', 'already in use']) {
    check(!value.toLowerCase().includes(oracle), `${key}: copy never separates registered from new addresses ("${oracle}")`)
  }
  for (const dead of ['not active', 'unavailable', 'coming soon', 'disabled', 'not configured']) {
    check(!value.toLowerCase().includes(dead), `${key}: no copy for a closed state exists -- the panel simply does not render ("${dead}")`)
  }
}

// --- the module is pure, dark, and priced at nothing ----------------------------------
const moduleSource = readFileSync('showroom/src/core/signup-account.ts', 'utf8')
const body = moduleSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
for (const marker of ['fetch(', 'XMLHttpRequest', 'WebSocket(', 'EventSource(', 'supabase', 'Supabase', 'window.', 'document.', 'import.meta', 'localStorage', 'navigator.']) {
  check(!body.includes(marker), `signup-account.ts is pure -- found "${marker}"`)
}
check(!/^\s*import\s/m.test(body), 'signup-account.ts imports NOTHING -- it can be bundled alone by this guard forever')
check(!body.includes('http'), 'no URL of any kind ships yet -- the terms artifact is an open founder question (design default for question 7)')
for (const word of ['per month', 'per year', 'subscription', 'billing', 'checkout', 'upgrade to']) {
  check(!body.includes(word), `signup-account.ts ships no pricing surface -- found "${word}"`)
}
for (const [pattern, label] of [[/\$\s?\d/, 'a dollar amount'], [/\d[\d,_]*\s*MMK/i, 'an MMK amount'], [/\bprice[A-Z]?\w*\s*[:=]/, 'a price field']]) {
  check(!pattern.test(body), `signup-account.ts ships no pricing surface -- found ${label}`)
}

// DEAD CODE until PR-2: no file under showroom/src may import this module. PR-2 wires the panel
// and DELETES this check in the same commit it adds the import.
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}
const importers = sourceFiles('showroom/src').filter((path) =>
  !path.endsWith('signup-account.ts') && readFileSync(path, 'utf8').includes('signup-account'))
check(
  importers.length === 0,
  `NOTHING IN showroom/src REFERENCES signup-account YET -- PR-1 is dead code by design, found: ${importers.join(', ')}`,
)

// --- the third door exists only behind the default-off parameter ----------------------
for (const managedReady of [true, false]) {
  const closed = trialSignupDoors({ managedReady })
  const closedExplicit = trialSignupDoors({ managedReady, signupOpen: false })
  const open = trialSignupDoors({ managedReady, signupOpen: true })
  check(
    JSON.stringify(closed) === JSON.stringify(closedExplicit),
    `omitting signupOpen means closed (managedReady=${managedReady})`,
  )
  check(closed.length === 2, `THE DEFAULT IS TODAY'S TWO DOORS, UNCHANGED (managedReady=${managedReady})`)
  check(
    !closed.some((door) => door.action === 'create-account'),
    `no create-account door leaks while the window is closed (managedReady=${managedReady})`,
  )
  check(open.length === 3, `the open window adds exactly one door (managedReady=${managedReady})`)
  check(
    JSON.stringify(open.slice(0, 2)) === JSON.stringify(closed),
    `BOTH EXISTING DOORS ARE BYTE-IDENTICAL OPEN OR CLOSED -- the founder-conversation door never disappears (managedReady=${managedReady})`,
  )
  const created = open[2]
  check(created.id === 'create-account' && created.action === 'create-account', `the third door is the create-account door (managedReady=${managedReady})`)
  check(created.label === 'Create your company account', 'the door carries the label the design specifies')
  const words = `${created.label} ${created.detail}`.toLowerCase()
  for (const dead of ['not active', 'unavailable', 'coming soon', 'disabled', 'not configured']) {
    check(!words.includes(dead), `the create-account door never reads as broken (managedReady=${managedReady}): "${dead}"`)
  }
  for (const word of ['per month', 'per year', 'subscription', 'billing', 'checkout', 'upgrade to', 'mmk', '$']) {
    check(!words.includes(word), `the create-account door ships no pricing surface (managedReady=${managedReady}): "${word}"`)
  }
}

console.log(`signup account groundwork contract: ${checks} checks passed`)
