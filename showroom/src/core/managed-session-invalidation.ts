import { MANAGED_WORKSPACE_STORAGE_KEY } from './managed-workspace-selection'

// Deliberately do not parse credential-bearing oldValue/newValue payloads.
// A session refresh from another tab also requires an explicit reload.
export function watchManagedSessionStorage(target: Window, invalidate: () => void) {
  let invalidated = false
  function changed(event: StorageEvent) {
    if (event.storageArea !== target.localStorage || invalidated) return
    if (event.key !== null && event.key !== 'supermega.auth.session.v1'
      && event.key !== MANAGED_WORKSPACE_STORAGE_KEY) return
    invalidated = true
    invalidate()
  }
  target.addEventListener('storage', changed)
  return () => target.removeEventListener('storage', changed)
}
