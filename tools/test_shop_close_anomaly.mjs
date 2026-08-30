// Contract guard for the Shop close anomaly flags (PRODUCT-SUPREMACY-ROADMAP
// §2 item 5 — "anomaly flags on the close").
//
// shop-close-anomaly-flags.ts is a pure projection: it reads closes that are
// already saved and returns the numbers on the last one that are out of line
// with the closes before it. Nothing is stored, nothing is written, no clock is
// read. This test pins the arithmetic and, more importantly, the places where
// the feature could ship something FALSE:
//
//   1. THIN DATA FAILS QUIET. Under the minimum baseline the projection reports
//      `building_baseline` with zero flags and says how many more closes are
//      needed. A shop with three closes has no usual day and is never told one.
//   2. A MEASURE IS ONLY READ WHERE IT WAS RECORDED. A legacy close carries no
//      payment-exception list and a close saved without a settlement carries no
//      variance; neither may be counted as a zero, which would drag a median
//      down and manufacture a spike out of an ordinary day.
//   3. ZERO MEDIANS DO NOT PRODUCE INFINITE RATIOS. Where the usual day is
//      zero — a drawer that has never been off — the claim becomes "higher than
//      every day in the window", and takings (where that rule would fire on the
//      first ordinary sale) compares by ratio only.
//   4. DIRECTION AND BASELINE ARE ALWAYS STATED, and the exposed median is the
//      one the exposed multiple was computed from, so the sentence on screen can
//      be checked against the numbers beside it.
//   5. GUIDED SAMPLES RAISE NOTHING (CLAUDE.md proof-counter rule): a close whose
//      every order is sample seeded (`ACT-DEMO-` actionId prefix on its stock
//      movement, never an actor string) is dropped from both the subject
//      position and the baseline. The seeded workspace projects `no_close`.
//   6. THE PROJECTION IS PURE: the same state projects the same answer, the
//      input array is not reordered in place, and the module reads no clock.
//
// WIRING NOTE: every gate step is an npm script named in package.json's
// app:verify chain, and package.json is digest-bound (rehearsal cascade), so
// this file cannot be its own step. It is not therefore left unrun — a contract
// test no gate executes is decoration, and source-string pins cannot see broken
// arithmetic. `tools/test_commerce_daily_close.mjs` (the chain's
// `commerce:close:verify`, and the step that already owns the daily close)
// imports this file at its foot, so every gate run executes it; that import is
// itself pinned in tools/verify_app_build.mjs. It also runs standalone:
// `node tools/test_shop_close_anomaly.mjs`.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export {
        projectShopCloseAnomalyFlags,
        SHOP_CLOSE_ANOMALY_BASELINE_WINDOW,
        SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS,
        SHOP_CLOSE_ANOMALY_MULTIPLE,
        SHOP_CLOSE_ANOMALY_CASH_FLOOR_MMK,
      } from './shop-close-anomaly-flags.ts'
      export { createSeedCommerce } from './commerce-workspace.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-close-anomaly-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  projectShopCloseAnomalyFlags,
  SHOP_CLOSE_ANOMALY_BASELINE_WINDOW,
  SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS,
  SHOP_CLOSE_ANOMALY_MULTIPLE,
  SHOP_CLOSE_ANOMALY_CASH_FLOOR_MMK,
  createSeedCommerce,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// A close, newest-first by index: day 0 is the close being read, day 1 the one
