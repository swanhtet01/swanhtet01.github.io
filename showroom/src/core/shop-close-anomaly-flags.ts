import type { CommerceClose, CommerceState } from './commerce-workspace.ts'

// Anomaly flags on the close (PRODUCT-SUPREMACY-ROADMAP.md §2 item 5).
//
// WHAT THIS IS. A pure projection over closes that are already saved. It reads
// the last close, compares three of its numbers against the same numbers on
// the closes before it, and returns the ones that are out of line. There is no
// LLM, no network, no new domain record, no new event kind and no write path —
// a stored anomaly would be a claim that outlives the data justifying it, so
// nothing here is stored. Re-running the projection on the same CommerceState
// always returns the same answer: it never reads a clock, so "today" means
// "the most recent close", not "the current date".
//
// WHY THESE THREE, AND ONLY THESE THREE. A flag nobody acts on is noise, so a
// measure earns its place only if the owner can do something about it in the
// minutes between counting the drawer and locking the door:
//   - CASH VARIANCE — the counted drawer against what the orders say. A big
//     difference is worth a recount while the cash and the cashier are both
//     still there. This is the roadmap's own "4× your median" example.
//   - UNPAID ORDERS — orders leaving the day without payment reconciled. That
//     is money still collectable, and the close already names the order ids.
//   - TAKINGS — the close total. Unusually high is worth checking for a
//     double-keyed sale or an extra zero; unusually low is worth checking that
//     every sale was actually rung up before the day is sealed.
// Deliberately NOT flagged, because each would double-report a cause that is
// already on screen: the order COUNT (a slow day already shows in takings, and
// two flags for one cause is noise), AVERAGE SALE VALUE (a ratio of takings to
// order count — whatever moves it is already the takings flag or is a normal
// mix change), STOCK EXCEPTION SKUS (the close lists them by name; a count
// being unusual does not change what the owner does with the list), and
// PER-PAYMENT-METHOD variance (the action is one drawer recount either way,
// and the method breakdown is already on the settlement panel).
//
// THIN DATA FAILS QUIET. A shop with three closes has no usual day, and
// inventing a baseline from two observations is the single most likely way
// this ships something false. Nothing is flagged until there are
// SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS prior closes to compare against, and
// each measure counts only the closes that actually RECORDED it: a legacy
// close carries no payment-exception list and a close saved without a
// settlement count carries no variance, so neither is silently read as a zero
// (which would drag a median down and manufacture a spike). Until a measure
// has its baseline it simply does not fire, and the surface says it is still
// learning rather than guessing. A measure that sat out is reported as such:
// `comparedMeasures` names only what was actually compared, so an all-clear
// can never be spoken on behalf of a measure nobody looked at — a shop that
// never counts its drawer must not be told its drawer looked normal.
//
// GUIDED SAMPLES RAISE NOTHING (CLAUDE.md proof-counter rule). Sample-seeded
// records are identified by their `ACT-DEMO-` actionId prefix, never by actor
// string, or by the working sample's own `SETUP-SAMPLE-` order-id prefix —
// two independent structural markers, because re-seeding a working sample
// deletes its movements and orders while leaving `closes` untouched. A close
// that touches ANY sample order — not merely one made entirely of them — is
// dropped from both the subject position and the baseline, because the day's
// figures are summed across every order it swept in and cannot be
// unpicked faithfully from the close record (see
// `shopCloseTouchesGuidedSample` for why subtraction was rejected). So a
// demo workspace cannot produce a flag that reads like a real finding. Note this is belt-and-braces: closes are the
// one record type guided seeding never creates, because the close write path
// admits only a full-UUID `ACT-…` actionId (commerce-workspace.ts's
// `closeActionIdPattern`), which no `ACT-DEMO-` value can match.

/** Prior closes considered — two trading weeks, so a distant past cannot drag the baseline. */
export const SHOP_CLOSE_ANOMALY_BASELINE_WINDOW = 14

/** Prior closes required before any flag may be raised — a full trading week. */
export const SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS = 7

/**
 * How far out of line counts as unusual, applied symmetrically on the
 * multiplicative scale: at or above 4× the median, or at or below a quarter of
 * it. The roadmap's own example. Deliberately conservative — a threshold that
 * fires on an ordinary busy Saturday trains the owner to ignore the panel.
 */
export const SHOP_CLOSE_ANOMALY_MULTIPLE = 4

