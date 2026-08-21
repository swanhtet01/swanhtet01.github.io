// Contract guard for the Shop workspace archive -- the readable copy of a shop's whole
// trading history, and the file the storage-headroom warning tells an owner to keep.
//
// The property that carries the weight here is COMPLETENESS, and it is not the obvious one.
// An archive that drops a record type is worse than no archive, because the owner stops
// looking for what is missing. Two classes of record can legitimately fail to reach a close
// export and both were quietly droppable with a `.filter(Boolean)`:
//
//   - a legacy close taken before the device recorded who closed the day, which
//     commerceDailyCloseExport refuses outright; and
//   - any order not on an archived close -- today's un-closed sales, and every order
//     belonging to a close in the first category.
//
// So the assertions below never check a fixed number. They re-derive what the workspace
// holds and demand the artifact account for all of it: every order is either archived or
// carries a named gap row, and the totals are recomputed from the state under test rather
// than pinned to a constant that would survive the record type disappearing.
//
// The second property is that this is a READ. The artifact an owner takes at the byte
// ceiling must not be able to change the workspace it is describing, so the fixture is
// serialised before and after and compared byte for byte.
//
// The third is that the archive is built OUT OF the shipped close export rather than being a
// second projection of the same records: each close artifact inside the archive is asserted
// deep-equal to what commerceDailyCloseExport produces alone. If the two ever diverge, an
// accountant reconciling a close CSV against the archive would find two different answers
// for the same day.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, receiveCommerceStock, reserveCommerceOrder, advanceCommerceOrder,
      reconcileCommercePayment, commerceCloseExpectation, saveCommerceClose,
      commerceDailyCloseExport, validateCommerceState,
      commerceWorkspaceArchive, commerceWorkspaceArchiveCsv, COMMERCE_WORKSPACE_ARCHIVE_SCHEMA,
    } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/workspace-archive-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createSeedCommerce, receiveCommerceStock, reserveCommerceOrder, advanceCommerceOrder,
  reconcileCommercePayment, commerceCloseExpectation, saveCommerceClose,
  commerceDailyCloseExport, validateCommerceState,
  commerceWorkspaceArchive, commerceWorkspaceArchiveCsv, COMMERCE_WORKSPACE_ARCHIVE_SCHEMA,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Daw Hla Hla'
const GENERATED_AT = '2026-09-06T04:00:00.000Z'
// Fictional shop, fictional customers. Dates sit after the seed's own activity so the seed's
// completed orders are eligible for the first close rather than blocking it.
const dayStart = (day) => Date.UTC(2026, 8, 1 + day, 2, 0, 0)
const iso = (ms) => new Date(ms).toISOString()
let actionSeq = 0
// Action ids are UUID-shaped because the close path checks that shape; a readable
// counter is folded into the hex so a failure still points at the step that produced it.
const proof = (label, ms) => ({
  actionId: `ACT-A0C1${(actionSeq += 1).toString(16).padStart(4, '0').toUpperCase()}-0000-4000-8000-${actionSeq.toString(16).padStart(12, '0').toUpperCase()}`,
  capturedAt: iso(ms),
  actor: OPERATOR,
  reason: `Workspace archive fixture ${label}`,
  evidenceReference: `ARCHIVE-${label}`,
})

