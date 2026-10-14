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
  const [uncertain, setUncertain] = useState(false)
  const [withdrawArmed, setWithdrawArmed] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const writeInFlight = useRef(false)
  const attempt = useRef<{ source: string; channel: string } | null>(null)
  const refresh = useCallback(() => {
    operation.current?.abort()
    const controller = new AbortController(); operation.current = controller
    return client.status(controller.signal).then(next => {
      if (!controller.signal.aborted) { setStatus(next); setIssue(''); setUncertain(false) }
    }).catch(error => {
      if (!controller.signal.aborted) { setIssue(message(error)); setUncertain(true) }
    }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
  }, [client])
  useEffect(() => { void refresh(); return () => operation.current?.abort() }, [refresh, snapshotId])
  useEffect(() => {
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible' && !writeInFlight.current) void refresh()
    }
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => document.removeEventListener('visibilitychange', checkWhenVisible)
  }, [refresh])
  const live = status?.publications.find(entry => entry.enabled)
  const siteUrl = live && status ? `${status.publicOrigin}/sites/${live.channelId}` : ''
  const current = Boolean(live && live.snapshotId === snapshotId && live.pageId === pageId
    && live.sourceVersion === status?.source?.version)
  const ready = Boolean(status?.source && status.source.snapshotId === snapshotId && pageId
    && (!live || status.source.version > live.sourceVersion))
  async function change(withdraw = false) {
    if (busy || uncertain || writeInFlight.current || !canWrite || !status || (!withdraw && !ready)) return
    const controller = new AbortController(); operation.current = controller
    writeInFlight.current = true
    setBusy(true); setIssue('')
    try {
      if (withdraw && live) {
        await client.withdraw(live, controller.signal)
      } else if (live) {
        await client.replace(live, pageId, status, controller.signal)
      } else {
        const source = `${status.source?.snapshotId}:${status.source?.version}:${pageId}`
        if (attempt.current?.source !== source) attempt.current = { source, channel: crypto.randomUUID() }
        await client.publish(attempt.current.channel, pageId, status, controller.signal)
      }
      const next = await client.status(controller.signal)
      if (!controller.signal.aborted) {
        setStatus(next); setWithdrawArmed(false); setUncertain(false); attempt.current = null
      }
    } catch (error) { if (!controller.signal.aborted) { setIssue(message(error)); setUncertain(true) } }
    finally { writeInFlight.current = false; if (!controller.signal.aborted) setBusy(false) }
  }
  return <section className="website-hosted-card" aria-labelledby="website-hosting-title" aria-busy={busy}>
    <header><div><span className="website-hosted-eyebrow">Website hosting</span><h2 id="website-hosting-title">{uncertain ? 'Check website status' : live ? ready ? 'An update is ready' : 'Website published' : 'Publish your website'}</h2></div>
      <span role="status" className={`website-hosted-status${live && !uncertain ? ' is-published' : ''}`}>{busy ? 'Checking…' : uncertain ? 'Check status' : live ? 'Published' : status ? 'Not published' : 'Unavailable'}</span></header>
    <p>{live ? uncertain ? 'This was the last confirmed website address. Refresh to check whether your change was saved.' : `Published ${date(live.publishedAt)}. Open the address below to check the site before sharing it.` : 'Publish your reviewed pages to get a website address you can share.'}</p>
    {issue ? <p role="alert" className="website-hosted-error">{issue}</p> : null}
    {status && !ready && !current && !uncertain ? <p className="website-hosted-hint">Review your pages and save a newer approved site version before publishing.</p> : null}
    <div aria-label="Website addresses" className="website-hosted-addresses">
      <div className="website-hosted-address">
        <span>Included website address</span>
        {siteUrl ? <a href={siteUrl} target="_blank" rel="noreferrer">{siteUrl}</a> : <strong>{status ? 'Available after publishing' : 'Waiting for hosting status'}</strong>}
        <small>{siteUrl ? 'Check before sharing. This address stays the same when you publish an update.' : 'SuperMega provides this address when your reviewed site is published.'}</small>
      </div>
      <div className="website-hosted-address is-unavailable">
        <span>Your own domain</span>
        <strong>Not connected</strong>
        <small>Custom domain setup is not available in this workspace.</small>
      </div>
    </div>
    <div className="website-hosted-actions">
      {!current && ready ? <button className={`website-button ${live ? 'is-secondary' : 'is-primary'}`} disabled={busy || uncertain || !canWrite} onClick={() => void change()} type="button">{live ? 'Publish update' : 'Publish website'}</button> : null}
      {issue ? <button className="website-button is-secondary" disabled={busy} onClick={() => { setBusy(true); setIssue(''); void refresh() }} type="button">Try again</button> : null}
    </div>
    {live && canWrite && !uncertain ? <div className="website-hosted-withdraw">
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
