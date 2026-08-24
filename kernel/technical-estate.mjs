import { createHash } from 'node:crypto'

export const TECHNICAL_ESTATE_CONTRACT = 'supermega.technical-estate.v1'
const SOURCE_CONTRACT = 'supermega.technical-estate-source.v1'
export const TECHNICAL_ESTATE_SOURCE_PATHS = [
  'hq/technical-estate-source.json',
  'hq/portfolio.json',
  'site-manifest.json',
  '.github/workflows/supermega-public-release.yml',
]
const PRODUCT_IDS = ['shop', 'plant', 'website', 'ecommerce']
const REQUIRED_OWNER_GATES = [
  'production_release',
  'migration',
  'external_write',
  'credential_change',
  'github_setting_change',
  'supabase_branch_create_or_delete',
  'pilot_contact',
  'payment',
  'publishing',
  'domain_change',
  'managed_activation',
]

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)

function fail(code) {
  throw new Error(code)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export function estateDigest(value) {
  return `sha256:${createHash('sha256').update(typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : stableStringify(value)).digest('hex')}`
}

function exact(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index])
}

export function buildTechnicalEstate({ source, portfolio, siteManifest, workflowText, sourceReceipts }) {
  if (!isRecord(source)
    || source.contract !== SOURCE_CONTRACT
    || !Number.isFinite(Date.parse(source.asOf))
    || source.releaseFreeze?.status !== 'active'
    || source.authority?.repository !== 'swanhtet01/swanhtet01.github.io'
    || source.authority?.defaultBranch !== 'main'
    || !/^[0-9a-f]{40}$/.test(source.authority?.observedCommit || '')) fail('technical_estate_source_invalid')
  if (!isRecord(portfolio)
    || portfolio.schemaVersion !== 'supermega.hq.portfolio.v3'
    || portfolio.products?.map((product) => product.id).join(',') !== PRODUCT_IDS.join(',')
    || portfolio.sharedCapabilities?.map((capability) => capability.id).join(',') !== 'ai-assistance') fail('technical_estate_portfolio_invalid')
  if (!isRecord(siteManifest)
    || siteManifest.schemaVersion !== 'supermega.site-context.v2'
    || siteManifest.customerProducts?.map((product) => product.id).join(',') !== PRODUCT_IDS.join(',')) fail('technical_estate_site_manifest_invalid')
  if (!String(workflowText).includes('DEPLOY SUPERMEGA PAIRED PRODUCTION')
    || !String(workflowText).includes(source.vercel?.teamId || '')
    || !source.vercel?.canonicalProjects?.every((project) => String(workflowText).includes(project.projectId))) fail('technical_estate_release_workflow_invalid')
  if (!exact(source.ownerGates, REQUIRED_OWNER_GATES)) fail('technical_estate_owner_gates_invalid')
  if (!Array.isArray(sourceReceipts)
    || sourceReceipts.length !== 4
    || sourceReceipts.some((receipt) => !/^[a-z0-9_./-]+$/i.test(receipt?.path || '') || !/^sha256:[0-9a-f]{64}$/.test(receipt?.digest || ''))) fail('technical_estate_receipts_invalid')

  const lifecycleState = {
    shop: 'owner-named-pilot-preparation',
    plant: 'maintenance-only-until-shop-decision',
    website: 'maintenance-only-until-shop-decision',
    ecommerce: 'maintenance-only-until-shop-decision',
  }
  const products = portfolio.products.map((product) => {
    const publicProduct = siteManifest.customerProducts.find((entry) => entry.id === product.id)
    const sourcePath = source.productSourcePaths?.[product.id]
    if (!publicProduct || !String(sourcePath || '').startsWith('showroom/src/')) fail('technical_estate_product_mapping_invalid')
    return {
      productId: product.id,
      name: product.name,
      kind: product.kind,
      lifecycleState: lifecycleState[product.id],
      canonicalRepository: source.authority.repository,
      canonicalSourcePath: sourcePath,
      appPath: product.path,
      appRoute: publicProduct.appRoute,
      releaseProjects: source.vercel.canonicalProjects.map((project) => project.name),
      managedSchema: source.supabase.managedSchema,
      migrationAuthority: source.supabase.migrationAuthority,
      ownerGated: true,
    }
  })

  const result = {
    contract: TECHNICAL_ESTATE_CONTRACT,
    generatedFromAsOf: source.asOf,
    sourceDigest: estateDigest(sourceReceipts),
    status: 'frozen_pending_owner_gates',
    releaseFreeze: structuredClone(source.releaseFreeze),
    authority: structuredClone(source.authority),
    products,
    sharedCapabilities: portfolio.sharedCapabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      classification: 'shared-capability-not-product',
      status: capability.status,
    })),
    infrastructure: {
      github: structuredClone(source.github),
      vercel: structuredClone(source.vercel),
      supabase: structuredClone(source.supabase),
    },
    satellites: structuredClone(source.satellites),
    legacyObservation: structuredClone(source.legacyObservation),
    ownerGates: [...source.ownerGates],
    cadence: structuredClone(source.cadence),
    controls: {
      generatedDeterministically: true,
      externalWritesPerformed: false,
      productionWritesEnabled: false,
      autoMergeEnabled: false,
      ownerApprovalRequired: true,
    },
    sourceReceipts,
  }
  return validateTechnicalEstate(result)
}

