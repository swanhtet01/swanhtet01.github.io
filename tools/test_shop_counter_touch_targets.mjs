import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import './shop_action_feedback.test.mjs'
import './shop_sale_focus.test.mjs'
import { shopOrderLink, shopOrderTargetId } from '../showroom/src/core/shop-order-target.ts'
import {
  SHOP_CATALOG_IMPORT_REVIEW_PAGE_SIZE,
  shopCatalogImportRowsAreVisible,
  toggleShopCatalogImportRowsVisibility,
} from '../showroom/src/core/shop-catalog-import.ts'

const today = readFileSync(new URL('../showroom/src/core/ShopToday.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')

test('Today order rows link to focusable order targets in the Orders tab', () => {
  const orderId = 'order_123-abc'
  const targetId = 'shop-order-order_123-abc'

  assert.equal(shopOrderTargetId(orderId), targetId)
  assert.equal(shopOrderLink(orderId), `/shop/?tab=orders#${targetId}`)
  assert.match(today, /activeOrders\.map\(\(order\) => <Link key=\{order\.id\} to=\{shopOrderLink\(order\.id\)\}>/)
  assert.match(app, /const targetId = shopOrderTargetId\(order\.id\)/)
  assert.match(app, /id=\{targetId\} key=\{order\.id\} tabIndex=\{-1\}/)
  assert.match(app, /if \(tab === 'orders' && commerceLocation\.hash\.startsWith\('#shop-order-'\)\)[\s\S]*?target\?\.scrollIntoView\([\s\S]*?target\?\.focus\(\{ preventScroll: true \}\)/)
})

test('expanded CSV rows are bound to one preview and do not carry to the next file', () => {
  const firstPreview = 'sha256:first-csv-preview'
  const nextPreview = 'sha256:next-csv-preview'
  const rowCount = SHOP_CATALOG_IMPORT_REVIEW_PAGE_SIZE + 1

  const expandedRows = toggleShopCatalogImportRowsVisibility(null, firstPreview)
  assert.equal(shopCatalogImportRowsAreVisible(firstPreview, rowCount, expandedRows), true)
  assert.equal(shopCatalogImportRowsAreVisible(nextPreview, rowCount, expandedRows), false)

  const nextExpandedRows = toggleShopCatalogImportRowsVisibility(expandedRows, nextPreview)
  assert.equal(shopCatalogImportRowsAreVisible(nextPreview, rowCount, nextExpandedRows), true)
  assert.equal(shopCatalogImportRowsAreVisible(nextPreview, SHOP_CATALOG_IMPORT_REVIEW_PAGE_SIZE, nextExpandedRows), true)
})

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