// before it, and so on back through the history. Ids and business dates are
// distinct for every day so a fixture can never make two closes tie.
const DAY_MS = 24 * 60 * 60 * 1000
function close(day, overrides = {}) {
  const businessDate = new Date(Date.parse('2026-08-20T00:00:00.000Z') - day * DAY_MS).toISOString().slice(0, 10)
  const serial = String(day).padStart(4, '0')
  const orderIds = overrides.orderIds ?? [`ORD-${1000 + day}`]
  const { settlementVarianceMmk, unpaidOrders, ...rest } = overrides
  return {
    id: `CLOSE-0000${serial}-0000-4000-8000-000000000000`,
    createdAt: `${businessDate}T12:00:00.000Z`,
    total: 100000,
    orders: orderIds.length,
    businessDate,
    orderIds,
    paymentExceptionOrderIds: unpaidOrders === undefined ? [] : Array.from({ length: unpaidOrders }, (_, n) => `ORD-UNPAID-${day}-${n}`),
    stockExceptionSkus: [],
    actionId: `ACT-0000${serial}-0000-4000-8000-000000000000`,
    operator: 'Counter operator',
    reason: 'Close the day.',
    evidenceReference: `CLOSE-${businessDate}`,
    ...(settlementVarianceMmk === undefined ? {} : {
      settlement: {
        schema: 'supermega.commerce.close-settlement.v1',
        status: settlementVarianceMmk === 0 ? 'matched' : 'variance_review',
        totalExpectedMmk: 100000,
        totalCountedMmk: 100000 + settlementVarianceMmk,
        totalVarianceMmk: settlementVarianceMmk,
        lines: [],
      },
    }),
    ...rest,
  }
}

function state(closes, movements = []) {
  return { closes, movements }
}

const flagFor = (result, measure) => result.flags.find((flag) => flag.measure === measure) ?? null

// ---------------------------------------------------------------------------
// 1. Thin data fails quiet.
// ---------------------------------------------------------------------------
check(projectShopCloseAnomalyFlags(state([])).state === 'no_close', 'no closes projects no_close')
check(projectShopCloseAnomalyFlags(state([])).flags.length === 0, 'no closes raises no flag')

const threeDays = [close(0, { total: 9000000, settlementVarianceMmk: 400000, unpaidOrders: 9 }), close(1), close(2)]
const thin = projectShopCloseAnomalyFlags(state(threeDays))
check(thin.state === 'building_baseline', 'three closes cannot have a usual day')
check(thin.flags.length === 0, 'thin data raises no flag however extreme the day')
check(thin.baselineDays === 2, 'thin data counts the prior closes it does have')
check(thin.baselineDaysNeeded === SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS - 2, 'thin data says how many more closes are needed')
check(thin.closeId === threeDays[0].id && thin.businessDate === threeDays[0].businessDate, 'thin data still names the close it read')

// Exactly at the boundary: MIN prior closes is enough, one fewer is not.
const boundary = (priorCount) => projectShopCloseAnomalyFlags(state([
  close(0, { total: 4000000 }),
  ...Array.from({ length: priorCount }, (_, n) => close(n + 1, { total: 100000 })),
]))
check(boundary(SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS - 1).state === 'building_baseline', 'one short of the minimum still builds')
check(boundary(SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS).state === 'flagged', 'the minimum baseline is enough to flag')
check(boundary(SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS).baselineDaysNeeded === 0, 'a sufficient baseline needs no more closes')

// ---------------------------------------------------------------------------
// 2. A measure is only read where it was recorded.
// ---------------------------------------------------------------------------
const week = (overrides = {}) => Array.from({ length: 8 }, (_, n) => close(n + 1, overrides))

// Eight legacy closes carry no payment-exception list at all. Reading them as
// zero would make a median of zero and flag today's ordinary two unpaid orders.
const legacyPrior = week().map(({ paymentExceptionOrderIds, ...rest }) => rest)
const legacyResult = projectShopCloseAnomalyFlags(state([close(0, { unpaidOrders: 2 }), ...legacyPrior]))
check(flagFor(legacyResult, 'unpaid_orders') === null, 'closes that never recorded unpaid orders are not read as zero')

// Same for settlement: a close saved without a drawer count is not a matched drawer.
const noSettlementPrior = week()
const cashNoBaseline = projectShopCloseAnomalyFlags(state([close(0, { settlementVarianceMmk: 250000 }), ...noSettlementPrior]))
check(flagFor(cashNoBaseline, 'cash_variance') === null, 'closes without a settlement count give the cash measure no baseline')

