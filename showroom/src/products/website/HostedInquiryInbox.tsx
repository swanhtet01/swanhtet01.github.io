import { useCallback, useEffect, useRef, useState } from 'react'
import type { CustomerInquiry, InboxPage, InquiryOperation, PublishingClient } from './website-publishing-client'

const inquiryKey = (entry: CustomerInquiry) => `${entry.channelId}:${entry.requestId}`
const dates = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Yangon', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const date = (value: string) => dates.format(new Date(value))
const statusLabel = { new: 'New', in_progress: 'In progress', done: 'Handled' }
type NoteDraft = { text: string; revision: number }

export function HostedInquiryInbox({ client, actorId, canWrite }: { client: PublishingClient; actorId: string; canWrite: boolean }) {
  const [page, setPage] = useState<InboxPage | null>(null)
  const [view, setView] = useState<'open' | 'done'>('open')
  const [selected, setSelected] = useState('')
  const [issue, setIssue] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(true)
  const [copied, setCopied] = useState('')
  const [drafts, setDrafts] = useState<Record<string, NoteDraft>>({})
  const [latestPage, setLatestPage] = useState(true)
  const operation = useRef<AbortController | null>(null)
  const latest = useRef(true)
  const inFlight = useRef(false)
  const pending = useRef<{ key: string; id: string } | null>(null)
  const requestPanel = useRef<HTMLElement | null>(null)
  const selectedButton = useRef<HTMLButtonElement | null>(null)

  function openRequest(entry: CustomerInquiry, button: HTMLButtonElement) {
    selectedButton.current = button
    setSelected(inquiryKey(entry))
    if (window.matchMedia('(max-width: 700px)').matches) requestAnimationFrame(() => requestPanel.current?.focus())
  }
  function backToRequests() {
    setSelected('')
    requestAnimationFrame(() => selectedButton.current?.focus())
  }

  const load = useCallback((before: InboxPage['nextBefore'] = null) => {
    if (inFlight.current) return
    inFlight.current = true
    const controller = new AbortController()
    operation.current = controller
    return client.inbox(controller.signal, before, view).then(result => {
      if (!controller.signal.aborted) {
        setPage(result); setIssue(''); latest.current = before === null; setLatestPage(before === null)
      }
    }).catch(error => {
      if (!controller.signal.aborted) {
        setPage(null); setIssue(error instanceof Error ? error.message : 'Refresh to try loading your inbox again.'); latest.current = false
      }
    }).finally(() => {
      if (operation.current === controller) { inFlight.current = false; if (!controller.signal.aborted) setBusy(false) }
    })
  }, [client, view])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { if (latest.current && !inFlight.current && document.visibilityState === 'visible') { setBusy(true); void load() } }, 45_000)
    return () => { clearInterval(timer); operation.current?.abort(); inFlight.current = false }
  }, [load])

  function chooseView(next: 'open' | 'done') {
    if (next === view || busy) return
    setBusy(true); setPage(null); setSelected(''); setIssue(''); setNotice(''); setView(next)
  }
  function clearDraft(key: string) {
    setDrafts(current => { const next = { ...current }; delete next[key]; return next })
  }
  async function change(inquiry: CustomerInquiry, action: InquiryOperation, draft?: NoteDraft) {
    if (inFlight.current || !canWrite) return
    const revision = draft?.revision ?? inquiry.revision
    const note = action === 'note' ? draft?.text ?? '' : ''
    const key = JSON.stringify([inquiryKey(inquiry), revision, action, note])
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() }
    inFlight.current = true; setBusy(true); setIssue(''); setNotice('')
    const controller = new AbortController(); operation.current = controller
    let saved = false
    try {
      await client.changeInquiry({ ...inquiry, revision }, action, pending.current.id, note, controller.signal)
      if (!controller.signal.aborted) {
        saved = true; pending.current = null
        if (action === 'note') clearDraft(inquiryKey(inquiry))
        if (action === 'complete' || action === 'reopen') setSelected('')
        setNotice(action === 'note' ? 'Note saved.' : action === 'complete' ? 'Moved to Handled.' : action === 'reopen' ? 'Moved to Open.' : action === 'claim' ? 'Assigned to you.' : 'Available for the team.')
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : 'We could not confirm the update. Refresh to check its status.'
        setIssue(message); latest.current = false
        if (message.startsWith('Sign in')) setPage(null)
      }
    } finally {
      if (operation.current === controller) { inFlight.current = false; if (!controller.signal.aborted && !saved) setBusy(false) }
    }
    if (saved && !controller.signal.aborted) await load()
  }

  const inquiry = page?.inquiries.find(entry => inquiryKey(entry) === selected) ?? page?.inquiries[0]
  const key = inquiry ? inquiryKey(inquiry) : ''
  const draft = drafts[key]
  const dirty = Boolean(inquiry && draft && draft.text !== inquiry.note)
  const staleDraft = Boolean(inquiry && dirty && draft.revision !== inquiry.revision)
  const owned = inquiry?.assignedTo === actorId
  const disabled = busy || !canWrite

  return <section className={`website-hosted-inbox ${selected ? 'is-request-view' : 'is-list-view'}`} aria-labelledby="website-hosted-inbox-title" aria-busy={busy}>
    <header><div><span className="website-hosted-eyebrow">From your website</span><h2 id="website-hosted-inbox-title">Customer inquiries</h2><p>New requests arrive here automatically.</p></div><button className="website-button is-secondary" disabled={busy} onClick={() => { setBusy(true); void load() }} type="button">Refresh</button></header>
    <nav className="website-inquiry-views" aria-label="Inquiry status">
      <button type="button" aria-pressed={view === 'open'} disabled={busy} onClick={() => chooseView('open')}>Open{page ? <span>{page.counts.open}</span> : null}</button>
      <button type="button" aria-pressed={view === 'done'} disabled={busy} onClick={() => chooseView('done')}>Handled{page ? <span>{page.counts.done}</span> : null}</button>
    </nav>
    {issue ? <p className="website-inquiry-error" role="alert">{issue}</p> : null}
    {notice ? <p className="website-inquiry-notice" role="status">{notice}</p> : null}
    {!page ? !issue ? <p role="status">Loading inquiries…</p> : null : page.inquiries.length ? <div className="website-hosted-inbox-grid">
      <div className="website-hosted-requests" aria-label="Received requests">{page.inquiries.map(entry => <button key={inquiryKey(entry)} aria-pressed={inquiry === entry} onClick={event => openRequest(entry, event.currentTarget)} type="button"><span className="website-hosted-avatar" aria-hidden="true">{entry.name.slice(0, 1)}</span><span><strong>{entry.name}</strong><span>{entry.message}</span><small>{statusLabel[entry.status]} · {date(entry.receivedAt)}</small></span></button>)}</div>
      {inquiry ? <article ref={requestPanel} tabIndex={-1} className="website-hosted-request" aria-label={`Request from ${inquiry.name}`}>
        <button className="website-inquiry-back website-button is-secondary" type="button" onClick={backToRequests}>← All inquiries</button>
        <header><div><h3>{inquiry.name}</h3><p>{inquiry.contact}</p></div><time dateTime={inquiry.receivedAt}>{date(inquiry.receivedAt)}</time></header>
        <p className="website-hosted-message">{inquiry.message}</p>
        <div className="website-inquiry-followup"><div><span className={`website-hosted-status is-${inquiry.status}`}>{statusLabel[inquiry.status]}</span><p>{inquiry.assignedTo ? owned ? 'Assigned to you' : 'Assigned to a teammate' : 'Ready for someone to take'}</p></div>
          <div className="website-hosted-actions">
            {inquiry.status === 'new' ? <button className="website-button is-primary" type="button" disabled={disabled || dirty} onClick={() => void change(inquiry, 'claim')}>Take this</button> : null}
            {inquiry.status === 'in_progress' && owned ? <><button className="website-button is-primary" type="button" disabled={disabled || dirty} onClick={() => void change(inquiry, 'complete')}>Mark handled</button><button className="website-button is-secondary" type="button" disabled={disabled || dirty} onClick={() => void change(inquiry, 'release')}>Release</button></> : null}
            {inquiry.status === 'done' ? <button className="website-button is-secondary" type="button" disabled={disabled || dirty} onClick={() => void change(inquiry, 'reopen')}>Reopen</button> : null}
          </div>
        </div>
        <details className="website-inquiry-note" key={key} open={dirty || undefined}><summary>{inquiry.note || dirty ? 'Internal note' : 'Add an internal note'}{dirty ? ' · Unsaved' : ''}</summary>
          <label htmlFor="website-inquiry-note">Visible to your team</label><textarea id="website-inquiry-note" rows={3} maxLength={800} disabled={disabled} value={draft?.text ?? inquiry.note} onChange={event => { const value = event.target.value; setDrafts(current => ({ ...current, [key]: { text: value, revision: current[key]?.revision ?? inquiry.revision } })) }} />
          {staleDraft ? <p className="website-inquiry-error">This inquiry has a newer update. Latest saved note: {inquiry.note || 'No note.'}</p> : null}
          {dirty ? <div className="website-hosted-actions"><button type="button" className="website-button is-primary" disabled={disabled} onClick={() => void change(inquiry, 'note', { ...draft, revision: staleDraft ? inquiry.revision : draft.revision })}>{staleDraft ? 'Save my note instead' : 'Save note'}</button><button type="button" className="website-button is-secondary" disabled={busy} onClick={() => clearDraft(key)}>{staleDraft ? 'Use latest note' : 'Discard draft'}</button></div> : null}
        </details>
        {inquiry.updatedAt ? <p className="website-inquiry-updated">Updated {date(inquiry.updatedAt)}{inquiry.updatedBy === actorId ? ' by you' : ' by your team'}</p> : null}
        <footer><span>Received through {inquiry.sourcePage === '/' ? 'Home' : inquiry.sourcePage}</span><button className="website-button is-secondary" onClick={() => { void navigator.clipboard.writeText(inquiry.contact).then(() => setCopied(key), () => setCopied('')) }} type="button">{copied === key ? 'Copied' : 'Copy contact'}</button></footer>
      </article> : null}
    </div> : <div className="website-hosted-empty"><span aria-hidden="true">✓</span><h3>{view === 'done' ? 'No handled inquiries yet' : 'You’re all caught up'}</h3><p>{view === 'done' ? 'Inquiries you finish stay here, ready to reopen if needed.' : 'New website requests will appear here automatically.'}</p></div>}
    {page?.nextBefore || !latestPage && page ? <div className="website-hosted-actions"><button className="website-button is-secondary" disabled={busy || latestPage} onClick={() => { setBusy(true); void load() }} type="button">Latest requests</button>{page?.nextBefore ? <button className="website-button is-secondary" disabled={busy} onClick={() => { setBusy(true); void load(page.nextBefore) }} type="button">Older requests</button> : null}</div> : null}
  </section>
}
