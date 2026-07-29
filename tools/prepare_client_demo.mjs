import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants, existsSync } from 'node:fs'
import { access, chmod, link, lstat, open, readFile, realpath, unlink } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const CLIENT_DEMO_PREPARATION_CONTRACT = 'supermega.client_demo_preparation.v2'
export const CLIENT_DEMO_PREPARATION_VALIDATION_CONTRACT = 'supermega.client_demo_preparation_validation.v1'
export const CLIENT_DEMO_PREPARATION_MAX_BYTES = 5 * 1024 * 1024
const CLIENT_DEMO_KIT_MAX_BYTES = 128 * 1024
const CLIENT_DATA_MAX_BYTES = 512 * 1024
const PRODUCT_ORDER = Object.freeze(['commerce', 'production', 'website', 'ecommerce'])
const PRODUCT_FILE = Object.freeze(Object.fromEntries(PRODUCT_ORDER.map((product) => [product, `${product}.csv`])))
const PRODUCT_LABEL = Object.freeze({ commerce: 'Shop', production: 'Plant', website: 'Website', ecommerce: 'Ecommerce' })
const PRODUCT_PATHS = Object.freeze({
  commerce: { demoPath: '/shop/?tab=counter', setupPath: '/settings/?product=shop' },
  production: { demoPath: '/plant/?tab=production', setupPath: '/settings/?product=plant' },
  website: { demoPath: '/website/', setupPath: '/settings/?product=website' },
  ecommerce: { demoPath: '/ecommerce/', setupPath: '/settings/?product=ecommerce' },
})
const CLIENT_DEMO_KIT_SCHEMA = 'supermega.client_demo_kit.v2'
const CLIENT_OPERATING_FOUNDATION_SCHEMA = 'supermega.client_operating_foundation.v1'
const OPERATING_UNIT_KIND = Object.freeze({
  'social-seller': 'digital-commerce',
  'retail-network': 'retail',
  'food-service': 'food-service',
  manufacturing: 'plant',
  'service-business': 'service',
})
const REVIEW_CHECKLIST = Object.freeze([
  'Confirm the workspace, owner, selected templates, and industry packs.',
  'Review every normalized source row and resolve client-data corrections.',
  'Open each product demo path and complete its operational proof scenario.',
  'Confirm Shop, Plant, Website, and Ecommerce cross-product checks.',
  'Approve this exact bundle digest before any managed activation.',
])

class PreparationError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

function fail(code) {
  throw new PreparationError(code)
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function hasExactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()))
}

function canonicalIntegrations(products) {
  const selected = new Set(products)
  const integrations = []
  if (selected.has('website') && selected.has('ecommerce')) integrations.push({ from: 'website', to: 'ecommerce', outcome: 'Approved site content and catalog presentation stay aligned.' })
  if (selected.has('ecommerce') && selected.has('commerce')) integrations.push({ from: 'ecommerce', to: 'commerce', outcome: 'Storefront requests enter Shop review before any order or stock change.' })
  if (selected.has('production') && selected.has('commerce')) integrations.push({ from: 'commerce', to: 'production', outcome: 'Demand and material evidence connect Shop stock with Plant execution.' })
  return integrations
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string' || value.length > 32) return null
  try { return new Date(value).toISOString() === value ? value : null } catch { return null }
}

