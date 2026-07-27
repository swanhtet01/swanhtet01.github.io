export const SHOP_INVENTORY_STATE_SCHEMA = 'supermega.shop.inventory_foundation.v1' as const
export const SHOP_INVENTORY_IMPORT_CONTRACT = 'supermega.shop.inventory_import.v1' as const
export const SHOP_INVENTORY_PROJECTION_CONTRACT = 'supermega.shop.inventory_projection.v1' as const
export const EMPTY_SHOP_INVENTORY_DIGEST = `sha256:${'0'.repeat(64)}`

export type ShopInventoryProof = {
  actionId: string
  capturedAt: string
  actor: string
  reason: string
  evidenceReference: string
}

export type ShopInventoryMaster = { id: string; name: string }
export type ShopInventoryStockUnit = {
  id: string
  sku: string
  tracking: 'lot' | 'serial'
  trackingCode: string
}
export type ShopInventoryOpening = {
  stockUnitId: string
  locationId: string
  vendorId: string
  quantity: number
}
export type ShopInventoryOrderLine = { sku: string; quantity: number }
export type ShopInventoryOrderAllocation = {
  reservationId: string
  sku: string
  stockUnitId: string
  locationId: string
  quantity: number
}
export type ShopInventoryImportPackage = {
  contract: typeof SHOP_INVENTORY_IMPORT_CONTRACT
  importId: string
  sourceDigest: string
  catalogSkuDigest: string
  clients: ShopInventoryMaster[]
  vendors: ShopInventoryMaster[]
  locations: ShopInventoryMaster[]
  stockUnits: ShopInventoryStockUnit[]
  openings: ShopInventoryOpening[]
  packageDigest: string
}

export type ShopInventoryCommandPayload =
  | { kind: 'import'; id: string; package: ShopInventoryImportPackage; proof: ShopInventoryProof }
  | { kind: 'transfer'; id: string; stockUnitId: string; fromLocationId: string; toLocationId: string; quantity: number; proof: ShopInventoryProof }
  | { kind: 'receipt'; id: string; purchaseOrderId: string; stockUnitId: string; sku: string; trackingCode: string; locationId: string; quantity: number; proof: ShopInventoryProof }
  | { kind: 'reserve'; id: string; clientId: string; stockUnitId: string; locationId: string; quantity: number; proof: ShopInventoryProof }
  | { kind: 'release' | 'fulfil'; id: string; reservationId: string; proof: ShopInventoryProof }
  | { kind: 'order_reserve'; id: string; orderId: string; customerReference: string; allocations: ShopInventoryOrderAllocation[]; proof: ShopInventoryProof }
  | { kind: 'order_release' | 'order_fulfil'; id: string; orderId: string; reservationIds: string[]; proof: ShopInventoryProof }

export type ShopInventoryCommand = {
  sequence: number
  previousDigest: string
  payload: ShopInventoryCommandPayload
  digest: string
}

export type ShopInventoryState = {
  schema: typeof SHOP_INVENTORY_STATE_SCHEMA
  revision: number
  headDigest: string
  commands: ShopInventoryCommand[]
}

export type ShopInventoryBalance = {
  stockUnitId: string
  sku: string
  tracking: 'lot' | 'serial'
  trackingCode: string
  locationId: string
  onHand: number
  reserved: number
  availableToPromise: number
}

export type ShopInventoryProjection = {
  contract: typeof SHOP_INVENTORY_PROJECTION_CONTRACT
  revision: number
  headDigest: string
  clients: ShopInventoryMaster[]
  vendors: ShopInventoryMaster[]
  locations: ShopInventoryMaster[]
  stockUnits: ShopInventoryStockUnit[]
  balances: ShopInventoryBalance[]
  reservations: Array<{
    id: string
    clientId?: string
    orderId?: string
    customerReference?: string
    stockUnitId: string
    locationId: string
    quantity: number
    status: 'active' | 'released' | 'fulfilled'
    reserveProof: ShopInventoryProof
    closureCommandId: string | null
    closureProof: ShopInventoryProof | null
  }>
  ledger: Array<Record<string, unknown>>
  metrics: { totalOnHand: number; totalReserved: number; totalAvailableToPromise: number }
}

const digestPattern = /^sha256:[0-9a-f]{64}$/
const businessIdPattern = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/
const commandKinds = new Set(['import', 'transfer', 'receipt', 'reserve', 'release', 'fulfil', 'order_reserve', 'order_release', 'order_fulfil'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exact(value: unknown, field: string, fields: string[]) {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`)
  const keys = Object.keys(value)
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new Error(`${field} fields do not match the contract.`)
  }
  return value
}

function array(value: unknown, field: string, minimum: number, maximum: number) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${field} must contain between ${minimum} and ${maximum} items.`)
  }
  return value
}

function text(value: unknown, field: string, maximum = 180) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.normalize('NFC') !== value) {
    throw new Error(`${field} must be normalized nonblank trimmed text.`)
  }
  if (Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || code === 127
  }) || value.length > maximum) throw new Error(`${field} is not canonical text.`)
  return value
}

function identifier(value: unknown, field: string, prefix: string) {
  const candidate = text(value, field, 80)
  if (!candidate.startsWith(`${prefix}-`) || !businessIdPattern.test(candidate)) {
    throw new Error(`${field} must be a canonical ${prefix} identifier.`)
  }
  return candidate
}

function quantity(value: unknown, field: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${field} must be a supported integer quantity.`)
  return Number(value)
}

function digest(value: unknown, field: string) {
  const candidate = text(value, field, 71)
  if (!digestPattern.test(candidate)) throw new Error(`${field} must be a SHA-256 digest.`)
  return candidate
}

function timestampMicros(value: unknown, field: string) {
  const candidate = text(value, field, 40)
  const match = timestampPattern.exec(candidate)
  if (!match) throw new Error(`${field} must be an ISO timestamp with an explicit offset.`)
  const parsed = Date.parse(candidate)
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a real calendar timestamp.`)
  const fraction = /\.(\d{1,6})/.exec(candidate)?.[1] ?? ''
  return { value: candidate, micros: BigInt(parsed) * 1_000n + BigInt(fraction.padEnd(6, '0').slice(3) || '0') }
}

function unique(values: string[], field: string) {
  if (new Set(values).size !== values.length) throw new Error(`${field} contains duplicates.`)
}

