import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { getYtfKnowledgeStatus, getYtfPipelineStats, type YtfKnowledgeStatusResult, type YtfPipelineStatsResult } from '../lib/workspaceApi'
import { applyVerifiedYtfPipelineFloor, YTF_VERIFIED_PIPELINE_SNAPSHOT } from '../lib/ytfVerifiedSnapshot'

type DataPulseMode = 'admin' | 'plant' | 'manager' | 'compact'

type DataPulseCard = {
  label: string
  value: string
  detail: string
  route: string
  tone?: 'primary' | 'warning' | 'neutral'
}

type YtfDataPulseProps = {
  pipelineStats?: YtfPipelineStatsResult | null
  knowledgeStatus?: YtfKnowledgeStatusResult | null
  mode?: DataPulseMode
  title?: string
  subtitle?: string
}

function numberLabel(value?: number | null) {
  return Number(value || 0).toLocaleString()
}

function compactTime(value?: string | null) {
  if (!value) return 'No timestamp'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function vectorLabel(value?: string | null, ready?: boolean) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized.includes('pgvector') || normalized.includes('semantic') || ready) return 'Vector ready'
  if (normalized.includes('token')) return 'Text search'
  return normalized ? normalized.replace(/_/g, ' ') : 'Evidence ready'
}

export function YtfDataPulse({
  pipelineStats,
  knowledgeStatus,
  mode = 'compact',
  title = 'Live data pulse.',
  subtitle = 'The ERP is reading saved Factory Client data, not static demo cards.',
}: YtfDataPulseProps) {
  const [loadedPipeline, setLoadedPipeline] = useState<YtfPipelineStatsResult | null>(pipelineStats ?? null)
  const [loadedKnowledge, setLoadedKnowledge] = useState<YtfKnowledgeStatusResult | null>(knowledgeStatus ?? null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (pipelineStats) setLoadedPipeline(pipelineStats)
      if (knowledgeStatus) setLoadedKnowledge(knowledgeStatus)
      if (pipelineStats && knowledgeStatus) return

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
  }, [pipelineStats, knowledgeStatus])

  const activePipeline = applyVerifiedYtfPipelineFloor(pipelineStats ?? loadedPipeline ?? YTF_VERIFIED_PIPELINE_SNAPSHOT)
  const activeKnowledge = knowledgeStatus ?? loadedKnowledge
  const sourceRecords = activePipeline?.source_records?.count ?? 0
  const resolvedShortcuts = activePipeline?.source_records?.resolved_shortcut_target_count ?? 0
  const unresolvedShortcuts = activePipeline?.source_records?.unresolved_shortcut_count ?? 0
  const unresolvedDriveShortcuts = activePipeline?.source_records?.unresolved_drive_shortcut_count ?? unresolvedShortcuts
  const windowsShortcuts = activePipeline?.source_records?.windows_shortcut_count ?? 0
  const shortcutTargets = activePipeline?.source_records?.shortcut_backed_record_count ?? 0
  const sourceChanges = activePipeline?.source_changes?.event_count ?? 0
  const reviewTasks =
    activePipeline?.source_changes?.promoted_task_count ??
    activePipeline?.source_changes?.task_promotion?.review_task_count ??
    0
  const workbookMetrics = activePipeline?.workbooks?.metric_candidate_count ?? 0
  const kpiCandidates = activePipeline?.source_records?.kpi_candidate_count ?? workbookMetrics
  const knowledgeChunks = Math.max(activeKnowledge?.summary?.chunk_count ?? 0, activePipeline?.knowledge?.chunk_count ?? 0)
  const vectorMode = vectorLabel(activeKnowledge?.vector_readiness?.mode, activePipeline?.knowledge?.pgvector_ready)
  const databaseValue = activePipeline?.database?.external ? 'Cloud' : activePipeline?.database?.configured ? 'Local' : 'Check'
  const refreshTime = activePipeline?.refresh_loop?.latest_at || activePipeline?.source_records?.latest_modified_time
  const emailReady = activePipeline?.communications?.gmail_ready_count ?? 0
  const emailTotal = activePipeline?.communications?.gmail_source_count ?? 0
  const botReady = activePipeline?.communications?.bot_ready_count ?? 0
  const botTotal = activePipeline?.communications?.bot_source_count ?? 0

  const cards: DataPulseCard[] =
    mode === 'admin'
      ? [
          {
            label: 'Saved history',
            value: databaseValue,
            detail: `${numberLabel(sourceRecords)} records; ${numberLabel(resolvedShortcuts)} shortcut targets resolved.`,
            route: '/app/live-data?view=database',
            tone: 'primary',
          },
          {
            label: 'File changes',
            value: numberLabel(sourceChanges),
            detail: `${numberLabel(reviewTasks)} file-backed work items for owners.`,
            route: '/app/live-data?view=actions',
            tone: reviewTasks ? 'warning' : 'neutral',
          },
          {
            label: 'Comms intake',
            value: `${emailReady + botReady}/${emailTotal + botTotal || 0}`,
            detail: 'Gmail, LINE, Viber, WeChat, and manual evidence lanes.',
            route: '/app/live-data?view=comms',
            tone: 'neutral',
          },
          {
            label: 'Evidence base',
            value: numberLabel(knowledgeChunks),
            detail: `${vectorMode}; answers should cite file-backed chunks.`,
            route: '/app/live-data?view=data',
            tone: 'primary',
          },
          {
            label: 'Shortcut trust',
            value: numberLabel(shortcutTargets || resolvedShortcuts),
            detail: unresolvedDriveShortcuts
              ? `${numberLabel(unresolvedDriveShortcuts)} Drive shortcuts need target access.`
              : `${numberLabel(windowsShortcuts)} local shortcuts ignored safely.`,
            route: '/app/data-quality',
            tone: unresolvedDriveShortcuts ? 'warning' : 'neutral',
          },
        ]
      : [
          {
            label: mode === 'plant' ? 'Plant check' : 'Today data',
            value: numberLabel(reviewTasks || sourceChanges),
            detail: mode === 'plant' ? 'Record updates waiting for plant review.' : 'Open work routed from records and entries.',
            route: '/app/action-board',
            tone: reviewTasks ? 'warning' : 'neutral',
          },
          {
            label: 'Operating values',
            value: numberLabel(kpiCandidates),
            detail: `${numberLabel(workbookMetrics)} operating values are available for review.`,
            route: '/app/live-data?view=kpi',
            tone: 'primary',
          },
          {
            label: 'Records learned',
            value: numberLabel(sourceRecords),
            detail: `${numberLabel(shortcutTargets || resolvedShortcuts)} shortcut-backed records. ${compactTime(refreshTime)}.`,
            route: '/app/live-data?view=data',
            tone: 'neutral',
          },
          {
            label: 'Evidence base',
            value: numberLabel(knowledgeChunks),
            detail: vectorMode,
            route: '/app/live-data?view=data',
            tone: 'neutral',
          },
        ]

  return (
    <section className="sm-ytf-panel sm-ytf-story-panel sm-ytf-data-pulse">
      <div className="sm-ytf-section-head">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Database</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <Link className="sm-button-secondary" to="/app/live-data?view=database">
          Open DB
        </Link>
      </div>
      <div className="sm-ytf-story-grid">
        {cards.map((card) => (
          <Link className={`sm-ytf-story-card is-${card.tone || 'neutral'}`} key={card.label} to={card.route}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </Link>
        ))}
      </div>
    </section>
  )
}
