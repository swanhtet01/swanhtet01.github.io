import type { WebsiteWorkspace } from './website-model'

export function websiteDraftDifference(current: WebsiteWorkspace, draft: WebsiteWorkspace): string {
  const saved = new Map(current.pages.map(page => [page.id, page]))
  const drafts = new Set(draft.pages.map(page => page.id))
  const changed = draft.pages.filter(page => JSON.stringify(saved.get(page.id)) !== JSON.stringify(page))
  const removed = current.pages.filter(page => !drafts.has(page.id)).length
  const parts: string[] = []
  if (current.siteName !== draft.siteName) parts.push('Site name changed')
  if (changed.length) parts.push(`${changed.length} changed or added ${changed.length === 1 ? 'page' : 'pages'}: ${changed.slice(0, 3).map(page => page.internalName).join(', ')}${changed.length > 3 ? '…' : ''}`)
  if (removed) parts.push(`${removed} ${removed === 1 ? 'page' : 'pages'} removed`)
  if (!parts.length) return 'No page or site-name differences. The draft may contain other review or navigation changes.'
  return parts.join(' · ')
}
