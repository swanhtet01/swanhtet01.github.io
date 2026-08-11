// Ecommerce delivery address instructions brief: instructions presence + distribution.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectEcommerceDeliveryAddressInstructionsBrief } from './ecommerce-delivery-address-instructions-brief.ts'`,
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

const { projectEcommerceDeliveryAddressInstructionsBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

let reqId = 0
function addr({ instructions = null } = {}) {
  return {
    schema: 'supermega.ecommerce.delivery_address_snapshot.v1',
    id: `ADDR-${++reqId}`,
    revision: 1,
    line1: '123 Main St',
    township: 'Hlaing',
    city: 'Yangon',
    instructions,
    savedAt: '2026-08-01T00:00:00Z',
    previousDigest: null,
    addressDigest: `digest-${reqId}`,
  }
}

function req({ deliveryAddress } = {}) {
  reqId++
  const obj = {
    id: `REQ-${reqId}`,
    schema: 'supermega.ecommerce.order-request.v2',
    createdAt: '2026-08-01T09:00:00Z',
    customerReference: `CUST-${reqId}`,
    status: 'pending',
    items: [],
    totalMmk: 1000,
    sourceStorefrontRevision: null,
    sourceStorefrontActionId: null,
  }
  if (deliveryAddress !== undefined) obj.deliveryAddress = deliveryAddress
  return obj
}

function state(requests) {
  return { schema: 'supermega.ecommerce.buying.v2', revision: 0, requests }
}

// 1. No requests
{
  const r = projectEcommerceDeliveryAddressInstructionsBrief(state([]))
  check(r.totalRequests === 0, 'empty: totalRequests 0')
  check(r.requestsWithDeliveryAddress === 0, 'empty: requestsWithDeliveryAddress 0')
  check(r.requestsWithInstructions === 0, 'empty: requestsWithInstructions 0')
  check(r.instructionsPresenceRate === 0, 'empty: instructionsPresenceRate 0')
  check(r.uniqueInstructions === 0, 'empty: uniqueInstructions 0')
  check(r.topInstructionsByCount.length === 0, 'empty: top empty')
}

// 2. Requests without delivery address
{
  const r = projectEcommerceDeliveryAddressInstructionsBrief(state([req(), req()]))
  check(r.totalRequests === 2, 'no-addr: totalRequests 2')
  check(r.requestsWithDeliveryAddress === 0, 'no-addr: requestsWithDeliveryAddress 0')
  check(r.requestsWithInstructions === 0, 'no-addr: requestsWithInstructions 0')
  check(r.instructionsPresenceRate === 0, 'no-addr: instructionsPresenceRate 0')
}

// 3. Delivery address but instructions null
{
  const r = projectEcommerceDeliveryAddressInstructionsBrief(
    state([req({ deliveryAddress: addr({ instructions: null }) })]),
  )
  check(r.requestsWithDeliveryAddress === 1, 'null-instr: requestsWithDeliveryAddress 1')
  check(r.requestsWithInstructions === 0, 'null-instr: requestsWithInstructions 0')
  check(r.instructionsPresenceRate === 0, 'null-instr: instructionsPresenceRate 0')
  check(r.uniqueInstructions === 0, 'null-instr: uniqueInstructions 0')
}

// 4. Delivery address with instructions
{
  const r = projectEcommerceDeliveryAddressInstructionsBrief(
    state([req({ deliveryAddress: addr({ instructions: 'Leave at gate' }) })]),
  )
  check(r.requestsWithInstructions === 1, 'instr: requestsWithInstructions 1')
  check(r.instructionsPresenceRate === 100, 'instr: instructionsPresenceRate 100')
  check(r.uniqueInstructions === 1, 'instr: uniqueInstructions 1')
  check(r.topInstructionsByCount[0]?.text === 'Leave at gate', 'instr: top text')
  check(r.topInstructionsByCount[0]?.count === 1, 'instr: top count 1')
}

// 5. Instructions distribution
{
  const r = projectEcommerceDeliveryAddressInstructionsBrief(
    state([
      req({ deliveryAddress: addr({ instructions: 'Call on arrival' }) }),
      req({ deliveryAddress: addr({ instructions: 'Call on arrival' }) }),
      req({ deliveryAddress: addr({ instructions: 'Leave at gate' }) }),
    ]),
  )
  check(r.uniqueInstructions === 2, 'dist: uniqueInstructions 2')
  check(r.topInstructionsByCount[0]?.text === 'Call on arrival', 'dist: top text')
  check(r.topInstructionsByCount[0]?.count === 2, 'dist: top count 2')
}

// 6. Mixed — with and without delivery address
{
  const r = projectEcommerceDeliveryAddressInstructionsBrief(
    state([
      req({ deliveryAddress: addr({ instructions: 'Ring bell' }) }),
      req(),
      req({ deliveryAddress: addr({ instructions: null }) }),
      req(),
    ]),
  )
  check(r.totalRequests === 4, 'mixed: totalRequests 4')
  check(r.requestsWithDeliveryAddress === 2, 'mixed: requestsWithDeliveryAddress 2')
  check(r.requestsWithInstructions === 1, 'mixed: requestsWithInstructions 1')
  check(r.instructionsPresenceRate === 50, 'mixed: instructionsPresenceRate 50')
}

// 7. Rate rounds: 1 of 3 addresses have instructions → 33%
{
  const r = projectEcommerceDeliveryAddressInstructionsBrief(
    state([
      req({ deliveryAddress: addr({ instructions: 'Note' }) }),
      req({ deliveryAddress: addr({ instructions: null }) }),
      req({ deliveryAddress: addr({ instructions: null }) }),
    ]),
  )
  check(r.instructionsPresenceRate === 33, 'round: instructionsPresenceRate 33')
}

// 8. Top-5 cap + tiebreak
{
  const texts = ['Zebra note', 'Alpha note', 'Charlie note', 'Beta note', 'Delta note', 'Echo note']
  const r = projectEcommerceDeliveryAddressInstructionsBrief(
    state(texts.map(t => req({ deliveryAddress: addr({ instructions: t }) }))),
  )
  check(r.topInstructionsByCount.length === 5, 'top5: capped at 5')
  check(r.topInstructionsByCount[0]?.text === 'Alpha note', 'top5: tiebreak Alpha first')
}

// 9. Delivery address null (not undefined) also counts as no address
{
  const obj = req()
  obj.deliveryAddress = null
  const r = projectEcommerceDeliveryAddressInstructionsBrief(state([obj]))
  check(r.requestsWithDeliveryAddress === 0, 'null-addr: not counted')
}

console.log(JSON.stringify({ ok: true, checks }))
