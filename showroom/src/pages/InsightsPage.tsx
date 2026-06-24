import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  buildYangonTyreInsightSeed,
  type YangonTyreNarrativeArc,
  type YangonTyrePipelineChapter,
  type YangonTyreSnapshotMetric,
  type YangonTyreStoryBeat,
} from '../lib/yangonTyreDriveIntelligence'
import { checkWorkspaceHealth, getWorkspaceSession, workspaceFetch } from '../lib/workspaceApi'

type InsightRow = {
  key: string
  title: string
  summary: string
  category: string
  route: string
}

type InsightPayload = {
  headline?: string
  engine?: string
  insights?: InsightRow[]
  recommended_actions?: string[]
  updated_at?: string | null
  source_registry?: Array<{
    id: string
    name: string
    sourceType: string
    status: string
    coverage: string
    route: string
    evidenceCount: number
    lastSignalAt: string | null
  }>
  story_beats?: YangonTyreStoryBeat[]
  narrative_arcs?: YangonTyreNarrativeArc[]
  pipeline_chapters?: YangonTyrePipelineChapter[]
  snapshot_metrics?: YangonTyreSnapshotMetric[]
}

function formatSignalAt(value: string | null | undefined) {
  if (!value) {
    return 'No recent signal'
  }
  return new Date(value).toLocaleString()
}

