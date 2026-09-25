import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { currentManagedIdentity, loadManagedEcommerceReview, loadManagedEcommerceDecisions, sendManagedEcommerceDecision, sameManagedIdentity, type ManagedIdentity, type EcommerceReviewDecision } from '../../core/managed-trial'
import { customerEcommerceReviewLoginPath } from '../../core/account-routes'
import { createReviewAccessBoundary } from '../website/customer-review-access'
import { verifyPreparedCatalogReview, verifyCatalogDecisionPage, type PreparedCatalogReview, type CatalogDecisionPage } from './prepared-catalog-review'
import { retainCatalogDecision, recoverCatalogDecision, clearCatalogDecision, discardExpiredCatalogDecision } from './pending-catalog-decision'
import { PreparedCatalog } from './PreparedCatalog'

export default function EcommerceCustomerReview() {
  const { reviewId = '' } = useParams()
  return <CatalogReviewContent key={reviewId} reviewId={reviewId} />
}

const changedAccessMessage = 'Your access changed. Sign in and reopen this review.'

function CatalogReviewContent({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<PreparedCatalogReview | null>(null)
  const [message, setMessage] = useState('Opening catalog…')
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

  async function readDecisions(identity: ManagedIdentity, currentReview: PreparedCatalogReview,
    epoch: number, pending?: EcommerceReviewDecision | null) {
    let after: string | undefined
    for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
      if (!await access.commit(epoch, identity, currentReview.expiresAt, () => {})) throw Error()
      const page = verifyCatalogDecisionPage(await loadManagedEcommerceDecisions(reviewId, identity, after), currentReview, after)
      if (!pending || page.decisions.some(item => item.commandId === pending.commandId) || !page.nextAfter) return page
      after = page.nextAfter
    }
    throw Error()
  }

  async function submit(kind: 'acceptance' | 'feedback') {
    if (command.busy || !review || !decisions || (decisions.decisions.length && !command.pending) || !command.identity) return
    const epoch = access.capture()
    const identity = command.identity
    const closeChangedAccess = () => {
      if (!access.isCurrent(epoch)) return
      access.invalidate(); setReview(null); setDecisions(null)
      setMessage(changedAccessMessage)
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
      const saved = await readDecisions(identity, review, epoch, pending.payload)
      const retained = saved.decisions.find(item => item.commandId === pending.payload.commandId)
      if (!retained || (pending.payload.decision ? retained.kind !== 'acceptance'
        : retained.kind !== 'feedback' || retained.note !== pending.payload.note)) throw Error()
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
        if (!identity) { setMessage('Sign in with your assigned account.'); return }
        discardExpiredCatalogDecision(window.sessionStorage, identity, reviewId)
        const verified = await verifyPreparedCatalogReview(await loadManagedEcommerceReview(reviewId, identity), reviewId)
        if (!active || !access.isCurrent(epoch)) return
        const recovered = recoverCatalogDecision(window.sessionStorage, identity, verified)
        const saved = await readDecisions(identity, verified, epoch, recovered)
        if (!active || !access.isCurrent(epoch)) return
        const accepted = await access.commit(epoch, identity, verified.expiresAt, () => {
          command.identity = identity
          command.pending = recovered ? { identity, payload: recovered } : null
          if (recovered && saved.decisions.some(item => item.commandId === recovered.commandId
            && (recovered.decision ? item.kind === 'acceptance' : item.kind === 'feedback' && item.note === recovered.note))) {
            clearCatalogDecision(window.sessionStorage, identity, reviewId); command.pending = null
          }
          setSaveMessage(recovered ? 'Retry your saved response.' : '')
          setDecisions(saved); setReview(verified)
        })
        if (!accepted && access.isCurrent(epoch)) setMessage(changedAccessMessage)
      } catch {
        if (active && access.isCurrent(epoch)) setMessage('Review unavailable. Try again.')
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
      try { if (command.identity) clearCatalogDecision(window.sessionStorage, command.identity, reviewId) } catch { /* Storage may be unavailable. */ }
      command.pending = null; setNote('')
      access.invalidate(); setReview(null); setDecisions(null); setMessage('This review expired. Ask for a new review.')
    }, Math.max(0, Math.min(2147483647, Date.parse(review.expiresAt) - Date.now())))
    return () => window.clearTimeout(timer)
  }, [review, access, command, reviewId])

  return <main className="catalog-review-page" aria-busy={opening}>
    {review ? <>
      <PreparedCatalog preview={review.preview} />
      {decisions?.decisions.length && !command.pending ? <section className="prepared-catalog" role="status">
        <h2>{decisions.decisions[0].kind === 'acceptance' ? 'Catalog accepted' : 'Changes requested'}</h2>
        <p>{decisions.decisions[0].kind === 'acceptance'
          ? 'SuperMega will review it before publishing.' : 'SuperMega will prepare an updated review.'}</p>
      </section> : decisions ? <section className="prepared-catalog" aria-busy={saving}>
        {command.pending ? <>
          <p role="status">{saveMessage || 'Saving response.'}</p>
          <button type="button" disabled={saving} onClick={() => void submit('acceptance')}>{saving ? 'Saving…' : 'Retry response'}</button>
        </> : editing ? <form onSubmit={event => { event.preventDefault(); void submit('feedback') }}>
          <label htmlFor="catalog-changes">What needs changing?</label>
          <textarea id="catalog-changes" value={note} maxLength={2000} required onChange={event => setNote(event.target.value)} />
          <button type="submit" disabled={saving || !note.trim()}>Send changes</button>
          <button type="button" onClick={() => setEditing(false)}>Cancel</button>
        </form> : <>
          <button type="button" onClick={() => void submit('acceptance')}>Accept catalog</button>
          <button type="button" onClick={() => setEditing(true)}>Request changes</button>
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
