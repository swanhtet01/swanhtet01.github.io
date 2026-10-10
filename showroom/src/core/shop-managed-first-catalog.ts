export type ManagedFirstCatalogDraft = {
  sku: string
  name: string
  onHand: string
  reorderAt: string
  price: string
  reason: string
  evidenceReference: string
}

export type ManagedFirstCatalogProduct = {
  sku: string
  name: string
  onHand: number
  reorderAt: number
  price: number
}

export type ManagedFirstCatalogResult =
  | { ok: true; product: ManagedFirstCatalogProduct; reason: string; evidenceReference: string }
  | { ok: false; error: string }

export function prepareManagedFirstCatalog(
  draft: ManagedFirstCatalogDraft,
  createId: () => string,
): ManagedFirstCatalogResult {
  const name = draft.name.trim()
  const enteredSku = draft.sku.trim().toUpperCase()
  const generatedCode = enteredSku ? '' : createId().replace(/-/gu, '').slice(0, 8).toUpperCase()
  const sku = enteredSku || (generatedCode.length === 8 && /^[A-Z0-9]{8}$/u.test(generatedCode) ? `SM-${generatedCode}` : '')
  const openingStock = draft.onHand.trim()
  const alertThreshold = draft.reorderAt.trim()
  const enteredPrice = draft.price.trim()
  const onHand = Number(openingStock)
  const reorderAt = alertThreshold ? Number(alertThreshold) : 0
  const price = Number(enteredPrice)

  if (
    !name
    || name.length > 180
    || !sku
    || sku.length > 80
    || !openingStock
    || !enteredPrice
    || ![onHand, reorderAt, price].every(Number.isSafeInteger)
    || onHand < 0
    || reorderAt < 0
    || price < 1
  ) {
    return { ok: false, error: 'Enter a product name, whole-number opening stock, and positive whole-number MMK price.' }
  }

  return {
    ok: true,
    product: { sku, name, onHand, reorderAt, price },
    reason: draft.reason.trim() || 'Owner-entered opening stock during first-product setup.',
    evidenceReference: draft.evidenceReference.trim() || 'Owner-entered at setup; no external count record supplied.',
  }
}
