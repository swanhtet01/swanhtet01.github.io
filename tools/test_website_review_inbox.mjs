import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const { build } = require('esbuild')
const source = readFileSync('showroom/src/products/website/WebsiteReviewInbox.tsx', 'utf8')
// Expose the real private validators in the test bundle only; production keeps
// the component module compatible with React Fast Refresh.
const output = await build({ stdin: { contents: source + '\nexport { verifyStaffReviews, verifyStaffChanges, customerHandoff, verifyPreparation };',
  resolveDir: 'showroom/src/products/website', loader: 'tsx' }, bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent', plugins: [{ name: 'inbox-offline', setup(b) {
    b.onResolve({ filter: /^(react|react\/jsx-runtime)$|managed-trial$/ }, args => ({ path: args.path, namespace: 'mock' }))
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'react' ? `
      export const useState = init => { const h=globalThis.h; const i=h.cursor++; if(!(i in h.slots)) h.slots[i]=typeof init==='function'?init():init;
        return [h.slots[i], value=>{h.slots[i]=typeof value==='function'?value(h.slots[i]):value}]; };
      export const useRef=init=>useState(()=>({current:init}))[0];
      export const useEffect=fn=>{globalThis.h.effects.push(fn)};
    ` : args.path === 'react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;' : `
      export const currentManagedIdentity=async()=>globalThis.h.identity;
      export const sameManagedIdentity=(a,b)=>a.userId===b.userId&&a.workspaceId===b.workspaceId;
      export const loadManagedWebsiteReviewStaffPage=async(...args)=>{globalThis.h.calls.push(args);return globalThis.h.response(...args)};
      export const loadManagedWebsitePreparation=async(...args)=>{globalThis.h.calls.push(args);return globalThis.h.prepareResponse(...args)};
    ` }))
  } }] })
const sandbox = { module: { exports: {} }, structuredClone, TextEncoder, URL, crypto: webcrypto, setTimeout, window: { location: { origin: 'https://app.supermega.dev' }, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout } }
sandbox.exports = sandbox.module.exports
runInNewContext(output.outputFiles[0].text, sandbox)
const { verifyStaffReviews, verifyStaffChanges, WebsiteReviewInbox, customerHandoff, verifyPreparation } = sandbox.module.exports
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const row = { reviewId: id(1), contentRevision: 1, sourceVersion: 2, preparedAt: '2026-09-16T00:00:00+00:00', expiresAt: '2026-09-17T00:00:00+00:00', status: 'active', hasChangeRequests: true, hasCustomerAcceptance: false }
const listing = { reviews: [row], nextAfter: null, order: 'review_id_ascending', publicationAuthorized: false }
const feedback = { reviewId: row.reviewId, contentRevision: 1, sourceVersion: 2, previewDigest: `sha256:${'a'.repeat(64)}`, reviewStatus: 'active', publicationAuthorized: false, acceptance: null,
  requests: [{ commandId: id(2), note: 'ပိုတိုအောင်ရေးပေးပါ <script>not executable</script>', createdAt: '2026-09-16T01:00:00.000002+00:00' },
    { commandId: id(3), note: 'Retained older request', createdAt: '2026-09-16T01:00:00.000001+00:00' }], nextAfter: null }
