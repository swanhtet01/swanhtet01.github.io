// Contract guard for the Shop inventory foundation -- the event-sourced ledger behind
// multi-location stock.
//
// Two properties matter here and neither is obvious from the API. Stock is CONSERVED: a
// transfer moves quantity between locations without creating or destroying any. And every
// command carries an expectedHeadDigest, so a write computed against a stale view of the
// ledger is refused rather than applied on top of whatever happened since -- the same
// optimistic-concurrency shape as the Website edit session, but protecting stock.
//
// This is opt-in (no seeded workspace enables it), which is exactly why it had no coverage.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createEmptyShopInventoryState, buildShopInventoryImportPackage, applyShopInventoryImport,
      transferShopInventory, projectShopInventory,
    } from './shop-inventory-foundation.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/inventory-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createEmptyShopInventoryState, buildShopInventoryImportPackage, applyShopInventoryImport,
  transferShopInventory, projectShopInventory,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
function rejects(run, label) {
  checks += 1
  assert.throws(run, undefined, label)
}

const SKU = 'SM-1001'
const CATALOG = [SKU]
const FRONT = 'LOC-FRONT'
const BACK = 'LOC-BACK'
const LOT = 'LOT-A1'
const OPENING = 40

const proof = (actionId, capturedAt = '2026-07-24T09:00:00.000Z') => ({
  actionId,
  capturedAt,
  actor: 'Swan Htet',
  reason: 'Opening stock take for the parts counter',
  evidenceReference: `INV-${actionId}`,
})

const importPackage = buildShopInventoryImportPackage({
  importId: 'IMP-OPENING-1',
  sourceDigest: `sha256:${'a'.repeat(64)}`,
  catalogSkus: CATALOG,
  clients: [{ id: 'CLI-COUNTER', name: 'Counter customers' }],
  vendors: [{ id: 'VEN-PARTS', name: 'Yangon Parts Supply' }],
  // Canonical identifier order is required, which is what makes the package digest
  // deterministic: LOC-BACK sorts before LOC-FRONT.
  locations: [{ id: BACK, name: 'Back store' }, { id: FRONT, name: 'Front counter' }],
  stockUnits: [{ id: LOT, sku: SKU, tracking: 'lot', trackingCode: 'LOT-A1' }],
  openings: [{ stockUnitId: LOT, locationId: BACK, vendorId: 'VEN-PARTS', quantity: OPENING }],
})
check(Boolean(importPackage), 'an opening import package can be built')

const empty = createEmptyShopInventoryState()
check(empty.revision === 0, 'a fresh ledger starts at revision 0')
check(empty.commands.length === 0, 'with no commands')

// --- importing the opening balance -------------------------------------------
// appendCommand-based writers return { state, replayed } rather than the state itself --
// `replayed` distinguishes a genuine append from an idempotent re-application.
const importResult = applyShopInventoryImport(empty, importPackage, proof('ACT-IMPORT-1'), CATALOG, empty.headDigest)
check(Boolean(importResult?.state), 'the opening import applies to an empty ledger')
check(importResult.replayed === false, 'and is a genuine append, not a replay')
const imported = importResult.state
check(imported.revision === 1, 'and advances the revision to 1')
check(imported.headDigest !== empty.headDigest, 'and moves the head digest')

const opened = projectShopInventory(imported, CATALOG)
const balanceAt = (projection, locationId) => {
  const row = projection.balances.find((entry) => entry.stockUnitId === LOT && entry.locationId === locationId)
  return row ? row.onHand : 0
}
check(balanceAt(opened, BACK) === OPENING, `the back store holds the opening ${OPENING}`)
check(balanceAt(opened, FRONT) === 0, 'and the front counter holds nothing yet')

