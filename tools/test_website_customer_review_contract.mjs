import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { verifyCustomerWebsiteReview, verifyCustomerChangeAcknowledgement, verifyCustomerReviewDecision, verifyCustomerAcceptanceAcknowledgement } from '../showroom/src/products/website/customer-review-contract.ts'

const reviewId = '11111111-1111-4111-8111-111111111111'
const commandId = '22222222-2222-4222-8222-222222222222'
const now = Date.parse('2026-09-16T00:00:00Z')
test('release verification includes customer and staff review suites serially', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(scripts['app:verify:steps'].split(' && ').includes('npm run website:demo:self-test'))
  const command = scripts['website:demo:self-test'].split(/\s+/u)
  assert.deepEqual(command.slice(0, 3), ['node', '--test', '--test-concurrency=1'])
  for (const path of ['tools/test_website_customer_review_contract.mjs', 'tools/test_website_customer_review_ui.mjs', 'tools/test_website_review_inbox.mjs']) {
    assert.equal(command.filter(token => token === path).length, 1, path)
  }
})
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value)
function fixture() {
  const preview = { siteName: 'ဆိုင်', pages: [{ id: 'home', slug: '/', navigation: { label: 'Home', visible: true },
    hero: { eyebrow: '', headline: 'Welcome', summary: 'Prepared for review', ctaLabel: '', ctaHref: '' },
    sections: [{ id: 'service', eyebrow: '', title: 'Service', body: 'Our work' }], seo: { title: 'Home', description: '' } }] }
  return { reviewId, contentRevision: 0, preview,
    previewDigest: `sha256:${createHash('sha256').update(canonical(preview)).digest('hex')}`,
    expiresAt: '2026-09-17T00:00:00Z', status: 'prepared_preview', publicationAuthorized: false }
}

test('verifies Unicode prepared content and returns isolated copy', async () => {
  const input = fixture()
  const result = await verifyCustomerWebsiteReview(input, reviewId, now)
  result.preview.pages[0].hero.headline = 'Changed locally'
  assert.equal(input.preview.pages[0].hero.headline, 'Welcome')
})
test('rejects wrong identity, expiry, invalid revision and publication assertion', async () => {
  for (const change of [{ reviewId: commandId }, { expiresAt: 'bad' }, { expiresAt: new Date(now).toISOString() },
    { contentRevision: -1 }, { contentRevision: 0.1 }, { publicationAuthorized: true }]) {
    await assert.rejects(verifyCustomerWebsiteReview({ ...fixture(), ...change }, reviewId, now))
  }
})
test('rejects tampered content and private or extra fields', async () => {
  for (const mutate of [x => x.preview.pages[0].hero.headline = 'Tampered', x => x.actorId = 'private',
    x => x.preview.pages[0].internalName = 'Private', x => x.preview.leads = [], x => x.preview.pages[0].hero.html = '<script>']) {
    const value = fixture(); mutate(value)
    await assert.rejects(verifyCustomerWebsiteReview(value, reviewId, now))
  }
})
test('rejects broken nested types and out-of-bound collections', async () => {
  for (const mutate of [x => x.preview.pages = [], x => x.preview.pages[0].navigation.visible = 'yes',
    x => x.preview.pages[0].sections = Array(5).fill({}), x => x.preview.pages[0].hero.headline = 12]) {
    const value = fixture(); mutate(value)
    await assert.rejects(verifyCustomerWebsiteReview(value, reviewId, now))
  }
})
test('requires exact durable acknowledgement rather than a queued or published claim', () => {
  const result = { reviewId, commandId, createdAt: new Date(now).toISOString(), status: 'changes_requested', persisted: true, replayed: false, publicationAuthorized: false }
  assert.equal(verifyCustomerChangeAcknowledgement(result, { reviewId, commandId }).commandId, commandId)
  for (const change of [{ commandId: reviewId }, { reviewId: commandId }, { persisted: false }, { status: 'queued' }, { publicationAuthorized: true }, { createdAt: 'bad' }]) {
    assert.throws(() => verifyCustomerChangeAcknowledgement({ ...result, ...change }, { reviewId, commandId }))
  }
})
test('transport retains expected identity and rejects redirects and browser caching', () => {
  const source = readFileSync(new URL('../showroom/src/core/managed-trial.ts', import.meta.url), 'utf8')
  const slice = source.slice(source.indexOf('export async function loadManagedWebsiteReview('), source.indexOf('export async function preflightManagedClientImport'))
  assert.equal((slice.match(/redirect: 'error'/g) ?? []).length, 4)
  assert.equal((slice.match(/cache: 'no-store'/g) ?? []).length, 4)
  assert.equal((slice.match(/credentials: 'omit'/g) ?? []).length, 4)
  assert.equal((slice.match(/true, expectedIdentity/g) ?? []).length, 4)
})

