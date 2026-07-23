import { useCallback, useEffect, useRef, useState } from 'react'

import {
  currentManagedIdentity,
  loadManagedBootstrap,
  managedTrialAuthConfigured,
  ManagedTrialError,
  saveManagedWebsiteCommand,
  type ManagedCommandEvidence,
  type ManagedWebsiteEvent,
} from '../../core/managed-trial'
import {
  WEBSITE_STORAGE_KEY,
  applyWebsiteWorkspaceUpdate,
  createInitialWorkspace,
  loadWebsiteWorkspace,
  mutateWebsiteWorkspace,
  restoreWorkspace,
  type WebsiteMutationResult,
  type WebsiteWorkspace,
  type WebsiteWorkspaceUpdate,
} from './website-model'

export type StorageMode = 'managed' | 'browser-local' | 'session-only'

type InitialWorkspace = {
  workspace: WebsiteWorkspace
  storageMode: StorageMode
  storageIssue: string
}

type MutationOptions = {
  durable?: boolean
}

type ManagedTransition = {
  eventType: Exclude<ManagedWebsiteEvent, 'website.workspace.initialized'>
  evidence: Omit<ManagedCommandEvidence, 'actor'>
}

function loadInitialWorkspace(): InitialWorkspace {
  if (typeof window === 'undefined') {
    return { workspace: createInitialWorkspace(), storageMode: 'session-only', storageIssue: '' }
  }

  try {
    const probeKey = WEBSITE_STORAGE_KEY + '.probe'
    window.localStorage.setItem(probeKey, '1')
    window.localStorage.removeItem(probeKey)
    const loaded = loadWebsiteWorkspace(window.localStorage)
    if (loaded.ok) return { workspace: loaded.workspace, storageMode: 'browser-local', storageIssue: '' }
    return {
      workspace: createInitialWorkspace(),
      storageMode: 'session-only',
      storageIssue: loaded.error,
    }
  } catch (error) {
    return {
      workspace: createInitialWorkspace(),
      storageMode: 'session-only',
      storageIssue: 'Browser storage is unavailable. Draft edits remain in this session only: '
        + (error instanceof Error ? error.message : 'unknown storage error'),
    }
  }
}

function commandId() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Secure command IDs are unavailable in this browser.')
  }
  return globalThis.crypto.randomUUID()
}

function accountableTransition(
  current: WebsiteWorkspace,
  next: WebsiteWorkspace,
  fallbackActionId: string,
): ManagedTransition | null {
  if (next.contentRevision === current.contentRevision + 1) {
    const capturedAt = new Date().toISOString()
    return {
      eventType: 'website.content.saved',
      evidence: {
        actionId: fallbackActionId,
        capturedAt,
        reason: 'Website draft content saved',
        evidenceReference: `website:content:${next.contentRevision}`,
      },
    }
  }
  if (next.evidence.length === current.evidence.length + 1) {
    const record = next.evidence[0]
    return {
      eventType: 'website.evidence.recorded',
      evidence: {
        actionId: record.id,
        capturedAt: record.verifiedAt,
        reason: record.finding,
        evidenceReference: record.reference,
      },
    }
  }
  if (next.approvals.length === current.approvals.length + 1) {
    const record = next.approvals[0]
    return {
      eventType: 'website.revision.approved',
      evidence: {
        actionId: record.id,
        capturedAt: record.approvedAt,
        reason: record.note,
        evidenceReference: record.evidenceIds.join(','),
      },
    }
  }
  if (next.localPublishes.length === current.localPublishes.length + 1) {
    const record = next.localPublishes[0]
    return {
      eventType: 'website.snapshot.recorded',
      evidence: {
        actionId: record.id,
        capturedAt: record.recordedAt,
        reason: 'Approved browser-local snapshot recorded',
        evidenceReference: record.approvalId ?? '',
      },
    }
  }
  if (next.selectedPageId !== current.selectedPageId) {
    const capturedAt = new Date().toISOString()
    return {
      eventType: 'website.selection.changed',
      evidence: {
        actionId: fallbackActionId,
        capturedAt,
        reason: 'Website page selection changed',
        evidenceReference: next.selectedPageId,
      },
    }
  }
  return null
}

function managedFailure(error: unknown) {
  if (error instanceof ManagedTrialError) return error.message
  return error instanceof Error ? error.message : 'unknown managed workspace error'
}

