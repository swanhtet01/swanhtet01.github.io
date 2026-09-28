import { createShopCatalogImportPreview, shopCatalogImportFields, type ShopCatalogImportMapping } from './shop-catalog-import.ts'
import type { CommerceItem } from './commerce-workspace'

// Model output is data, never executable instructions or permission to import.
export async function reviewCatalogMappingProposal(csv: string, catalog: CommerceItem[], proposal: unknown) {
  const baseline = await createShopCatalogImportPreview(csv, catalog)
  const reject = (reason: string) => ({ status: 'rejected' as const, reason })
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return reject('invalid_proposal')
  const value = proposal as Record<string, unknown>
  if (Object.keys(value).some(key => !['sourceDigest', 'mapping'].includes(key))) return reject('unexpected_proposal_field')
  if (value.sourceDigest !== baseline.sourceDigest) return reject('source_changed')
  if (!value.mapping || typeof value.mapping !== 'object' || Array.isArray(value.mapping)) return reject('invalid_mapping')
  const mapping = value.mapping as Record<string, unknown>
  if (Object.keys(mapping).length !== shopCatalogImportFields.length
    || Object.keys(mapping).some(key => !(shopCatalogImportFields as readonly string[]).includes(key))) return reject('invalid_fields')
  for (const field of shopCatalogImportFields) {
    const header = mapping[field]
    if (typeof header !== 'string' || !baseline.headers.includes(header)) return reject('unknown_source_header')
    // Existing deterministic mappings cannot be silently replaced by a model.
    if (baseline.mapping[field] && baseline.mapping[field] !== header) return reject('deterministic_mapping_conflict')
    if (baseline.suggestions.find(item => item.field === field)?.basis === 'ambiguous') return reject('human_choice_required')
  }
  if (new Set(Object.values(mapping)).size !== shopCatalogImportFields.length) return reject('reused_source_header')
  const preview = await createShopCatalogImportPreview(csv, catalog, mapping as ShopCatalogImportMapping)
  if (preview.fileIssues.length || preview.rows.some(row => row.status !== 'ready')) return reject('import_validation_failed')
  return { status: 'review_required' as const, preview, importAuthorized: false as const }
}
