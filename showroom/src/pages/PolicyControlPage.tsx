import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { POLICY_GUARDRAILS } from '../lib/runtimeControlModel'
import type { PolicyGuardrail, RuntimeHealthStatus } from '../lib/runtimeControlModel'

const domainOrder: PolicyGuardrail['domain'][] = ['Connector', 'Knowledge', 'Security', 'Autonomy', 'Release']

const statusOrder: RuntimeHealthStatus[] = ['Healthy', 'Warning', 'Degraded', 'Needs wiring']

export function PolicyControlPage() {
  const domainTotals = domainOrder.map((domain) => ({
    domain,
    count: POLICY_GUARDRAILS.filter((guardrail) => guardrail.domain === domain).length,
  }))

  const statusTotals = statusOrder.map((status) => ({
    status,
    count: POLICY_GUARDRAILS.filter((guardrail) => guardrail.status === status).length,
  }))

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Policy"
        title="Governance guardrails that keep runtime actions safe and auditable."
        description="Each guardrail captures scope, triggers, automation, approval gates, and audit signals so connectors, knowledge, and autonomy stay trustworthy."
      />

      <section className="grid gap-4 md:grid-cols-5">
        {statusTotals.map((summary) => (
          <article className="sm-metric-card" key={summary.status}>
            <p className="sm-kicker text-[var(--sm-accent)]">{summary.status}</p>
            <p className="mt-3 text-3xl font-bold text-white">{summary.count}</p>
            <p className="mt-2 text-sm text-[var(--sm-muted)]">Policies in this posture.</p>
          </article>
        ))}
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Domains</p>
          <p className="mt-3 text-3xl font-bold text-white">{domainTotals.reduce((total, item) => total + item.count, 0)}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Topology of guardrails by domain.</p>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Guardrail matrix</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Each rule tracks an automation, approval gate, and audit signal set.</h2>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
            {domainTotals.map((summary) => (
              <span key={summary.domain} className="sm-chip text-white">
                {summary.domain}: {summary.count}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {POLICY_GUARDRAILS.map((guardrail) => (
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
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Policy, connectors, and knowledge must share the same guardrails.</h2>
          </div>
          <p className="max-w-xl text-sm text-[var(--sm-muted)]">
            Keeping guardrails annotated with audit signals, automation, and failure modes lets Platform Admin, Build Studio, and tenants trust every promotion.
          </p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {POLICY_GUARDRAILS.map((guardrail) => (
            <article className="sm-chip text-white" key={`${guardrail.id}-why`}>
              <p className="font-semibold">{guardrail.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">
                Gate: {guardrail.approvalGate}
                <br />
                Automation: {guardrail.automation}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/app/platform-admin">
            Open control plane
          </Link>
          <Link className="sm-button-secondary" to="/app/factory">
            Open build system
          </Link>
        </div>
      </section>
    </div>
  )
}
