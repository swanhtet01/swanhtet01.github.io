import { recoverWebsiteFeedback, retainWebsiteFeedback, clearWebsiteFeedback } from './pending-website-feedback'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { currentManagedIdentity, loadManagedWebsiteReview, loadManagedWebsiteAcceptance, sameManagedIdentity, sendManagedWebsiteReviewChanges, sendManagedWebsiteAcceptance, type ManagedIdentity } from '../../core/managed-trial'
import { verifyCustomerChangeAcknowledgement, verifyCustomerWebsiteReview, verifyCustomerReviewDecision, verifyCustomerAcceptanceAcknowledgement, type CustomerWebsiteReview, type CustomerReviewDecision } from './customer-review-contract'
import { createReviewAccessBoundary } from './customer-review-access'
import { customerWebsiteReviewLoginPath } from '../../core/account-routes'
import './website-product.css'
import './customer-review.css'
import { reviewContactDestination } from './customer-review-contract'

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
  const [message, setMessage] = useState('Opening Website…')
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
  const [opening, setOpening] = useState(true)

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
        if (!identity) { setReview(null); setActor(null); setMessage('Sign in to open your review.'); return }
        const verified = await verifyCustomerWebsiteReview(await loadManagedWebsiteReview(reviewId, identity), reviewId)
        if (!active || !access.isCurrent(epoch)) return
        const recovered = recoverWebsiteFeedback(window.sessionStorage, identity, verified)
        const retainedDecision = verifyCustomerReviewDecision(await loadManagedWebsiteAcceptance(reviewId, identity), verified)
        if (!active || !access.isCurrent(epoch)) return
        const accepted = await access.commit(epoch, identity, verified.expiresAt, () => {
          pending.current = recovered ? { identity, payload: recovered } : null
          setUnconfirmed(Boolean(recovered)); setNote(recovered?.note ?? '')
          setActor(identity); setReview(verified); setPageId(verified.preview.pages[0].id)
          setDecision(retainedDecision); setConfirmed(Boolean(pendingAcceptance.current)); setBusy(inFlight.current)
          if (retainedDecision.status !== 'pending_review') {
            pendingAcceptance.current = null; setAcceptanceUnconfirmed(false)
          }
          setMessage(recovered ? 'Retry your saved change request to confirm it.' : retainedDecision.status === 'accepted_for_operator_release_review'
            ? 'Your acceptance is saved. Publishing needs review.'
            : retainedDecision.status === 'changes_requested' ? 'Changes saved. A new revision will follow.'
              : 'Private review. Not published.')
        })
        if (!accepted && access.isCurrent(epoch)) {
          setReview(null); setActor(null); pending.current = null; setUnconfirmed(false); setNote('')
          setMessage('Access changed. Sign in again.')
        }
      } catch {
        if (active && access.isCurrent(epoch)) { setReview(null); setActor(null); setMessage('Review unavailable. Try again.') }
      } finally {
        if (active && access.isCurrent(epoch)) setOpening(false)
      }
    }
    void open()
    const refresh = () => { access.invalidate(); setOpening(true); setReview(null); setActor(null); setBusy(false); setMessage('Checking access…'); setAttempt(value => value + 1) }
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => { active = false; access.invalidate(); window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh) }
  }, [reviewId, attempt, access])

  useEffect(() => {
    if (!review) return
    const timer = window.setTimeout(() => {
      try { if (pending.current) clearWebsiteFeedback(window.sessionStorage, pending.current.identity, pending.current.payload) } catch { /* Retain uncertain cleanup. */ }
      access.invalidate(); setReview(null); setActor(null); setBusy(false); pending.current = null; pendingAcceptance.current = null; setAcceptanceUnconfirmed(false); setUnconfirmed(false); setNote(''); setMessage('Review expired. Ask for a new link.') }, Math.max(0, Date.parse(review.expiresAt) - Date.now()))
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
      setMessage('Access changed. Sign in again.')
    }
    try {
      retainWebsiteFeedback(window.sessionStorage, request.identity, review, request.payload)
      const response = await sendManagedWebsiteReviewChanges(request.payload, request.identity)
      verifyCustomerChangeAcknowledgement(response, request.payload)
      const accepted = await access.commit(epoch, request.identity, review.expiresAt, () => {
        clearWebsiteFeedback(window.sessionStorage, request.identity, request.payload)
        pending.current = null; setUnconfirmed(false); setNote('')
        setDecision(previous => previous ? { ...previous, status: 'changes_requested', acceptedAt: null } : null)
        setMessage('Your change request is saved. Not published.')
      })
      if (!accepted) denyChangedAccess()
    } catch {
      const accepted = await access.commit(epoch, request.identity, review.expiresAt, () => setMessage('Save unconfirmed. Retry the same request.'))
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
        setMessage('Your acceptance is saved. Publishing needs review.')
      })
      if (!current && access.isCurrent(epoch)) { setReview(null); setActor(null); setMessage('Access changed. Sign in again.') }
    } catch {
      const current = await access.commit(epoch, request.identity, review.expiresAt,
        () => setMessage('Acceptance unconfirmed. Retry or reopen this review.'))
      if (!current && access.isCurrent(epoch)) { setReview(null); setActor(null); setMessage('Access changed. Sign in again.') }
    } finally { inFlight.current = false; setBusy(false) }
  }

  return <main className="website-product customer-website-review">
    <header className="customer-review-heading"><Link to="/">SuperMega</Link><h1>Your prepared Website</h1><p>Check the pages, then accept or request changes.</p></header>
    <p role="status" aria-live="polite">{message}</p>
    {!review && <section aria-label="Open your private review" aria-busy={opening}>
      <div className="customer-review-actions"><Link to={customerWebsiteReviewLoginPath(reviewId)}>Sign in</Link><button type="button" disabled={opening} onClick={() => { access.invalidate(); setOpening(true); setReview(null); setActor(null); setBusy(false); setMessage('Checking access…'); setAttempt(value => value + 1) }}>{opening ? 'Opening review…' : 'Try opening again'}</button></div>
      {!opening && <p>Use your assigned account and latest review link. Ask SuperMega for help if access fails.</p>}
    </section>}
    {review && <>
      <p>SuperMega handles publishing.</p>
      <PreparedWebsitePage review={review} pageId={pageId} onPageChange={setPageId} />
      {decision?.status === 'accepted_for_operator_release_review' ? <section className="customer-review-feedback"><h2>Acceptance saved</h2><p>Revision {review.contentRevision} is accepted for SuperMega’s release review, not published. Contact SuperMega if you need another revision.</p></section> : <>
        {decision?.status === 'pending_review' && <section className="customer-review-feedback" aria-labelledby="website-accept-title">
          <h2 id="website-accept-title">Accept this revision?</h2>
          <label className="customer-review-consent"><input type="checkbox" checked={confirmed} disabled={busy || acceptanceUnconfirmed || unconfirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I checked the prepared pages and accept this exact revision for release review.</span></label>
          <p>Accepting does not publish the Website, register a domain, or take payment.</p>
          {note.trim() && <p>Send your changes below, or clear the note before accepting this revision.</p>}
          <button type="button" disabled={!confirmed || busy || unconfirmed || Boolean(note.trim())} onClick={() => { void acceptRevision() }}>{busy && acceptanceUnconfirmed ? 'Saving acceptance…' : acceptanceUnconfirmed ? 'Retry same acceptance' : 'Accept this revision'}</button>
        </section>}
        <form className="customer-review-feedback" onSubmit={submit}><h2>Request changes</h2><label htmlFor="website-review-note">Your changes</label><textarea aria-describedby="website-review-note-help" id="website-review-note" rows={4} maxLength={2000} placeholder="What needs changing?" value={note} readOnly={unconfirmed} disabled={acceptanceUnconfirmed} onChange={event => setNote(event.target.value)} required /><p id="website-review-note-help">Your request does not publish the Website.</p><button type="submit" disabled={busy || acceptanceUnconfirmed || !note.trim()}>{busy && !acceptanceUnconfirmed ? 'Saving…' : unconfirmed ? 'Retry same request' : 'Request changes'}</button></form>
      </>}
    </>}
  </main>
}