export function InsightsPage() {
  const seedPayload = buildYangonTyreInsightSeed()
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'live' | 'drive-seed'>('drive-seed')
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [payload, setPayload] = useState<InsightPayload>(seedPayload)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const health = await checkWorkspaceHealth()
        if (cancelled) return

        if (!health.ready) {
          setMode('drive-seed')
          setStatusNote('Workspace API is not connected on this host yet. Showing the Drive-derived Yangon Tyre brief.')
          setLoading(false)
          return
        }

        try {
          const session = await getWorkspaceSession()
          if (cancelled) return

          if (!session.authenticated) {
            setMode('drive-seed')
            setStatusNote('Workspace login is not active here. Showing the Drive-derived Yangon Tyre brief.')
            setLoading(false)
            return
          }
        } catch {
          if (cancelled) return

          setMode('drive-seed')
          setStatusNote('Workspace login could not be verified here. Showing the Drive-derived Yangon Tyre brief.')
          setLoading(false)
          return
        }

        const nextPayload = await workspaceFetch<InsightPayload>('/api/insights')
        if (cancelled) return

        setPayload({
          ...seedPayload,
          ...nextPayload,
          insights: nextPayload.insights ?? seedPayload.insights,
          recommended_actions: nextPayload.recommended_actions ?? seedPayload.recommended_actions,
          source_registry: nextPayload.source_registry ?? seedPayload.source_registry,
          story_beats: nextPayload.story_beats ?? seedPayload.story_beats,
          narrative_arcs: nextPayload.narrative_arcs ?? seedPayload.narrative_arcs,
          pipeline_chapters: nextPayload.pipeline_chapters ?? seedPayload.pipeline_chapters,
          snapshot_metrics: nextPayload.snapshot_metrics ?? seedPayload.snapshot_metrics,
          updated_at: nextPayload.updated_at ?? seedPayload.updated_at,
        })
        setMode('live')
        setStatusNote('Live workspace-backed brief connected. Drive-derived story layers remain attached as the narrative scaffold.')
      } catch {
        if (cancelled) return

        setMode('drive-seed')
        setStatusNote('Live insight generation is unavailable right now. Showing the Drive-derived Yangon Tyre brief.')
        setPayload(seedPayload)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const sourceRegistry = payload.source_registry ?? []
  const storyBeats = payload.story_beats ?? []
  const narrativeArcs = payload.narrative_arcs ?? []
  const pipelineChapters = payload.pipeline_chapters ?? []
  const snapshotMetrics = payload.snapshot_metrics ?? []

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Insights"
        title="Read Yangon Tyre as a governed operating story."
        description="This surface starts from the Drive source estate, lifts out the strongest signals, and turns them into role-ready narrative instead of leaving them trapped in files."
      />

      <section className="sm-surface p-6">
        {loading ? (
          <p className="text-sm text-[var(--sm-muted)]">Building Drive-derived operating brief...</p>
        ) : (
          <div className="space-y-6">
            <div className="sm-surface-deep p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{mode === 'live' ? 'Live brief' : 'Drive-derived brief'}</p>
                  <h2 className="mt-3 max-w-4xl text-3xl font-bold text-white lg:text-5xl">{payload.headline || 'No major signal yet.'}</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className="sm-status-pill">{mode === 'live' ? 'workspace-backed' : 'drive-seed'}</span>
                  <span className="sm-status-pill">{payload.engine || 'rules + source estate'}</span>
                </div>
              </div>
              <p className="mt-4 max-w-4xl text-sm leading-relaxed text-[var(--sm-muted)]">
                {statusNote || 'Drive-derived story layer loaded.'} Updated signal: {formatSignalAt(payload.updated_at)}.
              </p>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {snapshotMetrics.map((metric) => (
                  <article className="sm-proof-card" key={metric.id}>
                    <p className="sm-kicker text-[var(--sm-accent)]">{metric.label}</p>
                    <p className="mt-3 text-3xl font-bold text-white">{metric.value}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{metric.detail}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
              <div className="space-y-3">
                {(payload.insights || []).map((row) => (
                  <article className="sm-proof-card" key={row.key}>
                    <p className="text-lg font-bold text-white">{row.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <span className="sm-status-pill">{row.category}</span>
                      <Link className="sm-button-secondary" to={row.route || '/app'}>
                        Open surface
                      </Link>
                    </div>
                  </article>
                ))}
              </div>

              <article className="sm-terminal p-6">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Recommended next moves</p>
                <div className="mt-4 space-y-3">
                  {(payload.recommended_actions || []).map((item, index) => (
                    <div className="sm-chip text-white" key={`${item}-${index}`}>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link className="sm-button-primary" to="/app/data-fabric">
                    Open data fabric
                  </Link>
                  <Link className="sm-button-secondary" to="/app/connectors">
                    Open connectors
                  </Link>
                  <Link className="sm-button-secondary" to="/app/knowledge">
                    Open knowledge
                  </Link>
                </div>
              </article>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
              <article className="sm-surface p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">Evidence wall</p>
                    <h2 className="mt-3 text-3xl font-bold text-white">The source estate already shows distinct behaviors.</h2>
                  </div>
                  <Link className="sm-link" to="/app/connectors">
                    Open connector control
                  </Link>
                </div>
                <div className="mt-6 grid gap-4">
                  {sourceRegistry.map((item) => (
                    <article className="sm-proof-card" key={item.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{item.name}</p>
                          <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.coverage}</p>
                        </div>
                        <span className="sm-status-pill">{item.status}</span>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="sm-chip text-white">
                          <p className="sm-kicker text-[var(--sm-accent)]">Evidence</p>
                          <p className="mt-3 text-sm text-white/80">{item.evidenceCount} extracted signals</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">Type: {item.sourceType}</p>
                        </div>
                        <div className="sm-chip text-white">
                          <p className="sm-kicker text-[var(--sm-accent-alt)]">Latest source change</p>
                          <p className="mt-3 text-sm text-[var(--sm-muted)]">{formatSignalAt(item.lastSignalAt)}</p>
                          <Link className="mt-3 inline-flex text-sm text-[var(--sm-accent)]" to={item.route}>
                            Open surface
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </article>

              <article className="sm-surface-deep p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Story arcs</p>
                    <h2 className="mt-3 text-3xl font-bold text-white">Use thesis, antithesis, and synthesis to move from files to action.</h2>
                  </div>
                  <span className="sm-status-pill">{narrativeArcs.length} arcs</span>
                </div>
                <div className="mt-6 grid gap-4">
                  {narrativeArcs.map((arc) => (
                    <article className="sm-proof-card" key={arc.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="sm-kicker text-[var(--sm-accent)]">{arc.name}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">A structured argument for what the next agent layer should do.</p>
                        </div>
                        <Link className="sm-link" to={arc.route}>
                          Open lane
                        </Link>
                      </div>
                      <div className="mt-4 grid gap-3">
                        <div className="sm-chip text-white">
                          <p className="sm-kicker text-[var(--sm-accent)]">Thesis</p>
                          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{arc.thesis}</p>
                        </div>
                        <div className="sm-chip text-white">
                          <p className="sm-kicker text-[var(--sm-accent-alt)]">Antithesis</p>
                          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{arc.antithesis}</p>
                        </div>
                        <div className="sm-chip text-white">
                          <p className="sm-kicker text-[var(--sm-accent)]">Synthesis</p>
                          <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{arc.synthesis}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            </div>

            <section className="sm-surface p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Visual storytelling</p>
                  <h2 className="mt-3 text-3xl font-bold text-white">The strongest Yangon Tyre signals now read like chapters, not scattered rows.</h2>
                </div>
                <Link className="sm-link" to="/app/director">
                  Open director desk
                </Link>
              </div>
              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {storyBeats.map((beat) => (
                  <article className="sm-proof-card" key={beat.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="sm-kicker text-[var(--sm-accent-alt)]">{beat.label}</p>
                        <h3 className="mt-2 text-2xl font-bold text-white">{beat.title}</h3>
                      </div>
                      <span className="sm-status-pill">{beat.metric}</span>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-white/80">{beat.summary}</p>
                    <div className="mt-4 grid gap-3">
                      {beat.evidence.map((item) => (
                        <div className="sm-chip text-white" key={`${beat.id}-${item}`}>
                          {item}
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">Why it matters: {beat.implication}</p>
                    <div className="mt-4 flex justify-end">
                      <Link className="sm-link" to={beat.route}>
                        Open story lane
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="sm-surface-deep p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Pipeline storyboard</p>
                  <h2 className="mt-3 text-3xl font-bold text-white">The AI agent pipeline is now explicit end to end.</h2>
                </div>
                <Link className="sm-link" to="/app/data-fabric">
                  Open data fabric
                </Link>
              </div>
              <div className="mt-6 grid gap-4 xl:grid-cols-4">
                {pipelineChapters.map((chapter) => (
                  <article className="sm-proof-card" key={chapter.id}>
                    <p className="sm-kicker text-[var(--sm-accent)]">{chapter.stage}</p>
                    <h3 className="mt-2 text-2xl font-bold text-white">{chapter.headline}</h3>
                    <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{chapter.detail}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {chapter.actions.map((action) => (
                        <span className="sm-status-pill" key={`${chapter.id}-${action}`}>
                          {action}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Link className="sm-link" to={chapter.route}>
                        Open stage
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  )
}
