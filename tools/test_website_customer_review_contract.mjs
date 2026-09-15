import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { verifyCustomerWebsiteReview, verifyCustomerChangeAcknowledgement } from '../showroom/src/products/website/customer-review-contract.ts'

const reviewId = '11111111-1111-4111-8111-111111111111'
const commandId = '22222222-2222-4222-8222-222222222222'
const now = Date.parse('2026-09-16T00:00:00Z')
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
  const slice = source.slice(source.indexOf('export async function loadManagedWebsiteReview'), source.indexOf('export async function preflightManagedClientImport'))
  assert.equal((slice.match(/redirect: 'error'/g) ?? []).length, 2)
  assert.equal((slice.match(/cache: 'no-store'/g) ?? []).length, 2)
  assert.equal((slice.match(/credentials: 'omit'/g) ?? []).length, 2)
  assert.equal((slice.match(/true, expectedIdentity/g) ?? []).length, 2)
})
