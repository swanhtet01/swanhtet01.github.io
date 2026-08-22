import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants, existsSync } from 'node:fs'
import { access, chmod, link, lstat, mkdir, open, readFile, readdir, realpath, unlink } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  buildShopPilotHandoff,
  sanitizeShopPilotContactEvent,
  shopPilotInputFromContactEvent,
} from './create_shop_pilot_handoff.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const CLIENT_DEMO_PREPARATION_CONTRACT = 'supermega.client_demo_preparation.v3'
export const CLIENT_DEMO_PREPARATION_VALIDATION_CONTRACT = 'supermega.client_demo_preparation_validation.v1'
export const CLIENT_DEMO_PREPARATION_MAX_BYTES = 5 * 1024 * 1024
export const CLIENT_DEMO_REHEARSAL_PLAN_CONTRACT = 'supermega.client_demo_rehearsal_plan.v1'
export const CLIENT_DEMO_REHEARSAL_PLAN_MAX_BYTES = 512 * 1024
export const CLIENT_DEMO_REHEARSAL_OBSERVATIONS_CONTRACT = 'supermega.client_demo_rehearsal_observations.v1'
export const CLIENT_DEMO_REHEARSAL_RESULT_CONTRACT = 'supermega.client_demo_rehearsal_result.v1'
export const CLIENT_DEMO_REHEARSAL_RESULT_MAX_BYTES = 512 * 1024
export const CLIENT_CONTACT_INTAKE_REVIEW_CONTRACT = 'supermega.client_contact_intake_review.v1'
export const CLIENT_CONTACT_INTAKE_CONTRACT = 'supermega.client_contact_intake.v1'
export const CLIENT_CONTACT_INTAKE_WORKSPACE_CONTRACT = 'supermega.client_contact_intake_workspace.v1'
const CLIENT_DEMO_REHEARSAL_OBSERVATIONS_MAX_BYTES = 256 * 1024
const CLIENT_DEMO_KIT_MAX_BYTES = 128 * 1024
const CLIENT_PROFILE_MAX_BYTES = 16 * 1024
const CLIENT_DATA_MAX_BYTES = 512 * 1024
const CLIENT_CONTACT_EVENT_MAX_BYTES = 256 * 1024
const CLIENT_CONTACT_REVIEW_MAX_BYTES = 32 * 1024
const CLIENT_CONTACT_INTAKE_MAX_BYTES = 32 * 1024
const CLIENT_CONTACT_INTAKE_FILE = 'CONTACT-INTAKE.json'
const PRODUCT_ORDER = Object.freeze(['commerce', 'production', 'website', 'ecommerce'])
const PRODUCT_FILE = Object.freeze(Object.fromEntries(PRODUCT_ORDER.map((product) => [product, `${product}.csv`])))
const PRODUCT_LABEL = Object.freeze({ commerce: 'Shop', production: 'Plant', website: 'Website', ecommerce: 'Ecommerce' })
const CONTACT_PRODUCT = Object.freeze({ shop: 'commerce', commerce: 'commerce', plant: 'production', production: 'production', website: 'website', ecommerce: 'ecommerce', guide: 'guide' })
const CONTACT_PRODUCT_SUGGESTION = Object.freeze({ commerce: ['shop'], production: ['plant'], website: ['website'], ecommerce: ['shop', 'ecommerce'], guide: [] })
const CONTACT_PRESET_SUGGESTION = Object.freeze({ commerce: 'retail-network', production: 'manufacturing', website: 'service-business', ecommerce: 'retail-network', guide: 'service-business' })
const PRODUCT_PATHS = Object.freeze({
  commerce: { demoPath: '/shop/?tab=counter', setupPath: '/settings/?product=shop' },
  production: { demoPath: '/plant/?tab=production', setupPath: '/settings/?product=plant' },
  website: { demoPath: '/website/', setupPath: '/settings/?product=website' },
  ecommerce: { demoPath: '/ecommerce/', setupPath: '/settings/?product=ecommerce' },
})
const CLIENT_DEMO_KIT_SCHEMA = 'supermega.client_demo_kit.v3'
const CLIENT_PROFILE_SCHEMA = 'supermega.client_profile.v1'
export const CLIENT_INTAKE_WORKSPACE_CONTRACT = 'supermega.client_intake_workspace.v1'
const CLIENT_PROFILE_WORKSPACE_PLACEHOLDER = 'REPLACE WITH CLIENT WORKSPACE'
const CLIENT_PROFILE_OWNER_PLACEHOLDER = 'REPLACE WITH IMPLEMENTATION OWNER'
const CLIENT_OPERATING_FOUNDATION_SCHEMA = 'supermega.client_operating_foundation.v1'
const CLIENT_OPERATIONAL_TOPOLOGY_SCHEMA = 'supermega.client_operational_topology.v1'
const OPERATING_UNIT_KIND = Object.freeze({
  'social-seller': 'digital-commerce',
  'retail-network': 'retail',
  'food-service': 'food-service',
  manufacturing: 'plant',
  bakery: 'food-service',
  fashion: 'plant',
  'service-business': 'service',
})
const CHANNEL_BY_PRODUCT = Object.freeze({
  commerce: { id: 'shop-counter', label: 'Counter and assisted orders', kind: 'assisted-sales' },
  production: { id: 'plant-execution', label: 'Production execution', kind: 'production-execution' },
  website: { id: 'website-inquiry', label: 'Website inquiries', kind: 'lead-capture' },
  ecommerce: { id: 'ecommerce-storefront', label: 'Digital storefront', kind: 'digital-sales' },
})
const RECORDS_BY_PRODUCT = Object.freeze({
  commerce: ['catalog', 'inventory', 'orders', 'payments', 'customer_accounts'],
  production: ['materials', 'work_orders', 'quality', 'maintenance', 'released_stock'],
  website: ['pages', 'content', 'releases', 'lead_intake'],
  ecommerce: ['storefront', 'collections', 'carts', 'quotes', 'order_requests'],
})
const REVIEW_CHECKLIST = Object.freeze([
  'Confirm the workspace, owner, selected templates, and industry packs.',
  'Review every normalized source row and resolve client-data corrections.',
  'Open each product demo path and complete its operational proof scenario.',
  'Confirm Shop, Plant, Website, and Ecommerce cross-product checks.',
  'Approve this exact bundle digest before any managed activation.',
])
const REHEARSAL_ACCEPTANCE = Object.freeze([
  'baseline_exported',
  'local_apply_confirmed',
  'reload_verified',
  'mobile_390_verified',
  'desktop_1280_verified',
  'idempotent_replay_verified',
  'evidence_exported',
  'reset_verified',
  'baseline_restored',
])
const REHEARSAL_SCENARIO = Object.freeze({
  commerce: 'sale_review_boundary',
  production: 'execution_guard',
  website: 'editor_mobile_preview',
  ecommerce: 'cart_reload_persistence',
})
const REHEARSAL_OBSERVATION_STATUS = Object.freeze(['passed', 'failed', 'not_run'])

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

function boundedPrivateText(value, code, maximum, { optional = false, singleLine = false } = {}) {
  if (typeof value !== 'string') fail(code)
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if ((!normalized && !optional) || normalized.length > maximum) fail(code)
  const forbidden = singleLine ? /[\u0000-\u001f\u007f]/ : /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
  if (forbidden.test(normalized)) fail(code)
  return normalized
}

