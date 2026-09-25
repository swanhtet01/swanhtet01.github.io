import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { currentManagedIdentity, loadManagedEcommerceReview, loadManagedEcommerceDecisions, sendManagedEcommerceDecision, sameManagedIdentity, type ManagedIdentity, type EcommerceReviewDecision } from '../../core/managed-trial'
import { customerEcommerceReviewLoginPath } from '../../core/account-routes'
import { createReviewAccessBoundary } from '../website/customer-review-access'
import { verifyPreparedCatalogReview, verifyCatalogDecisionPage, type PreparedCatalogReview, type CatalogDecisionPage } from './prepared-catalog-review'
import { retainCatalogDecision, recoverCatalogDecision, clearCatalogDecision } from './pending-catalog-decision'
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
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [command] = useState(() => ({ busy: false, identity: null as ManagedIdentity | null,
    pending: null as { payload: EcommerceReviewDecision; identity: ManagedIdentity } | null }))

  async function submit(kind: 'acceptance' | 'feedback') {
    if (command.busy || !review || !decisions || decisions.decisions.length || !command.identity) return
    const epoch = access.capture()
    const identity = command.identity
    const closeChangedAccess = () => {
      if (!access.isCurrent(epoch)) return
      access.invalidate(); setReview(null); setDecisions(null)
      setMessage('Your access changed. Sign in and reopen this review.')
    }
    if (!command.pending) {
      if (kind === 'feedback' && (!note.trim() || [...note.trim()].length > 2000)) return
      command.pending = { identity, payload: { reviewId, commandId: crypto.randomUUID(), previewDigest: review.previewDigest,
        ...(kind === 'acceptance' ? { decision: 'accept_preview_for_release_review' as const } : { note: note.trim() }) } }
    }
    const pending = command.pending
    command.busy = true; setSaving(true); setSaveMessage('')
    try {
      if (!sameManagedIdentity(identity, pending.identity)
        || !await access.commit(epoch, identity, review.expiresAt, () => {})) { closeChangedAccess(); return }
      retainCatalogDecision(window.sessionStorage, pending.identity, review, pending.payload)
      await sendManagedEcommerceDecision(pending.payload, pending.identity)
      const saved = verifyCatalogDecisionPage(await loadManagedEcommerceDecisions(reviewId, identity), review)
      const retained = saved.decisions.find(item => item.commandId === pending.payload.commandId)
      if (!retained || (pending.payload.decision ? retained.kind !== 'acceptance'
        : retained.kind !== 'feedback' || retained.note !== pending.payload.note)) throw Error('unconfirmed')
      const confirmed = await access.commit(epoch, identity, review.expiresAt, () => {
        clearCatalogDecision(window.sessionStorage, identity, reviewId)
        setDecisions(saved); command.pending = null; setNote(''); setEditing(false)
      })
      if (!confirmed) closeChangedAccess()
    } catch {
      if (!await access.commit(epoch, identity, review.expiresAt, () => {})) closeChangedAccess()
      else setSaveMessage('Response unconfirmed. Retry safely.')
    } finally {
      command.busy = false
      setSaving(false)
    }
  }


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
        const recovered = recoverCatalogDecision(window.sessionStorage, identity, verified)
        const saved = verifyCatalogDecisionPage(await loadManagedEcommerceDecisions(reviewId, identity), verified)
        if (!active || !access.isCurrent(epoch)) return
        const accepted = await access.commit(epoch, identity, verified.expiresAt, () => {
          command.identity = identity
          command.pending = recovered ? { identity, payload: recovered } : null
          if (recovered && saved.decisions.some(item => item.commandId === recovered.commandId
            && (recovered.decision ? item.kind === 'acceptance' : item.kind === 'feedback' && item.note === recovered.note))) {
            clearCatalogDecision(window.sessionStorage, identity, reviewId); command.pending = null
          }
          setSaveMessage(recovered ? 'Check and resend your saved response.' : '')
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
  }, [reviewId, attempt, access, command])

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
      </section> : decisions ? <section className="prepared-catalog" aria-busy={saving}>
        {command.pending ? <>
          <p role="status">{saveMessage || 'Your response is being saved.'}</p>
          <button type="button" disabled={saving} onClick={() => void submit('acceptance')}>{saving ? 'Saving…' : 'Retry response'}</button>
        </> : editing ? <form onSubmit={event => { event.preventDefault(); void submit('feedback') }}>
          <label htmlFor="catalog-changes">What needs changing?</label>
          <textarea id="catalog-changes" value={note} maxLength={2000} required onChange={event => setNote(event.target.value)} />
          <button type="submit" disabled={saving || !note.trim()}>Send changes</button>
          <button type="button" onClick={() => setEditing(false)}>Cancel</button>
        </form> : <>
          <button type="button" onClick={() => void submit('acceptance')}>Accept catalog</button>
          <button type="button" onClick={() => setEditing(true)}>Request changes</button>
          <p>SuperMega reviews before publishing.</p>
        </>}
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
