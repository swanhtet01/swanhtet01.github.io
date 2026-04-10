import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getSeedRuntimeControlDataset, loadRuntimeControlDataset, type RuntimeControlDataset } from '../lib/runtimeControlApi'
import { type RuntimeHealthStatus } from '../lib/runtimeControlModel'

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

export function RuntimeOverviewPage() {
  const [dataset, setDataset] = useState<RuntimeControlDataset>(getSeedRuntimeControlDataset())

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

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Runtime"
        title="One dashboard for feeds, memory, autonomy, and guardrails."
        description="Track whether the AI-native runtime is healthy enough to trust. This desk brings connector freshness, canon quality, autonomous loops, and policy posture into one control surface."
      />

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
