import type { ChangeEvent, FocusEvent, Ref } from 'react'

import { SHOP_CASH_TENDER_MAX_DIGITS, shopCashTenderMmk, type ShopCashTenderReview } from './shop-cash-tender'

export function ShopCashTenderFields({ amountDueMmk, assertive, inputRef, onBlur, onChange, readOnly, review, value }: {
  amountDueMmk: number
  assertive: boolean
  inputRef?: Ref<HTMLInputElement>
  onBlur: (event: FocusEvent<HTMLInputElement>) => void
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  readOnly: boolean
  review: ShopCashTenderReview
  value: string
}) {
  const blocked = review.status === 'invalid' || review.status === 'short'
  return <fieldset className="counter-cash-tender">
    <legend>Cash received</legend>
    <p><span>Amount due</span><strong>{shopCashTenderMmk(amountDueMmk)}</strong></p>
    <label htmlFor="counter-cash-given">Cash given <small>optional; leave blank for exact cash</small></label>
    <input
      aria-describedby="counter-cash-feedback"
      aria-invalid={blocked || undefined}
      autoComplete="off"
      id="counter-cash-given"
      inputMode="numeric"
      maxLength={SHOP_CASH_TENDER_MAX_DIGITS}
      onBlur={onBlur}
      onChange={onChange}
      ref={inputRef}
      readOnly={readOnly}
      value={value}
    />
    <p aria-live={blocked && assertive ? 'assertive' : 'polite'} id="counter-cash-feedback" role={blocked && assertive ? 'alert' : 'status'}>
      {review.status === 'invalid'
        ? 'Enter a whole-MMK amount using English or Myanmar digits.'
        : review.status === 'short'
          ? `Cash given is ${shopCashTenderMmk(amountDueMmk - (review.cashGivenMmk ?? 0))} short.`
          : `Change: ${shopCashTenderMmk(review.changeMmk ?? 0)}`}
    </p>
  </fieldset>
}
