import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { SUPERMEGA_CORE_MODEL } from '../lib/tenantOperatingModel'
import { getRuntimeConnectorFeedsForTenant } from '../lib/runtimeControlModel'
import type { RuntimeConnectorFeed } from '../lib/runtimeControlModel'

const runtimeSections = [
  {
    title: 'Core platform feeds',
    tenant: 'core' as const,
    description:
      'These connectors keep SUPERMEGA.dev connected to inboxes, drive folders, GitHub, and structured human input so every tenant inherits the runtime.',
  },
  {
    title: 'Yangon Tyre feeds',
    tenant: 'yangon-tyre' as const,
    description:
      'We run unique Gmail, Drive, and ERP feeds for YTF so the plant, procurement, and director surfaces share the same canonical data.',
  },
]

const statusColor = {
  Healthy: 'text-[#8be8ff]',
  Warning: 'text-[#ffb347]',
  Degraded: 'text-[#ff6b6b]',
  'Needs wiring': 'text-[#ff7a18]',
} as const

function feedCard(feed: RuntimeConnectorFeed) {
  return (
    <article className="sm-demo-link sm-demo-link-card" key={feed.id}>
      <div className="flex items-center justify-between gap-3">
        <span className="sm-home-proof-label">{feed.system}</span>
        <span className="sm-status-pill">{feed.status}</span>
      </div>
      <strong>{feed.name}</strong>
      <p className="mt-2 text-sm text-white/80">Owner: {feed.owner}</p>
      <p className="mt-2 text-sm text-white/80">Workspace: {feed.workspace}</p>
      <p className="mt-2 text-sm text-[var(--sm-muted)]">Freshness: {feed.freshness}</p>
      <p className="mt-2 text-sm text-[var(--sm-muted)]">Backlog: {feed.backlog}</p>
      <p className="mt-2 text-sm text-white/80">Next automation: {feed.nextAutomation}</p>
      <div className="mt-3 grid gap-2 text-sm text-[var(--sm-muted)]">
        <p>Inputs: {feed.inputs.join(', ')}</p>
        <p>Outputs: {feed.outputs.join(', ')}</p>
      </div>
      <div className="mt-3 text-xs uppercase tracking-[0.2em] text-white/60">
        Risks: {feed.risks.join('; ')}
      </div>
    </article>
  )
}

export function ConnectorOpsPage() {
  const tenantModel = SUPERMEGA_CORE_MODEL
  const coreFeeds = getRuntimeConnectorFeedsForTenant('core')
  const ytfFeeds = getRuntimeConnectorFeedsForTenant('yangon-tyre')

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Connectors"
        title="Operate the runtime feeds that keep SUPERMEGA.dev attached to real company data."
        description="This surface shows connector health, freshness, backlog, automation work, and the tenant source maps that keep Yangon Tyre and the core platform in sync."
      />

      <section className="grid gap-6">
        {runtimeSections.map((section) => {
          const feeds = section.tenant === 'core' ? coreFeeds : ytfFeeds
          return (
            <article className="sm-site-panel" key={section.title}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="sm-kicker text-[var(--sm-accent)]">{section.title}</p>
                  <h2 className="mt-2 text-3xl font-bold text-white">{section.description}</h2>
                </div>
                <span className={`sm-status-pill ${statusColor[feeds[0]?.status ?? 'Healthy']}`}>
                  {feeds.length ? `${feeds.length} feeds tracked` : 'No feeds configured'}
                </span>
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
            <h2 className="mt-2 text-3xl font-bold text-white">Every tenant connects to a curated set of sources and runtime contracts.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Platform Admin already lists connectors per tenant; this page attaches their health, backlog, automation plans, and risk stack to the same map for operators.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {tenantModel.connectors.map((connector) => (
            <article className="sm-chip text-white" key={connector.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{connector.name}</p>
                <span className="sm-status-pill">{connector.cadence}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{connector.source}</p>
              <p className="mt-2 text-sm text-white/80">Scope: {connector.scope}</p>
              <p className="mt-2 text-sm text-white/80">Outputs: {connector.outputs.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Writeback: {connector.writeBack}</p>
              <p className="mt-2 text-sm text-white/80">
                Admin owner: <Link className="sm-link" to="/app/platform-admin">{connector.adminOwner}</Link>
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Why this matters</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Connector health is the wall between real company work and empty demos.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/platform-admin">
            Open Platform Admin
          </Link>
        </div>
        <div className="mt-6 space-y-3 text-sm leading-relaxed text-[var(--sm-muted)]">
          <p>Every connector is an operating contract. When Gmail lags, YTF sales memory stutters, approvals miss evidence, and automation fails.</p>
          <p>We need the feeds to stay fresh, the backlog short, and the risks surfaced before director review. This surface ties those facts to the running tenant model.</p>
          <p>The next automation is not a marketing story; it is what we will build this week to keep the core platform and Yangon Tyre on the same live runtime.</p>
        </div>
      </section>
    </div>
  )
}
