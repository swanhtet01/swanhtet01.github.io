import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const workflow = await readFile(resolve(root, '.github/workflows/supermega-app-deploy.yml'), 'utf8')
const generator = await readFile(resolve(root, 'tools/write_app_vercel_config.mjs'), 'utf8')
const verifier = await readFile(resolve(root, 'tools/verify_app_release_live.mjs'), 'utf8')
const rollbackResolver = await readFile(resolve(root, 'tools/resolve_vercel_rollback_target.mjs'), 'utf8')
const config = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'))
const failures = []

function requireContract(name, condition) {
  if (!condition) failures.push(name)
}

function runRollbackResolver(args, payload) {
  return spawnSync(
    process.execPath,
    [resolve(root, 'tools/resolve_vercel_rollback_target.mjs'), ...args],
    { input: JSON.stringify(payload), encoding: 'utf8' },
  )
}

const fixtureUrl = 'https://megaos-release-fixture.vercel.app'
const aliasFixture = {
  alias: 'app.supermega.dev',
  deploymentId: 'dpl_fixture123',
  deployment: { id: 'dpl_fixture123', url: 'megaos-release-fixture.vercel.app' },
  projectId: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG',
  redirect: null,
}
const validAliasResolution = runRollbackResolver(
  ['alias', 'app.supermega.dev', 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'],
  aliasFixture,
)
const invalidAliasResolution = runRollbackResolver(
  ['alias', 'app.supermega.dev', 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'],
  { ...aliasFixture, deploymentId: 'dpl_wrong' },
)
const validDeploymentResolution = runRollbackResolver(
  ['deployment', fixtureUrl, 'dpl_fixture123'],
  { id: 'dpl_fixture123', url: 'megaos-release-fixture.vercel.app', target: 'production', readyState: 'READY' },
)
const invalidDeploymentResolution = runRollbackResolver(
  ['deployment', fixtureUrl, 'dpl_fixture123'],
  { id: 'dpl_different', url: 'megaos-release-fixture.vercel.app', target: 'production', readyState: 'READY' },
)

requireContract('canonical project id', workflow.includes('prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'))
requireContract('canonical project name', workflow.includes('megaos'))
requireContract('pinned Vercel CLI', workflow.includes('vercel@56.1.0'))
requireContract('app build contract', config.buildCommand === 'npm run app:build' && generator.includes("buildCommand: 'npm run app:build'"))
requireContract('remote dependency install contract', config.installCommand === 'npm --prefix showroom ci' && generator.includes("installCommand: 'npm --prefix showroom ci'"))
requireContract('remote security inputs are included', generator.includes("'!.env.app.example'"))
requireContract('canonical output directory', config.outputDirectory === 'showroom/dist')
requireContract('canonical API function', config.routes?.[0]?.dest === '/api/app.py' && JSON.stringify(Object.keys(config.functions || {}).sort()) === JSON.stringify(['api/app.py']) && config.functions?.['api/app.py']?.includeFiles === 'supermega_runtime/**' && generator.includes("includeFiles: 'supermega_runtime/**'"))
requireContract('native Git deployment disabled in config', config.git?.deploymentEnabled === false && /deploymentEnabled:\s*false/.test(generator))
requireContract('deployment control files trigger release', workflow.includes("- 'vercel.json'") && workflow.includes("- '.vercelignore'"))
requireContract('all API tests trigger and execute', workflow.includes("- 'tests/**'") && workflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v"))
requireContract('runtime package changes trigger release', workflow.includes("- 'supermega_runtime/**'"))
requireContract('database activation controls trigger release', workflow.includes("- 'tools/validate_supermega_database_url.py'") && workflow.includes("- 'tools/activate_supermega_database.ps1'"))
requireContract('protected preview verification', workflow.includes("VERCEL_PROTECTED_PREVIEW: '1'") && verifier.includes("'curl', path, '--deployment'") && verifier.includes("deploymentFunctions") && verifier.includes("JSON.stringify(['api/app'])") && verifier.includes('hosted_agent_runtime_contract_wrong'))
requireContract('isolated production candidate deployment', workflow.includes('deploy --prebuilt --prod --skip-domain --yes'))
requireContract('cross-platform protected deployment requests', !verifier.includes("'--silent'") && !verifier.includes("'--show-error'") && !verifier.includes("'--location'") && !verifier.includes("'--token'") && verifier.includes('describeCliFailure'))
requireContract('live project state verified', workflow.includes('verify_vercel_project_state.mjs app'))
requireContract('production rollback target captured from exact live alias', workflow.includes("- 'tools/resolve_vercel_rollback_target.mjs'") && workflow.includes('api "/now/aliases/app.supermega.dev" --raw') && workflow.includes('resolve_vercel_rollback_target.mjs alias app.supermega.dev prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG') && workflow.includes('read -r PREVIOUS_URL PREVIOUS_ID') && workflow.includes('resolve_vercel_rollback_target.mjs deployment "$PREVIOUS_URL" "$PREVIOUS_ID"') && !workflow.includes('ls megaos --environment production') && rollbackResolver.includes("mode === 'alias'") && rollbackResolver.includes("mode === 'deployment'") && rollbackResolver.includes("state.projectId !== expectedProjectId") && rollbackResolver.includes("nestedDeploymentId !== deploymentId") && rollbackResolver.includes("state.id !== expectedDeploymentId") && rollbackResolver.includes("state.target !== 'production'") && rollbackResolver.includes("state.readyState !== 'READY'"))
requireContract('rollback alias resolver fixtures', validAliasResolution.status === 0 && validAliasResolution.stdout === `${fixtureUrl} dpl_fixture123` && invalidAliasResolution.status !== 0 && invalidAliasResolution.stderr.includes('deployment_identity'))
requireContract('rollback deployment resolver fixtures', validDeploymentResolution.status === 0 && validDeploymentResolution.stdout === fixtureUrl && invalidDeploymentResolution.status !== 0 && invalidDeploymentResolution.stderr.includes('deployment_identity'))
requireContract('failed production verification rolls back', workflow.includes('Roll back a failed production verification') && workflow.includes('vercel@56.1.0 rollback'))
requireContract('production environment gate', /environment:\s*production/.test(workflow))
requireContract('production is main-only in the canonical repository', workflow.includes("if: ${{ github.ref == 'refs/heads/main' && github.repository == 'swanhtet01/swanhtet01.github.io' }}"))
requireContract('deployment metadata uses the guarded runtime ref', workflow.includes('githubCommitRef=${{ github.ref_name }}') && !workflow.includes('githubCommitRef=main'))
requireContract('release actions are commit-pinned', !/uses:\s+[^\s#]+@v\d+/m.test(workflow) && /uses:\s+actions\/checkout@[0-9a-f]{40}/.test(workflow))
requireContract('uv build tool is immutable', workflow.includes('astral-sh/setup-uv@c771a70e6277c0a99b617c7a806ffedaca235ff9') && workflow.includes("version: '0.11.30'"))
requireContract('stale Cloud Run release authority is retired', !existsSync(resolve(root, '.github/workflows/supermega-app-cloud-run.yml')))

const expectedCrons = ['/api/cron/supermega/agent-queue', '/api/cron/supermega/daily'].sort()
const actualCrons = (config.crons || []).map((cron) => cron.path).sort()
requireContract('canonical cron contract', JSON.stringify(actualCrons) === JSON.stringify(expectedCrons))

const combined = `${workflow}\n${generator}\n${JSON.stringify(config)}`
requireContract('no POS route', !/\/pos\/login/i.test(combined))
requireContract('no YTF schedule', !/\/api\/cron\/ytf/i.test(combined))

const orderedSteps = [
  'Capture current production rollback target',
  'Deploy isolated production candidate',
  'Inspect and verify candidate',
  'Promote the verified artifact',
  'Verify app.supermega.dev exact release',
  'Verify production project controls',
  'Roll back a failed production verification',
]
const positions = orderedSteps.map((step) => workflow.indexOf(step))
requireContract('release steps are ordered', positions.every((position) => position >= 0) && positions.every((position, index) => index === 0 || position > positions[index - 1]))

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_app_release_workflow', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_app_release_workflow', checks: 31 }, null, 2))