function canonicalContactProducts(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > PRODUCT_ORDER.length) fail('client_contact_products_invalid')
  const mapped = values.map((value) => CONTACT_PRODUCT[String(value || '').trim().toLowerCase()]).filter((value) => value && value !== 'guide')
  if (mapped.length !== values.length || new Set(mapped).size !== mapped.length) fail('client_contact_products_invalid')
  const canonical = PRODUCT_ORDER.filter((product) => mapped.includes(product))
  if (JSON.stringify(canonical) !== JSON.stringify(mapped)) fail('client_contact_products_invalid')
  if (canonical.includes('ecommerce') && !canonical.includes('commerce')) fail('client_contact_ecommerce_requires_shop')
  return canonical
}

function normalizedClientContactEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)
    || event.event !== 'supermega.contact.created'
    || !event.record || typeof event.record !== 'object' || Array.isArray(event.record)) fail('client_contact_event_invalid')
  const leadId = boundedPrivateText(event.record.lead_id, 'client_contact_lead_invalid', 80, { singleLine: true })
  if (!/^LEAD-[A-Z0-9]{8,72}$/.test(leadId)) fail('client_contact_lead_invalid')
  const requestedProduct = CONTACT_PRODUCT[String(event.record.workflow || '').trim().toLowerCase()]
  if (!requestedProduct) fail('client_contact_product_invalid')
  const company = boundedPrivateText(event.record.company, 'client_contact_company_invalid', 180, { singleLine: true })
  const goal = boundedPrivateText(event.record.goal, 'client_contact_goal_invalid', 4_000)
  const requestedTemplate = boundedPrivateText(String(event.record.requested_package || ''), 'client_contact_template_invalid', 120, { optional: true, singleLine: true })
  const submittedAt = canonicalTimestamp(event.record.submitted_at)
  if (!submittedAt) fail('client_contact_submitted_time_invalid')
  return { leadId, requestedProduct, company, goal, requestedTemplate, submittedAt }
}

export function buildClientContactReviewTemplate(event) {
  const contact = normalizedClientContactEvent(event)
  return {
    contract: CLIENT_CONTACT_INTAKE_REVIEW_CONTRACT,
    leadId: contact.leadId,
    workspace: 'REPLACE WITH REVIEWED WORKSPACE',
    implementationOwner: 'REPLACE WITH IMPLEMENTATION OWNER',
    presetId: CONTACT_PRESET_SUGGESTION[contact.requestedProduct],
    products: [...CONTACT_PRODUCT_SUGGESTION[contact.requestedProduct]],
    companyReviewed: false,
    goalReviewed: false,
    privateWorkspaceApproved: false,
    reviewedAt: 'REPLACE WITH REVIEW TIME ISO',
  }
}

export function buildClientContactIntake(event, review) {
  const contact = normalizedClientContactEvent(event)
  if (!review || typeof review !== 'object' || Array.isArray(review)
    || !hasExactKeys(review, ['contract', 'leadId', 'workspace', 'implementationOwner', 'presetId', 'products', 'companyReviewed', 'goalReviewed', 'privateWorkspaceApproved', 'reviewedAt'])
    || review.contract !== CLIENT_CONTACT_INTAKE_REVIEW_CONTRACT) fail('client_contact_review_invalid')

  if (review.leadId !== contact.leadId) fail('client_contact_lead_mismatch')
  const reviewedAt = canonicalTimestamp(review.reviewedAt)
  if (!reviewedAt || Date.parse(reviewedAt) < Date.parse(contact.submittedAt)) fail('client_contact_review_time_invalid')
  if (review.companyReviewed !== true || review.goalReviewed !== true || review.privateWorkspaceApproved !== true) fail('client_contact_review_approval_required')

  const workspace = boundedPrivateText(review.workspace, 'client_contact_workspace_invalid', 60, { singleLine: true })
  const implementationOwner = boundedPrivateText(review.implementationOwner, 'client_contact_owner_invalid', 80, { singleLine: true })
  const presetId = boundedPrivateText(review.presetId, 'client_contact_preset_invalid', 60, { singleLine: true })
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(presetId)) fail('client_contact_preset_invalid')
  const products = canonicalContactProducts(review.products)
  if (contact.requestedProduct !== 'guide' && !products.includes(contact.requestedProduct)) fail('client_contact_requested_product_missing')

  const body = {
    contract: CLIENT_CONTACT_INTAKE_CONTRACT,
    source: {
      event: 'supermega.contact.created',
      leadDigest: sha256(contact.leadId),
      companyDigest: sha256(contact.company),
      submittedAt: contact.submittedAt,
    },
    client: {
      workspace,
      implementationOwner,
      presetId,
      products,
      requestedProduct: contact.requestedProduct,
    },
    request: {
      goal: contact.goal,
      requestedTemplate: contact.requestedTemplate,
    },
    review: {
      reviewedAt,
      companyReviewed: true,
      goalReviewed: true,
      privateWorkspaceApproved: true,
    },
    controls: {
      privateArtifact: true,
      requesterNameRetained: false,
      requesterEmailRetained: false,
      rawContactRetained: false,
      externalWritesPerformed: false,
      modelCallsPerformed: false,
      activationStatus: 'not_applied',
    },
  }
  const packet = { ...body, digest: sha256(JSON.stringify(body)) }
  if (Buffer.byteLength(JSON.stringify(packet), 'utf8') > CLIENT_CONTACT_INTAKE_MAX_BYTES) fail('client_contact_intake_too_large')
  return packet
}