function operatingFoundationValid(value, client) {
  const kind = OPERATING_UNIT_KIND[client?.presetId]
  return Boolean(kind
    && hasExactKeys(value, ['schema', 'organization', 'operatingUnit', 'localization', 'controls'])
    && value.schema === CLIENT_OPERATING_FOUNDATION_SCHEMA
    && hasExactKeys(value.organization, ['displayName', 'verification'])
    && value.organization.displayName === client.workspace
    && value.organization.verification === 'client_review_required'
    && hasExactKeys(value.operatingUnit, ['code', 'name', 'kind'])
    && value.operatingUnit.code === 'MAIN'
    && value.operatingUnit.name === 'Main operating unit'
    && value.operatingUnit.kind === kind
    && hasExactKeys(value.localization, ['countryCode', 'currency', 'locale', 'timeZone'])
    && value.localization.countryCode === 'MM'
    && value.localization.currency === 'MMK'
    && value.localization.locale === 'my-MM'
    && value.localization.timeZone === 'Asia/Yangon'
    && hasExactKeys(value.controls, ['sharedAcrossProducts', 'clientReviewRequired', 'externalRegistryChecked', 'managedIdentityRequiredBeforeActivation'])
    && value.controls.sharedAcrossProducts === true
    && value.controls.clientReviewRequired === true
    && value.controls.externalRegistryChecked === false
    && value.controls.managedIdentityRequiredBeforeActivation === true)
}

function pythonExecutable() {
  if (process.env.SUPERMEGA_PYTHON?.trim()) return process.env.SUPERMEGA_PYTHON.trim()
  const local = process.platform === 'win32'
    ? resolve(ROOT, '.venv', 'Scripts', 'python.exe')
    : resolve(ROOT, '.venv', 'bin', 'python')
  if (existsSync(local)) return local
  return process.platform === 'win32' ? 'python' : 'python3'
}

async function readableFile(path, maximum, code) {
  let metadata
  try { metadata = await lstat(path) } catch { fail(`${code}_missing`) }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > maximum) fail(`${code}_invalid`)
  const bytes = await readFile(path).catch(() => fail(`${code}_unreadable`))
  if (bytes.byteLength < 1 || bytes.byteLength > maximum) fail(`${code}_invalid`)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { fail(`${code}_utf8_invalid`) }
}

async function optionalClientSource(dataDirectory, product) {
  if (!dataDirectory) return null
  let directoryMetadata
  try { directoryMetadata = await lstat(dataDirectory) } catch { fail('client_data_directory_missing') }
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) fail('client_data_directory_invalid')
  const directoryRealPath = await realpath(dataDirectory).catch(() => fail('client_data_directory_invalid'))
  const candidate = resolve(directoryRealPath, PRODUCT_FILE[product])
  try { await access(candidate, fsConstants.F_OK) } catch { return null }
  let candidateMetadata
  try { candidateMetadata = await lstat(candidate) } catch { fail(`client_data_${product}_unreadable`) }
  if (!candidateMetadata.isFile() || candidateMetadata.isSymbolicLink() || candidateMetadata.size < 1 || candidateMetadata.size > CLIENT_DATA_MAX_BYTES) {
    fail(`client_data_${product}_invalid`)
  }
  const candidateRealPath = await realpath(candidate).catch(() => fail(`client_data_${product}_unreadable`))
  const boundary = relative(directoryRealPath, candidateRealPath)
  if (!boundary || boundary.startsWith('..') || isAbsolute(boundary)) fail(`client_data_${product}_outside_directory`)
  return {
    name: PRODUCT_FILE[product],
    text: await readableFile(candidateRealPath, CLIENT_DATA_MAX_BYTES, `client_data_${product}`),
  }
}

function validateSelectedPackages(packages) {
  const validation = spawnSync(
    pythonExecutable(),
    [resolve(ROOT, 'tools', 'validate_client_launch_packages.py')],
    {
      cwd: ROOT,
      encoding: 'utf8',
      input: JSON.stringify({ contract: CLIENT_DEMO_PREPARATION_VALIDATION_CONTRACT, packages }),
      maxBuffer: 6 * 1024 * 1024,
      windowsHide: true,
    },
  )
  let response
  try { response = JSON.parse(validation.stdout || '{}') } catch { fail('client_demo_server_validation_invalid') }
  if (validation.status !== 0 || response.ok !== true || response.selected_product_coverage_complete !== true) {
    fail('client_demo_server_validation_failed')
  }
  return response
}

