export type SessionCartLine = { sku: string; quantity: number }
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const key = 'supermega.ecommerce.cart-session.v1'
function validLines(value: unknown): value is SessionCartLine[] {
  if (!Array.isArray(value) || value.length > 100) return false
  const seen = new Set<string>()
  return value.every(line => {
    if (!line || typeof line.sku !== 'string' || !line.sku || line.sku.length > 200
      || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || seen.has(line.sku)) return false
    seen.add(line.sku)
    return true
  })
}
export function readSessionCart(storage: StoragePort, scope: string, items: readonly { sku: string; onHand: number }[], now = Date.now()): SessionCartLine[] {
  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    if (raw.length > 40000) throw Error('size')
    const saved = JSON.parse(raw)
    if (!scope || saved?.scope !== scope || !Number.isFinite(saved.savedAt) || saved.savedAt > now
      || now - saved.savedAt >= 3600000 || !validLines(saved.lines)) throw Error('invalid')
    return saved.lines.filter((line: SessionCartLine) => items.some(item => item.sku === line.sku && item.onHand >= line.quantity))
      .map((line: SessionCartLine) => ({ sku: line.sku, quantity: line.quantity }))
  } catch {
    try { storage.removeItem(key) } catch { /* Best effort only. */ }
    return []
  }
}
export function saveSessionCart(storage: StoragePort, scope: string, lines: SessionCartLine[], now = Date.now()): boolean {
  try {
    if (!scope || !validLines(lines)) return false
    if (!lines.length) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify({ scope, savedAt: now, lines: lines.map(({ sku, quantity }) => ({ sku, quantity })) }))
    return true
  } catch { return false }
}
