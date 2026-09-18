import { useEffect, useRef, useState } from 'react'
import { currentManagedIdentity, loadManagedWebsitePreparation, loadManagedWebsiteReviewStaffPage, loadManagedWebsiteRecipients, prepareManagedWebsiteReview, sameManagedIdentity, withdrawManagedWebsiteReview } from '../../core/managed-trial'
import { reviewContactDestination, verifyWebsitePreviewContent, type CustomerWebsiteReview } from './customer-review-contract'

type Review = { reviewId: string; contentRevision: number; sourceVersion: number; preparedAt: string; expiresAt: string; status: string; hasChangeRequests: boolean; hasCustomerAcceptance: boolean }
type Acceptance = { contentRevision: number; sourceVersion: number; previewDigest: string; acceptedAt: string; status: 'accepted_for_operator_release_review'; publicationAuthorized: false; deploymentAuthorized: false }
type Changes = { reviewId: string; contentRevision: number; sourceVersion: number; previewDigest: string; reviewStatus: string; acceptance: Acceptance | null; requests: { commandId: string; note: string; createdAt: string }[]; nextAfter: string | null; publicationAuthorized: false }
type Listing = { reviews: Review[]; nextAfter: string | null; order: 'review_id_ascending'; publicationAuthorized: false }
type Preparation = { sourceVersion: number; contentRevision: number; previewDigest: string; readAt: string; preview: CustomerWebsiteReview['preview'] }
type Recipients = { recipients: { grantId: string; label: string }[]; nextAfter: string | null; order: 'grant_id_ascending'; accessGranted: false }
type PrepareCommand = { reviewId: string; recipientGrantId: string; expectedVersion: number; expiresAt: string }
const uuid = (value: unknown): value is string => typeof value === 'string' && value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const time = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const version = (value: unknown, min = 0) => Number.isSafeInteger(value) && Number(value) >= min
const status = (value: unknown) => ['active', 'expired', 'stale', 'revoked'].includes(String(value))
const invalid = () => { throw new Error('Unverified review response') }
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== keys.sort().join('|')) return invalid()
  return value as Record<string, unknown>
}

function verifyStaffReviews(value: unknown, after?: string): Listing {
  const root = exact(value, ['reviews', 'nextAfter', 'order', 'publicationAuthorized'])
  if (root.publicationAuthorized !== false || root.order !== 'review_id_ascending' || !Array.isArray(root.reviews) || root.reviews.length > 50) return invalid()
  let prior = after ?? ''
  for (const raw of root.reviews) {
    const row = exact(raw, ['reviewId', 'contentRevision', 'sourceVersion', 'preparedAt', 'expiresAt', 'status', 'hasChangeRequests', 'hasCustomerAcceptance'])
    if (!uuid(row.reviewId) || row.reviewId <= prior || !version(row.contentRevision) || !version(row.sourceVersion, 1)
      || !time(row.preparedAt) || !time(row.expiresAt) || !status(row.status) || typeof row.hasChangeRequests !== 'boolean'
      || typeof row.hasCustomerAcceptance !== 'boolean' || (row.hasChangeRequests && row.hasCustomerAcceptance)) return invalid()
    prior = row.reviewId
  }
  if (root.nextAfter !== null && (root.reviews.length !== 50 || root.nextAfter !== prior)) return invalid()
  return structuredClone(root) as Listing
}

