import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const verifyCurrentHead = process.argv.includes('--current-head')
const selfTest = process.argv.includes('--self-test')
const artifactSelfTest = process.argv.includes('--artifact-self-test')
const configuredExpectedCommit = String(process.env.EXPECTED_RELEASE_COMMIT || '').trim().toLowerCase()

export function extractTrialEvidenceVersion(value) {
  const match = /contract\s*:\s*['"]supermega_trial_evidence['"][\s\S]{0,160}?\bversion\s*:\s*(\d+)/.exec(String(value || ''))
  return Number(match?.[1])
}

export function verifyCurrentReleaseAssets({
  manifest,
  assetCorpus,
  operationsChunk,
  productSystemNavigatorChunk,
  productOnboardingChunk,
  settingsChunk,
  ecommerceProductCorpus,
  websiteChunk,
  clientDataOnboardingChunk,
  managedLoginChunk,
  managedAccountChunk,
  companyBackupCorpus,
  activationRunbookChunk,
}) {
  const groups = [
    ['launcher', assetCorpus, ['SUPERMEGA', 'Switch product', 'Each product opens as its own working sample. Setup is optional when you are ready to use your business data.', 'supermega.last-product.v1', 'Sell and manage stock', 'Run production', 'Publish your business', 'Take online orders', 'Counter sales, inventory, orders, and daily close.', 'Jobs, materials, output, quality, and traceability.', 'Pages, services, inquiries, and launch preview.', 'Storefront, checkout, delivery, and Shop handoff.', 'Your product workspaces stay separate. Opening a sample does not change another product.', 'Open', manifest.brand.colors.accent, manifest.brand.colors.ink]],
    ['guided_outcomes', productOnboardingChunk, ['Complete a sample sale', 'Create Shop and start selling', 'Run a sample production job', 'Create Plant and open the job', 'Preview a business website', 'Create Website and preview it', 'Open a working online store', 'Create Ecommerce and open the store']],
    ['onboarding', productOnboardingChunk, ['Make ', ' yours', 'One step', 'Name your workspace', 'We will add realistic sample records now; replace them with your data whenever you are ready.', 'First useful result:', 'Creates local sample records, then opens the first task.', 'Enter a business name to continue.', 'This setup affects', 'Opening it will not run setup again.', 'Nothing is sent or published.', 'Need help bringing real data?', 'Ask SuperMega to set up ', 'product_requested']],
    ['shop_plant', operationsChunk, ['Create order', 'Finish payment and handoff in Orders.', 'Stock reserved. Finish fulfilment and reconcile payment before completion.', 'Jobs', 'Problems', 'Record output', 'Close shift', 'Browser-local sample only.', 'No payment is captured']],
    ['secondary_tools', productSystemNavigatorChunk, ['Next steps', 'More workflows or your data', 'Keep working in ', 'Choose another working flow, use your data, or make this sample yours.', 'Make ', ' mine', 'Your data', 'Upload a CSV or try a sample.', 'Use my Shop data', 'Use my Plant data', 'Use my website content', 'Use my store data', 'Only ', 'next_steps_opened', 'data_setup_opened']],
    ['settings', settingsChunk, ['supermega_trial_evidence', 'Premium company learning', 'Advanced controls', 'Save, export, restore, or reset.', 'Export full evidence', 'Selected product only', 'activation journey', 'Shows where this browser stopped between next steps, own data, and a product request.']],
    ['activation_learning', assetCorpus, ['supermega.product_activation_funnel.v1']],
    ['website', websiteChunk, ['Make this website yours', 'Download site', 'Website starter brief generated', 'Not online yet', 'Edit sample', 'Edit page', 'Mingalar Fresh Mart', 'Fresh everyday groceries without the extra trip.', 'Stock the week in one simple order.', 'Tell us what you need today.']],
    ['ecommerce', ecommerceProductCorpus, ['Extra order tools', 'Preview verification', 'Review an order batch', 'Upload CSV or paste channel orders only when needed.', 'Payment and customer messages stay locked.', 'Shop review', 'supermega.ecommerce.order_import_review_packet.v1']],
    ['data_onboarding', clientDataOnboardingChunk, ['Start with a CSV or sample so SuperMega can map columns and inspect rows locally.', 'No customer message, payment, website publish, or automation runs from this check.']],
    ['company_login', managedLoginChunk, ['Open your company.', 'Try free demo', 'Request company account']],
    ['account_recovery', managedAccountChunk, ['Recover your account.', 'Secure your account.', 'Save password and continue']],
    ['company_backup', companyBackupCorpus, ['supermega.company_backup.v1', 'Customer-owned and encrypted', 'Download encrypted backup', 'Auth sessions, company account IDs, and credentials are excluded.']],
    ['activation', activationRunbookChunk, ['Evidence to go live', 'proof gates ready']],
  ]
  let checks = 0
  for (const [group, corpus, requiredValues] of groups) {
    for (const required of requiredValues) {
      checks += 1
      if (!corpus.includes(required)) throw new Error(`missing_current_release_asset:${group}:${required}`)
    }
  }
  for (const forbidden of ['Complete sale', 'Stock updated. Receipt saved.']) {
    checks += 1
    if (operationsChunk.includes(forbidden)) throw new Error(`misleading_shop_release_asset:${forbidden}`)
  }
  for (const forbidden of ['Start with one product.', 'Company workspace readiness', 'Choose one product when its demo makes sense', 'Prepare one product at a time.', 'Samples open immediately with no account or setup.']) {
    checks += 1
    if (assetCorpus.includes(forbidden)) throw new Error(`retired_launcher_release_asset:${forbidden}`)
  }
  for (const forbidden of ['Workflows and setup', 'Choose another task.', 'Set up ', 'Setup and imports']) {
    checks += 1
    if (productSystemNavigatorChunk.includes(forbidden)) throw new Error(`retired_secondary_tools_release_asset:${forbidden}`)
  }
  for (const forbidden of ['Use Plant in 3 steps.', 'Choose a job, record output, then fix blockers.', 'Plant guided jobs']) {
    checks += 1
    if (operationsChunk.includes(forbidden)) throw new Error(`redundant_plant_release_asset:${forbidden}`)
  }
  for (const forbidden of ['Turn accountable work into visible progress.', 'Focused workspaces for the work that matters.', 'Bring one real workflow.']) {
    checks += 1
    if (websiteChunk.includes(forbidden)) throw new Error(`generic_website_sample_release_asset:${forbidden}`)
  }
  const completeCorpus = groups.map(([, corpus]) => corpus).join('\n')
  for (const forbidden of ['pos.supermega.dev', 'ytf.supermega.dev', 'Yangon Tyre', 'ytf-plant-a']) {
    checks += 1
    if (completeCorpus.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`retired_current_release_asset:${forbidden}`)
  }
  return { contract: 'supermega.current-release-assets.v1', checks, groups: groups.length }
}

async function readArtifactChunk(assetsDir, assetNames, pattern) {
  const name = assetNames.find((candidate) => pattern.test(candidate))
  if (!name) throw new Error(`artifact_chunk_missing:${pattern.source}`)
  return readFile(join(assetsDir, name), 'utf8')
}

export function extractRelativeJavascriptDependencies(value) {
  return [...new Set([...String(value || '').matchAll(/(?:from|import)\s*["']\.\/([A-Za-z0-9_-]+\.js)["']/g)].map((match) => match[1]))]
}

async function readOptionalArtifactChunk(assetsDir, assetNames, pattern) {
  const name = assetNames.find((candidate) => pattern.test(candidate))
  return name ? readFile(join(assetsDir, name), 'utf8') : ''
}

if (artifactSelfTest) {
  const root = resolve(import.meta.dirname, '..')
  const distDir = resolve(root, 'showroom', 'dist')
  const assetsDir = resolve(distDir, 'assets')
  const [rootHtml, artifactManifest, assetNames] = await Promise.all([
    readFile(resolve(distDir, 'index.html'), 'utf8'),
    readFile(resolve(root, 'site-manifest.json'), 'utf8').then(JSON.parse),
    readdir(assetsDir),
  ])
  // The third pattern is load-bearing. The stylesheet is no longer a render-blocking <link>:
  // showroom/vite.config.ts rewrites it to `<script src="/css-async.js" data-href="...">` so
  // first paint stops waiting on 230KB (FCP 3,236ms -> 1,492ms, measured). Without the
  // data-href match the CSS never enters assetCorpus and every value that lives only in the
  // stylesheet -- the brand accent among them -- silently stops being checked. CI caught
  // exactly that as missing_current_release_asset:launcher:#0b745e, which is the good outcome;
  // the bad one is a corpus that quietly shrinks and keeps passing.
  const rootAssetPaths = [
    ...rootHtml.matchAll(/<script[^>]+src="([^"]+)"/g),
    ...rootHtml.matchAll(/<link[^>]+href="([^"]+\.(?:js|css))"/g),
    ...rootHtml.matchAll(/<script[^>]+src="\/css-async\.js"[^>]+data-href="([^"]+)"/g),
  ].map((match) => match[1].replace(/^\//, ''))
  const assetCorpus = (await Promise.all(rootAssetPaths.map((path) => readFile(resolve(distDir, path), 'utf8')))).join('\n')
  if (assetNames.some((name) => /^ProductHomeReadiness-[A-Za-z0-9_-]+\.js$/.test(name))) {
    throw new Error('retired_product_home_readiness_chunk_present')
  }
  const [
    operationsChunk,
    productSystemNavigatorChunk,
    productOnboardingChunk,
    settingsChunk,
    ecommerceChunk,
    ecommercePacketChunk,
    websiteChunk,
    websiteModelChunk,
    clientDataOnboardingChunk,
    managedLoginChunk,
    managedAccountChunk,
    companyBackupChunk,
    activationRunbookChunk,
  ] = await Promise.all([
    readArtifactChunk(assetsDir, assetNames, /^(?:CoreApp|core-app)-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^ProductSystemNavigator-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^ProductOnboardingPage-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^SettingsPage-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^EcommerceProduct-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^ecommerce-order-review-packet-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^WebsiteProduct-[A-Za-z0-9_-]+\.js$/),
    readOptionalArtifactChunk(assetsDir, assetNames, /^website-model-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^ClientDataOnboarding-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^ManagedLoginPage-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^ManagedAccountPage-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^CompanyBackupPanel-[A-Za-z0-9_-]+\.js$/),
    readArtifactChunk(assetsDir, assetNames, /^ManagedActivationRunbook-[A-Za-z0-9_-]+\.js$/),
  ])
  const evidenceVersion = extractTrialEvidenceVersion(settingsChunk)
  if (!Number.isInteger(evidenceVersion)) throw new Error('artifact_settings_evidence_version_missing')
  const websiteDependencyCorpus = (await Promise.all(
    extractRelativeJavascriptDependencies(websiteChunk).map((name) => readFile(join(assetsDir, name), 'utf8')),
  )).join('\n')
  const result = verifyCurrentReleaseAssets({
    manifest: artifactManifest,
    assetCorpus,
    operationsChunk,
    productSystemNavigatorChunk,
    productOnboardingChunk,
    settingsChunk,
    ecommerceProductCorpus: `${ecommerceChunk}\n${ecommercePacketChunk}`,
    websiteChunk: `${websiteChunk}\n${websiteModelChunk}\n${websiteDependencyCorpus}`,
    clientDataOnboardingChunk,
    managedLoginChunk,
    managedAccountChunk,
    companyBackupCorpus: `${settingsChunk}\n${companyBackupChunk}`,
    activationRunbookChunk,
  })
  console.log(JSON.stringify({ ok: true, ...result, evidenceVersion }, null, 2))
  process.exit(0)
}

if (selfTest) {
  const fixtures = [
    ["const evidence = { contract: 'supermega_trial_evidence', version: 24, environment: 'isolated_demo' }", 24],
    ['r.contract!=="supermega_trial_evidence";const href=JSON.stringify({contract:"supermega_trial_evidence",version:24,environment:"isolated_demo"})', 24],
  ]
  for (const [source, expected] of fixtures) {
    if (extractTrialEvidenceVersion(source) !== expected) throw new Error('trial_evidence_version_fixture_rejected')
  }
  const invalidFixtures = [
    'r.contract!=="supermega_trial_evidence"',
    '{contract:"supermega_trial_evidence",version:"24"}',
  ]
  for (const source of invalidFixtures) {
    if (Number.isInteger(extractTrialEvidenceVersion(source))) throw new Error('invalid_trial_evidence_version_fixture_accepted')
  }
  console.log(JSON.stringify({
    ok: true,
    contract: 'supermega_app_live_evidence_extractor.v1',
    checks: fixtures.length + invalidFixtures.length,
  }, null, 2))
  process.exit(0)
}

function readCurrentHead() {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim().toLowerCase()
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('invalid_commit')
    return commit
  } catch {
    throw new Error('current_head_commit_unavailable')
  }
}

const currentHeadCommit = verifyCurrentHead ? readCurrentHead() : ''
if (configuredExpectedCommit && currentHeadCommit && configuredExpectedCommit !== currentHeadCommit) {
  throw new Error('configured_expected_commit_differs_from_current_head')
}
const expectedCommit = configuredExpectedCommit || currentHeadCommit
const verificationScope = expectedCommit ? 'exact_release' : 'availability_and_contract'
const manifest = JSON.parse(await readFile(new URL('../site-manifest.json', import.meta.url), 'utf8'))
const settingsSource = await readFile(new URL('../showroom/src/core/SettingsPage.tsx', import.meta.url), 'utf8')
const localEvidenceVersion = extractTrialEvidenceVersion(settingsSource)
if (!Number.isInteger(localEvidenceVersion)) throw new Error('local_settings_evidence_version_missing')
const baseUrl = String(process.env.APP_BASE_URL || 'https://app.supermega.dev').replace(/\/$/, '')
const protectedPreview = process.env.VERCEL_PROTECTED_PREVIEW === '1'
const vercelToken = String(process.env.VERCEL_TOKEN || '').trim()
const cliEnv = vercelToken ? { ...process.env, VERCEL_TOKEN: vercelToken } : process.env
const canonicalProductRoutes = ['/shop/', '/plant/', '/website/', '/ecommerce/']
const routes = ['/', '/work/', '/operations/', ...canonicalProductRoutes, '/operations/commerce/', '/operations/production/', '/products/website/', '/products/ecommerce/', '/agents/', '/settings/']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function describeCliFailure(error) {
  const status = Number.isInteger(error?.status) ? error.status : 'unknown'
  let stderr = String(error?.stderr || '').trim()
  if (vercelToken) stderr = stderr.replaceAll(vercelToken, '[redacted]')
  stderr = stderr.replace(/([?&](?:token|secret|key)=)[^&\s]+/gi, '$1[redacted]')
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-3)
  return `exit=${status}${lines.length ? ` message=${lines.join(' | ').slice(0, 480)}` : ''}`
}

async function get(path, attempts = 7) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (protectedPreview) {
        const npxArgs = ['--yes', 'vercel@56.1.0', 'curl', path, '--deployment', baseUrl]
        const executable = process.platform === 'win32' ? process.execPath : 'npx'
        const executableArgs = process.platform === 'win32'
          ? [resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), ...npxArgs]
          : npxArgs
        const body = execFileSync(executable, executableArgs, {
          encoding: 'utf8',
          env: cliEnv,
          maxBuffer: 8 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        return { response: null, body }
      }
      const response = await fetch(`${baseUrl}${path}`, { headers: { accept: path.endsWith('.json') ? 'application/json' : 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error(`${path}:${response.status}`)
      return { response, body: await response.text() }
    } catch (error) {
      if (protectedPreview) {
        lastError = new Error(`protected_preview_request_failed:${path}:${describeCliFailure(error)}`)
      } else {
        lastError = error
      }
      if (attempt < attempts) await sleep(attempt * 1800)
    }
  }
  throw lastError
}

const pages = new Map()
for (const route of routes) {
  const result = await get(route)
  pages.set(route, result.body)
  if (!protectedPreview && result.response && canonicalProductRoutes.includes(route)) {
    const finalPath = new URL(result.response.url).pathname
    if (finalPath !== route) throw new Error(`canonical_product_route_redirected:${route}:${finalPath}`)
  }
}
for (const [route, html] of pages) {
  if (!html.includes('<title>SuperMega</title>')) throw new Error(`wrong_shell:${route}`)
}

const release = JSON.parse((await get('/__release.json')).body)
if (release.service !== 'supermega-app') throw new Error('wrong_release_service')
if (release.canonicalDomain !== 'https://app.supermega.dev') throw new Error('wrong_release_domain')
if (release.brandVersion !== manifest.brand.version) throw new Error(`release_brand_version_mismatch:${release.brandVersion}`)
if (release.contextVersion !== manifest.contextVersion) throw new Error(`release_context_version_mismatch:${release.contextVersion}`)
if (release.catalogVersion !== manifest.catalogVersion) throw new Error(`release_catalog_version_mismatch:${release.catalogVersion}`)
if (expectedCommit && String(release.commit || '').toLowerCase() !== expectedCommit) {
  console.error(JSON.stringify({
    ok: false,
    contract: 'supermega_app_live',
    baseUrl,
    verificationScope,
    expectedCommit,
    actualCommit: String(release.commit || '').toLowerCase() || null,
    reason: 'release_commit_mismatch',
  }, null, 2))
  process.exit(1)
}

const health = JSON.parse((await get('/api/health')).body)
if (health.status !== 'ready' || health.service !== 'supermega-service') throw new Error('canonical_api_unavailable')
if (!['isolated_demo', 'managed_trial'].includes(health.operating_mode)) throw new Error('unknown_operating_mode')
const expectedOperatingMode = String(process.env.EXPECTED_OPERATING_MODE || '').trim()
if (expectedOperatingMode && health.operating_mode !== expectedOperatingMode) throw new Error('selected_operating_mode_runtime_mismatch')
if (health.trial_backend?.browser_service_role_exposed !== false) throw new Error('unsafe_browser_service_role_contract')
if (typeof health.trial_backend?.role_ready !== 'boolean') throw new Error('runtime_database_role_contract_missing')
const activationSteps = health.enterprise_activation?.steps
if (!Array.isArray(activationSteps)
  || JSON.stringify(activationSteps.map((step) => step.id)) !== JSON.stringify(['database', 'role', 'schema', 'identity', 'audit', 'writes'])
  || activationSteps.some((step) => typeof step.ready !== 'boolean' || typeof step.action !== 'string' || step.action.length < 20)
  || !Number.isInteger(health.coverage_score)
  || health.coverage_score < 0
  || health.coverage_score > 100) throw new Error('managed_activation_steps_contract_missing')
const activationCoverage = Math.round((activationSteps.filter((step) => step.ready).length / activationSteps.length) * 100)
if (activationCoverage !== health.coverage_score) throw new Error('managed_activation_coverage_mismatch')
const activationEvidencePlan = health.enterprise_activation?.evidence_plan
if (!Array.isArray(activationEvidencePlan)
  || JSON.stringify(activationEvidencePlan.map((item) => item.id)) !== JSON.stringify(['postgres17_rehearsal', 'runtime_role_audit', 'identity_gateway', 'storage_privacy', 'write_acceptance'])
  || activationEvidencePlan.some((item) => typeof item.ready !== 'boolean' || typeof item.proof !== 'string' || item.proof.length < 30 || typeof item.verifier !== 'string' || item.verifier.length < 10)
  || health.enterprise_activation?.evidence_ready !== activationEvidencePlan.every((item) => item.ready)
  || JSON.stringify(activationEvidencePlan).toLowerCase().includes('secret')) throw new Error('managed_activation_evidence_plan_contract_missing')
const activationManifest = health.enterprise_activation?.manifest
if (!activationManifest
  || activationManifest.contract !== 'supermega.activation_manifest.v1'
  || activationManifest.mode !== health.operating_mode
  || activationManifest.ready_percent !== health.coverage_score
  || typeof activationManifest.next_action !== 'string'
  || activationManifest.next_action.length < 20
  || !Array.isArray(activationManifest.blocked_gate_ids)
  || !Array.isArray(activationManifest.safe_enable)
  || !activationManifest.safe_enable.includes('browser_local_trial')
  || !activationManifest.safe_enable.includes('evidence_export')
  || typeof activationManifest.proof_commands !== 'object'
  || activationEvidencePlan.some((item) => activationManifest.proof_commands[item.id] !== item.verifier)
  || typeof activationManifest.automation_boundary !== 'string'
  || !activationManifest.automation_boundary.includes('human approval')
  || activationManifest.secret_values_exposed !== false
  || JSON.stringify(activationManifest).toLowerCase().includes('secret=')) throw new Error('managed_activation_manifest_contract_missing')
if (health.operating_mode === 'managed_trial' && (health.enterprise_db_ready !== true || health.security_ready !== true)) throw new Error('managed_trial_readiness_mismatch')
if (health.operating_mode === 'managed_trial' && health.trial_backend.role_ready !== true) throw new Error('managed_trial_runtime_role_unsafe')
const importProvisioning = health.enterprise_activation?.import_provisioning
if (!importProvisioning
  || importProvisioning.contract !== 'supermega.import_provisioning_readiness.v1'
  || !['ready', 'blocked'].includes(importProvisioning.status)
  || typeof importProvisioning.ready !== 'boolean'
  || !Array.isArray(importProvisioning.checks)
  || JSON.stringify(importProvisioning.checks.map((check) => check.id)) !== JSON.stringify(['managed_identity_confirmed', 'private_workspace_schema', 'zero_write_validation_receipt', 'owner_import_approval', 'atomic_adapter_receipt', 'durable_revision_confirmation'])
  || importProvisioning.checks.some((check) => typeof check.ready !== 'boolean' || typeof check.action !== 'string' || check.action.length < 30)
  || !Array.isArray(importProvisioning.forbidden_until_ready)
  || !importProvisioning.forbidden_until_ready.includes('copy_browser_storage_to_production')
  || !importProvisioning.forbidden_until_ready.includes('scheduler_autopilot')
  || typeof importProvisioning.next_action !== 'string'
  || importProvisioning.next_action.length < 30
  || importProvisioning.secret_values_exposed !== false
  || JSON.stringify(importProvisioning).toLowerCase().includes('secret=')) throw new Error('managed_import_provisioning_readiness_contract_missing')
if (importProvisioning.ready !== importProvisioning.checks.every((check) => check.ready)) throw new Error('managed_import_provisioning_ready_mismatch')

const cloud = JSON.parse((await get('/api/cloud-autonomy/status')).body)
if (!['ready', 'degraded'].includes(cloud.status) || cloud.runtime_target !== 'hosted_vercel_api' || cloud.pc_dependency !== false) throw new Error('hosted_agent_runtime_contract_wrong')
if (JSON.stringify(cloud.scheduler?.queue_job_types) !== JSON.stringify(['task_triage', 'ops_watch'])) throw new Error('hosted_agent_queue_jobs_wrong')
if (JSON.stringify(cloud.scheduler?.daily_job_types) !== JSON.stringify(['founder_brief', 'github_release_watch'])) throw new Error('hosted_agent_daily_jobs_wrong')
if (cloud.scheduler?.max_jobs_per_run !== 1) throw new Error('hosted_agent_batch_limit_wrong')
if (cloud.scheduler?.redirects_allowed !== false) throw new Error('hosted_agent_redirect_policy_wrong')
if (cloud.scheduler?.activation_required !== true || cloud.scheduler?.activation_environment_key !== 'SUPERMEGA_HOSTED_SCHEDULER_ENABLED') throw new Error('hosted_agent_activation_contract_wrong')
if (cloud.status === 'ready' && cloud.scheduler?.configured !== true) throw new Error('hosted_agent_readiness_mismatch')
if (cloud.status === 'ready' && cloud.scheduler?.activation_enabled !== true) throw new Error('hosted_agent_activation_mismatch')

const rootHtml = pages.get('/')
const scriptPaths = [...rootHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1])
// Same two shapes as the local walk above, and for the same reason: the stylesheet reaches the
// document through /css-async.js's data-href, not a <link>, so matching only the link form
// would leave the CSS out of the live corpus entirely.
const cssPaths = [
  ...[...rootHtml.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1]),
  ...[...rootHtml.matchAll(/<script[^>]+src="\/css-async\.js"[^>]+data-href="([^"]+)"/g)].map((match) => match[1]),
]
if (!cssPaths.length) throw new Error('live_release_found_no_stylesheet')
const assetCorpus = (await Promise.all([...scriptPaths, ...cssPaths].map(async (path) => (await get(path)).body))).join('\n')
if (/assets\/ProductHomeReadiness-[A-Za-z0-9_-]+\.js/.test(assetCorpus)) {
  throw new Error('retired_product_home_readiness_chunk_present')
}
const operationsChunkPath = /assets\/(?:CoreApp|core-app)-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!operationsChunkPath) throw new Error('operations_chunk_missing')
const operationsChunk = (await get(`/${operationsChunkPath}`)).body
const productSystemNavigatorChunkPath = /assets\/ProductSystemNavigator-[A-Za-z0-9_-]+\.js/.exec(`${assetCorpus}\n${operationsChunk}`)?.[0]
if (!productSystemNavigatorChunkPath) throw new Error('product_system_navigator_chunk_missing')
const productSystemNavigatorChunk = (await get(`/${productSystemNavigatorChunkPath}`)).body
const productOnboardingChunkPath = /assets\/ProductOnboardingPage-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!productOnboardingChunkPath) throw new Error('product_onboarding_chunk_missing')
const productOnboardingChunk = (await get(`/${productOnboardingChunkPath}`)).body
const settingsChunkPath = /assets\/SettingsPage-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!settingsChunkPath) throw new Error('settings_chunk_missing')
const settingsChunk = (await get(`/${settingsChunkPath}`)).body
const managedLoginChunkPath = /assets\/ManagedLoginPage-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!managedLoginChunkPath) throw new Error('managed_login_chunk_missing')
const managedLoginChunk = (await get(`/${managedLoginChunkPath}`)).body
const managedAccountChunkPath = /assets\/ManagedAccountPage-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!managedAccountChunkPath) throw new Error('managed_account_chunk_missing')
const managedAccountChunk = (await get(`/${managedAccountChunkPath}`)).body
const companyBackupChunkPath = /assets\/CompanyBackupPanel-[A-Za-z0-9_-]+\.js/.exec(settingsChunk)?.[0]
if (!companyBackupChunkPath) throw new Error('company_backup_chunk_missing')
const companyBackupChunk = (await get(`/${companyBackupChunkPath}`)).body
const companyBackupCorpus = `${settingsChunk}\n${companyBackupChunk}`
const liveEvidenceVersion = extractTrialEvidenceVersion(settingsChunk)
if (!Number.isInteger(liveEvidenceVersion)) throw new Error('live_settings_evidence_version_missing')
if (liveEvidenceVersion !== localEvidenceVersion) {
  throw new Error(`live_settings_evidence_version_mismatch:local=${localEvidenceVersion}:live=${liveEvidenceVersion}`)
}
const clientDataOnboardingChunkPath = /assets\/ClientDataOnboarding-[A-Za-z0-9_-]+\.js/.exec(settingsChunk)?.[0]
if (!clientDataOnboardingChunkPath) throw new Error('client_data_onboarding_chunk_missing')
const clientDataOnboardingChunk = (await get(`/${clientDataOnboardingChunkPath}`)).body
const operatingModelsChunkPath = /assets\/operating-models-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!operatingModelsChunkPath) throw new Error('operating_models_chunk_missing')
const operatingModelsChunk = (await get(`/${operatingModelsChunkPath}`)).body
const ecommerceChunkPath = /assets\/EcommerceProduct-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!ecommerceChunkPath) throw new Error('ecommerce_chunk_missing')
const ecommerceChunk = (await get(`/${ecommerceChunkPath}`)).body
const ecommercePacketChunkPath = /assets\/ecommerce-order-review-packet-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!ecommercePacketChunkPath) throw new Error('ecommerce_packet_chunk_missing')
const ecommercePacketChunk = (await get(`/${ecommercePacketChunkPath}`)).body
const ecommerceProductCorpus = `${ecommerceChunk}\n${ecommercePacketChunk}`
const websiteChunkPath = /assets\/WebsiteProduct-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!websiteChunkPath) throw new Error('website_chunk_missing')
const websiteProductChunk = (await get(`/${websiteChunkPath}`)).body
const websiteModelChunkPath = /assets\/website-model-[A-Za-z0-9_-]+\.js/.exec(`${assetCorpus}\n${websiteProductChunk}`)?.[0]
const websiteModelChunk = websiteModelChunkPath ? (await get(`/${websiteModelChunkPath}`)).body : ''
const websiteDependencyCorpus = (await Promise.all(
  extractRelativeJavascriptDependencies(websiteProductChunk).map(async (name) => (await get(`/assets/${name}`)).body),
)).join('\n')
const websiteChunk = `${websiteProductChunk}\n${websiteModelChunk}\n${websiteDependencyCorpus}`
const activationRunbookChunkPath = /assets\/ManagedActivationRunbook-[A-Za-z0-9_-]+\.js/.exec(settingsChunk)?.[0]
if (!activationRunbookChunkPath) throw new Error('managed_activation_runbook_chunk_missing')
const activationRunbookChunk = (await get(`/${activationRunbookChunkPath}`)).body
const releaseAssetVerification = verifyCurrentReleaseAssets({
  manifest,
  assetCorpus,
  operationsChunk,
  productSystemNavigatorChunk,
  productOnboardingChunk,
  settingsChunk,
  ecommerceProductCorpus,
  websiteChunk,
  clientDataOnboardingChunk,
  managedLoginChunk,
  managedAccountChunk,
  companyBackupCorpus,
  activationRunbookChunk,
})
const legacyCopyAudit = process.env.SUPERMEGA_LEGACY_COPY_AUDIT === '1'
if (legacyCopyAudit) {
for (const required of ['SUPERMEGA', 'Company control', 'Start from grounded local records.', 'Free workspace', 'Premium activation', 'Managed data, AI context', 'Check readiness', 'Open product', 'Set up product', 'Shop', 'Plant', 'Website', 'Ecommerce', 'Sample mode', manifest.brand.colors.accent, manifest.brand.colors.ink]) {
  if (!assetCorpus.includes(required)) throw new Error(`missing_live_context:${required}`)
}
for (const required of ['supermega.setup.v3', 'First source named', 'Acceptance proof named', 'Ready for managed import', 'Approved setup can now be exported for managed review.']) {
  if (!assetCorpus.includes(required)) throw new Error(`missing_live_setup_readiness_context:${required}`)
}
for (const required of ['supermega.managed_company_brief.v1', '/api/trial/v1/company-brief', '/api/trial/v1/company-brief/receipts']) {
  if (!operatingModelsChunk.includes(required)) throw new Error(`missing_live_managed_company_brief_context:${required}`)
}
for (const required of ['supermega.managed_owner_control_run.v1', 'supermega.managed_owner_control_retention.v1', '/api/trial/v1/owner-control', '/api/trial/v1/owner-control/acknowledgements', 'acknowledgedCount', 'Managed Owner Control baseline digest is invalid.', 'Managed Owner Control run digest is invalid.']) {
  if (!operatingModelsChunk.includes(required)) throw new Error(`missing_live_managed_owner_control_context:${required}`)
}
for (const required of ['supermega.ai_context_export.v1', 'supermega.managed_context_profile.v2', 'supermega.managed_context_profile_validation.v2', 'supermega.managed_context_profile_retention.v2', '/api/trial/v1/managed-context/validate', '/api/trial/v1/managed-context/retain', 'approvedContextDigest', 'acceptedOutcomeDigest', 'rank_next_actions', 'model_training']) {
  if (!operatingModelsChunk.includes(required)) throw new Error(`missing_live_managed_context_contract:${required}`)
}
for (const required of ['supermega.operating_baseline.v1', 'supermega.operating_baseline_change.v1', 'rawRecordsIncluded', 'First operating baseline', 'No operating change', 'more review pressure']) {
  if (!operatingModelsChunk.includes(required)) throw new Error(`missing_live_operating_baseline_contract:${required}`)
}
for (const required of ['AI learned', 'Managed company brief', 'Keep approved context', 'I approve retention of this exact summary and accepted outcome for managed AI recommendations.']) {
  if (!settingsChunk.includes(required)) throw new Error(`missing_live_operating_learning_ui:${required}`)
}
for (const required of ['supermega.behavior-trail.v1', 'supermega.behavior_preference.v1', 'agent_job_seen', 'agent_job_chosen']) {
  if (!assetCorpus.includes(required)) throw new Error(`missing_live_behavior_context:${required}`)
}
for (const required of ['Plant agent queue', 'Recommended Plant agent job', 'Agent job', 'Owner gate', 'Record next job output', 'Contain urgent Plant problems', 'Review quality holds', 'Close WCM records', 'Build shift handoff', 'Shift close', 'Prepare shift packet', 'AI shift close checklist', 'Review shift close', 'Shift closed by', 'production.shift.closed', 'Plant enterprise evidence', 'MES, MRP, ERP & ISO evidence', 'Open detailed status, readiness, trace, quality, costing, and audit context', 'MES dispatch', 'AI chooses the next station, blocker, evidence need, and handoff route from live Plant state.', 'No equipment command or production write runs from this panel.', 'No equipment write', 'Station', 'Target', 'Blocker', 'Evidence', 'Plant control', 'Contain urgent problems', 'Close WCM work', 'MES lifecycle', 'Plan to handoff', 'AI guides plan, execution, quality, WCM, trace, and handoff.', 'No equipment or production write runs without owner approval.', 'MRP readiness', 'Plant MRP readiness', 'AI reviews job demand, BOM, availability, Shop supply, material blockers, and trace evidence.', 'No purchase, issue, costing, inventory, or production write runs from this panel.', 'Plant ERP cost readiness', 'ERP cost readiness', 'AI checks good output, scrap, material trace, quality release, WCM closure, and shift handoff before any costing package is reviewed.', 'No costing, accounting, inventory, payroll, invoice, or production write runs from this panel.', 'Restore cost evidence readiness', 'Record material trace before cost', 'Resolve quality before cost', 'Close WCM before cost', 'Build cost handoff', 'Cost package ready for review', 'Cost gate', 'Review only', 'Plant ERP cost package packet', 'Cost package packet', 'AI packages finished batch output, scrap, material trace, quality release state, WCM closure, and handoff evidence for ERP cost review.', 'No standard cost update, inventory valuation, journal, payroll, invoice, certificate, or production write runs from this packet.', 'Ready for cost review', 'Still running', 'Need trace', 'Quality blocked', 'Evidence ready', 'Need handoff', 'ERP handoff', 'Review package', 'Plant quality release', 'ISO release', 'AI checks quality holds, WCM closure, material trace, shift handoff, and owner release evidence before output can be treated as ready.', 'No quality release, certificate, equipment command, material issue, costing, inventory, or production write runs from this panel.', 'Approve pending Plant action', 'Complete trace evidence', 'Build release handoff', 'Release package ready', 'Plant inspection and CAPA', 'Inspection + CAPA', 'AI turns sampling, NCR containment, corrective action, evidence, and release review into one quality queue.', 'No certificate, CAPA closure, customer claim, inventory block, costing, or production write runs from this panel.', 'Restore inspection readiness', 'Assign NCR containment', 'Close CAPA evidence', 'Sample first production run', 'Inspection queue clear', 'Start inspection NCR', 'Open inspection queue', 'Inspection sample needs NCR review', 'Hold affected output until sample evidence, root cause, and corrective action are reviewed.', 'NCR', 'CAPA', 'Containment', 'Evidence', 'Holds', 'Owner release', 'Demand', 'BOM', 'Availability', 'Shop supply', 'Issue gate', 'Materials ready for review', 'Resolve material blockers', 'Check BOM shortfalls', 'Review Shop supply', 'Record first material use', 'Jobs', 'Quality', 'WCM', 'Materials', 'Handoff', 'Write gate', 'Plan', 'Execute', 'Trace', 'Owner confirms production, quality, WCM, maintenance, material, and handoff writes.']) {
  if (!operationsChunk.includes(required)) {
    const replacement = new Map([
      ['MES dispatch', 'Daily dispatch'],
      ['AI chooses the next station, blocker, evidence need, and handoff route from live Plant state.', 'SuperMega shows the next station, blocker, evidence need, and shift route from live Plant state.'],
      ['MES lifecycle', 'Production lifecycle'],
      ['Build shift handoff', 'Prepare shift close'],
      ['Prepare shift packet', 'Prepare shift close file'],
      ['AI shift close checklist', 'Shift close checklist'],
      ['Plan to handoff', 'Plan to shift close'],
      ['AI guides plan, execution, quality, WCM, trace, and handoff.', 'Follow planning, execution, quality, WCM, trace, and shift close in one place.'],
      ['MRP readiness', 'Material readiness'],
      ['AI reviews job demand, BOM, availability, Shop supply, material blockers, and trace evidence.', 'Review job demand, BOM, availability, Shop supply, material blockers, and trace evidence.'],
      ['Plant MRP readiness', 'Plant material readiness'],
      ['Plant ERP cost readiness', 'Plant cost readiness'],
      ['ERP cost readiness', 'Cost readiness'],
      ['AI checks good output, scrap, material trace, quality release, WCM closure, and shift handoff before any costing package is reviewed.', 'Check good output, scrap, material trace, quality release, WCM closure, and shift close before any costing package is reviewed.'],
      ['Build cost handoff', 'Prepare cost review'],
      ['Plant ERP cost package packet', 'Plant cost review file'],
      ['Cost package packet', 'Cost review file'],
      ['AI packages finished batch output, scrap, material trace, quality release state, WCM closure, and handoff evidence for ERP cost review.', 'Package finished batch output, scrap, material trace, quality release state, WCM closure, and shift evidence for cost review.'],
      ['Need handoff', 'Need shift close'],
      ['ERP handoff', 'Cost file'],
      ['No equipment or production write runs without owner approval.', 'No equipment or production write runs without manager review.'],
      ['ISO release', 'Quality release'],
      ['AI checks quality holds, WCM closure, material trace, shift handoff, and owner release evidence before output can be treated as ready.', 'Check quality holds, WCM closure, material trace, shift close, and owner release evidence before output can be treated as ready.'],
      ['Build release handoff', 'Prepare release review'],
      ['AI turns sampling, NCR containment, corrective action, evidence, and release review into one quality queue.', 'Keep sampling, NCR containment, corrective action, evidence, and release review in one quality queue.'],
      ['Compliance dossier', 'Compliance file'],
      ['AI summarizes ISO quality release, WCM closure, material traceability, output evidence, shift handoff, and cost-readiness into one audit packet.', 'Summarize quality release, WCM closure, material traceability, output evidence, shift close, and cost-readiness into one audit packet.'],
      ['No certificate, quality release, costing, inventory valuation, equipment command, customer claim, or production write runs from this dossier.', 'No certificate, quality release, costing, inventory valuation, equipment command, customer claim, or production write runs from this file.'],
      ['Handoff', 'Shift close'],
      ['Owner gate', 'Review'],
      ['Write gate', 'Write status'],
      ['Owner confirms production, quality, WCM, maintenance, material, and handoff writes.', 'Owner confirms production, quality, WCM, maintenance, material, and shift-close writes.'],
    ]).get(required)
    if (!replacement || !operationsChunk.includes(replacement)) throw new Error(`missing_live_plant_context:${required}`)
  }
}
for (const required of ['Job CSV autopilot', 'Load sample job batch', 'Load sample Plant job batch', 'Sample Plant job batch loaded and the first reviewed job was copied into the form. No production job, equipment command, material movement, accounting post, or managed write ran.', 'Plant job repair checklist', 'Ready rows', 'Blocked rows', 'Next fix', 'Review copied job', 'Checks MES fields locally', 'Upload Plant job CSV', 'no Plant write']) {
  if (!operationsChunk.includes(required)) {
    const replacement = new Map([['Job CSV autopilot', 'Job CSV import']]).get(required)
    if (!replacement || !operationsChunk.includes(replacement)) throw new Error(`missing_live_plant_job_import_context:${required}`)
  }
}
if (!operationsChunk.includes('plant-production-module')
  || !assetCorpus.includes('.operations-screen:not(.commerce-screen) .workspace-view')
  || !assetCorpus.includes('.plant-production-module>.production-view')
  || !assetCorpus.includes('scrollbar-gutter:stable')) throw new Error('missing_live_plant_execution_layout_contract')
if (!operationsChunk.includes('Stock replenishment')
  || !operationsChunk.includes('Plan replenishment')
  || !operationsChunk.includes('Stock replenishment to Plant')
  || !operationsChunk.includes('data-demand-kind')) throw new Error('missing_live_plant_active_work_hierarchy_contract')
if (!operationsChunk.includes('shop-counter-module')
  || !assetCorpus.includes('.shop-counter-module{overflow-y:auto;scrollbar-gutter:stable}')
  || !assetCorpus.includes('.shop-counter-module>.shop-counter-surface')) throw new Error('missing_live_shop_counter_layout_contract')
if (!operationsChunk.includes('data-active-tab')
  || !assetCorpus.includes('.commerce-screen[data-active-tab=today] .workspace-view')
  || !assetCorpus.includes('.commerce-screen[data-active-tab=orders] .workspace-view')
  || !assetCorpus.includes('.commerce-screen[data-active-tab=inventory] .workspace-view')) throw new Error('missing_live_shop_task_scroll_contract')
if (!assetCorpus.includes('More Shop tools')
  || !assetCorpus.includes('Customers, finance, channels, and purchasing')
  || assetCorpus.includes('Use Shop in 3 steps.')
  || !assetCorpus.includes('.shop-today-workspaces>summary')) throw new Error('missing_live_shop_today_hierarchy_contract')
if (!operationsChunk.includes('More options for ')
  || !operationsChunk.includes('Cancel order')
  || operationsChunk.includes('Need help choosing?')
  || operationsChunk.includes('Shows the next safe Shop step')
  || !assetCorpus.includes('.order-row-more>summary')
  || assetCorpus.includes('.shop-agent-queue{')) throw new Error('missing_live_shop_order_action_hierarchy_contract')
if (!operationsChunk.includes('Other products')
  || !operationsChunk.includes('Healthy stock, pricing, and reorder levels')
  || !operationsChunk.includes('No stock needs action.')
  || !operationsChunk.includes('Stock records')
  || !operationsChunk.includes('actions on demand')
  || !operationsChunk.includes('data-stock-list')
  || !assetCorpus.includes('.stock-attention-table>.table-head')
  || !assetCorpus.includes('.stock-catalog-content')
  || !assetCorpus.includes('.stock-record-content')
  || !assetCorpus.includes('.data-row.stock-empty-row')) throw new Error('missing_live_shop_stock_worklist_contract')
for (const required of ['Browser-local sample only.', 'sample order and sample stock change in this browser', 'No payment is captured', 'no customer is contacted', 'no server or managed workspace is written', 'no real stock is moved']) {
  if (!operationsChunk.includes(required)) throw new Error(`missing_live_shop_counter_local_boundary:${required}`)
}
const shopLiveCopyUpdates = new Map([
  ['Owner gate', 'Review'],
  ['Write gate', 'Write status'],
  ['Owner approves writes', 'Review before writes'],
  ['Sample Shop catalog item loaded for owner review.', 'Sample Shop catalog item loaded for review.'],
  ['AI checks sales capture, payment exceptions, refund exposure, supplier receipts, inventory evidence, and owner approval before any accounting export is reviewed.', 'AI checks sales capture, payment exceptions, refund exposure, supplier receipts, inventory evidence, and manager review before any accounting export is reviewed.'],
  ['budget and owner approval required', 'budget and review required'],
  ['The owner confirms every sale, payment, stock, supplier, refund, and accounting handoff.', 'A manager confirms every sale, payment, stock, supplier, refund, and accounting review.'],
])
for (const required of ['Recommended next step', 'Recommended Shop next step', 'Agent job', 'Owner gate', 'Restore Shop write readiness', 'Review online order requests', 'Finish fulfilment queue', 'Receive purchase orders', 'Reorder low stock', 'Set up stock locations', 'Shop setup guide', 'Import products once. Then run the daily queue.', 'The assistant prepares catalog import, stock foundation, online order review, payment exceptions, supplier receiving, and accounting packets.', 'The owner confirms every sale, payment, stock, supplier, refund, and accounting handoff.', 'Products', 'Import catalog', 'Location + ATP', 'Simple count first', 'Owner approves writes', 'Load sample catalog item', 'SM-FRESH-006', 'Fresh market delivery pack', 'Load sample Shop catalog item', 'Sample Shop catalog item loaded for owner review.', 'no Shop write, stock move, supplier message, sale, payment, or accounting post ran.', 'Order control', 'Review Ecommerce inbox', 'Reconcile payment exceptions', 'Online inbox', 'Write gate', 'Owner confirms orders, payments, refunds, deliveries, cancellations, and stock changes.', 'Shop order lifecycle', 'Order lifecycle', 'Capture to return', 'AI guides capture, reserve, fulfil, collect, replenish, and returns.', 'Owner confirms orders, payments, refunds, deliveries, cancellations, and stock writes.', 'Shop accounting readiness', 'Accounting readiness', 'AI checks sales capture, payment exceptions, refund exposure, supplier receipts, inventory evidence, and owner approval before any accounting export is reviewed.', 'No ledger, tax, payment, payable, refund, inventory, or Shop write runs from this panel.', 'Restore accounting readiness', 'Approve pending Shop action', 'Review refund exposure', 'Receive supplier evidence', 'Reconcile stock evidence', 'Accounting package ready', 'Export gate', 'Shop accounting export packet', 'Accounting export packet', 'AI packages the reviewed daily close, payment proof, refund evidence, stock exceptions, supplier receipt exposure, and tax status for accounting review.', 'No ledger post, tax filing, payable creation, bank settlement, refund, payment, inventory, or Shop write runs from this packet.', 'Ready for accountant review', 'Close before export', 'No export package yet', 'CSV ready', 'Review import', 'Not posted', 'Not configured', 'External proof only', 'Need close evidence', 'Shop procurement readiness', 'Procurement readiness', 'AI checks reorder demand, open POs, arrival risk, receipt evidence, and location/lot readiness.', 'No supplier message, payment, receipt, stock, costing, or accounting write runs from this panel.', 'Supplier control', 'AI turns supplier reference, promised arrival, open quantity, receipt evidence, and owner approval into one purchasing queue.', 'No RFQ, supplier send, payment, payable, costing, or inventory write runs from this panel.', 'Start supplier request', 'Preferred supplier', 'Supplier request drafted for', 'no RFQ, message, payment, payable, costing, or stock write is created.', 'Supplier request is clear. No uncovered reorder item needs a draft.', 'Restore purchasing readiness', 'Approve pending supplier action', 'Resolve late supplier order', 'Prepare receiving evidence', 'Close partial receipt', 'Choose supplier and arrival', 'Monitor supplier promise', 'Supplier controls ready', 'Suppliers', 'Open units', 'Gate', 'Need', 'On order', 'Remaining', 'Arrival', 'Receipt', 'Order uncovered stock', 'Receive or cancel late PO', 'Check arriving PO', 'Track open supply', 'Supply ready', 'Capture', 'Reserve', 'Fulfil', 'Collect', 'Replenish', 'Return']) {
  const currentRequired = shopLiveCopyUpdates.get(required) ?? required
  if (!operationsChunk.includes(currentRequired)) throw new Error(`missing_live_shop_context:${required}`)
}
const settingsLiveCopyUpdates = new Map([
  ['Launch pack checklist', 'Setup checklist'],
  ['Bring the starting data. AI prepares the packet. Owner keeps the gate.', 'Bring the starting data. SuperMega prepares a review file. You approve real changes.'],
  ['Premium AI context', 'Premium company learning'],
  ['Premium agent plan', 'Premium work plan'],
  ['What the agent can run', 'What SuperMega can prepare'],
  ['AI context quality', 'Company data quality'],
  ['Premium learning starts only when source records, behavior, decisions, and managed controls are present in the exported evidence.', 'Premium learning starts only when source records, behavior, decisions, and company controls are present in the exported evidence.'],
  ['Provisioning packet', 'Account setup file'],
  ['Premium activation creates a managed tenant from exported evidence only after roles, data, controls, and write gates are verified.', 'Premium creates a company account from exported evidence only after roles, data, controls, and review status are verified.'],
  ['Import provisioning', 'Import readiness'],
  ['Ecommerce activation packet', 'Ecommerce go-live file'],
  ['Review before managed setup', 'Review before company setup'],
  ['Paste the downloaded Ecommerce activation JSON.', 'Paste the downloaded Ecommerce go-live JSON.'],
  ['Activation packet JSON', 'Go-live file JSON'],
  ['Agent behavior memory', 'Behavior memory'],
  ['What owners keep choosing', 'What users keep choosing'],
  ['Premium can use approved queue behavior after managed import.', 'Premium can use approved queue behavior after company import.'],
  ['Activation manifest', 'Go-live summary'],
  ['Scheduler activation', 'Scheduler go-live'],
  ['Autopilot stays blocked until proof passes', 'Automation stays blocked until proof passes'],
  ['Hosted agents can run only after signed evidence, protected secrets, worker allowlist, budget grants, and no-redirect checks are ready.', 'Hosted workers can run only after signed evidence, protected secrets, worker allowlist, budget grants, and no-redirect checks are ready.'],
])
for (const required of ['Start guided sample', 'Request managed trial', 'Your AI memory preview is ready.', 'Launch pack checklist', 'Bring the starting data. AI prepares the packet. Owner keeps the gate.', 'Product CSV, stock count, payment proof', 'Job CSV, material list, quality holds', 'Facts, offers, proof, photos, links', 'Catalog rows, order CSV, channel samples', 'One Shop-ready order packet', 'Owner approves production', 'No customer message, payment capture, delivery booking, stock move, refund, or Shop write runs from setup.', 'supermega.launch_pack_manifest.v1', 'supermega.behavior_preference.v1', 'Preferred job', 'map_starting_data', 'rank_first_workflow', 'draft_review_packet', 'summarize_missing_proof', 'model_training_without_owner_approval', 'supermega_trial_evidence', 'activationRows', 'activationEvidencePlan', 'activationManifest', 'activationManifestRows', 'importProvisioning', 'importProvisioningPacket', 'importProvisioningRows', 'supermega.import_provisioning_readiness.v1', 'forbiddenUntilReady', 'version:24', 'schedulerActivation', 'schedulerActivationRows', 'supermega.managed_trial_request.v1', 'managedTrialRequest', 'managedTrialRequestRows', 'Managed trial request', 'What support needs', 'Download managed activation packet', 'No external send or managed write from this packet', 'learningRows', 'learningPlanRows', 'agentPlanRows', 'aiContextQualityRows', 'contextHandoffManifest', 'contextHandoffRows', 'supermega.ai_context_handoff.v1', 'allowedUses', 'forbiddenActions', 'managedWorkspaceProvisioningPacket', 'provisioningRows', 'supermega.managed_workspace_provisioning.v1', 'requiredControls', 'forbiddenUntilProvisioned', 'copy_browser_storage_to_production', 'behaviorTrail', 'behaviorPreference', 'agentBehaviorRows', 'Premium AI context', 'What the system can learn', 'Premium agent plan', 'What the agent can run', 'AI context quality', 'What premium can safely use', 'Premium learning starts only when source records, behavior, decisions, and managed controls are present in the exported evidence.', 'AI context handoff', 'What premium receives', 'Draft and rank only', 'No send/write/train', 'This manifest tells support and the managed agent what it may use, what it must ignore, and which actions remain forbidden.', 'Provisioning packet', 'How this becomes a real workspace', 'Premium activation creates a managed tenant from exported evidence only after roles, data, controls, and write gates are verified.', 'Import provisioning', 'What must pass before real imports', 'Backend health owns this checklist.', 'Order review packet', 'Check before Shop queue', 'Paste the Ecommerce order review JSON.', 'The browser checks schema, row counts, catalog source, source CSV, and forbidden actions locally; no order import, customer message, payment, delivery, stock, Shop write, or managed activation runs.', 'Managed order queue check', 'Server validation passed with zero records written.', 'Local receipt ready; run managed check before owner approval.', 'Run managed queue check', 'Order queue owner approval packet', 'Shop queue import plan', 'Prepare import plan', 'Retry-safe key for the future managed apply command.', 'Managed Shop queue import plan prepared with zero external writes. Apply still requires a decided human approval record and managed write gates.', 'Download approval packet', 'Record owner approval request', 'Managed owner approval request recorded. No Shop queue import, customer message, payment, delivery, stock move, or activation ran.', 'Run managed queue check before preparing owner approval.', 'Approval may unlock only one managed Shop queue import.', 'No import or approval record has been created.', 'No managed request or write has run.', 'No Shop queue import command has been created.', 'Order review packet JSON', 'Paste supermega.ecommerce.order_import_review_packet.v1 JSON', 'Load sample order packet', 'Check order packet locally', 'Download queue packet', 'Clear order packet', 'Queue handoff', 'Ready to package', 'Repair first', 'Ready packet', 'Blocked packet', 'Import and activation blocked', 'Sample Ecommerce order review packet loaded locally. Review it to test the handoff gate.', 'Ecommerce order review packet checked locally. No order import, customer message, payment, delivery, stock, Shop write, or managed activation ran.', 'Ecommerce order queue readiness packet downloaded. No order import, customer message, payment, delivery, stock, Shop write, or managed activation ran.', 'Ecommerce order review packet rejected locally. No order or managed action ran.', 'Ecommerce order review packet cleared locally.', 'Ecommerce activation packet', 'Review before managed setup', 'Paste the downloaded Ecommerce activation JSON.', 'The browser validates schema, source, queue, and forbidden actions locally; no import, managed activation, Shop write, payment, delivery, stock, or customer action runs.', 'Activation packet JSON', 'Paste supermega.ecommerce.managed_store_activation_packet.v1 JSON', 'Load sample packet', 'Review packet locally', 'Clear packet', 'Valid packet', 'Sample loaded', 'Managed activation blocked', 'Sample Ecommerce activation packet loaded locally. Review it to test the handoff gate.', 'Ecommerce activation packet review cleared locally.', 'Ecommerce activation packet reviewed locally. No import, managed activation, Shop write, payment, delivery, stock, or customer action ran.', 'Ecommerce activation packet rejected locally. No managed action ran.', 'Agent behavior memory', 'Behavior memory', 'What owners keep choosing', 'Activation manifest', 'What automation may do next', 'Scheduler activation', 'Autopilot stays blocked until proof passes', 'Hosted agents can run only after signed evidence, protected secrets, worker allowlist, budget grants, and no-redirect checks are ready.', 'supermega.ai_context_export.v1', 'Approved AI context export', 'Review the summary AI can receive.', 'I approve this summary-only context package for managed AI review.', 'Download approved context', 'Export full evidence']) {
  const source = required === 'supermega.behavior_preference.v1'
    ? assetCorpus
    : required === 'supermega.ai_context_export.v1'
      ? operatingModelsChunk
      : settingsChunk
  const currentRequired = settingsLiveCopyUpdates.get(required) ?? required
  if (!source.includes(currentRequired)) throw new Error(`missing_live_settings_context:${required}`)
}
for (const required of ['supermega.ai_memory_preview.v1', 'AI memory preview', 'Download AI memory', 'Request managed AI', 'Raw product records stay out of this preview.', 'No customer message, payment, stock move, production write, domain publish, managed write, or model training runs from this preview.']) {
  if (!settingsChunk.includes(required)) throw new Error(`missing_live_ai_memory_preview_context:${required}`)
}
for (const required of ['Review one owner decision', 'Finish proof run', 'Start proof run', 'pilot-outcome-proof']) {
  if (!settingsChunk.includes(required)) throw new Error(`missing_live_managed_trial_request_gate:${required}`)
}
for (const required of ['supermega.managed_trial_proof.v2', 'proof_contract', 'proof_digest', 'proof_readiness', 'proof_sources', 'proof_behavior', 'proof_decisions', 'proof_outcome', 'proof_outcome_digest', 'proof_outcome_accepted', 'proof_raw_records']) {
  if (!operatingModelsChunk.includes(required)) throw new Error(`missing_live_managed_trial_proof_contract:${required}`)
}
for (const required of ['supermega.pilot_outcome_report.v1', 'Free outcome proof', 'Prove one result from real', 'Start proof run', 'Accept measured result', 'Download accepted proof', 'Aggregate counts only. No raw records', 'Named-owner acceptance and its exact decision proof were saved.', 'Accept the measured', 'local://pilot-outcome/', 'no raw records or external writes were included.', 'Storefront not saved,', 'shop-guided-sale-gap', 'Guided Shop sale gap', 'owner-confirmed guided counter sale', 'Start Shop outcome proof', 'plant-guided-shift-close-gap', 'Guided Plant shift-close gap', 'named-owner Plant shift-close record', 'Start Plant shift-close proof', 'Close one shift packet with output, trace, quality, and WCM evidence.', 'One accountable shift close']) {
  if (!settingsChunk.includes(required)) throw new Error(`missing_live_pilot_outcome_contract:${required}`)
}
for (const required of ['Premium pilot', 'Your business context, remembered.', 'SuperMega combines approved product data and owner patterns, then prepares one next move for review.', 'Owner pattern', 'Managed account', 'Approved sources', 'Counts only; raw source records are not shown here.', 'Managed company brief', 'AI learned', 'Reviewed next move', 'Verify this company, not a generic demo.', 'Find my company', 'Open company', 'Verify context', 'Keep learning checkpoint', 'Learning checkpoint kept in the managed audit. No external action ran.', 'Review only. No customer send, payment, stock move, production write, domain publish, or model training runs from this pilot.', 'Managed access recovery', 'Sign in and SuperMega will find the active companies assigned to you.', 'Recover managed access', 'Connect through Premium pilot after saving a trial.']) {
  if (!settingsChunk.includes(required)) throw new Error(`missing_live_premium_pilot_context:${required}`)
}
const managedLoginLiveCopyUpdates = new Map([
  ['Request managed activation', 'Request company account'],
])
for (const required of ['Open your company.', 'Sign in once. SuperMega finds the companies assigned to you.', 'Use your work account.', 'No workspace code or technical setup is required.', 'Only active companies assigned to this account are shown.', 'Find my company', 'Open company', 'Open free workspace', 'Request managed activation']) {
  const currentRequired = managedLoginLiveCopyUpdates.get(required) ?? required
  if (!managedLoginChunk.includes(currentRequired)) throw new Error(`missing_live_managed_login_context:${required}`)
}
for (const required of ['Recover your account.', 'Send a secure link.', 'For privacy, the result is the same whether or not the address has an account.', 'If this email belongs to a managed account, a recovery link is on its way.', 'Secure your account.', 'Secure link confirmed', 'Set your password.', 'Save password and continue', 'Request a new link', 'Only active companies assigned to this named account are shown.']) {
  if (!managedAccountChunk.includes(required)) throw new Error(`missing_live_managed_account_context:${required}`)
}
for (const required of ['supermega.company_backup.v1', 'supermega.local_company_snapshot.v1', 'AES-GCM', 'PBKDF2', 'Company backup', 'Move or recover this company.', 'Customer-owned and encrypted', 'Download encrypted backup', 'Inspect backup', 'Confirm restore', 'Auth sessions, company account IDs, and credentials are excluded.', 'Nothing is uploaded, sent, or written to a company account.', 'Backup integrity passed.', 'previous company state was restored']) {
  if (!companyBackupCorpus.includes(required)) throw new Error(`missing_live_company_backup_context:${required}`)
}
for (const required of ['Managed memory', 'Remember how this owner works.', 'Raw records and browser text stay out.', 'Human decisions', 'Approved or declined', 'Accepted outcome', 'Recommendations only', 'Keep approved context', 'Managed context retained', 'I approve retention of this exact summary and accepted outcome for managed AI recommendations.']) {
  if (!settingsChunk.includes(required)) throw new Error(`missing_live_managed_context_consent:${required}`)
}
for (const required of ['storagePackages', 'selectedProductRecords']) {
  if (!settingsChunk.includes(required)) throw new Error(`missing_live_prepared_record_context:${required}`)
}
const clientImportLiveCopyUpdates = new Map([
  ['Import autopilot', 'Next'],
  ['Import coach', 'setup helper'],
  ['Write boundary', 'Safety'],
  ['Managed check before write', 'Company check first'],
  ['Local/export only', 'Local file only'],
  ['Activation handoff', 'setup summary'],
  ['setup handoff', 'setup summary'],
  ['Controls, ownership, and handoff', 'Setup checks and review'],
  ['Download activation package', 'Download setup file'],
  ['Run managed check', 'Run company check'],
  ['Server validation passed with zero records written', 'Workspace check passed with zero records written'],
  ['managed provisioning plan', 'company setup plan'],
  ['Provisioning plan', 'company setup plan'],
  ['Final preflight', 'Final check'],
  ['Runs before apply', 'Runs before import'],
  ['Verifying the named human, product capability, package digest, and current workspace revision...', 'Checking the company, product, file, and latest saved records...'],
  ['Running final preflight...', 'Running final check...'],
  ['authority + revision preflight retained', 'company check retained'],
  ['No browser storage, customer message, payment, domain publish, or scheduler autopilot is allowed from this validation.', 'No customer message, payment, website publish, or automation runs from this check.'],
])
for (const required of ['Import autopilot', 'Import coach', 'Next action', 'Write boundary', 'Start with a CSV or sample so SuperMega can map columns and inspect rows locally.', 'Managed check before write', 'Local/export only', 'Activation handoff', 'Download activation package', 'Run managed check', 'Free mode can export the package for support review without sending data from the browser.', 'Server validation passed with zero records written', 'Provisioning plan', 'managed provisioning plan', 'Final preflight', 'Runs before apply', 'Verifying the named human, product capability, package digest, and current workspace revision...', 'Running final preflight...', 'authority + revision preflight retained', 'No browser storage, customer message, payment, domain publish, or scheduler autopilot is allowed from this validation.']) {
  const currentRequired = clientImportLiveCopyUpdates.get(required) ?? required
  if (!clientDataOnboardingChunk.includes(currentRequired)) throw new Error(`missing_live_import_coach_context:${required}`)
}
for (const required of ['supermega.client_import_provisioning_plan.v1', 'zero_write_validation_receipt', 'durable_revision_confirmation', 'copy_browser_storage_to_production', 'scheduler_autopilot']) {
  if (!operatingModelsChunk.includes(required)) throw new Error(`missing_live_import_provisioning_contract:${required}`)
}
const ecommerceLiveCopyUpdates = new Map([
  ['Run next step', 'Open next step'],
  ['Enterprise order controls', 'Advanced order controls'],
  ['Inbox, payment, delivery, recovery, replies, and activation evidence.', 'Inbox, payment, delivery, recovery, replies, and go-live checks.'],
  ['Recommended Ecommerce next step', 'Ecommerce next step'],
  ['Agent job', 'Next step'],
  ['Finish storefront setup', 'Finish store'],
  ['Open storefront for ordering', 'Open store for ordering'],
  ['AI filters customer requests by stock risk, quote expiry, manual QR review, and delivery mode so the owner opens the right Shop review first.', 'Filter customer requests by stock risk, quote expiry, manual QR review, and delivery mode so the owner opens the right Shop review first.'],
  ['The assistant prepares CSV, Viber, LINE, WeChat, email, and form order batches against the saved Shop catalog so owners review one clean Shop queue.', 'Review CSV, Viber, LINE, WeChat, email, and form order batches against the saved Shop catalog so Shop gets one clean review queue.'],
  ['Repair before handoff', 'Repair before Shop review'],
  ['Save storefront first', 'Save store first'],
  ['AI checks catalog, storefront fingerprint, quote readiness, Shop review queue, and safety mode before a customer request can move forward.', 'Check products, prices, quote readiness, Shop review queue, and safety mode before a customer request can move forward.'],
  ['The assistant prepares the simplest sellable set from in-stock Shop items. You only save after review.', 'Choose the simplest sellable set from in-stock Shop items. You only save after review.'],
  ['Ecommerce managed store activation packet', 'Ecommerce managed store go-live file'],
  ['Managed store activation packet', 'Managed store go-live file'],
  ['AI packages catalog, storefront fingerprint, checkout quote controls, manual payment review, delivery template readiness, Shop review queue, and managed gate for store activation.', 'Package products, prices, checkout controls, manual payment review, delivery templates, and Shop review queue for go-live review.'],
  ['Package products, prices, checkout controls, manual payment review, delivery template readiness, Shop review queue, and managed gate for go-live review.', 'Package products, prices, checkout controls, manual payment review, delivery templates, and Shop review queue for go-live review.'],
  ['No product publish, customer message, payment capture, wallet debit, delivery booking, stock move, refund, Shop write, or managed activation runs from this packet.', 'No product publish, customer message, payment capture, wallet debit, delivery booking, stock move, refund, Shop write, or managed activation runs from this file.'],
  ['No product publish, customer message, payment capture, wallet debit, delivery booking, stock move, refund, Shop write, or managed activation runs from this file.', 'No product publish, customer message, payment capture, wallet debit, delivery booking, stock move, refund, Shop write, or go-live action runs from this file.'],
  ['Download Ecommerce managed store activation packet', 'Download Ecommerce managed store go-live file'],
  ['Ecommerce activation packet downloaded. No product, customer, payment, delivery, stock, Shop, or managed workspace state changed.', 'Ecommerce go-live file downloaded. No product, customer, payment, delivery, stock, Shop, or managed workspace state changed.'],
  ['Import catalog for activation', 'Import catalog for go-live'],
  ['Save storefront for activation', 'Save store before going live'],
  ['Repair checkout activation', 'Repair checkout checks'],
  ['Clear Shop activation queue', 'Clear Shop review queue'],
  ['Review payment activation', 'Review payment checks'],
  ['Review delivery activation', 'Review delivery checks'],
  ['Managed store activation ready', 'Managed store ready'],
  ['Download activation packet', 'Download go-live file'],
  ['Free local only', 'Download file'],
  ['Managed controls', 'Account controls'],
  ['Managed gate', 'Needs order'],
  ['After approval', 'After review'],
  ['Saved fingerprint', 'Saved check'],
  ['Storefront', 'Store'],
  ['Handoff', 'Output'],
  ['Shop handoff', 'Shop review'],
  ['Save storefront before checkout', 'Save store before checkout'],
  ['Save storefront before delivery setup', 'Save store before delivery setup'],
  ['Save storefront before delivery templates', 'Save store before delivery templates'],
  ['Save storefront before recovery', 'Save store before recovery'],
  ['Save storefront before follow-up', 'Save store before follow-up'],
  ['Save storefront before reply templates', 'Save store before reply templates'],
  ['AI prepares pickup, local delivery, manual QR review, quote expiry, and Shop confirmation from the same checkout request.', 'Review pickup, local delivery, manual QR payment, quote expiry, and Shop confirmation from the same checkout request.'],
  ['AI guides capture, pricing, available-to-promise, fulfilment, and returns from the same Shop-controlled source.', 'Follow capture, pricing, available-to-promise, fulfilment, and returns from the same Shop-controlled source.'],
  ['AI prepares a local delivery zone, fee, rider handoff, and payment review packet from the customer request.', 'Prepare a local delivery zone, fee, rider assignment, and payment review from the customer request.'],
  ['AI turns repeated delivery requests into reusable area, fee, rider, payment, and cut-off templates.', 'Build reusable area, fee, rider, payment, and cut-off templates from repeated delivery requests.'],
  ['AI prepares stale quote review, aged request recovery, and a safe cart draft from the same Shop-controlled source.', 'Prepare stale quote review, aged request recovery, and a safe cart draft from the same Shop-controlled source.'],
  ['AI prepares the next owner-reviewed customer update from quote expiry, stock risk, payment state, delivery mode, and Shop review status.', 'Prepare the next reviewed customer update from quote expiry, stock risk, payment state, delivery mode, and Shop review status.'],
  ['AI prepares owner-reviewed Viber, LINE, WeChat, and email reply templates from the same customer request evidence.', 'Prepare reviewed Viber, LINE, WeChat, and email reply templates from the same customer request evidence.'],
  ['Managed Shop inbox only. Stock, delivery, message, and payment still need Shop review.', 'Shop review inbox only. Stock, delivery, message, and payment still need Shop review.'],
  ['Needs owner check', 'Needs review'],
  ['Review the cart. Shop remains the only order, stock, delivery, refund, and payment authority.', 'Review the cart. Shop handles orders, stock, delivery, refunds, and payment review.'],
  ['Managed Website order intake', 'Website order review'],
  ['Managed intake only. Stock moves and an order is created only after the authenticated human confirmation.', 'Review only. Stock moves and orders are created only after a signed-in person confirms.'],
  ['Approved Website revision', 'Website request'],
  ['Operator ID', 'Staff ID'],
  ['OP-OWNER', 'OP-STAFF'],
  ['Accept intake', 'Accept request'],
  ['Ready for owner review', 'Ready for review'],
  ['Shop gate', 'Shop review'],
  ['owner review', 'review'],
  ['Owner draft only', 'Review draft only'],
  ['Confirm stock, payment, delivery, and owner approval before any send.', 'Confirm stock, payment, delivery, and review before any send.'],
  ['Order import review packet downloaded. No order import, customer message, payment, delivery booking, stock move, refund, Shop write, or managed activation ran.', 'Order import review file downloaded. No order import, customer message, payment, delivery booking, stock move, refund, Shop write, or go-live action ran.'],
  ['Owner fee review', 'Fee review'],
  ['Owner approves the imported catalog before managed activation.', 'Review the imported catalog before going live.'],
  ['Owner saves the exact customer view first.', 'Save the exact customer view first.'],
  ['Owner reviews the quote before sending to Shop.', 'Review the quote before sending to Shop.'],
  ['Owner keeps payment and customer messages locked.', 'Payment and customer messages stay locked.'],
])
for (const required of ['Run next step', 'Review an order batch', 'Upload CSV or paste channel orders only when needed.', 'Enterprise order controls', 'Inbox, payment, delivery, recovery, replies, and activation evidence.']) {
  const currentRequired = ecommerceLiveCopyUpdates.get(required) ?? required
  if (!ecommerceProductCorpus.includes(currentRequired)) throw new Error(`missing_live_ecommerce_simple_operator_context:${required}`)
}
for (const required of ['Try one customer order', 'Start sample order', 'Sample ready']) {
  if (!ecommerceProductCorpus.includes(required)) throw new Error(`missing_live_ecommerce_demo_first_context:${required}`)
}
for (const required of ['Order desk', 'Recommended Ecommerce next step', 'Agent job', 'Owner gate', 'Review Ecommerce requests in Shop', 'Prepare catalog import', 'Finish storefront setup', 'Review cart quote', 'Open storefront for ordering', 'Ecommerce request inbox', 'Request inbox', 'AI filters customer requests by stock risk, quote expiry, manual QR review, and delivery mode so the owner opens the right Shop review first.', 'No customer message, payment, delivery booking, stock move, refund, or Shop write runs here.', 'Request inbox filter', 'Open filtered request', 'Switch filter to find requests', 'Inbox ready for requests', 'Request inbox locked', 'Order ops cockpit', 'AI ranks order exceptions from the live queue, quote expiry, stock risk, and payment state. Shop still confirms every write.', 'Order import helper', 'The assistant prepares CSV, Viber, LINE, WeChat, email, and form order batches against the saved Shop catalog so owners review one clean Shop queue.', 'No customer message, payment, delivery booking, stock move, refund, or Shop write runs from this importer.', 'Open import setup', 'Download order template', 'Load sample order batch', 'Load sample Ecommerce order batch', 'Sample Ecommerce order batch loaded and reviewed locally. No order import, customer message, payment, delivery booking, stock move, refund, or Shop write ran.', 'Order repair checklist', 'Ready rows', 'Blocked rows', 'Next fix', 'Order intake guide', 'CSV, Viber, LINE, WeChat, email, form', 'Customer, SKU, quantity, fulfilment, payment, source proof', 'Ready rows, blocked rows, stock risk, missing fields', 'One reviewed packet for Shop queue approval', 'Download Ecommerce order import template', 'Order import template downloaded. No order import, customer message, payment, delivery booking, stock move, refund, or Shop write ran.', 'Order batch CSV', 'Review order batch', 'Download review packet', 'Ready for owner review', 'Repair before handoff', 'Order import batch reviewed locally. No order import, customer message, payment, delivery booking, stock move, refund, or Shop write ran.', 'Order import batch rejected locally. No Shop or customer action ran.', 'supermega.ecommerce.order_import_review_packet.v1', 'supermega-ecommerce-order-review-', 'Download Ecommerce order import review packet', 'Order import review packet downloaded. No order import, customer message, payment, delivery booking, stock move, refund, Shop write, or managed activation ran.', 'order_import', 'managed_activation', 'supermega-ecommerce-order-import-', 'customer_reference', 'source_message', 'Upload catalog first', 'Review imported orders', 'Ready for order upload', 'Save storefront first', 'CSV or messages', 'Download CSV', 'No auto submit', 'Ordering readiness', 'AI checks catalog, storefront fingerprint, quote readiness, Shop review queue, and safety mode before a customer request can move forward.', 'No customer message, payment, delivery, stock, refund, or Shop write runs from this panel.', 'Product recommendation', 'The assistant prepares the simplest sellable set from in-stock Shop items. You only save after review.', 'Use recommended products', 'Local selection', 'Product recommendation selected', 'no catalog, order, payment, delivery, stock, or Shop write ran.', 'Import Shop catalog', 'Choose sellable products', 'Repair storefront preview', 'Save ordering setup', 'Clear Shop review queue', 'Ready for reviewed orders', 'Ecommerce managed store activation packet', 'Managed store activation packet', 'AI packages catalog, storefront fingerprint, checkout quote controls, manual payment review, delivery template readiness, Shop review queue, and managed gate for store activation.', 'No product publish, customer message, payment capture, wallet debit, delivery booking, stock move, refund, Shop write, or managed activation runs from this packet.', 'supermega.ecommerce.managed_store_activation_packet.v1', 'browser_local_trial', 'pendingShopReviews', 'supportHandoff', 'Enable managed writes only after Postgres, RLS, auth, audit, and scheduler proof passes.', 'forbiddenActions', 'product_publish', 'customer_message_send', 'payment_capture', 'wallet_debit', 'delivery_booking', 'stock_move', 'refund_write', 'shop_write', 'managed_activation', 'supermega-ecommerce-activation-', 'Download Ecommerce managed store activation packet', 'Ecommerce activation packet downloaded. No product, customer, payment, delivery, stock, Shop, or managed workspace state changed.', 'Import catalog for activation', 'Save storefront for activation', 'Repair checkout activation', 'Clear Shop activation queue', 'Review payment activation', 'Review delivery activation', 'Managed store activation ready', 'Download activation packet', 'Saved fingerprint', 'Quote controlled', 'Review only', 'Template ready', 'Shop gate', 'owner review', 'Free local only', 'Managed controls', 'Catalog', 'Storefront', 'Checkout', 'Queue', 'Safety', 'Order lifecycle', 'One path from cart to return', 'AI guides capture, pricing, available-to-promise, fulfilment, and returns from the same Shop-controlled source.', 'No charge, message, refund, or stock write starts here.', 'Payment and delivery controls', 'AI prepares pickup, local delivery, manual QR review, quote expiry, and Shop confirmation from the same checkout request.', 'No card charge, wallet debit, driver booking, customer message, or settlement write runs here.', 'Import catalog before checkout', 'Save storefront before checkout', 'Review payment and delivery', 'Quote payment and delivery', 'Checkout controls ready', 'Delivery fee review controls', 'Delivery fee review', 'AI prepares a local delivery zone, fee, rider handoff, and payment review packet from the customer request.', 'No rider booking, fee charge, customer message, payment capture, stock move, refund, or Shop write runs here.', 'Import catalog before delivery setup', 'Save storefront before delivery setup', 'Review delivery zone and fee', 'Delivery template ready', 'Prepare delivery review', 'No booking', 'Delivery-area template controls', 'Delivery-area templates', 'AI turns repeated delivery requests into reusable area, fee, rider, payment, and cut-off templates.', 'No saved template, customer message, rider booking, fee charge, settlement write, stock move, or Shop write runs here.', 'Import catalog before delivery templates', 'Save storefront before delivery templates', 'Prepare delivery-area template', 'Template ready when requests arrive', 'Delivery templates locked', 'Prepare area template', 'After approval', 'Managed gate', 'Quote recovery controls', 'Quote recovery', 'AI prepares stale quote review, aged request recovery, and a safe cart draft from the same Shop-controlled source.', 'No customer message, discount, payment, delivery, refund, stock, or Shop write runs here.', 'Import catalog before recovery', 'Save storefront before recovery', 'Prepare quote refresh', 'Recover aged request', 'Open Shop recovery', 'Review recovery quote', 'Prepare recovery cart', 'Prepare quote recovery', 'Customer follow-up controls', 'Customer follow-up', 'AI prepares the next owner-reviewed customer update from quote expiry, stock risk, payment state, delivery mode, and Shop review status.', 'No SMS, email, Viber, WhatsApp, discount, payment, delivery, refund, stock, or Shop write runs here.', 'Import catalog before follow-up', 'Save storefront before follow-up', 'Draft availability update', 'Draft quote refresh', 'Draft payment clarification', 'Draft delivery confirmation', 'Draft Shop review update', 'Follow-up ready when orders arrive', 'Prepare follow-up draft', 'Channel reply template controls', 'Channel reply templates', 'AI prepares owner-reviewed Viber, LINE, WeChat, and email reply templates from the same customer request evidence.', 'No message send, clipboard copy, discount, payment, delivery booking, refund, stock move, or Shop write runs here.', 'Reply channel template', 'Import catalog before reply templates', 'Save storefront before reply templates', 'Prepare reviewed channel reply', 'Reply templates ready', 'Reply templates locked', 'Prepare reply template', 'No send', 'Owner draft only', 'Draft only', 'Expiring', 'Aged', 'Draft', 'Boundary', 'Shop review', 'Delivery', 'Pickup', 'Expiry', 'Control', 'No customer send', 'Capture', 'Price', 'ATP', 'Fulfil', 'Return', 'Priority', 'SLA', 'Stock risk', 'Handoff', 'Shop owns writes', 'Order autopilot', 'Repair checkout recovery', 'Confirm reviewed quote', 'Shop handoff', 'Needs owner check', 'Payment', 'Not charged', 'Browser-local quote only. No stock, delivery, message, payment, or Shop record changes here.']) {
  const currentRequired = ecommerceLiveCopyUpdates.get(required) ?? required
  if (!ecommerceProductCorpus.includes(currentRequired)) throw new Error(`missing_live_ecommerce_context:${required}`)
}
const websiteLiveCopyUpdates = new Map([
  ['Website guided jobs', 'Website setup steps'],
  ['Three jobs launch the website.', 'Three steps finish the website.'],
  ['Inquiries stay in this managed workspace with ownership and decision history.', 'Inquiries stay in this company account with ownership and decision history.'],
  ['Owner gate', 'Review'],
  ['Record owner approval', 'Final review'],
  ['Record approval evidence', 'Add review notes'],
  ['Record release snapshot', 'Save website file'],
  ['Prepare rollout plan', 'Review go-live plan'],
  ['Static package plus managed rollout plan', 'Static package plus go-live plan'],
  ['Website launch cockpit', 'Website file checklist'],
  ['AI turns content checks, owner approval, static package, and rollout boundary into one launch queue. No domain, publish, or deployment action runs here.', 'Fix the pages, add review notes, then create one website file.'],
  ['Website lead capture readiness', 'Inquiry inbox'],
  ['AI checks business brief, contact path, content proof, owner approval, and release package before the site can capture a real customer request. No form send, customer message, domain, publish, CRM, or Shop write runs from this panel.', 'Capture and route inquiries'],
  ['Website managed rollout packet', 'Website file checklist'],
  ['Managed rollout packet', 'Website file checklist'],
  ['AI packages domain setup, form routing, analytics plan, approved content, static snapshot, and owner rollout gate for managed activation.', 'Check and download the site'],
  ['No DNS change, publish, form send, analytics install, CRM write, Shop write, or deployment action runs from this packet.', 'No deployment, domain, payment, stock, message, or order change happens here.'],
  ['Prepare managed rollout', 'Review go-live plan'],
  ['Download activation packet', 'Download site'],
  ['Owner maps DNS', 'You decide where it goes live.'],
  ['Owner rollout', 'Go-live review'],
  ['Free local only', 'This device only'],
  ['Handoff', 'File'],
  ['Package', 'File'],
  ['Publish gate', 'Final review'],
  ['No deploy here', 'Not online yet'],
  ['Review release', 'Prepare website file'],
  ['Managed Website ·', 'Company account ·'],
])
for (const required of ['Website agent queue', 'Recommended Website agent job', 'Agent job', 'Owner gate', 'Start from business brief', 'Review unsaved site edits', 'Fix content readiness', 'Record owner approval', 'Record release snapshot', 'Prepare rollout plan', 'Website generator guide', 'Bring any business. Get a reviewed site package.', 'AI turns a simple business brief into a complete website draft and launch packet.', 'Business facts, offers, proof, photos, links', 'Pages, copy, CTAs, SEO basics, release checklist', 'Brand, claims, contact route, pricing, proof', 'Static package plus managed rollout plan', 'Website launch cockpit', 'AI turns content checks, owner approval, static package, and rollout boundary into one launch queue. No domain, publish, or deployment action runs here.', 'Website lead capture readiness', 'AI checks business brief, contact path, content proof, owner approval, and release package before the site can capture a real customer request. No form send, customer message, domain, publish, CRM, or Shop write runs from this panel.', 'Website managed rollout packet', 'Managed rollout packet', 'AI packages domain setup, form routing, analytics plan, approved content, static snapshot, and owner rollout gate for managed activation.', 'No DNS change, publish, form send, analytics install, CRM write, Shop write, or deployment action runs from this packet.', 'Fix rollout blockers', 'Record approval evidence', 'Build static package', 'Prepare managed rollout', 'Download activation packet', 'Owner maps DNS', 'Not connected', 'Route planned', 'Need CTA', 'Plan ready', 'Needs package', 'Owner rollout', 'Free local only', 'Start business brief', 'Save site edits', 'Fix capture blockers', 'Add contact path', 'Build release package', 'Lead capture ready', 'Brief', 'Contact', 'Content', 'Approval', 'Handoff', 'Priority', 'Readiness', 'Approval', 'Package', 'Publish gate', 'No deploy here']) {
  const currentRequired = websiteLiveCopyUpdates.get(required) ?? required
  if (!websiteChunk.includes(currentRequired)) throw new Error(`missing_live_website_context:${required}`)
}
for (const required of ['Make this website yours', 'Example ready', 'Back to demo', 'Mingalar Fresh Mart', 'families and office buyers in Yangon', 'Daily groceries, pantry packs, and local delivery with clear pickup windows.', 'Public proof: same-day neighborhood delivery, visible prices, and a reviewed phone or chat contact route.', 'Website starter brief generated']) {
  if (!websiteChunk.includes(required)) throw new Error(`missing_live_website_starter_context:${required}`)
}
for (const required of ['Managed activation evidence plan', 'Evidence to go live', 'proof gates ready']) {
  if (!activationRunbookChunk.includes(required)) throw new Error(`missing_live_activation_runbook_context:${required}`)
}
for (const forbidden of ['Pick a track. Run work.', 'Handled by SuperMega', 'Approved by owner', 'Factory MES', 'Website catalog', 'Online orders', 'Open track', 'Set up data', 'Choose what you want to run.', 'Each product opens directly to a working sample.', 'SuperMega HQ', 'One next action for the company', 'Agents prepare work', 'pos.supermega.dev', 'ytf.supermega.dev', 'Yangon Tyre', 'ytf-plant-a']) {
  if (assetCorpus.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`retired_live_context:${forbidden}`)
}
}

