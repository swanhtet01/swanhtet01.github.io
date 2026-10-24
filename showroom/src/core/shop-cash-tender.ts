export type ShopCashTenderReview = {
  status: 'exact' | 'change' | 'short' | 'invalid'
  cashGivenMmk: number | null
  changeMmk: number | null
}

const myanmarDigits = '၀၁၂၃၄၅၆၇၈၉'

function asciiCashDigits(value: string) {
  return value.replaceAll(/[၀-၉]/g, (digit) => String(myanmarDigits.indexOf(digit)))
}

/**
 * Reviews a cashier's ephemeral tender input. The value is deliberately not an
 * order or payment field: it exists only long enough to show change before the
 * already-accountable cash sale is confirmed.
 */
export function reviewShopCashTender(amountDueMmk: number, value: string): ShopCashTenderReview {
  if (!Number.isSafeInteger(amountDueMmk) || amountDueMmk < 0) {
    throw new Error('shop_cash_tender_amount_due_invalid')
  }
  const entered = value.trim()
  if (!entered) {
    return { status: 'exact', cashGivenMmk: amountDueMmk, changeMmk: 0 }
  }
  if (!/^[0-9၀-၉]+$/.test(entered)) {
    return { status: 'invalid', cashGivenMmk: null, changeMmk: null }
  }
  const cashGivenMmk = Number(asciiCashDigits(entered))
  if (!Number.isSafeInteger(cashGivenMmk)) {
    return { status: 'invalid', cashGivenMmk: null, changeMmk: null }
  }
  if (cashGivenMmk < amountDueMmk) {
    return { status: 'short', cashGivenMmk, changeMmk: null }
  }
  const changeMmk = cashGivenMmk - amountDueMmk
  return {
    status: changeMmk === 0 ? 'exact' : 'change',
    cashGivenMmk,
    changeMmk,
  }
}

export function shopCashTenderMmk(value: number) {
  return `${value.toLocaleString('en-US')} MMK`
}