export function verifyClientContactIntake(value) {
  if (!hasExactKeys(value, ['contract', 'source', 'client', 'request', 'review', 'controls', 'digest'])
    || value.contract !== CLIENT_CONTACT_INTAKE_CONTRACT
    || !hasExactKeys(value.source, ['event', 'leadDigest', 'companyDigest', 'submittedAt'])
    || value.source.event !== 'supermega.contact.created'
    || !/^sha256:[0-9a-f]{64}$/.test(value.source.leadDigest)
    || !/^sha256:[0-9a-f]{64}$/.test(value.source.companyDigest)
    || !canonicalTimestamp(value.source.submittedAt)
    || !hasExactKeys(value.client, ['workspace', 'implementationOwner', 'presetId', 'products', 'requestedProduct'])
    || !hasExactKeys(value.request, ['goal', 'requestedTemplate'])
    || !hasExactKeys(value.review, ['reviewedAt', 'companyReviewed', 'goalReviewed', 'privateWorkspaceApproved'])
    || !hasExactKeys(value.controls, ['privateArtifact', 'requesterNameRetained', 'requesterEmailRetained', 'rawContactRetained', 'externalWritesPerformed', 'modelCallsPerformed', 'activationStatus'])
    || value.controls.privateArtifact !== true
    || value.controls.requesterNameRetained !== false
    || value.controls.requesterEmailRetained !== false
    || value.controls.rawContactRetained !== false
    || value.controls.externalWritesPerformed !== false
    || value.controls.modelCallsPerformed !== false
    || value.controls.activationStatus !== 'not_applied'
    || value.review.companyReviewed !== true
    || value.review.goalReviewed !== true
    || value.review.privateWorkspaceApproved !== true
    || !canonicalTimestamp(value.review.reviewedAt)
    || Date.parse(value.review.reviewedAt) < Date.parse(value.source.submittedAt)
    || !CONTACT_PRODUCT[value.client.requestedProduct]
    || typeof value.digest !== 'string') fail('client_contact_intake_invalid')
  boundedPrivateText(value.client.workspace, 'client_contact_intake_invalid', 60, { singleLine: true })
  boundedPrivateText(value.client.implementationOwner, 'client_contact_intake_invalid', 80, { singleLine: true })
  boundedPrivateText(value.client.presetId, 'client_contact_intake_invalid', 60, { singleLine: true })
  boundedPrivateText(value.request.goal, 'client_contact_intake_invalid', 4_000)
  boundedPrivateText(value.request.requestedTemplate, 'client_contact_intake_invalid', 120, { optional: true, singleLine: true })
  const products = canonicalContactProducts(value.client.products)
  if (JSON.stringify(products) !== JSON.stringify(value.client.products)
    || (value.client.requestedProduct !== 'guide' && !products.includes(value.client.requestedProduct))) fail('client_contact_intake_invalid')
  const { digest, ...body } = value
  if (digest !== sha256(JSON.stringify(body)) || Buffer.byteLength(JSON.stringify(value), 'utf8') > CLIENT_CONTACT_INTAKE_MAX_BYTES) fail('client_contact_intake_invalid')
  return value
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

function canonicalOperationalTopology(client, products) {
  const selected = new Set(products)
  const dependencies = (product) => PRODUCT_ORDER.filter((candidate) => (
    (product === 'commerce' && candidate === 'production' && selected.has(candidate))
    || (product === 'production' && candidate === 'commerce' && selected.has(candidate))
    || (product === 'ecommerce' && candidate === 'commerce' && selected.has(candidate))
    || (product === 'ecommerce' && candidate === 'website' && selected.has(candidate))
  ))
  return {
    schema: CLIENT_OPERATIONAL_TOPOLOGY_SCHEMA,
    locations: [{ id: 'LOC-MAIN', code: 'MAIN', name: 'Main operating unit', kind: OPERATING_UNIT_KIND[client.presetId], timeZone: 'Asia/Yangon', active: true }],
    channels: products.map((product) => ({ ...CHANNEL_BY_PRODUCT[product], locationId: 'LOC-MAIN', owningProduct: product })),
    recordAuthorities: products.map((product) => ({
      product,
      label: PRODUCT_LABEL[product],
      locationIds: ['LOC-MAIN'],
      owns: [...RECORDS_BY_PRODUCT[product]],
      consumesFrom: dependencies(product),
      writePolicy: 'human_review_required',
    })),
    controls: { canonicalLocationRequired: true, crossProductReferencesRequired: true, unmanagedWritesAllowed: false },
  }
}

function operationalTopologyValid(value, client, products) {
  return Boolean(OPERATING_UNIT_KIND[client?.presetId]
    && products.every((product) => PRODUCT_ORDER.includes(product))
    && JSON.stringify(value) === JSON.stringify(canonicalOperationalTopology(client, products)))
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

async function clientDataDirectory(path) {
  let directoryMetadata
  try { directoryMetadata = await lstat(path) } catch { fail('client_data_directory_missing') }
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) fail('client_data_directory_invalid')
  return realpath(path).catch(() => fail('client_data_directory_invalid'))
}

async function clientProfileKit(directoryRealPath, timestamp, model) {
  const profileText = await readableFile(resolve(directoryRealPath, 'client.json'), CLIENT_PROFILE_MAX_BYTES, 'client_profile')
  let profile
  try { profile = JSON.parse(profileText) } catch { fail('client_profile_json_invalid') }
  if (!hasExactKeys(profile, ['schema', 'workspace', 'owner', 'presetId', 'products'])
    || profile.schema !== CLIENT_PROFILE_SCHEMA
    || profile.workspace === CLIENT_PROFILE_WORKSPACE_PLACEHOLDER || profile.owner === CLIENT_PROFILE_OWNER_PLACEHOLDER
    || !Array.isArray(profile.products) || profile.products.length < 1 || profile.products.length > PRODUCT_ORDER.length
    || profile.products.some((product) => !PRODUCT_ORDER.includes(product))
    || new Set(profile.products).size !== profile.products.length
    || JSON.stringify(profile.products) !== JSON.stringify(PRODUCT_ORDER.filter((product) => profile.products.includes(product)))) {
    fail('client_profile_contract_invalid')
  }
  try {
    const preset = model.clientDemoPreset(profile.presetId)
    const recommended = new Map(preset.selections.map((selection) => [selection.product, selection.templateId]))
    const selections = profile.products.map((product) => ({
      product,
      templateId: recommended.get(product) ?? model.clientImportWorkflowTemplateIds(product)[0],
    }))
    if (selections.some((selection) => !selection.templateId)) fail('client_profile_contract_invalid')
    const blueprint = model.buildClientDemoBlueprint({
      workspace: profile.workspace,
      owner: profile.owner,
      presetId: preset.id,
      shopIndustryPackId: preset.shopIndustryPackId,
      plantIndustryPackId: preset.plantIndustryPackId,
      selections,
    })
    const kit = model.buildClientDemoKit(blueprint, timestamp)
    return { kit, kitText: JSON.stringify(kit) }
  } catch (error) {
    if (error instanceof PreparationError) throw error
    fail('client_profile_contract_invalid')
  }
}

async function writePrivateStarterFile(path, content) {
  let handle
  try {
    handle = await open(path, 'wx', 0o600)
    await handle.writeFile(content, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await chmod(path, 0o600).catch(() => null)
  } catch {
    if (handle) await handle.close().catch(() => null)
    fail('client_workspace_init_write_failed')
  }
}

export async function writeClientContactReviewTemplate(event, outputPath) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) fail('client_contact_review_output_invalid')
  const template = buildClientContactReviewTemplate(event)
  await writePrivateStarterFile(resolve(outputPath), `${JSON.stringify(template, null, 2)}\n`)
  return {
    ok: true,
    contract: CLIENT_CONTACT_INTAKE_REVIEW_CONTRACT,
    suggestedProductCount: template.products.length,
    reviewApproved: false,
    requesterNameRetained: false,
    requesterEmailRetained: false,
    rawContactRetained: false,
    externalWritesPerformed: false,
    modelCallsPerformed: false,
  }
}

