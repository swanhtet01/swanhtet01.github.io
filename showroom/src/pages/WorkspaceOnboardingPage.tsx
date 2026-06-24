import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import {
  PORTAL_SHELL_MODULES,
  SHARED_PORTAL_MODULES,
  getIndustryPortalKit,
  getPortalModuleStandardTags,
  getPortalModuleValueMetric,
} from '../lib/industryPortalKits'
import { DEFAULT_WORKSPACE_ROUTE_ACCESS, resolveWorkspaceRouteAccess, type WorkspaceRouteAccess } from '../lib/workspaceRouteAccess'
import {
  clearWorkspaceOnboardingDraft,
  getPlatformControlPlane,
  inviteTeamMember,
  loadWorkspaceOnboardingDraft,
  saveWorkspaceOnboardingDraft,
  updateWorkspaceModuleStatus,
  updateWorkspaceProfile,
  type PlatformControlPlanePayload,
  type WorkspaceModuleRow,
  type WorkspaceProfile,
} from '../lib/workspaceApi'

type PackagePreset = {
  id: string
  name: string
  summary: string
  kitId: string
  firstRoute: string
  teamLabel: string
  moduleIds: string[]
  moduleLabels: string[]
  dataPlugs: string[]
}

type InviteFormState = {
  name: string
  email: string
  role: string
}

const PACKAGE_PRESETS: PackagePreset[] = [
  {
    id: 'industrial-plant-os-package',
    name: 'Factory Operations App',
    summary: 'Start with daily issues, source evidence, supplier follow-up, and owner review.',
    kitId: 'industrial-plant-os',
    firstRoute: '/app/factory-operations',
    teamLabel: 'Operations',
    moduleIds: ['industrial-dqms', 'operations-inbox', 'manager-operating-system', 'knowledge-graph', 'data-science-studio'],
    moduleLabels: ['Operations Command', 'Quality Traceability and CAPA', 'Asset Reliability', 'Supplier and Receiving Control', 'Executive Decision Brief'],
    dataPlugs: ['Google Drive', 'Gmail', 'ERP/MES exports', 'QC sheets', 'CMMS logs', 'Utility meters'],
  },
  {
    id: 'restaurant-group-os-package',
    name: 'Restaurant POS + Inventory',
    summary: 'Start with menu and item setup, order/payment proof, cash-up close, shift board, stock/prep control, and owner report.',
    kitId: 'restaurant-group-os',
    firstRoute: '/app/restaurant-pos',
    teamLabel: 'Store ops',
    moduleIds: ['shift-command', 'operations-inbox', 'supplier-portal', 'founder-brief'],
    moduleLabels: ['Menu and Items', 'Payment Proof and Cash-Up Control', 'Shift Board', 'Stock and Prep Control', 'Owner Report'],
    dataPlugs: ['Menu PDFs/photos', 'provider payment exports', 'POS', 'Delivery apps', 'Supplier invoices', 'Prep logs'],
  },
]

const inviteRoleOptions = [
  'sales',
  'operations',
  'quality',
  'maintenance',
  'procurement_lead',
  'director',
  'admin',
] as const

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function resolvePreset(requestedPackage: string, requestedTeam: string) {
  const packageKey = normalizeKey(requestedPackage)
  const teamKey = normalizeKey(requestedTeam)

  if (packageKey) {
    const directMatch = PACKAGE_PRESETS.find((item) => {
      const nameKey = normalizeKey(item.name)
      return nameKey === packageKey || nameKey.includes(packageKey) || packageKey.includes(nameKey)
    })
    if (directMatch) {
      return directMatch
    }
  }

  if (teamKey.includes('quality')) return PACKAGE_PRESETS[0]
  if (teamKey.includes('restaurant') || teamKey.includes('store') || teamKey.includes('kitchen')) return PACKAGE_PRESETS[1]
  if (teamKey.includes('retail') || teamKey.includes('ecommerce') || teamKey.includes('inventory')) return PACKAGE_PRESETS[0]
  if (teamKey.includes('service') || teamKey.includes('dispatch') || teamKey.includes('technician')) return PACKAGE_PRESETS[0]
  if (teamKey.includes('operation') || teamKey.includes('procurement') || teamKey.includes('factory') || teamKey.includes('plant')) return PACKAGE_PRESETS[0]
  if (teamKey.includes('sales') || teamKey.includes('leadership') || teamKey.includes('admin')) return PACKAGE_PRESETS[0]
  return PACKAGE_PRESETS[0]
}

