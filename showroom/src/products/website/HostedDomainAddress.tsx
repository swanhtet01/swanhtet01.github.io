import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { PublishingClient, WebsiteDomainStatus } from './website-publishing-client'

const friendlyError = (error: unknown) => error instanceof Error ? error.message : 'Check the domain and try again.'

function normalizedHostname(input: string): string | null {
  try {
    const value = input.trim()
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') return null
    return url.hostname.toLowerCase().replace(/\.$/, '')
  } catch { return null }
}

function connectionIssue(code: string | undefined): string {
  if (code === 'ownership_pending') return 'Add the TXT record below to prove that this domain is yours.'
  if (code === 'dns_pending') return 'Point the domain to the hosting record below, then check again.'
  if (code === 'verification_expired') return 'The connection needs a fresh check. Check again to restore this address.'
  if (code === 'channel_unpublished') return 'Publish your website to make this address visible.'
  if (code === 'provider_cleanup_pending') return 'Removal is still pending. Retry removal.'
  if (code === 'provider_verification_pending') return 'Hosting verification is still in progress. Check again shortly.'
  if (code === 'provider_missing') return 'Hosting is not attached yet. Keep the TXT record in place, then check again.'
  if (code === 'provider_unavailable') return 'Domain checks are temporarily unavailable. Try again shortly.'
  return 'The domain is not connected yet. Check the DNS records and try again.'
}

export function HostedDomainAddress({ client, channelId, canWrite }: {
  client: PublishingClient; channelId: string | null; canWrite: boolean
}) {
  const [status, setStatus] = useState<WebsiteDomainStatus | null>(null)
  const [busy, setBusy] = useState(true)
  const [issue, setIssue] = useState('')
  const [hostname, setHostname] = useState('')
  const [removeArmed, setRemoveArmed] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const writeInFlight = useRef(false)
  const refresh = useCallback(() => {
    operation.current?.abort()
    const controller = new AbortController(); operation.current = controller
    return client.domainStatus(controller.signal).then(next => {
      if (!controller.signal.aborted) { setStatus(next); setIssue('') }
    }).catch(error => {
      if (!controller.signal.aborted) setIssue(friendlyError(error))
    }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
  }, [client])
  useEffect(() => { void refresh(); return () => operation.current?.abort() }, [refresh])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && !writeInFlight.current) void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])
  async function mutate(action: (signal: AbortSignal) => Promise<WebsiteDomainStatus>) {
    if (busy || !canWrite || writeInFlight.current) return
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller
    writeInFlight.current = true; setBusy(true); setIssue('')
    try {
      const next = await action(controller.signal)
      if (!controller.signal.aborted) { setStatus(next); setRemoveArmed(false); setHostname('') }
    } catch (error) { if (!controller.signal.aborted) setIssue(friendlyError(error)) }
    finally { writeInFlight.current = false; if (!controller.signal.aborted) setBusy(false) }
  }
  function claim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = normalizedHostname(hostname)
    if (!normalized) { setIssue('Enter a domain such as mybusiness.com.'); return }
    if (!channelId) { setIssue('Publish your website before connecting a domain.'); return }
    void mutate(signal => client.claimDomain(normalized, channelId, signal))
  }
  const domain = status?.domain
  const connected = Boolean(domain?.state === 'active' && domain.channelId === channelId && channelId)
  return <div className={`website-hosted-address website-domain-address${status?.enabled ? '' : ' is-unavailable'}`} aria-busy={busy}>
    <span>Your own domain</span>
    {domain ? <>
      {connected ? <a href={`https://${domain.hostname}/`} target="_blank" rel="noreferrer">{domain.hostname}</a> : <strong>{domain.hostname}</strong>}
      <small>{connected ? 'Connected and ready to share.' : domain.issue === 'provider_cleanup_pending' ? 'Removal is still pending.' : domain.state === 'active' ? 'Connected. Publish the website to make it visible here.' : 'Waiting for domain verification.'}</small>
      {domain.issue === 'provider_cleanup_pending' ? <p className="website-domain-pending">{connectionIssue(domain.issue)}</p> : domain.state === 'pending' ? <div className="website-domain-steps" aria-label="Domain setup records">
        <p>Add these records where you manage the domain, then check the connection.</p>
        <dl><div><dt>Ownership · TXT</dt><dd><span>{domain.verification.name}</span><code>{domain.verification.value}</code></dd></div>
          {domain.dns ? <div><dt>Hosting · {domain.dns.type}</dt><dd><span>{domain.dns.name}</span><code>{domain.dns.value}</code></dd></div> : null}</dl>
        {domain.issue ? <p className="website-domain-pending">{connectionIssue(domain.issue)}</p> : null}
      </div> : null}
      {canWrite ? <div className="website-domain-actions">
        {domain.state === 'pending' && domain.issue !== 'provider_cleanup_pending' && domain.issue !== 'channel_unpublished' ? <button type="button" className="website-button is-secondary" disabled={busy} onClick={() => void mutate(signal => client.checkDomain(domain.hostname, signal))}>Check connection</button> : null}
        {removeArmed ? <><span>Remove this domain from your website?</span><button type="button" className="website-button is-secondary" disabled={busy} onClick={() => setRemoveArmed(false)}>Keep domain</button><button type="button" className="website-button is-secondary" disabled={busy} onClick={() => void mutate(signal => client.releaseDomain(domain.hostname, signal))}>Remove domain</button></>
          : <button type="button" className="website-domain-remove" disabled={busy} onClick={() => setRemoveArmed(true)}>{domain.issue === 'provider_cleanup_pending' ? 'Retry removal' : 'Remove domain'}</button>}
      </div> : null}
    </> : status?.enabled && channelId ? <>
      <strong>Connect a domain you own</strong>
      <form className="website-domain-form" onSubmit={claim}>
        <label htmlFor="website-domain-name">Domain name</label>
        <input id="website-domain-name" type="text" value={hostname} onChange={event => setHostname(event.target.value)} placeholder="mybusiness.com" autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={253} required disabled={!canWrite || busy} />
        <button type="submit" className="website-button is-secondary" disabled={!canWrite || busy}>Connect domain</button>
      </form>
      <small>We’ll show the DNS records to add. Your included address keeps working.</small>
    </> : <><strong>{busy ? 'Checking…' : 'Not connected'}</strong><small>{channelId ? 'Custom domain setup is not available in this workspace.' : 'Publish your website first, then connect a domain.'}</small></>}
    {issue ? <p role="alert" className="website-hosted-error">{issue} <button type="button" onClick={() => { setBusy(true); void refresh() }} disabled={busy}>Refresh</button></p> : null}
  </div>
}