async function initializeClientWorkspaceFiles({ directory, presetId, products, workspace, owner, contactIntake = null }) {
  if (typeof directory !== 'string' || !directory.trim() || typeof presetId !== 'string'
    || !Array.isArray(products) || products.length < 1 || products.length > PRODUCT_ORDER.length
    || products.some((product) => !PRODUCT_ORDER.includes(product)) || new Set(products).size !== products.length
    || JSON.stringify(products) !== JSON.stringify(PRODUCT_ORDER.filter((product) => products.includes(product)))) {
    fail('client_workspace_init_arguments_invalid')
  }
  const contactBound = contactIntake !== null
  if (contactBound) {
    verifyClientContactIntake(contactIntake)
    if (workspace !== contactIntake.client.workspace || owner !== contactIntake.client.implementationOwner
      || presetId !== contactIntake.client.presetId || JSON.stringify(products) !== JSON.stringify(contactIntake.client.products)) {
      fail('client_contact_workspace_binding_invalid')
    }
  } else if (workspace !== CLIENT_PROFILE_WORKSPACE_PLACEHOLDER || owner !== CLIENT_PROFILE_OWNER_PLACEHOLDER) {
    fail('client_workspace_init_profile_unreviewed')
  }
  const target = resolve(directory)
  const parent = dirname(target)
  const parentMetadata = await lstat(parent).catch(() => fail('client_workspace_init_parent_invalid'))
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) fail('client_workspace_init_parent_invalid')
  try { await access(target, fsConstants.F_OK); fail('client_workspace_init_exists') } catch (error) {
    if (error instanceof PreparationError) throw error
  }
  const model = await import(`${pathToFileURL(resolve(ROOT, 'showroom', 'src', 'core', 'client-onboarding.ts')).href}?client-workspace-init=${Date.now()}`)
  let preset
  try { preset = model.clientDemoPreset(presetId) } catch { fail('client_workspace_init_preset_invalid') }
  const recommended = new Map(preset.selections.map((selection) => [selection.product, selection.templateId]))
  const selections = products.map((product) => ({
    product,
    templateId: recommended.get(product) ?? model.clientImportWorkflowTemplateIds(product)[0],
  }))
  if (selections.some((selection) => !selection.templateId)) fail('client_workspace_init_preset_invalid')
  const blueprint = model.buildClientDemoBlueprint({
    workspace,
    owner,
    presetId: preset.id,
    shopIndustryPackId: preset.shopIndustryPackId,
    plantIndustryPackId: preset.plantIndustryPackId,
    selections,
  })
  try {
    await mkdir(target, { mode: 0o700 })
    await chmod(target, 0o700).catch(() => null)
    const templateDirectory = resolve(target, '_templates')
    await mkdir(templateDirectory, { mode: 0o700 })
    await chmod(templateDirectory, 0o700).catch(() => null)
    const profile = {
      schema: CLIENT_PROFILE_SCHEMA,
      workspace,
      owner,
      presetId: preset.id,
      products: [...products],
    }
    await writePrivateStarterFile(resolve(target, 'client.json'), `${JSON.stringify(profile, null, 2)}\n`)
    if (contactBound) await writePrivateStarterFile(resolve(target, CLIENT_CONTACT_INTAKE_FILE), `${JSON.stringify(contactIntake, null, 2)}\n`)
    for (const product of blueprint.products) {
      await writePrivateStarterFile(resolve(templateDirectory, PRODUCT_FILE[product.product]), product.sampleCsv)
    }
    const selectedFiles = blueprint.products.map((product) => `- ${PRODUCT_LABEL[product.product]}: copy _templates/${PRODUCT_FILE[product.product]} to ${PRODUCT_FILE[product.product]}, then replace every sample row with reviewed client data.`).join('\n')
    const firstStep = contactBound
      ? `1. Review client.json and ${CLIENT_CONTACT_INTAKE_FILE}. The requester name, email, and raw contact record were not copied into this folder.`
      : '1. Edit client.json and replace both uppercase placeholders.'
    const guide = `# SuperMega private client intake\n\nThis folder is local and private.${contactBound ? ' It contains the reviewed company request and must not be shared.' : ' It contains no client data yet and is not safe to share after real data is added.'}\n\n${firstStep}\n2. Use only the products listed in client.json.\n3. For each client-supplied dataset you want to use:\n${selectedFiles}\n4. Leave a product CSV absent to use its clearly labelled demo fixture.\n5. Prepare and verify without applying anything:\n\n   npm run client:prepare -- --data-dir "<this-folder>" --out "<private-review.json>"\n   npm run client:prepare:verify -- "<private-review.json>"\n\nNo model, connector, hosted write, activation, inventory change, order, or production action occurs during preparation.\n`
    await writePrivateStarterFile(resolve(target, 'START-HERE.md'), guide)
  } catch (error) {
    if (error instanceof PreparationError) throw error
    fail('client_workspace_init_write_failed')
  }
  return {
    ok: true,
    contract: CLIENT_INTAKE_WORKSPACE_CONTRACT,
    presetId: preset.id,
    productCount: products.length,
    templateCount: products.length,
    containsClientData: contactBound,
    externalWritesPerformed: false,
    modelCallsPerformed: false,
    activationStatus: 'not_applied',
  }
}

export async function initializeClientWorkspace({ directory, presetId = 'manufacturing', products = PRODUCT_ORDER }) {
  return initializeClientWorkspaceFiles({
    directory,
    presetId,
    products,
    workspace: CLIENT_PROFILE_WORKSPACE_PLACEHOLDER,
    owner: CLIENT_PROFILE_OWNER_PLACEHOLDER,
  })
}

export async function initializeClientWorkspaceFromContact({ directory, event, review }) {
  const contactIntake = buildClientContactIntake(event, review)
  const initialized = await initializeClientWorkspaceFiles({
    directory,
    presetId: contactIntake.client.presetId,
    products: contactIntake.client.products,
    workspace: contactIntake.client.workspace,
    owner: contactIntake.client.implementationOwner,
    contactIntake,
  })
  return {
    ...initialized,
    contract: CLIENT_CONTACT_INTAKE_WORKSPACE_CONTRACT,
    contactIntakeDigest: contactIntake.digest,
    requestedProduct: contactIntake.client.requestedProduct,
  }
}

export function buildShopPilotClientIntake(event, ownerInput, implementationOwner, reviewedAt = new Date().toISOString()) {
  const contact = sanitizeShopPilotContactEvent(event)
  const pilotInput = shopPilotInputFromContactEvent(contact, ownerInput)
  const handoff = buildShopPilotHandoff(pilotInput)
  if (handoff.status !== 'ready-for-private-pilot') fail('shop_pilot_client_workspace_owner_approval_required')
  const canonicalReviewedAt = canonicalTimestamp(reviewedAt)
  if (!canonicalReviewedAt) fail('shop_pilot_client_workspace_review_time_invalid')
  const workspace = boundedPrivateText(pilotInput.tenantLabel, 'shop_pilot_client_workspace_name_invalid', 60, { singleLine: true })
  const owner = boundedPrivateText(implementationOwner, 'shop_pilot_client_workspace_owner_invalid', 80, { singleLine: true })
  const body = {
    contract: CLIENT_CONTACT_INTAKE_CONTRACT,
    source: {
      event: 'supermega.contact.created',
      leadDigest: sha256(contact.record.lead_id),
      companyDigest: sha256(contact.record.company),
      submittedAt: canonicalReviewedAt,
    },
    client: {
      workspace,
      implementationOwner: owner,
      presetId: 'service-business',
      products: ['commerce'],
      requestedProduct: 'commerce',
    },
    request: {
      goal: pilotInput.operationalProblem,
      requestedTemplate: 'beauty-spa',
    },
    review: {
      reviewedAt: canonicalReviewedAt,
      companyReviewed: true,
      goalReviewed: true,
      privateWorkspaceApproved: true,
    },
    controls: {
      privateArtifact: true,
      requesterNameRetained: false,
      requesterEmailRetained: false,
      rawContactRetained: false,
      externalWritesPerformed: false,
      modelCallsPerformed: false,
      activationStatus: 'not_applied',
    },
  }
  return verifyClientContactIntake({ ...body, digest: sha256(JSON.stringify(body)) })
}

export async function initializeClientWorkspaceFromShopPilot({ directory, event, ownerInput, implementationOwner, reviewedAt }) {
  const contactIntake = buildShopPilotClientIntake(event, ownerInput, implementationOwner, reviewedAt)
  return initializeClientWorkspaceFiles({
    directory,
    presetId: contactIntake.client.presetId,
    products: contactIntake.client.products,
    workspace: contactIntake.client.workspace,
    owner: contactIntake.client.implementationOwner,
    contactIntake,
  })
}

