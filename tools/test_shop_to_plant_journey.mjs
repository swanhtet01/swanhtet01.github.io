// Composition guard: shop stock issued to the factory floor.
//
// The other direction of the Plant/Shop material loop. tools/test_plant_to_shop_journey.mjs
// covers a finished batch coming back as sellable stock; this covers the raw material going
// out. Both halves have to conserve, or a manufacturer's stock figure drifts every cycle:
// issue 10 kg and lose 12, or issue 10 and lose none, and by the end of a week nobody knows
// what is in the building.
//
// The rule that costs real money here is that the same material request cannot be issued
// twice. A retried click must not send a second batch of raw material to the floor.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { createSeedCommerce, issueCommerceStockToProduction } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-plant-journey-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { createSeedCommerce, issueCommerceStockToProduction } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const COMMAND_DIGEST = `sha256:${'d'.repeat(64)}`
const ISSUED = 5

const seed = createSeedCommerce()
const item = seed.items.find((candidate) => candidate.onHand > ISSUED + 2)
check(Boolean(item), 'the shop holds enough of something to issue to the floor')

const request = (requestId) => ({
  requestId,
  sourceCommandDigest: COMMAND_DIGEST,
  jobId: 'JOB-201',
  materialId: 'MAT-ALPHA',
  inputLotId: 'LOT-IN-1',
  quantityMilli: ISSUED * 1_000,
  unit: 'kg',
})

const proof = (actionId, overrides = {}) => ({
  actionId,
  capturedAt: '2026-07-25T08:00:00.000Z',
  actor: OPERATOR,
  reason: 'Issued raw material for the morning batch',
  evidenceReference: `PLANT-ISSUE-${actionId}`,
  ...overrides,
})

const onHandOf = (state) => state.items.find((candidate) => candidate.sku === item.sku).onHand

// --- stock leaves the shop ----------------------------------------------------
const issued = issueCommerceStockToProduction(
  seed, request('PMR-1'), item.sku, ISSUED, 'Converted 5 units to 5 kg for Line 01', proof('ACT-ISSUE-1'),
)
check(issued !== null, 'THE SEAM HOLDS: shop stock can be issued to a production job')
check(
  onHandOf(issued) === item.onHand - ISSUED,
  `stock falls by exactly what was issued (${item.onHand} - ${ISSUED})`,
)

const movement = issued.movements.find((entry) => entry.productionRequestId === 'PMR-1')
check(Boolean(movement), 'the issue is recorded as a stock movement')
check(movement.quantityDelta === -ISSUED, 'as a negative delta -- material left the building')
check(movement.productionJobId === 'JOB-201', 'naming the job it went to')
check(movement.productionCommandDigest === COMMAND_DIGEST, 'and the digest of the command that requested it')

// --- the same request cannot be issued twice ----------------------------------
// The failure that would quietly drain a shop: a retried click sending a second batch.
const replayed = issueCommerceStockToProduction(
  issued, request('PMR-1'), item.sku, ISSUED, 'Converted 5 units to 5 kg for Line 01', proof('ACT-ISSUE-1'),
)
check(replayed !== null, 'replaying the identical issue is accepted rather than erroring')
check(
  onHandOf(replayed) === onHandOf(issued),
  'and removes NO further stock -- the same material request cannot be issued twice',
)
check(
  replayed.movements.filter((entry) => entry.productionRequestId === 'PMR-1').length === 1,
  'with still exactly one movement for that request',
)

// A DIFFERENT action id against the same request is a different event, and refused.
check(
  issueCommerceStockToProduction(
    issued, request('PMR-1'), item.sku, ISSUED, 'Converted 5 units to 5 kg for Line 01', proof('ACT-ISSUE-2'),
  ) === null,
  'the same request issued under a new action id is refused, not applied again',
)

// --- you cannot issue stock that is not there ---------------------------------
check(
  issueCommerceStockToProduction(
    seed, request('PMR-OVER'), item.sku, item.onHand + 1, 'More than exists', proof('ACT-ISSUE-OVER'),
  ) === null,
  'issuing more than is on hand is refused -- stock cannot go negative to feed the floor',
)
check(
  issueCommerceStockToProduction(
    seed, request('PMR-EXACT'), item.sku, item.onHand, 'Everything on hand', proof('ACT-ISSUE-EXACT'),
  ) !== null,
  'issuing exactly what is on hand is allowed',
)

for (const [quantity, label] of [[0, 'zero'], [-1, 'negative'], [1.5, 'fractional']]) {
  check(
    issueCommerceStockToProduction(
      seed, request(`PMR-${label}`), item.sku, quantity, 'Bad quantity', proof(`ACT-ISSUE-${label}`),
    ) === null,
    `issuing a ${label} quantity is refused`,
  )
}

// --- the request itself has to be well formed ---------------------------------
check(
  issueCommerceStockToProduction(
    seed, { ...request('PMR-BADDIGEST'), sourceCommandDigest: 'not-a-digest' }, item.sku, ISSUED, 'note', proof('ACT-BD'),
  ) === null,
  'a request whose command digest is not a SHA-256 reference is refused',
)
check(
  issueCommerceStockToProduction(
    seed, { ...request('PMR-BADUNIT'), unit: 'furlongs' }, item.sku, ISSUED, 'note', proof('ACT-BU'),
  ) === null,
  'a request in an unsupported unit is refused',
)
check(
  issueCommerceStockToProduction(
    seed, request('PMR-BADSKU'), 'SM-NOT-IN-CATALOG', ISSUED, 'note', proof('ACT-BS'),
  ) === null,
  'issuing a SKU the shop does not carry is refused',
)

// --- the caller's state is untouched ------------------------------------------
check(onHandOf(seed) === item.onHand, 'issuing returns new state rather than mutating the caller\'s')

// --- what this file does NOT cover, and why ----------------------------------
// The return leg (returnCommerceStockFromProduction) is deliberately absent. It requires a
// stockUnitId, locationId and expectedInventoryHeadDigest -- i.e. the inventory foundation --
// and no seeded workspace enables that, so constructing it would mean building a ledger by
// hand rather than exercising the path a shop takes.
//
// A round-trip assertion was written here first and then removed: onHandOf(issued) + ISSUED
// === item.onHand is ALGEBRA, not a test. It restates the earlier assertion and would pass
// with the return leg deleted entirely, while its label claimed the loop conserves. The
// outbound half is what this file proves; the inbound half is proved by
// tools/test_plant_to_shop_journey.mjs. Neither proves the round trip, and saying so is
// better than a check that reads as though it does.

console.log(`shop-to-plant journey contract: ${checks} checks passed`)
