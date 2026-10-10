import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPublishingClient, type PublicationStatus, type PublishingClient } from './website-publishing-client'
import { HostedInquiryInbox } from './HostedInquiryInbox'
export { HostedInquiryInbox } from './HostedInquiryInbox'
import './hosted-website.css'

const message = (error: unknown) => error instanceof Error ? error.message : 'Please refresh and try again.'
const dates = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Yangon', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const date = (value: string) => dates.format(new Date(value))

export function HostedSitePanel({ client, snapshotId, pageId, canWrite }: {
  client: PublishingClient; snapshotId: string; pageId: string; canWrite: boolean
}) {
  const [status, setStatus] = useState<PublicationStatus | null>(null)
  const [busy, setBusy] = useState(true)
  const [issue, setIssue] = useState('')
  const [notice, setNotice] = useState('')
  const [withdrawArmed, setWithdrawArmed] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const attempt = useRef<{ source: string; channel: string } | null>(null)
  const refresh = useCallback(() => {
    operation.current?.abort()
    const controller = new AbortController(); operation.current = controller
    return client.status(controller.signal).then(next => {
      if (!controller.signal.aborted) { setStatus(next); setIssue('') }
    }).catch(error => {
      if (!controller.signal.aborted) { setIssue(message(error)); setStatus(null) }
    }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
  }, [client])
  useEffect(() => { void refresh(); return () => operation.current?.abort() }, [refresh, snapshotId])
  const live = status?.publications.find(entry => entry.enabled)
  const current = Boolean(live && live.snapshotId === snapshotId)
  const ready = Boolean(status?.source && status.source.snapshotId === snapshotId && pageId)
  async function change(withdraw = false) {
    if (busy || !canWrite || !status || (!withdraw && !ready)) return
    const controller = new AbortController(); operation.current = controller
    setBusy(true); setIssue(''); setNotice('')
    try {
      if (withdraw && live) {
        await client.withdraw(live, controller.signal)
      } else {
        const source = `${status.source?.snapshotId}:${status.source?.version}:${pageId}`
        if (attempt.current?.source !== source) attempt.current = { source, channel: crypto.randomUUID() }
        await client.publish(attempt.current.channel, pageId, status, controller.signal)
      }
      const next = await client.status(controller.signal)
      if (!controller.signal.aborted) {
        setStatus(next); setWithdrawArmed(false); attempt.current = null
        setNotice(withdraw ? 'Your site is offline. Saved inquiries are still available.' : 'Your website is published. Customer requests arrive in Inquiries.')
      }
    } catch (error) { if (!controller.signal.aborted) { setIssue(message(error)); setStatus(null) } }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <section className="website-hosted-card" aria-labelledby="website-hosting-title" aria-busy={busy}>
    <header><div><span className="website-hosted-eyebrow">Website hosting</span><h2 id="website-hosting-title">{live ? current ? 'Your site is live' : 'Your live site has an update' : 'Publish your website'}</h2></div>
      <span className={`website-hosted-status${live ? ' is-live' : ''}`}>{busy ? 'Checking…' : live ? 'Live' : status ? 'Not published' : 'Unavailable'}</span></header>
    <p>{live ? `Last published ${date(live.publishedAt)}.` : 'Share a real website and receive customer requests in one inbox.'}</p>
    {issue ? <p role="alert" className="website-hosted-error">{issue}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {status && !ready && !current ? <p className="website-hosted-hint">Review your pages and save an approved site version below before publishing.</p> : null}
    <div className="website-hosted-actions">
      {live && status ? <a className="website-button is-primary" href={`${status.publicOrigin}/sites/${live.channelId}`} target="_blank" rel="noreferrer">Open website ↗</a> : null}
      {!current ? <button className={`website-button ${live ? 'is-secondary' : 'is-primary'}`} disabled={busy || !ready || !canWrite} onClick={() => void change()} type="button">{live ? 'Publish update' : 'Publish website'}</button> : null}
      <button className="website-button is-secondary" disabled={busy} onClick={() => { setBusy(true); setIssue(''); void refresh() }} type="button">Refresh status</button>
    </div>
    {live && canWrite ? <div className="website-hosted-withdraw">
      {withdrawArmed ? <><p>Take this website offline? Visitors will no longer be able to open its pages or send a request.</p><div className="website-hosted-actions"><button className="website-button is-secondary" disabled={busy} onClick={() => setWithdrawArmed(false)} type="button">Keep online</button><button className="website-button is-secondary" disabled={busy} onClick={() => void change(true)} type="button">Take offline</button></div></>
        : <button disabled={busy} onClick={() => setWithdrawArmed(true)} type="button">Take website offline</button>}
    </div> : null}
  </section>
}

export default function HostedWebsite({ workspaceId, actorId, view, snapshotId, pageId, canWrite }: {
  workspaceId: string; actorId: string; view: 'publish' | 'inbox'; snapshotId: string; pageId: string; canWrite: boolean
}) {
  const client = useMemo(() => createPublishingClient({ workspaceId, userId: actorId, email: '' }), [workspaceId, actorId])
  return view === 'publish' ? <HostedSitePanel client={client} snapshotId={snapshotId} pageId={pageId} canWrite={canWrite} /> : <HostedInquiryInbox key={`${workspaceId}:${actorId}`} client={client} actorId={actorId} canWrite={canWrite} />
}