test('decision reload binds exact review, revision, digest and expiry without publication', () => {
  const review = fixture()
  const decision = { reviewId, contentRevision: review.contentRevision, previewDigest: review.previewDigest,
    expiresAt: review.expiresAt, status: 'pending_review', acceptedAt: null, publicationAuthorized: false, deploymentAuthorized: false }
  assert.equal(verifyCustomerReviewDecision(decision, review, now).status, 'pending_review')
  assert.equal(verifyCustomerReviewDecision({ ...decision, status: 'changes_requested' }, review, now).status, 'changes_requested')
  const accepted = { ...decision, status: 'accepted_for_operator_release_review', acceptedAt: new Date(now).toISOString() }
  assert.equal(verifyCustomerReviewDecision(accepted, review, now).status, accepted.status)
  for (const change of [{ reviewId: commandId }, { contentRevision: 1 }, { previewDigest: 'sha256:other' },
    { expiresAt: '2026-09-18T00:00:00Z' }, { acceptedAt: null }, { acceptedAt: 'invalid' },
    { acceptedAt: new Date(now + 60000).toISOString() }, { status: 'published' },
    { publicationAuthorized: true }, { deploymentAuthorized: true }, { actorId: 'private' }]) {
    assert.throws(() => verifyCustomerReviewDecision({ ...accepted, ...change }, review, now))
  }
  assert.throws(() => verifyCustomerReviewDecision(accepted, review, Date.parse(review.expiresAt)))
  assert.throws(() => verifyCustomerReviewDecision({ ...decision, acceptedAt: accepted.acceptedAt }, review, now))
})

test('acceptance requires exact durable receipt and rejects optimistic or cross-revision success', () => {
  const review = fixture()
  const request = { reviewId, commandId, previewDigest: review.previewDigest }
  const receipt = { ...request, contentRevision: 0, acceptedAt: new Date(now).toISOString(),
    status: 'accepted_for_operator_release_review', persisted: true, replayed: false,
    publicationAuthorized: false, deploymentAuthorized: false }
  assert.equal(verifyCustomerAcceptanceAcknowledgement(receipt, request, review, now).status, receipt.status)
  assert.equal(verifyCustomerAcceptanceAcknowledgement({ ...receipt, replayed: true }, request, review, now).acceptedAt, receipt.acceptedAt)
  for (const change of [{ commandId: reviewId }, { reviewId: commandId }, { previewDigest: 'bad' },
    { contentRevision: 1 }, { acceptedAt: 'bad' }, { status: 'queued' }, { persisted: false },
    { replayed: 'yes' }, { publicationAuthorized: true }, { deploymentAuthorized: true }, { extra: true }]) {
    assert.throws(() => verifyCustomerAcceptanceAcknowledgement({ ...receipt, ...change }, request, review, now))
  }
  assert.throws(() => verifyCustomerAcceptanceAcknowledgement(receipt, request, { ...review, reviewId: commandId }, now))
  assert.throws(() => verifyCustomerAcceptanceAcknowledgement(receipt, request, review, Date.parse(review.expiresAt)))
})
