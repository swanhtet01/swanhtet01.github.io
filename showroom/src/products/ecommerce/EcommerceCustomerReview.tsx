import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { currentManagedIdentity, loadManagedEcommerceReview, loadManagedEcommerceDecisions, sameManagedIdentity } from '../../core/managed-trial'
import { customerEcommerceReviewLoginPath } from '../../core/account-routes'
import { createReviewAccessBoundary } from '../website/customer-review-access'
import { verifyPreparedCatalogReview, verifyCatalogDecisionPage, type PreparedCatalogReview, type CatalogDecisionPage } from './prepared-catalog-review'
import { PreparedCatalog } from './PreparedCatalog'

export default function EcommerceCustomerReview() {
  const { reviewId = '' } = useParams()
  return <CatalogReviewContent key={reviewId} reviewId={reviewId} />
}

function CatalogReviewContent({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<PreparedCatalogReview | null>(null)
  const [message, setMessage] = useState('Opening your catalog…')
  const [opening, setOpening] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [access] = useState(() => createReviewAccessBoundary(currentManagedIdentity, sameManagedIdentity))

  const [decisions, setDecisions] = useState<CatalogDecisionPage | null>(null)

  useEffect(() => {
    let active = true
    const epoch = access.invalidate()
    async function open() {
      try {
        const identity = await currentManagedIdentity()
        if (!active || !access.isCurrent(epoch)) return
        if (!identity) { setMessage('Sign in with the account assigned to this review.'); return }
        const verified = await verifyPreparedCatalogReview(await loadManagedEcommerceReview(reviewId, identity), reviewId)
        if (!active || !access.isCurrent(epoch)) return
        const saved = verifyCatalogDecisionPage(await loadManagedEcommerceDecisions(reviewId, identity), verified)
        if (!active || !access.isCurrent(epoch)) return
        const accepted = await access.commit(epoch, identity, verified.expiresAt, () => {
          setDecisions(saved); setReview(verified)
        })
        if (!accepted && access.isCurrent(epoch)) setMessage('Your access changed. Sign in and reopen this review.')
      } catch {
        if (active && access.isCurrent(epoch)) setMessage('Could not open this review. Try again. If it still does not open, ask SuperMega to check your access.')
      } finally {
        if (active && access.isCurrent(epoch)) setOpening(false)
      }
    }
    void open()
    const refresh = () => {
      access.invalidate(); setReview(null); setDecisions(null); setOpening(true); setMessage('Checking your access…'); setAttempt(value => value + 1)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => { active = false; access.invalidate(); window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh) }
  }, [reviewId, attempt, access])

  useEffect(() => {
    if (!review) return
    const timer = window.setTimeout(() => {
      access.invalidate(); setReview(null); setDecisions(null); setMessage('This review expired. Ask SuperMega for a fresh review.')
    }, Math.max(0, Math.min(2147483647, Date.parse(review.expiresAt) - Date.now())))
    return () => window.clearTimeout(timer)
  }, [review, access])

  return <main className="catalog-review-page" aria-busy={opening}>
    {review ? <>
      <PreparedCatalog preview={review.preview} />
      {decisions?.decisions.length ? <section className="prepared-catalog" role="status">
        <h2>{decisions.decisions[0].kind === 'acceptance' ? 'Catalog accepted' : 'Changes requested'}</h2>
        <p>{decisions.decisions[0].kind === 'acceptance'
          ? 'SuperMega will review it before publishing.' : 'SuperMega will prepare an updated review.'}</p>
      </section> : null}
    </> : <section className="prepared-catalog">
      <h1>Your catalog</h1><p role="status">{message}</p>
      {!opening ? <p><Link to={customerEcommerceReviewLoginPath(reviewId)}>Sign in</Link></p> : null}
      <button type="button" disabled={opening} onClick={() => {
        access.invalidate(); setReview(null); setDecisions(null); setOpening(true); setAttempt(value => value + 1)
      }}>{opening ? 'Opening…' : 'Try again'}</button>
    </section>}
  </main>
}
