import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import {
  ecommerceShopHandoffVisible,
  hostedProductRouteRequiresLogin,
  managedProductIsVisible,
  managedProductPath,
  productSwitcherVisible,
  shopInboundRequestsVisible,
  resolveManagedProductHome,
  resolveManagedProductRoute,
} from '../showroom/src/core/managed-product-access.ts'
import { managedProductConnections } from '../showroom/src/core/managed-product-connections.ts'

const products = ['commerce', 'production', 'website', 'ecommerce']
const paths = ['/shop/', '/plant/', '/website/', '/ecommerce/']
const coreShell = readFileSync(new URL('../showroom/src/core/CoreShell.tsx', import.meta.url), 'utf8')

test('hosted product routes require managed access when the portal falls back to local mode', () => {
  assert.equal(hostedProductRouteRequiresLogin(true, 'local'), true)
  assert.equal(hostedProductRouteRequiresLogin(true, 'checking'), false)
  assert.equal(hostedProductRouteRequiresLogin(true, 'ready'), false)
  assert.equal(hostedProductRouteRequiresLogin(true, 'reauthenticate'), false)
  assert.equal(hostedProductRouteRequiresLogin(true, 'error'), false)
  assert.equal(hostedProductRouteRequiresLogin(false, 'local'), false)
  assert.match(coreShell, /hostedProductRouteRequiresLogin\(import\.meta\.env\.PROD, portalAccess\.status\)/)
  assert.match(coreShell, /requestedProduct && hostedProductLoginRequired[\s\S]{0,100}<Navigate replace to=\{companyLoginPath\}/)
})

test('maps every client product to its canonical workspace route', () => {
  assert.deepEqual(products.map(managedProductPath), paths)
})

test('allows only assigned direct product routes', () => {
  for (const product of products) {
    assert.deepEqual(resolveManagedProductRoute(product, [product]), { kind: 'allow' })
  }
  assert.deepEqual(resolveManagedProductRoute(null, ['commerce']), { kind: 'allow' })
})

test('redirects an unauthorized direct URL to the first assigned product', () => {
  assert.deepEqual(resolveManagedProductRoute('production', ['commerce']), {
    kind: 'redirect',
    product: 'commerce',
    path: '/shop/',
  })
  assert.deepEqual(resolveManagedProductRoute('commerce', ['ecommerce']), {
    kind: 'redirect',
    product: 'ecommerce',
    path: '/ecommerce/',
  })
  assert.deepEqual(resolveManagedProductRoute('website', ['production', 'ecommerce']), {
    kind: 'redirect',
    product: 'ecommerce',
    path: '/ecommerce/',
  })
})

test('returns an explicit empty decision when no product is assigned', () => {
  assert.deepEqual(resolveManagedProductRoute('commerce', []), { kind: 'empty' })
  assert.deepEqual(resolveManagedProductRoute('commerce', ['production']), { kind: 'empty' })
})

test('the managed launcher shows only assigned products', () => {
  const assigned = ['commerce', 'website']
  assert.deepEqual(
    products.filter((product) => managedProductIsVisible(assigned, product)),
    assigned,
  )
  assert.equal(managedProductIsVisible(['commerce'], 'ecommerce'), false)
})

test('private Ecommerce-to-Shop handoffs require both managed assignments', () => {
  assert.equal(ecommerceShopHandoffVisible('ready', ['commerce']), false)
  assert.equal(ecommerceShopHandoffVisible('ready', ['ecommerce']), false)
  assert.equal(ecommerceShopHandoffVisible('ready', ['commerce', 'website']), false)
  assert.equal(ecommerceShopHandoffVisible('ready', ['commerce', 'ecommerce']), true)
  assert.equal(ecommerceShopHandoffVisible('checking', ['commerce', 'ecommerce']), false)
  assert.equal(ecommerceShopHandoffVisible('reauthenticate', ['commerce', 'ecommerce']), false)
  assert.equal(ecommerceShopHandoffVisible('local', []), true)
})

test('Shop receives submitted requests without internal Sites or Commerce editor access', () => {
  assert.equal(shopInboundRequestsVisible('ready', ['commerce']), true)
  assert.equal(shopInboundRequestsVisible('ready', ['commerce', 'website']), true)
  assert.equal(shopInboundRequestsVisible('ready', ['commerce', 'ecommerce']), true)
  assert.equal(shopInboundRequestsVisible('ready', ['website', 'ecommerce']), false)
  assert.equal(shopInboundRequestsVisible('checking', ['commerce']), false)
  assert.equal(shopInboundRequestsVisible('reauthenticate', ['commerce']), false)
  assert.equal(shopInboundRequestsVisible('local', []), true)
})

