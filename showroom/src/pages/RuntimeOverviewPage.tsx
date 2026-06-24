import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { SUPERMEGA_AUTONOMOUS_CLOUD_MODEL } from '../lib/autonomousCloudOperatingModel'
import { getSeedRuntimeControlDataset, loadRuntimeControlDataset, type RuntimeControlDataset } from '../lib/runtimeControlApi'
import { type RuntimeHealthStatus } from '../lib/runtimeControlModel'
import { YANGON_TYRE_DATA_PROFILE } from '../lib/yangonTyreDataProfile'
import { YANGON_TYRE_CONNECTOR_EXPANSION, YANGON_TYRE_SOURCE_PACKS } from '../lib/yangonTyreDriveModel'

type AttentionItem = {
  id: string
  area: 'Connector' | 'Knowledge' | 'Autonomy' | 'Policy'
  tenant: 'core' | 'yangon-tyre' | 'shared'
  status: RuntimeHealthStatus
  name: string
  owner: string
  detail: string
  nextMove: string
  route: string
}

const statusPriority: Record<RuntimeHealthStatus, number> = {
  Degraded: 0,
  Warning: 1,
  'Needs wiring': 2,
  Healthy: 3,
}

const statusOrder: RuntimeHealthStatus[] = ['Healthy', 'Warning', 'Degraded', 'Needs wiring']

const tenantLabels = {
  core: 'Core platform',
  'yangon-tyre': 'Yangon Tyre',
  shared: 'Shared runtime',
} as const

function rolloutTone(value: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'live') {
    return 'text-emerald-300'
  }
  if (normalized === 'mapped' || normalized === 'queued') {
    return 'text-amber-300'
  }
  return 'text-white/70'
}

