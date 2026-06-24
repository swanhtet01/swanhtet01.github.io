import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  getYtfChangeMonitor,
  getYtfFullRefreshLatest,
  promoteYtfSourceChanges,
  runYtfDataManager,
  runYtfFullRefresh,
  syncYtfChangeMonitor,
  type YtfChangeMonitorResult,
  type YtfFullRefreshLatestResult,
} from '../lib/workspaceApi'
import { queryYtfRootKnowledge, type YtfRootKnowledgeQueryResult } from '../lib/ytfRootWarehouseApi'
import { buildYtfOperatingInsights } from '../lib/ytfOperatingInsights'
import { getSeedDataFabricDataset } from '../lib/dataFabricApi'
import { getSeedYtfRootWarehouseDataset } from '../lib/ytfRootWarehouseApi'
import { inferYtfPlantScope, ytfOwnerLabel, ytfSourceLine } from '../lib/ytfUiFormat'

function formatDateTime(value?: string | null) {
  if (!value) return 'No refresh yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function compactNumber(value?: number | string | null) {
  if (typeof value === 'number') return new Intl.NumberFormat().format(value)
  const normalized = String(value ?? '').trim()
  return normalized || '0'
}

function statusText(value?: string | null) {
  return String(value || 'watch').replace(/_/g, ' ')
}

