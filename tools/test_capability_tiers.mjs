// Guard: the free tier can only ever grow.
//
// SuperMega runs on the owner's device. A shop that installs it today gets a till, an appointment
// book, stock, orders, a daily close and an accounting handoff with no account and no server. That
// is the product, not a trial of it, and the signup page says so.
//
// The failure this exists to prevent is quiet and commercially tempting: moving something that
// already works behind a tier when revenue is needed. Nobody would announce that; it would arrive
// as a one-word diff. FREE_FOREVER makes it a build failure instead of a decision someone can take
// alone at midnight.
//
// It also asserts there is no price anywhere in the tier model. Tiers describe capability; what a
// business pays is agreed with the founder, and publishing a number here would leak that decision
// into the product by accident.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export * from './capability-tiers.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/capability-tiers-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  FREE_FOREVER, capabilities, capability, capabilitiesForTier, capabilityTierOrder,
  currentCapabilityTier, isCapabilityAvailable, lockedCapabilityNotice,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// --- the promise ---------------------------------------------------------------------
for (const id of FREE_FOREVER) {
  const found = capabilities.find((candidate) => candidate.id === id)
  check(Boolean(found), `${id}: is listed as free forever but is not a capability at all`)
  check(
    found.tier === 'free',
    `${id}: WAS MOVED OUT OF THE FREE TIER. This already works on the owner's device with no account. Charging for it now breaks what signup promised, and no revenue is worth that.`,
  )
  check(isCapabilityAvailable(id, 'free'), `${id}: is reachable on the free tier`)
}

// The loop above only protects what is ALREADY named in FREE_FOREVER, so on its own it can be
// defeated by a two-line diff: delete the id from the list, then move the capability to a paid
// tier. Nothing would fail. The pins below name each locally-working area independently of the
// list, so removing one is itself the failure.
//
// This is not hypothetical for `shop-appointments`: it is the appointment book, which for a spa,
// a gym or a clinic IS the business, and the first pilot is a spa. Paywalling it would take the
// one record the pilot depends on away from the tier that promised it.
for (const area of [
  'shop-counter',
  'shop-inventory',
  'shop-orders',
  'shop-appointments',
  'shop-daily-close',
  'shop-accounting-handoff',
  'plant-production',
  'website-builder',
  'ecommerce-storefront',
  'local-backup',
  'device-reset',
]) {
  check(FREE_FOREVER.includes(area), `${area}: must be named in FREE_FOREVER, not merely marked free today`)
}

// And the inverse, which closes the remaining gap: a NEW capability that works on the owner's
// device can be marked `tier: 'free'` today and quietly moved to a paid tier tomorrow, because
// nothing would have pinned it. Anything free must be free by contract, not by accident.
for (const found of capabilities) {
  if (found.tier !== 'free') continue
  check(
    FREE_FOREVER.includes(found.id),
    `${found.id}: is marked free but is not named in FREE_FOREVER. Add it there, so the promise is checked rather than assumed. If it genuinely should not be free forever, it should not ship as free.`,
  )
}

// --- the model holds together -----------------------------------------------------------
check(capabilities.length > 0, 'capabilities exist')
check(
  new Set(capabilities.map((candidate) => candidate.id)).size === capabilities.length,
  'no capability id is declared twice',
)
for (const found of capabilities) {
  check(capabilityTierOrder.includes(found.tier), `${found.id}: sits in a known tier, got ${found.tier}`)
  check(found.label.trim().length > 0, `${found.id}: has a label`)
  // An owner meeting a locked feature is owed both what it does and why it is not theirs yet.
  check(found.outcome.trim().length > 12, `${found.id}: says what the owner actually gets`)
  check(found.reason.trim().length > 12, `${found.id}: says WHY it sits at this tier`)
}

// --- tiers are cumulative, not separate menus ---------------------------------------------
const free = capabilitiesForTier('free')
const premium = capabilitiesForTier('premium')
const enterprise = capabilitiesForTier('enterprise')
check(free.length < premium.length, 'premium includes more than free')
check(premium.length < enterprise.length, 'enterprise includes more than premium')
for (const found of free) {
  check(
    premium.some((candidate) => candidate.id === found.id) && enterprise.some((candidate) => candidate.id === found.id),
    `${found.id}: paying more must never REMOVE something. Tiers add.`,
  )
}
check(free.every((found) => found.tier === 'free'), 'the free tier contains only free capabilities')

// --- entitlement is conservative ------------------------------------------------------------
check(currentCapabilityTier({}) === 'free', 'no account means free')
check(currentCapabilityTier({ premiumUnlocked: true }) === 'premium', 'premium is reachable')
check(currentCapabilityTier({ managedIdentity: { email: 'a@b.co' } }) === 'enterprise', 'a managed identity means enterprise')
check(
  currentCapabilityTier({ managedIdentity: { email: 'a@b.co' }, premiumUnlocked: false }) === 'enterprise',
  'a managed identity is not downgraded by a missing premium flag',
)
check(!isCapabilityAvailable('ai-order-intake', 'free'), 'a premium capability is not free')
check(isCapabilityAvailable('ai-order-intake', 'premium'), 'and is reachable when premium')
check(isCapabilityAvailable('shop-counter', 'free'), 'the till is always reachable')

// --- a locked capability explains itself ------------------------------------------------------
const notice = lockedCapabilityNotice('ai-order-intake')
check(notice.outcome.length > 12 && notice.reason.length > 12, 'a locked capability still says what it does and why')
for (const word of ['upgrade', 'trial ends', 'expires', 'only', 'unlock now']) {
  check(
    !`${notice.action} ${notice.outcome} ${notice.reason}`.toLowerCase().includes(word),
    `a locked capability does not pressure the owner -- found "${word}"`,
  )
}

// --- no prices, anywhere ------------------------------------------------------------------------
const source = readFileSync('showroom/src/core/capability-tiers.ts', 'utf8')
const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
for (const [pattern, label] of [
  [/\$\s?\d/, 'a dollar amount'],
  [/\d[\d,_]*\s*MMK/i, 'an MMK amount'],
  [/\bper (month|year|seat|user)\b/i, 'a billing period'],
  [/\bprice\w*\s*[:=]/i, 'a price field'],
]) {
  check(!pattern.test(body), `the tier model publishes no pricing -- found ${label}`)
}

console.log(`capability tier contract: ${checks} checks passed`)
