export type ShopCashTenderReview = {
  status: 'exact' | 'change' | 'short' | 'invalid'
  cashGivenMmk: number | null
  changeMmk: number | null
}

export type ShopCashTenderGateState = {
  value: string
  frozenValue: string | null
  validationAssertive: boolean
}

export type ShopCashTenderGateEvent =
  | { type: 'input'; value: string }
  | { type: 'blur' }
  | { type: 'submit'; amountDueMmk: number }
  | { type: 'reset' }

// Counter totals are already validated as non-negative safe integers before this
// review gate is queued. Accept that complete domain here as well so a valid sale
// can never turn into a render-time exception at the payment handoff.
export const SHOP_CASH_TENDER_MAX_MMK = Number.MAX_SAFE_INTEGER
export const SHOP_CASH_TENDER_MAX_DIGITS = String(SHOP_CASH_TENDER_MAX_MMK).length

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
  if (!Number.isSafeInteger(amountDueMmk) || amountDueMmk < 0 || amountDueMmk > SHOP_CASH_TENDER_MAX_MMK) {
    throw new Error('shop_cash_tender_amount_due_invalid')
  }
  const entered = value.trim()
  if (!entered) {
    return { status: 'exact', cashGivenMmk: amountDueMmk, changeMmk: 0 }
  }
  if (!/^[0-9၀-၉]+$/.test(entered) || entered.length > SHOP_CASH_TENDER_MAX_DIGITS) {
    return { status: 'invalid', cashGivenMmk: null, changeMmk: null }
  }
  const cashGivenMmk = Number(asciiCashDigits(entered))
  if (!Number.isSafeInteger(cashGivenMmk) || cashGivenMmk > SHOP_CASH_TENDER_MAX_MMK) {
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

export function initialShopCashTenderGateState(): ShopCashTenderGateState {
  return { value: '', frozenValue: null, validationAssertive: false }
}

export function shopCashTenderGateValue(state: ShopCashTenderGateState) {
  return state.frozenValue ?? state.value
}

export function reviewShopCashTenderGate(amountDueMmk: number, state: ShopCashTenderGateState) {
  return reviewShopCashTender(amountDueMmk, shopCashTenderGateValue(state))
}

export function shopCashTenderGateCanSubmit(amountDueMmk: number, state: ShopCashTenderGateState) {
  const review = reviewShopCashTenderGate(amountDueMmk, state)
  return review.status === 'exact' || review.status === 'change'
}

export function reduceShopCashTenderGate(
  state: ShopCashTenderGateState,
  event: ShopCashTenderGateEvent,
): ShopCashTenderGateState {
  if (event.type === 'reset') return initialShopCashTenderGateState()
  if (event.type === 'input') {
    if (state.frozenValue !== null) return state
    return {
      ...state,
      value: event.value,
      validationAssertive: false,
    }
  }
  if (event.type === 'blur') {
    return state.frozenValue === null ? { ...state, validationAssertive: true } : state
  }
  const review = reviewShopCashTenderGate(event.amountDueMmk, state)
  if (review.status === 'invalid' || review.status === 'short') {
    return { ...state, validationAssertive: true }
  }
  return state.frozenValue === null
    ? { ...state, frozenValue: state.value, validationAssertive: false }
    : state
}

export function shopCashTenderMmk(value: number) {
  return `${value.toLocaleString('en-US')} MMK`
}