function compact(value?: string | null, max = 108) {
  const trimmed = String(value || '').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 3).trim()}...` : trimmed
}

export function YtfChangeMonitorPage() {
  const [monitor, setMonitor] = useState<YtfChangeMonitorResult | null>(null)
  const [fullRefresh, setFullRefresh] = useState<YtfFullRefreshLatestResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('What changed in the factory data and what should I review first?')
  const [answer, setAnswer] = useState<YtfRootKnowledgeQueryResult | null>(null)

  async function load() {
    const [nextMonitor, latestRefresh] = await Promise.all([
      getYtfChangeMonitor(),
      getYtfFullRefreshLatest().catch(() => null),
    ])
    setMonitor(nextMonitor)
    setFullRefresh(latestRefresh)
  }

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        await load()
      } catch {
        if (!cancelled) setError('Change monitor could not load on this host.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void start()
    return () => {
      cancelled = true
    }
  }, [])

  const latestRefresh = fullRefresh?.latest
  const latestRefreshTime =
    monitor?.pipeline_stats?.refresh_loop?.latest_at ||
    latestRefresh?.completed_at ||
    latestRefresh?.updated_at ||
    latestRefresh?.started_at ||
    monitor?.synced_at

  const stats = {
    records:
      monitor?.pipeline_stats?.source_records?.count ??
      monitor?.summary?.canonical_record_count ??
      monitor?.summary?.live_item_count ??
      0,
    changes:
      monitor?.pipeline_stats?.source_changes?.recent_event_count ??
      monitor?.pipeline_stats?.source_changes?.event_count ??
      monitor?.change_watch?.length ??
      0,
    reviewTasks:
      monitor?.pipeline_stats?.source_changes?.promoted_task_count ??
      monitor?.source_changes?.promoted_task_count ??
      monitor?.source_changes?.task_promotion?.review_task_count ??
      0,
    kpis: monitor?.durable_metrics?.summary?.candidate_count ?? monitor?.kpi_candidates?.length ?? 0,
    actions: monitor?.open_actions?.length ?? 0,
  }

  const ownerBriefs = useMemo(() => (monitor?.owner_briefs ?? []).slice(0, 4), [monitor?.owner_briefs])
  const changedFiles = useMemo(() => (monitor?.change_watch ?? []).slice(0, 5), [monitor?.change_watch])
  const kpiCandidates = useMemo(() => (monitor?.kpi_candidates ?? []).slice(0, 5), [monitor?.kpi_candidates])
  const openActions = useMemo(() => (monitor?.open_actions ?? []).slice(0, 5), [monitor?.open_actions])
  const sourceEvents = useMemo(() => (monitor?.pipeline_stats?.source_changes?.events ?? []).slice(0, 4), [monitor])
  const sourceChangeTasks =
    monitor?.pipeline_stats?.source_changes?.task_promotion ?? monitor?.source_changes?.task_promotion
  const fallbackInsights = useMemo(
    () => buildYtfOperatingInsights(getSeedDataFabricDataset(), getSeedYtfRootWarehouseDataset(), { audience: 'plant', limit: 4 }),
    [],
  )

  async function runAction(kind: 'monitor' | 'manager' | 'full-refresh' | 'promote') {
    setBusy(kind)
    setMessage('')
    setError('')
    try {
      if (kind === 'monitor') {
        setMonitor(await syncYtfChangeMonitor())
        setMessage('Record updates refreshed.')
      } else if (kind === 'manager') {
        const result = await runYtfDataManager()
        await load()
        setMessage(`Data manager saved ${result.saved?.metrics ?? 0} metrics and ${result.saved?.actions ?? 0} actions.`)
      } else if (kind === 'promote') {
        const result = await promoteYtfSourceChanges(24)
        await load()
        setMessage(`Created or refreshed ${result.review_task_count ?? result.saved_count ?? 0} record review tasks.`)
      } else {
        const result = await runYtfFullRefresh()
        await load()
        setMessage(`Learning refresh ${result.status ?? 'finished'}.`)
      }
    } catch {
      setError('Could not run this data job right now. The admin setup page shows the exact cloud connector or database blocker.')
    } finally {
      setBusy('')
    }
  }

  async function askData() {
    const trimmed = question.trim()
    if (!trimmed) return
    setBusy('ask')
    setMessage('')
    setError('')
    try {
      const result = await queryYtfRootKnowledge(trimmed)
      setAnswer(result)
      setMessage('Answered from Factory Client operating memory.')
    } catch {
      setError('Could not query the operating memory yet.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker">Changes</p>
          <h1>Record update review.</h1>
          <p>Only useful operating changes. No raw folder browsing on this page.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{loading ? 'Loading' : formatDateTime(latestRefreshTime)}</span>
          <span>{statusText(monitor?.connector_status || monitor?.status)}</span>
        </div>
      </section>

      <section className="sm-ytf-action-grid" aria-label="Change monitor actions">
        <button
          className="sm-ytf-action-tile is-primary"
          type="button"
          onClick={() => void runAction('monitor')}
          disabled={Boolean(busy)}
        >
          <span>
            <strong>{busy === 'monitor' ? 'Refreshing' : 'Refresh record updates'}</strong>
            <small>Update the review list from operating records.</small>
          </span>
          <span className="sm-ytf-action-arrow">Run</span>
        </button>
        <button
          className="sm-ytf-action-tile"
          type="button"
          onClick={() => void runAction('manager')}
          disabled={Boolean(busy)}
        >
          <span>
            <strong>{busy === 'manager' ? 'Running' : 'Build KPIs/actions'}</strong>
            <small>Turn record changes into candidate work items.</small>
          </span>
          <span className="sm-ytf-action-arrow">Run</span>
        </button>
        <button
          className="sm-ytf-action-tile"
          type="button"
          onClick={() => void runAction('promote')}
          disabled={Boolean(busy)}
        >
          <span>
            <strong>{busy === 'promote' ? 'Preparing' : 'Prepare review queue'}</strong>
            <small>Create team work items for the right section.</small>
          </span>
          <span className="sm-ytf-action-arrow">Run</span>
        </button>
        <button
          className="sm-ytf-action-tile"
          type="button"
          onClick={() => void runAction('full-refresh')}
          disabled={Boolean(busy)}
        >
          <span>
            <strong>{busy === 'full-refresh' ? 'Refreshing' : 'Refresh plant data'}</strong>
            <small>Re-read business records and saved work when the dashboard feels stale.</small>
          </span>
          <span className="sm-ytf-action-arrow">Run</span>
        </button>
      </section>

      {(message || error) && <p className="sm-ytf-alert">{message || error}</p>}

      <section className="sm-ytf-metric-strip">
        <article>
          <span>Operating records</span>
          <strong>{compactNumber(stats.records)}</strong>
        </article>
        <article>
          <span>Record updates</span>
          <strong>{compactNumber(stats.changes)}</strong>
        </article>
        <article>
          <span>Review tasks</span>
          <strong>{compactNumber(stats.reviewTasks)}</strong>
        </article>
        <article>
          <span>KPI candidates</span>
          <strong>{compactNumber(stats.kpis)}</strong>
        </article>
      </section>

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Review list</p>
              <h2>Open the source signal.</h2>
            </div>
          </div>
          <div className="sm-ytf-compact-list">
            {changedFiles.map((item) => {
              const plant = inferYtfPlantScope(item.title, item.domain, item.source_mode)
              return (
              <Link className="sm-ytf-list-row" key={item.id || item.title} to={item.route || '/app/change-monitor'}>
                <span>
                  <strong>{compact(item.title || item.next_action || 'Changed source', 76)}</strong>
                  <small>
                    {ytfSourceLine({
                      sourceMode: item.source_mode,
                      domain: item.domain,
                      plant: plant.label,
                      modifiedTime: item.updated_at,
                      title: item.title,
                    })}{' '}
                    · {compact(item.signal || item.next_action || 'Review if this should become a KPI, action, or archive.')}
                  </small>
                </span>
                <em>{statusText(item.priority)}</em>
              </Link>
              )
            })}
            {!changedFiles.length && (
              <>
                {fallbackInsights.map((insight) => (
                  <Link className="sm-ytf-list-row" key={insight.id} to={insight.route}>
                    <span>
                      <strong>{insight.title}</strong>
                      <small>{compact(insight.signal)} · source model snapshot</small>
                    </span>
                    <em>{insight.metric}</em>
                  </Link>
                ))}
              </>
            )}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Plant scope</p>
              <h2>Do not mix A and B.</h2>
            </div>
          </div>
          <div className="sm-ytf-compact-list">
            {['Floor A - Yangon / Shwe Pyi Thar / bias, nylon, agricultural tyres', 'Floor B - Bilin / Mon State / radial and motorcycle tyres', 'Shared - head office, finance, sales, supplier, CEO sources'].map((label) => (
              <div className="sm-ytf-list-row" key={label}>
                <span>
                  <strong>{label.split(' - ')[0]}</strong>
                  <small>{label.split(' - ').slice(1).join(' - ')}</small>
                </span>
                <em>locked</em>
              </div>
            ))}
          </div>
        </article>
      </section>

      <details className="sm-ytf-panel sm-ytf-details">
        <summary>Candidate KPIs and generated work</summary>
        <div className="sm-ytf-split">
        <article>
          <div className="sm-ytf-section-head"><div><p className="sm-kicker">Candidate KPIs</p><h2>Draft only.</h2></div></div>
          <div className="sm-ytf-compact-list">
            {kpiCandidates.map((candidate) => (
              <Link
                className="sm-ytf-list-row"
                key={candidate.id || candidate.name}
                to={candidate.route || '/app/data-quality'}
              >
                <span>
                  <strong>{candidate.name || 'KPI candidate'}</strong>
                  <small>
                    {compact(candidate.formula_hint || candidate.source_signal || 'Needs manager review.')} ·{' '}
                    {ytfOwnerLabel(candidate.owner, 'Data steward reviews')}
                  </small>
                </span>
                <em>{statusText(candidate.stage)}</em>
              </Link>
            ))}
            {!kpiCandidates.length && <p className="sm-ytf-empty">Run the data manager to extract KPI candidates.</p>}
          </div>
        </article>

        <article>
          <div className="sm-ytf-section-head"><div><p className="sm-kicker">Actions</p><h2>Team follows up.</h2></div></div>
          <div className="sm-ytf-compact-list">
            {openActions.map((action) => (
              <div className="sm-ytf-list-row" key={action.id || action.title}>
                <span>
                  <strong>{action.title || action.action || 'Generated action'}</strong>
                  <small>
                    {ytfOwnerLabel(action.owner)} · due {action.due || 'today'}
                  </small>
                </span>
                <em>{statusText(action.status || action.priority)}</em>
              </div>
            ))}
            {!openActions.length && <p className="sm-ytf-empty">No generated action is queued yet.</p>}
          </div>
        </article>
        </div>
      </details>

      <details className="sm-ytf-panel sm-ytf-details">
        <summary>Ask source memory</summary>
        <div>
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker">Ask data</p>
            <h2>Ask for an operating answer.</h2>
          </div>
        </div>
        <textarea
          className="sm-ytf-textarea"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
        />
        <div className="sm-ytf-button-row">
          <button className="sm-button-primary" type="button" onClick={() => void askData()} disabled={Boolean(busy)}>
            {busy === 'ask' ? 'Asking...' : 'Ask data'}
          </button>
          <button
            className="sm-button-secondary"
            type="button"
            onClick={() => setQuestion('Which changed files should the plant manager review first?')}
          >
            Plant review question
          </button>
        </div>
        {answer && (
          <div className="sm-ytf-alert">
            <strong>{answer.status === 'ok' ? 'Answer' : 'Source memory'}</strong>
            <p>{answer.answer}</p>
          </div>
        )}
        </div>
      </details>

      {ownerBriefs.length > 0 && (
        <details className="sm-ytf-panel sm-ytf-details">
          <summary>Team load summary</summary>
          <div className="sm-ytf-compact-list">
            {ownerBriefs.map((brief) => (
              <div className="sm-ytf-list-row" key={brief.owner || brief.brief}>
                <span>
                  <strong>{ytfOwnerLabel(brief.owner, 'Section owner')}</strong>
                  <small>{brief.brief || `${brief.item_count ?? 0} items need review.`}</small>
                </span>
                <em>{brief.priority_count ?? 0} high</em>
              </div>
            ))}
          </div>
        </details>
      )}

      {sourceEvents.length > 0 && (
        <details className="sm-ytf-panel sm-ytf-details">
          <summary>Source event trail</summary>
          <div>
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker">Latest detected events</p>
              <h2>Audit trail.</h2>
              <small>
                {compactNumber(sourceChangeTasks?.review_task_count)} review tasks created
                {sourceChangeTasks?.promoted_at ? ` - ${formatDateTime(sourceChangeTasks.promoted_at)}` : ''}
              </small>
            </div>
            <Link className="sm-button-secondary" to="/app/action-board">
              Open tasks
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {sourceEvents.map((event) => (
              <div className="sm-ytf-list-row" key={event.event_id || event.title}>
                <span>
                  <strong>{compact(event.title || 'Source event')}</strong>
                  <small>{compact(event.summary || `${event.domain || 'source'} - ${formatDateTime(event.detected_at)}`)}</small>
                </span>
                <em>{statusText(event.change_type)}</em>
              </div>
            ))}
          </div>
          </div>
        </details>
      )}
    </div>
  )
}