export function validateTechnicalEstate(value) {
  if (!isRecord(value)
    || value.contract !== TECHNICAL_ESTATE_CONTRACT
    || !Number.isFinite(Date.parse(value.generatedFromAsOf))
    || value.status !== 'frozen_pending_owner_gates'
    || value.releaseFreeze?.status !== 'active'
    || value.authority?.repository !== 'swanhtet01/swanhtet01.github.io'
    || value.authority?.defaultBranch !== 'main') fail('technical_estate_contract_invalid')
  if (!Array.isArray(value.sourceReceipts)
    || value.sourceReceipts.length !== 4
    || value.sourceDigest !== estateDigest(value.sourceReceipts)) fail('technical_estate_digest_invalid')
  if (value.products?.map((product) => product.productId).join(',') !== PRODUCT_IDS.join(',')
    || value.products.some((product) => product.canonicalRepository !== value.authority.repository
      || !String(product.canonicalSourcePath || '').startsWith('showroom/src/')
      || product.releaseProjects?.join(',') !== 'supermega-public,megaos'
      || product.managedSchema !== 'app_private'
      || product.migrationAuthority !== 'supabase/migrations'
      || product.ownerGated !== true)) fail('technical_estate_products_invalid')
  if (value.sharedCapabilities?.length !== 1
    || value.sharedCapabilities[0]?.id !== 'ai-assistance'
    || value.sharedCapabilities[0]?.classification !== 'shared-capability-not-product') fail('technical_estate_shared_capability_invalid')
  const infrastructure = value.infrastructure
  if (infrastructure?.github?.mainRuleset?.observedState !== 'missing'
    || infrastructure.github.autoMergeEnabled !== false
    || infrastructure.github.requiredBeforeR1Merge?.requiredChecks?.join(',') !== 'SuperMega App CI,Dependency Security Audit,Kernel Console - Verify & Owner-Gated Release'
    || infrastructure.vercel?.teamId !== 'team_wI4l7ZgSxcEztQPSlCCYVeJ5'
    || infrastructure.vercel?.canonicalProjects?.map((project) => project.name).join(',') !== 'supermega-public,megaos'
    || infrastructure.vercel?.observedProjects?.length !== 13
    || infrastructure.supabase?.projectRef !== 'zvtzwcimpvvtkowflhda'
    || infrastructure.supabase?.liveManagedSchemaVersion !== 10
    || infrastructure.supabase?.publicBrowserObjectAccessDenied !== true
    || infrastructure.supabase?.managedWritesEnabled !== false
    || infrastructure.supabase?.failedRehearsalBranch?.deletionApproved !== false) fail('technical_estate_infrastructure_invalid')
  if (!exact(value.ownerGates, REQUIRED_OWNER_GATES)
    || value.legacyObservation?.minimumDays !== 30
    || value.legacyObservation?.preserveWhenTrafficTelemetryUnavailable !== true
    || value.legacyObservation?.runtimeLogsAloneProveUnused !== false
    || !value.satellites?.some((entry) => entry.name === 'supermega-workspace' && entry.classification === 'satellite')) fail('technical_estate_lifecycle_invalid')
  if (value.controls?.generatedDeterministically !== true
    || value.controls?.externalWritesPerformed !== false
    || value.controls?.productionWritesEnabled !== false
    || value.controls?.autoMergeEnabled !== false
    || value.controls?.ownerApprovalRequired !== true) fail('technical_estate_controls_invalid')
  const serialized = JSON.stringify(value).toLowerCase()
  if (serialized.includes('postgresql://') || serialized.includes('password=') || serialized.includes('sb_secret_')) fail('technical_estate_sensitive_value')
  return value
}
