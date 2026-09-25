import * as feedbackRecovery from '../showroom/src/products/website/pending-website-feedback.ts'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createReviewAccessBoundary } from '../showroom/src/products/website/customer-review-access.ts'
import { customerWebsiteReviewLoginPath } from '../showroom/src/core/account-routes.ts'
import { reviewContactDestination } from '../showroom/src/products/website/customer-review-contract.ts'

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
  if (name === './pending-website-feedback') return feedbackRecovery
  if (name === './customer-review-access') return { createReviewAccessBoundary }
  if (name === '../../core/account-routes') return { customerWebsiteReviewLoginPath }
  if (name === './customer-review-contract') return new Proxy({ reviewContactDestination }, { get: (target, key) => { if (key === 'reviewContactDestination') return target[key]; throw new Error('Pure preview must not access auth or transport') } })
  if (name === '../../core/managed-trial') return new Proxy({}, { get: () => { throw new Error('Pure preview must not access auth or transport') } })
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
  assert.ok(source.includes('const refresh = () => { access.invalidate(); setOpening(true); setReview(null); setActor(null)'))
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
  assert.ok(source.includes('SuperMega handles publishing.'))
  assert.match(source, /placeholder="What needs changing\?"/)
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

function renderDecision(status, { confirmed = false, note = '', uncertain = false, unavailable = false, opening = false } = {}) {
  const review = { reviewId: '11111111-1111-4111-8111-111111111111', contentRevision: 7,
    previewDigest: 'sha256:' + 'a'.repeat(64), preview: { siteName: 'Studio', pages: [page('home')] },
    expiresAt: '2099-01-01T00:00:00Z', status: 'prepared_preview', publicationAuthorized: false }
  const decision = { ...review, status }
  const states = [unavailable ? null : review, actor, 'home', note, 'Prepared review', false, 0, false,
    decision, confirmed, uncertain, {}, opening]
  let index = 0
  const controlled = { exports: {} }
  vm.runInNewContext(compiled + '; exports.TestReviewContent = CustomerReviewContent;', {
    exports: controlled.exports, URL,
    require: name => {
      if (name.endsWith('.css')) return {}
  if (name === './pending-website-feedback') return feedbackRecovery
      if (name === 'react') return { ...React, useState: () => [states[index++], () => {}],
        useEffect: () => {}, useRef: value => ({ current: value }) }
      if (name === 'react-router') return { Link: props => React.createElement('a', { href: props.to }, props.children) }
      if (name === './customer-review-access') return { createReviewAccessBoundary }
      if (name === '../../core/account-routes') return { customerWebsiteReviewLoginPath }
      if (name === './customer-review-contract') return { reviewContactDestination }
      if (name === '../../core/managed-trial') return {}
      return require(name)
    },
  })
  return renderToStaticMarkup(React.createElement(controlled.exports.TestReviewContent, { reviewId: review.reviewId }))
}

test('unavailable review offers a safe recovery path and loading prevents repeated open requests', () => {
  const loading = renderDecision('pending_review', { unavailable: true, opening: true })
  assert.match(loading, /aria-busy="true"/)
  assert.match(loading, /disabled="">Opening review…/)
  assert.doesNotMatch(loading, /reply to the person/)
  const failed = renderDecision('pending_review', { unavailable: true })
  assert.match(failed, /aria-busy="false"/)
  assert.match(failed, /<button type="button">Try opening again/)
  assert.match(failed, /assigned account and latest review link/)
  assert.match(failed, /Ask SuperMega for help/)
  assert.ok(failed.includes(customerWebsiteReviewLoginPath('11111111-1111-4111-8111-111111111111').replaceAll('&', '&amp;')))
  assert.doesNotMatch(failed, />Accept this revision<|<textarea|<iframe/)
})

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

test('consent uses a full touch label without inheriting full-width text-input styling', () => {
  const css = readFileSync(new URL('../showroom/src/products/website/customer-review.css', import.meta.url), 'utf8')
  assert.match(renderDecision('pending_review'), /<label class="customer-review-consent"><input type="checkbox"/)
  assert.match(css, /\.customer-website-review \.customer-review-consent \{[^}]*display: flex;[^}]*min-height: 2\.75rem;/)
  assert.match(css, /input\[type="checkbox"\] \{[^}]*width: 1\.25rem;[^}]*min-height: 1\.25rem;/)
  assert.match(css, /:is\(a, button, input, textarea\):focus-visible/)
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

