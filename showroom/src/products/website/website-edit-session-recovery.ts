import {
  restoreWebsiteEditSession,
  websiteEditSessionMatches,
  workspaceFingerprint,
  type WebsiteEditSession,
  type WebsiteWorkspace,
} from './website-model.ts'

export const WEBSITE_CLOSED_EDIT_SESSION_CONTRACT = 'supermega.website.closed-edit-session.v1'
const WEBSITE_CLOSED_EDIT_SESSION_KEY = 'supermega.website.closed-edit-session.v1'

export type WebsiteEditSurface = 'work' | 'preview'

export type WebsiteClosedEditSession = Readonly<{
  schema: typeof WEBSITE_CLOSED_EDIT_SESSION_CONTRACT
  scope: string
  capturedAt: string
  selectedPageId: string
  surface: WebsiteEditSurface
  source: Readonly<{
    baseRevision: number
    baseContentRevision: number
    baseFingerprint: string
  }>
  session: WebsiteEditSession
}>

export type WebsiteClosedEditSessionReview =
  | Readonly<{ ok: true; session: WebsiteEditSession; selectedPageId: string; surface: WebsiteEditSurface }>
  | Readonly<{
      ok: false
      reason: 'invalid_recovery' | 'scope_changed' | 'saved_website_changed' | 'no_changes'
    }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const retained = Object.keys(value).sort()
  const expected = [...keys].sort()
  return retained.length === expected.length && retained.every((key, index) => key === expected[index])
}

function validScope(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
}

function validCapturedAt(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
}

export function websiteClosedEditSessionStorageKey(scope: string) {
  if (!validScope(scope)) throw new Error('Website edit recovery requires an exact workspace scope.')
  return `${WEBSITE_CLOSED_EDIT_SESSION_KEY}.${encodeURIComponent(scope)}`
}

export function createWebsiteClosedEditSession(
  scope: string,
  session: WebsiteEditSession,
  selectedPageId: string,
  surface: WebsiteEditSurface,
  capturedAt: Date | string = new Date(),
): WebsiteClosedEditSession {
  const restored = restoreWebsiteEditSession(session)
  const capturedAtValue = capturedAt instanceof Date ? capturedAt.toISOString() : capturedAt
  if (!validScope(scope)
    || !restored
    || !restored.workspace.pages.some((page) => page.id === selectedPageId)
    || (surface !== 'work' && surface !== 'preview')
    || !validCapturedAt(capturedAtValue)) {
    throw new Error('Website edit recovery could not be created from this preview.')
  }
  return {
    schema: WEBSITE_CLOSED_EDIT_SESSION_CONTRACT,
    scope,
    capturedAt: capturedAtValue,
    selectedPageId,
    surface,
    source: {
      baseRevision: restored.baseRevision,
      baseContentRevision: restored.baseContentRevision,
      baseFingerprint: restored.baseFingerprint,
    },
    session: restored,
  }
}

export function restoreWebsiteClosedEditSession(value: unknown): WebsiteClosedEditSession | null {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!isRecord(candidate)
      || !hasExactKeys(candidate, ['schema', 'scope', 'capturedAt', 'selectedPageId', 'surface', 'source', 'session'])
      || candidate.schema !== WEBSITE_CLOSED_EDIT_SESSION_CONTRACT
      || !validScope(candidate.scope)
      || !validCapturedAt(candidate.capturedAt)
      || typeof candidate.selectedPageId !== 'string'
      || (candidate.surface !== 'work' && candidate.surface !== 'preview')
      || !isRecord(candidate.source)
      || !hasExactKeys(candidate.source, ['baseRevision', 'baseContentRevision', 'baseFingerprint'])) return null
    const session = restoreWebsiteEditSession(candidate.session)
    if (!session
      || candidate.source.baseRevision !== session.baseRevision
      || candidate.source.baseContentRevision !== session.baseContentRevision
      || candidate.source.baseFingerprint !== session.baseFingerprint
      || !session.workspace.pages.some((page) => page.id === candidate.selectedPageId)) return null
    return {
      schema: WEBSITE_CLOSED_EDIT_SESSION_CONTRACT,
      scope: candidate.scope,
      capturedAt: candidate.capturedAt,
      selectedPageId: candidate.selectedPageId,
      surface: candidate.surface,
      source: {
        baseRevision: session.baseRevision,
        baseContentRevision: session.baseContentRevision,
        baseFingerprint: session.baseFingerprint,
      },
      session,
    }
  } catch {
    return null
  }
}

export function websiteClosedEditSessionMatchesDraft(
  recovery: WebsiteClosedEditSession,
  scope: string,
  session: WebsiteEditSession,
) {
  const restoredRecovery = restoreWebsiteClosedEditSession(recovery)
  const restoredSession = restoreWebsiteEditSession(session)
  return Boolean(restoredRecovery
    && restoredSession
    && restoredRecovery.scope === scope
    && restoredRecovery.session.baseRevision === restoredSession.baseRevision
    && restoredRecovery.session.baseContentRevision === restoredSession.baseContentRevision
    && restoredRecovery.session.baseFingerprint === restoredSession.baseFingerprint
    && workspaceFingerprint(restoredRecovery.session.workspace) === workspaceFingerprint(restoredSession.workspace))
}

export function websiteClosedEditSessionsMatch(
  left: WebsiteClosedEditSession,
  right: WebsiteClosedEditSession,
) {
  const restoredLeft = restoreWebsiteClosedEditSession(left)
  const restoredRight = restoreWebsiteClosedEditSession(right)
  return Boolean(restoredLeft
    && restoredRight
    && restoredLeft.capturedAt === restoredRight.capturedAt
    && restoredLeft.selectedPageId === restoredRight.selectedPageId
    && restoredLeft.surface === restoredRight.surface
    && websiteClosedEditSessionMatchesDraft(restoredLeft, restoredRight.scope, restoredRight.session))
}

export function reviewWebsiteClosedEditSession(
  recovery: WebsiteClosedEditSession,
  scope: string,
  workspace: WebsiteWorkspace,
): WebsiteClosedEditSessionReview {
  const restored = restoreWebsiteClosedEditSession(recovery)
  if (!restored) return { ok: false, reason: 'invalid_recovery' }
  if (restored.scope !== scope) return { ok: false, reason: 'scope_changed' }
  if (!websiteEditSessionMatches(restored.session, workspace)) {
    return { ok: false, reason: 'saved_website_changed' }
  }
  if (workspaceFingerprint(restored.session.workspace) === workspaceFingerprint(workspace)) {
    return { ok: false, reason: 'no_changes' }
  }
  return {
    ok: true,
    session: restored.session,
    selectedPageId: restored.selectedPageId,
    surface: restored.surface,
  }
}