function elements(tree) { return Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : [] }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '' }
function render() { sandbox.h.cursor = 0; sandbox.h.effects = []; return WebsiteReviewInbox({ actorId: 'actor', workspaceId: 'company' }) }
const click = (tree, label) => elements(tree).find(node => node.type === 'button' && text(node) === label).props.onClick()
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)) }
function fixture(response = (_identity, review) => review ? feedback : listing) {
  sandbox.h = { slots: [], cursor: 0, effects: [], calls: [], identity: { userId: 'actor', workspaceId: 'company' }, response }
}
test('metadata list is strictly bounded, ordered and identity-free', () => {
  assert.equal(verifyStaffReviews(listing).reviews.length, 1)
  for (const bad of [{ ...listing, publicationAuthorized: true }, { ...listing, actorId: 'private' },
    { ...listing, reviews: [row, row] }, { ...listing, reviews: Array(51).fill(row) }, { ...listing, nextAfter: row.reviewId },
    { ...listing, reviews: [{ ...row, recipientActorId: 'private' }] },
    { ...listing, reviews: [{ ...row, hasCustomerAcceptance: true }] },
    { ...listing, reviews: [{ ...row, hasCustomerAcceptance: 'yes' }] }]) assert.throws(() => verifyStaffReviews(bad))
  assert.throws(() => verifyStaffReviews(listing, row.reviewId))
})
test('feedback binds source revision, preserves microsecond order and remains plain text', () => {
  assert.equal(verifyStaffChanges(feedback, row).requests[0].note, feedback.requests[0].note)
  for (const bad of [{ ...feedback, sourceVersion: 3 }, { ...feedback, publicationAuthorized: true },
    { ...feedback, requests: [...feedback.requests].reverse() }, { ...feedback, requests: [feedback.requests[0], feedback.requests[0]] },
    { ...feedback, requests: [{ ...feedback.requests[0], note: 'x'.repeat(2001) }] }]) assert.throws(() => verifyStaffChanges(bad, row))
})
test('actual inbox loads on demand, displays retained notes and does not send writes', async () => {
  fixture(); let tree = render(); assert.equal(sandbox.h.calls.length, 0)
  click(tree, 'Refresh reviews'); await settle(); tree = render()
  assert.match(text(tree), /Customer changes retained/)
  click(tree, 'Read decision for revision 1'); await settle(); tree = render()
  assert.ok(text(tree).includes(feedback.requests[0].note))
  assert.equal(elements(tree).some(node => node.type === 'script' || node.props?.dangerouslySetInnerHTML), false)
  assert.equal(sandbox.h.calls.length, 2)
})

const acceptance = { contentRevision: 1, sourceVersion: 2, previewDigest: feedback.previewDigest,
  acceptedAt: '2026-09-16T02:00:00+00:00', status: 'accepted_for_operator_release_review',
  publicationAuthorized: false, deploymentAuthorized: false }

test('staff acceptance rejects wrong revision, conflicting feedback and authority claims', () => {
  const decision = { ...feedback, requests: [], acceptance }
  assert.equal(verifyStaffChanges(decision, row).acceptance.acceptedAt, acceptance.acceptedAt)
  for (const change of [{ contentRevision: 2 }, { sourceVersion: 3 }, { previewDigest: `sha256:${'b'.repeat(64)}` },
    { acceptedAt: 'bad' }, { acceptedAt: row.expiresAt }, { acceptedAt: '2026-09-15T00:00:00Z' },
    { status: 'published' }, { publicationAuthorized: true }, { deploymentAuthorized: true }, { actorId: 'private' }]) {
    assert.throws(() => verifyStaffChanges({ ...decision, acceptance: { ...acceptance, ...change } }, row))
  }
  assert.throws(() => verifyStaffChanges({ ...feedback, acceptance }, row))
})

test('operator sees accepted revision and historical warning without a publish action', async () => {
  const acceptedRow = { ...row, hasChangeRequests: false, hasCustomerAcceptance: true, status: 'revoked' }
  fixture((_identity, review) => review ? { ...feedback, requests: [], acceptance, reviewStatus: 'revoked' }
    : { ...listing, reviews: [acceptedRow] })
  let tree = render()
  click(tree, 'Refresh reviews'); await settle(); tree = render()
  assert.match(text(tree), /Customer acceptance retained — release review still required/)
  click(tree, 'Read decision for revision 1'); await settle(); tree = render()
  assert.match(text(tree), /Historical decision only/)
  assert.match(text(tree), /Not published or deployment-authorized/)
  assert.match(text(tree), /Revision 1/)
  assert.equal(elements(tree).some(node => node.type === 'button' && /publish|deploy|send/i.test(text(node))), false)
  assert.equal(sandbox.h.calls.length, 2)
})
test('late responses after account change or cleanup cannot reveal private notes', async () => {
  let release
  fixture(() => new Promise(resolve => { release = resolve }))
  let tree = render(); const cleanup = sandbox.h.effects[0]()
  click(tree, 'Refresh reviews'); await settle()
  sandbox.h.identity = { userId: 'other', workspaceId: 'elsewhere' }
  release(listing); await settle(); tree = render()
  assert.doesNotMatch(text(tree), /Customer changes retained/)
  assert.match(text(tree), /could not be verified/)
  cleanup()
  fixture(() => new Promise(resolve => { release = resolve }))
  tree = render(); const unmount = sandbox.h.effects[0]()
  click(tree, 'Refresh reviews'); await settle(); unmount(); release(listing); await settle()
  assert.equal(sandbox.h.slots[0], null)
})

