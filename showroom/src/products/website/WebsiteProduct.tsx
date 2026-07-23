import { type KeyboardEvent, useEffect, useState } from 'react'

import { ContentWorkspace } from './ContentWorkspace'
import { NavigationWorkspace } from './NavigationWorkspace'
import { PublishWorkspace } from './PublishWorkspace'
import { SitePreview } from './SitePreview'
import { useWebsiteWorkspace } from './useWebsiteWorkspace'
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

const workspaceViews: Array<{ id: WorkspaceView; index: string; label: string }> = [
  { id: 'content', index: '01', label: 'Content' },
  { id: 'navigation', index: '02', label: 'Navigation' },
  { id: 'publish', index: '03', label: 'Publish' },
]

const viewCopy: Record<WorkspaceView, { eyebrow: string; title: string; copy: string }> = {
  content: {
    eyebrow: 'Page workspace',
    title: 'Edit one page at a time.',
    copy: 'Change the content, then review the result before publishing.',
  },
  navigation: {
    eyebrow: 'Site structure',
    title: 'Make every destination intentional.',
    copy: 'Order pages, control visibility, and keep drafts out of public navigation.',
  },
  publish: {
    eyebrow: 'Release control',
    title: 'Prove the revision before approval.',
    copy: 'Readiness, evidence, and human approval are bound to the current content fingerprint.',
  },
}

function handoffSourceKey(context: ReturnType<typeof readWebsiteEcommerceHandoff>) {
  if (!context?.display) return ''
  const source = context.handoff.source
  return [source.fingerprint, source.approvalId, source.localPublishId, source.pageId].join('|')
}

