import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const configPath = resolve(root, 'vercel.json')
const ignorePath = resolve(root, '.vercelignore')
const projectPath = resolve(root, '.vercel', 'project.json')
const lockPath = resolve(root, 'tools', 'public_deployment_lock.json')
const packagePath = resolve(root, 'package.json')
const sourceDeployGuardPath = resolve(root, 'tools', 'skip_public_source_deploy.mjs')
const config = JSON.parse(await readFile(configPath, 'utf8'))
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
const sourceDeployGuard = await readFile(sourceDeployGuardPath, 'utf8')
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

if (Object.hasOwn(config, 'buildCommand')) {
  fail('public_build_command_must_come_from_package_contract')
}

if (Object.hasOwn(config, 'outputDirectory')) {
  fail('build_output_api_must_not_use_framework_output_directory')
}

if (packageJson.scripts?.build !== 'npm run public:build') {
  fail('package_build_must_use_public_generator')
}

if (config.ignoreCommand !== 'node tools/skip_public_source_deploy.mjs') {
  fail('unverified_source_deploys_must_be_skipped')
}

if (!sourceDeployGuard.includes('public_source_deploy=skipped_use_verified_prebuilt_release')) {
  fail('source_deploy_guard_contract_missing')
}

if (packageJson.scripts?.['public:prebuilt'] !== 'npm run public:build && npm run public:verify') {
  fail('public_prebuilt_must_generate_then_verify')
}

if (packageJson.scripts?.['vercel:build'] !== 'npm run public:prebuilt') {
  fail('generic_vercel_builder_must_not_expand_public_api_surface')
}

for (const scriptName of ['vercel:deploy', 'vercel:deploy:prod', 'deploy:public:prod']) {
  const script = String(packageJson.scripts?.[scriptName] || '')
  if (!script.startsWith('npm run public:prebuilt && ') || !script.includes('vercel deploy --prebuilt')) {
    fail(`${scriptName}_must_deploy_verified_prebuilt_output`)
  }
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
