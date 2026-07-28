import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const manifest = JSON.parse(await readFile(new URL('../site-manifest.json', import.meta.url), 'utf8'))
const baseUrl = String(process.env.APP_BASE_URL || 'https://app.supermega.dev').replace(/\/$/, '')
const expectedCommit = String(process.env.EXPECTED_RELEASE_COMMIT || '').trim().toLowerCase()
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
if (expectedCommit && String(release.commit || '').toLowerCase() !== expectedCommit) throw new Error(`release_commit_mismatch:${release.commit}`)

const health = JSON.parse((await get('/api/health')).body)
if (health.status !== 'ready' || health.service !== 'supermega-service') throw new Error('canonical_api_unavailable')
if (!['isolated_demo', 'managed_trial'].includes(health.operating_mode)) throw new Error('unknown_operating_mode')
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

const cloud = JSON.parse((await get('/api/cloud-autonomy/status')).body)
if (!['ready', 'degraded'].includes(cloud.status) || cloud.runtime_target !== 'hosted_vercel_api' || cloud.pc_dependency !== false) throw new Error('hosted_agent_runtime_contract_wrong')
if (JSON.stringify(cloud.scheduler?.queue_job_types) !== JSON.stringify(['task_triage', 'ops_watch'])) throw new Error('hosted_agent_queue_jobs_wrong')
if (JSON.stringify(cloud.scheduler?.daily_job_types) !== JSON.stringify(['founder_brief', 'github_release_watch'])) throw new Error('hosted_agent_daily_jobs_wrong')
if (cloud.scheduler?.redirects_allowed !== false) throw new Error('hosted_agent_redirect_policy_wrong')
if (cloud.scheduler?.activation_required !== true || cloud.scheduler?.activation_environment_key !== 'SUPERMEGA_HOSTED_SCHEDULER_ENABLED') throw new Error('hosted_agent_activation_contract_wrong')
if (cloud.status === 'ready' && cloud.scheduler?.configured !== true) throw new Error('hosted_agent_readiness_mismatch')
if (cloud.status === 'ready' && cloud.scheduler?.activation_enabled !== true) throw new Error('hosted_agent_activation_mismatch')

