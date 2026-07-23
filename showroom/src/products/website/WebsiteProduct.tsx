import { type KeyboardEvent, useEffect, useState } from 'react'

import { ContentWorkspace } from './ContentWorkspace'
import { NavigationWorkspace } from './NavigationWorkspace'
import { PublishWorkspace } from './PublishWorkspace'
import { SitePreview } from './SitePreview'
import { useWebsiteWorkspace } from './useWebsiteWorkspace'
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
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit')
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
    ? [storageMode === 'managed' ? 'managed' : 'local', fingerprint, approval.id, publish.id, handoffSourcePage.id].join('|')
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

  function openWorkspaceView(nextView: WorkspaceView) {
    setView(nextView)
    setMobilePane('edit')
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
    openWorkspaceView(workspaceViews[nextIndex].id)
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
      'Approved snapshot saved and confirmed. No deployment occurred.',
      true,
    )
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
          <button className="website-button is-primary is-compact" onClick={() => openWorkspaceView('publish')} type="button">
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
                onClick={() => openWorkspaceView(item.id)}
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

        <main id="website-workspace" className={'website-main mobile-pane-' + mobilePane}>
          <header className="website-heading">
            <div>
              <span className="website-eyebrow">{activeViewCopy.eyebrow}</span>
              <h1>{activeViewCopy.title}</h1>
              <p>{activeViewCopy.copy}</p>
            </div>
            <div className="website-heading-actions">
              <div className="website-mobile-pane-controls" role="group" aria-label="Mobile Website workspace">
                <button aria-pressed={mobilePane === 'edit'} onClick={() => setMobilePane('edit')} type="button">Edit</button>
                <button aria-pressed={mobilePane === 'preview'} onClick={() => setMobilePane('preview')} type="button">Preview</button>
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
            </div>
          </header>

          <div
            aria-label={workspaceViews.find((item) => item.id === view)?.label}
            className={'website-workspace-grid view-' + view + ' mobile-pane-' + mobilePane}
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
                handoffAvailable={storageMode !== 'session-only'}
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
