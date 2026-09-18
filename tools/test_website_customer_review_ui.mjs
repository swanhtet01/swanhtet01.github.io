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
vm.runInNewContext(compiled, { URL, exports: module.exports, require: name => {
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
test('customer can inspect exact contact and search text without navigating or publishing', () => {
  const prepared = page('Home')
  prepared.hero.ctaHref = 'https://example.com/contact'
  prepared.seo.description = 'Prepared <description>'
  const html = render([prepared])
  assert.ok(html.includes('<details'))
  assert.ok(html.includes('https://example.com/contact'))
  assert.ok(html.includes('Prepared &lt;description&gt;'))
  assert.ok(html.includes('not proof that a link works'))
  assert.doesNotMatch(html, /href=|<a\b|<iframe|<script/)
})
test('unsafe or credential-bearing destinations are withheld and absent text is explicit', () => {
  for (const destination of ['javascript:alert(1)', 'data:text/html,unsafe', '//example.com', 'https://user@example.com', ' https://example.com', '/\\example.com']) {
    const prepared = page('Home')
    prepared.hero.ctaHref = destination
    const html = render([prepared])
    assert.ok(html.includes('Needs correction by SuperMega'), destination)
    assert.ok(!html.includes(destination), destination)
  }
  const prepared = page('Home')
  prepared.hero.ctaHref = ''
  assert.ok(render([prepared]).includes('Not prepared yet'))
})
test('supported contact routes stay visible as inert text', () => {
  for (const destination of ['/contact/', '#contact', 'mailto:hello@example.com', 'tel:+10000000000']) {
    const prepared = page('Home')
    prepared.hero.ctaHref = destination
    const html = render([prepared])
    assert.ok(html.includes(destination), destination)
    assert.doesNotMatch(html, /href=/)
  }
})

test('customer review is a short result-review journey rather than a builder', () => {
  for (const text of ['Review in 3 steps', 'Open each prepared page', 'Check the business facts, offers, and contact action',
    'Accept this revision or request changes', 'SuperMega makes the updates and sends a new exact revision.',
    'Acceptance records your decision for this exact revision. SuperMega handles the separate release review and publishing. Nothing is published from this screen.']) assert.ok(source.includes(text), text)
  assert.match(source, /placeholder="Example: On Home, change the phone number to…"/)
  assert.match(source, /aria-describedby="website-review-note-help"/)
  assert.doesNotMatch(source, /Edit page|Customize page|Publish now|Approve and publish/)
})

test('acceptance has explicit consent, shared synchronous lock and receipt-bound reload (source contract)', () => {
  for (const pin of ['verifyCustomerReviewDecision', 'verifyCustomerAcceptanceAcknowledgement',
    'pendingAcceptance.current ??', 'inFlight.current', 'setDecision(saved)',
    'setConfirmed(Boolean(pendingAcceptance.current))', 'Retry same acceptance', 'Acceptance saved',
    'I checked the prepared pages and accept this exact revision for release review.',
    'Accepting does not publish the Website, register a domain, or take payment.']) assert.ok(source.includes(pin), pin)
  const accept = source.slice(source.indexOf('async function acceptRevision()'), source.indexOf('return <main'))
  assert.ok(accept.includes('!confirmed'))
  assert.ok(accept.includes('pending.current'))
  assert.ok(accept.includes('note.trim()'))
  assert.ok(accept.includes("decision?.status !== 'pending_review'"))
  assert.ok(accept.indexOf('inFlight.current = true') < accept.indexOf('await sendManagedWebsiteAcceptance'))
  assert.ok(accept.indexOf('verifyCustomerAcceptanceAcknowledgement') < accept.indexOf('setDecision(saved)'))
  assert.ok(accept.includes('access.commit(epoch, request.identity, review.expiresAt'))
})

function renderDecision(status, { confirmed = false, note = '', uncertain = false } = {}) {
  const review = { reviewId: '11111111-1111-4111-8111-111111111111', contentRevision: 7,
    previewDigest: 'sha256:' + 'a'.repeat(64), preview: { siteName: 'Studio', pages: [page('home')] },
    expiresAt: '2099-01-01T00:00:00Z', status: 'prepared_preview', publicationAuthorized: false }
  const decision = { ...review, status }
  const states = [review, actor, 'home', note, 'Prepared review', false, 0, false,
    decision, confirmed, uncertain, {}]
  let index = 0
  const controlled = { exports: {} }
  vm.runInNewContext(compiled + '; exports.TestReviewContent = CustomerReviewContent;', {
    exports: controlled.exports, URL,
    require: name => {
      if (name.endsWith('.css')) return {}
      if (name === 'react') return { ...React, useState: () => [states[index++], () => {}],
        useEffect: () => {}, useRef: value => ({ current: value }) }
      if (name === 'react-router') return { Link: props => React.createElement('a', { href: props.to }, props.children) }
      if (name === './customer-review-access') return { createReviewAccessBoundary }
      if (name === '../../core/account-routes') return { customerWebsiteReviewLoginPath }
      if (name === '../../core/managed-trial' || name === './customer-review-contract') return {}
      return require(name)
    },
  })
  return renderToStaticMarkup(React.createElement(controlled.exports.TestReviewContent, { reviewId: review.reviewId }))
}

test('rendered customer decisions show consent only when actionable and never a publish control', () => {
  const pending = renderDecision('pending_review')
  assert.match(pending, /type="checkbox"/)
  assert.match(pending, /<button type="button" disabled="">Accept this revision<\/button>/)
  const confirmed = renderDecision('pending_review', { confirmed: true })
  assert.match(confirmed, /<button type="button">Accept this revision<\/button>/)
  const note = renderDecision('pending_review', { confirmed: true, note: 'Fix the address' })
  assert.match(note, /clear the note before accepting/)
  assert.match(note, /<button type="button" disabled="">Accept this revision<\/button>/)
  const uncertain = renderDecision('pending_review', { confirmed: true, uncertain: true })
  assert.match(uncertain, /Retry same acceptance/)
  assert.match(uncertain, /disabled="">Request changes<\/button>/)
  const accepted = renderDecision('accepted_for_operator_release_review')
  assert.match(accepted, /Acceptance saved/)
  assert.match(accepted, /Revision 7 is accepted/)
  assert.doesNotMatch(accepted, /<form|<textarea|type="checkbox"/)
  const changes = renderDecision('changes_requested')
  assert.match(changes, /Request changes/)
  assert.doesNotMatch(changes, /type="checkbox"|>Accept this revision</)
  for (const html of [pending, confirmed, note, uncertain, accepted, changes]) {
    assert.doesNotMatch(html, />Publish|>Deploy|>Register domain|>Pay now/)
  }
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
