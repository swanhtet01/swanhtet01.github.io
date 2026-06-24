import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  getYtfAiStackReadiness,
  ytfAiCapabilityClusters,
  ytfAiGovernanceControls,
  ytfAiInfrastructureLayers,
  ytfAiOperatingActions,
  ytfOfflineDataPipelineStages,
  ytfRagRuntimeStages,
  ytfRecentAgentPlatformUpdates,
  type YtfAiStackStage,
} from '../lib/ytfAiStackModel'
import { YTF_VERIFIED_OPERATING_METRIC_VALUE_COUNT, YTF_VERIFIED_PIPELINE_SNAPSHOT } from '../lib/ytfVerifiedSnapshot'

function statusTone(status: YtfAiStackStage['status']) {
  if (status === 'live') {
    return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
  }
  if (status === 'partial') {
    return 'border-amber-300/30 bg-amber-300/10 text-amber-100'
  }
  return 'border-sky-300/30 bg-sky-300/10 text-sky-100'
}

function StageRail({ stages }: { stages: YtfAiStackStage[] }) {
  return (
    <div className="grid gap-3">
      {stages.map((stage, index) => (
        <article className="grid gap-3 rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 md:grid-cols-[auto_1fr_auto] md:items-start" key={stage.id}>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-black text-black">{index + 1}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-white">{stage.name}</h3>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusTone(stage.status)}`}>{stage.status}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">{stage.purpose}</p>
            <p className="mt-2 text-sm text-white/80">{stage.ytfUse}</p>
          </div>
          <Link className="sm-button-secondary !px-3 !py-2 text-xs" to={stage.route}>
            Open
          </Link>
        </article>
      ))}
    </div>
  )
}

export function YtfAiStackPage() {
  const readiness = getYtfAiStackReadiness()
  const sourceRecords = YTF_VERIFIED_PIPELINE_SNAPSHOT.source_records?.count ?? 0
  const kpiCandidates = YTF_VERIFIED_PIPELINE_SNAPSHOT.source_records?.kpi_candidate_count ?? 0
  const ragCandidates = YTF_VERIFIED_PIPELINE_SNAPSHOT.source_records?.rag_candidate_count ?? 0
  const workbookCandidates = YTF_VERIFIED_PIPELINE_SNAPSHOT.workbooks?.metric_candidate_count ?? 0

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="AI stack"
        title="Production RAG, agentic AI, data science, and infrastructure in one Factory Client blueprint."
        description="A simple control map distilled from the new references: what is live, what is partial, what is next, and where each layer appears in the ERP."
      />

      <section className="sm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Cloud agent workforce</p>
            <h2 className="mt-2 text-2xl font-bold text-white">One cloud orchestrator, thousands of source-level agents.</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Vercel Hobby runs the protected full-refresh cron. Inside that run, the system fans out across Drive, workbook, RAG, owner-brief, and evaluation agent lanes without depending on this PC.
            </p>
          </div>
          <Link className="sm-button-secondary !px-3 !py-2 text-xs" to="/app/platform-admin">
            Cloud status
          </Link>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'File agents', value: sourceRecords.toLocaleString(), detail: 'One logical extraction contract per source record.' },
            { label: 'KPI/RAG queue', value: (kpiCandidates + ragCandidates).toLocaleString(), detail: `${kpiCandidates.toLocaleString()} KPI candidates; ${ragCandidates.toLocaleString()} RAG candidates.` },
            { label: 'Workbook values', value: YTF_VERIFIED_OPERATING_METRIC_VALUE_COUNT.toLocaleString(), detail: `${workbookCandidates.toLocaleString()} workbook metric schemas mined.` },
            { label: 'Cron mode', value: 'Hobby-safe', detail: 'Only /api/cron/ytf/full-refresh is scheduled; internal agent endpoints stay protected.' },
          ].map((item) => (
            <article className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4" key={item.label}>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">{item.label}</p>
              <p className="mt-2 text-3xl font-black text-white">{item.value}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-surface overflow-hidden p-0">
        <div className="grid gap-0 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.24),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-6 md:p-8">
            <p className="sm-kicker text-sky-100">Current readiness</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">{readiness.readinessScore}%</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-200">
              The system is no longer only a dashboard. It has Drive ingestion, workbook extraction, KPI candidates, owner briefs, knowledge-query routing, and a live portal. The biggest remaining platform move is durable Postgres plus deeper RAG chunking.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-3xl bg-white/10 p-4">
                <p className="text-2xl font-bold text-white">{readiness.live}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-300">Live</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4">
                <p className="text-2xl font-bold text-white">{readiness.partial}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-300">Partial</p>
              </div>
              <div className="rounded-3xl bg-white/10 p-4">
                <p className="text-2xl font-bold text-white">{readiness.next}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-300">Next</p>
              </div>
            </div>
          </div>
          <div className="grid content-between gap-4 p-6 md:p-8">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Reference lessons applied</p>
              <div className="mt-4 grid gap-3">
                {[
                  'Production RAG needs guards, routing, retrieval, grading, citations, and trace before it can guide operations.',
                  'Agent capability needs separate lanes for data entry, Drive change behavior, knowledge graph, governance, and runtime jobs.',
                  'AI-optimized infrastructure starts with security, orchestration, data services, storage, automation, and evaluation before GPUs.',
                ].map((item) => (
                  <p className="sm-chip text-sm text-white" key={item}>{item}</p>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/change-monitor">
                Open Drive Monitor
              </Link>
              <Link className="sm-button-secondary" to="/app/data-quality">
                Data Quality
              </Link>
              <Link className="sm-button-secondary" to="/app/evaluation">
                Evaluation
              </Link>
              <Link className="sm-button-secondary" to="/app/platform-admin">
                Fix production DB
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="sm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Use it this week</p>
            <h2 className="mt-2 text-2xl font-bold text-white">One action per role, then the AI stack does the backend work.</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              This is the practical version of the architecture: managers record, plant manager reviews, admin hardens, and agents prepare evidence.
            </p>
          </div>
          <span className="sm-status-pill">{ytfAiOperatingActions.length} operating actions</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ytfAiOperatingActions.map((item) => (
            <article className="rounded-[2rem] border border-white/10 bg-black/20 p-5" key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">{item.audience}</p>
                  <h3 className="mt-2 text-xl font-bold text-white">{item.name}</h3>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusTone(item.status)}`}>{item.status}</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-white/85">{item.action}</p>
              <div className="mt-4 grid gap-3">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">System path</p>
                  <p className="mt-2 text-sm">{item.systemPath}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Proof</p>
                  <p className="mt-2 text-sm">{item.proof}</p>
                </div>
              </div>
              <Link className="sm-button-secondary mt-4 !px-3 !py-2 text-xs" to={item.route}>
                Open
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">April agent-platform updates</p>
            <h2 className="mt-2 text-2xl font-bold text-white">What to absorb into the Factory Client build now.</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              The direction is clear: governed enterprise agents, connected data, sandboxed execution, MCP-style tools, observability, and evals.
            </p>
          </div>
          <span className="sm-status-pill">{ytfRecentAgentPlatformUpdates.length} integrations</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {ytfRecentAgentPlatformUpdates.map((item) => (
            <Link className="sm-proof-card" key={item.id} to={item.route}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">{item.platform}</p>
                  <h3 className="mt-2 text-lg font-bold text-white">{item.update}</h3>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusTone(item.status)}`}>{item.status}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/84">Lesson: {item.lesson}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">YTF integration: {item.ytfIntegration}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="sm-terminal p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Runtime query pipeline</p>
          <h2 className="mt-2 text-2xl font-bold text-white">How the internal AI should answer.</h2>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">The screenshots show this cannot be a basic chat box. Each answer needs routing, retrieval, grading, guardrails, and evidence.</p>
          <div className="mt-5">
            <StageRail stages={ytfRagRuntimeStages} />
          </div>
        </article>

        <article className="sm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Offline data pipeline</p>
          <h2 className="mt-2 text-2xl font-bold text-white">How messy files become ERP memory.</h2>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Google Drive remains the human workflow. The platform converts it into structured records, reviewed KPIs, retrieval chunks, and action routes.</p>
          <div className="mt-5">
            <StageRail stages={ytfOfflineDataPipelineStages} />
          </div>
        </article>
      </section>

      <section className="sm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Governance controls</p>
            <h2 className="mt-2 text-2xl font-bold text-white">The system can be AI-native without allowing unsupported autonomy.</h2>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              These controls are the invisible quality layer: evidence, human promotion, role boundaries, and runtime traces.
            </p>
          </div>
          <span className="sm-status-pill">{ytfAiGovernanceControls.length} controls</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ytfAiGovernanceControls.map((control) => (
            <article className="sm-proof-card" key={control.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-white">{control.name}</h3>
                <Link className="sm-link" to={control.route}>Open</Link>
              </div>
              <p className="mt-3 text-sm text-rose-100/90">Risk: {control.risk}</p>
              <p className="mt-3 text-sm text-white/85">Control: {control.control}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">Escalation: {control.escalation}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Capability map</p>
            <h2 className="mt-2 text-2xl font-bold text-white">What each AI discipline does for Factory Client.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/workforce">
            Open agent workforce
          </Link>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ytfAiCapabilityClusters.map((cluster) => (
            <article className="rounded-[2rem] border border-white/10 bg-black/20 p-5" key={cluster.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-xl font-bold text-white">{cluster.name}</h3>
                <Link className="sm-link" to={cluster.route}>Open</Link>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{cluster.ytfOutcome}</p>
              <div className="mt-4 grid gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--sm-muted)]">Skills</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cluster.skills.map((item) => (
                      <span className="sm-status-pill" key={item}>{item}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--sm-muted)]">Tech</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cluster.technologies.map((item) => (
                      <span className="sm-status-pill" key={item}>{item}</span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="sm-surface p-5 md:p-6">
          <p className="sm-kicker text-amber-100">Infrastructure decision</p>
          <h2 className="mt-2 text-2xl font-bold text-white">The next enterprise unlock is still the production database.</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
            The screenshots point toward AI-optimized IaaS, but the pragmatic first step is not GPUs. It is durable data services: Postgres, vector indexing, job queues, and evaluation traces.
          </p>
          <Link className="sm-button-primary mt-5" to="/app/platform-admin">
            Open platform readiness
          </Link>
        </article>
        <article className="sm-terminal p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Infrastructure layers</p>
          <div className="mt-5 grid gap-3">
            {ytfAiInfrastructureLayers.map((layer) => (
              <article className="sm-proof-card" key={layer.id}>
                <h3 className="font-bold text-white">{layer.name}</h3>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Current: {layer.current}</p>
                <p className="mt-2 text-sm text-white/80">Next: {layer.next}</p>
                <p className="mt-2 text-xs text-amber-100">Risk: {layer.risk}</p>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