// And today's own missing measure sits out rather than reporting zero.
const todayNoSettlement = projectShopCloseAnomalyFlags(state([close(0), ...week({ settlementVarianceMmk: 5000 })]))
check(flagFor(todayNoSettlement, 'cash_variance') === null, 'a close with no drawer count raises no cash flag')

// ---------------------------------------------------------------------------
// 3. Zero medians do not produce infinite ratios.
// ---------------------------------------------------------------------------
const neverOff = projectShopCloseAnomalyFlags(state([
  close(0, { settlementVarianceMmk: -30000 }),
  ...week({ settlementVarianceMmk: 0 }),
]))
const neverOffFlag = flagFor(neverOff, 'cash_variance')
check(neverOffFlag !== null, 'a drawer that has never been off flags the day it is')
check(neverOffFlag.basis === 'above_every_baseline_day', 'a zero median compares against every day, not a ratio')
check(neverOffFlag.multipleOfMedian === null, 'no multiple is claimed when the median is zero')
check(neverOffFlag.todayValue === 30000, 'the drawer difference is reported as a magnitude, either direction')
check(neverOffFlag.baselineHigh === 0 && neverOffFlag.baselineMedian === 0, 'the zero baseline is stated as zero')

// Under the floor, a difference is rounding and not worth a recount.
const rounding = projectShopCloseAnomalyFlags(state([
  close(0, { settlementVarianceMmk: SHOP_CLOSE_ANOMALY_CASH_FLOOR_MMK - 1 }),
  ...week({ settlementVarianceMmk: 0 }),
]))
check(flagFor(rounding, 'cash_variance') === null, 'a difference under the floor is rounding, not a flag')

// A zero median that is not the whole story: today must beat EVERY prior day.
const notThePeak = projectShopCloseAnomalyFlags(state([
  close(0, { unpaidOrders: 2 }),
  ...Array.from({ length: 8 }, (_, n) => close(n + 1, { unpaidOrders: n < 6 ? 0 : 3 })),
]))
check(flagFor(notThePeak, 'unpaid_orders') === null, 'a zero median needs today to beat every day in the window')

const newPeak = projectShopCloseAnomalyFlags(state([
  close(0, { unpaidOrders: 4 }),
  ...Array.from({ length: 8 }, (_, n) => close(n + 1, { unpaidOrders: n < 6 ? 0 : 3 })),
]))
const newPeakFlag = flagFor(newPeak, 'unpaid_orders')
check(newPeakFlag !== null && newPeakFlag.basis === 'above_every_baseline_day', 'beating every day in the window flags')
check(newPeakFlag.baselineHigh === 3, 'the highest prior day is reported so the claim can be checked')

// Takings never uses the beat-every-day rule: on a shop that has taken nothing
// for a fortnight it would fire on the first ordinary sale.
const dormant = projectShopCloseAnomalyFlags(state([close(0, { total: 50000 }), ...week({ total: 0 })]))
check(flagFor(dormant, 'takings') === null, 'takings compares by ratio only, never by beating every day')

// ---------------------------------------------------------------------------
// 4. Direction, baseline and arithmetic are all stated.
// ---------------------------------------------------------------------------
const busy = projectShopCloseAnomalyFlags(state([close(0, { total: 500000 }), ...week({ total: 100000 })]))
const busyFlag = flagFor(busy, 'takings')
check(busy.state === 'flagged', 'a five-times day is flagged')
check(busyFlag.direction === 'above' && busyFlag.basis === 'multiple_of_median', 'the direction and basis are stated')
check(busyFlag.baselineMedian === 100000 && busyFlag.multipleOfMedian === 5, 'the multiple is the exposed today over the exposed median')
check(busyFlag.baselineDays === 8, 'the number of closes behind the baseline is stated')