function preparationChecks(packages) {
  const byProduct = new Map(packages.map((entry) => [entry.product, entry]))
  const shopSkus = new Set((byProduct.get('commerce')?.rows ?? []).map((row) => row.values.sku))
  const ecommerceSkus = (byProduct.get('ecommerce')?.rows ?? []).map((row) => row.values.sku)
  const checks = {
    ecommerceCatalogAligned: !byProduct.has('ecommerce') || !byProduct.has('commerce') || ecommerceSkus.every((sku) => shopSkus.has(sku)),
    websiteHomePresent: !byProduct.has('website') || byProduct.get('website').rows.some((row) => row.values.slug === 'home'),
    plantLinesPresent: !byProduct.has('production') || byProduct.get('production').rows.every((row) => Boolean(row.values.line)),
    oneWorkspaceAndOwner: new Set(packages.map((entry) => `${entry.workspace}\u0000${entry.owner}`)).size === 1,
  }
  if (Object.values(checks).some((check) => check !== true)) fail('client_demo_cross_product_check_failed')
  return checks
}

export async function prepareClientDemo({ kitPath, dataDirectory, preparedAt = new Date().toISOString() }) {
  const timestamp = canonicalTimestamp(preparedAt)
  if (!timestamp) fail('client_demo_prepared_at_invalid')
  const kitText = await readableFile(resolve(kitPath || ''), CLIENT_DEMO_KIT_MAX_BYTES, 'client_demo_kit')
  let kitValue
  try { kitValue = JSON.parse(kitText) } catch { fail('client_demo_kit_json_invalid') }
  const model = await import(`${pathToFileURL(resolve(ROOT, 'showroom', 'src', 'core', 'client-onboarding.ts')).href}?client-preparation=${Date.now()}`)
  const kit = model.restoreClientDemoKit(kitValue)
  if (!kit) fail('client_demo_kit_contract_invalid')
  const selectedProducts = kit.blueprint.products.map((product) => product.product)
  const canonicalProducts = PRODUCT_ORDER.filter((product) => selectedProducts.includes(product))
  if (JSON.stringify(selectedProducts) !== JSON.stringify(canonicalProducts)) fail('client_demo_product_order_invalid')

  const packages = []
  const sourceModes = new Map()
  for (const product of kit.blueprint.products) {
    const clientSource = await optionalClientSource(dataDirectory ? resolve(dataDirectory) : null, product.product)
    const sourceMode = clientSource ? 'client_csv' : 'kit_sample_fixture'
    const sourceText = clientSource?.text ?? product.sampleCsv
    const sourceName = clientSource?.name ?? `sample-${PRODUCT_FILE[product.product]}`
    const preview = await model.createClientImportPreview(sourceText, product.product, undefined, sourceName, product.templateId)
    if (!preview.readyForStaging || preview.totals.ready !== preview.totals.rows) {
      const fileIssueCount = preview.fileIssues.length
      const rowIssueCount = preview.rows.flatMap((row) => row.issues).length
      fail(`client_demo_source_not_ready_${product.product}_${fileIssueCount}_${rowIssueCount}`)
    }
    const stagingPackage = model.buildClientImportStagingPackage(preview, {
      workflowTemplateId: product.templateId,
      workspace: kit.blueprint.client.workspace,
      owner: kit.blueprint.client.owner,
      plantIndustryPackId: kit.blueprint.client.plantIndustryPackId,
    })
    packages.push(stagingPackage)
    sourceModes.set(product.product, sourceMode)
  }

  const validation = validateSelectedPackages(packages)
  if (validation.package_count !== packages.length || validation.results.length !== packages.length) fail('client_demo_server_validation_incomplete')
  const checks = preparationChecks(packages)
  const products = kit.blueprint.products.map((product, index) => {
    const stagingPackage = packages[index]
    const result = validation.results[index]
    if (result.status !== 'valid' || result.product !== product.product || result.workflow_template_id !== product.templateId
      || result.activation?.status !== 'not_applied' || result.activation?.human_approval_required !== true
      || result.activation?.external_writes_performed !== false) fail('client_demo_server_validation_drift')
    return {
      product: product.product,
      label: PRODUCT_LABEL[product.product],
      templateId: product.templateId,
      sourceMode: sourceModes.get(product.product),
      sourceName: stagingPackage.source.name,
      rowCount: result.row_count,
      previewDigest: result.preview_digest,
      packageDigest: result.package_digest,
      demoPath: product.demoPath,
      setupPath: product.setupPath,
      stagingPackage,
    }
  })
  const customSourceCount = products.filter((product) => product.sourceMode === 'client_csv').length
  const payload = {
    contract: CLIENT_DEMO_PREPARATION_CONTRACT,
    preparedAt: timestamp,
    kit: { schema: kit.schema, digest: sha256(kitText), exportedAt: kit.exportedAt },
    client: { ...kit.blueprint.client },
    foundation: structuredClone(kit.blueprint.foundation),
    products,
    integrations: kit.blueprint.integrations,
    checks,
    controls: {
      localArtifactOnly: true,
      containsNormalizedClientData: customSourceCount > 0,
      containsSampleFixtures: customSourceCount < products.length,
      safeToShareExternally: false,
      humanReviewRequired: true,
      externalWritesPerformed: false,
      hostedWritesPerformed: false,
      connectorCallsPerformed: false,
      modelCallsPerformed: false,
      activationStatus: 'not_applied',
    },
  }
  const bundleDigest = sha256(JSON.stringify(payload))
  const artifact = {
    ...payload,
    bundleDigest,
    review: {
      status: 'awaiting_founder_review',
      confirmation: `APPROVE CLIENT DEMO ${bundleDigest}`,
      checklist: [...REVIEW_CHECKLIST],
    },
  }
  if (Buffer.byteLength(JSON.stringify(artifact), 'utf8') > CLIENT_DEMO_PREPARATION_MAX_BYTES) fail('client_demo_preparation_too_large')
  return artifact
}

