import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import './shop_action_feedback.test.mjs'
import './shop_sale_focus.test.mjs'

test('base counter quantity controls support tablet touch without a phone breakpoint', () => {
  const css = readFileSync(new URL('../showroom/src/core/core-app.css', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
  const i18n = readFileSync(new URL('../showroom/src/core/i18n-actions.ts', import.meta.url), 'utf8')
  const grid = css.match(/\.shop-quantity-stepper \{([^}]+)\}/)?.[1]
  const buttons = css.match(/\.shop-quantity-stepper button \{([^}]+)\}/)?.[1]
  assert.match(grid, /grid-template-columns: 44px 30px 44px;/)
  assert.match(buttons, /width: 44px;/)
  assert.match(buttons, /min-height: 44px;/)
  assert.match(css, /\.shop-quantity-stepper button:disabled \{[^}]*cursor: not-allowed;/)
  assert.doesNotMatch(css, /\.shop-quantity-stepper button \{[^}]*(?:width: 28px|min-height: 30px)/)
  assert.doesNotMatch(app, /className="shop-product-add">Add<\/span>/)
  const productTiles = css.match(/\.shop-product-tile \{[^}]+\}/g) ?? []
  assert.ok(productTiles.some(rule => /min-height: 11\.25rem;/.test(rule)), 'the full product card remains a generous touch target')
  assert.match(app, /className="shop-product-tile"[^\n]*onClick=\{\(\) => addItem\(item\)\}/)
  const paymentButtons = css.match(/\.shop-payment-options button \{([^}]+)\}/)?.[1]
  const customerInput = css.match(/\.shop-sale-details label input \{([^}]+)\}/)?.[1]
  assert.match(paymentButtons, /min-height: 44px;/)
  assert.match(customerInput, /min-height: 44px;/)
  assert.match(app, /aria-keyshortcuts="\/"/)
  assert.match(app, /document\.addEventListener\('keydown', focusCounterSearch\)/)
  assert.match(app, /document\.removeEventListener\('keydown', focusCounterSearch\)/)
  assert.match(app, /persistLocalDraft && parked\.length > 0 \? <button aria-controls="shop-parked-tickets"/)
  assert.match(app, />Parked · \{parked\.length\}<\/button> : null/)
  assert.doesNotMatch(app, /Parked tickets \(\{parked\.length\}\) · this device/)
  // Layout is covered by the source-bound browser capture; these checks guard
  // the cashier's actual touch and keyboard controls across layout revisions.
  assert.match(app, /const CASHIER_COMPLETE_MY = confirmedBurmese\('Complete'\)/)
  assert.match(app, /const CASHIER_SAVE_MY = confirmedBurmese\('Save'\)/)
  assert.match(app, /className="cashier-action-label"/)
  assert.match(css, /\.cashier-action-label > small\[lang="my"\]/)
  assert.match(css, /\.shop-review-sale \{ min-height: 4\.5rem;/)
  assert.match(css, /\.cashier-action-label > small\[lang="my"\] \{[^}]*font-size: \.875rem;[^}]*line-height: 1\.8;/)
  assert.match(i18n, /export function confirmedBurmese\(en: string\): string \| null/)
  assert.match(i18n, /return entry\?\.status === 'confirmed' \? entry\.my : null/)
})
