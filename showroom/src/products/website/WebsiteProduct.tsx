import { useEffect, useRef, useState } from 'react'

import { ContentWorkspace } from './ContentWorkspace'
import { NavigationWorkspace } from './NavigationWorkspace'
import { PublishWorkspace } from './PublishWorkspace'
import { SitePreview } from './SitePreview'
import { useWebsiteWorkspace } from './useWebsiteWorkspace'
import { createWebsiteHtmlDownload } from './website-export'
import {
  commerceWebsiteIntakes,
  createCommerceWebsiteIntake,
  validateCommerceState,
  type CommerceWebsiteSource,
} from '../../core/commerce-workspace'
import {
  loadManagedBootstrap,
  ManagedTrialError,
  saveManagedCommerceCommand,
} from '../../core/managed-trial'
import {
  createWebsiteEcommerceHandoff,
  readWebsiteEcommerceHandoff,
  writeWebsiteEcommerceHandoff,
} from '../product-handoff'
import {
  approveWebsiteRevision,
  createBlankPage,
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
  workspaceFingerprint,
  type EvidenceKind,
  type PreviewDevice,
  type WebsitePage,
  type WebsiteRecoveryArchiveSummary,
  type WebsiteWorkspaceUpdate,
} from './website-model'
import './website-product.css'

type WebsiteView = 'content' | 'publish'

const DEFAULT_NOTICE = 'Website workspace loaded. No website has been deployed.'

const viewCopy: Record<WebsiteView, { title: string; copy: string }> = {
  content: {
    title: 'Edit page',
    copy: 'Choose one section, make the change, then preview the page.',
  },
  publish: {
    title: 'Review and save',
    copy: 'Check the revision once, approve it, then download the site file.',
  },
}

function handoffSourceKey(context: ReturnType<typeof readWebsiteEcommerceHandoff>) {
  if (!context?.display) return ''
  const source = context.handoff.source
  return ['local', source.fingerprint, source.approvalId, source.localPublishId, source.pageId].join('|')
}

function managedHandoffSourceKey(source: CommerceWebsiteSource) {
  return ['managed', source.fingerprint, source.approvalId, source.snapshotId, source.pageId].join('|')
}

function secureUuid() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('Secure command IDs are unavailable in this browser.')
  return globalThis.crypto.randomUUID()
}

