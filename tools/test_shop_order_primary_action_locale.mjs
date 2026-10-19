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
    contents: `export { readUiLocale, setUiLocale, uiText } from './ui-locale.ts'`,
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
const { readUiLocale, setUiLocale, uiText } = await import(
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

const supersededBurmeseRequest = setUiLocale('my')
await setUiLocale('en')
await supersededBurmeseRequest
assert.equal(readUiLocale(), 'en', 'a late Burmese chunk cannot override the latest English choice')
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

const unavailableLocaleBundle = await build({
  stdin: {
    contents: `export { ensureUiLocaleReady, readUiLocale, uiText } from './ui-locale.ts'`,
    resolveDir: resolve(root, 'showroom/src/core'),
    sourcefile: 'shop-locale-recovery-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
  plugins: [{
    name: 'missing-burmese-chunk',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /ui-locale-my\.ts$/ }, (args) => ({ path: args.path, namespace: 'missing-locale' }))
      pluginBuild.onLoad({ filter: /.*/, namespace: 'missing-locale' }, () => ({ contents: `throw new Error('missing locale chunk')`, loader: 'js' }))
    },
  }],
})
const originalWindow = globalThis.window
const originalDocument = globalThis.document
const savedLocale = new Map([['supermega.ui-locale.v1', 'my']])
try {
  globalThis.window = {
    localStorage: {
      getItem: (key) => savedLocale.get(key) ?? null,
      setItem: (key, value) => savedLocale.set(key, value),
    },
    addEventListener: () => undefined,
  }
  globalThis.document = { documentElement: { lang: 'en' } }
  const recoveredLocale = await import(
    `data:text/javascript;base64,${Buffer.from(unavailableLocaleBundle.outputFiles[0].contents).toString('base64')}`
  )
  await recoveredLocale.ensureUiLocaleReady()
  assert.equal(recoveredLocale.readUiLocale(), 'en', 'a missing saved Burmese chunk recovers into English')
  assert.equal(savedLocale.get('supermega.ui-locale.v1'), 'en', 'startup recovery avoids retrying the missing chunk on refresh')
  assert.equal(recoveredLocale.uiText('Today'), 'Today')
} finally {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
  if (originalDocument === undefined) delete globalThis.document
  else globalThis.document = originalDocument
}
console.log(JSON.stringify({ ok: true, contract: 'shop_order_primary_action_locale.v1', labels: labels.length, renderSites: 4 }))
