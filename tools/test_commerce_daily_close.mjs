// Contract guard for the Shop daily close -- the moment a trading day becomes a fixed
// accounting record.
//
// The rule that carries the most weight is that a close cannot be saved against a stale
// review. saveCommerceClose recomputes the expectation from the live state and compares it
// to the one the operator actually reviewed; if anything moved in between -- another sale
// completed, a payment reconciled, stock dropped below its reorder point -- the close is
// refused rather than recorded against figures nobody saw.
//
// The rest is eligibility: only completed AND reconciled orders close, an order cannot be
// closed twice, a business date cannot be closed twice, and an order whose close basis is
// later than the close itself cannot be swept into it.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedCommerce, commerceCloseExpectation, saveCommerceClose,
      commerceDailyCloseExport, commerceDailyCloseCsv, commerceOrderAdjustedTotal,
    } from './commerce-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/close-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createSeedCommerce, commerceCloseExpectation, saveCommerceClose,
  commerceDailyCloseExport, commerceDailyCloseCsv, commerceOrderAdjustedTotal,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const CAPTURED_AT = '2026-07-24T14:00:00.000Z'
const CLOSE_ID = 'CLOSE-8CAC808D-92A2-4FE4-89E8-D3C980B0F3C5'
const ACTION_ID = 'ACT-1D2E3F40-5A6B-4C7D-8E9F-A0B1C2D3E4F5'
const proof = (overrides = {}) => ({
  actionId: ACTION_ID,
  capturedAt: CAPTURED_AT,
  actor: 'Swan Htet',
  reason: 'End of trading day',
  evidenceReference: 'CLOSE-0001',
  ...overrides,
})

const seed = createSeedCommerce()

// --- the expectation describes exactly what will be closed -------------------
const expectation = commerceCloseExpectation(seed, CAPTURED_AT)
check(Boolean(expectation), 'an expectation can be computed for the seed state')
check(Boolean(expectation.businessDate), `it names a Myanmar business date, got ${expectation.businessDate}`)

const eligible = seed.orders.filter((order) => order.status === 'completed' && order.paymentStatus === 'reconciled')
check(
  expectation.orderIds.length === eligible.length,
  `only completed AND reconciled orders are eligible (${expectation.orderIds.length} vs ${eligible.length})`,
)
check(
  seed.orders.some((order) => order.status !== 'completed' || order.paymentStatus !== 'reconciled'),
  'and the seed does contain ineligible orders, so that assertion is not vacuous',
)
check(
  expectation.orderIds.every((id) => eligible.some((order) => order.id === id)),
  'every id in the expectation is one of the eligible orders',
)

const expectedTotal = expectation.orderIds
  .map((id) => commerceOrderAdjustedTotal(seed.orders.find((order) => order.id === id)))
  .reduce((sum, value) => sum + value, 0)
check(expectation.total === expectedTotal, 'the total is the sum of ADJUSTED order totals, so corrections are included')

// Exceptions are surfaced rather than silently folded into the total.
check(Array.isArray(expectation.paymentExceptionOrderIds), 'payment exceptions are listed')
check(Array.isArray(expectation.stockExceptionSkus), 'stock exceptions are listed')
check(
  expectation.stockExceptionSkus.every((sku) => {
    const item = seed.items.find((candidate) => candidate.sku === sku)
    return item && item.onHand <= item.reorderAt
  }),
  'every listed stock exception is genuinely at or below its reorder point',
)

// --- saving the close --------------------------------------------------------
const closed = saveCommerceClose(seed, CLOSE_ID, proof(), expectation)
check(Boolean(closed), 'a close saves when the reviewed expectation still matches the live state')
const saved = closed.closes.find((close) => close.id === CLOSE_ID)
check(Boolean(saved), 'the close is recorded')
check(saved.operator === 'Swan Htet', 'and records who closed the day')
check(saved.businessDate === expectation.businessDate, 'against the reviewed business date')

// --- a stale review is refused ----------------------------------------------
// This is the property the guard exists for. Each of these is a state that moved after the
// operator looked at the numbers.
// Note on what is NOT simulated here: promoting a seeded order to completed+reconciled to
// stand in for "another sale landed" cannot be done by editing status fields. The workspace
// validator requires the full reconciliation record AND enforces order chronology -- a
// completion cannot predate the order it completes. Both refusals are correct, and faking
// timestamps to get around them would test a state the product cannot reach. The staleness
// guard is proven below with states that ARE reachable.

const withStockDrop = structuredClone(seed)
withStockDrop.items[0].onHand = 0
check(
  saveCommerceClose(withStockDrop, CLOSE_ID, proof(), expectation) === null,
  'a close is refused when stock fell below its reorder point after the review',
)

check(
  saveCommerceClose(seed, CLOSE_ID, proof(), { ...expectation, total: expectation.total + 1 }) === null,
  'a close is refused when the reviewed TOTAL does not match what the state produces',
)
check(
  saveCommerceClose(seed, CLOSE_ID, proof(), { ...expectation, orderIds: [] }) === null,
  'a close is refused when the reviewed ORDER SET does not match',
)

