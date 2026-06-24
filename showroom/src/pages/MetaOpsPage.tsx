import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  getMetaOpsControl,
  runMetaOpsQa,
  type MetaOpsResourceRow,
  type MetaOpsSnapshot,
  type ModuleReadinessContract,
  type QaRunResult,
} from '../lib/workspaceApi'
import { AGENT_INFRASTRUCTURE_DECISIONS, AGENT_INFRASTRUCTURE_RADAR } from '../lib/agentInfrastructureRadar'
import {
  AGENT_FRAMEWORK_DECISIONS,
  AGENT_SECURITY_EXERCISES,
  AGENT_WORK_PROTOCOL,
  RECURSIVE_AGENT_PATTERNS,
  RESEARCH_TO_BUILD_SIGNALS,
  SUPERMEGA_PROGRAM_LAYERS,
  researchAdoptionScore,
} from '../lib/agentResearchMatrix'
import { CREATIVE_AGENT_TOOLKITS, PROTOTYPE_LANES, RD_NEXT_BUILDS, creativeAgentReadinessScore } from '../lib/creativeAgentWorkforce'
import { PLATFORM_BUILD_STACK } from '../lib/platformBuildStack'
import { ERRC_MOVES, STRATEGY_BETS, STRATEGY_SCORES, STRATEGY_SIGNALS, strategyOverallScore } from '../lib/strategyMeetingModel'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const requiredCapabilities = ['tenant_admin.view', 'platform_admin.view'] as const

function statusClass(value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'ready' || normalized === 'healthy') {
    return 'text-emerald-700'
  }
  if (normalized === 'blocked' || normalized === 'error') {
    return 'text-rose-700'
  }
  return 'text-amber-700'
}

function statusLabel(value?: string) {
  return String(value ?? '').trim() || 'unknown'
}

function formatDate(value?: string) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return 'not run'
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString()
}

function shortHash(value?: string) {
  const raw = String(value ?? '').trim()
  return raw.length > 10 ? raw.slice(0, 10) : raw || 'unknown'
}

function textValue(value: unknown, fallback = 'pending') {
  const raw = String(value ?? '').trim()
  return raw || fallback
}

function contractKpi(contract: ModuleReadinessContract) {
  return Array.isArray(contract.KPI) && contract.KPI.length ? contract.KPI.slice(0, 3).join(', ') : 'KPI contract pending'
}

function resourceBadges(resource: MetaOpsResourceRow) {
  const badges: string[] = []
  if (resource.source_record_count) badges.push(`${resource.source_record_count} source records`)
  if (resource.billing_mode) badges.push(resource.billing_mode.replaceAll('_', ' '))
  if (resource.checkout_ready) badges.push('checkout ready')
  if (resource.quote_ready && !resource.checkout_ready) badges.push('quote ready')
  if (resource.script_count && resource.required_script_count) badges.push(`${resource.script_count}/${resource.required_script_count} QA scripts`)
  if (resource.cloud_token_ready) badges.push('cloud token')
  if (resource.mode && badges.length < 3) badges.push(resource.mode.replaceAll('_', ' '))
  return badges.slice(0, 3)
}

function qaCreatedRecordsLabel(run?: QaRunResult | null) {
  const count = Array.isArray(run?.created_records) ? run!.created_records!.length : 0
  if (!count) {
    return 'no production rows created'
  }
  return `${count} tagged row${count === 1 ? '' : 's'}`
}

