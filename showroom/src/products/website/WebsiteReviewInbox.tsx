import { useEffect, useRef, useState } from 'react'
import { currentManagedIdentity, loadManagedWebsiteReviewStaffPage, sameManagedIdentity } from '../../core/managed-trial'

type Review = { reviewId: string; contentRevision: number; sourceVersion: number; preparedAt: string; expiresAt: string; status: string; hasChangeRequests: boolean }
type Changes = { reviewId: string; contentRevision: number; sourceVersion: number; previewDigest: string; reviewStatus: string; requests: { commandId: string; note: string; createdAt: string }[]; nextAfter: string | null; publicationAuthorized: false }
type Listing = { reviews: Review[]; nextAfter: string | null; order: 'review_id_ascending'; publicationAuthorized: false }
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
    const row = exact(raw, ['reviewId', 'contentRevision', 'sourceVersion', 'preparedAt', 'expiresAt', 'status', 'hasChangeRequests'])
    if (!uuid(row.reviewId) || row.reviewId <= prior || !version(row.contentRevision) || !version(row.sourceVersion, 1)
      || !time(row.preparedAt) || !time(row.expiresAt) || !status(row.status) || typeof row.hasChangeRequests !== 'boolean') return invalid()
    prior = row.reviewId
  }
  if (root.nextAfter !== null && (root.reviews.length !== 50 || root.nextAfter !== prior)) return invalid()
  return structuredClone(root) as Listing
}

function verifyStaffChanges(value: unknown, review: Review): Changes {
  const root = exact(value, ['reviewId', 'contentRevision', 'sourceVersion', 'previewDigest', 'reviewStatus', 'requests', 'nextAfter', 'publicationAuthorized'])
  if (root.publicationAuthorized !== false || root.reviewId !== review.reviewId || root.contentRevision !== review.contentRevision
    || root.sourceVersion !== review.sourceVersion || typeof root.previewDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(root.previewDigest)
    || !status(root.reviewStatus) || !Array.isArray(root.requests) || root.requests.length > 50) return invalid()
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

export function WebsiteReviewInbox({ workspaceId, actorId }: { workspaceId: string; actorId: string }) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [selected, setSelected] = useState<Review | null>(null)
  const [changes, setChanges] = useState<Changes | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Open the prepared reviews for this company. Nothing is published or sent here.')
  const epoch = useRef(0)
  const pending = useRef(false)
  useEffect(() => {
    const invalidate = () => { epoch.current++ }
    const clear = () => {
      invalidate(); pending.current = false; setBusy(false); setListing(null); setSelected(null); setChanges(null)
      setMessage('Account context changed. Refresh to read this company’s reviews.')
    }
    window.addEventListener('storage', clear); window.addEventListener('focus', clear)
    return () => { invalidate(); window.removeEventListener('storage', clear); window.removeEventListener('focus', clear) }
  }, [workspaceId, actorId])

  async function load(review?: Review, after?: string) {
    if (pending.current) return
    pending.current = true; setBusy(true)
    const attempt = ++epoch.current
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
      setMessage(review ? 'Retained customer requests. They do not approve publication.' : 'Reviews are ordered by reference, not by date. Refresh starts again at the first page.')
    } catch {
      if (attempt === epoch.current) {
        setListing(null); setSelected(null); setChanges(null)
        setMessage('Reviews could not be verified, or your company access changed. Refresh or ask the workspace owner.')
      }
    } finally {
      if (attempt === epoch.current) { pending.current = false; setBusy(false) }
    }
  }

  return <section className="website-editor-panel" aria-labelledby="website-review-inbox-title">
    <h2 id="website-review-inbox-title">Customer review requests</h2>
    <p>Read customer feedback on prepared revisions. Making edits, preparing a new review and publishing remain separate.</p>
    <button className="core-button" disabled={busy} onClick={() => void load()} type="button">Refresh reviews</button>
    <p className="form-notice" role="status">{message}</p>
    {listing?.reviews.length === 0 ? <p>No prepared reviews in this company yet.</p> : null}
    <ul>{listing?.reviews.map(review => <li key={review.reviewId}>
      <strong>Revision {review.contentRevision}</strong> · {review.status} · prepared {new Date(review.preparedAt).toLocaleString()}
      <p>{review.hasChangeRequests ? 'Customer changes retained' : 'No change requests recorded'} · expires {new Date(review.expiresAt).toLocaleString()}</p>
      <button className="core-button" disabled={busy} onClick={() => void load(review)} type="button">Read requests for revision {review.contentRevision}</button>
    </li>)}</ul>
    {listing?.nextAfter ? <button className="core-button" disabled={busy} onClick={() => void load(undefined, listing.nextAfter!)} type="button">Next reviews</button> : null}
    {changes && selected ? <section aria-label="Selected revision change requests">
      <h3>Revision {changes.contentRevision} · {changes.reviewStatus}</h3>
      {changes.requests.length === 0 ? <p>No customer change requests for this revision.</p> : null}
      <ul>{changes.requests.map(request => <li key={request.commandId}><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString()}</time><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{request.note}</p></li>)}</ul>
      {changes.nextAfter ? <button className="core-button" disabled={busy} onClick={() => void load(selected, changes.nextAfter!)} type="button">Older requests</button> : null}
    </section> : null}
  </section>
}
