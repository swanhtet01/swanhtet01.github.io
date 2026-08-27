import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TECHNICAL_ESTATE_CONTRACT = 'supermega.technical-estate.v1'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'hq', 'technical-estate.json')
const sources = [
  'hq/portfolio.json',
  'site-manifest.json',
  'vercel.json',
  'package.json',
  'hq/readiness/managed-pilot-readiness.json',
  'hq/readiness/supabase-security-advisor-audit.json',
]
const PRODUCT_IDS = ['shop', 'plant', 'website', 'ecommerce']
const OWNER_GATED_ACTIONS = [
  'github_push',
  'pull_request_creation',
  'merge',
  'production_release',
  'vercel_deploy_or_promotion',
  'supabase_schema_or_data_write',
  'credential_change',
  'customer_contact',
  'payment_or_refund',
  'stock_movement',
  'domain_or_publish_change',
  'managed_activation',
]
const PRODUCT_SOURCE_PATHS = {
  shop: [
    'showroom/src/App.tsx',
    'showroom/src/core/CoreApp.tsx',
    'showroom/src/core/CoreShell.tsx',
    'showroom/src/products/shop',
    'showroom/src/core/ShopToday.tsx',
    'showroom/src/core/shop-profit-control.ts',
    'showroom/src/core/ShopInventoryFoundation.tsx',
  ],
  plant: [
    'showroom/src/App.tsx',
    'showroom/src/core/CoreApp.tsx',
    'showroom/src/core/CoreShell.tsx',
    'showroom/src/core/PlantOrderFoundation.tsx',
    'showroom/src/core/PlantEquipmentOnboarding.tsx',
  ],
  website: [
    'showroom/src/App.tsx',
    'showroom/src/products/website/WebsiteProduct.tsx',
    'showroom/src/products/website/WebsiteStarterSetup.tsx',
    'showroom/src/products/website/website-model.ts',
  ],
  ecommerce: [
    'showroom/src/App.tsx',
    'showroom/src/products/ecommerce/EcommerceProduct.tsx',
    'showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx',
    'showroom/src/products/ecommerce/ecommerce-buying-lifecycle.ts',
    'showroom/src/products/ecommerce/ecommerce-shop-handoff.ts',
  ],
}

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function digest(value) {
  const text = typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : stableStringify(value)
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

async function readText(path) {
  return readFile(resolve(root, path), 'utf8')
}

async function requirePath(path) {
  const metadata = await stat(resolve(root, path))
  if (!metadata.isFile() && !metadata.isDirectory()) fail(`technical_estate_source_path_invalid:${path}`)
  return { path, kind: metadata.isDirectory() ? 'directory' : 'file' }
}

async function buildTechnicalEstate() {
  const texts = new Map()
  for (const path of sources) texts.set(path, await readText(path))

  const portfolio = JSON.parse(texts.get('hq/portfolio.json'))
  const siteManifest = JSON.parse(texts.get('site-manifest.json'))
  const vercelConfig = JSON.parse(texts.get('vercel.json'))
  const packageManifest = JSON.parse(texts.get('package.json'))
  const readiness = JSON.parse(texts.get('hq/readiness/managed-pilot-readiness.json'))
  const securityAudit = JSON.parse(texts.get('hq/readiness/supabase-security-advisor-audit.json'))

  const products = portfolio.products.map((product) => {
    if (!PRODUCT_IDS.includes(product.id)) fail(`technical_estate_unknown_product:${product.id}`)
    const siteProduct = siteManifest.customerProducts.find((candidate) => candidate.id === product.id)
    if (!siteProduct) fail(`technical_estate_site_product_missing:${product.id}`)
    const readinessProduct = readiness.products.find((candidate) => candidate.productId === product.id)
    if (!readinessProduct) fail(`technical_estate_readiness_product_missing:${product.id}`)
    return {
      productId: product.id,
      name: product.name,
      kind: product.kind,
      lifecycleState: product.status,
      canonicalRepository: 'swanhtet01/swanhtet01.github.io',
      sourceBranchAuthority: 'main',
      appRoute: product.path,
      publicAppRoute: siteProduct.appRoute,
      runtimeSurface: product.runtimeSurface ?? product.id,
      compatibilityPath: product.compatibilityPath ?? null,
      sourcePaths: PRODUCT_SOURCE_PATHS[product.id],
      releaseWorkflow: '.github/workflows/supermega-public-release.yml',
      ownerGate: product.localAutomation.status,
      workOrderId: product.localAutomation.workOrderId,
      requiredProof: readinessProduct.requiredProof,
      classification: 'customer-product',
    }
  })

  return {
    schemaVersion: TECHNICAL_ESTATE_CONTRACT,
    generatedFrom: {
      portfolioUpdatedAt: portfolio.updatedAt,
      siteContextVersion: siteManifest.contextVersion,
      catalogVersion: siteManifest.catalogVersion,
      readinessContract: readiness.contract,
      securityAuditAsOf: securityAudit.asOf,
    },
    sourceDigest: digest({
      sourceReceipts: sources.map((path) => ({ path, digest: digest(texts.get(path)) })),
      productIds: products.map((product) => product.productId),
    }),
    canonicalSource: {
      repository: 'swanhtet01/swanhtet01.github.io',
      activeBranch: 'main',
      localAuthority: 'owner-controlled supermega-platform checkout',
      currentRehearsalBranchesAllowed: true,
      directProductionDeploymentAllowed: false,
    },
    vercel: {
      hosting: 'vercel',
      releaseWorkflow: '.github/workflows/supermega-public-release.yml',
      projects: [
        {
          project: 'supermega-public',
          classification: 'canonical-public-company-surface',
          domains: ['supermega.dev', 'www.supermega.dev'],
          buildScript: packageManifest.scripts['public:build'],
          verifyScript: packageManifest.scripts['public:verify'],
          output: '.vercel/output',
          productionPromotion: 'owner-approved coordinated workflow only',
        },
        {
          project: 'megaos',
          classification: 'canonical-hosted-app-runtime',
          domains: ['app.supermega.dev', 'megaos.vercel.app'],
          buildScript: packageManifest.scripts['app:build'],
          verifyScript: packageManifest.scripts['app:verify'],
          output: vercelConfig.outputDirectory,
          productionPromotion: 'owner-approved coordinated workflow only',
        },
      ],
    },
    supabase: {
      projectRef: packageManifest.supermega.productionSupabaseProjectRef,
      targetStatus: packageManifest.supermega.productionSupabaseTargetStatus,
      schemaAuthority: {
        privateSchema: 'app_private',
        publicLegacySchema: 'public',
        migrationAuthority: 'source-controlled supabase migrations and rehearsal packets',
        readinessContract: readiness.contract,
        liveSchemaVersion: securityAudit.managedBackend.liveSchemaVersion,
        localTargetVersion: securityAudit.managedBackend.localTargetVersion,
        versionDrift: securityAudit.managedBackend.versionDrift,
        browserRolesDenied: securityAudit.managedBackend.browserRolesDenied,
        publicBrowserQuarantine: true,
      },
      productionWritesAllowed: false,
    },
    products,
    sharedCapabilities: [
      {
        id: 'ai-assistance',
        classification: 'shared-capability-not-product',
        status: siteManifest.customerProducts.some((product) => product.id === 'ai') ? 'invalid-public-product' : 'gated-r-and-d',
        route: '/agents/',
        boundary: 'May prepare reviewed work inside Shop, Plant, Website, and Ecommerce; may not independently send, charge, publish, deploy, mutate access, or write production.',
      },
    ],
    lifecycle: {
      order: PRODUCT_IDS,
      states: portfolio.productLifecycle,
      currentPriority: 'shop-first-managed-pilot-readiness',
      nextProductSequence: ['shop', 'plant', 'website', 'ecommerce'],
    },
    legacyAndSatellite: [
      {
        id: 'supermega-workspace',
        classification: 'satellite',
        allowedAction: 'read-only observation and later owner-approved triage',
        retirementAllowedWithoutOwnerApproval: false,
      },
      {
        id: 'legacy-vercel-projects-and-domains',
        classification: 'legacy-observe-first',
        allowedAction: '30-day observation before any retirement proposal',
        retirementAllowedWithoutOwnerApproval: false,
      },
    ],
    ownerGates: {
      requiredApprovalFor: OWNER_GATED_ACTIONS,
      productionWritesAllowed: false,
      externalEffectsAllowed: false,
      autoMergeAllowed: false,
      localSubagentsAllowedByDefault: false,
    },
    sourceReceipts: sources.map((path) => ({ path, digest: digest(texts.get(path)) })),
  }
}

export function validateTechnicalEstate(estate) {
  if (!isRecord(estate) || estate.schemaVersion !== TECHNICAL_ESTATE_CONTRACT) fail('technical_estate_contract_invalid')
  if (estate.canonicalSource?.repository !== 'swanhtet01/swanhtet01.github.io') fail('technical_estate_repository_invalid')
  if (estate.canonicalSource?.directProductionDeploymentAllowed !== false) fail('technical_estate_direct_deploy_allowed')
  if (!Array.isArray(estate.products) || estate.products.map((product) => product.productId).join(',') !== PRODUCT_IDS.join(',')) fail('technical_estate_product_order_invalid')
  if (estate.sharedCapabilities?.some((capability) => capability.classification !== 'shared-capability-not-product')) fail('technical_estate_shared_capability_invalid')
  if (estate.vercel?.projects?.map((project) => project.project).join(',') !== 'supermega-public,megaos') fail('technical_estate_vercel_projects_invalid')
  if (estate.vercel.projects[0]?.domains?.join(',') !== 'supermega.dev,www.supermega.dev') fail('technical_estate_public_domains_invalid')
  if (estate.vercel.projects[1]?.domains?.join(',') !== 'app.supermega.dev,megaos.vercel.app') fail('technical_estate_app_domains_invalid')
  if (estate.supabase?.targetStatus !== 'protected-unapproved' || estate.supabase?.productionWritesAllowed !== false) fail('technical_estate_supabase_boundary_invalid')
  if (estate.supabase.schemaAuthority?.browserRolesDenied !== true || estate.supabase.schemaAuthority?.publicBrowserQuarantine !== true) fail('technical_estate_supabase_quarantine_invalid')
  if (estate.ownerGates?.productionWritesAllowed !== false || estate.ownerGates?.externalEffectsAllowed !== false || estate.ownerGates?.autoMergeAllowed !== false) fail('technical_estate_owner_gates_invalid')
  for (const action of OWNER_GATED_ACTIONS) {
    if (!estate.ownerGates.requiredApprovalFor.includes(action)) fail(`technical_estate_owner_gate_missing:${action}`)
  }
  for (const product of estate.products) {
    if (product.canonicalRepository !== estate.canonicalSource.repository) fail(`technical_estate_product_repository_invalid:${product.productId}`)
    if (product.ownerGate !== 'owner-gated') fail(`technical_estate_product_owner_gate_invalid:${product.productId}`)
    if (product.classification !== 'customer-product') fail(`technical_estate_product_classification_invalid:${product.productId}`)
    if (!Array.isArray(product.sourcePaths) || product.sourcePaths.length < 3) fail(`technical_estate_product_sources_missing:${product.productId}`)
  }
  if (!Array.isArray(estate.sourceReceipts) || estate.sourceReceipts.length !== sources.length) fail('technical_estate_source_receipts_invalid')
  if (!/^sha256:[0-9a-f]{64}$/.test(estate.sourceDigest || '')) fail('technical_estate_source_digest_invalid')
  return estate
}

async function assertSourcePaths(estate) {
  const paths = [...new Set(estate.products.flatMap((product) => product.sourcePaths))]
  for (const path of paths) await requirePath(path)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args[0] && args[0] !== '--verify')) fail('technical_estate_arguments_invalid')
  const expected = validateTechnicalEstate(await buildTechnicalEstate())
  await assertSourcePaths(expected)
  if (args[0] === '--verify') {
    const actual = validateTechnicalEstate(JSON.parse(await readFile(output, 'utf8')))
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('technical_estate_stale')
    console.log(JSON.stringify({ ok: true, contract: TECHNICAL_ESTATE_CONTRACT, products: actual.products.length, vercelProjects: actual.vercel.projects.length, ownerGates: actual.ownerGates.requiredApprovalFor.length }))
    return
  }
  await mkdir(dirname(output), { recursive: true })
  const staged = resolve(dirname(output), `.technical-estate.${randomUUID()}.tmp`)
  await writeFile(staged, `${JSON.stringify(expected, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(staged, output)
  console.log(JSON.stringify({ ok: true, contract: TECHNICAL_ESTATE_CONTRACT, output: relative(root, output).split(sep).join('/'), products: expected.products.length, vercelProjects: expected.vercel.projects.length }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, contract: TECHNICAL_ESTATE_CONTRACT, error: String(error?.message || 'technical_estate_failed').slice(0, 240), externalWritesPerformed: false }))
    process.exitCode = 1
  })
}
