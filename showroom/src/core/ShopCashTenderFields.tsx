import type { ChangeEvent, FocusEvent, Ref } from 'react'

import { SHOP_CASH_TENDER_MAX_DIGITS, shopCashTenderMmk, type ShopCashTenderReview } from './shop-cash-tender'

// These pairs reuse the reviewed native Shop cash-dialog vocabulary. The browser
// counter's established pattern renders both languages together and marks only
// the Burmese span so its bundled font and line-height rules apply.
function tenderCopy(en: string, my: string) {
  return <span className="bi-label">{en} · <span lang="my">{my}</span></span>
}

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
    <legend>{tenderCopy('Cash received?', 'ငွေသားရပြီလား။')}</legend>
    <p><span>{tenderCopy('Amount due', 'လက်ခံရမည့်ငွေ')}</span><strong>{shopCashTenderMmk(amountDueMmk)}</strong></p>
    <label htmlFor="counter-cash-given">{tenderCopy('Cash given', 'ပေးငွေ')} <small>{tenderCopy('optional; leave blank for exact cash', 'မထည့်လည်းရ')}</small></label>
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
        ? tenderCopy('Enter a whole-MMK amount using English or Myanmar digits.', 'မှန်ကန်သော ငွေပမာဏကို အင်္ဂလိပ် သို့မဟုတ် မြန်မာဂဏန်းဖြင့် ထည့်ပါ။')
        : review.status === 'short'
          ? tenderCopy(`Cash given is ${shopCashTenderMmk(amountDueMmk - (review.cashGivenMmk ?? 0))} short.`, 'ပေးထားသော ငွေသားမှာ ကျသင့်ငွေထက် နည်းပါသည်။')
          : tenderCopy(`Change: ${shopCashTenderMmk(review.changeMmk ?? 0)}`, 'ပြန်အမ်းငွေ')}
    </p>
  </fieldset>
}
