export type StockCountScanDraft = {
  sku: string
  stockUnitId: string
  locationId: string
  quantity: string
}

export type StockCountScanTarget = {
  sku: string
  stockUnitId?: string
  locationId?: string
  serial?: boolean
}

export type StockCountScanResult = {
  status: 'selected' | 'incremented' | 'finish-current' | 'invalid-current' | 'serial-limit' | 'count-overflow'
  draft: StockCountScanDraft | null
}

/** Apply one physical scan to the local count draft only. Inventory is changed later by review. */
export function applyStockCountScan(
  current: StockCountScanDraft | null,
  target: StockCountScanTarget,
): StockCountScanResult {
  const nextTarget = {
    sku: target.sku,
    stockUnitId: target.stockUnitId ?? '',
    locationId: target.locationId ?? '',
  }
  const sameTarget = current?.sku === nextTarget.sku
    && current.stockUnitId === nextTarget.stockUnitId
    && current.locationId === nextTarget.locationId

  if (current && !sameTarget && current.quantity.trim()) {
    return { status: 'finish-current', draft: current }
  }

  const currentQuantityText = sameTarget ? current?.quantity.trim() ?? '' : ''
  if (currentQuantityText && !/^[0-9]+$/.test(currentQuantityText)) {
    return { status: 'invalid-current', draft: current }
  }

  const currentQuantity = currentQuantityText ? Number(currentQuantityText) : 0
  if (target.serial && currentQuantity >= 1) {
    return { status: 'serial-limit', draft: current }
  }
  if (!Number.isSafeInteger(currentQuantity + 1)) {
    return { status: 'count-overflow', draft: current }
  }

  return {
    status: sameTarget ? 'incremented' : 'selected',
    draft: { ...nextTarget, quantity: String(currentQuantity + 1) },
  }
}