/** Below this, a drawer difference is rounding, not a recount. */
export const SHOP_CLOSE_ANOMALY_CASH_FLOOR_MMK = 1000

/** The action-prefix that marks seeded sample records (CLAUDE.md: prefix, never actor). */
const SAMPLE_ACTION_ID_PREFIX = 'ACT-DEMO-'

/** The order-id prefix the working sample installer stamps on its own orders. */
const SAMPLE_ORDER_ID_PREFIX = 'SETUP-SAMPLE-'

export type ShopCloseAnomalyMeasure = 'cash_variance' | 'unpaid_orders' | 'takings'

export type ShopCloseAnomalyDirection = 'above' | 'below'

/**
 * How the comparison was made. `multiple_of_median` is the ordinary case. When
 * the median is zero a ratio is undefined — a drawer that has never been off,
 * or a shop that never leaves an order unpaid — so the claim becomes the one
 * that is still true and still checkable: higher than every day in the window.
 */
export type ShopCloseAnomalyBasis = 'multiple_of_median' | 'above_every_baseline_day'

export type ShopCloseAnomalyFlag = {
  measure: ShopCloseAnomalyMeasure
  direction: ShopCloseAnomalyDirection
  basis: ShopCloseAnomalyBasis
  /** The measured value on the close being read. */
  todayValue: number
  /**
   * Median of the same measure across the baseline closes, EXACT — the number
   * both the threshold and the ratio are computed from. Count measures can
   * carry a half value; rounding it would move the threshold.
   */
  baselineMedian: number
  /** Highest value of the same measure across the baseline closes. */
  baselineHigh: number
  /** How many baseline closes recorded this measure — what the comparison used. */
  baselineDays: number
  /**
   * How many prior closes were in the window at all. Equal to baselineDays
   * whenever every close recorded the measure; larger when some did not, and
   * the surface must then not claim it compared the whole window.
   */
  windowDays: number
  /** todayValue ÷ baselineMedian to one decimal; null when the median is zero. */
  multipleOfMedian: number | null
}

export type ShopCloseAnomalyState = 'no_close' | 'building_baseline' | 'nothing_unusual' | 'flagged'

export type ShopCloseAnomalyFlags = {
  state: ShopCloseAnomalyState
  /** The close the flags describe; null when there is nothing closed yet. */
  closeId: string | null
  businessDate: string | null
  /** Comparable prior closes in the window — the close being read is not counted. */
  baselineDays: number
  /** Prior closes still needed before any flag can be raised; zero once there are enough. */
  baselineDaysNeeded: number
  /**
   * The measures that actually had both a value on this close and a full
   * baseline behind it. A measure missing from this list was not compared, and
   * "nothing stood out" must never be said on its behalf — that is how a
   * silent measure turns into a false all-clear.
   */
  comparedMeasures: ShopCloseAnomalyMeasure[]
  flags: ShopCloseAnomalyFlag[]
}

type ShopCloseAnomalyMeasureSpec = {
  measure: ShopCloseAnomalyMeasure
  /** null when this close did not record the measure — never coerced to zero. */
  read: (close: CommerceClose) => number | null
  /** Whether an unusually LOW value is worth saying. A small drawer variance is good news. */
  watchLow: boolean
  /** Whether a zero median may still flag on "higher than every day in the window". */
  spikeOnZeroMedian: boolean
  /**
   * Smallest value worth raising in the ABOVE direction, whatever the ratio
   * says. It deliberately does not guard the below direction: a floor there
   * would read "too small to mention", which is the opposite of what a low
   * flag means. The below direction's own guard is `subject.orders`.
   */
  spikeFloor: number
}

// Ordered by how urgent the action is: the drawer can only be recounted while
// the till is still open, unpaid orders can be chased tomorrow, and a takings
// check is a review of records that are not going anywhere.
const SHOP_CLOSE_ANOMALY_MEASURES: readonly ShopCloseAnomalyMeasureSpec[] = [
  {
    measure: 'cash_variance',
    read: (close) => close.settlement ? Math.abs(close.settlement.totalVarianceMmk) : null,
    watchLow: false,
    spikeOnZeroMedian: true,
    spikeFloor: SHOP_CLOSE_ANOMALY_CASH_FLOOR_MMK,
  },
  {
    measure: 'unpaid_orders',
    read: (close) => close.paymentExceptionOrderIds ? close.paymentExceptionOrderIds.length : null,
    watchLow: false,
    spikeOnZeroMedian: true,
    spikeFloor: 1,
  },
  {
    measure: 'takings',
    // Every close records a total, so this measure never sits out. A zero
    // median here would mean a shop that has taken nothing for a fortnight;
    // "higher than every day" would then fire on the first ordinary sale, so
    // takings compares by ratio only.
    read: (close) => close.total,
    watchLow: true,
    spikeOnZeroMedian: false,
    spikeFloor: 1,
  },
]