let deploymentFunctions = null
if (protectedPreview) {
  const npxArgs = ['--yes', 'vercel@56.1.0', 'inspect', baseUrl, '--format=json']
  const executable = process.platform === 'win32' ? process.execPath : 'npx'
  const executableArgs = process.platform === 'win32'
    ? [resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), ...npxArgs]
    : npxArgs
  let deploymentOutput
  try {
    deploymentOutput = execFileSync(executable, executableArgs, {
      encoding: 'utf8',
      env: cliEnv,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new Error(`protected_preview_inspect_failed:${describeCliFailure(error)}`)
  }
  const deployment = JSON.parse(deploymentOutput)
  deploymentFunctions = (deployment.builds || [])
    .flatMap((build) => build.output || [])
    .filter((output) => output.type === 'lambda')
    .map((output) => output.path)
    .sort()
  if (JSON.stringify(deploymentFunctions) !== JSON.stringify(['api/app'])) throw new Error(`deployment_function_surface_wrong:${deploymentFunctions.join(',')}`)
}

console.log(JSON.stringify({ ok: true, contract: 'supermega_app_live', baseUrl, verificationScope, expectedCommit: expectedCommit || null, routes, release, operatingMode: health.operating_mode, agentScheduler: cloud.status, releaseAssetVerification, legacyCopyAudit, deploymentFunctions }, null, 2))
