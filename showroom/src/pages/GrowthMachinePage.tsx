import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  GROWTH_AUTOMATION_STACK,
  GROWTH_DAILY_ACTIONS,
  GROWTH_MACHINE_LANES,
  GROWTH_MACHINE_SUMMARY,
  GROWTH_MARKET_SEGMENTS,
  GROWTH_PRODUCTIZATION_STEPS,
} from '../lib/growthMachineModel'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const requiredCapabilities = ['sales.view', 'agent_ops.view', 'tenant_admin.view', 'platform_admin.view'] as const

type Growth100kPlan = {
  generated_for: string
  targetMath: {
    milestone: string
    primary_definition: string
    audience_definition: string
    funnel_targets: Record<string, number>
  }
  sourceResearchActions: {
    title: string
    author: string
    url: string
    action: string
    output_this_week: string
  }[]
  strategicDoctrine: {
    immovable_object: string
    unstoppable_force: string
    synthesis: string
  }
  moatSystem: {
    layer: string
    job: string
    why_it_compounds: string
  }[]
  northStarMetrics: {
    name: string
    target: string
    owner: string
    source: string
  }[]
}

function statusClass(status: string) {
  if (status === 'Live' || status === 'Ready') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }
  if (status === 'Review') {
    return 'border-sky-200 bg-sky-50 text-sky-800'
  }
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

