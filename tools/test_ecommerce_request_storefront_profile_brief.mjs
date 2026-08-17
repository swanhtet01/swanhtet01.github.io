// Ecommerce request storefront profile brief: sourceStorefrontRevision + customerProfile.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceRequestStorefrontProfileBrief } from './ecommerce-request-storefront-profile-brief.ts'`,
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

const { projectEcommerceRequestStorefrontProfileBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function req({ sourceStorefrontRevision = null, sourceStorefrontActionId = null, customerProfile } = {}) {
  reqId++
  const obj = {
    id: `REQ-${reqId}`,
    schema: 'supermega.ecommerce.order-request.v2',
    createdAt: '2026-08-01T09:00:00Z',
    customerReference: `CUST-${reqId}`,
    status: 'pending',
    items: [],
    totalMmk: 1000,
    sourceStorefrontRevision,
    sourceStorefrontActionId,
  }
  if (customerProfile !== undefined) obj.customerProfile = customerProfile
  return obj
}

function profile(name, revision = 1) {
  return {
    schema: 'supermega.ecommerce.customer-profile.v1',
    id: `PROF-${name}`,
    revision,
    name,
    phone: '+95-9-000-0000',
    savedAt: '2026-08-01T00:00:00Z',
    previousDigest: null,
    profileDigest: `digest-${name}`,
  }
}

function state(requests) {
  return { schema: 'supermega.ecommerce.buying.v2', revision: 0, requests }
}

// 1. No requests → all zeros / nulls
{
  const r = projectEcommerceRequestStorefrontProfileBrief(state([]))
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.requestsWithStorefrontSource === 0, 'empty: requestsWithStorefrontSource 0')
  check(r.storefrontSourceRate === 0, 'empty: storefrontSourceRate 0')
  check(r.minStorefrontRevision === null, 'empty: minStorefrontRevision null')
  check(r.maxStorefrontRevision === null, 'empty: maxStorefrontRevision null')
  check(r.requestsWithCustomerProfile === 0, 'empty: requestsWithCustomerProfile 0')
  check(r.customerProfileRate === 0, 'empty: customerProfileRate 0')
  check(r.uniqueCustomerProfileNames === 0, 'empty: uniqueCustomerProfileNames 0')
  check(r.topCustomerProfileNamesByCount.length === 0, 'empty: top empty')
}

// 2. Requests without storefront source (null)
{
  const r = projectEcommerceRequestStorefrontProfileBrief(state([req(), req()]))
  check(r.totalRequests === 2, 'no-src: totalRequests 2')
  check(r.requestsWithStorefrontSource === 0, 'no-src: requestsWithStorefrontSource 0')
  check(r.storefrontSourceRate === 0, 'no-src: storefrontSourceRate 0')
  check(r.minStorefrontRevision === null, 'no-src: min null')
  check(r.maxStorefrontRevision === null, 'no-src: max null')
}

// 3. Single request with storefront revision
{
  const r = projectEcommerceRequestStorefrontProfileBrief(
    state([req({ sourceStorefrontRevision: 5, sourceStorefrontActionId: 'ACT-001' })]),
  )
  check(r.requestsWithStorefrontSource === 1, 'single-src: requestsWithStorefrontSource 1')
  check(r.storefrontSourceRate === 100, 'single-src: storefrontSourceRate 100')
  check(r.minStorefrontRevision === 5, 'single-src: min 5')
  check(r.maxStorefrontRevision === 5, 'single-src: max equals min')
}

// 4. Storefront revision range
{
  const r = projectEcommerceRequestStorefrontProfileBrief(
    state([
      req({ sourceStorefrontRevision: 3, sourceStorefrontActionId: 'A' }),
      req({ sourceStorefrontRevision: 7, sourceStorefrontActionId: 'B' }),
      req({ sourceStorefrontRevision: 1, sourceStorefrontActionId: 'C' }),
    ]),
  )
  check(r.minStorefrontRevision === 1, 'range: min 1')
  check(r.maxStorefrontRevision === 7, 'range: max 7')
  check(r.requestsWithStorefrontSource === 3, 'range: requestsWithStorefrontSource 3')
  check(r.storefrontSourceRate === 100, 'range: rate 100')
}