test('handoff binds undecided revision to canonical origin and a live expiry window', () => {
  const pendingRow = { ...row, hasChangeRequests: false }
  const pending = { ...feedback, requests: [] }
  const now = Date.parse('2026-09-16T02:00:00Z')
  const message = customerHandoff(pendingRow, pending, 'https://app.supermega.dev', now)
  assert.match(message, new RegExp(`https://app\\.supermega\\.dev/website/review/${row.reviewId}`))
  assert.match(message, /assigned to this review/)
  assert.match(message, /does not publish/)
  assert.doesNotMatch(message, /recipientActorId|workspaceId|token=|password|mailto:/)
  for (const origin of ['http://app.supermega.dev', 'https://app.supermega.dev.evil.invalid', 'https://preview.vercel.app', 'http://127.0.0.1:4194', 'https://app.supermega.dev:8443'])
    assert.equal(customerHandoff(pendingRow, pending, origin, now), null)
  for (const change of [{ status: 'revoked' }, { status: 'stale' }, { status: 'expired' },
    { hasChangeRequests: true }, { hasCustomerAcceptance: true }, { expiresAt: 'bad' },
    { preparedAt: '2026-09-17T00:00:00Z' }, { reviewId: '../elsewhere' }])
    assert.equal(customerHandoff({ ...pendingRow, ...change }, pending, 'https://app.supermega.dev', now), null)
  for (const change of [{ reviewStatus: 'revoked' }, { acceptance }, { requests: feedback.requests },
    { nextAfter: id(2) }, { reviewId: id(2) }, { contentRevision: 2 }, { sourceVersion: 3 }])
    assert.equal(customerHandoff(pendingRow, { ...pending, ...change }, 'https://app.supermega.dev', now), null)
  assert.equal(customerHandoff(pendingRow, pending, 'https://app.supermega.dev', Date.parse(row.expiresAt)), null)
  assert.equal(customerHandoff(pendingRow, pending, 'https://app.supermega.dev', NaN), null)
})

test('actual staff handoff is read-only, current, and clears on account focus changes', async () => {
  const pendingRow = { ...row, hasChangeRequests: false, preparedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }
  fixture((_identity, review) => review ? { ...feedback, requests: [] } : { ...listing, reviews: [pendingRow] })
  const listeners = {}
  sandbox.window.addEventListener = (name, fn) => { listeners[name] = fn }
  let tree = render(); const cleanup = sandbox.h.effects[0]()
  click(tree, 'Refresh reviews'); await settle(); tree = render()
  assert.equal(elements(tree).some(n => n.type === 'textarea'), false)
  click(tree, 'Read decision for revision 1'); await settle(); tree = render()
  const draft = elements(tree).find(n => n.type === 'textarea')
  assert.equal(draft.props.readOnly, true)
  assert.match(draft.props.value, /Sign in with the account assigned/)
  assert.equal(sandbox.h.calls.length, 2)
  assert.equal(elements(tree).some(n => n.type === 'button' && /send|publish|deploy/i.test(text(n))), false)
  listeners.focus(); tree = render()
  assert.equal(elements(tree).some(n => n.type === 'textarea'), false)
  cleanup(); sandbox.window.addEventListener = () => {}
})

test('open handoff disappears at expiry without a network write or periodic polling', async () => {
  let clock = Date.parse('2026-09-16T02:00:00Z')
  let expire, scheduledDelay, canceled = false
  sandbox.Date = class extends Date { static now() { return clock } }
  sandbox.window.setTimeout = (fn, delay) => { expire = fn; scheduledDelay = delay; return 17 }
  sandbox.window.clearTimeout = id => { canceled = id === 17 }
  try {
    fixture((_identity, review) => review ? { ...feedback, requests: [] }
      : { ...listing, reviews: [{ ...row, hasChangeRequests: false }] })
    let tree = render(); click(tree, 'Refresh reviews'); await settle(); tree = render()
    click(tree, 'Read decision for revision 1'); await settle(); tree = render()
    assert.equal(elements(tree).some(n => n.type === 'textarea'), true)
    const cancelExpiry = sandbox.h.effects[1]()
    assert.equal(scheduledDelay, Date.parse(row.expiresAt) - clock + 1)
    clock = Date.parse(row.expiresAt); expire(); tree = render()
    assert.equal(elements(tree).some(n => n.type === 'textarea'), false)
    assert.equal(sandbox.h.calls.length, 2)
    cancelExpiry(); assert.equal(canceled, true)
  } finally {
    delete sandbox.Date
    sandbox.window.setTimeout = setTimeout; sandbox.window.clearTimeout = clearTimeout
  }
})

