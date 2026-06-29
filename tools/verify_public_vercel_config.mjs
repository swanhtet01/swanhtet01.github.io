import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const configPath = resolve(root, 'vercel.json')
const ignorePath = resolve(root, '.vercelignore')
const projectPath = resolve(root, '.vercel', 'project.json')
const lockPath = resolve(root, 'tools', 'public_deployment_lock.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))
const ignore = await readFile(ignorePath, 'utf8')
const project = JSON.parse(await readFile(projectPath, 'utf8'))
let publicLock = {}
try {
  publicLock = JSON.parse(await readFile(lockPath, 'utf8'))
} catch {
  publicLock = {}
}
const serialized = JSON.stringify(config)

function fail(message) {
  console.error(`public_vercel_config_error=${message}`)
  process.exit(1)
}

if (serialized.includes('api_app.py') || serialized.includes('@vercel/python')) {
  fail('python_runtime_must_not_be_in_public_site')
}

if (config.builds || config.functions) {
  fail('prebuilt_public_config_must_not_define_builds_or_functions')
}

if (config.routes) {
  fail('prebuilt_public_routes_live_in_build_output_config')
}

for (const requiredIgnore of ['api_app.py', 'requirements.txt', 'pyproject.toml', 'uv.lock']) {
  if (!ignore.split(/\r?\n/).includes(requiredIgnore)) {
    fail(`missing_ignore_${requiredIgnore}`)
  }
}

if (project.projectName !== 'supermega-public' && publicLock.project !== 'supermega-public') {
  fail(`wrong_project_${project.projectName || 'unknown'}`)
}

console.log('public_vercel_config=ready')
