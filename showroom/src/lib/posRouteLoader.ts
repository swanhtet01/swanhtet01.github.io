let loginPagePromise: Promise<typeof import('../pages/PosLoginPage')> | null = null
let rolePagePromise: Promise<typeof import('../pages/PosRoleSelectionPage')> | null = null
let workspacePagePromise: Promise<typeof import('../pages/PosWorkspacePage')> | null = null
let workspacePreloadScheduled = false

export function loadPosLoginPage() {
  if (!loginPagePromise) {
    loginPagePromise = import('../pages/PosLoginPage')
  }
  return loginPagePromise
}

export function loadPosRoleSelectionPage() {
  if (!rolePagePromise) {
    rolePagePromise = import('../pages/PosRoleSelectionPage')
  }
  return rolePagePromise
}

export function loadPosWorkspacePage() {
  if (!workspacePagePromise) {
    workspacePagePromise = import('../pages/PosWorkspacePage')
  }
  return workspacePagePromise
}

export function preloadPosWorkspaceRoutes() {
  void loadPosRoleSelectionPage()
  if (!workspacePreloadScheduled) {
    workspacePreloadScheduled = true
    const schedule = typeof window === 'undefined'
      ? (handler: () => void) => setTimeout(handler, 120)
      : (handler: () => void) => window.setTimeout(handler, 120)
    schedule(() => {
      void loadPosWorkspacePage()
    })
  }
}