function compareCanonicalText(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0)
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index]
  }
  return leftPoints.length - rightPoints.length
}

function sorted(values: string[], field: string) {
  const ordered = [...values].sort(compareCanonicalText)
  if (values.some((value, index) => value !== ordered[index])) throw new Error(`${field} must use canonical identifier order.`)
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
  return value
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}

function canonicalCopy<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T
}

const sha256RoundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits))
}

function sha256Hex(source: string) {
  const input = new TextEncoder().encode(source)
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLength = BigInt(input.length) * 8n
  view.setUint32(paddedLength - 8, Number(bitLength >> 32n), false)
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false)
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const before15 = words[index - 15]
      const before2 = words[index - 2]
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3)
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choice + sha256RoundConstants[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g; g = f; f = e; e = (d + temporary1) >>> 0; d = c; c = b; b = a; a = (temporary1 + temporary2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('')
}

function canonicalDigest(value: unknown) {
  return `sha256:${sha256Hex(canonicalJson(value))}`
}

function proof(value: unknown, field: string): ShopInventoryProof {
  const source = exact(value, field, ['actionId', 'capturedAt', 'actor', 'reason', 'evidenceReference'])
  return {
    actionId: identifier(source.actionId, `${field}.actionId`, 'ACT'),
    capturedAt: timestampMicros(source.capturedAt, `${field}.capturedAt`).value,
    actor: text(source.actor, `${field}.actor`, 120),
    reason: text(source.reason, `${field}.reason`, 300),
    evidenceReference: text(source.evidenceReference, `${field}.evidenceReference`, 180),
  }
}

function masterRows(value: unknown, field: string, prefix: string, maximum: number): ShopInventoryMaster[] {
  const rows = array(value, field, 1, maximum).map((candidate, index) => {
    const row = exact(candidate, `${field}[${index}]`, ['id', 'name'])
    return { id: identifier(row.id, `${field}[${index}].id`, prefix), name: text(row.name, `${field}[${index}].name`, 120) }
  })
  unique(rows.map((row) => row.id), field)
  sorted(rows.map((row) => row.id), field)
  return rows
}

function catalogSkus(value: unknown) {
  const rows = array(value, 'catalog_skus', 1, 1_000).map((item, index) => text(item, `catalog_skus[${index}]`, 80))
  unique(rows, 'catalog_skus')
  sorted(rows, 'catalog_skus')
  return rows
}

export function shopInventoryCatalogDigest(catalog: unknown) {
  return canonicalDigest({ catalogSkus: catalogSkus(catalog) })
}

function validateImportPackage(value: unknown, catalog: string[], requireCurrentDigest: boolean): ShopInventoryImportPackage {
  const source = exact(value, 'import package', ['contract', 'importId', 'sourceDigest', 'catalogSkuDigest', 'clients', 'vendors', 'locations', 'stockUnits', 'openings', 'packageDigest'])
  if (source.contract !== SHOP_INVENTORY_IMPORT_CONTRACT) throw new Error('import package.contract is unsupported.')
  const importId = identifier(source.importId, 'import package.importId', 'IMP')
  const sourceDigest = digest(source.sourceDigest, 'import package.sourceDigest')
  const catalogSkuDigest = digest(source.catalogSkuDigest, 'import package.catalogSkuDigest')
  if (requireCurrentDigest && catalogSkuDigest !== shopInventoryCatalogDigest(catalog)) throw new Error('The import package catalog identity is stale.')
  const clients = masterRows(source.clients, 'import package.clients', 'CLI', 200)
  const vendors = masterRows(source.vendors, 'import package.vendors', 'VEN', 200)
  const locations = masterRows(source.locations, 'import package.locations', 'LOC', 8)
  if (locations.length < 2) throw new Error('The v1 inventory foundation requires at least two locations.')
  const stockUnits = array(source.stockUnits, 'import package.stockUnits', 1, 1_000).map((candidate, index): ShopInventoryStockUnit => {
    const field = `import package.stockUnits[${index}]`
    const row = exact(candidate, field, ['id', 'sku', 'tracking', 'trackingCode'])
    const tracking = text(row.tracking, `${field}.tracking`, 10)
    if (tracking !== 'lot' && tracking !== 'serial') throw new Error(`${field}.tracking is unsupported.`)
    const sku = text(row.sku, `${field}.sku`, 80)
    if (!catalog.includes(sku)) throw new Error(`${field}.sku is not present in the trusted Shop catalog.`)
    return { id: identifier(row.id, `${field}.id`, tracking === 'lot' ? 'LOT' : 'SER'), sku, tracking, trackingCode: text(row.trackingCode, `${field}.trackingCode`, 80) }
  })
  unique(stockUnits.map((row) => row.id), 'import package.stockUnits')
  sorted(stockUnits.map((row) => row.id), 'import package.stockUnits')
  unique(stockUnits.map((row) => `${row.sku}|${row.tracking}|${row.trackingCode}`), 'import package stock trace identities')
  const locationIds = new Set(locations.map((row) => row.id))
  const vendorIds = new Set(vendors.map((row) => row.id))
  const units = new Map(stockUnits.map((row) => [row.id, row]))
  const serialOpenings = new Set<string>()
  const openings = array(source.openings, 'import package.openings', 1, 2_000).map((candidate, index): ShopInventoryOpening => {
    const field = `import package.openings[${index}]`
    const row = exact(candidate, field, ['stockUnitId', 'locationId', 'vendorId', 'quantity'])
    const stockUnitId = text(row.stockUnitId, `${field}.stockUnitId`, 80)
    const locationId = text(row.locationId, `${field}.locationId`, 80)
    const vendorId = text(row.vendorId, `${field}.vendorId`, 80)
    const unit = units.get(stockUnitId)
    if (!unit || !locationIds.has(locationId) || !vendorIds.has(vendorId)) throw new Error(`${field} references an unknown master.`)
    const openingQuantity = quantity(row.quantity, `${field}.quantity`, 1)
    if (unit.tracking === 'serial' && (openingQuantity !== 1 || serialOpenings.has(stockUnitId))) throw new Error(`${field} serial stock must open exactly once with quantity one.`)
    if (unit.tracking === 'serial') serialOpenings.add(stockUnitId)
    return { stockUnitId, locationId, vendorId, quantity: openingQuantity }
  })
  const openingKeys = openings.map((row) => `${row.stockUnitId}|${row.locationId}`)
  unique(openingKeys, 'import package.openings')
  sorted(openingKeys, 'import package.openings')
  if (new Set(openings.map((row) => row.stockUnitId)).size !== stockUnits.length) throw new Error('Every stock unit must have opening evidence.')
  const canonical = { contract: SHOP_INVENTORY_IMPORT_CONTRACT, importId, sourceDigest, catalogSkuDigest, clients, vendors, locations, stockUnits, openings }
  const packageDigest = digest(source.packageDigest, 'import package.packageDigest')
  if (packageDigest !== canonicalDigest(canonical)) throw new Error('import package.packageDigest does not match its reviewed contents.')
  return { ...canonical, packageDigest }
}

export function buildShopInventoryImportPackage(input: Omit<ShopInventoryImportPackage, 'contract' | 'catalogSkuDigest' | 'packageDigest'> & { catalogSkus: string[] }): ShopInventoryImportPackage {
  const trustedCatalog = catalogSkus(input.catalogSkus)
  const candidate = {
    contract: SHOP_INVENTORY_IMPORT_CONTRACT,
    importId: input.importId,
    sourceDigest: input.sourceDigest,
    catalogSkuDigest: shopInventoryCatalogDigest(trustedCatalog),
    clients: input.clients,
    vendors: input.vendors,
    locations: input.locations,
    stockUnits: input.stockUnits,
    openings: input.openings,
  }
  return validateImportPackage({ ...candidate, packageDigest: canonicalDigest(candidate) }, trustedCatalog, true)
}

export function createEmptyShopInventoryState(): ShopInventoryState {
  return { schema: SHOP_INVENTORY_STATE_SCHEMA, revision: 0, headDigest: EMPTY_SHOP_INVENTORY_DIGEST, commands: [] }
}

function orderAllocations(value: unknown, field: string, catalog: string[]) {
  const rows = array(value, field, 1, 200).map((candidate, index): ShopInventoryOrderAllocation => {
    const rowField = `${field}[${index}]`
    const row = exact(candidate, rowField, ['reservationId', 'sku', 'stockUnitId', 'locationId', 'quantity'])
    const sku = text(row.sku, `${rowField}.sku`, 80)
    if (!catalog.includes(sku)) throw new Error(`${rowField}.sku is not present in the trusted Shop catalog.`)
    return {
      reservationId: identifier(row.reservationId, `${rowField}.reservationId`, 'RES'),
      sku,
      stockUnitId: text(row.stockUnitId, `${rowField}.stockUnitId`, 80),
      locationId: identifier(row.locationId, `${rowField}.locationId`, 'LOC'),
      quantity: quantity(row.quantity, `${rowField}.quantity`, 1),
    }
  })
  unique(rows.map((row) => row.reservationId), `${field} reservation IDs`)
  const keys = rows.map((row) => `${row.sku}|${row.locationId}|${row.stockUnitId}|${row.reservationId}`)
  unique(keys, field)
  sorted(keys, field)
  return rows
}

function commandPayload(value: unknown, field: string, catalog: string[]): ShopInventoryCommandPayload {
  if (!isRecord(value) || typeof value.kind !== 'string' || !commandKinds.has(value.kind)) throw new Error(`${field}.kind is unsupported.`)
  if (value.kind === 'import') {
    const source = exact(value, field, ['kind', 'id', 'package', 'proof'])
    const importPackage = validateImportPackage(source.package, catalog, false)
    const id = identifier(source.id, `${field}.id`, 'IMP')
    if (id !== importPackage.importId) throw new Error(`${field}.id must equal its import package identity.`)
    return { kind: 'import', id, package: importPackage, proof: proof(source.proof, `${field}.proof`) }
  }
  if (value.kind === 'transfer') {
    const source = exact(value, field, ['kind', 'id', 'stockUnitId', 'fromLocationId', 'toLocationId', 'quantity', 'proof'])
    const fromLocationId = identifier(source.fromLocationId, `${field}.fromLocationId`, 'LOC')
    const toLocationId = identifier(source.toLocationId, `${field}.toLocationId`, 'LOC')
    if (fromLocationId === toLocationId) throw new Error(`${field} must move stock between different locations.`)
    return {
      kind: 'transfer',
      id: identifier(source.id, `${field}.id`, 'TRF'),
      stockUnitId: text(source.stockUnitId, `${field}.stockUnitId`, 80),
      fromLocationId,
      toLocationId,
      quantity: quantity(source.quantity, `${field}.quantity`, 1),
      proof: proof(source.proof, `${field}.proof`),
    }
  }
  if (value.kind === 'receipt') {
    const source = exact(value, field, ['kind', 'id', 'purchaseOrderId', 'stockUnitId', 'sku', 'trackingCode', 'locationId', 'quantity', 'proof'])
    const sku = text(source.sku, `${field}.sku`, 80)
    if (!catalog.includes(sku)) throw new Error(`${field}.sku is not present in the trusted Shop catalog.`)
    return {
      kind: 'receipt',
      id: identifier(source.id, `${field}.id`, 'RCV'),
      purchaseOrderId: identifier(source.purchaseOrderId, `${field}.purchaseOrderId`, 'PO'),
      stockUnitId: identifier(source.stockUnitId, `${field}.stockUnitId`, 'LOT'),
      sku,
      trackingCode: text(source.trackingCode, `${field}.trackingCode`, 80),
      locationId: identifier(source.locationId, `${field}.locationId`, 'LOC'),
      quantity: quantity(source.quantity, `${field}.quantity`, 1),
      proof: proof(source.proof, `${field}.proof`),
    }
  }
  if (value.kind === 'reserve') {
    const source = exact(value, field, ['kind', 'id', 'clientId', 'stockUnitId', 'locationId', 'quantity', 'proof'])
    return {
      kind: 'reserve',
      id: identifier(source.id, `${field}.id`, 'RES'),
      clientId: identifier(source.clientId, `${field}.clientId`, 'CLI'),
      stockUnitId: text(source.stockUnitId, `${field}.stockUnitId`, 80),
      locationId: identifier(source.locationId, `${field}.locationId`, 'LOC'),
      quantity: quantity(source.quantity, `${field}.quantity`, 1),
      proof: proof(source.proof, `${field}.proof`),
    }
  }
  if (value.kind === 'order_reserve') {
    const source = exact(value, field, ['kind', 'id', 'orderId', 'customerReference', 'allocations', 'proof'])
    const orderId = text(source.orderId, `${field}.orderId`, 160)
    const id = identifier(source.id, `${field}.id`, 'ORS')
    if (id !== inventoryOrderCommandId('ORS', orderId)) throw new Error(`${field}.id is not deterministic for its order.`)
    const allocations = orderAllocations(source.allocations, `${field}.allocations`, catalog)
    allocations.forEach((allocation, index) => {
      if (allocation.reservationId !== inventoryOrderReservationId(orderId, allocation)) {
        throw new Error(`${field}.allocations[${index}].reservationId is not deterministic.`)
      }
    })
    return {
      kind: 'order_reserve',
      id,
      orderId,
      customerReference: text(source.customerReference, `${field}.customerReference`, 180),
      allocations,
      proof: proof(source.proof, `${field}.proof`),
    }
  }
  if (value.kind === 'order_release' || value.kind === 'order_fulfil') {
    const source = exact(value, field, ['kind', 'id', 'orderId', 'reservationIds', 'proof'])
    const orderId = text(source.orderId, `${field}.orderId`, 160)
    const prefix = value.kind === 'order_release' ? 'ORL' : 'ORF'
    const id = identifier(source.id, `${field}.id`, prefix)
    if (id !== inventoryOrderCommandId(prefix, orderId)) throw new Error(`${field}.id is not deterministic for its order.`)
    const reservationIds = array(source.reservationIds, `${field}.reservationIds`, 1, 200)
      .map((candidate, index) => identifier(candidate, `${field}.reservationIds[${index}]`, 'RES'))
    unique(reservationIds, `${field}.reservationIds`)
    sorted(reservationIds, `${field}.reservationIds`)
    return {
      kind: value.kind,
      id,
      orderId,
      reservationIds,
      proof: proof(source.proof, `${field}.proof`),
    }
  }
  const kind = value.kind as 'release' | 'fulfil'
  const source = exact(value, field, ['kind', 'id', 'reservationId', 'proof'])
  return {
    kind,
    id: identifier(source.id, `${field}.id`, kind === 'release' ? 'REL' : 'FUL'),
    reservationId: identifier(source.reservationId, `${field}.reservationId`, 'RES'),
    proof: proof(source.proof, `${field}.proof`),
  }
}

function ledgerEvent(input: {
  id: string
  kind: string
  command: ShopInventoryCommandPayload
  stockUnitId: string
  locationId: string
  onHandDelta: number
  reservedDelta: number
  referenceId: string
  counterpartyLocationId?: string
  vendorId?: string
  clientId?: string
  orderId?: string
  customerReference?: string
}) {
  const record: Record<string, unknown> = {
    id: input.id,
    kind: input.kind,
    commandId: input.command.id,
    actionId: input.command.proof.actionId,
    capturedAt: input.command.proof.capturedAt,
    actor: input.command.proof.actor,
    reason: input.command.proof.reason,
    evidenceReference: input.command.proof.evidenceReference,
    stockUnitId: input.stockUnitId,
    locationId: input.locationId,
    onHandDelta: input.onHandDelta,
    reservedDelta: input.reservedDelta,
    referenceId: input.referenceId,
  }
  if (input.counterpartyLocationId !== undefined) record.counterpartyLocationId = input.counterpartyLocationId
  if (input.vendorId !== undefined) record.vendorId = input.vendorId
  if (input.clientId !== undefined) record.clientId = input.clientId
  if (input.orderId !== undefined) record.orderId = input.orderId
  if (input.customerReference !== undefined) record.customerReference = input.customerReference
  return record
}

function replayCommands(commands: ShopInventoryCommandPayload[]) {
  const clients = new Map<string, ShopInventoryMaster>()
  const vendors = new Map<string, ShopInventoryMaster>()
  const locations = new Map<string, ShopInventoryMaster>()
  const stockUnits = new Map<string, ShopInventoryStockUnit>()
  const balances = new Map<string, { onHand: number; reserved: number }>()
  const reservations = new Map<string, ShopInventoryProjection['reservations'][number]>()
  const ledger: Array<Record<string, unknown>> = []
  let importCount = 0
  const balanceKey = (stockUnitId: string, locationId: string) => `${stockUnitId}\u0000${locationId}`
  const currentBalance = (stockUnitId: string, locationId: string) => {
    const key = balanceKey(stockUnitId, locationId)
    const retained = balances.get(key) ?? { onHand: 0, reserved: 0 }
    balances.set(key, retained)
    return retained
  }
  const applyDelta = (stockUnitId: string, locationId: string, onHandDelta: number, reservedDelta: number, field: string) => {
    const current = currentBalance(stockUnitId, locationId)
    const onHand = current.onHand + onHandDelta
    const reserved = current.reserved + reservedDelta
    if (!Number.isSafeInteger(onHand) || !Number.isSafeInteger(reserved) || onHand < 0 || reserved < 0 || reserved > onHand) {
      throw new Error(`${field} would make on-hand or reserved stock invalid.`)
    }
    if (stockUnits.get(stockUnitId)?.tracking === 'serial' && onHand > 1) throw new Error(`${field} would duplicate serial stock.`)
    current.onHand = onHand
    current.reserved = reserved
  }

  commands.forEach((command, index) => {
    const field = `commands[${index}].payload`
    if (index === 0 && command.kind !== 'import') throw new Error('The first inventory command must be the reviewed opening import.')
    if (command.kind === 'import') {
      importCount += 1
      if (importCount !== 1) throw new Error('Inventory foundation v1 accepts exactly one opening import.')
      command.package.clients.forEach((row) => clients.set(row.id, row))
      command.package.vendors.forEach((row) => vendors.set(row.id, row))
      command.package.locations.forEach((row) => locations.set(row.id, row))
      command.package.stockUnits.forEach((row) => stockUnits.set(row.id, row))
      command.package.openings.forEach((opening, openingIndex) => {
        applyDelta(opening.stockUnitId, opening.locationId, opening.quantity, 0, `${field}.package.openings[${openingIndex}]`)
        ledger.push(ledgerEvent({
          id: `LED-${command.id}-OPEN-${openingIndex + 1}`,
          kind: 'opening', command, stockUnitId: opening.stockUnitId, locationId: opening.locationId,
          onHandDelta: opening.quantity, reservedDelta: 0, referenceId: command.package.importId, vendorId: opening.vendorId,
        }))
      })
      return
    }
    if (command.kind === 'receipt') {
      if (!locations.has(command.locationId)) throw new Error(`${field}.locationId is unknown.`)
      if (stockUnits.has(command.stockUnitId)) throw new Error(`${field}.stockUnitId is already recorded.`)
      const traceIdentity = `${command.sku}|lot|${command.trackingCode}`
      if ([...stockUnits.values()].some((unit) => `${unit.sku}|${unit.tracking}|${unit.trackingCode}` === traceIdentity)) {
        throw new Error(`${field}.trackingCode is already recorded for this SKU.`)
      }
      stockUnits.set(command.stockUnitId, {
        id: command.stockUnitId,
        sku: command.sku,
        tracking: 'lot',
        trackingCode: command.trackingCode,
      })
      applyDelta(command.stockUnitId, command.locationId, command.quantity, 0, field)
      ledger.push(ledgerEvent({
        id: `LED-${command.id}-RECEIPT`, kind: 'receipt', command, stockUnitId: command.stockUnitId,
        locationId: command.locationId, onHandDelta: command.quantity, reservedDelta: 0,
        referenceId: command.purchaseOrderId,
      }))
      return
    }
    const stockUnitId = 'stockUnitId' in command ? command.stockUnitId : ''
    if ((command.kind === 'transfer' || command.kind === 'reserve') && !stockUnits.has(stockUnitId)) throw new Error(`${field}.stockUnitId is unknown.`)
    if (command.kind === 'transfer') {
      if (!locations.has(command.fromLocationId) || !locations.has(command.toLocationId)) throw new Error(`${field} references an unknown location.`)
      const source = currentBalance(command.stockUnitId, command.fromLocationId)
      if (source.onHand - source.reserved < command.quantity) throw new Error(`${field} exceeds source available-to-promise stock.`)
      applyDelta(command.stockUnitId, command.fromLocationId, -command.quantity, 0, field)
      applyDelta(command.stockUnitId, command.toLocationId, command.quantity, 0, field)
      ledger.push(
        ledgerEvent({ id: `LED-${command.id}-OUT`, kind: 'transfer-out', command, stockUnitId: command.stockUnitId, locationId: command.fromLocationId, counterpartyLocationId: command.toLocationId, onHandDelta: -command.quantity, reservedDelta: 0, referenceId: command.id }),
        ledgerEvent({ id: `LED-${command.id}-IN`, kind: 'transfer-in', command, stockUnitId: command.stockUnitId, locationId: command.toLocationId, counterpartyLocationId: command.fromLocationId, onHandDelta: command.quantity, reservedDelta: 0, referenceId: command.id }),
      )
      return
    }
    if (command.kind === 'order_reserve') {
      if ([...reservations.values()].some((reservation) => reservation.orderId === command.orderId)) {
        throw new Error(`${field}.orderId is already reserved.`)
      }
      command.allocations.forEach((allocation, allocationIndex) => {
        const allocationField = `${field}.allocations[${allocationIndex}]`
        const unit = stockUnits.get(allocation.stockUnitId)
        if (!unit || unit.sku !== allocation.sku) throw new Error(`${allocationField}.stockUnitId does not match its SKU.`)
        if (!locations.has(allocation.locationId)) throw new Error(`${allocationField}.locationId is unknown.`)
        if (reservations.has(allocation.reservationId)) throw new Error(`${allocationField}.reservationId is already recorded.`)
        const current = currentBalance(allocation.stockUnitId, allocation.locationId)
        if (current.onHand - current.reserved < allocation.quantity) throw new Error(`${allocationField} exceeds available-to-promise stock.`)
        applyDelta(allocation.stockUnitId, allocation.locationId, 0, allocation.quantity, allocationField)
        reservations.set(allocation.reservationId, {
          id: allocation.reservationId,
          orderId: command.orderId,
          customerReference: command.customerReference,
          stockUnitId: allocation.stockUnitId,
          locationId: allocation.locationId,
          quantity: allocation.quantity,
          status: 'active',
          reserveProof: canonicalCopy(command.proof),
          closureCommandId: null,
          closureProof: null,
        })
        ledger.push(ledgerEvent({
          id: `LED-${command.id}-RESERVE-${allocationIndex + 1}`,
          kind: 'order-reserve',
          command,
          stockUnitId: allocation.stockUnitId,
          locationId: allocation.locationId,
          onHandDelta: 0,
          reservedDelta: allocation.quantity,
          referenceId: command.orderId,
          orderId: command.orderId,
          customerReference: command.customerReference,
        }))
      })
      return
    }
    if (command.kind === 'reserve') {
      if (!clients.has(command.clientId)) throw new Error(`${field}.clientId is unknown.`)
      if (!locations.has(command.locationId)) throw new Error(`${field}.locationId is unknown.`)
      const current = currentBalance(command.stockUnitId, command.locationId)
      if (current.onHand - current.reserved < command.quantity) throw new Error(`${field} exceeds available-to-promise stock.`)
      applyDelta(command.stockUnitId, command.locationId, 0, command.quantity, field)
      reservations.set(command.id, {
        id: command.id, clientId: command.clientId, stockUnitId: command.stockUnitId, locationId: command.locationId,
        quantity: command.quantity, status: 'active', reserveProof: canonicalCopy(command.proof), closureCommandId: null, closureProof: null,
      })
      ledger.push(ledgerEvent({ id: `LED-${command.id}-RESERVE`, kind: 'reserve', command, stockUnitId: command.stockUnitId, locationId: command.locationId, onHandDelta: 0, reservedDelta: command.quantity, referenceId: command.id, clientId: command.clientId }))
      return
    }
    if (command.kind === 'order_release' || command.kind === 'order_fulfil') {
      const activeIds = [...reservations.values()]
        .filter((reservation) => reservation.orderId === command.orderId && reservation.status === 'active')
        .map((reservation) => reservation.id)
        .sort(compareCanonicalText)
      if (canonicalJson(activeIds) !== canonicalJson(command.reservationIds)) {
        throw new Error(`${field}.reservationIds must close every active reservation for its order.`)
      }
      command.reservationIds.forEach((reservationId, reservationIndex) => {
        const reservation = reservations.get(reservationId)
        if (!reservation || reservation.orderId !== command.orderId || reservation.status !== 'active') {
          throw new Error(`${field}.reservationIds[${reservationIndex}] is not an active reservation for this order.`)
        }
        const onHandDelta = command.kind === 'order_fulfil' ? -reservation.quantity : 0
        applyDelta(reservation.stockUnitId, reservation.locationId, onHandDelta, -reservation.quantity, field)
        reservation.status = command.kind === 'order_fulfil' ? 'fulfilled' : 'released'
        reservation.closureCommandId = command.id
        reservation.closureProof = canonicalCopy(command.proof)
        ledger.push(ledgerEvent({
          id: `LED-${command.id}-${command.kind === 'order_fulfil' ? 'FULFIL' : 'RELEASE'}-${reservationIndex + 1}`,
          kind: command.kind === 'order_fulfil' ? 'order-fulfil' : 'order-release',
          command,
          stockUnitId: reservation.stockUnitId,
          locationId: reservation.locationId,
          onHandDelta,
          reservedDelta: -reservation.quantity,
          referenceId: command.orderId,
          orderId: command.orderId,
          customerReference: reservation.customerReference,
        }))
      })
      return
    }
    if (!('reservationId' in command)) throw new Error(`${field}.kind is unsupported.`)
    const reservation = reservations.get(command.reservationId)
    if (!reservation) throw new Error(`${field}.reservationId is unknown.`)
    if (reservation.status !== 'active') throw new Error(`${field}.reservationId is already closed.`)
    const onHandDelta = command.kind === 'fulfil' ? -reservation.quantity : 0
    applyDelta(reservation.stockUnitId, reservation.locationId, onHandDelta, -reservation.quantity, field)
    reservation.status = command.kind === 'fulfil' ? 'fulfilled' : 'released'
    reservation.closureCommandId = command.id
    reservation.closureProof = canonicalCopy(command.proof)
    ledger.push(ledgerEvent({ id: `LED-${command.id}-${command.kind.toUpperCase()}`, kind: command.kind, command, stockUnitId: reservation.stockUnitId, locationId: reservation.locationId, onHandDelta, reservedDelta: -reservation.quantity, referenceId: reservation.id, clientId: reservation.clientId }))
  })
  if (commands.length && importCount !== 1) throw new Error('Inventory command history lacks its opening import.')

  const balanceRows: ShopInventoryBalance[] = []
  for (const [key, values] of [...balances.entries()].sort(([left], [right]) => compareCanonicalText(left, right))) {
    if (values.onHand === 0 && values.reserved === 0) continue
    const [stockUnitId, locationId] = key.split('\u0000')
    const unit = stockUnits.get(stockUnitId)
    if (!unit) throw new Error('Inventory balance references an unknown stock unit.')
    balanceRows.push({ stockUnitId: unit.id, sku: unit.sku, tracking: unit.tracking, trackingCode: unit.trackingCode, locationId, onHand: values.onHand, reserved: values.reserved, availableToPromise: values.onHand - values.reserved })
  }
  const totalOnHand = balanceRows.reduce((total, row) => total + row.onHand, 0)
  const totalReserved = balanceRows.reduce((total, row) => total + row.reserved, 0)
  const byId = <T extends { id: string }>(rows: Map<string, T>) => [...rows.values()].sort((left, right) => compareCanonicalText(left.id, right.id))
  return {
    clients: byId(clients), vendors: byId(vendors), locations: byId(locations), stockUnits: byId(stockUnits), balances: balanceRows,
    reservations: byId(reservations), ledger,
    metrics: { totalOnHand, totalReserved, totalAvailableToPromise: totalOnHand - totalReserved },
  }
}

export function validateShopInventoryState(value: unknown, catalog: unknown): ShopInventoryState {
  const trustedCatalog = catalogSkus(catalog)
  const source = exact(value, 'inventory state', ['schema', 'revision', 'headDigest', 'commands'])
  if (source.schema !== SHOP_INVENTORY_STATE_SCHEMA) throw new Error('inventory state.schema is unsupported.')
  const revision = quantity(source.revision, 'inventory state.revision')
  const headDigest = digest(source.headDigest, 'inventory state.headDigest')
  const rawCommands = array(source.commands, 'inventory state.commands', 0, 2_000)
  if (revision !== rawCommands.length) throw new Error('inventory state.revision must equal its retained command count.')
  const commands: ShopInventoryCommand[] = []
  const commandIds: string[] = []
  const actionIds: string[] = []
  let previousDigest = EMPTY_SHOP_INVENTORY_DIGEST
  let previousTimestamp: bigint | null = null
  rawCommands.forEach((candidate, index) => {
    const field = `inventory state.commands[${index}]`
    const envelope = exact(candidate, field, ['sequence', 'previousDigest', 'payload', 'digest'])
    const sequence = quantity(envelope.sequence, `${field}.sequence`, 1)
    if (sequence !== index + 1) throw new Error(`${field}.sequence is not contiguous.`)
    const retainedPrevious = digest(envelope.previousDigest, `${field}.previousDigest`)
    if (retainedPrevious !== previousDigest) throw new Error(`${field}.previousDigest breaks the command chain.`)
    const payload = commandPayload(envelope.payload, `${field}.payload`, trustedCatalog)
    const capturedAt = timestampMicros(payload.proof.capturedAt, `${field}.payload.proof.capturedAt`).micros
    if (previousTimestamp !== null && capturedAt < previousTimestamp) throw new Error(`${field}.payload.proof.capturedAt moves backwards.`)
    const body = { sequence, previousDigest: retainedPrevious, payload }
    const retainedDigest = digest(envelope.digest, `${field}.digest`)
    if (retainedDigest !== canonicalDigest(body)) throw new Error(`${field}.digest does not match its command evidence.`)
    commands.push({ ...body, digest: retainedDigest })
    commandIds.push(payload.id)
    actionIds.push(payload.proof.actionId)
    previousDigest = retainedDigest
    previousTimestamp = capturedAt
  })
  unique(commandIds, 'inventory command IDs')
  unique(actionIds, 'inventory action IDs')
  if (headDigest !== (commands.length ? previousDigest : EMPTY_SHOP_INVENTORY_DIGEST)) throw new Error('inventory state.headDigest does not match its command chain.')
  replayCommands(commands.map((command) => command.payload))
  return canonicalCopy({ schema: SHOP_INVENTORY_STATE_SCHEMA, revision, headDigest, commands })
}

export function projectShopInventory(state: unknown, catalog: unknown): ShopInventoryProjection {
  const validated = validateShopInventoryState(state, catalog)
  return canonicalCopy({
    contract: SHOP_INVENTORY_PROJECTION_CONTRACT,
    revision: validated.revision,
    headDigest: validated.headDigest,
    ...replayCommands(validated.commands.map((command) => command.payload)),
  })
}

export function shopInventoryEvidenceDigest(value: unknown) {
  return canonicalDigest(value)
}

function appendCommand(
  state: unknown,
  payload: unknown,
  catalog: unknown,
  expectedHeadDigest: unknown,
) {
  const trustedCatalog = catalogSkus(catalog)
  const current = validateShopInventoryState(state, trustedCatalog)
  const canonicalPayload = commandPayload(payload, 'command payload', trustedCatalog)
  const existing = current.commands.find((command) => command.payload.id === canonicalPayload.id)
  if (existing) {
    if (canonicalJson(existing.payload) !== canonicalJson(canonicalPayload)) throw new Error('The inventory command ID was already used with different evidence.')
    return { state: current, replayed: true }
  }
  if (digest(expectedHeadDigest, 'expected_head_digest') !== current.headDigest) throw new Error('The inventory snapshot changed before this command was applied.')
  const body = { sequence: current.revision + 1, previousDigest: current.headDigest, payload: canonicalPayload }
  const envelope = { ...body, digest: canonicalDigest(body) }
  const candidate = { schema: SHOP_INVENTORY_STATE_SCHEMA, revision: body.sequence, headDigest: envelope.digest, commands: [...current.commands, envelope] }
  return { state: validateShopInventoryState(candidate, trustedCatalog), replayed: false }
}

export function applyShopInventoryImport(
  state: unknown,
  importPackage: unknown,
  actionProof: unknown,
  catalog: unknown,
  expectedHeadDigest: unknown,
) {
  const trustedCatalog = catalogSkus(catalog)
  const checkedPackage = validateImportPackage(importPackage, trustedCatalog, true)
  return appendCommand(state, { kind: 'import', id: checkedPackage.importId, package: checkedPackage, proof: proof(actionProof, 'proof') }, trustedCatalog, expectedHeadDigest)
}

export function transferShopInventory(state: unknown, input: {
  transferId: unknown
  stockUnitId: unknown
  fromLocationId: unknown
  toLocationId: unknown
  quantity: unknown
  proof: unknown
  catalogSkus: unknown
  expectedHeadDigest: unknown
}) {
  return appendCommand(state, {
    kind: 'transfer', id: input.transferId, stockUnitId: input.stockUnitId, fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId, quantity: input.quantity, proof: proof(input.proof, 'proof'),
  }, input.catalogSkus, input.expectedHeadDigest)
}

export function receiveShopInventory(state: unknown, input: {
  receiptId: unknown
  purchaseOrderId: unknown
  stockUnitId: unknown
  sku: unknown
  trackingCode: unknown
  locationId: unknown
  quantity: unknown
  proof: unknown
  catalogSkus: unknown
  expectedHeadDigest: unknown
}) {
  return appendCommand(state, {
    kind: 'receipt', id: input.receiptId, purchaseOrderId: input.purchaseOrderId,
    stockUnitId: input.stockUnitId, sku: input.sku, trackingCode: input.trackingCode,
    locationId: input.locationId, quantity: input.quantity, proof: proof(input.proof, 'proof'),
  }, input.catalogSkus, input.expectedHeadDigest)
}

function inventoryOrderCommandId(prefix: 'ORS' | 'ORL' | 'ORF', orderId: string) {
  const identity = canonicalDigest({ contract: 'supermega.shop.order-inventory-command.v1', kind: prefix, orderId })
  return `${prefix}-${identity.slice(7, 39).toUpperCase()}`
}

function inventoryOrderReservationId(orderId: string, allocation: Omit<ShopInventoryOrderAllocation, 'reservationId'>) {
  const identity = canonicalDigest({
    contract: 'supermega.shop.order-allocation.v1',
    orderId,
    sku: allocation.sku,
    stockUnitId: allocation.stockUnitId,
    locationId: allocation.locationId,
    quantity: allocation.quantity,
  })
  return `RES-ORD-${identity.slice(7, 39).toUpperCase()}`
}

function inventoryOrderLines(value: unknown, field: string, catalog: string[]) {
  const rows = array(value, field, 1, 20).map((candidate, index): ShopInventoryOrderLine => {
    const rowField = `${field}[${index}]`
    const row = exact(candidate, rowField, ['sku', 'quantity'])
    const sku = text(row.sku, `${rowField}.sku`, 80)
    if (!catalog.includes(sku)) throw new Error(`${rowField}.sku is not present in the trusted Shop catalog.`)
    return { sku, quantity: quantity(row.quantity, `${rowField}.quantity`, 1) }
  })
  unique(rows.map((row) => row.sku), `${field} SKUs`)
  return [...rows].sort((left, right) => compareCanonicalText(left.sku, right.sku))
}

function allocationLineTotals(allocations: ShopInventoryOrderAllocation[]) {
  const totals = new Map<string, number>()
  allocations.forEach((allocation) => totals.set(allocation.sku, (totals.get(allocation.sku) ?? 0) + allocation.quantity))
  return [...totals.entries()].sort(([left], [right]) => compareCanonicalText(left, right)).map(([sku, lineQuantity]) => ({ sku, quantity: lineQuantity }))
}

export function planShopInventoryOrderAllocation(state: unknown, input: {
  orderId: unknown
  customerReference: unknown
  lines: unknown
  catalogSkus: unknown
}) {
  const catalog = catalogSkus(input.catalogSkus)
  const orderId = text(input.orderId, 'order allocation.orderId', 160)
  text(input.customerReference, 'order allocation.customerReference', 180)
  const lines = inventoryOrderLines(input.lines, 'order allocation.lines', catalog)
  const projection = projectShopInventory(state, catalog)
  const provisional: Omit<ShopInventoryOrderAllocation, 'reservationId'>[] = []
  for (const line of lines) {
    let remaining = line.quantity
    const candidates = projection.balances
      .filter((balance) => balance.sku === line.sku && balance.availableToPromise > 0)
      .sort((left, right) => right.availableToPromise - left.availableToPromise
        || compareCanonicalText(`${left.locationId}|${left.stockUnitId}`, `${right.locationId}|${right.stockUnitId}`))
    for (const candidate of candidates) {
      if (remaining === 0) break
      const allocated = Math.min(remaining, candidate.availableToPromise)
      provisional.push({ sku: line.sku, stockUnitId: candidate.stockUnitId, locationId: candidate.locationId, quantity: allocated })
      remaining -= allocated
    }
    if (remaining !== 0) throw new Error(`Location stock cannot allocate ${line.quantity} units of ${line.sku}.`)
  }
  provisional.sort((left, right) => compareCanonicalText(
    `${left.sku}|${left.locationId}|${left.stockUnitId}`,
    `${right.sku}|${right.locationId}|${right.stockUnitId}`,
  ))
  const allocations = provisional.map((allocation): ShopInventoryOrderAllocation => {
    return { reservationId: inventoryOrderReservationId(orderId, allocation), ...allocation }
  })
  unique(allocations.map((allocation) => allocation.reservationId), 'order allocation reservation IDs')
  return canonicalCopy(allocations)
}

export function reserveShopInventoryOrder(state: unknown, input: {
  orderId: unknown
  customerReference: unknown
  lines: unknown
  proof: unknown
  catalogSkus: unknown
  expectedHeadDigest: unknown
}) {
  const catalog = catalogSkus(input.catalogSkus)
  const current = validateShopInventoryState(state, catalog)
  const orderId = text(input.orderId, 'order reservation.orderId', 160)
  const customerReference = text(input.customerReference, 'order reservation.customerReference', 180)
  const lines = inventoryOrderLines(input.lines, 'order reservation.lines', catalog)
  const commandId = inventoryOrderCommandId('ORS', orderId)
  const retained = current.commands.find((command) => command.payload.id === commandId)?.payload
  if (retained) {
    if (retained.kind !== 'order_reserve'
      || retained.orderId !== orderId
      || retained.customerReference !== customerReference
      || canonicalJson(allocationLineTotals(retained.allocations)) !== canonicalJson(lines)) {
      throw new Error('The order inventory command was already used with different allocation evidence.')
    }
    return appendCommand(current, { ...retained, proof: proof(input.proof, 'proof') }, catalog, input.expectedHeadDigest)
  }
  const allocations = planShopInventoryOrderAllocation(current, { orderId, customerReference, lines, catalogSkus: catalog })
  return appendCommand(current, {
    kind: 'order_reserve', id: commandId, orderId, customerReference, allocations, proof: proof(input.proof, 'proof'),
  }, catalog, input.expectedHeadDigest)
}

function closeShopInventoryOrder(state: unknown, input: {
  kind: 'order_release' | 'order_fulfil'
  orderId: unknown
  proof: unknown
  catalogSkus: unknown
  expectedHeadDigest: unknown
}) {
  const catalog = catalogSkus(input.catalogSkus)
  const current = validateShopInventoryState(state, catalog)
  const orderId = text(input.orderId, 'order inventory closure.orderId', 160)
  const prefix = input.kind === 'order_release' ? 'ORL' : 'ORF'
  const commandId = inventoryOrderCommandId(prefix, orderId)
  const retained = current.commands.find((command) => command.payload.id === commandId)?.payload
  const reservationIds = retained && (retained.kind === 'order_release' || retained.kind === 'order_fulfil')
    ? retained.reservationIds
    : projectShopInventory(current, catalog).reservations
      .filter((reservation) => reservation.orderId === orderId && reservation.status === 'active')
      .map((reservation) => reservation.id)
      .sort(compareCanonicalText)
  if (!reservationIds.length) throw new Error('The order has no active location reservation to close.')
  return appendCommand(current, {
    kind: input.kind, id: commandId, orderId, reservationIds, proof: proof(input.proof, 'proof'),
  }, catalog, input.expectedHeadDigest)
}

export function releaseShopInventoryOrder(state: unknown, input: Omit<Parameters<typeof closeShopInventoryOrder>[1], 'kind'>) {
  return closeShopInventoryOrder(state, { ...input, kind: 'order_release' })
}

export function fulfilShopInventoryOrder(state: unknown, input: Omit<Parameters<typeof closeShopInventoryOrder>[1], 'kind'>) {
  return closeShopInventoryOrder(state, { ...input, kind: 'order_fulfil' })
}

export function reserveShopInventory(state: unknown, input: {
  reservationId: unknown
  clientId: unknown
  stockUnitId: unknown
  locationId: unknown
  quantity: unknown
  proof: unknown
  catalogSkus: unknown
  expectedHeadDigest: unknown
}) {
  return appendCommand(state, {
    kind: 'reserve', id: input.reservationId, clientId: input.clientId, stockUnitId: input.stockUnitId,
    locationId: input.locationId, quantity: input.quantity, proof: proof(input.proof, 'proof'),
  }, input.catalogSkus, input.expectedHeadDigest)
}

function closeReservation(state: unknown, input: {
  kind: 'release' | 'fulfil'
  commandId: unknown
  reservationId: unknown
  proof: unknown
  catalogSkus: unknown
  expectedHeadDigest: unknown
}) {
  return appendCommand(state, { kind: input.kind, id: input.commandId, reservationId: input.reservationId, proof: proof(input.proof, 'proof') }, input.catalogSkus, input.expectedHeadDigest)
}

export function releaseShopInventoryReservation(state: unknown, input: {
  releaseId: unknown
  reservationId: unknown
  proof: unknown
  catalogSkus: unknown
  expectedHeadDigest: unknown
}) {
  return closeReservation(state, { ...input, kind: 'release', commandId: input.releaseId })
}

export function fulfilShopInventoryReservation(state: unknown, input: {
  fulfilmentId: unknown
  reservationId: unknown
  proof: unknown
  catalogSkus: unknown
  expectedHeadDigest: unknown
}) {
  return closeReservation(state, { ...input, kind: 'fulfil', commandId: input.fulfilmentId })
}
