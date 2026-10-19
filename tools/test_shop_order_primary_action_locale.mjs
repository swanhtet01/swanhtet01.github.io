import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const requireFromShowroom = createRequire(new URL('../showroom/package.json', import.meta.url))
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const bundle = await build({
  stdin: {
    contents: `export { setUiLocale, uiText } from './ui-locale.ts'`,
    resolveDir: resolve(root, 'showroom/src/core'),
    sourcefile: 'shop-order-primary-action-locale-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})
const { setUiLocale, uiText } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

const labels = [
  'Record payment',
  'Paid & handed over',
  'Start preparing',
  'Mark packed for delivery',
  'Ready for pickup',
  'Mark ready',
  'Record delivered',
  'Record picked up',
  'Complete handoff',
  'Review order',
  'Record settled refund',
]

await setUiLocale('my')
for (const label of labels) {
  const localized = uiText(label)
  assert.notEqual(localized, label, `Burmese action missing for: ${label}`)
  assert.match(localized, /[\u1000-\u109F]/u, `Expected Myanmar script for: ${label}`)
}
await setUiLocale('en')
for (const label of labels) assert.equal(uiText(label), label, `English action changed: ${label}`)

const coreApp = await readFile(resolve(root, 'showroom/src/core/CoreApp.tsx'), 'utf8')
assert.match(coreApp, /const primaryActionLabel = uiText\(shopOrderPrimaryActionLabel\(order\)\)/)
assert.equal((coreApp.match(/\{primaryActionLabel\}/g) ?? []).length, 4)
console.log(JSON.stringify({ ok: true, contract: 'shop_order_primary_action_locale.v1', labels: labels.length, renderSites: 4 }))