test('actual change and acceptance handlers reject late success after access changes', async () => {
  const ast = ts.createSourceFile('review.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  for (const name of ['submit', 'acceptRevision']) for (const change of ['signout', 'user', 'company', 'refresh', 'unchanged']) {
    let fn
    function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) fn = node; ts.forEachChild(node, visit) }
    visit(ast); assert.ok(fn)
    const response = deferred(), messages = [], decisions = []
    let identity = actor
    const access = createReviewAccessBoundary(async () => identity, same)
    access.invalidate()
    const noop = () => {}
    const context = {
      retainWebsiteFeedback: () => {}, clearWebsiteFeedback: () => {}, window: { sessionStorage: {} },
      review: { expiresAt: new Date(Date.now() + 60000).toISOString(), previewDigest: 'synthetic-digest' },
      reviewId: 'synthetic-review', actor, busy: false, confirmed: true,
      note: name === 'submit' ? 'Synthetic changes' : '', decision: { status: 'pending_review' },
      pending: { current: null }, pendingAcceptance: { current: null }, inFlight: { current: false },
      access, sameManagedIdentity: same, crypto: { randomUUID: () => 'synthetic-command' },
      setBusy: noop, setUnconfirmed: noop, setAcceptanceUnconfirmed: noop, setNote: noop, setActor: noop, setReview: noop,
      setMessage: value => messages.push(value), setDecision: value => decisions.push(value),
      sendManagedWebsiteReviewChanges: () => response.promise, sendManagedWebsiteAcceptance: () => response.promise,
      verifyCustomerChangeAcknowledgement: noop,
      verifyCustomerAcceptanceAcknowledgement: () => ({ status: 'accepted_for_operator_release_review' }),
    }
    const js = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    const run = vm.runInNewContext(`${js}; ${name}`, context)
    const saving = run({ preventDefault() {} })
    assert.equal(context.inFlight.current, true)
    if (change === 'refresh') access.invalidate()
    if (change === 'signout') identity = null
    if (change === 'user') identity = { ...actor, userId: 'other' }
    if (change === 'company') identity = { ...actor, workspaceId: 'other' }
    response.resolve({})
    await saving
    assert.equal(context.inFlight.current, false)
    assert.equal(decisions.length, change === 'unchanged' ? 1 : 0, `${name}/${change}`)
    assert.equal(messages.some(message => /is saved/.test(message)), change === 'unchanged', `${name}/${change}`)
    if (change === 'refresh') assert.equal(messages.length, 1, 'stale epoch cannot overwrite refresh message')
  }
})

test('actual acceptance keeps an uncertain request for exact retry after a mismatched receipt', async () => {
  const { verifyCustomerAcceptanceAcknowledgement } = await import('../showroom/src/products/website/customer-review-contract.ts')
  const ast = ts.createSourceFile('review.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let fn
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'acceptRevision') fn = node; ts.forEachChild(node, visit) }
  visit(ast); assert.ok(fn)
  for (const mismatch of ['commandId', 'reviewId', 'previewDigest', 'contentRevision', 'persisted']) {
    const requests = [], messages = [], decisions = [], uncertain = []
    const review = { reviewId: 'synthetic-review', contentRevision: 3, previewDigest: 'synthetic-digest', expiresAt: new Date(Date.now() + 60000).toISOString() }
    let faulty = true, uuids = 0
    const noop = () => {}
    const context = { review, reviewId: review.reviewId, actor, confirmed: true, busy: false, note: '',
      decision: { status: 'pending_review' }, pending: { current: null }, pendingAcceptance: { current: null }, inFlight: { current: false },
      access: createReviewAccessBoundary(async () => actor, same), sameManagedIdentity: same,
      crypto: { randomUUID: () => { uuids++; return 'synthetic-command' } },
      setBusy: noop, setActor: noop, setReview: noop, setMessage: value => messages.push(value),
      setDecision: value => decisions.push(value), setAcceptanceUnconfirmed: value => uncertain.push(value),
      verifyCustomerAcceptanceAcknowledgement,
      sendManagedWebsiteAcceptance: async payload => {
        requests.push(payload)
        const receipt = { ...payload, contentRevision: review.contentRevision, acceptedAt: new Date().toISOString(), status: 'accepted_for_operator_release_review', persisted: true, replayed: !faulty, publicationAuthorized: false, deploymentAuthorized: false }
        delete receipt.decision
        if (faulty) receipt[mismatch] = mismatch === 'persisted' ? false : mismatch === 'contentRevision' ? 4 : 'wrong'
        return receipt
      },
    }
    const js = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    const run = vm.runInNewContext(`${js}; acceptRevision`, context)
    await run()
    assert.equal(decisions.length, 0, mismatch)
    assert.match(messages.at(-1), /Acceptance unconfirmed/)
    assert.equal(uncertain.at(-1), true)
    assert.ok(context.pendingAcceptance.current)
    faulty = false
    await run()
    assert.equal(requests[0], requests[1], 'retry must reuse the exact pending payload')
    assert.equal(uuids, 1)
    assert.equal(decisions[0].status, 'accepted_for_operator_release_review')
    assert.equal(context.pendingAcceptance.current, null)
    assert.equal(uncertain.at(-1), false)
  }
})