export function WebsiteProduct() {
  const { workspace, mutateWorkspace, storageMode, storageIssue, managedActorId } = useWebsiteWorkspace()
  const [view, setView] = useState<WorkspaceView>('content')
  const [device, setDevice] = useState<PreviewDevice>('desktop')
  const [notice, setNotice] = useState('Website workspace loaded. No website has been deployed.')
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
    ? [fingerprint, approval.id, publish.id, handoffSourcePage.id].join('|')
    : ''
  const handoffIsCurrent = Boolean(preparedHandoffSource
    && preparedHandoffSource === currentHandoffSource
    && approvalIsCurrent
    && publishIsCurrent
    && checks.every((check) => check.passed))
  const activeViewCopy = viewCopy[view]

  useEffect(() => {
    document.title = 'Website | SuperMega'
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  async function commitWorkspace(update: WebsiteWorkspaceUpdate, success = '', durable = false) {
    const result = await mutateWorkspace(update, { durable })
    if (!result.ok) {
      setNotice(result.error)
      return result
    }
    if (result.changed && success) setNotice(success)
    return result
  }

  function moveWorkspaceTabFocus(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
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
    setView(workspaceViews[nextIndex].id)
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
      setView('content')
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
      setView('content')
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
      'Approved snapshot saved and confirmed. No deployment occurred.',
      true,
    )
  }

  function prepareCommerceHandoff() {
    const existingHandoff = readWebsiteEcommerceHandoff()
    const sourcePage = handoffSourcePage

    if (existingHandoff?.handoff.state === 'accepted') {
      const source = existingHandoff.handoff.source
      const acceptedSourceIsCurrent = Boolean(existingHandoff.display
        && approval
        && publish
        && sourcePage
        && source.fingerprint === fingerprint
        && source.approvalId === approval.id
        && source.localPublishId === publish.id
        && source.pageId === sourcePage.id)
      setPreparedHandoffSource(acceptedSourceIsCurrent ? handoffSourceKey(existingHandoff) : '')
      setNotice(acceptedSourceIsCurrent
        ? 'This exact Website intake is already accepted and retained with its audit record.'
        : 'The prior accepted intake and audit record are retained. This bounded prototype will not overwrite them.')
      return
    }

    if (!approvalIsCurrent || !publishIsCurrent || !approval || !publish || !sourcePage || storageMode !== 'browser-local') {
      setNotice('A current approval, local publish record, ready source page, and browser storage are required for handoff.')
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
      setNotice('The current Website evidence, approval, publish record, and ready-page set do not match. Handoff failed closed.')
      return
    }

    const handoff = createWebsiteEcommerceHandoff({
      fingerprint,
      approvalId: approval.id,
      localPublishId: publish.id,
      pageId: sourcePage.id,
      sku: 'SM-CARE-01',
      quantity: 1,
    })

    const restored = writeWebsiteEcommerceHandoff(handoff, workspace)
    if (!restored) {
      setNotice('Browser storage is unavailable, so no cross-product handoff was created.')
      return
    }

    setPreparedHandoffSource(handoffSourceKey(restored))
    setNotice('Versioned Website intake prepared locally. Review it in Commerce Orders.')
  }

  return (
    <div className="website-product">
      <a className="website-skip" href="#website-workspace">Skip to website workspace</a>

      <header className="website-topbar">
        <a aria-label="Back to SuperMega operations" className="website-brand" href="/operations/">
          <span aria-hidden="true">&gt;_</span>
          <strong>SUPERMEGA</strong>
          <i>/</i>
          <b>WEBSITE</b>
        </a>
        <div className="website-runtime">
          <span className="website-local-badge"><i />{storageMode === 'managed' ? 'Managed workspace' : storageMode === 'browser-local' ? 'Local workspace' : 'Session only'}</span>
          <small>{storageMode === 'managed'
            ? 'synced · content r' + String(workspace.contentRevision)
            : storageMode === 'browser-local'
              ? 'saved · content r' + String(workspace.contentRevision)
              : 'writes paused'}</small>
          <button className="website-button is-primary is-compact" onClick={() => setView('publish')} type="button">
            Review publish
          </button>
        </div>
      </header>

      <div className="website-shell">
        <aside className="website-sidebar">
          <div className="website-site-record">
            <span>Website workspace</span>
            <strong>{workspace.siteName || 'Untitled site'}</strong>
            <small>{workspace.pages.length} / {MAX_WEBSITE_PAGES} pages · {storageMode === 'managed' ? 'managed draft' : 'local draft'}</small>
          </div>

          <nav className="website-workspace-nav" aria-label="Website workspace" role="tablist">
            {workspaceViews.map((item, index) => (
              <button
                aria-controls="website-active-panel"
                aria-selected={view === item.id}
                key={item.id}
                onKeyDown={(event) => moveWorkspaceTabFocus(event, index)}
                onClick={() => setView(item.id)}
                role="tab"
                tabIndex={view === item.id ? 0 : -1}
                type="button"
              >
                <span>{item.index}</span>{item.label}
              </button>
            ))}
          </nav>

          <section className="website-page-index" aria-labelledby="website-pages-title">
            <header>
              <span id="website-pages-title">Pages</span>
              <button aria-label="Add page" disabled={workspace.pages.length >= MAX_WEBSITE_PAGES} onClick={addPage} title={workspace.pages.length >= MAX_WEBSITE_PAGES ? 'The four-page prototype limit is reached' : 'Add page'} type="button">+</button>
            </header>
            <div>
              {workspace.pages.map((page) => (
                <button
                  aria-current={selectedPage.id === page.id ? 'true' : undefined}
                  key={page.id}
                  onClick={() => selectPage(page.id)}
                  type="button"
                >
                  <i className={page.stage === 'ready' ? 'is-ready' : ''} />
                  <span>
                    <strong>{page.internalName || 'Untitled page'}</strong>
                    <small>{page.slug || 'No path'}</small>
                  </span>
                  <b>{page.stage === 'ready' ? 'R' : 'D'}</b>
                </button>
              ))}
            </div>
          </section>

          <footer className="website-sidebar-foot">
            <span aria-hidden="true">&gt;_</span>
            <p>{storageMode === 'managed'
              ? 'Authenticated records are synced. Domain and deployment remain separate approval-gated actions.'
              : 'Local records only. No CMS, domain, analytics, or deployment target is connected.'}</p>
          </footer>
        </aside>

        <main id="website-workspace" className="website-main">
          <header className="website-heading">
            <div>
              <span className="website-eyebrow">{activeViewCopy.eyebrow}</span>
              <h1>{activeViewCopy.title}</h1>
              <p>{activeViewCopy.copy}</p>
            </div>
            <div className="website-preview-controls" role="group" aria-label="Responsive preview size">
              <span>Preview</span>
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

          <div
            aria-label={workspaceViews.find((item) => item.id === view)?.label}
            className={'website-workspace-grid view-' + view}
            id="website-active-panel"
            role="tabpanel"
          >
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
                fingerprint={fingerprint}
                handoffAvailable={storageMode === 'browser-local'}
                handoffIsCurrent={handoffIsCurrent}
                managedActorId={managedActorId}
                onAddEvidence={addEvidence}
                onApprove={approveCurrentRevision}
                onPrepareCommerceHandoff={prepareCommerceHandoff}
                onRecordPublish={recordLocalPublish}
                publishIsCurrent={publishIsCurrent}
                workspace={workspace}
              />
            ) : null}

            <SitePreview
              device={device}
              onSelectPage={selectPage}
              page={selectedPage}
              pages={workspace.pages}
              siteName={workspace.siteName}
            />
          </div>
        </main>
      </div>

      <div className="website-notice" aria-live="polite" role="status">
        <span aria-hidden="true">&gt;_</span>{storageIssue || notice}
      </div>
    </div>
  )
}
