import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierInvoiceDueBrief = {
  totalInvoices: number
  earliestDueAt: string | null
  latestDueAt: string | null
  uniqueRecordingActors: number
  topRecordingActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopSupplierInvoiceDueBrief(
  commerce: CommerceState,
): ShopSupplierInvoiceDueBrief {
  let totalInvoices = 0
  let earliestDueAt: string | null = null
  let latestDueAt: string | null = null
  const actorMap = new Map<string, number>()

  for (const po of commerce.purchaseOrders ?? []) {
    const inv = po.supplierInvoice
    if (inv === undefined) continue
    totalInvoices++
    const due = inv.dueAt
    if (earliestDueAt === null || due < earliestDueAt) earliestDueAt = due
    if (latestDueAt === null || due > latestDueAt) latestDueAt = due
    const actor = inv.recording.actor
    actorMap.set(actor, (actorMap.get(actor) ?? 0) + 1)
  }

  const topRecordingActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalInvoices,
    earliestDueAt,
    latestDueAt,
    uniqueRecordingActors: actorMap.size,
    topRecordingActorsByCount,
  }
}
