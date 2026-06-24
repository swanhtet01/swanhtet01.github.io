import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  loadDataFabricDataset,
  getSeedDataFabricDataset,
  type DataFabricDataset,
  type DataFabricHealthStatus,
} from '../lib/dataFabricApi'
import {
  YANGON_TYRE_DATABASE_LAYERS,
  YANGON_TYRE_DECISION_LENSES,
  YANGON_TYRE_RUNTIME_GUIDE_STEPS,
  YANGON_TYRE_TOOL_RECOMMENDATIONS,
} from '../lib/yangonTyreDataRuntimeGuide'
import {
  buildYangonTyreAnalyticsMart,
  getYangonTyreAnalyticsMartView,
  type YangonTyreAnalyticsLens,
} from '../lib/yangonTyreAnalyticsMart'
import { YANGON_TYRE_DATA_PROFILE } from '../lib/yangonTyreDataProfile'
import { getTenantConfig } from '../lib/tenantConfig'
import {
  YANGON_TYRE_DATA_FABRIC_DIALECTIC,
  type DataFabricStatus,
} from '../lib/yangonTyreDataFabricModel'

function toneForStatus(status: DataFabricStatus) {
  if (status === 'live') {
    return 'text-emerald-300'
  }
  if (status === 'mapped') {
    return 'text-sky-300'
  }
  return 'text-amber-300'
}

function toneForHealthStatus(status: DataFabricHealthStatus) {
  if (status === 'Healthy') {
    return 'text-emerald-300'
  }
  if (status === 'Warning') {
    return 'text-amber-300'
  }
  if (status === 'Degraded') {
    return 'text-rose-300'
  }
  return 'text-slate-300'
}

function toneForHandoffStatus(status: string) {
  if (status === 'Active') {
    return 'text-emerald-300'
  }
  if (status === 'Needs review') {
    return 'text-amber-300'
  }
  return 'text-sky-300'
}

function toneForFeatureStatus(status: 'ready' | 'watch' | 'needs-writeback') {
  if (status === 'ready') {
    return 'text-emerald-300'
  }
  if (status === 'watch') {
    return 'text-amber-300'
  }
  return 'text-rose-300'
}

function toneForToolPhase(phase: 'now' | 'next' | 'scale') {
  if (phase === 'now') {
    return 'text-emerald-300'
  }
  if (phase === 'next') {
    return 'text-sky-300'
  }
  return 'text-amber-300'
}

function formatSignalAt(value: string | null) {
  if (!value) {
    return 'No live signal yet'
  }
  return new Date(value).toLocaleString()
}

function formatSignalAge(value: string | null) {
  if (!value) {
    return 'No live signal'
  }
  const deltaMs = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return 'Just updated'
  }
  const minutes = Math.max(1, Math.round(deltaMs / 60000))
  if (minutes < 90) {
    return `${minutes}m ago`
  }
  const hours = Math.max(1, Math.round(minutes / 60))
  if (hours < 48) {
    return `${hours}h ago`
  }
  const days = Math.max(1, Math.round(hours / 24))
  return `${days}d ago`
}