function memberCount(payload: PlatformControlPlanePayload | null) {
  return Number(payload?.members?.count ?? payload?.members?.rows?.length ?? 0)
}

function profileToDraft(profile?: WorkspaceProfile | null) {
  if (!profile) {
    return null
  }
  const nextDraft: Record<string, string | string[]> = {}
  const company = String(profile.company ?? '').trim()
  const packageName = String(profile.preferred_package ?? '').trim()
  const team = String(profile.first_team ?? '').trim()
  const systems = Array.isArray(profile.systems) ? profile.systems.map((item) => String(item).trim()).filter(Boolean) : []
  const goal = String(profile.goal ?? '').trim()
  const workspaceSlug = String(profile.workspace_slug ?? '').trim()
  if (company) nextDraft.company = company
  if (packageName) nextDraft.packageName = packageName
  if (team) nextDraft.team = team
  if (systems.length) nextDraft.systems = systems
  if (goal) nextDraft.goal = goal
  if (workspaceSlug) nextDraft.workspaceSlug = workspaceSlug
  return Object.keys(nextDraft).length ? nextDraft : null
}

export function WorkspaceOnboardingPage() {
  const [access, setAccess] = useState<WorkspaceRouteAccess>(DEFAULT_WORKSPACE_ROUTE_ACCESS)
  const [controlPlane, setControlPlane] = useState<PlatformControlPlanePayload | null>(null)
  const [controlPlaneError, setControlPlaneError] = useState<string | null>(null)
  const [draft, setDraft] = useState(() => loadWorkspaceOnboardingDraft())
  const [applyingPreset, setApplyingPreset] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [inviteForm, setInviteForm] = useState<InviteFormState>({ name: '', email: '', role: 'sales' })
  const [inviteMessage, setInviteMessage] = useState('')

  const selectedPreset = useMemo(() => resolvePreset(draft.packageName, draft.team), [draft.packageName, draft.team])
  const selectedPortalKit = useMemo(() => getIndustryPortalKit(selectedPreset.kitId), [selectedPreset.kitId])
  const liveModules = useMemo(() => controlPlane?.modules?.rows ?? [], [controlPlane?.modules?.rows])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const nextAccess = await resolveWorkspaceRouteAccess({
        requiredCapabilities: ['tenant_admin.view', 'platform_admin.view'],
        unauthenticatedMessage: 'Login is required to continue workspace onboarding.',
        previewMessage: 'Workspace onboarding is only available inside the live app.',
      })

      if (cancelled) {
        return
      }

      setAccess(nextAccess)

      if (!nextAccess.authenticated || !nextAccess.allowed) {
        return
      }

      try {
        const payload = await getPlatformControlPlane()
        if (!cancelled) {
          setControlPlane(payload)
          const nextDraft = profileToDraft(payload.profile)
          if (nextDraft) {
            setDraft((currentDraft) => {
              const mergedDraft = saveWorkspaceOnboardingDraft({
                ...currentDraft,
                ...nextDraft,
              })
              return mergedDraft
            })
          }
          setControlPlaneError(null)
        }
      } catch {
        if (!cancelled) {
          setControlPlane(null)
          setControlPlaneError('Could not load the workspace control plane on this host.')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  function updateDraft(next: Partial<typeof draft>) {
    const merged = saveWorkspaceOnboardingDraft({
      ...draft,
      ...next,
    })
    setDraft(merged)
  }

  async function refreshControlPlane() {
    try {
      const payload = await getPlatformControlPlane()
      setControlPlane(payload)
      const nextDraft = profileToDraft(payload.profile)
      if (nextDraft) {
        setDraft(saveWorkspaceOnboardingDraft({ ...draft, ...nextDraft }))
      }
      setControlPlaneError(null)
    } catch {
      setControlPlaneError('Could not refresh workspace onboarding state.')
    }
  }

  async function handleSaveProfile() {
    setProfileBusy(true)
    setProfileMessage('')
    try {
      const payload = await updateWorkspaceProfile({
        company: draft.company,
        preferredPackage: draft.packageName,
        firstTeam: draft.team,
        systems: draft.systems,
        goal: draft.goal,
      })
      setControlPlane(payload.control_plane ?? null)
      const savedDraft = profileToDraft(payload.profile)
      if (savedDraft) {
        setDraft(saveWorkspaceOnboardingDraft({ ...draft, ...savedDraft }))
      }
      setControlPlaneError(null)
      setProfileMessage('Workspace rollout context saved.')
    } catch {
      setProfileMessage('Could not save workspace rollout context on this host.')
    } finally {
      setProfileBusy(false)
    }
  }

  async function handleApplyPreset() {
    setApplyingPreset(true)
    setStatusMessage('')
    const moduleRows = liveModules

    try {
      const updates = selectedPreset.moduleIds
        .map((moduleId, index) => ({
          row: moduleRows.find((item) => item.module_id === moduleId),
          status: index === 0 ? 'enabled' : 'pilot',
        }))
        .filter((item): item is { row: WorkspaceModuleRow; status: 'enabled' | 'pilot' } => Boolean(item.row))
        .filter((item) => String(item.row.workspace_status || '').trim().toLowerCase() !== item.status)

      for (const item of updates) {
        await updateWorkspaceModuleStatus(item.row.module_id, { status: item.status })
      }

      await refreshControlPlane()
      setStatusMessage(
        updates.length
          ? `${selectedPreset.name} applied. Open ${selectedPreset.teamLabel} first and keep the rest in pilot until the team is using it every day.`
          : `${selectedPreset.name} is already applied to this workspace.`,
      )
    } catch {
      setStatusMessage(`Could not apply ${selectedPreset.name} on this host.`)
    } finally {
      setApplyingPreset(false)
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setInviteBusy(true)
    setInviteMessage('')

    try {
      const payload = await inviteTeamMember(inviteForm)
      await refreshControlPlane()
      const generatedPassword = String(payload.generated_password || '').trim()
      setInviteMessage(
        generatedPassword
          ? `Added ${inviteForm.email}. Generated password: ${generatedPassword}`
          : `Added ${inviteForm.email} to the workspace.`,
      )
      setInviteForm({ name: '', email: '', role: inviteForm.role })
    } catch {
      setInviteMessage('Could not add this team member on this host.')
    } finally {
      setInviteBusy(false)
    }
  }

  const selectedModuleRows = selectedPreset.moduleIds
    .map((moduleId) => liveModules.find((item) => item.module_id === moduleId))
    .filter((item): item is WorkspaceModuleRow => Boolean(item))

  const workspaceName = String(controlPlane?.workspace?.workspace_name || draft.company || 'Your workspace').trim()
  const enabledSelectedCount = selectedModuleRows.filter((item) => String(item.workspace_status || '').trim().toLowerCase() === 'enabled').length
  const isPackageApplied = enabledSelectedCount > 0
  const hasInvitedTeam = memberCount(controlPlane) > 1
  const hasSystemsListed = draft.systems.length > 0
  const onboardingChecks = [
    {
      title: 'Workspace created',
      detail: `${workspaceName} is provisioned and ready for admin setup.`,
      done: Boolean(controlPlane?.workspace?.workspace_slug || draft.workspaceSlug),
    },
    {
      title: 'First package selected',
      detail: selectedPreset.name,
      done: Boolean(selectedPreset.name),
    },
    {
      title: 'First modules enabled',
      detail: isPackageApplied ? `${enabledSelectedCount} rollout modules are live or in pilot.` : 'Enable the first package before inviting the full team.',
      done: isPackageApplied,
    },
    {
      title: 'First users invited',
      detail: hasInvitedTeam ? `${memberCount(controlPlane)} users can already enter the workspace.` : 'Invite the first operators and managers now.',
      done: hasInvitedTeam,
    },
    {
      title: 'Current stack mapped',
      detail: hasSystemsListed ? draft.systems.join(', ') : 'Capture the systems you need to connect before rollout.',
      done: hasSystemsListed,
    },
  ]

  if (access.loading) {
    return (
      <div className="space-y-8">
        <PageIntro eyebrow="Onboarding" title="Loading workspace onboarding." description="Checking the live workspace and control-plane access." />
      </div>
    )
  }

  if (!access.authenticated) {
    return (
      <div className="space-y-8">
        <PageIntro eyebrow="Onboarding" title="Login required." description="Workspace onboarding only works in the authenticated app." />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">{access.error ?? 'Login is required to continue.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/login?next=/app/onboarding">
              Login
            </Link>
            <Link className="sm-button-secondary" to="/setup">
              Create workspace
            </Link>
          </div>
        </section>
      </div>
    )
  }

  if (!access.allowed) {
    return (
      <div className="space-y-8">
        <PageIntro eyebrow="Onboarding" title="Admin access required." description="Workspace onboarding is reserved for owners, tenant admins, and platform admins." />
        <section className="sm-surface-deep p-6">
          <p className="text-sm text-[var(--sm-muted)]">
            Current role: {access.roleLabel}. Ask an admin to finish the workspace setup or grant tenant-admin access.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/actions">
              Open queue
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Open platform admin
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Workspace onboarding"
        title={`Get ${workspaceName} live.`}
        description={`Pick one rollout package, enable the shell and first modules, invite the first users, and move the team into the right desk.`}
      />

      <section className="grid gap-4 xl:grid-cols-5">
        {onboardingChecks.map((item) => (
          <article className="sm-metric-card" key={item.title}>
            <p className="sm-kicker text-[var(--sm-accent)]">{item.done ? 'Ready' : 'Next'}</p>
            <p className="mt-3 text-xl font-bold text-white">{item.title}</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
        <article className="sm-surface p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">1. Choose the first package</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Enable the first modules before rolling out the rest.</h2>
            </div>
            <span className="sm-status-pill">{selectedPreset.teamLabel} starts first</span>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {PACKAGE_PRESETS.map((item) => {
              const active = item.id === selectedPreset.id
              return (
                <button
                  className={`sm-proof-card text-left transition ${active ? 'border-[rgba(37,208,255,0.38)] shadow-[0_0_0_1px_rgba(37,208,255,0.16)]' : ''}`}
                  key={item.id}
                  onClick={() => updateDraft({ packageName: item.name, team: draft.team || item.teamLabel })}
                  type="button"
                >
                  <p className="sm-kicker text-[var(--sm-accent)]">{active ? 'Selected' : 'Package'}</p>
                  <h3 className="mt-3 text-2xl font-bold text-white">{item.name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.summary}</p>
                  <p className="mt-4 text-sm text-white/80">First desk: {item.firstRoute.replace('/app/', '')}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.moduleLabels.slice(0, 3).map((moduleName) => (
                      <span className="sm-status-pill" key={moduleName}>
                        {moduleName}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Modules in this package</p>
              <div className="mt-4 space-y-3">
                {selectedPreset.moduleLabels.map((moduleName) => {
                  const matchedRow = selectedModuleRows.find((row) => row.name === moduleName || row.module_id === moduleName)
                  return (
                    <div className="flex items-center justify-between gap-3" key={moduleName}>
                      <span>{moduleName}</span>
                      <span className="sm-status-pill">{matchedRow?.workspace_status || 'planned'}</span>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Data plugs to map first</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(draft.systems.length ? draft.systems : selectedPreset.dataPlugs).map((system) => (
                  <span className="sm-status-pill" key={system}>
                    {system}
                  </span>
                ))}
              </div>
            </article>
          </div>

          {selectedPortalKit ? (
            <div className="mt-6 grid gap-3 xl:grid-cols-2">
              {selectedPortalKit.moduleBlueprints.slice(0, 4).map((module) => (
                <article className="rounded-2xl border border-white/10 bg-white/5 p-4" key={module.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-white">{module.name}</p>
                    <span className="sm-status-pill">{module.launchMode}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{module.jobToBeDone}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getPortalModuleStandardTags(module).slice(0, 3).map((standard) => (
                      <span className="sm-status-pill" key={`${module.id}-${standard}`}>
                        {standard}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sm-accent)]">
                    Metric: {getPortalModuleValueMetric(module)}
                  </p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sm-accent-alt)]">
                    Prepared check: {module.agentAssist}
                  </p>
                </article>
              ))}
            </div>
          ) : null}

          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="sm-kicker text-[var(--sm-accent)]">Portal shell included first</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {PORTAL_SHELL_MODULES.slice(0, 6).map((module) => (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={module.id}>
                  <p className="font-semibold text-white">{module.name}</p>
                  <p className="mt-1 text-xs text-[var(--sm-muted)]">{module.purpose}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 sm-kicker text-[var(--sm-accent-alt)]">Shared work modules</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {SHARED_PORTAL_MODULES.slice(0, 4).map((module) => (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3" key={module.id}>
                  <p className="font-semibold text-white">{module.name}</p>
                  <p className="mt-1 text-xs text-[var(--sm-muted)]">{module.oneLine}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={applyingPreset} onClick={() => void handleApplyPreset()} type="button">
              {applyingPreset ? 'Applying package...' : `Apply ${selectedPreset.name}`}
            </button>
            <Link className="sm-button-secondary" to={selectedPreset.firstRoute}>
              Open first desk
            </Link>
            <Link className="sm-button-secondary" to="/app/connectors">
              Open connectors
            </Link>
          </div>

          {statusMessage ? <div className="mt-4 sm-chip text-white">{statusMessage}</div> : null}
          {controlPlaneError ? <div className="mt-4 sm-chip text-white">{controlPlaneError}</div> : null}
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">2. Capture rollout context</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Keep the first-use setup attached to the workspace.</h2>
          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Company
              <input className="sm-input" onChange={(event) => updateDraft({ company: event.target.value })} value={draft.company} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              First team
              <input className="sm-input" onChange={(event) => updateDraft({ team: event.target.value })} placeholder="Sales, Operations, Quality, Admin" value={draft.team} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Current systems
              <textarea
                className="sm-input min-h-28"
                onChange={(event) =>
                  updateDraft({
                    systems: event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Gmail, Google Drive, ERP export, CSV, uploaded documents"
                value={draft.systems.join(', ')}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Main rollout goal
              <textarea
                className="sm-input min-h-28"
                onChange={(event) => updateDraft({ goal: event.target.value })}
                placeholder="What should the first team stop doing in old tools?"
                value={draft.goal}
              />
            </label>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="sm-button-primary" disabled={profileBusy} onClick={() => void handleSaveProfile()} type="button">
              {profileBusy ? 'Saving...' : 'Save rollout context'}
            </button>
            <Link className="sm-button-secondary" to="/contact">
              Review rollout request
            </Link>
            <button
              className="sm-button-secondary"
              onClick={() => {
                clearWorkspaceOnboardingDraft()
                setDraft(loadWorkspaceOnboardingDraft())
              }}
              type="button"
            >
              Reset draft
            </button>
          </div>
          {profileMessage ? <div className="mt-4 sm-chip text-white">{profileMessage}</div> : null}
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">3. Invite the first users</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Do not launch without the first operators and managers.</h2>
          <form className="mt-6 grid gap-4" onSubmit={handleInvite}>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Name
              <input
                className="sm-input"
                onChange={(event) => setInviteForm((prev) => ({ ...prev, name: event.target.value }))}
                value={inviteForm.name}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Email
              <input
                className="sm-input"
                onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
                required
                type="email"
                value={inviteForm.email}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--sm-muted)]">
              Role
              <select className="sm-input" onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value }))} value={inviteForm.role}>
                {inviteRoleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="sm-button-primary" disabled={inviteBusy} type="submit">
                {inviteBusy ? 'Adding user...' : 'Add user'}
              </button>
              <Link className="sm-button-secondary" to="/app/platform-admin">
                Open platform admin
              </Link>
            </div>
          </form>
          {inviteMessage ? <div className="mt-4 sm-chip text-white">{inviteMessage}</div> : null}
        </article>

        <article className="sm-surface p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sm-kicker text-[var(--sm-accent-alt)]">4. Move into daily use</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Use the right desk, not the old fallback tools.</h2>
            </div>
            <span className="sm-status-pill">{memberCount(controlPlane)} users</span>
          </div>

          <div className="mt-6 grid gap-3">
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent)]">Open now</p>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">Move the first team into the desk below and keep connector setup visible in the same onboarding pass.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={selectedPreset.firstRoute}>
                  Open {selectedPreset.teamLabel}
                </Link>
                <Link className="sm-button-secondary" to="/app/connectors">
                  Connector setup
                </Link>
                <Link className="sm-button-secondary" to="/app/platform-admin">
                  Role and module setup
                </Link>
              </div>
            </article>
            <article className="sm-chip text-white">
              <p className="sm-kicker text-[var(--sm-accent-alt)]">Current workspace status</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div>
                  <p className="text-sm text-[var(--sm-muted)]">Enabled modules</p>
                  <p className="mt-2 text-2xl font-bold text-white">{Number(controlPlane?.modules?.enabled_count ?? 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--sm-muted)]">Pilot modules</p>
                  <p className="mt-2 text-2xl font-bold text-white">{Number(controlPlane?.modules?.pilot_count ?? 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--sm-muted)]">Audit events</p>
                  <p className="mt-2 text-2xl font-bold text-white">{Number(controlPlane?.audit_events?.count ?? 0)}</p>
                </div>
              </div>
            </article>
          </div>
        </article>
      </section>
    </div>
  )
}
