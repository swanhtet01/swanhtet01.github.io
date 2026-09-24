import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const { transformSync } = createRequire(resolve('showroom/package.json'))('esbuild')
const source = readFileSync('showroom/src/core/CoreShell.tsx', 'utf8')
const start = source.indexOf('function useManagedPortalAccess(')
const end = source.indexOf('\nfunction PortalAccessPanel(', start)
assert.ok(start >= 0 && end > start)
const code = transformSync(source.slice(start, end), { loader: 'ts', format: 'cjs' }).code

function render(enabled, workspace, resolved) {
  const local = { status: 'local', products: [], workspaceId: '' }
  return runInNewContext(`${code}\nuseManagedPortalAccess(enabled, workspace, '/')`, {
    enabled, workspace, localPortalAccess: local,
    useState: initial => [resolved ?? initial, () => { throw Error('Unexpected state write during render') }],
    // This harness exercises synchronous render gating; it never performs identity/network work.
    useEffect: () => {},
  })
}

test('selected managed company stays checking before runtime health resolves', () => {
  const result = render(false, 'synthetic-company')
  assert.equal(result.status, 'checking')
  assert.equal(result.products.length, 0)
})

test('only a matching resolved company can expose assigned products', () => {
  const access = { status: 'ready', products: ['commerce'], workspaceId: 'synthetic-company' }
  assert.equal(render(true, 'synthetic-company').status, 'checking')
  assert.equal(render(true, 'synthetic-company', { key: 'other:/', access }).status, 'checking')
  assert.equal(render(true, 'synthetic-company', { key: 'synthetic-company:/', access }), access)
  assert.equal(render(false, 'synthetic-company', { key: 'synthetic-company:/', access }).status, 'checking')
})

test('unselected local workspace remains available', () => {
  assert.equal(render(false, '').status, 'local')
  assert.equal(render(true, '').status, 'local')
})
