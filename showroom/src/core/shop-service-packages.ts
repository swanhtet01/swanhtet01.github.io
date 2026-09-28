import type { ShopServiceSchedule } from './shop-service-scheduling.ts'
export type ServicePackageDefinition = { id: string; label: string; purchaseSku: string; eligibleServiceIds: string[]; sessionsPerPurchase: number; active: boolean }
export type ServicePackageEvidence = { revision: number; type: 'package_allocated' | 'package_redeemed'; actor: string; reason: string; happenedAt: string; bookingId?: string }
export type ServicePackageEntitlement = { id: string; clientId: string; definitionId: string; sourceOrderId: string; sourceOrderLineIndex: number; sourceOrderDigest: string; purchasePriceMmk: number; allocatedSessions: number; remainingSessions: number; issuedAt: string; expiresAt: string; status: 'active' | 'exhausted'; version: number; evidence: ServicePackageEvidence[] }
const terms: Record<string, number> = { 'SPA-PACK-MASSAGE-5': 5, 'SPA-PACK-FACIAL-3': 3 }
function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`Invalid package ledger: ${message}.`) }
function integer(value: number, minimum = 0) { return Number.isSafeInteger(value) && value >= minimum }
function time(value: string) { const result = Date.parse(value); requireValue(Number.isFinite(result), 'timestamp'); return result }
function text(value: string, max: number) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) }
function exact(value: object, keys: string[]) { requireValue(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === keys.sort().join('|'), 'fields') }
export function validateServicePackages(state: ShopServiceSchedule) {
  if (state.packageDefinitions === undefined && state.packageLedger === undefined) return
  requireValue(Array.isArray(state.packageDefinitions) && Array.isArray(state.packageLedger), 'incomplete contract')
  requireValue(state.packageDefinitions.length <= 50 && state.packageLedger.length <= 1000, 'size')
  const definitions = new Map<string, ServicePackageDefinition>(), skus = new Set<string>()
  for (const definition of state.packageDefinitions) {
    exact(definition, ['id','label','purchaseSku','eligibleServiceIds','sessionsPerPurchase','active'])
    requireValue(/^package-[A-Za-z0-9][A-Za-z0-9_-]{2,71}$/.test(definition.id) && !definitions.has(definition.id), 'definition ID')
    requireValue(text(definition.label, 160) && Object.hasOwn(terms, definition.purchaseSku) && !skus.has(definition.purchaseSku), 'definition label or SKU')
    requireValue(definition.sessionsPerPurchase === terms[definition.purchaseSku] && typeof definition.active === 'boolean', 'terms')
    requireValue(Array.isArray(definition.eligibleServiceIds) && definition.eligibleServiceIds.length > 0 && definition.eligibleServiceIds.length <= 100 && new Set(definition.eligibleServiceIds).size === definition.eligibleServiceIds.length && definition.eligibleServiceIds.every(id => state.services.some(s => s.id === id)), 'eligible services')
    definitions.set(definition.id, definition); skus.add(definition.purchaseSku)
  }
  const ids = new Set<string>(), lines = new Set<string>(), bookings = new Set<string>(), revisions = new Set<number>()
  for (const entry of state.packageLedger) {
    exact(entry, ['id','clientId','definitionId','sourceOrderId','sourceOrderLineIndex','sourceOrderDigest','purchasePriceMmk','allocatedSessions','remainingSessions','issuedAt','expiresAt','status','version','evidence'])
    requireValue(/^package-entitlement-[A-Za-z0-9][A-Za-z0-9_-]{2,59}$/.test(entry.id) && !ids.has(entry.id), 'entitlement ID'); ids.add(entry.id)
    const definition = definitions.get(entry.definitionId)
    requireValue(definition && state.clients.some(c => c.id === entry.clientId), 'client or definition')
    const line = `${entry.sourceOrderId}:${entry.sourceOrderLineIndex}`
    requireValue(text(entry.sourceOrderId, 80) && integer(entry.sourceOrderLineIndex) && !lines.has(line) && /^sha256:[a-f0-9]{64}$/.test(entry.sourceOrderDigest), 'purchase binding'); lines.add(line)
    requireValue(integer(entry.purchasePriceMmk, 1) && integer(entry.allocatedSessions, 1) && integer(entry.remainingSessions) && entry.remainingSessions <= entry.allocatedSessions, 'balance')
    requireValue(time(entry.expiresAt) === time(entry.issuedAt) + 365 * 86400000, 'expiry')
    requireValue(entry.status === (entry.remainingSessions ? 'active' : 'exhausted'), 'status')
    requireValue(Array.isArray(entry.evidence) && entry.evidence.length > 0 && entry.evidence.length <= 1000 && entry.version === entry.evidence.length, 'evidence version')
    let priorRevision = 0, priorTime = -Infinity
    entry.evidence.forEach((evidence, index) => {
      exact(evidence, ['revision','type','actor','reason','happenedAt', ...(index ? ['bookingId'] : [])])
      requireValue(integer(evidence.revision, 1) && evidence.revision > priorRevision && !revisions.has(evidence.revision), 'evidence revision')
      requireValue(evidence.type === (index ? 'package_redeemed' : 'package_allocated') && text(evidence.actor, 120) && text(evidence.reason, 240), 'evidence')
      const at = time(evidence.happenedAt)
      requireValue(at >= priorTime, 'evidence order')
      if (!index) requireValue(evidence.happenedAt === entry.issuedAt, 'allocation time')
      else {
        const booking = state.bookings.find(b => b.id === evidence.bookingId)
        requireValue(booking && !bookings.has(booking.id) && booking.status === 'completed' && booking.clientId === entry.clientId && definition.eligibleServiceIds.includes(booking.serviceId) && at >= time(booking.updatedAt) && at < time(entry.expiresAt), 'redemption')
        bookings.add(booking.id)
      }
      const event = state.events[evidence.revision - 1]
      requireValue(event && event.subjectId === entry.id && event.type === evidence.type && event.actor === evidence.actor && event.reason === evidence.reason && event.happenedAt === evidence.happenedAt, 'event binding')
      priorRevision = evidence.revision; priorTime = at; revisions.add(evidence.revision)
    })
    requireValue(entry.remainingSessions === entry.allocatedSessions - entry.evidence.length + 1, 'remaining sessions')
  }
}