const rootHtml = pages.get('/')
const scriptPaths = [...rootHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1])
const cssPaths = [...rootHtml.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1])
const assetCorpus = (await Promise.all([...scriptPaths, ...cssPaths].map(async (path) => (await get(path)).body))).join('\n')
const productHomeReadinessChunkPath = /assets\/ProductHomeReadiness-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!productHomeReadinessChunkPath) throw new Error('product_home_readiness_chunk_missing')
const productHomeReadinessChunk = (await get(`/${productHomeReadinessChunkPath}`)).body
const settingsChunkPath = /assets\/SettingsPage-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!settingsChunkPath) throw new Error('settings_chunk_missing')
const settingsChunk = (await get(`/${settingsChunkPath}`)).body
const clientDataOnboardingChunkPath = /assets\/ClientDataOnboarding-[A-Za-z0-9_-]+\.js/.exec(settingsChunk)?.[0]
if (!clientDataOnboardingChunkPath) throw new Error('client_data_onboarding_chunk_missing')
const clientDataOnboardingChunk = (await get(`/${clientDataOnboardingChunkPath}`)).body
const ecommerceChunkPath = /assets\/EcommerceProduct-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!ecommerceChunkPath) throw new Error('ecommerce_chunk_missing')
const ecommerceChunk = (await get(`/${ecommerceChunkPath}`)).body
const websiteChunkPath = /assets\/WebsiteProduct-[A-Za-z0-9_-]+\.js/.exec(assetCorpus)?.[0]
if (!websiteChunkPath) throw new Error('website_chunk_missing')
const websiteChunk = (await get(`/${websiteChunkPath}`)).body
const activationRunbookChunkPath = /assets\/ManagedActivationRunbook-[A-Za-z0-9_-]+\.js/.exec(settingsChunk)?.[0]
if (!activationRunbookChunkPath) throw new Error('managed_activation_runbook_chunk_missing')
const activationRunbookChunk = (await get(`/${activationRunbookChunkPath}`)).body
for (const required of ['SUPERMEGA', 'Choose a product. Run work.', 'Free workspace', 'Premium activation', 'Managed data, AI context', 'Check readiness', 'Open product', 'Set up product', 'Shop', 'Plant', 'Website', 'Ecommerce', 'Sample workspace', manifest.brand.colors.accent, manifest.brand.colors.ink]) {
  if (!assetCorpus.includes(required)) throw new Error(`missing_live_context:${required}`)
}
for (const required of ['Launch readiness', 'Free proves value. Premium activates controls.', 'Use Activation handoff', 'Premium can learn only from approved data and behavior memory.', 'Open activation']) {
  if (!productHomeReadinessChunk.includes(required)) throw new Error(`missing_live_launch_readiness_context:${required}`)
}
for (const required of ['supermega.behavior-trail.v1', 'agent_job_seen', 'agent_job_chosen']) {
  if (!assetCorpus.includes(required)) throw new Error(`missing_live_behavior_context:${required}`)
}
for (const required of ['Plant agent queue', 'Recommended Plant agent job', 'Agent job', 'Owner gate', 'Record next job output', 'Contain urgent Plant problems', 'Review quality holds', 'Close WCM records', 'Build shift handoff', 'Plant control', 'Contain urgent problems', 'Close WCM work', 'Jobs', 'Quality', 'WCM', 'Materials', 'Handoff', 'Write gate', 'Owner confirms every production, quality, WCM, maintenance, material, and shift-handoff write before Plant changes.']) {
  if (!assetCorpus.includes(required)) throw new Error(`missing_live_plant_context:${required}`)
}
for (const required of ['Shop agent queue', 'Recommended Shop agent job', 'Agent job', 'Owner gate', 'Restore Shop write readiness', 'Review online order requests', 'Finish fulfilment queue', 'Receive purchase orders', 'Reorder low stock', 'Set up stock locations', 'Order control', 'Review Ecommerce inbox', 'Reconcile payment exceptions', 'Online inbox', 'Write gate', 'Owner confirms every order, payment, refund, delivery, cancellation, and stock change before Shop writes.']) {
  if (!assetCorpus.includes(required)) throw new Error(`missing_live_shop_context:${required}`)
}
for (const required of ['Start guided sample', 'Request managed trial', 'Export evidence before managed import.', 'supermega_trial_evidence', 'activationRows', 'activationEvidencePlan', 'activationManifest', 'activationManifestRows', 'schedulerActivation', 'schedulerActivationRows', 'version:22', 'supermega.managed_trial_request.v1', 'managedTrialRequest', 'managedTrialRequestRows', 'Managed trial request', 'What support needs', 'Download request packet', 'No external send or managed write from this packet', 'learningRows', 'learningPlanRows', 'agentPlanRows', 'aiContextQualityRows', 'contextHandoffManifest', 'contextHandoffRows', 'supermega.ai_context_handoff.v1', 'allowedUses', 'forbiddenActions', 'managedWorkspaceProvisioningPacket', 'provisioningRows', 'supermega.managed_workspace_provisioning.v1', 'requiredControls', 'forbiddenUntilProvisioned', 'copy_browser_storage_to_production', 'behaviorTrail', 'agentBehaviorRows', 'Premium AI context', 'What the system can learn', 'Premium agent plan', 'What the agent can run', 'AI context quality', 'What premium can safely use', 'Premium learning starts only when source records, behavior, decisions, and managed controls are present in the exported evidence.', 'AI context handoff', 'What premium receives', 'Draft and rank only', 'No send/write/train', 'This manifest tells support and the managed agent what it may use, what it must ignore, and which actions remain forbidden.', 'Provisioning packet', 'How this becomes a real workspace', 'Premium activation creates a managed tenant from exported evidence only after roles, data, controls, and write gates are verified.', 'Agent behavior memory', 'Behavior memory', 'What owners keep choosing', 'Activation manifest', 'What automation may do next', 'Scheduler activation', 'Autopilot stays blocked until proof passes', 'Hosted agents can run only after signed evidence, protected secrets, worker allowlist, budget grants, and no-redirect checks are ready.', 'Export AI context package']) {
  if (!settingsChunk.includes(required)) throw new Error(`missing_live_settings_context:${required}`)
}
for (const required of ['Import autopilot', 'Import coach', 'Next action', 'Write boundary', 'Start with a CSV or sample so SuperMega can map columns and inspect rows locally.', 'Managed check before write', 'Local/export only', 'Activation handoff', 'Download activation package', 'Run managed check', 'Free mode can export the package for support review without sending data from the browser.', 'Server validation passed with zero records written']) {
  if (!clientDataOnboardingChunk.includes(required)) throw new Error(`missing_live_import_coach_context:${required}`)
}
for (const required of ['AI order desk', 'Recommended Ecommerce agent job', 'Agent job', 'Owner gate', 'Review Ecommerce requests in Shop', 'Prepare catalog import', 'Finish storefront setup', 'Review cart quote', 'Open storefront for ordering', 'Order ops cockpit', 'AI ranks order exceptions from the live queue, quote expiry, stock risk, and payment state. Shop still confirms every write.', 'Priority', 'SLA', 'Stock risk', 'Handoff', 'Shop owns writes', 'Order autopilot', 'Repair checkout recovery', 'Confirm reviewed quote', 'Shop handoff', 'Needs owner check', 'Payment', 'Not charged', 'Browser-local quote only. No stock, delivery, message, payment, or Shop record changes here.']) {
  if (!ecommerceChunk.includes(required)) throw new Error(`missing_live_ecommerce_context:${required}`)
}
for (const required of ['Website agent queue', 'Recommended Website agent job', 'Agent job', 'Owner gate', 'Start from business brief', 'Review unsaved site edits', 'Fix content readiness', 'Record owner approval', 'Record release snapshot', 'Prepare rollout plan', 'Website launch cockpit', 'AI turns content checks, owner approval, static package, and rollout boundary into one launch queue. No domain, publish, or deployment action runs here.', 'Priority', 'Readiness', 'Approval', 'Package', 'Publish gate', 'No deploy here']) {
  if (!websiteChunk.includes(required)) throw new Error(`missing_live_website_context:${required}`)
}
for (const required of ['Managed activation evidence plan', 'Evidence to go live', 'proof gates ready']) {
  if (!activationRunbookChunk.includes(required)) throw new Error(`missing_live_activation_runbook_context:${required}`)
}
for (const forbidden of ['Pick a track. Run work.', 'Handled by SuperMega', 'Approved by owner', 'Factory MES', 'Website catalog', 'Online orders', 'Open track', 'Set up data', 'Choose what you want to run.', 'Each product opens directly to a working sample.', 'SuperMega HQ', 'One next action for the company', 'Agents prepare work', 'pos.supermega.dev', 'ytf.supermega.dev', 'Yangon Tyre', 'ytf-plant-a']) {
  if (assetCorpus.toLowerCase().includes(forbidden.toLowerCase())) throw new Error(`retired_live_context:${forbidden}`)
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

console.log(JSON.stringify({ ok: true, contract: 'supermega_app_live', baseUrl, routes, release, operatingMode: health.operating_mode, agentScheduler: cloud.status, deploymentFunctions }, null, 2))
