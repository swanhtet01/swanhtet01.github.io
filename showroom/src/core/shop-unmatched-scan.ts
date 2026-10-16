export type ShopScanSource = 'camera' | 'keyboard'

/**
 * Return a safe, exact code that can prefill a new catalog item's barcode field.
 * Camera scans are explicit. Keyboard-wedge scans are inferred from Enter in the
 * scan/search field, so ordinary word searches must not be treated as barcodes.
 */
export function unmatchedBarcodeForCreation(value: string, source: ShopScanSource): string | null {
  const code = value.trim()
  if (!code || code.length > 80 || /[\s\u0000-\u001f\u007f]/u.test(code)) return null
  if (!/^[\p{L}\p{N}._:/+-]+$/u.test(code)) return null
  if (source === 'keyboard' && (code.length < 4 || !/\p{N}/u.test(code))) return null
  return code
}
