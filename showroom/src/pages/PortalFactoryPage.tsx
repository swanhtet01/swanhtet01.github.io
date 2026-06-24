import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { INDUSTRY_PORTAL_KITS, industryPortalRolloutLink } from '../lib/industryPortalKits'
import { buildPortalFactoryManifest, type PortalFactoryManifestModule } from '../lib/portalFactoryManifest'
import {
  PLANT_OS_AGENT_CREWS,
  PLANT_OS_PACKAGE_TIERS,
} from '../lib/plantOsSaasTemplateModel'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'

const REQUIRED_CAPABILITIES = ['agent_ops.view', 'architect.view', 'tenant_admin.view', 'platform_admin.view'] as const
const DEFAULT_BRIEF = {
  clientName: 'New factory client',
  priorityWorkflow: 'Managers need one simple place to record issues, route owners, review proof, and create source-backed decisions.',
  dataSources: 'Google Drive, Gmail, Sheets, forms, uploads',
  roles: 'Admin, plant manager, manager',
}

function splitBriefList(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function scoreModule(module: PortalFactoryManifestModule, briefText: string) {
  const haystack = [module.id, module.name, module.workspace, module.ownerRole, module.kpi, ...module.inputs, ...module.outputs].join(' ').toLowerCase()
  return briefText
    .split(/\W+/)
    .filter((token) => token.length > 3)
    .reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), module.launchMode === 'Day 1' || module.layer !== 'Industry' ? 2 : 0)
}

