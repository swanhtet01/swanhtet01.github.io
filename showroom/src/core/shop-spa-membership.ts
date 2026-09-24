import { sha256Hex } from './sha256.ts'
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
  id?: string
  completion?: { capturedAt: string }
  sourceRecordId?: string
  customer: string
  status: string
  paymentStatus: string
  refundStatus: string
  paymentReconciledAt?: string
  lines?: readonly { sku: string; quantity: number; unitPriceMmk?: number }[]
}

export type SpaMembershipCommerceView = {
  items?: readonly { sku: string }[]
  orders: readonly SpaMembershipOrderView[]
}

export type SpaMembershipBalance = {
  clientId?: string
  entitlementId?: string
  eligibleServiceIds?: string[]
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

function packageOrderDigest(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical)
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonical(entry)]))
    return item
  }
  return `sha256:${sha256Hex(JSON.stringify(canonical(value)))}`
}

export function spaMembershipBalances(
  commerce: SpaMembershipCommerceView,
  schedule: ShopServiceSchedule,
  asOfValue?: string,
): SpaMembershipBalance[] {
  validateShopServiceSchedule(schedule)
  if (schedule.industryPackId !== 'spa') return []
  const asOf = asOfValue === undefined ? Number.POSITIVE_INFINITY : exactIso(asOfValue)
  if (asOf === null) throw new Error('Invalid package balance time.')
  if (schedule.packageLedger) {
    const ledgerTime = asOfValue === undefined ? Date.now() : asOf
    return schedule.packageLedger.filter(entry => Date.parse(entry.issuedAt) <= ledgerTime).map(entry => {
      const definition = schedule.packageDefinitions!.find(d => d.id === entry.definitionId)!
      const client = schedule.clients.find(c => c.id === entry.clientId)!
      const order = commerce.orders.find(order => order.id === entry.sourceOrderId)
      const line = order?.lines?.[entry.sourceOrderLineIndex]
      const paidAt = order?.paymentReconciledAt ? Date.parse(order.paymentReconciledAt) : NaN
      const completedAt = order?.completion?.capturedAt ? Date.parse(order.completion.capturedAt) : NaN
      const purchaseMatches = order && order.customer === entry.clientId && order.status === 'completed'
        && order.paymentStatus === 'reconciled' && order.refundStatus === 'none'
        && Number.isFinite(paidAt) && paidAt <= ledgerTime && Number.isFinite(completedAt) && completedAt <= ledgerTime
        && line?.sku === definition.purchaseSku && line.unitPriceMmk === entry.purchasePriceMmk
        && Number.isSafeInteger(line.quantity) && line.quantity > 0
        && entry.allocatedSessions === line.quantity * definition.sessionsPerPurchase
        && packageOrderDigest(order) === entry.sourceOrderDigest
      return {
        customer: client.name, clientId: entry.clientId, entitlementId: entry.id,
        packageSku: definition.purchaseSku as SpaMembershipPackage['sku'], label: definition.label,
        serviceId: definition.eligibleServiceIds[0], eligibleServiceIds: definition.eligibleServiceIds,
        purchased: entry.allocatedSessions, redeemed: entry.allocatedSessions - entry.remainingSessions,
        remaining: purchaseMatches && definition.active && !client.anonymizedAt && Date.parse(entry.expiresAt) > ledgerTime ? entry.remainingSessions : 0,
      }
    })
  }
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
  if (schedule.packageLedger?.some(entry => entry.evidence.some(e => e.bookingId === bookingId))) return null
  if (schedule.events.some((event) => event.type === 'package_redeemed' && event.subjectId === bookingId)) return null
  return spaMembershipBalances(commerce, schedule, asOfValue).find((balance) => (
    (balance.clientId ? balance.clientId === booking.clientId : balance.customer === booking.customerName.trim())
    && (balance.eligibleServiceIds ? balance.eligibleServiceIds.includes(booking.serviceId) : balance.serviceId === booking.serviceId)
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
  if (schedule.industryPackId !== 'spa') throw new Error('Packages require the Spa pack.')
  const actor = bounded(proof.actor, 'Membership actor', 120)
  const reason = bounded(proof.reason, 'Membership reason', 240)
  const happenedAtValue = exactIso(proof.happenedAt)
  if (happenedAtValue === null) throw new Error('Invalid package evidence time.')
  const booking = schedule.bookings.find((candidate) => candidate.id === bookingId)
  if (!booking || booking.status !== 'completed') throw new Error('Complete the appointment first.')
  if (happenedAtValue < Date.parse(booking.updatedAt)) throw new Error('Complete the appointment before redeeming.')
  if (schedule.packageLedger?.some(entry => entry.evidence.some(e => e.bookingId === bookingId))) return schedule
  if (schedule.events.some((event) => event.type === 'package_redeemed' && event.subjectId === bookingId)) return schedule
  const balance = availableSpaMembershipForBooking(commerce, schedule, bookingId, proof.happenedAt)
  if (!balance) throw new Error('No eligible paid session is available.')
  const revision = schedule.revision + 1
  if (balance.entitlementId && schedule.packageLedger) {
    const event = { revision, type: 'package_redeemed' as const, subjectId: balance.entitlementId, actor, reason, happenedAt: proof.happenedAt }
    return validateShopServiceSchedule({
      ...schedule, revision,
      packageLedger: schedule.packageLedger.map(entry => entry.id !== balance.entitlementId ? entry : {
        ...entry, remainingSessions: entry.remainingSessions - 1,
        status: entry.remainingSessions === 1 ? 'exhausted' : 'active', version: entry.version + 1,
        evidence: [...entry.evidence, { revision, type: 'package_redeemed', actor, reason, happenedAt: proof.happenedAt, bookingId }],
      }),
      events: [...schedule.events, event],
    })
  }
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

function packageWriteBase(schedule: ShopServiceSchedule, proof: ShopServiceScheduleProof) {
  validateShopServiceSchedule(schedule)
  if (schedule.industryPackId !== 'spa') throw new Error('Packages require a Spa schedule.')
  if (schedule.bookings.some(b => !b.resourceIds)) throw new Error('Assign staff and rooms to older appointments first.')
  if (exactIso(proof.happenedAt) === null) throw new Error('Invalid package time.')
  return { ...schedule, packageDefinitions: schedule.packageDefinitions ?? [], packageLedger: schedule.packageLedger ?? [],
    revision: schedule.revision + 1 }
}

export function defineSpaMembershipPackage(schedule: ShopServiceSchedule, commerce: SpaMembershipCommerceView, sku: string, proof: ShopServiceScheduleProof) {
  const next = packageWriteBase(schedule, proof)
  const template = spaMembershipPackages.find(p => p.sku === sku)
  if (!template || !commerce.items?.some(item => item.sku === sku)) throw new Error('Package is missing from the catalog.')
  if (next.packageDefinitions.some(d => d.purchaseSku === sku)) throw new Error('Package already set up.')
  if (!schedule.services.some(s => s.id === template.serviceId && s.active)) throw new Error('Activate the package treatment first.')
  const definition = { id: `package-${String(next.revision).padStart(4, '0')}`, label: template.label, purchaseSku: sku,
    eligibleServiceIds: [template.serviceId], sessionsPerPurchase: template.sessions, active: true }
  return validateShopServiceSchedule({ ...next, packageDefinitions: [...next.packageDefinitions, definition],
    events: [...schedule.events, { revision: next.revision, type: 'package_definition_saved', subjectId: definition.id,
      actor: bounded(proof.actor, 'Package actor', 120), reason: bounded(proof.reason, 'Package reason', 240), happenedAt: proof.happenedAt }] })
}

export function eligibleSpaPackagePurchase(schedule: ShopServiceSchedule, commerce: SpaMembershipCommerceView, orderId: string, lineIndex: number, asOf = new Date().toISOString()) {
  if (schedule.industryPackId !== 'spa' || schedule.bookings.some(b => !b.resourceIds)) return null
  const order = commerce.orders.find(o => o.id === orderId)
  const line = Number.isSafeInteger(lineIndex) && lineIndex >= 0 ? order?.lines?.[lineIndex] : undefined
  const definition = schedule.packageDefinitions?.find(d => d.purchaseSku === line?.sku && d.active)
  const at = Date.parse(asOf)
  if (!order || !line || !definition || order.status !== 'completed' || order.paymentStatus !== 'reconciled' || order.refundStatus !== 'none'
    || !order.paymentReconciledAt || !(Date.parse(order.paymentReconciledAt) <= at)
    || !order.completion || !(Date.parse(order.completion.capturedAt) <= at)
    || !schedule.clients.some(c => c.id === order.customer && !c.anonymizedAt)
    || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.unitPriceMmk) || (line.unitPriceMmk ?? 0) < 1) return null
  return { order, line, definition }
}

export function allocateSpaMembershipPackage(schedule: ShopServiceSchedule, commerce: SpaMembershipCommerceView, orderId: string, lineIndex: number, proof: ShopServiceScheduleProof) {
  const next = packageWriteBase(schedule, proof)
  const purchase = eligibleSpaPackagePurchase(schedule, commerce, orderId, lineIndex, proof.happenedAt)
  if (!purchase) throw new Error('Choose a paid package for an active client.')
  const { order, line, definition } = purchase
  const at = Date.parse(proof.happenedAt)
  if (next.packageLedger.some(e => e.sourceOrderId === orderId && e.sourceOrderLineIndex === lineIndex)) throw new Error('Purchase already allocated.')
  const id = `package-entitlement-${String(next.revision).padStart(4, '0')}`
  const evidence = { revision: next.revision, type: 'package_allocated' as const, actor: bounded(proof.actor, 'Package actor', 120), reason: bounded(proof.reason, 'Package reason', 240), happenedAt: proof.happenedAt }
  const sessions = line.quantity * definition.sessionsPerPurchase
  return validateShopServiceSchedule({ ...next, packageLedger: [...next.packageLedger, { id, clientId: order.customer, definitionId: definition.id,
    sourceOrderId: orderId, sourceOrderLineIndex: lineIndex, sourceOrderDigest: packageOrderDigest(order), purchasePriceMmk: line.unitPriceMmk!,
    allocatedSessions: sessions, remainingSessions: sessions, issuedAt: proof.happenedAt, expiresAt: new Date(at + 365 * 86400000).toISOString(),
    status: 'active', version: 1, evidence: [evidence] }], events: [...schedule.events, { ...evidence, subjectId: id }] })
}
