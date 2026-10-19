export const SHOP_MMK_CASH_DENOMINATIONS = [20_000, 10_000, 5_000, 2_000, 1_000, 500] as const

export type ShopMmkCashCountDraft = Partial<Record<(typeof SHOP_MMK_CASH_DENOMINATIONS)[number], string>>

type ParsedCount = { valid: true; value: number; entered: boolean } | { valid: false }

function parseCount(value: string | number | undefined): ParsedCount {
  const raw = value === undefined ? '' : String(value).trim()
  if (!raw) return { valid: true, value: 0, entered: false }
  if (!/^\d{1,9}$/.test(raw)) return { valid: false }
  const count = Number(raw)
  return Number.isSafeInteger(count) ? { valid: true, value: count, entered: true } : { valid: false }
}

export function isShopCashSettlementMethod(paymentMethod: string) {
  const normalized = paymentMethod.trim().toLocaleLowerCase()
  return normalized === 'cash' || normalized.startsWith('cash ')
}

export function calculateShopMmkCashTotal(counts: ShopMmkCashCountDraft, otherMmk: string) {
  let totalMmk = 0
  let entered = false

  for (const denomination of SHOP_MMK_CASH_DENOMINATIONS) {
    const count = parseCount(counts[denomination])
    if (!count.valid) return { status: 'invalid' as const, reason: 'Enter whole, non-negative note counts.' }
    entered ||= count.entered
    totalMmk += denomination * count.value
  }

  const other = parseCount(otherMmk)
  if (!other.valid) return { status: 'invalid' as const, reason: 'Enter whole, non-negative MMK for other notes or coins.' }
  entered ||= other.entered
  totalMmk += other.value

  if (!entered) return { status: 'incomplete' as const, reason: 'Enter at least one count.' }
  if (!Number.isSafeInteger(totalMmk)) return { status: 'invalid' as const, reason: 'The calculated total is too large.' }
  return { status: 'ready' as const, totalMmk }
}