// --- fixture: three trading days, each closed ---------------------------------------
const DAYS = 3
const SALES_PER_DAY = 4
const seed = createSeedCommerce()
const item = seed.items.filter((candidate) => candidate.onHand > 4)[0]
let state = seed
const closeIds = []
for (let day = 0; day < DAYS; day += 1) {
  const base = dayStart(day)
  state = receiveCommerceStock(state, item.sku, SALES_PER_DAY + 4, proof(`RESTOCK-${day}`, base))
  assert.ok(state, `day ${day}: the restock lands`)
  for (let index = 0; index < SALES_PER_DAY; index += 1) {
    const at = base + (index + 1) * 60_000
    const id = `ORD-ARCHIVE-${day}-${index}`
    let next = reserveCommerceOrder(state, {
      id,
      createdAt: iso(at),
      customer: index % 2 ? 'Ma Thida' : 'Guest',
      owner: OPERATOR,
      channel: 'Counter',
      item: item.name,
      itemSku: item.sku,
      quantity: 1,
      payment: index % 2 ? 'KBZPay' : 'Cash',
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment: 'pickup',
      fulfilmentReference: `Counter handoff ${id}`,
      promisedAt: iso(at + 3_600_000),
      total: item.price,
      status: 'confirmed',
      lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity: 1, unitPriceMmk: item.price }],
    }, proof(`RESERVE-${id}`, at))
    assert.ok(next, `${id}: the sale reserves`)
    next = advanceCommerceOrder(next, id, 'confirmed', proof(`PREP-${id}`, at + 1_000))
    next = advanceCommerceOrder(next, id, 'preparing', proof(`READY-${id}`, at + 2_000))
    next = reconcileCommercePayment(next, id, proof(`RECONCILE-${id}`, at + 3_000))
    next = advanceCommerceOrder(next, id, 'ready', proof(`COMPLETE-${id}`, at + 4_000))
    assert.ok(next, `${id}: the sale completes`)
    state = next
  }
  const closeAt = base + (SALES_PER_DAY + 2) * 60_000
  const expectation = commerceCloseExpectation(state, iso(closeAt))
  assert.ok(expectation, `day ${day}: a close expectation is available`)
  const closeId = `CLOSE-A0C10000-0000-4000-8000-00000000000${day}`
  const closed = saveCommerceClose(state, closeId, proof(`CLOSE-${day}`, closeAt), expectation)
  assert.ok(closed, `day ${day}: the close saves`)
  state = closed
  closeIds.push(closeId)
}

// --- the archive is a read ------------------------------------------------------------
// Serialised before anything touches it, compared after both the artifact and the CSV have
// been produced. The owner most likely to press this button is the one at the byte ceiling,
// where a stray write is exactly what she cannot afford.
const beforeArchive = JSON.stringify(state)
const archive = commerceWorkspaceArchive(state, GENERATED_AT)
check(Boolean(archive), 'the archive is produced for a workspace with closed trading days')
const csv = commerceWorkspaceArchiveCsv(archive)
check(JSON.stringify(state) === beforeArchive, 'building the archive and its CSV leaves the stored workspace byte-identical')

// --- it says what it is, inside the file ----------------------------------------------
check(archive.schema === COMMERCE_WORKSPACE_ARCHIVE_SCHEMA, 'the artifact carries its contract name')
check(archive.schema === 'supermega.commerce.workspace-archive.v1', 'and that name is versioned in the house shape')
check(archive.workspaceSchema === 'supermega.commerce.workspace.v2', 'and names the workspace generation it was taken from')
check(archive.restorable === false, 'the artifact states in-band that it cannot be restored')
check(archive.externalWritesPerformed === false, 'and that producing it performed no external write')
check(/^sha256:[0-9a-f]{64}$/.test(archive.digest), 'and is digest-sealed')
check(csv.includes('supermega.commerce.workspace-archive.v1') && csv.includes(archive.digest), 'the CSV carries the contract name and the seal')
check(csv.split('\r\n')[0].includes('"restorable"'), 'and a restorable column, so the limit survives being opened in a spreadsheet')

// --- COMPLETENESS: every order in the workspace is accounted for -----------------------
// Derived from the state under test on every run. Nothing here is a literal count, so a
// record type that stopped reaching the file would fail this rather than silently agreeing
// with a number somebody wrote down once.
function coverageOf(subject, artifact) {
  const current = validateCommerceState(subject)
  const archivedIds = new Set(artifact.closes.flatMap((close) => close.orders.map((order) => order.orderId)))
  const gapOrderIds = new Set(artifact.gaps.filter((gap) => gap.kind === 'order_not_on_an_archived_close').map((gap) => gap.id))
  return { current, archivedIds, gapOrderIds }
}
{
  const { current, archivedIds, gapOrderIds } = coverageOf(state, archive)
  check(archive.orderCount === current.orders.length, 'the archive reports the order count the workspace actually holds')
  check(archive.closeCount === current.closes.length, 'and the close count the workspace actually holds')
  check(archive.archivedOrderCount === archivedIds.size, 'the reported archived-order count equals the orders actually written')
  check(archive.uncoveredOrderCount === gapOrderIds.size, 'and the reported uncovered count equals the gap rows actually written')
  check(
    archive.archivedOrderCount + archive.uncoveredOrderCount === current.orders.length,
    'every order in the workspace is either archived or named as a gap -- none is silently dropped',
  )
  const missing = current.orders.filter((order) => !archivedIds.has(order.id) && !gapOrderIds.has(order.id))
  check(missing.length === 0, `no order is absent from both the archive and its gap list (absent: ${missing.map((order) => order.id).join(', ')})`)
  const doubled = current.orders.filter((order) => archivedIds.has(order.id) && gapOrderIds.has(order.id))
  check(doubled.length === 0, 'and no order is counted both as archived and as missing')
  check(
    archive.archivedTotalMmk === archive.closes.reduce((sum, close) => sum + close.totalMmk, 0),
    'the archived total is the sum of the closes in the file, not a figure carried from elsewhere',
  )
}