const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value)
function preparationFixture() {
  const preview = { siteName: 'Example Studio', pages: [{ id: 'home', slug: '/', navigation: { label: 'Home', visible: true },
    hero: { eyebrow: '', headline: 'Saved headline', summary: 'ဝန်ဆောင်မှု', ctaLabel: 'Ask us', ctaHref: 'javascript:alert(1)' },
    sections: [{ id: 'one', eyebrow: '', title: 'Service', body: '<script>Not executable</script>' }], seo: { title: 'Home', description: 'Prepared details' } }] }
  return { status: 'saved_source_preview', sourceVersion: 3, contentRevision: 2, preview,
    previewDigest: `sha256:${createHash('sha256').update(canonical(preview)).digest('hex')}`,
    readAt: '2026-09-18T00:00:00Z', reviewCreated: false, publicationAuthorized: false, deploymentAuthorized: false }
}

test('saved-source verification binds complete preview bytes and refuses authority or private fields', async () => {
  const input = preparationFixture()
  const result = await verifyPreparation(input)
  result.preview.pages[0].hero.headline = 'Changed locally'
  assert.equal(input.preview.pages[0].hero.headline, 'Saved headline')
  for (const change of [{ status: 'prepared_preview' }, { sourceVersion: 0 }, { sourceVersion: 1.5 },
    { contentRevision: -1 }, { readAt: 'bad' }, { reviewCreated: true }, { publicationAuthorized: true },
    { deploymentAuthorized: true }, { recipientActorId: 'private' }, { previewDigest: `sha256:${'f'.repeat(64)}` }])
    await assert.rejects(verifyPreparation({ ...preparationFixture(), ...change }))
  const tampered = preparationFixture(); tampered.preview.pages[0].hero.headline = 'Unverified edit'
  await assert.rejects(verifyPreparation(tampered))
})

test('staff can inspect verified saved pages without active links, an invitation or provider writes', async () => {
  fixture(); sandbox.h.prepareResponse = () => preparationFixture()
  let tree = render(); assert.equal(sandbox.h.calls.length, 0)
  click(tree, 'Check saved Website before handoff'); await settle(); tree = render()
  assert.match(text(tree), /Example Studio · saved revision 2/)
  assert.match(text(tree), /Unsaved edits are not included/)
  assert.match(text(tree), /Saved headline/)
  assert.match(text(tree), /ဝန်ဆောင်မှု/)
  assert.match(text(tree), /Destination \(not clickable\): Needs correction by SuperMega/)
  assert.doesNotMatch(text(tree), /javascript:alert/)
  assert.equal(elements(tree).some(n => ['a', 'iframe', 'script'].includes(n.type) || n.props?.dangerouslySetInnerHTML), false)
  assert.equal(sandbox.h.calls.length, 1)
  click(tree, 'Refresh reviews'); await settle(); tree = render()
  assert.doesNotMatch(text(tree), /Saved headline/)
})

test('saved-source late response cannot cross an account boundary', async () => {
  let release
  fixture(); sandbox.h.prepareResponse = () => new Promise(resolve => { release = resolve })
  let tree = render(); click(tree, 'Check saved Website before handoff'); await settle()
  sandbox.h.identity = { userId: 'another', workspaceId: 'elsewhere' }
  release(preparationFixture()); await settle(); tree = render()
  assert.doesNotMatch(text(tree), /Saved headline/)
  assert.match(text(tree), /could not be verified, or access changed/)
})

test('saved-source transport is identity-bound, no-store, and redirect-refusing', () => {
  const transport = readFileSync('showroom/src/core/managed-trial.ts', 'utf8')
  const slice = transport.slice(transport.indexOf('export async function loadManagedWebsitePreparation('), transport.indexOf('export async function loadManagedWebsiteReviewStaffPage('))
  assert.match(slice, /\/api\/trial\/v1\/website-review-preparation/)
  for (const boundary of ["cache: 'no-store'", "redirect: 'error'", "credentials: 'omit'", 'true, expectedIdentity']) assert.ok(slice.includes(boundary))
  assert.doesNotMatch(slice, /POST|workspaceId=|recipientActorId=/)
})
