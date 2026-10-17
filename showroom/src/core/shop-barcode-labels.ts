export const MAX_SHOP_BARCODE_LABELS_PER_PRINT = 50

export type AcceptedStockReceiptLabel = {
  id: string
  purchaseOrderId: string
  sku: string
  itemName: string
  acceptedQuantity: number
}

export type CatalogProductLabel = {
  sku: string
  barcode?: string | null
  itemName: string
}

export type ShopBarcodeLabelTarget = {
  id: string
  itemName: string
  code: string
  detail: string
  sourceLabel: string
  description: string
  buttonDescription: string | null
  maxCopies: number
  initialCopies: number
}

export function isPrintableShopBarcode(value: string) {
  return value.length > 0 && value.length <= 80 && value.trim() === value && /^[\x20-\x7e]+$/.test(value)
}

export function cappedShopBarcodeLabelCopies(maximum: number, requested: number) {
  if (!Number.isSafeInteger(maximum) || maximum < 1) return 0
  const safeRequested = Number.isSafeInteger(requested) ? requested : 1
  return Math.max(1, Math.min(maximum, MAX_SHOP_BARCODE_LABELS_PER_PRINT, safeRequested))
}

export function acceptedReceiptLabelTarget(receipt: AcceptedStockReceiptLabel): ShopBarcodeLabelTarget | null {
  if (!Number.isSafeInteger(receipt.acceptedQuantity) || receipt.acceptedQuantity < 1) return null
  const maxCopies = cappedShopBarcodeLabelCopies(receipt.acceptedQuantity, receipt.acceptedQuantity)
  return {
    id: receipt.id,
    itemName: receipt.itemName,
    code: receipt.sku,
    detail: receipt.purchaseOrderId,
    sourceLabel: 'Received stock',
    description: `${receipt.acceptedQuantity.toLocaleString()} units accepted`,
    buttonDescription: `${receipt.acceptedQuantity.toLocaleString()} accepted`,
    maxCopies,
    initialCopies: maxCopies,
  }
}

export function catalogProductLabelTarget(product: CatalogProductLabel): ShopBarcodeLabelTarget | null {
  const sku = product.sku.trim()
  const itemName = product.itemName.trim()
  if (!sku || !itemName) return null
  return {
    id: sku,
    itemName,
    code: product.barcode?.trim() || sku,
    detail: sku,
    sourceLabel: 'Saved product',
    description: 'Uses the saved barcode, or SKU when no barcode is set.',
    buttonDescription: null,
    maxCopies: MAX_SHOP_BARCODE_LABELS_PER_PRINT,
    initialCopies: 1,
  }
}