export function PreparedWebsitePage({ review, pageId, onPageChange }: { review: CustomerWebsiteReview; pageId: string; onPageChange: (id: string) => void }) {
  const page = review.preview.pages.find(item => item.id === pageId) ?? review.preview.pages[0]
  const destination = reviewContactDestination(page.hero.ctaHref)
  return <>
      <nav className="customer-review-actions" aria-label="Prepared pages">{review.preview.pages.map(item => <button type="button" key={item.id} aria-current={item.id === page.id ? 'page' : undefined} onClick={() => onPageChange(item.id)}>{item.navigation.label || item.seo.title || 'Page'}</button>)}</nav>
      <article className="website-preview-site" aria-label="Prepared page review">
        <header className="preview-site-header"><strong>{review.preview.siteName}</strong><span>Private review</span></header>
        <div className="preview-site-main"><section className="preview-hero"><span>{page.hero.eyebrow}</span><h2>{page.hero.headline}</h2><p>{page.hero.summary}</p>{page.hero.ctaLabel && <span className="preview-cta" aria-disabled="true">{page.hero.ctaLabel}</span>}</section>
          <section className="preview-section-grid">{page.sections.map(section => <article key={section.id}><span>{section.eyebrow}</span><h3>{section.title}</h3><p>{section.body}</p></article>)}</section></div>
        <footer className="preview-site-footer">Review only · links and publishing are disabled</footer>
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