export async function verifyContactClientWorkspace(directory) {
  const target = await clientDataDirectory(resolve(directory))
  const intakeText = await readableFile(resolve(target, CLIENT_CONTACT_INTAKE_FILE), CLIENT_CONTACT_INTAKE_MAX_BYTES, 'client_contact_intake')
  const profileText = await readableFile(resolve(target, 'client.json'), CLIENT_PROFILE_MAX_BYTES, 'client_profile')
  let intake
  let profile
  try { intake = verifyClientContactIntake(JSON.parse(intakeText)) } catch (error) {
    if (error instanceof PreparationError) throw error
    fail('client_contact_intake_json_invalid')
  }
  try { profile = JSON.parse(profileText) } catch { fail('client_profile_json_invalid') }
  if (!hasExactKeys(profile, ['schema', 'workspace', 'owner', 'presetId', 'products'])
    || profile.schema !== CLIENT_PROFILE_SCHEMA
    || profile.workspace !== intake.client.workspace
    || profile.owner !== intake.client.implementationOwner
    || profile.presetId !== intake.client.presetId
    || JSON.stringify(profile.products) !== JSON.stringify(intake.client.products)) fail('client_contact_workspace_binding_invalid')
  const templateDirectory = resolve(target, '_templates')
  const templateMetadata = await lstat(templateDirectory).catch(() => fail('client_contact_workspace_templates_invalid'))
  if (!templateMetadata.isDirectory() || templateMetadata.isSymbolicLink()) fail('client_contact_workspace_templates_invalid')
  const expectedTemplates = intake.client.products.map((product) => PRODUCT_FILE[product]).sort()
  const actualTemplates = (await readdir(templateDirectory, { withFileTypes: true }).catch(() => fail('client_contact_workspace_templates_invalid')))
    .map((entry) => entry.isFile() && !entry.isSymbolicLink() ? entry.name : '')
    .sort()
  if (JSON.stringify(actualTemplates) !== JSON.stringify(expectedTemplates)) fail('client_contact_workspace_templates_invalid')
  for (const file of expectedTemplates) await readableFile(resolve(templateDirectory, file), CLIENT_DATA_MAX_BYTES, 'client_contact_workspace_template')
  await readableFile(resolve(target, 'START-HERE.md'), CLIENT_PROFILE_MAX_BYTES, 'client_contact_workspace_guide')
  return {
    ok: true,
    contract: CLIENT_CONTACT_INTAKE_WORKSPACE_CONTRACT,
    contactIntakeDigest: intake.digest,
    requestedProduct: intake.client.requestedProduct,
    productCount: intake.client.products.length,
    containsClientData: true,
    requesterNameRetained: false,
    requesterEmailRetained: false,
    rawContactRetained: false,
    externalWritesPerformed: false,
    modelCallsPerformed: false,
    activationStatus: 'not_applied',
  }
}

async function validateClientDataDirectory(directoryRealPath, selectedProducts, profileMode) {
  const entries = await readdir(directoryRealPath, { withFileTypes: true }).catch(() => fail('client_data_directory_unreadable'))
  const allowedCsv = new Set(selectedProducts.map((product) => PRODUCT_FILE[product]))
  for (const entry of entries) {
    if (entry.name === 'client.json') {
      if (!profileMode) fail('client_data_profile_conflict')
      continue
    }
    if (!entry.name.toLowerCase().endsWith('.csv')) continue
    if (!allowedCsv.has(entry.name)) fail('client_data_file_unrecognized')
    if (!entry.isFile() || entry.isSymbolicLink()) fail('client_data_file_invalid')
  }
}

