import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { pairedClickScript, validatePairedTransition } from './paired_preview_transition.mjs'
const publicOrigin = 'https://public-123.vercel.app', appOrigin = 'https://app-123.vercel.app'
const target = `${appOrigin}/shop/?tab=today`
test('generated click script activates only one visible exact same-tab primary action', () => {
  let clicks = 0
  const action = { href: target, target: '', getClientRects: () => [1], hasAttribute: () => false, getAttribute: () => null, click: () => { clicks++ } }
  let links = [action]
  const context = { location: { origin: publicOrigin, pathname: '/', search: '', hash: '' },
    document: { querySelectorAll: () => links }, getComputedStyle: () => ({ visibility: 'visible' }) }
  const run = () => runInNewContext(pairedClickScript(publicOrigin, appOrigin), context)
  assert.equal(run().href, target); assert.equal(clicks, 1)
  links = [action, action]; assert.throws(run, /ambiguous/)
  links = [{ ...action, href: 'https://evil.example/' }]; assert.throws(run, /ambiguous/)
  links = [{ ...action, target: '_blank' }]; assert.throws(run, /unusable/)
  assert.equal(clicks, 1)
})
function fixture() {
  return { publicOrigin, appOrigin, click: { publicOrigin, fromPath: '/', href: target, activated: true },
    beforeCapture: { origin: appOrigin, path: '/shop/?tab=today', hash: '' },
    afterCapture: { origin: appOrigin, path: '/shop/?tab=today', hash: '' },
    requests: [{ method: 'GET', url: publicOrigin }, { method: 'GET', url: target }] }
}
test('transition requires both origin observations and denies redirects, writes and missing proof', () => {
  assert.equal(validatePairedTransition(fixture()).destinationStable, true)
  for (const mutate of [x => { x.click = null }, x => { x.afterCapture.origin = publicOrigin },
    x => { x.beforeCapture.path = '/login' }, x => { x.afterCapture.hash = '#else' },
    x => { x.requests = [] }, x => { x.requests.pop() },
    x => { x.requests.push({ method: 'POST', url: target }) },
    x => { x.requests.push({ method: 'GET', url: 'https://evil.example/' }) }]) {
    const input = fixture(); mutate(input); assert.throws(() => validatePairedTransition(input))
  }
})