function bindManagedActor(current: WebsiteWorkspace, next: WebsiteWorkspace, actor: string): WebsiteWorkspace {
  if (next.evidence.length === current.evidence.length + 1) {
    return {
      ...next,
      evidence: [{ ...next.evidence[0], verifiedBy: actor }, ...next.evidence.slice(1)],
      events: [{ ...next.events[0], actor }, ...next.events.slice(1)],
    }
  }
  if (next.approvals.length === current.approvals.length + 1) {
    return {
      ...next,
      approvals: [{ ...next.approvals[0], reviewer: actor }, ...next.approvals.slice(1)],
      events: [{ ...next.events[0], actor }, ...next.events.slice(1)],
    }
  }
  if (next.localPublishes.length === current.localPublishes.length + 1) {
    return {
      ...next,
      localPublishes: [{ ...next.localPublishes[0], recordedBy: actor }, ...next.localPublishes.slice(1)],
      events: [{ ...next.events[0], actor }, ...next.events.slice(1)],
    }
  }
  return next
}

export function useWebsiteWorkspace(): {
  workspace: WebsiteWorkspace
  mutateWorkspace: (update: WebsiteWorkspaceUpdate, options?: MutationOptions) => Promise<WebsiteMutationResult>
  storageMode: StorageMode
  storageIssue: string
  managedActorId: string
} {
  const [initialWorkspace] = useState(loadInitialWorkspace)
  const [workspace, setWorkspace] = useState(initialWorkspace.workspace)
  const [storageMode, setStorageMode] = useState<StorageMode>(initialWorkspace.storageMode)
  const [storageIssue, setStorageIssue] = useState(initialWorkspace.storageIssue)
  const [managedActorId, setManagedActorId] = useState('')
  const workspaceRef = useRef(initialWorkspace.workspace)
  const storageModeRef = useRef(initialWorkspace.storageMode)
  const managedVersionRef = useRef(0)
  const managedActorRef = useRef('')
  const hydratedRef = useRef(false)
  const queueRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    workspaceRef.current = workspace
  }, [workspace])

  useEffect(() => {
    storageModeRef.current = storageMode
  }, [storageMode])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (!managedTrialAuthConfigured()) return
        const identity = await currentManagedIdentity()
        if (!identity || !active) return
        let bootstrap = await loadManagedBootstrap()
        if (!active) return
        const record = bootstrap.states.website
        let managedWorkspace: WebsiteWorkspace
        let managedVersion = record.version
        if (record.version === 0 && Object.keys(record.state).length === 0) {
          const seed = createInitialWorkspace()
          const initializationId = commandId()
          const capturedAt = new Date().toISOString()
          try {
            const initialized = await saveManagedWebsiteCommand({
              commandId: initializationId,
              eventType: 'website.workspace.initialized',
              expectedVersion: 0,
              evidence: {
                actionId: initializationId,
                capturedAt,
                actor: bootstrap.identity.actor_id,
                reason: 'Initialize managed Website workspace',
                evidenceReference: 'website:revision:0',
              },
              state: seed,
            })
            const restored = restoreWorkspace(initialized.state)
            if (!restored) throw new Error('Managed Website initialization returned invalid state.')
            managedWorkspace = restored
            managedVersion = initialized.version
          } catch (error) {
            if (!(error instanceof ManagedTrialError) || error.code !== 'trial_version_conflict') throw error
            bootstrap = await loadManagedBootstrap()
            const concurrent = bootstrap.states.website
            const restored = restoreWorkspace(concurrent.state)
            if (!restored || concurrent.version < 1) throw new Error('Concurrent Website initialization returned invalid state.')
            managedWorkspace = restored
            managedVersion = concurrent.version
          }
        } else {
          const restored = restoreWorkspace(record.state)
          if (!restored) throw new Error('Managed Website state failed the client integrity check.')
          managedWorkspace = restored
        }
        if (!active) return
        managedActorRef.current = bootstrap.identity.actor_id
        setManagedActorId(bootstrap.identity.actor_id)
        managedVersionRef.current = managedVersion
        workspaceRef.current = managedWorkspace
        setWorkspace(managedWorkspace)
        storageModeRef.current = 'managed'
        setStorageMode('managed')
        setStorageIssue('')
      } catch (error) {
        if (!active) return
        storageModeRef.current = 'session-only'
        setStorageMode('session-only')
        setStorageIssue(`Managed Website could not be loaded; the current screen is preserved and durable writes are paused: ${managedFailure(error)}`)
      } finally {
        hydratedRef.current = true
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    function refreshFromStorage(event: StorageEvent) {
      if (storageModeRef.current !== 'browser-local') return
      if (event.storageArea !== window.localStorage || event.key !== WEBSITE_STORAGE_KEY) return
      if (event.newValue === null) {
        setStorageIssue('Website storage was removed in another tab. The current screen was preserved and local writes are paused.')
        storageModeRef.current = 'session-only'
        setStorageMode('session-only')
        return
      }
      try {
        const restored = restoreWorkspace(JSON.parse(event.newValue) as unknown)
        if (!restored || restored.schema !== 'supermega.website.workspace.v2') {
          setStorageIssue('Another tab supplied invalid Website data. The current valid screen was preserved.')
          return
        }
        workspaceRef.current = restored
        setWorkspace(restored)
        storageModeRef.current = 'browser-local'
        setStorageMode('browser-local')
        setStorageIssue('Website workspace refreshed from another tab.')
      } catch {
        setStorageIssue('Another tab supplied malformed Website data. The current valid screen was preserved.')
      }
    }

    window.addEventListener('storage', refreshFromStorage)
    return () => window.removeEventListener('storage', refreshFromStorage)
  }, [])

  const mutateWorkspace = useCallback((update: WebsiteWorkspaceUpdate, options: MutationOptions = {}) => (
    new Promise<WebsiteMutationResult>((resolve) => {
      queueRef.current = queueRef.current.then(async () => {
        if (!hydratedRef.current) {
          resolve({ ok: false, error: 'Website workspace is still loading. Try the change again.' })
          return
        }
        const current = workspaceRef.current
        let result: WebsiteMutationResult

        if (storageModeRef.current === 'managed') {
          const transitioned = applyWebsiteWorkspaceUpdate(current, update)
          if (!transitioned.ok || !transitioned.changed) {
            resolve(transitioned)
            return
          }
          try {
            const id = commandId()
            const managedWorkspace = bindManagedActor(current, transitioned.workspace, managedActorRef.current)
            const transition = accountableTransition(current, managedWorkspace, id)
            if (!transition) throw new Error('Website change does not match a supported managed event.')
            const saved = await saveManagedWebsiteCommand({
              commandId: id,
              eventType: transition.eventType,
              expectedVersion: managedVersionRef.current,
              evidence: { ...transition.evidence, actor: managedActorRef.current },
              state: managedWorkspace,
            })
            const confirmed = restoreWorkspace(saved.state)
            if (!confirmed) throw new Error('Managed Website confirmation failed its client integrity check.')
            managedVersionRef.current = saved.version
            result = { ok: true, changed: true, workspace: confirmed }
          } catch (error) {
            if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
              try {
                const bootstrap = await loadManagedBootstrap()
                const record = bootstrap.states.website
                const refreshed = restoreWorkspace(record.state)
                if (!refreshed) throw new Error('The newer managed Website state is invalid.')
                managedActorRef.current = bootstrap.identity.actor_id
                setManagedActorId(bootstrap.identity.actor_id)
                managedVersionRef.current = record.version
                workspaceRef.current = refreshed
                setWorkspace(refreshed)
                setStorageIssue('Website changed in another session. The managed workspace was refreshed; review before retrying.')
                resolve({ ok: false, error: 'Website changed in another session. Review the refreshed workspace before retrying.' })
                return
              } catch (refreshError) {
                result = { ok: false, error: `Managed Website refresh failed: ${managedFailure(refreshError)}` }
              }
            } else {
              result = { ok: false, error: `Managed Website write failed: ${managedFailure(error)}` }
            }
          }
        } else if (storageModeRef.current === 'browser-local' && typeof window !== 'undefined') {
          result = await mutateWebsiteWorkspace(update, current.revision, current.contentRevision, window.localStorage)
        } else if (options.durable) {
          result = { ok: false, error: 'This accountable action requires managed or confirmed browser storage. Draft edits can continue in this session.' }
        } else {
          result = applyWebsiteWorkspaceUpdate(current, update)
        }

        if (result.ok) {
          if (result.changed) {
            workspaceRef.current = result.workspace
            setWorkspace(result.workspace)
          }
          if (storageModeRef.current !== 'session-only') setStorageIssue('')
        } else {
          setStorageIssue(result.error)
        }
        resolve(result)
      }).catch((error: unknown) => {
        const message = 'Website update queue failed: ' + (error instanceof Error ? error.message : 'unknown error')
        setStorageIssue(message)
        resolve({ ok: false, error: message })
      })
    })
  ), [])

  return { workspace, mutateWorkspace, storageMode, storageIssue, managedActorId }
}