function verifyStaffChanges(value: unknown, review: Review): Changes {
  const root = exact(value, ['reviewId', 'contentRevision', 'sourceVersion', 'previewDigest', 'reviewStatus', 'acceptance', 'requests', 'nextAfter', 'publicationAuthorized'])
  if (root.publicationAuthorized !== false || root.reviewId !== review.reviewId || root.contentRevision !== review.contentRevision
    || root.sourceVersion !== review.sourceVersion || typeof root.previewDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(root.previewDigest)
    || !status(root.reviewStatus) || !Array.isArray(root.requests) || root.requests.length > 50) return invalid()
  if (root.acceptance !== null) {
    const accepted = exact(root.acceptance, ['contentRevision', 'sourceVersion', 'previewDigest', 'acceptedAt', 'status', 'publicationAuthorized', 'deploymentAuthorized'])
    if (root.requests.length || root.nextAfter !== null || accepted.contentRevision !== root.contentRevision
      || accepted.sourceVersion !== root.sourceVersion || accepted.previewDigest !== root.previewDigest
      || accepted.status !== 'accepted_for_operator_release_review' || accepted.publicationAuthorized !== false
      || accepted.deploymentAuthorized !== false || !time(accepted.acceptedAt)
      || Date.parse(String(accepted.acceptedAt)) < Date.parse(review.preparedAt)
      || Date.parse(String(accepted.acceptedAt)) >= Date.parse(review.expiresAt)) return invalid()
  }
  const ids = new Set<string>()
  let previous: { at: bigint; id: string } | undefined
  for (const raw of root.requests) {
    const row = exact(raw, ['commandId', 'note', 'createdAt'])
    if (!uuid(row.commandId) || ids.has(row.commandId) || !time(row.createdAt) || typeof row.note !== 'string'
      || !row.note.trim() || Array.from(row.note).length > 2000) return invalid()
    const stamp = String(row.createdAt)
    const micros = (stamp.match(/\.(\d{1,6})/)?.[1] ?? '').padEnd(6, '0').slice(3)
    const at = BigInt(Date.parse(stamp)) * 1000n + BigInt(micros)
    if (previous && (at > previous.at || (at === previous.at && row.commandId >= previous.id))) return invalid()
    ids.add(row.commandId); previous = { at, id: row.commandId }
  }
  if (root.nextAfter !== null && (root.requests.length !== 50 || root.nextAfter !== previous?.id)) return invalid()
  return structuredClone(root) as Changes
}

function customerHandoff(review: Review, decision: Changes, origin: string, now: number): string | null {
  if (origin !== 'https://app.supermega.dev' || !Number.isFinite(now)
    || review.status !== 'active' || decision.reviewStatus !== 'active'
    || !uuid(review.reviewId) || decision.reviewId !== review.reviewId
    || decision.sourceVersion !== review.sourceVersion || decision.contentRevision !== review.contentRevision
    || review.hasChangeRequests || review.hasCustomerAcceptance || decision.acceptance !== null
    || decision.requests.length || decision.nextAfter !== null
    || !time(review.preparedAt) || !time(review.expiresAt)
    || now < Date.parse(review.preparedAt) || now >= Date.parse(review.expiresAt)) return null
  return `Your prepared Website is ready to review.\n\n${origin}/website/review/${review.reviewId}\n\nSign in with the account assigned to this review. Check revision ${review.contentRevision}, then accept it or tell us what to change. No editing is needed.\n\nThis review expires ${new Date(review.expiresAt).toLocaleString()}. Acceptance does not publish your Website or take payment. SuperMega handles the next step.`
}

async function verifyPreparation(value: unknown): Promise<Preparation> {
  const root = exact(structuredClone(value), ['status', 'sourceVersion', 'contentRevision', 'preview', 'previewDigest', 'readAt', 'reviewCreated', 'publicationAuthorized', 'deploymentAuthorized'])
  if (root.status !== 'saved_source_preview' || !version(root.sourceVersion, 1) || !version(root.contentRevision)
    || !time(root.readAt) || root.reviewCreated !== false || root.publicationAuthorized !== false || root.deploymentAuthorized !== false) return invalid()
  const preview = await verifyWebsitePreviewContent(root.preview, root.previewDigest)
  return { sourceVersion: Number(root.sourceVersion), contentRevision: Number(root.contentRevision), previewDigest: String(root.previewDigest), readAt: String(root.readAt), preview }
}

