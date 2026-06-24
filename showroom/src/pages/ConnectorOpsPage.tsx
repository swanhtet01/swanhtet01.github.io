import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { getSeedRuntimeControlDataset, loadRuntimeControlDataset } from '../lib/runtimeControlApi'
import { YANGON_TYRE_CONNECTOR_EXPANSION, YANGON_TYRE_SOURCE_PACKS } from '../lib/yangonTyreDriveModel'
import {
  getYtfBotPipeline,
  getYtfCommunicationsLatest,
  getYtfGmailStatus,
  saveYtfCommunicationManualDrop,
  type YtfBotPipelineResult,
  type YtfCommunicationSource,
  type YtfCommunicationsLatestResult,
  type YtfGmailStatusResult,
} from '../lib/workspaceApi'
import { ytfOwnerLabel } from '../lib/ytfUiFormat'

type CommunicationState = {
  gmail: YtfGmailStatusResult | null
  latest: YtfCommunicationsLatestResult | null
  bots: YtfBotPipelineResult | null
}

const fallbackChatSources: YtfCommunicationSource[] = [
  { source_id: 'viber_staff_ops', name: 'Viber staff operations', system: 'Viber', owner: 'Admin and planning team', status: 'manual_required' },
  { source_id: 'wechat_kiic', name: 'WeChat KIIC supplier', system: 'WeChat', owner: 'Sales and supplier desk', status: 'manual_required' },
  { source_id: 'line_junky', name: 'LINE JUNKY supplier', system: 'LINE', owner: 'Sales and supplier desk', status: 'manual_required' },
]

