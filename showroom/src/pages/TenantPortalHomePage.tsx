import { startTransition, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { loadManagerHomeDataset, type ManagerHomeAction, type ManagerHomeDataset, type ManagerHomeSignal } from '../lib/managerHomeApi'
import { getTenantBrandLabel, getTenantConfig } from '../lib/tenantConfig'
import { resolveTenantRoleExperience } from '../lib/tenantRoleExperience'
import { YTF_FIRST_HOUR_PLAYBOOK, YTF_PORTAL_DIALECTIC, YTF_PORTAL_RUNTIME, YTF_ROLE_ENTRYPOINTS } from '../lib/ytfPortalRuntime'
import { getWorkspaceSession } from '../lib/workspaceApi'

type SessionState = {
  display_name?: string
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

function signalToneClass(signal: ManagerHomeSignal) {
  if (signal.tone === 'attention') {
    return 'text-rose-300'
  }
  if (signal.tone === 'watch') {
    return 'text-amber-300'
  }
  return 'text-emerald-300'
}

function actionClassName(action: ManagerHomeAction) {
  if (action.emphasis === 'primary') {
    return 'sm-manager-action is-primary'
  }
  if (action.emphasis === 'attention') {
    return 'sm-manager-action is-attention'
  }
  return 'sm-manager-action'
}

export function TenantPortalHomePage() {
  const tenant = getTenantConfig()
  const fallbackExperience = resolveTenantRoleExperience(tenant.key, 'plant manager')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dataset, setDataset] = useState<ManagerHomeDataset | null>(null)
  const [session, setSession] = useState<SessionState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const payload = await getWorkspaceSession()
        if (cancelled) {
          return
        }

        setSession(payload.session ?? null)
        const nextDataset = await loadManagerHomeDataset(tenant.key, payload.session?.role)
        if (!cancelled) {
          setDataset(nextDataset)
          setError(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Manager home could not be loaded.')
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
  }, [tenant.key])

  async function refresh() {
    setRefreshing(true)
    setError(null)
    try {
      const payload = await getWorkspaceSession()
      const nextDataset = await loadManagerHomeDataset(tenant.key, payload.session?.role)
      startTransition(() => {
        setSession(payload.session ?? null)
        setDataset(nextDataset)
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Manager home could not refresh.')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">
        Opening the simplified manager home...
      </section>
    )
  }

  if (!dataset) {
    return (
      <div className="space-y-8 pb-12">
        <PageIntro
          eyebrow={`${getTenantBrandLabel(tenant)} / Tenant portal`}
          title={`${fallbackExperience.title}: live operating host and role entry.`}
          description="The workspace runtime is still partial on this host, but the tenant portal remains usable as the operating map for Yangon Tyre."
        />

        <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(207,166,122,0.16),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(132,194,176,0.14),_transparent_42%)]" />
          <div className="relative grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <div>
              <div className="sm-status-bar">
                <span className="sm-status-pill">{YTF_PORTAL_RUNTIME.domain}</span>
                <span className="sm-status-pill">Seed fallback</span>
                <span className="sm-status-pill">{YTF_PORTAL_RUNTIME.provider}</span>
              </div>
              <h2 className="mt-5 max-w-4xl text-4xl font-bold text-white">This tenant host is where plant, quality, maintenance, and admin should start.</h2>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
                {YTF_PORTAL_RUNTIME.summary} Use the portal to enter the right lane, not to hold a second copy of the same problem in chat or side sheets.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to="/app/plant-manager">
                  Open plant manager
                </Link>
                <Link className="sm-button-secondary" to="/app/operations">
                  Open operations
                </Link>
                <Link className="sm-button-secondary" to="/app/dqms">
                  Open DQMS
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              <article className="sm-manager-method">
                <p className="sm-kicker text-[var(--sm-accent)]">Tenant runtime</p>
                <div className="mt-4 grid gap-3 text-sm text-white/90">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[var(--sm-muted)]">Host</span>
                    <span className="font-semibold text-white">{YTF_PORTAL_RUNTIME.domain}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[var(--sm-muted)]">Route root</span>
                    <span className="font-mono text-white">{YTF_PORTAL_RUNTIME.routeRoot}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[var(--sm-muted)]">Managed by</span>
                    <span className="text-right text-white">{YTF_PORTAL_RUNTIME.managedBy.join(' / ')}</span>
                  </div>
                </div>
              </article>

              <article className="sm-manager-method">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Why this host exists</p>
                <div className="mt-4 grid gap-3">
                  <div className="sm-manager-rule">
                    <span className="sm-led bg-[var(--sm-accent)] text-[var(--sm-accent)]" />
                    <p className="text-sm text-white/90">{YTF_PORTAL_DIALECTIC.thesis}</p>
                  </div>
                  <div className="sm-manager-rule">
                    <span className="sm-led bg-[var(--sm-accent-alt)] text-[var(--sm-accent-alt)]" />
                    <p className="text-sm text-white/90">{YTF_PORTAL_DIALECTIC.antithesis}</p>
                  </div>
                  <div className="sm-manager-rule">
                    <span className="sm-led bg-white text-white" />
                    <p className="text-sm text-white/90">{YTF_PORTAL_DIALECTIC.synthesis}</p>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <article className="sm-calm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent)]">First hour</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Use the portal in this order</h2>
            <div className="mt-6 grid gap-3">
              {YTF_FIRST_HOUR_PLAYBOOK.map((item, index) => (
                <div className="sm-manager-rule" key={item.id}>
                  <span className="sm-manager-rule-index">{index + 1}</span>
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="sm-calm-surface p-6">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Role starts</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Each team should enter from one route</h2>
            <div className="mt-6 grid gap-3">
              {YTF_ROLE_ENTRYPOINTS.map((item) => (
                <Link className="sm-manager-row" key={item.id} to={item.route}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{item.role}</p>
                      <span className="sm-status-pill">{item.owner}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
                    <p className="mt-2 font-mono text-xs text-white/70">{item.route}</p>
                  </div>
                  <span className="sm-link">Open</span>
                </Link>
              ))}
            </div>
          </article>
        </section>

        {error ? <section className="sm-calm-surface p-4 text-sm text-rose-300">{error}</section> : null}
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      <PageIntro
        eyebrow={`${getTenantBrandLabel(tenant)} / Manager home`}
        title={`${dataset.experience.title}: simple daily operating view.`}
        description={dataset.headline}
      />

      <section className="sm-surface-deep relative overflow-hidden p-6 lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(207,166,122,0.16),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(132,194,176,0.14),_transparent_42%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className="sm-status-bar">
              <span className="sm-status-pill">{YTF_PORTAL_RUNTIME.domain}</span>
              <span className="sm-status-pill">{dataset.source === 'live' ? 'Live workspace' : 'Seeded runtime'}</span>
              <span className="sm-status-pill">{YTF_PORTAL_RUNTIME.provider}</span>
            </div>
            <h2 className="mt-5 max-w-4xl text-4xl font-bold text-white">ytf.supermega.dev is the tenant operating layer for Yangon Tyre.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
              {YTF_PORTAL_RUNTIME.summary} Use this host to enter the right desk, keep the operating record in one place, and move from daily control into analytics without losing provenance.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/plant-manager">
                Open plant manager
              </Link>
              <Link className="sm-button-secondary" to="/app/operations">
                Open operations
              </Link>
              <Link className="sm-button-secondary" to="/app/data-fabric">
                Open data fabric
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <article className="sm-manager-method">
              <p className="sm-kicker text-[var(--sm-accent)]">Tenant runtime</p>
              <div className="mt-4 grid gap-3 text-sm text-white/90">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[var(--sm-muted)]">Host</span>
                  <span className="font-semibold text-white">{YTF_PORTAL_RUNTIME.domain}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[var(--sm-muted)]">Route root</span>
                  <span className="font-mono text-white">{YTF_PORTAL_RUNTIME.routeRoot}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[var(--sm-muted)]">Mode</span>
                  <span className="text-right text-white">{dataset.source === 'live' ? 'Connected workspace data' : 'Seeded review mode with live route map'}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[var(--sm-muted)]">Updated</span>
                  <span className="text-right text-white">{formatDateTime(dataset.updatedAt)}</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {YTF_PORTAL_RUNTIME.proofPaths.map((item) => (
                  <span className="sm-status-pill font-mono" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </article>

            <article className="sm-manager-method">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Why this host exists</p>
              <div className="mt-4 grid gap-3">
                <div className="sm-manager-rule">
                  <span className="sm-led bg-[var(--sm-accent)] text-[var(--sm-accent)]" />
                  <p className="text-sm text-white/90">{YTF_PORTAL_DIALECTIC.thesis}</p>
                </div>
                <div className="sm-manager-rule">
                  <span className="sm-led bg-[var(--sm-accent-alt)] text-[var(--sm-accent-alt)]" />
                  <p className="text-sm text-white/90">{YTF_PORTAL_DIALECTIC.antithesis}</p>
                </div>
                <div className="sm-manager-rule">
                  <span className="sm-led bg-white text-white" />
                  <p className="text-sm text-white/90">{YTF_PORTAL_DIALECTIC.synthesis}</p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="sm-calm-surface flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="sm-kicker text-[var(--sm-accent)]">How to use this page</p>
          <h2 className="text-3xl font-bold text-white">Start here, open one desk, coach from facts, then close the loop.</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--sm-muted)]">
            This home is the plant-manager operating screen. It shows what changed, which review loop matters now, and how to teach the team to use the portal without side trackers.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <span className="sm-status-pill">{session?.display_name || 'Manager'}</span>
          <span className="sm-status-pill">{dataset.source === 'live' ? 'Live data' : 'Seed data'}</span>
          <span className="sm-status-pill">Updated {formatDateTime(dataset.updatedAt)}</span>
          <Link className="sm-button-secondary" to="/app/plant-manager">
            Plant manager
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

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">First hour</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Use the portal in this order</h2>
          <div className="mt-6 grid gap-3">
            {YTF_FIRST_HOUR_PLAYBOOK.map((item, index) => (
              <div className="sm-manager-rule" key={item.id}>
                <span className="sm-manager-rule-index">{index + 1}</span>
                <div>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Role starts</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Each team should enter from one route</h2>
          <div className="mt-6 grid gap-3">
            {YTF_ROLE_ENTRYPOINTS.map((item) => (
              <Link className="sm-manager-row" key={item.id} to={item.route}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{item.role}</p>
                    <span className="sm-status-pill">{item.owner}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
                  <p className="mt-2 font-mono text-xs text-white/70">{item.route}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dataset.metrics.map((metric) => (
          <article className="sm-manager-stat" key={metric.label}>
            <p className="sm-kicker text-[var(--sm-accent)]">{metric.label}</p>
            <p className="mt-3 text-3xl font-bold text-white">{metric.value}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="sm-calm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Today</p>
              <h2 className="mt-2 text-3xl font-bold text-white">What to do now</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/actions">
              Open full queue
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {dataset.actions.map((action) => (
              <Link className={actionClassName(action)} key={action.id} to={action.route}>
                <div>
                  <p className="font-semibold text-white">{action.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{action.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">What Changed</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Attention and review signals</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/pilot">
              Log friction
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {dataset.signals.map((signal) => (
              <Link className="sm-manager-row" key={signal.id} to={signal.route}>
                <div>
                  <p className={`font-semibold ${signalToneClass(signal)}`}>{signal.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{signal.detail}</p>
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
              <p className="sm-kicker text-[var(--sm-accent)]">Teach The Team</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Manager routines built into the portal</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/adoption-command">
              Review adoption
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {dataset.routines.map((routine) => (
              <article className="sm-manager-method" key={routine.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{routine.name}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sm-accent)]">{routine.cadence}</p>
                  </div>
                  <Link className="sm-link" to={routine.route}>
                    Open desk
                  </Link>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{routine.purpose}</p>
                <p className="mt-3 text-sm text-white/90">
                  <span className="font-semibold text-white">How to run it:</span> {routine.script}
                </p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">
                  <span className="font-semibold text-white">Done when:</span> {routine.doneWhen}
                </p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Industrial Engineering</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Methods the app should reinforce</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/data-fabric">
              Open data fabric
            </Link>
          </div>
          <div className="mt-6 grid gap-4">
            {dataset.methods.map((method) => (
              <article className="sm-manager-method" key={method.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-white">{method.name}</p>
                  <Link className="sm-link" to={method.route}>
                    Open
                  </Link>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{method.question}</p>
                <p className="mt-3 text-sm text-white/90">
                  <span className="font-semibold text-white">Measure:</span> {method.measure}
                </p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="sm-calm-surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Role Modules</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Use only the desks that belong to this role</h2>
            </div>
            <Link className="sm-button-secondary" to={dataset.experience.defaultHome}>
              Open main desk
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {dataset.modules.map((module) => (
              <Link className="sm-manager-row" key={module.id} to={module.route}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{module.title}</p>
                    <span className="sm-status-pill">{module.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{module.detail}</p>
                  <p className="mt-2 text-sm text-white/85">{module.reason}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Support Tools</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Meta tools for managers, not for daily distraction</h2>
          <div className="mt-6 grid gap-3">
            {dataset.supportTools.map((tool) => (
              <Link className="sm-manager-row" key={tool.id} to={tool.route}>
                <div>
                  <p className="font-semibold text-white">{tool.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{tool.detail}</p>
                </div>
                <span className="sm-link">Open</span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Teach Managers</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Use this simple training sequence</h2>
          <div className="mt-6 grid gap-3">
            {dataset.trainingSequence.map((item, index) => (
              <div className="sm-manager-rule" key={`${index + 1}-${item}`}>
                <span className="sm-manager-rule-index">{index + 1}</span>
                <p className="text-sm leading-relaxed text-white/92">{item}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Manager Rules</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Keep the operating discipline small and strict</h2>
          <div className="mt-6 grid gap-3">
            {dataset.managerRules.map((rule) => (
              <div className="sm-manager-rule" key={rule}>
                <span className="sm-led h-2.5 w-2.5 bg-[var(--sm-accent)] text-[var(--sm-accent)]" />
                <p className="text-sm leading-relaxed text-white/92">{rule}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