test('Website feedback recovery survives remount and isolates account, review and exact content', async () => {
  const { retainWebsiteFeedback, recoverWebsiteFeedback, clearWebsiteFeedback } = await import('../showroom/src/products/website/pending-website-feedback.ts')
  const values = new Map()
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }
  const review = { reviewId: 'review-a', previewDigest: 'sha256:synthetic', expiresAt: '2099-01-01T00:00:00Z' }
  const payload = { reviewId: review.reviewId, previewDigest: review.previewDigest, commandId: '11111111-1111-4111-8111-111111111111', note: 'စျေးနှုန်း ပြင်ပါ' }
  retainWebsiteFeedback(storage, actor, review, payload)
  assert.deepEqual(recoverWebsiteFeedback(storage, actor, review), payload)
  for (const who of [{ ...actor, userId: 'other' }, { ...actor, workspaceId: 'other' }]) assert.equal(recoverWebsiteFeedback(storage, who, review), null)
  assert.equal(recoverWebsiteFeedback(storage, actor, { ...review, reviewId: 'other' }), null)
  assert.throws(() => recoverWebsiteFeedback(storage, actor, { ...review, previewDigest: 'changed' }))
  assert.throws(() => retainWebsiteFeedback(storage, actor, review, { ...payload, note: 'different' }))
  assert.throws(() => clearWebsiteFeedback(storage, actor, { ...payload, note: 'different' }))
  assert.deepEqual(recoverWebsiteFeedback(storage, actor, review), payload)
  clearWebsiteFeedback(storage, actor, payload); assert.equal(values.size, 0)
})

test('Website feedback recovery fails closed on corrupt, denied and dropped storage', async () => {
  const { retainWebsiteFeedback, recoverWebsiteFeedback, clearWebsiteFeedback } = await import('../showroom/src/products/website/pending-website-feedback.ts')
  const review = { reviewId: 'review-a', previewDigest: 'digest', expiresAt: '2099-01-01T00:00:00Z' }
  const payload = { reviewId: review.reviewId, previewDigest: review.previewDigest, commandId: '11111111-1111-4111-8111-111111111111', note: 'Changes' }
  for (const raw of ['{broken', 'x'.repeat(16001), JSON.stringify({ expiresAt: review.expiresAt, payload: { ...payload, note: '' } })]) {
    assert.throws(() => recoverWebsiteFeedback({ getItem: () => raw }, actor, review))
  }
  assert.throws(() => retainWebsiteFeedback({ getItem: () => null, setItem: () => { throw Error('denied') } }, actor, review, payload))
  assert.throws(() => retainWebsiteFeedback({ getItem: () => null, setItem: () => {} }, actor, review, payload))
  const raw = JSON.stringify({ expiresAt: review.expiresAt, payload })
  assert.throws(() => clearWebsiteFeedback({ getItem: () => raw, removeItem: () => {} }, actor, payload))
  let removed = false
  const expired = { ...review, expiresAt: '2000-01-01T00:00:00Z' }
  const old = JSON.stringify({ expiresAt: expired.expiresAt, payload })
  assert.equal(recoverWebsiteFeedback({ getItem: () => removed ? null : old, removeItem: () => { removed = true } }, actor, expired), null)
  assert.equal(removed, true)
})


