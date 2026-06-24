import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  PLANT_OS_AGENT_CREWS,
  PLANT_OS_CUSTOMIZATION_AXES,
  PLANT_OS_PACKAGE_TIERS,
  PLANT_OS_REEVALUATION,
  PLANT_OS_TEMPLATE_SCREENS,
} from '../lib/plantOsSaasTemplateModel'
import { getYtfDashboardSummary, type YtfDashboardSummaryResult } from '../lib/workspaceApi'

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCount(value: unknown) {
  return numberValue(value).toLocaleString()
}

function compactTime(value?: string) {
  if (!value) return 'No timestamp'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function readinessStatus(condition: boolean, ready = 'Ready', blocked = 'Setup') {
  return condition ? ready : blocked
}

function productText(value: string) {
  return value
    .replace(/\bAI\b/g, 'Automation')
    .replace(/\bagents\b/gi, 'review lanes')
    .replace(/\bagent\b/gi, 'review lane')
    .replace(/\bcrews\b/gi, 'lanes')
    .replace(/\bcrew\b/gi, 'lane')
}

export function PlantOsTemplateWorkforcePage() {
  const [summary, setSummary] = useState<YtfDashboardSummaryResult | null>(null)
  const [summaryError, setSummaryError] = useState('')
  const dayOneScreens = PLANT_OS_TEMPLATE_SCREENS.slice(0, 3)
  const productScreens = PLANT_OS_TEMPLATE_SCREENS.slice(3)
  const liveCrews = PLANT_OS_AGENT_CREWS.slice(0, 5)
  const pipeline = summary?.pipeline_stats
  const sourceRecords = numberValue(pipeline?.source_records?.count)
  const sourceChanges = numberValue(pipeline?.source_changes?.event_count)
  const reviewTasks = numberValue(
    pipeline?.source_changes?.promoted_task_count ?? pipeline?.source_changes?.task_promotion?.review_task_count,
  )
  const kpiCandidates = numberValue(pipeline?.source_records?.kpi_candidate_count)
  const knowledgeChunks = numberValue(summary?.knowledge_status?.summary?.chunk_count)
  const vectorIndexed = numberValue(summary?.knowledge_status?.vector_readiness?.embedding_indexed_count)
  const gmailReady = numberValue(pipeline?.communications?.gmail_ready_count)
  const gmailSources = numberValue(pipeline?.communications?.gmail_source_count)
  const botReady = numberValue(pipeline?.communications?.bot_ready_count)
  const botSources = numberValue(pipeline?.communications?.bot_source_count)
  const refreshRuns = numberValue(pipeline?.refresh_loop?.run_count)
  const databaseReady = Boolean(pipeline?.database?.external)

  useEffect(() => {
    let cancelled = false
    getYtfDashboardSummary({ compact: true })
      .then((payload) => {
        if (!cancelled) setSummary(payload)
      })
      .catch((error: unknown) => {
        if (!cancelled) setSummaryError(error instanceof Error ? error.message : 'Could not load live readiness.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const readinessRows = [
    {
      label: 'Private tenant',
      value: readinessStatus(databaseReady),
      detail: databaseReady ? 'Managed Postgres is active for YTF.' : 'Production database must be connected.',
      route: '/app/platform-admin',
    },
    {
      label: 'Source fabric',
      value: sourceRecords ? `${formatCount(sourceRecords)} records` : 'No data',
      detail: `${formatCount(sourceChanges)} source events and ${formatCount(reviewTasks)} review tasks.`,
      route: '/app/data-fabric',
    },
    {
      label: 'KPI queue',
      value: kpiCandidates ? `${formatCount(kpiCandidates)} candidates` : 'Build',
      detail: 'Candidates stay draft until a manager approves them.',
      route: '/app/data-quality',
    },
    {
      label: 'Knowledge search',
      value: vectorIndexed ? `${formatCount(vectorIndexed)} vectors` : `${formatCount(knowledgeChunks)} chunks`,
      detail: vectorIndexed
        ? 'Semantic retrieval is indexed for source-backed answers.'
        : 'Knowledge chunks exist; vector rebuild is the next retrieval step.',
      route: '/app/data-fabric',
    },
    {
      label: 'Comms bridge',
      value: `${formatCount(gmailReady)}/${formatCount(gmailSources)} Gmail`,
      detail: `${formatCount(botReady)}/${formatCount(botSources)} chat bridges are configured for manual or bot intake.`,
      route: '/app/email',
    },
    {
      label: 'Autonomy loop',
      value: refreshRuns ? `${formatCount(refreshRuns)} runs` : 'Check',
      detail: `Latest refresh: ${compactTime(pipeline?.refresh_loop?.latest_at || summary?.generated_at)}`,
      route: '/app/system',
    },
  ]

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">PlantOS template</p>
          <h1>Sell the system, not a one-off workspace.</h1>
          <p>Use Factory Client as the first proof, then clone the same operating kernel for the next factory client.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>Admin only</span>
          <span>YTF proof</span>
          <span>Reusable product</span>
        </div>
      </section>

      <section className="sm-ytf-action-grid sm-ytf-action-grid-five">
        <Link className="sm-ytf-action-tile is-primary" to="/app/platform-admin">
          <span>
            <strong>Run YTF</strong>
            <small>Live tenant setup, data jobs, and release checks.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/portal-factory">
          <span>
            <strong>Build packet</strong>
            <small>Generate a client workspace from industry templates.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/teams">
          <span>
            <strong>Automation review</strong>
            <small>Review lanes, jobs, runs, and approval boundaries.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/data-fabric">
          <span>
            <strong>Data fabric</strong>
            <small>Source-backed memory, KPI candidates, and freshness.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/factory">
          <span>
            <strong>Release</strong>
            <small>Turn proven modules into reusable product lines.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
      </section>

      <section className="sm-ytf-metric-strip is-five">
        <article>
          <span>Screens</span>
          <strong>{PLANT_OS_TEMPLATE_SCREENS.length}</strong>
          <small>Same kernel for every client.</small>
        </article>
        <article>
          <span>Review lanes</span>
          <strong>{PLANT_OS_AGENT_CREWS.length}</strong>
          <small>Bounded by human approval gates.</small>
        </article>
        <article>
          <span>Packages</span>
          <strong>{PLANT_OS_PACKAGE_TIERS.length}</strong>
          <small>Starter to enterprise.</small>
        </article>
        <article>
          <span>Custom axes</span>
          <strong>{PLANT_OS_CUSTOMIZATION_AXES.length}</strong>
          <small>Roles, sources, modules, policy, proof.</small>
        </article>
        <article>
          <span>Proof tenant</span>
          <strong>YTF</strong>
          <small>First industrial operating model.</small>
        </article>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live proof packet</p>
            <h2>YTF readiness becomes the client template.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/system">
            System
          </Link>
        </div>
        {summaryError ? <p className="sm-ytf-muted">{summaryError}</p> : null}
        <div className="sm-ytf-card-grid">
          {readinessRows.map((row) => (
            <Link className="sm-ytf-mini-card" key={row.label} to={row.route}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              <small>{row.detail}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Day-one product</p>
              <h2>Five screens are enough.</h2>
            </div>
            <span className="sm-status-pill">No giant menu</span>
          </div>
          <div className="sm-ytf-compact-list">
            {dayOneScreens.map((screen) => (
              <Link className="sm-ytf-list-row" key={screen.id} to={screen.route}>
                <span>
                  <strong>{screen.name}</strong>
                  <small>{screen.user}: {screen.job}</small>
                </span>
                <em>Open</em>
              </Link>
            ))}
            {productScreens.map((screen) => (
              <Link className="sm-ytf-list-row sm-ytf-insight-row" key={screen.id} to={screen.route}>
                <span>
                  <strong>{screen.name}</strong>
                  <small>{screen.user}: {screen.job}</small>
                </span>
                <em>Control</em>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Sellable packages</p>
              <h2>Start small, expand by proof.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/portal-factory">
              Factory
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {PLANT_OS_PACKAGE_TIERS.map((tier) => (
              <article className="sm-ytf-list-row" key={tier.id}>
                <span>
                  <strong>{tier.name}</strong>
                  <small>{tier.promise}</small>
                  <small>{tier.buyer}</small>
                </span>
                <em>Package</em>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-ytf-panel">
        <div className="sm-ytf-section-head">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Dedicated review lanes</p>
            <h2>The system prepares work. Humans approve truth.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/teams">
            Automation review
          </Link>
        </div>
        <div className="sm-ytf-card-grid">
          {liveCrews.map((crew) => (
            <Link className="sm-ytf-mini-card" key={crew.id} to={crew.route}>
              <span>{productText(crew.lane)}</span>
              <strong>{productText(crew.name)}</strong>
              <small>{productText(crew.writes)}</small>
              <small>{productText(crew.cadence)}</small>
            </Link>
          ))}
        </div>
        <details className="sm-ytf-inline-details">
          <summary>Review gates</summary>
          <div className="sm-ytf-compact-list">
            {PLANT_OS_AGENT_CREWS.map((crew) => (
              <article className="sm-ytf-list-row" key={`${crew.id}-gate`}>
                <span>
                  <strong>{productText(crew.name)}</strong>
                  <small>{productText(crew.reads)}</small>
                  <small>{productText(crew.gate)}</small>
                </span>
                <em>{productText(crew.lane)}</em>
              </article>
            ))}
          </div>
        </details>
      </section>

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Customization kit</p>
              <h2>What changes for each client.</h2>
            </div>
            <span className="sm-status-pill">Config first</span>
          </div>
          <div className="sm-ytf-compact-list">
            {PLANT_OS_CUSTOMIZATION_AXES.map((axis) => (
              <article className="sm-ytf-list-row" key={axis.id}>
                <span>
                  <strong>{axis.label}</strong>
                  <small>{axis.default}</small>
                  <small>{axis.customizeWith}</small>
                </span>
                <em>Config</em>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Reevaluation</p>
              <h2>What to do next.</h2>
            </div>
            <span className="sm-status-pill">ERRC</span>
          </div>
          <div className="sm-ytf-compact-list">
            {PLANT_OS_REEVALUATION.map((row) => (
              <article className="sm-ytf-list-row" key={row.title}>
                <span>
                  <strong>{row.title}</strong>
                  <small>{row.detail}</small>
                </span>
                <em>{row.status}</em>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
