import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const requireFromShowroom = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = requireFromShowroom('typescript')
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const localeBundle = await build({
  stdin: {
    contents: `export { setUiLocale } from './ui-locale.ts'\nexport { shopInventoryText } from './shop-inventory-locale.ts'`,
    resolveDir: resolve(root, 'showroom/src/core'),
    sourcefile: 'shop-inventory-locale-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})
const { setUiLocale, shopInventoryText } = await import(
  `data:text/javascript;base64,${Buffer.from(localeBundle.outputFiles[0].contents).toString('base64')}`
)

const labels = [
  'Released from Plant',
  'accepted units · batch',
  'Receive as Shop item',
  'Map released Plant product to Shop item',
  'Choose one item',
  'This reviewed choice is retained in the stock receipt evidence.',
  'In Shop stock',
  'units · lot',
  'Choose the Shop item that represents this Plant product. SuperMega will not guess the mapping.',
  'Stock guide',
  'Location stock',
  'Main location',
  'Second location',
  'Default client',
  'Opening vendor reference',
  'Opening import ready',
  'units ·',
  'lots · 2 locations',
  'Edit',
  'Stock by location',
  'ATP ·',
  'on hand',
  'Clients and suppliers',
  'clients ·',
  'suppliers',
  'Record type',
  'Client',
  'Supplier',
  'Name',
  'Supplier purchasing policy',
  'Purchasing policy',
  'Set the constraints once',
  'Replenishment will respect lead time, minimum order, order multiples, safety stock, and service level.',
  'Choose supplier',
  'Item',
  'Choose item',
  'Lead time (days)',
  'Minimum order',
  'Order multiple',
  'Safety stock',
  'Service level (basis points)',
  'Status',
  'Active',
  'Paused',
  'days · MOQ',
  '· multiple',
  '· safety',
  'active',
  'Stock to move',
  'Choose stock',
  'ATP',
  'Quantity',
  'Shop available stock no longer matches location ATP. Reconcile before another move.',
  'Batch received',
  'Receiving…',
  'Confirm into Shop',
  'Review Plant receipt',
  'Reconcile stock',
  'Location stock is active',
  'Start location stock',
  'available to promise',
  'Set up two locations',
  'on hand',
  'reserved',
  'traceable units',
  'Add accountable client, vendor, location, and opening-lot evidence inside the Shop record.',
  'Finish open orders first',
  'Close setup',
  'Set up locations',
  'Close move',
  'Move stock',
  'Recording…',
  'Confirm setup',
  'Review setup',
  'Client master',
  'Supplier master',
  'Customer or account name',
  'Supplier name',
  '200-record pilot limit reached',
  'Confirm record',
  'Review record',
  'policy',
  'policies',
  'Confirm policy',
  'Review policy',
  'Enter available units',
  'units',
  'source ATP after',
  'Moving…',
  'Confirm move',
  'Review move',
  'Transfers retain paired source and destination evidence. No supplier contact, payment, or accounting action occurs.',
  'Finish or cancel active aggregate-stock orders before starting location stock; no warehouse history will be invented.',
  'Setup previews the exact opening package before one Shop write.',
  'Locations',
  'Set up',
  'Locked',
  'Reserved',
  'Finish orders',
  'None',
  'Health',
  'Ready',
  'Blocked',
  'Reconcile',
  'Catalog available stock and location ATP disagree. Reconcile before another move, count, or production issue.',
  'Use available stock, reservations, lots, and locations to choose the next count or stock move.',
  'Finish or cancel open aggregate-stock orders before creating location history.',
  'Set up locations once so orders, returns, production issues, counts, and transfers share the same stock truth.',
  'Add at least one Shop catalog item before receiving Plant output.',
  'The retained Plant mapping points to missing Shop SKU',
  'Restore that catalog item before receiving more output.',
  'Released Plant stock needs one active Shop location.',
  'd / MOQ',
  'days',
  'minimum order',
]

const sharedLocale = await readFile(resolve(root, 'showroom/src/core/ui-locale-my.ts'), 'utf8')
const sharedLocaleAst = ts.createSourceFile('ui-locale-my.ts', sharedLocale, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const sharedTranslationKeys = new Set()
function collectSharedTranslationKeys(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'UI_TRANSLATIONS'
    && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
    for (const property of node.initializer.properties) {
      if (ts.isPropertyAssignment(property) && (ts.isStringLiteral(property.name) || ts.isNoSubstitutionTemplateLiteral(property.name))) {
        sharedTranslationKeys.add(property.name.text)
      }
    }
  }
  ts.forEachChild(node, collectSharedTranslationKeys)
}
collectSharedTranslationKeys(sharedLocaleAst)
assert.ok(sharedTranslationKeys.size > 0, 'Shared Burmese translation dictionary was not found')
const inventoryLocale = await readFile(resolve(root, 'showroom/src/core/shop-inventory-locale.ts'), 'utf8')
const inventoryLocaleAst = ts.createSourceFile('shop-inventory-locale.ts', inventoryLocale, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const inventoryTranslationKeys = new Set()
function collectInventoryTranslationKeys(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'SHOP_INVENTORY_TRANSLATIONS'
    && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
    for (const property of node.initializer.properties) {
      if (ts.isPropertyAssignment(property) && (ts.isStringLiteral(property.name) || ts.isNoSubstitutionTemplateLiteral(property.name))) {
        inventoryTranslationKeys.add(property.name.text)
      }
    }
  }
  ts.forEachChild(node, collectInventoryTranslationKeys)
}
collectInventoryTranslationKeys(inventoryLocaleAst)
assert.ok(inventoryTranslationKeys.size > 0, 'Lazy inventory translation map was not found')
for (const label of inventoryTranslationKeys) {
  assert.ok(labels.includes(label), `Lazy stock translation has no Burmese test fixture: ${label}`)
  assert.equal(sharedTranslationKeys.has(label), false, `Lazy stock translation entered the shared dictionary: ${label}`)
}

await setUiLocale('my')
for (const label of labels) {
  const localized = shopInventoryText(label)
  assert.notEqual(localized, label, `Burmese inventory phrase missing: ${label}`)
  assert.match(localized, /[\u1000-\u109F]/u, `Expected Myanmar script for: ${label}`)
}
setUiLocale('en')
for (const label of labels) assert.equal(shopInventoryText(label), label, `English inventory phrase changed: ${label}`)

const component = await readFile(resolve(root, 'showroom/src/core/ShopInventoryFoundation.tsx'), 'utf8')
const ast = ts.createSourceFile('ShopInventoryFoundation.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
assert.ok(/import \{\s*shopInventoryText as uiText\s*\} from '\.\/shop-inventory-locale'/u.test(component), 'Inventory language strings should stay in the lazy stock chunk')
const localeCalls = new Set()
function findLocaleCalls(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'uiText' && node.arguments[0]) {
    function collectStaticKeys(argument) {
      if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) localeCalls.add(argument.text)
      ts.forEachChild(argument, collectStaticKeys)
    }
    collectStaticKeys(node.arguments[0])
  }
  ts.forEachChild(node, findLocaleCalls)
}
findLocaleCalls(ast)
const renderedCopy = [
  'Batch received', 'Receiving…', 'Confirm into Shop', 'Review Plant receipt',
  'Reconcile stock', 'Location stock is active', 'Start location stock',
  'available to promise', 'Set up two locations', 'on hand', 'reserved', 'traceable units',
  'Add accountable client, vendor, location, and opening-lot evidence inside the Shop record.',
  'Finish open orders first', 'Close setup', 'Set up locations', 'Close move', 'Move stock',
  'Recording…', 'Confirm setup', 'Review setup', 'Client master', 'Supplier master',
  'Customer or account name', 'Supplier name', '200-record pilot limit reached',
  'Confirm record', 'Review record', 'policy', 'policies', 'Confirm policy', 'Review policy',
  'Enter available units', 'units', 'source ATP after', 'Moving…', 'Confirm move', 'Review move',
  'Transfers retain paired source and destination evidence. No supplier contact, payment, or accounting action occurs.',
  'Finish or cancel active aggregate-stock orders before starting location stock; no warehouse history will be invented.',
  'Setup previews the exact opening package before one Shop write.',
  'Add at least one Shop catalog item before receiving Plant output.',
  'The retained Plant mapping points to missing Shop SKU',
  'Restore that catalog item before receiving more output.',
  'Released Plant stock needs one active Shop location.',
  'days', 'minimum order',
]
for (const phrase of renderedCopy) assert.ok(localeCalls.has(phrase), `Visible inventory copy must use uiText: ${phrase}`)
assert.match(component, /uiText\(label\).*uiText\(value\)/u, 'Autopilot labels and values must use the locale map')
assert.match(component, /uiText\(inventoryAutopilotMessage\)/u, 'Autopilot guidance must use the locale map')
const visibleAttributes = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label'])
const rawFragments = []
function visit(node) {
  let text
  if (ts.isJsxText(node)) text = node.getText(ast).replace(/\s+/gu, ' ').trim()
  else if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.text)
    && node.initializer && ts.isStringLiteral(node.initializer)) text = node.initializer.text.trim()
  if (text && /[A-Za-z]{3}/u.test(text)) rawFragments.push(text)
  ts.forEachChild(node, visit)
}
visit(ast)
assert.deepEqual(rawFragments, [], `Static English inventory UI remains: ${rawFragments.join(' | ')}`)

console.log(JSON.stringify({ ok: true, contract: 'shop_inventory_locale.v1', phrases: labels.length, renderedCopy, rawStaticEnglishFragments: 0, inventoryTranslationsAreCodeSplit: true }))
