import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function resolvePython() {
  const override = process.env.SUPERMEGA_LOCAL_PYTHON?.trim()
  if (override) return { command: override, argsPrefix: [] }
  const candidates = process.platform === 'win32'
    ? [
        { command: resolve(root, '.venv', 'Scripts', 'python.exe'), argsPrefix: [], requiresPath: true },
        { command: 'py', argsPrefix: ['-3'], requiresPath: false },
        { command: 'python', argsPrefix: [], requiresPath: false },
      ]
    : [
        { command: resolve(root, '.venv', 'bin', 'python'), argsPrefix: [], requiresPath: true },
        { command: resolve(root, '.venv', 'bin', 'python3'), argsPrefix: [], requiresPath: true },
        { command: 'python3', argsPrefix: [], requiresPath: false },
        { command: 'python', argsPrefix: [], requiresPath: false },
      ]
  const candidate = candidates.find((entry) => {
    if (entry.requiresPath && !existsSync(entry.command)) return false
    const result = spawnSync(entry.command, [...entry.argsPrefix, '--version'], {
      cwd: root,
      stdio: 'ignore',
      windowsHide: true,
    })
    return result.status === 0
  })
  if (!candidate) throw new Error('Python 3 is required to run this SuperMega tool.')
  return { command: candidate.command, argsPrefix: candidate.argsPrefix }
}

const args = process.argv.slice(2)
if (!args.length) {
  console.error('Usage: node tools/run_python_tool.mjs <script.py> [args...]')
  process.exit(2)
}

const python = resolvePython()
const child = spawn(python.command, [...python.argsPrefix, ...args], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
})

child.once('error', (error) => {
  console.error(error.message)
  process.exit(1)
})

child.once('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