export function verifyClientDemoPreparation(value) {
  if (!hasExactKeys(value, ['contract', 'preparedAt', 'kit', 'client', 'foundation', 'products', 'integrations', 'checks', 'controls', 'bundleDigest', 'review'])
    || value.contract !== CLIENT_DEMO_PREPARATION_CONTRACT || !canonicalTimestamp(value.preparedAt)
    || !hasExactKeys(value.kit, ['schema', 'digest', 'exportedAt'])
    || value.kit.schema !== CLIENT_DEMO_KIT_SCHEMA
    || !/^sha256:[0-9a-f]{64}$/.test(value.kit.digest) || !canonicalTimestamp(value.kit.exportedAt)
    || !hasExactKeys(value.client, ['workspace', 'owner', 'presetId', 'shopIndustryPackId', 'plantIndustryPackId'])
    || !operatingFoundationValid(value.foundation, value.client)
    || !Array.isArray(value.products) || value.products.length < 1 || value.products.length > PRODUCT_ORDER.length
    || !Array.isArray(value.integrations) || !hasExactKeys(value.checks, ['ecommerceCatalogAligned', 'websiteHomePresent', 'plantLinesPresent', 'oneWorkspaceAndOwner'])
    || !hasExactKeys(value.controls, ['localArtifactOnly', 'containsNormalizedClientData', 'containsSampleFixtures', 'safeToShareExternally', 'humanReviewRequired', 'externalWritesPerformed', 'hostedWritesPerformed', 'connectorCallsPerformed', 'modelCallsPerformed', 'activationStatus'])
    || typeof value.bundleDigest !== 'string' || !hasExactKeys(value.review, ['status', 'confirmation', 'checklist'])) {
    fail('client_demo_preparation_contract_invalid')
  }
  const selectedProducts = value.products.map((product) => product?.product)
  if (JSON.stringify(selectedProducts) !== JSON.stringify(PRODUCT_ORDER.filter((product) => selectedProducts.includes(product)))) {
    fail('client_demo_product_order_invalid')
  }
  const packages = value.products.map((product) => {
    if (!hasExactKeys(product, ['product', 'label', 'templateId', 'sourceMode', 'sourceName', 'rowCount', 'previewDigest', 'packageDigest', 'demoPath', 'setupPath', 'stagingPackage'])
      || PRODUCT_LABEL[product.product] !== product.label || !['client_csv', 'kit_sample_fixture'].includes(product.sourceMode)
      || PRODUCT_PATHS[product.product]?.demoPath !== product.demoPath || PRODUCT_PATHS[product.product]?.setupPath !== product.setupPath
      || typeof product.templateId !== 'string' || product.sourceName !== product.stagingPackage?.source?.name) {
      fail('client_demo_product_contract_invalid')
    }
    return product.stagingPackage
  })
  const validation = validateSelectedPackages(packages)
  if (validation.package_count !== packages.length || validation.results.length !== packages.length) fail('client_demo_server_validation_incomplete')
  value.products.forEach((product, index) => {
    const result = validation.results[index]
    if (result.status !== 'valid' || result.product !== product.product || result.workflow_template_id !== product.templateId
      || result.row_count !== product.rowCount || result.preview_digest !== product.previewDigest || result.package_digest !== product.packageDigest
      || packages[index].workspace !== value.client.workspace || packages[index].owner !== value.client.owner
      || result.activation?.status !== 'not_applied' || result.activation?.human_approval_required !== true
      || result.activation?.external_writes_performed !== false) fail('client_demo_product_validation_drift')
  })
  if (JSON.stringify(value.integrations) !== JSON.stringify(canonicalIntegrations(selectedProducts))) fail('client_demo_integration_drift')
  if (JSON.stringify(value.checks) !== JSON.stringify(preparationChecks(packages))) fail('client_demo_check_drift')
  const customSourceCount = value.products.filter((product) => product.sourceMode === 'client_csv').length
  const expectedControls = {
    localArtifactOnly: true,
    containsNormalizedClientData: customSourceCount > 0,
    containsSampleFixtures: customSourceCount < value.products.length,
    safeToShareExternally: false,
    humanReviewRequired: true,
    externalWritesPerformed: false,
    hostedWritesPerformed: false,
    connectorCallsPerformed: false,
    modelCallsPerformed: false,
    activationStatus: 'not_applied',
  }
  if (JSON.stringify(value.controls) !== JSON.stringify(expectedControls)) fail('client_demo_control_drift')
  const payload = {
    contract: value.contract,
    preparedAt: value.preparedAt,
    kit: value.kit,
    client: value.client,
    foundation: value.foundation,
    products: value.products,
    integrations: value.integrations,
    checks: value.checks,
    controls: value.controls,
  }
  if (sha256(JSON.stringify(payload)) !== value.bundleDigest) fail('client_demo_bundle_digest_invalid')
  if (value.review.status !== 'awaiting_founder_review'
    || value.review.confirmation !== `APPROVE CLIENT DEMO ${value.bundleDigest}`
    || JSON.stringify(value.review.checklist) !== JSON.stringify(REVIEW_CHECKLIST)) fail('client_demo_review_contract_invalid')
  return {
    ok: true,
    contract: CLIENT_DEMO_PREPARATION_CONTRACT,
    bundleDigest: value.bundleDigest,
    productCount: value.products.length,
    clientDataFiles: customSourceCount,
    sampleFixtures: value.products.length - customSourceCount,
    status: 'verified_not_applied',
    humanReviewRequired: true,
  }
}

