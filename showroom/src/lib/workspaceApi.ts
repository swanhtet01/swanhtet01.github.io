const configuredBase = import.meta.env.VITE_WORKSPACE_API_BASE?.trim() ?? ''
const configuredAppBase = import.meta.env.VITE_WORKSPACE_APP_BASE?.trim() ?? ''

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function inferApiBase() {
  if (configuredBase) {
    return configuredBase.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return ''
  }

  const { hostname, origin, protocol, port } = window.location
  if (port === '8787') {
    return origin
  }

  if (isLocalHost(hostname)) {
    return `${protocol}//${hostname}:8787`
  }

  return ''
}

function inferAppBase() {
  if (configuredAppBase) {
    return configuredAppBase.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return ''
  }

  const { hostname, origin, port } = window.location
  if (port === '8787') {
    return origin
  }

  if (isLocalHost(hostname)) {
    return `http://${hostname}:8787`
  }

  return ''
}

export const workspaceApiBase = inferApiBase()
export const workspaceAppBase = inferAppBase()

export function hasLiveWorkspaceApi() {
  return Boolean(workspaceApiBase)
}

export function hasLiveWorkspaceApp() {
  return Boolean(workspaceAppBase)
}

export function publicShellOnly() {
  if (typeof window === 'undefined') {
    return false
  }

  const { hostname, port } = window.location
  return !isLocalHost(hostname) && port !== '8787' && !hasLiveWorkspaceApi() && !hasLiveWorkspaceApp()
}

export function appHref(path = '/', fallback = '/book') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!workspaceAppBase) {
    return fallback
  }
  return `${workspaceAppBase}${normalizedPath}`
}

export function needsLiveAppHandoff() {
  if (typeof window === 'undefined') {
    return false
  }

  if (!workspaceAppBase) {
    return false
  }

  return workspaceAppBase !== window.location.origin
}

export async function workspaceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = workspaceApiBase
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const error = new Error(`Workspace API request failed: ${response.status}`) as Error & { status?: number }
    error.status = response.status
    throw error
  }

  return (await response.json()) as T
}

export async function checkWorkspaceHealth() {
  if (typeof window === 'undefined') {
    return { ready: false as const }
  }

  try {
    const payload = await workspaceFetch<{ status?: string }>('/api/health')
    return { ready: payload.status === 'ready' }
  } catch {
    return { ready: false as const }
  }
}

export type WorkspaceSessionPayload = {
  status?: string
  auth_required?: boolean
  authenticated?: boolean
  uses_default_credentials?: boolean
  workspaces?: Array<{
    workspace_id?: string
    slug?: string
    name?: string
    plan?: string
    role?: string
  }>
  session?: {
    username?: string
    display_name?: string
    role?: string
    workspace_id?: string
    workspace_slug?: string
    workspace_name?: string
    workspace_plan?: string
  } | null
}

export async function getWorkspaceSession() {
  return workspaceFetch<WorkspaceSessionPayload>('/api/auth/session')
}

export async function loginWorkspace(username: string, password: string, workspaceSlug = '') {
  return workspaceFetch<WorkspaceSessionPayload>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, workspace_slug: workspaceSlug }),
  })
}

export async function logoutWorkspace() {
  return workspaceFetch<{ status?: string; authenticated?: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
