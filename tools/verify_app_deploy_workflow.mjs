import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile as readRawFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

import { validateSchedulerExecutionBudget } from './scheduler_authority_contract.mjs'

const normalizeSourceText = (value) => value.replace(/\r\n?/g, '\n')
const readFile = async (...args) => {
  const value = await readRawFile(...args)
  return typeof value === 'string' ? normalizeSourceText(value) : value
}

const root = resolve(import.meta.dirname, '..')
const appWorkflow = await readFile(resolve(root, '.github/workflows/supermega-app-deploy.yml'), 'utf8')
const workflow = await readFile(resolve(root, '.github/workflows/supermega-public-release.yml'), 'utf8')
const ciWorkflow = await readFile(resolve(root, '.github/workflows/showroom-ci.yml'), 'utf8')
const renderedJourneyVerifier = await readFile(resolve(root, 'tools/verify_app_entry_rendered.mjs'), 'utf8')
const dependencyAuditWorkflow = await readFile(resolve(root, '.github/workflows/dependency-security.yml'), 'utf8')
const publicHealthWorkflow = await readFile(resolve(root, '.github/workflows/supermega-public-live-health.yml'), 'utf8')
const kernelWorkflow = await readFile(resolve(root, '.github/workflows/kernel-deploy.yml'), 'utf8')
const generator = await readFile(resolve(root, 'tools/write_app_vercel_config.mjs'), 'utf8')
const appVerifier = await readFile(resolve(root, 'tools/verify_app_release_live.mjs'), 'utf8')
const publicVerifier = await readFile(resolve(root, 'tools/verify_public_release_live.mjs'), 'utf8')
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const gitIgnore = await readFile(resolve(root, '.gitignore'), 'utf8')
const releaseBarrier = await readFile(resolve(root, 'tools/verify_coordinated_release_live.mjs'), 'utf8')
const databaseValidator = await readFile(resolve(root, 'tools/validate_supermega_database_url.py'), 'utf8')
const migrationVerifier = await readFile(resolve(root, 'tools/verify_private_trial_migrations.mjs'), 'utf8')
const rollbackResolver = await readFile(resolve(root, 'tools/resolve_vercel_rollback_target.mjs'), 'utf8')
const releaseHandoff = await readFile(resolve(root, 'tools/prepare_release_handoff.mjs'), 'utf8')
const releaseIntegrationPlan = await readFile(resolve(root, 'tools/prepare_release_integration_plan.mjs'), 'utf8')
const releaseIntegrationBatch = await readFile(resolve(root, 'tools/prepare_release_integration_batch.mjs'), 'utf8')
const retiredAliasVerifier = await readFile(resolve(root, 'tools/verify_retired_vercel_alias_state.mjs'), 'utf8')
const previewServer = await readFile(resolve(root, 'tools/serve_solution.py'), 'utf8')
const previewLauncher = await readFile(resolve(root, 'tools/deploy_preview.sh'), 'utf8')
const retiredClaimableLauncher = await readFile(resolve(root, 'tools/deploy_claimable_preview.sh'), 'utf8')
const config = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'))
const appShell = await readFile(resolve(root, 'showroom/index.html'), 'utf8')
const schedulerAuthority = JSON.parse(await readFile(resolve(root, 'tools/supermega_scheduler_authority.json'), 'utf8'))
const schedulerExecutionBudget = validateSchedulerExecutionBudget(schedulerAuthority)
const kernelConfig = JSON.parse(await readFile(resolve(root, 'kernel/vercel.json'), 'utf8'))
const agentConnectorMap = previewServer.slice(
  previewServer.indexOf('AGENT_JOB_CONNECTOR_MAP:'),
  previewServer.indexOf('AGENT_TEAM_RUNTIME_JOB_MAP:'),
)
const failures = []
const checks = []

function requireContract(name, condition) {
  checks.push(name)
  if (!condition) failures.push(name)
}

requireContract('source line endings normalize across platforms',
  normalizeSourceText('line one\r\nline two\rline three') === 'line one\nline two\nline three')
requireContract('dependency audit is read-only, scheduled, and covers every npm lockfile',
  packageJson.scripts?.['security:dependencies'] === 'npm audit --audit-level=low && npm --prefix showroom audit --audit-level=low && npm --prefix kernel audit --audit-level=low'
  && dependencyAuditWorkflow.includes("- 'package-lock.json'")
  && dependencyAuditWorkflow.includes("- 'showroom/package-lock.json'")
  && dependencyAuditWorkflow.includes("- 'kernel/package-lock.json'")
  && dependencyAuditWorkflow.includes('workflow_dispatch:')
  && dependencyAuditWorkflow.includes("cron: '25 3 * * 1'")
  && dependencyAuditWorkflow.includes('contents: read')
  && dependencyAuditWorkflow.includes('run: npm audit --audit-level=low')
  && !dependencyAuditWorkflow.includes('pull_request_target:')
  && !dependencyAuditWorkflow.includes('contents: write')
  && !dependencyAuditWorkflow.includes('pull-requests: write'))
requireContract('release handoff is exact, review-only, and cannot deploy',
  packageJson.scripts?.['release:handoff:prepare'] === 'node tools/prepare_release_handoff.mjs'
  && packageJson.scripts?.['release:handoff:self-test'] === 'node --test tools/prepare_release_handoff.test.mjs'
  && releaseHandoff.includes("export const RELEASE_HANDOFF_CONTRACT = 'supermega.release-handoff.v2'")
  && releaseHandoff.includes("mode: 'owner_review_only'")
  && releaseHandoff.includes('pushApproved: false')
  && releaseHandoff.includes('mergeApproved: false')
  && releaseHandoff.includes('workflowDispatchApproved: false')
  && releaseHandoff.includes('deploymentApproved: false')
  && releaseHandoff.includes('remoteWritesPerformed: false')
  && releaseHandoff.includes("digestScope: 'utf8_compact_json_without_digest'")
  && releaseHandoff.includes('digest: `sha256:${sha256(payload)}`')
  && releaseHandoff.includes('packetDigest: packet.digest')
  && releaseHandoff.includes("mode: 'owner_review_only'")
  && releaseHandoff.includes('verifyCurrentReleaseHandoff')
  && releaseHandoff.includes("fail('release_handoff_remote_state_changed')")
  && releaseHandoff.includes("fail('release_handoff_live_state_changed')")
  && releaseHandoff.includes("git('ls-remote', '--heads', 'origin', ref)")
  && releaseHandoff.includes('file: process.execPath')
  && releaseHandoff.includes("args: [resolve(root, 'tools', 'run_app_verify.mjs'), '--serial']")
  && !releaseHandoff.includes("args: ['/d', '/s', '/c', 'npm.cmd run app:verify']")
  && !/\b(?:vercel|gh)\s+(?:deploy|promote|rollback|workflow|api)\b/i.test(releaseHandoff))
