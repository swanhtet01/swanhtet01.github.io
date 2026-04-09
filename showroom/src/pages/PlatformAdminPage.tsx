import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  BUILD_TEAMS,
  BUILD_WORKSPACES,
  INTERNAL_AGENT_CREWS,
  MODULE_PROGRAMS,
  RELEASE_GATES,
  RESEARCH_CELLS,
  RESEARCH_PRIORITIES,
  getInternalAgentCrewDetails,
} from '../lib/companyBuildingModel'
import { getPlatformLayerGroups } from '../lib/platformStack'
import { getTenantConfig } from '../lib/tenantConfig'
import { getCapabilityProfileForRole, getWorkspaceSession, sessionHasCapability } from '../lib/workspaceApi'
import { OPERATING_MODELS, SUPERMEGA_CORE_MODEL, getTenantOperatingModel } from '../lib/tenantOperatingModel'

type AccessState = {
  loading: boolean
  authenticated: boolean
  allowed: boolean
  roleLabel: string
  error: string | null
}

export function PlatformAdminPage() {
  const tenant = getTenantConfig()
  const currentModel = getTenantOperatingModel(tenant.key)
  const layerGroups = getPlatformLayerGroups()
  const otherModels = OPERATING_MODELS.filter((item) => item.id !== currentModel.id)
  const [access, setAccess] = useState<AccessState>({
    loading: true,
    authenticated: false,
    allowed: false,
    roleLabel: 'Unknown',
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      try {
        const payload = await getWorkspaceSession()
        if (cancelled) {
          return
        }

        const authenticated = Boolean(payload.authenticated)
        const allowed =
          sessionHasCapability(payload.session, 'tenant_admin.view') || sessionHasCapability(payload.session, 'platform_admin.view')
        const roleLabel = getCapabilityProfileForRole(payload.session?.role).label

        setAccess({
          loading: false,
          authenticated,
          allowed,
          roleLabel,
          error: authenticated ? null : 'Login is required to open platform controls.',
        })
      } catch {
        if (!cancelled) {
          setAccess({
            loading: false,
            authenticated: false,
            allowed: false,
            roleLabel: 'Preview',
            error: 'Platform controls are shown in preview mode on this host.',
          })
        }
      }
    }

    void loadAccess()

    return () => {
      cancelled = true
    }
  }, [])

  if (access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Platform admin"
          title="Loading tenant control plane."
          description="Checking workspace access and loading the current operating model."
        />
      </div>
    )
  }

  if (access.authenticated && !access.allowed) {
    return (
      <div className="space-y-8">
        <PageIntro
          eyebrow="Platform admin"
          title="Tenant-admin access required."
          description="This surface is for tenant configuration, connector governance, security posture, and internal factory control."
        />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask a tenant admin or platform admin to grant the control-plane scopes for this workspace.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-secondary" to="/app/actions">
              Back to queue
            </Link>
            <Link className="sm-button-primary" to="/app/teams">
              Open Agent Ops
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Platform admin"
        title={`${currentModel.publicLabel} control plane`}
        description={`${currentModel.thesis} This surface turns the tenant model, build studio, connector posture, role system, and scaling gaps into one operator-facing control layer.`}
      />

      {access.error ? (
        <section className="sm-chip text-white">
          <p>{access.error}</p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-5">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Tenant</p>
          <p className="mt-3 text-2xl font-bold text-white">{currentModel.publicLabel}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Modules</p>
          <p className="mt-3 text-3xl font-bold text-white">{currentModel.modules.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Roles</p>
          <p className="mt-3 text-3xl font-bold text-white">{currentModel.roles.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Connectors</p>
          <p className="mt-3 text-3xl font-bold text-white">{currentModel.connectors.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent pods</p>
          <p className="mt-3 text-3xl font-bold text-white">{currentModel.agentPods.length}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Build teams</p>
          <p className="mt-3 text-3xl font-bold text-white">{BUILD_TEAMS.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Build workspaces</p>
          <p className="mt-3 text-3xl font-bold text-white">{BUILD_WORKSPACES.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent)]">Release gates</p>
          <p className="mt-3 text-3xl font-bold text-white">{RELEASE_GATES.length}</p>
        </div>
        <div className="sm-metric-card">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Program lanes</p>
          <p className="mt-3 text-3xl font-bold text-white">{MODULE_PROGRAMS.length}</p>
        </div>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Control shortcuts</p>
            <h2 className="mt-3 text-2xl font-bold text-white lg:text-3xl">Jump into the main control-plane and factory areas.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/factory">
              Build Studio
            </Link>
            <Link className="sm-button-secondary" to="/app/security">
              Security
            </Link>
            <Link className="sm-button-secondary" to="/app/connectors">
              Connectors
            </Link>
            <Link className="sm-button-secondary" to="/app/knowledge">
              Knowledge
            </Link>
            <Link className="sm-button-secondary" to="/app/policies">
              Policies
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Build workspaces</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The internal factory needs explicit rooms with owners and review loops.</h2>
          <div className="mt-6 grid gap-3">
            {BUILD_WORKSPACES.map((workspace) => (
              <article className="sm-proof-card" key={workspace.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{workspace.name}</p>
                  <span className="sm-status-pill">{workspace.reviewCadence}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{workspace.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Owners: {workspace.owners.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Surfaces: {workspace.surfaces.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Release gates</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Promotion rules keep pilots from being mislabeled as products.</h2>
          <div className="mt-6 grid gap-3">
            {RELEASE_GATES.map((gate) => (
              <article className="sm-chip text-white" key={gate.id}>
                <p className="font-semibold">{gate.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{gate.question}</p>
                <p className="mt-2 text-sm text-white/80">Signals: {gate.requiredSignals.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Exit: {gate.exitCriteria}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Current posture</p>
          <h2 className="mt-3 text-3xl font-bold text-white">What is already wired into the platform</h2>
          <div className="mt-6 grid gap-3">
            {SUPERMEGA_CORE_MODEL.foundationSignals.map((signal) => (
              <article className="sm-proof-card" key={signal.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{signal.name}</p>
                  <span className="sm-status-pill">{signal.status}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{signal.detail}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Architecture gaps</p>
          <h2 className="mt-3 text-3xl font-bold text-white">What still blocks a true multi-tenant AI-native runtime</h2>
          <div className="mt-6 grid gap-3">
            {SUPERMEGA_CORE_MODEL.gaps.map((gap) => (
              <article className="sm-chip text-white" key={gap.id}>
                <p className="font-semibold">{gap.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{gap.risk}</p>
                <p className="mt-2 text-sm text-white/80">{gap.nextMove}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Platform layers</p>
            <h2 className="mt-3 text-3xl font-bold text-white">The control plane is organized around reusable layers.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Each tenant should inherit these shared layers, then enable only the modules and permissions that fit the company.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {layerGroups.map((group) => (
            <article className="sm-chip text-white" key={group.id}>
              <p className="sm-kicker text-[var(--sm-accent)]">{group.name}</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{group.summary}</p>
              <p className="mt-3 text-sm text-white/80">{group.capabilities.length} capabilities mapped</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Internal build teams</p>
          <h2 className="mt-3 text-3xl font-bold text-white">The company-builder side needs visible ownership and workspaces.</h2>
          <div className="mt-6 grid gap-3">
            {BUILD_TEAMS.map((team) => (
              <article className="sm-proof-card" key={team.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{team.name}</p>
                  <span className="sm-status-pill">{team.workspace}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                <p className="mt-3 text-sm text-white/80">Owns: {team.ownership.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {team.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Agent crews: {team.agentPods.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Success: {team.metric}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Program lanes</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Track category-level bets like actual product lines.</h2>
            <div className="mt-6 grid gap-3">
              {MODULE_PROGRAMS.map((program) => {
                const crewDetails = getInternalAgentCrewDetails(program.agentCrews)
                return (
                  <article className="sm-chip text-white" key={program.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{program.name}</p>
                      <span className="sm-status-pill">{program.stage}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.target}</p>
                    <p className="mt-2 text-sm text-white/80">Market: {program.market}</p>
                    <p className="mt-2 text-sm text-white/80">Owner: {program.owner}</p>
                    <p className="mt-2 text-sm text-white/80">Research cell: {program.researchCell}</p>
                    <p className="mt-2 text-sm text-white/80">Starter wedge: {program.starterWedge}</p>
                    <p className="mt-2 text-sm text-white/80">Tenant proof: {program.tenantProof}</p>
                    <p className="mt-2 text-sm text-white/80">Modules: {program.modules.join(', ')}</p>
                    <p className="mt-2 text-sm text-white/80">Release train: {program.releaseTrain}</p>
                    <div className="mt-2 text-sm text-white/80">
                      <p className="font-semibold text-white/70">Agent crews</p>
                      <div className="mt-1 space-y-1">
                        {crewDetails.map((crew) => (
                          <p key={crew.id}>
                            {crew.name} · {crew.workspace}
                          </p>
                        ))}
                        {crewDetails.length === 0 ? <p className="text-[var(--sm-muted)]">No agent crew assigned yet.</p> : null}
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-white/80">
                      <p className="font-semibold text-[var(--sm-accent)]">Success signals</p>
                      {program.successSignals.map((signal) => (
                        <p key={signal}>{signal}</p>
                      ))}
                    </div>
                    <p className="mt-2 text-sm text-white/80">Next releases: {program.nextReleases.join(', ')}</p>
                  </article>
                )
              })}
            </div>
        </article>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Research cells</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Product discipline rests on focused research cells.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Each cell owns a signal set, a mandate, and a set of outputs so the modules and connectors deliver on measurable promises instead of vague innovation.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {RESEARCH_CELLS.map((cell) => (
            <article className="sm-demo-link sm-demo-link-card" key={cell.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{cell.ownedBy}</span>
                <span className="sm-status-pill">{cell.supports.join(' / ')}</span>
              </div>
              <strong>{cell.name}</strong>
              <span>{cell.mandate}</span>
              <small className="text-[var(--sm-muted)]">Inputs: {cell.inputs.join(', ')}</small>
              <small className="text-[var(--sm-muted)]">Outputs: {cell.outputs.join(', ')}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Product program health</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Treat product lines like real releases.</h2>
          </div>
          <Link className="sm-button-secondary" to="/factory">
            Open build studio
          </Link>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {MODULE_PROGRAMS.map((program) => (
            <article className="sm-demo-link sm-demo-link-card" key={`health-${program.id}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="sm-home-proof-label">{program.stage}</span>
                <span className="sm-status-pill">{program.owner}</span>
              </div>
              <strong>{program.name}</strong>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{program.target}</p>
              <p className="mt-3 text-sm text-white/80">Tenant proof: {program.tenantProof}</p>
              <p className="mt-2 text-sm text-white/80">Modules: {program.modules.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Release train: {program.releaseTrain}</p>
              <p className="mt-2 text-sm text-white/80">Agent crews: {program.agentCrews.join(', ')}</p>
              <div className="mt-2 space-y-1 text-sm text-white/80">
                <p className="font-semibold text-[var(--sm-accent)]">Success signals</p>
                {program.successSignals.map((signal) => (
                  <p key={signal}>{signal}</p>
                ))}
              </div>
              <p className="mt-2 text-sm text-white/80">Next move: {program.nextMove}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Internal AI crews</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Delegation should be persistent, scoped, and reviewable.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            These internal crews keep research, prototype review, connector health, knowledge quality, and release discipline moving between human decisions.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {INTERNAL_AGENT_CREWS.map((crew) => (
            <article className="sm-proof-card" key={crew.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{crew.name}</p>
                <span className="sm-status-pill">{crew.workspace}</span>
              </div>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{crew.mission}</p>
              <p className="mt-3 text-sm text-white/80">Read: {crew.readScope.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Write: {crew.writeScope.join(', ')}</p>
              <p className="mt-2 text-sm text-white/80">Cadence: {crew.cadence}</p>
              <p className="mt-2 text-sm text-white/80">Approval: {crew.approvalGate}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Current tenant controls</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Roles, zones, and connectors for {currentModel.publicLabel}</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.roles.map((role) => (
              <article className="sm-proof-card" key={role.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{role.name}</p>
                  <span className="sm-status-pill">{role.workspaces.join(', ')}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{role.summary}</p>
                <p className="mt-3 text-sm text-white/80">Capabilities: {role.capabilities.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Connector mesh</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Every tenant gets an explicit source map.</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.connectors.map((connector) => (
              <article className="sm-chip text-white" key={connector.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{connector.name}</p>
                  <span className="sm-status-pill">{connector.cadence}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{connector.scope}</p>
                <p className="mt-2 text-sm text-white/80">Outputs: {connector.outputs.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Writeback: {connector.writeBack}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Platform pods</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Named platform teams should keep the runtime and launches moving.</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.platformTeams.map((team) => (
              <article className="sm-proof-card" key={team.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{team.name}</p>
                  <span className="sm-status-pill">{team.workspace}</span>
                </div>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{team.mission}</p>
                <p className="mt-3 text-sm text-white/80">Scope: {team.scope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Success: {team.successMetric}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Rollout phases</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Every tenant and every shared layer needs a visible graduation path.</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.rolloutPhases.map((phase) => (
              <article className="sm-chip text-white" key={phase.id}>
                <p className="font-semibold">{phase.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{phase.outcome}</p>
                <p className="mt-2 text-sm text-white/80">Modules: {phase.modules.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Deliverables: {phase.deliverables.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Agent workspaces</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Autonomous teams should be scoped, named, and reviewable.</h2>
          <div className="mt-6 grid gap-3">
            {currentModel.agentPods.map((pod) => (
              <article className="sm-proof-card" key={pod.id}>
                <p className="font-semibold text-white">{pod.name}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{pod.purpose}</p>
                <p className="mt-3 text-sm text-white/80">Workspace: {pod.workspace}</p>
                <p className="mt-2 text-sm text-white/80">Read: {pod.readScope.join(', ')}</p>
                <p className="mt-2 text-sm text-white/80">Write: {pod.writeScope.join(', ')}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Portfolio and rollout</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Treat tenants as reusable operating models.</h2>
          <div className="mt-6 grid gap-3">
            <article className="sm-chip text-white">
              <p className="font-semibold">{currentModel.publicLabel}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{currentModel.narrative}</p>
            </article>
            {otherModels.map((model) => (
              <article className="sm-chip text-white" key={model.id}>
                <p className="font-semibold">{model.publicLabel}</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">{model.thesis}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/factory">
              Open build studio
            </Link>
            <Link className="sm-button-secondary" to="/app/architect">
              Open architect
            </Link>
            <Link className="sm-button-secondary" to="/app/teams">
              Open Agent Ops
            </Link>
            <Link className="sm-button-secondary" to="/clients/yangon-tyre">
              Open YTF public demo
            </Link>
          </div>
        </article>
      </section>

      <section className="sm-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Highest-value next work</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Focus the next engineering cycle where the platform still breaks trust.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            Do not expand the catalog faster than the runtime. The best next returns come from connector depth, governance, knowledge canon, and agent reliability.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {RESEARCH_PRIORITIES.map((priority) => (
            <article className="sm-chip text-white" key={priority.id}>
              <p className="font-semibold">{priority.name}</p>
              <p className="mt-2 text-sm text-[var(--sm-muted)]">{priority.thesis}</p>
              <p className="mt-2 text-sm text-white/80">Graduation: {priority.graduation}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
