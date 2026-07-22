import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n')
const manifest = JSON.parse(read('site-manifest.json'))
const packageJson = JSON.parse(read('package.json'))
const vercelConfig = JSON.parse(read('vercel.json'))
const releaseWorkflow = read('.github/workflows/supermega-public-release.yml')
const healthWorkflow = read('.github/workflows/supermega-public-live-health.yml')
const previewVerifier = read('tools/verify_public_preview_live.mjs')
const rollbackResolver = read('tools/resolve_vercel_rollback_target.mjs')
const firewallVerifier = read('tools/verify_public_firewall_state.mjs')
const publicGenerator = read('tools/create_public_vercel_output.mjs')
const releaseWrapper = read('tools/deploy_website_actions.ps1')
const denyScript = read('tools/deny_stale_public_deploy.mjs')
const failures = []

function requireToken(text, token, label) {
  if (!text.includes(token)) failures.push(`${label}:${token}`)
}

if (manifest.release?.sourceBranch !== 'main') failures.push('manifest_release_source_not_main')
if (manifest.release?.workflow !== '.github/workflows/supermega-public-release.yml') failures.push('manifest_release_workflow_drift')
if (manifest.release?.productionDomain !== 'https://supermega.dev') failures.push('manifest_release_domain_drift')
if (existsSync(resolve(root, '.github/workflows/supermega-public-deploy.yml'))) failures.push('competing_public_deploy_workflow_present')
if (vercelConfig.git?.deploymentEnabled !== false) failures.push('native_git_deployments_not_disabled')
if (!previewVerifier.includes('preview_contact_not_accepting')) failures.push('preview_contact_readiness_not_verified')
if (!previewVerifier.includes('deployment_function_surface_wrong')) failures.push('preview_function_inventory_not_verified')
if (!previewVerifier.includes('const maxAttempts = 6') || !previewVerifier.includes('protected_preview_retry:')) failures.push('preview_propagation_retry_missing')
if (previewVerifier.includes("'--silent'") || previewVerifier.includes("'--show-error'") || previewVerifier.includes("'--location'")) failures.push('preview_verifier_uses_platform_specific_curl_flags')
if (previewVerifier.includes("'--token'") || !previewVerifier.includes('protected_preview_inspect_failed:') || !previewVerifier.includes('process.env.VERCEL_TOKEN')) failures.push('preview_verifier_credential_handling_unsafe')
if (!rollbackResolver.includes("mode === 'alias'") || !rollbackResolver.includes("mode === 'deployment'") || !rollbackResolver.includes("state.projectId !== expectedProjectId") || !rollbackResolver.includes("nestedDeploymentId !== deploymentId") || !rollbackResolver.includes("state.id !== expectedDeploymentId") || !rollbackResolver.includes("state.target !== 'production'") || !rollbackResolver.includes("state.readyState !== 'READY'")) failures.push('rollback_alias_resolver_incomplete')
for (const token of ['SUPERMEGA_CONTACT_IDEMPOTENCY_SECRET', 'idempotency_key_required', 'rate_limited', 'resolution=ignore-duplicates,return=representation', "'idempotency-key'"]) {
  if (!publicGenerator.includes(token)) failures.push(`contact_abuse_control_missing:${token}`)
}
for (const token of ['SuperMega contact intake - 5 per 10 minutes', "rateLimit?.window !== 600", "rateLimit?.limit !== 5", "JSON.stringify(['ip'])"]) {
  if (!firewallVerifier.includes(token)) failures.push(`firewall_verifier_missing:${token}`)
}

for (const [name, expected] of Object.entries({
  build: 'npm run public:build',
  'vercel:guard': 'node tools/verify_public_deploy_guard.mjs',
  'vercel:deploy': 'node tools/deny_stale_public_deploy.mjs',
  'vercel:deploy:prod': 'node tools/deny_stale_public_deploy.mjs',
  'public:build': 'node tools/create_public_vercel_output.mjs',
  'public:verify': 'node tools/verify_public_vercel_artifact_budget.mjs && node tools/verify_public_vercel_output.mjs && node tools/test_public_contact_function.mjs && npm run vercel:contracts:test && npm run hq:verify',
  'public:prebuilt': 'npm run public:build && npm run public:verify',
  'public:verify:live': 'node tools/verify_public_release_live.mjs',
  'deploy:public:prod': 'node tools/deny_stale_public_deploy.mjs',
})) {
  if (packageJson.scripts?.[name] !== expected) failures.push(`package_script_drift:${name}`)
}

