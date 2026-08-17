// Plant order execution summary: loaded, revision, commandCount.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantOrderExecutionSummary } from './plant-order-execution-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/order-execution-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantOrderExecutionSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.plant.order_foundation.v1'

function cmd(sequence) {
  return {
    sequence,
    previousDigest: 'digest',
    payload: { kind: 'import_plan' },
    digest: `digest-${sequence}`,
  }
}

function execution({ revision = 1, commandCount = 0 } = {}) {
  return {
    schema: SCHEMA,
    revision,
    headDigest: 'digest',
    commands: Array.from({ length: commandCount }, (_, i) => cmd(i + 1)),
  }
}

function state(orderExecution = undefined) {
  return {
    schema: 'supermega.production.v1',
    revision: 1,
    jobs: [], issues: [], machines: [], events: [],
    ...(orderExecution !== undefined ? { orderExecution } : {}),
  }
}

// 1. No orderExecution → defaults
{
  const r = projectPlantOrderExecutionSummary(state())
  check(r.loaded === false, 'none: loaded false')
  check(r.revision === 0, 'none: revision 0')
  check(r.commandCount === 0, 'none: commandCount 0')
}

// 2. Loaded with 0 commands → loaded true, revision 1, commandCount 0
{
  const r = projectPlantOrderExecutionSummary(state(execution({ revision: 1, commandCount: 0 })))
  check(r.loaded === true, 'zero-cmds: loaded true')
  check(r.revision === 1, 'zero-cmds: revision 1')
  check(r.commandCount === 0, 'zero-cmds: commandCount 0')
}

// 3. Loaded with 5 commands, revision 5
{
  const r = projectPlantOrderExecutionSummary(state(execution({ revision: 5, commandCount: 5 })))
  check(r.loaded === true, 'five: loaded true')
  check(r.revision === 5, 'five: revision 5')
  check(r.commandCount === 5, 'five: commandCount 5')
}

// 4. revision propagated correctly
{
  const r = projectPlantOrderExecutionSummary(state(execution({ revision: 12, commandCount: 3 })))
  check(r.revision === 12, 'rev: revision 12')
  check(r.commandCount === 3, 'rev: commandCount 3')
}

// 5. commandCount = 1
{
  const r = projectPlantOrderExecutionSummary(state(execution({ revision: 1, commandCount: 1 })))
  check(r.commandCount === 1, 'single-cmd: commandCount 1')
}

// 6. Large command count
{
  const r = projectPlantOrderExecutionSummary(state(execution({ revision: 20, commandCount: 20 })))
  check(r.commandCount === 20, 'large: commandCount 20')
  check(r.revision === 20, 'large: revision 20')
}

console.log(JSON.stringify({ ok: true, checks }))
