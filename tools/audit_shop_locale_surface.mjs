#!/usr/bin/env node
// Bounded source inventory for untranslated JSX and accessibility copy.
// This is a lower-bound work queue, not proof of complete route localization:
// text assembled by JavaScript, imported child views and server responses need
// a separate runtime and native-speaker review.
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const requireFromShowroom = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = requireFromShowroom('typescript')
const files = [
  'showroom/src/core/CoreShell.tsx',
  'showroom/src/core/ShopToday.tsx',
  'showroom/src/core/CoreApp.tsx',
  'showroom/src/core/ShopOrderHistory.tsx',
  'showroom/src/core/ShopInventoryFoundation.tsx',
  'showroom/src/core/ReceiptDialog.tsx',
]
const visibleAttributes = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label'])
const fragments = []
const localizedCalls = {}
for (const file of files) {
  const source = await readFile(resolve(root, file), 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  localizedCalls[file] = 0
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && ['uiText', 'bi'].includes(node.expression.text)) localizedCalls[file] += 1
    let text
    if (ts.isJsxText(node)) text = node.getText(ast).replace(/\s+/g, ' ').trim()
    else if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.text)
      && node.initializer && ts.isStringLiteral(node.initializer)) text = node.initializer.text.trim()
    if (text && /[A-Za-z]{3}/.test(text) && !/^[\s{}<>]+$/.test(text)) {
      fragments.push({ file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, text })
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
}
const maxArg = process.argv.find(argument => argument.startsWith('--max-raw='))
const maxRaw = maxArg ? Number(maxArg.slice('--max-raw='.length)) : null
if (maxRaw !== null && (!Number.isInteger(maxRaw) || maxRaw < 0)) throw new Error('invalid --max-raw')
const result = {
  ok: maxRaw === null || fragments.length <= maxRaw,
  contract: 'partial_static_shop_locale_inventory',
  coverageComplete: false,
  files: files.length,
  rawEnglishFragments: fragments.length,
  uniqueRawEnglishFragments: new Set(fragments.map(fragment => fragment.text)).size,
  byFile: Object.fromEntries(files.map(file => [file, {
    rawEnglishFragments: fragments.filter(fragment => fragment.file === file).length,
    localizedCalls: localizedCalls[file],
  }])),
  examples: process.argv.includes('--all') ? fragments : fragments.slice(0, 25),
}
console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exitCode = 1
