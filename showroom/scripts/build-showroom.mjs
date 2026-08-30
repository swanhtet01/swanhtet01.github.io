import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const showroomRoot = path.resolve(scriptDir, '..')

function runNodeScript(label, scriptPath, args = []) {
  if (!existsSync(scriptPath)) {
    console.error(`${label} script is missing: ${scriptPath}`)
    process.exit(1)
  }

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: showroomRoot,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

runNodeScript('TypeScript build', path.join(showroomRoot, 'node_modules', 'typescript', 'bin', 'tsc'), ['-b'])
// Node 24 can load the TypeScript config natively. Avoid Vite's runner IPC
// transport here: under normal Ally contention its fixed 60-second invoke
// timeout can fail before compilation even begins.
runNodeScript('Vite build', path.join(showroomRoot, 'node_modules', 'vite', 'bin', 'vite.js'), ['build', '--configLoader', 'native'])
runNodeScript('Static route export', path.join(showroomRoot, 'scripts', 'prepare-static-routes.mjs'))
runNodeScript('Offline precache seal', path.join(showroomRoot, 'scripts', 'seal-offline-precache.mjs'))
