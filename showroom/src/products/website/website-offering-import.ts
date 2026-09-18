import { parseClientCsv } from '../../core/client-onboarding.ts'

export const WEBSITE_OFFERING_IMPORT_MAX_BYTES = 64 * 1024
export type WebsiteOfferingRow = { name: string; details: string }

// Pure preview only. No storage, network or automatic application.
export function previewWebsiteOfferingCsv(input: string): WebsiteOfferingRow[] {
  if (new TextEncoder().encode(input).byteLength > WEBSITE_OFFERING_IMPORT_MAX_BYTES) throw new Error('Choose a CSV smaller than 64 KB.')
  const { rows } = parseClientCsv(input)
  const headers = rows[0].cells.map(value => value.trim().toLowerCase())
  if (headers.length !== 2 || new Set(headers).size !== 2 || !headers.includes('name') || !headers.includes('description')) throw new Error('Use exactly two columns: name and description. Include any approved price or duration in description.')
  if (rows.length < 2 || rows.length > 5) throw new Error('Choose one to four featured entries. Larger menus are not supported by this Website starter yet.')
  const names = new Set<string>()
  return rows.slice(1).map(row => {
    if (row.cells.length !== 2) throw new Error(`Row ${row.rowNumber} must have exactly two columns.`)
    const name = row.cells[headers.indexOf('name')].trim().replace(/\s+/gu, ' ')
    const details = row.cells[headers.indexOf('description')].trim().replace(/\s+/gu, ' ')
    const hasControlCharacter = Array.from(name + details).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    if (!name || name.length > 80 || name.includes('|') || !details || details.length > 360 || hasControlCharacter) throw new Error(`Row ${row.rowNumber}: use a name of 1–80 characters without | and a description of 1–360 characters.`)
    const identity = name.normalize('NFC').toLowerCase()
    if (names.has(identity)) throw new Error(`Row ${row.rowNumber} repeats an entry name. Resolve duplicates before importing.`)
    names.add(identity)
    return { name, details }
  })
}