function formatDate(value?: string | null) {
  if (!value) return 'Not synced'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function statusLabel(value?: string | null) {
  return String(value || 'mapped').replaceAll('_', ' ')
}

function isReadyStatus(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'ready' || normalized === 'healthy' || normalized === 'live'
}

function isBlockedStatus(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized.includes('blocked') || normalized.includes('missing') || normalized.includes('needs')
}

function compact(value?: string | null, max = 96) {
  const trimmed = String(value || '').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 3).trim()}...` : trimmed
}

function sourceRoute(source: YtfCommunicationSource) {
  const route = String(source.route || '').trim()
  if (route) return route
  const system = String(source.system || '').toLowerCase()
  if (system.includes('gmail')) return '/app/action-board'
  if (system.includes('drive')) return '/app/data-fabric'
  return '/app/connectors'
}

function mergeSources(state: CommunicationState) {
  const byId = new Map<string, YtfCommunicationSource>()
  const candidates = [
    ...(state.gmail?.sources ?? []),
    ...(state.latest?.plan?.sources ?? []),
    ...(state.bots?.sources ?? []),
    ...fallbackChatSources,
  ]
  for (const source of candidates) {
    const id = String(source.source_id || source.connector_id || source.name || '').trim()
    if (!id || byId.has(id)) continue
    byId.set(id, source)
  }
  return Array.from(byId.values())
}

async function loadCommunicationState(): Promise<CommunicationState> {
  const [gmail, latest, bots] = await Promise.allSettled([getYtfGmailStatus(), getYtfCommunicationsLatest(), getYtfBotPipeline()])
  return {
    gmail: gmail.status === 'fulfilled' ? gmail.value : null,
    latest: latest.status === 'fulfilled' ? latest.value : null,
    bots: bots.status === 'fulfilled' ? bots.value : null,
  }
}

export function ConnectorOpsPage() {
  const [runtimeData, setRuntimeData] = useState(() => getSeedRuntimeControlDataset())
  const [communications, setCommunications] = useState<CommunicationState>({ gmail: null, latest: null, bots: null })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [manualDrop, setManualDrop] = useState({
    source_id: 'line_junky',
    title: '',
    sender: '',
    raw_text: '',
    evidence_link: '',
  })

  async function reload() {
    const [runtimePayload, communicationPayload] = await Promise.all([
      loadRuntimeControlDataset().catch(() => getSeedRuntimeControlDataset()),
      loadCommunicationState(),
    ])
    setRuntimeData(runtimePayload)
    setCommunications(communicationPayload)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      await reload()
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const ytfFeeds = useMemo(() => runtimeData.connectors.filter((feed) => feed.tenant === 'yangon-tyre'), [runtimeData.connectors])
  const attentionFeeds = useMemo(() => ytfFeeds.filter((feed) => feed.status !== 'Healthy'), [ytfFeeds])
  const sourceList = useMemo(() => mergeSources(communications), [communications])
  const readySources = sourceList.filter((source) => isReadyStatus(source.status || source.probe_status)).length
  const blockedSources = sourceList.filter((source) => isBlockedStatus(source.status || source.probe_status)).length
  const liveSourcePacks = YANGON_TYRE_SOURCE_PACKS.filter((pack) => pack.status === 'live').length
  const queuedConnectors = YANGON_TYRE_CONNECTOR_EXPANSION.filter((item) => item.status === 'queued' || item.status === 'mapped')
  const manualSources = sourceList.filter((source) => {
    const system = String(source.system || '').toLowerCase()
    const mode = String(source.collection_mode || '').toLowerCase()
    return mode.includes('manual') || ['viber', 'line', 'wechat'].includes(system)
  })
  const gmailSummary = communications.gmail?.summary
  const gmailTokenStatus = String(gmailSummary?.token_status || communications.gmail?.gmail?.status || 'unknown').trim()
  const gmailSourceCount = gmailSummary?.source_count ?? communications.gmail?.sources?.length ?? 0
  const gmailReadyCount = gmailSummary?.ready_count ?? 0
  const gmailIsReady = gmailTokenStatus === 'ready' || isReadyStatus(communications.gmail?.status)
  const gmailNextStep = communications.gmail?.next_step || 'Connect Gmail when supplier and sales emails should become action records.'
  const gmailBlockedReason = communications.gmail?.blocked_reason || gmailNextStep
  const gmailPrivacyBoundary = communications.gmail?.privacy_boundary || 'Managers only see routed work after admin sync.'
  const chatReadyCount = communications.bots?.summary?.ready_count ?? 0
  const chatMissingCount = communications.bots?.summary?.missing_secret_count ?? 0
  const botSetupRows = [
    {
      system: 'Viber',
      group: 'Staff ops + BOD daily comms',
      state: 'Bridge pending',
      next: 'When connected, only routed work appears for managers.',
    },
    {
      system: 'LINE',
      group: 'JUNKY supplier + Plant B operations',
      state: 'Bridge pending',
      next: 'Supplier signals become routed work after the bridge is connected.',
    },
    {
      system: 'WeChat',
      group: 'KIIC supplier group',
      state: 'Bridge pending',
      next: 'KIIC updates become routed work after the bridge is connected.',
    },
  ]

  async function handleManualDrop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!manualDrop.raw_text.trim()) {
      setMessage('Paste one chat, supplier, or manager update before saving.')
      return
    }
    setBusy('manual')
    setMessage('')
    try {
      const payload = await saveYtfCommunicationManualDrop({
        source_id: manualDrop.source_id,
        title: manualDrop.title,
        sender: manualDrop.sender,
        raw_text: manualDrop.raw_text,
        evidence_link: manualDrop.evidence_link,
      })
      setManualDrop((current) => ({ ...current, title: '', sender: '', raw_text: '', evidence_link: '' }))
      setMessage(`Saved communication. Routed to ${payload.classification?.route || 'Work board'}.`)
    } catch {
      setMessage('Could not save this update. Keep the note and retry.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Admin only</p>
          <h1>Communications.</h1>
          <p>Supplier email, LINE, WeChat, Viber, and manager messages become clean work items. Original messages stay private.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{loading ? 'Loading' : 'Ready'}</span>
          <span>{communications.latest?.synced_at ? `Synced ${formatDate(communications.latest.synced_at)}` : 'Manual ready'}</span>
          <span>{gmailIsReady ? 'Gmail live' : 'Gmail mapped'}</span>
        </div>
      </section>

      <section className="sm-ytf-panel sm-ytf-connector-health">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Use now</p>
              <h2>Use messages only when they become work.</h2>
          </div>
          <span className={`sm-status-pill ${gmailIsReady ? 'is-ready' : ''}`}>{gmailIsReady ? 'gmail live' : 'gmail mapped'}</span>
        </div>
        <div className="sm-ytf-card-grid sm-ytf-card-grid-four">
          <article className="sm-ytf-mini-card">
            <span>Gmail</span>
            <strong>{gmailReadyCount}/{gmailSourceCount || 4} live</strong>
            <small>Admin and Plant Manager intake. Managers see work, not raw email.</small>
          </article>
          <Link className="sm-ytf-mini-card" to="/app/data-fabric">
            <span>Drive data</span>
            <strong>{liveSourcePacks}/{YANGON_TYRE_SOURCE_PACKS.length} live packs</strong>
            <small>Shows extracted values and evidence, not raw folders.</small>
          </Link>
          <Link className="sm-ytf-mini-card" to="/app/action-board">
            <span>Manager work</span>
            <strong>Action Board</strong>
            <small>Email or chat signals become owner, due date, and proof work.</small>
          </Link>
          <article className="sm-ytf-mini-card">
            <span>Chat bridge</span>
            <strong>{chatReadyCount} ready</strong>
            <small>{chatMissingCount} automated bridges pending. Manual paste works now.</small>
          </article>
        </div>
        {!gmailIsReady ? (
          <details className="sm-ytf-inline-details sm-ytf-command-details">
            <summary>Admin Gmail status</summary>
            <div className="sm-ytf-command-stack">
              <small>{compact(gmailBlockedReason, 180)}</small>
              <small>{gmailPrivacyBoundary}</small>
              <small>Raw email never appears for manager roles. Manual drops can be used until full Gmail mining is live.</small>
            </div>
          </details>
        ) : null}
      </section>

      {message ? <p className="sm-ytf-alert">{message}</p> : null}

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Communication intake</p>
              <h2>Paste one real update.</h2>
            </div>
            <span className="sm-status-pill">Gmail + chat bridge</span>
          </div>
          <form className="grid gap-3" onSubmit={handleManualDrop}>
            <select className="sm-ytf-input" onChange={(event) => setManualDrop((current) => ({ ...current, source_id: event.target.value }))} value={manualDrop.source_id}>
              {manualSources.map((source) => (
                <option key={source.source_id || source.name} value={source.source_id || source.name}>
                  {source.name || source.source_id} / {ytfOwnerLabel(source.owner || 'Owner')}
                </option>
              ))}
            </select>
            <input className="sm-ytf-input" onChange={(event) => setManualDrop((current) => ({ ...current, title: event.target.value }))} placeholder="Short title" value={manualDrop.title} />
            <input className="sm-ytf-input" onChange={(event) => setManualDrop((current) => ({ ...current, sender: event.target.value }))} placeholder="Sender or group" value={manualDrop.sender} />
            <textarea className="sm-ytf-textarea" onChange={(event) => setManualDrop((current) => ({ ...current, raw_text: event.target.value }))} placeholder="Paste Viber, LINE, WeChat, supplier, or manager update" value={manualDrop.raw_text} />
            <input className="sm-ytf-input" onChange={(event) => setManualDrop((current) => ({ ...current, evidence_link: event.target.value }))} placeholder="Optional Drive/photo/evidence link" value={manualDrop.evidence_link} />
            <button className="sm-button-primary" disabled={busy === 'manual'} type="submit">
              {busy === 'manual' ? 'Saving...' : 'Save update'}
            </button>
          </form>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Routed output</p>
              <h2>What people use.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/action-board">
              Work
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {manualSources.slice(0, 5).map((source) => (
              <Link className="sm-ytf-list-row" key={source.source_id || source.name} to="/app/action-board">
                <span>
                  <strong>{source.name || source.source_id}</strong>
                  <small>{source.system || 'Intake'} / {ytfOwnerLabel(source.owner || 'Owner')} / {statusLabel(source.status || source.probe_status || source.credential_mode)}</small>
                </span>
                <em>Work</em>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <details className="sm-ytf-panel sm-ytf-details">
        <summary>Advanced intake status: {readySources}/{sourceList.length} ready / {blockedSources} pending</summary>
        <div>
          <div className="sm-ytf-metric-strip">
            <article>
              <span>Runtime feeds</span>
              <strong>{ytfFeeds.length}</strong>
              <small>{attentionFeeds.length} need background attention.</small>
            </article>
            <article>
              <span>Comms lanes</span>
              <strong>{readySources}/{sourceList.length}</strong>
              <small>{blockedSources} pending or missing.</small>
            </article>
            <article>
              <span>Drive packs</span>
              <strong>{liveSourcePacks}/{YANGON_TYRE_SOURCE_PACKS.length}</strong>
              <small>Live Drive packs.</small>
            </article>
            <article>
              <span>Queued connectors</span>
              <strong>{queuedConnectors.length}</strong>
              <small>Website, analytics, social, chat, exports.</small>
            </article>
          </div>
          <div className="sm-ytf-card-grid mt-3">
            {botSetupRows.map((row) => (
              <article className="sm-ytf-mini-card" key={row.system}>
                <span>{row.system}</span>
                <strong>{row.group}</strong>
                <small>{row.state}</small>
                <small>{row.next}</small>
              </article>
            ))}
          </div>
          <div className="sm-ytf-card-grid mt-3">
            {sourceList.slice(0, 9).map((source) => (
              <Link className="sm-ytf-mini-card" key={source.source_id || source.name} to={sourceRoute(source)}>
                <span>{source.system || 'Intake'}</span>
                <strong>{source.name || source.source_id}</strong>
                <small>{ytfOwnerLabel(source.owner || 'No owner')} - {statusLabel(source.status || source.probe_status || source.credential_mode)}</small>
              </Link>
            ))}
          </div>
        </div>
      </details>
    </div>
  )
}
