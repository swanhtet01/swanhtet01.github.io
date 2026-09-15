import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createReviewAccessBoundary } from '../showroom/src/products/website/customer-review-access.ts'
import { customerWebsiteReviewLoginPath } from '../showroom/src/core/account-routes.ts'

// Use the installed React renderer and TypeScript compiler; no browser, auth,
// network, private workspace, or new dependency is involved in this test.
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../showroom/src/products/website/WebsiteCustomerReview.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, { exports: module.exports, require: name => {
  if (name.endsWith('.css')) return {}
  if (name === './customer-review-access') return { createReviewAccessBoundary }
  if (name === '../../core/account-routes') return { customerWebsiteReviewLoginPath }
  if (name === '../../core/managed-trial' || name === './customer-review-contract') return new Proxy({}, { get: () => { throw new Error('Pure preview must not access auth or transport') } })
  return require(name)
} })
const { PreparedWebsitePage } = module.exports
const page = (id, headline = id) => ({ id, slug: '/', navigation: { label: id, visible: true }, seo: { title: id, description: '' },
  hero: { eyebrow: '', headline, summary: 'Prepared content', ctaLabel: 'Contact', ctaHref: 'javascript:alert(1)' },
  sections: [{ id: 'section', eyebrow: '', title: 'Our work', body: 'ဆိုင် <script>alert(1)</script>' }] })
const render = (pages, pageId = pages[0].id) => renderToStaticMarkup(React.createElement(PreparedWebsitePage, {
  review: { preview: { siteName: 'Example studio', pages } }, pageId, onPageChange: () => { throw new Error('Render must not perform actions') },
}))

test('customer preview renders escaped public content with no active links or builder', () => {
  const html = render([page('Home', '<img src=x onerror=alert(1)>')])
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(html.includes('ဆိုင် &lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('aria-disabled="true"'))
  assert.ok(html.includes('links and publishing are disabled'))
  assert.doesNotMatch(html, /<script|<img|href=|javascript:|<input|<form|<textarea/)
})
test('page selection renders exactly one page and exposes accessible navigation', () => {
  const html = render([page('Home', 'Home headline'), page('Services', 'Services headline')], 'Services')
  assert.ok(html.includes('Services headline'))
  assert.ok(!html.includes('Home headline'))
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1)
  assert.equal((html.match(/type="button"/g) ?? []).length, 2)
  assert.ok(render([page('Home')], 'unknown').includes('aria-current="page"'))
})
test('route and lifecycle safety source pins remain explicit (not browser proof)', () => {
  const routes = readFileSync(new URL('../showroom/src/App.tsx', import.meta.url), 'utf8')
  assert.ok(routes.includes('website/review/:reviewId'))
  for (const pin of ['key={reviewId}', 'verifyCustomerWebsiteReview', 'verifyCustomerChangeAcknowledgement',
    'pending.current ??', '!access.isCurrent(epoch)', 'readOnly={unconfirmed}',
    "window.removeEventListener('storage', refresh)", "window.removeEventListener('focus', refresh)",
    'Date.parse(review.expiresAt) <= Date.now()', 'sameManagedIdentity(request.identity, actor)']) assert.ok(source.includes(pin), pin)
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|localStorage\.setItem|sessionStorage\.setItem/)
  assert.ok(source.includes('const refresh = () => { access.invalidate(); setReview(null); setActor(null)'))
})

const expiry = '2026-09-17T00:00:00Z'
const now = () => Date.parse('2026-09-16T00:00:00Z')
const same = (a, b) => a.userId === b.userId && a.workspaceId === b.workspaceId
const actor = { userId: 'owner-a', workspaceId: 'company-a' }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('old preview cannot commit between synchronous refresh and passive cleanup', async () => {
  const load = deferred()
  const boundary = createReviewAccessBoundary(async () => actor, same, now)
  const epoch = boundary.invalidate()
  let preview = null
  const opening = (async () => { await load.promise; return boundary.commit(epoch, actor, expiry, () => { preview = 'private' }) })()
  boundary.invalidate() // Event handler, before any simulated effect cleanup.
  load.resolve()
  assert.equal(await opening, false)
  assert.equal(preview, null)
})
test('sign-out or account/workspace switch during digest verification cannot reveal a preview', async () => {
  for (const changed of [null, { ...actor, userId: 'owner-b' }, { ...actor, workspaceId: 'company-b' }]) {
    const verification = deferred()
    let identity = actor
    const boundary = createReviewAccessBoundary(async () => identity, same, now)
    const epoch = boundary.invalidate()
    let preview = null
    const opening = (async () => { await verification.promise; return boundary.commit(epoch, actor, expiry, () => { preview = 'private' }) })()
    identity = changed
    verification.resolve()
    assert.equal(await opening, false)
    assert.equal(preview, null)
  }
})
test('late save acknowledgement and identity lookup cannot overwrite access invalidation', async () => {
  const identity = deferred()
  const boundary = createReviewAccessBoundary(() => identity.promise, same, now)
  const epoch = boundary.invalidate()
  let message = 'Checking access'
  const saving = boundary.commit(epoch, actor, expiry, () => { message = 'Saved' })
  boundary.invalidate()
  identity.resolve(actor)
  assert.equal(await saving, false)
  assert.equal(message, 'Checking access')
})
test('current identity can commit; expiry and identity errors fail closed', async () => {
  let clock = now()
  let broken = false
  const boundary = createReviewAccessBoundary(async () => { if (broken) throw new Error('offline'); return actor }, same, () => clock)
  const epoch = boundary.invalidate()
  let writes = 0
  assert.equal(await boundary.commit(epoch, actor, expiry, () => { writes++ }), true)
  clock = Date.parse(expiry)
  assert.equal(await boundary.commit(epoch, actor, expiry, () => { writes++ }), false)
  clock = now(); broken = true
  assert.equal(await boundary.commit(epoch, actor, expiry, () => { writes++ }), false)
  assert.equal(writes, 1)
})
