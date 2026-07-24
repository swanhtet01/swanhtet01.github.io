import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ContentWorkspace } from './ContentWorkspace'
import { NavigationWorkspace } from './NavigationWorkspace'
import { PublishWorkspace } from './PublishWorkspace'
import { SitePreview } from './SitePreview'
import { useWebsiteWorkspace } from './useWebsiteWorkspace'
import { createWebsiteHtmlDownload } from './website-export'
import {
  approveWebsiteRevision,
  commitWebsiteEditSession,
  createBlankPage,
  createWebsiteEditSession,
  createId,
  deleteWebsiteRecoveryArchive,
  duplicatePage,
  getCurrentApproval,
  getCurrentPublish,
  LEGACY_WEBSITE_STORAGE_KEY,
  listWebsiteRecoveryArchives,
  MAX_WEBSITE_PAGES,
  previewDevices,
  readinessChecks,
  readWebsiteRecoveryArchive,
  recordWebsiteEvidence,
  recordWebsiteSnapshot,
  restoreWebsiteEditSession,
  updateWebsiteEditSession,
  WEBSITE_EDIT_SESSION_KEY,
  websiteEditSessionMatches,
  workspaceFingerprint,
  type EvidenceKind,
  type PreviewDevice,
  type WebsiteEditSession,
  type WebsitePage,
  type WebsiteRecoveryArchiveSummary,
  type WebsiteWorkspaceUpdate,
} from './website-model'
import './website-product.css'

type WebsiteView = 'content' | 'publish'

type WebsiteEditSessionState = {
  scope: string
  session: WebsiteEditSession
}

const DEFAULT_NOTICE = 'Website workspace loaded. No website has been deployed.'

const viewCopy: Record<WebsiteView, { title: string; copy: string }> = {
  content: {
    title: 'Edit page',
    copy: 'Edit one section, preview it, then save or discard.',
  },
  publish: {
    title: 'Review and save',
    copy: 'Check the saved revision, approve it, then download the site file.',
  },
}

function formatRecoveryDate(value: string) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 'Saved recovery' : new Date(timestamp).toLocaleString()
}

function editSessionStorageKey(scope: string) {
  return `${WEBSITE_EDIT_SESSION_KEY}.${encodeURIComponent(scope)}`
}

