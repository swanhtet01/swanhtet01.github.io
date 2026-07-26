import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  COMPANY_CAPACITY_CLAIM_CONTRACT,
  COMPANY_CAPACITY_CLAIM_TTL_SECONDS,
  listCompanyAgents,
  MAX_CYCLE_AGENTS,
  MAX_REGISTERED_COMPANY_AGENTS,
  MAX_RUNNING_COMPANY_CYCLES,
} from '../kernel/agent-company.mjs'

const root = resolve(import.meta.dirname, '..')
const [readme, now, qaBrief, workboard, current, manifestText, portfolioText, workforceText, agentWorkspaceText, research, agentSecurity, databaseRehearsalText, releaseReconciliation] = await Promise.all([
  readFile(resolve(root, 'hq', 'README.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'NOW.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'CODEX-PRODUCT-QA-BRIEF.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'WORKBOARD.md'), 'utf8'),
  readFile(resolve(root, 'CURRENT.md'), 'utf8'),
  readFile(resolve(root, 'site-manifest.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'portfolio.json'), 'utf8'),
  readFile(resolve(root, 'agent_os', 'workforce', 'supermega_build_workforce.json'), 'utf8'),
  readFile(resolve(root, 'agent_os', 'resources', 'supermega_core_agent_workspace.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'product-rd-2026-07.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'agent-operations-security-2026-07-26.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'postgres17-rehearsal.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'release-reconciliation-2026-07-26.md'), 'utf8'),
])

const manifest = JSON.parse(manifestText)
const portfolio = JSON.parse(portfolioText)
const workforce = JSON.parse(workforceText)
const agentWorkspace = JSON.parse(agentWorkspaceText)
const databaseRehearsal = JSON.parse(databaseRehearsalText)
const kernelRoster = listCompanyAgents()
const kernelCrewCapabilities = kernelRoster.flatMap((agent) => [agent.crew, ...agent.capabilityCrews])
const failures = []
const requireContract = (name, condition) => { if (!condition) failures.push(name) }
const product = (id) => portfolio.products?.find((entry) => entry.id === id)
const sharedCapability = (id) => portfolio.sharedCapabilities?.find((entry) => entry.id === id)
const internalSystem = (id) => portfolio.internalSystems?.find((entry) => entry.id === id)

requireContract('portfolio schema', portfolio.schemaVersion === 'supermega.hq.portfolio.v3')
requireContract('portfolio is current',
  portfolio.updatedAt === '2026-07-26'
  && now.includes('Updated: 2026-07-26')
  && current.includes('Last confirmed: 2026-07-26'))
requireContract('customer portfolio is explicit',
  portfolio.products?.map((entry) => entry.id).join(',') === 'shop,plant,website,ecommerce')
requireContract('customer paths are canonical',
  portfolio.products?.map((entry) => entry.path).join(',') === '/shop/,/plant/,/website/,/ecommerce/')
requireContract('AI is shared infrastructure, not a fifth product',
  portfolio.sharedCapabilities?.map((entry) => entry.id).join(',') === 'ai-assistance'
  && sharedCapability('ai-assistance')?.kind === 'shared-capability'
  && sharedCapability('ai-assistance')?.compatibilityPath === '/agents/'
  && sharedCapability('ai-assistance')?.appAnchor === '/work/?view=agents')
requireContract('product lifecycle is explicit',
  portfolio.productLifecycle?.join(',') === 'discover,define,build,release,learn')
requireContract('one bounded agent operating model is authoritative',
  portfolio.agentOperatingModel?.mode === 'bounded-demand-driven'
  && portfolio.agentOperatingModel?.manager === 'CEO / Codex integrator'
  && portfolio.agentOperatingModel?.buildTeams?.join(',') === 'product,engineering,growth,finance-risk'
  && portfolio.agentOperatingModel?.registeredRoleLimit === 12
  && portfolio.agentOperatingModel?.activeAssignmentLimit === 4
  && portfolio.agentOperatingModel?.batchJobLimit === 4
  && portfolio.agentOperatingModel?.maxAgentsPerCycle === 2
  && portfolio.agentOperatingModel?.validatedCrewCapabilities === 15
  && portfolio.agentOperatingModel?.scaleToZero === true
  && portfolio.agentOperatingModel?.idleCapabilitiesConsumeCompute === false
  && portfolio.agentOperatingModel?.dynamicDelegation === false
  && portfolio.agentOperatingModel?.recursiveDelegation === false
  && portfolio.agentOperatingModel?.consequentialAuthority === 'founder')
requireContract('agent capacity agrees across HQ, coordinator, and Kernel',
  workforce.runtime_policy?.max_registered_specialists === portfolio.agentOperatingModel?.registeredRoleLimit
  && workforce.runtime_policy?.max_running === portfolio.agentOperatingModel?.activeAssignmentLimit
  && workforce.runtime_policy?.max_batch_jobs === portfolio.agentOperatingModel?.batchJobLimit
  && workforce.runtime_policy?.scale_to_zero === portfolio.agentOperatingModel?.scaleToZero
  && workforce.runtime_policy?.registered_specialists_consume_compute === portfolio.agentOperatingModel?.idleCapabilitiesConsumeCompute
  && workforce.build_teams?.map((entry) => entry.id).join(',') === portfolio.agentOperatingModel?.buildTeams?.join(',')
  && MAX_REGISTERED_COMPANY_AGENTS === portfolio.agentOperatingModel?.registeredRoleLimit
  && kernelRoster.length === MAX_REGISTERED_COMPANY_AGENTS
  && MAX_RUNNING_COMPANY_CYCLES === portfolio.agentOperatingModel?.activeAssignmentLimit
  && workforce.runtime_policy?.capacity_claim_contract === COMPANY_CAPACITY_CLAIM_CONTRACT
  && workforce.runtime_policy?.capacity_claim_ttl_seconds === COMPANY_CAPACITY_CLAIM_TTL_SECONDS
  && MAX_CYCLE_AGENTS === portfolio.agentOperatingModel?.maxAgentsPerCycle
  && kernelCrewCapabilities.length === portfolio.agentOperatingModel?.validatedCrewCapabilities
  && new Set(kernelCrewCapabilities).size === kernelCrewCapabilities.length)
requireContract('workspace consumes one capacity authority without repeating ceilings',
  agentWorkspace.resource_id === 'supermega-core-agent-workspace-v3'
  && agentWorkspace.capacity_authority === 'repository://agent_os/workforce/supermega_build_workforce.json'
  && !Object.hasOwn(agentWorkspace, 'runtime_policy')
  && agentWorkspace.knowledge_resources?.some((entry) =>
    entry.id === 'workforce'
    && entry.reference === agentWorkspace.capacity_authority
    && entry.authority === 'sole agent capacity and team contract')
  && !/\b(?:175|256)\b/.test(agentWorkspaceText))
requireContract('workspace storage release gate denies bucket enumeration',
  agentWorkspace.trust_boundaries?.some((entry) =>
    entry.id === 'private-storage'
    && entry.rule.includes('bucket listing are denied')
    && entry.release_evidence?.join(',') === 'bucket inventory,anonymous listing denied,cross-tenant listing denied,short-lived authorized object access'))
requireContract('agent roster consolidation is recorded',
  workboard.includes('Current accepted operating checkpoint: `63a245f`')
  && workboard.includes('| OPS-011 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('12 active specialist identities while preserving all 15 validated crew capabilities')
  && workboard.includes('all eight fixed playbooks')
  && workboard.includes('| OPS-012 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('zero Agent Runs in 30 days')
  && workboard.includes('| OPS-014 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('workforce and capacity contracts to v2')
  && workboard.includes('execution follows the same order instead of reverting to FIFO')
  && workboard.includes('| OPS-015 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('automated admission due-only')
  && workboard.includes('before either a run or reservation is written')
  && workboard.includes('explicit manual runs remain available')
  && workboard.includes('| OPS-016 | CEO + Security Codex | done-local |')
  && workboard.includes('narrowing-only over the compiled app and canonical Cloud Run hosts')
  && workboard.includes('arbitrary, mixed, URL-shaped, and empty overrides fail before any request')
  && workboard.includes('| OPS-017 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('one bounded recovery attempt only to the four read-only')
  && workboard.includes('callers may narrow but cannot expand the policy')
  && workboard.includes('stale token')
  && workboard.includes('| OPS-018 | CEO + Release Security Codex | done-local |')
  && workboard.includes('atomically reserves the exact approved action and target before any deploy subprocess starts')
  && workboard.includes('leaves the approval non-reusable')
  && workboard.includes('| OPS-019 | CEO + Release Security Codex | done-local |')
  && workboard.includes('remove the unlinked claimable-preview service')
  && workboard.includes('nine required verification contracts')
  && workboard.includes('Local project linkage and exact Vercel environment credentials are absent')
  && workboard.includes('| OPS-020 | CEO + Release Security Codex | done-local |')
  && workboard.includes('deploy --prebuilt')
  && workboard.includes('all 213 Python tests, 61 coordinated-release checks')
  && workboard.includes('| OPS-021 | CEO + Agent Operations Codex | done-local |')
  && workboard.includes('| OPS-022 | CEO + Agent Operations / Security Codex | done-local |')
  && workboard.includes('four atomic durable capacity slots with 120-second stale recovery')
  && workboard.includes('zero production Agent Run projects in both 30 and 90 days')
  && workboard.includes('| OPS-023 | CEO + Release / Security Codex | done-local |')
  && workboard.includes('Vercel production the sole recurring scheduler')
  && workboard.includes('Cloud Tasks is enqueue-on-demand and Google Cloud Scheduler mutation is retired')
  && workboard.includes('Current accepted agent-operations checkpoint: `6c19084`')
  && now.includes('agent operations `6c19084`')
  && now.includes('operations `63a245f`')
  && now.includes('default workspace no longer duplicates a 256-role ceiling'))
requireContract('agent security brief is reconciled to current controls',
  agentSecurity.includes('Agent-operations checkpoint: `6c19084`')
  && agentSecurity.includes('Agent visibility, execution, and preview deployment use separate capabilities')
  && agentSecurity.includes('The root development Compose entry point is retired as `services: {}`')
  && agentSecurity.includes('An environment value cannot add a third credential destination')
  && agentSecurity.includes('Expired leases may reclaim the same run once only for the four read-only jobs')
  && agentSecurity.includes('Preview deployment approval is atomically reserved before a deploy subprocess starts')
  && agentSecurity.includes('Vercel production the sole recurring scheduler')
  && agentSecurity.includes('capped at 97 invocations/day')
  && agentSecurity.includes('hosted compliance remains unverified')
  && agentSecurity.includes('The unlinked claimable-preview service is retired')
  && agentSecurity.includes('Human review is bound to one clean commit')
  && agentSecurity.includes('builds once, rechecks the canonical project')
  && agentSecurity.includes('pinned `--prebuilt`')
  && agentSecurity.includes('four atomic durable capacity claims')
  && agentSecurity.includes('old Google Cloud Scheduler entry point is now a read-only compatibility shim')
  && agentSecurity.includes('no production project activity over 30 or 90 days')
  && agentSecurity.includes('prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG')
  && agentSecurity.includes('Measure the ROG Ally control plane')
  && !agentSecurity.includes('queue viewing can authorize processing or preview deployment')
  && !agentSecurity.includes('root development compose publishes services'))
requireContract('product QA brief matches current portfolio',
  qaBrief.includes('Work item: `QA-003`')
  && qaBrief.includes('Mode: read-only')
  && qaBrief.includes('Website and Ecommerce are local release candidates')
  && qaBrief.includes('AI assistance remains a shared, evaluation-gated capability')
  && ['/shop/?tab=orders', '/shop/?tab=inventory', '/plant/?tab=production', '/plant/?tab=control', '/website/', '/ecommerce/', '/agents/']
    .every((route) => qaBrief.includes(`\`${route}\``))
  && qaBrief.includes('Do not edit files or browser data.')
  && !qaBrief.includes('Work item: `QA-002`')
  && !qaBrief.includes('Ecommerce and AI Agent Solutions are visibly planned'))
requireContract('product QA brief is discoverable from assignment authority',
  workboard.includes('| QA-003 | Product / QA Codex | done-local |')
  && workboard.includes('Checkpoint `dadb013` passes 10 routes at 390/1280 px')
  && workboard.includes('focus lands on `#workspace-main`'))
requireContract('accepted core checkpoints lead directly to real work',
  workboard.includes('Current accepted product checkpoint: `9ba8569`')
  && workboard.includes('| ENG-051 | Shop + Product UX Codex | done-local |')
  && workboard.includes('| ENG-052 | Plant + Product UX Codex | done-local |')
  && workboard.includes('| ENG-053 | Platform Codex | done-local |')
  && workboard.includes('| ENG-054 | Ecommerce + Product UX Codex | done-local |')
  && workboard.includes('| ENG-055 | Platform Codex | done-local |')
  && workboard.includes('| ENG-056 | Platform Codex | done-local |')
  && workboard.includes('| ENG-057 | Website + Product UX Codex | done-local |')
  && workboard.includes('| ENG-058 | Shop + Product UX Codex | done-local |')
  && workboard.includes('| ENG-059 | Plant + Product UX Codex | done-local |')
  && workboard.includes('| ENG-060 | Home + Product UX Codex | done-local |')
  && workboard.includes('| ENG-061 | Products + Product UX Codex | done-local |')
  && workboard.includes('| ENG-062 | Ecommerce + Product UX Codex | done-local |')
  && workboard.includes('| ENG-063 | Shop + Ecommerce UX Codex | done-local |')
  && workboard.includes('| ENG-064 | Shop + Ecommerce UX Codex | done-local |')
  && workboard.includes('| ENG-065 | Shop + Ecommerce UX Codex | done-local |')
  && workboard.includes('| ENG-066 | Product Platform + Data UX Codex | done-local |')
  && workboard.includes('| ENG-071 | Product Platform + Data UX Codex | done-local |')
  && workboard.includes('| ENG-073 | Product Platform + Client UX Codex | done-local |')
  && workboard.includes('| ENG-074 | Product Platform + Architecture Codex | done-local |')
  && workboard.includes('| ENG-075 | Shop + Data Engineering Codex | ready |')
  && workboard.includes('| ENG-076 | Plant + Manufacturing Engineering Codex | queued |')
  && workboard.includes('| ENG-077 | Website + Product Engineering Codex | queued |')
  && workboard.includes('| ENG-078 | Ecommerce + Commerce Engineering Codex | queued |')
  && workboard.includes('Checkpoint `ec98a12` supports Shop catalog, Plant jobs, Website pages, and Ecommerce merchandising')
  && workboard.includes('All 44 client-onboarding runtime checks')
  && workboard.includes('The leading row states `4 below reorder`')
  && workboard.includes('centers the existing form, and focuses its Job selector')
  && workboard.includes('largest JavaScript chunk falls from 498,962 to 462,746 bytes')
  && workboard.includes('removes repeated product-level `Save first` controls')
  && workboard.includes('serves only local `/api/health` as HTTP 200')
  && workboard.includes('makes `npm run dev` start canonical FastAPI and Vite together on loopback')
  && workboard.includes('centers and focuses Business name after a blank submit')
  && workboard.includes('makes `Choose payment` open the existing options')
  && workboard.includes('moves Open problems from roughly 718 to 329 px on mobile')
  && workboard.includes('routes a Plant card with `1 issue` directly')
  && workboard.includes('changes `Choose a workspace` to `Choose a product`')
  && workboard.includes('focuses Customer view after local or managed Save')
  && workboard.includes('focuses the existing Payment select when the guarded Ecommerce draft opens in Shop')
  && workboard.includes('replaces the four-line generated-ID title with `Review Ecommerce order`')
  && workboard.includes('reopens the exact Ecommerce composer after Cancel')
  && workboard.includes('Create a reusable client-template and import foundation for Shop, Plant, Website, and Ecommerce')
  && workboard.includes('one-tap sample preview through the exact Shop, Plant, Website, or Ecommerce template')
  && workboard.includes('keeps the checked-import download disabled until workspace and owner are present')
  && workboard.includes('Keep product checkpoint `9ba8569`')
  && workboard.includes('Execute ENG-075 first')
  && now.includes('Current local checkpoints: product `9ba8569`')
  && now.includes('Core first-action QA leads Shop Stock')
  && now.includes('The active delivery focus is:')
  && now.includes('Setup, Save, receipt, and handoff focus the next step')
  && now.includes('Cancel restores the exact prepared draft')
  && now.includes('React Router is isolated in a 43,870-byte cacheable chunk')
  && now.includes('largest JavaScript chunk is 471,580 bytes')
  && now.includes('one smart-import path')
  && now.includes('109 client-onboarding')
  && now.includes('0 behind / 230 ahead of open draft PR #258 head `338b6fd`')
  && now.includes('`npm run dev` starts canonical FastAPI plus Vite on loopback')
  && now.includes('the full local command proxies canonical FastAPI while keeping managed data disconnected and writes locked')
  && !now.includes('probe remains 500'))
requireContract('release reconciliation is current and discoverable',
  workboard.includes('| OPS-006 | Release / Codex integrator | done-local |')
  && workboard.includes('fast-forward 230 commits beyond open draft PR #258 head `338b6fd`')
  && now.includes('release-reconciliation-2026-07-26.md')
  && now.includes('remote checks exclude the local delta'))
requireContract('release reconciliation binds exact Git and Vercel evidence',
  releaseReconciliation.includes('Audited implementation checkpoint: `b67db9422b523df0c1707f8dc39082ffa1c7a8dd`')
  && releaseReconciliation.includes('Live `main`: `6885c3201d523d42d176c3dcd91de28dc1e17f6f`')
  && releaseReconciliation.includes('Remote pull-request head: `338b6fd11bc27da9b7aa42bee2c293a5c0e3a9ef`')
  && releaseReconciliation.includes('0 commits behind and 230 commits ahead')
  && releaseReconciliation.includes('129 files changed, 45,291 insertions, and 4,455 deletions')
  && releaseReconciliation.includes('`supermega.dev` from Vercel project `supermega-public`')
  && releaseReconciliation.includes('`app.supermega.dev` from Vercel project `megaos`')
  && releaseReconciliation.includes('dpl_Dc5U4M2fXkob3KejYAYDv4jAjEw1')
  && releaseReconciliation.includes('dpl_FL5eESWF2vGJffydGAVNA4vPQzdp'))
requireContract('release action remains owner-gated and push-only',
  releaseReconciliation.includes('combined-status endpoint returned no status contexts for remote checkpoint `338b6fd`')
  && releaseReconciliation.includes('perform one normal fast-forward-only push')
  && releaseReconciliation.includes('Do not force push.')
  && releaseReconciliation.includes('Do not merge, deploy, promote, change aliases or domains')
  && releaseReconciliation.includes('No GitHub, Vercel, DNS, Supabase, domain, deployment, alias, environment, credential, payment, or production state was changed'))

requireContract('Shop uses the stable commerce runtime',
  product('shop')?.name === 'Shop'
  && product('shop')?.runtimeSurface === 'commerce'
  && product('shop')?.compatibilityPath === '/operations/commerce/'
  && product('shop')?.surfaces?.join(',') === 'Orders,Stock'
  && product('shop')?.templateContract?.productId === 'commerce')
requireContract('Plant uses the stable production runtime',
  product('plant')?.name === 'Plant'
  && product('plant')?.runtimeSurface === 'production'
  && product('plant')?.compatibilityPath === '/operations/production/'
  && product('plant')?.surfaces?.join(',') === 'Jobs,Problems'
  && product('plant')?.templateContract?.productId === 'production')
requireContract('Website remains truthful',
  product('website')?.status === 'release-candidate-local'
  && product('website')?.surfaces?.join(',') === 'Site,Preview,Publish'
  && product('website')?.templateContract?.productId === 'website'
  && product('website')?.nextGate?.includes('named-business brief'))
requireContract('Ecommerce is separate and truthfully limited after local inbox completion and before hosted proof or Shop consequences',
  product('ecommerce')?.status === 'release-candidate-local'
  && product('ecommerce')?.job?.includes('read-only Shop catalogue')
  && product('ecommerce')?.surfaces?.join(',') === 'Storefront,Preview,Request receipt,Shop inbox,Shop review'
  && product('ecommerce')?.templateContract?.productId === 'ecommerce'
  && product('ecommerce')?.nextGate?.includes('authenticated, revisioned, catalogue-bound')
  && product('ecommerce')?.nextGate?.includes('recoverable request retention')
  && product('ecommerce')?.nextGate?.includes('isolated non-production tenant')
  && product('ecommerce')?.nextGate?.includes('normalized indexed queue')
  && product('ecommerce')?.nextGate?.includes('payment'))
requireContract('shared AI assistance starts with Order Intake',
  sharedCapability('ai-assistance')?.status === 'gated-r-and-d'
  && sharedCapability('ai-assistance')?.firstWorkflow === 'Order Intake'
  && sharedCapability('ai-assistance')?.nextGate?.includes('zero side effects'))
requireContract('internal systems are not customer products',
  portfolio.internalSystems?.map((entry) => entry.id).join(',') === 'company-system,rnd-system'
  && internalSystem('company-system')?.name === 'SuperMega HQ'
  && internalSystem('rnd-system')?.public === false)

requireContract('manifest has one canonical four-product registry',
  manifest.schemaVersion === 'supermega.site-context.v2'
  && manifest.customerProducts?.map((entry) => `${entry.id}:${entry.runtimeId}:${entry.name}`).join(',')
    === 'shop:commerce:Shop,plant:production:Plant,website:website:Website,ecommerce:ecommerce:Ecommerce')
requireContract('manifest customer routes are canonical',
  manifest.customerProducts?.map((entry) => entry.appRoute).join(',')
    === 'https://app.supermega.dev/shop/?tab=orders,https://app.supermega.dev/plant/?tab=production,https://app.supermega.dev/website/,https://app.supermega.dev/ecommerce/')
requireContract('manifest shared capability is separate from products',
  manifest.sharedCapabilities?.map((entry) => `${entry.id}:${entry.status}:${entry.firstWorkflow}`).join(',')
    === 'ai-assistance:gated-r-and-d:Order Intake')

const expectedTemplateIds = {
  commerce: 'social-commerce,retail-wholesale,restaurant-ordering',
  production: 'production-control,maintenance-downtime,quality-traceability',
  website: 'business-presence,lead-generation,catalog-showcase',
  ecommerce: 'social-storefront,pickup-preorder,wholesale-request',
}
let workflowProfileCount = 0
for (const runtimeSurface of Object.keys(expectedTemplateIds)) {
  const manifestProduct = manifest.customerProducts?.find((entry) => entry.runtimeId === runtimeSurface)
  requireContract(`${runtimeSurface} template set is supported`,
    manifestProduct?.templates?.map((entry) => entry.id).join(',') === expectedTemplateIds[runtimeSurface])
  requireContract(`${runtimeSurface} template profiles are executable`,
    manifestProduct?.templates?.every((entry) =>
      entry.outcome?.trim()
      && entry.metric?.trim()
      && entry.workflow?.length >= 5
      && entry.entryPoints?.length >= 3))
  workflowProfileCount += manifestProduct?.templates?.length || 0
}

requireContract('current direction owns the corrected boundary',
  current.includes('The customer portfolio is exactly **Shop**, **Plant**, **Website**, and **Ecommerce**')
  && current.includes('AI assistance** is a shared capability inside those products, not a fifth product')
  && current.includes('`commerce` and `production` remain stable internal runtime')
  && current.includes('Ecommerce is not a second Shop back office')
  && current.includes('SuperMega HQ, R&D, agent coordination, Ops, Console, and machine coordination are internal'))
requireContract('canonical product routes are stated',
  ['/shop/', '/plant/', '/website/', '/ecommerce/']
    .every((route) => current.includes(`\`${route}\``)))
requireContract('legacy Agents path resolves to internal coordination',
  current.includes('`/agents/` — compatibility-only path to HQ')
  && current.includes('it is not a product route or separate workspace'))
requireContract('owner authority remains explicit',
  current.includes('External sends, payments, publishing, access changes, deployment, and production writes remain owner-approved')
  && now.includes('No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write'))
requireContract('Home prioritizes products before internal machinery',
  now.includes('Home keeps Shop and Plant exceptions above collapsed HQ work.')
  && now.includes('a Plant issue badge links to Problems and otherwise the card opens Jobs.')
  && now.includes('`/work/` stays labelled HQ')
  && now.includes('bottom navigation reads Home, HQ, and Products'))
requireContract('local and managed truth remains explicit',
  current.includes('The default app remains an isolated browser-local trial')
  && current.includes('Managed mode remains locked behind authenticated tenant identity')
  && now.includes('hosted production activation is not proven'))
requireContract('research decision is superseded',
  research.includes('superseded in part by the founder')
  && research.includes('Shop and Plant are the canonical customer-facing operating products')
  && research.includes('Ecommerce owns the storefront and order-intent layer and feeds Shop'))

requireContract('local PostgreSQL rehearsal remains bounded',
  databaseRehearsal.schemaVersion === 'supermega.hq.database-rehearsal.v1'
  && /^[0-9a-f]{40}$/.test(databaseRehearsal.implementationCommit || '')
  && databaseRehearsal.engine?.major === 17
  && databaseRehearsal.engine?.tlsActive === true
  && databaseRehearsal.engine?.loopbackOnly === true
  && databaseRehearsal.runtime?.adapter === 'PostgresTrialStore'
  && databaseRehearsal.runtime?.explicitTransaction === true
  && databaseRehearsal.migration?.count === 6
  && databaseRehearsal.migration?.schemaVersion === 5
  && databaseRehearsal.migration?.productionValidatorReady === true
  && Object.keys(databaseRehearsal.checks || {}).length === 37
  && Object.values(databaseRehearsal.checks || {}).every((value) => value === true)
  && databaseRehearsal.checks?.capabilityScopedReads === true
  && databaseRehearsal.checks?.capabilityScopedEventReads === true
  && databaseRehearsal.checks?.approvalRequesterReadScoped === true
  && databaseRehearsal.checks?.approvalReviewerReadsAll === true
  && databaseRehearsal.checks?.writeCapabilityImpliesRead === true
  && databaseRehearsal.safety?.cleanupComplete === true
  && databaseRehearsal.safety?.secretValuesExposed === false
  && databaseRehearsal.safety?.productionMutated === false
  && databaseRehearsal.safety?.supabaseMutated === false
  && databaseRehearsal.safety?.vercelMutated === false)

requireContract('current authority includes HQ',
  current.includes('hq/portfolio.json')
  && current.includes('## Internal company system and R&D'))
requireContract('OneDrive archive is not authority',
  readme.includes('historical archive and source intake')
  && readme.includes('does not override this repository'))
requireContract('source provenance retained',
  ['1VkuZ5_aUQ7DiYirt2asvzwsQJT9F_AuA', '1uxZ1Ey8xLX5yGmOCZrJ7Mx3I0HMd1unT', 'DawBDyzkTf8', '7483054882816675840']
    .every((token) => readme.includes(token)))
requireContract('HQ stays concise',
  readme.length < 7000
  && now.length < 9000
  && qaBrief.length < 6000
  && current.length < 14000
  && portfolioText.length < 16000)
requireContract('research remains gated',
  portfolio.researchGates?.some((entry) => entry.decision === 'reject')
  && current.includes('Resource intelligence stays inside HQ'))
requireContract('research uses official sources',
  portfolio.researchGates?.every((entry) =>
    /^https:\/\/(?:vercel\.com|tanstack\.com|supabase\.com|platform\.openai\.com)\//.test(entry.source || '')))

for (const forbidden of ['Yangon Tyre', 'ytf.supermega.dev', 'pos.supermega.dev', 'twelve product']) {
  requireContract(`retired HQ context absent: ${forbidden}`,
    !`${readme}\n${now}\n${current}\n${portfolioText}`.toLowerCase().includes(forbidden.toLowerCase()))
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, contract: 'supermega_hq', failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega_hq',
  products: portfolio.products.map((entry) => entry.id),
  sharedCapabilities: portfolio.sharedCapabilities.map((entry) => entry.id),
  internalSystems: portfolio.internalSystems.map((entry) => entry.id),
  agentOperatingModel: {
    registeredRoles: portfolio.agentOperatingModel.registeredRoleLimit,
    activeAssignments: portfolio.agentOperatingModel.activeAssignmentLimit,
    crewCapabilities: portfolio.agentOperatingModel.validatedCrewCapabilities,
    scaleToZero: portfolio.agentOperatingModel.scaleToZero,
  },
  workflowProfiles: workflowProfileCount,
  researchGates: portfolio.researchGates.length,
}, null, 2))
