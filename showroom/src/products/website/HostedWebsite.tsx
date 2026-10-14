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
  const [withdrawArmed, setWithdrawArmed] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const writeInFlight = useRef(false)
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
  useEffect(() => {
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible' && !writeInFlight.current) void refresh()
    }
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => document.removeEventListener('visibilitychange', checkWhenVisible)
  }, [refresh])
  const live = status?.publications.find(entry => entry.enabled)
  const siteUrl = live && status ? `${status.publicOrigin}/sites/${live.channelId}` : ''
  const current = Boolean(live && live.snapshotId === snapshotId)
  const ready = Boolean(status?.source && status.source.snapshotId === snapshotId && pageId)
  async function change(withdraw = false) {
    if (busy || writeInFlight.current || !canWrite || !status || (!withdraw && !ready)) return
    const controller = new AbortController(); operation.current = controller
    writeInFlight.current = true
    setBusy(true); setIssue('')
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
      }
    } catch (error) { if (!controller.signal.aborted) { setIssue(message(error)); setStatus(null) } }
    finally { writeInFlight.current = false; if (!controller.signal.aborted) setBusy(false) }
  }
  return <section className="website-hosted-card" aria-labelledby="website-hosting-title" aria-busy={busy}>
    <header><div><span className="website-hosted-eyebrow">Website hosting</span><h2 id="website-hosting-title">{live ? current ? 'Website published' : 'An update is ready' : 'Publish your website'}</h2></div>
      <span role="status" className={`website-hosted-status${live ? ' is-published' : ''}`}>{busy ? 'Checking…' : live ? 'Published' : status ? 'Not published' : 'Unavailable'}</span></header>
    <p>{live ? `Published ${date(live.publishedAt)}. Open the address below to check the site before sharing it.` : 'Publish your reviewed pages to get a website address you can share.'}</p>
    {issue ? <p role="alert" className="website-hosted-error">{issue}</p> : null}
    {status && !ready && !current ? <p className="website-hosted-hint">Review your pages and save an approved site version below before publishing.</p> : null}
    {siteUrl ? <div className="website-hosted-address">
      <span>Your website address</span>
      <a href={siteUrl} target="_blank" rel="noreferrer">{siteUrl}</a>
      <small>Check the site here before sharing this address with customers.</small>
    </div> : null}
    <div className="website-hosted-actions">
      {!current ? <button className={`website-button ${live ? 'is-secondary' : 'is-primary'}`} disabled={busy || !ready || !canWrite} onClick={() => void change()} type="button">{live ? 'Publish update' : 'Publish website'}</button> : null}
      {issue ? <button className="website-button is-secondary" disabled={busy} onClick={() => { setBusy(true); setIssue(''); void refresh() }} type="button">Try again</button> : null}
    </div>
    {live ? <p className="website-hosted-domain-note">Your own domain is not connected. Keep using the website address above until domain setup is available.</p> : null}
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
