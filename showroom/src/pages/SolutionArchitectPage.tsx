import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
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

function toggleString(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function togglePriority(values: SolutionPriority[], value: SolutionPriority) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

export function SolutionArchitectPage() {
  const [request, setRequest] = useState<SolutionArchitectRequest>(initialRequest)
  const [apiReady, setApiReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'workspace' | 'local'>('local')
  const [blueprint, setBlueprint] = useState<SolutionBlueprint>(() => buildLocalSolutionBlueprint(initialRequest))

  useEffect(() => {
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
  }, [])

  async function buildBlueprint(nextRequest = request) {
    setBusy(true)
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
            <Link className="sm-button-secondary" to="/contact?package=Action%20OS">
              Start this rollout
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
