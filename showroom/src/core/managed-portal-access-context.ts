import { createContext, useContext } from 'react'

import type { ClientSolutionId } from './client-onboarding'

export type ManagedPortalAccess =
  | { status: 'local'; products: readonly ClientSolutionId[]; capabilities: readonly string[]; workspaceId: '' }
  | { status: 'checking'; products: readonly ClientSolutionId[]; capabilities: readonly string[]; workspaceId: string }
  | { status: 'reauthenticate'; products: readonly ClientSolutionId[]; capabilities: readonly string[]; workspaceId: string }
  | {
      status: 'ready'
      products: readonly ClientSolutionId[]
      capabilities: readonly string[]
      workspaceId: string
      companyName: string
      companyRole: 'owner' | 'operator' | 'viewer'
      accountEmail: string
    }
  | { status: 'error'; products: readonly ClientSolutionId[]; capabilities: readonly string[]; workspaceId: string; message: string }

export const localPortalAccess: ManagedPortalAccess = { status: 'local', products: [], capabilities: [], workspaceId: '' }

export const ManagedPortalAccessContext = createContext<ManagedPortalAccess>(localPortalAccess)

export function useCurrentManagedPortalAccess() {
  return useContext(ManagedPortalAccessContext)
}