test('actual Website open and submit recover the same feedback command after remount', async () => {
  const ast = ts.createSourceFile('review.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const functions = {}
  function visit(node) { if (ts.isFunctionDeclaration(node) && ['open', 'submit'].includes(node.name?.text)) functions[node.name.text] = node.getText(ast); ts.forEachChild(node, visit) }
  visit(ast)
  const js = ts.transpileModule(Object.values(functions).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const mode of ['normal', 'denied', 'user', 'workspace', 'cleanup']) {
    const denied = mode === 'denied'
    let cleanupDenied = mode === 'cleanup', who = actor
    const values = new Map(), writes = []
    const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => { if (denied) throw Error('denied'); values.set(k,v) }, removeItem: k => { if (cleanupDenied) throw Error('cleanup denied'); values.delete(k) } }
    const review = { reviewId: '11111111-1111-4111-8111-111111111111', previewDigest: 'sha256:'+'a'.repeat(64), expiresAt: '2099-01-01T00:00:00Z', preview: { pages: [{ id: 'home' }] } }
    let sequence = 0, lost = true
    function mount() {
      const access = createReviewAccessBoundary(async () => who, same)
      const context = { ...feedbackRecovery, active: true, epoch: access.invalidate(), access, reviewId: review.reviewId,
        review, actor, busy: false, note: 'စျေးနှုန်း ပြင်ပါ', decision: { status: 'pending_review' },
        pending: { current: null }, pendingAcceptance: { current: null }, inFlight: { current: false }, lastIdentity: { current: null },
        window: { sessionStorage: storage }, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}` },
        sameManagedIdentity: same, currentManagedIdentity: async () => who,
        loadManagedWebsiteReview: async () => review, verifyCustomerWebsiteReview: async x => x,
        loadManagedWebsiteAcceptance: async () => ({ status: 'changes_requested' }), verifyCustomerReviewDecision: x => x,
        setReview: x => { context.review=x }, setActor: x => { context.actor=x }, setNote: x => { context.note=x },
        setDecision: x => { context.decision=typeof x==='function'?x(context.decision):x },
        setBusy: () => {}, setMessage: () => {}, setUnconfirmed: () => {}, setAcceptanceUnconfirmed: () => {}, setConfirmed: () => {}, setPageId: () => {}, setOpening: () => {},
        sendManagedWebsiteReviewChanges: async p => { writes.push(structuredClone(p)); if (lost) throw Error('lost'); return { commandId:p.commandId,reviewId:p.reviewId,status:'changes_requested',createdAt:'2026-01-01T00:00:00Z',persisted:true,replayed:true,publicationAuthorized:false } },
        verifyCustomerChangeAcknowledgement: contract.verifyCustomerChangeAcknowledgement,
      }
      return { ...vm.runInNewContext(`${js};({open,submit})`,context), context }
    }
    const contract = await import('../showroom/src/products/website/customer-review-contract.ts')
    const first = mount(); await first.submit({ preventDefault() {} })
    if (denied) { assert.equal(writes.length,0); continue }
    if (mode === 'user') who = { ...actor, userId: 'other' }
    if (mode === 'workspace') who = { ...actor, workspaceId: 'other' }
    const second = mount(); await second.open()
    if (mode === 'user' || mode === 'workspace') {
      assert.equal(second.context.pending.current, null); assert.equal(second.context.note, '')
      assert.equal(writes.length, 1); assert.equal(values.size, 1); continue
    }
    assert.equal(second.context.note, writes[0].note)
    assert.deepEqual(second.context.pending.current.payload, writes[0])
    lost=false; await second.submit({ preventDefault() {} })
    assert.deepEqual(writes[1],writes[0])
    if (mode === 'cleanup') {
      assert.equal(values.size, 1); assert.ok(second.context.pending.current)
      cleanupDenied=false
      const third=mount(); await third.open(); await third.submit({ preventDefault() {} })
      assert.deepEqual(writes[2],writes[0])
    }
    assert.equal(values.size,0)
  }
})
