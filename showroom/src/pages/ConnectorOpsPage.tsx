import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { loadRuntimeControlDataset, getSeedRuntimeControlDataset } from '../lib/runtimeControlApi'
import { SUPERMEGA_CORE_MODEL, YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'
import type { RuntimeConnectorFeed } from '../lib/runtimeControlModel'

const runtimeSections = [
  {
    title: 'Core platform feeds',
    tenant: 'core' as const,
    description: 'Shared feeds that keep SuperMega attached to inboxes, drive folders, GitHub delivery state, and structured operator input.',
  },
  {
    title: 'Yangon Tyre feeds',
    tenant: 'yangon-tyre' as const,
    description: 'Tenant-specific feeds that keep plant, procurement, quality, and director surfaces on the same operating data.',
  },
] as const

const statusTone: Record<RuntimeConnectorFeed['status'], string> = {
  Healthy: 'text-[#8be8ff]',
  Warning: 'text-[#ffb347]',
  Degraded: 'text-[#ff6b6b]',
  'Needs wiring': 'text-[#ff7a18]',
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return 'Seeded runtime model'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function feedCard(feed: RuntimeConnectorFeed) {
  return (
    <article className="sm-demo-link sm-demo-link-card" key={feed.id}>
      <div className="flex items-center justify-between gap-3">
        <span className="sm-home-proof-label">{feed.system}</span>
        <span className={`sm-status-pill ${statusTone[feed.status]}`}>{feed.status}</span>
      </div>
      <strong>{feed.name}</strong>
      <p className="mt-2 text-sm text-[var(--sm-muted)]">Owner: {feed.owner}</p>
      <p className="mt-2 text-sm text-white/80">Workspace: {feed.workspace}</p>
      <p className="mt-2 text-sm text-white/80">Freshness: {feed.freshness}</p>
      <p className="mt-2 text-sm text-white/80">Backlog: {feed.backlog}</p>
      <p className="mt-2 text-sm text-white/80">Writeback: {feed.writeBack}</p>
      <p className="mt-2 text-sm text-white/80">Next automation: {feed.nextAutomation}</p>
      <div className="mt-3 grid gap-2 text-sm text-[var(--sm-muted)]">
        <p>Inputs: {feed.inputs.join(', ')}</p>
        <p>Outputs: {feed.outputs.join(', ')}</p>
      </div>
      <div className="mt-3 text-xs uppercase tracking-[0.16em] text-white/60">Risks</div>
      <div className="mt-2 space-y-2 text-sm text-[var(--sm-muted)]">
        {feed.risks.map((risk) => (
          <p key={`${feed.id}-${risk}`}>{risk}</p>
        ))}
      </div>
    </article>
  )
}

export function ConnectorOpsPage() {
  const [runtimeData, setRuntimeData] = useState(() => getSeedRuntimeControlDataset())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextData = await loadRuntimeControlDataset()
      if (cancelled) {
        return
      }
      setRuntimeData(nextData)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Connectors"
        title="Operate the runtime feeds that keep SuperMega attached to real company data."
        description="This surface shows connector freshness, backlog, risk, and next automation work across the core platform and Yangon Tyre."
      />

      <section className="sm-chip text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold">{loading ? 'Refreshing runtime view.' : runtimeData.source === 'live' ? 'Live runtime feed connected.' : 'Using seeded runtime model.'}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">
              Source timestamp: {formatUpdatedAt(runtimeData.updatedAt)}. When `/api/runtime/control` is live, these feeds will switch from seeded data to workspace state automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/runtime">
              Runtime
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Platform Admin
            </Link>
            <Link className="sm-button-secondary" to="/app/security">
              Security
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6">
        {runtimeSections.map((section) => {
          const feeds = runtimeData.connectors.filter((feed) => feed.tenant === section.tenant)
          return (
            <article className="sm-site-panel" key={section.title}>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{section.title}</p>
                  <h2 className="mt-2 text-3xl font-bold text-white">{section.description}</h2>
                </div>
                <span className="sm-status-pill">{feeds.length} feeds tracked</span>
              </div>
              <div className="mt-6 grid gap-4 xl:grid-cols-2">{feeds.map(feedCard)}</div>
            </article>
          )
        })}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Tenant source maps</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Every tenant still needs an explicit source contract behind the feed health.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Runtime feeds show freshness and backlog. The operating model still defines which connectors each tenant is allowed to inherit and who owns them.
          </p>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {[SUPERMEGA_CORE_MODEL, YANGON_TYRE_MODEL].map((model) => (
            <article className="sm-surface p-6" key={model.id}>
              <p className="sm-kicker text-[var(--sm-accent)]">{model.publicLabel}</p>
              <h3 className="mt-2 text-2xl font-bold text-white">{model.domain}</h3>
              <div className="mt-4 grid gap-3">
                {model.connectors.map((connector) => (
                  <article className="sm-proof-card" key={`${model.id}-${connector.id}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{connector.name}</p>
                      <span className="sm-status-pill">{connector.cadence}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{connector.source}</p>
                    <p className="mt-2 text-sm text-white/80">Scope: {connector.scope}</p>
                    <p className="mt-2 text-sm text-white/80">Outputs: {connector.outputs.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Writeback: {connector.writeBack}</p>
                    <p className="mt-2 text-sm text-white/80">Admin owner: {connector.adminOwner}</p>
                  </article>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
