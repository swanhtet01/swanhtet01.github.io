import { lazy, Suspense, useRef, useState } from 'react'
import { SitePreview } from './SitePreview'
import { formatTimestamp, previewDevices, type PreviewDevice, type ReadinessCheck, type WebsiteWorkspace } from './website-model'
import { reviewStatements, saveReviewedWebsite, type ReviewCallbacks } from './website-review'
import type { WebsiteReleaseState } from './website-release-foundation'
import './publish-workspace.css'
const WebsiteReleaseFoundation = lazy(() => import('./WebsiteReleaseFoundation'))
type Props = ReviewCallbacks & {
  approvalIsCurrent: boolean; canWrite: boolean; checks: ReadinessCheck[]; fingerprint: string; managedActorId: string
  managedReleaseRecords?: WebsiteReleaseState[]; currentPublishId: string; publishIsCurrent: boolean
  workspace: WebsiteWorkspace; onEdit: () => void; onDownloadPublish: (recordId: string) => void
  onSaveManagedRelease?: (state: WebsiteReleaseState) => Promise<{ ok: true } | { ok: false; error: string }>
}
export function PublishWorkspace(props: Props) {
  const { checks, fingerprint, managedActorId, managedReleaseRecords, currentPublishId, publishIsCurrent, workspace, onEdit, onDownloadPublish, onSaveManagedRelease } = props
  const pages = workspace.pages.filter(page => page.stage === 'ready')
  const [pageId, setPageId] = useState(pages[0]?.id ?? '')
  const [device, setDevice] = useState<PreviewDevice>('desktop')
  const [confirmed, setConfirmed] = useState<Record<string, string>>({})
  const [reviewer, setReviewer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [saveIssue, setSaveIssue] = useState('')
  const [releaseSettingsOpen, setReleaseSettingsOpen] = useState(false)
  const saveInFlight = useRef(false)
  const page = pages.find(candidate => candidate.id === pageId) ?? pages[0]
  const actor = managedActorId || reviewer.trim()
  const approvalKey = JSON.stringify([fingerprint, workspace.contentRevision, actor, workspace.evidence.map(entry => entry.id)])
  const allConfirmed = reviewStatements.every(statement => confirmed[statement.kind] === approvalKey)
  const failures = checks.filter(check => !check.id.startsWith('evidence-') && !check.passed)
  const canSave = props.canWrite && pages.length > 0 && failures.length === 0 && allConfirmed && Boolean(actor) && !publishIsCurrent && !submitting
  async function saveReview() {
    if (!canSave || saveInFlight.current) return
    saveInFlight.current = true
    setSubmitting(true)
    setSaveIssue('')
    try {
      await saveReviewedWebsite({ source: { digest: fingerprint, contentRevision: workspace.contentRevision }, reviewer: actor, confirmed: allConfirmed, callbacks: props })
    } catch {
      setSaveIssue('We could not confirm the save. Check your connection and try again. Completed review steps stay in history.')
    } finally {
      saveInFlight.current = false
      setSubmitting(false)
    }
  }
  return <section className="website-review" aria-labelledby="site-review-title">
    <header className="website-review-heading"><div><h2 id="site-review-title">Review your website</h2><p>Take one last look before publishing.</p></div><button className="website-button is-secondary" disabled={submitting} onClick={onEdit} type="button">Edit pages</button></header>
    {publishIsCurrent ? <div className="website-review-success" role="status"><span aria-hidden="true">✓</span><div><strong>This version is ready to publish</strong><p>Use Publish website above to put these reviewed pages online.</p></div><button className="website-button is-secondary" type="button" onClick={() => onDownloadPublish(currentPublishId)}>Download copy</button></div> : null}
    <div className="website-review-layout"><div className="website-review-canvas">
      <div className="website-review-toolbar"><nav aria-label="Pages to review">{pages.map(candidate => <button type="button" key={candidate.id} aria-current={candidate.id === page?.id ? 'page' : undefined} onClick={() => setPageId(candidate.id)}>{candidate.navigation.label || candidate.internalName}</button>)}</nav>
      <div role="group" aria-label="Preview size">{previewDevices.map(size => <button type="button" aria-pressed={device === size.id} key={size.id} onClick={() => setDevice(size.id)}>{size.label}</button>)}</div></div>
      {page ? <SitePreview device={device} page={page} pages={pages} siteName={workspace.siteName} onSelectPage={setPageId} /> : <div className="website-review-empty"><h3>No pages ready yet</h3><p>Finish a page and mark it ready to include it in your website.</p><button className="website-button is-primary" type="button" onClick={onEdit}>Finish your pages</button></div>}
      <p className="website-review-caption">Preview of your saved content. Check the live website after publishing.</p>
    </div><aside className="website-review-checks" aria-label="Website review">
      <h3>Ready for your customers?</h3><div className={'website-review-check-result ' + (failures.length ? 'needs-fixes' : '')}><span aria-hidden="true">{failures.length ? '!' : '✓'}</span><div><strong>{failures.length ? failures.length + ' things to fix' : 'Page checks passed'}</strong><p>{pages.length} page{pages.length === 1 ? '' : 's'} included</p></div></div>
      {failures.length ? <ul className="website-review-fixes">{failures.map(check => <li key={check.id}><strong>{check.label}</strong><p>{check.detail}</p></li>)}</ul> : null}
      {!publishIsCurrent ? <><p>Look through each page, then confirm:</p>
        {!managedActorId ? <label className="website-review-name">Your name<input autoComplete="name" maxLength={80} value={reviewer} onChange={event => setReviewer(event.target.value)} /></label> : null}
        <fieldset disabled={submitting || failures.length > 0 || !props.canWrite}><legend className="sr-only">Confirm your review</legend>{reviewStatements.map(statement => <label className="website-review-confirm" key={statement.kind}><input type="checkbox" checked={submitting || confirmed[statement.kind] === approvalKey} onChange={event => setConfirmed(current => ({ ...current, [statement.kind]: event.target.checked ? approvalKey : '' }))} /><span>{statement.label}</span></label>)}</fieldset>
        {!props.canWrite ? <p>View only. Ask a workspace owner for permission to review and publish.</p> : null}
        {saveIssue ? <p className="website-review-error" role="alert">{saveIssue}</p> : null}
        <button className="website-button is-primary website-review-save" disabled={!canSave} onClick={saveReview} type="button">{submitting ? 'Saving reviewed version…' : 'Save reviewed version'}</button><p className="website-review-caption">Saves your review and a website version. Your live site stays as it is until you publish.</p>
      </> : <p>Your review is saved with this version. Editing a page starts a new review.</p>}
    </aside></div>
    <details className="website-review-history"><summary>Version history and advanced settings</summary>
      <div className="website-review-history-list">{workspace.localPublishes.slice(0, 5).map(record => <article key={record.id}><div><strong>{record.readyPageIds.length} pages · {formatTimestamp(record.recordedAt)}</strong><small>Revision {record.source.contentRevision}</small></div>{record.artifact ? <button className="website-button is-secondary" type="button" onClick={() => onDownloadPublish(record.id)}>Download</button> : <span>Copy unavailable</span>}</article>)}</div>
      <details onToggle={event => setReleaseSettingsOpen(event.currentTarget.open)}><summary>Advanced release settings</summary>{releaseSettingsOpen ? <Suspense fallback={<p>Loading release settings…</p>}><WebsiteReleaseFoundation managedActorId={managedActorId} managedRecords={managedReleaseRecords} onSaveManagedState={onSaveManagedRelease} publishIsCurrent={publishIsCurrent} workspace={workspace} /></Suspense> : null}</details>
    </details>
  </section>
}