// --- the counts are derived, not pinned -------------------------------------------------
// A fourth day of trading that is NOT closed must move the uncovered count by exactly the
// number of new sales and leave the archived count alone. A hardcoded coverage figure would
// pass every assertion above and fail this one.
{
  const base = dayStart(DAYS)
  // Deliberately more than fifty. A gap list is the part of this file whose size a future
  // change is most tempted to cap "to keep the download small", and a fixture with a handful
  // of gaps would not notice -- confirmed by mutation: a `gaps.length = Math.min(gaps.length,
  // 50)` survived a two-sale fixture. Every one of these is a plain reservation rather than a
  // full lifecycle, because an un-closed order is uncovered whatever state it is in.
  const OPEN_SALES = 61
  let openState = receiveCommerceStock(state, item.sku, OPEN_SALES + 4, proof(`RESTOCK-${DAYS}`, base))
  assert.ok(openState, 'the fourth-day restock lands')
  for (let index = 0; index < OPEN_SALES; index += 1) {
    const at = base + (index + 1) * 60_000
    const id = `ORD-ARCHIVE-OPEN-${String(index).padStart(3, '0')}`
    const next = reserveCommerceOrder(openState, {
      id,
      createdAt: iso(at),
      customer: 'Ko Aung',
      owner: OPERATOR,
      channel: 'Counter',
      item: item.name,
      itemSku: item.sku,
      quantity: 1,
      payment: 'Cash',
      paymentStatus: 'pending',
      refundStatus: 'none',
      fulfilment: 'pickup',
      fulfilmentReference: `Counter handoff ${id}`,
      promisedAt: iso(at + 3_600_000),
      total: item.price,
      status: 'confirmed',
      lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity: 1, unitPriceMmk: item.price }],
    }, proof(`RESERVE-${id}`, at))
    assert.ok(next, `${id}: the open sale reserves`)
    openState = next
  }
  const openArchive = commerceWorkspaceArchive(openState, GENERATED_AT)
  check(Boolean(openArchive), 'an archive is still produced when the newest sales are not on a closed day')
  check(
    openArchive.uncoveredOrderCount === archive.uncoveredOrderCount + OPEN_SALES,
    'each un-closed sale raises the uncovered count by exactly one -- the coverage figures are derived from the workspace',
  )
  check(openArchive.archivedOrderCount === archive.archivedOrderCount, 'and an un-closed sale does not change what was already archived')
  const { current, archivedIds, gapOrderIds } = coverageOf(openState, openArchive)
  check(archivedIds.size + gapOrderIds.size === current.orders.length, 'and the completeness invariant still holds with un-closed sales present')
  const openGap = openArchive.gaps.find((gap) => gap.id === 'ORD-ARCHIVE-OPEN-000')
  check(Boolean(openGap) && openGap.detail.includes('Not on a closed day in this file'), 'an un-closed sale is named with why it is not in the file, not merely omitted')
  // Pins the order count to the DIFFERENCE between two workspaces, not to a value. Asserting
  // only that it equals orders.length passes for any constant that happens to match this
  // fixture -- confirmed by mutation, which is why this is here.
  check(openArchive.orderCount === archive.orderCount + OPEN_SALES, 'the reported order count tracks the workspace rather than being a constant that fits this fixture')
  check(openArchive.closeCount === archive.closeCount, 'while the close count is unchanged by sales that were never closed')
}

