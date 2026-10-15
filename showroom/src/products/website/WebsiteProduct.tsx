import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { recordBehaviorSignal } from '../../core/behavior-trail'
import { emitMetric } from '../../analytics/metrics-collector'
import {
  readLocalSetupBusinessName,
  readLocalShopBusinessTemplateId,
} from '../../core/product-onboarding-runtime'
import { ContentWorkspace } from './ContentWorkspace'
import { NavigationWorkspace } from './NavigationWorkspace'
import { PublishWorkspace } from './PublishWorkspace'
import { SitePreview } from './SitePreview'
import { WebsiteReviewInbox } from './WebsiteReviewInbox'
import { WebsiteStarterSetup } from './WebsiteStarterSetup'
import { useWebsiteWorkspace } from './useWebsiteWorkspace'
import { createWebsiteHtmlDownload } from './website-export'
import { websiteDraftDifference } from './website-draft-difference'
import {
  captureWebsiteLead,
  emptyWebsiteLeadLedger,
  readWebsiteLeadLedger,
  reviewWebsiteLead,
  websiteInboxLeads,
  websiteLeadCounts,
  writeWebsiteLeadLedger,
  WEBSITE_LEAD_LEDGER_KEY,
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
  pageIssues,
  readinessChecks,
  readWebsiteRecoveryArchive,
  recordWebsiteEvidence,
  recordWebsiteSnapshot,
  restoreWebsiteEditSession,
  updateWebsiteEditSession,
  websiteEditSessionMatches,
  websiteEditSessionStorageKey,
  workspaceFingerprint,
  type EvidenceKind,
  type PreviewDevice,
  type ReadinessCheck,
  type WebsiteEditSession,
  type WebsitePage,
  type WebsiteRecoveryArchiveSummary,
  type WebsiteWorkspace,
  type WebsiteWorkspaceUpdate,
} from './website-model'
import './website-product.css'

type WebsiteView = 'content' | 'inquiries' | 'publish'

type WebsiteEditSessionState = {
  scope: string
  session: WebsiteEditSession
}

const DEFAULT_NOTICE = 'Website ready to edit. Nothing has been published.'

const viewCopy: Record<WebsiteView, { title: string; copy: string }> = {
  content: {
    title: 'Pages',
    copy: 'Build and maintain the pages customers see.',
  },
  inquiries: {
    title: 'Inquiries',
    copy: 'Capture requests, assign responsibility and record the next decision.',
  },
  publish: {
    title: 'Prepare website file',
    copy: 'Check the pages, record review notes, then download the approved website file.',
  },
}

