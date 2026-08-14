// Shop inventory foundation summary: loaded, revision, commandCount.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopInventoryFoundationSummary } from './shop-inventory-foundation-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-inventory-foundation-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopInventoryFoundationSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'
const INV_SCHEMA = 'supermega.shop.inventory_foundation.v1'

function cmd(sequence) {
  return { sequence, previousDigest: 'prev', payload: { kind: 'import', id: `id-${sequence}` }, digest: `d-${sequence}` }
}

function foundation({ revision = 1, commandCount = 0 } = {}) {
  return {
    schema: INV_SCHEMA,
    revision,
    headDigest: 'head',
    commands: Array.from({ length: commandCount }, (_, i) => cmd(i + 1)),
  }
}

function state(inventoryFoundation = undefined) {
  return {
    schema: SCHEMA,
    items: [],
    orders: [],
    movements: [],
    closes: [],
    ...(inventoryFoundation !== undefined ? { inventoryFoundation } : {}),
  }
}

// 1. No inventoryFoundation → defaults
{
  const r = projectShopInventoryFoundationSummary(state())
  check(r.loaded === false, 'none: loaded false')
  check(r.revision === 0, 'none: revision 0')
  check(r.commandCount === 0, 'none: commandCount 0')
}

// 2. Loaded with 0 commands, revision 1
{
  const r = projectShopInventoryFoundationSummary(state(foundation({ revision: 1, commandCount: 0 })))
  check(r.loaded === true, 'zero-cmds: loaded true')
  check(r.revision === 1, 'zero-cmds: revision 1')
  check(r.commandCount === 0, 'zero-cmds: commandCount 0')
}

// 3. Loaded with 5 commands, revision 5
{
  const r = projectShopInventoryFoundationSummary(state(foundation({ revision: 5, commandCount: 5 })))
  check(r.loaded === true, 'five: loaded true')
  check(r.revision === 5, 'five: revision 5')
  check(r.commandCount === 5, 'five: commandCount 5')
}

// 4. revision propagated correctly
{
  const r = projectShopInventoryFoundationSummary(state(foundation({ revision: 12, commandCount: 3 })))
  check(r.revision === 12, 'rev: revision 12')
  check(r.commandCount === 3, 'rev: commandCount 3')
}

// 5. commandCount = 1
{
  const r = projectShopInventoryFoundationSummary(state(foundation({ revision: 1, commandCount: 1 })))
  check(r.commandCount === 1, 'single: commandCount 1')
}

// 6. Large command count
{
  const r = projectShopInventoryFoundationSummary(state(foundation({ revision: 20, commandCount: 20 })))
  check(r.commandCount === 20, 'large: commandCount 20')
  check(r.revision === 20, 'large: revision 20')
}

console.log(JSON.stringify({ ok: true, checks }))
