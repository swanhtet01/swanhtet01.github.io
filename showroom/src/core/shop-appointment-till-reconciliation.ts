import { myanmarBusinessDate, type CommerceOrder, type CommerceState } from './commerce-workspace.ts'
import {
  shopServiceForCatalogName, validateShopServiceSchedule,
  type ShopService, type ShopServiceBooking, type ShopServiceSchedule,
} from './shop-service-scheduling.ts'

/**
 * Which treatments completed today never reached the till?
 *
 * THE BOUNDARY THIS DOES NOT CROSS. The appointment book posts nothing to the ledger:
 * shop-service-scheduling.ts has no reference to commerce, commerce-workspace.ts has no
 * reference to bookings, and `expectedRevenueMmk` is a display projection rather than a
 * ledger entry. That separation is deliberate, disclosed, and stays exactly as it is.
 *
 * What was missing is not a posting mechanism. It is the owner being TOLD. She completes an
 * appointment in the book AND rings the treatment at the counter; those are two acts, and the
 * second one is the one that gets forgotten on a busy day. A completed appointment she never
 * re-keys reaches no order, so it reaches no daily close, so the money is simply gone from the
 * day's evidence and nothing anywhere says so.
 *
 * Everything below is a read-only derivation over state that already exists. It creates no
 * order, modifies no order, settles nothing, and writes nothing. The owner acts on what it
 * surfaces through the ordinary, gated counter flow -- which is the only place an accountable
 * actor and a reason get attached to money.
 */

export type ShopAppointmentTillGap = {
  serviceId: string
  serviceName: string
  serviceNameMy?: string
  unitPriceMmk: number
  /** Appointments for this treatment completed on the business date. */
  completedCount: number
  /** Units of this treatment rung up at the counter on the business date. */
  chargedQuantity: number
  unpostedCount: number
  unpostedValueMmk: number
  /** Today's completed appointments for this treatment, earliest first. */
  bookings: ShopServiceBooking[]
  /**
   * Best-effort identity for the appointments still owing. An order line records WHAT was sold,
   * never WHICH appointment it settled, so there is no honest way to pair a specific booking to
   * a specific sale. Earliest-first is assumed settled, so the ids named here are the latest
   * ones. The COUNT is the load-bearing fact; treat these ids as a starting point for the
   * owner, not as an accusation against a named customer.
   */
  unpostedBookingIds: string[]
}

export type ShopAppointmentTillReconciliation = {
  /** The same Myanmar business date the daily close uses, so the two can never disagree. */
  businessDate: string
  completedBookings: number
  unpostedBookings: number
  unpostedValueMmk: number
  /** Only treatments with a shortfall. A clean day produces an empty list and renders nothing. */
  gaps: ShopAppointmentTillGap[]
}

type TillLine = { name: string; quantity: number }

function orderTillLines(order: CommerceOrder): TillLine[] {
  if (Array.isArray(order.lines) && order.lines.length) {
    return order.lines.map((line) => ({ name: line?.name ?? '', quantity: Number(line?.quantity) || 0 }))
  }
  // Orders written before order lines existed carry one item name and the order quantity.
  return [{ name: typeof order.item === 'string' ? order.item : '', quantity: Number(order.quantity) || 0 }]
}

export function projectShopAppointmentTillReconciliation(
  schedule: ShopServiceSchedule,
  commerce: Pick<CommerceState, 'orders'> | null | undefined,
  now: string | Date = new Date(),
): ShopAppointmentTillReconciliation {
  validateShopServiceSchedule(schedule)
  const nowIso = now instanceof Date ? now.toISOString() : now
  const businessDate = myanmarBusinessDate(nowIso)
  const empty: ShopAppointmentTillReconciliation = { businessDate, completedBookings: 0, unpostedBookings: 0, unpostedValueMmk: 0, gaps: [] }

  const serviceById = new Map(schedule.services.map((service) => [service.id, service]))
  const completedToday = schedule.bookings
    .filter((booking) => booking.status === 'completed' && myanmarBusinessDate(booking.startsAt) === businessDate)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  if (!completedToday.length) return empty

  const byService = new Map<string, ShopServiceBooking[]>()
  for (const booking of completedToday) {
    const existing = byService.get(booking.serviceId)
    if (existing) existing.push(booking)
    else byService.set(booking.serviceId, [booking])
  }

  // Only treatments actually completed today can be settled today, so only those are candidates
  // for a line. shopServiceForCatalogName resolves a line to exactly one of them, so a line is
  // never counted against two treatments whose names share a prefix.
  const candidates = [...byService.keys()]
    .map((serviceId) => serviceById.get(serviceId))
    .filter((service): service is ShopService => Boolean(service))

  const chargedByService = new Map<string, number>()
  for (const order of commerce?.orders ?? []) {
    // A cancelled order is not money taken. Everything else counts, including a sale whose
    // payment is still pending reconciliation -- it was rung up, which is the question here.
    if (!order || order.status === 'cancelled') continue
    if (typeof order.createdAt !== 'string' || myanmarBusinessDate(order.createdAt) !== businessDate) continue
    for (const line of orderTillLines(order)) {
      if (line.quantity <= 0) continue
      const service = shopServiceForCatalogName(line.name, candidates)
      if (!service) continue
      chargedByService.set(service.id, (chargedByService.get(service.id) ?? 0) + line.quantity)
    }
  }

  const gaps: ShopAppointmentTillGap[] = []
  let unpostedBookings = 0
  let unpostedValueMmk = 0
  for (const service of candidates) {
    const bookings = byService.get(service.id) ?? []
    const chargedQuantity = chargedByService.get(service.id) ?? 0
    const unpostedCount = Math.max(0, bookings.length - chargedQuantity)
    if (!unpostedCount) continue
    const gapValue = unpostedCount * service.priceMmk
    unpostedBookings += unpostedCount
    unpostedValueMmk += gapValue
    gaps.push({
      serviceId: service.id,
      serviceName: service.name,
      ...(service.nameMy === undefined ? {} : { serviceNameMy: service.nameMy }),
      unitPriceMmk: service.priceMmk,
      completedCount: bookings.length,
      chargedQuantity,
      unpostedCount,
      unpostedValueMmk: gapValue,
      bookings,
      unpostedBookingIds: bookings.slice(bookings.length - unpostedCount).map((booking) => booking.id),
    })
  }
  gaps.sort((left, right) => right.unpostedValueMmk - left.unpostedValueMmk || left.serviceName.localeCompare(right.serviceName))

  return { businessDate, completedBookings: completedToday.length, unpostedBookings, unpostedValueMmk, gaps }
}
