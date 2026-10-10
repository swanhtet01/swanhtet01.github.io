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
  const desktopCounterRule = css.match(/@media \(max-width: 1700px\) and \(min-width: 841px\) \{([\s\S]*?)\n\}/)?.[1]
  assert.match(desktopCounterRule, /\.shop-counter-module > \.shop-counter-surface \{ height: clamp\(520px,calc\(100svh - 220px\),680px\); min-height: 520px; flex: 0 0 auto;/)
  assert.match(desktopCounterRule, /\.shop-counter-grid \{ grid-template-columns: minmax\(19rem, 1fr\) minmax\(21rem, 1\.12fr\) minmax\(15rem, \.78fr\); gap: \.75rem; \}/)
  assert.match(desktopCounterRule, /\.shop-counter-grid \{ height: 100%; grid-template-rows: minmax\(0,1fr\); \}/)
  assert.match(desktopCounterRule, /\.shop-catalog-panel, \.shop-current-sale, \.shop-counter-followup \{ min-height: 0; overflow-y: auto; \}/)
  assert.doesNotMatch(desktopCounterRule, /\.shop-counter-followup \{ grid-column:/)
  const compactDesktopRule = css.match(/@media \(max-width: 1200px\) and \(min-width: 841px\) \{([\s\S]*?)\n\}/)?.[1]
  assert.match(compactDesktopRule, /\.shop-counter-grid \{ grid-template-columns: minmax\(20rem, \.94fr\) minmax\(24rem, 1\.06fr\); grid-template-rows: minmax\(0,1fr\) auto; \}/)
  assert.match(compactDesktopRule, /\.shop-counter-followup \{ grid-column: 1 \/ -1;/)
  const tabletRule = css.match(/@media \(max-width: 1080px\) and \(min-width: 841px\) \{([\s\S]*?)\n\}/)?.[1]
  assert.match(tabletRule, /\.shop-counter-column-head \{ display: none; \}/)
  assert.match(app, /const CASHIER_COMPLETE_MY = confirmedBurmese\('Complete'\)/)
  assert.match(app, /const CASHIER_SAVE_MY = confirmedBurmese\('Save'\)/)
  assert.match(app, /className="cashier-action-label"/)
  assert.match(css, /\.cashier-action-label > small\[lang="my"\]/)
  assert.match(css, /\.shop-review-sale \{ min-height: 3\.75rem;/)
  assert.match(i18n, /export function confirmedBurmese\(en: string\): string \| null/)
  assert.match(i18n, /return entry\?\.status === 'confirmed' \? entry\.my : null/)
})
