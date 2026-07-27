import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const runner = resolve(root, 'tools', 'rehearse_supermega_postgres17.py')
const configured = String(process.env.SUPERMEGA_PYTHON || '').trim()
const candidates = configured
  ? [configured]
  : process.platform === 'win32'
    ? [
        resolve(root, '.venv', 'Scripts', 'python.exe'),
        resolve(root, 'venv', 'Scripts', 'python.exe'),
        'python',
      ]
    : [
        resolve(root, '.venv', 'bin', 'python'),
        resolve(root, 'venv', 'bin', 'python'),
        'python3',
        'python',
      ]

let python = ''
for (const candidate of candidates) {
  const pathCandidate = candidate.includes('/') || candidate.includes('\\')
  if (pathCandidate && !existsSync(candidate)) continue
  const probe = spawnSync(
    candidate,
    ['-c', 'import psycopg; assert psycopg.__version__'],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
    },
  )
  if (probe.status === 0) {
    python = candidate
    break
  }
}

if (!python) {
  console.error(JSON.stringify({
    ok: false,
    contract: 'supermega_postgres17_rehearsal_launcher_v1',
    error: configured ? 'configured_python_unusable' : 'python_with_psycopg_missing',
    secret_values_exposed: false,
  }))
  process.exit(2)
}

const result = spawnSync(
  python,
  [runner, ...process.argv.slice(2)],
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
