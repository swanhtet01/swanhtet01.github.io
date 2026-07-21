import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const machine = await readFile(resolve(root, 'showroom/src/pages/CommerceMachinePage.tsx'), 'utf8')
const analytics = await readFile(resolve(root, 'showroom/src/lib/analytics.ts'), 'utf8')
const adapter = await readFile(resolve(root, 'showroom/src/lib/commerceMachineAdapter.ts'), 'utf8')
const appRoutes = await readFile(resolve(root, 'showroom/src/App.tsx'), 'utf8')
const agentsPage = await readFile(resolve(root, 'showroom/src/pages/AgentsPage.tsx'), 'utf8')
const workspaceApi = await readFile(resolve(root, 'showroom/src/lib/workspaceApi.ts'), 'utf8')
const template = JSON.parse(await readFile(resolve(root, 'templates/commerce-machine.blueprint.example.json'), 'utf8'))

const requirements = [
  ['safe storage fallback', /function readStoredProducts\(\)[\s\S]*return DEFAULT_PRODUCTS/],
  ['catalog source contract', /loadShopCatalog\(/],
  ['csv catalog import', /normalizeCommerceCatalogText[\s\S]*client_csv/],
  ['handoff telemetry', /commerce_handoff_exported/],
  ['reusable blueprint export', /commerce_blueprint_exported/],
  ['blueprint packet type', /supermega-commerce-machine/],
  ['blueprint import validation', /normalizeCommerceMachineBlueprint\(/],
  ['demo blueprint provenance preserved', /catalogSource === 'shop-api' \|\| value\.catalogSource === 'client-import' \|\| value\.catalogSource === 'demo'/],
  ['repository blueprint template', /supermega-commerce-machine[\s\S]*catalog/],
  ['metadata-only autocapture', /autocapture:\s*false/],
  ['route page views are first-party events', /page_viewed: 'page_viewed'/],
  ['frontend accepts ready free mode separately', /const enterpriseReady = [\s\S]*const freeModeReady = [\s\S]*ready: payload\.status === 'ready' \|\| freeModeReady/],
  ['session recording disabled', /disable_session_recording:\s*true/],
  ['analytics payload sanitizer', /sanitizeEventPayload[\s\S]*BLOCKED_PROPERTY/],
  ['free handoff attribution is allowlisted', /allowedEntrySource[\s\S]*agent-product[\s\S]*utm_source/],
  ['identity payload sanitizer', /const safeProperties = sanitizeEventPayload\(properties\)[\s\S]*identify\(userId, safeProperties\)[\s\S]*queuedIdentities\.push\(\{ userId, properties: safeProperties \}\)/],
  ['setup learning events mapped', /commerce_template_edited:[\s\S]*commerce_channel_selected:[\s\S]*commerce_worker_toggled:[\s\S]*commerce_catalog_template_downloaded/],
  ['starter demo reset', /function resetDemo\(\)[\s\S]*setCatalogSource\('demo'\)[\s\S]*commerce_demo_reset/],
  ['conversation parser matches catalog', /function parseConversation\(\)[\s\S]*matchedProduct/],
  ['conversation parser extracts quantity', /function parseRequestedQuantity\(message: string\)/],
  ['public agents route reaches canonical products', /Navigate replace to="\/products"[^\n]*path="agents"/],
  ['agents page offers attributed free machine', /to="\/commerce-machine\?source=agent-product"[\s\S]*Try free machine/],
  ['runnable commerce machine route exists', /path="commerce-machine"/],
  ['product detail route exists for plant and other products', /path="products\/\:productId"/],
  ['conversation parser has no fixed confidence claim', [machine, analytics].join('\\n').indexOf('94%') === -1 ? /.*/ : /$a/],
]

const source = `${machine}\n${analytics}\n${adapter}\n${appRoutes}\n${agentsPage}\n${workspaceApi}\n${JSON.stringify(template)}`
const failures = requirements.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name)
if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ status: 'ready', contract: 'commerce_machine_privacy_and_reliability', checks: requirements.length }, null, 2))
