const BUILD_ENV = import.meta.env ?? {}

export const MANAGED_WORKSPACE_STORAGE_KEY = 'supermega.managed.workspace.v1'
export const MANAGED_WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

const DEFAULT_WORKSPACE_ID = String(BUILD_ENV.VITE_SUPERMEGA_TRIAL_WORKSPACE_ID ?? '').trim()

export function currentManagedWorkspace() {
  try {
    const stored = localStorage.getItem(MANAGED_WORKSPACE_STORAGE_KEY) ?? ''
    if (MANAGED_WORKSPACE_ID_PATTERN.test(stored)) return stored
  } catch {
    // The configured workspace remains available when storage is disabled.
  }
  return MANAGED_WORKSPACE_ID_PATTERN.test(DEFAULT_WORKSPACE_ID) ? DEFAULT_WORKSPACE_ID : ''
}
