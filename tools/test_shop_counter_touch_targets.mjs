import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import './shop_action_feedback.test.mjs'
import './shop_sale_focus.test.mjs'

test('base counter quantity controls support tablet touch without a phone breakpoint', () => {
  const css = readFileSync(new URL('../showroom/src/core/core-app.css', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
  const grid = css.match(/\.shop-quantity-stepper \{([^}]+)\}/)?.[1]
  const buttons = css.match(/\.shop-quantity-stepper button \{([^}]+)\}/)?.[1]
  assert.match(grid, /grid-template-columns: 44px 30px 44px;/)
  assert.match(buttons, /width: 44px;/)
  assert.match(buttons, /min-height: 44px;/)
  assert.match(css, /\.shop-quantity-stepper button:disabled \{[^}]*cursor: not-allowed;/)
  assert.doesNotMatch(css, /\.shop-quantity-stepper button \{[^}]*(?:width: 28px|min-height: 30px)/)
  assert.match(app, /className="shop-product-add">Add<\/span>/)
  const addCue = css.match(/\.shop-product-add \{([^}]+)\}/)?.[1]
  assert.match(addCue, /min-width: 44px;/)
  assert.match(addCue, /text-transform: uppercase;/)
  const paymentButtons = css.match(/\.shop-payment-options button \{([^}]+)\}/)?.[1]
  const customerInput = css.match(/\.shop-sale-details label input \{([^}]+)\}/)?.[1]
  assert.match(paymentButtons, /min-height: 44px;/)
  assert.match(customerInput, /min-height: 44px;/)
  assert.match(app, /aria-keyshortcuts="\/"/)
  assert.match(app, /document\.addEventListener\('keydown', focusCounterSearch\)/)
  assert.match(app, /document\.removeEventListener\('keydown', focusCounterSearch\)/)
  assert.match(app, /parked\.length \? `Parked sales \(\$\{parked\.length\}\)` : 'Save sale for later'/)
  assert.doesNotMatch(app, /Parked tickets \(\{parked\.length\}\) · this device/)
  assert.match(css, /@media \(max-width: 1360px\) and \(min-width: 841px\) \{\s*\.shop-counter-grid \{ grid-template-columns: minmax\(0, 1fr\) minmax\(20rem, 23rem\); \}/)
  assert.match(css, /@media \(max-width: 1080px\) and \(min-width: 841px\) \{\s*\.shop-counter-column-head \{ display: none; \}/)
})
