import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { recordBehaviorSignal } from '../../core/behavior-trail'
import { ContentWorkspace } from './ContentWorkspace'
import { NavigationWorkspace } from './NavigationWorkspace'
import { PublishWorkspace } from './PublishWorkspace'
import { SitePreview } from './SitePreview'
import { WebsiteStarterSetup } from './WebsiteStarterSetup'
import { useWebsiteWorkspace } from './useWebsiteWorkspace'
import { createWebsiteHtmlDownload } from './website-export'
import {
  captureWebsiteLead,
  emptyWebsiteLeadLedger,
  readWebsiteLeadLedger,
  reviewWebsiteLead,
  websiteLeadCounts,
  writeWebsiteLeadLedger,
} from './website-leads'
import type { WebsiteReleaseState } from './website-release-foundation'
import {
  applyWebsiteStarterBrief,
  isUntouchedWebsiteStarter,
  websiteStarterTemplates,
  type WebsiteStarterBrief,
} from './website-starter'
import {
  approveWebsiteRevision,
  commitWebsiteEditSession,
  createBlankPage,
  createWebsitePreviewArtifact,
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
  recoverWebsiteDraftPage,
  recordWebsiteEvidence,
  recordWebsiteSnapshot,
  restoreWebsiteEditSession,
  removeWebsiteDraftPage,
  updateWebsiteEditSession,
  WEBSITE_EDIT_SESSION_KEY,
  websiteEditSessionMatches,
  workspaceFingerprint,
  type EvidenceKind,
  type PreviewDevice,
  type ReadinessCheck,
  type WebsiteEditSession,
  type WebsitePage,
  type WebsiteRecoveryArchiveSummary,
  type WebsiteRemovedDraftPage,
  type WebsiteWorkspace,
  type WebsiteWorkspaceUpdate,
} from './website-model'
import './website-product.css'

type WebsiteView = 'content' | 'publish'

type WebsiteEditSessionState = {
  scope: string
  session: WebsiteEditSession
}

const DEFAULT_NOTICE = 'Website example loaded. Nothing has been deployed.'

const viewCopy: Record<WebsiteView, { title: string; copy: string }> = {
  content: {
    title: 'Edit page',
    copy: 'Edit one section, preview it, then save or discard.',
  },
  publish: {
    title: 'Prepare website file',
    copy: 'Check the pages, record review notes, then download the approved website file.',
  },
}

function TrialReadyWorkspace({
  checks,
  onDownload,
  retentionLabel,
  workspace,
}: {
  checks: ReadinessCheck[]
  onDownload: () => void
  retentionLabel: string
  workspace: WebsiteWorkspace
}) {
  const websiteChecks = checks.filter((check) => !check.id.startsWith('evidence-'))
  const passedChecks = websiteChecks.filter((check) => check.passed).length
  const readyPages = workspace.pages.filter((page) => page.stage === 'ready')

  return (
    <section className="website-editor-panel website-trial-ready" aria-labelledby="website-ready-title">
      <header className="website-panel-head">
        <div>
          <span className="website-eyebrow">Ready to use</span>
          <h2 id="website-ready-title">Download your website</h2>
          <p>One file works on any phone or computer.</p>
        </div>
        <span className="website-status is-ready">Ready</span>
      </header>

      <div className="website-editor-scroll website-trial-ready-body">
        <div className="website-trial-ready-summary">
          <span>{retentionLabel}</span>
          <strong>{workspace.siteName}</strong>
          <p>{readyPages.length} ready page{readyPages.length === 1 ? '' : 's'} · {passedChecks}/{websiteChecks.length} website checks passed</p>
        </div>

        <ol className="website-trial-ready-steps">
          <li>
            <span aria-hidden="true">1</span>
            <div><strong>Preview</strong><p>Go back, then Preview to check desktop, tablet, or mobile.</p></div>
          </li>
          <li>
            <span aria-hidden="true">2</span>
            <div><strong>Download</strong><p>Get one standalone HTML file.</p></div>
          </li>
        </ol>

        <div className="website-trial-ready-boundary" role="note">
          <strong>Not online yet</strong>
          <span>Downloading does not deploy a site, connect a domain, or send customer data.</span>
        </div>

        <button className="website-button is-primary website-trial-download" onClick={onDownload} type="button">
          Download website
        </button>
      </div>
    </section>
  )
}

function formatRecoveryDate(value: string) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 'Saved recovery' : new Date(timestamp).toLocaleString()
}

function editSessionStorageKey(scope: string) {
  return `${WEBSITE_EDIT_SESSION_KEY}.${encodeURIComponent(scope)}`
}