const atThreshold = projectShopCloseAnomalyFlags(state([
  close(0, { total: 100000 * SHOP_CLOSE_ANOMALY_MULTIPLE }),
  ...week({ total: 100000 }),
]))
check(flagFor(atThreshold, 'takings') !== null, 'the threshold itself flags')
const belowThreshold = projectShopCloseAnomalyFlags(state([
  close(0, { total: 100000 * SHOP_CLOSE_ANOMALY_MULTIPLE - 1 }),
  ...week({ total: 100000 }),
]))
check(flagFor(belowThreshold, 'takings') === null, 'one MMK under the threshold does not flag')
check(belowThreshold.state === 'nothing_unusual', 'an ordinary day says so rather than staying silent')

const quiet = projectShopCloseAnomalyFlags(state([close(0, { total: 20000 }), ...week({ total: 100000 })]))
const quietFlag = flagFor(quiet, 'takings')
check(quietFlag !== null && quietFlag.direction === 'below', 'an unusually quiet day is flagged downward')
check(quietFlag.multipleOfMedian === 0.2, 'the low multiple is reported as a fraction of the median')

// Downward is watched on takings only — a small drawer difference and a day
// with nothing left unpaid are good news, not findings.
const calm = projectShopCloseAnomalyFlags(state([
  close(0, { settlementVarianceMmk: 0, unpaidOrders: 0 }),
  ...week({ settlementVarianceMmk: 80000, unpaidOrders: 8 }),
]))
check(calm.flags.length === 0, 'a better-than-usual day raises nothing')

// The window is bounded: closes older than the window do not drag the median.
const longHistory = projectShopCloseAnomalyFlags(state([
  close(0, { total: 400000 }),
  ...Array.from({ length: SHOP_CLOSE_ANOMALY_BASELINE_WINDOW }, (_, n) => close(n + 1, { total: 100000 })),
  ...Array.from({ length: 10 }, (_, n) => close(n + 1 + SHOP_CLOSE_ANOMALY_BASELINE_WINDOW, { total: 1 })),
]))
check(longHistory.baselineDays === SHOP_CLOSE_ANOMALY_BASELINE_WINDOW, 'the baseline window is bounded')
check(flagFor(longHistory, 'takings') !== null, 'closes outside the window do not move the median')

// ---------------------------------------------------------------------------
// 5. Guided samples raise nothing.
// ---------------------------------------------------------------------------
const sampleMovements = (orderIds) => orderIds.map((orderId, n) => ({
  id: `MOV-${orderId}`,
  actionId: `ACT-DEMO-WORKING-SAMPLE-BAKERY-SALE-${n + 1}-RESERVE`,
  orderId,
  sku: 'SM-1001',
  quantityDelta: -1,
}))

const sampleCloses = Array.from({ length: 9 }, (_, n) => close(n, { orderIds: [`SETUP-SAMPLE-BAKERY-SALE-${n}`], total: n === 0 ? 9000000 : 100000 }))
const sampleOnly = projectShopCloseAnomalyFlags(state(sampleCloses, sampleMovements(sampleCloses.flatMap((entry) => entry.orderIds))))
check(sampleOnly.state === 'no_close', 'a workspace whose every close is sample activity has nothing to read')
check(sampleOnly.flags.length === 0, 'guided samples raise no flag')

// A real close sitting on top of sample closes reads the sample closes out of
// the baseline too, so it cannot inherit a fabricated usual day.
const mixed = projectShopCloseAnomalyFlags(state(
  [close(0, { total: 9000000, orderIds: ['ORD-2000'] }), ...sampleCloses.slice(1)],
  sampleMovements(sampleCloses.slice(1).flatMap((entry) => entry.orderIds)),
))
check(mixed.state === 'building_baseline', 'sample closes are excluded from the baseline as well as the subject')
check(mixed.baselineDays === 0, 'a workspace of samples leaves a real close with no baseline at all')

// A close that mixes ONE sample order into real trading is dropped whole. Its
// `total` is a sum across both, and the close records no per-order amounts, so
// there is nothing faithful to subtract. This is the common case, not an exotic
// one: createSeedCommerce ships ORD-1039 completed and reconciled, so the first
// close of a seeded workspace normally sweeps it in.
const mixedSubject = projectShopCloseAnomalyFlags(state(
  [close(0, { orderIds: ['ORD-3000', 'SETUP-SAMPLE-BAKERY-SALE-X'].sort(), total: 500000 }), ...week({ total: 100000 })],
  [],
))
check(mixedSubject.closeId !== close(0).id, 'a close holding one sample order is not read as today')
check(mixedSubject.flags.length === 0, 'and its inflated total raises no flag')

