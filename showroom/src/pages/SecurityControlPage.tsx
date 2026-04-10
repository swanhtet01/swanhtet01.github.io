import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { getSeedRuntimeControlDataset, loadRuntimeControlDataset } from '../lib/runtimeControlApi'
import { getOperatingModelById, OPERATING_MODELS } from '../lib/tenantOperatingModel'
import type { RuntimeHealthStatus } from '../lib/runtimeControlModel'

const zoneOrder = ['platform-control', 'shared-knowledge'] as const
const guardrailOrder: RuntimeHealthStatus[] = ['Healthy', 'Warning', 'Degraded', 'Needs wiring']

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

export function SecurityControlPage() {
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

  const platformModel = getOperatingModelById('supermega-core')
  const tenantModel = getOperatingModelById('yangon-tyre')
  const guardrails = runtimeData.policyGuardrails
  const zoneSummaries = zoneOrder.map((zoneId) => {
    const zone = platformModel.securityZones.find((item) => item.id === zoneId)
    return {
      label: zone?.name ?? zoneId,
      summary: zone?.summary ?? 'Configured perimeter control.',
      controls: zone?.controls ?? [],
    }
  })
  const guardrailSummaries = guardrailOrder.map((status) => ({
    status,
    count: guardrails.filter((guardrail) => guardrail.status === status).length,
  }))

  return (
    <div className="space-y-10 pb-12">
      <PageIntro
        eyebrow="Security"
        title="Run the platform with visible boundaries, approval gates, and sensitive-field policy."
        description="Security here means boundary maps, tenant visibility, approval paths, and guardrails with audit signals ready for review."
      />

      <section className="sm-chip text-white">
        <p className="font-semibold">{loading ? 'Refreshing security posture.' : runtimeData.source === 'live' ? 'Live runtime feed connected.' : 'Using seeded runtime model.'}</p>
        <p className="mt-2 text-sm text-[var(--sm-muted)]">
          Source timestamp: {formatUpdatedAt(runtimeData.updatedAt)}. The page uses the same runtime contract as connectors, knowledge, and policy so security posture can move to live audits without UI churn.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {zoneSummaries.map((zone) => (
          <article className="sm-metric-card" key={zone.label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{zone.label}</p>
            <p className="mt-3 text-sm text-[var(--sm-muted)]">{zone.summary}</p>
            <div className="mt-3 space-y-1 text-xs uppercase tracking-[0.18em] text-white/60">
              {zone.controls.map((control) => (
                <p key={`${zone.label}-${control}`}>{control}</p>
              ))}
            </div>
          </article>
        ))}
        <article className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Tenants</p>
          <p className="mt-3 text-3xl font-bold text-white">{OPERATING_MODELS.length}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">Core platform versus Yangon Tyre trust posture.</p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {[platformModel, tenantModel].map((model) => (
          <article className="sm-site-panel" key={model.id}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">{model.publicLabel}</p>
                <h2 className="mt-2 text-3xl font-bold text-white">Why this tenant needs explicit trust boundaries</h2>
              </div>
              <p className="max-w-lg text-sm text-[var(--sm-muted)]">
                Roles, connectors, and modules inherit these controls so the runtime stays safe without making operators work around policy.
              </p>
            </div>
            <div className="mt-5 space-y-2 text-sm text-white/80">
              <p>Roles monitored: {model.roles.map((role) => role.name).join(', ')}</p>
              <p>Leader checkpoints: {model.platformTeams.map((team) => team.name).join(', ')}</p>
              <p>Security zones: {model.securityZones.map((zone) => zone.name).join(', ')}</p>
            </div>
            <div className="mt-6 grid gap-3">
              {model.rolloutPhases.map((phase) => (
                <article className="sm-chip text-white" key={`${model.id}-${phase.id}`}>
                  <p className="font-semibold">{phase.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">{phase.outcome}</p>
                  <p className="mt-1 text-sm text-white/80">Deliverables: {phase.deliverables.join(', ')}</p>
                  <p className="mt-1 text-sm text-white/80">Modules: {phase.modules.join(', ')}</p>
                </article>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Guardrail posture</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Every boundary still needs trigger coverage, automation, approval gates, and audit signals.</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-[var(--sm-muted)]">
            {guardrailSummaries.map((summary) => (
              <span key={summary.status} className="sm-chip text-white">
                {summary.status}: {summary.count}
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
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {guardrails.map((guardrail) => (
            <article className="sm-chip text-white" key={`${guardrail.id}-why`}>
              <p className="font-semibold">{guardrail.name}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--sm-muted)]">
                {guardrail.domain} / {guardrail.status}
              </p>
              <p className="mt-1 text-sm text-white/80">Trigger: {guardrail.trigger}</p>
              <p className="mt-1 text-sm text-white/80">Failure mode: {guardrail.failureMode}</p>
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
