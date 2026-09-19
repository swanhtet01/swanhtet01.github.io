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
  assert.match(app, /<OperationsPage product="commerce"/)
})
test('launcher and suggestions exclude Plant without deleting retained setups', () => {
  const choices = shell.slice(shell.indexOf('const STEP_SUGGESTIONS'), shell.indexOf('export function ProductHomeEntry'))
  assert.doesNotMatch(choices, /Plant|production|\/plant\//)
  for (const product of ['Shop', 'Website', 'Ecommerce']) assert.ok(choices.includes(product))
  assert.ok(shell.includes('!customerProducts.some(([name]) => managedProductIsVisible(portalAccess.products, PRODUCT_SETUP_KEY[name]))'))
  assert.ok(shell.includes("production: readProductSetup(window.localStorage, 'production')"))
})
