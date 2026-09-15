import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { currentManagedIdentity, loadManagedWebsiteReview, sameManagedIdentity, sendManagedWebsiteReviewChanges, type ManagedIdentity } from '../../core/managed-trial'
import { verifyCustomerChangeAcknowledgement, verifyCustomerWebsiteReview, type CustomerWebsiteReview } from './customer-review-contract'
import { createReviewAccessBoundary } from './customer-review-access'
import './website-product.css'
import './customer-review.css'

type Pending = { identity: ManagedIdentity; payload: { reviewId: string; commandId: string; previewDigest: string; note: string } }

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
          pending.current = null; setUnconfirmed(false); setNote('')
        }
        lastIdentity.current = identity
        if (!identity) { setReview(null); setActor(null); setMessage('Sign in to your company account, then return here and open the review.'); return }
        const verified = await verifyCustomerWebsiteReview(await loadManagedWebsiteReview(reviewId, identity), reviewId)
        if (!active || !access.isCurrent(epoch)) return
        const accepted = await access.commit(epoch, identity, verified.expiresAt, () => {
          setActor(identity); setReview(verified); setPageId(verified.preview.pages[0].id)
          setMessage('Prepared for your review. Not a published website.')
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
    const timer = window.setTimeout(() => { access.invalidate(); setReview(null); setActor(null); setBusy(false); pending.current = null; setUnconfirmed(false); setNote(''); setMessage('This review has expired. Ask SuperMega for a fresh review.') }, Math.max(0, Date.parse(review.expiresAt) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [review, access])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!review || !actor || busy || Date.parse(review.expiresAt) <= Date.now()) return
    const epoch = access.capture()
    const request = pending.current ?? { identity: actor, payload: { reviewId, commandId: crypto.randomUUID(), previewDigest: review.previewDigest, note: note.trim() } }
    if (!request.payload.note || request.payload.reviewId !== reviewId || !sameManagedIdentity(request.identity, actor)) return
    pending.current = request
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
        setMessage('Your change request is saved for SuperMega. Nothing has been published.')
      })
      if (!accepted) denyChangedAccess()
    } catch {
      const accepted = await access.commit(epoch, request.identity, review.expiresAt, () => setMessage('We could not confirm the save. Retry this same request; it will not create a duplicate.'))
      if (!accepted) denyChangedAccess()
    } finally { if (access.isCurrent(epoch)) setBusy(false) }
  }

  return <main className="website-product customer-website-review">
    <header className="customer-review-heading"><Link to="/">SuperMega</Link><h1>Your prepared Website</h1><p>Review the pages. Tell us what to change. We handle the build.</p></header>
    <p role="status" aria-live="polite">{message}</p>
    {!review && <div className="customer-review-actions"><Link to="/login?product=website" target="_blank" rel="noreferrer">Sign in</Link><button type="button" onClick={() => { access.invalidate(); setReview(null); setActor(null); setBusy(false); setAttempt(value => value + 1) }}>Open review</button></div>}
    {review && <>
      <PreparedWebsitePage review={review} pageId={pageId} onPageChange={setPageId} />
      <form className="customer-review-feedback" onSubmit={submit}><h2>What would you like changed?</h2><label htmlFor="website-review-note">Your change request</label><textarea id="website-review-note" rows={4} maxLength={2000} value={note} readOnly={unconfirmed} onChange={event => setNote(event.target.value)} required /><p>SuperMega reviews your request. This does not approve or publish the Website.</p><button type="submit" disabled={busy || !note.trim()}>{busy ? 'Saving…' : unconfirmed ? 'Retry same request' : 'Request changes'}</button></form>
    </>}
  </main>
}

export function PreparedWebsitePage({ review, pageId, onPageChange }: { review: CustomerWebsiteReview; pageId: string; onPageChange: (id: string) => void }) {
  const page = review.preview.pages.find(item => item.id === pageId) ?? review.preview.pages[0]
  return <>
      <nav className="customer-review-actions" aria-label="Prepared pages">{review.preview.pages.map(item => <button type="button" key={item.id} aria-current={item.id === page.id ? 'page' : undefined} onClick={() => onPageChange(item.id)}>{item.navigation.label || item.seo.title || 'Page'}</button>)}</nav>
      <article className="website-preview-site" aria-label="Prepared page preview">
        <header className="preview-site-header"><strong>{review.preview.siteName}</strong><span>Private preview</span></header>
        <div className="preview-site-main"><section className="preview-hero"><span>{page.hero.eyebrow}</span><h2>{page.hero.headline}</h2><p>{page.hero.summary}</p>{page.hero.ctaLabel && <span className="preview-cta" aria-disabled="true">{page.hero.ctaLabel}</span>}</section>
          <section className="preview-section-grid">{page.sections.map(section => <article key={section.id}><span>{section.eyebrow}</span><h3>{section.title}</h3><p>{section.body}</p></article>)}</section></div>
        <footer className="preview-site-footer">Preview only · links and publishing are disabled</footer>
      </article>
    </>
}