const mixedBaseline = projectShopCloseAnomalyFlags(state([
  close(0, { total: 100000 }),
  ...Array.from({ length: 8 }, (_, n) => close(n + 1, n < 4
    ? { orderIds: ['ORD-4000', `SETUP-SAMPLE-BAKERY-SALE-${n}`].sort(), total: 900000 }
    : { total: 100000 })),
]))
check(mixedBaseline.baselineDays === 4, 'mixed closes are excluded from the baseline as well')
check(mixedBaseline.state === 'building_baseline', 'and the baseline is honestly reported as short rather than padded')

// The seed's own order reaches this through the OTHER marker: ORD-1039 ships
// completed and reconciled with an ACT-DEMO- reserve movement, which is exactly
// how a real shop's first close ends up mixed.
const seededFirstClose = projectShopCloseAnomalyFlags(state(
  [close(0, { orderIds: ['ORD-1039', 'ORD-3000'].sort(), total: 500000 }), ...week({ total: 100000 })],
  [{ id: 'MOV-ACT-DEMO-1039', actionId: 'ACT-DEMO-1039', orderId: 'ORD-1039', sku: 'SM-1004', quantityDelta: -1 }],
))
check(seededFirstClose.flags.length === 0, 'the seeded order sweeping into a real first close raises nothing')

// The same close, with the sample order removed, is ordinary trading again --
// so the exclusion is about the sample marker, not about the shape of the close.
const realOnly = projectShopCloseAnomalyFlags(state(
  [close(0, { orderIds: ['ORD-3000'], total: 500000 }), ...week({ total: 100000 })],
  [],
))
check(flagFor(realOnly, 'takings') !== null, 'the same figures without a sample order do flag')

// A close that recorded no orders is not a sample: an empty list must not pass
// a membership check into a verdict about records that do not exist.
const zeroOrderClose = projectShopCloseAnomalyFlags(state([close(0, { orderIds: [], total: 0 })]))
check(zeroOrderClose.state === 'building_baseline', 'a zero-order close is still a close')

check(projectShopCloseAnomalyFlags(createSeedCommerce()).state === 'no_close', 'the seeded workspace projects nothing')

// ---------------------------------------------------------------------------
// 6. The projection is pure.
// ---------------------------------------------------------------------------
const closesInput = [close(2), close(0, { total: 900000 }), close(1)]
const closesBefore = closesInput.map((entry) => entry.id)
const unsorted = projectShopCloseAnomalyFlags(state([...closesInput, ...week()]))
check(closesInput.map((entry) => entry.id).join() === closesBefore.join(), 'the caller\'s array is never reordered in place')
check(unsorted.closeId === close(0).id, 'the newest close is read as today whatever order the array arrived in')

const repeatable = state([close(0, { total: 500000, settlementVarianceMmk: 40000, unpaidOrders: 5 }), ...week()])
check(
  JSON.stringify(projectShopCloseAnomalyFlags(repeatable)) === JSON.stringify(projectShopCloseAnomalyFlags(repeatable)),
  'the same state always projects the same answer',
)

// ---------------------------------------------------------------------------
// 7. An all-clear speaks only for what was compared, and names the right set.
// ---------------------------------------------------------------------------
// Fourteen closes, a drawer counted on only three of them, and today's drawer
// wildly off. The cash measure has no baseline, so it raises nothing — but the
// surface must not then say the drawer looked normal either.
const drawerRarelyCounted = projectShopCloseAnomalyFlags(state([
  close(0, { settlementVarianceMmk: 500000 }),
  ...Array.from({ length: 13 }, (_, n) => close(n + 1, n < 3 ? { settlementVarianceMmk: 0 } : {})),
]))
check(drawerRarelyCounted.state === 'nothing_unusual', 'a measure with no baseline raises nothing')
check(!drawerRarelyCounted.comparedMeasures.includes('cash_variance'), 'and is not reported as compared')
check(
  drawerRarelyCounted.comparedMeasures.join() === 'unpaid_orders,takings',
  'while the measures that did have a baseline are named',
)

