import type { CommerceState } from './commerce-workspace.ts'

export type MaterialReconciliation = {
  sku: string
  issuedToPlant: number
  issueCount: number
  returnedFromPlant: number
  returnCount: number
  receivedFromPlant: number
  receiptCount: number
  netInPlant: number
}

export function projectMaterialReconciliation(
  commerce: CommerceState,
  date?: string,
): MaterialReconciliation[] {
  const filter = date
    ? (createdAt: string) => createdAt.startsWith(date)
    : () => true

  const bysku = new Map<string, {
    issuedToPlant: number; issueCount: number
    returnedFromPlant: number; returnCount: number
    receivedFromPlant: number; receiptCount: number
  }>()

  for (const m of commerce.movements) {
    if (!filter(m.createdAt)) continue
    if (m.kind !== 'production_issue' && m.kind !== 'production_return' && m.kind !== 'production_receipt') continue
    if (!bysku.has(m.sku)) bysku.set(m.sku, { issuedToPlant: 0, issueCount: 0, returnedFromPlant: 0, returnCount: 0, receivedFromPlant: 0, receiptCount: 0 })
    const entry = bysku.get(m.sku)!
    if (m.kind === 'production_issue') { entry.issuedToPlant += m.quantityDelta; entry.issueCount += 1 }
    else if (m.kind === 'production_return') { entry.returnedFromPlant += m.quantityDelta; entry.returnCount += 1 }
    else { entry.receivedFromPlant += m.quantityDelta; entry.receiptCount += 1 }
  }

  return Array.from(bysku.entries()).map(([sku, e]) => ({
    sku,
    issuedToPlant: e.issuedToPlant,
    issueCount: e.issueCount,
    returnedFromPlant: e.returnedFromPlant,
    returnCount: e.returnCount,
    receivedFromPlant: e.receivedFromPlant,
    receiptCount: e.receiptCount,
    netInPlant: e.issuedToPlant - e.returnedFromPlant,
  }))
}
