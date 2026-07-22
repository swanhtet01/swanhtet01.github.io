import { useEffect, useState } from 'react'

import { ContentWorkspace } from './ContentWorkspace'
import { NavigationWorkspace } from './NavigationWorkspace'
import { PublishWorkspace } from './PublishWorkspace'
import { SitePreview } from './SitePreview'
import { useWebsiteWorkspace } from './useWebsiteWorkspace'
import {
  createBlankPage,
  createId,
  duplicatePage,
  isCurrentApproval,
  isCurrentPublish,
  MAX_WEBSITE_PAGES,
  previewDevices,
  readinessChecks,
  workspaceFingerprint,
  type EvidenceKind,
  type PreviewDevice,
  type WebsitePage,
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
    title: 'Write with the preview in view.',
    copy: 'Edit a small, finite page set. Content changes return the page to draft.',
  },
  navigation: {
    eyebrow: 'Site structure',
    title: 'Make every destination intentional.',
    copy: 'Order pages, control visibility, and keep drafts out of public navigation.',
  },
  publish: {
    eyebrow: 'Release control',
    title: 'Prove the revision before approval.',
    copy: 'Readiness, evidence, and human approval are bound to the current local fingerprint.',
  },
}

export function WebsiteProduct() {
  const { workspace, setWorkspace, storageMode } = useWebsiteWorkspace()
  const [view, setView] = useState<WorkspaceView>('content')
  const [device, setDevice] = useState<PreviewDevice>('desktop')
  const [notice, setNotice] = useState('Local demo loaded. No website has been deployed.')
  const [deleteCandidateId, setDeleteCandidateId] = useState('')
  const selectedPage = workspace.pages.find((page) => page.id === workspace.selectedPageId) ?? workspace.pages[0]
  const fingerprint = workspaceFingerprint(workspace)
  const checks = readinessChecks(workspace, fingerprint)
  const approvalIsCurrent = isCurrentApproval(workspace.approval, fingerprint)
  const publishIsCurrent = isCurrentPublish(workspace.localPublishes[0], fingerprint)
  const activeViewCopy = viewCopy[view]

  useEffect(() => {
    document.title = 'Website | SuperMega'
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  function selectPage(pageId: string) {
    setWorkspace((current) => ({ ...current, selectedPageId: pageId }))
    setDeleteCandidateId('')
    setNotice('Previewing the selected browser-local page.')
  }

  function updatePage(pageId: string, update: (page: WebsitePage) => WebsitePage) {
    setWorkspace((current) => ({
      ...current,
      pages: current.pages.map((page) => page.id === pageId
        ? { ...update(page), updatedAt: new Date().toISOString() }
        : page),
    }))
    setDeleteCandidateId('')
  }

  function addPage() {
    if (workspace.pages.length >= MAX_WEBSITE_PAGES) {
      setNotice('This prototype is capped at four pages. Remove a draft before adding another.')
      return
    }
    const page = createBlankPage(workspace.pages.length + 1)
    setWorkspace((current) => ({
      ...current,
      pages: [...current.pages, page],
      selectedPageId: page.id,
    }))
    setView('content')
    setDeleteCandidateId('')
    setNotice('Draft page added. Complete its content before marking it ready.')
  }

  function copySelectedPage() {
    if (workspace.pages.length >= MAX_WEBSITE_PAGES) {
      setNotice('This prototype is capped at four pages. Remove a draft before duplicating.')
      return
    }
    const page = duplicatePage(selectedPage, workspace.pages.length + 1)
    setWorkspace((current) => ({
      ...current,
      pages: [...current.pages, page],
      selectedPageId: page.id,
    }))
    setView('content')
    setDeleteCandidateId('')
    setNotice('Draft copy added with navigation hidden.')
  }

  function requestDeletePage() {
    if (selectedPage.slug === '/' || selectedPage.stage !== 'draft') return
    if (deleteCandidateId !== selectedPage.id) {
      setDeleteCandidateId(selectedPage.id)
      setNotice('Select “Confirm remove” to delete this browser-local draft.')
      return
    }

    setWorkspace((current) => {
      const pages = current.pages.filter((page) => page.id !== selectedPage.id)
      return {
        ...current,
        pages,
        selectedPageId: pages[0]?.id ?? '',
      }
    })
    setDeleteCandidateId('')
    setNotice('Browser-local draft removed.')
  }

  function movePage(pageId: string, direction: -1 | 1) {
    setWorkspace((current) => {
      const currentIndex = current.pages.findIndex((page) => page.id === pageId)
      const nextIndex = currentIndex + direction
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.pages.length) return current
      const pages = [...current.pages]
      const [page] = pages.splice(currentIndex, 1)
      pages.splice(nextIndex, 0, page)
      return { ...current, pages }
    })
    setNotice('Navigation order updated locally.')
  }

  function addEvidence(input: {
    kind: EvidenceKind
    finding: string
    reference: string
    verifiedBy: string
  }) {
    const evidence = {
      ...input,
      id: createId('evidence'),
      verifiedAt: new Date().toISOString(),
      fingerprint,
    }
    setWorkspace((current) => ({
      ...current,
      evidence: [
        evidence,
        ...current.evidence.filter((entry) => entry.kind !== input.kind || entry.fingerprint !== fingerprint),
      ].slice(0, 24),
    }))
    setNotice('Verified evidence recorded for ' + fingerprint + '.')
  }

  function approveCurrentRevision(input: { reviewer: string; note: string }) {
    setWorkspace((current) => ({
      ...current,
      approval: {
        id: createId('approval'),
        reviewer: input.reviewer,
        note: input.note,
        approvedAt: new Date().toISOString(),
        fingerprint,
      },
    }))
    setNotice('Human approval recorded for the current local fingerprint.')
  }

  function recordLocalPublish() {
    if (!approvalIsCurrent || publishIsCurrent || !workspace.approval) return
    const record = {
      id: createId('local-publish'),
      recordedAt: new Date().toISOString(),
      recordedBy: workspace.approval.reviewer,
      fingerprint,
      readyPageIds: workspace.pages.filter((page) => page.stage === 'ready').map((page) => page.id),
    }
    setWorkspace((current) => ({
      ...current,
      localPublishes: [record, ...current.localPublishes].slice(0, 5),
    }))
    setNotice('Local publish snapshot recorded. No deployment or external write occurred.')
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
          <span className="website-local-badge"><i />Local demo</span>
          <small>{storageMode === 'browser-local' ? 'saved in this browser' : 'session only'}</small>
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
            <small>{workspace.pages.length} / {MAX_WEBSITE_PAGES} pages · local draft</small>
          </div>

          <nav className="website-workspace-nav" aria-label="Website workspace">
            {workspaceViews.map((item) => (
              <button
                aria-current={view === item.id ? 'page' : undefined}
                key={item.id}
                onClick={() => setView(item.id)}
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
            <p>Browser-local records only. No CMS, domain, analytics, or deployment target is connected.</p>
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

          <div className={'website-workspace-grid view-' + view}>
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
                  setWorkspace((current) => ({ ...current, siteName }))
                  setNotice('Site identity updated locally.')
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
                onAddEvidence={addEvidence}
                onApprove={approveCurrentRevision}
                onRecordPublish={recordLocalPublish}
                publishIsCurrent={publishIsCurrent}
                workspace={workspace}
              />
            ) : null}

            <SitePreview
              device={device}
              page={selectedPage}
              pages={workspace.pages}
              siteName={workspace.siteName}
            />
          </div>
        </main>
      </div>

      <div className="website-notice" aria-live="polite" role="status">
        <span aria-hidden="true">&gt;_</span>{notice}
      </div>
    </div>
  )
}
