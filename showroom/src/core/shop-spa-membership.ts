import {
  validateShopServiceSchedule,
  type ShopServiceSchedule,
  type ShopServiceScheduleProof,
} from './shop-service-scheduling.ts'

export const spaMembershipPackages = [
  { sku: 'SPA-PACK-MASSAGE-5', label: 'Myanmar massage · 5 sessions', serviceId: 'service-session', sessions: 5 },
  { sku: 'SPA-PACK-FACIAL-3', label: 'Facial treatment · 3 sessions', serviceId: 'service-facial', sessions: 3 },
] as const

type SpaMembershipPackage = typeof spaMembershipPackages[number]

export type SpaMembershipOrderView = {
  sourceRecordId?: string
  customer: string
  status: string
  paymentStatus: string
  refundStatus: string
  paymentReconciledAt?: string
  lines?: readonly { sku: string; quantity: number }[]
}

export type SpaMembershipCommerceView = {
  orders: readonly SpaMembershipOrderView[]
}

export type SpaMembershipBalance = {
  customer: string
  packageSku: SpaMembershipPackage['sku']
  label: string
  serviceId: string
  purchased: number
  redeemed: number
  remaining: number
}

function exactIso(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null
}

function bounded(value: string, label: string, maximum: number) {
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum || Array.from(normalized).some((character) => {
    const code = character.codePointAt(0) as number
    return code <= 31 || code === 127
  })) throw new Error(`${label} is invalid.`)
  return normalized
}

export function spaMembershipBalances(
  commerce: SpaMembershipCommerceView,
  schedule: ShopServiceSchedule,
  asOfValue?: string,
): SpaMembershipBalance[] {
  validateShopServiceSchedule(schedule)
  if (schedule.industryPackId !== 'spa') return []
  const asOf = asOfValue === undefined ? Number.POSITIVE_INFINITY : exactIso(asOfValue)
  if (asOf === null) throw new Error('Membership balance time must be an exact ISO timestamp.')
  const purchases = new Map<string, number>()
  for (const order of commerce.orders) {
    const paidAt = order.paymentReconciledAt ? exactIso(order.paymentReconciledAt) : null
    const customer = typeof order.customer === 'string' ? order.customer.trim() : ''
    if (order.status !== 'completed' || order.paymentStatus !== 'reconciled' || order.refundStatus !== 'none' || paidAt === null || paidAt > asOf || !customer || customer === 'Guest') continue
    for (const line of order.lines ?? []) {
      const definition = spaMembershipPackages.find((candidate) => candidate.sku === line.sku)
      if (!definition || !Number.isSafeInteger(line.quantity) || line.quantity < 1) continue
      const key = `${customer}\u0000${definition.sku}`
      purchases.set(key, (purchases.get(key) ?? 0) + definition.sessions * line.quantity)
    }
  }
  const redeemed = new Map<string, number>()
  const bookingById = new Map(schedule.bookings.map((booking) => [booking.id, booking]))
  for (const event of schedule.events) {
    if (event.type !== 'package_redeemed') continue
    const happenedAt = exactIso(event.happenedAt)
    const booking = bookingById.get(event.subjectId)
    if (happenedAt === null || happenedAt > asOf || !booking) continue
    const definition = spaMembershipPackages.find((candidate) => candidate.serviceId === booking.serviceId)
    if (!definition) continue
    const key = `${booking.customerName.trim()}\u0000${definition.sku}`
    redeemed.set(key, (redeemed.get(key) ?? 0) + 1)
  }
  return [...purchases.entries()].map(([key, purchased]) => {
    const [customer, packageSku] = key.split('\u0000') as [string, SpaMembershipPackage['sku']]
    const definition = spaMembershipPackages.find((candidate) => candidate.sku === packageSku) as SpaMembershipPackage
    const used = redeemed.get(key) ?? 0
    return {
      customer,
      packageSku,
      label: definition.label,
      serviceId: definition.serviceId,
      purchased,
      redeemed: used,
      remaining: Math.max(0, purchased - used),
    }
  }).sort((left, right) => left.customer.localeCompare(right.customer) || left.packageSku.localeCompare(right.packageSku))
}

export function availableSpaMembershipForBooking(
  commerce: SpaMembershipCommerceView,
  schedule: ShopServiceSchedule,
  bookingId: string,
  asOfValue?: string,
) {
  validateShopServiceSchedule(schedule)
  const booking = schedule.bookings.find((candidate) => candidate.id === bookingId)
  if (!booking || booking.status !== 'completed') return null
  if (schedule.events.some((event) => event.type === 'package_redeemed' && event.subjectId === bookingId)) return null
  return spaMembershipBalances(commerce, schedule, asOfValue).find((balance) => (
    balance.customer === booking.customerName.trim()
    && balance.serviceId === booking.serviceId
    && balance.remaining > 0
  )) ?? null
}

export function redeemSpaMembershipSession(
  schedule: ShopServiceSchedule,
  commerce: SpaMembershipCommerceView,
  bookingId: string,
  proof: ShopServiceScheduleProof,
) {
  validateShopServiceSchedule(schedule)
  if (schedule.industryPackId !== 'spa') throw new Error('Membership packages are available only in the Spa pack.')
  const actor = bounded(proof.actor, 'Membership actor', 120)
  const reason = bounded(proof.reason, 'Membership reason', 240)
  const happenedAtValue = exactIso(proof.happenedAt)
  if (happenedAtValue === null) throw new Error('Membership evidence time must be an exact ISO timestamp.')
  const booking = schedule.bookings.find((candidate) => candidate.id === bookingId)
  if (!booking || booking.status !== 'completed') throw new Error('Complete the appointment before using a package session.')
  if (happenedAtValue < Date.parse(booking.updatedAt)) throw new Error('Package use cannot predate appointment completion.')
  if (schedule.events.some((event) => event.type === 'package_redeemed' && event.subjectId === bookingId)) return schedule
  const balance = availableSpaMembershipForBooking(commerce, schedule, bookingId, proof.happenedAt)
  if (!balance) throw new Error('No paid package session is available for this customer and treatment.')
  const revision = schedule.revision + 1
  return validateShopServiceSchedule({
    ...schedule,
    revision,
    events: [...schedule.events, {
      revision,
      type: 'package_redeemed' as const,
      subjectId: booking.id,
      actor,
      reason,
      happenedAt: proof.happenedAt,
    }],
  })
}