export function GrowthMachinePage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [growth100kPlan, setGrowth100kPlan] = useState<Growth100kPlan | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...requiredCapabilities],
        unauthenticatedMessage: 'Login is required to open Growth Machine.',
        previewMessage: 'Growth Machine needs the authenticated app host.',
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

  useEffect(() => {
    let cancelled = false

    async function loadGrowth100kPlan() {
      try {
        const response = await fetch('/site/supermega-100k-growth-plan.json', { cache: 'no-store' })
        if (!response.ok) {
          return
        }
        const payload = (await response.json()) as Growth100kPlan
        if (!cancelled) {
          setGrowth100kPlan(payload)
        }
      } catch {
        if (!cancelled) {
          setGrowth100kPlan(null)
        }
      }
    }

    void loadGrowth100kPlan()
    return () => {
      cancelled = true
    }
  }, [])

  const metrics = useMemo(
    () => [
      ['Score', `${GROWTH_MACHINE_SUMMARY.score}/100`, 'Ready to operate; needs more real call data.'],
      ['Segments', GROWTH_MARKET_SEGMENTS.length, 'Target markets with first-workflow guesses.'],
      ['Daily actions', GROWTH_DAILY_ACTIONS.length, 'The minimum founder-led execution loop.'],
      ['Machine lanes', GROWTH_MACHINE_LANES.length, 'Offer, content, accounts, outreach, follow-up, learning.'],
    ],
    [],
  )

  if (access.loading) {
    return <div className="sm-chip text-white">Loading Growth Machine...</div>
  }

  if (!access.allowed) {
    return (
      <section className="sm-app-auth-panel">
        <p className="sm-kicker text-[var(--sm-accent)]">Growth Machine</p>
        <h1 className="text-3xl font-black text-white">Operator access required.</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/68">{access.error ?? 'Use a sales, operator, tenant admin, or platform admin account.'}</p>
      </section>
    )
  }

  return (
    <div className="grid gap-6 pb-28">
      <section className="sm-calm-surface overflow-hidden p-0">
        <div className="grid gap-0 xl:grid-cols-[1fr_0.72fr]">
          <div className="p-6 md:p-8">
            <p className="sm-kicker text-[var(--sm-accent)]">{GROWTH_MACHINE_SUMMARY.currentOffer}</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-0.06em] text-[var(--sm-ink)] md:text-6xl">
              Growth system for selling one clear Back Office Workflow Desk.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--sm-muted)]">{GROWTH_MACHINE_SUMMARY.target}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a className="sm-button-primary" href={GROWTH_MACHINE_SUMMARY.publicCta} rel="noreferrer" target="_blank">
                Open live CTA
              </a>
              <Link className="sm-button-secondary" to="/app/revenue/pipeline">
                Work pipeline
              </Link>
              <Link className="sm-button-secondary" to="/app/revenue/offers">
                Offer system
              </Link>
              <Link className="sm-button-secondary" to="/app/revenue/prospecting">
                Source accounts
              </Link>
            </div>
          </div>
          <div className="border-t border-slate-200/80 bg-[#ebe6d8] p-6 md:p-8 xl:border-l xl:border-t-0">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-[var(--sm-muted)]">Productization thesis</p>
            <p className="mt-3 text-xl font-black leading-tight text-[var(--sm-ink)]">{GROWTH_MACHINE_SUMMARY.productThesis}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {metrics.map(([label, value, detail]) => (
                <div className="rounded-3xl border border-slate-300/70 bg-white/70 p-4" key={label}>
                  <strong className="block text-3xl font-black text-[var(--sm-ink)]">{value}</strong>
                  <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{label}</span>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Daily loop</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Do these before adding more tools.</h2>
          <ol className="mt-6 grid gap-3">
            {GROWTH_DAILY_ACTIONS.map((action, index) => (
              <li className="grid grid-cols-[auto_1fr] gap-3 rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={action}>
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--sm-ink)] text-sm font-black text-white">{index + 1}</span>
                <span className="pt-1 text-sm font-bold leading-6 text-[var(--sm-ink)]">{action}</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="sm-terminal p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Machine lanes</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">Every lane needs an output, not just an idea.</h2>
          <div className="mt-5 grid gap-3">
            {GROWTH_MACHINE_LANES.map((lane) => (
              <article className="rounded-[1.2rem] border border-white/8 bg-white/[0.035] p-4" key={lane.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white">{lane.name}</h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--sm-muted)]">{lane.owner}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClass(lane.status)}`}>{lane.status}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{lane.job}</p>
                <p className="mt-3 text-sm font-bold text-white">{lane.output}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-calm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">100k growth plan</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Reach becomes useful only when it creates proof, conversations, and pipeline.</h2>
          </div>
          <a className="sm-button-secondary" href="/site/supermega-100k-growth-plan.json" rel="noreferrer" target="_blank">
            Open plan JSON
          </a>
        </div>
        {growth100kPlan ? (
          <>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                ['Pipeline', `$${growth100kPlan.targetMath.funnel_targets.target_pipeline_usd.toLocaleString('en-US')}`, growth100kPlan.targetMath.primary_definition],
                ['Reach', growth100kPlan.targetMath.funnel_targets.qualified_monthly_reach.toLocaleString('en-US'), growth100kPlan.targetMath.audience_definition],
                ['Pilots', growth100kPlan.targetMath.funnel_targets.paid_pilots.toLocaleString('en-US'), 'Paid pilots from useful conversations, not vanity traffic.'],
              ].map(([label, value, detail]) => (
                <article className="rounded-[1.3rem] border border-slate-200 bg-white/78 p-4" key={label}>
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--sm-muted)]">{label}</p>
                  <strong className="mt-2 block text-3xl font-black text-[var(--sm-ink)]">{value}</strong>
                  <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{detail}</p>
                </article>
              ))}
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
              {[
                ['Immovable object', growth100kPlan.strategicDoctrine.immovable_object],
                ['Unstoppable force', growth100kPlan.strategicDoctrine.unstoppable_force],
                ['Operating synthesis', growth100kPlan.strategicDoctrine.synthesis],
              ].map(([label, detail]) => (
                <article className="rounded-[1.3rem] border border-slate-200 bg-white/78 p-4" key={label}>
                  <h3 className="text-xl font-black text-[var(--sm-ink)]">{label}</h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{detail}</p>
                </article>
              ))}
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
              <article className="rounded-[1.3rem] border border-slate-200 bg-white/78 p-4">
                <h3 className="text-xl font-black text-[var(--sm-ink)]">Source videos into action</h3>
                <div className="mt-4 grid gap-3">
                  {growth100kPlan.sourceResearchActions.slice(0, 5).map((item) => (
                    <div className="rounded-[1rem] bg-slate-50 p-3" key={item.url}>
                      <a className="text-sm font-black text-[var(--sm-ink)] underline decoration-slate-300 underline-offset-4" href={item.url} rel="noreferrer" target="_blank">
                        {item.author}: {item.title}
                      </a>
                      <p className="mt-2 text-sm leading-6 text-[var(--sm-muted)]">{item.action}</p>
                    </div>
                  ))}
                </div>
              </article>
              <article className="rounded-[1.3rem] border border-slate-200 bg-white/78 p-4">
                <h3 className="text-xl font-black text-[var(--sm-ink)]">North star metrics</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {growth100kPlan.northStarMetrics.map((metric) => (
                    <div className="rounded-[1rem] bg-slate-50 p-3" key={metric.name}>
                      <p className="text-sm font-black text-[var(--sm-ink)]">{metric.name}</p>
                      <p className="mt-1 text-lg font-black text-[var(--sm-accent)]">{metric.target}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{metric.owner} | {metric.source}</p>
                    </div>
                  ))}
                </div>
              </article>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {growth100kPlan.moatSystem.map((layer) => (
                <article className="rounded-[1.2rem] border border-slate-200 bg-white/78 p-4" key={layer.layer}>
                  <h3 className="text-lg font-black text-[var(--sm-ink)]">{layer.layer}</h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{layer.job}</p>
                  <p className="mt-3 text-sm font-bold leading-6 text-[var(--sm-ink)]">{layer.why_it_compounds}</p>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-5 text-sm leading-6 text-[var(--sm-muted)]">Run npm run growth:100k to generate the current 100k operating plan.</p>
        )}
      </section>

      <section className="sm-calm-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Target markets</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Start Myanmar-first, but keep the offer global.</h2>
          </div>
          <Link className="sm-button-secondary" to="/app/revenue/prospecting">
            Research accounts
          </Link>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-5">
          {GROWTH_MARKET_SEGMENTS.map((segment) => (
            <article className="rounded-[1.3rem] border border-slate-200 bg-white/78 p-4" key={segment.id}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-black leading-tight text-[var(--sm-ink)]">{segment.name}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{segment.score}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--sm-muted)]">{segment.signal}</p>
              <p className="mt-3 text-sm font-black text-[var(--sm-ink)]">{segment.firstWorkflow}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {segment.channels.map((channel) => (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600" key={channel}>
                    {channel}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Automation architecture</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Automate preparation. Keep sending reviewed.</h2>
          <div className="mt-5 divide-y divide-slate-200/80">
            {GROWTH_AUTOMATION_STACK.map((layer) => (
              <div className="grid gap-4 py-4 lg:grid-cols-[0.45fr_0.85fr_1fr]" key={layer.layer}>
                <h3 className="text-lg font-black text-[var(--sm-ink)]">{layer.layer}</h3>
                <div className="flex flex-wrap gap-2">
                  {layer.tools.map((tool) => (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600" key={tool}>
                      {tool}
                    </span>
                  ))}
                </div>
                <p className="text-sm leading-6 text-[var(--sm-muted)]">{layer.automation}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-calm-surface p-5 md:p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Product path</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--sm-ink)]">Turn this into a sellable Sales Desk.</h2>
          <ol className="mt-6 grid gap-4">
            {GROWTH_PRODUCTIZATION_STEPS.map((step, index) => (
              <li className="grid grid-cols-[auto_1fr] gap-4" key={step}>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--sm-ink)] text-sm font-black text-white">{index + 1}</span>
                <span className="pt-2 text-sm font-bold leading-6 text-[var(--sm-ink)]">{step}</span>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </div>
  )
}
