import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  META_TOOL_ACCESS_RESOURCES,
  META_TOOL_CONTROL_LANES,
  META_TOOL_EXTERNAL_RUNTIMES,
  META_TOOL_RUN_ACTIONS,
  META_TOOL_SCALE_SEQUENCE,
  META_TOOLS_SUMMARY,
  type MetaToolsStatus,
} from '../lib/metaToolsControl'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const requiredCapabilities = ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'] as const

function statusClass(status: MetaToolsStatus) {
  if (status === 'Live' || status === 'Ready') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }
  if (status === 'Blocked') {
    return 'border-rose-200 bg-rose-50 text-rose-800'
  }
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

function statusDotClass(status: MetaToolsStatus) {
  if (status === 'Live' || status === 'Ready') {
    return 'bg-emerald-500'
  }
  if (status === 'Blocked') {
    return 'bg-rose-500'
  }
  return 'bg-amber-500'
}

export function MetaToolsPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...requiredCapabilities],
        unauthenticatedMessage: 'Login is required to open Meta Tools.',
        previewMessage: 'Meta Tools needs the authenticated app host.',
      })
      if (!cancelled) {
        setAccess(nextAccess)
      }
    }

    void loadAccess()
    return () => {
      cancelled = true
    }
  }, [])

  const readyLaneCount = useMemo(
    () => META_TOOL_CONTROL_LANES.filter((lane) => lane.status === 'Live' || lane.status === 'Ready').length,
    [],
  )
  const wiringLaneCount = META_TOOL_CONTROL_LANES.length - readyLaneCount

  if (access.loading) {
    return <div className="sm-chip text-white">Loading Meta Tools...</div>
  }

  if (!access.allowed) {
    return (
      <section className="sm-app-auth-panel">
        <p className="sm-kicker text-[var(--sm-accent)]">Meta Tools</p>
        <h1 className="text-3xl font-black text-white">Operator access required.</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/68">{access.error ?? 'Use an operator, architect, tenant admin, or platform admin account.'}</p>
      </section>
    )
  }

  return (
    <div className="grid gap-6 pb-28">
      <section className="sm-calm-surface overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[1fr_0.8fr]">
          <div className="p-6 md:p-8">
            <p className="sm-kicker text-[var(--sm-accent)]">Meta Tools</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.05em] text-[var(--sm-ink)] md:text-6xl">
              Infrastructure access for the AI workforce.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--sm-muted)]">
              Use this app to move work from developer sessions into cloud jobs, agent queues, connector sync, evidence-backed releases, and sellable modules.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/cloud">
                Open cloud control
              </Link>
              <Link className="sm-button-secondary" to="/app/meta-ops">
                Run QA and release checks
              </Link>
              <Link className="sm-button-secondary" to="/app/workforce">
                Manage workforce
              </Link>
              <Link className="sm-button-secondary" to="/app/open-source-radar">
                Open source radar
              </Link>
              <Link className="sm-button-secondary" to="/app/integration-studio">
                Integration studio
              </Link>
            </div>
          </div>
          <div className="border-t border-slate-200/80 bg-[#ebe6d8] p-6 md:p-8 lg:border-l lg:border-t-0">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-muted)]">Operating rule</p>
            <p className="mt-3 text-xl font-black leading-tight text-[var(--sm-ink)]">{META_TOOLS_SUMMARY.operatingRule}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                ['Control lanes', META_TOOLS_SUMMARY.controlLanes],
                ['External runtimes', META_TOOLS_SUMMARY.externalRuntimes],
                ['Run actions', META_TOOLS_SUMMARY.runActions],
                ['Access resources', META_TOOLS_SUMMARY.accessResources],
              ].map(([label, value]) => (
                <div className="rounded-3xl border border-slate-300/70 bg-white/70 p-4" key={label}>
                  <strong className="block text-3xl font-black text-[var(--sm-ink)]">{value}</strong>
                  <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ['Ready lanes', readyLaneCount, 'Can be operated now from existing pages.'],
          ['Needs wiring', wiringLaneCount, 'Should become queue, worker, or connector work.'],
          ['Current role', access.roleLabel, 'Access is capability-gated.'],
        ].map(([label, value, detail]) => (
          <article className="rounded-[1.35rem] border border-slate-200 bg-white/82 p-4" key={label}>
            <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
            <strong className="mt-2 block text-2xl font-black text-[var(--sm-ink)]">{value}</strong>
            <span className="mt-1 block text-xs leading-5 text-[var(--sm-muted)]">{detail}</span>
          </article>
        ))}
      </section>

      <section className="sm-calm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Control lanes</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Where every part of the machine is operated.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/platform-admin">
            Open platform admin
          </Link>
        </div>
        <div className="mt-5 divide-y divide-slate-200/80">
          {META_TOOL_CONTROL_LANES.map((lane) => (
            <article className="grid gap-4 py-5 lg:grid-cols-[0.8fr_1.2fr_0.7fr]" key={lane.id}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(lane.status)}`} />
                  <h3 className="text-xl font-black text-[var(--sm-ink)]">{lane.name}</h3>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${statusClass(lane.status)}`}>{lane.status}</span>
                </div>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.15em] text-[var(--sm-muted)]">{lane.owner}</p>
              </div>
              <div>
                <p className="text-sm leading-6 text-[var(--sm-muted)]">{lane.purpose}</p>
                <p className="mt-3 text-sm font-bold text-[var(--sm-ink)]">{lane.primaryAction}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lane.infrastructure.map((item) => (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid content-start gap-3">
                <p className="text-xs leading-5 text-[var(--sm-muted)]">{lane.evidence}</p>
                <Link className="sm-button-secondary justify-center" to={lane.route}>
                  Open lane
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.86fr]">
        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Run actions</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Repeatable work that should not stay trapped in chat.</h2>
          <div className="mt-5 grid gap-3">
            {META_TOOL_RUN_ACTIONS.map((action) => (
              <div className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={action.id}>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-[var(--sm-ink)]">{action.name}</h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{action.owner} / {action.cadence}</p>
                  </div>
                  <Link className="sm-button-secondary" to={action.route}>
                    Control
                  </Link>
                </div>
                <dl className="mt-3 grid gap-3 text-sm leading-6 md:grid-cols-3">
                  <div>
                    <dt className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Trigger</dt>
                    <dd className="text-slate-700">{action.trigger}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Safe mode</dt>
                    <dd className="text-slate-700">{action.safeMode}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Output</dt>
                    <dd className="text-slate-700">{action.output}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Outside the developer session</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">External runtimes to scale.</h2>
          <div className="mt-5 grid gap-3">
            {META_TOOL_EXTERNAL_RUNTIMES.map((runtime) => (
              <Link className="group rounded-[1.2rem] border border-slate-200 bg-white/78 p-4 transition hover:-translate-y-0.5 hover:border-[var(--sm-accent)]" key={runtime.id} to={runtime.route}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-black text-[var(--sm-ink)]">{runtime.name}</h3>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClass(runtime.status)}`}>{runtime.status}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{runtime.role}</p>
                <p className="mt-2 text-xs font-bold text-slate-600">{runtime.scalePath}</p>
                <span className="mt-3 block text-xs font-black uppercase tracking-[0.14em] text-[var(--sm-accent)]">{runtime.controlSurface}</span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Access map</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Resources agents can use with controls.</h2>
          <div className="mt-5 divide-y divide-slate-200/80">
            {META_TOOL_ACCESS_RESOURCES.map((resource) => (
              <div className="grid gap-3 py-4" key={resource.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-black text-[var(--sm-ink)]">{resource.name}</h3>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{resource.category}</p>
                  </div>
                  <Link className="text-xs font-black uppercase tracking-[0.14em] text-[var(--sm-accent)]" to={resource.controlRoute}>
                    Manage
                  </Link>
                </div>
                <p className="text-sm leading-6 text-[var(--sm-muted)]">{resource.accessPattern}</p>
                <p className="text-xs font-bold text-slate-600">{resource.riskControl}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Scale sequence</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">How the machine should keep improving.</h2>
          <ol className="mt-6 grid gap-4">
            {META_TOOL_SCALE_SEQUENCE.map((item, index) => (
              <li className="grid grid-cols-[auto_1fr] gap-4" key={item}>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sm-ink)] text-sm font-black text-white">{index + 1}</span>
                <span className="pt-2 text-sm font-bold leading-6 text-[var(--sm-ink)]">{item}</span>
              </li>
            ))}
          </ol>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/factory">
              Build modules
            </Link>
            <Link className="sm-button-secondary" to="/app/product-ops">
              Promote products
            </Link>
            <Link className="sm-button-secondary" to="/app/policies">
              Review policies
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