export async function writeClientDemoPreparation(artifact, outputPath) {
  if (!artifact || artifact.contract !== CLIENT_DEMO_PREPARATION_CONTRACT || typeof outputPath !== 'string' || !outputPath.trim()) {
    fail('client_demo_output_invalid')
  }
  const target = resolve(outputPath)
  if (!target.toLowerCase().endsWith('.json')) fail('client_demo_output_extension_invalid')
  const parent = dirname(target)
  const parentMetadata = await lstat(parent).catch(() => fail('client_demo_output_directory_invalid'))
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) fail('client_demo_output_directory_invalid')
  try { await access(target, fsConstants.F_OK); fail('client_demo_output_exists') } catch (error) {
    if (error instanceof PreparationError) throw error
  }
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`
  if (Buffer.byteLength(serialized, 'utf8') > CLIENT_DEMO_PREPARATION_MAX_BYTES) fail('client_demo_preparation_too_large')
  const temporary = resolve(parent, `.${basename(target)}.${randomUUID()}.tmp`)
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(serialized, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await link(temporary, target)
    await unlink(temporary).catch(() => null)
    await chmod(target, 0o600).catch(() => null)
  } catch {
    if (handle) await handle.close().catch(() => null)
    await unlink(temporary).catch(() => null)
    fail('client_demo_output_write_failed')
  }
  return target
}

export function clientDemoPreparationSummary(artifact, outputPath) {
  return {
    ok: true,
    contract: CLIENT_DEMO_PREPARATION_CONTRACT,
    output: resolve(outputPath),
    bundleDigest: artifact.bundleDigest,
    productCount: artifact.products.length,
    clientDataFiles: artifact.products.filter((product) => product.sourceMode === 'client_csv').length,
    sampleFixtures: artifact.products.filter((product) => product.sourceMode === 'kit_sample_fixture').length,
    activationStatus: artifact.controls.activationStatus,
    humanReviewRequired: artifact.controls.humanReviewRequired,
  }
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { mode: 'help' }
  if (argv.length === 2 && argv[0] === '--verify' && argv[1]) return { mode: 'verify', artifactPath: argv[1] }
  const parsed = { mode: 'prepare', kitPath: '', dataDirectory: '', outputPath: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!['--kit', '--data-dir', '--out'].includes(argument) || !argv[index + 1]) fail('client_demo_arguments_invalid')
    const value = argv[index + 1]
    index += 1
    if (argument === '--kit' && !parsed.kitPath) parsed.kitPath = value
    else if (argument === '--data-dir' && !parsed.dataDirectory) parsed.dataDirectory = value
    else if (argument === '--out' && !parsed.outputPath) parsed.outputPath = value
    else fail('client_demo_arguments_invalid')
  }
  if (!parsed.kitPath || !parsed.outputPath) fail('client_demo_arguments_invalid')
  return parsed
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.mode === 'help') {
      console.log('Prepare: npm run client:prepare -- --kit <setup-kit.json> [--data-dir <private-csv-directory>] --out <private-review.json>\nVerify: npm run client:prepare:verify -- <private-review.json>')
      return
    }
    if (options.mode === 'verify') {
      const text = await readableFile(resolve(options.artifactPath), CLIENT_DEMO_PREPARATION_MAX_BYTES, 'client_demo_preparation')
      let value
      try { value = JSON.parse(text) } catch { fail('client_demo_preparation_json_invalid') }
      console.log(JSON.stringify(verifyClientDemoPreparation(value)))
      return
    }
    const artifact = await prepareClientDemo(options)
    const output = await writeClientDemoPreparation(artifact, options.outputPath)
    console.log(JSON.stringify(clientDemoPreparationSummary(artifact, output)))
  } catch (error) {
    const code = error instanceof PreparationError ? error.code : 'client_demo_preparation_failed'
    console.error(JSON.stringify({ ok: false, contract: CLIENT_DEMO_PREPARATION_CONTRACT, error: code }))
    process.exitCode = 1
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