export function DataFabricPage() {
  const tenant = getTenantConfig()
  const [dataset, setDataset] = useState<DataFabricDataset>(() => getSeedDataFabricDataset())
  const [selectedAnalyticsLens, setSelectedAnalyticsLens] = useState<YangonTyreAnalyticsLens>('all')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextDataset = await loadDataFabricDataset()
      if (!cancelled) {
        setDataset(nextDataset)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const summary = dataset.summary
  const sourceRegistry = dataset.sourceRegistry
  const connectorSignals = dataset.connectorSignals
  const sourceEvents = dataset.sourceEvents
  const learningDatabase = dataset.learningDatabase
  const knowledgeGraphDomains = dataset.knowledgeGraphDomains
  const changeLineage = dataset.changeLineage
  const managerPrograms = dataset.managerPrograms
  const agentHandoffs = dataset.agentHandoffs
  const pipelineStages = dataset.pipelineStages
  const topicPipelines = dataset.topicPipelines
  const featureMarts = dataset.featureMarts
  const roleStories = dataset.roleStories
  const copilots = dataset.copilots
  const writebackLanes = dataset.writebackLanes
  const rankedSourceRegistry = useMemo(
    () =>
      [...sourceRegistry].sort((left, right) => {
        const rightTime = right.lastSignalAt ? new Date(right.lastSignalAt).getTime() : 0
        const leftTime = left.lastSignalAt ? new Date(left.lastSignalAt).getTime() : 0
        if (rightTime !== leftTime) {
          return rightTime - leftTime
        }
        return right.evidenceCount - left.evidenceCount
      }),
    [sourceRegistry],
  )
  const rankedConnectorSignals = useMemo(() => {
    const priority: Record<DataFabricHealthStatus, number> = {
      Degraded: 0,
      'Needs wiring': 1,
      Warning: 2,
      Healthy: 3,
    }
    return [...connectorSignals].sort((left, right) => {
      const priorityDelta = priority[left.status] - priority[right.status]
      if (priorityDelta !== 0) {
        return priorityDelta
      }
      return left.name.localeCompare(right.name)
    })
  }, [connectorSignals])
  const visibleSourceEvents = useMemo(() => sourceEvents.slice(0, 8), [sourceEvents])
  const visibleChangeLineage = useMemo(() => changeLineage.slice(0, 8), [changeLineage])
  const aggregateCounts = useMemo(
    () => ({
      sourcePackCount: topicPipelines.reduce((maxCount, pipeline) => Math.max(maxCount, pipeline.sourcePacks.length), 0),
      connectorTrackCount: topicPipelines.reduce((maxCount, pipeline) => Math.max(maxCount, pipeline.connectorTracks.length), 0),
      sourceRegistryCount: sourceRegistry.length,
      liveSourceCount: sourceRegistry.filter((item) => item.status === 'live').length,
      healthyConnectorCount: connectorSignals.filter((signal) => signal.status === 'Healthy').length,
      attentionConnectorCount: connectorSignals.filter((signal) => signal.status !== 'Healthy').length,
      sourceEventCount: visibleSourceEvents.length,
      graphDomainCount: knowledgeGraphDomains.length,
      managerProgramCount: managerPrograms.length,
      handoffCount: agentHandoffs.length,
    }),
    [agentHandoffs.length, connectorSignals, knowledgeGraphDomains.length, managerPrograms.length, sourceRegistry, topicPipelines, visibleSourceEvents.length],
  )
  const analyticsMart = useMemo(() => buildYangonTyreAnalyticsMart(dataset), [dataset])
  const analyticsView = useMemo(
    () => getYangonTyreAnalyticsMartView(analyticsMart, selectedAnalyticsLens),
    [analyticsMart, selectedAnalyticsLens],
  )

  if (tenant.key !== 'ytf-plant-a') {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Data fabric"
          title="Data Fabric is currently configured for the Yangon Tyre tenant."
          description="This app is the cross-functional pipeline layer that watches source systems, builds topic marts, and turns them into role-specific insight and writeback."
        />

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">What it is</p>
            <h2 className="mt-3 text-3xl font-bold text-white">A tenant data runtime between connectors and operating desks.</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
              It unifies Google Drive, Gmail, human entry, feature engineering, AI cleanup, role stories, and structured writeback into one product surface.
            </p>
          </article>
          <article className="sm-surface-deep p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Next control rooms</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/connectors">
                Open connectors
              </Link>
              <Link className="sm-button-secondary" to="/app/insights">
                Open insights
              </Link>
            </div>
          </article>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Data fabric"
        title="Use every Yangon Tyre data source as one AI-native operating pipeline."
        description="This is the tenant data runtime for ytf.supermega.dev: full-folder Google Drive intake, internal and supplier email capture, topic-aware extraction, feature marts, industrial-engineering analysis, role-based storytelling, and structured team writeback."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Registered sources</p>
          <p className="mt-3 text-3xl font-bold text-white">{aggregateCounts.sourceRegistryCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">
            {aggregateCounts.sourcePackCount}+ source packs are grouped into governed tenant source surfaces.
          </p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Live sources</p>
          <p className="mt-3 text-3xl font-bold text-white">{aggregateCounts.liveSourceCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">
            Sources with active evidence and a recent signal behind the Data Fabric runtime.
          </p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Healthy connectors</p>
          <p className="mt-3 text-3xl font-bold text-white">{aggregateCounts.healthyConnectorCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{aggregateCounts.connectorTrackCount}+ connector tracks exist; this shows the ones currently behaving like live lanes.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Need attention</p>
          <p className="mt-3 text-3xl font-bold text-white">{aggregateCounts.attentionConnectorCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Connector signals that are warning, degraded, or still unwired.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Source events</p>
          <p className="mt-3 text-3xl font-bold text-white">{aggregateCounts.sourceEventCount}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Recent evidence, human entry, and agent-runtime changes are visible as one event timeline.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Latest signal age</p>
          <p className="mt-3 text-3xl font-bold text-white">{formatSignalAge(dataset.updatedAt)}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">How recently the overall data runtime observed a source, writeback, or agent event.</p>
        </article>
      </section>

      <section className="sm-chip text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold">{dataset.source === 'live' ? 'Live workspace-backed data fabric connected.' : 'Using seeded data-fabric model.'}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              {dataset.source === 'live'
                ? `Updated: ${dataset.updatedAt ? new Date(dataset.updatedAt).toLocaleString() : 'Live snapshot'}.
              Leads ${summary.leadCount}, receiving rows ${summary.receivingCount}, holds ${summary.receivingHoldCount}, quality incidents ${summary.qualityIncidentCount},
              supplier risks ${summary.supplierRiskCount}, approvals ${summary.pendingApprovalCount}, open tasks ${summary.openTaskCount}, healthy connectors ${aggregateCounts.healthyConnectorCount}, recent source events ${aggregateCounts.sourceEventCount}.`
                : `Latest observed source signal: ${dataset.updatedAt ? new Date(dataset.updatedAt).toLocaleString() : 'Seed snapshot'}.
              Registered sources ${aggregateCounts.sourceRegistryCount}, healthy connectors ${aggregateCounts.healthyConnectorCount}, staged source events ${aggregateCounts.sourceEventCount},
              lineage events ${learningDatabase.lineageEventCount}, and extracted feature sets ${learningDatabase.featureSetCount}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/connectors">
              Connector control
            </Link>
            <Link className="sm-button-secondary" to="/app/insights">
              Operating intelligence
            </Link>
            <Link className="sm-button-secondary" to="/app/adoption-command">
              Adoption command
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <article className="sm-surface-deep p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Analytical warehouse</p>
              <h2 className="mt-3 text-3xl font-bold text-white">{analyticsMart.headline}</h2>
              <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{analyticsMart.databaseNote}</p>
            </div>
            <div className="sm-terminal w-full max-w-xl p-5">
              <p className="sm-kicker text-[var(--sm-accent)]">Selected lens</p>
              <p className="mt-3 text-lg font-semibold text-white">{analyticsView.selectedLens.label}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{analyticsView.selectedLens.description}</p>
              <p className="mt-4 text-sm text-[var(--sm-muted)]">
                Warehouse freshness: {dataset.updatedAt ? new Date(dataset.updatedAt).toLocaleString() : 'Seed snapshot'}.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {analyticsMart.lenses.map((lens) => (
              <button
                className={lens.id === selectedAnalyticsLens ? 'sm-button-primary' : 'sm-button-secondary'}
                key={lens.id}
                onClick={() => setSelectedAnalyticsLens(lens.id)}
                type="button"
              >
                {lens.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {analyticsView.kpis.map((metric) => (
              <article className="sm-proof-card" key={metric.id}>
                <p className="sm-kicker text-[var(--sm-accent)]">{metric.label}</p>
                <p className="mt-3 text-3xl font-bold text-white">{metric.value}</p>
                <p className="mt-2 text-sm text-white/80">{metric.trend}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{metric.detail}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.28em] text-[var(--sm-muted)]">{metric.formula}</p>
                <div className="mt-4 flex justify-end">
                  <Link className="sm-link" to={metric.route}>
                    Open metric lane
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>

        <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <article className="sm-surface p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Source behavior map</p>
                <h2 className="mt-3 text-3xl font-bold text-white">Each folder lane now has a normalized operating behavior.</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                  This is the first database-like cut of the Yangon Tyre source estate: structure, readiness, risk, and the exact metric families each lane should feed.
                </p>
              </div>
              <Link className="sm-link" to="/app/connectors">
                Open source registry
              </Link>
            </div>

            <div className="mt-6 grid gap-4">
              {analyticsView.sourceBehaviors.map((item) => (
                <article className="sm-proof-card" key={item.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{item.name}</p>
                      <p className="mt-2 text-sm text-white/80">{item.behavior}</p>
                    </div>
                    <Link className="sm-link" to={item.route}>
                      Open source
                    </Link>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Structure</p>
                      <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.structure}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Readiness</p>
                      <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.readiness}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">Risk: {item.risk}</p>
                  <p className="mt-3 text-sm leading-relaxed text-white/80">Next automation: {item.detail}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.connectedMetrics.map((metric) => (
                      <span className="sm-status-pill" key={`${item.id}-metric-${metric}`}>
                        {metric}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="sm-surface-deep p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Segment board</p>
                <h2 className="mt-3 text-3xl font-bold text-white">Filter the estate into concentration, quality, and evidence-weight signals.</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                  The same mart can now answer where volume, quality variation, and source attention are clustered.
                </p>
              </div>
              <Link className="sm-link" to="/app/insights">
                Open insight board
              </Link>
            </div>

            <div className="mt-6 grid gap-4">
              {analyticsView.segments.map((segment) => (
                <article className="sm-proof-card" key={segment.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="sm-kicker text-[var(--sm-accent)]">{segment.group}</p>
                      <p className="mt-2 text-xl font-bold text-white">{segment.name}</p>
                    </div>
                    <span className="sm-status-pill">{segment.value}</span>
                  </div>
                  {segment.share !== null ? (
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[var(--sm-accent)]"
                        style={{ width: `${Math.max(8, Math.min(100, segment.share))}%` }}
                      />
                    </div>
                  ) : null}
                  <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{segment.detail}</p>
                  <div className="mt-4 flex justify-end">
                    <Link className="sm-link" to={segment.route}>
                      Open segment
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
          <article className="sm-surface p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Feature engineering lab</p>
                <h2 className="mt-3 text-3xl font-bold text-white">Reusable metrics are now defined as named features, not one-off notes.</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                  Each feature includes a grain, formula, live or staged signal, and the teams that should consume it.
                </p>
              </div>
              <Link className="sm-link" to="/app/workforce">
                Open AI teams
              </Link>
            </div>

            <div className="mt-6 grid gap-4">
              {analyticsView.engineeredFeatures.map((feature) => (
                <article className="sm-proof-card" key={feature.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{feature.name}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">Grain: {feature.grain}</p>
                    </div>
                    <span className={`sm-status-pill ${toneForFeatureStatus(feature.status)}`}>{feature.status}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent)]">Formula</p>
                      <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{feature.formula}</p>
                    </div>
                    <div className="sm-chip text-white">
                      <p className="sm-kicker text-[var(--sm-accent-alt)]">Signal</p>
                      <p className="mt-3 text-xl font-bold text-white">{feature.signal}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-white/80">{feature.whyItMatters}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {feature.consumers.map((consumer) => (
                      <span className="sm-status-pill" key={`${feature.id}-consumer-${consumer}`}>
                        {consumer}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Link className="sm-link" to={feature.route}>
                      Open feature lane
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="sm-surface-deep p-6">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Data science watchlists</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Quality trace and product watchlists are ready for real modeling.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                These are the first normalized slices for trend monitoring, anomaly flags, and feature-store promotion.
              </p>
            </div>

            <div className="mt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">Monthly quality trace</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Output and B+R now read as one compact monitor instead of buried workbook rows.</p>
                </div>
                <Link className="sm-link" to="/app/dqms">
                  Open quality desk
                </Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {analyticsView.qualityTrace.length ? (
                  analyticsView.qualityTrace.slice(0, 6).map((row) => (
                    <article className="sm-chip text-white" key={row.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{row.month}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{row.output} units</p>
                        </div>
                        <span className="sm-status-pill">{row.defectRate}</span>
                      </div>
                      <p className="mt-3 text-sm text-[var(--sm-muted)]">{row.trend}</p>
                    </article>
                  ))
                ) : (
                  <article className="sm-chip text-white md:col-span-2">
                    <p className="font-semibold text-white">This lens is not using the monthly quality trace.</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
                      Switch to the operations or quality lens to inspect output and B+R behavior from the current profile baseline.
                    </p>
                  </article>
                )}
              </div>
            </div>

            <div className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Focus product watchlist</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Spec-versus-actual weight behavior and defect rate now sit beside unit volume for fast review.</p>
                </div>
                <Link className="sm-link" to="/app/revenue">
                  Open commercial desk
                </Link>
              </div>
              <div className="mt-4 grid gap-4">
                {analyticsView.productWatchlist.length ? (
                  analyticsView.productWatchlist.slice(0, 6).map((product) => (
                    <article className="sm-proof-card" key={product.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{product.name}</p>
                          <p className="mt-2 text-sm text-[var(--sm-muted)]">{product.units} units</p>
                        </div>
                        <span className="sm-status-pill">{product.defectRate}</span>
                      </div>
                      <p className="mt-4 text-sm text-white/80">Weight delta: {product.weightDelta}</p>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{product.note}</p>
                    </article>
                  ))
                ) : (
                  <article className="sm-proof-card">
                    <p className="font-semibold text-white">This lens is not currently showing product-level watch rows.</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">
                      Switch to the commercial or quality lens to inspect spec-versus-actual weight behavior and defect-rate watchlists.
                    </p>
                  </article>
                )}
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">How to use the database</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Operate from the mart first, then drop into source evidence only where needed.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                The point of this database is not to admire folders. It is to move from signal to decision to writeback without rebuilding the same analysis every week.
              </p>
            </div>
            <span className="sm-status-pill">{dataset.source === 'live' ? 'live + seed' : 'seed warehouse slice'}</span>
          </div>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_RUNTIME_GUIDE_STEPS.map((step, index) => (
              <article className="sm-proof-card" key={step.id}>
                <p className="text-sm font-semibold text-white">Step {index + 1}</p>
                <p className="mt-2 text-lg font-bold text-white">{step.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{step.detail}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Database layers</p>
              <h2 className="mt-3 text-3xl font-bold text-white">This database should become a six-layer operating spine.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                Start local and embedded, but keep the layer boundaries clear so the same architecture can scale into a real warehouse and graph-backed agent runtime.
              </p>
            </div>
            <Link className="sm-link" to="/app/knowledge">
              Open knowledge lane
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_DATABASE_LAYERS.map((layer) => (
              <article className="sm-proof-card" key={layer.id}>
                <p className="font-semibold text-white">{layer.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-white/80">{layer.purpose}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Grain</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{layer.grain}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Storage</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{layer.storage}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {layer.outputs.map((output) => (
                    <span className="sm-status-pill" key={`${layer.id}-output-${output}`}>
                      {output}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Micro and macro</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Use two decision scales, not one dashboard.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                Micro analysis finds the exact broken unit. Macro analysis tells leadership where the business system is drifting. The same database should serve both without mixing them up.
              </p>
            </div>
            <Link className="sm-link" to="/app/director">
              Open director desk
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_DECISION_LENSES.map((lens) => (
              <article className="sm-proof-card" key={lens.id}>
                <p className="sm-kicker text-[var(--sm-accent)]">{lens.name}</p>
                <p className="mt-2 text-lg font-bold text-white">{lens.focus}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Watch</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {lens.watches.map((item) => (
                        <p key={`${lens.id}-watch-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Output</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {lens.outputs.map((item) => (
                        <p key={`${lens.id}-output-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Recommended stack</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Use different tools for extraction, marts, semantics, quality, graph, and AI discipline.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                The right stack is staged. Do not overbuild the lakehouse on day one, but do choose tools that make the upgrade path clean.
              </p>
            </div>
            <Link className="sm-link" to="/app/cloud-ops">
              Open cloud ops
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {YANGON_TYRE_TOOL_RECOMMENDATIONS.map((tool) => (
              <article className="sm-proof-card" key={tool.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{tool.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{tool.category}</p>
                  </div>
                  <span className={`sm-status-pill ${toneForToolPhase(tool.phase)}`}>{tool.phase}</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/80">{tool.why}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tool.useFor.map((item) => (
                    <span className="sm-status-pill" key={`${tool.id}-use-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <a className="sm-link" href={tool.url} rel="noreferrer" target="_blank">
                    Open docs
                  </a>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Live source operations</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Source Registry</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                Each source surface now shows evidence volume, ownership, and where it should feed the platform.
              </p>
            </div>
            <Link className="sm-link" to="/app/connectors">
              Open connector control
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {rankedSourceRegistry.map((item) => (
              <article className="sm-proof-card" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.name}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.coverage}</p>
                  </div>
                  <span className={`sm-status-pill ${toneForStatus(item.status)}`}>{item.status}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Evidence</p>
                    <p className="mt-3 text-sm text-white/80">{item.evidenceCount} promoted rows</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Source type: {item.sourceType}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Last signal: {formatSignalAt(item.lastSignalAt)}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Consumers</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {item.consumers.map((consumer) => (
                        <p key={`${item.id}-consumer-${consumer}`}>{consumer}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                  <p className="max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">Next automation: {item.nextAutomation}</p>
                  <Link className="sm-link" to={item.route}>
                    Open surface
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Live source operations</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Connector Health Signals</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                Connector lanes now show freshness, first jobs, and the exact wiring gaps still holding back autonomy.
              </p>
            </div>
            <Link className="sm-link" to="/app/adoption-command">
              Open adoption command
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {rankedConnectorSignals.map((signal) => (
              <article className="sm-proof-card" key={signal.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{signal.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{signal.system}</p>
                  </div>
                  <span className={`sm-status-pill ${toneForHealthStatus(signal.status)}`}>{signal.status}</span>
                </div>
                <p className="mt-4 text-sm text-white/80">{signal.freshness}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{signal.backlog}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">First jobs</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {signal.firstJobs.map((job) => (
                        <p key={`${signal.id}-job-${job}`}>{job}</p>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Surfaces</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {signal.surfaces.map((surface) => (
                        <p key={`${signal.id}-surface-${surface}`}>{surface}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm text-[var(--sm-muted)]">
                  {signal.risks.map((risk) => (
                    <p key={`${signal.id}-risk-${risk}`}>{risk}</p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                  <p className="max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">Next automation: {signal.nextAutomation}</p>
                  <Link className="sm-link" to={signal.route}>
                    Open surface
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Recent source events</p>
            <h2 className="mt-3 text-3xl font-bold text-white">The runtime now shows which evidence, human entry, and agent jobs moved most recently.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/connectors">
              Connector control
            </Link>
            <Link className="sm-button-secondary" to="/app/adoption-command">
              Adoption command
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {visibleSourceEvents.length ? (
            visibleSourceEvents.map((event) => (
              <article className="sm-proof-card" key={event.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">{event.source}</p>
                    <p className="mt-2 text-xl font-bold text-white">{event.title}</p>
                  </div>
                  <span className="sm-status-pill">{event.kind}</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{event.detail}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--sm-muted)]">
                  <span>Owner: {event.owner}</span>
                  <span>{formatSignalAt(event.signalAt)}</span>
                  <Link className="sm-link" to={event.route}>
                    Open surface
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <article className="sm-proof-card xl:col-span-2">
              <p className="font-semibold text-white">No live source events have been recorded yet.</p>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                The source registry and connector health model are ready. As more Drive, Gmail, ERP, and writeback evidence lands, the timeline here will become the live evidence strip
                for Yangon Tyre managers.
              </p>
            </article>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Learning database</p>
              <h2 className="mt-3 text-3xl font-bold text-white">The data runtime now scores trust, graph shape, and reusable learning signals.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                This is the governed memory layer for Yangon Tyre managers and AI teams: canonical records, graph links, lineage events, feature coverage, and a rolling trust score.
              </p>
            </div>
            <span className={`sm-status-pill ${toneForHealthStatus(learningDatabase.status)}`}>{learningDatabase.status}</span>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Canonical records</p>
              <p className="mt-3 text-3xl font-bold text-white">{learningDatabase.canonicalRecordCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Promoted operational and management records available for reuse.</p>
            </article>
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Graph nodes</p>
              <p className="mt-3 text-3xl font-bold text-white">{learningDatabase.graphNodeCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{learningDatabase.graphEdgeCount} active relationship edges modeled across the tenant graph.</p>
            </article>
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Lineage events</p>
              <p className="mt-3 text-3xl font-bold text-white">{learningDatabase.lineageEventCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Recent source and writeback changes flowing into the learning spine.</p>
            </article>
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Feature sets</p>
              <p className="mt-3 text-3xl font-bold text-white">{learningDatabase.featureSetCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Reusable marts and signal packs feeding manager stories and AI teams.</p>
            </article>
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Trust score</p>
              <p className="mt-3 text-3xl font-bold text-white">{learningDatabase.trustScore}%</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Completeness and freshness of the current learning database.</p>
            </article>
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Last learned</p>
              <p className="mt-3 text-xl font-bold text-white">{formatSignalAge(learningDatabase.lastLearnedAt)}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{formatSignalAt(learningDatabase.lastLearnedAt)}</p>
            </article>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Qualitative methods</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {learningDatabase.qualitativeMethods.map((item) => (
                  <span className="sm-status-pill" key={`qual-${item}`}>
                    {item}
                  </span>
                ))}
              </div>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Quantitative methods</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {learningDatabase.quantitativeMethods.map((item) => (
                  <span className="sm-status-pill" key={`quant-${item}`}>
                    {item}
                  </span>
                ))}
              </div>
            </article>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">Next automation: {learningDatabase.nextAutomation}</p>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Knowledge graph</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Managers and AI teams now get domain graphs, not just flat rows.</h2>
            </div>
            <span className="sm-status-pill">{aggregateCounts.graphDomainCount} graph domains</span>
          </div>
          <div className="mt-6 grid gap-4">
            {knowledgeGraphDomains.map((domain) => (
              <article className="sm-proof-card" key={domain.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{domain.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Owner: {domain.owner}</p>
                  </div>
                  <span className={`sm-status-pill ${toneForStatus(domain.status)}`}>{domain.status}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Shape</p>
                    <p className="mt-3 text-sm text-white/80">{domain.nodeCount} nodes</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{domain.edgeCount} edges</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Latest signal: {formatSignalAt(domain.lastSignalAt)}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Entity types</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {domain.entityTypes.map((item) => (
                        <span className="sm-status-pill" key={`${domain.id}-entity-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Relation types</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {domain.relationTypes.map((item) => (
                        <p key={`${domain.id}-relation-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Questions it answers</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {domain.questions.map((item) => (
                        <p key={`${domain.id}-question-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Link className="sm-link" to={domain.route}>
                    Open domain desk
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Change lineage</p>
              <h2 className="mt-3 text-3xl font-bold text-white">The platform now tracks what changed, when it changed, and who moved it.</h2>
            </div>
            <span className="sm-status-pill">{visibleChangeLineage.length} recent lineage events</span>
          </div>
          <div className="mt-6 grid gap-4">
            {visibleChangeLineage.length ? (
              visibleChangeLineage.map((event) => (
                <article className="sm-proof-card" key={event.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="sm-kicker text-[var(--sm-accent)]">{event.source}</p>
                      <p className="mt-2 text-xl font-bold text-white">{event.assetName}</p>
                    </div>
                    <span className="sm-status-pill">{event.changeType}</span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-white/80">{event.impact}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm text-[var(--sm-muted)]">
                    <p>Changed by: {event.changedBy}</p>
                    <p>Changed at: {formatSignalAt(event.changedAt)}</p>
                    <Link className="sm-link" to={event.route}>
                      Open surface
                    </Link>
                  </div>
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">Next step: {event.nextStep}</p>
                </article>
              ))
            ) : (
              <article className="sm-proof-card">
                <p className="font-semibold text-white">No direct lineage events have been recorded yet.</p>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                  As Drive, Gmail, ERP, and writeback deltas move into the append-only connector spine, this becomes the trusted change strip for managers and AI handoffs.
                </p>
              </article>
            )}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Manager programs</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Each department manager now has a program built from live data, methods, and AI support.</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="sm-status-pill">{aggregateCounts.managerProgramCount} programs</span>
              <Link className="sm-link" to="/app/workforce">
                Workforce command
              </Link>
            </div>
          </div>
          <div className="mt-6 grid gap-4">
            {managerPrograms.map((program) => (
              <article className="sm-proof-card" key={program.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">{program.role}</p>
                    <h3 className="mt-2 text-2xl font-bold text-white">{program.name}</h3>
                  </div>
                  <Link className="sm-link" to={program.route}>
                    Open program
                  </Link>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/80">{program.mission}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Watches</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {program.watches.map((item) => (
                        <p key={`${program.id}-watch-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Methods</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {program.methods.map((item) => (
                        <span className="sm-status-pill" key={`${program.id}-method-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Metrics</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {program.metrics.map((item) => (
                        <p key={`${program.id}-metric-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">AI teams</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {program.aiTeams.map((item) => (
                        <p key={`${program.id}-team-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-[var(--sm-muted)]">Writeback lane: {program.writeback}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Next handoff: {program.nextHandoff}</p>
              </article>
            ))}
          </div>

          <div className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">AI handoff queue</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">
                  Qualitative and quantitative work should move to the next bounded AI team automatically, not stall inside one desk.
                </p>
              </div>
              <span className="sm-status-pill">{aggregateCounts.handoffCount} handoffs</span>
            </div>
            <div className="mt-4 grid gap-4">
              {agentHandoffs.map((handoff) => (
                <article className="sm-proof-card" key={handoff.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{handoff.topic}</p>
                      <p className="mt-2 text-sm text-[var(--sm-muted)]">
                        {handoff.fromTeam} to {handoff.toTeam}
                      </p>
                    </div>
                    <span className={`sm-status-pill ${toneForHandoffStatus(handoff.status)}`}>{handoff.status}</span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-white/80">{handoff.reason}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {handoff.payload.map((item) => (
                      <span className="sm-status-pill" key={`${handoff.id}-payload-${item}`}>
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--sm-muted)]">
                    <span>{formatSignalAt(handoff.signalAt)}</span>
                    <Link className="sm-link" to={handoff.route}>
                      Open source desk
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Platform goal</p>
          <h2 className="mt-3 text-2xl font-bold text-white">The source mesh should feed the whole platform.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_DATA_FABRIC_DIALECTIC.thesis}</p>
        </article>
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Signal gap</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Files and messages still hide the real operating signal.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_DATA_FABRIC_DIALECTIC.antithesis}</p>
        </article>
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Data response</p>
          <h2 className="mt-3 text-2xl font-bold text-white">One data runtime powers control, insight, and writeback.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">{YANGON_TYRE_DATA_FABRIC_DIALECTIC.synthesis}</p>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Pipeline architecture</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Google Drive and email are now modeled as a continuous intelligence pipeline, not passive storage.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/connectors">
              Connector control
            </Link>
            <Link className="sm-button-secondary" to="/app/insights">
              Operating intelligence
            </Link>
            <Link className="sm-button-secondary" to="/app/workforce">
              Workforce command
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {pipelineStages.map((stage) => (
            <article className="sm-proof-card" key={stage.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{stage.name}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{stage.purpose}</p>
                </div>
                <span className={`sm-status-pill ${toneForStatus(stage.status)}`}>{stage.status}</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Sources</p>
                  <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                    {stage.sources.map((item) => (
                      <p key={`${stage.id}-source-${item}`}>{item}</p>
                    ))}
                  </div>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Outputs</p>
                  <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                    {stage.outputs.map((item) => (
                      <p key={`${stage.id}-output-${item}`}>{item}</p>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-white/80">AI crews: {stage.agents.join(', ')}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Review gate: {stage.reviewGate}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Whole folder and topic pipelines</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The full Google estate gets indexed once, then split into the right topic lenses.</h2>
          <div className="mt-6 grid gap-4">
            {topicPipelines.map((pipeline) => (
              <article className="sm-proof-card" key={pipeline.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{pipeline.name}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{pipeline.scope}</p>
                  </div>
                  <span className={`sm-status-pill ${toneForStatus(pipeline.status)}`}>{pipeline.status}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Source packs</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {pipeline.sourcePacks.map((item) => (
                        <p key={`${pipeline.id}-pack-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Connector tracks</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {pipeline.connectorTracks.map((item) => (
                        <p key={`${pipeline.id}-connector-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Transforms</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {pipeline.transforms.map((item) => (
                        <p key={`${pipeline.id}-transform-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Outputs</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {pipeline.outputs.map((item) => (
                        <p key={`${pipeline.id}-output-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-white/80">Role stories: {pipeline.roleStories.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Operating anchors</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Use the data fabric to improve quality, throughput, and management timing at the same time.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">2024 output</p>
              <p className="mt-3 text-3xl font-bold text-white">{YANGON_TYRE_DATA_PROFILE.annualBiasOutput2024.toLocaleString()}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Bias tyres from the current workbook baseline.</p>
            </article>
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Average B+R</p>
              <p className="mt-3 text-3xl font-bold text-white">{YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024}%</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Quality-loss features should help management move this down faster.</p>
            </article>
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Line groups</p>
              <p className="mt-3 text-3xl font-bold text-white">{YANGON_TYRE_DATA_PROFILE.productionLines.length}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Industrial-engineering cuts are designed around the actual Plant A stage map.</p>
            </article>
            <article className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Top defects</p>
              <p className="mt-3 text-lg font-bold text-white">{YANGON_TYRE_DATA_PROFILE.topDefects.slice(0, 3).join(' / ')}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Defect clustering and closeout evidence should be one reusable pipeline, not a manual weekly rebuild.</p>
            </article>
          </div>

          <div className="mt-6 grid gap-4">
            {featureMarts.map((mart) => (
              <article className="sm-proof-card" key={mart.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{mart.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Grain: {mart.grain}</p>
                  </div>
                  <span className={`sm-status-pill ${toneForStatus(mart.status)}`}>{mart.status}</span>
                </div>
                <p className="mt-3 text-sm text-white/80">Cadence: {mart.cadence}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Consumers: {mart.consumers.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">AI pipeline crews</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Different agent pods clean, extract, model, and narrate different parts of the tenant data estate.</h2>
          <div className="mt-6 grid gap-4">
            {copilots.map((pod) => (
              <article className="sm-proof-card" key={pod.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{pod.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Lead role: {pod.leadRole}</p>
                  </div>
                  <span className="sm-status-pill">{pod.outputs.length} outputs</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/80">{pod.mission}</p>
                <p className="mt-4 text-sm text-[var(--sm-muted)]">Cadence: {pod.cadence.join(', ')}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Write policy: {pod.writePolicy}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Role stories</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The same data should tell a different story depending on who is looking at it.</h2>
          <div className="mt-6 grid gap-4">
            {roleStories.map((story) => (
              <article className="sm-proof-card" key={story.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="sm-kicker text-[var(--sm-accent)]">{story.role}</p>
                    <h3 className="mt-2 text-2xl font-bold text-white">{story.name}</h3>
                  </div>
                  <Link className="sm-link" to={story.route}>
                    Open desk
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Inputs</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {story.inputs.map((item) => (
                        <p key={`${story.id}-input-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Questions</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                      {story.questions.map((item) => (
                        <p key={`${story.id}-question-${item}`}>{item}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {story.outputs.map((item) => (
                    <span className="sm-status-pill" key={`${story.id}-output-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Team writeback and data entry</p>
            <h2 className="mt-3 text-3xl font-bold text-white">The data pipeline stays alive only if the team writes back through the desks, not outside them.</h2>
          </div>
          <span className="sm-status-pill">{writebackLanes.length} structured writeback lanes</span>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {writebackLanes.map((lane) => (
            <article className="sm-proof-card" key={lane.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{lane.name}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.users.join(' / ')}</p>
                </div>
                <Link className="sm-link" to={lane.route}>
                  Open entry lane
                </Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Captures</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{lane.captures.join(' / ')}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Quality rules</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{lane.qualityRules.join(' / ')}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Feeds marts</p>
                  <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                    {lane.downstreamMarts.map((item) => (
                      <p key={`${lane.id}-mart-${item}`}>{item}</p>
                    ))}
                  </div>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Feeds stories</p>
                  <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                    {lane.downstreamStories.map((item) => (
                      <p key={`${lane.id}-story-${item}`}>{item}</p>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
