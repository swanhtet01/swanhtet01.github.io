import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'
import { buildLocalSolutionBlueprint, type SolutionArchitectRequest, type SolutionBlueprint, type SolutionPriority } from '../lib/solutionArchitect'

const priorityOptions: Array<{ key: SolutionPriority; label: string; hint: string }> = [
  { key: 'actions', label: 'Action control', hint: 'Owners, due dates, and follow-up' },
  { key: 'supplier', label: 'Supplier risk', hint: 'Delay, customs, and documentation' },
  { key: 'receiving', label: 'Receiving', hint: 'Inbound receipt, variance, and hold' },
  { key: 'inventory', label: 'Inventory', hint: 'Stock watch and reorder pressure' },
  { key: 'quality', label: 'Quality', hint: 'Incident, CAPA, and closeout' },
  { key: 'cash', label: 'Cash', hint: 'Invoice, collection, and payment follow-up' },
  { key: 'sales', label: 'Sales', hint: 'Demand, distributor, and market watch' },
  { key: 'production', label: 'Production', hint: 'Shift, downtime, and plant execution' },
  { key: 'director_visibility', label: 'Director view', hint: 'Short leadership view and reviews' },
]

const dataSourceOptions = ['gmail', 'drive', 'sheets', 'whatsapp_exports', 'local_files', 'erp_extracts']
const toolOptions = ['gmail', 'drive', 'sheets', 'whatsapp', 'manual_trackers', 'existing_erp']

const initialRequest: SolutionArchitectRequest = {
  company_name: 'Yangon Tyre',
  sector: 'factory',
  team_size: 120,
  site_count: 1,
  priorities: ['actions', 'supplier', 'receiving', 'quality', 'director_visibility'],
  current_tools: ['gmail', 'drive', 'sheets', 'existing_erp'],
  data_sources: ['gmail', 'drive', 'sheets', 'erp_extracts'],
  pain_points: 'Receiving variances, supplier files, and quality incidents are spread across Gmail, Drive, Sheets, and ERP exports, so managers see problems too late.',
}

type LaunchSnapshotPayload = {
  generated_at?: string
  workspace?: {
    workspace_name?: string
    workspace_slug?: string
  }
  task_summary?: {
    saved_count?: number
    saved_task_ids?: string[]
  }
  rollout_pack?: {
    primary_pack?: string
    wedge_product?: string
    recommended_modules?: string[]
    first_30_days?: string[]
    agent_teams?: string[]
  }
}

type LaunchResponse = {
  status?: string
  message?: string
  snapshot_key?: string
  workspace_snapshot_key?: string
  blueprint?: SolutionBlueprint
  payload?: LaunchSnapshotPayload
  tasks?: {
    saved_count?: number
    saved_task_ids?: string[]
  }
}