export function MetaOpsPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [payload, setPayload] = useState<MetaOpsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [qaBusy, setQaBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...requiredCapabilities],
        unauthenticatedMessage: 'Login is required to open Meta Ops.',
        previewMessage: 'Meta Ops needs the authenticated app host.',
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
    if (access.loading || !access.allowed) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function hydrate(options?: { quiet?: boolean }) {
      const quiet = Boolean(options?.quiet)
      if (quiet) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      try {
        const nextPayload = await getMetaOpsControl()
        if (!cancelled) {
          setPayload(nextPayload)
          setError('')
        }
      } catch {
        if (!cancelled) {
          setError('Meta Ops control could not load from this host.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void hydrate()
    const intervalId = window.setInterval(() => {
      void hydrate({ quiet: true })
    }, 60000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [access.allowed, access.loading])

  const modules = useMemo(() => payload?.module_readiness?.contracts ?? [], [payload?.module_readiness?.contracts])
  const connectors = payload?.connectors?.rows ?? []
  const toolBroker = payload?.tool_broker
  const toolBrokerRows = toolBroker?.rows ?? []
  const toolResources = toolBroker?.resources ?? []
  const resourceBrokerMissing = Boolean(toolBroker && !Array.isArray(toolBroker.resources))
  const qaLatest = payload?.qa?.latest ?? null
  const qaHistory = payload?.qa?.history
  const qaHistoryRows = qaHistory?.rows ?? []
  const aliasTargets = payload?.aliases?.targets ?? []
  const githubCli = payload?.github?.cli
  const githubAutomation = payload?.github?.automation
  const githubCliCommands = githubCli?.setup_commands ?? []
  const cloudAutonomy = payload?.cloud_autonomy
  const enterpriseReadiness = payload?.enterprise_readiness
  const enterpriseDimensions = enterpriseReadiness?.dimensions ?? []
  const agentWorkcells = payload?.agent_workcells
  const workcellRows = agentWorkcells?.workcells ?? []
  const workcellRecentRuns = agentWorkcells?.recent_runs ?? []
  const researchAdaptation = payload?.research_adaptation
  const researchSources = researchAdaptation?.sources ?? []
  const researchOperatingRules = researchAdaptation?.operating_rules ?? []
  const researchNextBuilds = researchAdaptation?.next_builds ?? []
  const researchInfrastructureMoves = researchAdaptation?.infrastructure_moves ?? []
  const researchWorkcells = researchAdaptation?.workcell_blueprints ?? []
  const researchModuleRules = researchAdaptation?.module_upgrade_rules ?? []
  const primaryNextAction = payload?.primary_next_action ?? payload?.operator_next_actions?.[0]
  const operatorNextActions = payload?.operator_next_actions ?? []
  const agentReadiness = creativeAgentReadinessScore()
  const researchReadiness = researchAdoptionScore()
  const adoptNowRadar = AGENT_INFRASTRUCTURE_RADAR.filter((item) => item.status === 'Adopt now').slice(0, 4)
  const adoptNowResearch = RESEARCH_TO_BUILD_SIGNALS.filter((signal) => signal.status === 'Adopt')
  const programLayers = SUPERMEGA_PROGRAM_LAYERS
  const frameworkDecisions = AGENT_FRAMEWORK_DECISIONS
  const protocolSteps = AGENT_WORK_PROTOCOL
  const nextBuildStack = PLATFORM_BUILD_STACK.filter((item) => item.stage !== 'Current base').slice(0, 5)
  const strategyScore = strategyOverallScore()
  const weakestStrategyScores = [...STRATEGY_SCORES].sort((left, right) => left.score - right.score).slice(0, 2)

  async function refresh() {
    setRefreshing(true)
    setError('')
    try {
      setPayload(await getMetaOpsControl())
      setMessage('Refreshed Meta Ops.')
    } catch {
      setError('Refresh failed.')
    } finally {
      setRefreshing(false)
    }
  }

  async function runSafeQa() {
    setQaBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await runMetaOpsQa({ target: 'read_only_route_audit', mode: 'safe', cleanup: true })
      setPayload(await getMetaOpsControl())
      setMessage(`Safe QA recorded: ${result.run_id ?? 'run complete'}.`)
    } catch {
      setError('Safe QA run could not be recorded.')
    } finally {
      setQaBusy(false)
    }
  }

  if (access.loading || loading) {
    return <div className="sm-chip text-white">Loading Meta Ops...</div>
  }

  if (!access.allowed) {
    return (
      <section className="sm-app-auth-panel">
        <p className="sm-kicker text-[var(--sm-accent)]">Meta Ops</p>
        <h1 className="text-3xl font-black text-white">Operator access required.</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/68">{access.error ?? 'Use a tenant admin or platform admin account.'}</p>
      </section>
    )
  }

  return (
    <div className="grid gap-6 pb-28">
      <section className="rounded-[2rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.6)] backdrop-blur md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Meta Ops Cockpit</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-black tracking-[-0.04em] text-slate-950 md:text-5xl">One screen for live, tests, modules, agents, and release blockers.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              This is the internal control surface. It shows what can be sold, what is live, what is blocked, and what must be fixed next.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="sm-button-secondary" disabled={refreshing} onClick={() => void refresh()} type="button">
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button className="sm-button-primary" disabled={qaBusy} onClick={() => void runSafeQa()} type="button">
              {qaBusy ? 'Running...' : 'Run safe QA'}
            </button>
          </div>
        </div>
        {message ? <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</p> : null}
        {error ? <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">{error}</p> : null}
        {primaryNextAction?.label ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-sky-700">Next action / {primaryNextAction.priority || 'P1'}</p>
              <strong className="mt-1 block text-base text-slate-950">{primaryNextAction.label}</strong>
              {primaryNextAction.command ? <code className="mt-2 inline-block rounded-xl bg-white px-3 py-2 text-xs text-slate-700">{primaryNextAction.command}</code> : null}
            </div>
            {primaryNextAction.id === 'record-safe-qa' ? (
              <button className="sm-button-primary" disabled={qaBusy} onClick={() => void runSafeQa()} type="button">
                {qaBusy ? 'Running...' : 'Run safe QA'}
              </button>
            ) : (
              <Link className="sm-button-secondary" to={primaryNextAction.route || '/app/meta-ops'}>Open</Link>
            )}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {[
          ['Live', statusLabel(payload?.status), payload?.deployment?.deployment_url ?? 'deployment unknown'],
          ['Routes', `${payload?.route_health?.score ?? 0}/100`, statusLabel(payload?.route_health?.status)],
          ['Modules', `${payload?.module_readiness?.ready_count ?? 0}/${payload?.module_readiness?.count ?? 0}`, statusLabel(payload?.module_readiness?.status)],
          ['QA', statusLabel(qaLatest?.status), qaLatest?.run_id ? formatDate(qaLatest.generated_at) : 'run safe QA first'],
        ].map(([label, value, detail]) => (
          <article className="rounded-[1.4rem] border border-slate-200 bg-white/86 p-4" key={label}>
            <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
            <strong className={`mt-2 block text-2xl font-black ${statusClass(value)}`}>{value}</strong>
            <span className="mt-1 block break-words text-xs leading-5 text-slate-500">{detail}</span>
          </article>
        ))}
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Enterprise Gate</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {enterpriseReadiness?.overall_score ?? 0}/100 readiness
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              A sellable portal needs cloud runtime, durable data, protected access, working modules, source connectors, agent evidence, QA, and billing packaging.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
            <span className={`text-xs font-black uppercase tracking-[0.14em] ${statusClass(enterpriseReadiness?.status)}`}>
              {enterpriseReadiness?.sale_ready ? 'sale ready' : statusLabel(enterpriseReadiness?.status)}
            </span>
            <p className="mt-1 text-xs text-slate-500">target {enterpriseReadiness?.threshold ?? 90}/100</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {enterpriseDimensions.map((dimension) => (
            <article className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4" key={dimension.id || dimension.label}>
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-slate-950">{dimension.label}</strong>
                <span className={`text-xs font-black ${statusClass(dimension.status)}`}>{dimension.score ?? 0}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{dimension.evidence}</p>
            </article>
          ))}
        </div>
        {(enterpriseReadiness?.next_actions ?? []).length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {(enterpriseReadiness?.next_actions ?? []).slice(0, 4).map((action) => (
              <Link className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:border-amber-300" key={action.id || action.label} to={action.route || '/app/meta-ops'}>
                {action.priority || 'P1'} / {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Cloud Autonomy</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Does this keep running when your PC is off?</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {cloudAutonomy?.pc_dependency === 'none_for_core_cloud_loops'
                ? 'Core hosted routes and daily autonomous loops are cloud-owned. Your PC is only for development, manual review, and GitHub auth.'
                : 'Autonomous cloud operation is not fully proven yet. Fix the blockers below before relying on it.'}
            </p>
          </div>
          <span className={`rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusClass(cloudAutonomy?.status)}`}>
            {statusLabel(cloudAutonomy?.status)}
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Runtime</span>
            <strong className="mt-2 block text-sm text-slate-950">{cloudAutonomy?.runtime?.target || 'unknown'}</strong>
            <p className="mt-1 break-all text-xs text-slate-500">{cloudAutonomy?.runtime?.base_url || 'runtime URL pending'}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Persistence</span>
            <strong className={`mt-2 block text-sm ${statusClass(cloudAutonomy?.persistence?.status)}`}>{statusLabel(cloudAutonomy?.persistence?.status)}</strong>
            <p className="mt-1 text-xs text-slate-500">{cloudAutonomy?.persistence?.external_database ? 'Managed database' : 'Not durable enough'}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Cron</span>
            <strong className={`mt-2 block text-sm ${statusClass(cloudAutonomy?.cron?.status)}`}>{statusLabel(cloudAutonomy?.cron?.status)}</strong>
            <p className="mt-1 text-xs text-slate-500">
              {cloudAutonomy?.cron?.jobs?.length ?? 0} orchestrator jobs / {cloudAutonomy?.cron?.ytf_internal_agent_lanes?.length ?? 0} YTF lanes / {cloudAutonomy?.cron?.secret_configured ? 'secret set' : 'secret missing'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Worker Lane</span>
            <strong className={`mt-2 block text-sm ${statusClass(cloudAutonomy?.worker_lane?.status)}`}>{statusLabel(cloudAutonomy?.worker_lane?.status)}</strong>
            <p className="mt-1 text-xs text-slate-500">{cloudAutonomy?.worker_lane?.mode || 'mode unknown'}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <div className="grid gap-2">
            {(cloudAutonomy?.cron?.jobs ?? []).map((job) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3" key={job.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-slate-950">{job.id}</strong>
                  <code className="rounded-xl bg-white px-2 py-1 text-[0.68rem] text-slate-600">{job.schedule}</code>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{job.path} / {job.purpose}</p>
              </div>
            ))}
            {(cloudAutonomy?.cron?.ytf_internal_agent_lanes ?? []).slice(0, 6).map((lane) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3" key={lane.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-slate-950">{lane.id}</strong>
                  <code className="rounded-xl bg-white px-2 py-1 text-[0.68rem] text-slate-600">internal lane</code>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{lane.path} / {lane.purpose}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            {[...(cloudAutonomy?.blockers ?? []), ...(cloudAutonomy?.warnings ?? [])].slice(0, 4).map((item) => (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3" key={item.id}>
                <strong className="text-sm text-amber-950">{item.label}</strong>
                <p className="mt-1 text-xs leading-5 text-amber-800">{item.fix}</p>
              </div>
            ))}
            {!(cloudAutonomy?.blockers?.length || cloudAutonomy?.warnings?.length) ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <strong className="text-sm text-emerald-900">No cloud autonomy blockers reported.</strong>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Invisible Workcells</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Background work, client-safe screens.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {agentWorkcells?.client_rule ?? 'Clients see useful software. Operators see permissions, evidence, queue packets, and review gates.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {agentWorkcells?.smoke_command ? <code className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{agentWorkcells.smoke_command}</code> : null}
            <Link className="sm-button-secondary" to={agentWorkcells?.route || '/app/cloud-agent-army'}>Open control</Link>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Status</span>
            <strong className={`mt-2 block text-sm ${statusClass(agentWorkcells?.status)}`}>{statusLabel(agentWorkcells?.status)}</strong>
            <p className="mt-1 text-xs text-slate-500">Operator-only layer.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Workcells</span>
            <strong className="mt-2 block text-sm text-slate-950">{agentWorkcells?.ready_count ?? 0}/{agentWorkcells?.workcell_count ?? 0}</strong>
            <p className="mt-1 text-xs text-slate-500">Ready or live.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Packets</span>
            <strong className="mt-2 block text-sm text-slate-950">{agentWorkcells?.queue_packet_count ?? 0}</strong>
            <p className="mt-1 text-xs text-slate-500">Run starts from a packet.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Blocked Actions</span>
            <strong className="mt-2 block text-sm text-slate-950">{agentWorkcells?.blocked_action_count ?? 0}</strong>
            <p className="mt-1 text-xs text-slate-500">Needs human approval.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-2 md:grid-cols-2">
            {workcellRows.slice(0, 4).map((workcell) => (
              <article className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3" key={textValue(workcell.id, textValue(workcell.name))}>
                <div className="flex items-start justify-between gap-3">
                  <strong className="text-sm text-slate-950">{textValue(workcell.name, 'Workcell')}</strong>
                  <span className={`rounded-full bg-white px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] ${statusClass(textValue(workcell.maturity))}`}>{textValue(workcell.maturity)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{textValue(workcell.client_output, 'Client output pending.')}</p>
                <p className="mt-2 text-[0.68rem] font-bold text-slate-500">Gate: {textValue(workcell.review_gate, 'human review')}</p>
              </article>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm text-slate-950">Recent packets</strong>
              <span className="text-xs font-black text-slate-400">{workcellRecentRuns.length} shown</span>
            </div>
            <div className="mt-3 grid gap-2">
              {workcellRecentRuns.length ? workcellRecentRuns.slice(0, 4).map((run) => (
                <div className="rounded-2xl bg-white px-3 py-2" key={textValue(run.run_id, textValue(run.created_at))}>
                  <div className="flex items-center justify-between gap-3">
                    <code className="text-[0.68rem] font-bold text-slate-500">{shortHash(textValue(run.run_id))}</code>
                    <span className={`text-[0.68rem] font-black uppercase tracking-[0.1em] ${statusClass(textValue(run.status))}`}>{textValue(run.status)}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{textValue(run.summary, 'No summary recorded.')}</p>
                </div>
              )) : (
                <p className="rounded-2xl bg-white px-3 py-3 text-xs font-bold text-slate-500">No workcell packets have been queued in this workspace yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Strategy Meeting</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">{strategyScore}/100 operating score</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/portal-factory">Factory</Link>
          </div>
          <div className="mt-4 grid gap-2">
            {weakestStrategyScores.map((score) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3" key={score.id}>
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-slate-950">{score.label}</strong>
                  <span className="text-xs font-black text-amber-700">{score.score}/{score.target}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{score.nextMove}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {ERRC_MOVES.map((move) => (
              <div className="rounded-2xl bg-slate-950 px-3 py-3" key={move.id}>
                <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-teal-200">{move.mode}</span>
                <p className="mt-1 text-xs leading-5 text-slate-100">{move.move}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">Portfolio Decisions</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Build fewer, make each consequential.</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {STRATEGY_BETS.map((bet) => (
              <Link className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-teal-200 hover:bg-teal-50" key={bet.id} to={bet.route}>
                <span className={`text-[0.68rem] font-black uppercase tracking-[0.16em] ${bet.decision === 'Double down' ? 'text-emerald-700' : bet.decision === 'Hold' ? 'text-rose-700' : 'text-amber-700'}`}>{bet.decision}</span>
                <strong className="mt-2 block text-base text-slate-950">{bet.name}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-600">{bet.proof}</p>
              </Link>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-3">
            <strong className="text-sm text-sky-950">{STRATEGY_SIGNALS[0]?.source}</strong>
            <p className="mt-1 text-xs leading-5 text-sky-800">{STRATEGY_SIGNALS[0]?.action}</p>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Live Domains</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Alias release gate</h2>
            </div>
            <span className={`rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusClass(payload?.aliases?.status)}`}>
              {statusLabel(payload?.aliases?.status)}
            </span>
          </div>
          <div className="mt-4 grid gap-2">
            {aliasTargets.map((target) => (
              <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 md:grid-cols-[1fr_1fr_auto]" key={target.hostname}>
                <strong className="text-sm text-slate-950">{target.hostname}</strong>
                <span className="text-xs text-slate-500">{target.policy}</span>
                <span className="text-xs font-bold text-slate-600">{target.route}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">{payload?.aliases?.note}</p>
        </article>

        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">Deploy And Git</p>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Deployment</span>
              <strong className="mt-2 block break-all text-sm text-slate-950">{payload?.deployment?.deployment_url || 'unknown'}</strong>
              <p className="mt-1 text-xs text-slate-500">{payload?.deployment?.vercel_env || 'env unknown'} / {shortHash(payload?.deployment?.commit)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">GitHub</span>
              <strong className={`mt-2 block text-sm ${payload?.github?.remote_credential_embedded ? 'text-rose-700' : 'text-slate-950'}`}>
                {payload?.github?.remote_credential_embedded ? 'remote credential embedded' : 'remote sanitized'}
              </strong>
              <p className="mt-1 text-xs text-slate-500">{payload?.github?.api_access_mode || 'local'} / {payload?.github?.message || 'release feed pending'}</p>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">Cloud release automation</span>
                <strong className={`mt-2 block text-sm ${statusClass(githubAutomation?.status)}`}>{statusLabel(githubAutomation?.status)}</strong>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {githubAutomation?.mode || 'not configured'} / cloud token {githubAutomation?.cloud_token_ready ? 'ready' : 'missing'} / local CLI {githubAutomation?.local_cli_ready ? 'ready' : 'not ready'}
                </p>
                {githubAutomation?.next_action ? <p className="mt-2 text-xs leading-5 text-slate-500">{githubAutomation.next_action}</p> : null}
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">GitHub CLI</span>
                <strong className={`mt-2 block text-sm ${statusClass(githubCli?.status)}`}>{statusLabel(githubCli?.status)}</strong>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {githubCli?.installed ? githubCli.version || 'gh installed' : 'gh missing'} / {githubCli?.authenticated ? 'authenticated' : 'not authenticated'}
                </p>
                {githubCli?.message ? <p className="mt-2 text-xs leading-5 text-slate-500">{githubCli.message}</p> : null}
                {githubCliCommands.length ? (
                  <div className="mt-3 grid gap-2">
                    {githubCliCommands.slice(0, 2).map((command) => (
                      <code className="rounded-xl bg-slate-950 px-3 py-2 text-[0.68rem] text-slate-100" key={command}>{command}</code>
                    ))}
                  </div>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">{payload?.github?.repo || 'repo unknown'} / {payload?.github?.branch || 'branch unknown'} / {payload?.github?.is_dirty ? 'dirty' : 'clean'}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">Connectors And Billing</p>
          <div className="mt-4 grid gap-2">
            {connectors.map((connector) => (
              <Link className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 hover:border-teal-200 hover:bg-teal-50" key={connector.id} to={connector.route || '/app/connectors'}>
                <span className={`text-xs font-black uppercase tracking-[0.12em] ${statusClass(connector.status)}`}>{statusLabel(connector.status)}</span>
                <strong className="text-sm text-slate-950">{connector.name}</strong>
                <span className="text-xs leading-5 text-slate-500">{connector.next_fix}</span>
              </Link>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <strong className="text-sm text-amber-900">Billing: {statusLabel(payload?.billing?.status)}</strong>
            <p className="mt-1 text-xs leading-5 text-amber-800">{payload?.billing?.next_fix}</p>
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Sellable portal contracts</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/portal-factory">Factory</Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {modules.map((contract) => (
              <Link className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-teal-200 hover:bg-teal-50" key={contract.id} to={contract.route || '/app/portal-factory'}>
                <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-400">{contract.industryKit}</span>
                <strong className="mt-2 block text-base text-slate-950">{contract.name}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-600">{contract.department} / {contract.role}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{contractKpi(contract)}</p>
                <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">{contract.maturity}</span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Resource Broker</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">What the AI workforce can actually use.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {toolBroker?.resource_summary ?? 'Cloud, data, model, billing, repo, browser, and R&D lanes are checked before agents can depend on them.'}
            </p>
          </div>
          <span className={`rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusClass(toolBroker?.resource_status)}`}>
            {toolBroker?.resource_score ?? 0}/100
          </span>
        </div>
        {resourceBrokerMissing || toolResources.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <strong className="text-sm text-amber-900">
              {resourceBrokerMissing ? 'Resource broker payload is malformed.' : 'Resource broker has no tool lanes yet.'}
            </strong>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              Run <code>npm run smoke:meta-ops</code> and check <code>/api/meta-ops/control</code>. Agents should not depend on new connectors until this section shows concrete lanes.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {toolResources.map((resource) => (
              <Link className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-teal-200 hover:bg-teal-50" key={resource.id || resource.name} to={resource.route || '/app/meta-ops'}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`text-[0.68rem] font-black uppercase tracking-[0.16em] ${statusClass(resource.status)}`}>{statusLabel(resource.status)}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{resource.provider || 'Tool'}</span>
                </div>
                <strong className="mt-2 block text-base text-slate-950">{resource.name}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-600">{resource.current_use}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{resource.evidence || resource.unlock}</p>
                {resourceBadges(resource).length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {resourceBadges(resource).map((badge) => (
                      <span className="rounded-full bg-white px-2 py-1 text-[0.65rem] font-bold text-slate-500" key={badge}>{badge}</span>
                    ))}
                  </div>
                ) : null}
                {resource.enable_command ? (
                  <code className="mt-3 block rounded-xl bg-slate-950 px-3 py-2 text-[0.68rem] leading-5 text-slate-100">{resource.enable_command}</code>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Tool Broker</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Agents can use tools only through policy lanes.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {toolBroker?.summary ?? 'Classify every agent tool before it can read sources, draft decisions, write records, browse, or delegate.'}
            </p>
          </div>
          <span className={`rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusClass(toolBroker?.status)}`}>
            {toolBroker?.score ?? 0}/100
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {toolBrokerRows.map((tool) => (
            <Link className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-sky-200 hover:bg-sky-50" key={tool.id || tool.name} to={tool.route || '/app/security'}>
              <div className="flex items-start justify-between gap-3">
                <span className={`text-[0.68rem] font-black uppercase tracking-[0.16em] ${statusClass(tool.status)}`}>{statusLabel(tool.status)}</span>
                <span className="rounded-full bg-white px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{tool.action_class || 'Policy'}</span>
              </div>
              <strong className="mt-2 block text-base text-slate-950">{tool.name}</strong>
              <p className="mt-2 text-xs leading-5 text-slate-600">{tool.next_gate}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-2 py-1 text-[0.65rem] font-bold text-slate-500">{tool.risk_tier || 'Risk'} risk</span>
                <span className="rounded-full bg-white px-2 py-1 text-[0.65rem] font-bold text-slate-500">{tool.requires_approval ? 'Review gate' : 'Read-only'}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Research Adaptation</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Videos and papers become operating rules.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {researchAdaptation?.summary ?? 'Research is not useful until it changes what the product builds, tests, and refuses to ship.'}
            </p>
          </div>
          <span className={`rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusClass(researchAdaptation?.status)}`}>
            {researchAdaptation?.score ?? 0}/100
          </span>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-3">
            {researchOperatingRules.map((rule) => (
              <Link className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-teal-200 hover:bg-teal-50" key={rule.id || rule.name} to={rule.evidence_route || '/app/meta-ops'}>
                <strong className="text-base text-slate-950">{rule.name}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-600">{rule.rule}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{rule.implementation}</p>
              </Link>
            ))}
          </div>
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              {researchSources.slice(0, 4).map((source) => (
                <a className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-sky-200 hover:bg-sky-50" href={source.source_url} key={source.id || source.name} rel="noreferrer" target="_blank">
                  <span className={`text-[0.68rem] font-black uppercase tracking-[0.16em] ${statusClass(source.status)}`}>{statusLabel(source.status)}</span>
                  <strong className="mt-2 block text-sm text-slate-950">{source.name}</strong>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{source.platform_rule}</p>
                </a>
              ))}
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-amber-700">Next builds</p>
              <div className="mt-3 grid gap-2">
                {researchNextBuilds.map((item) => (
                  <Link className="rounded-xl bg-white/80 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-white" key={item.id || item.label} to={item.route || '/app/meta-ops'}>
                    {item.priority || 'P2'} / {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">Agent workcells</p>
              <span className="rounded-full bg-white px-2 py-1 text-[0.65rem] font-black text-slate-500">{researchWorkcells.length} blueprints</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {researchWorkcells.slice(0, 4).map((cell) => (
                <Link className="rounded-xl border border-white bg-white/85 p-3 hover:border-teal-200 hover:bg-teal-50" key={cell.id || cell.name} to={cell.route || '/app/meta-ops'}>
                  <span className={`text-[0.65rem] font-black uppercase tracking-[0.14em] ${statusClass(cell.status)}`}>{statusLabel(cell.status)}</span>
                  <strong className="mt-1 block text-sm text-slate-950">{cell.name}</strong>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{cell.trigger}</p>
                  <p className="mt-2 text-xs font-bold leading-5 text-slate-700">{cell.output}</p>
                </Link>
              ))}
            </div>
          </div>
          <div className="grid gap-4">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-sky-700">Infrastructure moves</p>
              <div className="mt-3 grid gap-2">
                {researchInfrastructureMoves.slice(0, 3).map((move) => (
                  <Link className="rounded-xl bg-white/85 px-3 py-2 text-xs text-sky-950 hover:bg-white" key={move.id || move.name} to={move.route || '/app/meta-ops'}>
                    <strong>{move.provider}</strong> / {move.name}
                  </Link>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-emerald-700">Module upgrade gates</p>
              <div className="mt-3 grid gap-2">
                {researchModuleRules.slice(0, 3).map((rule) => (
                  <Link className="rounded-xl bg-white/85 px-3 py-2 text-xs text-emerald-950 hover:bg-white" key={rule.id || rule.module} to={rule.route || '/app/meta-ops'}>
                    <strong>{rule.module}</strong> / {rule.ai_action}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">R&D Agent Equipment</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">{agentReadiness.score}/100 equipped</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/lab">Open R&D</Link>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{agentReadiness.gap}</p>
          <div className="mt-4 grid gap-2">
            {CREATIVE_AGENT_TOOLKITS.slice(0, 5).map((kit) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3" key={kit.id}>
                <strong className="text-sm text-slate-950">{kit.name}</strong>
                <p className="mt-1 text-xs leading-5 text-slate-500">{kit.proof}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Prototype Portfolio</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Three portal families, not infinite demos</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/portal-factory">Factory</Link>
          </div>
          <div className="mt-4 grid gap-3">
            {PROTOTYPE_LANES.map((lane) => (
              <Link className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-teal-200 hover:bg-teal-50" key={lane.id} to={lane.proofRoute}>
                <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-400">{lane.buyer}</span>
                <strong className="mt-2 block text-base text-slate-950">{lane.name}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-600">{lane.wedge}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">First modules: {lane.modules.slice(0, 3).join(', ')}</p>
              </Link>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <strong className="text-sm text-amber-900">Next R&D build: {RD_NEXT_BUILDS[0]?.title}</strong>
            <p className="mt-1 text-xs leading-5 text-amber-800">{RD_NEXT_BUILDS[0]?.notes}</p>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent Toolchain Radar</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Adopt now, then govern.</h2>
          <div className="mt-4 grid gap-3">
            {adoptNowRadar.map((item) => (
              <a className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-teal-200 hover:bg-teal-50" href={item.sourceUrl} key={item.id} rel="noreferrer" target="_blank">
                <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-400">{item.provider} / {item.status}</span>
                <strong className="mt-2 block text-base text-slate-950">{item.name}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-600">{item.productMove}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.modules.slice(0, 3).join(', ')}</p>
              </a>
            ))}
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">Build Stack</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">What agents get next.</h2>
          <div className="mt-4 grid gap-2">
            {nextBuildStack.map((item) => (
              <a className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 hover:border-teal-200 hover:bg-teal-50" href={item.sourceUrl} key={item.id} rel="noreferrer" target="_blank">
                <strong className="text-sm text-slate-950">{item.name}</strong>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.primaryTool} / {item.outcome}</p>
              </a>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-3">
            <strong className="text-sm text-sky-950">{AGENT_INFRASTRUCTURE_DECISIONS[0]?.decision}</strong>
            <p className="mt-1 text-xs leading-5 text-sky-800">{AGENT_INFRASTRUCTURE_DECISIONS[0]?.nextBuild}</p>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Program Redesign</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">The platform is six layers, not random portals.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                This is the operating map for scaling: public offer, app kernel, portal factory, module OS, agent workforce, and Meta Ops.
              </p>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-teal-700">
              {researchReadiness.programLayers} layers
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {programLayers.map((layer) => (
              <Link className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-teal-200 hover:bg-teal-50" key={layer.id} to={layer.primarySurface.startsWith('/') ? layer.primarySurface : '/app/meta-ops'}>
                <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-400">{layer.owner}</span>
                <strong className="mt-2 block text-base text-slate-950">{layer.name}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-600">{layer.purpose}</p>
                <p className="mt-3 text-xs leading-5 text-slate-500">Proof: {layer.proof}</p>
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent Work Protocol</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Agents must earn autonomy.</h2>
          <div className="mt-4 grid gap-2">
            {protocolSteps.map((step, index) => (
              <Link className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 hover:border-sky-200 hover:bg-sky-50" key={step.id} to={step.route}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">{index + 1}</span>
                <span>
                  <strong className="block text-sm text-slate-950">{step.name}</strong>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">{step.gate}</span>
                </span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Framework Decisions</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Use frameworks as lanes, not religion.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Production stays deterministic-first with governed agents. Open frameworks are benches, enterprise comparisons, or security controls until they prove value.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-600">
            {researchReadiness.frameworkDecisions} decisions
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {frameworkDecisions.map((decision) => (
            <a className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-teal-200 hover:bg-teal-50" href={decision.sourceUrl} key={decision.id} rel="noreferrer" target="_blank">
              <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-teal-700">{decision.adoptAs}</span>
              <strong className="mt-2 block text-base text-slate-950">{decision.framework}</strong>
              <p className="mt-2 text-xs leading-5 text-slate-600">{decision.supermegaMove}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Research To Build</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">{researchReadiness.score}/100 research adoption</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/lab">Lab</Link>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{researchReadiness.gap}</p>
          <div className="mt-4 grid gap-2">
            {adoptNowResearch.map((signal) => (
              <a className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 hover:border-teal-200 hover:bg-teal-50" href={signal.sourceUrl} key={signal.id} rel="noreferrer" target="_blank">
                <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-teal-700">{signal.status}</span>
                <strong className="mt-1 block text-sm text-slate-950">{signal.source}</strong>
                <p className="mt-1 text-xs leading-5 text-slate-600">{signal.productRule}</p>
              </a>
            ))}
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">Recursive Teams With Safety Gates</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Use swarms only where they beat one good workflow.</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {RECURSIVE_AGENT_PATTERNS.slice(0, 2).map((pattern) => (
              <Link className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 hover:border-sky-200 hover:bg-sky-50" key={pattern.id} to={pattern.route}>
                <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-400">{pattern.basedOn}</span>
                <strong className="mt-2 block text-base text-slate-950">{pattern.name}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-600">{pattern.gate}</p>
              </Link>
            ))}
            {AGENT_SECURITY_EXERCISES.slice(0, 2).map((exercise) => (
              <Link className="rounded-2xl border border-rose-100 bg-rose-50/80 p-4 hover:border-rose-200" key={exercise.id} to="/app/security">
                <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-rose-700">Security drill</span>
                <strong className="mt-2 block text-base text-rose-950">{exercise.risk}</strong>
                <p className="mt-2 text-xs leading-5 text-rose-800">{exercise.control}</p>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">QA History</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">{qaLatest?.run_id || 'No QA run yet'}</h2>
          <p className="mt-2 text-sm text-slate-600">{formatDate(qaLatest?.generated_at)} / {statusLabel(qaLatest?.cleanup_status)} / {qaCreatedRecordsLabel(qaLatest)}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            <span className="rounded-2xl bg-slate-50 px-2 py-3">{qaHistory?.summary?.ready_count ?? 0} ready</span>
            <span className="rounded-2xl bg-slate-50 px-2 py-3">{qaHistory?.summary?.failure_count ?? 0} failures</span>
            <span className="rounded-2xl bg-slate-50 px-2 py-3">{qaHistory?.summary?.retained_record_count ?? 0} retained</span>
          </div>
          <div className="mt-4 grid gap-2">
            {qaHistoryRows.slice(0, 4).map((run) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" key={run.audit_event_id || run.run_id}>
                <div className="flex items-center justify-between gap-3">
                  <strong>{run.run_id || 'qa-run'}</strong>
                  <span className={`text-xs font-black uppercase tracking-[0.12em] ${statusClass(run.status)}`}>{statusLabel(run.status)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{formatDate(run.generated_at || run.recorded_at)} / {run.route_check_count ?? run.route_checks?.length ?? 0} routes / {run.failure_count ?? run.failures?.length ?? 0} failures</p>
              </div>
            ))}
            {(qaLatest?.feature_checks ?? []).slice(0, 4).map((check) => (
              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700" key={String(check.id ?? check.detail)}>
                <strong>{String(check.id ?? 'check')}</strong>
                <span className="ml-2 text-xs text-slate-500">{String(check.status ?? 'unknown')}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.6rem] border border-slate-200 bg-white/88 p-5">
          <p className="sm-kicker text-[var(--sm-accent)]">Next Fix</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Release checklist</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{payload?.next_fix || 'Refresh Meta Ops to load the next fix.'}</p>
          <div className="mt-4 grid gap-2">
            {operatorNextActions.slice(0, 4).map((action) => (
              <Link className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:border-sky-200 hover:bg-sky-50" key={action.id || action.label} to={action.route || '/app/meta-ops'}>
                {action.priority || 'P2'} / {action.label || action.command}
              </Link>
            ))}
            {(payload?.qa?.commands ?? []).slice(0, 4).map((command) => (
              <code className="rounded-2xl bg-slate-950 px-3 py-2 text-xs text-slate-100" key={command}>{command}</code>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
