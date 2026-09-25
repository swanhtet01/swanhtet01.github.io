import { useEffect, useRef, useState } from 'react'
import { currentManagedIdentity, sameManagedIdentity, loadManagedEcommerceReviews, loadManagedEcommerceOperatorDecisions, loadManagedEcommercePreparation, loadManagedEcommerceRecipients, prepareManagedEcommerceReview, withdrawManagedEcommerceReview, reconcileManagedEcommerceReview, resolveExpiredManagedEcommerceReview, type ManagedIdentity } from '../../core/managed-trial'
import { verifyCatalogReviewDirectory, type CatalogSavedReview, verifyCatalogOperatorDecisions, verifyCatalogPreparation, verifyCatalogRecipients, verifyCatalogPreparationReceipt, verifyCatalogWithdrawal, verifyCatalogReconciliation, verifyCatalogExpiredAbsence, readCatalogCommand, retainCatalogCommand, clearCatalogCommand, type CatalogPreparation, type CatalogRecipients, type CatalogPreparationCommand, type CatalogPreparationReceipt } from './operator-review-contract'
import { PreparedCatalog } from './PreparedCatalog'

export function CatalogReviewPreparation({ workspaceId, actorId }: { workspaceId: string; actorId: string }) {
  const [source, setSource] = useState<CatalogPreparation | null>(null)
  const [recipients, setRecipients] = useState<CatalogRecipients | null>(null)
  const [selected, setSelected] = useState('')
  const [pending, setPending] = useState<CatalogPreparationCommand | null>(null)
  const [receipt, setReceipt] = useState<CatalogPreparationReceipt | null>(null)
  const [message, setMessage] = useState('Prepare a private catalog review for an enrolled customer.')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false), epoch = useRef(0)
  const key = `supermega.ecommerce.pending-review.v1:${JSON.stringify([workspaceId, actorId])}`
  const [responses, setResponses] = useState<ReturnType<typeof verifyCatalogOperatorDecisions> | null>(null)
  const [directory, setDirectory] = useState<ReturnType<typeof verifyCatalogReviewDirectory> | null>(null)
  const [chosen, setChosen] = useState<CatalogSavedReview | null>(null)
  useEffect(() => {
    const clear = () => { epoch.current++; setSource(null); setRecipients(null); setSelected(''); setPending(null); setReceipt(null); setResponses(null); setDirectory(null); setChosen(null); setMessage('Open the saved catalog to continue.') }
    clear()
    window.addEventListener('focus', clear); window.addEventListener('storage', clear)
    return () => { epoch.current++; window.removeEventListener('focus', clear); window.removeEventListener('storage', clear) }
  }, [workspaceId, actorId])
  async function identity() {
    const who = await currentManagedIdentity()
    if (!who || who.workspaceId !== workspaceId || who.userId !== actorId) {
      epoch.current++; setSource(null); setRecipients(null); setSelected(''); setPending(null); setReceipt(null); setResponses(null); setDirectory(null); setChosen(null)
      setMessage('Your account changed. Reopen this workspace to continue.')
      throw Error('Account changed')
    }
    return who
  }
  async function current(who: ManagedIdentity, started: number) {
    const latest = await identity()
    return started === epoch.current && sameManagedIdentity(who, latest)
  }
  function savedReview() {
    const raw = window.sessionStorage.getItem(key + ':receipt')
    if (raw === null) return null
    if (raw.length > 3072) throw Error('Review receipt is unavailable')
    const envelope = JSON.parse(raw)
    if (!envelope || Object.keys(envelope).sort().join('|') !== 'command|receipt') throw Error('Review receipt changed')
    const command = readCatalogCommand({ getItem: () => JSON.stringify(envelope.command) }, key)
    if (!command || command === 'unavailable') throw Error('Review command is unavailable')
    return { command, receipt: verifyCatalogPreparationReceipt(envelope.receipt, command) }
  }
  async function open(after?: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setResponses(null); setChosen(null); setDirectory(null)
    const started = epoch.current
    try {
      const who = await identity()
      const retained = readCatalogCommand(window.sessionStorage, key)
      if (retained === 'unavailable') throw Error('Pending review is unavailable')
      const previous = savedReview()
      if (previous) {
        if (retained) verifyCatalogPreparationReceipt(previous.receipt, retained)
        const saved = previous.receipt
        if (!await current(who, started)) return
        setReceipt(saved); setPending(null); setSource(null); setRecipients(null)
        setMessage('Last confirmed review. Customer access is checked when the link opens.')
        return
      }
      if (retained) {
        if (!await current(who, started)) return
        setPending(retained); setSource(null); setRecipients(null); setSelected('')
        setMessage('A previous request needs confirmation. Retry the same request.')
        return
      }
      const prepared = await verifyCatalogPreparation(await loadManagedEcommercePreparation(who))
      const choices = verifyCatalogRecipients(await loadManagedEcommerceRecipients(who, after), after)
      if (!await current(who, started)) return
      setSource(prepared); setRecipients(choices); setSelected(choices.recipients[0]?.grantId ?? ''); setPending(retained)
      setMessage(retained ? 'A previous request needs confirmation. Retry the same request.' : choices.recipients.length ? 'Choose the customer who will review this catalog.' : 'No enrolled customers. Ask the owner to arrange review access.')
    } catch { if (started === epoch.current) setMessage('Could not open preparation. Check your account and try again.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function prepare() {
    if (lock.current || (!pending && (!source || !selected))) return
    lock.current = true; setBusy(true); setResponses(null); setChosen(null); setDirectory(null)
    const started = epoch.current
    try {
      const who = await identity()
      const command = pending ?? { reviewId: crypto.randomUUID(), recipientGrantId: selected, expectedVersion: source!.sourceVersion,
        expiresAt: new Date(Date.now() + 86400000).toISOString(), contentRevision: source!.contentRevision, previewDigest: source!.previewDigest, readAt: source!.readAt }
      retainCatalogCommand(window.sessionStorage, key, command)
      if (!await current(who, started)) return
      setPending(command)
      const { reviewId, recipientGrantId, expectedVersion, expiresAt } = command
      const saved = verifyCatalogPreparationReceipt(await prepareManagedEcommerceReview({ reviewId, recipientGrantId, expectedVersion, expiresAt }, who), command)
      if (!await current(who, started)) return
      window.sessionStorage.setItem(key + ':receipt', JSON.stringify({ command, receipt: saved }))
      const persisted = savedReview()
      if (!persisted) throw Error('Receipt missing')
      verifyCatalogPreparationReceipt(persisted.receipt, command)
      setPending(null); setReceipt(saved); setMessage('Private review prepared. Nothing has been sent or published.')
    } catch { if (started === epoch.current) setMessage('Preparation is unconfirmed. Reopen and retry the same request.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function resolveExpired() {
    if (lock.current || !pending || receipt) return
    lock.current = true; setBusy(true); setResponses(null); setChosen(null); setDirectory(null)
    const started = epoch.current
    try {
      const who = await identity()
      const retained = readCatalogCommand(window.sessionStorage, key)
      if (!retained || retained === 'unavailable' || JSON.stringify(retained) !== JSON.stringify(pending) || savedReview()) throw Error('Request changed')
      verifyCatalogExpiredAbsence(await resolveExpiredManagedEcommerceReview(retained.reviewId, retained.expiresAt, who), retained)
      if (!await current(who, started)) return
      if (savedReview()) throw Error('Review receipt exists')
      clearCatalogCommand(window.sessionStorage, key, retained)
      setPending(null); setSource(null); setRecipients(null); setSelected('')
      setMessage('Expired request cleared. Open the saved catalog to prepare a new review.')
    } catch { if (started === epoch.current) setMessage('Request retained. It must be expired and have no review before it can be cleared. Check review status or try again later.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function reconcile() {
    const displayed = pending ?? receipt
    if (lock.current || !displayed) return
    lock.current = true; setBusy(true); setResponses(null); setChosen(null); setDirectory(null)
    const started = epoch.current
    try {
      const who = await identity()
      const stored = readCatalogCommand(window.sessionStorage, key)
      const envelope = savedReview()
      const command = stored ?? envelope?.command
      if (!command || command === 'unavailable' || command.reviewId !== displayed.reviewId) throw Error('Review changed')
      const result = verifyCatalogReconciliation(await reconcileManagedEcommerceReview(command.reviewId, who), command)
      if (!await current(who, started)) return
      if (result.status === 'active') {
        const { readAt: _readAt, ...assignment } = result
        const saved = verifyCatalogPreparationReceipt({ ...assignment, status: 'prepared_preview', persisted: true, replayed: true }, command)
        retainCatalogCommand(window.sessionStorage, key, command)
        window.sessionStorage.setItem(key + ':receipt', JSON.stringify({ command, receipt: saved }))
        const retained = savedReview()
        if (!retained) throw Error('Receipt missing')
        verifyCatalogPreparationReceipt(retained.receipt, command)
        setReceipt(saved); setPending(null); setSource(null); setRecipients(null)
        setMessage('Review found. Customer access is checked when the link opens.')
      } else {
        if (stored !== null) clearCatalogCommand(window.sessionStorage, key, command)
        if (envelope) {
          window.sessionStorage.removeItem(key + ':receipt')
          if (window.sessionStorage.getItem(key + ':receipt') !== null) throw Error('Receipt retained')
        }
        setReceipt(null); setResponses(null); setDirectory(null); setChosen(null); setPending(null); setSource(null); setRecipients(null)
        setMessage('This review is inactive. Open the saved catalog to prepare a new review.')
      }
    } catch { if (started === epoch.current) setMessage('Review status is unconfirmed. Your saved request is retained; check again.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function savedReviews(after?: string) {
    if (lock.current) return
    lock.current=true; setBusy(true); setResponses(null); setChosen(null); setDirectory(null)
    const started=epoch.current
    try {
      const who=await identity()
      const result=verifyCatalogReviewDirectory(await loadManagedEcommerceReviews(who,after),after)
      if(await current(who,started))setDirectory(result)
    } catch { if(started===epoch.current)setMessage('Could not load saved reviews.') }
    finally {lock.current=false;setBusy(false)}
  }
  async function readResponses(after?: string, selected = chosen) {
    if (lock.current || (!receipt && !selected)) return
    lock.current = true; setBusy(true); setResponses(null)
    const started = epoch.current
    try {
      const who = await identity()
      const retained = selected ? null : savedReview()
      const binding = selected ?? retained?.command
      if (!binding || (!selected && retained?.receipt.reviewId !== receipt?.reviewId)) throw Error('Review changed')
      const page = verifyCatalogOperatorDecisions(await loadManagedEcommerceOperatorDecisions(binding.reviewId, who, after), binding, after)
      if (!await current(who, started)) return
      setChosen(selected); setResponses(page); setMessage('Customer response. Publishing still needs review.')
    } catch { if (started === epoch.current) setMessage('Could not check the response. Try again.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function withdraw() {
    if (lock.current || !receipt) return
    lock.current = true; setBusy(true); setResponses(null); setChosen(null); setDirectory(null)
    const started = epoch.current
    try {
      const who = await identity()
      const stored = readCatalogCommand(window.sessionStorage, key)
      const command = stored ?? savedReview()?.command
      if (!command || command === 'unavailable' || command.reviewId !== receipt.reviewId) throw Error('Review changed')
      verifyCatalogWithdrawal(await withdrawManagedEcommerceReview(receipt.reviewId, who), receipt.reviewId)
      if (!await current(who, started)) return
      // The receipt envelope retains the command if cleanup stops halfway.
      if (stored !== null) clearCatalogCommand(window.sessionStorage, key, command)
      window.sessionStorage.removeItem(key + ':receipt')
      if (window.sessionStorage.getItem(key + ':receipt') !== null) throw Error('Receipt retained')
      setReceipt(null); setResponses(null); setDirectory(null); setChosen(null); setPending(null); setSource(null); setRecipients(null)
      setMessage('Review withdrawn. The customer link no longer opens this review.')
    } catch { if (started === epoch.current) setMessage('Withdrawal is unconfirmed. Retry withdrawal for this review.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="catalog-review-tools" aria-label="Prepare customer catalog" aria-busy={busy}>
    <p role="status">{message}</p>
    <button className="core-button" type="button" disabled={busy} onClick={() => void open()}>Open saved catalog</button>
    <button className="core-button" type="button" disabled={busy} onClick={() => void savedReviews()}>Saved reviews</button>
    {directory ? <div aria-label="Saved reviews">
      {!directory.reviews.length ? <p>No saved reviews.</p> : directory.reviews.map(item => <button className="core-button" key={item.reviewId} disabled={busy} onClick={() => {setChosen(item); void readResponses(undefined,item)}}>
        {item.preparedAt.slice(0,10)} · {item.status}
      </button>)}
      {directory.nextAfter ? <button className="core-button" disabled={busy} onClick={() => void savedReviews(directory.nextAfter!)}>More reviews</button> : null}
    </div> : null}
    {source ? <details><summary>Preview catalog</summary><PreparedCatalog preview={source.preview} /></details> : null}
    {recipients && !receipt ? <>
      <label>Customer<select value={selected} disabled={busy || !!pending} onChange={event => setSelected(event.target.value)}>
        {recipients.recipients.map(row => <option key={row.grantId} value={row.grantId}>{row.label}</option>)}
      </select></label>
      {recipients.nextAfter && !pending ? <button className="core-button" type="button" disabled={busy} onClick={() => void open(recipients.nextAfter!)}>More customers</button> : null}
    </> : null}
    {!receipt && (pending || (source && recipients)) ? <button className="core-button primary" type="button" disabled={busy || (!pending && !selected)} onClick={() => void prepare()}>{pending ? 'Retry same request' : 'Prepare review'}</button> : null}
    {receipt ? <a className="core-button primary" href={`/ecommerce/review/${receipt.reviewId}`}>Open private review</a> : null}
    {receipt ? <button className="core-button" type="button" disabled={busy} onClick={() => void readResponses(undefined,null)}>Check response</button> : null}
    {responses ? <section aria-label="Customer response">
      {responses.status !== 'active' ? <p>Review {responses.status}. These are earlier responses.</p> : null}
      {!responses.decisions.length ? <p>No response on this page.</p> : responses.decisions.map(item => <div key={item.commandId}>
        <strong>{item.kind === 'acceptance' ? 'Catalog accepted' : 'Changes requested'}</strong>
        {item.note ? <p style={{ whiteSpace: 'pre-wrap' }}>{item.note}</p> : null}
      </div>)}
      {responses.nextAfter ? <button className="core-button" type="button" disabled={busy} onClick={() => void readResponses(responses.nextAfter!)}>More responses</button> : null}
    </section> : null}
    {pending || receipt ? <details className="catalog-review-recovery"><summary>Review options</summary><div>
      <button className="core-button" type="button" disabled={busy} onClick={() => void reconcile()}>Check review status</button>
      {pending && !receipt ? <button className="core-button" type="button" disabled={busy} onClick={() => void resolveExpired()}>Resolve expired request</button> : null}
      {receipt ? <button className="core-button danger" type="button" disabled={busy} onClick={() => void withdraw()}>Withdraw review</button> : null}
    </div></details> : null}
  </section>
}
