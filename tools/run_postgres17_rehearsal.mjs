import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const recorder = resolve(root, 'tools', 'record_postgres17_rehearsal.mjs')
const args = process.argv.slice(2)
if (!(args.length === 0 || (args.length === 1 && args[0] === '--preflight'))) {
  console.error(JSON.stringify({
    ok: false,
    contract: 'supermega_postgres17_rehearsal_launcher_v1',
    error: 'canonical_recorder_arguments_required',
    secret_values_exposed: false,
  }))
  process.exit(2)
}

const result = spawnSync(
  process.execPath,
  [recorder, ...args],
  {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  },
)
if (result.error || result.status == null) {
  console.error(JSON.stringify({
    ok: false,
    contract: 'supermega_postgres17_rehearsal_launcher_v1',
    error: 'rehearsal_process_failed',
    secret_values_exposed: false,
  }))
  process.exit(1)
}
process.exit(result.status)
