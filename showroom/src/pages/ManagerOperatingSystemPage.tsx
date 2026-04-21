import { startTransition, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { loadDataFabricDataset, type DataFabricDataset, type DataFabricHealthStatus } from '../lib/dataFabricApi'
import { MANAGER_METHOD_CARDS, MANAGER_REVIEW_ROUTINES, MANAGER_TEACHING_PACKS } from '../lib/managerOperatingSystem'
import { canAccessPortalRoute } from '../lib/portalRouteAccess'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { resolveTenantRoleExperience } from '../lib/tenantRoleExperience'
import type { DataFabricStatus } from '../lib/yangonTyreDataFabricModel'
import { getCapabilityProfileForRole, getWorkspaceSession, sessionHasCapability } from '../lib/workspaceApi'

type SessionState = Awaited<ReturnType<typeof getWorkspaceSession>>['session']

const ALLOWED_CAPABILITIES = [
  'operations.view',
  'dqms.view',
  'maintenance.view',
  'director.view',
  'approvals.view',
  'tenant_admin.view',
  'platform_admin.view',
] as const

const QUICK_LINKS = [
  {
    label: 'Operations Control',
    to: '/app/operations',
    detail: 'Run daily blockers, receiving pressure, and shift handoff from one desk.',
    emphasis: 'primary' as const,
  },
  {
    label: 'DQMS and Quality',
    to: '/app/dqms',
    detail: 'Capture incidents, run containment, and close CAPA with structured methods.',
    emphasis: 'attention' as const,
  },
  {
    label: 'Maintenance Control',
    to: '/app/maintenance',
    detail: 'Review downtime, repeat failures, and preventive action ownership.',
    emphasis: 'default' as const,
  },
  {
    label: 'Adoption Command',
    to: '/app/adoption-command',
    detail: 'See where staff usage is weak and where manager coaching is needed.',
    emphasis: 'default' as const,
  },
  {
    label: 'Pilot Log',
    to: '/app/pilot',
    detail: 'Record friction, missing data, and training gaps while the team is using the portal.',
    emphasis: 'default' as const,
  },
  {
    label: 'Workforce Command',
    to: '/app/workforce',
    detail: 'Review routines, AI support coverage, and role-specific operating discipline.',
    emphasis: 'default' as const,
  },
]

function canOpenManagerSystem(session: SessionState | null | undefined) {
  return ALLOWED_CAPABILITIES.some((capability) => sessionHasCapability(session, capability))
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not yet'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function toneForPipelineStatus(status: DataFabricStatus) {
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

function sourceStatusWeight(status: DataFabricStatus) {
  if (status === 'live') {
    return 2
  }
  if (status === 'mapped') {
    return 1
  }
  return 0
}

function connectorHealthWeight(status: DataFabricHealthStatus) {
  if (status === 'Needs wiring') {
    return 3
  }
  if (status === 'Degraded') {
    return 2
  }
  if (status === 'Warning') {
    return 1
  }
  return 0
}

export function ManagerOperatingSystemPage() {
  const tenant = getTenantConfig()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionState | null>(null)
  const [dataFabric, setDataFabric] = useState<DataFabricDataset | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [payload, nextDataFabric] = await Promise.all([getWorkspaceSession(), loadDataFabricDataset()])
        if (!cancelled) {
          setSession(payload.session ?? null)
          setDataFabric(nextDataFabric)
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Manager operating system could not be loaded.')
        }
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

  const capabilityProfile = useMemo(() => getCapabilityProfileForRole(session?.role), [session?.role])
  const experience = useMemo(() => resolveTenantRoleExperience(tenant.key, session?.role), [session?.role, tenant.key])
  const quickLinks = useMemo(
    () => QUICK_LINKS.filter((item) => canAccessPortalRoute(item.to, session)),
    [session],
  )
  const pipelineSummary = useMemo(() => {
    const registry = dataFabric?.sourceRegistry ?? []
    const connectors = dataFabric?.connectorSignals ?? []
    const writebackLanes = dataFabric?.writebackLanes ?? []
    const liveSources = registry.filter((item) => item.status === 'live').length
    const mappedSources = registry.filter((item) => item.status === 'mapped').length
    const attentionConnectors = connectors.filter((item) => item.status !== 'Healthy').length

    return {
      totalSources: registry.length,
      liveSources,
      mappedSources,
      attentionConnectors,
      trustScore: dataFabric?.learningDatabase.trustScore ?? 0,
      writebackLaneCount: writebackLanes.length,
      updatedAt: dataFabric?.updatedAt ?? null,
    }
  }, [dataFabric])
  const topSources = useMemo(() => {
    const registry = [...(dataFabric?.sourceRegistry ?? [])]
    return registry
      .sort((left, right) => {
        const statusDelta = sourceStatusWeight(right.status) - sourceStatusWeight(left.status)
        if (statusDelta !== 0) {
          return statusDelta
        }
        return right.evidenceCount - left.evidenceCount
      })
      .slice(0, 4)
  }, [dataFabric])
  const topConnectorRisks = useMemo(() => {
    const connectors = [...(dataFabric?.connectorSignals ?? [])]
    return connectors
      .sort((left, right) => {
        const healthDelta = connectorHealthWeight(right.status) - connectorHealthWeight(left.status)
        if (healthDelta !== 0) {
          return healthDelta
        }
        return left.name.localeCompare(right.name)
      })
      .slice(0, 4)
  }, [dataFabric])
  const visibleManagerPrograms = useMemo(
    () => (dataFabric?.managerPrograms ?? []).filter((item) => canAccessPortalRoute(item.route, session)).slice(0, 3),
    [dataFabric, session],
  )
  const visibleWritebackLanes = useMemo(
    () => (dataFabric?.writebackLanes ?? []).filter((item) => canAccessPortalRoute(item.route, session)).slice(0, 3),
    [dataFabric, session],
  )

  async function refresh() {
    setRefreshing(true)
    try {
      const [payload, nextDataFabric] = await Promise.all([getWorkspaceSession(), loadDataFabricDataset()])
      startTransition(() => {
        setSession(payload.session ?? null)
        setDataFabric(nextDataFabric)
      })
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Manager operating system could not refresh.')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading || !dataFabric) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Opening manager operating system...</section>
  }

  if (!session) {
    return (
      <section className="sm-surface p-6">
        <p className="text-sm text-[var(--sm-muted)]">Login is required to open the manager operating system.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to="/login?next=/app/manager-system">
            Login
          </Link>
          <Link className="sm-button-secondary" to="/demo-center">
            Open demo center
          </Link>
        </div>
      </section>
    )
  }

  if (!canOpenManagerSystem(session)) {
    return (
      <section className="sm-surface p-6">
        <p className="text-sm text-[var(--sm-muted)]">
          This page is for factory managers, quality leads, maintenance leads, and tenant control roles. Current role: {capabilityProfile.label}.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="sm-button-primary" to={experience.defaultHome}>
            Open role home
          </Link>
          <Link className="sm-button-secondary" to="/app/start">
            Open launchpad
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-8 pb-10">
      <PageIntro
        eyebrow={`${getTenantBrandLabel(tenant)} / Manager OS`}
        title="Run the factory with one review loop."
        description="This page is the simple manager layer: what to review today, which desk to open next, which industrial method to use, and how to teach the team to operate consistently."
      />

      <section className="sm-calm-surface flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="sm-kicker text-[var(--sm-accent)]">Yangon Tyre data pipeline</p>
          <h2 className="text-3xl font-bold text-white">Google Drive, Gmail, and staff writeback already feed one manager-facing runtime.</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Use this screen to see what is already live from the shared data estate, what is still only mapped, and where your team should enter or review data instead of rebuilding the truth in chat or side sheets.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <span className="sm-status-pill">{dataFabric.source === 'live' ? 'Live data fabric' : 'Seeded data fabric'}</span>
          <span className="sm-status-pill">Updated {formatDateTime(pipelineSummary.updatedAt)}</span>
          <Link className="sm-button-secondary" to="/app/data-fabric">
            Open full data fabric
          </Link>
          <button className="sm-button-secondary" onClick={() => void refresh()} type="button">
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </section>

      {error ? (
        <section className="sm-calm-surface p-4 text-sm text-rose-300">
          {error}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Current role</p>
          <p className="mt-3 text-2xl font-bold text-white">{capabilityProfile.label}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{capabilityProfile.summary}</p>
        </article>
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Primary mission</p>
          <p className="mt-3 text-2xl font-bold text-white">{experience.title}</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">{experience.mission}</p>
        </article>
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Pipeline posture</p>
          <p className="mt-3 text-2xl font-bold text-white">
            {pipelineSummary.liveSources}/{pipelineSummary.totalSources}
          </p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">
            {pipelineSummary.mappedSources} mapped source lane{pipelineSummary.mappedSources === 1 ? '' : 's'} and {pipelineSummary.attentionConnectors} connector issue
            {pipelineSummary.attentionConnectors === 1 ? '' : 's'} still need review.
          </p>
        </article>
        <article className="sm-manager-stat">
          <p className="sm-kicker text-[var(--sm-accent)]">Learning trust</p>
          <p className="mt-3 text-2xl font-bold text-white">{pipelineSummary.trustScore}%</p>
          <p className="mt-2 text-sm text-[var(--sm-muted)]">
            {pipelineSummary.writebackLaneCount} writeback lane{pipelineSummary.writebackLaneCount === 1 ? '' : 's'} are already defined for structured staff entry and review.
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-calm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">What is already built</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Live source lanes from Yangon Tyre data.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/connectors">
              Open connectors
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {topSources.map((item) => (
              <Link className="sm-manager-row" key={item.id} to={item.route}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{item.name}</p>
                    <span className={`sm-status-pill ${toneForPipelineStatus(item.status)}`}>{item.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.coverage}</p>
                  <p className="mt-2 text-sm text-white/85">
                    {item.evidenceCount} evidence row{item.evidenceCount === 1 ? '' : 's'} linked. Next: {item.nextAutomation}
                  </p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Still needs work</p>
              <h2 className="mt-2 text-3xl font-bold text-white">What is not fully automatic yet.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/cloud">
              Open cloud ops
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {topConnectorRisks.map((item) => (
              <Link className="sm-manager-row" key={item.id} to={item.route}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`font-semibold ${toneForHealthStatus(item.status)}`}>{item.name}</p>
                    <span className="sm-status-pill">{item.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.backlog}</p>
                  <p className="mt-2 text-sm text-white/85">Next automation: {item.nextAutomation}</p>
                </div>
                <span className="sm-link">Review</span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-calm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Manager-facing programs</p>
              <h2 className="mt-2 text-3xl font-bold text-white">How the data pipeline turns into daily management.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/workforce">
              Open workforce
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {visibleManagerPrograms.map((program) => (
              <Link className="sm-manager-row" key={program.id} to={program.route}>
                <div>
                  <p className="font-semibold text-white">{program.name}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{program.mission}</p>
                  <p className="mt-2 text-sm text-white/85">Watch: {program.watches.slice(0, 2).join(' / ')}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Next handoff: {program.nextHandoff}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Staff data entry</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Where the team should write back into the system.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/adoption-command">
              Open adoption
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {visibleWritebackLanes.map((lane) => (
              <Link className="sm-manager-row" key={lane.id} to={lane.route}>
                <div>
                  <p className="font-semibold text-white">{lane.name}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">Users: {lane.users.join(', ')}</p>
                  <p className="mt-2 text-sm text-white/85">Capture: {lane.captures.slice(0, 3).join(' / ')}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">Quality rule: {lane.qualityRules[0] ?? 'Structured writeback required.'}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Daily review loop</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Run the day with a stable routine.</h2>
          <div className="mt-6 grid gap-3">
            {MANAGER_REVIEW_ROUTINES.map((routine) => (
              <article className="sm-manager-method" key={routine.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{routine.label}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{routine.goal}</p>
                  </div>
                  <span className="sm-status-pill">{routine.timing}</span>
                </div>
                <div className="mt-4 grid gap-2">
                  {routine.steps.map((step) => (
                    <div className="sm-manager-rule" key={step}>
                      <span className="sm-led text-[var(--sm-accent)]" />
                      <p className="text-sm text-white/84">{step}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Open next</p>
          <h2 className="mt-2 text-3xl font-bold text-white">The desks managers actually use.</h2>
          <div className="mt-6 grid gap-3">
            {quickLinks.map((item) => (
              <Link
                className={`sm-manager-action ${item.emphasis === 'primary' ? 'is-primary' : item.emphasis === 'attention' ? 'is-attention' : ''}`.trim()}
                key={item.to}
                to={item.to}
              >
                <div>
                  <p className="font-semibold text-white">{item.label}</p>
                  <p className="mt-2 text-sm text-[var(--sm-muted)]">{item.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
          {experience.focusModules.length ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {experience.focusModules.slice(0, 5).map((item) => (
                <span className="sm-status-pill" key={item}>
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Industrial methods</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Use structured logic before opening another meeting.</h2>
          <div className="mt-6 grid gap-3">
            {MANAGER_METHOD_CARDS.map((method) => (
              <article className="sm-manager-method" key={method.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-white">{method.name}</p>
                  <span className="sm-status-pill">Method</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{method.useCase}</p>
                <div className="mt-4 grid gap-2">
                  <div className="sm-manager-rule">
                    <span className="sm-led text-[var(--sm-accent)]" />
                    <p className="text-sm text-white/84">Trigger: {method.trigger}</p>
                  </div>
                  <div className="sm-manager-rule">
                    <span className="sm-led text-[var(--sm-accent-alt)]" />
                    <p className="text-sm text-white/84">Output: {method.output}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Teach the team</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Turn portal usage into manager coaching, not guesswork.</h2>
          <div className="mt-6 grid gap-3">
            {MANAGER_TEACHING_PACKS.map((pack) => (
              <article className="sm-manager-method" key={pack.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{pack.title}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{pack.audience}</p>
                  </div>
                  <span className="sm-status-pill">Training</span>
                </div>
                <p className="mt-3 text-sm text-white/84">{pack.objective}</p>
                <div className="mt-4 grid gap-2">
                  {pack.drills.map((drill) => (
                    <div className="sm-manager-rule" key={drill}>
                      <span className="sm-led text-[var(--sm-accent)]" />
                      <p className="text-sm text-white/84">{drill}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
