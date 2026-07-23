import { type KeyboardEvent, useEffect, useState } from 'react'

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
  duplicatePage,
  getCurrentApproval,
  getCurrentPublish,
  MAX_WEBSITE_PAGES,
  previewDevices,
  readinessChecks,
  recordWebsiteEvidence,
  recordWebsiteSnapshot,
  workspaceFingerprint,
  type EvidenceKind,
  type PreviewDevice,
  type WebsitePage,
  type WebsiteWorkspaceUpdate,
  type WorkspaceView,
} from './website-model'
import './website-product.css'

const workspaceViews: Array<{ id: WorkspaceView; label: string }> = [
  { id: 'content', label: 'Pages' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'publish', label: 'Publish' },
]

const mobileWorkspaceViews: Array<{ id: WorkspaceView; label: string }> = [
  { id: 'content', label: 'Edit' },
  { id: 'publish', label: 'Publish' },
]

const DEFAULT_NOTICE = 'Website workspace loaded. No website has been deployed.'

const viewCopy: Record<WorkspaceView, { title: string; copy: string }> = {
  content: {
    title: 'Edit page',
    copy: 'Update the selected page, then preview it when you are ready.',
  },
  navigation: {
    title: 'Organize navigation',
    copy: 'Choose what visitors can see and put pages in the right order.',
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

export function WebsiteProduct() {
  const { workspace, mutateWorkspace, storageMode, storageIssue, managedActorId } = useWebsiteWorkspace()
  const [view, setView] = useState<WorkspaceView>('content')
  const [surface, setSurface] = useState<'work' | 'preview'>('work')
  const [splitPreview, setSplitPreview] = useState(false)
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
  const activeViewCopy = viewCopy[view]
  const statusNotice = storageIssue || notice
  const noticePriority = storageIssue ? 'error' : notice === DEFAULT_NOTICE ? 'routine' : 'update'

  useEffect(() => {
    document.title = 'Website | SuperMega'
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    const compactViewport = window.matchMedia('(max-width: 900px)')
    const collapseSplitView = (event: MediaQueryListEvent) => {
      if (!event.matches) return
      setSplitPreview(false)
      setView((current) => current === 'navigation' ? 'content' : current)
    }
    compactViewport.addEventListener('change', collapseSplitView)
    return () => compactViewport.removeEventListener('change', collapseSplitView)
  }, [])

  function openWorkspaceView(nextView: WorkspaceView) {
    setView(nextView)
    setSurface('work')
    setSplitPreview(false)
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

  function moveWorkspaceTabFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
    views = workspaceViews,
  ) {
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    if (!tabs?.length) return
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else return
    event.preventDefault()
    tabs[nextIndex]?.focus()
    openWorkspaceView(views[nextIndex].id)
  }

  async function selectPage(pageId: string) {
    await commitWorkspace((current) => current.pages.some((page) => page.id === pageId)
      ? { ...current, selectedPageId: pageId }
      : current)
    setDeleteCandidateId('')
    setNotice('Previewing the selected page.')
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
      <a className="website-skip" href="#website-workspace">Skip to website task</a>

      <header className="website-topbar">
        <a aria-label="Back to SuperMega operations" className="website-brand" href="/operations/">
          <span aria-hidden="true">&gt;_</span>
          <strong>SUPERMEGA</strong>
          <b>Website</b>
        </a>
        <div className="website-site-summary">
          <strong><span className="website-product-label">Website</span><span className="website-site-label">{workspace.siteName || 'Untitled site'}</span></strong>
          <small>{workspace.pages.length} of {MAX_WEBSITE_PAGES} pages</small>
        </div>
        <div className="website-runtime">
          <span className="website-local-badge"><i /><span className="website-runtime-label">{storageMode === 'managed' ? 'Managed workspace' : storageMode === 'browser-local' ? 'Local workspace' : 'Session only'}</span><span className="website-runtime-label-short">{storageMode === 'managed' ? 'Managed' : storageMode === 'browser-local' ? 'Local' : 'Session'}</span></span>
          <small>{storageMode === 'managed'
            ? 'synced · content r' + String(workspace.contentRevision)
            : storageMode === 'browser-local'
              ? 'saved · content r' + String(workspace.contentRevision)
              : 'writes paused'}</small>
        </div>
      </header>

      <div className="website-shell">
        <main id="website-workspace" className="website-main">
          <nav className="website-workspace-nav website-desktop-workspace-nav" aria-label="Website workspace" role="tablist">
            {workspaceViews.map((item, index) => (
              <button
                aria-controls="website-active-panel"
                aria-selected={view === item.id}
                key={item.id}
                onKeyDown={(event) => moveWorkspaceTabFocus(event, index)}
                onClick={() => openWorkspaceView(item.id)}
                role="tab"
                tabIndex={view === item.id ? 0 : -1}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <nav className="website-mobile-mode-nav" aria-label="Website mode" role="tablist">
            {mobileWorkspaceViews.map((item, index) => (
              <button
                aria-controls="website-active-panel"
                aria-selected={view === item.id}
                key={item.id}
                onKeyDown={(event) => moveWorkspaceTabFocus(event, index, mobileWorkspaceViews)}
                onClick={() => openWorkspaceView(item.id)}
                role="tab"
                tabIndex={view === item.id ? 0 : -1}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="website-notice" aria-live="polite" data-priority={noticePriority} role="status">
            {statusNotice}
          </div>

          {view === 'content' ? (
            <section className="website-page-switcher" aria-label="Selected page">
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
              <button
                className="website-button is-secondary"
                disabled={workspace.pages.length >= MAX_WEBSITE_PAGES}
                onClick={addPage}
                title={workspace.pages.length >= MAX_WEBSITE_PAGES ? 'The four-page prototype limit is reached' : 'Add page'}
                type="button"
              >
                New page
              </button>
            </section>
          ) : null}

          <section className="website-mobile-page-bar" aria-label="Selected page and preview">
            <label className="sr-only" htmlFor="website-mobile-page-select">Selected page</label>
            <select
              aria-label="Selected page"
              id="website-mobile-page-select"
              onChange={(event) => void selectPage(event.currentTarget.value)}
              value={selectedPage.id}
            >
              {workspace.pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.internalName || 'Untitled page'} · {page.stage}
                </option>
              ))}
            </select>
            <button
              aria-pressed={surface === 'preview'}
              className="website-button is-secondary"
              onClick={() => {
                setSurface((current) => current === 'preview' ? 'work' : 'preview')
                setSplitPreview(false)
              }}
              type="button"
            >
              {surface === 'preview' ? (view === 'publish' ? 'Back to publish' : 'Back to edit') : 'Preview'}
            </button>
          </section>

          {view === 'content' && surface === 'work' ? (
            <details className="website-mobile-site-settings">
              <summary>
                <span>Site settings</span>
                <small>Pages, navigation, and search</small>
              </summary>
              <div className="website-mobile-site-settings-content">
                <div className="website-mobile-page-actions">
                  <button
                    className="website-button is-secondary"
                    disabled={workspace.pages.length >= MAX_WEBSITE_PAGES}
                    onClick={addPage}
                    title={workspace.pages.length >= MAX_WEBSITE_PAGES ? 'The four-page prototype limit is reached' : 'Add page'}
                    type="button"
                  >
                    New page
                  </button>
                  <button
                    className="website-button is-secondary"
                    disabled={workspace.pages.length >= MAX_WEBSITE_PAGES}
                    onClick={copySelectedPage}
                    title={workspace.pages.length < MAX_WEBSITE_PAGES ? 'Duplicate this page' : 'The four-page prototype limit is reached'}
                    type="button"
                  >
                    Duplicate
                  </button>
                  {selectedPage.slug !== '/' && selectedPage.stage === 'draft' ? (
                    <button
                      className={'website-button is-quiet ' + (deleteCandidateId === selectedPage.id ? 'is-danger' : '')}
                      onClick={requestDeletePage}
                      type="button"
                    >
                      {deleteCandidateId === selectedPage.id ? 'Confirm remove' : 'Remove draft'}
                    </button>
                  ) : null}
                </div>

                <details className="website-mobile-seo-settings">
                  <summary>
                    <span>Search metadata</span>
                    <small>{selectedPage.seo.title && selectedPage.seo.description ? 'Complete' : 'Needs copy'}</small>
                  </summary>
                  <div className="website-form-grid">
                    <label>
                      <span>SEO title</span>
                      <input
                        maxLength={70}
                        onChange={(event) => void updatePage(selectedPage.id, (current) => ({
                          ...current,
                          stage: 'draft',
                          seo: { ...current.seo, title: event.target.value },
                        }))}
                        value={selectedPage.seo.title}
                      />
                    </label>
                    <label>
                      <span>SEO description</span>
                      <textarea
                        maxLength={160}
                        onChange={(event) => void updatePage(selectedPage.id, (current) => ({
                          ...current,
                          stage: 'draft',
                          seo: { ...current.seo, description: event.target.value },
                        }))}
                        rows={3}
                        value={selectedPage.seo.description}
                      />
                    </label>
                  </div>
                </details>

                <NavigationWorkspace
                  onMovePage={movePage}
                  onSelectPage={selectPage}
                  onSiteNameChange={(siteName) => {
                    void commitWorkspace((current) => ({ ...current, siteName }), 'Site identity updated.')
                  }}
                  onUpdatePage={updatePage}
                  workspace={workspace}
                />
              </div>
            </details>
          ) : null}

          <header className="website-heading">
            <div>
              <h1>{activeViewCopy.title}</h1>
              <p>{activeViewCopy.copy}</p>
            </div>
            <div className="website-heading-actions">
              <div className="website-surface-controls" role="group" aria-label="Website workspace surface">
                <button
                  aria-pressed={surface === 'work' && !splitPreview}
                  onClick={() => {
                    setSurface('work')
                    setSplitPreview(false)
                  }}
                  type="button"
                >
                  {view === 'content' ? 'Edit' : view === 'navigation' ? 'Organize' : 'Review'}
                </button>
                <button
                  aria-pressed={surface === 'preview' && !splitPreview}
                  onClick={() => {
                    setSurface('preview')
                    setSplitPreview(false)
                  }}
                  type="button"
                >
                  Preview
                </button>
                <button
                  aria-pressed={splitPreview}
                  className="website-split-control"
                  onClick={() => setSplitPreview((current) => !current)}
                  type="button"
                >
                  Split
                </button>
              </div>
            </div>
          </header>

          <div
            aria-label={workspaceViews.find((item) => item.id === view)?.label}
            className={'website-workspace-grid view-' + view}
            data-split={splitPreview ? 'true' : 'false'}
            data-surface={surface}
            id="website-active-panel"
            role="tabpanel"
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

              {view === 'navigation' ? (
                <NavigationWorkspace
                  onMovePage={movePage}
                  onSelectPage={selectPage}
                  onSiteNameChange={(siteName) => {
                    void commitWorkspace((current) => ({ ...current, siteName }), 'Site identity updated.')
                  }}
                  onUpdatePage={updatePage}
                  workspace={workspace}
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
        </main>
      </div>
    </div>
  )
}
