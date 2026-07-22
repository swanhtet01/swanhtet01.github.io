import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'

import {
  WEBSITE_STORAGE_KEY,
  createInitialWorkspace,
  restoreWorkspace,
  type WebsiteWorkspace,
} from './website-model'

export type StorageMode = 'browser-local' | 'session-only'

type StoredWorkspace = {
  workspace: WebsiteWorkspace
  storageMode: StorageMode
}

function loadWorkspace(): StoredWorkspace {
  if (typeof window === 'undefined') {
    return {
      workspace: createInitialWorkspace(),
      storageMode: 'session-only',
    }
  }

  try {
    const probeKey = WEBSITE_STORAGE_KEY + '.probe'
    window.localStorage.setItem(probeKey, '1')
    window.localStorage.removeItem(probeKey)
    const stored = window.localStorage.getItem(WEBSITE_STORAGE_KEY)
    return {
      workspace: stored ? restoreWorkspace(JSON.parse(stored) as unknown) : createInitialWorkspace(),
      storageMode: 'browser-local',
    }
  } catch {
    return {
      workspace: createInitialWorkspace(),
      storageMode: 'session-only',
    }
  }
}

export function useWebsiteWorkspace(): {
  workspace: WebsiteWorkspace
  setWorkspace: Dispatch<SetStateAction<WebsiteWorkspace>>
  storageMode: StorageMode
} {
  const [initialWorkspace] = useState(loadWorkspace)
  const [workspace, setWorkspace] = useState(initialWorkspace.workspace)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(WEBSITE_STORAGE_KEY, JSON.stringify(workspace))
    } catch {
      // The in-memory workspace remains usable if browser storage becomes unavailable.
    }
  }, [workspace])

  return { workspace, setWorkspace, storageMode: initialWorkspace.storageMode }
}
