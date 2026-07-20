import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const machine = await readFile(resolve(root, 'showroom/src/pages/CommerceMachinePage.tsx'), 'utf8')
const analytics = await readFile(resolve(root, 'showroom/src/lib/analytics.ts'), 'utf8')
const adapter = await readFile(resolve(root, 'showroom/src/lib/commerceMachineAdapter.ts'), 'utf8')
const template = JSON.parse(await readFile(resolve(root, 'templates/commerce-machine.blueprint.example.json'), 'utf8'))

const requirements = [
  ['safe storage fallback', /function readStoredProducts\(\)[\s\S]*return DEFAULT_PRODUCTS/],
  ['catalog source contract', /loadShopCatalog\(/],
  ['handoff telemetry', /commerce_handoff_exported/],
  ['reusable blueprint export', /commerce_blueprint_exported/],
  ['blueprint packet type', /supermega-commerce-machine/],
  ['blueprint import validation', /normalizeCommerceMachineBlueprint\(/],
  ['demo blueprint provenance preserved', /catalogSource === 'shop-api' \|\| value\.catalogSource === 'client-import' \|\| value\.catalogSource === 'demo'/],
  ['repository blueprint template', /supermega-commerce-machine[\s\S]*catalog/],
  ['metadata-only autocapture', /autocapture:\s*false/],
  ['session recording disabled', /disable_session_recording:\s*true/],
  ['analytics payload sanitizer', /sanitizeEventPayload[\s\S]*BLOCKED_PROPERTY/],
  ['setup learning events mapped', /commerce_template_edited:[\s\S]*commerce_channel_selected:[\s\S]*commerce_worker_toggled:[\s\S]*commerce_catalog_template_downloaded/],
  ['conversation parser matches catalog', /function parseConversation\(\)[\s\S]*matchedProduct/],
  ['conversation parser extracts quantity', /function parseRequestedQuantity\(message: string\)/],
  ['conversation parser has no fixed confidence claim', [machine, analytics].join('\\n').indexOf('94%') === -1 ? /.*/ : /$a/],
]

const failures = requirements.filter(([, pattern]) => !pattern.test(`${machine}\n${analytics}\n${adapter}\n${JSON.stringify(template)}`)).map(([name]) => name)
if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ status: 'ready', contract: 'commerce_machine_privacy_and_reliability', checks: requirements.length }, null, 2))