function pickBriefModules(modules: PortalFactoryManifestModule[], briefText: string) {
  return [...modules]
    .filter((module) => module.layer === 'Industry')
    .map((module) => ({ module, score: scoreModule(module, briefText) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => item.module)
}

function compact(value: string, max = 120) {
  const trimmed = value.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 3).trim()}...` : trimmed
}

export function PortalFactoryPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [selectedKitId, setSelectedKitId] = useState(INDUSTRY_PORTAL_KITS[0]?.id ?? '')
  const [clientName, setClientName] = useState(DEFAULT_BRIEF.clientName)
  const [priorityWorkflow, setPriorityWorkflow] = useState(DEFAULT_BRIEF.priorityWorkflow)
  const [dataSources, setDataSources] = useState(DEFAULT_BRIEF.dataSources)
  const [roles, setRoles] = useState(DEFAULT_BRIEF.roles)
  const selectedKit = INDUSTRY_PORTAL_KITS.find((kit) => kit.id === selectedKitId) ?? INDUSTRY_PORTAL_KITS[0]
  const manifest = selectedKit ? buildPortalFactoryManifest(selectedKit) : null
  const briefSources = splitBriefList(dataSources)
  const briefRoles = splitBriefList(roles)
  const briefText = [selectedKit?.name, selectedKit?.industry, priorityWorkflow, dataSources, roles].join(' ').toLowerCase()
  const briefModules = manifest ? pickBriefModules(manifest.modules, briefText) : []
  const firstModule = briefModules[0]
  const manifestModules = manifest?.modules ?? []
  const shellModules = manifestModules.filter((module) => module.layer === 'Shell')
  const sharedModules = manifestModules.filter((module) => module.layer === 'Shared')
  const industryModules = manifestModules.filter((module) => module.layer === 'Industry')
  const workcells = manifest?.workcellBlueprints ?? []
  const buildPacket = manifest?.buildPacket
  const packetDemoRoute = firstModule?.route || buildPacket?.routes[0] || '/app/start'
  const sourcePlan = Array.from(new Set([...briefSources, ...(firstModule?.sourceTruth ?? []), ...(firstModule?.inputs ?? [])])).slice(0, 6)
  const routeCoverage = manifest?.routeCoverage
  const missingRouteCount = routeCoverage?.missingRoutes.length ?? 0

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: [...REQUIRED_CAPABILITIES],
        unauthenticatedMessage: 'Login is required to open Workspace Templates.',
        previewMessage: 'Workspace Templates are only available in the authenticated workspace.',
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

  if (access.loading) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">Loading Workspace Templates...</section>
  }

  if (!access.authenticated) {
    return (
      <div className="sm-ytf-simple-page">
        <section className="sm-ytf-hero-row">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Workspace Templates</p>
            <h1>Login required.</h1>
            <p>{access.error ?? 'Open the authenticated workspace before building client workspace packets.'}</p>
          </div>
          <Link className="sm-button-primary" to="/login?next=/app/portal-factory">
            Login
          </Link>
        </section>
      </div>
    )
  }

  if (!access.allowed) {
    return (
      <div className="sm-ytf-simple-page">
        <section className="sm-ytf-hero-row">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Workspace Templates</p>
            <h1>Setup access required.</h1>
            <p>Current role: {access.roleLabel}. Use this only for tenant admins, architects, platform admins, and delivery operators.</p>
          </div>
          <Link className="sm-button-secondary" to="/app/start">
            Back
          </Link>
        </section>
      </div>
    )
  }

  if (!selectedKit || !manifest) {
    return <section className="sm-surface p-6 text-sm text-[var(--sm-muted)]">No workspace templates found.</section>
  }

  return (
    <div className="sm-ytf-simple-page">
      <section className="sm-ytf-hero-row">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Workspace Templates</p>
          <h1>Make a client portal packet.</h1>
          <p>Pick an industry template, enter the client reality, then ship one usable workflow before adding modules.</p>
        </div>
        <div className="sm-ytf-status-stack">
          <span>{selectedKit.industry}</span>
          <span>{briefModules.length} first modules</span>
          <span>{missingRouteCount ? `${missingRouteCount} route gaps` : 'Routes ready'}</span>
        </div>
      </section>

      <section className="sm-ytf-action-grid sm-ytf-action-grid-five">
        <Link className="sm-ytf-action-tile is-primary" to="/app/plantos-template">
          <span>
            <strong>PlantOS template</strong>
            <small>Reusable industrial SaaS packet.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to={industryPortalRolloutLink(selectedKit.requestPackage)}>
          <span>
            <strong>Sell this pack</strong>
            <small>Start a launch request from this template.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/teams">
          <span>
            <strong>Automation plan</strong>
            <small>Review lanes, jobs, runs, and gates.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/data-fabric">
          <span>
            <strong>Data fabric</strong>
            <small>Source-backed records and KPI candidates.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
        <Link className="sm-ytf-action-tile" to="/app/platform-admin">
          <span>
            <strong>Tenant setup</strong>
            <small>Domain, roles, connectors, and deploy state.</small>
          </span>
          <span className="sm-ytf-action-arrow">Open</span>
        </Link>
      </section>

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Client intake</p>
              <h2>Only ask what changes the build.</h2>
            </div>
            <span className="sm-status-pill">Config first</span>
          </div>
          <div className="sm-ytf-compact-list">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-[var(--sm-ink)]">Portal type</span>
              <select className="sm-ytf-input" onChange={(event) => setSelectedKitId(event.target.value)} value={selectedKitId}>
                {INDUSTRY_PORTAL_KITS.map((kit) => (
                  <option key={kit.id} value={kit.id}>{kit.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-[var(--sm-ink)]">Client</span>
              <input className="sm-ytf-input" onChange={(event) => setClientName(event.target.value)} value={clientName} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-[var(--sm-ink)]">Main workflow pain</span>
              <textarea className="sm-ytf-textarea min-h-[6.5rem]" onChange={(event) => setPriorityWorkflow(event.target.value)} value={priorityWorkflow} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-[var(--sm-ink)]">Source systems</span>
              <input className="sm-ytf-input" onChange={(event) => setDataSources(event.target.value)} value={dataSources} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-[var(--sm-ink)]">Roles</span>
              <input className="sm-ytf-input" onChange={(event) => setRoles(event.target.value)} value={roles} />
            </label>
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Generated packet</p>
              <h2>{clientName || 'Client'} / {selectedKit.name}</h2>
            </div>
            <span className="sm-status-pill">{selectedKit.id}</span>
          </div>
          <div className="sm-ytf-compact-list">
            {briefModules.map((module) => (
              <Link className="sm-ytf-list-row" key={module.id} to={module.route || '/app/plantos-template'}>
                <span>
                  <strong>{module.name}</strong>
                  <small>{module.ownerRole}: {compact(module.kpi, 92)}</small>
                </span>
                <em>{module.launchMode}</em>
              </Link>
            ))}
          </div>
          {firstModule ? (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="sm-kicker text-sky-700">First workflow</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">{firstModule.name}</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded-2xl bg-white/80 p-3">
                  <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">Input</span>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{firstModule.inputs.slice(0, 3).join(', ')}</p>
                </div>
                <div className="rounded-2xl bg-white/80 p-3">
                  <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">Prepared work</span>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{firstModule.agentSpec.job}</p>
                </div>
                <div className="rounded-2xl bg-white/80 p-3">
                  <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">Policy</span>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{firstModule.agentSpec.toolPolicy.actionClass} / {firstModule.agentSpec.toolPolicy.autonomyGate}</p>
                </div>
                <div className="rounded-2xl bg-white/80 p-3">
                  <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">Review</span>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{firstModule.agentSpec.reviewGate}</p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {briefRoles.slice(0, 8).map((role) => (
              <span className="sm-status-pill" key={role}>{role}</span>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-ytf-metric-strip is-five">
        <article>
          <span>Kernel</span>
          <strong>{shellModules.length}</strong>
          <small>Login, roles, connector hub, evidence, and permissions.</small>
        </article>
        <article>
          <span>Shared tools</span>
          <strong>{sharedModules.length}</strong>
          <small>Actions, documents, approvals, decisions, KPI briefs.</small>
        </article>
        <article>
          <span>Industry apps</span>
          <strong>{industryModules.length}</strong>
          <small>{selectedKit.name} modules selected by workflow.</small>
        </article>
        <article>
          <span>Routes</span>
          <strong>{routeCoverage?.routedModules ?? 0}/{routeCoverage?.totalModules ?? 0}</strong>
          <small>Deep-link coverage.</small>
        </article>
        <article>
          <span>Review lanes</span>
          <strong>{workcells.length || PLANT_OS_AGENT_CREWS.length}</strong>
          <small>Source-backed workflows with staged writes.</small>
        </article>
      </section>

      {buildPacket ? (
        <section className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Build packet</p>
              <h2>What gets built, sold, and tested.</h2>
            </div>
            <span className="sm-status-pill">{buildPacket.workcells.length} review lanes</span>
          </div>
          <p className="max-w-4xl text-sm leading-6 text-[var(--sm-muted)]">{buildPacket.salesPromise}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to={`/login?next=${encodeURIComponent(packetDemoRoute)}`}>
              Open proof route
            </Link>
            <Link className="sm-button-secondary" to={`/contact?package=${encodeURIComponent(buildPacket.packageName)}`}>
              Send rollout brief
            </Link>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">First workflow</span>
              <strong className="mt-2 block text-base text-[var(--sm-ink)]">{buildPacket.firstWorkflow}</strong>
              <p className="mt-2 text-xs leading-5 text-[var(--sm-muted)]">{buildPacket.buyer}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">Sources</span>
              <strong className="mt-2 block text-base text-[var(--sm-ink)]">{buildPacket.sourcePlan.slice(0, 3).join(', ')}</strong>
              <p className="mt-2 text-xs leading-5 text-[var(--sm-muted)]">Only connected sources can feed prepared module checks.</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">Routes</span>
              <strong className="mt-2 block text-base text-[var(--sm-ink)]">{buildPacket.routes.length} app routes</strong>
              <p className="mt-2 text-xs leading-5 text-[var(--sm-muted)]">Deep links, static export coverage, and app smoke required.</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <span className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">QA</span>
              <strong className="mt-2 block text-base text-[var(--sm-ink)]">{buildPacket.qaGates.length} release gates</strong>
              <p className="mt-2 text-xs leading-5 text-[var(--sm-muted)]">{buildPacket.qaGates[0]}</p>
            </article>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {workcells.slice(0, 4).map((workcell) => (
              <Link className="sm-ytf-list-row" key={workcell.id} to={workcell.route}>
                <span>
                  <strong>{workcell.name}</strong>
                  <small>{workcell.outputSchema.slice(0, 4).join(', ')} / {workcell.humanGate}</small>
                </span>
                <em>{workcell.riskClass}</em>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sm-ytf-split">
        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Source plan</p>
              <h2>Connect only what will be used.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/data-fabric">
              Sources
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {sourcePlan.map((source) => (
              <article className="sm-ytf-list-row" key={source}>
                <span>
                  <strong>{source}</strong>
                  <small>Map owner, freshness, parser, and writeback before using it in reports.</small>
                </span>
                <em>Source</em>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-ytf-panel">
          <div className="sm-ytf-section-head">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Automation plan</p>
              <h2>Operational, not chatbot-only.</h2>
            </div>
            <Link className="sm-button-secondary" to="/app/teams">
              Review
            </Link>
          </div>
          <div className="sm-ytf-compact-list">
            {PLANT_OS_AGENT_CREWS.slice(0, 4).map((crew) => (
              <Link className="sm-ytf-list-row" key={crew.id} to={crew.route}>
                <span>
                  <strong>{crew.name}</strong>
                  <small>{crew.writes}</small>
                </span>
                <em>{crew.lane}</em>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <details className="sm-ytf-panel sm-ytf-details">
        <summary>Release gates and packages</summary>
        <div className="sm-ytf-split">
          <article>
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">QA gates</p>
                <h2>Do not call it ready before proof.</h2>
              </div>
              <span className="sm-status-pill">{manifest.launchChecklist.length} checks</span>
            </div>
            <div className="sm-ytf-compact-list">
              {manifest.launchChecklist.slice(0, 8).map((check) => (
                <article className="sm-ytf-list-row" key={check}>
                  <span>
                    <strong>{check}</strong>
                    <small>Must pass before client proof review or production promotion.</small>
                  </span>
                  <em>Gate</em>
                </article>
              ))}
            </div>
          </article>

          <article>
            <div className="sm-ytf-section-head">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Packages</p>
                <h2>What SuperMega sells.</h2>
              </div>
              <Link className="sm-button-secondary" to="/app/plantos-template">
                Template
              </Link>
            </div>
            <div className="sm-ytf-compact-list">
              {PLANT_OS_PACKAGE_TIERS.map((tier) => (
                <article className="sm-ytf-list-row" key={tier.id}>
                  <span>
                    <strong>{tier.name}</strong>
                    <small>{tier.promise}</small>
                  </span>
                  <em>Sell</em>
                </article>
              ))}
            </div>
          </article>
        </div>
      </details>
    </div>
  )
}