function formatDateTime(value?: string) {
  if (!value) {
    return 'Not launched yet'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function toggleString(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function togglePriority(values: SolutionPriority[], value: SolutionPriority) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

export function SolutionArchitectPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [request, setRequest] = useState<SolutionArchitectRequest>(initialRequest)
  const [apiReady, setApiReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [mode, setMode] = useState<'workspace' | 'local'>('local')
  const [blueprint, setBlueprint] = useState<SolutionBlueprint>(() => buildLocalSolutionBlueprint(initialRequest))
  const [launchMessage, setLaunchMessage] = useState<string | null>(null)
  const [launchSnapshot, setLaunchSnapshot] = useState<LaunchSnapshotPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: ['architect.view', 'tenant_admin.view', 'platform_admin.view'],
        unauthenticatedMessage: 'Login is required to open Solution Architect.',
        previewMessage: 'Solution Architect is only available in the authenticated workspace.',
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
    if (access.loading || !access.authenticated || !access.allowed) {
      return
    }

    let cancelled = false

    async function checkApi() {
      const result = await checkWorkspaceHealth()
      if (!cancelled) {
        setApiReady(result.ready)
        setMode(result.ready ? 'workspace' : 'local')
      }
    }

    void checkApi()
    return () => {
      cancelled = true
    }
  }, [access.allowed, access.authenticated, access.loading])

  async function buildBlueprint(nextRequest = request) {
    setBusy(true)
    setLaunchMessage(null)
    try {
      if (apiReady) {
        const payload = await workspaceFetch<{ blueprint: SolutionBlueprint }>('/api/tools/solution-architect', {
          method: 'POST',
          body: JSON.stringify(nextRequest),
        })
        setBlueprint(payload.blueprint)
        setMode('workspace')
        return
      }

      setBlueprint(buildLocalSolutionBlueprint(nextRequest))
      setMode('local')
    } finally {
      setBusy(false)
    }
  }

  async function launchBlueprint() {
    setLaunching(true)
    setLaunchMessage(null)
    try {
      const payload = await workspaceFetch<LaunchResponse>('/api/tools/solution-architect/launch', {
        method: 'POST',
        body: JSON.stringify({
          ...request,
          create_tasks: true,
        }),
      })
      if (payload.blueprint) {
        setBlueprint(payload.blueprint)
      }
      setLaunchSnapshot(payload.payload ?? null)
      setMode('workspace')
      setLaunchMessage(payload.message ?? 'Rollout pack saved.')
    } catch (error) {
      setLaunchMessage(error instanceof Error ? error.message : 'Could not launch the rollout pack.')
    } finally {
      setLaunching(false)
    }
  }

  if (access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="SUPERMEGA.dev tool"
          title="Loading Solution Architect."
          description="Checking workspace access for the rollout design console."
        />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="SUPERMEGA.dev tool"
          title="Authenticated workspace required."
          description="Solution Architect is an internal rollout-design console and does not run in public preview mode."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error ?? 'Solution Architect is only available in the authenticated workspace.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/architect">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/products">
              Open products
            </Link>
          </div>
        </section>
      </div>
    )
  }

  if (!access.allowed) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="SUPERMEGA.dev tool"
          title="Architect access required."
          description="This console is reserved for implementation architects and tenant control roles that can design rollouts and launch execution packs."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask an architect, tenant admin, or platform admin to grant access.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/workbench">
              Open workbench
            </Link>
            <Link className="sm-button-secondary" to="/app/actions">
              Open my queue
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="SUPERMEGA.dev tool"
        title="Solution Architect"
        description="Turn one company profile into a recommended SUPERMEGA.dev stack: wedge product, modules, agent teams, roles, rollout order, and the next infrastructure layer."
      />

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Build a blueprint</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Design the tenant rollout before we sell or build it.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This is the bridge between a messy business profile and a reusable SUPERMEGA.dev rollout. It helps us decide the wedge product, the first modules, the team structure, and the next stack.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Company
              <input
                className="sm-input"
                onChange={(event) => setRequest((current) => ({ ...current, company_name: event.target.value }))}
                value={request.company_name}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Sector
                <select
                  className="sm-input"
                  onChange={(event) => setRequest((current) => ({ ...current, sector: event.target.value as SolutionArchitectRequest['sector'] }))}
                  value={request.sector}
                >
                  <option value="factory">Factory</option>
                  <option value="distribution">Distribution</option>
                  <option value="services">Services</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Team size
                <input
                  className="sm-input"
                  min={1}
                  onChange={(event) => setRequest((current) => ({ ...current, team_size: Number(event.target.value) || 1 }))}
                  type="number"
                  value={request.team_size}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
                Sites
                <input
                  className="sm-input"
                  min={1}
                  onChange={(event) => setRequest((current) => ({ ...current, site_count: Number(event.target.value) || 1 }))}
                  type="number"
                  value={request.site_count}
                />
              </label>
            </div>

            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[var(--sm-muted)]">Priority jobs to fix</p>
              <div className="grid gap-3 md:grid-cols-2">
                {priorityOptions.map((item) => {
                  const active = request.priorities.includes(item.key)
                  return (
                    <button
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        active
                          ? 'border-[rgba(37,208,255,0.34)] bg-[rgba(37,208,255,0.1)] text-white'
                          : 'border-white/8 bg-[rgba(255,255,255,0.03)] text-[var(--sm-muted)]'
                      }`}
                      key={item.key}
                      onClick={() => setRequest((current) => ({ ...current, priorities: togglePriority(current.priorities, item.key) }))}
                      type="button"
                    >
                      <p className="font-semibold">{item.label}</p>
                      <p className="mt-2 text-sm">{item.hint}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-3">
                <p className="text-sm font-semibold text-[var(--sm-muted)]">Current tools</p>
                {toolOptions.map((item) => (
                  <button
                    className={`sm-chip justify-start text-left ${request.current_tools.includes(item) ? 'text-white' : 'text-[var(--sm-muted)]'}`}
                    key={item}
                    onClick={() => setRequest((current) => ({ ...current, current_tools: toggleString(current.current_tools, item) }))}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="grid gap-3">
                <p className="text-sm font-semibold text-[var(--sm-muted)]">Data sources</p>
                {dataSourceOptions.map((item) => (
                  <button
                    className={`sm-chip justify-start text-left ${request.data_sources.includes(item) ? 'text-white' : 'text-[var(--sm-muted)]'}`}
                    key={item}
                    onClick={() => setRequest((current) => ({ ...current, data_sources: toggleString(current.data_sources, item) }))}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Main pain point
              <textarea
                className="sm-input min-h-36"
                onChange={(event) => setRequest((current) => ({ ...current, pain_points: event.target.value }))}
                value={request.pain_points}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" onClick={() => void buildBlueprint()} type="button">
                {busy ? 'Building...' : 'Build blueprint'}
              </button>
              <button className="sm-button-secondary" disabled={!apiReady || busy || launching} onClick={() => void launchBlueprint()} type="button">
                {launching ? 'Launching...' : 'Launch rollout pack'}
              </button>
              <button
                className="sm-button-secondary"
                onClick={() => {
                  setRequest(initialRequest)
                  void buildBlueprint(initialRequest)
                }}
                type="button"
              >
                Load Yangon Tyre sample
              </button>
            </div>
            {!apiReady ? <div className="sm-chip text-white">Launch requires the live workspace API and a logged-in workspace session.</div> : null}
            {launchMessage ? <div className="sm-chip text-white">{launchMessage}</div> : null}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Blueprint</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Recommended tenant rollout</h2>
            </div>
            <span className="sm-status-pill">
              <span className={`sm-led ${blueprint ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {mode === 'workspace' ? 'Workspace mode' : 'Local mode'}
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            <div className="sm-proof-card">
              <p className="sm-kicker text-[var(--sm-accent)]">Primary pack</p>
              <p className="mt-3 text-2xl font-bold text-white">{blueprint.primary_pack}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{blueprint.value_prop}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Wedge</p>
                <p className="mt-2">{blueprint.wedge_product}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Flagship</p>
                <p className="mt-2">{blueprint.flagship}</p>
              </div>
            </div>

            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Recommended modules</p>
              <div className="mt-3 grid gap-3">
                {blueprint.recommended_modules.map((module) => (
                  <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3" key={module.name}>
                    <p className="font-semibold text-white">{module.name}</p>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{module.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Semi-products</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {blueprint.semi_products.map((item) => (
                    <li key={item.name}>
                      <strong className="text-white">{item.name}:</strong> {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Free proof tools</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {blueprint.free_tools.map((item) => (
                    <li key={item.name}>
                      <strong className="text-white">{item.name}:</strong> {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Rollout order</p>
          <div className="mt-5 grid gap-3">
            {blueprint.implementation_order.map((item, index) => (
              <div className="sm-command-row" key={item}>
                <div>
                  <p className="font-semibold text-white">{item}</p>
                </div>
                <span className="sm-chip text-white">0{index + 1}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {blueprint.first_30_days.map((item) => (
              <div className="sm-chip text-white" key={item}>
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Architecture and teams</p>
          <div className="mt-5 grid gap-3">
            {blueprint.agent_teams.map((team) => (
              <div className="sm-command-row" key={team.name}>
                <div>
                  <p className="font-semibold text-white">{team.name}</p>
                  <p className="text-sm text-[var(--sm-muted)]">{team.role}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Next stack</p>
              <ul className="mt-3 space-y-2 text-sm">
                {blueprint.next_stack.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">UX surfaces</p>
              <ul className="mt-3 space-y-2 text-sm">
                {blueprint.ux_surfaces.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/actions">
              Open Action OS
            </Link>
            <Link className="sm-button-secondary" to="/app/meta">
              Open Meta
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Open Platform Admin
            </Link>
            <Link className="sm-button-secondary" to="/contact?package=Action%20OS">
              Start this rollout
            </Link>
          </div>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.98fr_1.02fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Launch state</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Save the rollout and open the actual work.</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Last launch</p>
              <p className="mt-2 text-sm">{formatDateTime(launchSnapshot?.generated_at)}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Workspace</p>
              <p className="mt-2 text-sm">{launchSnapshot?.workspace?.workspace_name || 'No launch saved yet'}</p>
            </div>
            <div className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Queued tasks</p>
              <p className="mt-2 text-2xl font-bold">{launchSnapshot?.task_summary?.saved_count ?? 0}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {launchSnapshot?.rollout_pack?.recommended_modules?.length ? (
              launchSnapshot.rollout_pack.recommended_modules.slice(0, 5).map((item) => (
                <div className="sm-chip text-white" key={item}>
                  {item}
                </div>
              ))
            ) : (
              <div className="sm-chip text-[var(--sm-muted)]">Launch the blueprint to save the rollout pack and push tasks into the workspace queue.</div>
            )}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">What Launch Does</p>
          <h2 className="mt-3 text-3xl font-bold text-white">This is no longer just a planning surface.</h2>
          <div className="mt-5 grid gap-3">
            <div className="sm-proof-card">
              <p className="font-semibold text-white">Save rollout snapshot</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">The blueprint becomes a saved tenant rollout pack the control plane can read later.</p>
            </div>
            <div className="sm-proof-card">
              <p className="font-semibold text-white">Queue launch tasks</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Implementation, platform, delivery, and agent-ops work gets created inside the workspace backlog.</p>
            </div>
            <div className="sm-proof-card">
              <p className="font-semibold text-white">Feed Platform Admin</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">Platform Admin can then show the latest rollout pack beside modules, roles, and rollout phases.</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}
