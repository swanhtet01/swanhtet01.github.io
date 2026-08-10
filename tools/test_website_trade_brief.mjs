// Composition guard: the trade a shop declared must produce a website brief the starter accepts.
//
// This is the same seam shape as the channel-to-order guard, one product further along:
// Shop onboarding knows the trade, the website starter validates briefs, and the two have
// independent notions of what a valid brief is. If they drift -- a bound tightened here, a
// layout id renamed there -- an owner picks their trade, the draft appears, they press
// continue, and nothing happens. No error would be thrown. The brief would simply be refused
// by applyWebsiteStarterBrief and the screen would sit there.
//
// So this asserts the draft for EVERY trade passes websiteStarterBriefIssues with zero
// issues, and then actually applies one to prove the agreement is real rather than
// coincidental agreement between two validators.
//
// The other half is that the generator must not launder its caller's input: a business name
// that is too long has to stay too long. A generator that repaired bad operator input would
// turn a visible validation error into a silently wrong website.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export {
        websiteTradeBrief, websiteTradeBriefTradeIds, websiteTradeBriefOptions,
      } from '../products/website/website-trade-brief.ts'
      export {
        websiteStarterBriefIssues, websiteStarterTemplates, applyWebsiteStarterBrief,
        isUntouchedWebsiteStarter,
      } from '../products/website/website-starter.ts'
      export { createInitialWorkspace, workspaceFingerprint } from '../products/website/website-model.ts'
      export { shopBusinessTemplates } from '../products/shop/business-templates.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/trade-brief-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  websiteTradeBrief, websiteTradeBriefTradeIds, websiteTradeBriefOptions,
  websiteStarterBriefIssues, websiteStarterTemplates, applyWebsiteStarterBrief,
  isUntouchedWebsiteStarter, createInitialWorkspace, workspaceFingerprint,
  shopBusinessTemplates,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const NAME = 'Yangon Tyre & Auto'
const CONTACT = 'https://example.com/contact'

// --- every trade Shop can declare is covered ----------------------------------
// If Shop gains a trade template and nobody adds copy for it, that owner falls back to the
// blank boxes this whole file exists to remove. Driving the list from shopBusinessTemplates
// rather than from a hardcoded list is what makes that a failure instead of a silence.
const shopTradeIds = shopBusinessTemplates.map((template) => template.id).sort()
check(shopTradeIds.length >= 7, `Shop declares at least the seven known trades, got ${shopTradeIds.length}`)
assert.deepEqual(
  websiteTradeBriefTradeIds(), shopTradeIds,
  'every Shop trade template has website copy, and no copy exists for a trade Shop does not offer',
)
checks += 1

// --- the picker labels must be the names Shop uses ----------------------------
// website-trade-brief.ts holds its own copy of the seven trade labels so the website bundle
// does not pull in the whole Shop catalog. That duplication is only safe while something
// checks it, which is this: an owner must not choose "Tea & coffee shop" in Shop and find it
// called something else on the website screen.
const options = websiteTradeBriefOptions()
const shopNameById = new Map(shopBusinessTemplates.map((template) => [template.id, template.name.en]))
check(options.length === shopTradeIds.length, `every trade is offered in the picker, got ${options.length}`)
for (const option of options) {
  check(
    option.label === shopNameById.get(option.id),
    `${option.id}: the picker label matches the name Shop uses -- "${option.label}" vs "${shopNameById.get(option.id)}"`,
  )
}
assert.deepEqual(
  options.map((option) => option.id), shopBusinessTemplates.map((template) => template.id),
  'and the picker lists them in the same order Shop does, so the two screens read alike',
)
checks += 1

// --- the seam itself ----------------------------------------------------------
const layoutsUsed = new Set()
const seenCopy = new Map()