async function optionalClientSource(directoryRealPath, product) {
  if (!directoryRealPath) return null
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
  const model = await import(`${pathToFileURL(resolve(ROOT, 'showroom', 'src', 'core', 'client-onboarding.ts')).href}?client-preparation=${Date.now()}`)
  if (!kitPath && !dataDirectory) fail('client_demo_setup_source_invalid')
  const directoryRealPath = dataDirectory ? await clientDataDirectory(resolve(dataDirectory)) : null
  let kitText
  let kitValue
  const profileMode = !kitPath
  if (profileMode) {
    const generated = await clientProfileKit(directoryRealPath, timestamp, model)
    kitText = generated.kitText
    kitValue = generated.kit
  } else {
    kitText = await readableFile(resolve(kitPath), CLIENT_DEMO_KIT_MAX_BYTES, 'client_demo_kit')
    try { kitValue = JSON.parse(kitText) } catch { fail('client_demo_kit_json_invalid') }
  }
  const kit = model.restoreClientDemoKit(kitValue)
  if (!kit) fail('client_demo_kit_contract_invalid')
  const selectedProducts = kit.blueprint.products.map((product) => product.product)
  const canonicalProducts = PRODUCT_ORDER.filter((product) => selectedProducts.includes(product))
  if (JSON.stringify(selectedProducts) !== JSON.stringify(canonicalProducts)) fail('client_demo_product_order_invalid')
  if (directoryRealPath) await validateClientDataDirectory(directoryRealPath, selectedProducts, profileMode)

  const packages = []
  const sourceModes = new Map()
  for (const product of kit.blueprint.products) {
    const clientSource = await optionalClientSource(directoryRealPath, product.product)
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
    topology: structuredClone(kit.blueprint.topology),
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
  if (!hasExactKeys(value, ['contract', 'preparedAt', 'kit', 'client', 'foundation', 'topology', 'products', 'integrations', 'checks', 'controls', 'bundleDigest', 'review'])
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
  if (!operationalTopologyValid(value.topology, value.client, selectedProducts)) fail('client_demo_topology_drift')
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
    topology: value.topology,
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

function clientDemoRehearsalPayload(preparation, plannedAt) {
  const products = preparation.products.map((product, index) => ({
    id: `REHEARSE-${String(index + 1).padStart(2, '0')}`,
    product: product.product,
    label: product.label,
    sourceMode: product.sourceMode,
    rowCount: product.rowCount,
    packageDigest: product.packageDigest,
    demoPath: product.demoPath,
    reconciliation: {
      firstApplyEquation: 'created_plus_already_present_equals_row_count',
      replayEquation: 'created_zero_and_already_present_equals_row_count',
      duplicateHandling: 'shared_master_review_required_if_candidates_exist',
    },
    rollback: {
      baselineExportRequired: true,
      method: 'restore_exact_pre_rehearsal_export',
      status: 'pending',
    },
    acceptance: Object.fromEntries(REHEARSAL_ACCEPTANCE.map((check) => [check, 'pending'])),
    status: 'not_started',
  }))
  return {
    contract: CLIENT_DEMO_REHEARSAL_PLAN_CONTRACT,
    plannedAt,
    preparation: {
      contract: preparation.contract,
      bundleDigest: preparation.bundleDigest,
      productCount: preparation.products.length,
      clientDataFiles: preparation.products.filter((product) => product.sourceMode === 'client_csv').length,
    },
    authorityDigest: sha256(JSON.stringify({ client: preparation.client, foundation: preparation.foundation, topology: preparation.topology })),
    products,
    reconciliation: {
      status: 'ready_for_rehearsal',
      checks: Object.entries(preparation.checks).map(([id, passed]) => ({ id, passed })),
      integrations: preparation.integrations.map(({ from, to }) => ({ from, to, status: 'pending_rehearsal' })),
      unresolvedIssues: 0,
    },
    run: {
      status: 'not_started',
      installOrder: products.map((product) => product.product),
      viewportWidths: [390, 1280],
      completedChecks: 0,
      totalChecks: products.length * REHEARSAL_ACCEPTANCE.length,
    },
    controls: {
      planOnly: true,
      containsClientValues: false,
      safeToShareExternally: false,
      localBrowserRehearsalRequired: true,
      browserWritesPerformed: false,
      resetPerformed: false,
      restorePerformed: false,
      hostedWritesPerformed: false,
      externalWritesPerformed: false,
      connectorCallsPerformed: false,
      modelCallsPerformed: false,
      activationStatus: 'not_applied',
    },
  }
}

export function buildClientDemoRehearsalPlan(preparationValue, plannedAt = new Date().toISOString()) {
  verifyClientDemoPreparation(preparationValue)
  const timestamp = canonicalTimestamp(plannedAt)
  if (!timestamp) fail('client_demo_rehearsal_planned_at_invalid')
  const payload = clientDemoRehearsalPayload(preparationValue, timestamp)
  const plan = { ...payload, digest: sha256(JSON.stringify(payload)) }
  if (Buffer.byteLength(JSON.stringify(plan), 'utf8') > CLIENT_DEMO_REHEARSAL_PLAN_MAX_BYTES) fail('client_demo_rehearsal_too_large')
  return plan
}

export function verifyClientDemoRehearsalPlan(value, preparationValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.contract !== CLIENT_DEMO_REHEARSAL_PLAN_CONTRACT
    || !canonicalTimestamp(value.plannedAt) || typeof value.digest !== 'string') fail('client_demo_rehearsal_contract_invalid')
  const expected = buildClientDemoRehearsalPlan(preparationValue, value.plannedAt)
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail('client_demo_rehearsal_drift')
  return {
    ok: true,
    contract: CLIENT_DEMO_REHEARSAL_PLAN_CONTRACT,
    preparationDigest: value.preparation.bundleDigest,
    productCount: value.products.length,
    status: value.run.status,
    completedChecks: value.run.completedChecks,
    totalChecks: value.run.totalChecks,
    planOnly: true,
  }
}

function normalizedRehearsalObservations(value, plan) {
  if (!hasExactKeys(value, ['contract', 'observedAt', 'operator', 'environment', 'products', 'controls'])
    || value.contract !== CLIENT_DEMO_REHEARSAL_OBSERVATIONS_CONTRACT || !canonicalTimestamp(value.observedAt)
    || !hasExactKeys(value.operator, ['kind', 'label'])
    || !['codex_in_app_browser', 'human_browser_review'].includes(value.operator.kind)
    || typeof value.operator.label !== 'string' || !value.operator.label.trim() || value.operator.label.length > 120
    || !hasExactKeys(value.environment, ['origin', 'browser', 'workspaceKind'])
    || !/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(value.environment.origin)
    || typeof value.environment.browser !== 'string' || !value.environment.browser.trim() || value.environment.browser.length > 120
    || !['sample_browser_local', 'private_client_browser_local'].includes(value.environment.workspaceKind)
    || !Array.isArray(value.products) || value.products.length !== plan.products.length
    || !hasExactKeys(value.controls, [
      'browserInteractionPerformed', 'productRecordsChanged', 'resetPerformed', 'restorePerformed',
      'containsClientValues', 'safeToShareExternally', 'hostedWritesPerformed', 'externalWritesPerformed',
      'connectorCallsPerformed', 'modelCallsPerformed',
    ])) fail('client_demo_rehearsal_observations_invalid')
  if (Object.values(value.controls).some((item) => typeof item !== 'boolean')
    || value.controls.browserInteractionPerformed !== true
    || value.controls.containsClientValues !== false || value.controls.safeToShareExternally !== false
    || value.controls.hostedWritesPerformed !== false || value.controls.externalWritesPerformed !== false
    || value.controls.connectorCallsPerformed !== false || value.controls.modelCallsPerformed !== false) {
    fail('client_demo_rehearsal_observation_authority_invalid')
  }
  const products = value.products.map((observation, index) => {
    const planned = plan.products[index]
    if (!hasExactKeys(observation, ['product', 'acceptance', 'scenario']) || observation.product !== planned.product
      || !hasExactKeys(observation.acceptance, REHEARSAL_ACCEPTANCE)
      || !hasExactKeys(observation.scenario, ['id', 'status', 'evidence'])
      || observation.scenario.id !== REHEARSAL_SCENARIO[planned.product]
      || !REHEARSAL_OBSERVATION_STATUS.includes(observation.scenario.status)
      || typeof observation.scenario.evidence !== 'string' || !observation.scenario.evidence.trim()
      || observation.scenario.evidence.length > 500
      || Object.values(observation.acceptance).some((status) => !REHEARSAL_OBSERVATION_STATUS.includes(status))) {
      fail('client_demo_rehearsal_product_observation_invalid')
    }
    return {
      product: observation.product,
      acceptance: Object.fromEntries(REHEARSAL_ACCEPTANCE.map((check) => [check, observation.acceptance[check]])),
      scenario: { ...observation.scenario, evidence: observation.scenario.evidence.trim() },
    }
  })
  const acceptance = products.flatMap((product) => Object.entries(product.acceptance))
  if (acceptance.some(([check, status]) => check === 'local_apply_confirmed' && status === 'passed') !== value.controls.productRecordsChanged
    || acceptance.some(([check, status]) => check === 'reset_verified' && status === 'passed') !== value.controls.resetPerformed
    || acceptance.some(([check, status]) => check === 'baseline_restored' && status === 'passed') !== value.controls.restorePerformed) {
    fail('client_demo_rehearsal_observation_control_drift')
  }
  return {
    contract: value.contract,
    observedAt: value.observedAt,
    operator: { kind: value.operator.kind, label: value.operator.label.trim() },
    environment: { ...value.environment, browser: value.environment.browser.trim() },
    products,
    controls: { ...value.controls },
  }
}

function rehearsalStatus(statuses) {
  if (statuses.includes('failed')) return 'failed'
  if (statuses.every((status) => status === 'passed')) return 'passed'
  return 'partial'
}

export function buildClientDemoRehearsalResult(planValue, preparationValue, observationsValue) {
  verifyClientDemoPreparation(preparationValue)
  verifyClientDemoRehearsalPlan(planValue, preparationValue)
  const observations = normalizedRehearsalObservations(observationsValue, planValue)
  const products = planValue.products.map((planned, index) => {
    const observed = observations.products[index]
    const statuses = [...Object.values(observed.acceptance), observed.scenario.status]
    return {
      id: planned.id,
      product: planned.product,
      label: planned.label,
      demoPath: planned.demoPath,
      packageDigest: planned.packageDigest,
      acceptance: observed.acceptance,
      scenario: observed.scenario,
      status: rehearsalStatus(statuses),
    }
  })
  const acceptanceStatuses = products.flatMap((product) => Object.values(product.acceptance))
  const scenarioStatuses = products.map((product) => product.scenario.status)
  const payload = {
    contract: CLIENT_DEMO_REHEARSAL_RESULT_CONTRACT,
    observedAt: observations.observedAt,
    plan: {
      contract: planValue.contract,
      digest: planValue.digest,
      preparationDigest: planValue.preparation.bundleDigest,
      authorityDigest: planValue.authorityDigest,
    },
    operator: observations.operator,
    environment: observations.environment,
    products,
    run: {
      status: rehearsalStatus([...acceptanceStatuses, ...scenarioStatuses]),
      passedChecks: acceptanceStatuses.filter((status) => status === 'passed').length,
      failedChecks: acceptanceStatuses.filter((status) => status === 'failed').length,
      notRunChecks: acceptanceStatuses.filter((status) => status === 'not_run').length,
      totalChecks: acceptanceStatuses.length,
      passedScenarios: scenarioStatuses.filter((status) => status === 'passed').length,
      failedScenarios: scenarioStatuses.filter((status) => status === 'failed').length,
    },
    controls: {
      ...observations.controls,
      evidenceOnly: true,
      selfCertificationAllowed: false,
      activationStatus: 'not_applied',
    },
  }
  const result = { ...payload, digest: sha256(JSON.stringify(payload)) }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > CLIENT_DEMO_REHEARSAL_RESULT_MAX_BYTES) fail('client_demo_rehearsal_result_too_large')
  return result
}

export function verifyClientDemoRehearsalResult(value, planValue, preparationValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.contract !== CLIENT_DEMO_REHEARSAL_RESULT_CONTRACT
    || !canonicalTimestamp(value.observedAt) || typeof value.digest !== 'string') fail('client_demo_rehearsal_result_contract_invalid')
  const observations = {
    contract: CLIENT_DEMO_REHEARSAL_OBSERVATIONS_CONTRACT,
    observedAt: value.observedAt,
    operator: value.operator,
    environment: value.environment,
    products: value.products.map(({ product, acceptance, scenario }) => ({ product, acceptance, scenario })),
    controls: Object.fromEntries([
      'browserInteractionPerformed', 'productRecordsChanged', 'resetPerformed', 'restorePerformed',
      'containsClientValues', 'safeToShareExternally', 'hostedWritesPerformed', 'externalWritesPerformed',
      'connectorCallsPerformed', 'modelCallsPerformed',
    ].map((key) => [key, value.controls?.[key]])),
  }
  const expected = buildClientDemoRehearsalResult(planValue, preparationValue, observations)
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail('client_demo_rehearsal_result_drift')
  return {
    ok: true,
    contract: CLIENT_DEMO_REHEARSAL_RESULT_CONTRACT,
    preparationDigest: value.plan.preparationDigest,
    planDigest: value.plan.digest,
    status: value.run.status,
    passedChecks: value.run.passedChecks,
    failedChecks: value.run.failedChecks,
    notRunChecks: value.run.notRunChecks,
    externalWritesPerformed: false,
  }
}