// --- one close per day, one close per order ---------------------------------
const secondExpectation = commerceCloseExpectation(closed, CAPTURED_AT)
check(
  secondExpectation === null,
  'a second close on the same business date is refused at the expectation stage',
)

// --- an order already closed is never closed again ---------------------------
// Needs a SECOND business date, because the same-day guard refuses before the
// already-closed filter is ever consulted. Without this, deleting that filter changes
// nothing observable and the test would pass against a double-count.
const NEXT_DAY = '2026-07-25T14:00:00.000Z'
const nextDay = commerceCloseExpectation(closed, NEXT_DAY)
check(nextDay !== null, 'a close can be computed for the following business date')
check(
  nextDay.businessDate !== expectation.businessDate,
  'and it is a different business date from the first close',
)
check(
  nextDay.orderIds.length === 0,
  `the already-closed order is NOT eligible again (got ${nextDay.orderIds.length} orders)`,
)
check(
  nextDay.total === 0,
  'so the following day opens at zero rather than re-counting yesterday takings',
)
check(
  expectation.orderIds.length > 0,
  'and the first close did cover at least one order, so that zero is meaningful',
)

// --- malformed proofs and ids -----------------------------------------------
for (const [label, args] of [
  ['a non-canonical close id', ['CLOSE-not-a-uuid', proof()]],
  ['a non-canonical action id', [CLOSE_ID, proof({ actionId: 'ACT-nope' })]],
  ['an untrimmed actor', [CLOSE_ID, proof({ actor: '  Swan Htet  ' })]],
  ['a blank evidence reference', [CLOSE_ID, proof({ evidenceReference: '' })]],
]) {
  check(saveCommerceClose(seed, args[0], args[1], expectation) === null, `a close with ${label} is refused`)
}

// --- the exported artifact ---------------------------------------------------
const exported = commerceDailyCloseExport(closed, CLOSE_ID)
check(Boolean(exported), 'the saved close exports an accounting artifact')
check(exported.closeId === CLOSE_ID, 'the artifact names its close')
check(exported.businessDate === expectation.businessDate, 'and its business date')
check(exported.orders.length === expectation.orderIds.length, 'with one entry per closed order')
check(exported.orderCount === expectation.orderIds.length, 'and an orderCount that agrees with the entries')
check(exported.totalMmk === expectation.total, 'and a total that matches the reviewed expectation')
check(typeof exported.digest === 'string' && exported.digest.length > 0, 'and a digest over the artifact')
check(
  exported.orders.every((entry) => entry.calculationStatus === 'accepted'),
  'every entry is calculation-accepted, because every seeded order carries a calculation',
)
check(commerceDailyCloseExport(closed, 'CLOSE-does-not-exist') === null, 'exporting an unknown close returns null')

const csv = commerceDailyCloseCsv(exported)
check(typeof csv === 'string' && csv.includes(CLOSE_ID), 'the CSV names the close')
check(csv.split('\n').filter((line) => line.trim()).length >= exported.orders.length + 1, 'and has a header plus a row per entry')


