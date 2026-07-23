import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const appWorkflow = await readFile(resolve(root, '.github/workflows/supermega-app-deploy.yml'), 'utf8')
const workflow = await readFile(resolve(root, '.github/workflows/supermega-public-release.yml'), 'utf8')
const ciWorkflow = await readFile(resolve(root, '.github/workflows/showroom-ci.yml'), 'utf8')
const publicHealthWorkflow = await readFile(resolve(root, '.github/workflows/supermega-public-live-health.yml'), 'utf8')
const kernelWorkflow = await readFile(resolve(root, '.github/workflows/kernel-deploy.yml'), 'utf8')
const generator = await readFile(resolve(root, 'tools/write_app_vercel_config.mjs'), 'utf8')
const appVerifier = await readFile(resolve(root, 'tools/verify_app_release_live.mjs'), 'utf8')
const releaseBarrier = await readFile(resolve(root, 'tools/verify_coordinated_release_live.mjs'), 'utf8')
const databaseValidator = await readFile(resolve(root, 'tools/validate_supermega_database_url.py'), 'utf8')
const rollbackResolver = await readFile(resolve(root, 'tools/resolve_vercel_rollback_target.mjs'), 'utf8')
const config = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'))
const failures = []
const checks = []

function requireContract(name, condition) {
  checks.push(name)
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
const releaseBarrierSelfTest = spawnSync(
  process.execPath,
  [resolve(root, 'tools/verify_coordinated_release_live.mjs'), '--self-test'],
  { encoding: 'utf8' },
)

requireContract('canonical app project id', workflow.includes('APP_VERCEL_PROJECT_ID: prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'))
requireContract('canonical public project id', workflow.includes('VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR'))
requireContract('canonical project identities', workflow.includes('project inspect megaos') && workflow.includes('APP_VERCEL_PROJECT_ID: prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG') && workflow.includes('PUBLIC_VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR'))
requireContract('pinned Vercel CLI', workflow.includes('vercel@56.1.0'))
requireContract('app build contract', config.buildCommand === 'npm run app:build' && generator.includes("buildCommand: 'npm run app:build'"))
requireContract('remote dependency install contract', config.installCommand === 'npm --prefix showroom ci' && generator.includes("installCommand: 'npm --prefix showroom ci'"))
requireContract('remote security inputs are included', generator.includes("'!.env.app.example'"))
requireContract('canonical output directory', config.outputDirectory === 'showroom/dist')
requireContract('canonical API function', config.routes?.[0]?.dest === '/api/app.py' && JSON.stringify(Object.keys(config.functions || {}).sort()) === JSON.stringify(['api/app.py']) && config.functions?.['api/app.py']?.includeFiles === 'supermega_runtime/**' && generator.includes("includeFiles: 'supermega_runtime/**'"))
requireContract('native Git deployment disabled in config', config.git?.deploymentEnabled === false && /deploymentEnabled:\s*false/.test(generator))
requireContract('deployment control files trigger coordinated release', workflow.includes('- vercel.json') && workflow.includes('- .vercelignore'))
requireContract('app and public changes trigger one release authority', workflow.includes("- 'showroom/**'") && workflow.includes('tools/create_public_vercel_output.mjs') && workflow.includes('tools/verify_coordinated_release_live.mjs'))
requireContract('all API tests trigger and execute', workflow.includes("- 'tests/**'") && workflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v"))
requireContract('runtime package changes trigger release', workflow.includes("- 'supermega_runtime/**'"))
requireContract('database activation controls trigger release', workflow.includes('tools/validate_supermega_database_url.py') && workflow.includes('tools/activate_supermega_database.ps1'))
requireContract('app guard remains non-mutating but runs API tests', appWorkflow.includes("- 'supermega_runtime/**'") && appWorkflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v") && !/vercel@56\.1\.0\s+(?:deploy|promote|rollback)\b/.test(appWorkflow) && !appWorkflow.includes('VERCEL_TOKEN') && !/environment:\s*production/.test(appWorkflow))
requireContract('protected app candidate verification', workflow.includes("VERCEL_PROTECTED_PREVIEW: '1'") && appVerifier.includes("'curl', path, '--deployment'") && appVerifier.includes('deploymentFunctions') && appVerifier.includes("JSON.stringify(['api/app'])") && appVerifier.includes('hosted_agent_runtime_contract_wrong'))
requireContract('app live identity validates brand context and catalog', appVerifier.includes('release.brandVersion !== manifest.brand.version') && appVerifier.includes('release.contextVersion !== manifest.contextVersion') && appVerifier.includes('release.catalogVersion !== manifest.catalogVersion'))
requireContract('isolated candidates exist for both domains', (workflow.match(/deploy --prebuilt --prod --skip-domain --yes/g) || []).length === 2 && workflow.includes('Deploy isolated app production candidate') && workflow.includes('Deploy isolated production candidate'))
requireContract('candidate identity barrier is protected', workflow.includes('Verify candidate release identity barrier') && workflow.includes('APP_BASE_URL: ${{ steps.deploy-app.outputs.url }}') && workflow.includes('PUBLIC_BASE_URL: ${{ steps.deploy.outputs.url }}') && releaseBarrier.includes('protected_preview_token_required'))
requireContract('candidate identity barrier selects each Vercel project', releaseBarrier.includes('APP_VERCEL_PROJECT_ID') && releaseBarrier.includes('PUBLIC_VERCEL_PROJECT_ID') && releaseBarrier.includes('VERCEL_PROJECT_ID: projectId') && releaseBarrier.includes("'--deployment', baseUrl, '--yes'"))
requireContract('public project switch clears app build and environment state', workflow.includes('rm -rf -- .vercel') && workflow.indexOf('rm -rf -- .vercel') < workflow.indexOf('npm run public:prebuilt'))
requireContract('cross-domain barrier validates complete release identity', releaseBarrier.includes("identityFields = ['commit', 'brandVersion', 'contextVersion', 'catalogVersion']") && releaseBarrier.includes('cross_domain_release_identity_mismatch') && releaseBarrier.includes('release_manifest_identity_mismatch'))
requireContract('release barrier fixtures pass', releaseBarrierSelfTest.status === 0 && releaseBarrierSelfTest.stdout.includes('"ok": true') && releaseBarrierSelfTest.stdout.includes('reject_catalog_drift'))
requireContract('cross-platform protected deployment requests', !appVerifier.includes("'--silent'") && !appVerifier.includes("'--show-error'") && !appVerifier.includes("'--location'") && !appVerifier.includes("'--token'") && appVerifier.includes('describeCliFailure'))
requireContract('both project controls are verified', workflow.includes('verify_vercel_project_state.mjs app') && workflow.includes('verify_vercel_project_state.mjs public') && workflow.includes('verify_vercel_domain_state.mjs app') && workflow.includes('verify_vercel_domain_state.mjs public') && workflow.includes('verify_vercel_environment_state.mjs app') && workflow.includes('verify_vercel_environment_state.mjs public'))
requireContract('all control URLs use explicit project identities', workflow.includes('api "/v9/projects/$APP_VERCEL_PROJECT_ID"') && workflow.includes('/v9/projects/$APP_VERCEL_PROJECT_ID/domains?teamId=$VERCEL_ORG_ID') && workflow.includes('/v10/projects/$APP_VERCEL_PROJECT_ID/env?teamId=$VERCEL_ORG_ID') && workflow.includes('api "/v9/projects/$PUBLIC_VERCEL_PROJECT_ID"') && workflow.includes('/v9/projects/$PUBLIC_VERCEL_PROJECT_ID/domains?teamId=$VERCEL_ORG_ID') && workflow.includes('/v10/projects/$PUBLIC_VERCEL_PROJECT_ID/env?teamId=$VERCEL_ORG_ID') && workflow.includes('projectId=$PUBLIC_VERCEL_PROJECT_ID&teamId=$VERCEL_ORG_ID') && !workflow.includes('/v9/projects/megaos') && !workflow.includes('/v9/projects/supermega-public'))
requireContract('managed mode is derived from production environment state', workflow.includes('id: app-environment') && workflow.includes("operating_mode=%s") && workflow.includes("['isolated_demo','managed_trial']"))
requireContract('managed database audit uses the exact app runtime environment before candidate creation',
  workflow.includes('Enforce exact app runtime database and RLS gate')
  && workflow.includes('VERCEL_PROJECT_ID: ${{ env.APP_VERCEL_PROJECT_ID }}')
  && workflow.includes('vercel@56.1.0 env run --environment=production')
  && workflow.includes('python tools/validate_supermega_database_url.py --env-key SUPERMEGA_DATABASE_URL --ensure-schema --require-ready')
  && workflow.includes('Operating mode selection is missing or invalid')
  && !workflow.includes('SUPERMEGA_DATABASE_URL: ${{ secrets.SUPERMEGA_DATABASE_URL }}')
  && workflow.indexOf('Enforce exact app runtime database and RLS gate') < workflow.indexOf('Deploy isolated app production candidate')
  && workflow.indexOf('Enforce exact app runtime database and RLS gate') < workflow.indexOf('Deploy isolated production candidate'))
requireContract('RLS and trigger validator rejects semantic bypasses',
  !databaseValidator.includes('def _contains_tokens')
  && databaseValidator.includes('def _policy_expression_matches')
  && databaseValidator.includes('TRUE OR (')
  && databaseValidator.includes('reject_ungrouped_human_or')
  && databaseValidator.includes('reject_inverted_identity_predicates')
  && databaseValidator.includes('reject_swapped_identity_settings')
  && databaseValidator.includes('trigger_type')
  && databaseValidator.includes('function_source')
  && databaseValidator.includes('"--self-test"'))
requireContract('app rollback target captured from exact live alias', workflow.includes('api "/now/aliases/app.supermega.dev" --raw') && workflow.includes('resolve_vercel_rollback_target.mjs alias app.supermega.dev prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG') && workflow.includes('id: app-rollback-target'))
requireContract('public rollback target captured from exact live alias', workflow.includes('api "/now/aliases/supermega.dev" --raw') && workflow.includes('resolve_vercel_rollback_target.mjs alias supermega.dev prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR') && workflow.includes('id: rollback-target'))
requireContract('rollback resolver validates exact deployment identity', workflow.includes('read -r PREVIOUS_URL PREVIOUS_ID') && workflow.includes('resolve_vercel_rollback_target.mjs deployment "$PREVIOUS_URL" "$PREVIOUS_ID"') && rollbackResolver.includes("mode === 'alias'") && rollbackResolver.includes("mode === 'deployment'") && rollbackResolver.includes("state.projectId !== expectedProjectId") && rollbackResolver.includes("nestedDeploymentId !== deploymentId") && rollbackResolver.includes("state.id !== expectedDeploymentId") && rollbackResolver.includes("state.target !== 'production'") && rollbackResolver.includes("state.readyState !== 'READY'"))
requireContract('rollback alias resolver fixtures', validAliasResolution.status === 0 && validAliasResolution.stdout === `${fixtureUrl} dpl_fixture123` && invalidAliasResolution.status !== 0 && invalidAliasResolution.stderr.includes('deployment_identity'))
requireContract('rollback deployment resolver fixtures', validDeploymentResolution.status === 0 && validDeploymentResolution.stdout === fixtureUrl && invalidDeploymentResolution.status !== 0 && invalidDeploymentResolution.stderr.includes('deployment_identity'))
requireContract('only coordinated workflow can promote app or public', (workflow.match(/vercel@56\.1\.0 promote/g) || []).length === 2 && !/vercel@56\.1\.0\s+promote\b/.test(appWorkflow))
requireContract('failed paired verification rolls back every attempted promotion', workflow.includes("failure() && (steps.promote-app.outputs.attempted == 'true' || steps.promote.outputs.attempted == 'true')") && (workflow.match(/attempted=true/g) || []).length === 2 && workflow.includes('APP_PROMOTION_ATTEMPTED') && workflow.includes('PUBLIC_PROMOTION_ATTEMPTED') && workflow.includes('steps.app-rollback-target.outputs.url') && workflow.includes('steps.rollback-target.outputs.url') && workflow.includes('VERIFY_RELEASE_PAIR_ONLY=1 node tools/verify_coordinated_release_live.mjs'))
requireContract('production environment gate', /environment:\s*production/.test(workflow))
requireContract('production is main-only in the canonical repository', workflow.includes("if: ${{ github.ref == 'refs/heads/main' && github.repository == 'swanhtet01/swanhtet01.github.io' }}"))
requireContract('deployment metadata uses the guarded runtime ref', (workflow.match(/githubCommitRef=\$\{\{ github\.ref_name \}\}/g) || []).length === 2 && !workflow.includes('githubCommitRef=main'))
const coreWorkflowActions = `${workflow}\n${appWorkflow}\n${ciWorkflow}\n${publicHealthWorkflow}\n${kernelWorkflow}`
requireContract('core actions are commit-pinned', !/uses:\s+[^\s#]+@v\d+/m.test(coreWorkflowActions) && /uses:\s+actions\/checkout@[0-9a-f]{40}/.test(workflow))
requireContract('core workflows use Node 24 action revisions',
  (coreWorkflowActions.match(/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g) || []).length === 5
  && (coreWorkflowActions.match(/actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/g) || []).length === 5
  && (coreWorkflowActions.match(/actions\/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97/g) || []).length === 3
  && !/(?:11d5960a326750d5838078e36cf38b85af677262|49933ea5288caeca8642d1e84afbd3f7d6820020|a26af69be951a213d495a4c3e4e4022e16d87065)/.test(coreWorkflowActions))
requireContract('uv build tool is immutable', workflow.includes('astral-sh/setup-uv@c771a70e6277c0a99b617c7a806ffedaca235ff9') && workflow.includes("version: '0.11.30'"))
requireContract('stale Cloud Run release authority is retired', !existsSync(resolve(root, '.github/workflows/supermega-app-cloud-run.yml')))

const expectedCrons = ['/api/cron/supermega/agent-queue', '/api/cron/supermega/daily'].sort()
const actualCrons = (config.crons || []).map((cron) => cron.path).sort()
requireContract('canonical cron contract', JSON.stringify(actualCrons) === JSON.stringify(expectedCrons))

const combined = `${workflow}\n${appWorkflow}\n${generator}\n${JSON.stringify(config)}`
requireContract('no POS route', !/\/pos\/login/i.test(combined))
requireContract('no YTF schedule', !/\/api\/cron\/ytf/i.test(combined))

const orderedSteps = [
  'Enforce exact app runtime database and RLS gate',
  'Inspect and verify app candidate',
  'Verify protected candidate content',
  'Verify candidate release identity barrier',
  'Promote the verified app artifact',
  'Promote the verified artifact',
  'Verify production aliases and exact release',
  'Verify production project controls',
  'Roll back a failed production verification',
]
const positions = orderedSteps.map((step) => workflow.indexOf(step))
requireContract('coordinated release steps are ordered', positions.every((position) => position >= 0) && positions.every((position, index) => index === 0 || position > positions[index - 1]))

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_coordinated_release_workflow', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_coordinated_release_workflow', checks: checks.length }, null, 2))
