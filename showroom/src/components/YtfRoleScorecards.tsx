import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  getYtfKnowledgeStatus,
  getYtfPipelineStats,
  loadCachedWorkspaceSession,
  sessionHasCapability,
  type WorkspaceCapability,
  type YtfKnowledgeStatusResult,
  type YtfPipelineStatsResult,
} from '../lib/workspaceApi'
import { applyVerifiedYtfPipelineFloor, YTF_VERIFIED_PIPELINE_SNAPSHOT } from '../lib/ytfVerifiedSnapshot'

export type YtfRoleScorecardRole = 'admin' | 'plant-manager' | 'manager' | 'operations' | 'maintenance' | 'quality' | 'sales'

type RoleScorecard = {
  label: string
  value: string
  detail: string
  route: string
  tone?: 'primary' | 'warning' | 'neutral'
}

type YtfRoleScorecardsProps = {
  role?: YtfRoleScorecardRole
  pipelineStats?: YtfPipelineStatsResult | null
  knowledgeStatus?: YtfKnowledgeStatusResult | null
  latestMetricCount?: number
  officialKpiCount?: number
  title?: string
  subtitle?: string
  compact?: boolean
}

const liveScorecardRoles = new Set(['admin', 'tenant_admin', 'platform_admin', 'owner', 'ceo', 'director', 'plant_manager'])
const liveScorecardCapabilities: WorkspaceCapability[] = ['tenant_admin.view', 'platform_admin.view', 'director.view', 'connector_admin.view']

function countLabel(value?: number | null) {
  return Number(value || 0).toLocaleString()
}

