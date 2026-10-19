import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
const root = resolve(import.meta.dirname, '..')
const app = readFileSync(resolve(root, 'showroom/src/App.tsx'), 'utf8')
const shell = readFileSync(resolve(root, 'showroom/src/core/CoreShell.tsx'), 'utf8')
test('Plant direct and legacy routes select active products without mounting tools', () => {
  for (const route of ['plant/*', 'operations/production/*']) {
    assert.ok(app.includes(`<Route element={<Navigate replace to="/?choose=1" />} path="${route}" />`))
  }
  assert.doesNotMatch(app, /<OperationsPage product="production"/)
  assert.match(app, /<OperationsPage \/>/)
  const operations = readFileSync(resolve(root, 'showroom/src/core/CoreApp.tsx'), 'utf8')
  const entry = operations.slice(operations.indexOf('export function OperationsPage()'), operations.indexOf('type ShopCounterReview'))
  assert.ok(entry.length > 0)
  assert.doesNotMatch(entry, /ProductionPage|productionTab|<OperationsPage product=/)
})
test('launcher and suggestions exclude Plant without deleting retained setups', () => {
  const choices = shell.slice(shell.indexOf('const customerProducts'), shell.indexOf('export function ProductHomeEntry'))
  assert.doesNotMatch(choices, /Plant|production|\/plant\//)
  for (const product of ['Shop', 'Sites', 'Commerce']) assert.ok(choices.includes(product))
  assert.ok(shell.includes('!customerProducts.some(([name]) => managedProductIsVisible(portalAccess.products, PRODUCT_SETUP_KEY[name]))'))
  const onboarding = readFileSync(resolve(root, 'showroom/src/core/ProductOnboardingPage.tsx'), 'utf8')
  assert.ok(onboarding.includes("Boolean(readProductSetup(window.localStorage, 'production'))"))
})
test('retired settings aliases stop before onboarding and connections exclude production', () => {
  assert.ok(app.includes("if (product === 'plant' || product === 'production') return 'production' as const"))
  const settings = app.slice(app.indexOf('function SettingsEntry()'), app.indexOf('export default'))
  const guard = settings.indexOf("if (product === 'production') return <Navigate replace to=\"/?choose=1\" />")
  assert.ok(guard >= 0 && guard < settings.indexOf('<ProductOnboardingPage'))
  assert.ok(shell.includes("products={portalAccess.products.filter(product => product !== 'production')}"))
})
test('customer status excludes Plant without changing shared reports or stored data', () => {
  const productEntry = shell.slice(shell.indexOf('const customerProducts'), shell.indexOf('export function ProductHomeEntry'))
  assert.doesNotMatch(productEntry, /Plant|production|\/plant\//)
  assert.ok(shell.includes('products={portalAccess.products.filter(product => product !== \'production\')}'))
  assert.doesNotMatch(shell, /loadProductionWorkspace|saveProduction|removeItem/)
})
