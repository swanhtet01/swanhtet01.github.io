import { getCapabilityProfileForRole, getWorkspaceSession, sessionHasCapability, type WorkspaceCapability } from './workspaceApi'

export type WorkspaceRouteAccess = {
  loading: boolean
  authenticated: boolean
  allowed: boolean
  roleLabel: string
  roleKey: string
  error: string | null
}

type ResolveWorkspaceRouteAccessOptions = {
  requiredCapabilities: WorkspaceCapability[]
  unauthenticatedMessage: string
  previewMessage: string
}

export const DEFAULT_WORKSPACE_ROUTE_ACCESS: WorkspaceRouteAccess = {
  loading: true,
  authenticated: false,
  allowed: false,
  roleLabel: 'Unknown',
  roleKey: 'member',
  error: null,
}

export async function resolveWorkspaceRouteAccess({
  requiredCapabilities,
  unauthenticatedMessage,
  previewMessage,
}: ResolveWorkspaceRouteAccessOptions): Promise<WorkspaceRouteAccess> {
  try {
    const payload = await getWorkspaceSession()
    const capabilityProfile = getCapabilityProfileForRole(payload.session?.role)
    const authenticated = Boolean(payload.authenticated)
    const allowed = requiredCapabilities.some((capability) => sessionHasCapability(payload.session, capability))

    return {
      loading: false,
      authenticated,
      allowed,
      roleLabel: capabilityProfile.label,
      roleKey: capabilityProfile.roleKey,
      error: authenticated ? null : unauthenticatedMessage,
    }
  } catch {
    return {
      loading: false,
      authenticated: false,
      allowed: false,
      roleLabel: 'Preview',
      roleKey: 'member',
      error: previewMessage,
    }
  }
}