for (const tradeId of shopTradeIds) {
  const brief = websiteTradeBrief({ tradeId, businessName: NAME, contactHref: CONTACT })
  check(brief !== null, `${tradeId}: a brief is drafted`)

  const issues = websiteStarterBriefIssues(brief)
  check(
    issues.length === 0,
    `THE SEAM HOLDS for ${tradeId}: the drafted brief has zero validation issues, got ${JSON.stringify(issues)}`,
  )

  check(
    websiteStarterTemplates.some((template) => template.id === brief.templateId),
    `${tradeId}: names a layout the starter actually offers`,
  )
  layoutsUsed.add(brief.templateId)

  check(brief.businessName === NAME, `${tradeId}: the owner's business name is carried, not replaced`)

  // Copy duplicated across trades is the authoring mistake this catches: paste one trade's
  // block, forget to rewrite it, and two different businesses publish the same sentence.
  for (const field of ['audience', 'offer', 'proof']) {
    const key = `${field}::${brief[field]}`
    check(
      !seenCopy.has(key),
      `${tradeId}: its ${field} is not a copy of ${seenCopy.get(key)}'s -- each trade reads as its own business`,
    )
    seenCopy.set(key, tradeId)
  }

  // The draft is meant to be edited, so it must not contain placeholder scaffolding that an
  // owner could publish without noticing.
  const allCopy = `${brief.audience} ${brief.offer} ${brief.proof}`
  check(
    !/REPLACE|TODO|Lorem|\{\{|XXX/i.test(allCopy),
    `${tradeId}: the draft carries no placeholder text an owner could publish by accident`,
  )
}

check(
  layoutsUsed.size === websiteStarterTemplates.length,
  `every website layout is reachable from some trade -- ${layoutsUsed.size} of ${websiteStarterTemplates.length} used, so none is dead`,
)

// --- the draft is actually usable, not merely valid ---------------------------
// Two validators agreeing proves less than one workspace accepting. applyWebsiteStarterBrief
// refuses silently (it returns the workspace unchanged), so this compares fingerprints.
const starter = createInitialWorkspace()
check(isUntouchedWebsiteStarter(starter), 'a fresh workspace is an untouched starter')

const pharmacyBrief = websiteTradeBrief({ tradeId: 'pharmacy', businessName: NAME, contactHref: CONTACT })
const applied = applyWebsiteStarterBrief(starter, pharmacyBrief, '2026-07-25T08:00:00.000Z')
check(
  workspaceFingerprint(applied) !== workspaceFingerprint(starter),
  'THE DRAFT APPLIES: the workspace changes, so the brief was accepted rather than silently refused',
)
check(!isUntouchedWebsiteStarter(applied), 'and the workspace is no longer an untouched starter')
check(
  JSON.stringify(applied).includes(NAME),
  'the applied site is about the owner\'s business by name',
)

// --- the generator does not repair its caller's input -------------------------
// The failure this prevents: an over-long name silently truncated into something valid, so
// the owner never sees the error and the site ships with a clipped business name.
const LONG_NAME = 'A'.repeat(200)
const longBrief = websiteTradeBrief({ tradeId: 'pharmacy', businessName: LONG_NAME, contactHref: CONTACT })
check(longBrief.businessName === LONG_NAME, 'an over-long business name is passed through untouched, not truncated')
check(
  websiteStarterBriefIssues(longBrief).some((issue) => issue.field === 'businessName'),
  'and is still reported as invalid -- the draft cannot launder bad operator input',
)
check(
  workspaceFingerprint(applyWebsiteStarterBrief(starter, longBrief, '2026-07-25T08:00:00.000Z'))
    === workspaceFingerprint(starter),
  'so applying it changes nothing -- the invalid name stops at the workspace boundary',
)

const badLinkBrief = websiteTradeBrief({ tradeId: 'hardware', businessName: NAME, contactHref: 'http://example.com' })
check(badLinkBrief.contactHref === 'http://example.com', 'an insecure contact link is passed through untouched')
check(
  websiteStarterBriefIssues(badLinkBrief).some((issue) => issue.field === 'contactHref'),
  'and is reported -- the draft does not upgrade http:// to https:// on the owner\'s behalf',
)

// Omitting the contact link is legitimate: the starter treats blank as "not supplied yet".
const noLinkBrief = websiteTradeBrief({ tradeId: 'hardware', businessName: NAME })
check(noLinkBrief.contactHref === '', 'omitting the contact link yields a blank rather than undefined')
check(
  websiteStarterBriefIssues(noLinkBrief).length === 0,
  'and a brief with no contact link yet is still valid -- an owner can start before they have one',
)

// --- unknown trades ------------------------------------------------------------
check(websiteTradeBrief({ tradeId: 'not-a-trade', businessName: NAME }) === null, 'an unknown trade drafts nothing')
for (const inherited of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
  check(
    websiteTradeBrief({ tradeId: inherited, businessName: NAME }) === null,
    `the inherited property "${inherited}" is not mistaken for a trade`,
  )
}

// --- the same request drafts the same brief -----------------------------------
// A draft that varied between renders would show the owner one thing and save another.
assert.deepEqual(
  websiteTradeBrief({ tradeId: 'fashion', businessName: NAME, contactHref: CONTACT }),
  websiteTradeBrief({ tradeId: 'fashion', businessName: NAME, contactHref: CONTACT }),
  'drafting is pure -- the same trade and business name give the same brief every time',
)
checks += 1

console.log(`website trade brief contract: ${checks} checks passed`)