function shopCloseAnomalyMedian(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Order ids that came from guided sample seeding. Two independent markers,
 * either sufficient, because the first one alone can go stale: re-seeding a
 * working sample deletes its `ACT-DEMO-WORKING-SAMPLE-` movements and its
 * `SETUP-SAMPLE-` orders but leaves `closes` untouched, so a close over
 * deleted sample orders would otherwise start reading as real trading.
 *   1. the order's stock movement carries the `ACT-DEMO-` actionId prefix —
 *      the seeded walkthrough orders and the working sample's counter sales
 *      both reserve stock under one;
 *   2. the order id itself carries the working sample's structural prefix.
 * Both are structural markers on the record. Neither is an actor string.
 */
function shopCloseAnomalySampleOrderIds(commerce: CommerceState) {
  const sampleOrderIds = new Set<string>()
  for (const movement of commerce.movements) {
    if (movement.orderId && movement.actionId.startsWith(SAMPLE_ACTION_ID_PREFIX)) sampleOrderIds.add(movement.orderId)
  }
  return sampleOrderIds
}

function shopCloseOrderIsGuidedSample(orderId: string, sampleOrderIds: ReadonlySet<string>) {
  return sampleOrderIds.has(orderId) || orderId.startsWith(SAMPLE_ORDER_ID_PREFIX)
}

/**
 * Whether a close touched guided sample activity AT ALL — one sampled order out
 * of ten is enough. `commerceCloseExpectation` sweeps every completed,
 * reconciled, not-yet-closed order into the day regardless of origin, so a close
 * can hold real sales and sample sales together and its `total` is their sum.
 * This is not an exotic case: `createSeedCommerce` ships ORD-1039 already
 * completed and reconciled, so the FIRST close a seeded workspace saves is
 * normally a mixed one.
 *
 * WHY THE WHOLE CLOSE IS DROPPED RATHER THAN THE SAMPLE PART SUBTRACTED. The
 * close records `orderIds` and one summed `total`; it does not record what each
 * order contributed. Subtracting would mean re-deriving each sample order's
 * adjusted total from `commerce.orders` today — and that is exactly the data a
 * working-sample re-seed DELETES, and that later order corrections move. The
 * result would be a reconstruction presented as the record. A flag is a claim
 * about the owner's money, so the right failure mode for a close this
 * projection cannot describe faithfully is to say nothing about it.
 *
 * The cost is bounded and self-healing: an order can never be closed twice, so
 * each sample order can contaminate at most one close, and the thin-data gate
 * already counts only usable closes — a workspace that has been exploring
 * samples is told it needs more closes, which closing more real days fixes.
 *
 * A close that recorded no orders is NOT a sample, and neither is a legacy close
 * with no `orderIds` to check — an absent list is missing evidence, not evidence
 * of absence, and the close surface separately tells the owner that a legacy
 * close history needs migration.
 */
function shopCloseTouchesGuidedSample(close: CommerceClose, sampleOrderIds: ReadonlySet<string>) {
  const orderIds = close.orderIds
  if (!orderIds || orderIds.length === 0) return false
  return orderIds.some((orderId) => shopCloseOrderIsGuidedSample(orderId, sampleOrderIds))
}

/**
 * What this close and its baseline actually measured, or null when there is
 * nothing to compare: the close did not record the measure, or too few of the
 * closes behind it did.
 */
function shopCloseAnomalyComparison(
  spec: ShopCloseAnomalyMeasureSpec,
  subject: CommerceClose,
  baseline: readonly CommerceClose[],
) {
  const todayValue = spec.read(subject)
  if (todayValue === null) return null

  const observations: number[] = []
  for (const close of baseline) {
    const value = spec.read(close)
    if (value !== null) observations.push(value)
  }
  if (observations.length < SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS) return null

  return {
    todayValue,
    // EXACT, never rounded. Rounding here moves the threshold itself: over
    // [0,0,0,0,1,1,1,1] the median is 0.5, so a day with 2 unpaid orders is
    // exactly 4× and must flag — rounded to 1 it would take 4 orders before
    // anything was said. It is also the median the ratio is computed from, so a
    // reader can check the arithmetic in the sentence against the numbers
    // beside it. Count measures can therefore carry a half value; formatting is
    // the surface's job, not the projection's.
    baselineMedian: shopCloseAnomalyMedian(observations),
    baselineHigh: Math.max(...observations),
    baselineDays: observations.length,
  }
}

function shopCloseAnomalyFlag(
  spec: ShopCloseAnomalyMeasureSpec,
  subject: CommerceClose,
  comparison: NonNullable<ReturnType<typeof shopCloseAnomalyComparison>>,
  windowDays: number,
): ShopCloseAnomalyFlag | null {
  const { todayValue, baselineMedian, baselineHigh } = comparison
  const measured = { measure: spec.measure, ...comparison, windowDays }

  if (baselineMedian > 0) {
    const multipleOfMedian = Math.round((todayValue / baselineMedian) * 10) / 10
    if (todayValue >= baselineMedian * SHOP_CLOSE_ANOMALY_MULTIPLE && todayValue >= spec.spikeFloor) {
      return { ...measured, direction: 'above', basis: 'multiple_of_median', multipleOfMedian }
    }
    // A close that recorded NO orders is the accountable-snapshot flow the
    // settlement panel documents ("save a zero-value close only if the business
    // date still needs an accountable snapshot"), and the close screen already
    // says "0 completed, reconciled orders" directly above this block. Telling
    // a shop that shut for a holiday to go looking for sales it never made is
    // the clearest way to teach an owner to ignore the panel.
    if (spec.watchLow && subject.orders > 0 && todayValue * SHOP_CLOSE_ANOMALY_MULTIPLE <= baselineMedian) {
      return { ...measured, direction: 'below', basis: 'multiple_of_median', multipleOfMedian }
    }
    return null
  }

  if (!spec.spikeOnZeroMedian) return null
  if (todayValue > baselineHigh && todayValue >= spec.spikeFloor) {
    return { ...measured, direction: 'above', basis: 'above_every_baseline_day', multipleOfMedian: null }
  }
  return null
}

export function projectShopCloseAnomalyFlags(commerce: CommerceState): ShopCloseAnomalyFlags {
  const sampleOrderIds = shopCloseAnomalySampleOrderIds(commerce)
  // `closes` is written newest-first, but the order is sorted here rather than
  // assumed: reading the wrong close as "today" would put a normal day in the
  // subject position and a baseline in the wrong window.
  const closes = commerce.closes
    .filter((close) => !shopCloseTouchesGuidedSample(close, sampleOrderIds))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))

  const subject = closes[0]
  if (!subject) {
    return {
      state: 'no_close',
      closeId: null,
      businessDate: null,
      baselineDays: 0,
      baselineDaysNeeded: SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS,
      comparedMeasures: [],
      flags: [],
    }
  }

  const baseline = closes.slice(1, 1 + SHOP_CLOSE_ANOMALY_BASELINE_WINDOW)
  const closeId = subject.id
  const businessDate = subject.businessDate ?? null

  if (baseline.length < SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS) {
    return {
      state: 'building_baseline',
      closeId,
      businessDate,
      baselineDays: baseline.length,
      baselineDaysNeeded: SHOP_CLOSE_ANOMALY_MIN_BASELINE_DAYS - baseline.length,
      comparedMeasures: [],
      flags: [],
    }
  }

  const comparedMeasures: ShopCloseAnomalyMeasure[] = []
  const flags: ShopCloseAnomalyFlag[] = []
  for (const spec of SHOP_CLOSE_ANOMALY_MEASURES) {
    const comparison = shopCloseAnomalyComparison(spec, subject, baseline)
    if (!comparison) continue
    comparedMeasures.push(spec.measure)
    const flag = shopCloseAnomalyFlag(spec, subject, comparison, baseline.length)
    if (flag) flags.push(flag)
  }

  return {
    state: flags.length > 0 ? 'flagged' : 'nothing_unusual',
    closeId,
    businessDate,
    baselineDays: baseline.length,
    baselineDaysNeeded: 0,
    comparedMeasures,
    flags,
  }
}