// --- a close the exporter refuses is NAMED, not filtered away ---------------------------
// A close carrying none of the eight snapshot fields is a legal legacy shape, and
// commerceDailyCloseExport returns null for it. Constructed here only to prove the archive
// reports it: nothing in the product may ever WRITE this shape, because a close without
// orderIds permanently disables the daily close (COMMERCE-COMPACTION-DESIGN.md section 6.3).
{
  const legacyState = validateCommerceState({
    ...state,
    closes: state.closes.map((close) => close.id === closeIds[0]
      ? { id: close.id, createdAt: close.createdAt, total: close.total, orders: close.orders }
      : close),
  })
  const legacyArchive = commerceWorkspaceArchive(legacyState, GENERATED_AT)
  check(Boolean(legacyArchive), 'an archive is still produced when one close cannot be exported')
  check(legacyArchive.closeCount === state.closes.length, 'and it still reports every close the workspace holds')
  check(legacyArchive.archivedCloseCount === state.closes.length - 1, 'while reporting that one fewer was archivable')
  const closeGap = legacyArchive.gaps.find((gap) => gap.kind === 'close_without_evidence')
  check(Boolean(closeGap) && closeGap.id === closeIds[0], 'the close that could not be exported is named by id')
  const { current, archivedIds, gapOrderIds } = coverageOf(legacyState, legacyArchive)
  check(
    archivedIds.size + gapOrderIds.size === current.orders.length,
    'and every sale that rode on that close is listed individually rather than vanishing with it',
  )
  check(
    legacyArchive.uncoveredOrderCount >= SALES_PER_DAY,
    'so a day that cannot be summarised still contributes its sales to the file',
  )
  const legacyCsv = commerceWorkspaceArchiveCsv(legacyArchive)
  check(legacyCsv.includes('close_not_archived'), 'and the CSV carries a row type an owner can see')
}

// --- the archive is built out of the shipped close export, not a second projection -------
for (const closeId of closeIds) {
  const standalone = commerceDailyCloseExport(state, closeId)
  const inArchive = archive.closes.find((close) => close.closeId === closeId)
  assert.deepEqual(inArchive, standalone, `the archived close ${closeId} is identical to its standalone daily-close export`)
  checks += 1
}

// --- the seal refuses a tampered artifact ------------------------------------------------
// commerceDailyCloseCsv does not verify before serialising; this one must, because it is the
// file an owner is told to keep for years and hand to somebody else.
assert.throws(
  () => commerceWorkspaceArchiveCsv({ ...archive, archivedOrderCount: archive.archivedOrderCount + 1 }),
  /Workspace archive integrity check failed\./,
  'an archive whose coverage counts were edited refuses to serialise',
)
checks += 1
assert.throws(
  () => commerceWorkspaceArchiveCsv({ ...archive, gaps: [] }),
  /Workspace archive integrity check failed\./,
  'and one whose gap list was emptied refuses too -- the seal covers what is MISSING, not only what is present',
)
checks += 1

// --- the CSV is a table, not a ragged file ------------------------------------------------
{
  const rows = csv.split('\r\n').filter((line) => line.length > 0)
  const width = (row) => row.split('","').length
  const headerWidth = width(rows[0])
  check(rows.every((row) => width(row) === headerWidth), 'every CSV row has exactly the header\'s column count')
  const orderRowIds = rows.slice(1)
    .map((row) => row.split('","'))
    .filter((cells) => cells[3] === 'order')
    .map((cells) => cells[17])
  check(orderRowIds.length === archive.archivedOrderCount, 'the CSV holds one order row per archived sale')
  check(new Set(orderRowIds).size === orderRowIds.length, 'and no sale appears twice')
  check(rows.length === 1 + 1 + archive.archivedCloseCount + archive.archivedOrderCount + archive.gaps.length,
    'the row count is exactly header + archive row + one per close + one per sale + one per gap')
}

// --- refusals ------------------------------------------------------------------------------
check(commerceWorkspaceArchive(state, 'not-a-timestamp') === null, 'an archive is refused rather than dated with a malformed timestamp')

console.log(`shop workspace archive contract: ${checks} checks passed`)
