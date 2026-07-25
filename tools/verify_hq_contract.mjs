import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const [readme, now, qaBrief, workboard, current, manifestText, portfolioText, research, databaseRehearsalText, releaseReconciliation] = await Promise.all([
  readFile(resolve(root, 'hq', 'README.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'NOW.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'CODEX-PRODUCT-QA-BRIEF.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'WORKBOARD.md'), 'utf8'),
  readFile(resolve(root, 'CURRENT.md'), 'utf8'),
  readFile(resolve(root, 'site-manifest.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'portfolio.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'product-rd-2026-07.md'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'postgres17-rehearsal.json'), 'utf8'),
  readFile(resolve(root, 'hq', 'research', 'release-reconciliation-2026-07-25.md'), 'utf8'),
])

const manifest = JSON.parse(manifestText)
const portfolio = JSON.parse(portfolioText)
const databaseRehearsal = JSON.parse(databaseRehearsalText)
const failures = []
const requireContract = (name, condition) => { if (!condition) failures.push(name) }
const product = (id) => portfolio.portfolio?.find((entry) => entry.id === id)
const internalSystem = (id) => portfolio.internalSystems?.find((entry) => entry.id === id)

requireContract('portfolio schema', portfolio.schemaVersion === 'supermega.hq.portfolio.v2')
requireContract('portfolio is current',
  portfolio.updatedAt === '2026-07-25'
  && now.includes('Updated: 2026-07-25')
  && current.includes('Last confirmed: 2026-07-25'))
requireContract('customer portfolio is explicit',
  portfolio.portfolio?.map((entry) => entry.id).join(',') === 'shop,plant,website,ecommerce,agents')
requireContract('customer paths are canonical',
  portfolio.portfolio?.map((entry) => entry.path).join(',') === '/shop/,/plant/,/products/website/,/products/ecommerce/,/agents/')
requireContract('product lifecycle is explicit',
  portfolio.productLifecycle?.join(',') === 'discover,define,build,release,learn')
requireContract('product QA brief matches current portfolio',
  qaBrief.includes('Work item: `QA-003`')
  && qaBrief.includes('Mode: read-only')
  && qaBrief.includes('Website and Ecommerce are local release candidates')
  && qaBrief.includes('AI Agent Solutions remains evaluation-gated')
  && ['/shop/?tab=orders', '/shop/?tab=inventory', '/plant/?tab=production', '/plant/?tab=control', '/products/website/', '/products/ecommerce/', '/agents/']
    .every((route) => qaBrief.includes(`\`${route}\``))
  && qaBrief.includes('Do not edit files or browser data.')
  && !qaBrief.includes('Work item: `QA-002`')
  && !qaBrief.includes('Ecommerce and AI Agent Solutions are visibly planned'))
requireContract('product QA brief is discoverable from assignment authority',
  workboard.includes('| QA-003 | Product / QA Codex | done-local |')
  && workboard.includes('Checkpoint `dadb013` passes 10 routes at 390/1280 px')
  && workboard.includes('focus lands on `#workspace-main`'))
requireContract('accepted core checkpoints lead directly to real work',
  workboard.includes('Current accepted product checkpoint: `99d108f`')
  && workboard.includes('| ENG-051 | Shop + Product UX Codex | done-local |')
  && workboard.includes('| ENG-052 | Plant + Product UX Codex | done-local |')
  && workboard.includes('| ENG-053 | Platform Codex | done-local |')
  && workboard.includes('| ENG-054 | Ecommerce + Product UX Codex | done-local |')
  && workboard.includes('The leading row states `4 below reorder`')
  && workboard.includes('centers the existing form, and focuses its Job selector')
  && workboard.includes('largest JavaScript chunk falls from 498,962 to 462,746 bytes')
  && workboard.includes('removes repeated product-level `Save first` controls')
  && workboard.includes('Keep product checkpoint `99d108f`')
  && workboard.includes('current 188-commit local product delta')
  && now.includes('Checkpoint `99d108f` is the accepted local product')
  && now.includes('Core first-action QA leads Shop Stock')
  && now.includes('Preview exposes one `Finish setup` handoff')
  && now.includes('React Router is isolated in a 43,870-byte cacheable chunk')
  && now.includes('largest JavaScript chunk is 462,746 bytes')
  && now.includes('fast-forward 142 commits beyond remote PR #258 head `338b6fd`')
  && now.includes('unconfigured local `/api/health` probe remains 500'))
requireContract('release reconciliation is current and discoverable',
  workboard.includes('| OPS-006 | Release / Codex integrator | done-local |')
  && workboard.includes('fast-forward 134 commits beyond remote PR #258')
  && now.includes('release-reconciliation-2026-07-25.md')
  && now.includes('existing green checks cover only the remote head'))
requireContract('release reconciliation binds exact Git and Vercel evidence',
  releaseReconciliation.includes('Audited implementation checkpoint: `49b4e0e79461adb744b151314396ed1b8a2a06c3`')
  && releaseReconciliation.includes('Live `main`: `6885c3201d523d42d176c3dcd91de28dc1e17f6f`')
  && releaseReconciliation.includes('Live pull-request head: `338b6fd11bc27da9b7aa42bee2c293a5c0e3a9ef`')
  && releaseReconciliation.includes('0 commits behind and 134 commits ahead')
  && releaseReconciliation.includes('75 files changed, 30,188 insertions, 2,768 deletions')
  && releaseReconciliation.includes('`supermega.dev` from the Vercel project `supermega-public`')
  && releaseReconciliation.includes('`app.supermega.dev` from the Vercel project `megaos`')
  && releaseReconciliation.includes('dpl_Dc5U4M2fXkob3KejYAYDv4jAjEw1')
  && releaseReconciliation.includes('dpl_FL5eESWF2vGJffydGAVNA4vPQzdp'))
requireContract('release action remains owner-gated and push-only',
  releaseReconciliation.includes('existing green SuperMega App CI and GitGuardian results cover remote checkpoint `338b6fd`')
  && releaseReconciliation.includes('perform one fast-forward-only push')
  && releaseReconciliation.includes('Do not force push.')
  && releaseReconciliation.includes('Do not merge, deploy, promote, change aliases or domains')
  && releaseReconciliation.includes('No GitHub, Vercel, DNS, Supabase, domain, deployment, alias, environment, credential, or production state was changed'))

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
  && product('website')?.nextGate?.includes('named-business brief'))
requireContract('Ecommerce is separate and truthfully limited after local inbox completion and before hosted proof or Shop consequences',
  product('ecommerce')?.status === 'release-candidate-local'
  && product('ecommerce')?.job?.includes('read-only Shop catalogue')
  && product('ecommerce')?.surfaces?.join(',') === 'Storefront,Preview,Request receipt,Shop inbox,Shop review'
  && product('ecommerce')?.nextGate?.includes('authenticated, revisioned, catalogue-bound')
  && product('ecommerce')?.nextGate?.includes('recoverable request retention')
  && product('ecommerce')?.nextGate?.includes('isolated non-production tenant')
  && product('ecommerce')?.nextGate?.includes('normalized indexed queue')
  && product('ecommerce')?.nextGate?.includes('payment'))
requireContract('Agent Solutions starts with Order Intake',
  product('agents')?.status === 'prototype-planned'
  && product('agents')?.firstSolution === 'Order Intake Agent'
  && product('agents')?.nextGate?.includes('zero side effects'))
requireContract('internal systems are not customer products',
  portfolio.internalSystems?.map((entry) => entry.id).join(',') === 'company-system,rnd-system'
  && internalSystem('company-system')?.name === 'SuperMega HQ'
  && internalSystem('rnd-system')?.public === false)

requireContract('manifest preserves internal IDs and restores public names',
  manifest.products?.map((entry) => `${entry.id}:${entry.publicId}:${entry.name}`).join(',')
    === 'commerce:shop:Shop,production:plant:Plant')
requireContract('manifest maker products are truthful',
  manifest.prototypeProducts?.map((entry) => `${entry.id}:${entry.status}`).join(',')
    === 'website:release-candidate-local,ecommerce:release-candidate-local')
requireContract('manifest agent product is truthful',
  manifest.agentSolutions?.id === 'agents'
  && manifest.agentSolutions?.status === 'prototype-planned'
  && manifest.agentSolutions?.firstSolution === 'Order Intake Agent')

const expectedTemplateIds = {
  commerce: 'social-commerce,retail-wholesale,restaurant-ordering',
  production: 'production-control,maintenance-downtime,quality-traceability',
}
let workflowProfileCount = 0
for (const runtimeSurface of Object.keys(expectedTemplateIds)) {
  const manifestProduct = manifest.products?.find((entry) => entry.id === runtimeSurface)
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
  current.includes('The customer portfolio is **Shop**, **Plant**, **Website**, **Ecommerce**')
  && current.includes('`commerce` and `production` remain stable internal runtime')
  && current.includes('Ecommerce is not a second Shop back office')
  && current.includes('SuperMega HQ, R&D, agent coordination, Ops, Console, and machine coordination are internal'))
requireContract('canonical product routes are stated',
  ['/shop/', '/plant/', '/products/website/', '/products/ecommerce/', '/agents/']
    .every((route) => current.includes(`\`${route}\``)))
requireContract('owner authority remains explicit',
  current.includes('External sends, payments, publishing, access changes, deployment, and production writes remain owner-approved')
  && now.includes('No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write'))
requireContract('Home prioritizes products before internal machinery',
  now.includes('Home now prioritizes unfinished Shop and Plant operating records before internal company tasks.')
  && now.includes('internal `/work/` route is labelled HQ')
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
  products: portfolio.portfolio.map((entry) => entry.id),
  internalSystems: portfolio.internalSystems.map((entry) => entry.id),
  workflowProfiles: workflowProfileCount,
  researchGates: portfolio.researchGates.length,
}, null, 2))