test('the product switcher appears only when there is somewhere authorized to switch', () => {
  assert.equal(productSwitcherVisible('local', []), true)
  assert.equal(productSwitcherVisible('ready', ['commerce']), false)
  assert.equal(productSwitcherVisible('ready', ['production']), false)
  assert.equal(productSwitcherVisible('ready', ['production', 'commerce']), false)
  assert.equal(productSwitcherVisible('ready', ['commerce', 'website']), true)
  assert.equal(productSwitcherVisible('checking', []), false)
  assert.equal(productSwitcherVisible('reauthenticate', []), false)
  assert.equal(productSwitcherVisible('error', []), false)
})

test('shows only connection flows backed by the tenant product assignments', () => {
  assert.deepEqual(
    managedProductConnections(['commerce', 'production', 'website', 'ecommerce']).map(({ id }) => id),
    ['online-orders', 'demand-to-production', 'website-intake', 'website-storefront'],
  )
  assert.deepEqual(
    managedProductConnections(['commerce', 'ecommerce']).map(({ id }) => id),
    ['online-orders'],
  )
  assert.deepEqual(managedProductConnections(['ecommerce']), [])
  assert.deepEqual(managedProductConnections(['production', 'website']), [])
  assert.deepEqual(
    managedProductConnections(['website', 'ecommerce']).map(({ id }) => id),
    ['website-storefront'],
  )
})

test('connection decisions do not mutate or reveal unassigned products', () => {
  const assigned = Object.freeze(['commerce', 'website'])
  const connections = managedProductConnections(assigned)
  assert.deepEqual(assigned, ['commerce', 'website'])
  assert.deepEqual(connections.map(({ products }) => products), [['commerce', 'website']])
  assert.equal(JSON.stringify(connections).includes('production'), false)
  assert.equal(JSON.stringify(connections).includes('ecommerce'), false)
})

test('an authorized deep-link wins and opens its exact product', () => {
  assert.deepEqual(resolveManagedProductHome({
    requestedProduct: 'website',
    requestedPath: '/website/pages/home/',
    rememberedProduct: 'commerce',
    choosingProduct: true,
    assignedProducts: ['commerce', 'website'],
  }), {
    kind: 'redirect',
    product: 'website',
    path: '/website/pages/home/',
  })
})

test('the explicit chooser opens the filtered launcher', () => {
  assert.deepEqual(resolveManagedProductHome({
    requestedProduct: null,
    requestedPath: null,
    rememberedProduct: 'commerce',
    choosingProduct: true,
    assignedProducts: ['commerce', 'website'],
  }), { kind: 'launcher' })
})

test('home resumes an assigned remembered product', () => {
  assert.deepEqual(resolveManagedProductHome({
    requestedProduct: null,
    requestedPath: null,
    rememberedProduct: 'website',
    choosingProduct: false,
    assignedProducts: ['commerce', 'website'],
  }), {
    kind: 'redirect',
    product: 'website',
    path: '/website/',
  })
})

test('retained Plant stays explicit and never becomes the default company entry', () => {
  const base = { requestedProduct: null, requestedPath: null, rememberedProduct: 'production', choosingProduct: false }
  const assignedProducts = Object.freeze(['production', 'commerce'])
  assert.deepEqual(resolveManagedProductHome({ ...base, assignedProducts }), {
    kind: 'redirect', product: 'commerce', path: '/shop/',
  })
  assert.deepEqual(resolveManagedProductHome({ ...base, assignedProducts: ['production'] }), { kind: 'launcher' })
  assert.deepEqual(resolveManagedProductHome({ ...base, requestedProduct: 'production', requestedPath: '/plant/jobs/', assignedProducts }), {
    kind: 'redirect', product: 'production', path: '/plant/jobs/',
  })
  assert.deepEqual(assignedProducts, ['production', 'commerce'])
})

test('home ignores stale remembered access and opens the first assigned product', () => {
  assert.deepEqual(resolveManagedProductHome({
    requestedProduct: 'production',
    requestedPath: '/plant/jobs/',
    rememberedProduct: 'production',
    choosingProduct: false,
    assignedProducts: ['commerce', 'ecommerce'],
  }), {
    kind: 'redirect',
    product: 'commerce',
    path: '/shop/',
  })
})

test('home shows the no-products launcher when assignments are empty', () => {
  assert.deepEqual(resolveManagedProductHome({
    requestedProduct: null,
    requestedPath: null,
    rememberedProduct: 'commerce',
    choosingProduct: false,
    assignedProducts: [],
  }), { kind: 'launcher' })
})

test('routing decisions do not mutate the entitlement list', () => {
  const assigned = Object.freeze(['commerce', 'website'])
  resolveManagedProductRoute('production', assigned)
  resolveManagedProductHome({
    requestedProduct: null,
    requestedPath: null,
    rememberedProduct: 'website',
    choosingProduct: false,
    assignedProducts: assigned,
  })
  assert.deepEqual(assigned, ['commerce', 'website'])
})
