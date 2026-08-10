// Composition guard: a factory batch becoming sellable Shop stock.
//
// This is the only seam that crosses PRODUCTS. Plant releases a finished batch, Shop receives
// it, and from that moment it is stock a customer can buy. If the two sides disagree about
// what a release is, a manufacturer either cannot sell what it made, or -- worse -- counts
// the same batch twice and oversells it.
//
// The binding that makes this safe is that the receipt's evidence reference is DERIVED, not
// typed: it must be exactly PLANT-BATCH:<releaseId>:<sourceCommandDigest>:<locationId>. A
// batch cannot be received without naming the exact Plant release and the digest of the
// command that produced it, so a receipt cannot be invented at the Shop end.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { createSeedCommerce, receiveCommerceProductionBatch } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/plant-shop-journey-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { createSeedCommerce, receiveCommerceProductionBatch } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const RELEASE_ID = 'QREL-2026-0725-01'
const COMMAND_DIGEST = `sha256:${'b'.repeat(64)}`
const RELEASED_AT = '2026-07-25T08:00:00.000Z'
const RECEIVED_AT = '2026-07-25T09:00:00.000Z'
const MADE = 24

const seed = createSeedCommerce()
const item = seed.items[0]
check(Boolean(item), 'the Shop catalog has an item the factory can produce into')

const receipt = {
  releaseId: RELEASE_ID,
  sourceCommandDigest: COMMAND_DIGEST,
  jobId: 'JOB-201',
  outputBatchId: 'BATCH-2026-0725-01',
  releasedAt: RELEASED_AT,
  sourceProduct: 'Batch Alpha',
  sku: item.sku,
  quantity: MADE,
}

// The evidence reference is derived from the receipt itself -- see the note above.
// LOC-MAIN is the default location when no locationReceipt is supplied -- the reference must
// name it explicitly, so an empty or wrong location does not match.
const evidenceFor = (locationId = 'LOC-MAIN') => `PLANT-BATCH:${RELEASE_ID}:${COMMAND_DIGEST}:${locationId}`
const proof = (overrides = {}) => ({
  actionId: 'ACT-PLANT-BATCH-1',
  capturedAt: RECEIVED_AT,
  actor: OPERATOR,
  reason: 'Received the released batch into shop stock',
  evidenceReference: evidenceFor(),
  ...overrides,
})

// --- the batch becomes stock ---------------------------------------------------
const received = receiveCommerceProductionBatch(seed, receipt, proof())
check(received !== null, 'THE SEAM HOLDS: a released factory batch is received into Shop stock')
check(
  received.items.find((candidate) => candidate.sku === item.sku).onHand === item.onHand + MADE,
  `stock rises by exactly what was made (${item.onHand} + ${MADE})`,
)

const movement = received.movements.find((entry) => entry.productionReleaseId === RELEASE_ID)
check(Boolean(movement), 'the receipt is recorded as a stock movement')
check(movement.kind === 'production_receipt', 'marked as a production receipt rather than a purchase')
check(movement.quantityDelta === MADE, 'for the released quantity')
check(movement.productionJobId === 'JOB-201', 'naming the Plant job it came from')
check(movement.productionOutputBatchId === 'BATCH-2026-0725-01', 'and the output batch, so the goods are traceable to the floor')
check(movement.productionCommandDigest === COMMAND_DIGEST, 'and the digest of the command that produced it')

// --- the same release cannot be banked twice ----------------------------------
// This is the one that would oversell: the same batch counted as two.
const replayed = receiveCommerceProductionBatch(received, receipt, proof())
check(replayed !== null, 'replaying the identical receipt is accepted rather than erroring')
check(
  replayed.items.find((candidate) => candidate.sku === item.sku).onHand
    === received.items.find((candidate) => candidate.sku === item.sku).onHand,
  'and adds NO further stock -- the same release cannot be banked twice',
)
check(
  replayed.movements.filter((entry) => entry.productionReleaseId === RELEASE_ID).length === 1,
  'with still exactly one movement for that release',
)

// --- the evidence reference cannot be invented --------------------------------
check(
  receiveCommerceProductionBatch(seed, receipt, proof({ evidenceReference: 'Received a batch from the factory' })) === null,
  'a free-text evidence reference is refused -- it must name the release and its digest',
)
check(
  receiveCommerceProductionBatch(seed, receipt, proof({ evidenceReference: evidenceFor('LOC-OTHER') })) === null,
  'an evidence reference naming a DIFFERENT valid location is refused -- LOC-OTHER is well formed, it is just not where the batch landed',
)
check(
  receiveCommerceProductionBatch(seed, { ...receipt, sourceCommandDigest: `sha256:${'c'.repeat(64)}` }, proof()) === null,
  'a receipt whose command digest disagrees with its evidence reference is refused',
)

// --- a receipt cannot predate the release it claims ---------------------------
check(
  receiveCommerceProductionBatch(seed, receipt, proof({ capturedAt: '2026-07-25T07:00:00.000Z' })) === null,
  'receiving a batch BEFORE it was released is refused',
)

// --- quantity and catalog -----------------------------------------------------
for (const [quantity, label] of [[0, 'zero'], [-1, 'negative'], [1.5, 'fractional']]) {
  check(
    receiveCommerceProductionBatch(seed, { ...receipt, quantity }, proof()) === null,
    `a released quantity of ${label} is refused`,
  )
}
check(
  receiveCommerceProductionBatch(seed, { ...receipt, sku: 'SM-NOT-IN-CATALOG' }, proof()) === null,
  'a batch for a SKU the Shop does not carry is refused -- Plant cannot invent catalog items',
)

// --- the original state is untouched ------------------------------------------
check(
  seed.items.find((candidate) => candidate.sku === item.sku).onHand === item.onHand,
  'receiving returns new state rather than mutating the caller\'s',
)

console.log(`plant-to-shop journey contract: ${checks} checks passed`)