export function WebsiteProduct() {
  const {
    workspace,
    mutateWorkspace,
    repairLocalWorkspace,
    canRepairLocalStorage,
    repairCandidateRevision,
    storageMode,
    storageIssue,
    managedActorId,
  } = useWebsiteWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view')
  const view: WebsiteView = requestedView === 'publish' ? 'publish' : 'content'
  const [surface, setSurface] = useState<'work' | 'preview'>('work')
  const [selectedPageId, setSelectedPageId] = useState(workspace.selectedPageId)
  const [siteSettingsOpen, setSiteSettingsOpen] = useState(false)
  const [editSessionState, setEditSessionState] = useState<WebsiteEditSessionState | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [repairConfirmationRevision, setRepairConfirmationRevision] = useState<number | null>(null)
  const [repairing, setRepairing] = useState(false)
  const [repairArchiveKey, setRepairArchiveKey] = useState('')
  const [recoveryArchives, setRecoveryArchives] = useState<WebsiteRecoveryArchiveSummary[]>(() => (
    typeof window === 'undefined' ? [] : listWebsiteRecoveryArchives(window.localStorage)
  ))
  const [recoveryDeleteCandidate, setRecoveryDeleteCandidate] = useState('')
  const [headingFocusRequest, setHeadingFocusRequest] = useState(0)
  const [recoveryFocusRequest, setRecoveryFocusRequest] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const recoveryPrimaryActionRef = useRef<HTMLButtonElement>(null)
  const editSessionRef = useRef<WebsiteEditSessionState | null>(null)
  const [device, setDevice] = useState<PreviewDevice>(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches ? 'mobile' : 'desktop'
  ))
  const [notice, setNotice] = useState(DEFAULT_NOTICE)
  const [deleteCandidateId, setDeleteCandidateId] = useState('')
  const editSessionScope = storageMode === 'managed'
    ? managedActorId ? `managed:${managedActorId}` : ''
    : storageMode
  const activeEditSession = editSessionState?.scope === editSessionScope ? editSessionState.session : null
  const editorWorkspace = activeEditSession?.workspace ?? workspace
  const selectedPage = editorWorkspace.pages.find((page) => page.id === selectedPageId)
    ?? editorWorkspace.pages.find((page) => page.id === editorWorkspace.selectedPageId)
    ?? editorWorkspace.pages[0]
  const hasUnsavedChanges = Boolean(activeEditSession)
  const editConflict = Boolean(activeEditSession && !websiteEditSessionMatches(activeEditSession, workspace))
  const fingerprint = workspaceFingerprint(workspace)
  const checks = readinessChecks(workspace, fingerprint)
  const approval = getCurrentApproval(workspace)
  const publish = getCurrentPublish(workspace)
  const approvalIsCurrent = Boolean(approval)
  const publishIsCurrent = Boolean(publish)
  const activeViewCopy = view === 'content' && surface === 'preview'
    ? {
        title: hasUnsavedChanges ? 'Preview unsaved changes' : 'Preview page',
        copy: hasUnsavedChanges
          ? 'This preview is not saved yet. Return to edit, then save or discard it.'
          : 'Check the selected page at desktop, tablet, or mobile size.',
      }
    : viewCopy[view]
  const savedStateNotice = storageMode === 'managed'
    ? 'Changes are saved to this managed workspace. Nothing has been deployed.'
    : storageMode === 'browser-local'
      ? 'Changes are saved on this device. Nothing has been deployed.'
      : 'Changes last for this session only. Nothing has been deployed.'
  const saveStateLabel = editConflict
    ? 'Saved version changed'
    : hasUnsavedChanges
      ? 'Unsaved preview'
      : storageMode === 'managed'
        ? 'Saved to workspace'
        : storageMode === 'browser-local'
          ? 'Saved on this device'
          : 'Session only'
  const visiblePageCount = editorWorkspace.pages.filter((page) => page.navigation.visible).length
  const statusNotice = editConflict
    ? 'The saved Website changed after this edit session started. Your preview is preserved, but it cannot overwrite the newer version. Discard it and review the saved workspace.'
    : storageIssue || (notice === DEFAULT_NOTICE ? savedStateNotice : notice)
  const noticePriority = editConflict || storageIssue ? 'error' : notice === DEFAULT_NOTICE ? 'routine' : 'update'
  const repairArmed = canRepairLocalStorage
    && repairCandidateRevision > 0
    && repairConfirmationRevision === repairCandidateRevision

  useEffect(() => {
    document.title = 'Website | SuperMega'
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    if (requestedView === null || requestedView === 'publish') return
    const next = new URLSearchParams(searchParams)
    next.delete('view')
    setSearchParams(next, { replace: true })
  }, [requestedView, searchParams, setSearchParams])

  useEffect(() => {
    if (typeof window === 'undefined' || !editSessionScope) return
    if (editSessionRef.current?.scope === editSessionScope) return
    const restoreTimer = window.setTimeout(() => {
      if (editSessionRef.current?.scope === editSessionScope) return
      const storageKey = editSessionStorageKey(editSessionScope)
      try {
        const raw = window.sessionStorage.getItem(storageKey)
        const restored = raw ? restoreWebsiteEditSession(raw) : null
        const next = restored ? { scope: editSessionScope, session: restored } : null
        if (raw && !restored) window.sessionStorage.removeItem(storageKey)
        editSessionRef.current = next
        setEditSessionState(next)
      } catch {
        editSessionRef.current = null
        setEditSessionState(null)
      }
    }, 0)
    return () => window.clearTimeout(restoreTimer)
  }, [editSessionScope])

  useEffect(() => {
    if (view !== 'publish' || !hasUnsavedChanges) return
    const next = new URLSearchParams(searchParams)
    next.delete('view')
    setSearchParams(next, { replace: true })
  }, [hasUnsavedChanges, searchParams, setSearchParams, view])

  useEffect(() => {
    if (headingFocusRequest > 0) headingRef.current?.focus()
  }, [headingFocusRequest])

  useEffect(() => {
    if (recoveryFocusRequest > 0) recoveryPrimaryActionRef.current?.focus()
  }, [recoveryFocusRequest])

  function requestHeadingFocus() {
    setHeadingFocusRequest((current) => current + 1)
  }

  function requestRecoveryFocus() {
    setRecoveryFocusRequest((current) => current + 1)
  }

  function refreshRecoveryArchives() {
    setRecoveryArchives(listWebsiteRecoveryArchives(window.localStorage))
  }

  function openWorkspaceView(nextView: WebsiteView) {
    if (nextView === 'publish' && hasUnsavedChanges) {
      setNotice('Save or discard the unsaved Website preview before reviewing release evidence.')
      return
    }
    const next = new URLSearchParams(searchParams)
    if (nextView === 'publish') next.set('view', 'publish')
    else next.delete('view')
    setSearchParams(next)
    setSurface('work')
    setSiteSettingsOpen(false)
    requestHeadingFocus()
  }

  function openContentSurface(nextSurface: 'work' | 'preview') {
    setSurface(nextSurface)
    setSiteSettingsOpen(false)
    requestHeadingFocus()
  }

  async function commitWorkspace(update: WebsiteWorkspaceUpdate, success = '', durable = false) {
    const result = await mutateWorkspace(update, { durable })
    if (!result.ok) {
      setNotice(result.error)
      return result
    }
    if (result.changed && success) setNotice(success)
    return result
  }

  function replaceEditSession(next: WebsiteEditSessionState | null) {
    editSessionRef.current = next
    setEditSessionState(next)
  }

  function persistEditSession(next: WebsiteEditSessionState) {
    try {
      window.sessionStorage.setItem(editSessionStorageKey(next.scope), JSON.stringify(next.session))
    } catch {
      setNotice('The unsaved preview is held in this tab only. Browser draft recovery is unavailable, but Save and Discard still work.')
    }
  }

  function clearEditSession(target = editSessionRef.current) {
    if (target) {
      try {
        window.sessionStorage.removeItem(editSessionStorageKey(target.scope))
      } catch {
        // The in-memory edit session can still be cleared safely.
      }
    }
    replaceEditSession(null)
  }

  function stageWorkspace(update: WebsiteWorkspaceUpdate) {
    if (savingDraft) {
      setNotice('Website Save is still being confirmed. Wait for it to finish before making another change.')
      return null
    }
    if (!editSessionScope) {
      setNotice('Website workspace is still loading. Try the edit again.')
      return null
    }
    const retained = editSessionRef.current
    if (retained && retained.scope !== editSessionScope) {
      setNotice('Website workspace identity changed. Review the loaded workspace before editing.')
      return null
    }
    const base = retained?.session ?? createWebsiteEditSession(workspace)
    if (!websiteEditSessionMatches(base, workspace)) {
      setNotice('The saved Website changed after this edit session started. Discard the preview before making more changes.')
      return null
    }
    const result = updateWebsiteEditSession(base, update)
    if (!result.ok) {
      setNotice(result.error)
      return null
    }
    if (!result.changed) return retained?.session ?? null
    const next = { scope: editSessionScope, session: result.session }
    replaceEditSession(next)
    persistEditSession(next)
    return result.session
  }

  async function saveDraft() {
    const retained = editSessionRef.current
    if (!retained || retained.scope !== editSessionScope) return
    if (!websiteEditSessionMatches(retained.session, workspace)) {
      setNotice('This preview started from an older saved version. Nothing was overwritten; discard it and review the newer Website.')
      return
    }
    setSavingDraft(true)
    const result = await commitWorkspace(
      (current) => commitWebsiteEditSession(current, retained.session),
      '',
    )
    setSavingDraft(false)
    if (!result.ok) return
    if (editSessionRef.current === retained) clearEditSession(retained)
    setNotice(result.changed
      ? `Website saved once as content revision ${result.workspace.contentRevision}. Nothing was deployed.`
      : 'The preview already matched the saved Website. No revision was added.')
  }

  function discardDraft() {
    if (!activeEditSession || savingDraft) return
    clearEditSession()
    setDeleteCandidateId('')
    setNotice('Unsaved Website changes discarded. The saved workspace was not changed.')
  }

  function requireSavedWorkspace(action: string) {
    if (!hasUnsavedChanges) return true
    setNotice(`Save or discard the unsaved Website preview before ${action}.`)
    return false
  }

  function selectPage(pageId: string) {
    if (!editorWorkspace.pages.some((page) => page.id === pageId)) {
      setNotice('That page is no longer available. The current page was preserved.')
      return false
    }
    setSelectedPageId(pageId)
    setDeleteCandidateId('')
    setNotice(DEFAULT_NOTICE)
    return true
  }

  function previewPage(pageId = selectedPage.id) {
    if (pageId !== selectedPage.id && !selectPage(pageId)) return
    openContentSurface('preview')
  }

  async function repairLocalData() {
    if (!requireSavedWorkspace('repairing local Website data')) return
    setRepairing(true)
    const result = await repairLocalWorkspace()
    setRepairing(false)
    setRepairConfirmationRevision(null)
    if (result.ok) {
      setRepairArchiveKey(result.archiveKey)
      const cleanupNotice = result.legacyCleanup === 'retained'
        ? ' The old Website storage key could not be removed; it remains on this device and should be reviewed in Recovery archives.'
        : ''
      setNotice(`Website data repaired and confirmed. The previous unreadable value is archived in this browser as ${result.archiveKey}.${cleanupNotice} No deployment occurred.`)
    } else if (result.archiveConfirmed && result.archiveKey) {
      setRepairArchiveKey(result.archiveKey)
    }
    refreshRecoveryArchives()
    requestRecoveryFocus()
  }

  function armLocalRepair() {
    setRepairConfirmationRevision(repairCandidateRevision)
    requestRecoveryFocus()
  }

  function cancelLocalRepair() {
    setRepairConfirmationRevision(null)
    requestRecoveryFocus()
  }

  function downloadRepairArchive(archiveKey = repairArchiveKey) {
    try {
      const content = readWebsiteRecoveryArchive(archiveKey, window.localStorage)
      if (!content) {
        setNotice('The Website recovery archive could not be read or validated.')
        return
      }
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `supermega-website-recovery-${archiveKey.split('.').at(-1) ?? 'archive'}.json`
      link.hidden = true
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setNotice('Website recovery archive downloaded. No local data or deployment state changed.')
    } catch (error) {
      setNotice(`Website recovery archive download failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  async function removeRecoveryArchive(archiveKey: string) {
    if (recoveryDeleteCandidate !== archiveKey) {
      setRecoveryDeleteCandidate(archiveKey)
      setNotice('Confirm removal only after downloading the recovery archive if you may need it later.')
      return
    }
    const result = await deleteWebsiteRecoveryArchive(
      archiveKey,
      window.localStorage,
      window.navigator.locks,
    )
    setRecoveryDeleteCandidate('')
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setRecoveryArchives(result.archives)
    if (repairArchiveKey === archiveKey) setRepairArchiveKey('')
    setNotice('Website recovery archive removed from this browser. Website content and deployment state were unchanged.')
  }

  function updatePage(pageId: string, update: (page: WebsitePage) => WebsitePage) {
    stageWorkspace((current) => ({
      ...current,
      pages: current.pages.map((page) => page.id === pageId
        ? { ...update(page), updatedAt: new Date().toISOString() }
        : page),
    }))
    setDeleteCandidateId('')
  }

  function addPage() {
    if (editorWorkspace.pages.length >= MAX_WEBSITE_PAGES) {
      setNotice('This workspace supports up to four pages. Remove a draft before adding another.')
      return
    }
    const staged = stageWorkspace((current) => {
      if (current.pages.length >= MAX_WEBSITE_PAGES) return current
      const page = createBlankPage(current.pages.length + 1)
      return { ...current, pages: [...current.pages, page], selectedPageId: page.id }
    })
    if (staged) {
      setSelectedPageId(staged.workspace.selectedPageId)
      openWorkspaceView('content')
      setDeleteCandidateId('')
      setNotice('New page added to the unsaved preview.')
    }
  }

  function copySelectedPage() {
    if (editorWorkspace.pages.length >= MAX_WEBSITE_PAGES) {
      setNotice('This workspace supports up to four pages. Remove a draft before duplicating.')
      return
    }
    const sourcePageId = selectedPage.id
    const staged = stageWorkspace((current) => {
      if (current.pages.length >= MAX_WEBSITE_PAGES) return current
      const sourcePage = current.pages.find((page) => page.id === sourcePageId) ?? current.pages[0]
      const page = duplicatePage(sourcePage, current.pages.length + 1)
      return { ...current, pages: [...current.pages, page], selectedPageId: page.id }
    })
    if (staged) {
      setSelectedPageId(staged.workspace.selectedPageId)
      openWorkspaceView('content')
      setDeleteCandidateId('')
      setNotice('Page copy added to the unsaved preview with navigation hidden.')
    }
  }

  function requestDeletePage() {
    if (selectedPage.slug === '/' || selectedPage.stage !== 'draft') return
    if (deleteCandidateId !== selectedPage.id) {
      setDeleteCandidateId(selectedPage.id)
      setNotice('Select “Confirm remove” to delete this draft page.')
      return
    }

    const staged = stageWorkspace((current) => {
      const target = current.pages.find((page) => page.id === selectedPage.id)
      if (!target || target.slug === '/' || target.stage !== 'draft') return current
      const pages = current.pages.filter((page) => page.id !== target.id)
      return {
        ...current,
        pages,
        selectedPageId: pages[0]?.id ?? '',
      }
    })
    if (staged) {
      setSelectedPageId(staged.workspace.selectedPageId)
      setDeleteCandidateId('')
      setNotice('Draft page removed from the unsaved preview.')
    }
  }

  function movePage(pageId: string, direction: -1 | 1) {
    const staged = stageWorkspace((current) => {
      const currentIndex = current.pages.findIndex((page) => page.id === pageId)
      const nextIndex = currentIndex + direction
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.pages.length) return current
      const pages = [...current.pages]
      const [page] = pages.splice(currentIndex, 1)
      pages.splice(nextIndex, 0, page)
      return { ...current, pages }
    })
    if (staged) setNotice('Navigation order changed in the unsaved preview.')
  }

  async function addEvidence(input: {
    kind: EvidenceKind
    finding: string
    reference: string
    verifiedBy: string
  }) {
    if (!requireSavedWorkspace('recording release evidence')) return false
    const actionId = createId('evidence')
    const capturedAt = new Date().toISOString()
    const result = await commitWorkspace(
      (current) => recordWebsiteEvidence(current, { ...input, actionId, capturedAt }),
      'Verified evidence was saved and confirmed for the current content revision.',
      true,
    )
    return result.ok && result.changed
  }

  async function approveCurrentRevision(input: { reviewer: string; note: string }) {
    if (!requireSavedWorkspace('approving a revision')) return false
    const actionId = createId('approval')
    const capturedAt = new Date().toISOString()
    const result = await commitWorkspace(
      (current) => approveWebsiteRevision(current, { ...input, actionId, capturedAt }),
      'Evidence-bound human approval was saved and confirmed for this content revision.',
      true,
    )
    return result.ok && result.changed
  }

  async function recordLocalPublish() {
    if (!requireSavedWorkspace('recording a site file')) return
    if (!approvalIsCurrent || publishIsCurrent) return
    await commitWorkspace(
      (current) => recordWebsiteSnapshot(current, {
        actionId: createId('local-snapshot'),
        capturedAt: new Date().toISOString(),
      }),
      'Approved site file saved and confirmed. No deployment occurred.',
      true,
    )
  }

  function downloadPublishedSite(recordId: string) {
    const record = workspace.localPublishes.find((entry) => entry.id === recordId)
    if (!record?.artifact) {
      setNotice('This older site record has no retained file. Approve the current revision and create a new site file.')
      return
    }
    try {
      const download = createWebsiteHtmlDownload(record.artifact)
      const url = URL.createObjectURL(new Blob([download.content], { type: download.mimeType }))
      const link = document.createElement('a')
      link.href = url
      link.download = download.filename
      link.hidden = true
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setNotice(`${download.filename} downloaded. No deployment or domain change occurred.`)
    } catch (error) {
      setNotice('The retained site file failed closed: ' + (error instanceof Error ? error.message : 'unknown export error'))
    }
  }

  return (
    <div className="website-product">
      <div className="website-shell">
        <div id="website-workspace" className="website-main">
          {noticePriority !== 'routine' ? (
            <div className="website-notice" aria-busy={repairing} aria-live="polite" data-priority={noticePriority} role="status">
              <p>{repairArmed
                ? 'SuperMega will keep a recovery copy on this device, then restore saving with the valid Website shown here. Nothing will be published; Shop, Plant, managed data, and domains stay unchanged.'
                : repairing ? 'Keeping a recovery copy and restoring Website saving…' : statusNotice}</p>
              {repairArchiveKey && !repairArmed ? (
                <div className="website-notice-actions">
                  <button ref={recoveryPrimaryActionRef} className="website-notice-action is-quiet" onClick={() => downloadRepairArchive()} type="button">Download archive</button>
                  {canRepairLocalStorage ? <button className="website-notice-action" onClick={armLocalRepair} type="button">Retry repair</button> : null}
                </div>
              ) : canRepairLocalStorage ? repairArmed ? (
                <div className="website-notice-actions">
                  <button className="website-notice-action is-quiet" disabled={repairing} onClick={cancelLocalRepair} type="button">Cancel</button>
                  <button ref={recoveryPrimaryActionRef} className="website-notice-action" disabled={repairing} onClick={() => void repairLocalData()} type="button">Keep copy and repair</button>
                </div>
              ) : (
                <div className="website-notice-actions">
                  <a className="website-notice-action is-quiet" href="/settings/#controls">Export backup</a>
                  <button ref={recoveryPrimaryActionRef} className="website-notice-action" onClick={armLocalRepair} type="button">Review repair</button>
                </div>
              ) : storageIssue && storageMode === 'session-only' ? (
                <a className="website-notice-action" href="/settings/#controls">Recovery settings</a>
              ) : null}
            </div>
          ) : null}

          {view === 'content' ? (
            <section
              aria-label="Website actions"
              className="website-action-bar"
              data-editing={hasUnsavedChanges ? 'true' : 'false'}
            >
              <div className="website-page-control">
                <label htmlFor="website-page-select">Page</label>
                <select
                  id="website-page-select"
                  onChange={(event) => selectPage(event.currentTarget.value)}
                  value={selectedPage.id}
                >
                  {editorWorkspace.pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.internalName || 'Untitled page'} — {page.slug || 'No path'} ({page.stage})
                    </option>
                  ))}
                </select>
              </div>
              <span
                aria-live="polite"
                className="website-save-state"
                data-mode={storageMode}
                data-state={editConflict ? 'conflict' : hasUnsavedChanges ? 'unsaved' : 'saved'}
              >
                {saveStateLabel}
              </span>
              <div className="website-primary-actions">
                <details
                  className="website-site-settings"
                  onKeyDown={(event) => {
                    if (event.key !== 'Escape') return
                    setSiteSettingsOpen(false)
                    event.currentTarget.querySelector('summary')?.focus()
                  }}
                  onToggle={(event) => setSiteSettingsOpen(event.currentTarget.open)}
                  open={siteSettingsOpen}
                >
                  <summary>Site</summary>
                  <div className="website-site-settings-content">
                    <div className="website-site-settings-actions">
                      <span>{editorWorkspace.pages.length} pages · {visiblePageCount} in navigation</span>
                      <button
                        className="website-button is-secondary"
                        disabled={editorWorkspace.pages.length >= MAX_WEBSITE_PAGES}
                        onClick={addPage}
                        title={editorWorkspace.pages.length >= MAX_WEBSITE_PAGES ? 'The four-page workspace limit is reached' : 'Add page'}
                        type="button"
                      >
                        New page
                      </button>
                    </div>
                    <NavigationWorkspace
                      onMovePage={movePage}
                      onSelectPage={previewPage}
                      onSiteNameChange={(siteName) => {
                        stageWorkspace((current) => ({ ...current, siteName }))
                      }}
                      onUpdatePage={updatePage}
                      workspace={editorWorkspace}
                    />
                    {recoveryArchives.length ? (
                      <details className="website-recovery-manager">
                        <summary>Recovery archives <span>{recoveryArchives.length}</span></summary>
                        <div className="website-recovery-list">
                          <p>Unreadable Website values kept on this device. Download before removing anything you may need.</p>
                          {recoveryArchives.map((archive) => {
                            const deleteArmed = recoveryDeleteCandidate === archive.archiveKey
                            return (
                              <div className="website-recovery-row" key={archive.archiveKey}>
                                <div>
                                  <strong>{formatRecoveryDate(archive.archivedAt)}</strong>
                                  <span>{archive.sourceKey === LEGACY_WEBSITE_STORAGE_KEY ? 'Old Website data' : 'Website data'}</span>
                                </div>
                                <div className="website-recovery-actions">
                                  <button onClick={() => downloadRepairArchive(archive.archiveKey)} type="button">Download</button>
                                  {deleteArmed ? (
                                    <>
                                      <button className="is-quiet" onClick={() => setRecoveryDeleteCandidate('')} type="button">Cancel</button>
                                      <button className="is-danger" onClick={() => void removeRecoveryArchive(archive.archiveKey)} type="button">Confirm remove</button>
                                    </>
                                  ) : (
                                    <button className="is-quiet" onClick={() => void removeRecoveryArchive(archive.archiveKey)} type="button">Remove</button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </details>
                <button
                  aria-pressed={surface === 'preview'}
                  className="website-button is-secondary"
                  onClick={() => {
                    if (surface === 'preview') openContentSurface('work')
                    else previewPage()
                  }}
                  type="button"
                >
                  {surface === 'preview' ? 'Back' : 'Preview'}
                </button>
                {hasUnsavedChanges ? (
                  <>
                    <button
                      className="website-button is-quiet"
                      disabled={savingDraft}
                      onClick={discardDraft}
                      type="button"
                    >
                      Discard
                    </button>
                    <button
                      className="website-button is-primary"
                      disabled={editConflict || savingDraft}
                      onClick={() => void saveDraft()}
                      title={editConflict ? 'Discard this preview and review the newer saved version' : 'Save all preview changes as one revision'}
                      type="button"
                    >
                      {savingDraft ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button className="website-button is-primary" onClick={() => openWorkspaceView('publish')} type="button">
                    Review site
                  </button>
                )}
              </div>
            </section>
          ) : null}

          <header className="website-heading" data-view={view}>
            <div>
              <h1 ref={headingRef} tabIndex={-1}>{activeViewCopy.title}</h1>
              <p>{activeViewCopy.copy}</p>
            </div>
            {view === 'publish' ? (
              <button className="website-button is-secondary" onClick={() => openWorkspaceView('content')} type="button">Back to edit</button>
            ) : null}
          </header>

          <div
            aria-label={view === 'content' ? 'Edit' : 'Publish'}
            className={'website-workspace-grid view-' + view}
            data-surface={surface}
            id="website-active-panel"
            role="region"
          >
            <div className="website-work-surface">
              {view === 'content' ? (
                <ContentWorkspace
                  canDuplicate={editorWorkspace.pages.length < MAX_WEBSITE_PAGES}
                  deleteArmed={deleteCandidateId === selectedPage.id}
                  onDuplicate={copySelectedPage}
                  onRequestDelete={requestDeletePage}
                  onUpdatePage={(update) => updatePage(selectedPage.id, update)}
                  page={selectedPage}
                />
              ) : null}

              {view === 'publish' ? (
                <PublishWorkspace
                  approvalIsCurrent={approvalIsCurrent}
                  checks={checks}
                  currentPublishId={publish?.id ?? ''}
                  fingerprint={fingerprint}
                  managedActorId={managedActorId}
                  onAddEvidence={addEvidence}
                  onApprove={approveCurrentRevision}
                  onDownloadPublish={downloadPublishedSite}
                  onRecordPublish={recordLocalPublish}
                  publishIsCurrent={publishIsCurrent}
                  workspace={workspace}
                />
              ) : null}
            </div>

            <div className="website-preview-surface">
              <header className="website-preview-surface-head">
                <div>
                  <strong>{hasUnsavedChanges ? 'Unsaved preview' : 'Preview'}</strong>
                  <small>{selectedPage.internalName || 'Untitled page'}</small>
                </div>
                <div className="website-preview-controls" role="group" aria-label="Responsive preview size">
                  {previewDevices.map((option) => (
                    <button
                      aria-pressed={device === option.id}
                      key={option.id}
                      onClick={() => setDevice(option.id)}
                      title={option.label + ' preview'}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </header>
              <SitePreview
                device={device}
                onSelectPage={selectPage}
                page={selectedPage}
                pages={editorWorkspace.pages}
                siteName={editorWorkspace.siteName}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