for (const token of [
  'branches:\n      - main',
  'group: supermega-coordinated-production',
  "if: ${{ github.ref == 'refs/heads/main' && github.repository == 'swanhtet01/swanhtet01.github.io' }}",
  'VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
  'npx --yes vercel@56.1.0 pull',
  'npm run public:prebuilt',
  'tools/test_public_contact_function.mjs',
  'tools/resolve_vercel_rollback_target.mjs',
  'api "/now/aliases/supermega.dev" --raw',
  'resolve_vercel_rollback_target.mjs alias supermega.dev prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
  'read -r PREVIOUS_URL PREVIOUS_ID',
  'resolve_vercel_rollback_target.mjs deployment "$PREVIOUS_URL" "$PREVIOUS_ID"',
  'npx --yes vercel@56.1.0 deploy --prebuilt',
  'deploy --prebuilt --prod --skip-domain --yes',
  'npx --yes vercel@56.1.0 inspect',
  'node tools/verify_public_preview_live.mjs',
  'node tools/verify_vercel_project_state.mjs public',
  '/v9/projects/$VERCEL_PROJECT_ID/domains?teamId=$VERCEL_ORG_ID',
  'node tools/verify_vercel_domain_state.mjs public',
  '/v10/projects/$VERCEL_PROJECT_ID/env?teamId=$VERCEL_ORG_ID',
  'node tools/verify_vercel_environment_state.mjs public',
  'node tools/verify_public_firewall_state.mjs',
  '/v1/security/firewall/config/active?',
  'npx --yes vercel@56.1.0 promote',
  'npx --yes vercel@56.1.0 rollback',
  'EXPECTED_RELEASE_COMMIT:',
  'npm run public:verify:live',
  'githubCommitRef=${{ github.ref_name }}',
  '- vercel.json',
  '- .vercelignore',
]) requireToken(releaseWorkflow, token, 'release_workflow_missing')

const orderedReleaseSteps = [
  'Capture current production rollback target',
  'Deploy isolated production candidate',
  'Inspect candidate deployment',
  'Verify protected candidate content',
  'Promote the verified artifact',
  'Verify production aliases and exact release',
  'Verify production project controls',
  'Roll back a failed production verification',
]
const releasePositions = orderedReleaseSteps.map((step) => releaseWorkflow.indexOf(step))
if (!releasePositions.every((position) => position >= 0) || !releasePositions.every((position, index) => index === 0 || position > releasePositions[index - 1])) failures.push('public_release_steps_out_of_order')
if (releaseWorkflow.includes('ls supermega-public --environment production')) failures.push('rollback_target_can_select_unaliased_candidate')

for (const token of ['workflow_dispatch:', 'schedule:', 'npm run public:verify:live']) requireToken(healthWorkflow, token, 'health_workflow_missing')
if (/vercel@\S+\s+(?:deploy|promote)/.test(healthWorkflow)) failures.push('health_workflow_can_deploy')

for (const token of ['dispatch_ref = "main"', 'source_ref = "main"', 'workflow = $workflowFile']) requireToken(releaseWrapper, token, 'release_wrapper_missing')
for (const token of ['canonicalBranch = \'main\'', 'supermega-public-release.yml']) requireToken(denyScript, token, 'direct_deploy_guard_missing')

const workflowsDir = resolve(root, '.github', 'workflows')
const publicProjectId = 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR'
const projectOwners = []
for (const entry of readdirSync(workflowsDir, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue
  const source = read(`.github/workflows/${entry.name}`)
  if (source.includes(publicProjectId)) projectOwners.push(entry.name)
  if (/uses:\s+[^\s#]+@v\d+/m.test(source)) failures.push(`mutable_action_ref:${entry.name}`)
}
if (projectOwners.join(',') !== 'supermega-public-release.yml') failures.push(`public_vercel_project_has_multiple_owners:${projectOwners.join(',')}`)

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_public_release_authority', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega_public_release_authority',
  sourceBranch: 'main',
  workflow: manifest.release.workflow,
  projectOwner: projectOwners[0],
  directDeploy: 'blocked',
}, null, 2))
