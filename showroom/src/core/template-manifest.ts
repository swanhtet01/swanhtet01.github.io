export const TEMPLATE_MANIFEST_SCHEMA = 'supermega.template-manifest.v1' as const

export const templateCapabilities = [
  'shop.counter',
  'shop.inventory',
  'website.presence',
  'website.inquiries',
  'commerce.storefront',
  'commerce.fulfilment',
  'plant.production',
] as const

export type TemplateCapability = (typeof templateCapabilities)[number]
export type TemplateSlot = 'identity' | 'catalog' | 'services' | 'content' | 'fulfilment' | 'operations'

export type TemplateManifest = Readonly<{
  schema: typeof TEMPLATE_MANIFEST_SCHEMA
  id: string
  version: string
  capabilities: readonly TemplateCapability[]
  slots: Readonly<Partial<Record<TemplateSlot, true>>>
}>

const capabilitySet = new Set<string>(templateCapabilities)
const slotSet = new Set<TemplateSlot>(['identity', 'catalog', 'services', 'content', 'fulfilment', 'operations'])
const plainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

function fail(reason: string): never {
  throw new Error(`Invalid template manifest: ${reason}`)
}

/**
 * Validates portable template configuration at the trust boundary. A manifest describes only
 * supported capability and content slots; executable code, arbitrary options and tenant data
 * are intentionally absent. Consumers may safely use a missing optional slot as a generic
 * product fallback rather than silently guessing a business workflow.
 */
export function validateTemplateManifest(input: unknown): TemplateManifest {
  if (!plainObject(input)) fail('manifest must be a plain object')
  const keys = Object.keys(input).sort()
  const allowed = ['capabilities', 'id', 'schema', 'slots', 'version']
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) fail('manifest contains unsupported fields')
  if (input.schema !== TEMPLATE_MANIFEST_SCHEMA) fail('unsupported schema')
  if (typeof input.id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(input.id)) fail('id must be a canonical slug')
  if (typeof input.version !== 'string' || !/^v[1-9][0-9]*$/.test(input.version)) fail('version must be a positive vN revision')
  if (!Array.isArray(input.capabilities) || input.capabilities.length === 0) fail('at least one capability is required')
  const capabilities = input.capabilities.map((capability) => {
    if (typeof capability !== 'string' || !capabilitySet.has(capability)) fail(`unsupported capability ${String(capability)}`)
    return capability as TemplateCapability
  })
  if (new Set(capabilities).size !== capabilities.length) fail('capabilities must be unique')
  if (!plainObject(input.slots)) fail('slots must be a plain object')
  const slots: Partial<Record<TemplateSlot, true>> = {}
  for (const [slot, enabled] of Object.entries(input.slots)) {
    if (!slotSet.has(slot as TemplateSlot) || enabled !== true) fail(`unsupported slot ${slot}`)
    slots[slot as TemplateSlot] = true
  }
  if (capabilities.some((capability) => capability === 'commerce.fulfilment') && !slots.fulfilment) fail('commerce fulfilment requires the fulfilment slot')
  if (capabilities.some((capability) => capability === 'plant.production') && !slots.operations) fail('plant production requires the operations slot')
  return Object.freeze({ schema: TEMPLATE_MANIFEST_SCHEMA, id: input.id, version: input.version, capabilities: Object.freeze([...capabilities]), slots: Object.freeze({ ...slots }) })
}

export function templateManifestKey(manifest: TemplateManifest): string {
  return `${manifest.id}@${manifest.version}`
}

export function templateManifestSupports(manifest: TemplateManifest, capability: TemplateCapability): boolean {
  return manifest.capabilities.includes(capability)
}