import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getSeedRuntimeControlDataset, loadRuntimeControlDataset } from '../lib/runtimeControlApi'
import type { PolicyGuardrail, RuntimeHealthStatus } from '../lib/runtimeControlModel'

const domainOrder: PolicyGuardrail['domain'][] = ['Connector', 'Knowledge', 'Security', 'Autonomy', 'Release']
const statusOrder: RuntimeHealthStatus[] = ['Healthy', 'Warning', 'Degraded', 'Needs wiring']

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

export function PolicyControlPage() {
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

  const guardrails = runtimeData.policyGuardrails
  const domainTotals = domainOrder.map((domain) => ({
    domain,
    count: guardrails.filter((guardrail) => guardrail.domain === domain).length,
  }))
  const statusTotals = statusOrder.map((status) => ({
    status,
    count: guardrails.filter((guardrail) => guardrail.status === status).length,
  }))

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Policy"
        title="Governance guardrails that keep runtime actions safe and auditable."
        description="Each guardrail tracks scope, triggers, automation, approval gates, audit signals, and failure modes so connectors, knowledge, and autonomous work stay trustworthy."
      />

      <section className="sm-chip text-white">
        <p className="font-semibold">{loading ? 'Refreshing policy posture.' : runtimeData.source === 'live' ? 'Live runtime feed connected.' : 'Using seeded runtime model.'}</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">
          Source timestamp: {formatUpdatedAt(runtimeData.updatedAt)}. The page is already wired for `/api/runtime/control`, so policy audit state can move to live backend events without another rewrite.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        {statusTotals.map((summary) => (
          <article className="sm-metric-card" key={summary.status}>
            <p className="sm-kicker text-[var(--sm-accent)]">{summary.status}</p>
            <p className="mt-3 text-3xl font-bold text-white">{summary.count}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Guardrails in this posture.</p>
          </article>
        ))}
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Domains</p>
          <p className="mt-3 text-3xl font-bold text-white">{domainTotals.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Connector, knowledge, security, autonomy, and release boundaries.</p>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Guardrail matrix</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each rule needs a trigger, an automation path, an approval gate, and auditable failure handling.</h2>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
            {domainTotals.map((summary) => (
              <span className="sm-chip text-white" key={summary.domain}>
                {summary.domain}: {summary.count}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {guardrails.map((guardrail) => (
            <article className="sm-demo-link sm-demo-link-card" key={guardrail.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{guardrail.domain}</span>
                <span className="sm-status-pill">{guardrail.status}</span>
              </div>
              <strong>{guardrail.name}</strong>
              <p className="mt-2 text-sm text-white/80">{guardrail.scope}</p>
              <div className="mt-3 space-y-2 text-sm text-[var(--sm-muted)]">
                <p>Trigger: {guardrail.trigger}</p>
                <p>Automation: {guardrail.automation}</p>
                <p>Approval gate: {guardrail.approvalGate}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-white/60">
                {guardrail.auditSignals.map((signal) => (
                  <span key={`${guardrail.id}-${signal}`}>{signal}</span>
                ))}
              </div>
              <p className="mt-3 text-sm text-white/80">Failure mode: {guardrail.failureMode}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Why this matters</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Guardrails are what let the product company scale without losing trust.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">
            Platform Admin needs the control picture. Build needs the release gate picture. Tenants need operational boundaries that do not depend on informal memory.
          </p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {guardrails.map((guardrail) => (
            <article className="sm-chip text-white" key={`${guardrail.id}-why`}>
              <p className="font-semibold">{guardrail.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                Gate: {guardrail.approvalGate}
                <br />
                Failure mode: {guardrail.failureMode}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/app/runtime">
            Open Runtime
          </Link>
          <Link className="sm-button-secondary" to="/app/platform-admin">
            Open Platform Admin
          </Link>
          <Link className="sm-button-secondary" to="/app/factory">
            Open Build
          </Link>
        </div>
      </section>
    </div>
  )
}