export function RuntimeOverviewPage() {
  const [dataset, setDataset] = useState<RuntimeControlDataset>(getSeedRuntimeControlDataset())
  const autonomyModel = SUPERMEGA_AUTONOMOUS_CLOUD_MODEL

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextDataset = await loadRuntimeControlDataset()
      if (!cancelled) {
        setDataset(nextDataset)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const runtimeItems: AttentionItem[] = [
    ...dataset.connectors.map((feed) => ({
      id: feed.id,
      area: 'Connector' as const,
      tenant: feed.tenant,
      status: feed.status,
      name: feed.name,
      owner: feed.owner,
      detail: feed.backlog,
      nextMove: feed.nextAutomation,
      route: '/app/connectors',
    })),
    ...dataset.knowledgeCollections.map((collection) => ({
      id: collection.id,
      area: 'Knowledge' as const,
      tenant: collection.tenant,
      status: collection.status,
      name: collection.name,
      owner: collection.owner,
      detail: collection.purpose,
      nextMove: collection.nextMove,
      route: '/app/knowledge',
    })),
    ...dataset.autonomyLoops.map((loop) => ({
      id: loop.id,
      area: 'Autonomy' as const,
      tenant: loop.tenant,
      status: loop.status,
      name: loop.name,
      owner: loop.owner,
      detail: loop.backlog,
      nextMove: loop.nextMove,
      route: '/app/teams',
    })),
    ...dataset.policyGuardrails.map((guardrail) => ({
      id: guardrail.id,
      area: 'Policy' as const,
      tenant: 'shared' as const,
      status: guardrail.status,
      name: guardrail.name,
      owner: guardrail.approvalGate,
      detail: guardrail.failureMode,
      nextMove: guardrail.automation,
      route: '/app/policies',
    })),
  ]

  const attentionItems = runtimeItems
    .filter((item) => item.status !== 'Healthy')
    .sort((left, right) => statusPriority[left.status] - statusPriority[right.status] || left.area.localeCompare(right.area))
    .slice(0, 8)

  const statusTotals = statusOrder.map((status) => ({
    status,
    count: runtimeItems.filter((item) => item.status === status).length,
  }))

  const tenantSummaries = (['core', 'yangon-tyre'] as const).map((tenant) => {
    const connectorCount = dataset.connectors.filter((item) => item.tenant === tenant).length
    const knowledgeCount = dataset.knowledgeCollections.filter((item) => item.tenant === tenant).length
    const autonomyCount = dataset.autonomyLoops.filter((item) => item.tenant === tenant).length
    const activeIssues = runtimeItems.filter((item) => item.tenant === tenant && item.status !== 'Healthy').length
    return {
      tenant,
      connectorCount,
      knowledgeCount,
      autonomyCount,
      activeIssues,
    }
  })
  const liveSourceCount = YANGON_TYRE_SOURCE_PACKS.filter((item) => item.status === 'live').length
  const pendingSourceCount = YANGON_TYRE_SOURCE_PACKS.filter((item) => item.status !== 'live').length
  const queuedConnectorCount = YANGON_TYRE_CONNECTOR_EXPANSION.filter((item) => item.status === 'queued').length

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Runtime"
        title="One dashboard for feeds, memory, autonomy, and guardrails."
        description="Track whether the AI-native runtime is healthy enough to trust. This desk brings connector freshness, canon quality, autonomous loops, and policy posture into one control surface."
      />

      {dataset.source === 'live' &&
      dataset.tenantState.status !== 'matched' &&
      dataset.tenantState.status !== 'parallel' ? (
        <section className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Tenant state</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Runtime alignment needs attention before this workspace can trust live control data.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">{dataset.tenantState.detail}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
            <span className="sm-chip text-white">Expected: {dataset.tenantState.expectedTenantKey || 'unknown'}</span>
            <span className="sm-chip text-white">Live state: {dataset.tenantState.currentStateTenantKey || 'not reported'}</span>
            <span className="sm-chip text-white">Persisted manifest: {dataset.tenantState.persistedManifestTenantKey || 'not reported'}</span>
            <span className="sm-chip text-white">Snapshot: {dataset.tenantState.snapshotTenantKey || 'not reported'}</span>
          </div>
        </section>
      ) : null}

      <section className="sm-site-panel">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="sm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">Big picture</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">{dataset.bigPicture.thesis}</h2>
            <div className="mt-6 space-y-3">
              {dataset.bigPicture.currentTruth.map((item) => (
                <div className="sm-site-point" key={item}>
                  <span className="sm-site-point-dot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-terminal p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Next builds</p>
            <div className="mt-6 space-y-3">
              {dataset.bigPicture.nextBuilds.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/data-fabric">
                Open Data Fabric
              </Link>
              <Link className="sm-button-secondary" to="/app/cloud">
                Open Cloud Ops
              </Link>
              <Link className="sm-button-secondary" to="/app/product-ops">
                Open Product Ops
              </Link>
              <Link className="sm-button-secondary" to="/app/platform-admin">
                Open Platform Admin
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Connector feeds</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.connectors.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Mail, files, exports, and human-entry inputs.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Knowledge canon</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.knowledgeCollections.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Collections promoted into shared records.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomy loops</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.autonomyLoops.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Agent loops pushing prep work through guarded queues.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Guardrails</p>
          <p className="mt-3 text-3xl font-bold text-white">{dataset.policyGuardrails.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Connector, knowledge, security, and release controls.</p>
        </article>
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Needs attention</p>
          <p className="mt-3 text-3xl font-bold text-white">{attentionItems.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">The most important runtime issues to resolve next.</p>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Runtime posture</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Use one runtime desk before you promote more autonomy.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
              The runtime view should be the gate between platform ambition and live operational trust. If feeds lag, canon drifts, or policies are weak,
              agent coverage should not expand blindly.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
            <span className="sm-chip text-white">Source: {dataset.source === 'live' ? 'Live API' : 'Seed runtime model'}</span>
            <span className="sm-chip text-white">Updated: {dataset.updatedAt ? new Date(dataset.updatedAt).toLocaleString() : 'Seed snapshot'}</span>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {statusTotals.map((summary) => (
            <article className="sm-chip text-white" key={summary.status}>
              <p className="font-semibold">{summary.status}</p>
              <p className="mt-2 text-2xl font-bold">{summary.count}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Runtime items in this posture.</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Cloud autonomy contract</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Runtime trust depends on the right model lane for the right kind of work.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">{autonomyModel.summary}</p>
            </div>
            <span className="sm-status-pill">{autonomyModel.modelLanes.length} model lanes</span>
          </div>
          <p className="mt-5 text-sm text-white/80">{autonomyModel.northStar}</p>
          <div className="mt-6 grid gap-4">
            {autonomyModel.modelLanes.map((lane) => (
              <article className="sm-proof-card" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{lane.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.mission}</p>
                  </div>
                  <Link className="sm-link" to={lane.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-3 text-sm text-white/80">Placement: {lane.placement}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Workloads</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lane.workloads.map((item) => (
                        <span className="sm-status-pill" key={`${lane.id}-workload-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Guardrails</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lane.guardrails.map((item) => (
                        <span className="sm-status-pill" key={`${lane.id}-guardrail-${item}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Action lanes</p>
              <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Queues, workflows, and crews should run in different lanes on purpose.</h2>
            </div>
            <span className="sm-status-pill">{autonomyModel.actionLanes.length} action lanes</span>
          </div>
          <div className="mt-6 grid gap-4">
            {autonomyModel.actionLanes.map((lane) => (
              <article className="sm-proof-card" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{lane.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{lane.mission}</p>
                  </div>
                  <Link className="sm-link" to={lane.route}>
                    Open
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent)]">Execution plane</p>
                    <p className="mt-2 text-sm">{lane.executionPlane}</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="sm-kicker text-[var(--sm-accent-alt)]">Queue class</p>
                    <p className="mt-2 text-sm">{lane.queueClass}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {lane.defaultCrews.map((item) => (
                    <span className="sm-status-pill" key={`${lane.id}-crew-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm text-white/80">Triggers: {lane.triggers.join(', ')}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Outputs: {lane.outputs.join(', ')}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            {autonomyModel.antifragilityRules.map((rule) => (
              <article className="sm-chip text-white" key={rule.id}>
                <p className="font-semibold">{rule.title}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{rule.detail}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Yangon Tyre tenant spotlight</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Runtime health only matters if it protects the real factory and management loop.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Operating goal</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                The runtime should keep plant, quality, commercial, and leadership decisions attached to one evidence-bearing operating memory.
              </p>
            </article>
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Current risk</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                Trust breaks when {pendingSourceCount} source packs are still waiting for promotion, {queuedConnectorCount} connector tracks remain queued, and live
                runtime issues still separate signal from action.
              </p>
            </article>
            <article className="sm-proof-card">
              <p className="font-semibold text-white">Control response</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">
                The runtime desk becomes a leadership gate: it shows source readiness, connector posture, operational risk, and whether the tenant is safe to deepen
                autonomy.
              </p>
            </article>
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Factory and leadership signals</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Plant risk should be visible with the same clarity as runtime risk.</h2>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">2024 output</p>
              <p className="mt-2 text-2xl font-bold">{YANGON_TYRE_DATA_PROFILE.annualBiasOutput2024.toLocaleString()}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Bias tyres used as the live operations baseline.</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">B+R rate</p>
              <p className="mt-2 text-2xl font-bold">{YANGON_TYRE_DATA_PROFILE.annualBPlusRRate2024}%</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Best month {YANGON_TYRE_DATA_PROFILE.bestMonth2024.month}; worst month {YANGON_TYRE_DATA_PROFILE.worstMonth2024.month}.</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Live source packs</p>
              <p className="mt-2 text-2xl font-bold">{liveSourceCount}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{pendingSourceCount} still mapped or queued.</p>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Top defects</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{YANGON_TYRE_DATA_PROFILE.topDefects.slice(0, 4).join(', ')}</p>
            </article>
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Immediate attention</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">These issues should shape the next sprint.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/platform-admin">
              Open Platform Admin
            </Link>
            <Link className="sm-button-secondary" to="/app/factory">
              Open Build
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {attentionItems.map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{item.area}</span>
                <span className="sm-status-pill">{item.status}</span>
              </div>
              <strong>{item.name}</strong>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{tenantLabels[item.tenant]}</p>
              <p className="mt-2 text-sm text-white/80">Owner: {item.owner}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
              <p className="mt-2 text-sm text-white/80">Next move: {item.nextMove}</p>
              <Link className="sm-link mt-3" to={item.route}>
                Open {item.area.toLowerCase()} view
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Source readiness</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">The runtime should know which Yangon Tyre evidence packs are already promotable.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {YANGON_TYRE_SOURCE_PACKS.map((pack) => (
              <article className="sm-proof-card" key={pack.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{pack.name}</p>
                  <span className={`sm-status-pill ${rolloutTone(pack.status)}`}>{pack.status}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{pack.evidence}</p>
                <p className="mt-2 text-sm text-white/80">Feeds: {pack.feedsApps.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Channel expansion risk</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Every new channel changes the runtime burden and the operating promise.</h2>
          </div>
          <div className="mt-6 grid gap-3">
            {YANGON_TYRE_CONNECTOR_EXPANSION.map((item) => (
              <article className="sm-chip text-white" key={item.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{item.name}</p>
                  <span className={`sm-status-pill ${rolloutTone(item.status)}`}>{item.status}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.purpose}</p>
                <p className="mt-2 text-sm text-white/80">Apps: {item.apps.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Tenant posture</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each tenant should show runtime coverage, not just enabled modules.</h2>
          <div className="mt-6 grid gap-4">
            {tenantSummaries.map((summary) => (
              <article className="sm-proof-card" key={summary.tenant}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{tenantLabels[summary.tenant]}</p>
                  <span className="sm-status-pill">{summary.activeIssues} active issues</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="sm-chip text-white">
                    <p className="font-semibold">{summary.connectorCount}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Connector feeds</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="font-semibold">{summary.knowledgeCount}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Knowledge collections</p>
                  </div>
                  <div className="sm-chip text-white">
                    <p className="font-semibold">{summary.autonomyCount}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">Autonomy loops</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Autonomy coverage</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Agent loops should be visible contracts with backlog and guardrails.</h2>
          <div className="mt-6 grid gap-3">
            {dataset.autonomyLoops.map((loop) => (
              <article className="sm-chip text-white" key={loop.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{loop.name}</p>
                  <span className="sm-status-pill">{loop.status}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">
                  {tenantLabels[loop.tenant]} / {loop.surface}
                </p>
                <p className="mt-2 text-sm text-white/80">Owner: {loop.owner}</p>
                <p className="mt-2 text-sm text-white/80">Cadence: {loop.cadence}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Automation: {loop.automation}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Backlog: {loop.backlog}</p>
                <p className="mt-2 text-sm text-white/80">Gate: {loop.approvalGate}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Control surfaces</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Drill into the detailed control views only after the summary points to the risk.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            This should be the front door for platform operators. Use the runtime desk to choose where to intervene next.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
          {[
            { name: 'Platform Admin', detail: 'Tenant model, roles, modules, and rollout posture.', to: '/app/platform-admin' },
            { name: 'Product Ops', detail: 'Release trains, research cells, and module graduation discipline.', to: '/app/product-ops' },
            { name: 'Connectors', detail: 'Freshness, backlog, source maps, and writeback posture.', to: '/app/connectors' },
            { name: 'Knowledge', detail: 'Canon quality, relation coverage, and promotion queue.', to: '/app/knowledge' },
            { name: 'Security', detail: 'Trust boundaries, access posture, and audit coverage.', to: '/app/security' },
            { name: 'Policies', detail: 'Guardrails for autonomy, connector scope, and release gates.', to: '/app/policies' },
            { name: 'Agent Ops', detail: 'Teams, runs, schedules, and execution loops.', to: '/app/teams' },
          ].map((item) => (
            <article className="sm-demo-link sm-demo-link-card" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.detail}</span>
              <Link className="sm-link mt-2" to={item.to}>
                Open
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
