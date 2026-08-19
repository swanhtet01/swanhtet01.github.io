// Contract guard for the Website export — the one file a customer actually publishes.
//
// showroom/ has no test runner, so this follows the tools/test_demo_playbooks.mjs
// convention instead: plain node:assert, wired into `npm run app:verify`. esbuild
// (already a vite dependency) bundles the TypeScript so the real modules are
// exercised rather than a reimplementation of them.
//
// What is pinned here is what breaks silently and reaches an end user:
//   - the document language, which tells a screen reader which voice to use
//   - HTML escaping of customer-supplied text, which is an XSS sink in a file
//     the customer then hosts under their own domain
//   - the export validator, which is the only thing standing between a malformed
//     workspace and a broken download
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// esbuild is a showroom dependency, not a root one, so it is resolved from there
// rather than added to the root manifest just to run this guard.
const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const entry = 'showroom/src/products/website/export-test-entry.ts'

const bundle = await build({
  stdin: {
    contents: `
      export { createInitialWorkspace, createWebsiteArtifact } from './website-model.ts'
      export { buildWebsiteHtml, validateWebsiteArtifactForExport } from './website-export.ts'
    `,
    resolveDir: 'showroom/src/products/website',
    sourcefile: entry,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const source = Buffer.from(bundle.outputFiles[0].contents).toString('base64')
const { createInitialWorkspace, createWebsiteArtifact, buildWebsiteHtml, validateWebsiteArtifactForExport } =
  await import(`data:text/javascript;base64,${source}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const BURMESE = 'ရွှေရတနာစတိုးဆိုင်ရန်ကုန်မြို့နေ့စဉ်ကုန်စုံပစ္စည်းများအရောင်းအဝယ်'

// Rewrites every human-readable string to Burmese while leaving structural strings
// (ids, slugs, hrefs, anchors, schema tags, timestamps) alone — a shop translates its
// copy, not its routes, and translating routes would produce an artifact the exporter
// rightly refuses, which would make the language assertion meaningless.
function burmesify(value) {
  if (typeof value === 'string') {
    if (/^[/#]/.test(value)) return value
    if (/^https?:/i.test(value)) return value
    if (/^[a-z0-9._-]+$/i.test(value) || /^\d{4}-\d{2}/.test(value)) return value
    return BURMESE
  }
  if (Array.isArray(value)) return value.map(burmesify)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, burmesify(nested)]))
  }
  return value
}

const documentLanguage = (html) => (/<html lang="([a-z-]+)"/.exec(html) ?? [])[1]

const englishArtifact = createWebsiteArtifact(createInitialWorkspace())

// --- document language -------------------------------------------------------
// The rule is proportional, not presence-based. A presence-based rule flipped the
// whole document to Burmese on a single Myanmar codepoint, so an English page with
// one Burmese word in the shop name was announced to a screen reader as Burmese and
// every English word in it was pronounced with a Burmese voice (WCAG 3.1.1).
check(documentLanguage(buildWebsiteHtml(englishArtifact)) === 'en', 'an English site exports as lang="en"')

check(
  documentLanguage(buildWebsiteHtml(burmesify(englishArtifact))) === 'my',
  'a site whose copy is written in Burmese exports as lang="my"',
)

const mostlyEnglish = { ...englishArtifact, siteName: `Yangon Tyre ${BURMESE.slice(0, 6)}` }
check(
  documentLanguage(buildWebsiteHtml(mostlyEnglish)) === 'en',
  'a handful of Burmese characters in an otherwise English site does not flip the document language',
)

// Style and script CONTENTS survive a naive tag strip and are pure Latin. On one
// measured export 3,003 of 3,768 "Latin letters" were CSS, which is enough to
// outvote a genuinely Burmese page, so the counter must not see them.
const burmeseHtml = buildWebsiteHtml(burmesify(englishArtifact))
check(
  /<style/i.test(burmeseHtml),
  'the export still ships a stylesheet, so the language counter must keep excluding stylesheet text',
)

// --- escaping ----------------------------------------------------------------
// The exported file is hosted under the customer's own domain, so unescaped
// customer text is stored XSS on their site, not ours.
const injected = {
  ...englishArtifact,
  siteName: '</title><script>alert(1)</script>',
}
const injectedHtml = buildWebsiteHtml(injected)
check(!injectedHtml.includes('<script>alert(1)</script>'), 'a script tag in the site name is escaped, not emitted')
check(injectedHtml.includes('&lt;script&gt;'), 'the escaped form is what reaches the file')

// --- validator ---------------------------------------------------------------
// buildWebsiteHtml refuses rather than emitting a broken download.
const brokenArtifact = { ...englishArtifact, pages: [] }
check(validateWebsiteArtifactForExport(brokenArtifact).length > 0, 'an artifact with no pages is reported as unexportable')
assert.throws(
  () => buildWebsiteHtml(brokenArtifact),
  /not exportable/,
  'an unexportable artifact must throw rather than produce a broken file',
)
checks += 1

check(validateWebsiteArtifactForExport(englishArtifact).length === 0, 'the seeded workspace exports cleanly')

// --- an artifact with colliding flattened anchors is rejected, not coalesced -
// createPageTargets (below) de-duplicates colliding flattened anchors with a
// numeric suffix so the exported HTML still renders. That is the right call for
// a page that is already in the artifact, but it means the artifact validator
// must refuse a workspace whose distinct ready slugs would collide in the first
// place -- otherwise a raw '#checkout-info' CTA silently resolves to whichever
// of the two colliding pages export happened to process first.
const baseWorkspace = createInitialWorkspace()
const collidingAnchorWorkspace = {
  ...baseWorkspace,
  pages: [
    baseWorkspace.pages[0],
    { ...baseWorkspace.pages[1], slug: '/checkout-info' },
    { ...baseWorkspace.pages[2], slug: '/checkout/info' },
  ],
}
assert.throws(
  () => createWebsiteArtifact(collidingAnchorWorkspace),
  /could not be retained safely/,
  'two ready pages whose slugs flatten to the same anchor are rejected, not silently coalesced',
)
checks += 1

console.log(`website export contract: ${checks} checks passed`)
