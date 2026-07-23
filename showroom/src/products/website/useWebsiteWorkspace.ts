import { useCallback, useEffect, useRef, useState } from 'react'

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

export type StorageMode = 'browser-local' | 'session-only'

type InitialWorkspace = {
  workspace: WebsiteWorkspace
  storageMode: StorageMode
  storageIssue: string
}

type MutationOptions = {
  durable?: boolean
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

export function useWebsiteWorkspace(): {
  workspace: WebsiteWorkspace
  mutateWorkspace: (update: WebsiteWorkspaceUpdate, options?: MutationOptions) => Promise<WebsiteMutationResult>
  storageMode: StorageMode
  storageIssue: string
} {
  const [initialWorkspace] = useState(loadInitialWorkspace)
  const [workspace, setWorkspace] = useState(initialWorkspace.workspace)
  const [storageMode, setStorageMode] = useState<StorageMode>(initialWorkspace.storageMode)
  const [storageIssue, setStorageIssue] = useState(initialWorkspace.storageIssue)
  const workspaceRef = useRef(initialWorkspace.workspace)
  const storageModeRef = useRef(initialWorkspace.storageMode)
  const queueRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    workspaceRef.current = workspace
  }, [workspace])

  useEffect(() => {
    storageModeRef.current = storageMode
  }, [storageMode])

  useEffect(() => {
    if (typeof window === 'undefined') return

    function refreshFromStorage(event: StorageEvent) {
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
        const current = workspaceRef.current
        let result: WebsiteMutationResult

        if (storageModeRef.current === 'browser-local' && typeof window !== 'undefined') {
          result = await mutateWebsiteWorkspace(update, current.revision, current.contentRevision, window.localStorage)
        } else if (options.durable) {
          result = { ok: false, error: 'This accountable action requires confirmed browser storage. Draft edits can continue in this session.' }
        } else {
          result = applyWebsiteWorkspaceUpdate(current, update)
        }

        if (result.ok) {
          if (result.changed) {
            workspaceRef.current = result.workspace
            setWorkspace(result.workspace)
          }
          if (storageModeRef.current === 'browser-local') setStorageIssue('')
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

  return { workspace, mutateWorkspace, storageMode, storageIssue }
}
