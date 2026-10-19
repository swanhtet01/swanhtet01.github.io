import { useState } from 'react'

import { formatMoney } from './shop-order-presentation'
import { calculateShopMmkCashTotal, SHOP_MMK_CASH_DENOMINATIONS, type ShopMmkCashCountDraft } from './shop-mmk-cash-count'

export function ShopMmkCashCount({ disabled, onApply }: {
  disabled: boolean
  onApply: (totalMmk: number) => void
}) {
  const [counts, setCounts] = useState<ShopMmkCashCountDraft>({})
  const [otherMmk, setOtherMmk] = useState('')
  const result = calculateShopMmkCashTotal(counts, otherMmk)

  return <details className="compact-disclosure shop-mmk-cash-count">
    <summary><span>Count cash by notes</span><small>Optional helper · cash only</small></summary>
    <div className="core-form compact-form">
      <div className="form-row">
        {SHOP_MMK_CASH_DENOMINATIONS.map((denomination) => <label key={denomination}>{formatMoney(denomination)} notes<input autoComplete="off" disabled={disabled} inputMode="numeric" max="999999999" min="0" onChange={(event) => setCounts((current) => ({ ...current, [denomination]: event.target.value }))} step="1" type="number" value={counts[denomination] ?? ''} /></label>)}
        <label>Other notes or coins (MMK)<input autoComplete="off" disabled={disabled} inputMode="numeric" max="999999999" min="0" onChange={(event) => setOtherMmk(event.target.value)} step="1" type="number" value={otherMmk} /></label>
      </div>
      <p aria-live="polite" className="form-notice" role="status">{result.status === 'ready' ? `Calculated amount: ${formatMoney(result.totalMmk)}` : result.reason}</p>
      <button className="core-button compact" disabled={disabled || result.status !== 'ready'} onClick={() => { if (result.status === 'ready') onApply(result.totalMmk) }} type="button">Use calculated total</button>
    </div>
  </details>
}
