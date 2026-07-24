import { useCallback, useEffect, useRef, useState } from 'react'

import {
  currentManagedIdentity,
  loadManagedBootstrap,
  managedTrialAuthConfigured,
  ManagedTrialError,
  requireManagedSurfaceState,
  saveManagedWebsiteCommand,
  type ManagedCommandEvidence,
  type ManagedIdentity,
  type ManagedWebsiteEvent,
} from '../../core/managed-trial'
import {
  acceptManagedWebsiteCommand,
  sameManagedWebsiteIdentity,
} from './managed-website'
import {
  LEGACY_WEBSITE_STORAGE_KEY,
  WEBSITE_STORAGE_KEY,
  applyWebsiteWorkspaceUpdate,
  createInitialWorkspace,
  loadWebsiteWorkspace,
  mutateWebsiteWorkspace,
  repairInvalidWebsiteWorkspace,
  restoreWorkspace,
  type WebsiteInvalidLocalCandidate,
  type WebsiteLocalRepairResult,
  type WebsiteMutationResult,
  type WebsiteWorkspace,
  type WebsiteWorkspaceUpdate,
} from './website-model'

export type StorageMode = 'managed' | 'browser-local' | 'session-only'

type InitialWorkspace = {
  workspace: WebsiteWorkspace
  storageMode: StorageMode
  storageIssue: string
  invalidCandidate: WebsiteInvalidLocalCandidate | null
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
    return { workspace: createInitialWorkspace(), storageMode: 'session-only', storageIssue: '', invalidCandidate: null }
  }

  try {
    const probeKey = WEBSITE_STORAGE_KEY + '.probe'
    window.localStorage.setItem(probeKey, '1')
    window.localStorage.removeItem(probeKey)
    const loaded = loadWebsiteWorkspace(window.localStorage)
    if (loaded.ok) return { workspace: loaded.workspace, storageMode: 'browser-local', storageIssue: '', invalidCandidate: null }
    const currentRaw = window.localStorage.getItem(WEBSITE_STORAGE_KEY)
    const legacyRaw = currentRaw === null ? window.localStorage.getItem(LEGACY_WEBSITE_STORAGE_KEY) : null
    const invalidCandidate: WebsiteInvalidLocalCandidate | null = currentRaw !== null
      ? { source: 'v2', sourceKey: WEBSITE_STORAGE_KEY, expectedRaw: currentRaw, observedAt: new Date().toISOString() }
      : legacyRaw !== null
        ? { source: 'v1', sourceKey: LEGACY_WEBSITE_STORAGE_KEY, expectedRaw: legacyRaw, observedAt: new Date().toISOString() }
        : null
    return {
      workspace: createInitialWorkspace(),
      storageMode: 'session-only',
      storageIssue: loaded.error,
      invalidCandidate,
    }
  } catch (error) {
    return {
      workspace: createInitialWorkspace(),
      storageMode: 'session-only',
      storageIssue: 'Browser storage is unavailable. Draft edits remain in this session only: '
        + (error instanceof Error ? error.message : 'unknown storage error'),
      invalidCandidate: null,
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

async function requireCurrentManagedIdentity(expected: ManagedIdentity) {
  const current = await currentManagedIdentity()
  if (!current || !sameManagedWebsiteIdentity(current, expected)) {
    throw new ManagedTrialError('The managed Website identity changed. Reload before continuing.', {
      code: 'managed_identity_changed',
    })
  }
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
  repairLocalWorkspace: () => Promise<WebsiteLocalRepairResult>
  canRepairLocalStorage: boolean
  repairCandidateRevision: number
  storageMode: StorageMode
  storageIssue: string
  managedActorId: string
} {
  const [initialWorkspace] = useState(loadInitialWorkspace)
  const [workspace, setWorkspace] = useState(initialWorkspace.workspace)
  const [storageMode, setStorageMode] = useState<StorageMode>(initialWorkspace.storageMode)
  const [storageIssue, setStorageIssue] = useState(initialWorkspace.storageIssue)
  const [managedActorId, setManagedActorId] = useState('')
  const [repairAvailable, setRepairAvailable] = useState(Boolean(initialWorkspace.invalidCandidate))
  const [repairCandidateRevision, setRepairCandidateRevision] = useState(initialWorkspace.invalidCandidate ? 1 : 0)
  const invalidCandidateRef = useRef<WebsiteInvalidLocalCandidate | null>(initialWorkspace.invalidCandidate)
  const repairCandidateRevisionRef = useRef(initialWorkspace.invalidCandidate ? 1 : 0)
  const workspaceRef = useRef(initialWorkspace.workspace)
  const storageModeRef = useRef(initialWorkspace.storageMode)
  const managedVersionRef = useRef(0)
  const managedIdentityRef = useRef<ManagedIdentity | null>(null)
  const hydratedRef = useRef(false)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const updateRepairCandidate = useCallback((candidate: WebsiteInvalidLocalCandidate | null) => {
    const current = invalidCandidateRef.current
    const changed = current?.sourceKey !== candidate?.sourceKey
      || current?.expectedRaw !== candidate?.expectedRaw
    invalidCandidateRef.current = candidate
    setRepairAvailable(Boolean(candidate))
    if (changed) {
      repairCandidateRevisionRef.current += 1
      setRepairCandidateRevision(repairCandidateRevisionRef.current)
    }
  }, [])

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
        let bootstrap = await loadManagedBootstrap(identity)
        if (!active) return
        const record = requireManagedSurfaceState(bootstrap, 'website', 'Website')
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
              identity,
              evidence: {
                actionId: initializationId,
                capturedAt,
                actor: bootstrap.identity.actor_id,
                reason: 'Initialize managed Website workspace',
                evidenceReference: 'website:revision:0',
              },
              state: seed,
            })
            const accepted = acceptManagedWebsiteCommand(seed, initialized, {
              commandId: initializationId,
              eventType: 'website.workspace.initialized',
              priorVersion: 0,
            })
            managedWorkspace = accepted.workspace
            managedVersion = accepted.version
          } catch (error) {
            if (!(error instanceof ManagedTrialError) || error.code !== 'trial_version_conflict') throw error
            bootstrap = await loadManagedBootstrap(identity)
            const concurrent = requireManagedSurfaceState(bootstrap, 'website', 'Website')
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
        await requireCurrentManagedIdentity(identity)
        if (!active) return
        managedIdentityRef.current = identity
        setManagedActorId(bootstrap.identity.actor_id)
        managedVersionRef.current = managedVersion
        workspaceRef.current = managedWorkspace
        setWorkspace(managedWorkspace)
        storageModeRef.current = 'managed'
        setStorageMode('managed')
        updateRepairCandidate(null)
        setStorageIssue('')
      } catch (error) {
        if (!active) return
        storageModeRef.current = 'session-only'
        setStorageMode('session-only')
        if (error instanceof ManagedTrialError && error.code === 'trial_capability_required') {
          const hiddenLocalWorkspace = createInitialWorkspace()
          managedIdentityRef.current = null
          managedVersionRef.current = 0
          setManagedActorId('')
          workspaceRef.current = hiddenLocalWorkspace
          setWorkspace(hiddenLocalWorkspace)
          updateRepairCandidate(null)
          setStorageIssue(`${managedFailure(error)} Browser-local Website content is hidden while this managed account is connected.`)
          return
        }
        setStorageIssue(`Managed Website could not be loaded; the current screen is preserved and durable writes are paused: ${managedFailure(error)}`)
      } finally {
        hydratedRef.current = true
      }
    })()
    return () => { active = false }
  }, [updateRepairCandidate])

  useEffect(() => {
    if (typeof window === 'undefined') return

    function refreshFromStorage(event: StorageEvent) {
      if (storageModeRef.current !== 'browser-local' && invalidCandidateRef.current === null) return
      if (event.storageArea !== window.localStorage || event.key !== WEBSITE_STORAGE_KEY) return
      if (event.newValue === null) {
        setStorageIssue('Website storage was removed in another tab. The current screen was preserved and local writes are paused.')
        updateRepairCandidate(null)
        storageModeRef.current = 'session-only'
        setStorageMode('session-only')
        return
      }
      try {
        const restored = restoreWorkspace(JSON.parse(event.newValue) as unknown)
        if (!restored || restored.schema !== 'supermega.website.workspace.v2') {
          setStorageIssue('Another tab supplied invalid Website data. The current valid screen was preserved.')
          updateRepairCandidate({
            source: 'v2',
            sourceKey: WEBSITE_STORAGE_KEY,
            expectedRaw: event.newValue,
            observedAt: new Date().toISOString(),
          })
          storageModeRef.current = 'session-only'
          setStorageMode('session-only')
          return
        }
        workspaceRef.current = restored
        setWorkspace(restored)
        storageModeRef.current = 'browser-local'
        setStorageMode('browser-local')
        updateRepairCandidate(null)
        setStorageIssue('Website workspace refreshed from another tab.')
      } catch {
        setStorageIssue('Another tab supplied malformed Website data. The current valid screen was preserved.')
        updateRepairCandidate({
          source: 'v2',
          sourceKey: WEBSITE_STORAGE_KEY,
          expectedRaw: event.newValue,
          observedAt: new Date().toISOString(),
        })
        storageModeRef.current = 'session-only'
        setStorageMode('session-only')
      }
    }

    window.addEventListener('storage', refreshFromStorage)
    return () => window.removeEventListener('storage', refreshFromStorage)
  }, [updateRepairCandidate])

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
          const managedIdentity = managedIdentityRef.current
          if (!managedIdentity) {
            resolve({ ok: false, error: 'Managed Website identity is unavailable. Reload before continuing.' })
            return
          }
          const transitioned = applyWebsiteWorkspaceUpdate(current, update)
          if (!transitioned.ok) {
            resolve(transitioned)
            return
          }
          if (!transitioned.changed) {
            try {
              await requireCurrentManagedIdentity(managedIdentity)
              resolve(transitioned)
            } catch (error) {
              resolve({ ok: false, error: `Managed Website identity check failed: ${managedFailure(error)}` })
            }
            return
          }
          try {
            const id = commandId()
            const managedWorkspace = bindManagedActor(current, transitioned.workspace, managedIdentity.userId)
            const transition = accountableTransition(current, managedWorkspace, id)
            if (!transition) throw new Error('Website change does not match a supported managed event.')
            const priorVersion = managedVersionRef.current
            const saved = await saveManagedWebsiteCommand({
              commandId: id,
              eventType: transition.eventType,
              expectedVersion: priorVersion,
              identity: managedIdentity,
              evidence: { ...transition.evidence, actor: managedIdentity.userId },
              state: managedWorkspace,
            })
            const accepted = acceptManagedWebsiteCommand(managedWorkspace, saved, {
              commandId: id,
              eventType: transition.eventType,
              priorVersion,
            })
            await requireCurrentManagedIdentity(managedIdentity)
            managedVersionRef.current = accepted.version
            result = { ok: true, changed: true, workspace: accepted.workspace }
          } catch (error) {
            if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
              try {
                const bootstrap = await loadManagedBootstrap(managedIdentity)
                await requireCurrentManagedIdentity(managedIdentity)
                const record = requireManagedSurfaceState(bootstrap, 'website', 'Website')
                const refreshed = restoreWorkspace(record.state)
                if (!refreshed) throw new Error('The newer managed Website state is invalid.')
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

  const repairLocalWorkspace = useCallback(() => (
    new Promise<WebsiteLocalRepairResult>((resolve) => {
      queueRef.current = queueRef.current.then(async () => {
        const fail = (
          code: Extract<WebsiteLocalRepairResult, { ok: false }>['code'],
          error: string,
        ): WebsiteLocalRepairResult => ({
          ok: false,
          code,
          error,
          archiveConfirmed: false,
          replacementConfirmed: false,
        })
        if (!hydratedRef.current) {
          resolve(fail('stale_candidate', 'Website workspace is still loading. Nothing was replaced.'))
          return
        }
        if (storageModeRef.current === 'managed') {
          resolve(fail('stale_candidate', 'Managed Website data cannot be repaired through browser storage.'))
          return
        }
        const candidate = invalidCandidateRef.current
        if (!candidate) {
          resolve(fail('not_invalid', 'No invalid local Website value is available to repair.'))
          return
        }
        if (typeof window === 'undefined') {
          resolve(fail('storage_unavailable', 'Browser storage is unavailable. Nothing was replaced.'))
          return
        }
        const result = await repairInvalidWebsiteWorkspace(
          candidate,
          workspaceRef.current,
          window.localStorage,
          window.navigator.locks,
        )
        if (result.ok) {
          workspaceRef.current = result.workspace
          setWorkspace(result.workspace)
          updateRepairCandidate(null)
          storageModeRef.current = 'browser-local'
          setStorageMode('browser-local')
          setStorageIssue('')
        } else {
          storageModeRef.current = 'session-only'
          setStorageMode('session-only')
          setStorageIssue(result.error)
        }
        resolve(result)
      }).catch((error: unknown) => {
        const message = `Website repair queue failed: ${error instanceof Error ? error.message : 'unknown error'}`
        storageModeRef.current = 'session-only'
        setStorageMode('session-only')
        setStorageIssue(message)
        resolve({
          ok: false,
          code: 'storage_unavailable',
          error: message,
          archiveConfirmed: false,
          replacementConfirmed: false,
        })
      })
    })
  ), [updateRepairCandidate])

  return {
    workspace,
    mutateWorkspace,
    repairLocalWorkspace,
    canRepairLocalStorage: storageMode !== 'managed' && repairAvailable,
    repairCandidateRevision,
    storageMode,
    storageIssue,
    managedActorId,
  }
}
