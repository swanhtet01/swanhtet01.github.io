export type PurchaseReceiptScanItem = {
  sku: string
  name: string
}

export type PurchaseReceiptScanResult =
  | { status: 'added'; quantity: number; itemName: string }
  | { status: 'empty' | 'not-found' | 'ambiguous' | 'wrong-item' | 'invalid-quantity' | 'at-limit' }

/** A scan changes only the reviewed accepted-quantity draft, never inventory. */
export function applyPurchaseReceiptScan(input: {
  rawValue: string
  selectedSku: string
  currentQuantity: string
  maxQuantity: number
  items: readonly PurchaseReceiptScanItem[]
}): PurchaseReceiptScanResult {
  const code = input.rawValue.trim().toLocaleLowerCase()
  if (!code) return { status: 'empty' }

  const matches = input.items.filter((item) => item.sku.trim().toLocaleLowerCase() === code)
  if (!matches.length) return { status: 'not-found' }
  if (matches.length !== 1) return { status: 'ambiguous' }

  const item = matches[0]
  if (item.sku !== input.selectedSku) return { status: 'wrong-item' }

  const quantityText = input.currentQuantity.trim()
  if (quantityText && !/^\d+$/.test(quantityText)) return { status: 'invalid-quantity' }
  const currentQuantity = quantityText ? Number(quantityText) : 0
  if (!Number.isSafeInteger(currentQuantity) || currentQuantity < 0
    || !Number.isSafeInteger(input.maxQuantity) || input.maxQuantity < 0) {
    return { status: 'invalid-quantity' }
  }
  if (currentQuantity >= input.maxQuantity || !Number.isSafeInteger(currentQuantity + 1)) {
    return { status: 'at-limit' }
  }

  return { status: 'added', quantity: currentQuantity + 1, itemName: item.name || item.sku }
}