async function writeClientDemoArtifact(artifact, outputPath, contract, maximum) {
  if (!artifact || artifact.contract !== contract || typeof outputPath !== 'string' || !outputPath.trim()) {
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
  if (Buffer.byteLength(serialized, 'utf8') > maximum) fail('client_demo_artifact_too_large')
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

export async function writeClientDemoPreparation(artifact, outputPath) {
  return writeClientDemoArtifact(artifact, outputPath, CLIENT_DEMO_PREPARATION_CONTRACT, CLIENT_DEMO_PREPARATION_MAX_BYTES)
}

export async function writeClientDemoRehearsalPlan(artifact, outputPath) {
  return writeClientDemoArtifact(artifact, outputPath, CLIENT_DEMO_REHEARSAL_PLAN_CONTRACT, CLIENT_DEMO_REHEARSAL_PLAN_MAX_BYTES)
}

export async function writeClientDemoRehearsalResult(artifact, outputPath) {
  return writeClientDemoArtifact(artifact, outputPath, CLIENT_DEMO_REHEARSAL_RESULT_CONTRACT, CLIENT_DEMO_REHEARSAL_RESULT_MAX_BYTES)
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

export function clientDemoRehearsalPlanSummary(plan, outputPath) {
  return {
    ok: true,
    contract: CLIENT_DEMO_REHEARSAL_PLAN_CONTRACT,
    output: resolve(outputPath),
    preparationDigest: plan.preparation.bundleDigest,
    productCount: plan.products.length,
    status: plan.run.status,
    completedChecks: plan.run.completedChecks,
    totalChecks: plan.run.totalChecks,
    browserWritesPerformed: plan.controls.browserWritesPerformed,
    externalWritesPerformed: plan.controls.externalWritesPerformed,
  }
}

export function clientDemoRehearsalResultSummary(result, outputPath) {
  return {
    ok: true,
    contract: CLIENT_DEMO_REHEARSAL_RESULT_CONTRACT,
    output: resolve(outputPath),
    preparationDigest: result.plan.preparationDigest,
    planDigest: result.plan.digest,
    status: result.run.status,
    passedChecks: result.run.passedChecks,
    failedChecks: result.run.failedChecks,
    notRunChecks: result.run.notRunChecks,
    externalWritesPerformed: result.controls.externalWritesPerformed,
  }
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { mode: 'help' }
  if (argv.length === 4 && argv[0] === '--contact-review-template' && argv[1] && argv[2] === '--out' && argv[3]) {
    return { mode: 'contact-review-template', contactEventPath: argv[1], outputPath: argv[3] }
  }
  if (argv.length === 6 && argv[0] === '--init-from-contact' && argv[1]
    && argv[2] === '--contact-event' && argv[3] && argv[4] === '--owner-review' && argv[5]) {
    return { mode: 'init-from-contact', directory: argv[1], contactEventPath: argv[3], ownerReviewPath: argv[5] }
  }
  if (argv.length === 2 && argv[0] === '--verify-contact-workspace' && argv[1]) return { mode: 'verify-contact-workspace', directory: argv[1] }
  if (argv.length === 2 && argv[0] === '--verify' && argv[1]) return { mode: 'verify', artifactPath: argv[1] }
  if (argv.length === 4 && argv[0] === '--rehearse' && argv[1] && argv[2] === '--out' && argv[3]) return { mode: 'rehearse', preparationPath: argv[1], outputPath: argv[3] }
  if (argv.length === 4 && argv[0] === '--verify-rehearsal' && argv[1] && argv[2] === '--preparation' && argv[3]) return { mode: 'verify-rehearsal', artifactPath: argv[1], preparationPath: argv[3] }
  if (argv.length === 8 && argv[0] === '--record-rehearsal' && argv[1] && argv[2] === '--preparation' && argv[3]
    && argv[4] === '--observations' && argv[5] && argv[6] === '--out' && argv[7]) {
    return { mode: 'record-rehearsal', planPath: argv[1], preparationPath: argv[3], observationsPath: argv[5], outputPath: argv[7] }
  }
  if (argv.length === 6 && argv[0] === '--verify-rehearsal-result' && argv[1] && argv[2] === '--plan' && argv[3]
    && argv[4] === '--preparation' && argv[5]) {
    return { mode: 'verify-rehearsal-result', artifactPath: argv[1], planPath: argv[3], preparationPath: argv[5] }
  }
  if (argv.length >= 2 && argv[0] === '--init' && argv[1]) {
    const parsed = { mode: 'init', directory: argv[1], presetId: 'manufacturing', products: [...PRODUCT_ORDER] }
    for (let index = 2; index < argv.length; index += 2) {
      if (!argv[index + 1]) fail('client_workspace_init_arguments_invalid')
      if (argv[index] === '--preset') parsed.presetId = argv[index + 1]
      else if (argv[index] === '--products') {
        const aliases = { shop: 'commerce', plant: 'production', website: 'website', ecommerce: 'ecommerce' }
        const requested = argv[index + 1].split(',').map((value) => aliases[value.trim().toLowerCase()]).filter(Boolean)
        if (!requested.length || requested.length !== argv[index + 1].split(',').length || new Set(requested).size !== requested.length) fail('client_workspace_init_arguments_invalid')
        parsed.products = PRODUCT_ORDER.filter((product) => requested.includes(product))
      } else fail('client_workspace_init_arguments_invalid')
    }
    return parsed
  }
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
  if ((!parsed.kitPath && !parsed.dataDirectory) || !parsed.outputPath) fail('client_demo_arguments_invalid')
  return parsed
}

async function main() {
  let outputContract = CLIENT_DEMO_PREPARATION_CONTRACT
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.mode === 'contact-review-template') outputContract = CLIENT_CONTACT_INTAKE_REVIEW_CONTRACT
    if (options.mode === 'init-from-contact' || options.mode === 'verify-contact-workspace') outputContract = CLIENT_CONTACT_INTAKE_WORKSPACE_CONTRACT
    if (options.mode === 'rehearse' || options.mode === 'verify-rehearsal') outputContract = CLIENT_DEMO_REHEARSAL_PLAN_CONTRACT
    if (options.mode === 'record-rehearsal' || options.mode === 'verify-rehearsal-result') outputContract = CLIENT_DEMO_REHEARSAL_RESULT_CONTRACT
    if (options.mode === 'help') {
      console.log('Create private intake: npm run client:workspace:init -- <new-private-directory> [--preset manufacturing] [--products shop,plant,website,ecommerce]\nCreate owner review template: npm run client:workspace:contact:review-template -- <private-event.json> --out <private-owner-review.json>\nCreate owner-reviewed contact intake: npm run client:workspace:from-contact -- <new-private-directory> --contact-event <private-event.json> --owner-review <private-review.json>\nVerify contact intake: npm run client:workspace:contact:verify -- <private-client-directory>\nOne-folder prepare: put client.json and selected product CSVs in a private directory, then run npm run client:prepare -- --data-dir <private-client-directory> --out <private-review.json>\nExisting-kit prepare: npm run client:prepare -- --kit <setup-kit.json> [--data-dir <private-csv-directory>] --out <private-review.json>\nVerify preparation: npm run client:prepare:verify -- <private-review.json>\nPlan rehearsal: npm run client:rehearse:plan -- <private-review.json> --out <rehearsal-plan.json>\nVerify rehearsal plan: npm run client:rehearse:verify -- <rehearsal-plan.json> --preparation <private-review.json>\nRecord explicit browser observations: npm run client:rehearse:record -- <rehearsal-plan.json> --preparation <private-review.json> --observations <observations.json> --out <result.json>\nVerify result: npm run client:rehearse:result:verify -- <result.json> --plan <rehearsal-plan.json> --preparation <private-review.json>')
      return
    }
    if (options.mode === 'contact-review-template') {
      const eventText = await readableFile(resolve(options.contactEventPath), CLIENT_CONTACT_EVENT_MAX_BYTES, 'client_contact_event')
      let event
      try { event = JSON.parse(eventText) } catch { fail('client_contact_event_json_invalid') }
      console.log(JSON.stringify(await writeClientContactReviewTemplate(event, options.outputPath)))
      return
    }
    if (options.mode === 'init-from-contact') {
      const eventText = await readableFile(resolve(options.contactEventPath), CLIENT_CONTACT_EVENT_MAX_BYTES, 'client_contact_event')
      const reviewText = await readableFile(resolve(options.ownerReviewPath), CLIENT_CONTACT_REVIEW_MAX_BYTES, 'client_contact_review')
      let event
      let review
      try { event = JSON.parse(eventText) } catch { fail('client_contact_event_json_invalid') }
      try { review = JSON.parse(reviewText) } catch { fail('client_contact_review_json_invalid') }
      console.log(JSON.stringify(await initializeClientWorkspaceFromContact({ directory: options.directory, event, review })))
      return
    }
    if (options.mode === 'verify-contact-workspace') {
      console.log(JSON.stringify(await verifyContactClientWorkspace(options.directory)))
      return
    }
    if (options.mode === 'init') {
      console.log(JSON.stringify(await initializeClientWorkspace(options)))
      return
    }
    if (options.mode === 'verify') {
      const text = await readableFile(resolve(options.artifactPath), CLIENT_DEMO_PREPARATION_MAX_BYTES, 'client_demo_preparation')
      let value
      try { value = JSON.parse(text) } catch { fail('client_demo_preparation_json_invalid') }
      console.log(JSON.stringify(verifyClientDemoPreparation(value)))
      return
    }
    if (options.mode === 'rehearse' || options.mode === 'verify-rehearsal') {
      const preparationText = await readableFile(resolve(options.preparationPath), CLIENT_DEMO_PREPARATION_MAX_BYTES, 'client_demo_preparation')
      let preparation
      try { preparation = JSON.parse(preparationText) } catch { fail('client_demo_preparation_json_invalid') }
      if (options.mode === 'rehearse') {
        const plan = buildClientDemoRehearsalPlan(preparation)
        const output = await writeClientDemoRehearsalPlan(plan, options.outputPath)
        console.log(JSON.stringify(clientDemoRehearsalPlanSummary(plan, output)))
      } else {
        const planText = await readableFile(resolve(options.artifactPath), CLIENT_DEMO_REHEARSAL_PLAN_MAX_BYTES, 'client_demo_rehearsal')
        let plan
        try { plan = JSON.parse(planText) } catch { fail('client_demo_rehearsal_json_invalid') }
        console.log(JSON.stringify(verifyClientDemoRehearsalPlan(plan, preparation)))
      }
      return
    }
    if (options.mode === 'record-rehearsal' || options.mode === 'verify-rehearsal-result') {
      const preparationText = await readableFile(resolve(options.preparationPath), CLIENT_DEMO_PREPARATION_MAX_BYTES, 'client_demo_preparation')
      const planText = await readableFile(resolve(options.planPath), CLIENT_DEMO_REHEARSAL_PLAN_MAX_BYTES, 'client_demo_rehearsal')
      let preparation
      let plan
      try { preparation = JSON.parse(preparationText) } catch { fail('client_demo_preparation_json_invalid') }
      try { plan = JSON.parse(planText) } catch { fail('client_demo_rehearsal_json_invalid') }
      if (options.mode === 'record-rehearsal') {
        const observationsText = await readableFile(resolve(options.observationsPath), CLIENT_DEMO_REHEARSAL_OBSERVATIONS_MAX_BYTES, 'client_demo_rehearsal_observations')
        let observations
        try { observations = JSON.parse(observationsText) } catch { fail('client_demo_rehearsal_observations_json_invalid') }
        const result = buildClientDemoRehearsalResult(plan, preparation, observations)
        const output = await writeClientDemoRehearsalResult(result, options.outputPath)
        console.log(JSON.stringify(clientDemoRehearsalResultSummary(result, output)))
      } else {
        const resultText = await readableFile(resolve(options.artifactPath), CLIENT_DEMO_REHEARSAL_RESULT_MAX_BYTES, 'client_demo_rehearsal_result')
        let result
        try { result = JSON.parse(resultText) } catch { fail('client_demo_rehearsal_result_json_invalid') }
        console.log(JSON.stringify(verifyClientDemoRehearsalResult(result, plan, preparation)))
      }
      return
    }
    const artifact = await prepareClientDemo(options)
    const output = await writeClientDemoPreparation(artifact, options.outputPath)
    console.log(JSON.stringify(clientDemoPreparationSummary(artifact, output)))
  } catch (error) {
    const code = error instanceof PreparationError ? error.code : 'client_demo_preparation_failed'
    console.error(JSON.stringify({ ok: false, contract: outputContract, error: code }))
    process.exitCode = 1
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
