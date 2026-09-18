import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { currentManagedIdentity, loadManagedWebsiteReview, loadManagedWebsiteAcceptance, sameManagedIdentity, sendManagedWebsiteReviewChanges, sendManagedWebsiteAcceptance, type ManagedIdentity } from '../../core/managed-trial'
import { verifyCustomerChangeAcknowledgement, verifyCustomerWebsiteReview, verifyCustomerReviewDecision, verifyCustomerAcceptanceAcknowledgement, type CustomerWebsiteReview, type CustomerReviewDecision } from './customer-review-contract'
import { createReviewAccessBoundary } from './customer-review-access'
import { customerWebsiteReviewLoginPath } from '../../core/account-routes'
import './website-product.css'
import './customer-review.css'

type Pending = { identity: ManagedIdentity; payload: { reviewId: string; commandId: string; previewDigest: string; note: string } }
type PendingAcceptance = { identity: ManagedIdentity; payload: { reviewId: string; commandId: string; previewDigest: string; decision: 'accept_preview_for_release_review' } }

export default function WebsiteCustomerReview() {
  const { reviewId = '' } = useParams()
  return <CustomerReviewContent key={reviewId} reviewId={reviewId} />
}

function CustomerReviewContent({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<CustomerWebsiteReview | null>(null)
  const [actor, setActor] = useState<ManagedIdentity | null>(null)
  const [pageId, setPageId] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('Opening your prepared Website…')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const pending = useRef<Pending | null>(null)
  const pendingAcceptance = useRef<PendingAcceptance | null>(null)
  const inFlight = useRef(false)
  const [decision, setDecision] = useState<CustomerReviewDecision | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [acceptanceUnconfirmed, setAcceptanceUnconfirmed] = useState(false)
  const [access] = useState(() => createReviewAccessBoundary(currentManagedIdentity, sameManagedIdentity))
  const lastIdentity = useRef<ManagedIdentity | null>(null)

  useEffect(() => {
    let active = true
    const epoch = access.invalidate()
    async function open() {
      try {
        const identity = await currentManagedIdentity()
        if (!active || !access.isCurrent(epoch)) return
        if (!identity || !lastIdentity.current || !sameManagedIdentity(identity, lastIdentity.current)) {
          pending.current = null; pendingAcceptance.current = null; setUnconfirmed(false); setAcceptanceUnconfirmed(false); setNote('')
        }
        lastIdentity.current = identity
        if (!identity) { setReview(null); setActor(null); setMessage('Sign in to open your prepared review. We will bring you back here.'); return }
        const verified = await verifyCustomerWebsiteReview(await loadManagedWebsiteReview(reviewId, identity), reviewId)
        if (!active || !access.isCurrent(epoch)) return
        const retainedDecision = verifyCustomerReviewDecision(await loadManagedWebsiteAcceptance(reviewId, identity), verified)
        if (!active || !access.isCurrent(epoch)) return
        const accepted = await access.commit(epoch, identity, verified.expiresAt, () => {
          setActor(identity); setReview(verified); setPageId(verified.preview.pages[0].id)
          setDecision(retainedDecision); setConfirmed(Boolean(pendingAcceptance.current)); setBusy(inFlight.current)
          if (retainedDecision.status !== 'pending_review') {
            pendingAcceptance.current = null; setAcceptanceUnconfirmed(false)
          }
          setMessage(retainedDecision.status === 'accepted_for_operator_release_review'
            ? 'Your acceptance is saved for SuperMega’s release review. Nothing has been published.'
            : retainedDecision.status === 'changes_requested' ? 'Your changes are saved. SuperMega will prepare a new revision for acceptance.'
              : 'Prepared for your review. Not a published website.')
        })
        if (!accepted && access.isCurrent(epoch)) {
          setReview(null); setActor(null); pending.current = null; setUnconfirmed(false); setNote('')
          setMessage('Your review access changed. Sign in and reopen the review.')
        }
      } catch {
        if (active && access.isCurrent(epoch)) { setReview(null); setActor(null); setMessage('This review is unavailable, expired, or not assigned to this account. Ask SuperMega for a current review.') }
      }
    }
    void open()
    const refresh = () => { access.invalidate(); setReview(null); setActor(null); setBusy(false); setMessage('Checking your review access…'); setAttempt(value => value + 1) }
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => { active = false; access.invalidate(); window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh) }
  }, [reviewId, attempt, access])

  useEffect(() => {
    if (!review) return
    const timer = window.setTimeout(() => { access.invalidate(); setReview(null); setActor(null); setBusy(false); pending.current = null; pendingAcceptance.current = null; setAcceptanceUnconfirmed(false); setUnconfirmed(false); setNote(''); setMessage('This review has expired. Ask SuperMega for a fresh review.') }, Math.max(0, Date.parse(review.expiresAt) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [review, access])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!review || !actor || busy || inFlight.current || pendingAcceptance.current
      || decision?.status === 'accepted_for_operator_release_review' || Date.parse(review.expiresAt) <= Date.now()) return
    const epoch = access.capture()
    const request = pending.current ?? { identity: actor, payload: { reviewId, commandId: crypto.randomUUID(), previewDigest: review.previewDigest, note: note.trim() } }
    if (!request.payload.note || request.payload.reviewId !== reviewId || !sameManagedIdentity(request.identity, actor)) return
    pending.current = request
    inFlight.current = true
    setBusy(true); setUnconfirmed(true); setMessage('Saving your change request…')
    function denyChangedAccess() {
      if (!access.isCurrent(epoch)) return
      setReview(null); setActor(null); pending.current = null; setUnconfirmed(false); setNote('')
      setMessage('Your review access changed. Sign in and reopen the review.')
    }
    try {
      const response = await sendManagedWebsiteReviewChanges(request.payload, request.identity)
      verifyCustomerChangeAcknowledgement(response, request.payload)
      const accepted = await access.commit(epoch, request.identity, review.expiresAt, () => {
        pending.current = null; setUnconfirmed(false); setNote('')
        setDecision(previous => previous ? { ...previous, status: 'changes_requested', acceptedAt: null } : null)
        setMessage('Your change request is saved for SuperMega. Nothing has been published.')
      })
      if (!accepted) denyChangedAccess()
    } catch {
      const accepted = await access.commit(epoch, request.identity, review.expiresAt, () => setMessage('We could not confirm the save. Retry this same request; it will not create a duplicate.'))
      if (!accepted) denyChangedAccess()
    } finally { inFlight.current = false; setBusy(false) }
  }

  async function acceptRevision() {
    if (!review || !actor || !confirmed || busy || inFlight.current || pending.current || note.trim()
      || decision?.status !== 'pending_review' || Date.parse(review.expiresAt) <= Date.now()) return
    const request = pendingAcceptance.current ?? { identity: actor, payload: { reviewId,
      commandId: crypto.randomUUID(), previewDigest: review.previewDigest, decision: 'accept_preview_for_release_review' as const } }
    if (!sameManagedIdentity(request.identity, actor) || request.payload.reviewId !== reviewId
      || request.payload.previewDigest !== review.previewDigest) return
    const epoch = access.capture()
    pendingAcceptance.current = request; inFlight.current = true
    setBusy(true); setAcceptanceUnconfirmed(true); setMessage('Saving your acceptance…')
    try {
      const response = await sendManagedWebsiteAcceptance(request.payload, request.identity)
      const saved = verifyCustomerAcceptanceAcknowledgement(response, request.payload, review)
      const current = await access.commit(epoch, request.identity, review.expiresAt, () => {
        pendingAcceptance.current = null; setAcceptanceUnconfirmed(false); setDecision(saved)
        setMessage('Your acceptance is saved for SuperMega’s release review. Nothing has been published.')
      })
      if (!current && access.isCurrent(epoch)) { setReview(null); setActor(null); setMessage('Your access changed. Sign in and reopen this review.') }
    } catch {
      const current = await access.commit(epoch, request.identity, review.expiresAt,
        () => setMessage('We could not confirm acceptance. Retry the same acceptance, or reopen this review to check its saved status.'))
      if (!current && access.isCurrent(epoch)) { setReview(null); setActor(null); setMessage('Your access changed. Sign in and reopen this review.') }
    } finally { inFlight.current = false; setBusy(false) }
  }

  return <main className="website-product customer-website-review">
    <header className="customer-review-heading"><Link to="/">SuperMega</Link><h1>Your prepared Website</h1><p>Review the finished pages. Accept this revision or tell us what to change. We handle the build.</p></header>
    <p role="status" aria-live="polite">{message}</p>
    {!review && <div className="customer-review-actions"><Link to={customerWebsiteReviewLoginPath(reviewId)}>Sign in</Link><button type="button" onClick={() => { access.invalidate(); setReview(null); setActor(null); setBusy(false); setAttempt(value => value + 1) }}>Open review</button></div>}
    {review && <>
      <section aria-labelledby="customer-review-guide-title" className="customer-review-guide">
        <div><span className="core-eyebrow">Private review</span><h2 id="customer-review-guide-title">Review in 3 steps</h2></div>
        <ol>
          <li><strong>Open each prepared page</strong><span>{review.preview.pages.length} {review.preview.pages.length === 1 ? 'page' : 'pages'} ready</span></li>
          <li><strong>Check the business facts, offers, and contact action</strong><span>No design or editing work required</span></li>
          <li><strong>Accept this revision or request changes</strong><span>SuperMega makes the updates and sends a new exact revision.</span></li>
        </ol>
        <p>Acceptance records your decision for this exact revision. SuperMega handles the separate release review and publishing. Nothing is published from this screen.</p>
      </section>
      <PreparedWebsitePage review={review} pageId={pageId} onPageChange={setPageId} />
      {decision?.status === 'accepted_for_operator_release_review' ? <section className="customer-review-feedback"><h2>Acceptance saved</h2><p>Revision {review.contentRevision} is accepted for SuperMega’s release review, not published. Contact SuperMega if you need another revision.</p></section> : <>
        {decision?.status === 'pending_review' && <section className="customer-review-feedback" aria-labelledby="website-accept-title">
          <h2 id="website-accept-title">Ready for SuperMega to take the next step?</h2>
          <label className="customer-review-consent"><input type="checkbox" checked={confirmed} disabled={busy || acceptanceUnconfirmed || unconfirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I checked the prepared pages and accept this exact revision for release review.</span></label>
          <p>Accepting does not publish the Website, register a domain, or take payment.</p>
          {note.trim() && <p>Send your changes below, or clear the note before accepting this revision.</p>}
          <button type="button" disabled={!confirmed || busy || unconfirmed || Boolean(note.trim())} onClick={() => { void acceptRevision() }}>{busy && acceptanceUnconfirmed ? 'Saving acceptance…' : acceptanceUnconfirmed ? 'Retry same acceptance' : 'Accept this revision'}</button>
        </section>}
        <form className="customer-review-feedback" onSubmit={submit}><h2>What would you like changed?</h2><label htmlFor="website-review-note">Only describe the changes</label><textarea aria-describedby="website-review-note-help" id="website-review-note" rows={4} maxLength={2000} placeholder="Example: On Home, change the phone number to…" value={note} readOnly={unconfirmed} disabled={acceptanceUnconfirmed} onChange={event => setNote(event.target.value)} required /><p id="website-review-note-help">SuperMega reviews your request. This does not approve or publish the Website.</p><button type="submit" disabled={busy || acceptanceUnconfirmed || !note.trim()}>{busy && !acceptanceUnconfirmed ? 'Saving…' : unconfirmed ? 'Retry same request' : 'Request changes'}</button></form>
      </>}
    </>}
  </main>
}

export function PreparedWebsitePage({ review, pageId, onPageChange }: { review: CustomerWebsiteReview; pageId: string; onPageChange: (id: string) => void }) {
  const page = review.preview.pages.find(item => item.id === pageId) ?? review.preview.pages[0]
  const destination = reviewContactDestination(page.hero.ctaHref)
  return <>
      <nav className="customer-review-actions" aria-label="Prepared pages">{review.preview.pages.map(item => <button type="button" key={item.id} aria-current={item.id === page.id ? 'page' : undefined} onClick={() => onPageChange(item.id)}>{item.navigation.label || item.seo.title || 'Page'}</button>)}</nav>
      <article className="website-preview-site" aria-label="Prepared page preview">
        <header className="preview-site-header"><strong>{review.preview.siteName}</strong><span>Private preview</span></header>
        <div className="preview-site-main"><section className="preview-hero"><span>{page.hero.eyebrow}</span><h2>{page.hero.headline}</h2><p>{page.hero.summary}</p>{page.hero.ctaLabel && <span className="preview-cta" aria-disabled="true">{page.hero.ctaLabel}</span>}</section>
          <section className="preview-section-grid">{page.sections.map(section => <article key={section.id}><span>{section.eyebrow}</span><h3>{section.title}</h3><p>{section.body}</p></article>)}</section></div>
        <footer className="preview-site-footer">Preview only · links and publishing are disabled</footer>
      </article>
      <details className="customer-review-details" key={page.id}>
        <summary>Check contact destination and search listing</summary>
        <dl>
          <dt>Contact button</dt><dd>{page.hero.ctaLabel || 'No contact button prepared'}</dd>
          <dt>Prepared destination — not clickable</dt><dd>{destination}</dd>
          <dt>Search title</dt><dd>{page.seo.title || 'Not prepared yet'}</dd>
          <dt>Search description</dt><dd>{page.seo.description || 'Not prepared yet'}</dd>
        </dl>
        <p>Check these details before requesting changes. This is prepared text, not proof that a link works or that search engines have listed your site.</p>
      </details>
    </>
}

function reviewContactDestination(value: string): string {
  if (!value.trim()) return 'Not prepared yet'
  if (value !== value.trim() || Array.from(value).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127) || value.includes('\\')) return 'Needs correction by SuperMega'
  if (/^\/(?!\/)|^#/.test(value)) return value
  try {
    const url = new URL(value)
    if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) || url.username || url.password) return 'Needs correction by SuperMega'
    return value
  } catch { return 'Needs correction by SuperMega' }
}
