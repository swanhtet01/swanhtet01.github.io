import {
  clientImportSha256,
  normalizeClientImportHeader,
  parseClientCsv,
} from './client-onboarding.ts'

export const PLANT_EQUIPMENT_IMPORT_SCHEMA = 'supermega.production.equipment-import.v1' as const
export const PLANT_EQUIPMENT_MAX_ROWS = 100

export type PlantEquipmentCriticality = 'critical' | 'high' | 'medium' | 'low'

export type PlantEquipmentImportRow = {
  sourceRow: number
  key: string
  values: {
    equipmentId: string
    name: string
    workCentreId: string
    criticality: PlantEquipmentCriticality
  }
}

export type PlantEquipmentImportPackage = {
  contract: typeof PLANT_EQUIPMENT_IMPORT_SCHEMA
  workspace: string
  owner: string
  source: { name: string; digest: string }
  rows: PlantEquipmentImportRow[]
  controls: {
    rowCount: number
    humanReviewRequired: true
    externalWritesPerformed: false
    commissioningPerformed: false
    activationStatus: 'staged_not_applied'
  }
}

export type PlantEquipmentImportPreview = {
  package: PlantEquipmentImportPackage
  packageDigest: string
  headers: string[]
}

const identifier = /^[A-Z0-9][A-Z0-9._/-]{0,79}$/
const formulaPrefix = /^[=+\-@]/
const criticalities = new Set<PlantEquipmentCriticality>(['critical', 'high', 'medium', 'low'])
const fieldAliases = {
  equipmentId: ['equipment_id', 'equipmentid', 'asset_id', 'assetid', 'machine_id', 'machineid'],
  name: ['name', 'equipment_name', 'asset_name', 'machine_name'],
  workCentreId: ['work_centre_id', 'work_center_id', 'workcentreid', 'workcenterid', 'line_id', 'area_id'],
  criticality: ['criticality', 'priority', 'asset_criticality', 'equipment_criticality'],
} as const

function checkedText(value: string, field: string, maximum: number, formulaSafe = true) {
  if (!value || value !== value.trim()) throw new Error(`${field} is required without surrounding spaces.`)
  if (value.normalize('NFC') !== value) throw new Error(`${field} must use normalized Unicode text.`)
  if (Array.from(value).some((character) => {
    const point = character.codePointAt(0) as number
    return point <= 31 || point === 127
  })) throw new Error(`${field} contains a control character.`)
  if (formulaSafe && formulaPrefix.test(value)) throw new Error(`${field} begins like a spreadsheet formula.`)
  if (value.length > maximum) throw new Error(`${field} is longer than ${maximum} characters.`)
  return value
}

function mappedColumns(headers: string[]) {
  if (headers.length > 50) throw new Error('The equipment CSV has more than 50 columns.')
  if (headers.some((header) => !header.trim())) throw new Error('Every equipment CSV column needs a header.')
  const normalized = headers.map(normalizeClientImportHeader)
  if (new Set(normalized).size !== normalized.length) throw new Error('The equipment CSV has duplicate or equivalent headers.')
  const mapped = {} as Record<keyof typeof fieldAliases, number>
  for (const [field, aliases] of Object.entries(fieldAliases) as Array<[keyof typeof fieldAliases, readonly string[]]>) {
    const matches = normalized.flatMap((header, index) => aliases.includes(header) ? [index] : [])
    if (!matches.length) throw new Error(`Match one ${field} column before review.`)
    if (matches.length > 1) throw new Error(`The equipment CSV has multiple possible ${field} columns.`)
    mapped[field] = matches[0]
  }
  if (new Set(Object.values(mapped)).size !== Object.keys(mapped).length) throw new Error('One equipment CSV column cannot fill multiple fields.')
  return mapped
}

export function plantEquipmentSampleCsv() {
  return [
    'equipment_id,name,work_centre_id,criticality',
    'MIX-01,Primary mixer,MIXING,critical',
    'PACK-01,Packing line,PACKING,high',
  ].join('\r\n') + '\r\n'
}

export async function createPlantEquipmentImportPreview(input: {
  sourceName: string
  sourceText: string
  workspace: string
  owner: string
}): Promise<PlantEquipmentImportPreview> {
  const sourceName = checkedText(input.sourceName, 'Source file name', 180, false)
  const workspace = checkedText(input.workspace, 'Workspace', 120, false)
  const owner = checkedText(input.owner, 'Owner', 120, false)
  const { source, rows: parsedRows } = parseClientCsv(input.sourceText)
  const headerRow = parsedRows[0]
  const dataRows = parsedRows.slice(1)
  if (!headerRow || !dataRows.length) throw new Error('The equipment CSV needs a header and at least one record.')
  if (dataRows.length > PLANT_EQUIPMENT_MAX_ROWS) throw new Error(`Review at most ${PLANT_EQUIPMENT_MAX_ROWS} equipment records at a time.`)
  const headers = headerRow.cells.map((value) => checkedText(value, 'Column header', 120, false))
  const columns = mappedColumns(headers)
  const equipmentIds = new Set<string>()
  const rows = dataRows.map((row): PlantEquipmentImportRow => {
    if (row.cells.length !== headers.length) throw new Error(`CSV row ${row.rowNumber} does not match the header column count.`)
    const equipmentId = checkedText(row.cells[columns.equipmentId], `Row ${row.rowNumber} equipment ID`, 80)
    const name = checkedText(row.cells[columns.name], `Row ${row.rowNumber} name`, 180)
    const workCentreId = checkedText(row.cells[columns.workCentreId], `Row ${row.rowNumber} work centre ID`, 80)
    const criticality = checkedText(row.cells[columns.criticality], `Row ${row.rowNumber} criticality`, 8) as PlantEquipmentCriticality
    if (!identifier.test(equipmentId) || !identifier.test(workCentreId)) throw new Error(`Row ${row.rowNumber} IDs must use uppercase letters, numbers, dot, slash, dash, or underscore.`)
    if (!criticalities.has(criticality)) throw new Error(`Row ${row.rowNumber} criticality must be critical, high, medium, or low.`)
    if (equipmentIds.has(equipmentId)) throw new Error(`Equipment ID ${equipmentId} appears more than once.`)
    equipmentIds.add(equipmentId)
    return { sourceRow: row.rowNumber, key: equipmentId, values: { equipmentId, name, workCentreId, criticality } }
  })
  const equipmentPackage: PlantEquipmentImportPackage = {
    contract: PLANT_EQUIPMENT_IMPORT_SCHEMA,
    workspace,
    owner,
    source: { name: sourceName, digest: await clientImportSha256(source) },
    rows,
    controls: {
      rowCount: rows.length,
      humanReviewRequired: true,
      externalWritesPerformed: false,
      commissioningPerformed: false,
      activationStatus: 'staged_not_applied',
    },
  }
  return {
    package: equipmentPackage,
    packageDigest: await clientImportSha256(JSON.stringify(equipmentPackage)),
    headers,
  }
}