requireContract('diverged release candidates produce one exact no-write integration plan',
  packageJson.scripts?.['release:integration:prepare'] === 'node tools/prepare_release_integration_plan.mjs'
  && packageJson.scripts?.['release:integration:self-test'] === 'node --test tools/prepare_release_integration_plan.test.mjs'
  && releaseIntegrationPlan.includes("export const RELEASE_INTEGRATION_PLAN_CONTRACT = 'supermega.release-integration-plan.v1'")
  && releaseIntegrationPlan.includes("mode: 'owner_review_only_no_git_mutation'")
  && releaseIntegrationPlan.includes("strategy: 'new_owner_approved_integration_branch_from_origin_main'")
  && releaseIntegrationPlan.includes("git('ls-remote', '--heads', 'origin', 'main')")
  && releaseIntegrationPlan.includes("['merge-tree', '--write-tree', '--name-only', '--no-messages', mainCommit, candidateCommit]")
  && releaseIntegrationPlan.includes('branchCreationApproved: false')
  && releaseIntegrationPlan.includes('mergeApproved: false')
  && releaseIntegrationPlan.includes('conflictResolutionApproved: false')
  && releaseIntegrationPlan.includes('pushApproved: false')
  && releaseIntegrationPlan.includes('deploymentApproved: false')
  && releaseIntegrationPlan.includes('forcePushAllowed: false')
  && releaseIntegrationPlan.includes("fail('release_integration_remote_tracking_stale')")
  && releaseIntegrationPlan.includes("fail('release_integration_state_changed')")
  && !/\b(?:merge|rebase|cherry-pick|push|reset|checkout|switch)\b/.test(releaseIntegrationPlan.match(/function git\([\s\S]+?function remoteMainHead/)?.[0] || '')
  && !/\b(?:vercel|gh)\s+(?:deploy|promote|rollback|workflow|api)\b/i.test(releaseIntegrationPlan))
requireContract('ordered integration batches preserve production safeguards and candidate product depth',
  packageJson.scripts?.['release:integration:batch:prepare'] === 'node tools/prepare_release_integration_batch.mjs'
  && packageJson.scripts?.['release:integration:batch:self-test'] === 'node --test tools/prepare_release_integration_batch.test.mjs'
  && releaseIntegrationBatch.includes("export const RELEASE_INTEGRATION_BATCH_CONTRACT = 'supermega.release-integration-batch.v1'")
  && releaseIntegrationBatch.includes("export const IDENTITY_DATA_BATCH = 'identity-data-onboarding'")
  && releaseIntegrationBatch.includes("export const APP_SHELL_BATCH = 'app-shell'")
  && releaseIntegrationBatch.includes("export const ECOMMERCE_BATCH = 'ecommerce'")
  && releaseIntegrationBatch.includes("export const RELEASE_SECURITY_HQ_BATCH = 'release-security-hq'")
  && releaseIntegrationBatch.includes('requestManagedPasswordRecovery')
  && releaseIntegrationBatch.includes('test_browser_auth_and_write_enablement_are_complete_and_ordered')
  && releaseIntegrationBatch.includes('validateManagedPlantEquipmentImport')
  && releaseIntegrationBatch.includes('createClientDemoWorkspace')
  && releaseIntegrationBatch.includes("file: 'showroom/src/core/client-onboarding.ts'")
  && releaseIntegrationBatch.includes('function managedLoginPath(product: string | null)')
  && releaseIntegrationBatch.includes('Confirming records the cashier’s reviewed payment and handoff, completes the sale, and updates sample stock in this browser.')
  && releaseIntegrationBatch.includes('Confirming creates an open sample order and reserves sample stock in this browser. Payment and fulfilment stay pending for review in Orders.')
  && releaseIntegrationBatch.includes('loadManagedOwnerControlRun')
  && releaseIntegrationBatch.includes('const ProductSystemNavigator = lazy(')
  && releaseIntegrationBatch.includes('Choose what you want to run.')
  && releaseIntegrationBatch.includes('.product-system-workflows { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; }')
  && releaseIntegrationBatch.includes('startGuidedWorkspace')
  && releaseIntegrationBatch.includes('function ecommerceOrderAmendmentSummary')
  && releaseIntegrationBatch.includes('Already saved for this company as revision')
  && releaseIntegrationBatch.includes('<details aria-label="More order tools" className="ecommerce-enterprise-controls">')
  && releaseIntegrationBatch.includes('function submitAmendmentRequest')
  && releaseIntegrationBatch.includes('function submitCorrectionRequest')
  && releaseIntegrationBatch.includes('commerce.storefront_request.received')
  && releaseIntegrationBatch.includes('managed schema contract advances through additive v2 through v11 migrations')
  && releaseIntegrationBatch.includes('release:integration:batch:prepare')
  && releaseIntegrationBatch.includes('production Supabase target requires separately committed activation authority')
  && releaseIntegrationBatch.includes("resolutionRule: 'preserve_all_upstream_and_candidate_requirements_in_one_tree'")
  && releaseIntegrationBatch.includes('branchCreationApproved: false')
  && releaseIntegrationBatch.includes('conflictResolutionApproved: false')
  && releaseIntegrationBatch.includes('sourceFilesModified: false')
  && releaseIntegrationBatch.includes("fail('release_integration_batch_state_changed')")
  && !/\b(?:vercel|gh)\s+(?:deploy|promote|rollback|workflow|api)\b/i.test(releaseIntegrationBatch))

function runRollbackResolver(args, payload) {
  return spawnSync(
    process.execPath,
    [resolve(root, 'tools/resolve_vercel_rollback_target.mjs'), ...args],
    { input: JSON.stringify(payload), encoding: 'utf8' },
  )
}

async function verifyCanonicalPythonBundle() {
  const bundleRoot = await mkdtemp(join(tmpdir(), 'supermega-vercel-python-'))
  try {
    await mkdir(resolve(bundleRoot, 'supermega_runtime'), { recursive: true })
    for (const relativePath of [
      'supermega_runtime/__init__.py',
      'supermega_runtime/agent_governance.py',
      'supermega_runtime/cloud_runtime.py',
      'supermega_runtime/scheduler_activation.py',
    ]) {
      await copyFile(resolve(root, relativePath), resolve(bundleRoot, relativePath))
    }
    const overridePython = process.env.SUPERMEGA_LOCAL_PYTHON?.trim()
    const localPython = process.platform === 'win32'
      ? resolve(root, '.venv/Scripts/python.exe')
      : resolve(root, '.venv/bin/python')
    const python = overridePython || (existsSync(localPython)
      ? localPython
      : (process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')))
    return spawnSync(
      python,
      ['-c', [
        'import builtins',
        '_import = builtins.__import__',
        'def guarded(name, *args, **kwargs):',
        '    if name == "mark1_pilot" or name.startswith("mark1_pilot."):',
        '        raise RuntimeError("excluded_mark1_pilot_imported")',
        '    return _import(name, *args, **kwargs)',
        'builtins.__import__ = guarded',
        'from supermega_runtime.cloud_runtime import _SCHEDULER_ROUTES',
        'assert sum(len(route["job_types"]) for route in _SCHEDULER_ROUTES.values()) == 4',
        'print("canonical-python-bundle-import-ok")',
      ].join('\n')],
      {
        cwd: bundleRoot,
        encoding: 'utf8',
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: bundleRoot },
      },
    )
  } finally {
    await rm(bundleRoot, { recursive: true, force: true })
  }
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
const appVerifierSelfTest = spawnSync(
  process.execPath,
  [resolve(root, 'tools/verify_app_release_live.mjs'), '--self-test'],
  { encoding: 'utf8' },
)
const canonicalPythonBundle = await verifyCanonicalPythonBundle()

requireContract('canonical app project id', workflow.includes('APP_VERCEL_PROJECT_ID: prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'))
requireContract('canonical public project id', workflow.includes('VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR'))
requireContract('canonical project identities', workflow.includes('project inspect megaos') && workflow.includes('APP_VERCEL_PROJECT_ID: prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG') && workflow.includes('PUBLIC_VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR'))
requireContract('pinned Vercel CLI', workflow.includes('vercel@56.1.0'))
requireContract('app build contract',
  config.buildCommand === 'npm run app:build'
  && generator.includes("buildCommand: 'npm run app:build'")
  && packageJson.scripts?.['app:build'] === 'npm run app:release:write && npm --prefix showroom run build'
  && packageJson.scripts?.['app:build:checked'] === 'npm run app:build && npm run app:verify && node tools/verify_app_release_live.mjs --artifact-self-test'
  && ciWorkflow.includes('run: npm run app:build:checked'))
requireContract('CI verifies exact-source desktop and 390px journeys for all four products',
  ciWorkflow.includes('timeout-minutes: 15')
  && ciWorkflow.includes("SUPERMEGA_CI_SOURCE_SHA: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}")
  && ciWorkflow.includes("ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}")
  && ciWorkflow.includes('Verify exact source checkout')
  && ciWorkflow.includes('test "$(git rev-parse HEAD)" = "$SUPERMEGA_CI_SOURCE_SHA"')
  && ciWorkflow.includes("SUPERMEGA_RELEASE_COMMIT: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}")
  && ciWorkflow.includes('Verify desktop and 390px product journeys')
  && ciWorkflow.includes('SUPERMEGA_RENDERED_EVIDENCE_DIR: ${{ runner.temp }}/supermega-app-entry-rendered-${{ github.run_id }}-${{ github.run_attempt }}')
  && ciWorkflow.includes('node tools/verify_app_entry_rendered.mjs')
  && ciWorkflow.includes('--out "$SUPERMEGA_RENDERED_EVIDENCE_DIR/report.json"')
  && ciWorkflow.includes('--screenshot-dir "$SUPERMEGA_RENDERED_EVIDENCE_DIR"')
  && ciWorkflow.includes('--expected-head "$SUPERMEGA_CI_SOURCE_SHA"')
  && !ciWorkflow.includes('--expected-head "$GITHUB_SHA"')
  && ciWorkflow.indexOf('Build and verify canonical app') < ciWorkflow.indexOf('Verify desktop and 390px product journeys')
  && ['shop', 'plant', 'website', 'ecommerce'].every((product) => renderedJourneyVerifier.includes(`route: '/${product}/`))
  && renderedJourneyVerifier.includes('width: 390')
  && renderedJourneyVerifier.includes('height: 844')
  && renderedJourneyVerifier.includes('noHorizontalOverflow: true')
  && renderedJourneyVerifier.includes("getComputedStyle(currentSale).transform === 'none'")
  && renderedJourneyVerifier.includes('Number.parseFloat(getComputedStyle(currentSale).opacity) === 1')
  && renderedJourneyVerifier.includes('&& (!mobile || state?.drawerTransitionSettled)')
  && !ciWorkflow.includes('actions/upload-artifact'))
requireContract('remote dependency install contract', config.installCommand === 'npm --prefix showroom ci' && generator.includes("installCommand: 'npm --prefix showroom ci'"))
requireContract('coordinated release avoids redundant local app install',
  !workflow.includes('Install app dependencies')
  && !workflow.includes('working-directory: showroom\n        run: npm ci')
  && workflow.includes('npx --yes vercel@56.1.0 build --prod --yes --token="$VERCEL_TOKEN"'))
requireContract('remote security inputs are included', generator.includes("'!.env.app.example'"))
requireContract('canonical output directory', config.outputDirectory === 'showroom/dist')
requireContract('canonical SPA routes use one filesystem-first fallback behind the header floor',
  config.routes?.length === 4
  && config.routes[0]?.src === '/(.*)' && config.routes[0]?.continue === true && !config.routes[0]?.dest
  && config.routes[1]?.src === '/api/(.*)' && config.routes[1]?.dest === '/api/app.py'
  && config.routes[2]?.handle === 'filesystem'
  && config.routes[3]?.src === '/(.*)' && config.routes[3]?.dest === '/index.html')
// The app keeps a client's catalog, orders, and evidence in browser storage. It
// shipped with no response headers at all while the kernel already had a full
// set, so it was framable and ran under no content policy.
const appSecurityHeaders = config.routes?.[0]?.headers || {}
const appPolicy = String(appSecurityHeaders['Content-Security-Policy'] || '')
requireContract('app is served with a security header floor',
  appSecurityHeaders['X-Frame-Options'] === 'DENY'
  && appSecurityHeaders['X-Content-Type-Options'] === 'nosniff'
  && appSecurityHeaders['Referrer-Policy'] === 'no-referrer'
  && appSecurityHeaders['Permissions-Policy'] === 'camera=(self), geolocation=(), microphone=(), payment=(), usb=()'
  && generator.includes("'Permissions-Policy': 'camera=(self), geolocation=(), microphone=(), payment=(), usb=()'")
  && generator.includes('appContentSecurityPolicy'))
requireContract('app content policy refuses framing, injection and unexpected egress',
  [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // The built shell emits no inline script, so this exception is never needed
    // and its absence is the property worth pinning. That claim went unchecked and
    // was FALSE for as long as it stood: the shell carried three inline scripts,
    // including the service-worker registration, and every one of them was refused
    // by this very directive -- silently, because a refused inline script logs and
    // does nothing. The app therefore had no service worker and no offline mode at
    // all. The shell now loads those three as files; the check that the built shell
    // really contains no inline script lives in tools/verify_app_build.mjs
    // (app_shell_inline_script_blocked_by_content_policy) and is asserted below too.
    "script-src 'self'",
    "connect-src 'self' https://*.supabase.co",
  ].every((directive) => appPolicy.includes(directive))
  && !/script-src[^;]*unsafe-(inline|eval)/.test(appPolicy))
// frame-ancestors is ignored in a meta policy, so the shell carries the rest as
// a second layer and the header remains the only place framing is refused.
const appShellPolicy = /http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]*)"/.exec(appShell)?.[1] || ''
requireContract('app shell carries the same policy for hosts that cannot set headers',
  appShellPolicy.includes("default-src 'self'")
  && appShellPolicy.includes("script-src 'self'")
  && appShellPolicy.includes("connect-src 'self' https://*.supabase.co")
  && !/script-src[^;]*unsafe-(inline|eval)/.test(appShellPolicy)
  && !appShellPolicy.includes('frame-ancestors'))
requireContract('app shell carries no inline script the policy would refuse',
  ![...appShell.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].some((match) => match[1].trim().length))
requireContract('canonical API function', config.routes?.[1]?.dest === '/api/app.py' && JSON.stringify(Object.keys(config.functions || {}).sort()) === JSON.stringify(['api/app.py']) && config.functions?.['api/app.py']?.maxDuration === 60 && config.functions?.['api/app.py']?.includeFiles === 'supermega_runtime/**' && generator.includes('maxDuration: 60') && generator.includes("includeFiles: 'supermega_runtime/**'"))
requireContract('canonical Python function cold imports from included runtime only', canonicalPythonBundle.status === 0 && canonicalPythonBundle.stdout.includes('canonical-python-bundle-import-ok'))
requireContract('native Git deployment disabled in config', config.git?.deploymentEnabled === false && /deploymentEnabled:\s*false/.test(generator))
requireContract('deployment control files trigger non-mutating review gates',
  [ciWorkflow, appWorkflow].every((source) => source.includes("- 'vercel.json'") && source.includes("- '.vercelignore'")))
requireContract('remote app build includes kernel release contract', generator.includes("['.github', 'kernel', 'supabase']"))
requireContract('retired alias control triggers non-mutating review gates', [ciWorkflow, appWorkflow].every((source) => source.includes('tools/verify_retired_vercel_alias_state.mjs')))
requireContract('app and public changes trigger non-mutating review before manual release',
  [ciWorkflow, appWorkflow].every((source) => source.includes("- 'showroom/**'") && source.includes('tools/create_public_vercel_output.mjs') && source.includes('tools/verify_coordinated_release_live.mjs')))
requireContract('HQ-only evidence validates without redeploying unchanged products',
  !workflow.includes("- 'hq/**'")
  && !workflow.includes('tools/verify_hq_contract.mjs')
  && ciWorkflow.includes("- 'hq/**'")
  && ciWorkflow.includes("- 'tools/verify_hq_contract.mjs'"))
requireContract('all API tests trigger review and execute before manual release',
  [ciWorkflow, appWorkflow].every((source) => source.includes("- 'tests/**'"))
  && workflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v"))
requireContract('runtime package changes trigger non-mutating review', [ciWorkflow, appWorkflow].every((source) => source.includes("- 'supermega_runtime/**'")))
requireContract('database activation controls trigger non-mutating review',
  [ciWorkflow, appWorkflow].every((source) => source.includes('tools/validate_supermega_database_url.py') && source.includes('tools/activate_supermega_database.ps1')))
requireContract('rehearsal packet changes trigger both reviews and keep operator files ignored',
  [ciWorkflow, appWorkflow].every((source) =>
    source.includes('tools/prepare_supabase_rehearsal_packet.mjs')
    && source.includes('tools/prepare_supabase_rehearsal_packet.test.mjs'))
  && appWorkflow.includes("- '.gitignore'")
  && appWorkflow.includes("- '.github/workflows/showroom-ci.yml'")
  && /^\.tmp\/$/m.test(gitIgnore))
requireContract('PostgreSQL 17 rehearsal changes trigger every non-mutating database review',
  [ciWorkflow, appWorkflow].every((source) =>
    source.includes('tools/rehearse_supermega_postgres17.py')
    && source.includes('tools/run_postgres17_rehearsal.mjs')))
requireContract('migration proof changes trigger every database-aware workflow',
  [workflow, ciWorkflow, appWorkflow].every((source) => source.includes('tools/verify_private_trial_migrations.mjs') && source.includes('package-lock.json')))
requireContract('real migration proof precedes every production candidate',
  workflow.includes('npm ci --ignore-scripts')
  && workflow.includes('node tools/verify_private_trial_migrations.mjs')
  && workflow.indexOf('node tools/verify_private_trial_migrations.mjs') < workflow.indexOf('Deploy isolated app production candidate')
  && workflow.indexOf('node tools/verify_private_trial_migrations.mjs') < workflow.indexOf('Deploy isolated production candidate')
  && ciWorkflow.includes('node tools/verify_private_trial_migrations.mjs')
  && appWorkflow.includes('node tools/verify_private_trial_migrations.mjs')
  && migrationVerifier.includes("from '@electric-sql/pglite'")
  && migrationVerifier.includes('unsafe role rejected before foundation grants')
  && migrationVerifier.includes('hosted_postgres_17_proof_required: true'))
requireContract('app guard remains non-mutating but runs API tests', appWorkflow.includes("- 'supermega_runtime/**'") && appWorkflow.includes("python -m unittest discover -s tests -p 'test_*.py' -v") && !/vercel@56\.1\.0\s+(?:deploy|promote|rollback)\b/.test(appWorkflow) && !appWorkflow.includes('VERCEL_TOKEN') && !/environment:\s*production/.test(appWorkflow))
requireContract('protected app candidate verification', workflow.includes("VERCEL_PROTECTED_PREVIEW: '1'") && appVerifier.includes("'curl', path, '--deployment'") && appVerifier.includes('deploymentFunctions') && appVerifier.includes("JSON.stringify(['api/app'])") && appVerifier.includes('hosted_agent_runtime_contract_wrong'))
requireContract('current app asset contract gates local build and protected candidate',
  packageJson.scripts['app:build:checked'] === 'npm run app:build && npm run app:verify && node tools/verify_app_release_live.mjs --artifact-self-test'
  && workflow.includes('Verify immutable app asset contract')
  && workflow.includes('node tools/verify_app_release_live.mjs --artifact-self-test')
  && workflow.indexOf('Verify immutable app asset contract') < workflow.indexOf('Deploy isolated app production candidate')
  && appVerifier.includes("contract: 'supermega.current-release-assets.v1'")
  && appVerifier.includes("const legacyCopyAudit = process.env.SUPERMEGA_LEGACY_COPY_AUDIT === '1'")
  && appVerifier.includes('releaseAssetVerification = verifyCurrentReleaseAssets({'))
requireContract('app live identity validates brand context and catalog', appVerifier.includes('release.brandVersion !== manifest.brand.version') && appVerifier.includes('release.contextVersion !== manifest.contextVersion') && appVerifier.includes('release.catalogVersion !== manifest.catalogVersion'))
requireContract('operators can verify the exact checked-out release',
  packageJson.scripts['app:verify:live:current'] === 'node tools/verify_app_release_live.mjs --current-head'
  && packageJson.scripts['public:verify:live:current'] === 'node tools/verify_public_release_live.mjs --current-head'
  && appVerifier.includes("verificationScope = expectedCommit ? 'exact_release' : 'availability_and_contract'")
  && publicVerifier.includes("verificationScope = expectedCommit ? 'exact_release' : 'availability_and_contract'")
  && appVerifier.includes("reason: 'release_commit_mismatch'")
  && appVerifier.includes("execFileSync('git', ['rev-parse', 'HEAD']")
  && publicVerifier.includes("execFileSync('git', ['rev-parse', 'HEAD']"))
requireContract('isolated candidates exist for both domains', (workflow.match(/deploy --prebuilt --prod --skip-domain --yes/g) || []).length === 2 && workflow.includes('Deploy isolated app production candidate') && workflow.includes('Deploy isolated production candidate'))
requireContract('candidate identity barrier is protected', workflow.includes('Verify candidate release identity barrier') && workflow.includes('APP_BASE_URL: ${{ steps.deploy-app.outputs.url }}') && workflow.includes('PUBLIC_BASE_URL: ${{ steps.deploy.outputs.url }}') && releaseBarrier.includes('protected_preview_token_required'))
requireContract('candidate identity barrier selects each Vercel project', releaseBarrier.includes('APP_VERCEL_PROJECT_ID') && releaseBarrier.includes('PUBLIC_VERCEL_PROJECT_ID') && releaseBarrier.includes('VERCEL_PROJECT_ID: projectId') && releaseBarrier.includes("'--deployment', baseUrl, '--yes'"))
requireContract('public project switch clears app build and environment state', workflow.includes('rm -rf -- .vercel') && workflow.indexOf('rm -rf -- .vercel') < workflow.indexOf('npm run public:prebuilt'))
requireContract('cross-domain barrier validates complete release identity', releaseBarrier.includes("identityFields = ['commit', 'brandVersion', 'contextVersion', 'catalogVersion']") && releaseBarrier.includes('cross_domain_release_identity_mismatch') && releaseBarrier.includes('release_manifest_identity_mismatch'))
requireContract('release barrier fixtures pass', releaseBarrierSelfTest.status === 0 && releaseBarrierSelfTest.stdout.includes('"ok": true') && releaseBarrierSelfTest.stdout.includes('reject_catalog_drift'))
requireContract('app release evidence fixtures pass', appVerifierSelfTest.status === 0 && appVerifierSelfTest.stdout.includes('"ok": true') && appVerifierSelfTest.stdout.includes('supermega_app_live_evidence_extractor.v1'))
requireContract('cross-platform protected deployment requests', !appVerifier.includes("'--silent'") && !appVerifier.includes("'--show-error'") && !appVerifier.includes("'--location'") && !appVerifier.includes("'--token'") && appVerifier.includes('describeCliFailure'))
requireContract('both project controls are verified', workflow.includes('verify_vercel_project_state.mjs app') && workflow.includes('verify_vercel_project_state.mjs public') && workflow.includes('verify_vercel_domain_state.mjs app') && workflow.includes('verify_vercel_domain_state.mjs public') && workflow.includes('verify_vercel_environment_state.mjs app') && workflow.includes('verify_vercel_environment_state.mjs public'))
requireContract('canonical domains are reasserted before domain verification',
  workflow.includes('Reassert canonical app domain ownership')
  && workflow.includes('vercel@56.1.0 domains add app.supermega.dev megaos --force --token="$VERCEL_TOKEN"')
  && workflow.includes('Reassert canonical public domain ownership')
  && workflow.includes('vercel@56.1.0 domains add supermega.dev supermega-public --force --token="$VERCEL_TOKEN"')
  && workflow.includes('vercel@56.1.0 domains add www.supermega.dev supermega-public --force --token="$VERCEL_TOKEN"')
  && workflow.indexOf('Reassert canonical app domain ownership') < workflow.indexOf('verify_vercel_domain_state.mjs app')
  && workflow.indexOf('Reassert canonical public domain ownership') < workflow.indexOf('verify_vercel_domain_state.mjs public'))
requireContract('retired POS alias blocks release before and after promotion', (workflow.match(/api "\/v4\/aliases\?domain=pos\.supermega\.dev&teamId=\$VERCEL_ORG_ID"/g) || []).length === 2
  && (workflow.match(/verify_retired_vercel_alias_state\.mjs pos\.supermega\.dev/g) || []).length === 2
  && retiredAliasVerifier.includes("failures = liveRetiredAliases.length ? ['retired_alias_still_live'] : []")
  && retiredAliasVerifier.includes("contract: 'supermega_retired_vercel_alias_state'"))
requireContract('all control URLs use explicit project identities', workflow.includes('api "/v9/projects/$APP_VERCEL_PROJECT_ID"') && workflow.includes('/v9/projects/$APP_VERCEL_PROJECT_ID/domains?teamId=$VERCEL_ORG_ID') && workflow.includes('/v10/projects/$APP_VERCEL_PROJECT_ID/env?teamId=$VERCEL_ORG_ID') && workflow.includes('api "/v9/projects/$PUBLIC_VERCEL_PROJECT_ID"') && workflow.includes('/v9/projects/$PUBLIC_VERCEL_PROJECT_ID/domains?teamId=$VERCEL_ORG_ID') && workflow.includes('/v10/projects/$PUBLIC_VERCEL_PROJECT_ID/env?teamId=$VERCEL_ORG_ID') && workflow.includes('projectId=$PUBLIC_VERCEL_PROJECT_ID&teamId=$VERCEL_ORG_ID') && !workflow.includes('/v9/projects/megaos') && !workflow.includes('/v9/projects/supermega-public'))
requireContract('managed mode is selected only after metadata and effective-value verification', workflow.includes('id: app-environment') && workflow.includes("operating_mode=%s") && workflow.includes("runtime_mode=%s") && workflow.includes("['isolated_demo','managed_trial_candidate']") && workflow.includes('verify_managed_runtime_environment_values.mjs managed_trial') && workflow.includes('verify_managed_runtime_environment_values.mjs staged') && workflow.includes('verify_managed_runtime_environment_values.mjs isolated_demo'))
requireContract('immutable app build inherits the exact audited production environment', workflow.includes('Build the immutable app artifact') && workflow.includes('vercel@56.1.0 env run --environment=production') && workflow.includes('npx --yes vercel@56.1.0 build --prod --yes'))
requireContract('managed database audit uses the exact app runtime environment before candidate creation',
  workflow.includes('Enforce exact app runtime database and RLS gate')
  && workflow.includes('VERCEL_PROJECT_ID: ${{ env.APP_VERCEL_PROJECT_ID }}')
  && workflow.includes('vercel@56.1.0 env run --environment=production')
  && workflow.includes('python tools/validate_supermega_database_url.py --env-key SUPERMEGA_DATABASE_URL --ensure-schema')
  && workflow.includes('python tools/validate_supermega_database_url.py --env-key SUPERMEGA_DATABASE_URL --ensure-schema --require-ready')
  && workflow.includes('EXPECTED_OPERATING_MODE: ${{ steps.app-environment.outputs.operating_mode }}')
  && appVerifier.includes('selected_operating_mode_runtime_mismatch')
  && workflow.includes('Operating mode selection is missing or invalid')
  && !workflow.includes('SUPERMEGA_DATABASE_URL: ${{ secrets.SUPERMEGA_DATABASE_URL }}')
  && workflow.indexOf('Enforce exact app runtime database and RLS gate') < workflow.indexOf('Deploy isolated app production candidate')
  && workflow.indexOf('Enforce exact app runtime database and RLS gate') < workflow.indexOf('Deploy isolated production candidate'))
requireContract('RLS and trigger validator rejects semantic bypasses',
  !databaseValidator.includes('def _contains_tokens')
  && databaseValidator.includes('def _policy_expression_matches')
  && databaseValidator.includes('EXPECTED_POLICY_FINGERPRINTS')
  && databaseValidator.includes('reject_dead_case_wrapper')
  && databaseValidator.includes('reject_weakened_status')
  && databaseValidator.includes('reject_inverted_identity_predicates')
  && databaseValidator.includes('reject_swapped_identity_settings')
  && databaseValidator.includes('security_constraints_exact')
  && databaseValidator.includes('backend_acl_scope_exact')
  && databaseValidator.includes('no_when_clause')
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
requireContract('kernel native Git deployment is disabled', kernelConfig.git?.deploymentEnabled === false)
requireContract('kernel release is manual current-main and environment gated',
  kernelWorkflow.includes("github.event_name == 'workflow_dispatch'")
  && kernelWorkflow.includes("github.ref == 'refs/heads/main'")
  && kernelWorkflow.includes("github.repository == 'swanhtet01/swanhtet01.github.io'")
  && kernelWorkflow.includes('environment: kernel-production')
  && kernelWorkflow.includes('RELEASE KERNEL $ACTUAL_SHA')
  && kernelWorkflow.includes('git rev-parse origin/main'))
requireContract('kernel release promotes one exact isolated artifact',
  (kernelWorkflow.match(/vercel@56\.1\.0 deploy --prebuilt --prod --skip-domain --yes/g) || []).length === 1
  && (kernelWorkflow.match(/vercel@56\.1\.0 promote "\$CANDIDATE_URL"/g) || []).length === 1
  && kernelWorkflow.includes('vercel@56.1.0 curl /api/status --deployment "$CANDIDATE_URL"')
  && kernelWorkflow.indexOf('Reconfirm current main before promotion') < kernelWorkflow.indexOf('Promote the exact verified candidate')
  && !kernelWorkflow.includes('npx vercel deploy --prod -y'))
requireContract('kernel failed production verification restores the exact prior alias',
  kernelWorkflow.includes("failure() && steps.promote.outputs.attempted == 'true'")
  && kernelWorkflow.includes('resolve_vercel_rollback_target.mjs deployment "$PREVIOUS_URL" "$PREVIOUS_ID"')
  && kernelWorkflow.includes('vercel@56.1.0 rollback "$PREVIOUS_URL" --yes')
  && kernelWorkflow.includes('[ "$RESTORED_URL" != "$PREVIOUS_URL" ]'))
requireContract('production environment gate', /environment:\s*production/.test(workflow))
requireContract('production is main-only in the canonical repository', workflow.includes("if: ${{ github.ref == 'refs/heads/main' && github.repository == 'swanhtet01/swanhtet01.github.io' }}"))
requireContract('production release requires an exact manual owner instruction before checkout or credentials',
  workflow.includes('workflow_dispatch:')
  && workflow.includes('release_commit:')
  && workflow.includes('confirmation:')
  && workflow.includes('REQUESTED_RELEASE_COMMIT: ${{ inputs.release_commit }}')
  && workflow.includes('RELEASE_CONFIRMATION: ${{ inputs.confirmation }}')
  && workflow.includes('RELEASE_ACTOR: ${{ github.actor }}')
  && workflow.includes('[ "$REQUESTED_RELEASE_COMMIT" != "$GITHUB_SHA" ]')
  && workflow.includes('[ "$RELEASE_CONFIRMATION" != "DEPLOY SUPERMEGA PAIRED PRODUCTION" ]')
  && workflow.includes('[ "$RELEASE_ACTOR" != "swanhtet01" ]')
  && workflow.indexOf('Require exact owner release instruction') < workflow.indexOf('Checkout the release commit')
  && workflow.indexOf('Require exact owner release instruction') < workflow.indexOf('Require production deploy credential')
  && !/^\s*push:/m.test(workflow))
requireContract('deployment metadata uses the guarded runtime ref', (workflow.match(/githubCommitRef=\$\{\{ github\.ref_name \}\}/g) || []).length === 2 && !workflow.includes('githubCommitRef=main'))
const coreWorkflowActions = `${workflow}\n${appWorkflow}\n${ciWorkflow}\n${publicHealthWorkflow}\n${kernelWorkflow}`
requireContract('core actions are commit-pinned', !/uses:\s+[^\s#]+@v\d+/m.test(coreWorkflowActions) && /uses:\s+actions\/checkout@[0-9a-f]{40}/.test(workflow))
requireContract('core workflows use Node 24 action revisions',
  (coreWorkflowActions.match(/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g) || []).length === 6
  && (coreWorkflowActions.match(/actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/g) || []).length === 6
  && (coreWorkflowActions.match(/actions\/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97/g) || []).length === 3
  && !/(?:11d5960a326750d5838078e36cf38b85af677262|49933ea5288caeca8642d1e84afbd3f7d6820020|a26af69be951a213d495a4c3e4e4022e16d87065)/.test(coreWorkflowActions))
requireContract('coordinated release caches python verifier dependencies',
  workflow.includes("cache: 'pip'")
  && workflow.includes('cache-dependency-path: requirements-test.txt')
  && workflow.indexOf("cache: 'pip'") < workflow.indexOf('python -m pip install --disable-pip-version-check -r requirements-test.txt'))
requireContract('uv build tool is immutable', workflow.includes('astral-sh/setup-uv@c771a70e6277c0a99b617c7a806ffedaca235ff9') && workflow.includes("version: '0.11.30'"))
requireContract('stale Cloud Run release authority is retired', !existsSync(resolve(root, '.github/workflows/supermega-app-cloud-run.yml')))
requireContract('orphan enterprise and free-mode gates are retired',
  !existsSync(resolve(root, '.github/workflows/supermega-enterprise-gate.yml'))
  && !existsSync(resolve(root, 'tools/smoke_free_mode_health.mjs'))
  && ![workflow, appWorkflow, ciWorkflow].some((source) => source.includes('SuperMega App Build and Deploy')))
requireContract('unlinked preview deployment is retired',
  previewServer.includes('PREVIEW_DEPLOY_MODE = "canonical_preview"')
  && previewServer.includes('CANONICAL_VERCEL_TEAM_ID = "team_wI4l7ZgSxcEztQPSlCCYVeJ5"')
  && previewServer.includes('CANONICAL_APP_VERCEL_PROJECT_ID = "prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG"')
  && previewServer.includes('_require_canonical_preview_deploy_target()')
  && previewServer.includes('vercel@56.1.0')
  && !previewServer.includes('deploy_claimable_preview.sh')
  && !previewServer.includes('claimable_preview')
  && [previewLauncher, retiredClaimableLauncher].every((source) =>
    source.includes('Retired:')
    && source.includes('exit 78')
    && !source.includes('codex-deploy-skills.vercel.sh')
    && !source.includes('curl ')))
requireContract('preview release review is exact and server-owned',
  previewServer.includes('PREVIEW_RELEASE_REVIEW_CONTRACT = "supermega.preview-release-review.v1"')
  && previewServer.includes('PREVIEW_RELEASE_REVIEW_SOURCE = "system:preview_release_review"')
  && previewServer.includes('@app.post("/api/cloud/deployments/preview/reviews")')
  && previewServer.includes('def _build_preview_release_review_packet(')
  && previewServer.includes('def _validate_preview_release_review_packet(')
  && previewServer.includes('def _find_reusable_preview_release_review(')
  && previewServer.includes('"status": "human_review_required"')
  && previewServer.includes('"strategy": "discard_preview"')
  && previewServer.includes('"production_alias_mutation": False')
  && previewServer.includes('with preview_release_review_lock:')
  && previewServer.indexOf('_validate_preview_deploy_approval(') < previewServer.indexOf('_run_preview_deploy(payload.mode, revision=approved_revision)'))
requireContract('canonical preview deploys one pinned prebuilt artifact',
  previewServer.includes('deploy_environment["SUPERMEGA_RELEASE_COMMIT"] = normalized_revision')
  && previewServer.includes('["pull", "--yes", "--environment=preview"]')
  && previewServer.includes('["build", "--yes"]')
  && previewServer.includes('"--prebuilt"')
  && previewServer.includes('f"githubCommitSha={normalized_revision}"')
  && previewServer.includes('_require_canonical_preview_deploy_target()')
  && previewServer.includes('prebuilt_config.is_file()')
  && previewServer.includes('"prebuilt": True')
  && previewServer.includes('_run_preview_deploy(payload.mode, revision=approved_revision)')
  && !previewServer.includes('"--prod"')
  && !previewServer.includes('"--token"')
  && !previewServer.includes('"urls": urls')
  && previewServer.indexOf('["pull", "--yes", "--environment=preview"]') < previewServer.indexOf('["build", "--yes"]')
  && previewServer.indexOf('["build", "--yes"]') < previewServer.indexOf('"deploy",\n                "--prebuilt"'))

const normalizeCrons = (crons) => (crons || [])
  .map(({ path, schedule }) => ({ path, schedule }))
  .sort((left, right) => left.path.localeCompare(right.path))
const expectedCrons = normalizeCrons(schedulerAuthority.crons)
const actualCrons = normalizeCrons(config.crons)
requireContract('single production scheduler authority',
  schedulerAuthority.contract === 'supermega.scheduler-authority.v2'
  && schedulerAuthority.authority === 'vercel'
  && schedulerAuthority.environment === 'production'
  && schedulerAuthority.project_id === 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG'
  && schedulerAuthority.activation?.state === 'dormant'
  && schedulerAuthority.activation?.runtime_environment_key === 'SUPERMEGA_HOSTED_SCHEDULER_ENABLED'
  && schedulerAuthority.activation?.enabled_value === '1'
  && schedulerAuthority.activation?.required_evidence?.length === 5
  && schedulerAuthority.crons?.length === 0
  && schedulerAuthority.maximum_scheduler_invocations_per_day === 0
  && schedulerExecutionBudget.maxClaimsPerInvocation === 1
  && schedulerExecutionBudget.maximumActivationInvocationsPerDay === 25
  && schedulerAuthority.activation_plan?.maximum_scheduler_invocations_per_day === 25
  && JSON.stringify(normalizeCrons(schedulerAuthority.activation_plan?.crons)) === JSON.stringify(normalizeCrons([
    { path: '/api/cron/supermega/agent-queue', schedule: '5 * * * *' },
    { path: '/api/cron/supermega/daily', schedule: '45 0 * * *' },
  ]))
  && JSON.stringify(normalizeCrons(schedulerAuthority.migration?.preflight_retiring_crons)) === JSON.stringify(normalizeCrons([
    { path: '/api/cron/supermega/agent-queue', schedule: '*/15 * * * *' },
    { path: '/api/cron/supermega/daily', schedule: '45 0 * * *' },
  ]))
  && schedulerAuthority.migration?.post_deploy_retiring_crons_allowed === false
  && schedulerAuthority.worker_dispatch?.mode === 'enqueue-on-demand'
  && schedulerAuthority.worker_dispatch?.polling_allowed === false
  && schedulerAuthority.retired_authority?.provider === 'google-cloud-scheduler'
  && schedulerAuthority.retired_authority?.mutation_allowed === false)
requireContract('canonical cron path and cadence contract', JSON.stringify(actualCrons) === JSON.stringify(expectedCrons))
requireContract('company automation events stay tenant-scoped and off YTF connectors',
  agentConnectorMap.startsWith('AGENT_JOB_CONNECTOR_MAP:')
  && agentConnectorMap.includes('"core-agent-operations"')
  && agentConnectorMap.includes('"core-github-build"')
  && !agentConnectorMap.includes('"ytf-')
  && previewServer.includes('def _scope_connector_catalog(')
  && previewServer.includes('connectors = _scope_connector_catalog(connectors, expected_tenant_key)')
  && previewServer.indexOf('connectors = _scope_connector_catalog(connectors, expected_tenant_key)') < previewServer.indexOf('connector_lookup = {'))
requireContract('Vercel config is generated from scheduler authority',
  generator.includes("readFileSync('tools/supermega_scheduler_authority.json'")
  && generator.includes('validateSchedulerExecutionBudget(schedulerAuthority)')
  && generator.includes('const canonicalCrons = schedulerAuthority.crons.map')
  && generator.includes("schedulerAuthority.activation?.state !== 'dormant'")
  && generator.includes('schedulerAuthority.activation_plan?.maximum_scheduler_invocations_per_day !== 25')
  && packageJson.scripts?.['vercel:contracts:test']?.includes('scheduler_authority_contract.test.mjs')
  && packageJson.scripts?.['vercel:contracts:test']?.includes('write_app_vercel_config.test.mjs'))
requireContract('public live health follows the canonical release workflow',
  publicHealthWorkflow.includes('SuperMega - Coordinated Verified Release')
  && !publicHealthWorkflow.includes('SuperMega Public - Verified Prebuilt Release'))
requireContract('scheduler authority changes trigger every non-mutating review gate',
  [appWorkflow, ciWorkflow].every((source) =>
    source.includes('tools/supermega_scheduler_authority.json')
    && source.includes('tools/verify_vercel_project_state.mjs')
    && source.includes('tools/test_vercel_project_state.mjs')))

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