function formatRecoveryDate(value: string) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 'Saved recovery' : new Date(timestamp).toLocaleString()
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
  const [view, setView] = useState<WebsiteView>('content')
  const [surface, setSurface] = useState<'work' | 'preview'>('work')
  const [siteSettingsOpen, setSiteSettingsOpen] = useState(false)
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
  const [device, setDevice] = useState<PreviewDevice>(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches ? 'mobile' : 'desktop'
  ))
  const [notice, setNotice] = useState(DEFAULT_NOTICE)
  const [deleteCandidateId, setDeleteCandidateId] = useState('')
  const [preparedHandoffSource, setPreparedHandoffSource] = useState(() => handoffSourceKey(readWebsiteEcommerceHandoff()))
  const selectedPage = workspace.pages.find((page) => page.id === workspace.selectedPageId) ?? workspace.pages[0]
  const fingerprint = workspaceFingerprint(workspace)
  const checks = readinessChecks(workspace, fingerprint)
  const approval = getCurrentApproval(workspace)
  const publish = getCurrentPublish(workspace)
  const approvalIsCurrent = Boolean(approval)
  const publishIsCurrent = Boolean(publish)
  const handoffSourcePage = workspace.pages.find((page) => page.stage === 'ready' && page.slug === '/products')
    ?? workspace.pages.find((page) => page.stage === 'ready')
  const currentHandoffSource = approval && publish && handoffSourcePage
    ? [storageMode === 'managed' ? 'managed' : 'local', fingerprint, approval.id, publish.id, handoffSourcePage.id].join('|')
    : ''
  const handoffIsCurrent = Boolean(preparedHandoffSource
    && preparedHandoffSource === currentHandoffSource
    && approvalIsCurrent
    && publishIsCurrent
    && checks.every((check) => check.passed))
  const activeViewCopy = view === 'content' && surface === 'preview'
    ? { title: 'Preview page', copy: 'Check the selected page at desktop, tablet, or mobile size.' }
    : viewCopy[view]
  const savedStateNotice = storageMode === 'managed'
    ? 'Changes are saved to this managed workspace. Nothing has been deployed.'
    : storageMode === 'browser-local'
      ? 'Changes are saved on this device. Nothing has been deployed.'
      : 'Changes last for this session only. Nothing has been deployed.'
  const saveStateLabel = storageMode === 'managed'
    ? 'Managed save'
    : storageMode === 'browser-local'
      ? 'Saved on this device'
      : 'Session only'
  const visiblePageCount = workspace.pages.filter((page) => page.navigation.visible).length
  const statusNotice = storageIssue || (notice === DEFAULT_NOTICE ? savedStateNotice : notice)
  const noticePriority = storageIssue ? 'error' : notice === DEFAULT_NOTICE ? 'routine' : 'update'
  const repairArmed = canRepairLocalStorage
    && repairCandidateRevision > 0
    && repairConfirmationRevision === repairCandidateRevision

  useEffect(() => {
    document.title = 'Website | SuperMega'
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

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
    setView(nextView)
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

  async function selectPage(pageId: string) {
    const result = await commitWorkspace((current) => current.pages.some((page) => page.id === pageId)
      ? { ...current, selectedPageId: pageId }
      : current)
    if (!result.ok || result.workspace.selectedPageId !== pageId) {
      if (result.ok) setNotice('That page is no longer available. The current page was preserved.')
      return false
    }
    setDeleteCandidateId('')
    setNotice(DEFAULT_NOTICE)
    return true
  }

  async function previewPage(pageId = selectedPage.id) {
    if (pageId !== selectedPage.id && !await selectPage(pageId)) return
    openContentSurface('preview')
  }

  async function repairLocalData() {
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

  async function updatePage(pageId: string, update: (page: WebsitePage) => WebsitePage) {
    await commitWorkspace((current) => ({
      ...current,
      pages: current.pages.map((page) => page.id === pageId
        ? { ...update(page), updatedAt: new Date().toISOString() }
        : page),
    }))
    setDeleteCandidateId('')
  }

  async function addPage() {
    if (workspace.pages.length >= MAX_WEBSITE_PAGES) {
      setNotice('This prototype is capped at four pages. Remove a draft before adding another.')
      return
    }
    const result = await commitWorkspace((current) => {
      if (current.pages.length >= MAX_WEBSITE_PAGES) return current
      const page = createBlankPage(current.pages.length + 1)
      return { ...current, pages: [...current.pages, page], selectedPageId: page.id }
    }, 'Draft page added. Complete its content before marking it ready.')
    if (result.ok && result.changed) {
      openWorkspaceView('content')
      setDeleteCandidateId('')
    }
  }

  async function copySelectedPage() {
    if (workspace.pages.length >= MAX_WEBSITE_PAGES) {
      setNotice('This prototype is capped at four pages. Remove a draft before duplicating.')
      return
    }
    const result = await commitWorkspace((current) => {
      if (current.pages.length >= MAX_WEBSITE_PAGES) return current
      const sourcePage = current.pages.find((page) => page.id === current.selectedPageId) ?? current.pages[0]
      const page = duplicatePage(sourcePage, current.pages.length + 1)
      return { ...current, pages: [...current.pages, page], selectedPageId: page.id }
    }, 'Draft copy added with navigation hidden.')
    if (result.ok && result.changed) {
      openWorkspaceView('content')
      setDeleteCandidateId('')
    }
  }

  async function requestDeletePage() {
    if (selectedPage.slug === '/' || selectedPage.stage !== 'draft') return
    if (deleteCandidateId !== selectedPage.id) {
      setDeleteCandidateId(selectedPage.id)
      setNotice('Select “Confirm remove” to delete this draft page.')
      return
    }

    const result = await commitWorkspace((current) => {
      const target = current.pages.find((page) => page.id === selectedPage.id)
      if (!target || target.slug === '/' || target.stage !== 'draft') return current
      const pages = current.pages.filter((page) => page.id !== target.id)
      return {
        ...current,
        pages,
        selectedPageId: pages[0]?.id ?? '',
      }
    }, 'Draft page removed.')
    if (result.ok && result.changed) setDeleteCandidateId('')
  }

  async function movePage(pageId: string, direction: -1 | 1) {
    await commitWorkspace((current) => {
      const currentIndex = current.pages.findIndex((page) => page.id === pageId)
      const nextIndex = currentIndex + direction
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.pages.length) return current
      const pages = [...current.pages]
      const [page] = pages.splice(currentIndex, 1)
      pages.splice(nextIndex, 0, page)
      return { ...current, pages }
    }, 'Navigation order updated.')
  }

  async function addEvidence(input: {
    kind: EvidenceKind
    finding: string
    reference: string
    verifiedBy: string
  }) {
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

  async function prepareCommerceHandoff(input: { sku: string; quantity: number }) {
    const sku = input.sku.trim().toUpperCase()
    const sourcePage = handoffSourcePage
    if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(sku)
      || !Number.isSafeInteger(input.quantity)
      || input.quantity < 1
      || input.quantity > 99) {
      setNotice('Enter an exact Commerce SKU and a whole-number quantity from 1 to 99.')
      return
    }

    if (!approvalIsCurrent || !publishIsCurrent || !approval || !publish || !sourcePage || storageMode === 'session-only') {
      setNotice('A current approval, recorded snapshot, ready source page, and durable workspace are required for intake.')
      return
    }

    const readyPageIds = workspace.pages.filter((page) => page.stage === 'ready').map((page) => page.id)
    const sourceIsCurrent = checks.every((check) => check.passed)
      && approval.reviewer.trim().length > 0
      && approval.note.trim().length > 0
      && publish.recordedBy === approval.reviewer
      && Date.parse(publish.recordedAt) >= Date.parse(approval.approvedAt)
      && readyPageIds.length === publish.readyPageIds.length
      && readyPageIds.every((pageId) => publish.readyPageIds.includes(pageId))
      && publish.readyPageIds.includes(sourcePage.id)
    if (!sourceIsCurrent) {
      setNotice('The current Website evidence, approval, snapshot, and ready-page set do not match. Intake failed closed.')
      return
    }

    if (storageMode === 'managed') {
      const source: CommerceWebsiteSource = {
        fingerprint,
        approvalId: approval.id,
        snapshotId: publish.id,
        pageId: sourcePage.id,
        siteName: workspace.siteName,
        pagePath: sourcePage.slug,
      }
      const sourceKey = managedHandoffSourceKey(source)
      try {
        const bootstrap = await loadManagedBootstrap()
        if (!managedActorId || bootstrap.identity.actor_id !== managedActorId) {
          throw new Error('Managed Website identity changed before the Commerce intake could be prepared.')
        }
        const record = bootstrap.states.commerce
        if (record.surface !== 'commerce' || record.version < 1) {
          throw new Error('Create the managed Commerce catalog before sending a Website intake.')
        }
        const current = validateCommerceState(record.state)
        const existing = commerceWebsiteIntakes(current).find((intake) => managedHandoffSourceKey(intake.source) === sourceKey)
        if (existing) {
          if (existing.sku !== sku || existing.quantity !== input.quantity) {
            throw new Error('This Website snapshot already has a different retained Commerce intake.')
          }
          setPreparedHandoffSource(sourceKey)
          setNotice(`${existing.id} is already retained in managed Commerce.`)
          return
        }

        const commandId = secureUuid()
        const proof = {
          actionId: `ACT-WEB-${secureUuid().toUpperCase()}`,
          capturedAt: new Date().toISOString(),
          actor: managedActorId,
          reason: 'Approved Website snapshot sent to Commerce intake',
          evidenceReference: publish.id,
        }
        const candidate = createCommerceWebsiteIntake(current, {
          id: `WINT-${secureUuid().toUpperCase()}`,
          source,
          sku,
          quantity: input.quantity,
        }, proof)
        if (!candidate || candidate === current) throw new Error('The SKU does not match exactly one managed Commerce catalog item.')
        const saved = await saveManagedCommerceCommand({
          commandId,
          eventType: 'commerce.website_intake.created',
          expectedVersion: record.version,
          evidence: proof,
          state: candidate as unknown as Record<string, unknown>,
        })
        if (saved.surface !== 'commerce'
          || saved.event_type !== 'commerce.website_intake.created'
          || saved.version !== record.version + 1) {
          throw new Error('Managed Commerce returned an invalid intake confirmation.')
        }
        const accepted = validateCommerceState(saved.state)
        const retained = commerceWebsiteIntakes(accepted).find((intake) => managedHandoffSourceKey(intake.source) === sourceKey)
        if (!retained || retained.status !== 'pending_confirmation' || retained.sku !== sku || retained.quantity !== input.quantity) {
          throw new Error('Managed Commerce did not confirm the expected intake record.')
        }
        setPreparedHandoffSource(sourceKey)
        setNotice(`${retained.id} is waiting in Commerce. No stock or order changed.`)
      } catch (error) {
        if (error instanceof ManagedTrialError && error.code === 'trial_version_conflict') {
          try {
            const refreshed = await loadManagedBootstrap()
            const current = validateCommerceState(refreshed.states.commerce.state)
            const retained = commerceWebsiteIntakes(current).find((intake) => managedHandoffSourceKey(intake.source) === sourceKey)
            if (retained && retained.sku === sku && retained.quantity === input.quantity) {
              setPreparedHandoffSource(sourceKey)
              setNotice(`${retained.id} was already retained by another session.`)
              return
            }
          } catch {
            // Preserve the original version-conflict message below.
          }
        }
        setNotice(`Managed Commerce intake was not created: ${error instanceof Error ? error.message : 'unknown managed error'}`)
      }
      return
    }

    const existingHandoff = readWebsiteEcommerceHandoff()
    if (existingHandoff?.handoff.state === 'accepted') {
      const source = existingHandoff.handoff.source
      const acceptedSourceIsCurrent = Boolean(existingHandoff.display
        && source.fingerprint === fingerprint
        && source.approvalId === approval.id
        && source.localPublishId === publish.id
        && source.pageId === sourcePage.id)
      setPreparedHandoffSource(acceptedSourceIsCurrent ? handoffSourceKey(existingHandoff) : '')
      setNotice(acceptedSourceIsCurrent
        ? 'This exact local Website intake is already accepted and retained.'
        : 'The prior accepted local intake is retained and will not be overwritten.')
      return
    }

    const handoff = createWebsiteEcommerceHandoff({
      fingerprint,
      approvalId: approval.id,
      localPublishId: publish.id,
      pageId: sourcePage.id,
      sku,
      quantity: input.quantity,
    })

    const restored = writeWebsiteEcommerceHandoff(handoff, workspace)
    if (!restored) {
      setNotice('Browser storage is unavailable, so no cross-product handoff was created.')
      return
    }

    setPreparedHandoffSource(handoffSourceKey(restored))
    setNotice('Website intake prepared in this browser. Review it in Commerce Orders.')
  }

  return (
    <div className="website-product">
      <div className="website-shell">
        <div id="website-workspace" className="website-main">
          {noticePriority !== 'routine' ? (
            <div className="website-notice" aria-busy={repairing} aria-live="polite" data-priority={noticePriority} role="status">
              <p>{repairArmed
                ? 'The unreadable Website value will be archived, then replaced with the valid workspace on screen. Commerce, Production, managed data, domains, and deployments are not touched.'
                : repairing ? 'Archiving damaged Website data and confirming the replacement…' : statusNotice}</p>
              {repairArchiveKey && !repairArmed ? (
                <div className="website-notice-actions">
                  <button ref={recoveryPrimaryActionRef} className="website-notice-action is-quiet" onClick={() => downloadRepairArchive()} type="button">Download archive</button>
                  {canRepairLocalStorage ? <button className="website-notice-action" onClick={armLocalRepair} type="button">Retry repair</button> : null}
                </div>
              ) : canRepairLocalStorage ? repairArmed ? (
                <div className="website-notice-actions">
                  <button className="website-notice-action is-quiet" disabled={repairing} onClick={cancelLocalRepair} type="button">Cancel</button>
                  <button ref={recoveryPrimaryActionRef} className="website-notice-action" disabled={repairing} onClick={() => void repairLocalData()} type="button">Archive and repair</button>
                </div>
              ) : (
                <button ref={recoveryPrimaryActionRef} className="website-notice-action" onClick={armLocalRepair} type="button">Repair local data</button>
              ) : storageIssue && storageMode === 'session-only' ? (
                <a className="website-notice-action" href="/settings/#controls">Recovery settings</a>
              ) : null}
            </div>
          ) : null}

          {view === 'content' ? (
            <section className="website-action-bar" aria-label="Website actions">
              <div className="website-page-control">
                <label htmlFor="website-page-select">Page</label>
                <select
                  id="website-page-select"
                  onChange={(event) => void selectPage(event.currentTarget.value)}
                  value={selectedPage.id}
                >
                  {workspace.pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.internalName || 'Untitled page'} — {page.slug || 'No path'} ({page.stage})
                    </option>
                  ))}
                </select>
              </div>
              <span className="website-save-state" data-mode={storageMode}>{saveStateLabel}</span>
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
                      <span>{workspace.pages.length} pages · {visiblePageCount} in navigation</span>
                      <button
                        className="website-button is-secondary"
                        disabled={workspace.pages.length >= MAX_WEBSITE_PAGES}
                        onClick={addPage}
                        title={workspace.pages.length >= MAX_WEBSITE_PAGES ? 'The four-page prototype limit is reached' : 'Add page'}
                        type="button"
                      >
                        New page
                      </button>
                    </div>
                    <NavigationWorkspace
                      onMovePage={movePage}
                      onSelectPage={(pageId) => void previewPage(pageId)}
                      onSiteNameChange={(siteName) => {
                        void commitWorkspace((current) => ({ ...current, siteName }), 'Site identity updated.')
                      }}
                      onUpdatePage={updatePage}
                      workspace={workspace}
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
                    else void previewPage()
                  }}
                  type="button"
                >
                  {surface === 'preview' ? 'Back' : 'Preview'}
                </button>
                <button className="website-button is-primary" onClick={() => openWorkspaceView('publish')} type="button">
                  Publish
                </button>
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
          >
            <div className="website-work-surface">
              {view === 'content' ? (
                <ContentWorkspace
                  canDuplicate={workspace.pages.length < MAX_WEBSITE_PAGES}
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
                  handoffAvailable={storageMode !== 'session-only'}
                  handoffIsCurrent={handoffIsCurrent}
                  managedActorId={managedActorId}
                  onAddEvidence={addEvidence}
                  onApprove={approveCurrentRevision}
                  onDownloadPublish={downloadPublishedSite}
                  onPrepareCommerceHandoff={prepareCommerceHandoff}
                  onRecordPublish={recordLocalPublish}
                  publishIsCurrent={publishIsCurrent}
                  workspace={workspace}
                />
              ) : null}
            </div>

            <div className="website-preview-surface">
              <header className="website-preview-surface-head">
                <div>
                  <strong>Preview</strong>
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
                pages={workspace.pages}
                siteName={workspace.siteName}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