function verifyRecipients(value: unknown, after?: string): Recipients {
  const root = exact(value, ['recipients', 'nextAfter', 'order', 'accessGranted'])
  if (root.accessGranted !== false || root.order !== 'grant_id_ascending' || !Array.isArray(root.recipients) || root.recipients.length > 50) return invalid()
  let previous = after ?? ''
  for (const raw of root.recipients) {
    const row = exact(raw, ['grantId', 'label'])
    if (!uuid(row.grantId) || row.grantId <= previous || typeof row.label !== 'string' || !row.label.trim()
      || Array.from(row.label).length > 120 || Array.from(row.label).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return invalid()
    previous = row.grantId
  }
  if (root.nextAfter !== null && (root.recipients.length !== 50 || root.nextAfter !== previous)) return invalid()
  return structuredClone(root) as Recipients
}

export function WebsiteReviewInbox({ workspaceId, actorId }: { workspaceId: string; actorId: string }) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [selected, setSelected] = useState<Review | null>(null)
  const [changes, setChanges] = useState<Changes | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Open the prepared reviews for this company. Nothing is published or sent here.')
  const [now, setNow] = useState(() => Date.now())
  const [preparation, setPreparation] = useState<Preparation | null>(null)
  const [withdrawal, setWithdrawal] = useState<string | null>(null)
  const [recipients, setRecipients] = useState<Recipients | null>(null)
  const [recipient, setRecipient] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [prepareCommand, setPrepareCommand] = useState<PrepareCommand | null>(null)
  const epoch = useRef(0)
  const pending = useRef(false)
  useEffect(() => {
    const invalidate = () => { epoch.current++ }
    const clear = () => {
      invalidate(); pending.current = false; setBusy(false); setListing(null); setSelected(null); setChanges(null); setPreparation(null); setWithdrawal(null)
      setRecipients(null); setRecipient(''); setConfirmed(false); setPrepareCommand(null)
      setMessage('Account context changed. Refresh to read this company’s reviews.')
    }
    window.addEventListener('storage', clear); window.addEventListener('focus', clear)
    return () => { invalidate(); window.removeEventListener('storage', clear); window.removeEventListener('focus', clear) }
  }, [workspaceId, actorId])
  useEffect(() => {
    // Remove an expired handoff even when the operator leaves the page open.
    if (!selected || !time(selected.expiresAt)) return
    const delay = Date.parse(selected.expiresAt) - Date.now()
    if (delay <= 0) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(delay + 1, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [selected])

  async function load(review?: Review, after?: string) {
    if (pending.current) return
    pending.current = true; setBusy(true)
    const attempt = ++epoch.current
    setPreparation(null)
    setWithdrawal(null)
    setRecipients(null); setRecipient(''); setConfirmed(false); setPrepareCommand(null)
    setChanges(null); setSelected(review ?? null)
    if (!review) setListing(null)
    setMessage('Checking current company access…')
    try {
      const identity = await currentManagedIdentity()
      if (attempt !== epoch.current) return
      if (!identity || identity.workspaceId !== workspaceId || identity.userId !== actorId) throw new Error('Access changed')
      const raw = await loadManagedWebsiteReviewStaffPage(identity, review?.reviewId, after)
      const data = review ? verifyStaffChanges(raw, review) : verifyStaffReviews(raw, after)
      const current = await currentManagedIdentity()
      if (attempt !== epoch.current) return
      if (!current || !sameManagedIdentity(identity, current)) throw new Error('Access changed')
      if (review) setChanges(data as Changes); else setListing(data as Listing)
      setNow(Date.now())
      setMessage(review ? 'Retained customer decisions. They do not authorize publication.' : 'Reviews are ordered by reference, not by date. Refresh starts again at the first page.')
    } catch {
      if (attempt === epoch.current) {
        setListing(null); setSelected(null); setChanges(null)
        setMessage('Reviews could not be verified, or your company access changed. Refresh or ask the workspace owner.')
      }
    } finally {
      if (attempt === epoch.current) { pending.current = false; setBusy(false) }
    }
  }

  async function inspectSavedSource() {
    if (pending.current) return
    pending.current = true; setBusy(true)
    const attempt = ++epoch.current
    setPreparation(null); setSelected(null); setChanges(null); setListing(null)
    setWithdrawal(null)
    setRecipients(null); setRecipient(''); setConfirmed(false); setPrepareCommand(null)
    setMessage('Checking the saved Website and current company access…')
    try {
      const identity = await currentManagedIdentity()
      if (attempt !== epoch.current) return
      if (!identity || identity.workspaceId !== workspaceId || identity.userId !== actorId) throw new Error('Access changed')
      const result = await verifyPreparation(await loadManagedWebsitePreparation(identity))
      const current = await currentManagedIdentity()
      if (attempt !== epoch.current) return
      if (!current || !sameManagedIdentity(identity, current)) throw new Error('Access changed')
      setPreparation(result)
      setMessage('Saved source verified. This has not created or sent a customer review. Unsaved edits are not included.')
    } catch {
      if (attempt === epoch.current) setMessage('The saved Website could not be verified, or access changed. Save your work and check again.')
    } finally {
      if (attempt === epoch.current) { pending.current = false; setBusy(false) }
    }
  }

  async function chooseCustomer(after?: string) {
    if (pending.current || !preparation || prepareCommand) return
    pending.current = true; setBusy(true)
    const attempt = ++epoch.current
    setRecipients(null); setRecipient(''); setConfirmed(false)
    try {
      const identity = await currentManagedIdentity()
      if (attempt !== epoch.current) return
      if (!identity || identity.workspaceId !== workspaceId || identity.userId !== actorId) throw new Error('Access changed')
      const result = verifyRecipients(await loadManagedWebsiteRecipients(identity, after), after)
      const current = await currentManagedIdentity()
      if (attempt !== epoch.current) return
      if (!current || !sameManagedIdentity(identity, current)) throw new Error('Access changed')
      setRecipients(result)
      setMessage('Choose an enrolled customer. Nothing is selected or sent automatically.')
    } catch {
      if (attempt === epoch.current) setMessage('Eligible customers could not be verified. Ask the workspace owner to check review-only enrollment.')
    } finally {
      if (attempt === epoch.current) { pending.current = false; setBusy(false) }
    }
  }

  async function prepareReview() {
    if (pending.current || !preparation || !confirmed || !recipients?.recipients.some(row => row.grantId === recipient)) return
    pending.current = true; setBusy(true)
    const attempt = ++epoch.current
    const command = prepareCommand ?? { reviewId: crypto.randomUUID(), recipientGrantId: recipient,
      expectedVersion: preparation.sourceVersion, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }
    setPrepareCommand(command)
    setMessage('Preparing the exact saved revision for this customer…')
    try {
      const identity = await currentManagedIdentity()
      if (attempt !== epoch.current) return
      if (!identity || identity.workspaceId !== workspaceId || identity.userId !== actorId) throw new Error('Access changed')
      const raw = exact(await prepareManagedWebsiteReview(command, identity), ['reviewId', 'contentRevision', 'sourceVersion', 'preparedAt', 'previewDigest', 'expiresAt', 'status', 'persisted', 'replayed', 'publicationAuthorized'])
      if (raw.reviewId !== command.reviewId || raw.contentRevision !== preparation.contentRevision || raw.sourceVersion !== command.expectedVersion
        || raw.previewDigest !== preparation.previewDigest || !time(raw.preparedAt) || !time(raw.expiresAt)
        || Date.parse(String(raw.expiresAt)) !== Date.parse(command.expiresAt) || Date.parse(String(raw.preparedAt)) >= Date.parse(command.expiresAt)
        || Date.parse(String(raw.preparedAt)) < Date.parse(preparation.readAt) || Date.parse(command.expiresAt) <= Date.now()
        || raw.status !== 'prepared_preview' || raw.persisted !== true || typeof raw.replayed !== 'boolean' || raw.publicationAuthorized !== false) return invalid()
      const current = await currentManagedIdentity()
      if (attempt !== epoch.current) return
      if (!current || !sameManagedIdentity(identity, current)) throw new Error('Access changed')
      const review: Review = { reviewId: command.reviewId, contentRevision: preparation.contentRevision, sourceVersion: preparation.sourceVersion,
        preparedAt: String(raw.preparedAt), expiresAt: String(raw.expiresAt), status: 'active', hasChangeRequests: false, hasCustomerAcceptance: false }
      setPreparation(null); setRecipients(null); setRecipient(''); setConfirmed(false); setPrepareCommand(null)
      // Read current decisions before offering a handoff; a replay may already
      // have customer feedback or acceptance, which must never be guessed away.
      setListing({ reviews: [review], nextAfter: null, order: 'review_id_ascending', publicationAuthorized: false })
      setMessage('Private review prepared for the selected customer. Open its decision to check current status and the handoff message. Nothing was sent or published.')
    } catch {
      if (attempt === epoch.current) setMessage('Preparation could not be confirmed. Retry this same review, or refresh reviews to reconcile it. Do not create a second review until its status is known.')
    } finally {
      if (attempt === epoch.current) { pending.current = false; setBusy(false) }
    }
  }

  async function withdraw() {
    if (pending.current || !selected || !changes || withdrawal !== selected.reviewId || changes.reviewStatus === 'revoked') return
    const review = selected
    pending.current = true; setBusy(true)
    const attempt = ++epoch.current
    // Hide shareable content immediately. A lost response is not proof of failure.
    setChanges(null); setListing(null); setWithdrawal(null)
    setMessage('Withdrawing this review link…')
    try {
      const identity = await currentManagedIdentity()
      if (attempt !== epoch.current) return
      if (!identity || identity.workspaceId !== workspaceId || identity.userId !== actorId) throw new Error('Access changed')
      const result = exact(await withdrawManagedWebsiteReview(review.reviewId, identity), ['reviewId', 'status', 'persisted', 'replayed', 'publicationAuthorized'])
      if (result.reviewId !== review.reviewId || result.status !== 'revoked' || result.persisted !== true
        || typeof result.replayed !== 'boolean' || result.publicationAuthorized !== false) return invalid()
      const current = await currentManagedIdentity()
      if (attempt !== epoch.current) return
      if (!current || !sameManagedIdentity(identity, current)) throw new Error('Access changed')
      setSelected(null)
      setMessage('Review link withdrawn. Retained decisions and the Website are unchanged. Refresh to inspect the record.')
    } catch {
      if (attempt === epoch.current) {
        setSelected(null)
        setMessage('Withdrawal could not be confirmed. Do not share this link. Refresh to check its status before trying again.')
      }
    } finally {
      if (attempt === epoch.current) { pending.current = false; setBusy(false) }
    }
  }

  const handoff = !withdrawal && selected && changes ? customerHandoff(selected, changes, window.location.origin, now) : null

  return <section className="website-editor-panel" aria-labelledby="website-review-inbox-title">
    <h2 id="website-review-inbox-title">Customer review decisions</h2>
    <p>Read customer feedback and acceptance of prepared revisions. Making edits, preparing a new review and publishing remain separate.</p>
    <button className="core-button" disabled={busy} onClick={() => void inspectSavedSource()} type="button">Check saved Website before handoff</button>
    <button className="core-button" disabled={busy} onClick={() => void load()} type="button">Refresh reviews</button>
    <p className="form-notice" role="status">{message}</p>
    {preparation ? <section aria-label="Verified saved Website" style={{ overflowWrap: 'anywhere' }}>
      <h3>{preparation.preview.siteName} · saved revision {preparation.contentRevision}</h3>
      <p>Source version {preparation.sourceVersion} · read <time dateTime={preparation.readAt}>{new Date(preparation.readAt).toLocaleString()}</time>. Later edits require another check.</p>
      <p>Check these saved pages, then choose an enrolled customer. This does not send an invitation or publish the Website.</p>
      {preparation.preview.pages.map(page => <details key={page.id}>
        <summary style={{ minHeight: 44, padding: '0.75rem 0', boxSizing: 'border-box', cursor: 'pointer' }}>{page.navigation.label || page.seo.title || 'Page'} · {page.hero.headline}</summary>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{page.hero.summary}</p>
        {page.sections.map(section => <section key={section.id}><h4>{section.title}</h4><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{section.body}</p></section>)}
        <p>Contact label: {page.hero.ctaLabel || 'Not prepared'}</p>
        <p style={{ overflowWrap: 'anywhere' }}>Destination (not clickable): {reviewContactDestination(page.hero.ctaHref)}</p>
        <p>Search title: {page.seo.title || 'Not prepared'}</p><p>Search description: {page.seo.description || 'Not prepared'}</p>
      </details>)}
      <button className="core-button" disabled={busy || !!prepareCommand} type="button" onClick={() => void chooseCustomer()}>Choose customer for review</button>
      {recipients ? <section aria-label="Prepare customer review">
        {prepareCommand ? <p style={{ overflowWrap: 'anywhere' }}>Pending review reference: {prepareCommand.reviewId}. Retry reuses this reference; check it in the review list after refreshing.</p> : null}
        {recipients.recipients.length === 0 ? <p>No eligible customers on this page. The owner must enroll a review-only account before preparing a review.</p> : <>
          <label htmlFor="website-review-recipient">Enrolled customer</label>
          <select id="website-review-recipient" disabled={busy || !!prepareCommand} value={recipient}
            style={{ width: '100%', minHeight: 44, maxWidth: '100%' }} onChange={event => { setRecipient(event.target.value); setConfirmed(false) }}>
            <option value="">Choose a customer</option>
            {recipients.recipients.map(row => <option key={row.grantId} value={row.grantId}>{row.label} · {row.grantId.slice(0, 8)}</option>)}
          </select>
          {recipient ? <>
            <p style={{ overflowWrap: 'anywhere' }}>Enrollment reference: {recipient}. Check with the owner if customer names are similar.</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minHeight: 44 }}>
              <input type="checkbox" checked={confirmed} disabled={busy || !!prepareCommand} style={{ width: 20, height: 20, flex: '0 0 20px' }}
                onChange={event => setConfirmed(event.target.checked)} />
              I checked the customer and saved revision {preparation.contentRevision}. Prepare a private 24-hour review, without sending or publishing.
            </label>
            <button className="core-button" disabled={busy || !confirmed} type="button" onClick={() => void prepareReview()}>{prepareCommand ? 'Retry same review' : 'Prepare private review'}</button>
          </> : null}
        </>}
        {recipients.nextAfter ? <button className="core-button" disabled={busy || !!prepareCommand} type="button" onClick={() => void chooseCustomer(recipients.nextAfter!)}>Next customers</button> : null}
      </section> : null}
    </section> : null}
    {listing?.reviews.length === 0 ? <p>No prepared reviews in this company yet.</p> : null}
    <ul>{listing?.reviews.map(review => <li key={review.reviewId}>
      <strong>Revision {review.contentRevision}</strong> · {review.status} · prepared {new Date(review.preparedAt).toLocaleString()}
      <p style={{ overflowWrap: 'anywhere' }}>Review reference: {review.reviewId}</p>
      <p>{review.hasCustomerAcceptance ? 'Customer acceptance retained — release review still required' : review.hasChangeRequests ? 'Customer changes retained'
        : review.status === 'revoked' ? 'Review withdrawn — no new customer decision can be submitted'
          : review.status === 'expired' ? 'Review expired — prepare a new review'
            : review.status === 'stale' ? 'Website changed — prepare a review of the current revision'
              : 'Awaiting customer decision'} · expires {new Date(review.expiresAt).toLocaleString()}</p>
      <button className="core-button" disabled={busy} onClick={() => void load(review)} type="button">Read decision for revision {review.contentRevision}</button>
    </li>)}</ul>
    {listing?.nextAfter ? <button className="core-button" disabled={busy} onClick={() => void load(undefined, listing.nextAfter!)} type="button">Next reviews</button> : null}
    {changes && selected ? <section aria-label="Selected revision customer decision">
      <h3>Revision {changes.contentRevision} · {changes.reviewStatus}</h3>
      {changes.reviewStatus !== 'revoked' ? withdrawal === selected.reviewId ? <section aria-label="Confirm review withdrawal">
        <p>Withdraw the customer link for revision {selected.contentRevision}? This cannot be undone. Existing feedback and acceptance stay in history. It does not delete or unpublish the Website.</p>
        <button className="core-button" disabled={busy} type="button" onClick={() => void withdraw()}>Confirm withdrawal</button>
        <button className="core-button" disabled={busy} type="button" onClick={() => setWithdrawal(null)}>Keep review link</button>
      </section> : <button className="core-button" disabled={busy} type="button" onClick={() => setWithdrawal(selected.reviewId)}>Withdraw review link</button> : null}
      {handoff ? <section aria-label="Customer handoff draft">
        <h4>Ready to share for review</h4>
        <p>Check the intended recipient, then copy this message into your normal conversation. Only the assigned account can open it. Nothing is sent automatically.</p>
        <textarea aria-label="Customer review message" readOnly rows={9} value={handoff} style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }} />
      </section> : !withdrawal && changes.reviewStatus === 'active' && !changes.acceptance && changes.requests.length === 0
        ? <p>Customer handoff is available only for a current, undecided review on app.supermega.dev. Refresh to check its latest state.</p> : null}
      {changes.acceptance ? <div><h4>Customer acceptance retained</h4>
        <p>Accepted <time dateTime={changes.acceptance.acceptedAt}>{new Date(changes.acceptance.acceptedAt).toLocaleString()}</time> for revision {changes.contentRevision} only. Not published or deployment-authorized.</p>
        <p>{changes.reviewStatus === 'active' ? 'Complete the separate release checks before publishing.' : 'Historical decision only. This review is no longer active; prepare a fresh review before proceeding.'}</p>
      </div> : changes.requests.length === 0 ? <p>No customer decision recorded for this revision.</p> : null}
      <ul>{changes.requests.map(request => <li key={request.commandId}><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString()}</time><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{request.note}</p></li>)}</ul>
      {changes.nextAfter ? <button className="core-button" disabled={busy} onClick={() => void load(selected, changes.nextAfter!)} type="button">Older requests</button> : null}
    </section> : null}
  </section>
}
