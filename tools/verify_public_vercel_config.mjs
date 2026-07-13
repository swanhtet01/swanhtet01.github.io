import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const configPath = resolve(root, 'vercel.json')
const ignorePath = resolve(root, '.vercelignore')
const projectPath = resolve(root, '.vercel', 'project.json')
const lockPath = resolve(root, 'tools', 'public_deployment_lock.json')
const packagePath = resolve(root, 'package.json')
const sourceDeployGuardPath = resolve(root, 'tools', 'skip_public_source_deploy.mjs')
const releaseWorkflowPath = resolve(root, '.github', 'workflows', 'supermega-public-release.yml')
const liveReleaseProbePath = resolve(root, 'tools', 'verify_public_release_live.mjs')
const retiredWorkflowPaths = [
  resolve(root, '.github', 'workflows', 'supermega-deploy.yml'),
  resolve(root, '.github', 'workflows', 'supermega-public-maintenance.yml'),
]
const config = JSON.parse(await readFile(configPath, 'utf8'))
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
const sourceDeployGuard = await readFile(sourceDeployGuardPath, 'utf8')
const releaseWorkflow = await readFile(releaseWorkflowPath, 'utf8')
const liveReleaseProbe = await readFile(liveReleaseProbePath, 'utf8')
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

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
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

if (packageJson.scripts?.['public:verify:live'] !== 'node tools/verify_public_release_live.mjs') {
  fail('public_live_release_probe_script_missing')
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

for (const required of [
  'SuperMega Public - Verified Prebuilt Release',
  'codex/public-enterprise-site',
  'actions/checkout@v6',
  'actions/setup-node@v6',
  'node-version: 24',
  'package-manager-cache: false',
  'VERCEL_ORG_ID: team_wI4l7ZgSxcEztQPSlCCYVeJ5',
  'VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
  'vercel@56.1.0 pull --yes --environment=production',
  'npm run vercel:guard',
  'npm run public:prebuilt',
  'vercel@56.1.0 deploy --prebuilt --prod',
  'npm run public:verify:live',
]) {
  if (!releaseWorkflow.includes(required)) fail(`public_release_workflow_missing_${required}`)
}

if (releaseWorkflow.includes('npm ci')) {
  fail('public_release_must_not_require_missing_root_lockfile')
}

if (/actions\/(?:checkout|setup-node)@v[1-5]\b/.test(releaseWorkflow)) {
  fail('public_release_deprecated_action_runtime_forbidden')
}

if (/vercel(?:@\S+)? deploy --prod/.test(releaseWorkflow)) {
  fail('public_release_source_deploy_forbidden')
}

const workflowOrder = [
  'vercel@56.1.0 pull --yes --environment=production',
  'npm run vercel:guard',
  'npm run public:prebuilt',
  'vercel@56.1.0 deploy --prebuilt --prod',
  'npm run public:verify:live',
].map((marker) => releaseWorkflow.indexOf(marker))
if (workflowOrder.some((position) => position < 0) || workflowOrder.some((position, index) => index > 0 && position <= workflowOrder[index - 1])) {
  fail('public_release_workflow_order_invalid')
}

for (const path of retiredWorkflowPaths) {
  if (await exists(path)) fail(`retired_public_workflow_present_${path}`)
}

for (const required of [
  "method: 'GET'",
  'https://supermega.dev/',
  'https://www.supermega.dev/',
  'contact/?from=ai-agent-solution',
  '/api/health',
  '/api/contact-submissions/status',
  'writes_performed: false',
]) {
  if (!liveReleaseProbe.includes(required)) fail(`public_live_release_probe_missing_${required}`)
}

if (/method:\s*['"]POST['"]/.test(liveReleaseProbe)) {
  fail('public_live_release_probe_must_be_read_only')
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
