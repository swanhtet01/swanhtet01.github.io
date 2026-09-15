import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { customerWebsiteReviewLoginPath, managedLoginReviewPath } from '../showroom/src/core/account-routes.ts'

const id = '11111111-1111-4111-8111-111111111111'
test('review login round-trip retains only the canonical review ID', () => {
  const link = customerWebsiteReviewLoginPath(id)
  assert.equal(link, `/login?product=website&review=${id}`)
  assert.equal(managedLoginReviewPath(link.slice(link.indexOf('?'))), `/website/review/${id}`)
  assert.equal(managedLoginReviewPath(`?review=${id}&workspace=other&returnTo=https://example.invalid`), `/website/review/${id}`)
})
test('malformed, ambiguous and external destinations never become return paths', () => {
  for (const value of ['', 'https://example.invalid', '//example.invalid', '../settings', `${id}/`, `${id}?a=b`,
    `${id}#private`, `${id}\n`, `${id}\r`, ` ${id}`, id.toUpperCase().replace('11111111', 'AAAAAAAA'), '%2fsettings', '\\example.invalid']) {
    assert.equal(customerWebsiteReviewLoginPath(value), '/login?product=website', value)
    assert.equal(managedLoginReviewPath(`?review=${encodeURIComponent(value)}`), null, value)
  }
  assert.equal(managedLoginReviewPath(`?review=${id}&review=${id}`), null)
  assert.equal(managedLoginReviewPath('?returnTo=/website/review/' + id), null)
  assert.equal(managedLoginReviewPath(''), null)
})
test('login retains existing membership/bootstrap checks before navigation', () => {
  const source = readFileSync(new URL('../showroom/src/core/ManagedLoginPage.tsx', import.meta.url), 'utf8')
  const fn = source.slice(source.indexOf('async function openWorkspace('), source.indexOf('async function submit('))
  const membership = fn.indexOf('await completeManagedWorkspaceSignIn(signIn, selectedWorkspaceId)')
  const bootstrap = fn.indexOf('await loadManagedBootstrap(identity)')
  const navigation = fn.indexOf('navigate(portalEntryPath)')
  assert.ok(membership >= 0 && membership < bootstrap && bootstrap < navigation)
  assert.ok(source.includes('reviewReturnPath ?? managedPortalEntryPath(productIntent)'))
  const review = readFileSync(new URL('../showroom/src/products/website/WebsiteCustomerReview.tsx', import.meta.url), 'utf8')
  assert.ok(review.includes('<Link to={customerWebsiteReviewLoginPath(reviewId)}>Sign in</Link>'))
  assert.ok(!review.includes('target="_blank"'))
})