// baselineDays counts the closes that recorded the measure; windowDays counts
// the window. Claiming "your last {windowDays} closes" when they differ would
// name a set that was never looked at.
const partiallyRecorded = projectShopCloseAnomalyFlags(state([
  close(0, { unpaidOrders: 4 }),
  ...Array.from({ length: 13 }, (_, n) => {
    const entry = close(n + 1, { unpaidOrders: 0 })
    if (n >= 8) delete entry.paymentExceptionOrderIds
    return entry
  }),
]))
const partialFlag = flagFor(partiallyRecorded, 'unpaid_orders')
check(partialFlag !== null && partialFlag.baselineDays === 8, 'only the closes that recorded the measure are compared')
check(partialFlag.windowDays === 13, 'and the window it was drawn from is reported alongside')

const wholeWindow = flagFor(newPeak, 'unpaid_orders')
check(wholeWindow.baselineDays === wholeWindow.windowDays, 'the two agree when every close recorded the measure')

// ---------------------------------------------------------------------------
// 8. A zero-order close is an accountable snapshot, not a missing day's sales.
// ---------------------------------------------------------------------------
const holiday = projectShopCloseAnomalyFlags(state([
  close(0, { orderIds: [], total: 0 }),
  ...week({ total: 100000 }),
]))
check(flagFor(holiday, 'takings') === null, 'a close with no orders raises no downward takings flag')
const quietButTrading = projectShopCloseAnomalyFlags(state([
  close(0, { total: 10000 }),
  ...week({ total: 100000 }),
]))
check(flagFor(quietButTrading, 'takings') !== null, 'a day that did trade, barely, still flags')

// ---------------------------------------------------------------------------
// 9. The sample guard survives a working-sample re-seed.
// ---------------------------------------------------------------------------
// Re-seeding a working sample deletes its ACT-DEMO- movements and SETUP-SAMPLE-
// orders but leaves `closes` untouched. With movements alone as the marker, the
// orphaned sample closes would start reading as real trading.
const orphanedSamples = projectShopCloseAnomalyFlags(state(sampleCloses, []))
check(orphanedSamples.state === 'no_close', 'sample closes stay excluded after their movements are deleted')

// ---------------------------------------------------------------------------
// 10. The threshold uses the exact median, never a rounded one.
// ---------------------------------------------------------------------------
// Eight closes at [0,0,0,0,1,1,1,1] have a median of 0.5, so two unpaid orders
// today is exactly 4x and must flag. Rounding the median to 1 would silently
// raise the bar to four orders.
const halfMedian = projectShopCloseAnomalyFlags(state([
  close(0, { unpaidOrders: 2 }),
  ...Array.from({ length: 8 }, (_, n) => close(n + 1, { unpaidOrders: n < 4 ? 0 : 1 })),
]))
const halfMedianFlag = flagFor(halfMedian, 'unpaid_orders')
check(halfMedianFlag !== null, 'two unpaid orders against a median of 0.5 is exactly 4x and flags')
check(halfMedianFlag.baselineMedian === 0.5, 'the exact median is exposed, not a rounded one')
check(halfMedianFlag.multipleOfMedian === 4, 'and the ratio is computed from it')

const halfMedianQuiet = projectShopCloseAnomalyFlags(state([
  close(0, { unpaidOrders: 1 }),
  ...Array.from({ length: 8 }, (_, n) => close(n + 1, { unpaidOrders: n < 4 ? 0 : 1 })),
]))
check(flagFor(halfMedianQuiet, 'unpaid_orders') === null, 'one unpaid order against the same median is 2x and stays quiet')

console.log(`shop close anomaly flags contract ok (${checks} checks)`)
