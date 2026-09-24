export type BriefProduct = 'website' | 'ecommerce'
export type BusinessBriefDraft = { company: string; description: string; reference: string }
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const lifetime = 60 * 60 * 1000
const key = (product: BriefProduct) => `supermega.business-brief.${product}.v1`
export const emptyBusinessBrief = (): BusinessBriefDraft => ({ company: '', description: '', reference: '' })

export function readBusinessBrief(storage: DraftStorage, product: BriefProduct, now = Date.now()): BusinessBriefDraft {
  try {
    const raw = storage.getItem(key(product))
    if (!raw) return emptyBusinessBrief()
    if (raw.length > 24000) throw new Error('oversize')
    const value = JSON.parse(raw)
    if (!value || !Number.isFinite(value.savedAt) || value.savedAt > now || now - value.savedAt >= lifetime
      || typeof value.company !== 'string' || value.company.length > 180
      || typeof value.description !== 'string' || value.description.length > 3000
      || typeof value.reference !== 'string' || value.reference.length > 700) throw new Error('invalid')
    return { company: value.company, description: value.description, reference: value.reference }
  } catch {
    try { storage.removeItem(key(product)) } catch { /* Storage can be unavailable. */ }
    return emptyBusinessBrief()
  }
}

export function saveBusinessBrief(storage: DraftStorage, product: BriefProduct, draft: BusinessBriefDraft, now = Date.now()): boolean {
  try {
    const raw = !draft.company && !draft.description && !draft.reference ? null : JSON.stringify({ ...draft, savedAt: now })
    if (raw === null) storage.removeItem(key(product))
    else storage.setItem(key(product), raw)
    return storage.getItem(key(product)) === raw
  } catch { return false }
}
