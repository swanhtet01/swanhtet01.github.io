import { loadWebsiteWorkspace } from '../products/website/website-model.ts'

// Discovery only: never register setup, migrate storage or create a starter.
export function savedWebsiteEntry(storage: Pick<Storage, 'getItem'>): string | null {
  const result = loadWebsiteWorkspace(storage)
  if (!result.ok) return 'Website recovery'
  return result.source === 'seed' ? null : result.workspace.siteName
}