function DownloadWorkspace({
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
    <section className="website-editor-panel website-download" aria-labelledby="website-ready-title">
      <header className="website-panel-head">
        <div>
          <span className="website-eyebrow">Ready to use</span>
          <h2 id="website-ready-title">Download your website</h2>
          <p>Open one file on any phone or computer, or hand it to a hosting provider.</p>
        </div>
        <span className="website-status is-ready">Ready</span>
      </header>

      <div className="website-editor-scroll website-download-body">
        <div className="website-download-summary">
          <span>{retentionLabel}</span>
          <strong>{workspace.siteName}</strong>
          <p>{readyPages.length} ready page{readyPages.length === 1 ? '' : 's'} · {passedChecks}/{websiteChecks.length} website checks passed</p>
        </div>

        <ol className="website-download-steps">
          <li>
            <span aria-hidden="true">1</span>
            <div><strong>Review</strong><p>Open Website view to check the page on the screen you use every day.</p></div>
          </li>
          <li>
            <span aria-hidden="true">2</span>
            <div><strong>Download</strong><p>Get a standalone HTML website with your ready pages.</p></div>
          </li>
        </ol>

        <div className="website-download-boundary" role="note">
          <strong>Not online yet</strong>
          <span>Downloading does not deploy a site, connect a domain, or send customer data.</span>
        </div>

        <button className="website-button is-primary website-download-action" onClick={onDownload} type="button">
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
    managedWorkspaceId,
    canWrite,
  } = useWebsiteWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view')
  const [surface, setSurface] = useState<'work' | 'preview'>(() => isUntouchedWebsiteStarter(workspace) ? 'work' : 'preview')
  const [selectedPageId, setSelectedPageId] = useState(workspace.selectedPageId)
  const [siteSettingsOpen, setSiteSettingsOpen] = useState(false)
  const [starterDismissed, setStarterDismissed] = useState(() => !isUntouchedWebsiteStarter(workspace))
  const [editSessionState, setEditSessionState] = useState<WebsiteEditSessionState | null>(null)
  const [restoredDraftState, setRestoredDraftState] = useState<WebsiteEditSessionState | null>(null)
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
  const siteSettingsRef = useRef<HTMLDetailsElement>(null)
  const previousRequestedViewRef = useRef(requestedView)
  useEffect(() => {
    const disclosure = siteSettingsRef.current
    if (!siteSettingsOpen || !disclosure) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setSiteSettingsOpen(false)
      disclosure.querySelector('summary')?.focus()
    }
    disclosure.addEventListener('keydown', closeOnEscape)
    return () => disclosure.removeEventListener('keydown', closeOnEscape)
  }, [siteSettingsOpen])
  const recoveryPrimaryActionRef = useRef<HTMLButtonElement>(null)
  const editSessionRef = useRef<WebsiteEditSessionState | null>(null)
  const restoredDraftHeadingRef = useRef<HTMLHeadingElement>(null)
  const [device, setDevice] = useState<PreviewDevice>(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
      ? 'mobile'
      : typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches
        ? 'tablet'
        : 'desktop'
  ))
  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 720px)')
    const tabletQuery = window.matchMedia('(max-width: 1024px)')
    const syncPreviewDevice = () => setDevice(mobileQuery.matches ? 'mobile' : tabletQuery.matches ? 'tablet' : 'desktop')
    syncPreviewDevice()
    mobileQuery.addEventListener('change', syncPreviewDevice)
    tabletQuery.addEventListener('change', syncPreviewDevice)
    return () => {
      mobileQuery.removeEventListener('change', syncPreviewDevice)
      tabletQuery.removeEventListener('change', syncPreviewDevice)
    }
  }, [])
  const [notice, setNotice] = useState(DEFAULT_NOTICE)
  const [deleteCandidateId, setDeleteCandidateId] = useState('')
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
  const pendingRestoredDraft = restoredDraftState?.scope === editSessionScope ? restoredDraftState : null
  const editorWorkspace = activeEditSession?.workspace ?? workspace
  const selectedPage = editorWorkspace.pages.find((page) => page.id === selectedPageId)
    ?? editorWorkspace.pages.find((page) => page.id === editorWorkspace.selectedPageId)
    ?? editorWorkspace.pages[0]
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
  const portalViewOnly = storageMode === 'managed' && !canWrite
  const workingSampleTemplate = workspace.workingSample
    ? websiteStarterTemplates.find((template) => template.id === workspace.workingSample?.templateId) ?? null
    : null
  const workingSampleIsCurrent = Boolean(workspace.workingSample
    && workspace.workingSample.contentFingerprint === fingerprint)
  const canReview = !hasUnsavedChanges && !starterAvailable && contentChecksPass
  const view: WebsiteView = requestedView === 'inquiries'
    ? 'inquiries'
    : requestedView === 'publish' && canReview
      ? 'publish'
      : 'content'
  // Read once for the life of this screen. The setup component is required to stay free of
  // device reads, so the shell does it and hands the answer down as a prop.
  const [shopTradeId] = useState(readLocalShopBusinessTemplateId)
  const [shopBusinessName] = useState(readLocalSetupBusinessName)
  const starterSetupActive = view === 'content' && starterAvailable && !starterDismissed
  const activeViewCopy = view === 'content' && starterAvailable && surface === 'preview'
    ? {
        title: 'Pages',
        copy: 'Edit your pages and download your website.',
      }
    : starterSetupActive
    ? {
        title: 'Your website',
        copy: 'Add your business details to prepare your pages.',
      }
    : view === 'content' && surface === 'preview'
    ? {
        title: hasUnsavedChanges ? 'Unsaved changes' : 'Pages',
        copy: hasUnsavedChanges
          ? 'Your changes are not saved. Return to edit to save or discard them.'
          : selectedPage.stage === 'draft'
            ? 'This page is saved as a draft. Select Edit website to update it and mark it ready.'
            : 'Edit your pages, review inquiries and download your site.',
      }
    : view === 'inquiries'
      ? viewCopy.inquiries
    : view === 'publish' && storageMode === 'session-only'
      ? {
          title: 'Your website is ready',
          copy: 'Download it now. Go live only after final review.',
        }
      : viewCopy[view]
  const savedStateNotice = storageMode === 'managed'
    ? portalViewOnly
      ? 'View only — ask a company owner to assign Website operator access.'
      : 'Changes are saved to this company account. Nothing has been deployed.'
    : storageMode === 'browser-local'
      ? 'Changes are saved on this device. Nothing has been deployed.'
      : 'Changes last for this session only. Nothing has been deployed.'
  const saveStateLabel = starterAvailable
    ? 'Add business details'
    : editConflict
    ? 'Saved version changed'
    : hasUnsavedChanges
      ? 'Unsaved changes'
      : storageMode === 'managed'
        ? 'Saved to company'
        : storageMode === 'browser-local'
          ? 'Saved on this device'
          : 'Session only'
  const websiteSurfaceActionLabel = surface === 'preview'
    ? 'Edit website'
    : 'View website'
  const showWebsiteEditorAction = true
  const visiblePageCount = editorWorkspace.pages.filter((page) => page.navigation.visible).length
  const statusNotice = editConflict
    ? 'The saved Website changed after this edit session started. Your draft is preserved, but it cannot overwrite the newer version. Discard it and review the saved website.'
    : storageIssue || (notice === DEFAULT_NOTICE ? savedStateNotice : notice)
  const noticePriority = editConflict || storageIssue ? 'error' : notice === DEFAULT_NOTICE ? 'routine' : 'update'
  const repairArmed = canRepairLocalStorage
    && repairCandidateRevision > 0
    && repairConfirmationRevision === repairCandidateRevision

  useEffect(() => {
    if (!hasUnsavedChanges || typeof window === 'undefined') return
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [hasUnsavedChanges])

  useEffect(() => {
    document.title = 'Sites | SuperMega'
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    if (requestedView === null || requestedView === 'publish' || requestedView === 'inquiries') return
    const next = new URLSearchParams(searchParams)
    next.delete('view')
    setSearchParams(next, { replace: true })
  }, [requestedView, searchParams, setSearchParams])

  useEffect(() => {
    if (typeof window === 'undefined' || !editSessionScope) return
    if (editSessionRef.current?.scope === editSessionScope) return
    const restoreTimer = window.setTimeout(() => {
      if (editSessionRef.current?.scope === editSessionScope) return
      const storageKey = websiteEditSessionStorageKey(editSessionScope)
      try {
        const raw = window.sessionStorage.getItem(storageKey)
        const restored = raw ? restoreWebsiteEditSession(raw) : null
        const next = restored ? { scope: editSessionScope, session: restored } : null
        if (raw && !restored) window.sessionStorage.removeItem(storageKey)
        editSessionRef.current = null
        setEditSessionState(null)
        setRestoredDraftState(next)
      } catch {
        editSessionRef.current = null
        setEditSessionState(null)
        setRestoredDraftState(null)
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
    if (typeof window === 'undefined') return
    function refreshLeadLedgerFromStorage(event: StorageEvent) {
      if (event.storageArea !== window.localStorage || event.key !== WEBSITE_LEAD_LEDGER_KEY) return
      try {
        setLocalLeadLedger(readWebsiteLeadLedger(window.localStorage))
      } catch {
        setLocalLeadLedger(emptyWebsiteLeadLedger())
      }
    }
    window.addEventListener('storage', refreshLeadLedgerFromStorage)
    return () => window.removeEventListener('storage', refreshLeadLedgerFromStorage)
  }, [])

  useEffect(() => {
    if (headingFocusRequest > 0) headingRef.current?.focus()
  }, [headingFocusRequest])

  useEffect(() => {
    if (previousRequestedViewRef.current === requestedView) return
    previousRequestedViewRef.current = requestedView
    setSurface('work')
    setSiteSettingsOpen(false)
    setHeadingFocusRequest((current) => current + 1)
  }, [requestedView])

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
      setNotice('Save or discard the unsaved Website draft before reviewing the file checklist.')
      return
    }
    if (nextView === 'publish' && !canReview) {
      setNotice('Finish and save every page before reviewing the file checklist.')
      return
    }
    const next = new URLSearchParams(searchParams)
    if (nextView === 'publish') next.set('view', 'publish')
    else if (nextView === 'inquiries') next.set('view', 'inquiries')
    else next.delete('view')
    setSearchParams(next)
    setSurface('work')
    setSiteSettingsOpen(false)
    requestHeadingFocus()
  }

  function openContentSurface(nextSurface: 'work' | 'preview') {
    setSurface(nextSurface)
    if (nextSurface === 'preview') emitMetric({ product: 'website', capability: 'website-builder', action: 'preview.opened', ts: Date.now() })
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
      window.sessionStorage.setItem(websiteEditSessionStorageKey(next.scope), JSON.stringify(next.session))
    } catch {
      setNotice('The unsaved draft is held in this tab only. Browser draft recovery is unavailable, but Save and Discard still work.')
    }
  }

  function clearEditSession(target = editSessionRef.current) {
    if (target) {
      try {
        window.sessionStorage.removeItem(websiteEditSessionStorageKey(target.scope))
      } catch {
        // The in-memory edit session can still be cleared safely.
      }
    }
    replaceEditSession(null)
  }

  function focusRestoredDraftChoice() {
    requestAnimationFrame(() => restoredDraftHeadingRef.current?.focus())
  }

  function continueRestoredDraft() {
    if (!pendingRestoredDraft) return
    replaceEditSession(pendingRestoredDraft)
    setRestoredDraftState(null)
    setSelectedPageId(pendingRestoredDraft.session.workspace.selectedPageId)
    setStarterDismissed(true)
    setSurface('work')
    setSiteSettingsOpen(false)
    requestHeadingFocus()
    setNotice(`Continuing the unsaved ${pendingRestoredDraft.session.workspace.siteName} tab draft. The saved ${workspace.siteName} Website has not been overwritten or deployed.`)
  }

  function startFromCurrentWebsite() {
    if (!pendingRestoredDraft) return
    try {
      window.sessionStorage.removeItem(websiteEditSessionStorageKey(pendingRestoredDraft.scope))
    } catch {
      setNotice('The older tab draft could not be discarded safely. It remains held aside; retry before editing the current Website.')
      focusRestoredDraftChoice()
      return
    }
    setRestoredDraftState(null)
    replaceEditSession(null)
    setSelectedPageId(workspace.selectedPageId)
    setStarterDismissed(!isUntouchedWebsiteStarter(workspace))
    setSurface('work')
    setSiteSettingsOpen(false)
    requestHeadingFocus()
    setNotice(`Started from the current ${workspace.siteName} ${isUntouchedWebsiteStarter(workspace) ? 'starting design' : 'saved Website'}. The older tab draft was discarded; nothing was deployed.`)
  }

  function stageWorkspace(update: WebsiteWorkspaceUpdate) {
    if (savingDraft) {
      setNotice('Website Save is still being confirmed. Wait for it to finish before making another change.')
      return null
    }
    if (pendingRestoredDraft) {
      setNotice('Choose the saved tab draft or the current Website before editing. Nothing has been overwritten.')
      focusRestoredDraftChoice()
      return null
    }
    if (!editSessionScope) {
      setNotice('Sites workspace is still loading. Try the edit again.')
      return null
    }
    const retained = editSessionRef.current
    if (retained && retained.scope !== editSessionScope) {
      setNotice('Sites workspace identity changed. Review the loaded workspace before editing.')
      return null
    }
    const base = retained?.session ?? createWebsiteEditSession(workspace)
    if (!websiteEditSessionMatches(base, workspace)) {
      setNotice('The saved Website changed after this edit session started. Discard the draft before making more changes.')
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
      setNotice('This draft started from an older saved version. Nothing was overwritten; discard it and review the newer Website.')
      return
    }
    setSavingDraft(true)
    const result = await commitWorkspace(
      (current) => commitWebsiteEditSession(current, retained.session),
      '',
    )
    setSavingDraft(false)
    if (!result.ok) return
    emitMetric({ product: 'website', capability: 'website-builder', action: 'edit.saved', ts: Date.now() })
    if (editSessionRef.current === retained) clearEditSession(retained)
    setNotice(result.changed
      ? `Website saved once as content revision ${result.workspace.contentRevision}. Nothing was deployed.`
      : 'The draft already matched the saved Website. No revision was added.')
  }

  function discardDraft() {
    if (!activeEditSession || savingDraft) return
    clearEditSession()
    setDeleteCandidateId('')
    setStarterDismissed(true)
    setSurface('preview')
    setSiteSettingsOpen(false)
    requestHeadingFocus()
    setNotice('Unsaved Website changes discarded. The saved website was not changed.')
  }

  function requireSavedWorkspace(action: string) {
    if (!hasUnsavedChanges) return true
    setNotice(`Save or discard the unsaved Website draft before ${action}.`)
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
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
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
      setNotice('New page added to the unsaved draft.')
    }
  }

  function startWithBusiness(brief: WebsiteStarterBrief) {
    if (!starterAvailable) {
      setNotice('This setup has already changed. Nothing was replaced.')
      return false
    }
    const staged = stageWorkspace((current) => (
      applyWebsiteStarterBrief(current, brief, new Date().toISOString())
    ))
    if (!staged) {
      setNotice('The business brief was not applied. Review every required field and try again.')
      return false
    }
    setSelectedPageId(staged.workspace.selectedPageId)
    setStarterDismissed(true)
    openContentSurface('work')
    recordBehaviorSignal(window.localStorage, {
      event: 'agent_job_chosen',
      product: 'website',
      route: location.pathname + location.search,
      detail: `Website starter brief generated: ${brief.businessName}`,
    })
    setNotice('Review Home, mark each page ready, then save.')
    return true
  }

  function openStarterSetup() {
    setStarterDismissed(false)
    setSurface('work')
    setSiteSettingsOpen(false)
    requestHeadingFocus()
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
      setNotice('Page copy added to the unsaved draft with navigation hidden.')
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
      setNotice('Draft page removed from the website draft.')
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
    if (staged) setNotice('Navigation order changed in the website draft.')
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
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
      setNotice(`${download.filename} downloaded. No site or domain was changed.`)
    } catch (error) {
      setNotice('The retained site file failed closed: ' + (error instanceof Error ? error.message : 'unknown export error'))
    }
  }

  function downloadWebsiteFile() {
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
      try {
        recordBehaviorSignal(window.localStorage, {
          event: 'first_value_completed',
          product: 'website',
          route: location.pathname + location.search,
          detail: 'Produced a reviewable Website file from saved content.',
        })
        emitMetric({ product: 'website', capability: 'website-builder', action: 'file.downloaded', ts: Date.now() })
      } catch {
        // Optional telemetry cannot turn a requested download into a failure.
      }
      setNotice(`${download.filename} downloaded. It is a standalone website file; no site or domain was deployed.`)
    } catch (error) {
      setNotice('The Website download failed closed: ' + (error instanceof Error ? error.message : 'unknown export error'))
    }
  }

  const failingContentChecks = checks.filter((check) => !check.id.startsWith('evidence-') && !check.passed)
  const selectedPageIssues = pageIssues(selectedPage)
  const nextDraftPage = editorWorkspace.pages.find((page) => page.id !== selectedPage.id && page.stage === 'draft')
  // Inbox membership follows the ledger this workspace owns, not the name shown on the site.
  // Filtering these two on workspace.siteName meant one rename in Navigation emptied the inbox,
  // the "N new" badge, and the export -- with every captured inquiry still sitting on disk.
  const websiteLeads = websiteInboxLeads(leadLedger)
  const leadCounts = websiteLeadCounts(leadLedger)
  const releaseRecordRequired = storageMode === 'managed'
  const localPreviewReady = storageMode !== 'managed' && !starterAvailable && !hasUnsavedChanges && contentChecksPass
  const websiteTodayStep = storageIssue || canRepairLocalStorage
    ? 'recover'
    : pendingRestoredDraft
      ? 'edit'
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
    ? 'Recover Sites workspace'
    : pendingRestoredDraft
      ? 'Choose which Website to customize'
    : starterSetupActive
      ? 'Answer 5 questions'
    : starterAvailable
        ? 'Add business details'
        : hasUnsavedChanges
          ? 'Save or discard edits'
          : localPreviewReady
            ? 'Download your website'
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
    ? 'Saving or recovery needs attention before Website work can be trusted.'
    : pendingRestoredDraft
      ? `This tab has an unsaved ${pendingRestoredDraft.session.workspace.siteName} draft, while the current Website is ${workspace.siteName}. Choose one before editing.`
    : starterSetupActive
      ? 'Answer a short brief to prepare client-specific pages.'
      : starterAvailable
        ? 'Add the business details once. SuperMega will prepare the pages, wording and navigation.'
        : hasUnsavedChanges
          ? 'Save the draft or discard it before review.'
          : localPreviewReady
            ? 'Download an HTML file of your saved site. This does not publish it.'
          : failingContentChecks.length
            ? `${failingContentChecks.length} page check${failingContentChecks.length === 1 ? '' : 's'} need attention before the website file is ready.`
            : leadCounts.new
              ? `${leadCounts.new} new inquir${leadCounts.new === 1 ? 'y needs' : 'ies need'} a responsible person and a local decision before follow-up.`
              : releaseRecordRequired && !approvalIsCurrent
                ? 'Final review is required before a website file is saved.'
                : releaseRecordRequired && !publishIsCurrent
                  ? 'Save a static release file for the approved website.'
                  : releaseRecordRequired
                    ? 'Review the go-live checklist. Deployment still happens separately.'
                    : 'Your reviewed site is ready to download. Nothing is deployed here.'
  const websiteAgentActionLabel = storageIssue || canRepairLocalStorage
    ? 'Open recovery'
    : pendingRestoredDraft
      ? 'Choose Website'
    : starterSetupActive || starterAvailable
      ? 'Add business details'
      : hasUnsavedChanges
        ? 'Review edits'
        : localPreviewReady
          ? 'Download website file'
        : failingContentChecks.length
          ? 'Fix page checks'
        : leadCounts.new
          ? 'Review inquiries'
          : releaseRecordRequired && !approvalIsCurrent
            ? 'Review website'
            : releaseRecordRequired && !publishIsCurrent
              ? 'Create site file'
              : releaseRecordRequired
                ? 'Download or go live'
                : 'Download website'
  const websiteTodayState = storageIssue || canRepairLocalStorage
    ? 'blocked'
    : pendingRestoredDraft
      ? 'attention'
    : starterAvailable || starterSetupActive
      ? 'setup'
      : hasUnsavedChanges || failingContentChecks.length || leadCounts.new
        ? 'attention'
        : 'ready'
  const statusWorkspace = hasUnsavedChanges ? editorWorkspace : workspace
  const readyPageCount = statusWorkspace.pages.filter((page) => page.stage === 'ready').length
  const readinessSummary = hasUnsavedChanges
    ? 'Review draft'
    : failingContentChecks.length
      ? `${failingContentChecks.length} to fix`
      : 'Checks clear'
  const websiteWorkflowSteps = [
    {
      id: 'brief',
      label: 'Business brief',
      detail: starterAvailable || starterSetupActive ? 'Add details' : 'Complete',
      state: starterAvailable || starterSetupActive ? 'current' : 'complete',
    },
    {
      id: 'pages',
      label: 'Pages',
      detail: `${readyPageCount}/${statusWorkspace.pages.length} ready`,
      state: starterAvailable || starterSetupActive
        ? 'waiting'
        : hasUnsavedChanges || failingContentChecks.length
          ? 'current'
          : 'complete',
    },
    {
      id: 'review',
      label: 'Review',
      detail: releaseRecordRequired
        ? approvalIsCurrent ? 'Recorded' : 'Owner approval'
        : readinessSummary,
      state: starterAvailable || starterSetupActive || hasUnsavedChanges || failingContentChecks.length
        ? 'waiting'
        : releaseRecordRequired && !approvalIsCurrent
          ? 'current'
          : 'complete',
    },
    {
      id: 'file',
      label: 'Website file',
      detail: releaseRecordRequired
        ? publishIsCurrent ? 'Ready' : approvalIsCurrent ? 'Create file' : 'After review'
        : localPreviewReady ? 'Ready to download' : 'After review',
      state: releaseRecordRequired && publishIsCurrent
        ? 'complete'
        : releaseRecordRequired
          ? approvalIsCurrent && !hasUnsavedChanges && !failingContentChecks.length ? 'current' : 'waiting'
          : localPreviewReady ? 'current' : 'waiting',
    },
  ] as const
  const websiteTodaySource = storageMode === 'managed'
    ? `Company account · ${managedActorId || 'signed in'}`
    : storageMode === 'browser-local'
      ? 'Saved on this device'
      : 'Available in this browser session'
  const editingRoutineStatus = view === 'content' && surface === 'work'
    && websiteTodayState === 'ready' && !pendingRestoredDraft
    && !storageIssue && !canRepairLocalStorage
  const websiteTodayOwner = portalViewOnly ? 'Company owner' : 'Website operator'
  const websiteTodayContext = `${workingSampleTemplate
    ? `${workingSampleTemplate.label} ${workingSampleIsCurrent ? 'current layout' : 'selected layout'} · ${websiteTodaySource}`
    : websiteTodaySource} · Next owner: ${websiteTodayOwner}`
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
    if (pendingRestoredDraft) {
      focusRestoredDraftChoice()
      return
    }
    if (starterAvailable || starterSetupActive) {
      openStarterSetup()
      return
    }
    if (localPreviewReady) {
      downloadWebsiteFile()
      return
    }
    if (hasUnsavedChanges || failingContentChecks.length) {
      openContentSurface('work')
      return
    }
    if (leadCounts.new) {
      openWorkspaceView('inquiries')
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

  async function captureInquiry(event: FormEvent<HTMLFormElement>) {
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
        setNotice('Inquiry saved to the company Website inbox for manager review. No message, CRM write, or external send ran.')
        return
      }
      if (saveLeadLedger(next, 'Inquiry saved to the local Website inbox. No message, CRM write, or external send ran.')) {
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
          ? 'Inquiry qualified and assigned in this company account. No customer message was sent.'
          : 'Inquiry closed in this company account. No customer message was sent.')
        return
      }
      if (saveLeadLedger(next, status === 'qualified'
        ? 'Inquiry qualified and assigned locally. No customer message was sent.'
        : 'Inquiry closed locally. No customer message was sent.')) setLeadDecisionNote('')
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
                ? 'SuperMega will keep a recovery copy on this device, then restore saving with the valid Website shown here. Nothing will be published; Shop, Plant, company data, and domains stay unchanged.'
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

          <header aria-label={view === 'content' ? 'Edit page' : view === 'inquiries' ? 'Manage inquiries' : 'Publish website'} className="website-heading" data-view={view}>
            <div>
              <h1 ref={headingRef} tabIndex={-1}>{activeViewCopy.title}</h1>
              <p>{activeViewCopy.copy}</p>
            </div>
            {view === 'publish' ? (
              <button className="website-button is-secondary" onClick={() => openWorkspaceView('content')} type="button">Back to edit</button>
            ) : null}
          </header>

          {!starterSetupActive ? <nav aria-label="Sites workspace" className="website-mode-nav">
            <button aria-current={view === 'content' ? 'page' : undefined} onClick={() => openWorkspaceView('content')} type="button">Pages</button>
            <button aria-current={view === 'inquiries' ? 'page' : undefined} onClick={() => openWorkspaceView('inquiries')} type="button">
              Inquiries{leadCounts.new ? <span>{leadCounts.new}</span> : null}
            </button>
            <button
              aria-current={view === 'publish' ? 'page' : undefined}
              disabled={!canReview}
              onClick={() => openWorkspaceView('publish')}
              title={!canReview ? 'Finish and save every page before preparing the website file' : undefined}
              type="button"
            >
              Publish
            </button>
          </nav> : null}

          {pendingRestoredDraft ? (
            <section aria-labelledby="website-restored-draft-title" className="website-restored-draft-choice">
              <div>
                <span className="core-eyebrow">Unsaved tab draft found</span>
                <h2 id="website-restored-draft-title" ref={restoredDraftHeadingRef} tabIndex={-1}>Choose what to customize</h2>
                <p>
                  Current {isUntouchedWebsiteStarter(workspace) ? 'starter Website' : 'saved Website'}: <strong>{workspace.siteName}</strong>.
                  {' '}Unsaved tab draft: <strong>{pendingRestoredDraft.session.workspace.siteName}</strong>.
                </p>
                <p>{websiteDraftDifference(workspace, pendingRestoredDraft.session.workspace)}</p>
                <small>SuperMega held the older draft aside. Nothing was overwritten, deployed, published, or sent.</small>
              </div>
              <div className="website-restored-draft-actions">
                <button className="website-button is-secondary" onClick={continueRestoredDraft} type="button">Continue saved draft</button>
                <button className="website-button is-primary" onClick={startFromCurrentWebsite} type="button">
                  Start from this Website
                </button>
              </div>
            </section>
          ) : null}

          {view === 'content' && !starterSetupActive ? <details className="website-status-disclosure" data-editing-routine={editingRoutineStatus} open={!editingRoutineStatus}>
            <summary>Site status · {websiteAgentJob}</summary>
            <section aria-label="Website status" className="website-today" data-state={websiteTodayState} data-step={websiteTodayStep}>
            <div className="website-today-priority">
              <span className="core-eyebrow">Next action</span>
              <h2 id="website-today-title">{websiteAgentJob}</h2>
              <p>{websiteAgentReason}</p>
              <button className="website-button is-primary is-compact" disabled={portalViewOnly} onClick={runWebsiteAutopilot} title={portalViewOnly ? 'Website operator access is required' : undefined} type="button">{portalViewOnly ? 'View only' : websiteAgentActionLabel}</button>
              <small className="website-today-context">{websiteTodayContext}</small>
            </div>
            <div className="website-today-signals">
              <ol aria-label="Website workflow" className="website-workflow-rail">
                {websiteWorkflowSteps.map((step, index) => (
                  <li aria-current={step.state === 'current' ? 'step' : undefined} data-state={step.state} key={step.id}>
                    <span aria-hidden="true">{step.state === 'complete' ? '✓' : index + 1}</span>
                    <div><small>{step.label}</small><strong>{step.detail}</strong></div>
                  </li>
                ))}
              </ol>
              <details className="website-today-checks">
                <summary>Review site checks · {readinessSummary}</summary>
                {hasUnsavedChanges ? (
                  <p className="website-check-guidance">Save or discard your draft before checking the saved website. These checks do not approve or publish it.</p>
                ) : failingContentChecks.length > 0 ? (
                  <div className="website-check-guidance">
                    <h3>Needs attention</h3>
                    <ul>
                      {failingContentChecks.map((check) => <li key={check.id}><strong>{check.label}</strong><p>{check.detail}</p></li>)}
                    </ul>
                  </div>
                ) : null}
              </details>
            </div>
          </section>
          </details> : null}

          {view === 'content' && !starterSetupActive ? (
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
                <div className="website-action-context">
                  <strong>{selectedPage.internalName || 'Untitled page'}</strong>
                  <span>{selectedPage.slug || 'No path'} · {selectedPage.stage}</span>
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
                    ref={siteSettingsRef}
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
                ) : null}
                {showWebsiteEditorAction ? <button
                  className={`website-button ${surface === 'preview' && !starterAvailable ? 'is-primary' : 'is-secondary'}`}
                  disabled={portalViewOnly && surface === 'preview'}
                  onClick={() => {
                    if (pendingRestoredDraft) {
                      focusRestoredDraftChoice()
                      return
                    }
                    if (surface === 'preview') openContentSurface('work')
                    else previewPage()
                  }}
                  type="button"
                >
                  {websiteSurfaceActionLabel}
                </button> : null}
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
                      title={editConflict ? 'Discard this draft and review the newer saved version' : 'Save all draft changes as one revision'}
                      type="button"
                    >
                      {savingDraft ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : storageMode === 'managed' ? canReview && !portalViewOnly ? (
                  <button className="website-button is-primary" onClick={() => openWorkspaceView('publish')} type="button">
                    Prepare file
                  </button>
                ) : null : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {view === 'content' && storageMode === 'managed' && canWrite && managedWorkspaceId && managedActorId
            ? <WebsiteReviewInbox key={`${managedWorkspaceId}:${managedActorId}`} workspaceId={managedWorkspaceId} actorId={managedActorId} /> : null}
          {view === 'inquiries' ? <section aria-labelledby="website-lead-inbox-title" className="website-inquiry-workspace" id="website-inquiries">
            <header className="website-inquiry-workspace-head">
              <div>
                <span className="core-eyebrow">Inquiry inbox</span>
                <h2 id="website-lead-inbox-title" tabIndex={-1}>{leadCounts.new ? `${leadCounts.new} ${leadCounts.new === 1 ? 'request needs' : 'requests need'} review` : 'Customer requests are up to date'}</h2>
                <p>{storageMode === 'managed' ? 'Inquiries stay in this company account with ownership and decision history.' : 'Contact data stays in this browser.'} Recording a decision does not message the customer or create a Shop order.</p>
              </div>
              <div aria-label="Inquiry status" className="website-lead-counts" role="group"><span><strong>{leadCounts.new}</strong><small>New</small></span><span><strong>{leadCounts.qualified}</strong><small>Qualified</small></span><span><strong>{leadCounts.closed}</strong><small>Closed</small></span></div>
            </header>

            <div className="website-inquiry-workspace-grid">
              <section aria-labelledby="website-inquiry-capture-title" className="website-inquiry-card website-inquiry-capture">
                <div className="website-inquiry-card-head"><span className="core-eyebrow">New request</span><h3 id="website-inquiry-capture-title">Add an inquiry</h3><p>Use this when a customer contacts the business by phone, message or in person.</p></div>
                <form className="website-lead-capture-form" onSubmit={captureInquiry}>
                  <label>Name<input autoComplete="name" disabled={portalViewOnly} maxLength={80} onChange={(event) => setLeadDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Customer name" required value={leadDraft.name} /></label>
                  <label>Phone or email<input autoComplete="email" disabled={portalViewOnly} maxLength={120} onChange={(event) => setLeadDraft((current) => ({ ...current, contact: event.target.value }))} placeholder="09… or name@example.com" required value={leadDraft.contact} /></label>
                  <label className="website-lead-request">Request<textarea disabled={portalViewOnly} maxLength={500} onChange={(event) => setLeadDraft((current) => ({ ...current, request: event.target.value }))} placeholder="What they need, quantity, timing and any question" required rows={4} value={leadDraft.request} /></label>
                  <label className="website-lead-consent"><input checked={leadDraft.consentRecorded} disabled={portalViewOnly} onChange={(event) => setLeadDraft((current) => ({ ...current, consentRecorded: event.target.checked }))} required type="checkbox" /> Customer agreed to save these contact details for follow-up.</label>
                  <button className="website-button is-primary" disabled={portalViewOnly} type="submit">{portalViewOnly ? 'View only' : 'Add to inbox'}</button>
                </form>
              </section>

              <section aria-labelledby="website-inquiry-queue-title" className="website-inquiry-card website-inquiry-queue" id="website-lead-inbox">
                <div className="website-inquiry-card-head website-inquiry-queue-head">
                  <div><span className="core-eyebrow">Follow-up queue</span><h3 id="website-inquiry-queue-title">Review and assign</h3><p>Record who owns the next step, then qualify or close the request.</p></div>
                  {websiteLeads.length ? <a className="website-button is-secondary is-compact website-lead-export" download={`website-leads-${workspace.siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'site'}.json`} href={leadExportHref}>Export</a> : null}
                </div>
                {websiteLeads.length ? <div className="website-lead-review-controls"><label>Responsible person<input maxLength={120} onChange={(event) => setLeadOwner(event.target.value)} placeholder="Name or role" value={leadOwner} /></label><label>Decision note <small>optional</small><input maxLength={500} onChange={(event) => setLeadDecisionNote(event.target.value)} placeholder="Need, budget, timing or closure reason" value={leadDecisionNote} /></label></div> : null}
                <div className="website-lead-list">
                  {websiteLeads.length ? websiteLeads.slice(0, 8).map((lead) => <article data-status={lead.status} key={lead.id}>
                    <div><span>{lead.status}</span><strong>{lead.name}</strong><small>{lead.contact} · {lead.sourcePage} · {formatRecoveryDate(lead.createdAt)}</small><p>{lead.request}</p>{lead.owner ? <small>Responsible: {lead.owner}{lead.decisionNote ? ` · ${lead.decisionNote}` : ''}</small> : null}</div>
                    {lead.status !== 'closed' ? <div><button className="website-button is-primary is-compact" disabled={portalViewOnly || leadOwner.trim().length < 2} onClick={() => decideLead(lead.id, 'qualified')} type="button">Qualify</button><button className="website-button is-quiet is-compact" disabled={portalViewOnly || leadOwner.trim().length < 2} onClick={() => decideLead(lead.id, 'closed')} type="button">Close</button></div> : null}
                  </article>) : <div className="website-lead-empty"><strong>No inquiries yet</strong><p>Add a request when a customer gets in touch. Nothing is sent automatically.</p></div>}
                </div>
              </section>
            </div>
          </section> : null}

          {view !== 'inquiries' ? <div
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
                    initialBusinessName={shopBusinessName}
                    initialTradeId={shopTradeId}
                    onCreate={startWithBusiness}
                  />
                ) : (
                  <div className="website-editor-workbench">
                    <nav aria-label="Website pages" className="website-page-rail">
                      <div className="website-page-rail-head">
                        <span>Pages</span>
                        <button
                          aria-label="Add page"
                          disabled={editorWorkspace.pages.length >= MAX_WEBSITE_PAGES}
                          onClick={addPage}
                          title={editorWorkspace.pages.length >= MAX_WEBSITE_PAGES ? 'The four-page workspace limit is reached' : 'Add page'}
                          type="button"
                        >
                          +
                        </button>
                      </div>
                      <ul className="website-page-list">
                        {editorWorkspace.pages.map((page) => (
                          <li key={page.id}>
                            <button
                              aria-current={page.id === selectedPage.id ? 'page' : undefined}
                              className={page.id === selectedPage.id ? 'is-active' : ''}
                              onClick={() => selectPage(page.id)}
                              type="button"
                            >
                              <span>{page.internalName || 'Untitled page'}</span>
                              <small>{page.slug || 'No path'}</small>
                              <i data-stage={page.stage}>{page.stage}</i>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </nav>

                    <ContentWorkspace
                      canDuplicate={editorWorkspace.pages.length < MAX_WEBSITE_PAGES}
                      deleteArmed={deleteCandidateId === selectedPage.id}
                      onDuplicate={copySelectedPage}
                      onRequestDelete={requestDeletePage}
                      onUpdatePage={(update) => updatePage(selectedPage.id, update)}
                      page={selectedPage}
                    />

                    <aside className="website-editor-insights">
                      <section aria-labelledby="website-page-checks-title" className="website-insight-card">
                        <header>
                          <div>
                            <span>Page checks</span>
                            <strong id="website-page-checks-title">{selectedPageIssues.length ? `${selectedPageIssues.length} to fix` : selectedPage.stage === 'ready' ? 'Ready' : 'Review'}</strong>
                          </div>
                          <b className={selectedPageIssues.length ? 'has-issues' : 'is-complete'}>{selectedPageIssues.length ? '!' : selectedPage.stage === 'ready' ? '✓' : '→'}</b>
                        </header>
                        {selectedPageIssues.length ? (
                          <ul>{selectedPageIssues.slice(0, 4).map((issue) => <li key={issue}>{issue}</li>)}</ul>
                        ) : (
                          <>
                            <p>{selectedPage.stage === 'ready' ? 'Ready for site checks.' : 'Checks pass. Review, then mark ready.'}</p>
                            {selectedPage.stage === 'draft' ? <button className="website-button is-primary is-compact" onClick={() => {
                              updatePage(selectedPage.id, (page) => ({ ...page, stage: 'ready' }))
                              if (nextDraftPage) setSelectedPageId(nextDraftPage.id)
                            }} type="button">{nextDraftPage ? 'Mark ready & next' : 'Mark page ready'}</button> : null}
                          </>
                        )}
                      </section>

                      <section aria-labelledby="website-inquiry-summary-title" className="website-insight-card">
                        <header>
                          <div>
                            <span>Inquiries</span>
                            <strong id="website-inquiry-summary-title">{leadCounts.new ? `${leadCounts.new} new` : 'Inbox clear'}</strong>
                          </div>
                          <b>{websiteLeads.length}</b>
                        </header>
                        <div className="website-inquiry-summary">
                          <span><strong>{leadCounts.new}</strong><small>New</small></span>
                          <span><strong>{leadCounts.qualified}</strong><small>Qualified</small></span>
                          <span><strong>{leadCounts.closed}</strong><small>Closed</small></span>
                        </div>
                        <button onClick={() => openWorkspaceView('inquiries')} type="button">Open inquiry workspace</button>
                      </section>
                    </aside>
                  </div>
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
                  <DownloadWorkspace
                    checks={checks}
                    onDownload={downloadWebsiteFile}
                    retentionLabel="Available in this session"
                    workspace={workspace}
                  />
                )
              ) : null}
            </div>

            <div className="website-preview-surface">

              <SitePreview
                device={device}
                onSelectPage={selectPage}
                page={selectedPage}
                pages={editorWorkspace.pages}
                siteName={editorWorkspace.siteName}
              />
            </div>
          </div> : null}

        </div>
      </div>
    </div>
  )
}