// --- what the download control cost a shop that never pressed it ---------------------
//
// The CSV above is the artifact. This is the FILE, and what the Shop screen used to pay to
// have it standing by.
//
// CoreApp.tsx's latestCloseDownload spelled the file out as a percent-encoded
// `data:text/csv` URL inside a useMemo keyed on `commerce`. `commerce` is a new object after
// every sale, so the string was rebuilt and re-retained on every sale, all day, for a file an
// owner takes at most once a day. Measured against a Shop driven to its enforced 2 MiB
// ceiling through the real transitions (1,453 orders, 1,244 completed): 509,334 bytes of CSV
// became 758,928 bytes of data: URL. It is now built inside the click, onto a Blob, through
// the one helper that revokes.
//
// Two guards, different in kind. The first is arithmetic over the real artifact and can never
// be flaky: what the eager form COST, derived rather than written down. The second is
// identity: the accountant's file did not change. Timing is deliberately not asserted -- a
// millisecond threshold on a shared CI runner is a guard that cries wolf.
const { readFile } = await import('node:fs/promises')
const encodedBytes = (text) => new TextEncoder().encode(text).byteLength
const corePageSource = await readFile(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')

// Exactly what CoreApp.tsx built on the render path before this change, kept here so the cost
// it carried stays measurable after the code that carried it is gone.
const CSV_PREFIX = 'data:text/csv;charset=utf-8,'
const eagerCloseUrl = `${CSV_PREFIX}${encodeURIComponent(`﻿${commerceDailyCloseCsv(exported)}`)}`
// What a browser would have written to disk from the old href.
const closeFromDataUrl = decodeURIComponent(eagerCloseUrl.slice(CSV_PREFIX.length))

// What the Blob the click handler now mints carries -- produced by the SHIPPING function,
// lifted out of the page source and RUN, not by a copy of it written here. A copy would make
// this agree with itself rather than with the product: dropping the BOM from
// closeExportFileText would leave a hand-written twin passing while an accountant's
// spreadsheet opened every Burmese product name as mojibake.
const closeDeclaration = corePageSource.match(/\nfunction closeExportFileText\(artifact: CommerceDailyCloseExport\) \{\r?\n([\s\S]*?)\r?\n\}/)
check(Boolean(closeDeclaration), 'closeExportFileText is gone from CoreApp.tsx, so what the close download writes can no longer be weighed here')
const closeFromBlob = new Function('artifact', 'commerceDailyCloseCsv', closeDeclaration[1])(exported, commerceDailyCloseCsv)
check(closeFromBlob === closeFromDataUrl, 'the close CSV changed content when its download stopped being eager')
check(encodedBytes(closeFromBlob) === encodedBytes(closeFromDataUrl), 'the close CSV changed size when its download stopped being eager')

// A BOM, and it must stay one -- every other CSV in this app carries it so a spreadsheet reads
// Burmese product and customer names as UTF-8. It is the OPPOSITE call from the workspace
// backup on the settings page, which must NOT carry one because loadBackupFile JSON.parses it
// back and a BOM is not JSON. Two files, two answers; copying either rule to the other is a
// real bug, so each is pinned beside the file it governs.
check(closeFromBlob.startsWith('﻿'), 'the byte-order mark was dropped from the close CSV -- a spreadsheet renders Burmese product names as mojibake without it')
check(closeFromBlob.slice(1) === csv, 'the close CSV is no longer the artifact CSV above with a byte-order mark in front of it')

// The overhead the eager form paid, asserted as a floor rather than a figure: if percent
// encoding ever got cheap the argument for this change would need redoing.
const closeOverhead = encodedBytes(eagerCloseUrl) / encodedBytes(closeFromBlob)
check(closeOverhead > 1.2, `a data: URL of this file now costs only ${closeOverhead.toFixed(3)}x -- the reason this download stopped being eager no longer holds and the comment on it is stale`)

// --- and it is built on the click, not on the render path -------------------------------
// Scoped to THIS download, deliberately. Four other CSV exports on that screen still build
// a data: URL, and they were measured and left: the accounting handoff is 10,305 bytes at
// the same ceiling, the receivables handoff 83,244, and the payables and support exports
// produce no artifact at all until a shop has open supplier invoices or support cases. A
// blanket ban here would be a claim this lane did not measure and does not hold.
check(!corePageSource.includes('href={latestCloseDownload.href}'), 'the close CSV control is back on a prebuilt href')
const closeMemoStart = corePageSource.indexOf('const latestCloseDownload = useMemo(')
const closeMemo = closeMemoStart < 0 ? '' : corePageSource.slice(closeMemoStart, corePageSource.indexOf('const latestAccountingDownload = useMemo(', closeMemoStart))
check(Boolean(closeMemo), 'the close download descriptor is gone, so what it costs can no longer be weighed here')
check(!closeMemo.includes('encodeURIComponent('), 'the close CSV is being percent-encoded in a memo again')
check(closeMemo.includes('artifact,'), 'the close memo no longer carries the artifact the click handler needs, and four places on that screen read whether it exists')
check(
  corePageSource.includes('onClick={() => downloadBlob(latestCloseDownload.filename, new Blob([closeExportFileText(latestCloseDownload.artifact)]'),
  'the close CSV download no longer mints its file as a Blob on the click',
)
// Trading a retained data: URL for an object URL that is never revoked would pin the same
// bytes and this change would have bought nothing.
const downloadHelperSource = await readFile(new URL('../showroom/src/core/download-file.ts', import.meta.url), 'utf8')
check(
  /export function downloadBlob\(filename: string, blob: Blob\) \{[\s\S]*?URL\.revokeObjectURL\(url\)/.test(downloadHelperSource),
  'the shared download helper no longer revokes what it mints -- an object URL never released pins its whole buffer for the life of the page',
)

// --- one filter this fixture cannot exercise ---------------------------------
// commerceCloseExpectation requires orders to be completed AND reconciled. The seed has no
// completed-but-unreconciled order, so deleting the `paymentStatus === 'reconciled'` clause
// changes nothing here and this file stays green -- confirmed by mutation. Constructing one
// is not possible by editing status fields: the workspace validator demands the full
// reconciliation record and enforces order chronology. Recorded rather than papered over, so
// the count is not mistaken for coverage of that clause.

console.log(`commerce daily close contract: ${checks} checks passed`)

// The anomaly-flag projection reads nothing but closes, so its executable
// contract belongs to this gate step. It cannot be its own step -- every step is
// an npm script in package.json's app:verify chain and package.json is
// digest-bound (rehearsal cascade) -- so it is imported here rather than left as
// a file no gate runs. It asserts and prints its own count, and throws on
// failure, which fails this step.
await import('./test_shop_close_anomaly.mjs')

// The workspace archive is built entirely out of the close export this file guards: it walks
// every close through commerceDailyCloseExport rather than re-projecting the same records,
// and asserts the two agree. Its contract rides on this gate step for the same reason the
// anomaly projection above does -- a step of its own would mean a new npm script, and
// package.json is digest-bound. It stays in its own file because its subject is the archive
// and not the close, and it asserts and prints its own count, throwing on failure.
await import('./test_shop_workspace_archive.mjs')