// 5. Mixed — some with storefront source, some without
{
  const r = projectEcommerceRequestStorefrontProfileBrief(
    state([
      req({ sourceStorefrontRevision: 2, sourceStorefrontActionId: 'A' }),
      req(),
      req({ sourceStorefrontRevision: 4, sourceStorefrontActionId: 'B' }),
      req(),
    ]),
  )
  check(r.totalRequests === 4, 'mixed-src: totalRequests 4')
  check(r.requestsWithStorefrontSource === 2, 'mixed-src: requestsWithStorefrontSource 2')
  check(r.storefrontSourceRate === 50, 'mixed-src: storefrontSourceRate 50')
}

// 6. Single request with customerProfile
{
  const r = projectEcommerceRequestStorefrontProfileBrief(
    state([req({ customerProfile: profile('Alice') })]),
  )
  check(r.requestsWithCustomerProfile === 1, 'profile: requestsWithCustomerProfile 1')
  check(r.customerProfileRate === 100, 'profile: customerProfileRate 100')
  check(r.uniqueCustomerProfileNames === 1, 'profile: uniqueCustomerProfileNames 1')
  check(r.topCustomerProfileNamesByCount[0]?.name === 'Alice', 'profile: top name Alice')
  check(r.topCustomerProfileNamesByCount[0]?.count === 1, 'profile: top count 1')
}

// 7. Customer profile name distribution
{
  const r = projectEcommerceRequestStorefrontProfileBrief(
    state([
      req({ customerProfile: profile('Alice') }),
      req({ customerProfile: profile('Alice') }),
      req({ customerProfile: profile('Bob') }),
    ]),
  )
  check(r.uniqueCustomerProfileNames === 2, 'name-dist: uniqueCustomerProfileNames 2')
  check(r.topCustomerProfileNamesByCount[0]?.name === 'Alice', 'name-dist: top Alice')
  check(r.topCustomerProfileNamesByCount[0]?.count === 2, 'name-dist: count 2')
}

// 8. Mixed — some with profile, some without
{
  const r = projectEcommerceRequestStorefrontProfileBrief(
    state([
      req({ customerProfile: profile('Alice') }),
      req(),
      req({ customerProfile: profile('Bob') }),
      req(),
    ]),
  )
  check(r.totalRequests === 4, 'mixed-profile: totalRequests 4')
  check(r.requestsWithCustomerProfile === 2, 'mixed-profile: requestsWithCustomerProfile 2')
  check(r.customerProfileRate === 50, 'mixed-profile: customerProfileRate 50')
}

// 9. Top-5 cap + tiebreak
{
  const names = ['Z-User', 'A-User', 'C-User', 'B-User', 'D-User', 'E-User']
  const r = projectEcommerceRequestStorefrontProfileBrief(
    state(names.map(n => req({ customerProfile: profile(n) }))),
  )
  check(r.topCustomerProfileNamesByCount.length === 5, 'top5: capped at 5')
  check(r.topCustomerProfileNamesByCount[0]?.name === 'A-User', 'top5: tiebreak A-User first')
}

// 10. Both storefront and profile present
{
  const r = projectEcommerceRequestStorefrontProfileBrief(
    state([
      req({ sourceStorefrontRevision: 3, sourceStorefrontActionId: 'A', customerProfile: profile('Alice') }),
      req({ sourceStorefrontRevision: 5, sourceStorefrontActionId: 'B', customerProfile: profile('Bob') }),
    ]),
  )
  check(r.requestsWithStorefrontSource === 2, 'both: requestsWithStorefrontSource 2')
  check(r.requestsWithCustomerProfile === 2, 'both: requestsWithCustomerProfile 2')
  check(r.minStorefrontRevision === 3, 'both: min 3')
  check(r.maxStorefrontRevision === 5, 'both: max 5')
  check(r.uniqueCustomerProfileNames === 2, 'both: uniqueCustomerProfileNames 2')
}

// 11. Storefront rate rounds: 1 of 3 → 33%
{
  const r = projectEcommerceRequestStorefrontProfileBrief(
    state([req({ sourceStorefrontRevision: 1, sourceStorefrontActionId: 'A' }), req(), req()]),
  )
  check(r.storefrontSourceRate === 33, 'round: storefrontSourceRate 33')
}

console.log(JSON.stringify({ ok: true, checks }))