export function WebsiteProduct() {
  const location = useLocation()
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
  const [surface, setSurface] = useState<'work' | 'preview'>('preview')
  const [selectedPageId, setSelectedPageId] = useState(workspace.selectedPageId)
  const [siteSettingsOpen, setSiteSettingsOpen] = useState(false)
  const [starterDismissed, setStarterDismissed] = useState(true)
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
  const [removedDraftPage, setRemovedDraftPage] = useState<WebsiteRemovedDraftPage | null>(null)
  const pageRemovalActionRef = useRef<HTMLButtonElement>(null)
  const [localLeadLedger, setLocalLeadLedger] = useState(() => {
    if (typeof window === 'undefined') return emptyWebsiteLeadLedger()
    try { return readWebsiteLeadLedger(window.localStorage) } catch { return emptyWebsiteLeadLedger() }
  })
  const leadLedger = storageMode === 'managed'
    ? workspace.leadLedger ?? emptyWebsiteLeadLedger()
    : localLeadLedger
  const [leadDraft, setLeadDraft] = useState({ name: '', contact: '', request: '', consentRecorded: false })
  const [leadOwner, setLeadOwner] = useState('')
  const [leadDecisionNote, setLeadDecisionNote] = useState('')
  const editSessionScope = storageMode === 'managed'
    ? managedActorId ? `managed:${managedActorId}` : ''
    : storageMode
  const activeEditSession = editSessionState?.scope === editSessionScope ? editSessionState.session : null
  const editorWorkspace = activeEditSession?.workspace ?? workspace
  const selectedPage = editorWorkspace.pages.find((page) => page.id === selectedPageId)
    ?? editorWorkspace.pages.find((page) => page.id === editorWorkspace.selectedPageId)
    ?? editorWorkspace.pages[0]
  const activeRemovedDraftPage = removedDraftPage
  const pageRemovalRecoveryKey = activeRemovedDraftPage
    ? `${activeRemovedDraftPage.page.id}:${activeRemovedDraftPage.postRemovalFingerprint}`
    : ''
  const hasUnsavedChanges = Boolean(activeEditSession)
  const editConflict = Boolean(activeEditSession && !websiteEditSessionMatches(activeEditSession, workspace))
  const fingerprint = workspaceFingerprint(workspace)
  const checks = readinessChecks(workspace, fingerprint)
  const contentChecksPass = checks
    .filter((check) => !check.id.startsWith('evidence-'))
    .every((check) => check.passed)
  const approval = getCurrentApproval(workspace)
  const publish = getCurrentPublish(workspace)
  const approvalIsCurrent = Boolean(approval)
  const publishIsCurrent = Boolean(publish)
  const starterAvailable = !hasUnsavedChanges && isUntouchedWebsiteStarter(editorWorkspace)
  const workingSampleTemplate = workspace.workingSample
    ? websiteStarterTemplates.find((template) => template.id === workspace.workingSample?.templateId) ?? null
    : null
  const workingSampleIsCurrent = Boolean(workspace.workingSample
    && workspace.workingSample.contentFingerprint === fingerprint)
  const canReview = !hasUnsavedChanges && !starterAvailable && contentChecksPass
  const view: WebsiteView = requestedView === 'publish' && canReview ? 'publish' : 'content'
  const starterSetupActive = view === 'content' && starterAvailable && !starterDismissed
  const activeViewCopy = view === 'content' && starterAvailable && surface === 'preview'
    ? {
        title: 'Website',
        copy: 'Preview, edit, and download the website file.',
      }
    : starterSetupActive
    ? {
        title: 'Make this website yours',
        copy: 'Edit the example, then preview it.',
      }
    : view === 'content' && surface === 'preview'
    ? {
        title: hasUnsavedChanges ? 'Preview unsaved changes' : 'Preview page',
        copy: hasUnsavedChanges
          ? 'Unsaved preview. Edit, save, or discard it.'
          : selectedPage.stage === 'draft'
            ? 'Saved draft. Edit it, then mark it ready.'
            : 'Check this page at each screen size.',
      }
    : view === 'publish' && storageMode === 'session-only'
      ? {
          title: 'Your website is ready',
          copy: 'Download it. Go live after review.',
        }
      : viewCopy[view]
  const savedStateNotice = `${storageMode === 'managed' ? 'Company account' : storageMode === 'browser-local' ? 'This device' : 'This session'} only. Nothing has been deployed.`
  const saveStateLabel = starterAvailable
    ? 'Sample only'
    : editConflict
    ? 'Saved version changed'
    : hasUnsavedChanges
      ? 'Unsaved preview'
      : storageMode === 'managed'
        ? 'Saved to company'
        : storageMode === 'browser-local'
          ? 'Saved on this device'
          : 'Session only'
  const websiteSurfaceActionLabel = surface === 'preview'
    ? starterAvailable ? 'Edit sample' : 'Edit page'
    : 'Preview'
  const visiblePageCount = editorWorkspace.pages.filter((page) => page.navigation.visible).length
  const statusNotice = editConflict
    ? 'The saved site changed. Discard this preserved preview before editing.'
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
    if (requestedView !== 'publish' || canReview) return
    const next = new URLSearchParams(searchParams)
    next.delete('view')
    setSearchParams(next, { replace: true })
  }, [canReview, requestedView, searchParams, setSearchParams])

  useEffect(() => {
    if (headingFocusRequest > 0) headingRef.current?.focus()
  }, [headingFocusRequest])

  useEffect(() => {
    if (recoveryFocusRequest > 0) recoveryPrimaryActionRef.current?.focus()
  }, [recoveryFocusRequest])

  useEffect(() => {
    if (!pageRemovalRecoveryKey) return
    pageRemovalActionRef.current?.focus({ preventScroll: true })
  }, [pageRemovalRecoveryKey])

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
      setNotice('Save or discard the preview before file review.')
      return
    }
    if (nextView === 'publish' && !canReview) {
      setNotice('Finish and save every page first.')
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

  async function saveManagedRelease(nextRelease: WebsiteReleaseState) {
    if (storageMode !== 'managed') return { ok: false as const, error: 'Managed Website release storage is unavailable.' }
    const result = await commitWorkspace((current) => {
      const retained = current.releaseRecords ?? []
      const index = retained.findIndex((record) => record.scope === nextRelease.scope)
      if (index >= 0 && retained[index].headDigest === nextRelease.headDigest) return current
      const previous = index >= 0 ? retained[index] : null
      const added = nextRelease.revision - (previous?.revision ?? 0)
      if (added < 1 || added > 2
        || (previous && JSON.stringify(nextRelease.commands.slice(0, previous.commands.length)) !== JSON.stringify(previous.commands))) {
        throw new Error('Managed Website release history must append one reviewed step without rewriting prior evidence.')
      }
      const releaseRecords = index < 0
        ? [...retained, nextRelease]
        : retained.map((record, recordIndex) => recordIndex === index ? nextRelease : record)
      return { ...current, releaseRecords }
    }, 'Website checklist saved to this company account.', true)
    return result.ok ? { ok: true as const } : result
  }

  function replaceEditSession(next: WebsiteEditSessionState | null) {
    editSessionRef.current = next
    setEditSessionState(next)
  }

  function persistEditSession(next: WebsiteEditSessionState) {
    try {
      window.sessionStorage.setItem(editSessionStorageKey(next.scope), JSON.stringify(next.session))
    } catch {
      setNotice('This tab holds the preview. Save or Discard still works.')
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
    setRemovedDraftPage(null)
    replaceEditSession(null)
  }

  function stageWorkspace(update: WebsiteWorkspaceUpdate, options: { retainPageRemoval?: boolean } = {}) {
    if (savingDraft) {
      setNotice('Save is still running.')
      return null
    }
    if (!editSessionScope) {
      setNotice('Website is still loading.')
      return null
    }
    const retained = editSessionRef.current
    if (retained && retained.scope !== editSessionScope) {
      setNotice('Workspace changed. Review it before editing.')
      return null
    }
    const base = retained?.session ?? createWebsiteEditSession(workspace)
    if (!websiteEditSessionMatches(base, workspace)) {
      setNotice('The saved site changed. Discard this preview first.')
      return null
    }
    const result = updateWebsiteEditSession(base, update)
    if (!result.ok) {
      setNotice(result.error)
      return null
    }
    if (!result.changed) return retained?.session ?? null
    if (!options.retainPageRemoval) setRemovedDraftPage(null)
    const next = { scope: editSessionScope, session: result.session }
    replaceEditSession(next)
    persistEditSession(next)
    return result.session
  }

  async function saveDraft() {
    const retained = editSessionRef.current
    if (!retained || retained.scope !== editSessionScope) return
    if (!websiteEditSessionMatches(retained.session, workspace)) {
      setNotice('This preview is older. Discard it to review the saved site.')
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
      : 'No change; preview already matched.')
  }

  function discardDraft() {
    if (!activeEditSession || savingDraft) return
    clearEditSession()
    setDeleteCandidateId('')
    setStarterDismissed(true)
    setSurface('preview')
    setSiteSettingsOpen(false)
    requestHeadingFocus()
    setNotice('Preview discarded. The saved site did not change.')
  }

  function requireSavedWorkspace(action: string) {
    if (!hasUnsavedChanges) return true
    setNotice(`Save or discard before ${action}.`)
    return false
  }

  function selectPage(pageId: string) {
    if (!editorWorkspace.pages.some((page) => page.id === pageId)) {
      setNotice('That page is unavailable. The current page stayed open.')
      return false
    }
    setSelectedPageId(pageId)
    setDeleteCandidateId('')
    setRemovedDraftPage(null)
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
        ? ' Old storage remains; review Recovery archives.'
        : ''
      setNotice(`Website repaired. Archive: ${result.archiveKey}.${cleanupNotice} No deployment occurred.`)
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
        setNotice('Recovery archive is invalid.')
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
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
      setNotice('Recovery archive downloaded. Nothing changed.')
    } catch (error) {
      setNotice(`Archive download failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  async function removeRecoveryArchive(archiveKey: string) {
    if (recoveryDeleteCandidate !== archiveKey) {
      setRecoveryDeleteCandidate(archiveKey)
      setNotice('Download the archive first if you may need it.')
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
    setNotice('Recovery archive removed. Website content stayed unchanged.')
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
      setNotice('Four-page limit reached. Remove a draft first.')
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
      setNotice('New page added to the preview.')
    }
  }

  function startWithBusiness(brief: WebsiteStarterBrief) {
    if (!starterAvailable) {
      setNotice('The example already changed. Nothing was replaced.')
      return
    }
    const staged = stageWorkspace((current) => (
      applyWebsiteStarterBrief(current, brief, new Date().toISOString())
    ))
    if (!staged) {
      setNotice('Complete the required brief fields.')
      return
    }
    setSelectedPageId(staged.workspace.selectedPageId)
    setStarterDismissed(true)
    openContentSurface('preview')
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'website',
      route: location.pathname + location.search,
      detail: `Website starter brief generated: ${brief.businessName}`,
    })
    setNotice('Three-page preview ready. Review, then Save or Discard.')
  }

  function openStarterSetup() {
    setStarterDismissed(false)
    setSurface('work')
    setSiteSettingsOpen(false)
  }

  function viewWebsiteSample() {
    setStarterDismissed(true)
    openContentSurface('preview')
  }

  function copySelectedPage() {
    if (editorWorkspace.pages.length >= MAX_WEBSITE_PAGES) {
      setNotice('Four-page limit reached. Remove a draft first.')
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
      setNotice('Page copied with navigation hidden.')
    }
  }

  function requestDeletePage() {
    if (selectedPage.slug === '/' || selectedPage.stage !== 'draft') return
    if (deleteCandidateId !== selectedPage.id) {
      setDeleteCandidateId(selectedPage.id)
      setNotice('Select “Confirm remove” to delete this draft page.')
      return
    }

    const removal = removeWebsiteDraftPage(editorWorkspace, selectedPage.id)
    if (!removal.ok) return
    const staged = stageWorkspace(() => removal.workspace, { retainPageRemoval: true })
    if (staged && removal?.ok) {
      setSelectedPageId(staged.workspace.selectedPageId)
      setDeleteCandidateId('')
      setRemovedDraftPage(removal.removed)
      setNotice('Draft page removed. Undo is ready; nothing was saved or published.')
    }
  }

  function undoPageRemoval() {
    const removed = activeRemovedDraftPage
    if (!removed) return
    const recovery = recoverWebsiteDraftPage(editorWorkspace, removed)
    setRemovedDraftPage(null)
    if (!recovery.ok) {
      setNotice('Recovery expired because the preview changed.')
      return
    }
    const staged = stageWorkspace(() => recovery.workspace, { retainPageRemoval: true })
    if (!staged) return
    setSelectedPageId(removed.page.id)
    setDeleteCandidateId('')
    setNotice('Draft page restored at its exact position. Nothing was saved or published.')
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
    if (staged) setNotice('Navigation order changed.')
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
      'Approved website file saved. Nothing was deployed.',
      true,
    )
  }

  function downloadPublishedSite(recordId: string) {
    const record = workspace.localPublishes.find((entry) => entry.id === recordId)
    if (!record?.artifact) {
      setNotice('No file retained. Approve and create a new one.')
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
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
      setNotice(`${download.filename} downloaded. Nothing changed online.`)
    } catch (error) {
      setNotice('File download failed: ' + (error instanceof Error ? error.message : 'unknown error'))
    }
  }

  function downloadTrialSite() {
    if (!requireSavedWorkspace('downloading the Website')) return
    try {
      const download = createWebsiteHtmlDownload(createWebsitePreviewArtifact(workspace))
      const url = URL.createObjectURL(new Blob([download.content], { type: download.mimeType }))
      const link = document.createElement('a')
      link.href = url
      link.download = download.filename
      link.hidden = true
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
      recordBehaviorSignal(window.localStorage, {
        event: 'first_value_completed',
        product: 'website',
        route: location.pathname + location.search,
        detail: 'Downloaded saved Website preview.',
      })
      setNotice(`${download.filename} downloaded. Nothing was deployed.`)
    } catch (error) {
      setNotice('Download failed: ' + (error instanceof Error ? error.message : 'unknown error'))
    }
  }

  const failingContentChecks = checks.filter((check) => !check.id.startsWith('evidence-') && !check.passed)
  const readyBuyerCtaPages = workspace.pages.filter((page) => page.stage === 'ready'
    && Boolean(page.hero.ctaLabel.trim())
    && Boolean(page.hero.ctaHref.trim()))
  const websiteLeads = leadLedger.leads.filter((lead) => lead.siteName === workspace.siteName)
  const leadCounts = websiteLeadCounts(leadLedger, workspace.siteName)
  const releaseRecordRequired = storageMode === 'managed'
  const localPreviewReady = storageMode !== 'managed' && !starterAvailable && !hasUnsavedChanges
  const websiteTodayStep = storageIssue || canRepairLocalStorage
    ? 'recover'
    : starterSetupActive || starterAvailable
      ? 'setup'
      : hasUnsavedChanges
        ? 'edit'
        : localPreviewReady
          ? 'preview-file'
        : failingContentChecks.length
          ? 'checks'
          : leadCounts.new
            ? 'inquiries'
            : releaseRecordRequired && !approvalIsCurrent
              ? 'review'
              : releaseRecordRequired && !publishIsCurrent
                ? 'file'
                : 'ready'
  const websiteAgentJob = storageIssue || canRepairLocalStorage
    ? 'Recover Website workspace'
    : starterSetupActive
      ? 'Answer 5 questions'
    : starterAvailable
        ? 'Customize this demo'
        : hasUnsavedChanges
          ? 'Save or discard edits'
          : localPreviewReady
            ? 'Download your website preview'
          : failingContentChecks.length
            ? 'Fix page checks'
            : leadCounts.new
              ? 'Review new inquiries'
              : releaseRecordRequired && !approvalIsCurrent
                ? 'Final review'
                : releaseRecordRequired && !publishIsCurrent
                  ? 'Save website file'
                  : releaseRecordRequired
                    ? 'Review go-live plan'
                    : 'Download website'
  const websiteAgentReason = storageIssue || canRepairLocalStorage
    ? 'Fix local saving first.'
    : starterAvailable || starterSetupActive
      ? 'Answer five questions to replace the example.'
      : hasUnsavedChanges
        ? 'Save or discard this preview.'
        : failingContentChecks.length
          ? `${failingContentChecks.length} page check${failingContentChecks.length === 1 ? '' : 's'} remain.`
          : leadCounts.new
            ? `${leadCounts.new} inquir${leadCounts.new === 1 ? 'y needs' : 'ies need'} review.`
            : 'Complete this step; nothing goes live automatically.'
  const websiteReviewNote = hasUnsavedChanges
    ? 'Save or discard first.'
    : 'You approve every save, download, and go-live action.'
  const websiteAgentActionLabel = storageIssue || canRepairLocalStorage
    ? 'Open recovery'
    : starterSetupActive || starterAvailable
      ? 'Customize demo'
      : websiteAgentJob
  const websiteTodayState = storageIssue || canRepairLocalStorage
    ? 'blocked'
    : starterAvailable || starterSetupActive
      ? 'setup'
      : hasUnsavedChanges || failingContentChecks.length || leadCounts.new
        ? 'attention'
        : 'ready'
  const statusWorkspace = hasUnsavedChanges ? editorWorkspace : workspace
  const websiteTodayMetrics = [
    ['Pages', `${statusWorkspace.pages.filter((page) => page.stage === 'ready').length}/${statusWorkspace.pages.length} ready`],
    ['Readiness', hasUnsavedChanges ? 'Review draft' : failingContentChecks.length ? `${failingContentChecks.length} to fix` : 'Clear'],
    ['Inquiries', leadCounts.new ? `${leadCounts.new} new` : websiteLeads.length ? `${websiteLeads.length} total` : 'None yet'],
    ['File', hasUnsavedChanges ? 'Blocked by draft' : releaseRecordRequired ? publishIsCurrent ? 'Ready' : 'Needed' : 'Ready to download'],
  ] as const
  const websiteTodaySource = storageMode === 'managed'
    ? `Company account · ${managedActorId || 'signed in'}`
    : storageMode === 'browser-local'
      ? 'Saved on this device'
      : 'Available in this browser session'
  const websiteTodayContext = workingSampleTemplate
    ? `${workingSampleTemplate.label} ${workingSampleIsCurrent ? 'working sample' : 'starting template'} · ${websiteTodaySource}`
    : websiteTodaySource
  const leadExportHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({
    contract: 'supermega.website.lead-export.v1',
    exportedAt: new Date().toISOString(),
    siteName: workspace.siteName,
    revision: leadLedger.revision,
    leads: websiteLeads,
    controls: { localOnly: true, externalWritesPerformed: false, humanReviewRequired: true },
  }, null, 2))}`
  useEffect(() => {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_seen',
      product: 'website',
      route: location.pathname + location.search,
      detail: websiteAgentJob,
    })
  }, [location.pathname, location.search, websiteAgentJob])

  function runWebsiteAutopilot() {
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'website',
      route: location.pathname + location.search,
      detail: `Website next step: ${websiteAgentJob}`,
    })
    if (storageIssue || canRepairLocalStorage) {
      requestRecoveryFocus()
      return
    }
    if (starterAvailable || starterSetupActive) {
      openStarterSetup()
      return
    }
    if (localPreviewReady) {
      downloadTrialSite()
      return
    }
    if (hasUnsavedChanges || failingContentChecks.length) {
      openContentSurface('work')
      return
    }
    if (leadCounts.new) {
      const controls = document.querySelector<HTMLDetailsElement>('.website-business-controls')
      if (controls) controls.open = true
      requestAnimationFrame(() => {
        const inbox = document.getElementById('website-lead-inbox')
        inbox?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        document.getElementById('website-lead-inbox-title')?.focus({ preventScroll: true })
      })
      return
    }
    openWorkspaceView('publish')
  }

  function saveLeadLedger(nextLedger: typeof leadLedger, success: string) {
    try {
      const confirmed = writeWebsiteLeadLedger(window.localStorage, nextLedger)
      setLocalLeadLedger(confirmed)
      setNotice(success)
      return true
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The Website lead record could not be saved.')
      return false
    }
  }

  async function captureDemoInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const next = captureWebsiteLead(leadLedger, {
        siteName: workspace.siteName,
        sourcePage: selectedPage.slug,
        ...leadDraft,
      }, { id: createId('lead'), now: new Date().toISOString() })
      if (storageMode === 'managed') {
        const result = await mutateWorkspace((current) => ({
          ...current,
          leadLedger: captureWebsiteLead(current.leadLedger ?? emptyWebsiteLeadLedger(), {
            siteName: current.siteName,
            sourcePage: selectedPage.slug,
            ...leadDraft,
          }, { id: next.leads[0].id, now: next.leads[0].createdAt }),
        }), { durable: true })
        if (!result.ok) throw new Error(result.error)
        setLeadDraft({ name: '', contact: '', request: '', consentRecorded: false })
        setNotice('Inquiry saved for manager review. No message or external write ran.')
        return
      }
      if (saveLeadLedger(next, 'Inquiry saved locally. No message or external write ran.')) {
        setLeadDraft({ name: '', contact: '', request: '', consentRecorded: false })
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The Website inquiry is invalid.')
    }
  }

  async function decideLead(leadId: string, status: 'qualified' | 'closed') {
    try {
      const next = reviewWebsiteLead(leadLedger, leadId, {
        status,
        owner: leadOwner,
        decisionNote: leadDecisionNote,
      }, new Date().toISOString())
      if (storageMode === 'managed') {
        const reviewed = next.leads.find((lead) => lead.id === leadId)
        if (!reviewed) throw new Error('The Website inquiry no longer exists.')
        const result = await mutateWorkspace((current) => ({
          ...current,
          leadLedger: reviewWebsiteLead(current.leadLedger ?? emptyWebsiteLeadLedger(), leadId, {
            status,
            owner: leadOwner,
            decisionNote: leadDecisionNote,
          }, reviewed.updatedAt),
        }), { durable: true })
        if (!result.ok) throw new Error(result.error)
        setLeadDecisionNote('')
        setNotice(status === 'qualified'
          ? 'Inquiry qualified and assigned. No message was sent.'
          : 'Inquiry closed. No message was sent.')
        return
      }
      if (saveLeadLedger(next, status === 'qualified'
        ? 'Inquiry qualified locally. No message was sent.'
        : 'Inquiry closed locally. No message was sent.')) setLeadDecisionNote('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The Website inquiry decision is invalid.')
    }
  }

  return (
    <div className="website-product">
      <div className="website-shell">
        <div id="website-workspace" className="website-main">
          {noticePriority !== 'routine' ? (
            <div className="website-notice" aria-busy={repairing} aria-live="polite" data-priority={noticePriority} role="status">
              <p>{repairArmed
                ? 'Keep an archive, then restore local saving. Nothing is published or sent.'
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

          <header className="website-heading" data-view={view}>
            <div>
              <h1 ref={headingRef} tabIndex={-1}>{activeViewCopy.title}</h1>
              <p>{activeViewCopy.copy}</p>
            </div>
            {view === 'publish' ? (
              <button className="website-button is-secondary" onClick={() => openWorkspaceView('content')} type="button">Back to edit</button>
            ) : null}
          </header>

          {!starterSetupActive ? <section aria-labelledby="website-today-title" className="website-today" data-state={websiteTodayState} data-step={websiteTodayStep}>
            <div className="website-today-priority">
              <span className="core-eyebrow">Start here</span>
              <h2 id="website-today-title">{websiteAgentJob}</h2>
              <p>{websiteAgentReason}</p>
              <button className="website-button is-primary is-compact" onClick={runWebsiteAutopilot} type="button">{websiteAgentActionLabel}</button>
            </div>
            <div aria-label="Website today status" className="website-today-metrics" role="group">
              {websiteTodayMetrics.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
            </div>
            <div className="website-today-source" role="status">
              <span>{websiteTodayContext}</span>
              <small>{websiteReviewNote}</small>
            </div>
          </section> : null}

          {view === 'content' ? (
            <section
              aria-label="Website actions"
              className="website-action-bar"
              data-editing={hasUnsavedChanges ? 'true' : 'false'}
              data-starter={starterSetupActive ? 'true' : 'false'}
              data-surface={surface}
            >
              {starterSetupActive ? (
                <div className="website-page-control website-starter-control">
                  <span>Start</span>
                  <strong>Business website</strong>
                </div>
              ) : (
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
              )}
              <span
                aria-live="polite"
                className="website-save-state"
                data-mode={storageMode}
                data-state={editConflict ? 'conflict' : hasUnsavedChanges ? 'unsaved' : 'saved'}
              >
                {saveStateLabel}
              </span>
              {!starterSetupActive ? (
                <div className="website-primary-actions">
                {surface === 'work' ? (
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
                            <p>Unreadable local copies. Download before removal.</p>
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
                ) : null}
                <button
                  className={`website-button ${surface === 'preview' && !starterAvailable ? 'is-primary' : 'is-secondary'}`}
                  onClick={() => {
                    if (surface === 'preview') openContentSurface('work')
                    else previewPage()
                  }}
                  type="button"
                >
                  {websiteSurfaceActionLabel}
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
                ) : storageMode === 'managed' ? canReview ? (
                  <button className="website-button is-primary" onClick={() => openWorkspaceView('publish')} type="button">
                    Prepare file
                  </button>
                ) : null : localPreviewReady ? (
                  <button className="website-button is-primary" onClick={downloadTrialSite} type="button">
                    Download preview
                  </button>
                ) : null}
                </div>
              ) : null}
              {activeRemovedDraftPage ? (
                <div
                  className="website-section-remove-recovery website-page-remove-recovery"
                  data-website-page-remove-recovery={activeRemovedDraftPage.page.id}
                  role="status"
                >
                  <div>
                    <strong>{activeRemovedDraftPage.page.internalName.trim() || 'Untitled page'} removed</strong>
                    <small>Undo restores page {activeRemovedDraftPage.index + 1} with all content and navigation. Nothing was saved or published.</small>
                  </div>
                  <button
                    aria-label={`Undo remove ${activeRemovedDraftPage.page.internalName.trim() || 'untitled page'}`}
                    className="website-button is-secondary"
                    onClick={undoPageRemoval}
                    ref={pageRemovalActionRef}
                    type="button"
                  >
                    Undo remove
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {!starterSetupActive ? <details className="website-start-tools website-business-controls">
            <summary><span><strong>Inquiries</strong><small>Capture, assign, decide, export</small></span><b>{leadCounts.new} new</b></summary>
            <div className="website-business-controls-content">
              <section aria-labelledby="website-lead-inbox-title" className="website-lead-inbox" id="website-lead-inbox">
                <header>
                  <div><span className="core-eyebrow">Inquiry inbox</span><h2 id="website-lead-inbox-title" tabIndex={-1}>Capture customer inquiries</h2><p>{storageMode === 'managed' ? 'Saved with owner and decision history.' : 'Contact data stays in this browser.'} Nothing is sent.</p></div>
                  <div className="website-lead-counts"><span><strong>{leadCounts.new}</strong><small>New</small></span><span><strong>{leadCounts.qualified}</strong><small>Qualified</small></span><span><strong>{leadCounts.closed}</strong><small>Closed</small></span></div>
                </header>

                <form className="website-lead-capture-form" onSubmit={captureDemoInquiry}>
                  <label>Name<input autoComplete="name" maxLength={80} onChange={(event) => setLeadDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Customer name" required value={leadDraft.name} /></label>
                  <label>Phone or email<input autoComplete="email" maxLength={120} onChange={(event) => setLeadDraft((current) => ({ ...current, contact: event.target.value }))} placeholder="09… or name@example.com" required value={leadDraft.contact} /></label>
                  <label className="website-lead-request">What do they need?<textarea maxLength={500} onChange={(event) => setLeadDraft((current) => ({ ...current, request: event.target.value }))} placeholder="Product, service, quantity, timing, or question" required rows={3} value={leadDraft.request} /></label>
                  <label className="website-lead-consent"><input checked={leadDraft.consentRecorded} onChange={(event) => setLeadDraft((current) => ({ ...current, consentRecorded: event.target.checked }))} required type="checkbox" /> Customer agreed to save these contact details for follow-up.</label>
                  <button className="website-button is-primary is-compact" disabled={!readyBuyerCtaPages.length} type="submit">Add inquiry</button>
                  {!readyBuyerCtaPages.length ? <small className="website-field-error">Add a ready page with a contact action first.</small> : null}
                </form>

                {websiteLeads.length ? <div className="website-lead-review-controls"><label>Responsible person<input maxLength={120} onChange={(event) => setLeadOwner(event.target.value)} placeholder="Name or role" value={leadOwner} /></label><label>Decision note <small>optional</small><input maxLength={500} onChange={(event) => setLeadDecisionNote(event.target.value)} placeholder="Need, budget, timing, or closure reason" value={leadDecisionNote} /></label></div> : null}
                <div className="website-lead-list">
                  {websiteLeads.length ? websiteLeads.slice(0, 8).map((lead) => <article data-status={lead.status} key={lead.id}>
                    <div><span>{lead.status}</span><strong>{lead.name}</strong><small>{lead.contact} · {lead.sourcePage} · {formatRecoveryDate(lead.createdAt)}</small><p>{lead.request}</p>{lead.owner ? <small>Person: {lead.owner}{lead.decisionNote ? ` · ${lead.decisionNote}` : ''}</small> : null}</div>
                    {lead.status !== 'closed' ? <div><button className="website-button is-secondary is-compact" disabled={leadOwner.trim().length < 2} onClick={() => decideLead(lead.id, 'qualified')} type="button">Qualify</button><button className="website-button is-quiet is-compact" disabled={leadOwner.trim().length < 2} onClick={() => decideLead(lead.id, 'closed')} type="button">Close</button></div> : null}
                  </article>) : <p className="website-lead-empty">No inquiry yet.</p>}
                </div>
                {websiteLeads.length ? <a className="website-button is-secondary is-compact website-lead-export" download={`website-leads-${workspace.siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'site'}.json`} href={leadExportHref}>Export inquiries</a> : null}
              </section>
            </div>
          </details> : null}

          <div
            aria-label={view === 'content' ? 'Edit' : 'Publish'}
            className={'website-workspace-grid view-' + view}
            data-surface={surface}
            id="website-active-panel"
            role="region"
          >
            <div className="website-work-surface">
              {view === 'content' ? (
                starterSetupActive ? (
                  <WebsiteStarterSetup
                    onCreate={startWithBusiness}
                    onViewSample={viewWebsiteSample}
                  />
                ) : (
                  <ContentWorkspace
                    canDuplicate={editorWorkspace.pages.length < MAX_WEBSITE_PAGES}
                    deleteArmed={deleteCandidateId === selectedPage.id}
                    onDuplicate={copySelectedPage}
                    onRequestDelete={requestDeletePage}
                    onUpdatePage={(update) => updatePage(selectedPage.id, update)}
                    page={selectedPage}
                  />
                )
              ) : null}

              {view === 'publish' ? (
                storageMode !== 'session-only' ? (
                  <PublishWorkspace
                    approvalIsCurrent={approvalIsCurrent}
                    checks={checks}
                    currentPublishId={publish?.id ?? ''}
                    fingerprint={fingerprint}
                    managedActorId={managedActorId}
                    managedReleaseRecords={storageMode === 'managed' ? workspace.releaseRecords ?? [] : undefined}
                    onAddEvidence={addEvidence}
                    onApprove={approveCurrentRevision}
                    onDownloadPublish={downloadPublishedSite}
                    onRecordPublish={recordLocalPublish}
                    onSaveManagedRelease={storageMode === 'managed' ? saveManagedRelease : undefined}
                    publishIsCurrent={publishIsCurrent}
                    workspace={workspace}
                  />
                ) : (
                  <TrialReadyWorkspace
                    checks={checks}
                    onDownload={downloadTrialSite}
                    retentionLabel="Available in this session"
                    workspace={workspace}
                  />
                )
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
