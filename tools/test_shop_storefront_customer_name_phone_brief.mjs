// Shop storefront customer name/phone brief: name and phone distributions on customerProfile.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopStorefrontCustomerNamePhoneBrief } from './shop-storefront-customer-name-phone-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopStorefrontCustomerNamePhoneBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

let reqId = 0
let profileId = 0

function profile(name, phone) {
  profileId++
  return {
    schema: 'supermega.ecommerce.customer_profile_snapshot.v1',
    id: `PROFILE-${profileId}`,
    revision: 1,
    name,
    phone,
    savedAt: '2026-08-12T09:00:00Z',
    previousDigest: null,
    profileDigest: `digest-${profileId}`,
  }
}

function request(customerProfile) {
  reqId++
  const base = {
    id: `REQ-${reqId}`,
    schema: 'supermega.ecommerce.storefront_request.v2',
    createdAt: '2026-08-12T09:00:00Z',
    channel: 'web',
    status: 'open',
  }
  if (customerProfile !== undefined) base.customerProfile = customerProfile
  return base
}

function state(storefrontRequests) {
  const base = { schema: SCHEMA, items: [], orders: [], movements: [], closes: [] }
  if (storefrontRequests !== undefined) base.storefrontRequests = storefrontRequests
  return base
}

// 1. No storefrontRequests → all zeros
{
  const r = projectShopStorefrontCustomerNamePhoneBrief(state(undefined))
  check(r.totalProfiles === 0, 'no-requests: totalProfiles 0')
  check(r.uniqueNames === 0, 'no-requests: uniqueNames 0')
  check(r.uniquePhoneNumbers === 0, 'no-requests: uniquePhoneNumbers 0')
}

// 2. Request with no customerProfile
{
  const r = projectShopStorefrontCustomerNamePhoneBrief(state([request(undefined)]))
  check(r.totalProfiles === 0, 'no-profile: totalProfiles 0')
  check(r.uniqueNames === 0, 'no-profile: uniqueNames 0')
}

// 3. Single request with profile
{
  const r = projectShopStorefrontCustomerNamePhoneBrief(state([
    request(profile('Aung Kyaw', '+959123456789')),
  ]))
  check(r.totalProfiles === 1, 'single: totalProfiles 1')
  check(r.uniqueNames === 1, 'single: uniqueNames 1')
  check(r.topNamesByCount[0]?.name === 'Aung Kyaw', 'single: top name')
  check(r.uniquePhoneNumbers === 1, 'single: uniquePhoneNumbers 1')
  check(r.topPhonesByCount[0]?.phone === '+959123456789', 'single: top phone')
}

// 4. Same name, different phones → uniqueNames=1, uniquePhoneNumbers=2
{
  const r = projectShopStorefrontCustomerNamePhoneBrief(state([
    request(profile('Ko Ko', '+959111111111')),
    request(profile('Ko Ko', '+959222222222')),
  ]))
  check(r.totalProfiles === 2, 'same-name-diff-phone: totalProfiles 2')
  check(r.uniqueNames === 1, 'same-name-diff-phone: uniqueNames 1')
  check(r.topNamesByCount[0]?.count === 2, 'same-name-diff-phone: top name count 2')
  check(r.uniquePhoneNumbers === 2, 'same-name-diff-phone: uniquePhoneNumbers 2')
}

// 5. Multiple distinct names and phones
{
  const r = projectShopStorefrontCustomerNamePhoneBrief(state([
    request(profile('Alice', '+959111111111')),
    request(profile('Bob', '+959222222222')),
    request(profile('Alice', '+959333333333')),
  ]))
  check(r.uniqueNames === 2, 'distinct: uniqueNames 2')
  check(r.topNamesByCount[0]?.name === 'Alice', 'distinct: top name is Alice')
  check(r.topNamesByCount[0]?.count === 2, 'distinct: top name count 2')
  check(r.uniquePhoneNumbers === 3, 'distinct: uniquePhoneNumbers 3')
}

// 6. Top-5 cap: 6 distinct names → capped at 5 with tiebreak
{
  const names = ['Frank', 'Alice', 'Carol', 'Bob', 'Dave', 'Eve']
  const reqs = names.map(n => request(profile(n, '+959100000000')))
  const r = projectShopStorefrontCustomerNamePhoneBrief(state(reqs))
  check(r.uniqueNames === 6, 'top5: uniqueNames 6')
  check(r.topNamesByCount.length === 5, 'top5: capped at 5')
  check(r.topNamesByCount[0]?.name === 'Alice', 'top5: tiebreak alphabetic Alice first')
}

console.log(JSON.stringify({ ok: true, checks }))
