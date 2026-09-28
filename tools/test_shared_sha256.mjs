import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { sha256Hex } from '../showroom/src/core/sha256.ts'

const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript')
const paths = ['showroom/src/core/commerce-workspace.ts', 'showroom/src/core/shop-inventory-foundation.ts',
  'showroom/src/products/website/website-release-foundation.ts', 'showroom/src/core/managed-trial-proof.ts',
  'showroom/src/core/plant-order-foundation.ts']
const baseline = '8acba1266308af287025fb508d5c825c682cf87b'
function previousDigest(path) {
  const source = execFileSync('git', ['show', `${baseline}:${path}`], { encoding: 'utf8' })
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const nodes = ast.statements.filter(n => (ts.isFunctionDeclaration(n) && ['sha256Hex', 'rotateRight'].includes(n.name?.text))
    || (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === 'sha256RoundConstants')))
  assert.equal(nodes.length, 3)
  const code = ts.transpileModule(nodes.map(n => n.getText(ast).replace(/^export /, '')).join('\n'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return runInNewContext(`${code}; sha256Hex`, { TextEncoder })
}
const vectors = ['', 'abc', 'မြန်မာ စာသား', '🛒\u0000\ud800', JSON.stringify({ amount: 2101, note: 'É e\u0301' }),
  ...[55, 56, 63, 64, 65, 119, 120, 127, 128, 1024, 65536].map(n => 'a'.repeat(n)),
  ...Array.from({ length: 32 }, (_, n) => Array.from({ length: n * 19 }, (_, i) => String.fromCharCode((i * 7919 + n * 331) % 65536)).join(''))]

test('shared digest preserves UTF-8, padding boundaries and historical product evidence bytes', () => {
  const historical = paths.map(previousDigest)
  for (const value of vectors) {
    const expected = createHash('sha256').update(value, 'utf8').digest('hex')
    assert.equal(sha256Hex(value), expected)
    for (const old of historical) assert.equal(old(value), expected)
  }
})

test('all five consumers use the neutral utility and existing public exports remain', () => {
  for (const path of paths) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /import \{ sha256Hex \} from ['"].*\/sha256\.ts['"]/)
    assert.doesNotMatch(source, /function sha256Hex|sha256RoundConstants/)
  }
  assert.match(readFileSync(paths[0], 'utf8'), /export \{ sha256Hex \} from ['"]\.\/sha256\.ts['"]/)
  assert.match(readFileSync(paths[3], 'utf8'), /export \{ sha256Hex \} from ['"]\.\/sha256\.ts['"]/)
  assert.doesNotMatch(readFileSync('showroom/src/core/sha256.ts', 'utf8'), /^import /m)
})