function shortTime(value?: string | null) {
  if (!value) return 'not synced'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function vectorLabel(knowledge?: YtfKnowledgeStatusResult | null, pipeline?: YtfPipelineStatsResult | null) {
  const mode = String(knowledge?.vector_readiness?.mode || '').toLowerCase()
  if (mode.includes('pgvector') || knowledge?.vector_readiness?.pgvector_ready || pipeline?.knowledge?.pgvector_ready) return 'Vector ready'
  if (mode.includes('token')) return 'Text search'
  return 'Evidence ready'
}

function roleLabel(role: YtfRoleScorecardRole) {
  if (role === 'admin') return 'Admin'
  if (role === 'plant-manager') return 'Plant manager'
  if (role === 'operations') return 'Operations'
  if (role === 'maintenance') return 'Maintenance'
  if (role === 'quality') return 'Quality'
  if (role === 'sales') return 'Sales'
  return 'Manager'
}

function canLoadLiveScorecardData(role: YtfRoleScorecardRole) {
  const payload = loadCachedWorkspaceSession()
  const session = payload?.authenticated ? payload.session : null
  const normalizedRole = String(session?.role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!session) return false
  if (role === 'admin' || role === 'plant-manager') return true
  return liveScorecardRoles.has(normalizedRole) || liveScorecardCapabilities.some((capability) => sessionHasCapability(session, capability))
}

function liveDataRoute(view: string, focus: string) {
  return `/app/live-data?view=${view}&focus=${focus}`
}

function buildCards(
  role: YtfRoleScorecardRole,
  pipeline: YtfPipelineStatsResult,
  knowledge: YtfKnowledgeStatusResult | null,
  latestMetricCount: number,
  officialKpiCount: number,
): RoleScorecard[] {
  const sourceRecords = pipeline.source_records?.count ?? 0
  const kpiCandidates = pipeline.source_records?.kpi_candidate_count ?? pipeline.workbooks?.metric_candidate_count ?? 0
  const workbookMetrics = pipeline.workbooks?.metric_candidate_count ?? 0
  const sourceChanges = pipeline.source_changes?.event_count ?? 0
  const reviewTasks = pipeline.source_changes?.promoted_task_count ?? pipeline.source_changes?.task_promotion?.review_task_count ?? 0
  const ragCandidates = pipeline.source_records?.rag_candidate_count ?? 0
  const knowledgeChunks = Math.max(knowledge?.summary?.chunk_count ?? 0, pipeline.knowledge?.chunk_count ?? 0)
  const emailReady = pipeline.communications?.gmail_ready_count ?? 0
  const emailTotal = pipeline.communications?.gmail_source_count ?? 0
  const botReady = pipeline.communications?.bot_ready_count ?? 0
  const botTotal = pipeline.communications?.bot_source_count ?? 0
  const refreshAt = pipeline.refresh_loop?.latest_at || pipeline.source_records?.latest_modified_time
  const databaseMode = pipeline.database?.external ? 'Cloud' : pipeline.database?.configured ? 'Local' : 'Check'

  if (role === 'admin') {
    return [
      {
        label: 'Saved history',
        value: databaseMode,
        detail: `${countLabel(sourceRecords)} transformed records from Drive and intake lanes.`,
        route: liveDataRoute('database', 'source_records'),
        tone: 'primary',
      },
      {
        label: 'Change queue',
        value: countLabel(sourceChanges),
        detail: `${countLabel(reviewTasks)} file-backed work items for owners.`,
        route: liveDataRoute('actions', 'source_changes'),
        tone: reviewTasks ? 'warning' : 'neutral',
      },
      {
        label: 'Comms intake',
        value: `${emailReady + botReady}/${emailTotal + botTotal || 0}`,
        detail: 'Gmail plus LINE, Viber, WeChat, and manual-drop readiness.',
        route: liveDataRoute('comms', 'communications'),
        tone: 'neutral',
      },
      {
        label: 'Evidence base',
        value: countLabel(knowledgeChunks),
        detail: `${vectorLabel(knowledge, pipeline)} over trusted operating context.`,
        route: liveDataRoute('data', 'evidence'),
        tone: 'primary',
      },
    ]
  }

  if (role === 'plant-manager') {
    return [
      {
        label: 'Check now',
        value: countLabel(reviewTasks || sourceChanges),
        detail: 'Record updates and new evidence waiting for plant decision.',
        route: liveDataRoute('actions', 'source_changes'),
        tone: reviewTasks ? 'warning' : 'neutral',
      },
      {
        label: 'Official numbers',
        value: countLabel(officialKpiCount),
        detail: `${countLabel(workbookMetrics)} operating values still need formula check.`,
        route: liveDataRoute('kpi', 'kpi_definitions'),
        tone: 'primary',
      },
      {
        label: 'Today values',
        value: countLabel(latestMetricCount),
        detail: 'Latest saved rows from daily entry and whiteboard capture.',
        route: liveDataRoute('kpi', 'latest_metrics'),
        tone: latestMetricCount ? 'neutral' : 'warning',
      },
      {
        label: 'Evidence',
        value: countLabel(knowledgeChunks),
        detail: `${countLabel(ragCandidates)} Drive/intake records are ready for file-backed answers.`,
        route: liveDataRoute('data', 'evidence'),
        tone: 'neutral',
      },
    ]
  }

  if (role === 'operations') {
    return [
      {
        label: 'Flow actions',
        value: countLabel(reviewTasks),
        detail: 'Changed production and planning records routed to Action Board.',
        route: liveDataRoute('actions', 'source_changes'),
        tone: reviewTasks ? 'warning' : 'neutral',
      },
      {
        label: 'Board values',
        value: countLabel(kpiCandidates),
        detail: 'Output, reject, downtime, WIP, and stock numbers waiting for confirmation.',
        route: liveDataRoute('kpi', 'kpi_candidates'),
        tone: 'primary',
      },
      {
        label: 'Records mapped',
        value: countLabel(sourceRecords),
        detail: `Latest file update ${shortTime(refreshAt)}.`,
        route: liveDataRoute('data', 'source_records'),
        tone: 'neutral',
      },
      {
        label: 'Evidence base',
        value: countLabel(knowledgeChunks),
        detail: vectorLabel(knowledge, pipeline),
        route: liveDataRoute('data', 'evidence'),
        tone: 'neutral',
      },
    ]
  }

  if (role === 'maintenance') {
    return [
      {
        label: 'Maintenance work',
        value: countLabel(reviewTasks),
        detail: 'File-backed issues to assign, prove, or close.',
        route: liveDataRoute('actions', 'source_changes'),
        tone: reviewTasks ? 'warning' : 'neutral',
      },
      {
        label: 'Downtime values',
        value: countLabel(kpiCandidates),
        detail: 'Whiteboard and workbook candidates can become downtime or reliability metrics.',
        route: liveDataRoute('kpi', 'kpi_candidates'),
        tone: 'primary',
      },
      {
        label: 'Evidence records',
        value: countLabel(sourceRecords),
        detail: 'Maintenance photos, records, and changed files stay traceable.',
        route: liveDataRoute('data', 'source_records'),
        tone: 'neutral',
      },
      {
        label: 'Evidence base',
        value: countLabel(knowledgeChunks),
        detail: 'Use file-backed search for asset history and notes.',
        route: liveDataRoute('data', 'evidence'),
        tone: 'neutral',
      },
    ]
  }

  if (role === 'quality') {
    return [
      {
        label: 'Quality work',
        value: countLabel(reviewTasks),
        detail: 'Changed evidence to confirm as defect, hold, root cause, or noise.',
        route: liveDataRoute('actions', 'source_changes'),
        tone: reviewTasks ? 'warning' : 'neutral',
      },
      {
        label: 'Quality values',
        value: countLabel(kpiCandidates),
        detail: 'Reject, claim, inspection, and release signals for QC confirmation.',
        route: liveDataRoute('kpi', 'kpi_candidates'),
        tone: 'primary',
      },
      {
        label: 'File evidence',
        value: countLabel(sourceRecords),
        detail: 'Trace back to Drive records, emails, and manual evidence drops.',
        route: liveDataRoute('data', 'source_records'),
        tone: 'neutral',
      },
      {
        label: 'Evidence base',
        value: countLabel(knowledgeChunks),
        detail: 'Ask file-backed questions before closing a quality issue.',
        route: liveDataRoute('data', 'evidence'),
        tone: 'neutral',
      },
    ]
  }

  if (role === 'sales') {
    return [
      {
        label: 'Customer signals',
        value: countLabel(sourceRecords),
        detail: 'Sales, inventory, email, and file updates mapped into the ERP.',
        route: liveDataRoute('data', 'source_records'),
        tone: 'neutral',
      },
      {
        label: 'Comms',
        value: `${emailReady + botReady}/${emailTotal + botTotal || 0}`,
        detail: 'Admin sees raw inbox; sales sees routed follow-up actions.',
        route: liveDataRoute('comms', 'communications'),
        tone: 'primary',
      },
      {
        label: 'Action queue',
        value: countLabel(reviewTasks),
        detail: 'Follow-ups, stock questions, and record updates waiting for owner.',
        route: liveDataRoute('actions', 'source_changes'),
        tone: reviewTasks ? 'warning' : 'neutral',
      },
      {
        label: 'Commercial values',
        value: countLabel(kpiCandidates),
        detail: 'Business-record and board-photo values can become sales/stock KPIs.',
        route: liveDataRoute('kpi', 'kpi_candidates'),
        tone: 'neutral',
      },
    ]
  }

  return [
    {
      label: 'Add today',
      value: 'Entry',
      detail: 'Capture one issue, owner, note, or board photo from phone.',
      route: '/app/daily-entry',
      tone: 'primary',
    },
    {
      label: 'My queue',
      value: countLabel(reviewTasks),
      detail: 'Work waiting for owner update or closeout.',
      route: liveDataRoute('actions', 'source_changes'),
      tone: reviewTasks ? 'warning' : 'neutral',
    },
    {
      label: 'Operating values',
      value: countLabel(kpiCandidates),
      detail: 'Numbers from records or entries that are ready to inspect.',
      route: liveDataRoute('kpi', 'kpi_candidates'),
      tone: 'neutral',
    },
    {
      label: 'Evidence base',
      value: countLabel(knowledgeChunks),
      detail: `${vectorLabel(knowledge, pipeline)} from transformed records.`,
      route: liveDataRoute('data', 'evidence'),
      tone: 'neutral',
    },
  ]
}

export function YtfRoleScorecards({
  role = 'manager',
  pipelineStats,
  knowledgeStatus,
  latestMetricCount = 0,
  officialKpiCount = 0,
  title,
  subtitle,
  compact = false,
}: YtfRoleScorecardsProps) {
  const [loadedPipeline, setLoadedPipeline] = useState<YtfPipelineStatsResult | null>(pipelineStats ?? null)
  const [loadedKnowledge, setLoadedKnowledge] = useState<YtfKnowledgeStatusResult | null>(knowledgeStatus ?? null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (pipelineStats) setLoadedPipeline(pipelineStats)
      if (knowledgeStatus) setLoadedKnowledge(knowledgeStatus)
      if (pipelineStats && knowledgeStatus) return

      if (!canLoadLiveScorecardData(role)) {
        if (!pipelineStats) setLoadedPipeline(YTF_VERIFIED_PIPELINE_SNAPSHOT)
        if (!knowledgeStatus) setLoadedKnowledge(null)
        return
      }

      const [nextPipeline, nextKnowledge] = await Promise.all([
        pipelineStats ? Promise.resolve(pipelineStats) : getYtfPipelineStats().catch(() => YTF_VERIFIED_PIPELINE_SNAPSHOT),
        knowledgeStatus ? Promise.resolve(knowledgeStatus) : getYtfKnowledgeStatus().catch(() => null),
      ])
      if (cancelled) return
      setLoadedPipeline(nextPipeline)
      setLoadedKnowledge(nextKnowledge)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [pipelineStats, knowledgeStatus, role])

  const activePipeline = applyVerifiedYtfPipelineFloor(pipelineStats ?? loadedPipeline ?? YTF_VERIFIED_PIPELINE_SNAPSHOT)
  const activeKnowledge = knowledgeStatus ?? loadedKnowledge
  const cards = buildCards(role, activePipeline, activeKnowledge, latestMetricCount, officialKpiCount)

  return (
    <section className="sm-ytf-panel sm-ytf-role-scorecards">
      <div className="sm-ytf-section-head">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">{roleLabel(role)} scorecard</p>
          <h2>{title || 'What matters now.'}</h2>
          <p>{subtitle || 'A compact role view of live YTF records, file values, work, and evidence.'}</p>
        </div>
        <Link className="sm-button-secondary" to={liveDataRoute('database', 'source_records')}>
          Data
        </Link>
      </div>
      <div className="sm-ytf-role-score-grid">
        {(compact ? cards.slice(0, 4) : cards).map((card) => (
          <Link className={`sm-ytf-role-score-card is-${card.tone || 'neutral'}`} key={card.label} to={card.route}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </Link>
        ))}
      </div>
    </section>
  )
}
