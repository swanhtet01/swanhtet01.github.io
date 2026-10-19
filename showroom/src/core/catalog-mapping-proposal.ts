import { createShopCatalogImportPreview, ShopCatalogImportVariantChoiceRequiredError, shopCatalogImportFields, type ShopCatalogImportMapping } from './shop-catalog-import.ts'
import type { CommerceItem } from './commerce-workspace'

// Model output is data, never executable instructions or permission to import.
export async function reviewCatalogMappingProposal(csv: string, catalog: CommerceItem[], proposal: unknown) {
  const reject = (reason: string) => ({ status: 'rejected' as const, reason })
  let baseline
  try {
    baseline = await createShopCatalogImportPreview(csv, catalog)
  } catch (error) {
    if (error instanceof ShopCatalogImportVariantChoiceRequiredError) return reject(error.code)
    throw error
  }
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return reject('invalid_proposal')
  const value = proposal as Record<string, unknown>
  if (Object.keys(value).some(key => !['sourceDigest', 'mapping'].includes(key))) return reject('unexpected_proposal_field')
  if (value.sourceDigest !== baseline.sourceDigest) return reject('source_changed')
  if (!value.mapping || typeof value.mapping !== 'object' || Array.isArray(value.mapping)) return reject('invalid_mapping')
  const mapping = value.mapping as Record<string, unknown>
  if (Object.keys(mapping).some(key => ![...shopCatalogImportFields, 'nameMy'].includes(key as typeof shopCatalogImportFields[number] | 'nameMy'))) return reject('invalid_fields')
  for (const field of shopCatalogImportFields) {
    const header = mapping[field] ?? (field === 'category' || field === 'barcode' ? baseline.mapping[field] : undefined)
    if (typeof header !== 'string' || (header !== '' && !baseline.headers.includes(header))) return reject('unknown_source_header')
    if (baseline.suggestions.find(item => item.field === field)?.basis === 'ambiguous') return reject('human_choice_required')
    if (field !== 'barcode' && field !== 'category' && header === '') return reject('required_source_header_missing')
    // Existing deterministic mappings cannot be silently replaced by a model.
    if (baseline.mapping[field] && baseline.mapping[field] !== header) return reject('deterministic_mapping_conflict')
  }
  const nameMyHeader = mapping.nameMy ?? baseline.mapping.nameMy ?? ''
  if (typeof nameMyHeader !== 'string' || (nameMyHeader !== '' && !baseline.headers.includes(nameMyHeader))) return reject('unknown_source_header')
  if (baseline.mapping.nameMy && baseline.mapping.nameMy !== nameMyHeader) return reject('deterministic_mapping_conflict')
  const completeMapping = {
    ...Object.fromEntries(shopCatalogImportFields.map((field) => [field, mapping[field] ?? baseline.mapping[field] ?? ''])),
    ...(nameMyHeader ? { nameMy: nameMyHeader } : {}),
  }
  const mappedHeaders = Object.values(completeMapping).filter(Boolean)
  if (new Set(mappedHeaders).size !== mappedHeaders.length) return reject('reused_source_header')
  const preview = await createShopCatalogImportPreview(csv, catalog, completeMapping as ShopCatalogImportMapping)
  if (preview.fileIssues.length || preview.rows.some(row => row.status !== 'ready')) return reject('import_validation_failed')
  return { status: 'review_required' as const, preview, importAuthorized: false as const }
}
