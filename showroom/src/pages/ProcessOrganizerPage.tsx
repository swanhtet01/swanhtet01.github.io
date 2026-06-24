import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  PROCESS_LOOPS,
  PROCESS_MEETING_AGENDA,
  PROCESS_ORGANIZER_MISSION,
  PROCESS_REPORT_COMMANDS,
  PROCESS_WORKSTREAMS,
  SUPPORT_AGENT_ROLES,
  type ProcessStatus,
} from '../lib/processOrganizer'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const requiredCapabilities = ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'] as const

function statusClass(status: ProcessStatus) {
  if (status === 'working') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }
  if (status === 'blocked') {
    return 'border-rose-200 bg-rose-50 text-rose-800'
  }
  if (status === 'next') {
    return 'border-blue-200 bg-blue-50 text-blue-800'
  }
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

function statusLabel(status: ProcessStatus) {
  if (status === 'working') return 'Working'
  if (status === 'blocked') return 'Blocked'
  if (status === 'next') return 'Next'
  return 'Watch'
}

export function ProcessOrganizerPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...requiredCapabilities],
        unauthenticatedMessage: 'Login is required to open Process Organizer.',
        previewMessage: 'Process Organizer needs the authenticated app host.',
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

  const statusCounts = useMemo(() => {
    return PROCESS_WORKSTREAMS.reduce(
      (counts, item) => {
        counts[item.status] += 1
        return counts
      },
      { working: 0, watch: 0, blocked: 0, next: 0 } satisfies Record<ProcessStatus, number>,
    )
  }, [])

  if (access.loading) {
    return <div className="sm-chip text-white">Loading Process Organizer...</div>
  }

  if (!access.allowed) {
    return (
      <section className="sm-app-auth-panel">
        <p className="sm-kicker text-[var(--sm-accent)]">Process Organizer</p>
        <h1 className="text-3xl font-black text-white">Operator access required.</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/68">{access.error ?? 'Use an operator, architect, tenant admin, or platform admin account.'}</p>
      </section>
    )
  }

  return (
    <div className="grid gap-6 pb-28">
      <section className="sm-calm-surface overflow-hidden p-0">
        <div className="grid gap-0 xl:grid-cols-[1fr_0.72fr]">
          <div className="p-6 md:p-8">
            <p className="sm-kicker text-[var(--sm-accent)]">{PROCESS_ORGANIZER_MISSION.title}</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-0.05em] text-[var(--sm-ink)] md:text-6xl">
              Keep every thread, agent, and product lane moving.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--sm-muted)]">{PROCESS_ORGANIZER_MISSION.operatingRule}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/app/meta-tools">
                Open Meta Tools
              </Link>
              <Link className="sm-button-secondary" to="/app/meta-ops">
                Run release checks
              </Link>
              <Link className="sm-button-secondary" to="/app/product-ops">
                Product ops
              </Link>
            </div>
          </div>
          <aside className="border-t border-slate-200/80 bg-[#ebe6d8] p-6 md:p-8 xl:border-l xl:border-t-0">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-muted)]">Review question</p>
            <p className="mt-3 text-2xl font-black leading-tight text-[var(--sm-ink)]">{PROCESS_ORGANIZER_MISSION.reviewQuestion}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                ['Working', statusCounts.working],
                ['Watch', statusCounts.watch],
                ['Next', statusCounts.next],
                ['Blocked', statusCounts.blocked],
              ].map(([label, value]) => (
                <div className="rounded-3xl border border-slate-300/70 bg-white/70 p-4" key={label}>
                  <strong className="block text-3xl font-black text-[var(--sm-ink)]">{value}</strong>
                  <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{label}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="sm-calm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Workstreams</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Active lanes to monitor and support.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/workforce">
            Agent workforce
          </Link>
        </div>
        <div className="mt-5 divide-y divide-slate-200/80">
          {PROCESS_WORKSTREAMS.map((stream) => (
            <article className="grid gap-4 py-5 xl:grid-cols-[0.7fr_1.1fr_0.8fr]" key={stream.id}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-black text-[var(--sm-ink)]">{stream.name}</h3>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${statusClass(stream.status)}`}>
                    {statusLabel(stream.status)}
                  </span>
                </div>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.15em] text-[var(--sm-muted)]">{stream.owner}</p>
              </div>
              <div>
                <p className="text-sm leading-6 text-[var(--sm-muted)]">{stream.currentState}</p>
                <p className="mt-3 text-sm font-bold text-[var(--sm-ink)]">{stream.supportAction}</p>
              </div>
              <div className="grid content-start gap-3">
                <div className="flex flex-wrap gap-2">
                  {stream.evidence.map((item) => (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
                <Link className="sm-button-secondary justify-center" to={stream.route}>
                  Open lane
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Operating loops</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">The cadence that keeps work moving.</h2>
          <div className="mt-5 grid gap-3">
            {PROCESS_LOOPS.map((loop) => (
              <Link className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4 transition hover:-translate-y-0.5 hover:border-[var(--sm-accent)]" key={loop.id} to={loop.route}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-[var(--sm-ink)]">{loop.name}</h3>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{loop.owner} / {loop.cadence}</p>
                  </div>
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-[var(--sm-accent)]">Open</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{loop.definition}</p>
                <p className="mt-2 text-xs font-bold text-slate-600">{loop.output}</p>
              </Link>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Support agents</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Delegates to use when the work gets wide.</h2>
          <div className="mt-5 divide-y divide-slate-200/80">
            {SUPPORT_AGENT_ROLES.map((agent) => (
              <div className="py-4" key={agent.id}>
                <h3 className="font-black text-[var(--sm-ink)]">{agent.name}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{agent.role}</p>
                <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Use when</dt>
                    <dd className="mt-1 text-slate-700">{agent.whenToUse}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Handoff</dt>
                    <dd className="mt-1 text-slate-700">{agent.handoff}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.82fr]">
        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Meeting agenda</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">How we review progress together.</h2>
          <ol className="mt-6 grid gap-4">
            {PROCESS_MEETING_AGENDA.map((item, index) => (
              <li className="grid grid-cols-[auto_1fr] gap-4" key={item}>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sm-ink)] text-sm font-black text-white">{index + 1}</span>
                <span className="pt-2 text-sm font-bold leading-6 text-[var(--sm-ink)]">{item}</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Report commands</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Checks to run before decisions.</h2>
          <div className="mt-5 grid gap-3">
            {PROCESS_REPORT_COMMANDS.map((command) => (
              <code className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-bold text-slate-700" key={command}>
                {command}
              </code>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