// --- a transfer conserves stock ----------------------------------------------
const MOVED = 15
const moveResult = transferShopInventory(imported, {
  transferId: 'TRF-1', stockUnitId: LOT, fromLocationId: BACK, toLocationId: FRONT,
  quantity: MOVED, proof: proof('ACT-TRANSFER-1'), catalogSkus: CATALOG,
  expectedHeadDigest: imported.headDigest,
})
check(Boolean(moveResult?.state), 'stock can be transferred between locations')
check(moveResult.replayed === false, 'and the transfer is a genuine append')
const moved = moveResult.state

const after = projectShopInventory(moved, CATALOG)
check(balanceAt(after, BACK) === OPENING - MOVED, `the back store is down to ${OPENING - MOVED}`)
check(balanceAt(after, FRONT) === MOVED, `and the front counter is up to ${MOVED}`)
check(
  balanceAt(after, BACK) + balanceAt(after, FRONT) === OPENING,
  'total stock is CONSERVED -- a transfer moves quantity, it does not create or destroy it',
)

// --- you cannot move stock that is not there ---------------------------------
rejects(
  () => transferShopInventory(moved, {
    transferId: 'TRF-OVER', stockUnitId: LOT, fromLocationId: FRONT, toLocationId: BACK,
    quantity: MOVED + 1, proof: proof('ACT-TRANSFER-OVER'), catalogSkus: CATALOG,
    expectedHeadDigest: moved.headDigest,
  }),
  'transferring more than a location holds is refused',
)
for (const bad of [0, -1, 1.5]) {
  rejects(
    () => transferShopInventory(moved, {
      transferId: `TRF-${bad}`, stockUnitId: LOT, fromLocationId: BACK, toLocationId: FRONT,
      quantity: bad, proof: proof(`ACT-TRANSFER-${bad}`), catalogSkus: CATALOG,
      expectedHeadDigest: moved.headDigest,
    }),
    `a transfer of ${bad} units is refused`,
  )
}
rejects(
  () => transferShopInventory(moved, {
    transferId: 'TRF-SAME', stockUnitId: LOT, fromLocationId: BACK, toLocationId: BACK,
    quantity: 1, proof: proof('ACT-TRANSFER-SAME'), catalogSkus: CATALOG,
    expectedHeadDigest: moved.headDigest,
  }),
  'a transfer from a location to itself is refused',
)

// --- optimistic concurrency ---------------------------------------------------
// This is the property that is invisible until two people move stock at once. The digest
// the caller computed its move against must still be the head, or the move is refused.
rejects(
  () => transferShopInventory(moved, {
    transferId: 'TRF-STALE', stockUnitId: LOT, fromLocationId: BACK, toLocationId: FRONT,
    quantity: 1, proof: proof('ACT-TRANSFER-STALE'), catalogSkus: CATALOG,
    expectedHeadDigest: imported.headDigest,
  }),
  'a transfer computed against a STALE head digest is refused, not applied on top',
)
check(
  imported.headDigest !== moved.headDigest,
  'and those two digests really do differ, so that rejection is meaningful',
)

// --- the ledger is append-only and replayable --------------------------------
check(moved.commands.length === 2, 'both commands are retained in order')
check(moved.revision === 2, 'and the revision counts them')
check(
  JSON.stringify(projectShopInventory(moved, CATALOG).balances)
    === JSON.stringify(projectShopInventory(structuredClone(moved), CATALOG).balances),
  'projecting the same ledger twice gives the same balances -- the replay is deterministic',
)

// --- a SKU outside the trusted catalog cannot be smuggled in -----------------
rejects(
  () => projectShopInventory(moved, ['SM-DIFFERENT']),
  'projecting against a catalog that does not contain the ledger SKU is refused',
)

// --- layered guard, recorded so the count is not over-read -------------------
// The explicit available-to-promise check on a transfer can be deleted and every check here
// still passes: applyDelta refuses the resulting negative balance with "commands[N].payload
// would make on-hand or reserved stock invalid." Verified by running the mutated build.
// The over-transfer BEHAVIOUR is protected twice; this file proves the behaviour, not that
// either individual clause is load-bearing.

console.log(`shop inventory foundation contract: ${checks} checks passed`)
