import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierCreditNoteActorBrief = {
  totalCreditNotes: number
  uniqueRecordingActors: number
  topRecordingActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopSupplierCreditNoteActorBrief(
  commerce: CommerceState,
): ShopSupplierCreditNoteActorBrief {
  let totalCreditNotes = 0
  const actorMap = new Map<string, number>()

  for (const po of commerce.purchaseOrders ?? []) {
    for (const claim of po.supplierReturns ?? []) {
      for (const note of claim.creditNotes) {
        totalCreditNotes++
        const actor = note.recording.actor
        actorMap.set(actor, (actorMap.get(actor) ?? 0) + 1)
      }
    }
  }

  const topRecordingActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalCreditNotes,
    uniqueRecordingActors: actorMap.size,
    topRecordingActorsByCount,
  }
}
